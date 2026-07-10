import { useRef } from 'react'
import { cellKey, type NumFmt } from '@/lib/sheet/sheetModel'
import { IcAlignCenter, IcAlignLeft, IcAlignRight } from '@/components/Icons'
import { SheetPeerChips } from '@/components/collab/EntityPresence'
import { ToolbarDivider } from '@/components/ui/ToolbarDivider'
import { rectOf, useSheetSession } from './SheetSession'

const NUM_FMTS: { id: NumFmt; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'number', label: 'Number 1,234.56' },
  { id: 'integer', label: 'Integer 1,235' },
  { id: 'percent', label: 'Percent 12.3%' },
  { id: 'currency', label: 'Currency €' },
]

/** A small color well: swatch button + hidden native picker + clear. */
function ColorWell({
  label,
  value,
  onPick,
  onClear,
  glyph,
}: {
  label: string
  value: string | undefined
  onPick: (color: string) => void
  onClear: () => void
  glyph: string
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <span className="flex items-center">
      <button
        className="tbtn relative"
        title={`${label} — click to pick`}
        onClick={() => input.current?.click()}
      >
        <span className="text-[12px] leading-none">{glyph}</span>
        <span
          className="absolute right-1 bottom-0.5 left-1 h-[3px] rounded-sm"
          style={{ background: value ?? 'var(--muted)' }}
        />
      </button>
      <button className="tbtn w-4 text-[9px]" title={`Clear ${label.toLowerCase()}`} onClick={onClear}>
        ✕
      </button>
      <input
        ref={input}
        type="color"
        hidden
        defaultValue={value ?? '#0d99ff'}
        onChange={(e) => onPick(e.target.value)}
      />
    </span>
  )
}

/**
 * Formatting + structure toolbar: bold/italic, text & fill color,
 * alignment, number format, insert/delete rows & columns. Everything
 * applies to the current selection rectangle.
 */
export function SpreadsheetToolbar() {
  const {
    sheetId,
    sheet,
    selection,
    active,
    readOnly,
    applyStyle,
    insertRowAt,
    deleteRowAt,
    insertColAt,
    deleteColAt,
  } = useSheetSession()
  if (readOnly) return null

  const style = sheet.cells[cellKey(active.r, active.c)]?.s
  const rect = rectOf(selection)
  const rows = rect.r2 - rect.r1 + 1
  const cols = rect.c2 - rect.c1 + 1

  return (
    <div className="doc-toolbar flex-none">
      <button
        className={`tbtn font-bold ${style?.b ? 'is-active' : ''}`}
        title="Bold (Ctrl+B)"
        onClick={() => applyStyle({ b: !style?.b })}
      >
        B
      </button>
      <button
        className={`tbtn italic ${style?.i ? 'is-active' : ''}`}
        title="Italic (Ctrl+I)"
        onClick={() => applyStyle({ i: !style?.i })}
      >
        I
      </button>

      <ToolbarDivider />

      <ColorWell
        label="Text color"
        glyph="A"
        value={style?.color}
        onPick={(color) => applyStyle({ color })}
        onClear={() => applyStyle({ color: undefined })}
      />
      <ColorWell
        label="Fill color"
        glyph="◧"
        value={style?.bg}
        onPick={(bg) => applyStyle({ bg })}
        onClear={() => applyStyle({ bg: undefined })}
      />

      <ToolbarDivider />

      {(
        [
          ['left', IcAlignLeft],
          ['center', IcAlignCenter],
          ['right', IcAlignRight],
        ] as const
      ).map(([align, Icon]) => (
        <button
          key={align}
          className={`tbtn ${style?.align === align ? 'is-active' : ''}`}
          title={`Align ${align}`}
          onClick={() =>
            applyStyle({ align: style?.align === align ? undefined : align })
          }
        >
          <Icon size={13} />
        </button>
      ))}

      <ToolbarDivider />

      <select
        className="field h-6 w-36 flex-none cursor-pointer px-1 py-0 text-[11.5px]"
        value={style?.fmt ?? 'general'}
        title="Number format"
        onChange={(e) => {
          const fmt = e.target.value as NumFmt
          applyStyle({ fmt: fmt === 'general' ? undefined : fmt })
        }}
      >
        {NUM_FMTS.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </select>

      <ToolbarDivider />

      <button
        className="tbtn px-1.5"
        title={`Insert ${rows} row${rows > 1 ? 's' : ''} above`}
        onClick={() => {
          for (let i = 0; i < rows; i++) insertRowAt(rect.r1)
        }}
      >
        + Row
      </button>
      <button
        className="tbtn px-1.5"
        title={`Delete row${rows > 1 ? `s ${rect.r1 + 1}–${rect.r2 + 1}` : ` ${rect.r1 + 1}`}`}
        onClick={() => {
          for (let i = 0; i < rows; i++) deleteRowAt(rect.r1)
        }}
      >
        − Row
      </button>
      <button
        className="tbtn px-1.5"
        title={`Insert ${cols} column${cols > 1 ? 's' : ''} left`}
        onClick={() => {
          for (let i = 0; i < cols; i++) insertColAt(rect.c1)
        }}
      >
        + Col
      </button>
      <button
        className="tbtn px-1.5"
        title="Delete selected columns"
        onClick={() => {
          for (let i = 0; i < cols; i++) deleteColAt(rect.c1)
        }}
      >
        − Col
      </button>

      <SheetPeerChips sheetId={sheetId} />
    </div>
  )
}
