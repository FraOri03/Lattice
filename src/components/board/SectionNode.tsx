import { useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { NodeResizer } from '@xyflow/react'
import { CARD_COLORS, type BoardNode, type CardColor } from '@/types/model'
import { useStore, SECTION_COLLAPSED_H } from '@/store/useStore'
import { IcChevronDown, IcChevronRight } from '@/components/Icons'

/**
 * BoardSectionNode — a Figma-like frame. Sections sit at the start of the
 * nodes array (rendered behind cards); cards inside reference the section
 * via parentId, so dragging the header moves the whole group natively.
 * Attach/detach happens in BoardCanvas.onNodeDragStop.
 */
export function SectionNode({ id, data, selected }: NodeProps<BoardNode>) {
  const section = data.section
  const updateSection = useStore((s) => s.updateSection)
  const toggleCollapsed = useStore((s) => s.toggleSectionCollapsed)
  const [editing, setEditing] = useState(false)

  if (!section) return null
  const color = CARD_COLORS[section.color] ?? CARD_COLORS.gray

  return (
    <>
      <NodeResizer
        isVisible={!!selected && !section.collapsed}
        minWidth={240}
        minHeight={SECTION_COLLAPSED_H + 60}
        lineStyle={{ borderColor: color }}
        handleStyle={{
          width: 8,
          height: 8,
          borderRadius: 2,
          background: 'var(--panel)',
          border: `1.5px solid ${color}`,
        }}
      />
      <div
        className="flex h-full w-full flex-col overflow-hidden rounded-xl"
        style={{
          border: `1.5px ${selected ? 'solid' : 'dashed'} ${color}`,
          background: section.collapsed ? 'var(--panel)' : `${color}14`,
        }}
      >
        {/* header = drag handle */}
        <div
          className="section-drag flex flex-none cursor-grab items-center gap-1.5 px-2.5 active:cursor-grabbing"
          style={{ height: SECTION_COLLAPSED_H - 6, color }}
        >
          <button
            className="nodrag flex h-5 w-5 cursor-pointer items-center justify-center rounded hover:bg-black/10"
            title={section.collapsed ? 'Expand section' : 'Collapse section'}
            onClick={() => toggleCollapsed(id)}
          >
            {section.collapsed ? <IcChevronRight size={13} /> : <IcChevronDown size={13} />}
          </button>
          {editing ? (
            <input
              autoFocus
              className="nodrag min-w-0 flex-1 rounded border border-current/30 bg-transparent px-1 text-[12px] font-bold outline-none"
              value={section.title}
              onChange={(e) => updateSection(id, { title: e.target.value })}
              onBlur={() => setEditing(false)}
              onKeyDown={(e) => e.key === 'Enter' && setEditing(false)}
            />
          ) : (
            <span
              className="min-w-0 flex-1 truncate text-[12px] font-bold tracking-wide uppercase select-none"
              onDoubleClick={() => setEditing(true)}
              title="Double-click to rename"
            >
              {section.title}
            </span>
          )}
          <span className="text-[10px] opacity-70">
            {section.childCardIds.length > 0 && `${section.childCardIds.length} cards`}
          </span>
          {/* color picker (visible when selected) */}
          {selected && (
            <span className="nodrag flex items-center gap-1">
              {(Object.keys(CARD_COLORS) as CardColor[]).map((c) => (
                <button
                  key={c}
                  className="h-3 w-3 cursor-pointer rounded-full border border-white/40"
                  style={{
                    background: CARD_COLORS[c],
                    outline: section.color === c ? `1.5px solid ${CARD_COLORS[c]}` : 'none',
                    outlineOffset: 1,
                  }}
                  title={c}
                  onClick={() => updateSection(id, { color: c })}
                />
              ))}
            </span>
          )}
        </div>
        {!section.collapsed && <div className="min-h-0 flex-1" />}
      </div>
    </>
  )
}
