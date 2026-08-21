import type { PhotoElement } from '@/types/photo'
import { vaultKey } from '@/lib/storage/vaultScope'
import { AiJobError, type AiBackendProvider } from '../AiBackendProvider.js'
import { immediateJob } from '../immediateJob.js'
import { AI_ACTIONS, invalidParams } from '../actions.js'
import type { AiFailureReason } from '../jobModel.js'

/**
 * `design-set`, run by Gemini, with the user's own key.
 *
 * This provider is the counter-example the seam was tested against. It is
 * not a GPU worker, it does not queue, it returns structure rather than
 * pixels, and the credential belongs to the user rather than to the
 * deployment. Everything it needed from the contract, it got: `hosted`
 * because bytes leave the device, {@link immediateJob} because there is
 * nothing to poll, `scene` because the answer is a layout, and a
 * `disclosure` that says third-party and your-key — which is the one thing
 * `id` alone could never have said.
 *
 * ## The key
 *
 * Stored per account via `vaultKey`, sent only to Google, and never to any
 * Lattice endpoint. Storing it *is* the consent: there are no binary inputs
 * here, and asking again per prompt would be a dialog in front of a feature
 * whose entire configuration was the act of agreeing to it. What the
 * surface still owes the user is the disclosure above, shown before the
 * first run rather than after.
 */

const KEY_STORAGE = vaultKey('lattice-photo-gemini-key')
const GEMINI_MODEL = 'gemini-3.5-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

export function getSetDesignKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? ''
  } catch {
    return ''
  }
}

export function setSetDesignKey(key: string): void {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key)
    else localStorage.removeItem(KEY_STORAGE)
  } catch {
    /* storage unavailable — the key just will not persist */
  }
}

const SYSTEM_INSTRUCTION = `You are an expert Filmmaking & Photography Set Designer AI.
Given a prompt, design a 2D top-down set layout.
Represent distances in centimeters (cm). Place objects logically relative to each other on a coordinate plane where (0,0) is the center subject.
You MUST generate a list of elements that matches the user's setup description.

For each element, choose one of the following types:
1. 'camera': Representing a camera. Front view is along the positive X-axis (rotation 0 points right, 90 points down, 180 points left, 270 points up).
   - cameraNumber: e.g. "A", "B", "C"
   - focalLength: focal length in mm (e.g. 24, 35, 50, 85)
   - fov: field of view angle (e.g. 63)
   - targetDistance: distance in cm to target/subject (e.g., 200)
   - shotType: "Close Up", "Medium", "Wide", "Extreme Wide"
   - sensor: "Full Frame", "APS-C", "Super 35"
2. 'light': Representing a light fixture.
   - lightType: "softbox", "fresnel", "led_panel", "tube_light", "bounce", "spot"
   - intensity: 10 to 100
   - beamAngle: 10 to 120 (in degrees)
   - colorTemperature: Kelvin value (e.g. 3200, 5600, 6500)
   - color: hex color code representing the light color (e.g. "#FFF3E0", "#E0F7FA", "#FFEB3B")
3. 'person': Representing actors, models, crew, or photographers.
   - role: "Actor", "Extra", "Model", "Photographer", "Assistant"
4. 'prop': Representing scene furniture or assets.
   - propType: "table", "chair", "sofa", "bed", "wall", "backdrop", "cyclorama", "green_screen"
   - color: optional hex color

Coordinates:
- Place the main subject/actor/model at or close to (0, 0).
- Place cameras facing the subject (e.g., at x: 0, y: -250, looking up towards the subject at y: 0, which corresponds to rotation 270 degrees).
- Place lights to illuminate the subject (e.g., 45-degree key light at x: -150, y: -150, backlight at x: 100, y: 150).
Make the arrangement extremely professional and realistic according to the prompt description.`

