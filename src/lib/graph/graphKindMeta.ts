/**
 * Pure, React-free visual metadata for each graph entity kind. Stamped onto
 * nodes by the builder (which runs in a worker, so no JSX here) and resolved
 * to real icons/colors by the renderer on the main thread.
 *
 * Colour tokens reuse the app's CardColor palette so Graph is visually
 * native to Lattice; `tag` and `project` are handled specially by the
 * renderer. `icon` mirrors the FileKind registry token space where possible
 * so the same semantic glyphs appear in the sidebar, cards and the graph.
 */
import type { CardColor } from '@/types/model'
import type { GraphEntityKind } from './graphTypes'

export type GraphColorToken = CardColor | 'tag' | 'project'

export interface GraphKindMeta {
  /** human label shown in the inspector / legend / node subtitle */
  typeLabel: string
  color: GraphColorToken
  /** icon token resolved to a component by the renderer */
  icon: string
}

export const GRAPH_KIND_META: Record<GraphEntityKind, GraphKindMeta> = {
  project: { typeLabel: 'Project', color: 'project', icon: 'project' },
  board: { typeLabel: 'Board', color: 'gray', icon: 'board' },
  section: { typeLabel: 'Section', color: 'gray', icon: 'section' },
  note: { typeLabel: 'Note', color: 'gray', icon: 'note' },
  document: { typeLabel: 'Document', color: 'blue', icon: 'richdoc' },
  spreadsheet: { typeLabel: 'Spreadsheet', color: 'green', icon: 'sheet' },
  presentation: { typeLabel: 'Presentation', color: 'orange', icon: 'presentation' },
  code: { typeLabel: 'Code', color: 'purple', icon: 'code' },
  asset: { typeLabel: 'Asset', color: 'gray', icon: 'file' },
  pdf: { typeLabel: 'PDF', color: 'red', icon: 'pdf' },
  image: { typeLabel: 'Image', color: 'purple', icon: 'image' },
  video: { typeLabel: 'Video', color: 'red', icon: 'video' },
  audio: { typeLabel: 'Audio', color: 'yellow', icon: 'audio' },
  'model-3d': { typeLabel: '3D model', color: 'blue', icon: 'model3d' },
  'web-embed': { typeLabel: 'Web embed', color: 'blue', icon: 'webembed' },
  comment: { typeLabel: 'Comment', color: 'yellow', icon: 'comment' },
  version: { typeLabel: 'Version', color: 'gray', icon: 'version' },
  user: { typeLabel: 'Person', color: 'blue', icon: 'user' },
  tag: { typeLabel: 'Tag', color: 'tag', icon: 'tag' },
  'github-file': { typeLabel: 'GitHub', color: 'gray', icon: 'github' },
  'external-file': { typeLabel: 'External file', color: 'gray', icon: 'external' },
  'plugin-entity': { typeLabel: 'Plugin entity', color: 'gray', icon: 'file' },
}

export function kindMeta(kind: GraphEntityKind): GraphKindMeta {
  return GRAPH_KIND_META[kind] ?? GRAPH_KIND_META['plugin-entity']
}
