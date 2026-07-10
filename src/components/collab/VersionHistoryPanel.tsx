import { useMemo, useState } from 'react'
import { useStore } from '@/store/useStore'
import { useCollabStore } from '@/lib/collab/collabStore'
import { versionHistory } from '@/lib/collab/VersionHistoryService'
import { useCan } from '@/lib/collab/useCollab'
import type { VersionEntry, VersionTargetType } from '@/types/collab'
import { toast } from '@/components/ui/Toaster'
import { confirmDialog, promptDialog } from '@/components/ui/ConfirmDialog'
import {
  IcBoard,
  IcCode,
  IcCopy,
  IcDoc,
  IcFolder,
  IcHistory,
  IcPlus,
  IcPresentation,
  IcRestore,
  IcSplit,
  IcTable,
} from '@/components/Icons'

/**
 * VersionHistoryPanel — snapshots of boards, documents, code files,
 * sheets, presentations and project metadata: create, restore,
 * duplicate, and a line diff against the current state (sheets diff as
 * a changed-cell inventory, decks as a slide inventory).
 */

const TARGET_ICON: Record<VersionTargetType, React.ReactNode> = {
  board: <IcBoard size={12} />,
  doc: <IcDoc size={12} />,
  code: <IcCode size={12} />,
  sheet: <IcTable size={12} />,
  present: <IcPresentation size={12} />,
  project: <IcFolder size={12} />,
}

/* ---------------- minimal line diff (LCS) ---------------- */

interface DiffLine {
  kind: 'same' | 'add' | 'del'
  text: string
}

const DIFF_LINE_CAP = 400

function diffLines(a: string, b: string): DiffLine[] | null {
  const A = a.split('\n')
  const B = b.split('\n')
  if (A.length > DIFF_LINE_CAP || B.length > DIFF_LINE_CAP) return null
  const n = A.length
  const m = B.length
  // LCS table
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      out.push({ kind: 'same', text: A[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: 'del', text: A[i] })
      i++
    } else {
      out.push({ kind: 'add', text: B[j] })
      j++
    }
  }
  while (i < n) out.push({ kind: 'del', text: A[i++] })
  while (j < m) out.push({ kind: 'add', text: B[j++] })
  return out
}

function DiffView({ version, onClose }: { version: VersionEntry; onClose: () => void }) {
  const [diff, setDiff] = useState<DiffLine[] | 'loading' | 'unavailable'>('loading')

  useMemo(() => {
    void (async () => {
      const [then, now] = await Promise.all([
        versionHistory.textOf(version),
        versionHistory.currentTextOf(version),
      ])
      if (then === null || now === null) {
        setDiff('unavailable')
        return
      }
      setDiff(diffLines(then, now) ?? 'unavailable')
    })()
  }, [version])

  return (
    <div className="mt-1.5 overflow-hidden rounded-lg border border-bord">
      <div className="flex items-center justify-between border-b border-bord bg-panel2 px-2 py-1">
        <span className="text-[10px] font-semibold text-muted">
          “{version.label}” → current
        </span>
        <button className="cursor-pointer text-[10px] text-accent hover:underline" onClick={onClose}>
          close
        </button>
      </div>
      <div className="max-h-56 overflow-auto bg-panel font-mono text-[10.5px] leading-relaxed">
        {diff === 'loading' && <div className="p-2 text-muted">Computing diff…</div>}
        {diff === 'unavailable' && (
          <div className="p-2 text-muted">
            Diff unavailable (snapshot missing or content too large).
          </div>
        )}
        {Array.isArray(diff) &&
          (diff.every((l) => l.kind === 'same') ? (
            <div className="p-2 text-muted">No differences.</div>
          ) : (
            diff
              .filter((l, idx) => {
                if (l.kind !== 'same') return true
                // context: keep same-lines adjacent to a change
                const prev = diff[idx - 1]
                const next = diff[idx + 1]
                return (prev && prev.kind !== 'same') || (next && next.kind !== 'same')
              })
              .slice(0, 300)
              .map((l, idx) => (
                <div
                  key={idx}
                  className={`px-2 whitespace-pre-wrap ${
                    l.kind === 'add'
                      ? 'bg-[#14ae5c]/12 text-[#14ae5c]'
                      : l.kind === 'del'
                        ? 'bg-[#f24822]/10 text-[#f24822] line-through decoration-[#f24822]/40'
                        : 'text-muted'
                  }`}
                >
                  {l.kind === 'add' ? '+ ' : l.kind === 'del' ? '− ' : '  '}
                  {l.text || ' '}
                </div>
              ))
          ))}
      </div>
    </div>
  )
}

