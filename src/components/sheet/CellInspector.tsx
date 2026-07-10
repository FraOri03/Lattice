import { useState } from 'react'
import { useStore } from '@/store/useStore'
import { downloadAsset } from '@/lib/assets/AssetRegistry'
import { formatBytes } from '@/lib/media'
import {
  cellKey,
  cellRef,
  editableTextOf,
  formatCell,
  formatValue,
} from '@/lib/sheet/sheetModel'
import {
  exportSpreadsheet,
  SHEET_EXPORT_FORMATS,
} from '@/lib/sheet/SpreadsheetExportService'
import { toast } from '@/components/ui/Toaster'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { IcDownload, IcTrash } from '@/components/Icons'
import { useSheetSession } from './SheetSession'

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5 text-[11.5px]">
      <span className="flex-none text-muted">{label}</span>
      <span className="min-w-0 truncate text-right font-mono" title={value}>
        {value}
      </span>
    </div>
  )
}

/**
 * Right panel of the spreadsheet workspace: document stats, a live
 * breakdown of the ACTIVE CELL (raw content, formula, computed result,
 * style), the preserved source file, export formats and the danger zone.
 */
export function CellInspector() {
  const { meta, body, sheet, sheetIndex, active, computed } = useSheetSession()
  const assets = useStore((s) => s.assets)
  const deleteSheetDoc = useStore((s) => s.deleteSheetDoc)
  const [exporting, setExporting] = useState<string | null>(null)

  const cell = sheet.cells[cellKey(active.r, active.c)]
  const comp = cell?.f !== undefined ? computed.get(cellKey(active.r, active.c)) : undefined
  const sourceAsset = meta.sourceAssetId ? assets[meta.sourceAssetId] : undefined
  const cellCount = Object.keys(sheet.cells).length

  const onExport = async (format: 'xlsx' | 'csv' | 'json') => {
    setExporting(format)
    try {
      await exportSpreadsheet(meta, format, sheetIndex)
    } catch (err) {
      toast.error('Export failed', err instanceof Error ? err.message : undefined)
    } finally {
      setExporting(null)
    }
  }

  return (
    <aside className="w-70 flex-none overflow-y-auto border-l border-bord bg-panel px-4 pb-6">
      <div className="insp-h">Spreadsheet</div>
      <div className="grid grid-cols-2 gap-x-3 text-[11px] text-muted">
        <span>{body.sheets.length} sheet{body.sheets.length !== 1 ? 's' : ''}</span>
        <span>{meta.cellCount} cells</span>
        <span>created {new Date(meta.createdAt).toLocaleDateString()}</span>
        <span>edited {new Date(meta.updatedAt).toLocaleDateString()}</span>
      </div>

      <div className="insp-h">Active cell</div>
      <InfoRow label="Cell" value={`${sheet.name}!${cellRef(active.r, active.c)}`} />
      <InfoRow
        label="Content"
        value={
          cell?.f !== undefined
            ? 'formula'
            : cell?.v === undefined
              ? 'empty'
              : typeof cell.v
        }
      />
      {cell?.f !== undefined && (
        <>
          <InfoRow label="Formula" value={`=${cell.f}`} />
          <InfoRow
            label="Result"
            value={
              comp?.error ?? formatValue(comp?.value ?? null, cell.s?.fmt)
            }
          />
        </>
      )}
      {cell?.f === undefined && cell?.v !== undefined && (
        <>
          <InfoRow label="Raw" value={editableTextOf(cell)} />
          <InfoRow label="Shown" value={formatCell(cell)} />
        </>
      )}
      {cell?.s && (
        <InfoRow
          label="Style"
          value={[
            cell.s.b && 'bold',
            cell.s.i && 'italic',
            cell.s.align,
            cell.s.fmt,
            cell.s.color && 'color',
            cell.s.bg && 'fill',
          ]
            .filter(Boolean)
            .join(' · ')}
        />
      )}
      {comp?.error && (
        <p className="mt-1.5 rounded-md border border-bord bg-panel2 px-2 py-1.5 text-[11px] leading-relaxed text-[#f24822]">
          {comp.error === '#CYCLE!'
            ? 'This formula depends on itself (circular reference).'
            : comp.error === '#NAME?'
              ? 'Unknown function or name. Supported: SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, IF, ROUND, ABS, SQRT.'
              : `The formula could not be evaluated (${comp.error}).`}
        </p>
      )}

      <div className="insp-h">This sheet</div>
      <div className="grid grid-cols-2 gap-x-3 text-[11px] text-muted">
        <span>{sheet.rows} rows</span>
        <span>{sheet.cols} columns</span>
        <span>{cellCount} cells</span>
      </div>

      {sourceAsset && (
        <>
          <div className="insp-h">Source file</div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="min-w-0 flex-1 truncate" title={sourceAsset.originalName}>
              {sourceAsset.originalName}
            </span>
            <span className="flex-none text-[10px]">{formatBytes(sourceAsset.size)}</span>
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

      <div className="insp-h">Export</div>
      <div className="flex flex-col gap-1.5">
        {SHEET_EXPORT_FORMATS.map((f) => (
          <button
            key={f.format}
            className="btn w-full"
            disabled={exporting !== null}
            title={f.note}
            onClick={() => void onExport(f.format)}
          >
            <IcDownload size={12} />
            {exporting === f.format ? 'Exporting…' : f.label}
          </button>
        ))}
      </div>

      <div className="insp-h">Danger</div>
      <button
        className="btn w-full text-[#f24822]"
        onClick={async () => {
          if (
            await confirmDialog({
              title: `Delete “${meta.title}”?`,
              body: 'The spreadsheet and its cards on all boards are removed.',
              confirmLabel: 'Delete spreadsheet',
              danger: true,
            })
          )
            deleteSheetDoc(meta.id)
        }}
      >
        <IcTrash size={12} /> Delete spreadsheet
      </button>
    </aside>
  )
}
