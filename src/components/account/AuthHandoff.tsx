import { useEffect, useRef, useState } from 'react'
import { LatticeMark } from '@/components/Brand'
import { prefersReducedMotion } from '@/lib/theme/animateTheme'

/**
 * The moment between signing in and Home.
 *
 * Without it the login card is simply gone on the next frame and the
 * dashboard is simply there — the two most branded surfaces in the product
 * meeting with a cut. This is the cover that joins them: it fades in over
 * the login card, the surface underneath is swapped while it is opaque, and
 * it hands off to the dashboard on the way out.
 *
 * Phases, and what is mounted underneath each:
 *
 *   'cover'  → the login card is still there, the cover fades IN
 *   'reveal' → the shell has replaced it, the cover fades OUT
 *   'done'   → nothing; this component is unmounted by its parent
 *
 * `prefers-reduced-motion` collapses the whole sequence to a single frame:
 * the stylesheet can flatten the fades, but only this can stop the app
 * from sitting behind a cover for half a second for someone who asked for
 * no motion.
 */

export type HandoffPhase = 'cover' | 'reveal' | 'done'

const COVER_MS = 220
const REVEAL_MS = 320

/**
 * Drives the phase machine. Returns the current phase; the caller decides
 * what to mount for each — this hook deliberately knows nothing about
 * login or the shell.
 */
export function useAuthHandoff(open: boolean): HandoffPhase {
  const [phase, setPhase] = useState<HandoffPhase>('done')
  const wasOpen = useRef(open)

  useEffect(() => {
    // only the crossing counts: a returning session that boots straight
    // into the app never sees a splash it did not ask for
    const justOpened = open && !wasOpen.current
    wasOpen.current = open
    if (!justOpened) return
    if (prefersReducedMotion()) {
      setPhase('done')
      return
    }
    setPhase('cover')
    const toReveal = window.setTimeout(() => setPhase('reveal'), COVER_MS)
    const toDone = window.setTimeout(() => setPhase('done'), COVER_MS + REVEAL_MS)
    return () => {
      window.clearTimeout(toReveal)
      window.clearTimeout(toDone)
    }
  }, [open])

  return phase
}

export function AuthHandoff({ phase }: { phase: HandoffPhase }) {
  if (phase === 'done') return null
  return (
    <div
      className={`auth-cover ${phase === 'cover' ? 'auth-cover-in' : 'auth-cover-out'}`}
      // decorative: the surfaces on either side carry the real content, and
      // announcing a splash would interrupt the screen reader mid-handoff
      aria-hidden="true"
    >
      <LatticeMark height={64} className="auth-mark" />
    </div>
  )
}
