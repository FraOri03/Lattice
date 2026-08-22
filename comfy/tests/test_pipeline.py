"""The resolver: an action plus parameters becomes a graph, or a refusal.

Phase 21.2 (#101). Run with:

    npm run comfy:test        # python -m unittest discover -s comfy/tests

`unittest` rather than pytest on purpose. This suite guards a container
build, so it has to run on a clean machine with nothing but Python — adding
a test dependency to check a dependency-free module would be its own small
joke.

The data these tests run against is the real `action-map.json`, the real
workflows and the real generated catalogue. Nothing is stubbed, because the
thing worth knowing is whether the files that ship resolve, not whether a
fixture does.
"""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from pipeline import MAX_SEED, Pipeline, PipelineError  # noqa: E402


class ResolveTest(unittest.TestCase):
    def setUp(self) -> None:
        self.pipeline = Pipeline(ROOT)

    def defaults(self, action: str) -> dict:
        spec = self.pipeline.catalogue["actions"][action]
        return {name: p["default"] for name, p in spec["params"].items()}

    # ---------------- the happy path ----------------

    def test_resolves_to_a_workflow_version_and_gpu_class(self) -> None:
        resolved = self.pipeline.resolve("text-to-image", self.defaults("text-to-image"))
        self.assertEqual(resolved.workflow, "text-to-image")
        self.assertEqual(resolved.version, 1)
        self.assertEqual(resolved.gpu_class, "standard")
        self.assertEqual(resolved.output_node, "8")

    def test_writes_every_exposed_parameter_into_its_node(self) -> None:
        resolved = self.pipeline.resolve(
            "text-to-image",
            {
                "prompt": "a lighthouse",
                "negativePrompt": "blurry",
                "width": 768,
                "height": 512,
                "steps": 30,
                "guidance": 7,
                "seed": 42,
            },
        )
        prompt = resolved.prompt
        self.assertEqual(prompt["3"]["inputs"]["text"], "a lighthouse")
        self.assertEqual(prompt["4"]["inputs"]["text"], "blurry")
        self.assertEqual(prompt["5"]["inputs"]["width"], 768)
        self.assertEqual(prompt["5"]["inputs"]["height"], 512)
        self.assertEqual(prompt["6"]["inputs"]["steps"], 30)
        self.assertEqual(prompt["6"]["inputs"]["cfg"], 7)
        self.assertEqual(prompt["6"]["inputs"]["seed"], 42)

    def test_leaves_the_fixed_inputs_alone(self) -> None:
        """Anything the map does not expose is the workflow's decision."""
        resolved = self.pipeline.resolve("text-to-image", self.defaults("text-to-image"))
        sampler = resolved.prompt["6"]["inputs"]
        self.assertEqual(sampler["sampler_name"], "dpmpp_2m")
        self.assertEqual(sampler["scheduler"], "karras")
        self.assertEqual(resolved.prompt["5"]["inputs"]["batch_size"], 1)

    def test_does_not_mutate_the_cached_workflow(self) -> None:
        first = self.pipeline.resolve("text-to-image", {"prompt": "one"})
        second = self.pipeline.resolve("text-to-image", {"prompt": "two"})
        self.assertEqual(first.prompt["3"]["inputs"]["text"], "one")
        self.assertEqual(second.prompt["3"]["inputs"]["text"], "two")

    # ---------------- determinism ----------------

    def test_uses_the_seed_it_was_given(self) -> None:
        resolved = self.pipeline.resolve("text-to-image", {"seed": 12345})
        self.assertEqual(resolved.seed, 12345)
        self.assertEqual(resolved.prompt["6"]["inputs"]["seed"], 12345)

    def test_same_seed_gives_the_same_graph(self) -> None:
        """The determinism claim, as far as this side of the GPU can assert it.

        Identical parameters and an identical seed have to produce a
        byte-identical prompt; whether the sampler then produces an identical
        image is what the smoke test on a real GPU checks.
        """
        args = {"prompt": "a lighthouse", "steps": 20, "seed": 7}
        a = self.pipeline.resolve("text-to-image", dict(args))
        b = self.pipeline.resolve("text-to-image", dict(args))
        self.assertEqual(json.dumps(a.prompt, sort_keys=True), json.dumps(b.prompt, sort_keys=True))

    def test_draws_and_reports_a_seed_when_none_was_given(self) -> None:
        """A result nobody can name is a result nobody can reproduce."""
        resolved = self.pipeline.resolve("text-to-image", {"prompt": "x"})
        self.assertIsNotNone(resolved.seed)
        self.assertGreaterEqual(resolved.seed, 0)
        self.assertLessEqual(resolved.seed, MAX_SEED)
        self.assertEqual(resolved.prompt["6"]["inputs"]["seed"], resolved.seed)

    def test_reports_no_seed_for_an_action_that_has_none(self) -> None:
        resolved = self.pipeline.resolve("upscale", {"scale": "4"}, [{"kind": "image"}])
        self.assertIsNone(resolved.seed)

    def test_max_seed_matches_the_catalogue(self) -> None:
        catalogue_max = self.pipeline.catalogue["actions"]["text-to-image"]["params"]["seed"]["max"]
        self.assertEqual(MAX_SEED, catalogue_max)

    # ---------------- value translation ----------------

    def test_translates_a_choice_into_the_value_the_node_takes(self) -> None:
        """`scale: '2'` is 4x from the model, then a halving. The map says so."""
        two = self.pipeline.resolve("upscale", {"scale": "2"}, [{"kind": "image"}])
        four = self.pipeline.resolve("upscale", {"scale": "4"}, [{"kind": "image"}])
        self.assertEqual(two.prompt["4"]["inputs"]["scale_by"], 0.5)
        self.assertEqual(four.prompt["4"]["inputs"]["scale_by"], 1)

    # ---------------- binary inputs ----------------

    def test_places_each_input_and_names_the_file_the_graph_will_load(self) -> None:
        resolved = self.pipeline.resolve(
            "inpaint",
            {"prompt": "a window"},
            [{"kind": "image", "base64": "AA=="}, {"kind": "mask", "base64": "AQ=="}],
        )
        self.assertEqual(len(resolved.input_files), 2)
        image, mask = resolved.input_files
        self.assertEqual(resolved.prompt["3"]["inputs"]["image"], image["filename"])
        self.assertEqual(resolved.prompt["4"]["inputs"]["image"], mask["filename"])
        self.assertEqual(image["base64"], "AA==")
        self.assertEqual(mask["base64"], "AQ==")

    # ---------------- refusals ----------------

    def assertRefuses(self, reason: str, *args, **kwargs) -> PipelineError:
        with self.assertRaises(PipelineError) as caught:
            self.pipeline.resolve(*args, **kwargs)
        self.assertEqual(caught.exception.reason, reason)
        return caught.exception

    def test_refuses_an_unknown_parameter_and_names_it(self) -> None:
        err = self.assertRefuses("invalid-parameters", "text-to-image", {"nope": 1})
        self.assertIn("nope", err.detail)

    def test_refuses_a_number_outside_the_declared_range(self) -> None:
        err = self.assertRefuses("invalid-parameters", "text-to-image", {"steps": 5000})
        self.assertIn("steps", err.detail)

    def test_refuses_a_value_of_the_wrong_type(self) -> None:
        self.assertRefuses("invalid-parameters", "text-to-image", {"steps": "lots"})
        self.assertRefuses("invalid-parameters", "text-to-image", {"prompt": 3})

    def test_refuses_a_choice_that_is_not_offered(self) -> None:
        self.assertRefuses(
            "invalid-parameters", "upscale", {"scale": "8"}, [{"kind": "image"}]
        )

    def test_refuses_a_boolean_dressed_as_a_number(self) -> None:
        """`True == 1` in Python, and a graph input is not a checkbox."""
        self.assertRefuses("invalid-parameters", "text-to-image", {"steps": True})

    def test_refuses_the_wrong_number_of_inputs(self) -> None:
        err = self.assertRefuses("invalid-parameters", "upscale", {"scale": "2"}, [])
        self.assertIn("1 input", err.detail)

    def test_refuses_an_input_of_the_wrong_kind(self) -> None:
        self.assertRefuses(
            "invalid-parameters", "inpaint", {}, [{"kind": "mask"}, {"kind": "mask"}]
        )

    def test_refuses_an_unknown_action(self) -> None:
        self.assertRefuses("invalid-parameters", "summon-a-pony", {})

    def test_names_the_reason_an_action_is_not_shipped(self) -> None:
        """Not silently dropped, and not silently attempted."""
        err = self.assertRefuses(
            "model-missing", "background-removal", {}, [{"kind": "image"}]
        )
        self.assertIn("licence", err.detail.lower())


