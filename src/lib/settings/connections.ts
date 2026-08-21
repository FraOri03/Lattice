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
       * The row is about the DEPLOYMENT's backend, which is why it can be
       * `unconfigured` while Photo mode's set designer is happily producing
       * layouts: templates run here and a key the user pasted is theirs, not
       * this build's. Saying "connected" for either would be claiming credit
       * for something this deployment neither runs nor pays for.
       */
      id: 'ai',
      state: i.hasAiBackend ? 'connected' : 'unconfigured',
      action: 'none',
      configuredBy: 'VITE_AI_BACKEND',
    },
  ]
}

/** The three answers the panel keeps apart, in the order it shows them. */
export type IdentityFact = 'identity' | 'storage' | 'sync'
