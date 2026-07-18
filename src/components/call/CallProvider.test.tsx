import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

/**
 * The call session's two promises to the user:
 *  1. joining a call never turns a device on by itself — no camera or
 *     microphone permission is requested until an explicit action;
 *  2. when calls are not configured nothing is attempted and the UI says so.
 *
 * LiveKit is mocked entirely, so this runs offline with no credentials.
 */

const connect = vi.fn(async () => {})
const disconnect = vi.fn(async () => {})
const setMicrophoneEnabled = vi.fn(async () => {})
const setCameraEnabled = vi.fn(async () => {})
const setScreenShareEnabled = vi.fn(async () => {})

const localParticipant = {
  isMicrophoneEnabled: false,
  isCameraEnabled: false,
  isScreenShareEnabled: false,
  setMicrophoneEnabled,
  setCameraEnabled,
  setScreenShareEnabled,
}

vi.mock('livekit-client', () => ({
  Room: class {
    state = 'disconnected'
    localParticipant = localParticipant
    connect = connect
    disconnect = disconnect
    on() {
      return this
    }
    off() {
      return this
    }
  },
  RoomEvent: {
    Disconnected: 'disconnected',
    LocalTrackPublished: 'localTrackPublished',
    LocalTrackUnpublished: 'localTrackUnpublished',
    TrackMuted: 'trackMuted',
    TrackUnmuted: 'trackUnmuted',
  },
  Track: { Source: { Camera: 'camera', ScreenShare: 'screen_share' } },
}))

vi.mock('@livekit/components-react', () => ({
  RoomContext: { Provider: ({ children }: { children: React.ReactNode }) => children },
}))

vi.mock('@/lib/auth/AccountProvider', () => ({
  useAccount: () => ({ account: { email: 'ada@example.com' }, loginSkipped: false }),
}))

vi.mock('@/lib/a11y/announcer', () => ({ announce: vi.fn() }))

const fetchMediaGrant = vi.fn(async (_projectId: string) => ({
  token: 'lk_token',
  url: 'wss://example',
  room: 'lattice-project-proj_default',
  role: 'editor' as const,
  capabilities: {
    join: true,
    audio: true,
    video: true,
    screenShare: true,
    moderate: false,
  },
}))

let unavailable: 'not-configured' | 'signed-out' | null = null

vi.mock('@/lib/media/mediaClient', async () => {
  const actual = await vi.importActual<typeof import('@/lib/media/mediaClient')>(
    '@/lib/media/mediaClient',
  )
  return {
    ...actual,
    fetchMediaGrant: (projectId: string) => fetchMediaGrant(projectId),
    mediaUnavailableReason: () => unavailable,
  }
})

import { CallProvider, useCall } from './CallProvider'

function Probe() {
  const { status, join, toggleMic, unavailableMessage } = useCall()
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="reason">{unavailableMessage}</span>
      <button onClick={() => void join()}>join</button>
      <button onClick={() => void toggleMic()}>mic</button>
    </div>
  )
}

const renderCall = () =>
  render(
    <CallProvider>
      <Probe />
    </CallProvider>,
  )

beforeEach(() => {
  unavailable = null
  connect.mockClear()
  disconnect.mockClear()
  setMicrophoneEnabled.mockClear()
  setCameraEnabled.mockClear()
  setScreenShareEnabled.mockClear()
  fetchMediaGrant.mockClear()
  localParticipant.isMicrophoneEnabled = false
})

describe('joining a call', () => {
  it('connects without turning on the microphone or the camera', async () => {
    renderCall()
    fireEvent.click(screen.getByText('join'))

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('connected'))
    expect(connect).toHaveBeenCalledWith('wss://example', 'lk_token')
    // the whole point: no device is enabled, so the browser never prompts
    expect(setMicrophoneEnabled).not.toHaveBeenCalled()
    expect(setCameraEnabled).not.toHaveBeenCalled()
    expect(setScreenShareEnabled).not.toHaveBeenCalled()
  })

  it('only touches the microphone on an explicit action', async () => {
    renderCall()
    fireEvent.click(screen.getByText('join'))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('connected'))

    fireEvent.click(screen.getByText('mic'))
    await waitFor(() => expect(setMicrophoneEnabled).toHaveBeenCalledWith(true))
  })

  it('surfaces the server error instead of inventing one', async () => {
    fetchMediaGrant.mockRejectedValueOnce(new Error('Your role cannot join this project call.'))
    renderCall()
    fireEvent.click(screen.getByText('join'))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'))
    expect(connect).not.toHaveBeenCalled()
  })
})

describe('unconfigured deployment', () => {
  it('never attempts a connection and explains why', async () => {
    unavailable = 'not-configured'
    renderCall()
    expect(screen.getByTestId('reason')).toHaveTextContent(/not configured/i)

    fireEvent.click(screen.getByText('join'))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('idle'))
    expect(fetchMediaGrant).not.toHaveBeenCalled()
    expect(connect).not.toHaveBeenCalled()
  })
})
