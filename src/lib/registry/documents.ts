import type { ComponentType } from 'react'
import type { AssetKind } from '@/types/model'

/**
 * DocumentRegistry: the kinds of first-class documents Lattice knows about,
 * with the delivery status of their editors. The UI reads this to label
 * imported office files honestly ("editable in Phase 3") instead of
 * pretending an editor exists.
 */

export type DocumentKind =
  | 'note'
  | 'document'
  | 'code'
  | 'spreadsheet'
  | 'presentation'
  | 'board'

export interface DocumentTypeInfo {
  kind: DocumentKind
  label: string
  status: 'ready' | 'planned'
  phase: number
  editorHint: string
}

export const DocumentRegistry: Record<DocumentKind, DocumentTypeInfo> = {
  note: {
    kind: 'note',
    label: 'Note',
    status: 'ready',
    phase: 1,
    editorHint: 'Markdown editor with wikilinks and backlinks',
  },
  board: {
    kind: 'board',
    label: 'Board',
    status: 'ready',
    phase: 1,
    editorHint: 'Infinite canvas with linked cards',
  },
  document: {
    kind: 'document',
    label: 'Document',
    status: 'ready',
    phase: 2,
    editorHint: 'Word-style rich text editor',
  },
  code: {
    kind: 'code',
    label: 'Code file',
    status: 'ready',
    phase: 3,
    editorHint: 'VS Code-style editor (Monaco)',
  },
  spreadsheet: {
    kind: 'spreadsheet',
    label: 'Spreadsheet',
    status: 'ready',
    phase: 4,
    editorHint: 'Excel-style grid with formulas',
  },
  presentation: {
    kind: 'presentation',
    label: 'Presentation',
    status: 'planned',
    phase: 5,
    editorHint: 'PowerPoint-style slide editor',
  },
}

const ASSET_TO_DOCUMENT: Partial<Record<AssetKind, DocumentKind>> = {
  document: 'document',
  spreadsheet: 'spreadsheet',
  presentation: 'presentation',
}

/** The (possibly future) editor that will open assets of this kind. */
export function plannedEditorFor(kind: AssetKind): DocumentTypeInfo | null {
  const doc = ASSET_TO_DOCUMENT[kind]
  return doc ? DocumentRegistry[doc] : null
}

/**
 * EditorRegistry: document kind → editor component. The markdown note
 * editor is built in; Phase 2–4 editors and plugin-provided editors
 * register here.
 */
const editors = new Map<DocumentKind, ComponentType>()

export function registerEditor(kind: DocumentKind, component: ComponentType): void {
  editors.set(kind, component)
}

export function getEditor(kind: DocumentKind): ComponentType | undefined {
  return editors.get(kind)
}
