import type { PhotoElement } from '@/types/photo'
import { AiJobError, type AiBackendProvider } from '../AiBackendProvider.js'
import { immediateJob } from '../immediateJob.js'
import { AI_ACTIONS } from '../actions.js'

/**
 * `design-set`, run on this device, from templates.
 *
 * Ported from the standalone tool's server fallback and kept for the reason
 * it was written: the feature has to produce a usable set with no key, no
 * account and no network. It is the only provider in the seam that is
 * genuinely `local` today — 21.6's ComfyUI will be the second — and it is
 * what makes "AI is unavailable" a state Photo mode never has to show.
 *
 * Keyword-matched, and matched in both languages, because the prompts users
 * actually type here are Italian as often as English.
 */

const actor: Partial<PhotoElement> = {
  type: 'person',
  name: 'Main subject',
  x: 0,
  y: 0,
  rotation: 90,
  color: '#a855f7',
  role: 'Actor',
  pose: 'standing',
}

const cameraA: Partial<PhotoElement> = {
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
}

const PORTRAIT: Partial<PhotoElement>[] = [
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
  },
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
  },
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
  },
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
  },
]

const OUTDOOR: Partial<PhotoElement>[] = [
  {
    type: 'person',
    name: 'Photographer (slope side)',
    x: -200,
    y: 100,
    rotation: 45,
    color: '#3b82f6',
    role: 'Photographer',
  },
  {
    type: 'person',
    name: 'Skier',
    x: 0,
    y: -100,
    rotation: 180,
    color: '#ef4444',
    role: 'Actor',
  },
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
  },
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
  },
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
  },
]

const INTERVIEW: Partial<PhotoElement>[] = [
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
  },
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
  },
]

/** The template a prompt lands on. Exported so the choice can be tested. */
export function offlineSetTemplate(prompt: string): Partial<PhotoElement>[] {
  const p = prompt.toLowerCase()
  if (/beauty|ritratto|portrait|headshot/.test(p)) return PORTRAIT
  if (/ski|sci\b|neve|snow|outdoor|esterno/.test(p)) return OUTDOOR
  return INTERVIEW
}

export const OfflineSetDesignProvider: AiBackendProvider = {
  id: 'local',
  label: 'Offline set templates',
  requiresUpload: false,
  disclosure: { destination: 'device', cost: 'free' },

  canRun: (action) => action === 'design-set',

  // Always, and without asking anyone: templates cannot be withdrawn by a
  // server, a key or a rate limit.
  capabilities: async () => ({ configured: true, actions: ['design-set'] }),

  submit: async (req, opts = {}) => {
    if (req.actionId !== 'design-set') {
      throw new AiJobError(
        'invalid-parameters',
        `The offline set designer does not run ${req.actionId}.`,
      )
    }
    const prompt = typeof req.params.prompt === 'string' ? req.params.prompt : ''
    const jobId = `offline-${Date.now().toString(36)}`
    return immediateJob({
      jobId,
      actionId: 'design-set',
      deadlineMs: AI_ACTIONS['design-set'].deadlineMs,
      opts,
      run: async () => ({
        jobId,
        actionId: 'design-set',
        outputs: [{ kind: 'scene', value: offlineSetTemplate(prompt) }],
        durationMs: 0,
      }),
    })
  },
}
