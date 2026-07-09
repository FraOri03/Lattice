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

const DB_NAME = 'lattice-vault-blobs'
const DB_VERSION = 2
const BLOBS = 'blobs'
const DOCS = 'docs'

function asPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

class IndexedDbStorageProvider implements StorageProvider {
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
}

export const storage: StorageProvider = new IndexedDbStorageProvider()
