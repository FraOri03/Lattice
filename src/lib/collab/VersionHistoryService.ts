import type { JSONContent } from '@tiptap/core'
import { nid } from '@/lib/id'
import { storage } from '@/lib/storage/StorageProvider'
import { useStore } from '@/store/useStore'
import { plainText } from '@/lib/richdoc/docjson'
import type { Board } from '@/types/model'
import type { VersionEntry, VersionTargetType } from '@/types/collab'
import { useCollabStore } from './collabStore'
import { currentIdentity } from './CollaborationProvider'
import { activityLog } from './ActivityLogService'
import { collabHub } from './hub'
import { yjsManager } from '@/lib/crdt/YjsManager'

/**
 * VersionHistoryService — point-in-time snapshots for boards, rich
 * documents, code files and project metadata.
 *
 * The index (VersionEntry[]) lives in the collab store and syncs like the
 * rest of the durable collab state; snapshot payloads live in the
 * StorageProvider under "version:<id>" keys (IndexedDB — local to this
 * device unless Drive sync is on for bodies, which is a documented
 * limitation). Restoring always snapshots the current state first, so a
 * restore can itself be undone from the history.
 */

const MAX_VERSIONS_PER_TARGET = 30

interface SnapshotPayload {
  targetType: VersionTargetType
  /** board object / Tiptap JSON / code text / project meta */
  data: unknown
  title: string
}

function refFor(id: string): string {
  return `version:${id}`
}

class VersionHistoryService {
  versionsOf(projectId: string): VersionEntry[] {
    return useCollabStore.getState().versions[projectId] ?? []
  }

  versionsForTarget(projectId: string, targetId: string): VersionEntry[] {
    return this.versionsOf(projectId).filter((v) => v.targetId === targetId)
  }

  /** Create a snapshot of the target's CURRENT state. */
  async create(
    projectId: string,
    targetType: VersionTargetType,
    targetId: string,
    label: string,
    changeSummary = '',
  ): Promise<VersionEntry | null> {
    const captured = await this.capture(targetType, targetId)
    if (!captured) return null

    const identity = currentIdentity()
    const entry: VersionEntry = {
      id: nid('ver'),
      projectId,
      targetType,
      targetId,
      targetTitle: captured.title,
      createdAt: Date.now(),
      createdBy: identity.userId,
      createdByName: identity.name,
      label: label || 'Snapshot',
      changeSummary,
      snapshotRef: refFor(nid('snap')),
    }
    const payload: SnapshotPayload = {
      targetType,
      data: captured.data,
      title: captured.title,
    }
    await storage.putDocument(entry.snapshotRef, payload)
    // durability (Phase 8): mirror the body into the project's collab
    // CRDT doc so versions are restorable from OTHER devices too, not
    // just indexed remotely with the payload stranded here
    this.mirrorPayload(projectId, entry.snapshotRef, payload)

    const s = useCollabStore.getState()
    const forTarget = this.versionsForTarget(projectId, targetId)
    // cap history per target; drop (and clean up) the oldest
    const overflow = forTarget.slice(MAX_VERSIONS_PER_TARGET - 1)
    for (const v of overflow) {
      void storage.deleteDocument(v.snapshotRef)
      this.dropMirroredPayload(projectId, v.snapshotRef)
    }
    const overflowIds = new Set(overflow.map((v) => v.id))
    s.setVersions(projectId, [
      entry,
      ...this.versionsOf(projectId).filter((v) => !overflowIds.has(v.id)),
    ])
    activityLog.log(
      projectId,
      'version.created',
      `Version “${entry.label}” of ${captured.title}`,
      targetId,
    )
    collabHub.broadcastState(projectId)
    return entry
  }

  /* ---------------- durable payloads (Phase 8) ---------------- */

  /** Bodies ≤ 200 KB ride the collab CRDT doc (synced across devices). */
  private mirrorPayload(projectId: string, ref: string, payload: SnapshotPayload): void {
    try {
      const json = JSON.stringify(payload)
      if (json.length > 200_000) return // large bodies stay device-local
      const room = yjsManager.room(projectId)
      room.transactCollab(() => room.collab.getMap('versionBodies').set(ref, json))
    } catch {
      // mirroring is best-effort; the local snapshot always exists
    }
  }

  private dropMirroredPayload(projectId: string, ref: string): void {
    try {
      const room = yjsManager.room(projectId)
      room.transactCollab(() => room.collab.getMap('versionBodies').delete(ref))
    } catch {
      // best-effort
    }
  }

