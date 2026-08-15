import type { TextElement } from '@/lib/present/presentModel'
import {
  SAFE_FONTS,
  STYLE_PROP_LABEL,
  TEXT_STYLE_LABEL,
  TEXT_STYLE_NAMES,
  textStyleOverrides,
  type TextRender,
  type TextStyleName,
  type TextStyleSpec,
} from '@/lib/present/textStyles'
import { AUTOSIZE_LABEL, shrinkIsUnreadable, type AutoSizeMode, type OverflowReport } from '@/lib/present/overflow'
import { richFeaturesOf } from '@/lib/present/richtext'
import { docOf } from '@/lib/present/richtext'

/**
 * Typography for one text box (19E.3).
 *
 * Two ideas carry this panel. A box **follows a style** and stores only what
 * it changes, so every override is a key you can see and delete. And overflow
 * is **stated with its consequence** — the size a shrink lands on, the height
 * a grow lands on — because autofit that happens quietly is how decks lose
 * their type scale one slide at a time.
 */
export function TypographyPanel({
  el,
  render,
  overflow,
  readOnly,
  onSetStyleRef,
  onSetOverride,
  onSetBoxProp,
  onApplyRemedy,
  onUpdateStyle,
}: {
  el: TextElement
  render: TextRender
  overflow: OverflowReport | null
  readOnly: boolean
  onSetStyleRef: (name: TextStyleName | undefined) => void
  onSetOverride: <K extends keyof TextStyleSpec>(key: K, value: TextStyleSpec[K] | undefined) => void
  onSetBoxProp: (patch: Partial<Pick<TextElement, 'valign' | 'padding' | 'autoSize'>>) => void
  onApplyRemedy: (mode: AutoSizeMode, report: OverflowReport) => void
  onUpdateStyle: () => void
}) {
  const overrides = textStyleOverrides(el)
  const styled = !!el.styleRef
  const features = richFeaturesOf(docOf(el))

  return (
    <>
      <div className="insp-h">Text style</div>
      <select
        className="field h-6 w-full cursor-pointer px-1 py-0 text-[11.5px]"
        aria-label="Text style"
        disabled={readOnly}
        value={el.styleRef ?? ''}
        onChange={(e) => onSetStyleRef((e.target.value || undefined) as TextStyleName | undefined)}
      >
        <option value="">No style — this box only</option>
        {TEXT_STYLE_NAMES.map((name) => (
          <option key={name} value={name}>
            {TEXT_STYLE_LABEL[name]}
          </option>
        ))}
      </select>

      {styled && (
        <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
          {overrides.length === 0 ? (
            <>Follows {TEXT_STYLE_LABEL[el.styleRef!]} exactly — change the style and this follows.</>
          ) : (
            <>
              {overrides.length} {overrides.length === 1 ? 'override' : 'overrides'}:{' '}
              {overrides.map((k) => STYLE_PROP_LABEL[k]).join(', ')}.
            </>
          )}
        </p>
      )}

      {/* the other direction: push this box's decisions into the style, so
          every box that follows it moves too — one patch, one undo step */}
      {styled && overrides.length > 0 && !readOnly && (
        <button className="btn mt-1 w-full !border-accent !text-accent" onClick={onUpdateStyle}>
          Update {TEXT_STYLE_LABEL[el.styleRef!]} to match this box
        </button>
      )}

      {styled && overrides.length > 0 && !readOnly && (
        <div className="mt-1 flex flex-wrap gap-1">
          {overrides.map((k) => (
            <button
              key={k}
              className="toolbar-control toolbar-control--sm text-[10px]"
              title={`Revert ${STYLE_PROP_LABEL[k]} to the style`}
              aria-label={`Revert ${STYLE_PROP_LABEL[k]}`}
              onClick={() => onSetOverride(k, undefined)}
            >
              <span aria-hidden>↺ {STYLE_PROP_LABEL[k]}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <label className="col-span-2 text-[10px] text-muted uppercase">
          Font
          <select
            className="field mt-0.5 w-full cursor-pointer px-1 py-0 text-[11.5px]"
            aria-label="Font family"
            disabled={readOnly || !styled}
            value={render.fontFamily}
            onChange={(e) => onSetOverride('fontFamily', e.target.value)}
          >
            {SAFE_FONTS.map((f) => (
              <option key={f.label} value={f.value}>
                {f.label}
              </option>
            ))}
            {!SAFE_FONTS.some((f) => f.value === render.fontFamily) && (
              <option value={render.fontFamily}>Custom</option>
            )}
          </select>
        </label>

        <NumField
          label="Weight"
          value={render.weight}
          step={100}
          min={100}
          max={900}
          disabled={readOnly || !styled}
          onChange={(n) => onSetOverride('weight', n)}
        />
        <NumField
          label="Size"
          value={render.size}
          min={1}
          disabled={readOnly}
          onChange={(n) => onSetOverride('size', n)}
        />
        <NumField
          label="Line"
          value={render.lineHeight}
          step={0.05}
          min={0.5}
          disabled={readOnly || !styled}
          onChange={(n) => onSetOverride('lineHeight', n)}
        />
        <NumField
          label="Track"
          value={render.letterSpacing}
          step={0.005}
          disabled={readOnly || !styled}
          onChange={(n) => onSetOverride('letterSpacing', n)}
        />
      </div>

      {!styled && (
        <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
          Give this box a style to control weight, leading and tracking — and to
          keep it in step with the rest of the deck.
        </p>
      )}

      <div className="insp-h">Box</div>
      <div className="flex items-center gap-1">
        {(['top', 'middle', 'bottom'] as const).map((v) => (
          <button
            key={v}
            className="toolbar-control toolbar-control--sm"
            title={`Align ${v}`}
            aria-label={`Vertical align ${v}`}
            aria-pressed={render.valign === v}
            disabled={readOnly}
            onClick={() => onSetBoxProp({ valign: v })}
          >
            <span aria-hidden>{v === 'top' ? '⇧' : v === 'middle' ? '⇕' : '⇩'}</span>
          </button>
        ))}
        <label className="ml-1 flex items-center gap-1 text-[10px] text-muted uppercase">
          Pad
          <input
            type="number"
            min={0}
            className="field w-12 !px-1.5 !py-0.5 text-[11.5px]"
            aria-label="Padding"
            disabled={readOnly}
            value={el.padding ?? 0}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (Number.isFinite(n) && n >= 0) onSetBoxProp({ padding: n })
            }}
          />
        </label>
      </div>

      <div className="insp-h">Overflow</div>
      {overflow?.overflowing ? (
        <>
          <p className="text-[11px] text-[#b06f00]">
            ⚠ Overflows by {overflow.linesOver} {overflow.linesOver === 1 ? 'line' : 'lines'}.
          </p>
          <div className="mt-1 flex flex-col gap-1">
            {(['overflow', 'shrink', 'grow', 'clip'] as const).map((mode) => {
              const unavailable = mode === 'shrink' && overflow.shrunkFontSize === null
              return (
                <button
                  key={mode}
                  className="btn justify-start text-left"
                  aria-pressed={(el.autoSize ?? 'clip') === mode}
                  disabled={readOnly || unavailable}
                  title={
                    mode === 'shrink' && shrinkIsUnreadable(overflow)
                      ? 'This would take the text to the readable floor'
                      : undefined
                  }
                  onClick={() => onApplyRemedy(mode, overflow)}
                >
                  {AUTOSIZE_LABEL[mode]}
                  {/* every remedy states its consequence before it is chosen */}
                  {mode === 'shrink' && overflow.shrunkFontSize !== null && (
                    <span className="ml-auto text-[10px] text-muted">
                      → {overflow.shrunkFontSize}px
                    </span>
                  )}
                  {mode === 'grow' && overflow.grownHeight !== null && (
                    <span className="ml-auto text-[10px] text-muted">
                      h {Math.round(el.h)}→{overflow.grownHeight}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <p className="text-[10.5px] text-muted">The text fits its box.</p>
      )}

      {(features.mixedMarks || features.lists || features.links) && (
        <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
          This box uses{' '}
          {[
            features.mixedMarks && 'mixed formatting',
            features.lists && 'lists',
            features.links && 'links',
          ]
            .filter(Boolean)
            .join(', ')}
          . PPTX carries all of it; PDF carries the formatting, and a link’s
          address travels as text.
        </p>
      )}
    </>
  )
}

function NumField({
  label,
  value,
  step = 1,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string
  value: number
  step?: number
  min?: number
  max?: number
  disabled?: boolean
  onChange: (n: number) => void
}) {
  return (
    <label className="text-[10px] text-muted uppercase">
      {label}
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        className="field mt-0.5 w-full !px-1.5 !py-0.5 text-[11.5px]"
        aria-label={label}
        disabled={disabled}
        value={Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(n)
        }}
      />
    </label>
  )
}
