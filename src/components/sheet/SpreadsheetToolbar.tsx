import { useEffect, useRef, useState } from 'react'
import { cellKey, type CellStyle, type NumFmt } from '@/lib/sheet/sheetModel'
import { useI18n, type Catalog } from '@/lib/i18n'
import { IcAlignCenter, IcAlignLeft, IcAlignRight, IcSearch } from '@/components/Icons'
import { SheetPeerChips } from '@/components/collab/EntityPresence'
import { toast } from '@/components/ui/Toaster'
import type { BorderKind } from '@/lib/sheet/borders'
import {
  ToolbarAction,
  ToolbarGroup,
  ToolbarRoot,
  ToolbarSelect,
  ToolbarSeparator,
  ToolbarToggle,
} from '@/components/ui/toolbar'
import { rectOf, useSheetSession } from './SheetSession'

type SheetCopy = Catalog['toolbar']['sheet']

/** Every NumFmt, in the order the select offers them. */
const NUM_FMTS: NumFmt[] = [
  'general',
  'number',
  'integer',
  'currency',
  'percent',
  'date',
  'time',
  'datetime',
]

const FONT_FAMILIES: { id: string; key: keyof SheetCopy['fonts'] }[] = [
  { id: '', key: 'default' },
  { id: 'system-ui, sans-serif', key: 'sans' },
  { id: 'Georgia, serif', key: 'serif' },
  { id: 'ui-monospace, monospace', key: 'mono' },
]

const FONT_SIZES = [10, 11, 12, 13, 14, 16, 18, 20, 24]

const BORDER_KINDS: BorderKind[] = ['all', 'outline', 'none']

/** Canned cell-style presets, mirroring the "Stili" group in the mock-up. */
const CELL_STYLES: { id: keyof SheetCopy['cellStyles']; patch: Partial<CellStyle> }[] = [
  { id: 'normal', patch: { b: undefined, color: undefined, bg: undefined } },
  { id: 'good', patch: { color: '#0f6d31', bg: '#c6efce' } },
  { id: 'bad', patch: { color: '#9c0006', bg: '#ffc7ce' } },
  { id: 'neutral', patch: { color: '#9c5700', bg: '#ffeb9c' } },
  { id: 'heading', patch: { b: true, fs: 15, color: undefined, bg: undefined } },
]

/**
 * Find & replace over the current selection (or the used range when a single
 * cell is selected). A popover rather than a second row, so the bar stays one
 * strip tall; the result count is reported rather than left silent.
 *
 * The trigger is a real disclosure — `aria-haspopup="dialog"` plus
 * `aria-expanded` — and the panel keeps its own keys: Escape closes it and
 * hands focus back, and arrows stay inside rather than roving the toolbar.
 */
function FindReplace({
  t,
  onReplace,
}: {
  t: Catalog
  onReplace: (find: string, replace: string, matchCase: boolean) => number
}) {
  const s = t.toolbar.sheet
  const [open, setOpen] = useState(false)
  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const root = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  const close = (focusTrigger = true) => {
    setOpen(false)
    if (focusTrigger) {
      requestAnimationFrame(() => root.current?.querySelector('button')?.focus())
    }
  }

  const run = () => {
    const n = onReplace(find, replace, matchCase)
    toast.success(n ? s.replaced(n) : s.nothingToReplace, n ? undefined : s.noMatch(find))
    close()
  }

  return (
    <span className="relative" ref={root}>
      <ToolbarAction
        icon={<IcSearch size={13} />}
        label={s.findReplace}
        haspopup="dialog"
        expanded={open}
        onRun={() => setOpen((v) => !v)}
      />
      {open && (
        <div
          role="dialog"
          aria-label={s.findReplace}
          className="absolute top-full left-0 z-30 mt-1 w-56 rounded-lg border border-bord bg-panel p-2 shadow-xl"
          // the panel owns its keys: the toolbar must not rove on arrows typed
          // into these inputs, and Escape belongs to the popover
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Escape') {
              e.preventDefault()
              close()
            }
          }}
        >
          <input
            className="field mb-1.5"
            placeholder={s.find}
            value={find}
            autoFocus
            onChange={(e) => setFind(e.target.value)}
            aria-label={s.find}
          />
          <input
            className="field mb-1.5"
            placeholder={s.replaceWith}
            value={replace}
            onChange={(e) => setReplace(e.target.value)}
            aria-label={s.replaceWith}
          />
          <label className="mb-2 flex cursor-pointer items-center gap-1.5 text-[11px] text-muted">
            <input
              type="checkbox"
              checked={matchCase}
              onChange={(e) => setMatchCase(e.target.checked)}
            />
            {s.matchCase}
          </label>
          <div className="flex gap-1.5">
            <button className="btn flex-1" disabled={!find} onClick={run}>
              {s.replaceAll}
            </button>
            <button className="btn" onClick={() => close()}>
              {s.close}
            </button>
          </div>
        </div>
      )}
    </span>
  )
}

