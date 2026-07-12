import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useCrdtStore } from '@/lib/crdt/crdtStore'
import { RealtimeStatusChip } from './RealtimeStatusChip'

/**
 * A11Y-2: realtime status must never be conveyed by colour alone. Each state
 * spells itself out in the accessible name and is accompanied by an icon
 * (shape), so statuses that share a colour stay distinguishable.
 */
describe('RealtimeStatusChip — status is text + shape, not colour alone', () => {
  const cases = [
    ['connected', 'Live'],
    ['unconfigured', 'Realtime off'],
    ['error', 'Realtime error'],
    ['offline', 'Offline'],
    ['unauthorized', 'No access'],
  ] as const

  it.each(cases)('state %s → accessible name + icon', (status, label) => {
    useCrdtStore.setState({ status, detail: null })
    const { unmount, container } = render(<RealtimeStatusChip />)
    expect(
      screen.getByRole('button', { name: `Realtime collaboration: ${label}` }),
    ).toBeInTheDocument()
    // the visible label text is present too (not just the colour dot)
    expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    // a shape accompanies the colour
    expect(container.querySelector('svg')).toBeTruthy()
    unmount()
  })
})
