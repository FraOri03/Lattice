// @vitest-environment node
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AI_ACTIONS, type AiActionId } from '@/lib/ai/actions'
import { buildCatalogue } from '../scripts/build-ai-catalogue.mjs'

/**
 * The pipeline as data (Phase 21.2, #101).
 *
 * The resolver is Python because it runs in the container, and its own
 * behaviour is covered by `comfy/tests/test_pipeline.py`. What this suite
 * guards is everything the resolver *reads*: a graph that points at a node
 * it does not have, a map entry naming an input that was renamed, a model
 * nobody pinned, a licence nobody looked at.
 *
 * All of it is checkable without a GPU, and all of it would otherwise be
 * discovered by a user on a cold start they waited for and a worker they
 * paid for.
 */

const ROOT = 'comfy'

const read = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(ROOT, path), 'utf8')) as Record<string, unknown>

interface Binding {
  node: string
  input: string
  values?: Record<string, number>
}
interface InputBinding extends Binding {
  kind: string
}
interface MapEntry {
  workflow: string
  version: number
  gpuClass: string
  outputNode: string
  seed: Binding | null
  params: Record<string, Binding>
  inputs: InputBinding[]
  fixed: Record<string, string>
}
interface ComfyNode {
  class_type: string
  inputs: Record<string, unknown>
}
interface Pin {
  id: string
  sha256: string
  source: string
  licence: string
  commercialUse: string
  installTo: string
}

const map = read('action-map.json') as unknown as {
  actions: Record<string, MapEntry>
  notShipped: Record<string, { why: string; consequence: string }>
  superseded: { workflow: string; version: number; replacedBy: number; why: string }[]
}
const pins = read('pins.json') as unknown as {
  runtime: { comfyui: { commit: string; tag: string; licence: string } }
  models: Pin[]
  customNodes: { id: string; repo: string; commit: string; licence: string }[]
  rejected: { id: string; why: string; licence: string }[]
}

const workflow = (id: string, version: number) =>
  read(`workflows/${id}@${version}.json`) as unknown as Record<string, ComfyNode>

const mapped = Object.entries(map.actions)
const workflowFiles = readdirSync(join(ROOT, 'workflows')).filter((f) => f.endsWith('.json'))

/* ---------------- the catalogue copy ---------------- */

describe('the generated catalogue', () => {
  /**
   * The container validates parameters against this copy. A stale copy would
   * be worse than no copy: it would look like a guarantee while accepting a
   * range the product no longer offers.
   */
  it('matches the TypeScript it was generated from', async () => {
    const fresh = await buildCatalogue()
    const onDisk = read('catalogue.json')
    expect(onDisk).toEqual(fresh)
  })

  it('carries every action, including the ones no GPU runs', () => {
    const onDisk = read('catalogue.json') as { actions: Record<string, unknown> }
    expect(Object.keys(onDisk.actions).sort()).toEqual(Object.keys(AI_ACTIONS).sort())
  })
})

/* ---------------- coverage ---------------- */

describe('every action the product promises', () => {
  const gpuActions = (Object.keys(AI_ACTIONS) as AiActionId[]).filter(
    (id) => AI_ACTIONS[id].gpuClass !== undefined,
  )

  it.each(gpuActions)('%s is either mapped or excused in writing', (id) => {
    const excuse = map.notShipped[id]
    expect(Boolean(map.actions[id]) || Boolean(excuse)).toBe(true)
    if (!map.actions[id]) {
      // Not silently dropped: the reason and its consequence are both
      // recorded, because "we could not license a model" is a product fact.
      expect(excuse.why.length).toBeGreaterThan(40)
      expect(excuse.consequence.length).toBeGreaterThan(40)
    }
  })

  it('does not map an action no GPU backend can run', () => {
    expect(AI_ACTIONS['design-set'].gpuClass).toBeUndefined()
    expect(map.actions['design-set']).toBeUndefined()
  })

  it('maps nothing the catalogue does not declare', () => {
    for (const [id] of mapped) expect(AI_ACTIONS[id as AiActionId]).toBeDefined()
  })
})

/* ---------------- the graphs ---------------- */

