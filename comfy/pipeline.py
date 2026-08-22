"""Turn a catalogue action plus parameters into a ComfyUI API prompt.

Phase 21.2 (#101). This module and the JSON beside it are the only place in
the repository where ComfyUI concepts — node ids, class names, input keys —
are allowed to exist. Everything above the seam names an *action*.

Three files decide everything, and none of them is code:

  catalogue.json   what an action is, generated from src/lib/ai/actions.ts
  action-map.json  which workflow runs it, and which node inputs it drives
  workflows/*.json the graphs themselves, in ComfyUI API format

So this file is glue, deliberately. The behaviour lives in data that can be
reviewed in a diff, and `comfy/pipeline.test.ts` checks that data against
the catalogue on every CI run.

## Validation happens twice, and this is the half that counts

The browser checks parameters before submitting and `/api/ai/submit` checks
them again, both with the same pure function. This checks a third time,
against the generated copy of the same catalogue, because those two run on
the other side of a trust boundary and a worker that assumes its input is
well formed is a worker that writes an arbitrary value into a graph. An
invalid parameter never reaches the GPU.
"""

from __future__ import annotations

import copy
import json
import random
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# The seed range the catalogue promises. Mirrored, not imported: this runs in
# a container that has no TypeScript, and `pipeline.test.ts` asserts the two
# agree rather than trusting that they do.
MAX_SEED = 2_147_483_647


class PipelineError(Exception):
    """A refusal, carrying a reason from the shared failure taxonomy.

    The reason matters more than the message: `api/_lib/ai.ts` maps it onto
    `AiFailureReason`, and that is what decides whether the surface tells the
    user to try again. A bare string here would arrive as `upstream-error`
    and advise a pointless retry.
    """

    def __init__(self, reason: str, detail: str) -> None:
        super().__init__(detail)
        self.reason = reason
        self.detail = detail

    def as_dict(self) -> dict[str, str]:
        return {"reason": self.reason, "detail": self.detail}


@dataclass(frozen=True)
class Resolved:
    """A graph ready to run, and the provenance 21.5 stores with the result."""

    action: str
    workflow: str
    version: int
    gpu_class: str
    prompt: dict[str, Any]
    output_node: str
    #: The seed actually used, or None for an action with no seed.
    seed: int | None
    #: Where each binary input has to be written before the prompt is queued.
    input_files: list[dict[str, str]] = field(default_factory=list)


