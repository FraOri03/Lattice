import { backlinksToTitle, useStore } from '@/store/useStore'
import { downloadAsset } from '@/lib/assets/AssetRegistry'
import {
  EXPORT_FORMATS,
  exportDocument,
  type ExportFormat,
} from '@/lib/export/ExportService'
import { KIND_ICONS } from '@/components/assetKinds'
import { DocumentOutline } from '@/components/richdoc/DocumentOutline'
import { IcDownload, IcTrash } from '@/components/Icons'

/**
 * Right panel of the document workspace: metadata, outline, linked
 * assets, backlinks and export options.
 */
export function DocumentInspector() {
  const doc = useStore((s) => (s.activeDocId ? s.docs[s.activeDocId] : undefined))
  const notes = useStore((s) => s.notes)
  const docs = useStore((s) => s.docs)
  const codeDocs = useStore((s) => s.codeDocs)
  const assets = useStore((s) => s.assets)
  const openNote = useStore((s) => s.openNote)
  const openDoc = useStore((s) => s.openDoc)
  const openAsset = useStore((s) => s.openAsset)
  const openCode = useStore((s) => s.openCode)
  const updateDocMeta = useStore((s) => s.updateDocMeta)
  const deleteDoc = useStore((s) => s.deleteDoc)

  if (!doc) return null

  const backlinks = backlinksToTitle(notes, docs, codeDocs, doc.title, doc.id)
  const sourceAsset = doc.sourceAssetId ? assets[doc.sourceAssetId] : undefined

  const onExport = async (format: ExportFormat) => {
    try {
      await exportDocument(doc, format)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Export failed')
    }
  }

  return (
    <aside className="w-70 flex-none overflow-y-auto border-l border-bord bg-panel px-4 pb-6">
      <div className="insp-h">Document</div>
      <div className="grid grid-cols-2 gap-x-3 text-[11px] text-muted">
        <span>{doc.wordCount} words</span>
        <span>{doc.outline.length} headings</span>
        <span>created {new Date(doc.createdAt).toLocaleDateString()}</span>
        <span>edited {new Date(doc.updatedAt).toLocaleDateString()}</span>
      </div>
      <input
        key={`tags-${doc.id}`}
        className="field mt-2"
        defaultValue={doc.tags.join(', ')}
        placeholder="tags, comma, separated"
        onBlur={(e) =>
          updateDocMeta(doc.id, {
            tags: e.target.value
              .split(',')
              .map((t) => t.trim().toLowerCase())
              .filter(Boolean),
          })
        }
      />

      <div className="insp-h">Outline</div>
      <DocumentOutline doc={doc} />

      {doc.linkedAssets.length > 0 && (
        <>
          <div className="insp-h">Linked assets</div>
          {doc.linkedAssets.map((id) => {
            const asset = assets[id]
            if (!asset) return null
            const Icon = KIND_ICONS[asset.kind]
            return (
              <button
                key={id}
                className="flex w-full cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-left text-xs text-muted hover:bg-panel2 hover:text-ink"
                onClick={() => openAsset(id)}
              >
                <Icon size={12} />
                <span className="min-w-0 flex-1 truncate">{asset.name}</span>
              </button>
            )
          })}
        </>
      )}

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
      <div className="flex flex-col gap-1.5">
        {EXPORT_FORMATS.map((f) => (
          <button
            key={f.format}
            className="btn justify-between"
            title={f.note ?? `Export as ${f.label}`}
            onClick={() => void onExport(f.format)}
          >
            <span className="flex items-center gap-1.5">
              <IcDownload size={12} /> {f.label}
            </span>
            {f.status === 'planned' && (
              <span className="rounded bg-panel px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-muted uppercase">
                planned
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="insp-h">Danger</div>
      <button
        className="btn w-full text-[#f24822]"
        onClick={() => {
          if (confirm(`Delete document "${doc.title}" and its cards on all boards?`))
            deleteDoc(doc.id)
        }}
      >
        <IcTrash size={12} /> Delete document
      </button>
    </aside>
  )
}