describe.each(mapped)('%s', (id, entry) => {
  const graph = workflow(entry.workflow, entry.version)

  it('is committed in API format, not editor format', () => {
    // The two look alike and are not: editor JSON has `nodes` and `links`
    // arrays, API JSON is an object keyed by node id. Committing the wrong
    // one is the mistake every consumer then makes once.
    expect(graph.nodes).toBeUndefined()
    expect(graph.links).toBeUndefined()
    for (const node of Object.values(graph)) {
      expect(typeof node.class_type).toBe('string')
      expect(typeof node.inputs).toBe('object')
    }
  })

  it('has no dangling links', () => {
    for (const [nodeId, node] of Object.entries(graph)) {
      for (const [key, value] of Object.entries(node.inputs)) {
        if (Array.isArray(value) && typeof value[0] === 'string') {
          expect(graph[value[0]], `${nodeId}.${key} links to ${value[0]}`).toBeDefined()
        }
      }
    }
  })

  it('saves its result on the node the map calls the output', () => {
    expect(graph[entry.outputNode]).toBeDefined()
    expect(graph[entry.outputNode].class_type).toBe('SaveImage')
  })

  it('binds every exposed parameter to an input that exists', () => {
    for (const [name, binding] of Object.entries(entry.params)) {
      const node = graph[binding.node]
      expect(node, `${name} -> node ${binding.node}`).toBeDefined()
      expect(
        Object.hasOwn(node.inputs, binding.input),
        `${name} -> ${node.class_type}.${binding.input}`,
      ).toBe(true)
    }
  })

  it('exposes only parameters the catalogue declares', () => {
    const declared = Object.keys(AI_ACTIONS[id as AiActionId].params)
    for (const name of Object.keys(entry.params)) expect(declared).toContain(name)
  })

  it('explains in writing every catalogue parameter it does not expose', () => {
    const declared = Object.keys(AI_ACTIONS[id as AiActionId].params)
    const explained = Object.keys(entry.fixed).join(' ')
    for (const name of declared) {
      if (!entry.params[name]) expect(explained).toContain(name)
    }
  })

  it('binds each binary input the catalogue declares, in order', () => {
    const declared = AI_ACTIONS[id as AiActionId].inputs
    expect(entry.inputs.map((i) => i.kind)).toEqual([...declared])
    for (const binding of entry.inputs) {
      expect(graph[binding.node]).toBeDefined()
      expect(Object.hasOwn(graph[binding.node].inputs, binding.input)).toBe(true)
    }
  })

  it('declares the GPU class the catalogue declares', () => {
    expect(entry.gpuClass).toBe(AI_ACTIONS[id as AiActionId].gpuClass)
  })

  /**
   * Where the catalogue claims determinism, this is where the claim is made
   * true: a seed the caller controls, and a sampler they cannot change under
   * it. The same seed on a different sampler is a different image.
   */
  it('makes the determinism claim true, or does not make it', () => {
    const deterministic = AI_ACTIONS[id as AiActionId].deterministicWithSeed
    expect(Boolean(entry.seed)).toBe(deterministic)
    if (!deterministic) return

    const seedNode = graph[(entry.seed as Binding).node]
    expect(Object.hasOwn(seedNode.inputs, (entry.seed as Binding).input)).toBe(true)
    expect(typeof seedNode.inputs.sampler_name).toBe('string')
    expect(typeof seedNode.inputs.scheduler).toBe('string')
    const exposed = Object.values(entry.params).map((b) => `${b.node}.${b.input}`)
    expect(exposed).not.toContain(`${(entry.seed as Binding).node}.sampler_name`)
    expect(exposed).not.toContain(`${(entry.seed as Binding).node}.scheduler`)
  })

  it('translates a choice parameter into a value the node takes', () => {
    for (const [name, binding] of Object.entries(entry.params)) {
      const declared = AI_ACTIONS[id as AiActionId].params[name]
      if (declared.kind !== 'choice') continue
      expect(binding.values, `${name} needs a values table`).toBeDefined()
      for (const choice of declared.choices) {
        expect(Object.hasOwn(binding.values as object, choice)).toBe(true)
      }
    }
  })
})

