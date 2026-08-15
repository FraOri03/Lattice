import type { JSONContent } from '@tiptap/core'
import { useStore } from '@/store/useStore'
import { storage } from '@/lib/storage/StorageProvider'
import { vaultKey } from '@/lib/storage/vaultScope'
import {
  GoogleDriveStorageProvider,
  DriveApiError,
  describeDriveError,
  FOLDER_MIME,
} from '@/lib/storage/GoogleDriveStorageProvider'
import { PROJECT_ID_PROPERTY } from '@/lib/storage/driveProjectFolder'
import { authService } from '@/lib/auth/AuthService'
import { buildStandaloneHtml, companionFileName } from '@/lib/export/ExportService'
import { useSyncStore } from './syncStore'
import {
  describeConflict,
  hasUnpushedBody,
  isConflict,
  resolveVersions,
} from './ConflictResolver'
import type {
  AssetDoc,
  Board,
  CodeDocMeta,
  NoteDoc,
  Project,
  RichDocMeta,
  SpreadsheetDocMeta,
  SyncConflict,
} from '@/types/model'

/**
 * SyncEngine — single-user cloud sync between the local vault (Zustand +
 * IndexedDB, always the working copy: the app is offline-first) and
 * Google Drive.
 *
 * Layout on Drive (see GoogleDriveStorageProvider):
 *   /Lattice/projects/<name>/project.json           project + all entity metadata
 *   /Lattice/projects/<name>/documents/…            rich doc bodies (JSON, source of truth)
 *   /Lattice/projects/<name>/documents-readable/…   human-readable HTML mirror of each doc
 *   /Lattice/projects/<name>/code/…                 code sources
 *   /Lattice/projects/<name>/spreadsheets/…         workbook bodies
 *   /Lattice/projects/<name>/assets/…               binaries
 *
 * The engine still addresses every path by project ID; the provider maps
 * that id to a folder NAMED after the project (identity pinned in
 * appProperties). Only the folder name has to be pushed explicitly, in
 * pushInner — see syncProjectFolder.
 *
 * Behavior:
 *  - push: debounced after local changes; only entities newer than their
 *    last pushed timestamp are uploaded
 *  - pull: on start/sign-in; per-entity newest-wins (ConflictResolver);
 *    when remote wins over unpushed local changes, the local body is
 *    backed up to Drive as <id>.conflict-<ts>.json before being replaced
 *  - deletions NEVER propagate automatically in either direction
 *  - offline: engine idles and resumes on the browser 'online' event
 *
 * Readable companions (documents-readable/<title>.html): every rich
 * document JSON push also updates a plain-HTML mirror, so Drive's own
 * file list shows something a human can actually open — the JSON stays
 * the one internal source of truth, this is purely derived. It rides the
 * SAME dirty check as the JSON body (only writes when the doc actually
 * changed), is found by a persistent Drive file id — never by name, so a
 * Lattice-side rename updates it in place instead of duplicating it — and
 * pull() never reads this folder, so it cannot itself trigger a sync.
 *
 * Phase 7 (realtime collaboration) will replace timestamps with an
 * operation log; the store subscription + provider seams stay.
 */

interface ProjectSnapshot {
  app: 'lattice-project'
  version: 1
  savedAt: number
  project: Project
  notes: Record<string, NoteDoc>
  boards: Record<string, Board>
  boardOrder: string[]
  docs: Record<string, RichDocMeta>
  codeDocs: Record<string, CodeDocMeta>
  sheetDocs: Record<string, SpreadsheetDocMeta>
  assets: Record<string, AssetDoc>
}

interface SyncMeta {
  lastSyncAt: number | null
  /** project id → updatedAt of the last uploaded snapshot */
  projectPush: Record<string, number>
  /** entity id → updatedAt of the last uploaded body */
  bodyPush: Record<string, number>
  /** asset ids whose binaries are already on Drive */
  uploadedAssets: string[]
  /**
   * rich-doc id → Drive file id of its readable HTML companion. A local
   * fast-path cache only — findFileByAppProperty is the cross-device
   * source of truth for a fresh browser that has never pushed this doc.
   */
  docCompanions: Record<string, string>
}

