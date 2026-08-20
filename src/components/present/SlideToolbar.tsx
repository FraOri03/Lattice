import { useI18n } from '@/lib/i18n'
import {
  IcChart,
  IcImage,
  IcLayout,
  IcMagnet,
  IcPlay,
  IcObjectAlignBottom,
  IcObjectAlignCenter,
  IcObjectAlignLeft,
  IcObjectAlignMiddle,
  IcObjectAlignRight,
  IcObjectAlignTop,
  IcObjectDistributeH,
  IcObjectDistributeV,
  IcTable,
} from '@/components/Icons'
import {
  ToolbarAction,
  ToolbarGroup,
  ToolbarRoot,
  ToolbarSeparator,
  ToolbarToggle,
  TOOLBAR_CONTROL_ATTR,
} from '@/components/ui/toolbar'
import type { AlignEdge, DistributeAxis } from '@/lib/present/align'

export type SlideShape = 'rect' | 'ellipse' | 'line'

/**
 * The slide editor's toolbar (Phase 11.1.6b).
 *
 * Extracted from PresentationWorkspace so it has the same shape as every other
 * mode's bar — its own file, its own test — rather than living inline in a
 * 900-line workspace.
 *
 * 19E.0 adds the precision controls the Phase 1 canvas needs: a snapping
 * toggle, and an align/distribute group. The group appears as soon as anything
 * is selected, because with one element the thing to align against is the
 * slide — centring a single box is the commonest alignment there is.
 * Distribution still needs three, and says so. They are built from the same
 * primitives as the rest of the bar rather than the hand-rolled `.tbtn`
 * buttons the original branch used, because that class was retired in 12.4.
 *
 * Hidden entirely for a viewer by its caller, as before.
 */
