import type { PresentSlide, PresentationBody } from './presentModel'
import { presentableSlides } from './sections'

/**
 * Presenting (#244).
 *
 * The mode is named after this and did not have it: the editor could make a
 * deck and export it, but never run one. Everything here is pure — the
 * navigation is a small state machine and a transition is a description, not
 * an effect — so the rules can be tested without a screen, and the view stays
 * a view.
 *
 * Two rules the whole thing serves:
 *
 * - **What you present is what the deck says is presentable.** Hidden slides
 *   are absent here exactly as they are absent from an export (19E.1).
 * - **Nothing changes under the presenter.** No linked content is refreshed,
 *   no layout recomputed; the deck is read, never edited, while it runs.
 */

export type SlideTransition = 'none' | 'fade' | 'slide' | 'scale' | 'dissolve'

export const TRANSITIONS: SlideTransition[] = ['none', 'fade', 'slide', 'scale', 'dissolve']

export const TRANSITION_LABEL: Record<SlideTransition, string> = {
  none: 'None',
  fade: 'Fade',
  slide: 'Slide',
  scale: 'Scale',
  dissolve: 'Dissolve',
}

/** Sensible default duration, in ms. */
export const DEFAULT_TRANSITION_MS = 300

export interface PresenterState {
  /** index into the presentable slides, never into the deck */
  at: number
  /** B blanks the screen without losing your place */
  black: boolean
}

export type PresenterAction = 'next' | 'prev' | 'first' | 'last' | 'black' | 'exit'

/** The slides a presentation actually runs. */
export const presenterSlides = (body: PresentationBody): PresentSlide[] => presentableSlides(body)

/**
 * Where to start, given the slide the editor was on.
 *
 * The editor counts every slide; the presentation counts only presentable
 * ones. Starting "from here" has to translate between the two, and land on
 * something real when "here" is a hidden slide.
 */
export function startIndex(body: PresentationBody, deckIndex: number): number {
  const presentable = presenterSlides(body)
  const target = body.slides[deckIndex]
  if (!target) return 0
  const exact = presentable.findIndex((s) => s.id === target.id)
  if (exact >= 0) return exact
  // the editor was on a hidden slide: start at the next one that is shown
  const after = body.slides.slice(deckIndex).find((s) => !s.hidden)
  const idx = after ? presentable.findIndex((s) => s.id === after.id) : -1
  return idx >= 0 ? idx : Math.max(0, presentable.length - 1)
}

/**
 * Apply an action. Navigation stops at the ends rather than wrapping: a deck
 * has a first and a last slide, and quietly looping past them is how a
 * presenter loses their place in front of an audience.
 */
export function reduce(state: PresenterState, action: PresenterAction, count: number): PresenterState {
  const last = Math.max(0, count - 1)
  switch (action) {
    case 'next':
      // any navigation lifts the black screen: you meant to show something
      return { at: Math.min(last, state.at + 1), black: false }
    case 'prev':
      return { at: Math.max(0, state.at - 1), black: false }
    case 'first':
      return { at: 0, black: false }
    case 'last':
      return { at: last, black: false }
    case 'black':
      return { ...state, black: !state.black }
    case 'exit':
      return state
  }
}

/** What a key means while presenting, or nothing when it means nothing. */
export function keyAction(key: string): PresenterAction | null {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
    case 'PageDown':
    case ' ':
    case 'Enter':
      return 'next'
    case 'ArrowLeft':
    case 'ArrowUp':
    case 'PageUp':
    case 'Backspace':
      return 'prev'
    case 'Home':
      return 'first'
    case 'End':
      return 'last'
    case 'b':
    case 'B':
      return 'black'
    case 'Escape':
      return 'exit'
    default:
      return null
  }
}

export interface TransitionPlan {
  /** the CSS animation to run, or none at all */
  animation: string | null
  durationMs: number
  /** why there is no animation, when there is none — shown in the editor */
  suppressed: 'reduced-motion' | 'set-to-none' | null
}

/**
 * How a slide should arrive.
 *
 * Reduced motion is answered here rather than in the view, so every caller
 * gets the same answer and the reason is reportable: the editor can say "this
 * slide has a fade, and it will not run for you" instead of silently doing
 * nothing.
 */
export function transitionPlan(
  slide: Pick<PresentSlide, 'transition' | 'transitionMs'> | undefined,
  reducedMotion: boolean,
): TransitionPlan {
  const kind = slide?.transition ?? 'none'
  if (reducedMotion) return { animation: null, durationMs: 0, suppressed: 'reduced-motion' }
  if (kind === 'none') return { animation: null, durationMs: 0, suppressed: 'set-to-none' }
  const durationMs = Math.max(60, Math.min(2000, slide?.transitionMs ?? DEFAULT_TRANSITION_MS))
  return { animation: `present-${kind}`, durationMs, suppressed: null }
}

/** mm:ss for the elapsed clock; hours appear only once they exist. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const s = total % 60
  const m = Math.floor(total / 60) % 60
  const h = Math.floor(total / 3600)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}
