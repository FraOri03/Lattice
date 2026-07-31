import { useRef } from 'react'
import { cellKey, type NumFmt } from '@/lib/sheet/sheetModel'
import { useI18n, type Catalog } from '@/lib/i18n'
import { IcAlignCenter, IcAlignLeft, IcAlignRight } from '@/components/Icons'
import { SheetPeerChips } from '@/components/collab/EntityPresence'
import {
  ToolbarAction,
  ToolbarGroup,
  ToolbarRoot,
  ToolbarSelect,
  ToolbarSeparator,
  ToolbarToggle,
} from '@/components/ui/toolbar'
import { rectOf, useSheetSession } from './SheetSession'

const NUM_FMTS: NumFmt[] = ['general', 'number', 'integer', 'percent', 'currency']

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
 * Formatting + structure toolbar: bold/italic, text & fill colour,
 * alignment, number format, insert/delete rows & columns. Everything applies
 * to the current selection rectangle.
 *
 * On the shared primitives since Phase 11.1.6a. The controls are the same
 * ones; what changed is that the bar has a name, one tab stop, and states that
 * assistive tech can read — bold, italic and alignment used to be conveyed by
 * a background colour alone.
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
  } = useSheetSession()
  // unchanged from before: a viewer gets no formatting bar at all, rather than
  // a row of controls that would all be disabled
  if (readOnly) return null

  const s = t.toolbar.sheet
  const style = sheet.cells[cellKey(active.r, active.c)]?.s
  const rect = rectOf(selection)
  const rows = rect.r2 - rect.r1 + 1
  const cols = rect.c2 - rect.c1 + 1

  const alignments = [
    ['left', IcAlignLeft, s.alignLeft],
    ['center', IcAlignCenter, s.alignCenter],
    ['right', IcAlignRight, s.alignRight],
  ] as const

  return (
    <div className="flex flex-none flex-wrap items-center gap-0.5 border-b border-bord bg-panel px-2 py-1">
      <ToolbarRoot label={s.label} size="sm" className="flex-wrap gap-0.5">
        <ToolbarGroup label={s.groups.textStyle}>
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
        </ToolbarGroup>

        <ToolbarSeparator />

        <ToolbarGroup label={s.groups.alignment}>
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
        </ToolbarGroup>

        <ToolbarSeparator />

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
      </ToolbarRoot>

      {/* presence, not a control: it stays outside the toolbar */}
      <SheetPeerChips sheetId={sheetId} />
    </div>
  )
}
