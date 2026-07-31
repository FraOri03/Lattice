import type { PhotoShot } from '@/types/photo'

/**
 * Ordering and selection rules for the shots of a Photo-mode scene.
 *
 * Two facts drive this module. A shot's `number` is POSITIONAL — it is the
 * shot's place in the sequence, not an identity — so anything that changes
 * the order has to renumber. And a board card may either follow whatever
 * the editor has open or pin one specific shot; pinning is what makes a
 * card a stable view instead of a mirror of the editor's cursor.
 *
 * Pure functions only — the store actions and components that call them
 * live in photoStore, PhotoTimeline, PhotoCardNode and the Inspector.
 */

/** Renumber shots 1..n to match their position. */
export function renumberShots(shots: PhotoShot[]): PhotoShot[] {
  return shots.map((shot, index) =>
    shot.number === index + 1 ? shot : { ...shot, number: index + 1 },
  )
}

/**
 * Move a shot `delta` places along the sequence, renumbering the result.
 *
 * Returns the SAME array when the move can't happen (unknown shot, already
 * at the end it's being pushed against, delta of zero), so callers can skip
 * an undo entry for a no-op by comparing references.
 */
export function moveShot(shots: PhotoShot[], shotId: string, delta: number): PhotoShot[] {
  if (!delta) return shots
  const from = shots.findIndex((shot) => shot.id === shotId)
  if (from < 0) return shots
  const to = from + delta
  if (to < 0 || to >= shots.length) return shots

  const next = [...shots]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return renumberShots(next)
}

/**
 * What a board card should draw.
 *
 * `missing` exists on purpose: when a card pins a shot that has since been
 * deleted, falling back to another shot would quietly show the wrong set.
 * The card says so instead.
 */
export type PhotoCardShot =
  | { kind: 'empty' }
  | { kind: 'missing' }
  | { kind: 'active'; shot: PhotoShot }
  | { kind: 'pinned'; shot: PhotoShot }

/** Resolve which shot a card renders, given its optional pinned shot id. */
export function resolveCardShot(
  shots: PhotoShot[],
  activeShotId: string | null | undefined,
  pinnedShotId: string | undefined,
): PhotoCardShot {
  if (!shots.length) return { kind: 'empty' }
  if (pinnedShotId) {
    const pinned = shots.find((shot) => shot.id === pinnedShotId)
    return pinned ? { kind: 'pinned', shot: pinned } : { kind: 'missing' }
  }
  const shot = shots.find((shot) => shot.id === activeShotId) ?? shots[0]
  return { kind: 'active', shot }
}
