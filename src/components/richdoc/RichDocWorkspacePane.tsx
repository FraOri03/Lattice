import type { RichDocMeta } from '@/types/model'
import { useStore } from '@/store/useStore'
import { IcDoc, IcX } from '@/components/Icons'
import { RichTextEditor } from './RichTextEditor'

/** Center pane of the document workspace: title bar + full editor. */
export function RichDocWorkspacePane({ doc }: { doc: RichDocMeta }) {
  const updateDocMeta = useStore((s) => s.updateDocMeta)
  const closeDoc = useStore((s) => s.closeDoc)

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col border-r border-bord bg-panel">
      <div className="flex flex-none items-center gap-2 border-b border-bord px-4 py-2">
        <IcDoc size={15} className="flex-none text-muted" />
        <input
          className="min-w-0 flex-1 bg-transparent text-[15px] font-bold outline-none"
          value={doc.title}
          onChange={(e) => updateDocMeta(doc.id, { title: e.target.value })}
          placeholder="Untitled document"
        />
        <span className="flex-none text-[11px] text-muted">
          {doc.wordCount} words
        </span>
        <button className="icon-btn" title="Close document" onClick={closeDoc}>
          <IcX size={14} />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <RichTextEditor docId={doc.id} variant="full" />
      </div>
    </section>
  )
}
