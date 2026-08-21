import { describe, expect, it } from 'vitest'
import { deriveConnections, type ConnectionInputs, type ServiceId } from './connections'

const inputs = (patch: Partial<ConnectionInputs> = {}): ConnectionInputs => ({
  googleSignedIn: false,
  driveConnected: false,
  githubConnected: false,
  hasGoogleAuth: false,
  hasRealtimeBackend: false,
  hasMediaCalls: false,
  hasConversionBackend: false,
  hasAiBackend: false,
  ...patch,
})

const of = (id: ServiceId, patch: Partial<ConnectionInputs> = {}) =>
  deriveConnections(inputs(patch)).find((s) => s.id === id)!

describe('the unconfigured build', () => {
  it('says a service was left out rather than pretending it is off by choice', () => {
    for (const id of ['drive', 'realtime', 'livekit', 'conversion', 'ai'] as ServiceId[]) {
      const service = of(id)
      expect([id, service.state]).toEqual([id, 'unconfigured'])
      expect(service.action).toBe('none')
      expect(service.configuredBy).toBeTruthy()
    }
  })

  it('still offers GitHub, because a token works without OAuth', () => {
    expect(of('github')).toMatchObject({ state: 'available', action: 'connect' })
  })
})

describe('Drive', () => {
  it('is a choice once the build has Google', () => {
    expect(of('drive', { hasGoogleAuth: true })).toMatchObject({
      state: 'available',
      action: 'connect',
    })
  })

  it('offers the way out once connected', () => {
    expect(of('drive', { hasGoogleAuth: true, driveConnected: true })).toMatchObject({
      state: 'connected',
      action: 'disconnect',
    })
  })
})

describe('the services that need an identity', () => {
  it.each(['realtime', 'livekit'] as ServiceId[])(
    '%s is configured but blocked while nobody is signed in with Google',
    (id) => {
      const service = of(id, { hasRealtimeBackend: true, hasMediaCalls: true })
      expect(service.state).toBe('blocked')
      // and there is no button that would help: signing in is elsewhere
      expect(service.action).toBe('none')
    },
  )

  it.each(['realtime', 'livekit'] as ServiceId[])('%s connects once one is', (id) => {
    const service = of(id, {
      hasRealtimeBackend: true,
      hasMediaCalls: true,
      googleSignedIn: true,
    })
    expect(service.state).toBe('connected')
  })
})

describe('identity is not storage is not sync', () => {
  it('a Google identity alone connects nothing to Drive', () => {
    const all = deriveConnections(inputs({ hasGoogleAuth: true, googleSignedIn: true }))
    expect(all.find((s) => s.id === 'drive')!.state).toBe('available')
  })

  it('conversion answers only to its own configuration', () => {
    expect(of('conversion', { googleSignedIn: true, driveConnected: true }).state).toBe(
      'unconfigured',
    )
    expect(of('conversion', { hasConversionBackend: true }).state).toBe('connected')
  })
})

describe('AI', () => {
  /**
   * The panel is about what this BUILD talks to. Photo mode's set designer
   * runs on templates with nothing configured, and on a third-party model
   * as soon as the user pastes their own key — neither is a deployment
   * backend, and claiming "connected" for either would take credit for
   * something this deployment neither runs nor pays for.
   */
  it('reports unconfigured on a build with no AI backend', () => {
    expect(of('ai')).toMatchObject({
      state: 'unconfigured',
      action: 'none',
      configuredBy: 'VITE_AI_BACKEND',
    })
  })

  it('reports connected once a backend was selected at build time', () => {
    expect(of('ai', { hasAiBackend: true }).state).toBe('connected')
  })

  it('offers nothing to click either way', () => {
    expect(of('ai', { hasAiBackend: true }).action).toBe('none')
  })
})