/** One entity the pull is about to replace, and what it was worth locally. */
interface PulledEntity {
  id: string
  /** Its local `updatedAt` BEFORE the remote copy overwrote it; 0 if new here. */
  localUpdatedAt: number
}

/**
 * Scoped per account (see `lib/storage/vaultScope`). This is the record of
 * what has already been pushed to *a* Drive, so an unscoped one told the
 * next account to sign in that their empty Drive was up to date — and the
 * projects it thought were pushed were the previous account's.
 */
const META_KEY = vaultKey('lattice-sync-meta')
const PUSH_DEBOUNCE_MS = 10_000

/**
 * `lastSyncAt` is listed among the defaults, not only in the fallback below.
 *
 * Stored meta is spread over these, and `JSON.parse` is `any` — so a payload
 * without the key produced `undefined` rather than `null`, which slips past
 * the `lastSyncAt === null` guard in `isConflict` and makes every comparison
 * against it quietly false. `JSON.stringify` then drops the key again on the
 * next save, so the state persists once reached.
 */
const EMPTY_META: SyncMeta = {
  lastSyncAt: null,
  projectPush: {},
  bodyPush: {},
  uploadedAssets: [],
  docCompanions: {},
}

function loadMeta(): SyncMeta {
  try {
    const raw = localStorage.getItem(META_KEY)
    if (raw) return { ...EMPTY_META, ...JSON.parse(raw) }
  } catch {
    /* corrupted meta → resync from scratch (uploads are idempotent) */
  }
  return { ...EMPTY_META }
}

class SyncEngine {
  private drive: GoogleDriveStorageProvider | null = null
  private meta: SyncMeta = loadMeta()
  private unsubscribe: (() => void) | null = null
  private unsubscribeAuth: (() => void) | null = null
  private pushTimer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private busy = false

  private saveMeta() {
    localStorage.setItem(META_KEY, JSON.stringify(this.meta))
  }

  private connecting = false

  /**
   * Begin syncing (called after Google sign-in / session restore, or from
   * "Reconnect Drive"). The engine only flips to "connected" after a real
   * verification round-trip (valid token → Drive API reachable → app
   * folder exists). If any step fails, sync stays off with a precise
   * error and the local IndexedDB vault keeps working untouched.
   */
  async start(): Promise<void> {
    if (this.running || this.connecting) return
    if (authService.kind !== 'google') {
      // mock accounts are local-only — never pretend to sync
      useSyncStore.getState().setProvider('none')
      useSyncStore.getState().setStatus('disabled')
      return
    }

    // a token can arrive later (silent renewal on the next user gesture,
    // "Reconnect Drive"): resume then instead of staying dead until reload
    this.watchAuth()

    // offline: don't fail verification on a dead network — wait and retry
    if (!navigator.onLine) {
      useSyncStore.getState().setStatus('offline')
      window.addEventListener('online', this.retryStart, { once: true })
      return
    }

    this.connecting = true
    useSyncStore.getState().setStatus('connecting')
    const drive = new GoogleDriveStorageProvider(
      () => authService.getAccessToken(),
      (projectId) => useStore.getState().projects[projectId]?.name,
    )
    try {
      const token = await authService.getAccessToken()
      if (!token) {
        throw new DriveApiError(401, 'No valid Google Drive token')
      }
      await drive.about() // token valid + scope granted + Drive API enabled
      await drive.ensureAppFolder() // /Lattice exists (find-or-create)
    } catch (err) {
      this.connecting = false
      useSyncStore.getState().setProvider('none')
      useSyncStore.getState().setStatus('error', describeDriveError(err))
      console.error('[sync] Drive connection failed', err)
      return
    }
    this.connecting = false

    this.running = true
    this.drive = drive
    useSyncStore.getState().setProvider('google-drive')
    useSyncStore.getState().setStatus(navigator.onLine ? 'idle' : 'offline')

    this.unsubscribe = useStore.subscribe((state, prev) => {
      if (
        state.projects !== prev.projects ||
        state.boards !== prev.boards ||
        state.notes !== prev.notes ||
        state.docs !== prev.docs ||
        state.codeDocs !== prev.codeDocs ||
        state.sheetDocs !== prev.sheetDocs ||
        state.assets !== prev.assets
      ) {
        this.schedulePush()
      }
    })
    window.addEventListener('online', this.onOnline)
    window.addEventListener('offline', this.onOffline)

    void this.syncNow()
  }