export function SlideToolbar({
  slideIndex,
  slideCount,
  background,
  themeBackground,
  selectedCount,
  snapEnabled,
  layoutName,
  onAddText,
  onAddImage,
  onAddShape,
  onBackground,
  onResetBackground,
  onToggleSnap,
  onOpenLayouts,
  onInsertChart,
  onInsertTable,
  onPresent,
  onAlign,
  onDistribute,
}: {
  slideIndex: number
  slideCount: number
  /** the slide's own background, or null when it follows the theme */
  background: string | null | undefined
  themeBackground: string
  /** how many elements the canvas has selected — drives the arrange group */
  selectedCount: number
  snapEnabled: boolean
  layoutName: string | null
  onAddText: () => void
  onAddImage: () => void
  onAddShape: (shape: SlideShape) => void
  onBackground: (color: string) => void
  onResetBackground: () => void
  onToggleSnap: () => void
  onOpenLayouts: () => void
  onInsertChart: () => void
  onInsertTable: () => void
  onPresent: () => void
  onAlign: (edge: AlignEdge) => void
  onDistribute: (axis: DistributeAxis) => void
}) {
  const t = useI18n().toolbar.presentation
  return (
    <div className="flex flex-none flex-wrap items-center gap-0.5 border-b border-bord bg-panel px-2 py-1">
      <ToolbarRoot label={t.label} size="sm" className="flex-wrap gap-0.5">
        <ToolbarGroup label={t.groups.insert}>
          <ToolbarAction
            // decorative: without aria-hidden the "+" joins the accessible
            // name and the button announces as "+Text"
            icon={<span aria-hidden>+</span>}
            content="icon-text"
            label={t.text}
            description={t.addText}
            onRun={onAddText}
          />
          <ToolbarAction
            icon={<IcImage size={12} />}
            content="icon-text"
            label={t.image}
            description={t.addImage}
            onRun={onAddImage}
          />
          <ToolbarAction
            icon={<IcChart size={12} />}
            content="icon-text"
            label={t.chart}
            description={t.chartDescription}
            haspopup="dialog"
            onRun={onInsertChart}
          />
          <ToolbarAction
            icon={<IcTable size={12} />}
            content="icon-text"
            label={t.table}
            description={t.tableDescription}
            onRun={onInsertTable}
          />
        </ToolbarGroup>

        <ToolbarSeparator />

        {/* Shapes exist here and nowhere else in the product — the Board has
            none. This bar shows what this editor can really do. */}
        <ToolbarGroup label={t.groups.shapes}>
          <ToolbarAction icon="▭" label={t.addRect} onRun={() => onAddShape('rect')} />
          <ToolbarAction icon="◯" label={t.addEllipse} onRun={() => onAddShape('ellipse')} />
          <ToolbarAction icon="—" label={t.addLine} onRun={() => onAddShape('line')} />
        </ToolbarGroup>

        <ToolbarSeparator />

        <ToolbarGroup label={t.groups.background}>
          <label className="flex items-center gap-1 text-[11px] text-muted">
            {t.background}
            <input
              type="color"
              // the primitives own buttons and selects, not colour inputs;
              // marking it keeps the bar a single tab stop instead of
              // inventing a one-off primitive for a single call site
              {...{ [TOOLBAR_CONTROL_ATTR]: '' }}
              className="h-5 w-8 cursor-pointer border-0 bg-transparent p-0"
              value={background ?? themeBackground}
              aria-label={t.backgroundColour}
              onChange={(e) => onBackground(e.target.value)}
            />
          </label>
          {background && (
            <ToolbarAction icon="✕" label={t.resetBackground} onRun={onResetBackground} />
          )}
        </ToolbarGroup>

        <ToolbarSeparator />

        <ToolbarGroup label={t.groups.design}>
          <ToolbarAction
            icon={<IcLayout size={13} />}
            content="icon-text"
            label={layoutName ?? t.layout}
            description={t.layoutDescription}
            haspopup="dialog"
            onRun={onOpenLayouts}
          />
        </ToolbarGroup>

        <ToolbarSeparator />

        <ToolbarGroup label={t.groups.precision}>
          <ToolbarToggle
            icon={<IcMagnet size={13} />}
            label={t.snap}
            description={t.snapDescription}
            pressed={snapEnabled}
            onRun={onToggleSnap}
          />
        </ToolbarGroup>

        {/* Alignment needs something to align against, and with one element
            that something is the slide — so the group appears as soon as
            anything is selected. Distribution still needs three. */}
        {selectedCount > 0 && (
          <>
            <ToolbarSeparator />
            <ToolbarGroup label={t.groups.arrange}>
              {/* mapped rather than repeated, so the reference wording cannot
                  end up on some of the six and not the others */}
              {(
                [
                  ['left', t.alignLeft, IcObjectAlignLeft],
                  ['hcenter', t.alignCenter, IcObjectAlignCenter],
                  ['right', t.alignRight, IcObjectAlignRight],
                  ['top', t.alignTop, IcObjectAlignTop],
                  ['vcenter', t.alignMiddle, IcObjectAlignMiddle],
                  ['bottom', t.alignBottom, IcObjectAlignBottom],
                ] as const
              ).map(([edge, label, Icon]) => (
                <ToolbarAction
                  key={edge}
                  icon={<Icon size={13} />}
                  label={label}
                  description={selectedCount === 1 ? t.alignToSlide : undefined}
                  onRun={() => onAlign(edge)}
                />
              ))}
              <ToolbarAction
                icon={<IcObjectDistributeH size={13} />}
                label={t.distributeH}
                disabled={selectedCount < 3}
                disabledReason={t.needsThree}
                onRun={() => onDistribute('h')}
              />
              <ToolbarAction
                icon={<IcObjectDistributeV size={13} />}
                label={t.distributeV}
                disabled={selectedCount < 3}
                disabledReason={t.needsThree}
                onRun={() => onDistribute('v')}
              />
            </ToolbarGroup>
          </>
        )}

        <ToolbarSeparator />

        {/* Present sits last and to the right — inside the same root, because
            a second ToolbarRoot would be a second tab stop and this bar is
            deliberately one. */}
        <ToolbarGroup label={t.present} className="ml-auto">
          <ToolbarAction
            icon={<IcPlay size={12} />}
            content="icon-text"
            label={t.present}
            description={t.presentDescription}
            onRun={onPresent}
          />
        </ToolbarGroup>
      </ToolbarRoot>

      {/* status, not a control */}
      <span className="ml-2 text-[10.5px] text-muted">
        {selectedCount > 0 ? t.selection(selectedCount) : t.status(slideIndex + 1, slideCount)}
      </span>
    </div>
  )
}
