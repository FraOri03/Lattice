import { backlinksToTitle, useStore } from '@/store/useStore'
import { storage } from '@/lib/storage/StorageProvider'
import { downloadAsset } from '@/lib/assets/AssetRegistry'
import { downloadText } from '@/lib/download'
import { formatBytes } from '@/lib/media'
import { labelForLang } from '@/lib/code/languages'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { IcDownload, IcTrash } from '@/components/Icons'

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

  if (!meta) return null

  const backlinks = backlinksToTitle(notes, docs, codeDocs, meta.title, meta.id)
  const sourceAsset = meta.sourceAssetId ? assets[meta.sourceAssetId] : undefined

  const download = async () => {
    const content = await storage.getDocument(meta.id)
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
              onClick={() => void downloadAsset(sourceAsset)}
            >
              <IcDownload size={12} />
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

      <div className="insp-h">Export</div>
      <button className="btn w-full" onClick={() => void download()}>
        <IcDownload size={12} /> Download {meta.title}.{meta.extension}
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
