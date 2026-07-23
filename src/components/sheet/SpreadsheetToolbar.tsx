import { useRef, type ReactNode } from 'react'
import { cellKey, type CellStyle, type NumFmt } from '@/lib/sheet/sheetModel'
import { IcAlignCenter, IcAlignLeft, IcAlignRight } from '@/components/Icons'
import { SheetPeerChips } from '@/components/collab/EntityPresence'
import { rectOf, useSheetSession } from './SheetSession'

const NUM_FMTS: { id: NumFmt; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'number', label: 'Number' },
  { id: 'integer', label: 'Integer' },
  { id: 'currency', label: 'Currency €' },
  { id: 'percent', label: 'Percent %' },
  { id: 'date', label: 'Date' },
  { id: 'time', label: 'Time' },
  { id: 'datetime', label: 'Date-time' },
]

const FONT_FAMILIES: { id: string; label: string }[] = [
  { id: '', label: 'Default' },
  { id: 'system-ui, sans-serif', label: 'Sans' },
  { id: 'Georgia, serif', label: 'Serif' },
  { id: 'ui-monospace, monospace', label: 'Mono' },
]

const FONT_SIZES = [10, 11, 12, 13, 14, 16, 18, 20, 24]

/** Canned cell-style presets, mirroring the "Stili" group in the mock-up. */
const CELL_STYLES: { id: string; label: string; patch: Partial<CellStyle> }[] = [
  { id: 'normal', label: 'Normal', patch: { b: undefined, color: undefined, bg: undefined } },
  { id: 'good', label: 'Good', patch: { color: '#0f6d31', bg: '#c6efce' } },
  { id: 'bad', label: 'Bad', patch: { color: '#9c0006', bg: '#ffc7ce' } },
  { id: 'neutral', label: 'Neutral', patch: { color: '#9c5700', bg: '#ffeb9c' } },
  { id: 'heading', label: 'Heading', patch: { b: true, fs: 15, color: undefined, bg: undefined } },
]

/** One labelled category cluster, so the toolbar reads as clear groups. */
function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="tb-group" role="group" aria-label={label}>
      <div className="tb-row">{children}</div>
      <div className="tb-cat">{label}</div>
    </div>
  )
}

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
 * Spreadsheet toolbar, organised into the categories a user expects —
 * Clipboard, Font, Alignment, Numbers, Styles, Cells — each a labelled
 * cluster. The row wraps to the width available rather than clipping, so
 * it stays usable on a narrow pane. Everything acts on the current
 * selection rectangle.
 *
 * Heavier ribbon features (borders, cell merge, freeze panes, conditional
 * formatting, charts, page/print setup, data validation) are intentionally
 * left for a follow-up rather than shown as dead buttons.
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
    copySelection,
    cutSelection,
    pasteMatrix,
    pasteOriginFor,
  } = useSheetSession()
  if (readOnly) return null

  const style = sheet.cells[cellKey(active.r, active.c)]?.s
  const rect = rectOf(selection)
  const rows = rect.r2 - rect.r1 + 1
  const cols = rect.c2 - rect.c1 + 1
  const decimals = style?.dec ?? 2

  const bumpDecimals = (delta: number) =>
    applyStyle({ dec: Math.max(0, Math.min(10, decimals + delta)) })

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text) return
      const grid = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((l) => l.split('\t'))
      pasteMatrix(grid, pasteOriginFor(text))
    } catch {
      // clipboard read blocked (permissions): the grid still takes Ctrl+V
    }
  }

  return (
    <div className="doc-toolbar sheet-toolbar flex-none">
      <Group label="Clipboard">
        <button className="tbtn px-1.5" title="Paste (Ctrl+V)" onClick={() => void paste()}>
          Paste
        </button>
        <button className="tbtn" title="Cut (Ctrl+X)" onClick={cutSelection}>
          ✂
        </button>
        <button className="tbtn" title="Copy (Ctrl+C)" onClick={copySelection}>
          ⧉
        </button>
      </Group>

      <Group label="Font">
        <select
          className="field h-6 w-20 cursor-pointer px-1 py-0 text-[11px]"
          title="Font family"
          value={style?.ff ?? ''}
          onChange={(e) => applyStyle({ ff: e.target.value || undefined })}
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        <select
          className="field h-6 w-12 cursor-pointer px-1 py-0 text-[11px]"
          title="Font size"
          value={style?.fs ?? 12}
          onChange={(e) => applyStyle({ fs: Number(e.target.value) })}
        >
          {FONT_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
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
        <button
          className={`tbtn underline ${style?.u ? 'is-active' : ''}`}
          title="Underline (Ctrl+U)"
          onClick={() => applyStyle({ u: !style?.u })}
        >
          U
        </button>
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
      </Group>

      <Group label="Alignment">
        {(
          [
            ['top', '▔', 'Align top'],
            ['middle', '—', 'Align middle'],
            ['bottom', '▁', 'Align bottom'],
          ] as const
        ).map(([v, glyph, title]) => (
          <button
            key={v}
            className={`tbtn ${style?.valign === v ? 'is-active' : ''}`}
            title={title}
            onClick={() => applyStyle({ valign: style?.valign === v ? undefined : v })}
          >
            <span className="text-[11px] leading-none">{glyph}</span>
          </button>
        ))}
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
            onClick={() => applyStyle({ align: style?.align === align ? undefined : align })}
          >
            <Icon size={13} />
          </button>
        ))}
        <button
          className={`tbtn ${style?.wrap ? 'is-active' : ''}`}
          title="Wrap text"
          onClick={() => applyStyle({ wrap: !style?.wrap })}
        >
          <span className="text-[12px] leading-none">↵</span>
        </button>
      </Group>

      <Group label="Numbers">
        <select
          className="field h-6 w-24 cursor-pointer px-1 py-0 text-[11px]"
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
        <button
          className={`tbtn ${style?.thou ? 'is-active' : ''}`}
          title="Thousands separator"
          onClick={() => applyStyle({ thou: !style?.thou })}
        >
          <span className="text-[11px] leading-none">,000</span>
        </button>
        <button className="tbtn" title="Increase decimals" onClick={() => bumpDecimals(1)}>
          <span className="text-[10px] leading-none">.0→</span>
        </button>
        <button className="tbtn" title="Decrease decimals" onClick={() => bumpDecimals(-1)}>
          <span className="text-[10px] leading-none">←.0</span>
        </button>
      </Group>

      <Group label="Styles">
        <select
          className="field h-6 w-24 cursor-pointer px-1 py-0 text-[11px]"
          title="Cell style"
          value=""
          onChange={(e) => {
            const preset = CELL_STYLES.find((p) => p.id === e.target.value)
            if (preset) applyStyle(preset.patch)
            e.target.value = ''
          }}
        >
          <option value="">Cell styles…</option>
          {CELL_STYLES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </Group>

      <Group label="Cells">
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
      </Group>

      <SheetPeerChips sheetId={sheetId} />
    </div>
  )
}
