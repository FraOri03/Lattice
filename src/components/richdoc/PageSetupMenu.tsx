import { useState } from 'react'
import type { PageMargin, PageSize, RichDocMeta } from '@/types/model'
import { useStore } from '@/store/useStore'
import {
  PAGE_MARGINS_MM,
  PAGE_SIZES_MM,
  describePageSetup,
  pageSetupOf,
} from '@/lib/richdoc/pageSetup'
import { IcChevronDown, IcDoc } from '@/components/Icons'

/**
 * The Document editor's page menu: switch between the continuous reading
 * surface and A4/Letter paged layout, and pick size + margins. Writes to
 * the document's `page` meta, so the choice persists and the same setup
 * drives both the on-screen sheet and the export.
 */
export function PageSetupMenu({ doc, disabled }: { doc: RichDocMeta; disabled?: boolean }) {
  const updateDocMeta = useStore((s) => s.updateDocMeta)
  const [open, setOpen] = useState(false)
  const setup = pageSetupOf(doc.page)

  const patch = (over: Partial<typeof setup>) =>
    updateDocMeta(doc.id, { page: { ...setup, ...over } })

  return (
    <span className="relative">
      <button
        className="flex flex-none items-center gap-1 rounded-md border border-bord px-2 py-1 text-[11px] text-muted hover:text-ink disabled:opacity-40"
        title="Page layout"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <IcDoc size={12} />
        {describePageSetup(setup)}
        <IcChevronDown size={11} />
      </button>
      {open && (
        <>
          {/* click-away */}
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div
            className="absolute top-8 right-0 z-30 w-52 rounded-lg border border-bord bg-panel p-2 shadow-xl"
            role="menu"
          >
            <div className="insp-h mt-0">Layout</div>
            <div className="mb-1 flex rounded-md border border-bord p-0.5">
              {(
                [
                  ['continuous', 'Continuous'],
                  ['paged', 'Pages'],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  className={`flex-1 cursor-pointer rounded px-2 py-1 text-[11px] font-medium ${
                    setup.mode === mode ? 'bg-accent-soft text-accent' : 'text-muted hover:text-ink'
                  }`}
                  onClick={() => patch({ mode })}
                >
                  {label}
                </button>
              ))}
            </div>

            {setup.mode === 'paged' && (
              <>
                <div className="insp-h">Page size</div>
                <select
                  className="field h-7 cursor-pointer py-0 text-[11px]"
                  value={setup.size}
                  onChange={(e) => patch({ size: e.target.value as PageSize })}
                  aria-label="Page size"
                >
                  {(Object.keys(PAGE_SIZES_MM) as PageSize[]).map((s) => (
                    <option key={s} value={s}>
                      {PAGE_SIZES_MM[s].label} ({PAGE_SIZES_MM[s].w}×{PAGE_SIZES_MM[s].h} mm)
                    </option>
                  ))}
                </select>

                <div className="insp-h">Margins</div>
                <select
                  className="field h-7 cursor-pointer py-0 text-[11px]"
                  value={setup.margin}
                  onChange={(e) => patch({ margin: e.target.value as PageMargin })}
                  aria-label="Margins"
                >
                  {(Object.keys(PAGE_MARGINS_MM) as PageMargin[]).map((m) => (
                    <option key={m} value={m}>
                      {PAGE_MARGINS_MM[m].label} ({PAGE_MARGINS_MM[m].value} mm)
                    </option>
                  ))}
                </select>

                <p className="mt-2 text-[10px] leading-snug text-muted">
                  Dashed lines mark where pages break. Exact pagination happens on export
                  (PDF/print) at {PAGE_SIZES_MM[setup.size].label}.
                </p>
              </>
            )}
            {setup.mode === 'continuous' && (
              <p className="mt-1 text-[10px] leading-snug text-muted">
                One continuous surface, best for reading on screen. Switch to Pages for a
                print-accurate layout.
              </p>
            )}
          </div>
        </>
      )}
    </span>
  )
}
