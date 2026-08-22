import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { transform } from 'esbuild'

/**
 * `npm run comfy:catalogue` — ship the action catalogue into the container
 * (Phase 21.2, #101).
 *
 * The catalogue is TypeScript because the browser and the endpoints share it
 * verbatim. The ComfyUI container is Python and can read neither, so it needs
 * a copy — and a copy maintained by hand is a copy that is wrong the first
 * time somebody widens a parameter range.
 *
 * So it is generated, and `comfy/pipeline.test.ts` fails when the generated
 * file no longer matches the source. That check is the point: the container
 * validating parameters against a *stale* catalogue would be worse than not
 * validating at all, because it would look like a guarantee.
 *
 * Only the fields the container can act on are emitted. `deadlineMs` is the
 * endpoint's and RunPod's business, not the graph's, and copying it here
 * would invite a second opinion about a number that already has an owner.
 */

const SOURCE = 'src/lib/ai/actions.ts'
const TARGET = 'comfy/catalogue.json'

/** Import a dependency-free TypeScript module for its values. */
async function loadModule(path) {
  const { code } = await transform(readFileSync(path, 'utf8'), {
    loader: 'ts',
    format: 'esm',
    target: 'node20',
  })
  const dir = mkdtempSync(join(tmpdir(), 'lattice-catalogue-'))
  const file = join(dir, 'actions.mjs')
  writeFileSync(file, code)
  try {
    return await import(pathToFileURL(file).href)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

export async function buildCatalogue() {
  const { AI_ACTIONS, MAX_AI_INPUT_BYTES } = await loadModule(SOURCE)
  const actions = {}
  for (const [id, action] of Object.entries(AI_ACTIONS)) {
    actions[id] = {
      inputs: action.inputs,
      output: action.output,
      // Absent for an action no GPU backend runs. The map is what decides
      // whether this container has a graph for it at all.
      ...(action.gpuClass ? { gpuClass: action.gpuClass } : {}),
      deterministicWithSeed: action.deterministicWithSeed,
      maxInputBytes: action.maxInputBytes,
      params: action.params,
    }
  }
  return {
    $comment: `Generated from ${SOURCE} by scripts/build-ai-catalogue.mjs — do not edit. Run: npm run comfy:catalogue`,
    maxInputBytes: MAX_AI_INPUT_BYTES,
    actions,
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const catalogue = await buildCatalogue()
  writeFileSync(TARGET, `${JSON.stringify(catalogue, null, 2)}\n`)
  console.log(`✓ wrote ${TARGET} (${Object.keys(catalogue.actions).length} actions)`)
}