/**
 * A small colour well: swatch button + hidden native picker + clear.
 *
 * Two controls, not one, because they do two things — and both now carry a
 * name. Before this phase the whole sheet toolbar was unnamed: a screen reader
 * announced "A", "✕", "B", "+ Row".
 */
function ColorWell({
  label,
  value,
  onPick,
  onClear,
  glyph,
  t,
}: {
  label: string
  value: string | undefined
  onPick: (color: string) => void
  onClear: () => void
  glyph: string
  t: Catalog
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <ToolbarAction
        icon={
          <>
            <span className="text-[12px] leading-none">{glyph}</span>
            <span
              aria-hidden
              className="absolute right-1 bottom-0.5 left-1 h-[3px] rounded-sm"
              style={{ background: value ?? 'var(--muted)' }}
            />
          </>
        }
        label={label}
        description={t.toolbar.sheet.pickColour(label)}
        onRun={() => input.current?.click()}
      />
      <ToolbarAction
        icon="✕"
        label={t.toolbar.sheet.clearColour(label)}
        onRun={onClear}
      />
      <input
        ref={input}
        type="color"
        hidden
        defaultValue={value ?? '#0d99ff'}
        onChange={(e) => onPick(e.target.value)}
      />
    </>
  )
}

/**
 * Spreadsheet toolbar, organised into the categories a user expects —
 * Clipboard, Text, Colour, Alignment, Numbers, Styles, Cells, Data — each a
 * named group. The row wraps to the width available rather than clipping, so
 * it stays usable on a narrow pane. Everything acts on the current selection
 * rectangle.
 *
 * On the shared primitives since Phase 11.1.6a: the bar has a name, one tab
 * stop, and states assistive tech can read — bold, italic and alignment used
 * to be conveyed by a background colour alone.
 *
 * Heavier ribbon features (cell merge, freeze panes, conditional formatting,
 * charts, page/print setup, data validation) are intentionally left for a
 * follow-up rather than shown as dead buttons.
 */
