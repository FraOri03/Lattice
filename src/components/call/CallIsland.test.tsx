import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useCallUiStore } from '@/store/callUiStore'

/**
 * The island's size controls: the call can be enlarged on demand (and a
 * specific webcam picked), while `bar` stays the default so the workspace is
 * never taken over by a conference view.
 *
 * LiveKit is mocked, so this runs offline with no credentials.
 */

const participants = [
  { identity: 'ada@example.com', name: 'Ada', isSpeaking: false, isMicrophoneEnabled: true },
  { identity: 'sam@example.com', name: 'Sam', isSpeaking: false, isMicrophoneEnabled: true },
]

const track = (identity: string, source: string) => ({
  participant: participants.find((p) => p.identity === identity),
  source,
  publication: { track: {}, isMuted: false },
})

let tracks: unknown[] = []

vi.mock('@livekit/components-react', () => ({
  RoomAudioRenderer: () => null,
  useParticipants: () => participants,
  useTracks: () => tracks,
  VideoTrack: () => null,
  useMediaDeviceSelect: () => ({ devices: [], activeDeviceId: '', setActiveMediaDevice: vi.fn() }),
}))

vi.mock('livekit-client', () => ({
  Track: { Source: { Camera: 'camera', ScreenShare: 'screen_share' } },
}))

vi.mock('./CallProvider', () => ({
  useCall: () => ({
    status: 'connected',
    capabilities: { join: true, audio: true, video: true, screenShare: true, moderate: false },
    micOn: false,
    cameraOn: false,
    screenOn: false,
    toggleMic: vi.fn(),
    toggleCamera: vi.fn(),
    toggleScreenShare: vi.fn(),
    leave: vi.fn(),
  }),
}))

import { CallIsland } from './CallIsland'

const enlarge = () => screen.getByRole('button', { name: /enlarge the call/i })
const shrink = () => screen.getByRole('button', { name: /shrink the call/i })
const expand = () => screen.getByRole('button', { name: /expand the call panel/i })

beforeEach(() => {
  useCallUiStore.setState({ size: 'bar', focusedIdentity: null })
  tracks = [track('ada@example.com', 'camera'), track('sam@example.com', 'camera')]
})

describe('CallIsland size controls', () => {
  it('starts compact — never a conference view by default', () => {
    render(<CallIsland />)
    expect(useCallUiStore.getState().size).toBe('bar')
    expect(screen.queryByRole('list', { name: /call participants/i })).toBeNull()
  })

  it('expands to the filmstrip', () => {
    render(<CallIsland />)
    fireEvent.click(expand())
    expect(useCallUiStore.getState().size).toBe('panel')
    expect(screen.getByRole('list', { name: /call participants/i })).toBeInTheDocument()
  })

  it('enlarges the call and shrinks back', () => {
    render(<CallIsland />)
    fireEvent.click(enlarge())
    expect(useCallUiStore.getState().size).toBe('stage')
    // the same control now offers the way back
    expect(screen.queryByRole('button', { name: /enlarge the call/i })).toBeNull()
    fireEvent.click(shrink())
    expect(useCallUiStore.getState().size).toBe('panel')
  })

  it('exposes the enlarge toggle as a pressed-state button', () => {
    render(<CallIsland />)
    expect(enlarge()).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(enlarge())
    expect(shrink()).toHaveAttribute('aria-pressed', 'true')
  })

  it('lets a specific webcam be enlarged from the strip', () => {
    useCallUiStore.setState({ size: 'stage' })
    render(<CallIsland />)
    const pick = screen.getByRole('button', { name: /enlarge sam/i })
    fireEvent.click(pick)
    expect(useCallUiStore.getState().focusedIdentity).toBe('sam@example.com')
  })

  it('does not offer per-tile enlarging until the stage is open', () => {
    useCallUiStore.setState({ size: 'panel' })
    render(<CallIsland />)
    expect(screen.queryByRole('button', { name: /enlarge sam/i })).toBeNull()
  })
})