  /** Local snapshot first; falls back to the CRDT-synced body. */
  private async loadPayload(version: VersionEntry): Promise<SnapshotPayload | undefined> {
    const local = (await storage.getDocument(version.snapshotRef)) as
      | SnapshotPayload
      | undefined
    if (local) return local
    try {
      const room = yjsManager.room(version.projectId)
      await room.loaded
      const raw = room.collab.getMap('versionBodies').get(version.snapshotRef)
      if (typeof raw !== 'string') return undefined
      const payload = JSON.parse(raw) as SnapshotPayload
      void storage.putDocument(version.snapshotRef, payload) // cache locally
      return payload
    } catch {
      return undefined
    }
  }

  /** Restore a snapshot over the current state (current state is snapshotted first). */
  async restore(version: VersionEntry): Promise<boolean> {
    const payload = await this.loadPayload(version)
    if (!payload) return false

    // safety net: capture what we are about to overwrite
    await this.create(
      version.projectId,
      version.targetType,
      version.targetId,
      'Before restore',
      `Automatic snapshot before restoring “${version.label}”`,
    )

    const s = useStore.getState()
    switch (version.targetType) {
      case 'board': {
        const board = payload.data as Board
        if (!s.boards[version.targetId]) return false
        useStore.setState({
          boards: { ...s.boards, [version.targetId]: { ...board, id: version.targetId } },
        })
        break
      }
      case 'doc': {
        if (!s.docs[version.targetId]) return false
        s.persistDocContent(version.targetId, payload.data as JSONContent)
        break
      }
      case 'code': {
        if (!s.codeDocs[version.targetId]) return false
        s.persistCodeContent(version.targetId, String(payload.data))
        break
      }
      case 'sheet': {
        if (!s.sheetDocs[version.targetId] || !payload.data) return false
        const { normalizeBody } = await import('@/lib/sheet/sheetModel')
        s.persistSheetBody(version.targetId, normalizeBody(payload.data))
        break
      }
      case 'present': {
        if (!s.presentDocs[version.targetId] || !payload.data) return false
        const { normalizePresentBody } = await import('@/lib/present/presentModel')
        s.persistPresentBody(version.targetId, normalizePresentBody(payload.data))
        break
      }
      case 'project': {
        const meta = payload.data as { name: string; description: string; icon: string }
        s.updateProject(version.targetId, {
          name: meta.name,
          description: meta.description,
          icon: meta.icon,
        })
        break
      }
    }
    activityLog.log(
      version.projectId,
      'version.restored',
      `Restored “${version.label}” of ${version.targetTitle}`,
      version.targetId,
    )
    return true
  }

  /** Materialize a snapshot as a NEW entity next to the original. */
  async duplicate(version: VersionEntry): Promise<boolean> {
    const payload = await this.loadPayload(version)
    if (!payload) return false
    const s = useStore.getState()
    switch (version.targetType) {
      case 'board': {
        const src = payload.data as Board
        const id = nid('board')
        const copy: Board = {
          ...src,
          id,
          name: `${src.name} (from version)`,
          projectId: version.projectId,
        }
        useStore.setState((st) => ({
          boards: { ...st.boards, [id]: copy },
          boardOrder: [...st.boardOrder, id],
        }))
        return true
      }
      case 'doc': {
        const id = s.createDoc({
          title: `${payload.title} (from version)`,
          projectId: version.projectId,
        })
        s.persistDocContent(id, payload.data as JSONContent)
        return true
      }
      case 'code': {
        const src = s.codeDocs[version.targetId]
        const id = s.createCode({
          title: `${payload.title.replace(/\.[^.]*$/, '')}-copy`,
          language: src?.language,
          extension: src?.extension,
          projectId: version.projectId,
        })
        s.persistCodeContent(id, String(payload.data))
        return true
      }
      default:
        return false
    }
  }

  /**
   * Plain-text rendering of a snapshot for the diff view. Boards render
   * as a stable card inventory (id · type · title · position) so two
   * board versions can still be compared line-by-line.
   */
  async textOf(version: VersionEntry): Promise<string | null> {
    const payload = await this.loadPayload(version)
    if (!payload) return null
    switch (payload.targetType) {
      case 'code':
        return String(payload.data)
      case 'doc':
        return plainText(payload.data as JSONContent)
      case 'board': {
        const board = payload.data as Board
        return board.nodes
          .map(
            (n) =>
              `${n.type ?? 'card'} · ${String(n.data.title ?? n.data.section?.title ?? n.id)} @ ${Math.round(n.position.x)},${Math.round(n.position.y)}`,
          )
          .sort()
          .join('\n')
      }
      case 'sheet':
        return sheetInventory(payload.data)
      case 'present':
        return presentInventory(payload.data)
      case 'project':
        return JSON.stringify(payload.data, null, 2)
    }
  }

