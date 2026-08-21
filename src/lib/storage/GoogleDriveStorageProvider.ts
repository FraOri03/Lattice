import type { StorageProvider } from './StorageProvider'
import { env } from '@/lib/env'
import {
  isLegacyProjectFolder,
  PROJECT_ID_PROPERTY,
  folderNameCandidate,
  projectFolderName,
} from './driveProjectFolder'

/**
 * GoogleDriveStorageProvider — REAL Google Drive REST v3 client.
 *
 * Follows the StorageProvider interface (documents + blobs by id) and
 * adds the path-aware operations the SyncEngine needs. All files live
 * under one app folder in the user's Drive:
 *
 *   /Lattice
 *     /projects/<Project name>/project.json           project + entity metadata
 *     /projects/<Project name>/documents/…            rich document bodies (JSON, source of truth)
 *     /projects/<Project name>/documents-readable/…   human-readable HTML mirror of each document
 *     /projects/<Project name>/code/…                 code file sources
 *     /projects/<Project name>/spreadsheets/…         workbook bodies (JSON)
 *     /projects/<Project name>/boards/…               (reserved: boards ship inside project.json today)
 *     /projects/<Project name>/assets/…               imported binaries
 *
 * Project folders are the one place where the Drive NAME and the path
 * SEGMENT differ. Callers keep addressing a project by its id —
 * `ensurePath(['projects', projectId, 'assets'])` — while the folder on
 * Drive is named after the project title, because that is what the user
 * reads in their own Drive. The two are reconciled inside ensurePath:
 * the second segment under `projects` is resolved through
 * `appProperties.latticeProjectId` instead of by name, so renaming a
 * project renames the folder in place rather than orphaning it. Every
 * other segment is still plain find-or-create by name.
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
export const FOLDER_MIME = 'application/vnd.google-apps.folder'

/** Give up numbering same-named folders and fall back to a unique suffix. */
const MAX_NAME_ATTEMPTS = 20

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

/**
 * What the mirror actually occupies on Drive, measured rather than inferred
 * from the local vault. `files` excludes folders — it is the count of real
 * payloads, to be read against `bytes`.
 *
 * `quotaLimit` is the whole Google account's allowance and `quotaUsage` its
 * whole consumption: those two are NOT Lattice's, and anything showing them
 * has to say so. `limit` is undefined on accounts with unlimited storage.
 */
export interface DriveUsage {
  bytes: number
  files: number
  quotaLimit?: number
  quotaUsage?: number
}

export type TokenSupplier = () => Promise<string | null>

/**
 * Resolves a project id to its current title, so the Drive folder can be
 * named after it. Returns undefined for a project this vault doesn't know
 * — in which case the folder keeps whatever name it already has on Drive:
 * a title we can't see must never overwrite one another device set.
 */
export type ProjectNameSupplier = (projectId: string) => string | undefined

/**
 * Byte-level progress for one transfer, called repeatedly while it runs.
 *
 * `total` is `null` when the size is genuinely unknown — a response with no
 * `Content-Length`, an upload the browser refuses to measure — and callers
 * are expected to render that as indeterminate rather than as a number.
 *
 * Passing one of these is what selects the measurable code path: without it
 * uploads take the plain `fetch` route (which cannot report upload progress
 * at all) and downloads read the body in one go.
 */
export type TransferProgress = (loaded: number, total: number | null) => void

/**
 * Read a response body chunk by chunk so the caller can watch it arrive.
 *
 * `Content-Length` is the only size Drive offers, and it counts bytes ON THE
 * WIRE: if the response is compressed it is smaller than what the reader
 * accumulates, so `loaded` can overshoot it. That is why `jobPercent` clamps
 * rather than trusting the ratio — the alternative, dropping the header
 * entirely, would leave every download unmeasurable to avoid an error of a
 * few percent on the compressible ones.
 */