  private retryStart = () => void this.start()

  /** Resume once a fresh Google token lands, if we're not already syncing. */
  private watchAuth(): void {
    if (this.unsubscribeAuth) return
    this.unsubscribeAuth = authService.subscribe(() => {
      if (this.running || this.connecting) return
      if (!authService.peekToken() || !authService.restore()) return
      void this.start()
    })
  }

  stop(): void {
    this.running = false
    this.unsubscribeAuth?.()
    this.unsubscribeAuth = null
    this.unsubscribe?.()
    this.unsubscribe = null
    if (this.pushTimer) clearTimeout(this.pushTimer)
    window.removeEventListener('online', this.retryStart)
    window.removeEventListener('online', this.onOnline)
    window.removeEventListener('offline', this.onOffline)
    this.drive = null
    useSyncStore.getState().setProvider('none')
    useSyncStore.getState().setStatus('disabled')
  }

  private onOnline = () => {
    useSyncStore.getState().setStatus('idle')
    this.schedulePush(1000)
  }

  private onOffline = () => {
    useSyncStore.getState().setStatus('offline')
  }

  private schedulePush(delay = PUSH_DEBOUNCE_MS) {
    if (!this.running) return
    useSyncStore.getState().setPending(this.countPending())
    if (this.pushTimer) clearTimeout(this.pushTimer)
    this.pushTimer = setTimeout(() => void this.push(), delay)
  }

  /** Entities changed since their last upload. */
  private countPending(): number {
    const s = useStore.getState()
    let n = 0
    for (const p of Object.values(s.projects)) {
      if (this.projectDirtyAt(p.id) > (this.meta.projectPush[p.id] ?? 0)) n++
    }
    for (const d of [
      ...Object.values(s.docs),
      ...Object.values(s.codeDocs),
      ...Object.values(s.sheetDocs),
    ]) {
      if (d.updatedAt > (this.meta.bodyPush[d.id] ?? 0)) n++
    }
    for (const a of Object.values(s.assets)) {
      if (!this.meta.uploadedAssets.includes(a.id)) n++
    }
    return n
  }

  /** Newest change inside a project (its meta or any of its entities). */
  private projectDirtyAt(projectId: string): number {
    const s = useStore.getState()
    let latest = s.projects[projectId]?.updatedAt ?? 0
    const consider = (t: number) => {
      if (t > latest) latest = t
    }
    for (const n of Object.values(s.notes))
      if (n.projectId === projectId) consider(n.updatedAt)
    for (const d of Object.values(s.docs))
      if (d.projectId === projectId) consider(d.updatedAt)
    for (const c of Object.values(s.codeDocs))
      if (c.projectId === projectId) consider(c.updatedAt)
    for (const sh of Object.values(s.sheetDocs))
      if (sh.projectId === projectId) consider(sh.updatedAt)
    for (const a of Object.values(s.assets))
      if (a.projectId === projectId) consider(a.importedAt)
    // board edits don't carry timestamps — hash-free heuristic: boards are
    // pushed whenever anything else in the project moved, plus on demand
    return latest
  }

  /** Full round-trip: pull remote changes, then push local ones. */
  /**
   * Re-measure what the mirror holds on Drive. Never allowed to fail a
   * sync: this is a reading for the status panel, so a rate-limited or
   * flaky listing just leaves the previous measurement in place rather than
   * blanking it or surfacing an error the user can do nothing about.
   */
  private async refreshDriveUsage(): Promise<void> {
    if (!this.drive) return
    try {
      useSyncStore.getState().setDriveUsage(await this.drive.usage())
    } catch (err) {
      console.warn('[sync] could not measure Drive usage', err)
    }
  }