/* ---------------- pins ---------------- */

describe('the pin manifest', () => {
  const HEX64 = /^[0-9a-f]{64}$/
  const HEX40 = /^[0-9a-f]{40}$/

  it('pins ComfyUI itself by commit, not only by tag', () => {
    expect(pins.runtime.comfyui.commit).toMatch(HEX40)
    expect(pins.runtime.comfyui.tag).toMatch(/^v\d/)
    expect(pins.runtime.comfyui.licence).toBeTruthy()
  })

  it.each(pins.models.map((m) => [m.id, m] as const))(
    '%s is pinned by hash, with a source and a licence',
    (_id, model) => {
      expect(model.sha256).toMatch(HEX64)
      expect(model.source).toMatch(/^https:\/\//)
      expect(model.licence).toBeTruthy()
      expect(['allowed', 'allowed-with-restrictions', 'forbidden']).toContain(
        model.commercialUse,
      )
      expect(model.installTo).toMatch(/^models\//)
    },
  )

  it('pins every custom node by commit, if it has any', () => {
    for (const node of pins.customNodes) {
      expect(node.commit).toMatch(HEX40)
      expect(node.licence).toBeTruthy()
    }
  })

  /** A model a graph names but nobody pinned is a build that cannot exist. */
  it.each(mapped)('%s names only pinned models', (_id, entry) => {
    const pinned = new Set(pins.models.map((m) => m.id))
    const graph = workflow(entry.workflow, entry.version)
    const keys = ['ckpt_name', 'vae_name', 'model_name', 'lora_name', 'control_net_name']
    for (const node of Object.values(graph)) {
      for (const key of keys) {
        const named = node.inputs[key]
        if (typeof named === 'string') expect(pinned).toContain(named)
      }
    }
  })

  it('ships nothing whose licence forbids commercial use', () => {
    for (const model of pins.models) expect(model.commercialUse).not.toBe('forbidden')
  })

  it('records why each rejected candidate was rejected', () => {
    expect(pins.rejected.length).toBeGreaterThan(0)
    for (const entry of pins.rejected) {
      expect(entry.licence).toBeTruthy()
      expect(entry.why.length).toBeGreaterThan(40)
    }
  })
})

/* ---------------- versions ---------------- */

describe('workflow versions', () => {
  it('accounts for every file in the directory', () => {
    const current = new Set(mapped.map(([, e]) => `${e.workflow}@${e.version}.json`))
    const kept = new Set(
      map.superseded.map((s) => `${s.workflow}@${s.version}.json`),
    )
    for (const file of workflowFiles) {
      expect(
        current.has(file) || kept.has(file),
        `${file} is neither mapped nor listed as superseded`,
      ).toBe(true)
    }
  })

  it('keeps every superseded version on disk, so a past result stays explainable', () => {
    for (const entry of map.superseded) {
      const path = join(ROOT, 'workflows', `${entry.workflow}@${entry.version}.json`)
      expect(statSync(path).isFile()).toBe(true)
      expect(entry.why.length).toBeGreaterThan(10)
    }
  })

  it('names each file for the id and version it holds', () => {
    for (const file of workflowFiles) expect(file).toMatch(/^[a-z-]+@\d+\.json$/)
  })
})

/* ---------------- the blast radius ---------------- */

describe('where ComfyUI is allowed to exist', () => {
  /**
   * The claim the map makes about itself: node class names live here and in
   * the workflows, and nowhere above them. If ComfyUI is ever replaced, this
   * directory is what gets rewritten and nothing else moves.
   */
  it('keeps every node class name out of src/ and api/', () => {
    const classes = new Set<string>()
    for (const [, entry] of mapped) {
      for (const node of Object.values(workflow(entry.workflow, entry.version))) {
        classes.add(node.class_type)
      }
    }
    expect(classes.size).toBeGreaterThan(8)

    const offenders: string[] = []
    for (const file of sourceFiles('src').concat(sourceFiles('api'))) {
      const text = readFileSync(file, 'utf8')
      for (const name of classes) {
        if (text.includes(name)) offenders.push(`${file}: ${name}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}
