import { useI18n } from '@/lib/i18n'
import type { Destination } from '@/lib/dashboard/destinations'

/**
 * What a destination shows before its own surface is built (15.1).
 *
 * Deliberately **not** an empty state. 13.3 is explicit that "nothing here" over
 * a source that cannot answer is a false negative — the user reads it as *no one
 * has shared anything with me* when the truth is *Lattice cannot look*. So this
 * says what the destination is for and that it is not built, and asserts nothing
 * about whether it would hold anything.
 *
 * It is a seam, and the two issues that close it are named: #77 wires Recents
 * and Starred from state the store already keeps, and #80 replaces this with the
 * *unavailable* state — the reason each server-backed section cannot answer yet,
 * in the register the realtime chip and the local-vault banner already use.
 */
export function DestinationPlaceholder({ destination }: { destination: Destination }) {
  const t = useI18n().destinations

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <h1 className="text-[19px] font-bold tracking-tight">{t.title[destination]}</h1>
      <p className="mt-1 text-[11.5px] text-muted">{t.description[destination]}</p>
      <div className="mt-6 rounded-xl border border-dashed border-bord p-8 text-center">
        <p className="text-[11.5px] text-muted">{t.notBuilt}</p>
      </div>
    </div>
  )
}
