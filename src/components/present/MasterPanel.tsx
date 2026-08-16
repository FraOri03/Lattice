import { useState } from 'react'
import type { PresentationBody, PresentSlide } from '@/lib/present/presentModel'
import {
  createMaster,
  masterUsage,
  type PresentMaster,
} from '@/lib/present/masters'
import { TOKEN_LABEL, deckTokens, overriddenTokenKeys, type ThemeTokens } from '@/lib/present/theme'
import { IcPlus, IcTrash } from '@/components/Icons'

/**
 * Masters (19E.2) — the deck's design, and what each master changes about it.
 *
 * The panel's job is to make inheritance legible: a master shows only the
 * tokens it actually overrides, each with a revert, so "what is this master
 * doing?" is answerable at a glance instead of by diffing two colour pickers.
 */

/** The tokens a master paints with, and the ones it changed to get there. */
const COLOUR_TOKENS = ['bg', 'surface', 'text', 'textMuted', 'accent'] as const
const SIZE_TOKENS = ['titleSize', 'headingSize', 'bodySize', 'captionSize', 'radius'] as const

export function MasterPanel({
  body,
  slide,
  readOnly,
  onAddMaster,
  onRemoveMaster,
  onRenameMaster,
  onSetToken,
  onAssignToSlide,
  onSetFurniture,
}: {
  body: PresentationBody
  slide: PresentSlide
  readOnly: boolean
  onAddMaster: (master: PresentMaster) => void
  onRemoveMaster: (id: string) => void
  onRenameMaster: (id: string, name: string) => void
  onSetToken: (id: string, key: keyof ThemeTokens, value: string | number | undefined) => void
  onAssignToSlide: (id: string | undefined) => void
  onSetFurniture: (id: string, patch: { rule?: boolean; slideNumber?: boolean; footerText?: string }) => void
}) {
  const masters = body.masters ?? []
  const [openId, setOpenId] = useState<string | null>(slide.masterId ?? masters[0]?.id ?? null)
  const open = masters.find((m) => m.id === openId) ?? null
  const inherited = deckTokens(body)
  const overrides = open ? overriddenTokenKeys(inherited, open.tokens) : []

  return (
    <>
      <div className="insp-h">This slide follows</div>
      <select
        className="field h-6 w-full cursor-pointer px-1 py-0 text-[11.5px]"
        aria-label="Master for this slide"
        disabled={readOnly}
        value={slide.masterId ?? ''}
        onChange={(e) => onAssignToSlide(e.target.value || undefined)}
      >
        <option value="">The deck’s own design</option>
        {masters.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>

      <div className="insp-h">Masters</div>
      {masters.length === 0 && (
        <p className="mb-1.5 text-[10.5px] leading-relaxed text-muted">
          No masters yet. Every slide follows the deck’s theme. A master is a
          design a group of slides can share — and change in one place.
        </p>
      )}
      <div className="flex flex-col gap-0.5">
        {masters.map((m) => (
          <div
            key={m.id}
            className={`flex items-center gap-1 rounded px-1 py-0.5 ${
              openId === m.id ? 'bg-accent-soft' : 'hover:bg-panel2'
            }`}
          >
            <button
              className="min-w-0 flex-1 truncate text-left text-[11px] text-ink"
              aria-pressed={openId === m.id}
              onClick={() => setOpenId(m.id === openId ? null : m.id)}
            >
              {m.name}
            </button>
            <span className="text-[9.5px] text-muted">
              {masterUsage(body, m.id)} {masterUsage(body, m.id) === 1 ? 'slide' : 'slides'}
            </span>
            {!readOnly && (
              <button
                className="icon-btn h-5 w-5"
                title="Delete master — its slides go back to the deck’s design"
                aria-label={`Delete master ${m.name}`}
                onClick={() => onRemoveMaster(m.id)}
              >
                <IcTrash size={11} />
              </button>
            )}
          </div>
        ))}
      </div>

      {!readOnly && (
        <button
          className="btn mt-1.5 w-full"
          onClick={() => {
            const m = createMaster(`Master ${masters.length + 1}`)
            onAddMaster(m)
            setOpenId(m.id)
          }}
        >
          <IcPlus size={12} /> New master
        </button>
      )}

      {open && (
        <>
          <div className="insp-h">{open.name}</div>
          <label className="mb-1.5 block text-[10px] text-muted uppercase">
            Name
            <input
              className="field mt-0.5 w-full !px-1.5 !py-0.5 text-[11.5px]"
              value={open.name}
              readOnly={readOnly}
              aria-label={`Name of ${open.name}`}
              onChange={(e) => onRenameMaster(open.id, e.target.value)}
            />
          </label>

          {/* the whole point: what this master changes, and how to undo it */}
          <p className="mb-1 text-[10.5px] text-muted">
            {overrides.length === 0
              ? 'Overrides nothing — identical to the deck.'
              : `${overrides.length} ${overrides.length === 1 ? 'property overrides' : 'properties override'} the deck: ${overrides
                  .map((k) => TOKEN_LABEL[k])
                  .join(', ')}.`}
          </p>

          {COLOUR_TOKENS.map((key) => (
            <TokenRow
              key={key}
              label={TOKEN_LABEL[key]}
              overridden={overrides.includes(key)}
              readOnly={readOnly}
              onRevert={() => onSetToken(open.id, key, undefined)}
            >
              <input
                type="color"
                className="h-5 w-8 cursor-pointer border-0 bg-transparent p-0"
                aria-label={`${TOKEN_LABEL[key]} of ${open.name}`}
                disabled={readOnly}
                value={(open.tokens?.[key] as string) ?? inherited[key]}
                onChange={(e) => onSetToken(open.id, key, e.target.value)}
              />
            </TokenRow>
          ))}

          {SIZE_TOKENS.map((key) => (
            <TokenRow
              key={key}
              label={TOKEN_LABEL[key]}
              overridden={overrides.includes(key)}
              readOnly={readOnly}
              onRevert={() => onSetToken(open.id, key, undefined)}
            >
              <input
                type="number"
                min={1}
                className="field w-14 !px-1.5 !py-0.5 text-[11.5px]"
                aria-label={`${TOKEN_LABEL[key]} of ${open.name}`}
                disabled={readOnly}
                value={(open.tokens?.[key] as number) ?? inherited[key]}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  if (Number.isFinite(n) && n > 0) onSetToken(open.id, key, n)
                }}
              />
            </TokenRow>
          ))}

          <div className="insp-h">Furniture</div>
          <label className="flex items-center gap-2 text-[11px] text-muted">
            <input
              type="checkbox"
              disabled={readOnly}
              checked={open.furniture?.rule === true}
              onChange={(e) => onSetFurniture(open.id, { rule: e.target.checked })}
            />
            Footer rule
          </label>
          <label className="mt-1 flex items-center gap-2 text-[11px] text-muted">
            <input
              type="checkbox"
              disabled={readOnly}
              checked={open.furniture?.slideNumber === true}
              onChange={(e) => onSetFurniture(open.id, { slideNumber: e.target.checked })}
            />
            Slide number
          </label>
          <label className="mt-1 block text-[10px] text-muted uppercase">
            Footer text
            <input
              className="field mt-0.5 w-full !px-1.5 !py-0.5 text-[11.5px]"
              placeholder="Lattice · Phase 19"
              readOnly={readOnly}
              aria-label="Footer text"
              value={open.furniture?.footerText ?? ''}
              onChange={(e) => onSetFurniture(open.id, { footerText: e.target.value })}
            />
          </label>
          <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
            Furniture is drawn on every slide that follows this master, on the
            canvas and in exports alike. It cannot be selected or moved from a
            slide — that is what makes it the master’s.
          </p>
        </>
      )}
    </>
  )
}

function TokenRow({
  label,
  overridden,
  readOnly,
  onRevert,
  children,
}: {
  label: string
  overridden: boolean
  readOnly: boolean
  onRevert: () => void
  children: React.ReactNode
}) {
  return (
    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {overridden && (
        <span className="rounded bg-accent-soft px-1 text-[9px] text-accent">overridden</span>
      )}
      {children}
      {overridden && !readOnly && (
        <button
          className="toolbar-control toolbar-control--sm text-[9px]"
          title={`Revert ${label} to the deck’s value`}
          aria-label={`Revert ${label}`}
          onClick={onRevert}
        >
          <span aria-hidden>↺</span>
        </button>
      )}
    </div>
  )
}
