import * as Y from 'yjs'
import { MIGRATION_ORIGIN, type ProjectRoom } from './ProjectRoom'

/**
 * CodeCRDT — code documents as Y.Text inside the project's content doc
 * (codeDocuments: Y.Map, codeId → Y.Text).
 *
 * Same migration contract as DocumentCRDT: the plain-string body stays
 * the durable representation (IndexedDB + Drive via persistCodeContent),
 * the Y.Text is seeded from it once, marker-guarded, and the original is
 * never discarded here. Unlike rich documents no schema is needed, so
 * seeding happens directly with the stored string.
 */

const marker = (codeId: string) => `mig:code:${codeId}`

/** The code file's shared text, created on first access. */
export function codeText(room: ProjectRoom, codeId: string): Y.Text {
  const map = room.codeDocuments()
  let text = map.get(codeId)
  if (!text) {
    text = new Y.Text()
    const fresh = text
    room.transactContent(() => map.set(codeId, fresh))
  }
  return text
}

/** True when the Y.Text still needs to be seeded from the stored source. */
export function codeNeedsSeed(room: ProjectRoom, codeId: string): boolean {
  if (room.projectMetadata().get(marker(codeId))) return false
  return codeText(room, codeId).length === 0
}

/** Seed the shared text from the stored source, once, marker-guarded. */
export function seedCode(room: ProjectRoom, codeId: string, source: string): boolean {
  if (!codeNeedsSeed(room, codeId)) return false
  const text = codeText(room, codeId)
  let seeded = false
  room.content.transact(() => {
    if (text.length === 0 && source.length > 0) {
      text.insert(0, source)
      seeded = true
    }
    room.projectMetadata().set(marker(codeId), Date.now())
  }, MIGRATION_ORIGIN)
  return seeded
}

/** Forget a deleted code file's CRDT state (text + marker). */
export function deleteCodeCRDT(room: ProjectRoom, codeId: string): void {
  room.transactContent(() => {
    room.codeDocuments().delete(codeId)
    room.projectMetadata().delete(marker(codeId))
  })
}
