import { backlinksToTitle, useStore } from '@/store/useStore'
import type { CodeEditingPolicy } from '@/types/model'
import { storage } from '@/lib/storage/StorageProvider'
import { downloadAsset } from '@/lib/assets/AssetRegistry'
import { downloadText } from '@/lib/download'
import { formatBytes } from '@/lib/media'
import { labelForLang } from '@/lib/code/languages'
import { useCan } from '@/lib/collab/useCollab'
import { yjsManager } from '@/lib/crdt/YjsManager'
import { reconciledCode } from '@/lib/crdt/CodeCRDT'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { IcTrash } from '@/components/Icons'
import { ActionIcon } from '@/components/ActionIcons'

/** Right panel of the code workspace: metadata, source file, backlinks, export. */
export function CodeInspector() {
  const meta = useStore((s) => (s.activeCodeId ? s.codeDocs[s.activeCodeId] : undefined))
  const notes = useStore((s) => s.notes)
  const docs = useStore((s) => s.docs)
  const codeDocs = useStore((s) => s.codeDocs)
  const assets = useStore((s) => s.assets)
  const openNote = useStore((s) => s.openNote)
  const openDoc = useStore((s) => s.openDoc)
  const openCode = useStore((s) => s.openCode)
  const deleteCode = useStore((s) => s.deleteCode)
  const project = useStore((s) => s.projects[s.activeProjectId])
  const updateProject = useStore((s) => s.updateProject)
  const canSettings = useCan('project.settings')

  if (!meta) return null

  const backlinks = backlinksToTitle(notes, docs, codeDocs, meta.title, meta.id)
  const sourceAsset = meta.sourceAssetId ? assets[meta.sourceAssetId] : undefined
  const policy: CodeEditingPolicy =
    project?.settings.codeEditingPolicy ?? 'collaborative'

  const setPolicy = (next: CodeEditingPolicy) => {
    if (!project) return
    updateProject(project.id, {
      settings: { ...project.settings, codeEditingPolicy: next },
    })
  }

  const download = async () => {
    // prefer the reconciled CRDT state (may hold unmerged remote edits)
    const projectId = meta.projectId ?? useStore.getState().activeProjectId
    const merged = reconciledCode(yjsManager.room(projectId), meta.id)
    const content = merged ?? (await storage.getDocument(meta.id))
    downloadText(
      `${meta.title}.${meta.extension}`,
      typeof content === 'string' ? content : '',
    )
  }

  return (
    <aside className="w-70 flex-none overflow-y-auto border-l border-bord bg-panel px-4 pb-6">
      <div className="insp-h">Code file</div>
      <div className="grid grid-cols-2 gap-x-3 text-[11px] text-muted">
        <span>{labelForLang(meta.language)}</span>
        <span>.{meta.extension}</span>
        <span>{meta.lineCount} lines</span>
        <span>{formatBytes(meta.size)}</span>
        <span>created {new Date(meta.createdAt).toLocaleDateString()}</span>
        <span>edited {new Date(meta.updatedAt).toLocaleDateString()}</span>
      </div>

      {sourceAsset && (
        <>
          <div className="insp-h">Source file</div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="min-w-0 flex-1 truncate" title={sourceAsset.originalName}>
              {sourceAsset.originalName}
            </span>
            <button
              className="icon-btn h-6 w-6"
              title="Download original"
              aria-label="Download original file"
              onClick={() => void downloadAsset(sourceAsset)}
            >
              <ActionIcon.DownloadLocal size={12} />
            </button>
          </div>
        </>
      )}

      {meta.outgoingLinks.length > 0 && (
        <>
          <div className="insp-h">Links in this file</div>
          {meta.outgoingLinks.map((l) => (
            <button
              key={l}
              className="block w-full cursor-pointer truncate rounded px-2 py-1 text-left text-xs text-accent hover:bg-panel2"
              onClick={() => useStore.getState().openWikilink(l)}
            >
              [[{l}]]
            </button>
          ))}
        </>
      )}

      {(backlinks.notes.length > 0 ||
        backlinks.docs.length > 0 ||
        backlinks.code.length > 0) && (
        <>
          <div className="insp-h">Backlinks</div>
          {backlinks.notes.map((n) => (
            <button
              key={n.id}
              className="block w-full cursor-pointer truncate rounded px-2 py-1 text-left text-xs text-accent hover:bg-panel2"
              onClick={() => openNote(n.id)}
            >
              ← {n.title} <span className="text-muted">(note)</span>
            </button>
          ))}
          {backlinks.docs.map((d) => (
            <button
              key={d.id}
              className="block w-full cursor-pointer truncate rounded px-2 py-1 text-left text-xs text-accent hover:bg-panel2"
              onClick={() => openDoc(d.id)}
            >
              ← {d.title} <span className="text-muted">(document)</span>
            </button>
          ))}
          {backlinks.code.map((c) => (
            <button
              key={c.id}
              className="block w-full cursor-pointer truncate rounded px-2 py-1 text-left text-xs text-accent hover:bg-panel2"
              onClick={() => openCode(c.id)}
            >
              ← {c.title}.{c.extension} <span className="text-muted">(code)</span>
            </button>
          ))}
        </>
      )}

      <div className="insp-h">Collaboration</div>
      <div
        role="radiogroup"
        aria-label="Code editing policy"
        className="flex flex-col gap-1 text-xs"
      >
        {(
          [
            {
              value: 'collaborative',
              label: 'Collaborative',
              hint: 'Everyone edits together — changes merge automatically (CRDT).',
            },
            {
              value: 'checkout',
              label: 'Checkout required',
              hint: 'One editor at a time — others request control; admins can force-unlock.',
            },
          ] as const
        ).map((opt) => (
          <label
            key={opt.value}
            className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2 py-1.5 ${
              policy === opt.value ? 'border-accent bg-accent-soft' : 'border-bord'
            } ${canSettings ? '' : 'cursor-not-allowed opacity-60'}`}
            title={opt.hint}
          >
            <input
              type="radio"
              name="code-editing-policy"
              className="mt-0.5"
              checked={policy === opt.value}
              disabled={!canSettings}
              onChange={() => setPolicy(opt.value)}
            />
            <span>
              <span className="block font-semibold">{opt.label}</span>
              <span className="block text-[10.5px] text-muted">{opt.hint}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="insp-h">Export</div>
      <button
        className="btn w-full"
        title="Export the reconciled file to this device"
        onClick={() => void download()}
      >
        <ActionIcon.Export size={12} /> Download {meta.title}.{meta.extension}
      </button>

      <div className="insp-h">Danger</div>
      <button
        className="btn w-full text-[#f24822]"
        onClick={async () => {
          if (
            await confirmDialog({
              title: `Delete “${meta.title}.${meta.extension}”?`,
              body: 'The file and its cards on all boards are removed.',
              confirmLabel: 'Delete file',
              danger: true,
            })
          )
            deleteCode(meta.id)
        }}
      >
        <IcTrash size={12} /> Delete code file
      </button>
    </aside>
  )
}