  async syncNow(): Promise<void> {
    if (!this.drive || this.busy) return
    if (!navigator.onLine) {
      useSyncStore.getState().setStatus('offline')
      return
    }
    this.busy = true
    useSyncStore.getState().setStatus('syncing')
    try {
      await this.pull()
      await this.pushInner()
      this.meta.lastSyncAt = Date.now()
      this.saveMeta()
      useSyncStore.getState().markSynced(this.meta.lastSyncAt)
      void this.refreshDriveUsage()
      // activity trail (deduped there); dynamic import avoids a static cycle
      void import('@/lib/collab/ActivityLogService').then(({ activityLog }) =>
        activityLog.log(
          useStore.getState().activeProjectId,
          'drive.sync',
          'Synced with Google Drive',
        ),
      )
    } catch (err) {
      this.reportError(err)
    } finally {
      this.busy = false
    }
  }

  private async push(): Promise<void> {
    if (!this.drive || this.busy) return
    if (!navigator.onLine) {
      useSyncStore.getState().setStatus('offline')
      return
    }
    this.busy = true
    useSyncStore.getState().setStatus('syncing')
    try {
      await this.pushInner()
      this.meta.lastSyncAt = Date.now()
      this.saveMeta()
      useSyncStore.getState().markSynced(this.meta.lastSyncAt)
    } catch (err) {
      this.reportError(err)
    } finally {
      this.busy = false
    }
  }

  private reportError(err: unknown) {
    console.error('[sync]', err)
    useSyncStore.getState().setStatus('error', describeDriveError(err))
  }

  /** True once start() verified the Drive connection and sync is live. */
  get isRunning(): boolean {
    return this.running
  }

  /** Tear down and re-verify — used by "Reconnect Drive". */
  async restart(): Promise<void> {
    this.stop()
    await this.start()
  }

  /* ---------------- push ---------------- */

  private snapshotOf(projectId: string): ProjectSnapshot {
    const s = useStore.getState()
    const pick = <T extends { projectId?: string }>(rec: Record<string, T>) =>
      Object.fromEntries(
        Object.entries(rec).filter(([, e]) => e.projectId === projectId),
      )
    return {
      app: 'lattice-project',
      version: 1,
      savedAt: Date.now(),
      project: s.projects[projectId],
      notes: pick(s.notes),
      boards: pick(s.boards),
      boardOrder: s.boardOrder.filter((id) => s.boards[id]?.projectId === projectId),
      docs: pick(s.docs),
      codeDocs: pick(s.codeDocs),
      sheetDocs: pick(s.sheetDocs),
      assets: pick(s.assets),
    }
  }

