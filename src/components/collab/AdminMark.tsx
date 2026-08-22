import type { ReactNode } from 'react'
import { IcShield } from '@/components/Icons'
import { can } from '@/lib/collab/permissions'
import type { CollabRole } from '@/types/collab'

/**
 * AdminMark — the ring and corner shield that say "this person administers
 * the project you are looking at".
 *
 * ## What it is a mark OF, precisely
 *
 * There is no such thing as a Lattice-wide administrator, and this does not
 * invent one. `admin` is a **project role**: it lives in one row of
 * `project_memberships` (Supabase) and in one slot of the room ACL, and the
 * same person is an admin of one project and a viewer of the next. So the
 * mark is scoped the way the grant is — it appears on avatars shown inside a
 * project, and it means *here*.
 *
 * Owners carry it too. From the outside "who can take my access away" is one
 * question, not two, and an owner is the person who can do it most: a mark
 * that skipped them would leave the most privileged avatar in the room the
 * only unmarked one. Which of the two somebody is stays readable where it
 * matters — the role pill in the share dialog, the tooltip here.
 *
 * `VITE_ADDRESS_ALIASES` has nothing to do with any of this. An alias
 * renames an address on screen and grants exactly nothing; see
 * `lib/auth/addressAlias`.
 *
 * ## Why a ring and not just a badge
 *
 * At 24px a corner badge is a smudge unless you already know to look for it.
 * The ring is what carries at a glance — the avatar reads as marked from
 * across the bar — and the shield is what says which mark it is once you are
 * looking. Neither carries meaning alone: the tooltip is on the wrapper, so
 * the fact survives for anybody who cannot see either.
 */

/** Whether this role gets the mark. Capability-derived, not a hardcoded pair. */
export function marksAsAdmin(role: CollabRole | undefined | null): boolean {
  return !!role && can(role, 'members.manage')
}

/**
 * Wraps an avatar with the mark.
 *
 * The child is rendered untouched — this owns the ring, the badge and the
 * accessible name, and never the avatar itself, so every avatar in the app
 * keeps its own size and border rules.
 *
 * @param size the avatar's edge in px, which is what the badge is scaled
 *             from — a fixed badge is either invisible at 24 or a sticker at 40
 */
export function AdminMark({
  role,
  size,
  label,
  children,
}: {
  role: CollabRole | undefined | null
  size: number
  /** The tooltip, already localised by the caller. */
  label: string
  children: ReactNode
}) {
  if (!marksAsAdmin(role)) return <>{children}</>
  const badge = Math.max(10, Math.round(size * 0.42))
  const glyph = Math.max(6, Math.round(badge * 0.62))
  return (
    <span className="relative flex flex-none" title={label}>
      <span
        className="flex rounded-full"
        style={{ boxShadow: '0 0 0 1.5px var(--accent)' }}
      >
        {children}
      </span>
      <span
        aria-hidden
        className="absolute right-0 bottom-0 flex translate-x-[15%] translate-y-[15%] items-center justify-center rounded-full text-white"
        style={{
          width: badge,
          height: badge,
          background: 'var(--accent)',
          // the badge sits ON the avatar, so it needs the page behind it to
          // read as a separate object rather than a stain on the photo
          boxShadow: '0 0 0 1.5px var(--panel)',
        }}
      >
        <IcShield size={glyph} />
      </span>
      <span className="sr-only">{label}</span>
    </span>
  )
}
