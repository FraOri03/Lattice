import { useState } from 'react'
import type { PresentSection, PresentationBody, SlideReviewStatus } from '@/lib/present/presentModel'
import { sectionRuns } from '@/lib/present/sections'
import { SlideView } from './SlideView'
import { IcChevronDown, IcChevronRight, IcCopy, IcEyeOff, IcPlus, IcTrash } from '@/components/Icons'

/**
 * The slide rail (19E.1) — the deck's structure, not just a list of pictures.
 *
 * Slides group into sections, a hidden slide says so instead of quietly
 * dropping out of the export, and a review status is visible while scanning
 * rather than only when the slide is open. Ordering lives in the deck's
 * `slides` array; this component only renders the runs `sectionRuns` derives.
 */

const REVIEW_META: Record<SlideReviewStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: '#ffa629' },
  review: { label: 'In review', color: '#0d99ff' },
  approved: { label: 'Approved', color: '#14ae5c' },
}

export interface SlideRailHandlers {
  onGoTo: (index: number) => void
  onMove: (index: number, delta: -1 | 1) => void
  onDuplicate: (index: number) => void
  onDelete: (index: number) => void
  onAdd: () => void
  onStartSection: (index: number) => void
  onRenameSection: (id: string, title: string) => void
  onToggleCollapsed: (section: PresentSection) => void
  onMoveSection: (id: string, direction: -1 | 1) => void
  onRemoveSection: (id: string) => void
}

export function SlideRail({
  body,
  currentIndex,
  readOnly,
  handlers,
}: {
  body: PresentationBody
  currentIndex: number
  readOnly: boolean
  handlers: SlideRailHandlers
}) {
  const runs = sectionRuns(body)
  const total = body.slides.length

  return (
    <aside className="flex w-48 flex-none flex-col border-r border-bord" aria-label="Slides">
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {runs.map((run, runIndex) => (
          <div key={run.section?.id ?? `loose-${runIndex}`} className="mb-1">
            {run.section && (
              <SectionHeader
                section={run.section}
                count={run.slides.length}
                readOnly={readOnly}
                canMoveUp={runIndex > 0}
                canMoveDown={runIndex < runs.length - 1}
                handlers={handlers}
              />
            )}
            {!(run.section?.collapsed === true) &&
              run.slides.map(({ slide, index }) => (
                <div
                  key={slide.id}
                  className={`group relative mb-2 cursor-pointer overflow-hidden rounded-lg border ${
                    index === currentIndex ? 'border-accent' : 'border-bord hover:border-muted'
                  } ${slide.hidden ? 'opacity-60' : ''}`}
                  onClick={() => handlers.onGoTo(index)}
                  role="button"
                  aria-label={`Slide ${index + 1}${slide.hidden ? ' (hidden)' : ''}`}
                  aria-current={index === currentIndex}
                >
                  <SlideView slide={slide} theme={body.theme} width={156} />

                  <span className="absolute top-1 left-1 flex items-center gap-1 rounded bg-panel/85 px-1 text-[9px] font-bold">
                    {index + 1}
                    {slide.reviewStatus && (
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: REVIEW_META[slide.reviewStatus].color }}
                        title={REVIEW_META[slide.reviewStatus].label}
                        aria-label={REVIEW_META[slide.reviewStatus].label}
                        role="img"
                      />
                    )}
                  </span>

                  {/* a hidden slide has to say so in the rail: it is the only
                      place the difference between "in the deck" and "in the
                      presentation" is visible while editing */}
                  {slide.hidden && (
                    <span className="absolute top-1 right-1 flex items-center gap-0.5 rounded bg-panel/90 px-1 text-[9px] text-muted">
                      <IcEyeOff size={9} /> Hidden
                    </span>
                  )}

                  {!readOnly && (
                    <span className="absolute right-1 bottom-1 hidden gap-0.5 group-hover:flex">
                      <RailButton
                        title="Move slide up"
                        label={`Move slide ${index + 1} up`}
                        disabled={index === 0}
                        onClick={() => handlers.onMove(index, -1)}
                      >
                        ↑
                      </RailButton>
                      <RailButton
                        title="Move slide down"
                        label={`Move slide ${index + 1} down`}
                        disabled={index === total - 1}
                        onClick={() => handlers.onMove(index, 1)}
                      >
                        ↓
                      </RailButton>
                      <RailButton
                        title="Duplicate slide"
                        label={`Duplicate slide ${index + 1}`}
                        onClick={() => handlers.onDuplicate(index)}
                      >
                        <IcCopy size={10} />
                      </RailButton>
                      <RailButton
                        title="Start a section here"
                        label={`Start a section at slide ${index + 1}`}
                        onClick={() => handlers.onStartSection(index)}
                      >
                        §
                      </RailButton>
                      <RailButton
                        title="Delete slide"
                        label={`Delete slide ${index + 1}`}
                        className="text-[#f24822]"
                        onClick={() => handlers.onDelete(index)}
                      >
                        <IcTrash size={10} />
                      </RailButton>
                    </span>
                  )}
                </div>
              ))}
          </div>
        ))}
      </div>

      {!readOnly && (
        <button className="btn m-2 flex-none" onClick={handlers.onAdd}>
          <IcPlus size={12} /> Add slide
        </button>
      )}
    </aside>
  )
}

