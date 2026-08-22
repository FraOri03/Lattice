#!/usr/bin/env python3
"""Run a real action against a real ComfyUI, and check the determinism claim.

Phase 21.2 (#101). The one test in this phase that needs a GPU, which is why
it is a script rather than part of `npm run comfy:test`:

    docker run --gpus all -p 8188:8188 lattice-comfy:1 comfyui
    python comfy/scripts/smoke.py --host 127.0.0.1:8188

It submits `text-to-image` twice with the same seed and once with a different
one, and asserts the first two images are byte-identical and the third is
not. That is the whole of what "deterministic given a seed" means, and it is
a claim the catalogue makes on every action — asserting it anywhere other
than against the actual sampler would be asserting it about a JSON file.

`comfy/tests/test_pipeline.py` covers everything up to the GPU: that the same
inputs build the same graph. This covers the last step, and nothing in CI
runs it, because CI has no GPU and this costs real minutes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline import Pipeline  # noqa: E402

PROMPT = "a lighthouse on a rock at dusk, long exposure"


def run(host: str, pipeline: Pipeline, seed: int) -> bytes:
    resolved = pipeline.resolve(
        "text-to-image",
        {"prompt": PROMPT, "width": 768, "height": 768, "steps": 12, "seed": seed},
    )
    queued = requests.post(
        f"http://{host}/prompt", json={"prompt": resolved.prompt}, timeout=30
    )
    queued.raise_for_status()
    prompt_id = queued.json()["prompt_id"]

    print(f"  queued {prompt_id} with seed {resolved.seed}", flush=True)
    for _ in range(600):
        history = requests.get(f"http://{host}/history/{prompt_id}", timeout=30).json()
        if prompt_id in history:
            break
        time.sleep(1)
    else:
        raise SystemExit(f"FAIL: {prompt_id} never finished")

    entry = history[prompt_id]["outputs"][resolved.output_node]["images"][0]
    image = requests.get(
        f"http://{host}/view",
        params={
            "filename": entry["filename"],
            "subfolder": entry.get("subfolder", ""),
            "type": entry.get("type", "output"),
        },
        timeout=60,
    )
    image.raise_for_status()
    return image.content


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1:8188")
    parser.add_argument("--seed", type=int, default=1234)
    args = parser.parse_args()

    pipeline = Pipeline(Path(__file__).resolve().parent.parent)

    print("Run 1 — seed", args.seed)
    first = run(args.host, pipeline, args.seed)
    print("Run 2 — the same seed")
    second = run(args.host, pipeline, args.seed)
    print("Run 3 — a different seed")
    third = run(args.host, pipeline, args.seed + 1)

    digests = [hashlib.sha256(b).hexdigest() for b in (first, second, third)]
    print(json.dumps(dict(zip(["run1", "run2", "run3"], digests)), indent=2))

    if digests[0] != digests[1]:
        raise SystemExit(
            "FAIL: the same seed produced two different images — the catalogue "
            "claims text-to-image is deterministic and this container is not"
        )
    if digests[0] == digests[2]:
        raise SystemExit(
            "FAIL: a different seed produced the same image — the seed is not "
            "reaching the sampler"
        )
    print("ok: same seed, same image; different seed, different image")
    return 0


if __name__ == "__main__":
    sys.exit(main())
