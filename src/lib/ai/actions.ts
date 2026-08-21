/**
 * The AI action catalogue — what the product can ask a backend to do.
 *
 * A closed, typed list with no vendor field anywhere in it. A ComfyUI node
 * name or a RunPod endpoint id in this file would couple every consumer to
 * today's backend; the mapping from an action to the artefact that runs it
 * belongs on the server (21.2) and is never shipped to the browser.
 *
 * ## What each action has to declare, and why
 *
 * - **`gpuClass`** — an upscale does not need the hardware a text-to-image
 *   needs. After the idle timeout this is the largest cost lever in the
 *   phase, so it is declared per action and chosen at submission rather
 *   than left to one endpoint that has to be big enough for the worst case.
 * - **`deadlineMs`** — the wall-clock ceiling for the whole job, queue time
 *   included. It is enforced in the browser (the poll loop gives up) *and*
 *   on the server (it becomes RunPod's execution timeout), because a
 *   deadline only one side knows about is a deadline an abandoned tab can
 *   outlive.
 * - **`maxInputBytes`** — checked before the upload starts and again on the
 *   server. The client check exists to fail fast and honestly; the server
 *   check is the one that counts.
 * - **`deterministicWithSeed`** — whether repeating the action with the same
 *   seed reproduces the same output. 21.5 stores this with the result; the
 *   surface uses it to decide whether "regenerate" means "vary".
 *
 * Owned by 21.0 in the long run: this file is the slice 21.1 needs in order
 * to have something to submit, and it is written so the catalogue can grow
 * (phases 22-26) without any consumer changing shape.
 */

/** Every action the product can ask for. Closed on purpose. */
export type AiActionId =
  | 'text-to-image'
  | 'image-to-image'
  | 'upscale'
  | 'background-removal'
  | 'inpaint'
  | 'design-set'

/**
 * What an action consumes and produces. Vendor-neutral by construction.
 *
 * `scene` is the kind that proved the catalogue was not secretly a
 * pixel-only catalogue: Photo mode's set designer returns a described
 * arrangement of cameras, lights and props, not an image. An output kind
 * that could only ever be bytes would have forced that feature to keep its
 * own private path, which is exactly the outcome this seam exists to
 * prevent.
 */
export type AiAssetKind = 'text' | 'image' | 'mask' | 'scene'

/**
 * The hardware tier an action is submitted to.
 *
 * Three names rather than a GPU model, because the model is a deployment
 * detail that changes with availability and price. The mapping from class
 * to a concrete RunPod endpoint lives in `api/_lib/ai.ts` and is
 * server-only.
 */
export type GpuClass = 'light' | 'standard' | 'heavy'

/** A numeric parameter with the range a backend is expected to honour. */
export interface AiNumberParam {
  readonly kind: 'number'
  readonly min: number
  readonly max: number
  readonly step: number
  readonly default: number
}

/** A free-text parameter (a prompt), with the length a backend will accept. */
export interface AiTextParam {
  readonly kind: 'text'
  readonly maxLength: number
  readonly default: string
}

/** A closed choice — the values are the contract, not a vendor's enum. */
export interface AiChoiceParam {
  readonly kind: 'choice'
  readonly choices: readonly string[]
  readonly default: string
}

export type AiParamSpec = AiNumberParam | AiTextParam | AiChoiceParam

export interface AiAction {
  readonly id: AiActionId
  /** Binary inputs the action needs, in the order the caller supplies them. */
  readonly inputs: readonly AiAssetKind[]
  readonly output: AiAssetKind
  /**
   * The tier a GPU backend should run this on, or absent when no GPU
   * backend can run it at all.
   *
   * Optional because the catalogue turned out to hold more than GPU work.
   * `design-set` is a language model answering a prompt with a structured
   * layout: it has no GPU class, and inventing one for it would have been a
   * field that lies. A provider that only runs GPU work reports `canRun`
   * false for an action with no class, which is the honest answer.
   */
  readonly gpuClass?: GpuClass
  readonly deterministicWithSeed: boolean
  /** Ceiling on each binary input. Enforced client-side and again on the server. */
  readonly maxInputBytes: number
  /** Wall-clock ceiling for the job, queue time included. */
  readonly deadlineMs: number
  readonly params: Readonly<Record<string, AiParamSpec>>
}

/**
 * The ceiling on a binary input, and it is a transport decision.
 *
 * Inputs travel through the serverless function rather than direct to
 * storage, and a Vercel function's request body stops at 4.5 MB. Base64
 * inflates by a third, so 3 MB raw is the largest image that fits with room
 * for the JSON around it. Anything larger needs a signed direct-to-storage
 * upload, which is 21.5's to build — see `docs/architecture/ai.md` for why
 * the pass-through was chosen for now.
 *
 * The client checks this to fail fast; `/api/ai/submit` checks it again,
 * and that is the check that counts.
 */
export const MAX_AI_INPUT_BYTES = 3 * 1024 * 1024

const IMAGE_INPUT_CAP = MAX_AI_INPUT_BYTES

const PROMPT: AiTextParam = { kind: 'text', maxLength: 2000, default: '' }

const SEED: AiNumberParam = {
  kind: 'number',
  min: 0,
  // 2^31-1: every backend in reach accepts a signed 32-bit seed, and a
  // wider range would be a promise this catalogue cannot keep.
  max: 2_147_483_647,
  step: 1,
  default: 0,
}

