/**
 * Connected apps (Phase 14.5) — what Lattice talks to, and what each one gets.
 *
 * The distinction this panel exists to make: **identity, storage and sync are
 * three answers, not one.** Signed in with Google says who you are; a
 * connected Drive folder says where files can go; a running sync says whether
 * they are going there right now. The interface has been collapsing all three
 * into "connected with Google", which over-promises on two of them.
 *
 * Pure, so the states can be asserted for every configuration without a build:
 * three of the five services are switched on at build time, and there is no
 * other way to see what they look like unconfigured.
 */

export type ServiceId = 'drive' | 'github' | 'realtime' | 'livekit' | 'conversion' | 'ai'

/**
 * - `connected` — talking to it now.
 * - `available` — this build can, and you have not.
 * - `unconfigured` — this build cannot: it was left out at build time.
 * - `blocked` — configured, but something else it depends on is missing.
 */
export type ServiceState = 'connected' | 'available' | 'unconfigured' | 'blocked'

/** Whether the user can do anything about it from here. */
export type ServiceAction = 'connect' | 'disconnect' | 'none'

export interface ServiceStatus {
  id: ServiceId
  state: ServiceState
  action: ServiceAction
  /** the env var that decides it, for the states no click can change */
  configuredBy?: string
}

export interface ConnectionInputs {
  googleSignedIn: boolean
  driveConnected: boolean
  githubConnected: boolean
  hasGoogleAuth: boolean
  hasRealtimeBackend: boolean
  hasMediaCalls: boolean
  hasConversionBackend: boolean
  hasAiBackend: boolean
  /**
   * The user holds a key of their own for some AI vendor (21.3).
   *
   * A separate input from `hasAiBackend` because it answers a separate
   * question: one is what this BUILD was given, the other is what this
   * PERSON added. Collapsing them would make the row unable to tell the
   * difference between "AI does not work here" and "AI works here, on your
   * account, and this deployment pays nothing".
   */
  hasAiKey: boolean
}

export function deriveConnections(i: ConnectionInputs): ServiceStatus[] {
  return [
    {
      id: 'drive',
      // no Google OAuth in this build means the Drive row is not a choice
      state: !i.hasGoogleAuth
        ? 'unconfigured'
        : i.driveConnected
          ? 'connected'
          : 'available',
      action: !i.hasGoogleAuth ? 'none' : i.driveConnected ? 'disconnect' : 'connect',
      configuredBy: i.hasGoogleAuth ? undefined : 'VITE_GOOGLE_CLIENT_ID',
    },
    {
      // GitHub takes a personal access token, so it never depends on OAuth
      // being configured — it is connectable in every build
      id: 'github',
      state: i.githubConnected ? 'connected' : 'available',
      action: i.githubConnected ? 'disconnect' : 'connect',
    },
    {
      id: 'realtime',
      state: !i.hasRealtimeBackend
        ? 'unconfigured'
        : i.googleSignedIn
          ? 'connected'
          : 'blocked',
      action: 'none',
      configuredBy: 'VITE_REALTIME_BACKEND',
    },
    {
      // calls need the realtime backend too: access is authorized against the
      // project ACL that lives in its room metadata
      id: 'livekit',
      state: !i.hasMediaCalls ? 'unconfigured' : i.googleSignedIn ? 'connected' : 'blocked',
      action: 'none',
      configuredBy: 'VITE_LIVEKIT_URL',
    },
    {
      id: 'conversion',
      state: i.hasConversionBackend ? 'connected' : 'unconfigured',
      action: 'none',
      configuredBy: 'VITE_CONVERSION_API_URL',
    },
    {
      /*
       * Four answers, because AI genuinely has four states and the row was
       * previously giving two.
       *
       * `connected` stays what it always was: a backend this DEPLOYMENT runs
       * and pays for. `blocked` is that same backend with nobody signed in —
       * it authorises every job against a Google account, so a build with
       * RunPod configured and no identity cannot run anything, and saying
       * "connected" for it is the kind of green tick that produces a support
       * ticket. `available` is the case a local-first product is in most
       * often: nothing hosted here, and AI working anyway on a key the user
       * added — which this deployment neither runs nor pays for, so claiming
       * credit for it would be the same lie in the other direction.
       *
       * Templates are deliberately absent from all four. Photo mode's
       * offline set designer needs no connection at all, and a connections
       * panel that listed it would be describing the app rather than what it
       * talks to.
       */
      id: 'ai',
      state: i.hasAiBackend
        ? i.googleSignedIn
          ? 'connected'
          : 'blocked'
        : i.hasAiKey
          ? 'available'
          : 'unconfigured',
      action: 'none',
      configuredBy: 'VITE_AI_BACKEND',
    },
  ]
}

/** The three answers the panel keeps apart, in the order it shows them. */
export type IdentityFact = 'identity' | 'storage' | 'sync'
