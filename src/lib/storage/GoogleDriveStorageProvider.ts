import type { StorageProvider } from './StorageProvider'
import { env } from '@/lib/env'

/**
 * GoogleDriveStorageProvider — REAL Google Drive REST v3 client.
 *
 * Follows the StorageProvider interface (documents + blobs by id) and
 * adds the path-aware operations the SyncEngine needs. All files live
 * under one app folder in the user's Drive:
 *
 *   /Lattice
 *     /projects/<project-id>/project.json     project + entity metadata
 *     /projects/<project-id>/documents/…      rich document bodies (JSON)
 *     /projects/<project-id>/code/…           code file sources
 *     /projects/<project-id>/spreadsheets/…   workbook bodies (JSON)
 *     /projects/<project-id>/boards/…         (reserved: boards ship inside project.json today)
 *     /projects/<project-id>/assets/…         imported binaries
 *
 * Uses the drive.file OAuth scope: Lattice can only see files it created
 * — it never gets access to the rest of the user's Drive.
 *
 * Deletion safety: deleteDocument/deleteBlob move files to Drive's trash
 * (recoverable for 30 days) and are only invoked from explicit user
 * confirmation paths. clear() is intentionally a no-op — Lattice never
 * bulk-wipes remote data.
 */

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

export interface DriveFileMeta {
  id: string
  name: string
  mimeType?: string
  modifiedTime?: string
  appProperties?: Record<string, string>
}

export interface DriveAbout {
  user?: { displayName?: string; emailAddress?: string }
  storageQuota?: { limit?: string; usage?: string }
}

export type TokenSupplier = () => Promise<string | null>

function q(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

export class DriveApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Google error reason, e.g. "accessNotConfigured", "rateLimitExceeded" */
    readonly reason: string = '',
  ) {
    super(message)
  }
}

/** Pull status + reason out of a Drive error response body. */
function parseDriveError(status: number, body: string): DriveApiError {
  try {
    const data = JSON.parse(body) as {
      error?: {
        message?: string
        status?: string
        errors?: { reason?: string; message?: string }[]
      }
    }
    const reason = data.error?.errors?.[0]?.reason ?? data.error?.status ?? ''
    const message = data.error?.message ?? body.slice(0, 300)
    return new DriveApiError(status, `Drive API ${status}: ${message}`, reason)
  } catch {
    return new DriveApiError(status, `Drive API ${status}: ${body.slice(0, 300)}`)
  }
}

/** Human-readable, actionable message for a failed Drive/auth operation. */
export function describeDriveError(err: unknown): string {
  if (err instanceof TypeError) {
    // fetch() network failure — DNS, blocked request, dropped connection
    return 'Could not reach Google Drive (network error) — changes stay local and sync will resume once Drive is reachable.'
  }
  if (!(err instanceof DriveApiError)) {
    return err instanceof Error ? err.message : 'Google Drive request failed'
  }
  if (err.status === 401) {
    return 'Google Drive session expired — use "Reconnect Drive" to sign in again.'
  }
  if (err.status === 429 || /ratelimitexceeded|userratelimitexceeded/i.test(err.reason)) {
    return 'Google Drive rate limit reached — sync will retry automatically; your data stays safe locally.'
  }
  if (err.status === 403) {
    if (/accessnotconfigured|service_disabled/i.test(err.reason)) {
      return 'The Google Drive API is disabled for this OAuth client’s Google Cloud project. Enable "Google Drive API" under APIs & Services → Library, then retry.'
    }
    if (/insufficient|access_token_scope_insufficient/i.test(err.reason)) {
      return 'The Google token is missing the Drive permission (drive.file scope). Use "Reconnect Drive" and grant access to files created with this app.'
    }
    if (/dailylimitexceeded|quota/i.test(err.reason)) {
      return 'Google Drive API quota exceeded for this project — try again later.'
    }
    return `Google Drive refused the request (403 ${err.reason || 'forbidden'}).`
  }
  return err.message
}

export class GoogleDriveStorageProvider implements StorageProvider {
  /** path key ("a/b/c") → Drive folder id */
  private folderCache = new Map<string, string>()
  /** "path|name" → Drive file id */
  private fileIdCache = new Map<string, string>()

