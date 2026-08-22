"""The RunPod serverless handler: an action in, images out.

Phase 21.2 (#101). The other side of the contract `/api/ai/submit` writes
(21.1): the request body is

    {"input": {"action": "...", "params": {...}, "inputs": [...]}}

and never a graph. That direction matters. A worker that accepted a prompt
graph would run whatever it was handed, so a leaked RunPod key would buy
arbitrary code execution on our GPUs rather than the four things this
container knows how to do. The action list is the boundary.

## What it yields, and why it is a generator

`21.1` reads progress off the job while it runs, and merges every streamed
item into one view of the job (`viewOf` in `api/_lib/ai.ts`). So this yields
`{"progress": 0..1}` and, where ComfyUI sends one, `{"preview": "data:..."}`
during sampling. On a thirty-second job that moves perceived latency more
than any optimisation of the job itself.

The final value carries `images`, the `seed` actually used, and the workflow
id and version — the provenance pair 21.5 stores so a result stays
explainable after the map has moved on.

## Failures are named, not described

A returned `{"error": "[reason] detail"}` is mapped straight onto the shared
failure taxonomy by `mapJobError`. Without the prefix every failure arrives
as `upstream-error` and the surface advises a retry that cannot help.
"""

from __future__ import annotations

import base64
import json
import os
import time
import uuid
from pathlib import Path
from typing import Any, Iterator

import requests
import websocket  # websocket-client

from pipeline import Pipeline, PipelineError

COMFY_HOST = os.environ.get("COMFY_HOST", "127.0.0.1:8188")
COMFY_ROOT = Path(os.environ.get("COMFY_ROOT", "/comfyui"))
PIPELINE_ROOT = Path(os.environ.get("PIPELINE_ROOT", "/pipeline"))

#: How long to wait for ComfyUI itself to come up before giving up on the
#: worker. A cold GPU worker loads several gigabytes of weights; two minutes
#: is generous for that and short enough that a genuinely broken image fails
#: rather than burning the job's whole deadline.
BOOT_TIMEOUT_S = 120

pipeline = Pipeline(PIPELINE_ROOT)


def handler(job: dict[str, Any]) -> Iterator[dict[str, Any]] | dict[str, Any]:
    """RunPod entry point. Yields progress, returns the result."""
    payload = job.get("input") or {}
    try:
        resolved = pipeline.resolve(
            payload.get("action", ""),
            payload.get("params") or {},
            payload.get("inputs") or [],
        )
    except PipelineError as err:
        return {"error": f"[{err.reason}] {err.detail}"}

    try:
        yield from _run(resolved)
    except PipelineError as err:
        yield {"error": f"[{err.reason}] {err.detail}"}


def _run(resolved) -> Iterator[dict[str, Any]]:
    _await_comfy()

    for file in resolved.input_files:
        _write_input(file)

    client_id = str(uuid.uuid4())
    prompt_id = _queue(resolved.prompt, client_id)

    for update in _watch(prompt_id, client_id):
        yield update

    images = _collect(prompt_id, resolved.output_node)
    if not images:
        raise PipelineError(
            "upstream-error",
            "The graph finished without producing an image on its output node.",
        )

    yield {
        "images": images,
        "seed": resolved.seed,
        # The provenance pair. 21.5 stores it; the UI shows it a year later.
        "workflow": resolved.workflow,
        "workflowVersion": resolved.version,
    }


# ---------------- readiness ----------------


def _await_comfy() -> None:
    """Block until ComfyUI answers, or fail as a capacity problem.

    A worker whose ComfyUI never came up has nothing wrong with the *job*, so
    it is reported as capacity rather than as the user's fault — the same
    reason a queued endpoint with no free worker reports.
    """
    deadline = time.monotonic() + BOOT_TIMEOUT_S
    while time.monotonic() < deadline:
        try:
            requests.get(f"http://{COMFY_HOST}/system_stats", timeout=2).raise_for_status()
            return
        except Exception:  # noqa: BLE001 - any failure here means "not up yet"
            time.sleep(0.5)
    raise PipelineError(
        "no-capacity", f"ComfyUI did not start within {BOOT_TIMEOUT_S}s on this worker."
    )


