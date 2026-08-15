import { nid } from '@/lib/id'
import type { PresentSection, PresentSlide, PresentationBody } from './presentModel'

/**
 * Rail sections (19E.1) — pure body → body operations.
 *
 * The deck's `slides` array stays the single ordered list; a slide points at
 * its section. Everything the rail needs is derived here, so the component
 * never has to reason about ordering, and every rule below is unit-testable
 * without a DOM.
 *
 * The one invariant these operations maintain: a section's slides are
 * **contiguous**. Nothing enforces it in the type — a hand-edited body could
 * interleave two sections — so `sectionRuns` degrades honestly instead of
 * pretending, emitting a separate run per break rather than gathering distant
 * slides under one heading and lying about the deck's order.
 */

export interface SectionRun {
  /** null for slides that belong to no section */
  section: PresentSection | null
  /** slides in deck order, each with its real index in `body.slides` */
  slides: { slide: PresentSlide; index: number }[]
}

/** Group consecutive slides into runs for the rail. */
export function sectionRuns(body: PresentationBody): SectionRun[] {
  const byId = new Map((body.sections ?? []).map((s) => [s.id, s]))
  const runs: SectionRun[] = []
  body.slides.forEach((slide, index) => {
    const id = slide.sectionId
    const last = runs[runs.length - 1]
    if (last && (last.section?.id ?? undefined) === id) {
      last.slides.push({ slide, index })
      return
    }
    runs.push({ section: id ? byId.get(id) ?? null : null, slides: [{ slide, index }] })
  })
  return runs
}

/**
 * The slides a presentation actually shows. Hidden slides stay in the deck and
 * stay editable — they simply are not part of what an audience sees, which is
 * also what export means.
 */
export function presentableSlides(body: PresentationBody): PresentSlide[] {
  return body.slides.filter((s) => !s.hidden)
}

/** True when a section is collapsed in the rail. */
export const isCollapsed = (run: SectionRun): boolean => run.section?.collapsed === true

export function createSection(title = 'New section'): PresentSection {
  return { id: nid('sec'), title }
}

/**
 * Start a new section at `index`. The new section takes that slide and every
 * following slide up to the next section boundary — which is what "start a
 * section here" means in a linear deck, and what keeps runs contiguous.
 */
export function startSectionAt(
  body: PresentationBody,
  index: number,
  title?: string,
): PresentationBody {
  const at = body.slides[index]
  if (!at) return body
  const section = createSection(title)
  const from = at.sectionId
  const slides = [...body.slides]
  for (let i = index; i < slides.length; i++) {
    // slides after `index` are still untouched here, so this reads the
    // original run and stops at its first boundary
    if (i > index && slides[i].sectionId !== from) break
    slides[i] = { ...slides[i], sectionId: section.id }
  }
  return { ...body, slides, sections: [...(body.sections ?? []), section] }
}

export function renameSection(
  body: PresentationBody,
  id: string,
  title: string,
): PresentationBody {
  return {
    ...body,
    sections: (body.sections ?? []).map((s) => (s.id === id ? { ...s, title } : s)),
  }
}

export function setSectionCollapsed(
  body: PresentationBody,
  id: string,
  collapsed: boolean,
): PresentationBody {
  return {
    ...body,
    sections: (body.sections ?? []).map((s) =>
      s.id === id ? { ...s, collapsed: collapsed ? true : undefined } : s,
    ),
  }
}

/**
 * Drop the section heading. The slides stay exactly where they are and become
 * unsectioned — removing a label must never remove content.
 */
export function removeSection(body: PresentationBody, id: string): PresentationBody {
  const sections = (body.sections ?? []).filter((s) => s.id !== id)
  return {
    ...body,
    slides: body.slides.map((s) => (s.sectionId === id ? { ...s, sectionId: undefined } : s)),
    ...(sections.length ? { sections } : { sections: undefined }),
  }
}

/**
 * Move a whole section — every slide in its run — one run earlier or later.
 * Moving the heading alone would leave its slides behind, which is the bug
 * every "reorder sections" implementation has once.
 */
export function moveSection(
  body: PresentationBody,
  id: string,
  direction: -1 | 1,
): PresentationBody {
  const runs = sectionRuns(body)
  const at = runs.findIndex((r) => r.section?.id === id)
  if (at < 0) return body
  const swapWith = at + direction
  if (swapWith < 0 || swapWith >= runs.length) return body
  const reordered = [...runs]
  ;[reordered[at], reordered[swapWith]] = [reordered[swapWith], reordered[at]]
  return { ...body, slides: reordered.flatMap((r) => r.slides.map((s) => s.slide)) }
}

/** Move one slide into a section (or out of every section with `undefined`). */
export function assignSlideToSection(
  body: PresentationBody,
  slideId: string,
  sectionId: string | undefined,
): PresentationBody {
  return {
    ...body,
    slides: body.slides.map((s) => (s.id === slideId ? { ...s, sectionId } : s)),
  }
}
