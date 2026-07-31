import { useI18n } from '@/lib/i18n'
import { IcImage } from '@/components/Icons'
import {
  ToolbarAction,
  ToolbarGroup,
  ToolbarRoot,
  ToolbarSeparator,
  TOOLBAR_CONTROL_ATTR,
} from '@/components/ui/toolbar'

export type SlideShape = 'rect' | 'ellipse' | 'line'

/**
 * The slide editor's toolbar (Phase 11.1.6b).
 *
 * Extracted from PresentationWorkspace so it has the same shape as every other
 * mode's bar — its own file, its own test — rather than living inline in a
 * 900-line workspace. The controls are unchanged.
 *
 * Hidden entirely for a viewer by its caller, as before.
 */
export function SlideToolbar({
  slideIndex,
  slideCount,
  background,
  themeBackground,
  onAddText,
  onAddImage,
  onAddShape,
  onBackground,
  onResetBackground,
}: {
  slideIndex: number
  slideCount: number
  /** the slide's own background, or null when it follows the theme */
  background: string | null | undefined
  themeBackground: string
  onAddText: () => void
  onAddImage: () => void
  onAddShape: (shape: SlideShape) => void
  onBackground: (color: string) => void
  onResetBackground: () => void
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
      </ToolbarRoot>

      {/* status, not a control */}
      <span className="ml-auto text-[10.5px] text-muted">
        {t.status(slideIndex + 1, slideCount)}
      </span>
    </div>
  )
}
