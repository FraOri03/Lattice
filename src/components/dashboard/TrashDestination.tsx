import { useI18n } from '@/lib/i18n'
import { SectionStateBlock } from './SectionStateBlock'

/**
 * Trash (13.3, 13.5 §3) — unavailable, and the odd one out.
 *
 * The other two server-backed sections are missing an *index*. This one is
 * missing a *model*: `deleteProject` removes the project's entities from the
 * store and calls `storage.deleteDocument` on each, and nothing anywhere
 * records that a deletion happened, when, or by whom.
 *
 * So "Trash is empty" would be a false negative of the worst kind — it would
 * describe a recovery path that does not exist over data that is already gone.
 * The page says the model is missing and points at #115, which is where the
 * decision lives. Note this needs no server at all: soft delete is local, and
 * it is what makes the designed page possible in the first place.
 */
export function TrashDestination() {
  const t = useI18n()

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <h1 className="text-[19px] font-bold tracking-tight">{t.destinations.title.trash}</h1>
      <p className="mt-1 text-[11.5px] text-muted">{t.destinations.description.trash}</p>
      <SectionStateBlock
        state="unavailable"
        what={t.destinations.title.trash}
        body={t.honest.trash.why}
      />
    </div>
  )
}
