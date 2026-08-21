import { createRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { useSyncStore } from '@/lib/sync/syncStore'
import { syncQueue, useSyncQueue } from '@/lib/sync/syncQueue'
import { SyncQueuePanel } from './SyncQueuePanel'

/**
 * The overlay behind the sync chip.
 *
 * The point of these is the reading, not the markup: a row shows a percentage
 * when a transfer measured one and shows something else — never a number —
 * when it did not. That distinction is the whole reason the panel exists, so
 * it is the thing worth locking down.
 *
 * The engine is mocked because importing it for real pulls in the whole Drive
 * client, the vault and the auth service; the panel only ever calls
 * `syncNow()` on it.
 */

vi.mock('@/lib/sync/SyncEngine', () => ({
  syncEngine: { syncNow: vi.fn() },
}))

function open() {
  // AnchoredPopover measures the trigger, so the anchor has to be in the DOM
  const anchor = document.createElement('button')
  document.body.appendChild(anchor)
  const ref = createRef<HTMLElement>() as { current: HTMLElement | null }
  ref.current = anchor
  return render(<SyncQueuePanel anchorRef={ref} open onClose={() => {}} />)
}

const rowFor = (label: string) => screen.getByText(label).closest('li') as HTMLElement

beforeEach(() => {
  useSyncQueue.setState({ jobs: [], runStartedAt: null, runEndedAt: null })
  useSyncStore.setState({
    provider: 'google-drive',
    status: 'syncing',
    lastSyncAt: null,
    pendingChanges: 0,
    conflicts: [],
    error: null,
    driveUsage: null,
  })
})

describe('SyncQueuePanel', () => {
  it('lists one row per file, with the percentage the transfer measured', () => {
    syncQueue.add({
      key: 'upload:asset:a1',
      kind: 'asset',
      direction: 'upload',
      label: 'holiday.mp4',
      file: 'a1.mp4',
      total: 4_000_000,
    })
    syncQueue.add({
      key: 'download:doc:d1',
      kind: 'doc',
      direction: 'download',
      label: 'Research notes',
      file: 'd1.json',
    })
    syncQueue.start('upload:asset:a1')
    syncQueue.track('upload:asset:a1')(1_000_000, 4_000_000)

    open()

    expect(within(rowFor('holiday.mp4')).getByText('25%')).toBeInTheDocument()
    expect(
      within(rowFor('holiday.mp4')).getByRole('progressbar', { name: /holiday\.mp4/ }),
    ).toHaveAttribute('aria-valuenow', '25')
    // queued, not started: no percentage is claimed for it
    expect(within(rowFor('Research notes')).getByText('Queued')).toBeInTheDocument()
    // the headline counts FINISHED files — neither of these is — while the
    // run's own bar carries the quarter of one file that has actually moved
    expect(screen.getByText('0 of 2 files')).toBeInTheDocument()
    expect(screen.getByText('13%')).toBeInTheDocument()
  })

  it('leaves an unmeasurable transfer without a number', () => {
    syncQueue.add({
      key: 'upload:doc:d1',
      kind: 'doc',
      direction: 'upload',
      label: 'Draft',
      file: 'd1.json',
    })
    syncQueue.start('upload:doc:d1')

    open()

    const row = rowFor('Draft')
    expect(within(row).getByText('Transferring')).toBeInTheDocument()
    expect(within(row).getByText('size unknown')).toBeInTheDocument()
    expect(within(row).getByRole('progressbar')).not.toHaveAttribute('aria-valuenow')
    expect(within(row).queryByText(/%$/)).not.toBeInTheDocument()
  })

  it('says why a file moved no bytes, and what Drive said when one failed', () => {
    syncQueue.add({
      key: 'upload:sheet:s1',
      kind: 'sheet',
      direction: 'upload',
      label: 'Budget',
      file: 's1.json',
    })
    syncQueue.add({
      key: 'upload:code:c1',
      kind: 'code',
      direction: 'upload',
      label: 'main.ts',
      file: 'c1.ts',
    })
    syncQueue.skip('upload:sheet:s1', 'no-local-copy')
    syncQueue.start('upload:code:c1')
    syncQueue.fail('upload:code:c1', 'Google Drive rate limit reached')

    open()

    expect(within(rowFor('Budget')).getByText('not stored on this device')).toBeInTheDocument()
    expect(
      within(rowFor('main.ts')).getByText('Google Drive rate limit reached'),
    ).toBeInTheDocument()
    expect(screen.getByText('1 failed')).toBeInTheDocument()
  })

  it('offers a sync and says what is waiting when the queue is empty', () => {
    useSyncStore.setState({ status: 'idle', pendingChanges: 3 })

    open()

    expect(screen.getByText('Nothing is being transferred.')).toBeInTheDocument()
    expect(screen.getByText('3 changes waiting to be sent')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeEnabled()
  })

  it('does not offer a second sync while one is running', () => {
    open()
    expect(screen.getByRole('button', { name: /Syncing/ })).toBeDisabled()
  })
})
