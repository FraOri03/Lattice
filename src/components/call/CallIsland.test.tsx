import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

/**
 * Undocking the call. The promise being tested is the one the browser's
 * picture-in-picture never made: the call becomes a window the user places and
 * sizes themselves, with a pointer OR with the keyboard (WCAG 2.5.7), and it
 * can always go back to its corner.
 *
 * LiveKit is mocked entirely, so this runs offline with no credentials.
 */

vi.mock('livekit-client', () => ({
  Track: { Source: { Camera: 'camera', ScreenShare: 'screen_share' } },
}))

vi.mock('@livekit/components-react', () => ({
  RoomAudioRenderer: () => null,
  VideoTrack: () => null,
  useParticipants: () => [{ identity: 'ada', name: 'Ada', isSpeaking: false }],
  useTracks: () => [],
  useMediaDeviceSelect: () => ({
    devices: [],
    activeDeviceId: '',
    setActiveMediaDevice: vi.fn(),
  }),
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

vi.mock('@/lib/a11y/announcer', () => ({ announce: vi.fn() }))

import { CallIsland } from './CallIsland'
import { DEFAULT_CALL_H, DEFAULT_CALL_W, useCallUiStore } from '@/store/callUiStore'

/** jsdom has no PointerEvent; a MouseEvent of the same type carries clientX. */
const pointer = (type: string, x: number, y: number) =>
  new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y })

const undock = () => {
  render(<CallIsland />)
  fireEvent.click(screen.getByRole('button', { name: /undock the call/i }))
  return screen.getByRole('region', { name: /project call window/i })
}

const geometry = (el: HTMLElement) => ({
  x: Number.parseInt(el.style.left, 10),
  y: Number.parseInt(el.style.top, 10),
  w: Number.parseInt(el.style.width, 10),
  h: Number.parseInt(el.style.height, 10),
})

beforeEach(() =>
  useCallUiStore.setState({
    expanded: false,
    mode: 'docked',
    rect: { x: 0, y: 0, w: DEFAULT_CALL_W, h: DEFAULT_CALL_H },
  }),
)

describe('the docked island', () => {
  it('offers undocking without a right-click or a browser menu', () => {
    render(<CallIsland />)
    expect(screen.getByRole('region', { name: 'Project call' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /undock the call into a window/i }),
    ).toBeInTheDocument()
  })
})

describe('the free call window', () => {
  it('opens with a drag bar and a resize grip', () => {
    const win = undock()
    expect(geometry(win)).toEqual({ x: 0, y: 0, w: DEFAULT_CALL_W, h: DEFAULT_CALL_H })
    expect(screen.getByRole('button', { name: /move the call window/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /resize the call window/i })).toBeInTheDocument()
    // the corner island is gone: one call, one place
    expect(screen.queryByRole('region', { name: 'Project call' })).toBeNull()
  })

  it('follows the pointer when its bar is dragged', () => {
    const win = undock()
    const grip = screen.getByRole('button', { name: /move the call window/i })

    fireEvent(grip, pointer('pointerdown', 100, 100))
    fireEvent(window, pointer('pointermove', 140, 160))
    fireEvent(window, pointer('pointerup', 140, 160))

    expect(geometry(win)).toMatchObject({ x: 40, y: 60 })
  })

  it('resizes from the corner grip', () => {
    const win = undock()
    const grip = screen.getByRole('button', { name: /resize the call window/i })

    fireEvent(grip, pointer('pointerdown', 0, 0))
    fireEvent(window, pointer('pointermove', 120, 90))
    fireEvent(window, pointer('pointerup', 120, 90))

    expect(geometry(win)).toMatchObject({
      x: 0,
      y: 0,
      w: DEFAULT_CALL_W + 120,
      h: DEFAULT_CALL_H + 90,
    })
  })

  it('moves and resizes from the keyboard too', () => {
    const win = undock()

    fireEvent.keyDown(screen.getByRole('button', { name: /move the call window/i }), {
      key: 'ArrowRight',
    })
    expect(geometry(win).x).toBe(24)

    // Shift is the fine-grained step, not a different gesture
    fireEvent.keyDown(screen.getByRole('button', { name: /move the call window/i }), {
      key: 'ArrowDown',
      shiftKey: true,
    })
    expect(geometry(win).y).toBe(6)

    fireEvent.keyDown(screen.getByRole('button', { name: /resize the call window/i }), {
      key: 'ArrowDown',
    })
    expect(geometry(win).h).toBe(DEFAULT_CALL_H + 24)
  })

  it('stays on screen however far it is dragged', () => {
    const win = undock()
    const grip = screen.getByRole('button', { name: /move the call window/i })

    fireEvent(grip, pointer('pointerdown', 100, 100))
    fireEvent(window, pointer('pointermove', -9000, -9000))
    fireEvent(window, pointer('pointerup', -9000, -9000))
    expect(geometry(win)).toMatchObject({ x: 0, y: 0 })

    fireEvent(grip, pointer('pointerdown', 0, 0))
    fireEvent(window, pointer('pointermove', 9000, 9000))
    fireEvent(window, pointer('pointerup', 9000, 9000))
    const far = geometry(win)
    expect(far.x + far.w).toBe(window.innerWidth)
    expect(far.y + far.h).toBe(window.innerHeight)
  })

  it('docks back to the corner, keeping where it was', () => {
    render(<CallIsland />)
    fireEvent.click(screen.getByRole('button', { name: /undock the call/i }))
    fireEvent.keyDown(screen.getByRole('button', { name: /move the call window/i }), {
      key: 'ArrowRight',
    })

    fireEvent.click(screen.getByRole('button', { name: /dock the call back/i }))
    expect(screen.getByRole('region', { name: 'Project call' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /project call window/i })).toBeNull()
    expect(useCallUiStore.getState().rect.x).toBe(24)
  })
})
