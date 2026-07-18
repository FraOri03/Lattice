import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { MediaUnavailableReason } from '@/lib/media/mediaClient'

const call = {
  status: 'idle' as 'idle' | 'connecting' | 'connected' | 'error',
  unavailable: null as MediaUnavailableReason,
  unavailableMessage: '',
  error: null as string | null,
  join: vi.fn(),
}

vi.mock('./CallProvider', () => ({ useCall: () => call }))

import { JoinCallButton } from './JoinCallButton'

describe('JoinCallButton', () => {
  it('offers an accessible way to join', () => {
    call.status = 'idle'
    call.unavailable = null
    call.unavailableMessage = ''
    render(<JoinCallButton />)
    const btn = screen.getByRole('button', { name: /join the project call/i })
    expect(btn).toBeEnabled()
    // the label makes clear devices stay off
    expect(btn).toHaveAttribute('title', expect.stringMatching(/stay off/i))
  })

  it('is disabled and explains itself when calls are not configured', () => {
    call.status = 'idle'
    call.unavailable = 'not-configured'
    call.unavailableMessage = 'Project calls are not configured for this deployment.'
    render(<JoinCallButton />)
    const btn = screen.getByRole('button', { name: /unavailable/i })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('title', call.unavailableMessage)
  })

  it('distinguishes being in the call from being present in the project', () => {
    call.status = 'connected'
    render(<JoinCallButton />)
    // no "join" affordance while connected; the island owns the controls
    expect(screen.queryByRole('button', { name: /join/i })).toBeNull()
    expect(screen.getByTitle(/you are in the project call/i)).toBeInTheDocument()
  })
})
