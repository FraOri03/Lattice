import { describe, expect, it } from 'vitest'
import {
  SECTION_METAS,
  sectionToViewMode,
  viewModeToSection,
  type WorkspaceSection,
} from './workspace'
import type { ViewMode } from './model'

/**
 * The section model of the call-and-toolbar IA refactor: Split is a layout and
 * Graph is a view, so neither is a section. The bridge to the legacy ViewMode
 * engine must round-trip every real section.
 */

describe('SECTION_METAS', () => {
  it('lists the real sections in order, without Split or Graph', () => {
    expect(SECTION_METAS.map((m) => m.section)).toEqual([
      'board',
      'document',
      'spreadsheet',
      'presentation',
      'code',
      'photo',
    ])
    const asAny = SECTION_METAS.map((m) => m.section as string)
    expect(asAny).not.toContain('split')
    expect(asAny).not.toContain('graph')
  })
})

describe('section ↔ ViewMode bridge', () => {
  it('round-trips every section through its ViewMode', () => {
    for (const meta of SECTION_METAS) {
      const mode = sectionToViewMode(meta.section)
      expect(mode).toBe(meta.mode)
      expect(viewModeToSection(mode)).toBe(meta.section)
    }
  })

  it('maps the legacy internal values (doc/sheet) to their friendly sections', () => {
    expect(viewModeToSection('doc')).toBe('document')
    expect(viewModeToSection('sheet')).toBe('spreadsheet')
    expect(sectionToViewMode('document')).toBe('doc')
    expect(sectionToViewMode('spreadsheet')).toBe('sheet')
  })

  it('has no section for the graph view (it is a view, not a section)', () => {
    expect(viewModeToSection('graph')).toBeNull()
  })

  it('covers every non-graph ViewMode', () => {
    const modes: ViewMode[] = ['board', 'doc', 'sheet', 'presentation', 'code', 'photo']
    for (const m of modes) {
      const section = viewModeToSection(m) as WorkspaceSection
      expect(section).toBeTruthy()
      expect(sectionToViewMode(section)).toBe(m)
    }
  })
})
