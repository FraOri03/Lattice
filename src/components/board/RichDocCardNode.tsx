import type { NodeProps } from '@xyflow/react'
import type { BoardNode } from '@/types/model'
import { useStore } from '@/store/useStore'
import { RichTextEditor } from '@/components/richdoc/RichTextEditor'
import { IcDoc } from '@/components/Icons'
import { CardChrome } from './CardChrome'

/**
 * Rich document board card.
 *  - compact:  title + snippet + metadata (double-click → workspace)
 *  - expanded: live inline editor
 * Full mode is the document workspace itself (openDoc).
 */
export function RichDocCardNode({ data, selected }: NodeProps<BoardNode>) {
  const meta = useStore((s) => (data.docId ? s.docs[data.docId] : undefined))
  const openDoc = useStore((s) => s.openDoc)

  if (!meta) {
    return (
      <CardChrome
        data={data}
        selected={selected}
        icon={<IcDoc size={13} />}
        title="Missing document"
        minWidth={180}
        minHeight={90}
      >
        <div className="placeholder">This document was deleted</div>
      </CardChrome>
    )
  }

  const mode = data.mode ?? 'compact'

  return (
    <CardChrome
      data={data}
      selected={selected}
      icon={<IcDoc size={13} />}
      title={meta.title}
      minWidth={220}
      minHeight={120}
    >
      {mode === 'compact' ? (
        <div
          className="flex h-full cursor-default flex-col px-3 py-2"
          onDoubleClick={() => openDoc(meta.id)}
          title="Double-click to open in the workspace"
        >
          <p className="min-h-0 flex-1 overflow-hidden text-[12px] leading-relaxed text-muted">
            {meta.snippet || 'Empty document — double-click to write'}
          </p>
          <div className="flex flex-none items-center gap-2 pt-1.5 text-[10.5px] text-muted">
            <span>{meta.wordCount} words</span>
            <span>·</span>
            <span>edited {new Date(meta.updatedAt).toLocaleDateString()}</span>
            {meta.sourceAssetId && (
              <>
                <span>·</span>
                <span>from DOCX</span>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="h-full min-h-0">
          <RichTextEditor docId={meta.id} variant="mini" />
        </div>
      )}
    </CardChrome>
  )
}