export const AI_ACTIONS: Readonly<Record<AiActionId, AiAction>> = {
  'text-to-image': {
    id: 'text-to-image',
    inputs: [],
    output: 'image',
    gpuClass: 'standard',
    deterministicWithSeed: true,
    maxInputBytes: 0,
    deadlineMs: 180_000,
    params: {
      prompt: PROMPT,
      negativePrompt: { kind: 'text', maxLength: 2000, default: '' },
      width: { kind: 'number', min: 256, max: 2048, step: 64, default: 1024 },
      height: { kind: 'number', min: 256, max: 2048, step: 64, default: 1024 },
      steps: { kind: 'number', min: 1, max: 60, step: 1, default: 25 },
      guidance: { kind: 'number', min: 0, max: 20, step: 0.5, default: 5 },
      seed: SEED,
    },
  },

  'image-to-image': {
    id: 'image-to-image',
    inputs: ['image'],
    output: 'image',
    gpuClass: 'standard',
    deterministicWithSeed: true,
    maxInputBytes: IMAGE_INPUT_CAP,
    deadlineMs: 180_000,
    params: {
      prompt: PROMPT,
      strength: { kind: 'number', min: 0, max: 1, step: 0.05, default: 0.6 },
      steps: { kind: 'number', min: 1, max: 60, step: 1, default: 25 },
      seed: SEED,
    },
  },

  upscale: {
    id: 'upscale',
    inputs: ['image'],
    output: 'image',
    // Deliberately the cheap tier: an upscaler is a small model and a short
    // job, and running it on the same hardware as a diffusion sampler is
    // the single easiest way to overpay in this phase.
    gpuClass: 'light',
    deterministicWithSeed: false,
    maxInputBytes: IMAGE_INPUT_CAP,
    deadlineMs: 120_000,
    params: {
      scale: { kind: 'choice', choices: ['2', '4'], default: '2' },
    },
  },

  'background-removal': {
    id: 'background-removal',
    inputs: ['image'],
    output: 'image',
    gpuClass: 'light',
    deterministicWithSeed: false,
    maxInputBytes: IMAGE_INPUT_CAP,
    deadlineMs: 90_000,
    params: {},
  },

  /**
   * Photo mode's set designer: a prompt in, an arrangement of cameras,
   * lights, people and props out.
   *
   * The action that keeps the catalogue honest. It is not image generation,
   * it needs no GPU, its output is structure rather than pixels, and the
   * backend that runs it today is a third-party language model reached with
   * the user's own key. A catalogue that could not describe it would be a
   * catalogue tuned to one backend.
   */
  'design-set': {
    id: 'design-set',
    inputs: [],
    output: 'scene',
    deterministicWithSeed: false,
    maxInputBytes: 0,
    deadlineMs: 60_000,
    params: {
      prompt: PROMPT,
    },
  },

  inpaint: {
    id: 'inpaint',
    inputs: ['image', 'mask'],
    output: 'image',
    gpuClass: 'heavy',
    deterministicWithSeed: true,
    maxInputBytes: IMAGE_INPUT_CAP,
    deadlineMs: 240_000,
    params: {
      prompt: PROMPT,
      steps: { kind: 'number', min: 1, max: 60, step: 1, default: 30 },
      seed: SEED,
    },
  },
}

export const AI_ACTION_IDS = Object.keys(AI_ACTIONS) as AiActionId[]

/** Whether a string names an action this build knows about. */
export function isAiActionId(value: unknown): value is AiActionId {
  return typeof value === 'string' && Object.hasOwn(AI_ACTIONS, value)
}

/**
 * Validate a parameter bag against an action's declared ranges.
 *
 * Returns the offending parameter names, empty when everything fits. Pure,
 * and shared verbatim with the server (`api/ai/submit.ts` imports it), so a
 * range the browser enforces is the range the endpoint enforces — there is
 * no second definition to drift.
 */
export function invalidParams(
  actionId: AiActionId,
  params: Readonly<Record<string, unknown>>,
): string[] {
  const action = AI_ACTIONS[actionId]
  const bad: string[] = []
  for (const [name, value] of Object.entries(params)) {
    const spec = action.params[name]
    if (!spec) {
      bad.push(name)
      continue
    }
    if (spec.kind === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) bad.push(name)
      else if (value < spec.min || value > spec.max) bad.push(name)
    } else if (spec.kind === 'text') {
      if (typeof value !== 'string' || value.length > spec.maxLength) bad.push(name)
    } else if (typeof value !== 'string' || !spec.choices.includes(value)) {
      bad.push(name)
    }
  }
  return bad
}

/**
 * What an action has to hand a backend in order to run.
 *
 * Half of the sentence the surface owes the user before anything runs; the
 * other half is the provider's {@link AiBackendProvider.disclosure}, which
 * says where it goes and who pays. Derived rather than declared, so it
 * cannot drift from the parameters and inputs it describes.
 */
export type AiDataCarried = 'nothing' | 'prompt' | 'inputs' | 'prompt-and-inputs'

export function dataCarriedBy(actionId: AiActionId): AiDataCarried {
  const action = AI_ACTIONS[actionId]
  const hasText = Object.values(action.params).some((spec) => spec.kind === 'text')
  const hasInputs = action.inputs.length > 0
  if (hasText && hasInputs) return 'prompt-and-inputs'
  if (hasText) return 'prompt'
  if (hasInputs) return 'inputs'
  return 'nothing'
}

/** The declared defaults for an action, as a bag ready to be submitted. */
export function defaultParams(actionId: AiActionId): Record<string, number | string> {
  const out: Record<string, number | string> = {}
  for (const [name, spec] of Object.entries(AI_ACTIONS[actionId].params)) {
    out[name] = spec.default
  }
  return out
}
