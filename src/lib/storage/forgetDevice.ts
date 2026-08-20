import { storage } from './StorageProvider'
import { bootScope, bootSlot, keyBelongsToSlot, releaseSlot, vaultKey } from './vaultScope'

/**
 * forgetDevice — take this vault off this machine (#257).
 *
 * Namespacing keeps two accounts from reading each other's work, but it
 * never removes anything: sign out and every byte you wrote is still in
 * `localStorage` and IndexedDB, under a slot nothing on screen mentions, for
 * as long as the browser profile lives. On a shared or borrowed machine that
 * is the whole problem restated — the next person cannot open it through the
 * app, and can open it through devtools.
 *
 * This is the delete that was missing. It is deliberately about the CURRENT
 * slot only: a page load is keyed to one scope (see `vaultScope`), and
 * reaching into another account's bytes from inside their neighbour's session
 * is the operation this file exists to prevent, not to provide.
 */

/** What went, so the caller can say it rather than claim it. */
export interface ForgetResult {
  keys: number
  databases: number
  /**
   * Databases whose deletion was still blocked when we stopped waiting.
   *
   * A connection nobody told us about (a second tab on the same profile) is
   * enough. The request stays queued and completes when that connection
   * closes, so this is "not yet", not "never" — but it is not a guarantee,
   * and the UI says so instead of reporting a clean wipe.
   */
  blocked: string[]
}

/**
 * Names IndexedDB holds for this slot, when the browser will not enumerate.
 *
 * `indexedDB.databases()` is unimplemented in Firefox, and a wipe that
 * quietly skipped every Yjs room there would be the worst kind of half-done.
 * So the fallback reconstructs the names from the same two facts the app
 * builds them from: the blob store, and one room per project per doc kind
 * (`crdt/ProjectRoom`). The project ids come from the persisted vault, read
 * directly — this runs before anything is deleted, and going through the
 * store would import the entire app to list some strings.
 */
function guessDatabaseNames(): string[] {
  const names = [vaultKey('lattice-vault-blobs')]
  try {
    const raw = localStorage.getItem(vaultKey('lattice-vault-v1'))
    if (raw) {
      const projects = (
        JSON.parse(raw) as { state?: { projects?: Record<string, unknown> } }
      ).state?.projects
      for (const id of Object.keys(projects ?? {})) {
        names.push(vaultKey(`lattice-yjs-${id}-content`), vaultKey(`lattice-yjs-${id}-collab`))
      }
    }
  } catch {
    // an unreadable vault still gets its blob store deleted
  }
  return names
}

/** Every IndexedDB database that belongs to `slot`. */
async function databasesOf(slot: string): Promise<string[]> {
  if (typeof indexedDB === 'undefined') return []
  try {
    if (typeof indexedDB.databases === 'function') {
      const found = await indexedDB.databases()
      return found
        .map((d) => d.name)
        .filter((n): n is string => !!n && keyBelongsToSlot(n, slot))
    }
  } catch {
    // enumeration refused (some privacy modes): fall through to the guess
  }
  return guessDatabaseNames()
}

/** How long a blocked deletion is given before we stop waiting on it. */
const BLOCKED_GRACE_MS = 2_000

function deleteDatabase(name: string): Promise<'deleted' | 'blocked'> {
  return new Promise((resolve) => {
    let settled = false
    const settle = (outcome: 'deleted' | 'blocked') => {
      if (settled) return
      settled = true
      resolve(outcome)
    }
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.deleteDatabase(name)
    } catch {
      settle('blocked')
      return
    }
    req.onsuccess = () => settle('deleted')
    // a database that was never there is not a failure to report
    req.onerror = () => settle('deleted')
    req.onblocked = () => setTimeout(() => settle('blocked'), BLOCKED_GRACE_MS)
  })
}

/**
 * Delete this slot's vault: every namespaced `localStorage` key, every
 * IndexedDB database, and the map entry that pointed at them.
 *
 * The open connections go first. `deleteDatabase` waits on `blocked` for as
 * long as anything holds the database, so closing the blob store and
 * destroying the CRDT rooms is not tidiness — it is the difference between
 * deleting the vault and reporting that we did.
 *
 * The CRDT layer is imported dynamically on purpose: this module is reached
 * from Settings, and a static edge would pull Yjs into every bundle that
 * touches storage.
 *
 * The caller reloads afterwards. Everything still in memory belongs to the
 * vault that just stopped existing, and `vaultScope` resolves once per page
 * load, so there is no honest way to carry on without one.
 */
export async function forgetThisDevice(): Promise<ForgetResult> {
  const slot = bootSlot()

  const names = await databasesOf(slot)

  storage.close()
  try {
    const { yjsManager } = await import('@/lib/crdt/YjsManager')
    yjsManager.stop()
    yjsManager.destroyRooms()
  } catch {
    // no CRDT layer loaded in this session: nothing of its to close
  }

  const blocked: string[] = []
  let databases = 0
  for (const name of names) {
    if ((await deleteDatabase(name)) === 'blocked') blocked.push(name)
    else databases++
  }

  let keys = 0
  try {
    const doomed: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && keyBelongsToSlot(key, slot)) doomed.push(key)
    }
    for (const key of doomed) localStorage.removeItem(key)
    keys = doomed.length
  } catch {
    // storage blocked: the databases above are still gone
  }

  // last, and only now: while the map still pointed here, a failure halfway
  // through left a vault that could be found again and finished off
  releaseSlot(bootScope())

  return { keys, databases, blocked }
}