export function SpreadsheetToolbar() {
  const t = useI18n()
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
    sortSelection,
    removeDuplicates,
    findReplace,
    applyBorders,
  } = useSheetSession()
  // unchanged from before: a viewer gets no formatting bar at all, rather than
  // a row of controls that would all be disabled
  if (readOnly) return null

  const s = t.toolbar.sheet
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
      const grid = text
        .replace(/\r/g, '')
        .replace(/\n$/, '')
        .split('\n')
        .map((l) => l.split('\t'))
      pasteMatrix(grid, pasteOriginFor(text))
    } catch {
      // clipboard read blocked (permissions): the grid still takes Ctrl+V
    }
  }

  const verticalAligns = [
    ['top', '▔', s.alignTop],
    ['middle', '—', s.alignMiddle],
    ['bottom', '▁', s.alignBottom],
  ] as const

  const alignments = [
    ['left', IcAlignLeft, s.alignLeft],
    ['center', IcAlignCenter, s.alignCenter],
    ['right', IcAlignRight, s.alignRight],
  ] as const

  return (
    <div className="flex flex-none flex-wrap items-center gap-0.5 border-b border-bord bg-panel px-2 py-1">
      <ToolbarRoot label={s.label} size="sm" className="flex-wrap gap-0.5">
        <ToolbarGroup label={s.groups.clipboard}>
          <ToolbarAction
            icon="Paste"
            label={s.paste}
            shortcut="Ctrl+V"
            onRun={() => void paste()}
          />
          <ToolbarAction icon="✂" label={s.cut} shortcut="Ctrl+X" onRun={cutSelection} />
          <ToolbarAction icon="⧉" label={s.copy} shortcut="Ctrl+C" onRun={copySelection} />
        </ToolbarGroup>

        <ToolbarSeparator />

        <ToolbarGroup label={s.groups.textStyle}>
          <ToolbarSelect
            label={s.fontFamily}
            value={style?.ff ?? ''}
            options={FONT_FAMILIES.map((f) => ({ value: f.id, label: s.fonts[f.key] }))}
            onChange={(value) => applyStyle({ ff: value || undefined })}
            className="w-20"
          />
          <ToolbarSelect
            label={s.fontSize}
            value={String(style?.fs ?? 12)}
            options={FONT_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
            onChange={(value) => applyStyle({ fs: Number(value) })}
            className="w-14"
          />
          <ToolbarToggle
            icon={<b>B</b>}
            label={s.bold}
            shortcut="Ctrl+B"
            pressed={!!style?.b}
            onRun={() => applyStyle({ b: !style?.b })}
          />
          <ToolbarToggle
            icon={<i>I</i>}
            label={s.italic}
            shortcut="Ctrl+I"
            pressed={!!style?.i}
            onRun={() => applyStyle({ i: !style?.i })}
          />
          <ToolbarToggle
            icon={<u>U</u>}
            label={s.underline}
            shortcut="Ctrl+U"
            pressed={!!style?.u}
            onRun={() => applyStyle({ u: !style?.u })}
          />
        </ToolbarGroup>

        <ToolbarSeparator />

        <ToolbarGroup label={s.groups.colour}>
          <ColorWell
            t={t}
            label={s.textColour}
            glyph="A"
            value={style?.color}
            onPick={(color) => applyStyle({ color })}
            onClear={() => applyStyle({ color: undefined })}
          />
          <ColorWell
            t={t}
            label={s.fillColour}
            glyph="◧"
            value={style?.bg}
            onPick={(bg) => applyStyle({ bg })}
            onClear={() => applyStyle({ bg: undefined })}
          />
          {/* borders depend on where a cell sits in the range, so this is a
              range command rather than an applyStyle patch — it stays a select
              that falls back to its placeholder after each use */}
          <ToolbarSelect
            label={s.borders}
            value=""
            options={[
              { value: '', label: s.borderKinds.placeholder },
              ...BORDER_KINDS.map((k) => ({ value: k, label: s.borderKinds[k] })),
            ]}
            onChange={(value) => {
              if (value) applyBorders(value as BorderKind)
            }}
            className="w-24"
          />
        </ToolbarGroup>

        <ToolbarSeparator />

        <ToolbarGroup label={s.groups.alignment}>
          {verticalAligns.map(([v, glyph, label]) => (
            <ToolbarToggle
              key={v}
              icon={<span className="text-[11px] leading-none">{glyph}</span>}
              label={label}
              pressed={style?.valign === v}
              onRun={() => applyStyle({ valign: style?.valign === v ? undefined : v })}
            />
          ))}
          {alignments.map(([align, Icon, label]) => (
            <ToolbarToggle
              key={align}
              icon={<Icon size={13} />}
              label={label}
              pressed={style?.align === align}
              onRun={() =>
                applyStyle({ align: style?.align === align ? undefined : align })
              }
            />
          ))}
          <ToolbarToggle
            icon={<span className="text-[12px] leading-none">↵</span>}
            label={s.wrap}
            pressed={!!style?.wrap}
            onRun={() => applyStyle({ wrap: !style?.wrap })}
          />
        </ToolbarGroup>

        <ToolbarSeparator />

        <ToolbarGroup label={s.groups.format}>
          <ToolbarSelect
            label={s.numberFormat}
            value={style?.fmt ?? 'general'}
            options={NUM_FMTS.map((id) => ({ value: id, label: s.formats[id] }))}
            onChange={(value) => {
              const fmt = value as NumFmt
              applyStyle({ fmt: fmt === 'general' ? undefined : fmt })
            }}
            className="w-36"
          />
          <ToolbarToggle
            icon={<span className="text-[11px] leading-none">,000</span>}
            label={s.thousands}
            pressed={!!style?.thou}
            onRun={() => applyStyle({ thou: !style?.thou })}
          />
          <ToolbarAction
            icon={<span className="text-[10px] leading-none">.0→</span>}
            label={s.increaseDecimals}
            description={`${s.increaseDecimals} — ${s.decimalsNow(decimals)}`}
            onRun={() => bumpDecimals(1)}
          />
          <ToolbarAction
            icon={<span className="text-[10px] leading-none">←.0</span>}
            label={s.decreaseDecimals}
            description={`${s.decreaseDecimals} — ${s.decimalsNow(decimals)}`}
            onRun={() => bumpDecimals(-1)}
          />
        </ToolbarGroup>

        <ToolbarSeparator />

        <ToolbarSelect
          label={s.cellStyle}
          value=""
          options={[
            { value: '', label: s.cellStylePlaceholder },
            ...CELL_STYLES.map((p) => ({ value: p.id, label: s.cellStyles[p.id] })),
          ]}
          onChange={(value) => {
            const preset = CELL_STYLES.find((p) => p.id === value)
            if (preset) applyStyle(preset.patch)
          }}
          className="w-24"
        />

        <ToolbarSeparator />

        <ToolbarGroup label={s.groups.structure}>
          <ToolbarAction
            icon="+ Row"
            label={s.insertRow}
            description={rows > 1 ? s.insertRows(rows) : s.insertRowOne}
            onRun={() => {
              for (let i = 0; i < rows; i++) insertRowAt(rect.r1)
            }}
          />
          <ToolbarAction
            icon="− Row"
            label={s.deleteRow}
            description={
              rows > 1
                ? s.deleteRowsRange(rect.r1 + 1, rect.r2 + 1)
                : s.deleteRowOne(rect.r1 + 1)
            }
            onRun={() => {
              for (let i = 0; i < rows; i++) deleteRowAt(rect.r1)
            }}
          />
          <ToolbarAction
            icon="+ Col"
            label={s.insertCol}
            description={cols > 1 ? s.insertCols(cols) : s.insertColOne}
            onRun={() => {
              for (let i = 0; i < cols; i++) insertColAt(rect.c1)
            }}
          />
          <ToolbarAction
            icon="− Col"
            label={s.deleteCol}
            description={s.deleteColsSelected}
            onRun={() => {
              for (let i = 0; i < cols; i++) deleteColAt(rect.c1)
            }}
          />
        </ToolbarGroup>

        <ToolbarSeparator />

        <ToolbarGroup label={s.groups.data}>
          <ToolbarAction
            icon={<span className="text-[11px] leading-none">A→Z</span>}
            label={s.sortAsc}
            description={s.sortAscTip}
            onRun={() => sortSelection('asc')}
          />
          <ToolbarAction
            icon={<span className="text-[11px] leading-none">Z→A</span>}
            label={s.sortDesc}
            description={s.sortDescTip}
            onRun={() => sortSelection('desc')}
          />
          <ToolbarAction
            icon="Dedupe"
            label={s.dedupe}
            onRun={() => {
              const n = removeDuplicates()
              toast.success(
                n ? s.dedupeDone(n) : s.dedupeNone,
                n ? undefined : s.dedupeNoneDetail,
              )
            }}
          />
          <FindReplace
            t={t}
            onReplace={(find, replace, matchCase) =>
              findReplace(find, replace, { matchCase })
            }
          />
        </ToolbarGroup>
      </ToolbarRoot>

      {/* presence, not a control: it stays outside the toolbar */}
      <SheetPeerChips sheetId={sheetId} />
    </div>
  )
}