  /** Current live text of a target, for "version vs now" diffs. */
  async currentTextOf(version: VersionEntry): Promise<string | null> {
    const s = useStore.getState()
    switch (version.targetType) {
      case 'code': {
        const body = await storage.getDocument(version.targetId)
        return typeof body === 'string' ? body : ''
      }
      case 'doc': {
        const body = (await storage.getDocument(version.targetId)) as
          | JSONContent
          | undefined
        return body ? plainText(body) : ''
      }
      case 'board': {
        const board = s.boards[version.targetId]
        if (!board) return null
        return board.nodes
          .map(
            (n) =>
              `${n.type ?? 'card'} · ${String(n.data.title ?? n.data.section?.title ?? n.id)} @ ${Math.round(n.position.x)},${Math.round(n.position.y)}`,
          )
          .sort()
          .join('\n')
      }
      case 'sheet': {
        const body = await storage.getDocument(version.targetId)
        return body ? sheetInventory(body) : ''
      }
      case 'present': {
        const body = await storage.getDocument(version.targetId)
        return body ? presentInventory(body) : ''
      }
      case 'project': {
        const p = s.projects[version.targetId]
        return p ? JSON.stringify({ name: p.name, description: p.description, icon: p.icon }, null, 2) : null
      }
    }
  }

  private async capture(
    targetType: VersionTargetType,
    targetId: string,
  ): Promise<{ data: unknown; title: string } | null> {
    const s = useStore.getState()
    switch (targetType) {
      case 'board': {
        const board = s.boards[targetId]
        return board ? { data: board, title: board.name } : null
      }
      case 'doc': {
        const meta = s.docs[targetId]
        if (!meta) return null
        const body = await storage.getDocument(targetId)
        return { data: body ?? { type: 'doc', content: [] }, title: meta.title }
      }
      case 'code': {
        const meta = s.codeDocs[targetId]
        if (!meta) return null
        const body = await storage.getDocument(targetId)
        return {
          data: typeof body === 'string' ? body : '',
          title: `${meta.title}.${meta.extension}`,
        }
      }
      case 'sheet': {
        const meta = s.sheetDocs[targetId]
        if (!meta) return null
        const body = await storage.getDocument(targetId)
        return { data: body ?? null, title: meta.title }
      }
      case 'present': {
        const meta = s.presentDocs[targetId]
        if (!meta) return null
        const body = await storage.getDocument(targetId)
        return { data: body ?? null, title: meta.title }
      }
      case 'project': {
        const p = s.projects[targetId]
        return p
          ? {
              data: { name: p.name, description: p.description, icon: p.icon },
              title: p.name,
            }
          : null
      }
    }
  }
}

/**
 * Stable line inventory of a workbook (one line per non-empty cell) —
 * diffing two versions yields exactly the changed-cell summary.
 */
function sheetInventory(raw: unknown): string {
  const body = raw as {
    sheets?: { name?: string; cells?: Record<string, { v?: unknown; f?: string }> }[]
  }
  if (!Array.isArray(body?.sheets)) return ''
  const lines: string[] = []
  for (const sheet of body.sheets) {
    for (const [key, cell] of Object.entries(sheet.cells ?? {})) {
      const value = cell?.f ? `=${cell.f}` : String(cell?.v ?? '')
      if (value !== '') lines.push(`${sheet.name ?? 'Sheet'}!${key}: ${value}`)
    }
  }
  return lines.sort().join('\n')
}

/** Stable line inventory of a deck (slide + element text/geometry). */
function presentInventory(raw: unknown): string {
  const body = raw as {
    slides?: {
      elements?: { kind?: string; text?: string; x?: number; y?: number }[]
      notes?: string
    }[]
  }
  if (!Array.isArray(body?.slides)) return ''
  return body.slides
    .map((slide, i) => {
      const els = (slide.elements ?? [])
        .map(
          (el) =>
            `  ${el.kind ?? 'el'} @ ${Math.round(el.x ?? 0)},${Math.round(el.y ?? 0)}${el.text ? `: ${el.text.replace(/\n/g, ' ⏎ ')}` : ''}`,
        )
        .join('\n')
      return `slide ${i + 1}\n${els}${slide.notes ? `\n  notes: ${slide.notes}` : ''}`
    })
    .join('\n')
}

export const versionHistory = new VersionHistoryService()
