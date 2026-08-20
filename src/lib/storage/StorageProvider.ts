import { vaultKey } from './vaultScope'

/**
 * Pluggable persistence for the vault. Small metadata lives in the Zustand
 * store; heavy payloads live behind this interface:
 *   - blobs:     imported asset binaries
 *   - documents: rich text document bodies (Tiptap JSON), lazy-loaded so
 *                the app never holds every document in memory
 *
 * Today: IndexedDB. Phase 5: a FileSystemStorageProvider writing real files
 * into /assets, /imports and /documents via the File System Access API —
 * nothing above this interface has to change.
 */
export interface StorageProvider {
  putBlob(id: string, blob: Blob): Promise<void>
  getBlob(id: string): Promise<Blob | undefined>
  deleteBlob(id: string): Promise<void>

  putDocument(id: string, body: unknown): Promise<void>
  getDocument(id: string): Promise<unknown | undefined>
  deleteDocument(id: string): Promise<void>

  /** Wipe everything (used when importing a whole project file). */
  clear(): Promise<void>
}

/**
 * The local half of the contract: a store backed by a handle this browser
 * holds open. Drive implements {@link StorageProvider} and not this — there
 * is no connection on the other end to let go of.
 */
export interface LocalStorageProvider extends StorageProvider {
  /**
   * Drop the connection to the database.
   *
   * Only "forget this device" needs it: `indexedDB.deleteDatabase` fires
   * `blocked` and waits while any connection is still open, so a wipe that
   * did not close this one would report success over a vault that is still
   * there. Every method reopens lazily, so calling it early is merely
   * wasteful rather than wrong.
   */
  close(): void
}

/**
 * One database per account, not per browser (see `vaultScope`). Document
 * bodies and asset binaries are the heaviest thing Lattice holds, and until
 * this was scoped the next person to sign in on this machine inherited all
 * of it.
 */
const DB_NAME = vaultKey('lattice-vault-blobs')
const DB_VERSION = 2
const BLOBS = 'blobs'
const DOCS = 'docs'

function asPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

class IndexedDbStorageProvider implements LocalStorageProvider {
  private dbPromise?: Promise<IDBDatabase>

  private open(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION)
        req.onupgradeneeded = () => {
          // v1 databases only have 'blobs'; create whatever is missing
          const db = req.result
          if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS)
          if (!db.objectStoreNames.contains(DOCS)) db.createObjectStore(DOCS)
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
    }
    return this.dbPromise
  }

  private async store(name: string, mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await this.open()
    return db.transaction(name, mode).objectStore(name)
  }

  async putBlob(id: string, blob: Blob): Promise<void> {
    await asPromise((await this.store(BLOBS, 'readwrite')).put(blob, id))
  }

  async getBlob(id: string): Promise<Blob | undefined> {
    return asPromise<Blob | undefined>((await this.store(BLOBS, 'readonly')).get(id))
  }

  async deleteBlob(id: string): Promise<void> {
    await asPromise((await this.store(BLOBS, 'readwrite')).delete(id))
  }

  async putDocument(id: string, body: unknown): Promise<void> {
    await asPromise((await this.store(DOCS, 'readwrite')).put(body, id))
  }

  async getDocument(id: string): Promise<unknown | undefined> {
    return asPromise<unknown | undefined>((await this.store(DOCS, 'readonly')).get(id))
  }

  async deleteDocument(id: string): Promise<void> {
    await asPromise((await this.store(DOCS, 'readwrite')).delete(id))
  }

  async clear(): Promise<void> {
    await asPromise((await this.store(BLOBS, 'readwrite')).clear())
    await asPromise((await this.store(DOCS, 'readwrite')).clear())
  }

  close(): void {
    const pending = this.dbPromise
    this.dbPromise = undefined
    // the handle may still be opening: close it when it lands, not before
    void pending?.then((db) => db.close()).catch(() => {})
  }
}

export const storage: LocalStorageProvider = new IndexedDbStorageProvider()