class Pipeline:
    """The map, the catalogue and the workflows, loaded once."""

    def __init__(self, root: Path | str) -> None:
        self.root = Path(root)
        self.catalogue = _read_json(self.root / "catalogue.json")
        self.map = _read_json(self.root / "action-map.json")
        self.pins = _read_json(self.root / "pins.json")
        self._workflows: dict[tuple[str, int], dict[str, Any]] = {}

    # ---------------- workflows ----------------

    def workflow(self, workflow_id: str, version: int) -> dict[str, Any]:
        """Load a graph by id AND version.

        Resolution by the pair rather than by "whatever the map points at" is
        the whole of the provenance guarantee: a version the map has moved on
        from keeps loading for as long as its file is in the tree, so
        "generated with upscale v1" still means something a year later.
        """
        key = (workflow_id, version)
        if key not in self._workflows:
            path = self.root / "workflows" / f"{workflow_id}@{version}.json"
            if not path.exists():
                raise PipelineError(
                    "model-missing",
                    f"No workflow {workflow_id}@{version} in this container.",
                )
            self._workflows[key] = _read_json(path)
        return self._workflows[key]

    # ---------------- resolution ----------------

    def resolve(
        self,
        action: str,
        params: dict[str, Any] | None = None,
        inputs: list[dict[str, Any]] | None = None,
    ) -> Resolved:
        params = dict(params or {})
        inputs = list(inputs or [])

        entry = self.map["actions"].get(action)
        if entry is None:
            not_shipped = self.map.get("notShipped", {}).get(action)
            if not_shipped:
                # Named, not silent. The action is real and the product still
                # intends it; this container simply has no graph for it.
                raise PipelineError("model-missing", not_shipped["why"])
            raise PipelineError("invalid-parameters", f"Unknown action {action!r}.")

        spec = self.catalogue["actions"].get(action)
        if spec is None:
            raise PipelineError(
                "invalid-parameters", f"{action!r} is not in the catalogue."
            )

        self._check_params(action, spec, params)
        self._check_inputs(action, spec, entry, inputs)

        prompt = copy.deepcopy(self.workflow(entry["workflow"], entry["version"]))
        seed = self._apply_seed(prompt, entry, params)

        for name, value in params.items():
            binding = entry["params"].get(name)
            if binding is None:
                # Declared by the catalogue but fixed by this workflow. Not an
                # error — `fixed` in the map says which, and why.
                continue
            _set_input(prompt, binding, _bound_value(binding, value), action, name)

        input_files = self._place_inputs(prompt, entry, inputs)

        return Resolved(
            action=action,
            workflow=entry["workflow"],
            version=entry["version"],
            gpu_class=entry["gpuClass"],
            prompt=prompt,
            output_node=entry["outputNode"],
            seed=seed,
            input_files=input_files,
        )

    # ---------------- validation ----------------

    def _check_params(
        self, action: str, spec: dict[str, Any], params: dict[str, Any]
    ) -> None:
        bad: list[str] = []
        for name, value in params.items():
            declared = spec["params"].get(name)
            if declared is None:
                bad.append(name)
                continue
            kind = declared["kind"]
            if kind == "number":
                if isinstance(value, bool) or not isinstance(value, (int, float)):
                    bad.append(name)
                elif value < declared["min"] or value > declared["max"]:
                    bad.append(name)
            elif kind == "text":
                if not isinstance(value, str) or len(value) > declared["maxLength"]:
                    bad.append(name)
            elif kind == "choice":
                if not isinstance(value, str) or value not in declared["choices"]:
                    bad.append(name)
            else:  # pragma: no cover - the catalogue is generated, not hand-written
                bad.append(name)
        if bad:
            raise PipelineError(
                "invalid-parameters",
                f"Out of range or unknown for {action}: {', '.join(sorted(bad))}.",
            )

    def _check_inputs(
        self,
        action: str,
        spec: dict[str, Any],
        entry: dict[str, Any],
        inputs: list[dict[str, Any]],
    ) -> None:
        expected = spec["inputs"]
        if len(inputs) != len(expected):
            raise PipelineError(
                "invalid-parameters",
                f"{action} needs {len(expected)} input(s), got {len(inputs)}.",
            )
        for i, (given, kind) in enumerate(zip(inputs, expected)):
            if given.get("kind") != kind:
                raise PipelineError(
                    "invalid-parameters",
                    f"{action} input {i} should be a {kind}, got {given.get('kind')!r}.",
                )
        if len(entry["inputs"]) != len(expected):  # pragma: no cover - CI catches it
            raise PipelineError(
                "invalid-parameters",
                f"The map for {action} binds {len(entry['inputs'])} inputs, "
                f"the catalogue declares {len(expected)}.",
            )

    # ---------------- overrides ----------------

    def _apply_seed(
        self, prompt: dict[str, Any], entry: dict[str, Any], params: dict[str, Any]
    ) -> int | None:
        """Decide the seed, and report it.

        An action with a seed always runs with a *known* one, whether or not
        the caller supplied it — a randomly seeded result nobody can name is a
        result nobody can reproduce, and the catalogue's determinism claim
        would be true and useless. When the caller says nothing, one is drawn
        here and returned with the output.
        """
        binding = entry.get("seed")
        if binding is None:
            return None
        seed = params.get("seed")
        if not isinstance(seed, int) or isinstance(seed, bool):
            seed = random.randint(0, MAX_SEED)
        _set_input(prompt, binding, seed, entry["workflow"], "seed")
        return seed

    def _place_inputs(
        self,
        prompt: dict[str, Any],
        entry: dict[str, Any],
        inputs: list[dict[str, Any]],
    ) -> list[dict[str, str]]:
        placed: list[dict[str, str]] = []
        for i, (given, binding) in enumerate(zip(inputs, entry["inputs"])):
            filename = f"lattice_{i}_{binding['kind']}.png"
            _set_input(prompt, binding, filename, entry["workflow"], binding["kind"])
            placed.append(
                {
                    "filename": filename,
                    "kind": binding["kind"],
                    "base64": given.get("base64", ""),
                }
            )
        return placed


# ---------------- helpers ----------------


def _bound_value(binding: dict[str, Any], value: Any) -> Any:
    """Translate a catalogue value into the value the node input takes.

    `upscale`'s `scale` is the reason this exists: the catalogue offers 2 or
    4, the graph always runs Real-ESRGAN at 4x, and the requested factor is a
    resample afterwards. `values` in the map is where that translation is
    written down instead of being hidden in a branch here.
    """
    table = binding.get("values")
    if table is None:
        return value
    key = str(value)
    if key not in table:
        raise PipelineError(
            "invalid-parameters", f"No graph value for {key!r}."
        )
    return table[key]


def _set_input(
    prompt: dict[str, Any],
    binding: dict[str, Any],
    value: Any,
    action: str,
    name: str,
) -> None:
    node = prompt.get(binding["node"])
    if node is None:
        raise PipelineError(
            "model-missing",
            f"The map for {action} points {name} at node {binding['node']}, "
            "which this workflow does not have.",
        )
    if binding["input"] not in node["inputs"]:
        raise PipelineError(
            "model-missing",
            f"The map for {action} points {name} at "
            f"{node['class_type']}.{binding['input']}, which does not exist.",
        )
    node["inputs"][binding["input"]] = value


def _read_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)
