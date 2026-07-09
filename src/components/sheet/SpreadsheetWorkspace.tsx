import type { SpreadsheetDocMeta } from '@/types/model'
import { useStore } from '@/store/useStore'
import { useReadOnly } from '@/lib/collab/useCollab'
import { IcTable, IcX } from '@/components/Icons'
import { SheetSessionProvider } from './SheetSession'
import { SpreadsheetEditor } from './SpreadsheetEditor'
import { SpreadsheetToolbar } from './SpreadsheetToolbar'
import { FormulaBar } from './FormulaBar'
import { SheetTabs } from './SheetTabs'
import { CellInspector } from './CellInspector'

/**
 * The full spreadsheet workspace (Excel-style): title bar, formatting
 * toolbar, formula bar, editable grid, sheet tabs with selection stats,
 * and — in Document view mode — the CellInspector panel. Everything below
 * the title bar shares one SheetSession. Default export: lazy-loaded so
 * SheetJS and the grid stay out of the main bundle.
 */
export default function SpreadsheetWorkspace({ meta }: { meta: SpreadsheetDocMeta }) {
  const updateSheetMeta = useStore((s) => s.updateSheetMeta)
  const closeSheet = useStore((s) => s.closeSheet)
  const viewMode = useStore((s) => s.viewMode)
  const readOnly = useReadOnly()

  return (
    <section className="flex h-full min-w-0 flex-1 border-r border-bord bg-panel">
      <SheetSessionProvider sheetId={meta.id} readOnly={readOnly}>
        <div className="flex h-full min-w-0 flex-1 flex-col">
          <div className="flex flex-none items-center gap-2 border-b border-bord px-4 py-2">
            <IcTable size={15} className="flex-none text-muted" />
            <input
              className="min-w-0 flex-1 bg-transparent text-[15px] font-bold outline-none"
              value={meta.title}
              disabled={readOnly}
              onChange={(e) => updateSheetMeta(meta.id, { title: e.target.value })}
              placeholder="Untitled spreadsheet"
            />
            <span className="flex-none text-[11px] text-muted">
              {meta.sheetNames.length} sheet{meta.sheetNames.length !== 1 ? 's' : ''} ·{' '}
              {meta.cellCount} cells
            </span>
            <button className="icon-btn" title="Close spreadsheet" onClick={closeSheet}>
              <IcX size={14} />
            </button>
          </div>
          <SpreadsheetToolbar />
          <FormulaBar />
          <div className="min-h-0 flex-1">
            <SpreadsheetEditor />
          </div>
          <SheetTabs />
        </div>
        {(viewMode === 'doc' || viewMode === 'sheet') && <CellInspector />}
      </SheetSessionProvider>
    </section>
  )
}
