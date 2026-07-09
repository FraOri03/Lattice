import { lazy, Suspense } from 'react'
import type { NodeProps } from '@xyflow/react'
import type { BoardNode } from '@/types/model'
import { useStore } from '@/store/useStore'
import { formatBytes } from '@/lib/media'
import { labelForLang } from '@/lib/code/languages'
import { IcCode } from '@/components/Icons'
import { CardChrome } from './CardChrome'

// Monaco lives in the lazy code chunk — only loads when a card expands.
const LazyCodeEditor = lazy(() => import('@/components/code/CodeEditor'))

/**
 * Code board card.
 *  - compact:  filename, language, line count (double-click → workspace)
 *  - expanded: read-only Monaco preview
 */
export function CodeCardNode({ data, selected }: NodeProps<BoardNode>) {
  const meta = useStore((s) => (data.codeId ? s.codeDocs[data.codeId] : undefined))
  const openCode = useStore((s) => s.openCode)

  if (!meta) {
    return (
      <CardChrome
        data={data}
        selected={selected}
        icon={<IcCode size={13} />}
        title="Missing code file"
        minWidth={180}
        minHeight={90}
      >
        <div className="placeholder">This code file was deleted</div>
      </CardChrome>
    )
  }

  const mode = data.mode ?? 'compact'

  return (
    <CardChrome
      data={data}
      selected={selected}
      icon={<IcCode size={13} />}
      title={`${meta.title}.${meta.extension}`}
      minWidth={220}
      minHeight={110}
    >
      {mode === 'compact' ? (
        <div
          className="flex h-full flex-col px-3 py-2"
          onDoubleClick={() => openCode(meta.id)}
          title="Double-click to open in the code workspace"
        >
          <pre className="min-h-0 flex-1 overflow-hidden font-mono text-[11px] leading-relaxed whitespace-pre text-muted">
            {meta.snippet || '// empty file — double-click to edit'}
          </pre>
          <div className="flex flex-none items-center gap-2 pt-1.5 text-[10.5px] text-muted">
            <span>{labelForLang(meta.language)}</span>
            <span>·</span>
            <span>{meta.lineCount} lines</span>
            <span>·</span>
            <span>{formatBytes(meta.size)}</span>
          </div>
        </div>
      ) : (
        <div
          className="nodrag nowheel h-full min-h-0"
          onDoubleClick={() => openCode(meta.id)}
        >
          <Suspense fallback={<div className="placeholder">Loading editor…</div>}>
            <LazyCodeEditor codeId={meta.id} readOnly mini />
          </Suspense>
        </div>
      )}
    </CardChrome>
  )
}
