import type { ReactNode } from 'react'
import { useCollabStore } from '@/lib/collab/collabStore'
import { FileKindIcon, type FileKind } from '@/lib/registry/fileKinds'
import { IcMessage } from '@/components/Icons'

/**
 * What a section shows instead of an editor that cannot work at this width
 * (Phase 12.5).
 *
 * The audit recorded the behaviour this replaces as F6, and it is the one
 * place the product contradicted its own ethos: at 390 px the document was
 * 1005 px wide, so a phone scaled the entire desktop shell to about 39% and
 * nothing warned, degraded or refused. Everywhere else Lattice is loud about
 * what it cannot do — the realtime chip, the local-vault banner, the
 * conversion reports. On a phone it quietly pretended.
 *
 * So this panel is not an error and not a paywall. It says which entity you
 * opened, what is in it, and *why* this particular editor is not here — a
 * 26-column grid, Monaco, a 960×540 stage. Then it gives you the two things
 * that do work at this size: reading what the store already knows, and
 * commenting.
 *
 * What it deliberately does not do is fake the editor. A read-only grid that
 * cannot be scrolled sideways, or a slide stage at a third of its size, would
 * be the same pretence one level down.
 */
export function DesktopOnly({
  kind,
  title,
  reason,
  stats,
  preview,
}: {
  kind: FileKind
  /** The entity you actually opened — this is not a generic screen. */
  title: string
  /** The specific constraint, named. Not "your screen is too small". */
  reason: string
  /** What the store already knows about it: cells, lines, slides. */
  stats?: string
  preview?: ReactNode
}) {
  const setPanel = useCollabStore((s) => s.setPanel)

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col items-center gap-3 overflow-y-auto bg-panel px-6 py-8 text-center">
      <span className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl border border-bord bg-panel2 text-muted">
        <FileKindIcon kind={kind} size={26} />
      </span>
      <p className="max-w-sm text-[14px] font-semibold break-words">{title}</p>
      {stats && <p className="text-[11px] text-muted">{stats}</p>}
      <p className="max-w-sm text-[12px] leading-relaxed text-muted">{reason}</p>
      <button className="btn flex-none" onClick={() => setPanel('comments')}>
        <IcMessage size={13} /> Open comments
      </button>
      {preview}
      <p className="mt-auto max-w-sm pt-4 text-[11px] leading-relaxed text-muted">
        Everything here is intact — this is the editor stepping aside, not the
        file. Open the project on a wider screen to edit it.
      </p>
    </section>
  )
}
