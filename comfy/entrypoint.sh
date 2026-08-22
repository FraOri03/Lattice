#!/usr/bin/env bash
# Start ComfyUI, then the thing that talks to it.
#
# Phase 21.2 (#101). Two modes, one image:
#
#   serverless  ComfyUI in the background, RunPod's handler in the foreground.
#               This is what 21.1 submits jobs to.
#   comfyui     ComfyUI alone, on 8188, for looking at a graph in the editor
#               or for the local backend 21.6 will point at.
set -euo pipefail

COMFY_ROOT="${COMFY_ROOT:-/comfyui}"
MODE="${1:-serverless}"

start_comfy() {
  # --disable-auto-launch: there is no browser here.
  # --dont-print-server: its banner interleaves with the handler's output and
  #   makes the worker log unreadable at exactly the moment it matters.
  python "${COMFY_ROOT}/main.py" \
    --listen 127.0.0.1 --port 8188 \
    --disable-auto-launch --dont-print-server "$@"
}

case "${MODE}" in
  comfyui)
    # Foreground, and listening on every interface so the port mapping works.
    exec python "${COMFY_ROOT}/main.py" --listen 0.0.0.0 --port 8188 --disable-auto-launch
    ;;
  serverless)
    start_comfy &
    COMFY_PID=$!
    # If ComfyUI dies the worker is useless; take the container down with it
    # rather than leaving a handler that reports "no-capacity" for every job
    # until the idle timeout retires it.
    trap 'kill -TERM ${COMFY_PID} 2>/dev/null || true' EXIT
    exec python /pipeline/handler.py
    ;;
  *)
    echo "unknown mode: ${MODE} (expected 'serverless' or 'comfyui')" >&2
    exit 64
    ;;
esac
