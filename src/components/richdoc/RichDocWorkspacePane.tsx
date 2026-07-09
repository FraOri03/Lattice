import type { RichDocMeta } from '@/types/model'
import { useStore } from '@/store/useStore'
import { useCollabStore } from '@/lib/collab/collabStore'
import { useOpenCommentCount, usePeers, useReadOnly } from '@/lib/collab/useCollab'
import { IcDoc, IcHistory, IcMessage, IcX } from '@/components/Icons'
import { RichTextEditor } from './RichTextEditor'

/**
 * Center pane of the document workspace: title bar + full editor.
 * Phase 7: shows who else is editing this document, plus direct access
 * to its comments and version history.
 */
export function RichDocWorkspacePane({ doc }: { doc: RichDocMeta }) {
  const updateDocMeta = useStore((s) => s.updateDocMeta)
  const closeDoc = useStore((s) => s.closeDoc)
  const setPanel = useCollabStore((s) => s.setPanel)
  const readOnly = useReadOnly()
  const commentCount = useOpenCommentCount(doc.id)
  const peers = usePeers()
  const editingPeer = peers.find((p) => p.editing?.kind === 'doc' && p.editing.id === doc.id)

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col border-r border-bord bg-panel">
      <div className="flex flex-none items-center gap-2 border-b border-bord px-4 py-2">
        <IcDoc size={15} className="flex-none text-muted" />
        <input
          className="min-w-0 flex-1 bg-transparent text-[15px] font-bold outline-none"
          value={doc.title}
          disabled={readOnly}
          onChange={(e) => updateDocMeta(doc.id, { title: e.target.value })}
          placeholder="Untitled document"
          aria-label="Document title"
        />
        {editingPeer && (
          <span
            className="flex flex-none items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium"
            style={{ borderColor: editingPeer.color, color: editingPeer.color }}
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: editingPeer.color }} />
            {editingPeer.name} is editing…
          </span>
        )}
        <span className="flex-none text-[11px] text-muted">
          {doc.wordCount} words
        </span>
        <button
          className="icon-btn relative"
          title="Comments on this document"
          aria-label={`Comments${commentCount ? ` (${commentCount} open)` : ''}`}
          onClick={() => setPanel('comments')}
        >
          <IcMessage size={14} />
          {commentCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-0.5 text-[8.5px] font-bold text-white">
              {commentCount}
            </span>
          )}
        </button>
        <button
          className="icon-btn"
          title="Version history"
          aria-label="Version history"
          onClick={() => setPanel('versions')}
        >
          <IcHistory size={14} />
        </button>
        <button className="icon-btn" title="Close document" aria-label="Close document" onClick={closeDoc}>
          <IcX size={14} />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <RichTextEditor docId={doc.id} variant="full" />
      </div>
    </section>
  )
}
