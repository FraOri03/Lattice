/**
 * The one creation list (13.4 §6, built in 15.3).
 *
 * "One list, two places": the New menu and the palette's Create section render
 * from this, in this order, so the two can never offer different things or the
 * same things in a different order.
 *
 * `project` is last and is the only member that does not need a target — every
 * other kind files into a project, which is what makes the target question
 * unavoidable on a surface where no project is open.
 */

export type CreateKind = 'board' | 'doc' | 'note' | 'sheet' | 'present' | 'code' | 'project'

export const CREATE_KINDS = [
  'project',
  'board',
  'doc',
  'note',
  'sheet',
  'present',
  'code',
] as const satisfies readonly CreateKind[]

/** Everything except `project` needs somewhere to be created. */
export type TargetedCreateKind = Exclude<CreateKind, 'project'>

export function needsTarget(kind: CreateKind): kind is TargetedCreateKind {
  return kind !== 'project'
}