/** Gemini structured-output schema for the layout response. */
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  required: ['elements'],
  properties: {
    elements: {
      type: 'ARRAY',
      description: 'The list of elements in the generated layout',
      items: {
        type: 'OBJECT',
        required: ['type', 'name', 'x', 'y', 'rotation'],
        properties: {
          type: { type: 'STRING', enum: ['camera', 'light', 'person', 'prop'] },
          name: { type: 'STRING' },
          x: { type: 'INTEGER' },
          y: { type: 'INTEGER' },
          rotation: { type: 'INTEGER' },
          // camera
          cameraNumber: { type: 'STRING' },
          focalLength: { type: 'INTEGER' },
          fov: { type: 'INTEGER' },
          targetDistance: { type: 'INTEGER' },
          shotType: { type: 'STRING' },
          sensor: { type: 'STRING' },
          // light
          lightType: { type: 'STRING' },
          intensity: { type: 'INTEGER' },
          beamAngle: { type: 'INTEGER' },
          colorTemperature: { type: 'INTEGER' },
          color: { type: 'STRING' },
          // person
          role: { type: 'STRING' },
          // prop
          propType: { type: 'STRING' },
        },
      },
    },
  },
}

export const GeminiSetDesignProvider: AiBackendProvider = {
  id: 'hosted',
  label: 'Gemini (your own key)',
  requiresUpload: true,
  disclosure: { destination: 'third-party', cost: 'your-key' },

  // Runtime, not build-time: the answer changes the moment the user pastes
  // a key or clears one, and no redeploy is involved in either.
  canRun: (action) => action === 'design-set' && getSetDesignKey().length > 0,

  capabilities: async () =>
    getSetDesignKey()
      ? { configured: true, actions: ['design-set'] }
      : { configured: false, actions: [], reason: 'not-configured' },

  submit: async (req, opts = {}) => {
    if (req.actionId !== 'design-set') {
      throw new AiJobError('invalid-parameters', `Gemini does not run ${req.actionId} here.`)
    }
    const key = getSetDesignKey()
    if (!key) {
      throw new AiJobError(
        'not-configured',
        'No Gemini key is stored for this account. Add one, or use the offline templates.',
      )
    }
    const bad = invalidParams('design-set', req.params)
    if (bad.length > 0) {
      throw new AiJobError('invalid-parameters', `Out of range or unknown: ${bad.join(', ')}.`)
    }
    const prompt = typeof req.params.prompt === 'string' ? req.params.prompt.trim() : ''
    if (!prompt) {
      throw new AiJobError('invalid-parameters', 'Describe the set you want before generating.')
    }

    const jobId = `gemini-${Date.now().toString(36)}`
    const started = Date.now()
    return immediateJob({
      jobId,
      actionId: 'design-set',
      deadlineMs: AI_ACTIONS['design-set'].deadlineMs,
      opts,
      run: async (signal) => ({
        jobId,
        actionId: 'design-set',
        outputs: [{ kind: 'scene', value: await askGemini(prompt, key, signal) }],
        durationMs: Date.now() - started,
      }),
    })
  },
}

async function askGemini(
  prompt: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<Partial<PhotoElement>[]> {
  let res: Response
  try {
    res = await fetch(GEMINI_URL, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ parts: [{ text: `Design a set based on: "${prompt}"` }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    })
  } catch (err) {
    // An abort is the deadline or the user; `immediateJob` tells those apart
    // and this must not swallow either into a generic network failure.
    if (signal.aborted) throw err
    throw new AiJobError(
      'network-lost',
      err instanceof Error ? err.message : 'The request never reached Google.',
    )
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new AiJobError(
      geminiFailure(res.status),
      body?.error?.message ?? `Gemini refused the request (HTTP ${res.status}).`,
    )
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  let parsed: { elements?: Partial<PhotoElement>[] }
  try {
    parsed = JSON.parse(text) as { elements?: Partial<PhotoElement>[] }
  } catch {
    throw new AiJobError('upstream-error', 'Gemini answered with something that is not JSON.')
  }
  if (!Array.isArray(parsed.elements) || parsed.elements.length === 0) {
    throw new AiJobError('upstream-error', 'The answer did not contain any set elements.')
  }
  return parsed.elements
}

/**
 * Gemini's HTTP statuses, in the taxonomy's terms.
 *
 * The interesting one is 429. A rate-limited vendor and a serverless
 * endpoint with no free worker are the same fact to a user — *nothing is
 * available to run this right now, try later* — and that is why the reason
 * is called `no-capacity` rather than `no-worker`. This provider is what
 * made the old name wrong.
 */
function geminiFailure(status: number): AiFailureReason {
  if (status === 400 || status === 401 || status === 403) return 'unauthorized'
  if (status === 429) return 'no-capacity'
  if (status === 404) return 'model-missing'
  return 'upstream-error'
}