function VersionRow({ version }: { version: VersionEntry }) {
  const [showDiff, setShowDiff] = useState(false)
  const mayRestore = useCan('versions.restore')
  const diffable = version.targetType !== 'project'

  return (
    <div className="mb-2 rounded-lg border border-bord p-2.5">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-md bg-panel2 text-muted">
          {TARGET_ICON[version.targetType]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold">{version.label}</div>
          <div className="truncate text-[10.5px] text-muted">
            {version.targetTitle} · {version.createdByName} ·{' '}
            {new Date(version.createdAt).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        </div>
      </div>
      {version.changeSummary && (
        <p className="mt-1 text-[11px] text-muted">{version.changeSummary}</p>
      )}
      <div className="mt-1.5 flex gap-1.5">
        {mayRestore && (
          <button
            className="btn !px-2 !py-1 text-[11px]"
            onClick={async () => {
              if (
                await confirmDialog({
                  title: `Restore “${version.label}”?`,
                  body: 'The current state is snapshotted first, so you can restore back.',
                  confirmLabel: 'Restore',
                })
              ) {
                const ok = await versionHistory.restore(version)
                if (ok) toast.success('Version restored', `“${version.label}” is now current.`)
                else toast.error('Restore failed', 'The target no longer exists.')
              }
            }}
          >
            <IcRestore size={11} /> Restore
          </button>
        )}
        {version.targetType !== 'project' && (
          <button
            className="btn !px-2 !py-1 text-[11px]"
            title="Create a new copy from this snapshot"
            onClick={async () => {
              const ok = await versionHistory.duplicate(version)
              if (ok) toast.success('Copy created from version')
              else toast.error('Could not duplicate this version')
            }}
          >
            <IcCopy size={11} /> Duplicate
          </button>
        )}
        {diffable && (
          <button className="btn !px-2 !py-1 text-[11px]" onClick={() => setShowDiff((v) => !v)}>
            <IcSplit size={11} /> {showDiff ? 'Hide diff' : 'Diff'}
          </button>
        )}
      </div>
      {showDiff && <DiffView version={version} onClose={() => setShowDiff(false)} />}
    </div>
  )
}

export function VersionHistoryPanel() {
  const projectId = useStore((s) => s.activeProjectId)
  const project = useStore((s) => s.projects[s.activeProjectId])
  const activeBoardId = useStore((s) => s.activeBoardId)
  const boards = useStore((s) => s.boards)
  const activeDocId = useStore((s) => s.activeDocId)
  const docs = useStore((s) => s.docs)
  const activeCodeId = useStore((s) => s.activeCodeId)
  const codeDocs = useStore((s) => s.codeDocs)
  const activeSheetId = useStore((s) => s.activeSheetId)
  const sheetDocs = useStore((s) => s.sheetDocs)
  const activePresentId = useStore((s) => s.activePresentId)
  const presentDocs = useStore((s) => s.presentDocs)
  const versions = useCollabStore((s) => s.versions[projectId]) ?? []
  const mayCreate = useCan('versions.create')

  /** What "Save version" snapshots right now, by visible context. */
  const snapTarget = useMemo((): {
    type: VersionTargetType
    id: string
    label: string
  } | null => {
    if (activeDocId && docs[activeDocId])
      return { type: 'doc', id: activeDocId, label: `doc “${docs[activeDocId].title}”` }
    if (activeCodeId && codeDocs[activeCodeId])
      return {
        type: 'code',
        id: activeCodeId,
        label: `${codeDocs[activeCodeId].title}.${codeDocs[activeCodeId].extension}`,
      }
    if (activeSheetId && sheetDocs[activeSheetId])
      return {
        type: 'sheet',
        id: activeSheetId,
        label: `sheet “${sheetDocs[activeSheetId].title}”`,
      }
    if (activePresentId && presentDocs[activePresentId])
      return {
        type: 'present',
        id: activePresentId,
        label: `deck “${presentDocs[activePresentId].title}”`,
      }
    const board = boards[activeBoardId]
    if (board) return { type: 'board', id: activeBoardId, label: `board “${board.name}”` }
    return null
  }, [
    activeDocId,
    docs,
    activeCodeId,
    codeDocs,
    activeSheetId,
    sheetDocs,
    activePresentId,
    presentDocs,
    boards,
    activeBoardId,
  ])

  const saveVersion = async (target: { type: VersionTargetType; id: string; label: string }) => {
    const label = await promptDialog({
      title: 'Save a version',
      body: `Snapshot of ${target.label}. You can restore or duplicate it later.`,
      label: 'Version label',
      placeholder: 'e.g. Before restructure',
      confirmLabel: 'Save version',
    })
    if (label === null) return
    const entry = await versionHistory.create(projectId, target.type, target.id, label || 'Snapshot')
    if (entry) toast.success('Version saved', `“${entry.label}” — ${target.label}`)
  }

  return (
    <div className="flex h-full flex-col">
      {mayCreate && (
        <div className="flex flex-col gap-1.5 px-3 pt-2 pb-1">
          {snapTarget && (
            <button className="btn w-full" onClick={() => void saveVersion(snapTarget)}>
              <IcPlus size={12} /> Save version of {snapTarget.label}
            </button>
          )}
          {project && (
            <button
              className="btn w-full !text-muted"
              onClick={() =>
                void saveVersion({ type: 'project', id: projectId, label: `project “${project.name}”` })
              }
            >
              <IcPlus size={12} /> Snapshot project metadata
            </button>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {versions.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted">
            <IcHistory size={22} />
            <p className="text-[12px]">No versions yet</p>
            <p className="max-w-52 text-[11px]">
              Save snapshots of boards, documents and code — restore or branch off a copy
              any time. A safety snapshot is taken before every restore.
            </p>
          </div>
        )}
        {versions.map((v) => (
          <VersionRow key={v.id} version={v} />
        ))}
      </div>
    </div>
  )
}
