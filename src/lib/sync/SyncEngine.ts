import { useStore } from '@/store/useStore'
import { storage } from '@/lib/storage/StorageProvider'
import {
  GoogleDriveStorageProvider,
  DriveApiError,
} from '@/lib/storage/GoogleDriveStorageProvider'
import { authService } from '@/lib/auth/AuthService'
import { useSyncStore } from './syncStore'
import { describeConflict, isConflict, resolveVersions } from './ConflictResolver'
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
 *   /Lattice/projects/<id>/project.json      project + all entity metadata
 *   /Lattice/projects/<id>/documents/…       rich doc bodies
 *   /Lattice/projects/<id>/code/…            code sources
 *   /Lattice/projects/<id>/spreadsheets/…    workbook bodies
 *   /Lattice/projects/<id>/assets/…          binaries
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
}

const META_KEY = 'lattice-sync-meta'
const PUSH_DEBOUNCE_MS = 10_000

function loadMeta(): SyncMeta {
  try {
    const raw = localStorage.getItem(META_KEY)
    if (raw) return { projectPush: {}, bodyPush: {}, uploadedAssets: [], ...JSON.parse(raw) }
  } catch {
    /* corrupted meta → resync from scratch (uploads are idempotent) */
  }
  return { lastSyncAt: null, projectPush: {}, bodyPush: {}, uploadedAssets: [] }
}

class SyncEngine {
  private drive: GoogleDriveStorageProvider | null = null
  private meta: SyncMeta = loadMeta()
  private unsubscribe: (() => void) | null = null
  private pushTimer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private busy = false

  private saveMeta() {
    localStorage.setItem(META_KEY, JSON.stringify(this.meta))
  }

  /** Begin syncing (called after Google sign-in / session restore). */
  start(): void {
    if (this.running) return
    if (authService.kind !== 'google') {
      // mock accounts are local-only — never pretend to sync
      useSyncStore.getState().setProvider('none')
      useSyncStore.getState().setStatus('disabled')
      return
    }
    this.running = true
    this.drive = new GoogleDriveStorageProvider(() => authService.getAccessToken())
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

  stop(): void {
    this.running = false
    this.unsubscribe?.()
    this.unsubscribe = null
    if (this.pushTimer) clearTimeout(this.pushTimer)
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
    const message =
      err instanceof DriveApiError && err.status === 401
        ? 'Google Drive session expired — sign in again to resume sync'
        : err instanceof Error
          ? err.message
          : 'Sync failed'
    console.error('[sync]', err)
    useSyncStore.getState().setStatus('error', message)
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

  /* ---------------- pull ---------------- */

  private async pull(): Promise<void> {
    const drive = this.drive!
    const projectFolders = await drive.listFolder(['projects'])
    const conflicts: SyncConflict[] = []

    for (const folder of projectFolders) {
      const snapMeta = await drive.findFile(['projects', folder.name], 'project.json')
      if (!snapMeta) continue
      const snapshot = await drive.downloadJson<ProjectSnapshot>(snapMeta.id)
      if (snapshot?.app !== 'lattice-project' || !snapshot.project) continue
      await this.mergeSnapshot(snapshot, conflicts)
    }
    if (conflicts.length) useSyncStore.getState().addConflicts(conflicts)
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
    ): { next: Record<string, T>; pulledIds: string[] } => {
      const next = { ...local }
      const pulledIds: string[] = []
      for (const [id, remoteEntity] of Object.entries(remote)) {
        const localEntity = local[id]
        const res = resolveVersions(localEntity, remoteEntity)
        if (res !== 'remote') continue
        if (isConflict(localEntity, remoteEntity, lastSyncAt)) {
          conflicts.push(describeConflict(kind, localEntity!, remoteEntity, 'remote'))
        }
        next[id] = remoteEntity
        pulledIds.push(id)
      }
      return { next, pulledIds }
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

    // fetch bodies for entities where remote won; back up local first when
    // the local copy had unpushed edits (conflict case)
    const pullBody = async (
      id: string,
      folder: string,
      name: string,
      json: boolean,
      remoteUpdatedAt: number,
    ) => {
      const hadUnpushedLocal = (this.meta.bodyPush[id] ?? 0) > 0 &&
        (await storage.getDocument(id)) !== undefined &&
        isConflict(
          { id, updatedAt: this.meta.bodyPush[id] ?? 0 },
          { id, updatedAt: remoteUpdatedAt },
          lastSyncAt,
        )
      if (hadUnpushedLocal) {
        const localBody = await storage.getDocument(id)
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

    for (const id of docs.pulledIds) {
      await pullBody(id, 'documents', `${id}.json`, true, snapshot.docs[id].updatedAt)
    }
    for (const id of sheetDocs.pulledIds) {
      await pullBody(id, 'spreadsheets', `${id}.json`, true, snapshot.sheetDocs[id].updatedAt)
    }
    for (const id of codeDocs.pulledIds) {
      const c = snapshot.codeDocs[id]
      await pullBody(id, 'code', `${id}.${c.extension || 'txt'}`, false, c.updatedAt)
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
