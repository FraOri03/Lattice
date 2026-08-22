import { Suspense, lazy, useCallback, useRef } from 'react'
import { useUiStore } from '@/store/useUiStore'
import { useAiActivity } from '@/lib/ai/activity'
import { AnchoredPopover } from '@/components/ui/AnchoredPopover'
import { SwitcherTab } from '@/components/shell/SwitcherTab'
import { useI18n } from '@/lib/i18n'
import { IcSparkles } from '@/components/Icons'

/**
 * The AI entry in the top bar, and the panel it opens.
 *
 * ## Why a panel and not a section
 *
 * Generating is something you do *for* what is already on screen. A section
 * switch would take the board, document or shot away to show a form about
 * it, and then hand back the result with no context to drop it into. So the
 * surface is an anchored panel over the workspace — the same arrangement the
 * notification centre and the sync queue already use — and the rest of the
 * app keeps working behind it, which is also what "a running job must not
 * block the app" requires.
 *
 * ## Why the panel is lazy and this file is not
 *
 * The tab is mounted on every page load; the panel is opened by a minority
 * of sessions. `AiPanel` therefore arrives through `React.lazy`, and with it
 * the whole `lib/ai` seam — the cost tables, the catalogue, the providers.
 * What stays eager is this file: a button, a popover and one number. #11
 * records a main bundle around 700 kB gz that this phase must not grow, and
 * 22.7 turns that into a rule for every creative engine.
 *
 * ## Why it is icon-only
 *
 * `topBarFit`'s budget was measured with this cluster contributing two icons
 * and no words. A ninth label in the switcher takes it past the box it was
 * measured into, and the tab already carries a tooltip and an aria-label
 * that say more than a two-letter word would.
 */
const AiPanel = lazy(() => import('./AiPanel'))

export function AiTab() {
  const t = useI18n()
  const anchor = useRef<HTMLButtonElement>(null)
  const open = useUiStore((s) => s.aiPanelOpen)
  const setOpen = useUiStore((s) => s.setAiPanelOpen)
  const running = useAiActivity((s) => s.running)

  /*
   * Focus goes back to the tab when the panel closes. Without it an Escape
   * leaves the focus ring on a node that has just been removed from the
   * document, and a keyboard user restarts from the top of the page — which
   * is the failure `docs/accessibility.md` calls out for every overlay.
   */
  const close = useCallback(() => {
    setOpen(false)
    anchor.current?.focus()
  }, [setOpen])

  return (
    <>
      <SwitcherTab
        ref={anchor}
        icon={<IcSparkles size={13} />}
        label={t.modes.ai}
        labelled={false}
        active={open}
        badge={running}
        onClick={() => (open ? close() : setOpen(true))}
        ariaLabel={t.topbar.aiAria(running)}
        title={open ? t.topbar.aiClose : t.topbar.aiOpen}
      />
      <AnchoredPopover
        anchorRef={anchor}
        open={open}
        onClose={close}
        role="dialog"
        label={t.ai.panelAria}
        className="flex w-[24rem] max-w-[calc(100vw-1rem)] flex-col overflow-hidden"
      >
        <Suspense
          fallback={
            <div className="p-4 text-[11px] text-muted" role="status">
              {t.ai.panelTitle}
            </div>
          }
        >
          <AiPanel onClose={close} />
        </Suspense>
      </AnchoredPopover>
    </>
  )
}