def _write_input(file: dict[str, str]) -> None:
    if not file["base64"]:
        raise PipelineError("invalid-parameters", f"{file['kind']} input was empty.")
    try:
        raw = base64.b64decode(file["base64"], validate=True)
    except Exception as err:  # noqa: BLE001
        raise PipelineError(
            "invalid-parameters", f"{file['kind']} input is not valid base64."
        ) from err
    target = COMFY_ROOT / "input" / file["filename"]
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(raw)


# ---------------- running ----------------


def _queue(prompt: dict[str, Any], client_id: str) -> str:
    res = requests.post(
        f"http://{COMFY_HOST}/prompt",
        json={"prompt": prompt, "client_id": client_id},
        timeout=30,
    )
    if res.status_code >= 400:
        # ComfyUI validates the graph and says which node it disliked. That
        # is a fault in this container's own data, so it is reported as a
        # missing/wrong model rather than as something the user can retry.
        raise PipelineError(
            "model-missing", f"ComfyUI rejected the graph: {res.text[:300]}"
        )
    return res.json()["prompt_id"]


def _watch(prompt_id: str, client_id: str) -> Iterator[dict[str, Any]]:
    """Follow one prompt over the websocket, yielding what it reports."""
    conn = websocket.WebSocket()
    conn.connect(f"ws://{COMFY_HOST}/ws?clientId={client_id}", timeout=30)
    try:
        while True:
            message = conn.recv()
            if isinstance(message, bytes):
                preview = _preview_of(message)
                if preview:
                    yield {"preview": preview}
                continue
            event = json.loads(message)
            data = event.get("data") or {}
            if data.get("prompt_id") not in (None, prompt_id):
                continue
            if event.get("type") == "progress":
                total = data.get("max") or 1
                yield {"progress": round(min(1.0, data.get("value", 0) / total), 3)}
            elif event.get("type") == "execution_error":
                raise PipelineError(
                    "upstream-error",
                    str(data.get("exception_message", "the graph failed"))[:300],
                )
            elif event.get("type") == "executing" and data.get("node") is None:
                # node: null means the prompt is finished, and it is the only
                # completion signal ComfyUI sends on this socket.
                return
    finally:
        conn.close()


def _preview_of(frame: bytes) -> str | None:
    """A binary websocket frame is a preview image behind an 8-byte header."""
    if len(frame) <= 8:
        return None
    # bytes 0-3: event type (1 = preview image), 4-7: image format (1 = JPEG)
    kind = int.from_bytes(frame[0:4], "big")
    if kind != 1:
        return None
    mime = "image/jpeg" if int.from_bytes(frame[4:8], "big") == 1 else "image/png"
    return f"data:{mime};base64,{base64.b64encode(frame[8:]).decode()}"


def _collect(prompt_id: str, output_node: str) -> list[str]:
    """Read the finished images off the node the map named as the output."""
    history = requests.get(f"http://{COMFY_HOST}/history/{prompt_id}", timeout=30).json()
    outputs = history.get(prompt_id, {}).get("outputs", {})
    entries = outputs.get(output_node, {}).get("images", [])

    images: list[str] = []
    for entry in entries:
        if entry.get("type") == "temp":
            continue
        raw = requests.get(
            f"http://{COMFY_HOST}/view",
            params={
                "filename": entry["filename"],
                "subfolder": entry.get("subfolder", ""),
                "type": entry.get("type", "output"),
            },
            timeout=60,
        ).content
        images.append(_deliver(raw, entry["filename"]))
    return images


def _deliver(raw: bytes, filename: str) -> str:
    """Hand the bytes back, by URL if there is a bucket and inline if not.

    Inline is a stopgap and is written down as one: a 1024x1024 PNG is a
    couple of megabytes of base64 travelling through the job payload, which
    works and does not scale. 21.5 owns where a generated asset actually
    lives; until then a deployment that sets the RunPod S3 variables gets
    URLs, and one that does not still gets its image.
    """
    if os.environ.get("BUCKET_ENDPOINT_URL"):
        from runpod.serverless.utils import rp_upload  # imported late: optional path

        return rp_upload.upload_image(str(uuid.uuid4()), raw, filename)
    return f"data:image/png;base64,{base64.b64encode(raw).decode()}"


if __name__ == "__main__":  # pragma: no cover - the container's entry point
    import runpod

    runpod.serverless.start({"handler": handler, "return_aggregate_stream": True})
