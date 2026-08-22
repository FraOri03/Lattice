#!/usr/bin/env python3
"""Download every pinned model and refuse anything whose hash is wrong.

Phase 21.2 (#101). Run by the Docker build, and runnable by hand for a local
ComfyUI (21.6):

    python comfy/scripts/fetch_models.py --dest /comfyui

`pins.json` is the input and the whole point: a model is identified by its
sha256, not by its URL. A host that quietly replaces a file, a mirror that
serves a different revision, a truncated download — all three produce the
same outcome here, which is a build that stops and says which file and which
digest it expected.

Already-present files are verified rather than skipped. The check is cheap
next to the download, and "it was fine when we baked the image" is not
something a cold worker can take on trust.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from urllib.request import Request, urlopen

CHUNK = 1024 * 1024
PINS = Path(__file__).resolve().parent.parent / "pins.json"


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(CHUNK), b""):
            digest.update(block)
    return digest.hexdigest()


def download(url: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_suffix(target.suffix + ".part")
    request = Request(url, headers={"User-Agent": "lattice-comfy-build"})
    with urlopen(request) as response, partial.open("wb") as out:  # noqa: S310
        while True:
            block = response.read(CHUNK)
            if not block:
                break
            out.write(block)
    # Rename only once the whole body arrived, so an interrupted build leaves
    # a `.part` rather than a plausible-looking truncated model.
    partial.replace(target)


def fetch(model: dict, dest: Path, *, allow_mirror: bool) -> None:
    target = dest / model["installTo"] / model["id"]
    expected = model["sha256"]

    if target.exists():
        actual = sha256_of(target)
        if actual == expected:
            print(f"  [=] {model['id']} (verified)")
            return
        print(f"  [!] {model['id']} on disk has digest {actual}, re-downloading")
        target.unlink()

    sources = [model["source"]]
    if allow_mirror and model.get("mirror"):
        sources.append(model["mirror"])

    last_error: Exception | None = None
    for url in sources:
        print(f"  [>] {model['id']} from {url}")
        try:
            download(url, target)
        except Exception as err:  # noqa: BLE001 - any transport failure, try the mirror
            last_error = err
            continue
        actual = sha256_of(target)
        if actual == expected:
            print(f"  [+] {model['id']} ok")
            return
        target.unlink(missing_ok=True)
        last_error = SystemExit(
            f"{model['id']} from {url} has digest {actual}, pins.json expects {expected}"
        )
    raise SystemExit(f"FAIL: {model['id']}: {last_error}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dest", required=True, help="the ComfyUI root")
    parser.add_argument(
        "--no-mirror",
        action="store_true",
        help="fail rather than fall back to a pinned mirror",
    )
    args = parser.parse_args()

    pins = json.loads(PINS.read_text(encoding="utf-8"))
    models = pins["models"]
    unpinned = [m["id"] for m in models if not m.get("sha256")]
    if unpinned:
        # The manifest is the contract. A model without a digest is not a
        # slower build, it is an unpinned dependency, and the build says so
        # rather than fetching it anyway.
        raise SystemExit(f"FAIL: no digest pinned for: {', '.join(unpinned)}")

    dest = Path(args.dest)
    print(f"Fetching {len(models)} pinned model(s) into {dest}")
    for model in models:
        fetch(model, dest, allow_mirror=not args.no_mirror)

    nodes = pins.get("customNodes", [])
    if nodes:  # pragma: no cover - empty today, and deliberately so
        print(f"{len(nodes)} custom node(s) are pinned; the Dockerfile clones them")
    print("ok: every pinned model present and verified")
    return 0


if __name__ == "__main__":
    sys.exit(main())
