/**
 * Which state a section is in (13.2 §5, decided here for 15.4).
 *
 * 13.2 settles five states and 13.3 adds a sixth, and the difference between
 * two of them is the whole point of the phase:
 *
 * - **empty** means *there is nothing, and we looked*.
 * - **no-results** means *there is something, your filter excludes it*.
 * - **unavailable** means *we cannot look* — and it is the one an empty list
 *   must never be mistaken for. "Nothing shared with you" over a surface with
 *   no index anywhere is a false negative: the user reads it as nobody having
 *   shared anything, when the truth is that Lattice cannot know.
 *
 * Extracted as a function rather than a chain of ternaries in each destination
 * because it is the part worth asserting: 13.5 §9 names "the state chosen for a
 * given data condition" as a pure unit, and three sections choosing it
 * independently is how two of them end up disagreeing.
 */

export type SectionState =
  | 'loading'
  | 'error'
  | 'offline'
  | 'unavailable'
  | 'empty'
  | 'no-results'
  | 'content'

export interface SectionCondition {
  /** No source exists at all — outranks everything, including a filter. */
  unavailable?: boolean
  loading?: boolean
  error?: boolean
  /** The content can live outside this device and the device is offline. */
  offline?: boolean
  /** How many items the section holds before any filter is applied. */
  total: number
  /** How many survive the current filter. Defaults to `total`. */
  filtered?: number
}

/**
 * The order is the contract.
 *
 * `unavailable` comes first because it is a statement about the *source*, and a
 * section with no source cannot be loading, empty or filtered — offering any of
 * those would describe a lookup that never happened. Failure states come next,
 * because a section that could not read its data does not know whether it is
 * empty. Only then does the count decide anything.
 */
export function sectionState(c: SectionCondition): SectionState {
  if (c.unavailable) return 'unavailable'
  if (c.loading) return 'loading'
  if (c.error) return 'error'
  if (c.offline) return 'offline'
  if (c.total === 0) return 'empty'
  const filtered = c.filtered ?? c.total
  if (filtered === 0) return 'no-results'
  return 'content'
}

/** Whether the state replaces the section's content rather than sitting in it. */
export function replacesContent(state: SectionState): boolean {
  return state !== 'content'
}
