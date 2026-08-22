# The ComfyUI pipeline

The graphs Lattice ships, the models they run on, and the container that
holds both.

Phase 21.2 ([#101](https://github.com/FraOri03/Lattice/issues/101)). The
seam this serves is [`docs/architecture/ai.md`](../docs/architecture/ai.md);
the endpoint that submits jobs to it is 21.1.

## The one rule

**Everything ComfyUI knows about lives in this directory.** Node class names,
node ids, input keys — they exist in `action-map.json` and `workflows/*.json`
and nowhere else in the repository. Above this directory, code names an
*action* from the catalogue and never a graph.

That is not tidiness. It is the answer to "what happens if we replace
ComfyUI", and the answer is: this directory gets rewritten and nothing above
it moves. `comfy/pipeline.test.ts` fails the build if a node class name turns
up in `src/` or `api/`.

## What is here

| File | What it decides |
|---|---|
| `action-map.json` | which workflow runs an action, at which version, driving which node inputs |
| `workflows/<id>@<version>.json` | the graphs, in ComfyUI **API** format |
| `pins.json` | every model and node by hash, with its source and its licence |
| `catalogue.json` | generated from `src/lib/ai/actions.ts` — never edited by hand |
| `pipeline.py` | the resolver: action + params → a prompt, or a named refusal |
| `handler.py` | the RunPod entry point: queue it, follow it, return the images |
| `Dockerfile` · `entrypoint.sh` | the image, for RunPod (21.1) and for a local run (21.6) |

## API format, not editor format

The JSON the ComfyUI editor saves and the JSON its API accepts are different
things — the first has `nodes` and `links` arrays, the second is an object
keyed by node id. **Commit the API format.** In the editor: settings → enable
dev mode, then *Save (API format)*. A test asserts it, because this is the
mistake every consumer makes exactly once.

## Adding or changing a workflow

1. Edit the graph in the editor, export in API format, save as
   `workflows/<id>@<version>.json`.
2. **A change that alters output is a new version**, not an edit in place.
   Write `<id>@<n+1>.json`, point the action at it, and add the old pair to
   `superseded` with what changed. The old file stays: 21.5 stores the
   workflow id and version with every result, and "generated with upscale v1"
   has to still mean something a year later.
3. Any new model goes in `pins.json` first, with its sha256, its source and
   its licence. `npm run comfy:validate` fails on a model a graph names and
   nobody pinned.
4. `npm run comfy:catalogue` if you changed `src/lib/ai/actions.ts`.
5. `npm run comfy:test && npm run comfy:validate && npm test`.

## Licences are a product constraint

Every pin records its licence and whether commercial use is allowed, next to
the hash, because they are the same question asked of the same file. A
non-commercial model is not shippable here, however good it is — Lattice
cannot tell a user the image is theirs to sell while the model that made it
says otherwise.

`pins.json` has a `rejected` list for exactly this. Background removal is
missing from the first workflow set because both credible models failed:
one forbids commercial use, the other downloads its weights at runtime and
therefore cannot be pinned at all.

## Building

```bash
docker build -t lattice-comfy:1 comfy
```

Reproducible on purpose: ComfyUI at a commit, every model at a sha256, every
Python dependency at an exact version. Nothing resolves "latest".

The image is around 8 GB because the weights are baked in. The alternative —
a RunPod network volume — makes the image small and pins the endpoint to one
region, which shrinks the pool of GPUs it can schedule on and makes "waiting
for a GPU" more likely. A slow first pull happens once per worker; a smaller
GPU pool happens to every user. The reasoning is in the Dockerfile next to
the layer it explains.

## Running it

```bash
# ComfyUI alone, for looking at a graph
docker run --gpus all -p 8188:8188 lattice-comfy:1 comfyui

# as the serverless worker, which is what RunPod runs
docker run --gpus all lattice-comfy:1 serverless
```

## Testing

```bash
npm run comfy:test       # the resolver — no GPU, no network, runs in CI
npm run comfy:validate   # every graph parses, links up and names pinned models
npm test                 # includes comfy/pipeline.test.ts, which checks the data
```

`comfy/scripts/smoke.py` is the one that needs a GPU. It runs the same action
twice with the same seed and once with another, and asserts the first two
images are identical and the third is not — which is the whole of what the
catalogue means when it says an action is deterministic. Nothing in CI runs
it, because CI has no GPU and it costs real minutes.
