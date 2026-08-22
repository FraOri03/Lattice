#!/usr/bin/env python3
"""Prove every graph is runnable, at build time.

Phase 21.2 (#101). Run by the Dockerfile, and worth running by hand after
editing a workflow:

    python comfy/scripts/validate_pipeline.py

A workflow that points at a node it does not have, a map entry naming an
input that was renamed, an action whose defaults fall outside its own
declared ranges — all of these are discoverable without a GPU, and all of
them would otherwise surface as a failed job on somebody's first attempt,
after a cold start they waited for and a worker they paid for.

It does not run ComfyUI. What it checks is everything that can be checked
from the data: the same things `comfy/pipeline.test.ts` checks in CI, run
again inside the image where the files that will actually be read are the
ones being checked.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline import Pipeline, PipelineError  # noqa: E402


def defaults_for(spec: dict) -> dict:
    return {name: p["default"] for name, p in spec["params"].items()}


def stub_inputs(spec: dict) -> list[dict]:
    # One pixel of valid base64 per declared input: the point is to exercise
    # the binding, not to decode an image.
    return [{"kind": kind, "base64": "AA=="} for kind in spec["inputs"]]


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    pipeline = Pipeline(root)
    problems: list[str] = []
    checked = 0

    for action, entry in pipeline.map["actions"].items():
        spec = pipeline.catalogue["actions"].get(action)
        if spec is None:
            problems.append(f"{action}: mapped but not in the catalogue")
            continue
        try:
            resolved = pipeline.resolve(action, defaults_for(spec), stub_inputs(spec))
        except PipelineError as err:
            problems.append(f"{action}: {err.reason} — {err.detail}")
            continue

        if resolved.output_node not in resolved.prompt:
            problems.append(
                f"{action}: outputNode {resolved.output_node} is not in the graph"
            )
        problems.extend(_dangling_links(action, resolved.prompt))
        problems.extend(_unpinned_models(pipeline, action, resolved.prompt))
        checked += 1

    for action in pipeline.catalogue["actions"]:
        spec = pipeline.catalogue["actions"][action]
        mapped = action in pipeline.map["actions"]
        excused = action in pipeline.map.get("notShipped", {})
        if spec.get("gpuClass") and not mapped and not excused:
            problems.append(
                f"{action}: a GPU action with no workflow and no notShipped entry"
            )

    if problems:
        print(f"\nFAIL: {len(problems)} problem(s) in the pipeline:\n", file=sys.stderr)
        for problem in problems:
            print(f"  {problem}", file=sys.stderr)
        print(file=sys.stderr)
        return 1

    print(f"ok: {checked} workflow(s) resolve and every link and model checks out")
    return 0


def _dangling_links(action: str, prompt: dict) -> list[str]:
    """Every `["nodeId", slot]` reference has to name a node in the graph."""
    problems = []
    for node_id, node in prompt.items():
        for key, value in node["inputs"].items():
            if isinstance(value, list) and len(value) == 2 and isinstance(value[0], str):
                if value[0] not in prompt:
                    problems.append(
                        f"{action}: node {node_id}.{key} links to {value[0]}, "
                        "which is not in the graph"
                    )
    return problems


def _unpinned_models(pipeline: Pipeline, action: str, prompt: dict) -> list[str]:
    """A model a graph names must be pinned, or the image cannot have it."""
    pinned = {model["id"] for model in pipeline.pins["models"]}
    keys = ("ckpt_name", "vae_name", "model_name", "lora_name", "control_net_name")
    problems = []
    for node in prompt.values():
        for key in keys:
            named = node["inputs"].get(key)
            if isinstance(named, str) and named not in pinned:
                problems.append(
                    f"{action}: {node['class_type']}.{key} wants {named!r}, "
                    "which pins.json does not pin"
                )
    return problems


if __name__ == "__main__":
    sys.exit(main())
