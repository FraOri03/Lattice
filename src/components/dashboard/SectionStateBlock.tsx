import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useI18n } from '@/lib/i18n'
import type { SectionState } from '@/lib/dashboard/sectionState'

/**
 * What a section draws instead of its content (13.2 §5).
 *
 * One component for all six states, so the distinction 13.3 turns on — *there
 * is nothing* versus *we cannot look* — is made once and cannot drift between
 * destinations. Empty and unavailable take their copy from the caller, because
 * an invitation to create something and a reason a source does not exist are
 * both specific to the section; the failure states are shared, because
 * "reloading rebuilds the index" is true everywhere.
 */
export function SectionStateBlock({
  state,
  what,
  title,
  body,
  action,
}: {
  state: Exclude<SectionState, 'content'>
  /** What is being read, for the states that name it. */
  what: string
  /** Required for `empty` and `unavailable`; ignored otherwise. */
  title?: string
  body?: string
  action?: { label: string; onClick: () => void }
}) {
  const t = useI18n()

  const copy = (): { title: string; body: string; action?: { label: string; onClick: () => void } } => {
    switch (state) {
      case 'loading':
        return { title: '', body: '' }
      case 'error':
        return {
          title: t.states.errorTitle(what),
          body: t.states.errorBody,
          action: action ?? undefined,
        }
      case 'offline':
        return { title: t.states.offlineTitle, body: t.states.offlineBody }
      case 'no-results':
        return {
          title: t.states.noResultsTitle,
          body: body ?? t.states.noResultsBody,
          action,
        }
      case 'unavailable':
        return { title: title ?? t.states.unavailableTitle(what), body: body ?? '' }
      case 'empty':
        return { title: title ?? '', body: body ?? '', action }
    }
  }

  if (state === 'loading') return <SectionSkeleton what={what} />

  const { title: heading, body: text, action: act } = copy()

  return (
    <div
      className="mt-4 rounded-xl border border-dashed border-bord p-8 text-center"
      // a failure is a status, not a region a screen reader should skip past
      role={state === 'error' || state === 'offline' ? 'status' : undefined}
    >
      {heading && <p className="mb-1 text-[13px] font-semibold">{heading}</p>}
      {text && <p className="text-[11.5px] text-muted">{text}</p>}
      {act && (
        <button className="btn mt-3" onClick={act.onClick}>
          {act.label}
        </button>
      )}
    </div>
  )
}

/**
 * The loading shape, with the line that arrives late.
 *
 * 13.2: the skeleton carries no text for the first 600 ms, and past that it
 * gains one line saying what is being read — a skeleton that never resolves is
 * the one case where silence is indistinguishable from a hang.
 *
 * The timer checks the motion preference in code, because the global CSS rule
 * collapses durations and **cannot shorten a JavaScript timer** (13.5 §1). With
 * reduced motion the line is there immediately: the pulse is what carries the
 * meaning otherwise, and it is exactly what the preference turns off.
 */
function SectionSkeleton({ what }: { what: string }) {
  const t = useI18n()
  const reduced =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [speaking, setSpeaking] = useState(reduced)
  const timer = useRef<number>(0)

  useEffect(() => {
    if (reduced) return
    timer.current = window.setTimeout(() => setSpeaking(true), 600)
    return () => window.clearTimeout(timer.current)
  }, [reduced])

  return (
    <div className="mt-4" aria-busy="true">
      <div className="flex flex-col gap-1.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`h-11 rounded-xl border border-bord bg-panel ${reduced ? '' : 'animate-pulse'}`}
          />
        ))}
      </div>
      {/* the delayed line is the signal when the pulse is off, so it is the
          thing that must survive reduced motion — not the thing that waits */}
      <p className="mt-2 text-center text-[11.5px] text-muted">
        {speaking ? t.states.loading(what) : ' '}
      </p>
    </div>
  )
}

/** A section heading plus whatever it holds, so every list is a real list. */
export function SectionList({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <ul aria-label={label} className="flex flex-col gap-1.5">
      {children}
    </ul>
  )
}