  constructor(private readonly getToken: TokenSupplier) {}

  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.getToken()
    if (!token) throw new DriveApiError(401, 'Not connected to Google Drive')
    return { Authorization: `Bearer ${token}` }
  }

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = { ...(await this.authHeaders()), ...(init.headers ?? {}) }
    const res = await fetch(url, { ...init, headers })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw parseDriveError(res.status, body)
    }
    return res
  }

  /**
   * Reachability probe: cheapest authenticated Drive call. Succeeds only
   * when the token is valid, carries the Drive scope AND the Drive API is
   * enabled for the OAuth client's project.
   */
  async about(): Promise<DriveAbout> {
    const res = await this.request(
      `${API}/about?fields=user(displayName,emailAddress),storageQuota(limit,usage)`,
    )
    return (await res.json()) as DriveAbout
  }

  /* ---------------- folders ---------------- */

  private async findChild(
    parentId: string,
    name: string,
    mimeType?: string,
  ): Promise<DriveFileMeta | null> {
    const mimeClause = mimeType
      ? ` and mimeType ${mimeType === FOLDER_MIME ? '=' : '!='} '${FOLDER_MIME}'`
      : ''
    const query = `name = '${q(name)}' and '${q(parentId)}' in parents and trashed = false${mimeClause}`
    const res = await this.request(
      `${API}/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,modifiedTime,appProperties)&pageSize=1`,
    )
    const data = (await res.json()) as { files: DriveFileMeta[] }
    return data.files[0] ?? null
  }

  private async createFolder(parentId: string, name: string): Promise<string> {
    const res = await this.request(`${API}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
    })
    return ((await res.json()) as { id: string }).id
  }

  /** Find-or-create the app root folder (default name "Lattice"). */
  async ensureAppFolder(): Promise<string> {
    return this.ensurePath([])
  }

  /** Find-or-create a nested folder path under the app root; returns its id. */
  async ensurePath(segments: string[]): Promise<string> {
    const key = segments.join('/')
    const cached = this.folderCache.get(key)
    if (cached) return cached

    let parentId = this.folderCache.get('')
    if (!parentId) {
      const root = await this.findChild('root', env.driveAppFolder, FOLDER_MIME)
      parentId = root?.id ?? (await this.createFolder('root', env.driveAppFolder))
      this.folderCache.set('', parentId)
    }
    let path = ''
    for (const segment of segments) {
      path = path ? `${path}/${segment}` : segment
      const hit = this.folderCache.get(path)
      if (hit) {
        parentId = hit
        continue
      }
      const found = await this.findChild(parentId, segment, FOLDER_MIME)
      parentId = found?.id ?? (await this.createFolder(parentId, segment))
      this.folderCache.set(path, parentId)
    }
    return parentId
  }

  /* ---------------- files ---------------- */

  async findFile(path: string[], name: string): Promise<DriveFileMeta | null> {
    const folderId = await this.ensurePath(path)
    return this.findChild(folderId, name)
  }

  async listFolder(path: string[]): Promise<DriveFileMeta[]> {
    const folderId = await this.ensurePath(path)
    const files: DriveFileMeta[] = []
    let pageToken = ''
    do {
      const query = `'${q(folderId)}' in parents and trashed = false`
      const res = await this.request(
        `${API}/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(id,name,mimeType,modifiedTime,appProperties)&pageSize=200${pageToken ? `&pageToken=${pageToken}` : ''}`,
      )
      const data = (await res.json()) as {
        files: DriveFileMeta[]
        nextPageToken?: string
      }
      files.push(...data.files)
      pageToken = data.nextPageToken ?? ''
    } while (pageToken)
    return files
  }

  /**
   * Create-or-update a file (multipart upload). appProperties carries the
   * sync version id so pulls can compare without downloading content.
   */
  async putFile(
    path: string[],
    name: string,
    content: Blob | string,
    contentType: string,
    appProperties?: Record<string, string>,
  ): Promise<string> {
    const cacheKey = `${path.join('/')}|${name}`
    let fileId = this.fileIdCache.get(cacheKey)
    if (!fileId) {
      const existing = await this.findFile(path, name)
      fileId = existing?.id
    }
    const folderId = await this.ensurePath(path)
    const metadata: Record<string, unknown> = fileId
      ? { name, appProperties }
      : { name, parents: [folderId], appProperties }

    const boundary = `lattice-${Math.random().toString(36).slice(2)}`
    const blob = typeof content === 'string' ? new Blob([content], { type: contentType }) : content
    const body = new Blob(
      [
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
        JSON.stringify(metadata),
        `\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`,
        blob,
        `\r\n--${boundary}--`,
      ],
      { type: `multipart/related; boundary=${boundary}` },
    )
    const url = fileId
      ? `${UPLOAD}/files/${fileId}?uploadType=multipart&fields=id`
      : `${UPLOAD}/files?uploadType=multipart&fields=id`
    const res = await this.request(url, {
      method: fileId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    })
    const id = ((await res.json()) as { id: string }).id
    this.fileIdCache.set(cacheKey, id)
    return id
  }

  async downloadJson<T = unknown>(fileId: string): Promise<T> {
    const res = await this.request(`${API}/files/${fileId}?alt=media`)
    return (await res.json()) as T
  }

  async downloadText(fileId: string): Promise<string> {
    const res = await this.request(`${API}/files/${fileId}?alt=media`)
    return res.text()
  }

  async downloadBlob(fileId: string): Promise<Blob> {
    const res = await this.request(`${API}/files/${fileId}?alt=media`)
    return res.blob()
  }

  /** Move a file to Drive's trash (recoverable) — never permanent delete. */
  async trashFile(fileId: string): Promise<void> {
    await this.request(`${API}/files/${fileId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    })
  }

  /* ---------------- StorageProvider interface ----------------
   * Id-addressed access used when Drive acts as the vault's remote
   * document/blob store. Files land in a flat per-kind layout under
   * /Lattice/data so the interface works without knowing projects.
   */

  async putDocument(id: string, body: unknown): Promise<void> {
    await this.putFile(['data', 'documents'], `${id}.json`, JSON.stringify(body), 'application/json')
  }

  async getDocument(id: string): Promise<unknown | undefined> {
    const meta = await this.findFile(['data', 'documents'], `${id}.json`)
    if (!meta) return undefined
    return this.downloadJson(meta.id)
  }

  async deleteDocument(id: string): Promise<void> {
    const meta = await this.findFile(['data', 'documents'], `${id}.json`)
    if (meta) await this.trashFile(meta.id)
  }

  async putBlob(id: string, blob: Blob): Promise<void> {
    await this.putFile(['data', 'blobs'], id, blob, blob.type || 'application/octet-stream')
  }

  async getBlob(id: string): Promise<Blob | undefined> {
    const meta = await this.findFile(['data', 'blobs'], id)
    if (!meta) return undefined
    return this.downloadBlob(meta.id)
  }

  async deleteBlob(id: string): Promise<void> {
    const meta = await this.findFile(['data', 'blobs'], id)
    if (meta) await this.trashFile(meta.id)
  }

  /** Intentionally a no-op: Lattice never bulk-deletes remote data. */
  async clear(): Promise<void> {
    console.warn('GoogleDriveStorageProvider.clear() is disabled by design')
  }
}