class VersionResolutionTest(unittest.TestCase):
    """A version the map has moved on from still loads.

    The provenance guarantee 21.5 depends on: "generated with upscale v1" has
    to mean something after the map points at v2. Exercised on a copy of the
    real directory so the assertion is about the resolver rather than about a
    fixture layout.
    """

    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        for name in ("catalogue.json", "action-map.json", "pins.json"):
            shutil.copy(ROOT / name, self.tmp / name)
        shutil.copytree(ROOT / "workflows", self.tmp / "workflows")

        # A second version of a real workflow, superseded the moment it exists.
        v2 = json.loads((self.tmp / "workflows" / "upscale@1.json").read_text("utf-8"))
        v2["4"]["inputs"]["upscale_method"] = "bicubic"
        (self.tmp / "workflows" / "upscale@2.json").write_text(json.dumps(v2), "utf-8")

        self.pipeline = Pipeline(self.tmp)

    def test_loads_a_version_the_map_does_not_point_at(self) -> None:
        current = self.pipeline.map["actions"]["upscale"]["version"]
        self.assertEqual(current, 1)
        superseded = self.pipeline.workflow("upscale", 2)
        self.assertEqual(superseded["4"]["inputs"]["upscale_method"], "bicubic")
        self.assertEqual(self.pipeline.workflow("upscale", 1)["4"]["inputs"]["upscale_method"], "lanczos")

    def test_says_so_when_a_version_is_genuinely_gone(self) -> None:
        with self.assertRaises(PipelineError) as caught:
            self.pipeline.workflow("upscale", 99)
        self.assertEqual(caught.exception.reason, "model-missing")


if __name__ == "__main__":
    unittest.main()
