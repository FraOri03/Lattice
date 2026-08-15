import { useState } from 'react'
import type { PresentationBody } from '@/lib/present/presentModel'
import { LAYOUTS, planLayout, type LayoutPlan, type LayoutSpec } from '@/lib/present/layouts'
import { SLIDE_H, SLIDE_W } from '@/lib/present/presentModel'
import { IcX } from '@/components/Icons'

/**
 * The layout picker (19E.2).
 *
 * Applying a layout moves a slide's content, so it says what it is about to do
 * first. The plan comes from `planLayout`, which is pure — this panel only
 * renders it and hands an approved plan back. Nothing is applied on hover, and
 * nothing is applied by picking: there is an explicit button.
 */

export function LayoutPicker({
  body,
  slideIndex,
  onApply,
  onClose,
}: {
  body: PresentationBody
  slideIndex: number
  onApply: (plan: LayoutPlan) => void
  onClose: () => void
}) {
  const current = body.slides[slideIndex]?.layoutId
  const [picked, setPicked] = useState<string | null>(current ?? null)
  const plan = picked ? planLayout(body, slideIndex, picked) : null

  return (
    <div
      className="absolute top-2 left-2 z-20 w-[22rem] rounded-xl border border-bord bg-panel shadow-xl"
      role="dialog"
      aria-label="Choose a layout"
    >
      <div className="flex items-center gap-2 border-b border-bord px-3 py-2">
        <span className="flex-1 text-[12px] font-semibold">Layout</span>
        <button className="icon-btn" aria-label="Close layout picker" onClick={onClose}>
          <IcX size={13} />
        </button>
      </div>

      <div className="grid max-h-56 grid-cols-3 gap-1.5 overflow-y-auto p-2">
        {LAYOUTS.map((layout) => (
          <button
            key={layout.id}
            className={`rounded-lg border p-1 text-left ${
              picked === layout.id ? 'border-accent' : 'border-bord hover:border-muted'
            }`}
            aria-pressed={picked === layout.id}
            onClick={() => setPicked(layout.id)}
          >
            <LayoutThumb layout={layout} />
            <span className="mt-1 block truncate text-[10px] text-muted">
              {layout.name}
              {current === layout.id && ' · current'}
            </span>
          </button>
        ))}
      </div>

      {plan && (
        <div className="border-t border-bord px-3 py-2">
          <p className="text-[11px] text-ink">
            <span className="text-[#14ae5c]">✓</span> {plan.assignments.length}{' '}
            {plan.assignments.length === 1 ? 'object maps' : 'objects map'} by role
            {plan.assignments.length > 0 && ' — a title stays the title'}.
          </p>
          {plan.freeElementIds.length > 0 && (
            <p className="mt-1 text-[11px] text-muted">
              <span className="text-[#ffa629]">⚠</span> {plan.freeElementIds.length}{' '}
              {plan.freeElementIds.length === 1 ? 'object sits' : 'objects sit'} outside every
              placeholder. They keep their exact geometry and stay on the slide as free objects.
            </p>
          )}
          {plan.emptyRoles.length > 0 && (
            <p className="mt-1 text-[11px] text-muted">
              {plan.emptyRoles.length} placeholder
              {plan.emptyRoles.length === 1 ? '' : 's'} will stay empty ({plan.emptyRoles.join(', ')}).
            </p>
          )}
          <p className="mt-1 text-[10.5px] text-muted">
            One undo puts everything back, and overrides stay revertible per property.
          </p>
          <button
            className="btn mt-2 w-full !border-accent !text-accent"
            onClick={() => onApply(plan)}
          >
            Apply “{plan.layout.name}” to slide {slideIndex + 1}
          </button>
        </div>
      )}

      {!plan && (
        <p className="border-t border-bord px-3 py-2 text-[11px] text-muted">
          Pick a layout to see what it would do with this slide’s content.
        </p>
      )}
    </div>
  )
}

/** A miniature of the placeholder boxes — enough to recognise the shape. */
function LayoutThumb({ layout }: { layout: LayoutSpec }) {
  const W = 92
  const scale = W / SLIDE_W
  return (
    <span
      className="relative block rounded border border-bord bg-panel2"
      style={{ width: W, height: SLIDE_H * scale }}
      aria-hidden
    >
      {layout.placeholders.map((p, i) => (
        <span
          key={i}
          className="absolute rounded-[1px]"
          style={{
            left: p.x * scale,
            top: p.y * scale,
            width: p.w * scale,
            height: Math.max(2, p.h * scale),
            background: p.kind === 'image' ? 'var(--muted)' : 'var(--accent)',
            opacity: p.kind === 'image' ? 0.35 : 0.55,
          }}
        />
      ))}
    </span>
  )
}
