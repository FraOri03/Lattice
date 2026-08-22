# The image that runs on RunPod (21.1) and locally (21.6).
#
# Phase 21.2 (#101). Two properties are worth the shape of this file:
#
#  1. **It builds reproducibly.** ComfyUI is pinned to a commit, every model
#     to a sha256, and Python dependencies to exact versions. Nothing here
#     resolves "latest" at build time, so the same Dockerfile a month from
#     now produces the same worker.
#
#  2. **Cold start does not pull the internet.** Weights are baked into their
#     own layer. See the note below for the alternative and why it lost.
#
# Build:
#   docker build -t lattice-comfy:1 comfy
# Run locally (needs an NVIDIA runtime):
#   docker run --gpus all -p 8188:8188 lattice-comfy:1 comfyui

FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    COMFY_ROOT=/comfyui \
    PIPELINE_ROOT=/pipeline \
    COMFY_HOST=127.0.0.1:8188

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3.11 python3.11-venv python3-pip git ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.11 /usr/local/bin/python

# ---------------- ComfyUI, at a commit ----------------
#
# A tag can be moved and a branch is not a version. The commit is what makes
# "this image ran ComfyUI v0.33.1" a checkable statement rather than a hope.
ARG COMFYUI_COMMIT=72865f4f27eaf5396f8f36370e0a2be3a9a090ee
RUN git clone https://github.com/comfyanonymous/ComfyUI.git ${COMFY_ROOT} \
    && cd ${COMFY_ROOT} \
    && git checkout --detach ${COMFYUI_COMMIT}

# Torch first and on its own layer: it is the largest dependency and the one
# least likely to change, so a handler edit must not re-download it.
ARG TORCH_INDEX=https://download.pytorch.org/whl/cu124
RUN python -m pip install --upgrade pip \
    && python -m pip install --index-url ${TORCH_INDEX} \
       torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1

RUN python -m pip install -r ${COMFY_ROOT}/requirements.txt

# ---------------- the handler's own dependencies ----------------
COPY requirements.txt /pipeline/requirements.txt
RUN python -m pip install -r /pipeline/requirements.txt

# ---------------- the pinned models ----------------
#
# Only pins.json and the fetcher are copied at this point, so editing a
# workflow or the handler does not invalidate a layer that takes half an hour
# and seven gigabytes to rebuild.
#
# ## Baked, not mounted
#
# The alternative is a RunPod network volume holding the weights, which makes
# the image small and the first pull fast. It loses on the thing that matters
# more here: a network volume is region-pinned, so the endpoint can only ever
# schedule on workers in that one datacentre. That shrinks the GPU pool, and a
# smaller pool means more `no-capacity` — a user waiting for a worker that
# exists elsewhere is a worse outcome than a slow first pull, which happens
# once per worker and is then cached.
#
# The cost is honest and large: this layer is about 7.3 GB.
COPY pins.json /pipeline/pins.json
COPY scripts/fetch_models.py /pipeline/scripts/fetch_models.py
RUN python /pipeline/scripts/fetch_models.py --dest ${COMFY_ROOT}

# ---------------- the pipeline ----------------
COPY catalogue.json action-map.json /pipeline/
COPY workflows /pipeline/workflows
COPY pipeline.py handler.py /pipeline/
COPY scripts /pipeline/scripts

# Validate every graph at BUILD time rather than on a user's first job: a
# workflow that points at a node it does not have is a broken image, and it
# should fail here where nobody is waiting and nobody is billed.
RUN cd /pipeline && python scripts/validate_pipeline.py

WORKDIR /pipeline
COPY entrypoint.sh /pipeline/entrypoint.sh
RUN chmod +x /pipeline/entrypoint.sh

ENTRYPOINT ["/pipeline/entrypoint.sh"]
CMD ["serverless"]