function RailButton({
  title,
  label,
  disabled,
  className = '',
  onClick,
  children,
}: {
  title: string
  label: string
  disabled?: boolean
  className?: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      className={`icon-btn h-5 w-5 bg-panel/90 ${className}`}
      title={title}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      {children}
    </button>
  )
}

function SectionHeader({
  section,
  count,
  readOnly,
  canMoveUp,
  canMoveDown,
  handlers,
}: {
  section: PresentSection
  count: number
  readOnly: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  handlers: SlideRailHandlers
}) {
  const [editing, setEditing] = useState(false)
  const collapsed = section.collapsed === true

  return (
    <div className="group/sec mb-1 flex items-center gap-1 px-0.5">
      <button
        className="icon-btn h-5 w-5"
        title={collapsed ? 'Expand section' : 'Collapse section'}
        aria-label={`${collapsed ? 'Expand' : 'Collapse'} section ${section.title}`}
        aria-expanded={!collapsed}
        onClick={() => handlers.onToggleCollapsed(section)}
      >
        {collapsed ? <IcChevronRight size={11} /> : <IcChevronDown size={11} />}
      </button>

      {editing && !readOnly ? (
        <input
          autoFocus
          className="field min-w-0 flex-1 !px-1 !py-0 text-[11px]"
          defaultValue={section.title}
          aria-label={`Rename section ${section.title}`}
          onBlur={(e) => {
            handlers.onRenameSection(section.id, e.target.value.trim() || section.title)
            setEditing(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') setEditing(false)
          }}
        />
      ) : (
        <button
          className="min-w-0 flex-1 truncate text-left text-[11px] font-semibold text-ink"
          title={readOnly ? section.title : `Rename “${section.title}”`}
          disabled={readOnly}
          onClick={() => setEditing(true)}
        >
          {section.title}
        </button>
      )}

      <span className="flex-none text-[9.5px] text-muted">{count}</span>

      {!readOnly && (
        <span className="hidden flex-none gap-0.5 group-hover/sec:flex">
          <RailButton
            title="Move section up"
            label={`Move section ${section.title} up`}
            disabled={!canMoveUp}
            onClick={() => handlers.onMoveSection(section.id, -1)}
          >
            ↑
          </RailButton>
          <RailButton
            title="Move section down"
            label={`Move section ${section.title} down`}
            disabled={!canMoveDown}
            onClick={() => handlers.onMoveSection(section.id, 1)}
          >
            ↓
          </RailButton>
          {/* removing the heading keeps every slide — worth saying in the
              tooltip, because "remove section" reads like "delete slides" */}
          <RailButton
            title="Remove section heading (slides stay)"
            label={`Remove section ${section.title}`}
            onClick={() => handlers.onRemoveSection(section.id)}
          >
            ✕
          </RailButton>
        </span>
      )}
    </div>
  )
}
