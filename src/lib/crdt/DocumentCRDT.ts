import * as Y from 'yjs'
import { MIGRATION_ORIGIN, type ProjectRoom } from './ProjectRoom'

/**
 * DocumentCRDT — rich documents as Y.XmlFragments inside the project's
 * content doc (documents: Y.Map, docId → Y.XmlFragment).
 *
 * Migration contract (existing Tiptap JSON bodies → CRDT):
 *  1. The stored JSON body remains the durable representation — it keeps
 *     flowing to IndexedDB and Google Drive through persistDocContent,
 *     now derived from CRDT state on every save.
 *  2. A fragment is seeded from the stored body exactly once, at first
 *     editor open, guarded by a migration marker — and only while the
 *     fragment is still empty. The original body is never deleted here.
 *  3. Seeding needs the editor's ProseMirror schema, so the editor
 *     supplies the seed function (prosemirrorJSONToYXmlFragment).
 */

const marker = (docId: string) => `mig:doc:${docId}`

/** The document's shared fragment, created on first access. */
export function documentFragment(room: ProjectRoom, docId: string): Y.XmlFragment {
  const map = room.documents()
  let fragment = map.get(docId)
  if (!fragment) {
    fragment = new Y.XmlFragment()
    const fresh = fragment
    room.transactContent(() => map.set(docId, fresh))
  }
  return fragment
}

/** True when the fragment still needs to be seeded from the stored body. */
export function documentNeedsSeed(room: ProjectRoom, docId: string): boolean {
  if (room.projectMetadata().get(marker(docId))) return false
  return documentFragment(room, docId).length === 0
}

/**
 * Seed the fragment from the legacy body via the editor-provided function
 * and mark the migration, atomically. No-op if another session already
 * migrated (marker set) or content already exists.
 */
export function seedDocument(
  room: ProjectRoom,
  docId: string,
  seed: (fragment: Y.XmlFragment) => void,
): boolean {
  if (!documentNeedsSeed(room, docId)) return false
  const fragment = documentFragment(room, docId)
  let seeded = false
  room.content.transact(() => {
    if (fragment.length === 0) {
      seed(fragment)
      seeded = true
    }
    room.projectMetadata().set(marker(docId), Date.now())
  }, MIGRATION_ORIGIN)
  return seeded
}

/** Forget a deleted document's CRDT state (fragment + marker). */
export function deleteDocumentCRDT(room: ProjectRoom, docId: string): void {
  room.transactContent(() => {
    room.documents().delete(docId)
    room.projectMetadata().delete(marker(docId))
  })
}