  private async pushInner(): Promise<void> {
    const drive = this.drive!
    const s = useStore.getState()

    for (const project of Object.values(s.projects)) {
      const dirtyAt = this.projectDirtyAt(project.id)
      if (dirtyAt <= (this.meta.projectPush[project.id] ?? 0)) continue
      // a rename touches nothing but the project's own metadata, so this
      // is the one place that also pushes the folder name to Drive
      await drive.syncProjectFolder(project.id)
      const snapshot = this.snapshotOf(project.id)
      await drive.putFile(
        ['projects', project.id],
        'project.json',
        JSON.stringify(snapshot),
        'application/json',
        { latticeUpdatedAt: String(dirtyAt) },
      )
      this.meta.projectPush[project.id] = dirtyAt
      this.saveMeta()
    }

    // bodies — only entities that changed since their last upload
    const bodyJobs: { id: string; updatedAt: number; projectId?: string; folder: string; name: string; json: boolean }[] = [
      ...Object.values(s.docs).map((d) => ({
        id: d.id, updatedAt: d.updatedAt, projectId: d.projectId,
        folder: 'documents', name: `${d.id}.json`, json: true,
      })),
      ...Object.values(s.sheetDocs).map((sh) => ({
        id: sh.id, updatedAt: sh.updatedAt, projectId: sh.projectId,
        folder: 'spreadsheets', name: `${sh.id}.json`, json: true,
      })),
      ...Object.values(s.codeDocs).map((c) => ({
        id: c.id, updatedAt: c.updatedAt, projectId: c.projectId,
        folder: 'code', name: `${c.id}.${c.extension || 'txt'}`, json: false,
      })),
    ]
    for (const job of bodyJobs) {
      if (job.updatedAt <= (this.meta.bodyPush[job.id] ?? 0)) continue
      const body = await storage.getDocument(job.id)
      if (body === undefined) continue
      const projectId = job.projectId ?? 'unassigned'
      await drive.putFile(
        ['projects', projectId, job.folder],
        job.name,
        job.json ? JSON.stringify(body) : String(body),
        job.json ? 'application/json' : 'text/plain',
        { latticeUpdatedAt: String(job.updatedAt) },
      )
      this.meta.bodyPush[job.id] = job.updatedAt
      this.saveMeta()

      // readable companion — rich documents only; rides this same dirty
      // check, so it re-syncs exactly when (and only when) the doc did
      if (job.folder === 'documents') {
        const docMeta = s.docs[job.id]
        if (docMeta) await this.syncCompanion(projectId, docMeta, body as JSONContent)
      }
    }

    // asset binaries — immutable after import, so one upload each
    for (const asset of Object.values(s.assets)) {
      if (this.meta.uploadedAssets.includes(asset.id)) continue
      const blob = await storage.getBlob(asset.id)
      if (!blob) continue
      const projectId = asset.projectId ?? 'unassigned'
      await drive.putFile(
        ['projects', projectId, 'assets'],
        `${asset.id}${asset.ext ? `.${asset.ext}` : ''}`,
        blob,
        asset.mime || 'application/octet-stream',
      )
      this.meta.uploadedAssets.push(asset.id)
      this.saveMeta()
    }
  }

  /**
   * Write or update a rich document's readable HTML companion so Drive's
   * own file list shows something a human can open — the JSON under
   * documents/ stays the one internal source of truth this only mirrors.
   *
   * Identity, in order: the local fast-path cache, then the doc's own
   * synced driveExport (a companion another device already created),
   * then a Drive-side search by app property (a fresh browser with
   * neither of the above still finds — and updates, never duplicates —
   * a companion created elsewhere). Only once none of those hit does this
   * create a new file.
   */
  private async syncCompanion(
    projectId: string,
    meta: RichDocMeta,
    body: JSONContent,
  ): Promise<void> {
    const drive = this.drive!
    const path = ['projects', projectId, 'documents-readable']
    const name = companionFileName(meta.title)
    const html = buildStandaloneHtml(meta, body)
    const appProperties = { latticeDocId: meta.id, latticeCompanion: 'true' }

    let fileId: string | undefined = this.meta.docCompanions[meta.id] ?? meta.driveExport?.fileId
    if (!fileId) {
      const found = await drive.findFileByAppProperty(path, 'latticeDocId', meta.id)
      fileId = found?.id
    }
    if (fileId) {
      await drive.updateFileById(fileId, name, html, 'text/html', appProperties)
    } else {
      fileId = await drive.createFile(path, name, html, 'text/html', appProperties)
    }

    this.meta.docCompanions[meta.id] = fileId
    this.saveMeta()
    useStore.getState().setDocDriveExport(meta.id, {
      fileId,
      format: 'html',
      syncedAt: meta.updatedAt,
    })
  }

  /* ---------------- pull ---------------- */

