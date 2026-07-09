import { lazy, Suspense } from 'react'
import type { NodeProps } from '@xyflow/react'
import type { BoardNode } from '@/types/model'
import { useStore } from '@/store/useStore'
import { IcTable } from '@/components/Icons'
import { CardChrome } from './CardChrome'

// The grid + FormulaEngine live in the lazy sheet chunk — only loads
// when a card expands.
const LazySheetMiniGrid = lazy(() => import('@/components/sheet/SheetMiniGrid'))

/**
 * Spreadsheet board card.
 *  - compact:  static preview table digested into the meta (no body load)
 *  - expanded: read-only mini grid with live formula results + sheet tabs
 * Full mode is the spreadsheet workspace itself (double-click / openSheet).
 */
export function SheetCardNode({ data, selected }: NodeProps<BoardNode>) {
  const meta = useStore((s) => (data.sheetId ? s.sheetDocs[data.sheetId] : undefined))
  const openSheet = useStore((s) => s.openSheet)

  if (!meta) {
    return (
      <CardChrome
        data={data}
        selected={selected}
        icon={<IcTable size={13} />}
        title="Missing spreadsheet"
        minWidth={180}
        minHeight={90}
      >
        <div className="placeholder">This spreadsheet was deleted</div>
      </CardChrome>
    )
  }

  const mode = data.mode ?? 'compact'
  const hasPreview = meta.preview.some((row) => row.some(Boolean))

  return (
    <CardChrome
      data={data}
      selected={selected}
      icon={<IcTable size={13} />}
      title={meta.title}
      minWidth={240}
      minHeight={130}
    >
      {mode === 'compact' ? (
        <div
          className="flex h-full cursor-default flex-col px-3 py-2"
          onDoubleClick={() => openSheet(meta.id)}
          title="Double-click to open in the spreadsheet workspace"
        >
          <div className="min-h-0 flex-1 overflow-hidden">
            {hasPreview ? (
              <table className="sheet-mini">
                <tbody>
                  {meta.preview.map((row, r) => (
                    <tr key={r}>
                      {row.map((text, c) => (
                        <td key={c} style={{ minWidth: 40 }}>
                          {text}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="placeholder">
                Empty spreadsheet — double-click to edit
              </div>
            )}
          </div>
          <div className="flex flex-none items-center gap-2 pt-1.5 text-[10.5px] text-muted">
            <span>
              {meta.sheetNames.length} sheet{meta.sheetNames.length !== 1 ? 's' : ''}
            </span>
            <span>·</span>
            <span>{meta.cellCount} cells</span>
            <span>·</span>
            <span>edited {new Date(meta.updatedAt).toLocaleDateString()}</span>
            {meta.sourceAssetId && (
              <>
                <span>·</span>
                <span>imported</span>
              </>
            )}
          </div>
        </div>
      ) : (
        <div
          className="nodrag h-full min-h-0"
          onDoubleClick={() => openSheet(meta.id)}
          title="Read-only preview — double-click to open the workspace"
        >
          <Suspense fallback={<div className="placeholder">Loading grid…</div>}>
            <LazySheetMiniGrid sheetId={meta.id} />
          </Suspense>
        </div>
      )}
    </CardChrome>
  )
}
