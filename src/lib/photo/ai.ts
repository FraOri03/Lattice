import type { PhotoElement } from '@/types/photo'

/**
 * AI set generation for Photo mode. The standalone tool proxied Gemini
 * through an Express server; Lattice is a pure client app, so we call the
 * Gemini REST API directly with a user-provided key (stored locally, sent
 * only to Google). Without a key we fall back to a small offline layout
 * generator so the feature always produces a usable set.
 */

const KEY_STORAGE = 'lattice-photo-gemini-key'
const GEMINI_MODEL = 'gemini-3.5-flash'

export function getPhotoAiKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? ''
  } catch {
    return ''
  }
}

export function setPhotoAiKey(key: string) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key)
    else localStorage.removeItem(KEY_STORAGE)
  } catch {
    /* storage unavailable — key just won't persist */
  }
}

export interface PhotoAiResult {
  elements: Partial<PhotoElement>[]
  /** which engine produced the layout */
  source: 'gemini' | 'offline'
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

async function generateWithGemini(prompt: string, apiKey: string): Promise<PhotoAiResult> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ parts: [{ text: `Design a set based on: "${prompt}"` }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    },
  )
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { message?: string }
    } | null
    throw new Error(body?.error?.message ?? `Gemini request failed (HTTP ${res.status})`)
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  const parsed = JSON.parse(text) as { elements?: Partial<PhotoElement>[] }
  if (!Array.isArray(parsed.elements) || parsed.elements.length === 0) {
    throw new Error('The AI response did not contain any elements')
  }
  return { elements: parsed.elements, source: 'gemini' }
}

/**
 * Offline layout generator (ported from the tool's server fallback):
 * keyword-matched templates so the assistant works without any API key.
 * Matches both English and Italian keywords.
 */
function generateOffline(prompt: string): PhotoAiResult {
  const p = prompt.toLowerCase()

  const actor = {
    type: 'person',
    name: 'Main subject',
    x: 0,
    y: 0,
    rotation: 90,
    color: '#a855f7',
    role: 'Actor',
    pose: 'standing',
  } as Partial<PhotoElement>

  const cameraA = {
    type: 'camera',
    name: 'Camera A',
    x: 0,
    y: 300,
    rotation: 270,
    color: '#10b981',
    cameraNumber: 'A',
    focalLength: 50,
    fov: 46,
    targetDistance: 300,
    shotType: 'Medium',
    sensor: 'Full Frame',
  } as Partial<PhotoElement>

  if (/beauty|ritratto|portrait|headshot/.test(p)) {
    return {
      source: 'offline',
      elements: [
        actor,
        cameraA,
        {
          type: 'light',
          name: 'Softbox key light',
          x: -120,
          y: 200,
          rotation: 330,
          color: '#FFF3E0',
          lightType: 'softbox',
          intensity: 80,
          beamAngle: 60,
          colorTemperature: 5600,
        } as Partial<PhotoElement>,
        {
          type: 'light',
          name: 'Softbox fill light',
          x: 120,
          y: 200,
          rotation: 210,
          color: '#E0F7FA',
          lightType: 'softbox',
          intensity: 40,
          beamAngle: 80,
          colorTemperature: 5600,
        } as Partial<PhotoElement>,
        {
          type: 'light',
          name: 'Rim light',
          x: 80,
          y: -150,
          rotation: 120,
          color: '#E0F2F1',
          lightType: 'spot',
          intensity: 90,
          beamAngle: 30,
          colorTemperature: 6500,
        } as Partial<PhotoElement>,
        {
          type: 'prop',
          name: 'Grey backdrop',
          x: 0,
          y: -100,
          rotation: 0,
          color: '#555555',
          propType: 'backdrop',
          customSvgPath: 'backdrop',
          width: 350,
          height: 20,
        } as Partial<PhotoElement>,
      ],
    }
  }

  if (/ski|sci\b|neve|snow|outdoor|esterno/.test(p)) {
    return {
      source: 'offline',
      elements: [
        {
          type: 'person',
          name: 'Photographer (slope side)',
          x: -200,
          y: 100,
          rotation: 45,
          color: '#3b82f6',
          role: 'Photographer',
        } as Partial<PhotoElement>,
        {
          type: 'person',
          name: 'Skier',
          x: 0,
          y: -100,
          rotation: 180,
          color: '#ef4444',
          role: 'Actor',
        } as Partial<PhotoElement>,
        cameraA,
        {
          type: 'camera',
          name: 'Camera B (drone)',
          x: 150,
          y: -150,
          rotation: 135,
          color: '#10b981',
          cameraNumber: 'B',
          focalLength: 24,
          fov: 84,
          targetDistance: 400,
          shotType: 'Wide',
          sensor: 'Full Frame',
        } as Partial<PhotoElement>,
        {
          type: 'light',
          name: 'Sunlight',
          x: -400,
          y: -300,
          rotation: 45,
          color: '#FFFDE7',
          lightType: 'spot',
          intensity: 100,
          beamAngle: 20,
          colorTemperature: 5500,
        } as Partial<PhotoElement>,
        {
          type: 'prop',
          name: 'Ski slope',
          x: 0,
          y: 0,
          rotation: 0,
          color: '#ffffff',
          propType: 'cyclorama',
          customSvgPath: 'cyclorama',
          width: 500,
          height: 150,
        } as Partial<PhotoElement>,
      ],
    }
  }

  // generic interview / movie-set layout
  return {
    source: 'offline',
    elements: [
      actor,
      cameraA,
      {
        type: 'light',
        name: 'Key light',
        x: -150,
        y: 150,
        rotation: 315,
        color: '#FFE0B2',
        lightType: 'led_panel',
        intensity: 75,
        beamAngle: 70,
        colorTemperature: 4500,
      } as Partial<PhotoElement>,
      {
        type: 'light',
        name: 'Fill light',
        x: 150,
        y: 150,
        rotation: 225,
        color: '#E0F7FA',
        lightType: 'fresnel',
        intensity: 35,
        beamAngle: 80,
        colorTemperature: 5000,
      } as Partial<PhotoElement>,
    ],
  }
}

/**
 * Generate a set layout for the prompt: Gemini when a key is configured,
 * offline templates otherwise. Gemini errors bubble up so the panel can
 * surface them (and offer the offline layout as a retry).
 */
export async function generateSetLayout(
  prompt: string,
  opts: { forceOffline?: boolean } = {},
): Promise<PhotoAiResult> {
  const key = getPhotoAiKey()
  if (!key || opts.forceOffline) return generateOffline(prompt)
  return generateWithGemini(prompt, key)
}
