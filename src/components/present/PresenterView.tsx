import { useCallback, useEffect, useRef, useState } from 'react'
import type { PresentationBody } from '@/lib/present/presentModel'
import {
  formatElapsed,
  keyAction,
  presenterSlides,
  reduce,
  transitionPlan,
  type PresenterState,
} from '@/lib/present/presenter'
import { furnitureElements, masterTokensFor } from '@/lib/present/masters'
import { SlideView } from './SlideView'
import { IcChevronRight, IcX } from '@/components/Icons'

/**
 * Presenting (#244).
 *
 * The presentation is the slide and nothing else — that is what an audience
 * should see. The presenter's aids (next slide, notes, clock) are an overlay
 * you turn on with `S`.
 *
 * **A limitation worth naming:** in one window those aids share the screen
 * with the slide, so "visible to the presenter and never to the audience" is
 * only true on a second display. That is deliberately not built here; showing
 * notes on the projector while claiming otherwise would be worse than saying
 * it plainly.
 */
export function PresenterView({
  body,
  title,
  startAt,
  onExit,
}: {
  body: PresentationBody
  title: string
  startAt: number
  onExit: () => void
}) {
  const slides = presenterSlides(body)
  const [state, setState] = useState<PresenterState>({ at: Math.min(startAt, slides.length - 1), black: false })
  const [aids, setAids] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const startedAt = useRef(Date.now())
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

  const slide = slides[state.at] ?? null
  const nextSlide = slides[state.at + 1] ?? null
  const plan = transitionPlan(slide ?? undefined, reduced)

  /* the clock only has to be right to the second */
  useEffect(() => {
    const id = window.setInterval(() => setElapsed(Date.now() - startedAt.current), 500)
    return () => window.clearInterval(id)
  }, [])

  /**
   * Ask for real fullscreen, and carry on without it if the browser says no.
   * A refused request must not leave a half-presenting screen: the overlay is
   * fixed and covers the viewport either way.
   */
  useEffect(() => {
    const el = rootRef.current
    if (!el?.requestFullscreen) return
    void el.requestFullscreen().catch(() => undefined)
    return () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    }
  }, [])

  // leaving fullscreen by any route (Esc, F11, display change) ends the show
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) onExit()
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [onExit])

  const act = useCallback(
    (key: string) => {
      const action = keyAction(key)
      if (!action) return
      if (action === 'exit') {
        onExit()
        return
      }
      setState((s) => reduce(s, action, slides.length))
    },
    [onExit, slides.length],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 's' || e.key === 'S') {
        setAids((v) => !v)
        return
      }
      if (keyAction(e.key)) e.preventDefault()
      act(e.key)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [act])

  if (!slide) {
    return (
      <div className="fixed inset-0 z-[100] grid place-items-center bg-black text-white">
        <p className="text-sm">
          Every slide in this deck is hidden, so there is nothing to present.
        </p>
      </div>
    )
  }

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[100] flex flex-col bg-black"
      role="region"
      aria-label={`Presenting ${title}`}
      onClick={() => act('ArrowRight')}
      onContextMenu={(e) => {
        e.preventDefault()
        act('ArrowLeft')
      }}
    >
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {state.black ? (
          <div className="absolute inset-0 bg-black" aria-label="Black screen" />
        ) : (
          <div
            /* the key restarts the animation on every slide change; without a
               transition there is no animation to restart */
            key={`${slide.id}-${state.at}`}
            style={
              plan.animation
                ? { animation: `${plan.animation} ${plan.durationMs}ms ease-out both` }
                : undefined
            }
          >
            <PresentedSlide body={body} index={state.at} />
          </div>
        )}
      </div>

      {aids && !state.black && (
        <aside
          className="flex flex-none gap-4 border-t border-white/15 bg-black/80 p-3 text-white"
          onClick={(e) => e.stopPropagation()}
          aria-label="Presenter aids"
        >
          <div className="flex-none">
            <div className="mb-1 text-[10px] tracking-widest text-white/50 uppercase">Next</div>
            {nextSlide ? (
              <SlideView
                slide={nextSlide}
                tokens={masterTokensFor(body, nextSlide)}
                textStyles={body.textStyles}
                width={160}
              />
            ) : (
              <div className="grid h-[90px] w-[160px] place-items-center rounded border border-white/20 text-[11px] text-white/50">
                End of deck
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-1 text-[10px] tracking-widest text-white/50 uppercase">
              Speaker notes
            </div>
            <p className="max-h-24 overflow-y-auto text-[13px] leading-relaxed whitespace-pre-wrap text-white/90">
              {slide.notes.trim() || 'No notes on this slide.'}
            </p>
          </div>

          <div className="flex-none text-right">
            <div className="text-[10px] tracking-widest text-white/50 uppercase">Elapsed</div>
            <div className="text-[22px] font-semibold tabular-nums">{formatElapsed(elapsed)}</div>
            <div className="mt-1 text-[11px] text-white/60 tabular-nums">
              {state.at + 1} / {slides.length}
            </div>
            {plan.suppressed === 'reduced-motion' && slide.transition && slide.transition !== 'none' && (
              <div className="mt-1 text-[10px] text-white/50">Transitions off (reduced motion)</div>
            )}
          </div>
        </aside>
      )}

      {/* chrome the audience can ignore: it fades to nearly nothing */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-3 p-3 text-[11px] text-white/35"
        aria-hidden
      >
        <span className="tabular-nums">
          {state.at + 1} / {slides.length}
        </span>
        <span>← → navigate · S notes · B black · Esc exit</span>
      </div>

      <button
        className="pointer-events-auto absolute top-3 right-3 rounded-md p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
        aria-label="Exit presentation"
        onClick={(e) => {
          e.stopPropagation()
          onExit()
        }}
      >
        <IcX size={16} />
      </button>

      {state.at < slides.length - 1 && (
        <button
          className="pointer-events-auto absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-2 text-white/20 hover:bg-white/10 hover:text-white/80"
          aria-label="Next slide"
          onClick={(e) => {
            e.stopPropagation()
            act('ArrowRight')
          }}
        >
          <IcChevronRight size={20} />
        </button>
      )}
    </div>
  )
}

/**
 * One slide at the largest size that fits, with its master's furniture — what
 * is presented has to be what the deck shows, down to the footer.
 */
function PresentedSlide({ body, index }: { body: PresentationBody; index: number }) {
  const slides = presenterSlides(body)
  const slide = slides[index]
  const [width, setWidth] = useState(960)

  useEffect(() => {
    const fit = () => {
      const pad = 0
      setWidth(Math.min(window.innerWidth - pad, ((window.innerHeight - pad) * 960) / 540))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  if (!slide) return null
  const tokens = masterTokensFor(body, slide)
  return (
    <SlideView
      slide={slide}
      tokens={tokens}
      textStyles={body.textStyles}
      decor={furnitureElements(body, slide, index + 1, tokens)}
      width={width}
    />
  )
}