  private async pull(): Promise<void> {
    const drive = this.drive!
    const projectFolders = await drive.listFolder(['projects'])
    const conflicts: SyncConflict[] = []
    const failed: string[] = []

    for (const folder of projectFolders) {
      if (folder.mimeType !== FOLDER_MIME) continue
      // the folder is named after the project, so its id comes from the
      // app property. Untagged folders predate naming — their name still
      // IS the id, and resolveProjectFolder adopts (and tags) them.
      const taggedId = folder.appProperties?.[PROJECT_ID_PROPERTY]
      if (taggedId) drive.bindProjectFolder(taggedId, folder)
      const projectId = taggedId ?? folder.name

      // One project must not be able to hide the others. This loop used to
      // let any single failure — a rate-limited body fetch, one unreadable
      // file — abort the whole pull, so every project after it in Drive's
      // listing simply never arrived. On a vault that has no local copy to
      // fall back on (a new browser, or a new ORIGIN: localStorage and
      // IndexedDB are per-origin, so moving the app to its own domain
      // starts an empty one) that reads exactly like the project is gone.
      try {
        const snapMeta = await drive.findFile(['projects', projectId], 'project.json')
        if (!snapMeta) continue
        const snapshot = await drive.downloadJson<ProjectSnapshot>(snapMeta.id)
        if (snapshot?.app !== 'lattice-project' || !snapshot.project) continue
        await this.mergeSnapshot(snapshot, conflicts)
      } catch (err) {
        // an expired token fails every remaining project too: stop rather
        // than spend the rest of the listing proving it
        if (err instanceof DriveApiError && err.status === 401) throw err
        console.error(`[sync] could not pull project ${folder.name}`, err)
        failed.push(folder.name)
      }
    }
    if (conflicts.length) useSyncStore.getState().addConflicts(conflicts)
    // report AFTER merging everything that did work, and report it as a
    // failure: pull is the only reader of Drive, and a push marking the
    // sync "synced" afterwards would paint over the missing projects.
    if (failed.length) {
      throw new Error(
        `Could not pull ${failed.length} project${failed.length === 1 ? '' : 's'} from Drive (${failed.join(', ')}) — the others synced; retry with "Sync now".`,
      )
    }
  }