async function readWithProgress(res: Response, onProgress: TransferProgress): Promise<Blob> {
  const header = res.headers.get('Content-Length')
  const declared = header ? Number(header) : NaN
  const total = Number.isFinite(declared) && declared > 0 ? declared : null
  const type = res.headers.get('Content-Type') ?? ''

  // no streaming body (old browsers, and jsdom in the test run): still report
  // one honest measurement rather than none
  if (!res.body) {
    const blob = await res.blob()
    onProgress(blob.size, blob.size)
    return blob
  }

  const reader = res.body.getReader()
  const chunks: BlobPart[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value as BlobPart)
    loaded += value.byteLength
    onProgress(loaded, total)
  }
  // the true size is known now, whatever the header claimed
  onProgress(loaded, loaded)
  return new Blob(chunks, { type })
}

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
  /** project id → Drive folder id, resolved by app property, never by name */
  private projectFolderIds = new Map<string, string>()
  /** project id → the folder name currently on Drive (avoids a PATCH per push) */
  private projectFolderNames = new Map<string, string>()

  constructor(
    private readonly getToken: TokenSupplier,
    private readonly getProjectName: ProjectNameSupplier = () => undefined,
  ) {}

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

  /**
   * Measure the mirror: every file Lattice has on Drive, with its real
   * byte size as Drive itself reports it.
   *
   * No folder filter is needed, and that is a property of the scope rather
   * than an oversight — under `drive.file` a listing can only ever return
   * files this app created, so "everything visible to us" and "everything
   * we put there" are the same set. Folders are dropped (they carry no
   * bytes) and so is anything Drive reports without a `size`, which is how
   * native Google-editor files appear; Lattice uploads none of those.
   *
   * This is deliberately a separate call from the local vault total. The
   * two genuinely differ — Drive also holds the readable HTML mirror and
   * each project's project.json — and a mirror figure derived from local
   * bytes would hide exactly that difference instead of reporting it.
   */
  async usage(): Promise<DriveUsage> {
    const about = await this.about()
    let bytes = 0
    let files = 0
    let pageToken = ''
    do {
      const query = `trashed = false and mimeType != '${FOLDER_MIME}'`
      const res = await this.request(
        `${API}/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(size)&pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ''}`,
      )
      const data = (await res.json()) as {
        files: { size?: string }[]
        nextPageToken?: string
      }
      for (const f of data.files) {
        const size = Number(f.size)
        if (!Number.isFinite(size)) continue
        bytes += size
        files += 1
      }
      pageToken = data.nextPageToken ?? ''
    } while (pageToken)

    const num = (v: string | undefined) => {
      const n = Number(v)
      return Number.isFinite(n) ? n : undefined
    }
    return {
      bytes,
      files,
      quotaLimit: num(about.storageQuota?.limit),
      quotaUsage: num(about.storageQuota?.usage),
    }
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

  private async createFolder(
    parentId: string,
    name: string,
    appProperties?: Record<string, string>,
  ): Promise<string> {
    const res = await this.request(`${API}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId], appProperties }),
    })
    return ((await res.json()) as { id: string }).id
  }

  /** Change a file's metadata (name, appProperties, trashed) in place. */
  private async patchMetadata(fileId: string, patch: Record<string, unknown>): Promise<void> {
    await this.request(`${API}/files/${fileId}?fields=id`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
  }

  /** Find-or-create the app root folder (default name "Lattice"). */
  async ensureAppFolder(): Promise<string> {
    return this.ensurePath([])
  }

  /**
   * Find-or-create a nested folder path under the app root; returns its id.
   *
   * Segments are matched by name, with one exception: the project segment
   * (`projects/<projectId>`) is matched by app property, because that
   * folder is named after the project title — see resolveProjectFolder.
   */
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
    for (const [index, segment] of segments.entries()) {
      path = path ? `${path}/${segment}` : segment
      const hit = this.folderCache.get(path)
      if (hit) {
        parentId = hit
        continue
      }
      if (index === 1 && segments[0] === 'projects') {
        parentId = await this.resolveProjectFolder(parentId, segment)
      } else {
        const found = await this.findChild(parentId, segment, FOLDER_MIME)
        parentId = found?.id ?? (await this.createFolder(parentId, segment))
      }
      this.folderCache.set(path, parentId)
    }
    return parentId
  }

  /* ---------------- project folders ----------------
   * A project's folder is addressed by id but named after the project, so
   * the user recognises it in their own Drive. Identity therefore lives in
   * appProperties.latticeProjectId, never in the name.
   *
   * The two caches below are per-instance and deliberately NOT persisted:
   * a stale folder id would silently send every later write into a folder
   * the user has trashed, and the cost of rebuilding them is one query per
   * project per session.
   */

  /** Locate a project's folder by the id pinned in its app properties. */
  private async findFolderByProjectId(
    parentId: string,
    projectId: string,
  ): Promise<DriveFileMeta | null> {
    const query =
      `'${q(parentId)}' in parents and trashed = false and mimeType = '${FOLDER_MIME}'` +
      ` and appProperties has { key='${q(PROJECT_ID_PROPERTY)}' and value='${q(projectId)}' }`
    const res = await this.request(
      `${API}/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,appProperties)&pageSize=1`,
    )
    return ((await res.json()) as { files: DriveFileMeta[] }).files[0] ?? null
  }

  /** First name in the `Name`, `Name (2)`, … series free among siblings. */
  private async freeFolderName(
    parentId: string,
    base: string,
    ownFolderId?: string,
  ): Promise<string> {
    for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS; attempt++) {
      const candidate = folderNameCandidate(base, attempt)
      const clash = await this.findChild(parentId, candidate, FOLDER_MIME)
      if (!clash || clash.id === ownFolderId) return candidate
    }
    return `${base} (${ownFolderId ?? Date.now()})`
  }

  /**
   * Find-or-create the folder holding a project, resolved in this order:
   * the in-memory cache, the app-property search (works on a device that
   * has never pushed this project), then a folder still named after the
   * project id — the pre-naming layout, adopted and renamed in place so no
   * data has to move.
   */
  private async resolveProjectFolder(parentId: string, projectId: string): Promise<string> {
    const known = this.projectFolderIds.get(projectId)
    if (known) return known

    const tagged = await this.findFolderByProjectId(parentId, projectId)
    const byName = tagged ? null : await this.findChild(parentId, projectId, FOLDER_MIME)
    const legacy = byName && isLegacyProjectFolder(byName, projectId) ? byName : null
    const existing = tagged ?? legacy

    if (existing) {
      this.projectFolderIds.set(projectId, existing.id)
      this.projectFolderNames.set(projectId, existing.name)
      if (!existing.appProperties?.[PROJECT_ID_PROPERTY]) {
        // pin identity BEFORE renaming, so an interrupted migration still
        // finds this folder next time instead of creating a second one
        await this.patchMetadata(existing.id, {
          appProperties: { [PROJECT_ID_PROPERTY]: projectId },
        })
      }
    } else {
      const base = projectFolderName(this.getProjectName(projectId), projectId)
      const name = await this.freeFolderName(parentId, base)
      const created = await this.createFolder(parentId, name, {
        [PROJECT_ID_PROPERTY]: projectId,
      })
      this.projectFolderIds.set(projectId, created)
      this.projectFolderNames.set(projectId, name)
    }

    await this.applyProjectFolderName(parentId, projectId)
    return this.projectFolderIds.get(projectId)!
  }

  /** Rename the folder when the project title no longer matches it. */
  private async applyProjectFolderName(parentId: string, projectId: string): Promise<void> {
    const folderId = this.projectFolderIds.get(projectId)
    const title = this.getProjectName(projectId)
    if (!folderId || title === undefined) return

    const current = this.projectFolderNames.get(projectId)
    const desired = projectFolderName(title, projectId)
    if (current === desired) return

    const name = await this.freeFolderName(parentId, desired, folderId)
    if (name === current) return
    await this.patchMetadata(folderId, { name })
    this.projectFolderNames.set(projectId, name)
  }

  /**
   * Make a project's folder exist and its Drive name mirror the project
   * title. Path resolution alone can't do this: once the folder id is
   * cached, ensurePath short-circuits and would never notice a rename made
   * later in the same session.
   */
  async syncProjectFolder(projectId: string): Promise<string> {
    const folderId = await this.ensurePath(['projects', projectId])
    const parentId = this.folderCache.get('projects')
    if (parentId) await this.applyProjectFolderName(parentId, projectId)
    return folderId
  }

  /**
   * Adopt a project folder already listed from Drive, skipping the lookup
   * resolveProjectFolder would otherwise repeat.
   *
   * Only for folders that ALREADY carry their project id: binding an
   * untagged one would skip the migration that tags it, and the next
   * session — finding neither the property nor the old id-shaped name —
   * would create a second folder.
   */
  bindProjectFolder(projectId: string, folder: DriveFileMeta): void {
    this.projectFolderIds.set(projectId, folder.id)
    this.projectFolderNames.set(projectId, folder.name)
    this.folderCache.set(`projects/${projectId}`, folder.id)
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

  /** Shared multipart-upload mechanics for create (POST) and update (PATCH). */
  private async multipartUpload(
    url: string,
    method: 'POST' | 'PATCH',
    metadata: Record<string, unknown>,
    content: Blob | string,
    contentType: string,
    onProgress?: TransferProgress,
  ): Promise<{ id: string }> {
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
    const type = `multipart/related; boundary=${boundary}`
    if (onProgress) return this.uploadWithProgress(url, method, body, type, onProgress)
    const res = await this.request(url, {
      method,
      headers: { 'Content-Type': type },
      body,
    })
    return (await res.json()) as { id: string }
  }

  /**
   * The same request as above, sent over XMLHttpRequest instead of `fetch`.
   *
   * `fetch` has no way to report how much of a request body has gone out —
   * request streaming exists but needs HTTP/2, `duplex: 'half'` and a browser
   * that supports both, and it would still hand us a stream to meter by hand.
   * `xhr.upload.onprogress` reports the real thing today, in every browser
   * Lattice targets, which is what the sync queue's percentages are made of.
   *
   * `fetch` therefore stays the default for the other ~dozen calls that have
   * no progress to report, and errors are funnelled through the SAME
   * `parseDriveError` / `TypeError` shapes so `describeDriveError` keeps
   * classifying them (401 expired, 403 scope, 429 rate limit, network).
   */
  private async uploadWithProgress(
    url: string,
    method: 'POST' | 'PATCH',
    body: Blob,
    contentType: string,
    onProgress: TransferProgress,
  ): Promise<{ id: string }> {
    const headers = await this.authHeaders()
    return new Promise<{ id: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open(method, url, true)
      for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value)
      xhr.setRequestHeader('Content-Type', contentType)
      xhr.upload.onprogress = (e) => onProgress(e.loaded, e.lengthComputable ? e.total : null)
      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(parseDriveError(xhr.status, xhr.responseText ?? ''))
          return
        }
        // the bytes are gone even if the id below turns out to be unreadable
        onProgress(body.size, body.size)
        try {
          resolve(JSON.parse(xhr.responseText) as { id: string })
        } catch {
          reject(new DriveApiError(xhr.status, 'Drive API returned a malformed upload response'))
        }
      }
      // TypeError is what a failed fetch() throws, and describeDriveError
      // already turns that into the "could not reach Drive" message
      xhr.onerror = () => reject(new TypeError('Could not reach Google Drive'))
      xhr.ontimeout = () => reject(new TypeError('Google Drive upload timed out'))
      xhr.onabort = () => reject(new TypeError('Google Drive upload was interrupted'))
      xhr.send(body)
    })
  }

  /**
   * Create-or-update a file (multipart upload), identified by NAME within
   * its folder. appProperties carries the sync version id so pulls can
   * compare without downloading content.
   *
   * Name-keyed identity is right for the vault's own bodies (their Drive
   * filename is a stable id, e.g. `<docId>.json`, never renamed by the
   * user) but wrong for a companion file whose name follows a human title —
   * see createFile/updateFileById/findFileByAppProperty for that case.
   */
  async putFile(
    path: string[],
    name: string,
    content: Blob | string,
    contentType: string,
    appProperties?: Record<string, string>,
    onProgress?: TransferProgress,
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
    const url = fileId
      ? `${UPLOAD}/files/${fileId}?uploadType=multipart&fields=id`
      : `${UPLOAD}/files?uploadType=multipart&fields=id`
    const { id } = await this.multipartUpload(
      url,
      fileId ? 'PATCH' : 'POST',
      metadata,
      content,
      contentType,
      onProgress,
    )
    this.fileIdCache.set(cacheKey, id)
    return id
  }

  /**
   * Always creates a new file — for callers that already confirmed (e.g.
   * via findFileByAppProperty) that none exists yet.
   */
  async createFile(
    path: string[],
    name: string,
    content: Blob | string,
    contentType: string,
    appProperties?: Record<string, string>,
    onProgress?: TransferProgress,
  ): Promise<string> {
    const folderId = await this.ensurePath(path)
    const { id } = await this.multipartUpload(
      `${UPLOAD}/files?uploadType=multipart&fields=id`,
      'POST',
      { name, parents: [folderId], appProperties },
      content,
      contentType,
      onProgress,
    )
    return id
  }

  /**
   * Update an existing file's content/name/appProperties by its KNOWN Drive
   * id — no name lookup, so a Lattice-side rename updates the SAME file
   * (Drive's `name` field changes in place) instead of leaving a stale
   * copy behind and creating a new one under the new name.
   */
  async updateFileById(
    fileId: string,
    name: string,
    content: Blob | string,
    contentType: string,
    appProperties?: Record<string, string>,
    onProgress?: TransferProgress,
  ): Promise<void> {
    await this.multipartUpload(
      `${UPLOAD}/files/${fileId}?uploadType=multipart&fields=id`,
      'PATCH',
      { name, appProperties },
      content,
      contentType,
      onProgress,
    )
  }

  /**
   * Find a file inside `path` carrying a given (key, value) app property.
   * This is the identity check a DERIVED file (one keyed by a human title
   * rather than a stable id) uses before creating itself, so a second
   * device — with no local cache of the file's id — still finds the one
   * already on Drive instead of duplicating it.
   */
  async findFileByAppProperty(
    path: string[],
    key: string,
    value: string,
  ): Promise<DriveFileMeta | null> {
    const folderId = await this.ensurePath(path)
    const query = `'${q(folderId)}' in parents and trashed = false and appProperties has { key='${q(key)}' and value='${q(value)}' }`
    const res = await this.request(
      `${API}/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,modifiedTime,appProperties)&pageSize=1`,
    )
    const data = (await res.json()) as { files: DriveFileMeta[] }
    return data.files[0] ?? null
  }

  async downloadJson<T = unknown>(fileId: string, onProgress?: TransferProgress): Promise<T> {
    const res = await this.request(`${API}/files/${fileId}?alt=media`)
    if (!onProgress) return (await res.json()) as T
    return JSON.parse(await (await readWithProgress(res, onProgress)).text()) as T
  }

  async downloadText(fileId: string, onProgress?: TransferProgress): Promise<string> {
    const res = await this.request(`${API}/files/${fileId}?alt=media`)
    if (!onProgress) return res.text()
    return (await readWithProgress(res, onProgress)).text()
  }

  async downloadBlob(fileId: string, onProgress?: TransferProgress): Promise<Blob> {
    const res = await this.request(`${API}/files/${fileId}?alt=media`)
    if (!onProgress) return res.blob()
    return readWithProgress(res, onProgress)
  }

  /** Move a file to Drive's trash (recoverable) — never permanent delete. */
  async trashFile(fileId: string): Promise<void> {
    await this.patchMetadata(fileId, { trashed: true })
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