  /** Merge one remote project snapshot into the local vault, newest-wins. */
  private async mergeSnapshot(
    snapshot: ProjectSnapshot,
    conflicts: SyncConflict[],
  ): Promise<void> {
    const drive = this.drive!
    const s = useStore.getState()
    const projectId = snapshot.project.id
    const lastSyncAt = this.meta.lastSyncAt

    // project meta
    const localProject = s.projects[projectId]
    const projects =
      resolveVersions(localProject, snapshot.project) === 'remote'
        ? { ...s.projects, [projectId]: snapshot.project }
        : s.projects

    // plain-metadata merges (notes carry their content inline)
    const mergeRecord = <T extends { id: string; updatedAt: number; title?: string }>(
      kind: string,
      local: Record<string, T>,
      remote: Record<string, T>,
    ): { next: Record<string, T>; pulled: PulledEntity[] } => {
      const next = { ...local }
      const pulled: PulledEntity[] = []
      for (const [id, remoteEntity] of Object.entries(remote)) {
        const localEntity = local[id]
        const res = resolveVersions(localEntity, remoteEntity)
        if (res !== 'remote') continue
        if (isConflict(localEntity, remoteEntity, lastSyncAt)) {
          conflicts.push(describeConflict(kind, localEntity!, remoteEntity, 'remote'))
        }
        next[id] = remoteEntity
        /**
         * The local timestamp is carried out of this loop because it is about
         * to stop existing: `setState` below replaces the entity with the
         * remote one, so anything reading the store afterwards — `pullBody`
         * included — sees the remote `updatedAt` for both sides.
         *
         * 0 for an entity this device has never held: there is no local body
         * to lose, so there is nothing to back up either.
         */
        pulled.push({ id, localUpdatedAt: localEntity?.updatedAt ?? 0 })
      }
      return { next, pulled }
    }

    const notes = mergeRecord('note', s.notes, snapshot.notes)
    const docs = mergeRecord('doc', s.docs, snapshot.docs)
    const codeDocs = mergeRecord('code', s.codeDocs, snapshot.codeDocs)
    const sheetDocs = mergeRecord('sheet', s.sheetDocs, snapshot.sheetDocs)

    // boards have no updatedAt: apply remote boards only for ids we don't
    // have locally (never clobber local board layouts silently)
    const boards = { ...s.boards }
    let boardOrder = s.boardOrder
    for (const [id, board] of Object.entries(snapshot.boards)) {
      if (!boards[id]) {
        boards[id] = board
        boardOrder = [...boardOrder, id]
      }
    }

    // asset metadata: add unknown assets (binaries fetched below)
    const assets = { ...s.assets }
    for (const [id, asset] of Object.entries(snapshot.assets)) {
      if (!assets[id]) assets[id] = asset
    }

    useStore.setState({
      projects,
      notes: notes.next,
      docs: docs.next,
      codeDocs: codeDocs.next,
      sheetDocs: sheetDocs.next,
      boards,
      boardOrder,
      assets,
    })
    // a pulled project is in `projects` but in no workspace — and the
    // project lists all filter on workspace membership, so without this it
    // stays invisible on this device however healthy the sync looks
    useStore.getState().adoptOrphanProjects()

    // fetch bodies for entities where remote won; back up local first when
    // the local copy had unpushed edits (conflict case)
    const pullBody = async (
      id: string,
      folder: string,
      name: string,
      json: boolean,
      remoteUpdatedAt: number,
      localUpdatedAt: number,
    ) => {
      /**
       * The backup fires when this device holds body edits Drive has never
       * seen — `hasUnpushedBody` says what that means and why it is measured
       * against `bodyPush` rather than against `lastSyncAt`.
       *
       * The test used to be `isConflict(bodyPush[id], remote, lastSyncAt)`,
       * which asks whether the body HAD been pushed since the last sync —
       * that is, whether Drive already has it. So the backup was written
       * exactly when it was pointless and skipped exactly when it mattered,
       * and the overwrite below destroyed the only copy of an offline edit.
       */
      const localBody = hasUnpushedBody(localUpdatedAt, this.meta.bodyPush[id] ?? 0)
        ? await storage.getDocument(id)
        : undefined
      if (localBody !== undefined) {
        await drive.putFile(
          ['projects', projectId, folder],
          `${id}.conflict-${Date.now()}.json`,
          JSON.stringify(localBody),
          'application/json',
        )
      }
      const meta = await drive.findFile(['projects', projectId, folder], name)
      if (!meta) return
      const body = json
        ? await drive.downloadJson(meta.id)
        : await drive.downloadText(meta.id)
      await storage.putDocument(id, body)
      this.meta.bodyPush[id] = remoteUpdatedAt
      this.saveMeta()
    }

    for (const { id, localUpdatedAt } of docs.pulled) {
      const name = `${id}.json`
      await pullBody(id, 'documents', name, true, snapshot.docs[id].updatedAt, localUpdatedAt)
    }
    for (const { id, localUpdatedAt } of sheetDocs.pulled) {
      const name = `${id}.json`
      const at = snapshot.sheetDocs[id].updatedAt
      await pullBody(id, 'spreadsheets', name, true, at, localUpdatedAt)
    }
    for (const { id, localUpdatedAt } of codeDocs.pulled) {
      const c = snapshot.codeDocs[id]
      const name = `${id}.${c.extension || 'txt'}`
      await pullBody(id, 'code', name, false, c.updatedAt, localUpdatedAt)
    }

    // asset binaries we reference but don't have locally
    for (const [id, asset] of Object.entries(snapshot.assets)) {
      if (await storage.getBlob(id)) {
        if (!this.meta.uploadedAssets.includes(id)) this.meta.uploadedAssets.push(id)
        continue
      }
      const meta = await drive.findFile(
        ['projects', projectId, 'assets'],
        `${id}${asset.ext ? `.${asset.ext}` : ''}`,
      )
      if (!meta) continue
      const blob = await drive.downloadBlob(meta.id)
      await storage.putBlob(id, blob)
      if (!this.meta.uploadedAssets.includes(id)) this.meta.uploadedAssets.push(id)
      this.saveMeta()
    }
  }
}

/** App-wide singleton; started by AccountProvider after Google sign-in. */
export const syncEngine = new SyncEngine()
