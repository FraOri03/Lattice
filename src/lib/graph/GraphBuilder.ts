/**
 * GraphBuilder — turns a project snapshot into a normalized relationship
 * graph. This is the heart of Graph View and the clean-room reimplementation
 * of the "pages + references" idea: every node mirrors a real Lattice entity
 * and every edge carries a typed, explainable origin. No synthetic edges are
 * ever invented to make the picture denser.
 *
 * Pure and React-free so it runs inside the graph Web Worker and in unit
 * tests. Only digested metadata is read — never a lazy-loaded body.
 */
import type { AssetDoc, AssetKind, Board } from '@/types/model'
import type {
  GraphEntityKind,
  GraphEdgeSourceSystem,
  GraphRelationshipKind,
  LatticeGraphData,
  LatticeGraphEdge,
  LatticeGraphNode,
} from './graphTypes'
import { GRAPH_SCHEMA_VERSION } from './graphTypes'
import type { GraphSourceSnapshot } from './graphSource'
import { kindMeta } from './graphKindMeta'
import { computeDegrees, countComponents } from './GraphIndex'

/** Structural build options — these change the shape of the graph, so a
 * change forces a rebuild (unlike the cheap render-time filters). */
export interface GraphBuildOptions {
  /** expose each board card as its own instance node (default: collapse) */
  showCardInstances: boolean
}

const DEFAULT_BUILD_OPTIONS: GraphBuildOptions = { showCardInstances: false }

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g

const NODE_MIN_SIZE = 5
const NODE_MAX_SIZE = 22

/** Map an imported asset's kind onto a graph entity kind. */
function graphKindForAsset(kind: AssetKind): GraphEntityKind {
  switch (kind) {
    case 'pdf':
      return 'pdf'
    case 'image':
      return 'image'
    case 'video':
      return 'video'
    case 'audio':
      return 'audio'
    case 'model3d':
      return 'model-3d'
    // editable-source originals (docx/xlsx/pptx/…) stay generic "asset"
    // nodes — the editable Document/Sheet/Presentation is the first-class
    // entity and links back to them via `imported-from`.
    default:
      return 'asset'
  }
}

export function nodeId(kind: GraphEntityKind, entityId: string): string {
  return `${kind}:${entityId}`
}

function tagSlug(tag: string): string {
  return tag.trim().toLowerCase()
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** Deterministic FNV-1a hash — used for the snapshot revision. */
function hashString(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

function sizeForDegree(degree: number): number {
  const scaled = NODE_MIN_SIZE + Math.sqrt(degree) * 3
  return Math.min(NODE_MAX_SIZE, Math.max(NODE_MIN_SIZE, Math.round(scaled)))
}

interface Collector {
  nodes: Map<string, LatticeGraphNode>
  edges: LatticeGraphEdge[]
  /** lowercased title → node id, for wikilink resolution */
  titleIndex: Map<string, string>
  /** asset id → node id (asset kinds vary) */
  assetNode: Map<string, string>
}

function addNode(c: Collector, node: LatticeGraphNode): string {
  if (!c.nodes.has(node.id)) c.nodes.set(node.id, node)
  return node.id
}

function indexTitle(c: Collector, title: string | undefined, id: string) {
  const key = title?.trim().toLowerCase()
  if (key && !c.titleIndex.has(key)) c.titleIndex.set(key, id)
}

function addEdge(
  c: Collector,
  source: string,
  target: string,
  kind: GraphRelationshipKind,
  sourceSystem: GraphEdgeSourceSystem,
  opts: { label?: string; directed?: boolean; weight?: number; metadata?: Record<string, unknown> } = {},
) {
  c.edges.push({
    id: `${sourceSystem}:${source}->${target}:${kind}`,
    source,
    target,
    kind,
    directed: opts.directed ?? true,
    label: opts.label,
    weight: opts.weight,
    sourceSystem,
    metadata: opts.metadata,
  })
}

/* ---------------- node collection ---------------- */

function collectNodes(snap: GraphSourceSnapshot, c: Collector) {
  const meta = (kind: GraphEntityKind) => kindMeta(kind)

  for (const n of snap.notes) {
    const id = nodeId('note', n.id)
    addNode(c, {
      id,
      entityId: n.id,
      projectId: snap.projectId,
      kind: 'note',
      label: n.title || 'Untitled note',
      subtitle: meta('note').typeLabel,
      icon: meta('note').icon,
      colorToken: meta('note').color,
      updatedAt: new Date(n.updatedAt).toISOString(),
      createdAt: new Date(n.createdAt).toISOString(),
      tags: n.tags,
    })
    indexTitle(c, n.title, id)
  }
  for (const d of snap.docs) {
    const id = nodeId('document', d.id)
    addNode(c, {
      id,
      entityId: d.id,
      projectId: snap.projectId,
      kind: 'document',
      label: d.title || 'Untitled document',
      subtitle: meta('document').typeLabel,
      icon: meta('document').icon,
      colorToken: meta('document').color,
      updatedAt: new Date(d.updatedAt).toISOString(),
      createdAt: new Date(d.createdAt).toISOString(),
      tags: d.tags,
    })
    indexTitle(c, d.title, id)
  }
  for (const sh of snap.sheetDocs) {
    const id = nodeId('spreadsheet', sh.id)
    addNode(c, {
      id,
      entityId: sh.id,
      projectId: snap.projectId,
      kind: 'spreadsheet',
      label: sh.title || 'Untitled spreadsheet',
      subtitle: meta('spreadsheet').typeLabel,
      icon: meta('spreadsheet').icon,
      colorToken: meta('spreadsheet').color,
      updatedAt: new Date(sh.updatedAt).toISOString(),
      createdAt: new Date(sh.createdAt).toISOString(),
      tags: sh.tags,
    })
    indexTitle(c, sh.title, id)
  }
  for (const p of snap.presentDocs) {
    const id = nodeId('presentation', p.id)
    addNode(c, {
      id,
      entityId: p.id,
      projectId: snap.projectId,
      kind: 'presentation',
      label: p.title || 'Untitled presentation',
      subtitle: meta('presentation').typeLabel,
      icon: meta('presentation').icon,
      colorToken: meta('presentation').color,
      updatedAt: new Date(p.updatedAt).toISOString(),
      createdAt: new Date(p.createdAt).toISOString(),
      tags: p.tags,
    })
    indexTitle(c, p.title, id)
  }
  for (const co of snap.codeDocs) {
    const id = nodeId('code', co.id)
    addNode(c, {
      id,
      entityId: co.id,
      projectId: snap.projectId,
      kind: 'code',
      label: `${co.title}.${co.extension}`,
      subtitle: co.language || meta('code').typeLabel,
      icon: meta('code').icon,
      colorToken: meta('code').color,
      updatedAt: new Date(co.updatedAt).toISOString(),
      createdAt: new Date(co.createdAt).toISOString(),
      tags: co.tags,
    })
    // wikilinks target the bare title, not title.ext
    indexTitle(c, co.title, id)
  }
  for (const a of snap.assets) {
    const kind = graphKindForAsset(a.kind)
    const id = nodeId(kind, a.id)
    addNode(c, {
      id,
      entityId: a.id,
      projectId: snap.projectId,
      kind,
      label: a.name,
      subtitle: a.ext ? a.ext.toUpperCase() : meta(kind).typeLabel,
      icon: meta(kind).icon,
      colorToken: meta(kind).color,
      updatedAt: new Date(a.importedAt).toISOString(),
      metadata: { ext: a.ext, mime: a.mime, size: a.size },
    })
    c.assetNode.set(a.id, id)
  }
  for (const b of snap.boards) {
    const id = nodeId('board', b.id)
    addNode(c, {
      id,
      entityId: b.id,
      projectId: snap.projectId,
      kind: 'board',
      label: b.name || 'Untitled board',
      subtitle: `${b.nodes.length} card${b.nodes.length === 1 ? '' : 's'}`,
      icon: meta('board').icon,
      colorToken: meta('board').color,
    })
  }
  if (snap.project) {
    const id = nodeId('project', snap.project.id)
    addNode(c, {
      id,
      entityId: snap.project.id,
      projectId: snap.projectId,
      kind: 'project',
      label: snap.project.name,
      subtitle: kindMeta('project').typeLabel,
      icon: kindMeta('project').icon,
      colorToken: kindMeta('project').color,
      metadata: snap.project.icon ? { glyph: snap.project.icon } : undefined,
    })
  }
  if (snap.project?.github?.repo) {
    const repo = snap.project.github.repo
    addNode(c, {
      id: nodeId('github-file', repo),
      entityId: repo,
      projectId: snap.projectId,
      kind: 'github-file',
      label: repo,
      subtitle: snap.project.github.branch
        ? `Repository · ${snap.project.github.branch}`
        : 'Repository',
      icon: kindMeta('github-file').icon,
      colorToken: kindMeta('github-file').color,
      metadata: { repo, branch: snap.project.github.branch },
    })
  }
}

/** Ensure a tag node exists and return its id. */
function ensureTagNode(c: Collector, snap: GraphSourceSnapshot, tag: string): string {
  const slug = tagSlug(tag)
  const id = nodeId('tag', slug)
  if (!c.nodes.has(id)) {
    addNode(c, {
      id,
      entityId: slug,
      projectId: snap.projectId,
      kind: 'tag',
      label: `#${tag.trim()}`,
      subtitle: kindMeta('tag').typeLabel,
      icon: kindMeta('tag').icon,
      colorToken: kindMeta('tag').color,
      metadata: { tag: tag.trim() },
    })
  }
  return id
}

/** The graph node a board card ultimately refers to, or null. */
function entityNodeForCard(
  c: Collector,
  snap: GraphSourceSnapshot,
  boardId: string,
  card: Board['nodes'][number],
): string | null {
  const d = card.data
  switch (d.type) {
    case 'note':
      return d.noteId && c.nodes.has(nodeId('note', d.noteId)) ? nodeId('note', d.noteId) : null
    case 'richdoc':
      return d.docId && c.nodes.has(nodeId('document', d.docId))
        ? nodeId('document', d.docId)
        : null
    case 'code':
      return d.codeId && c.nodes.has(nodeId('code', d.codeId)) ? nodeId('code', d.codeId) : null
    case 'sheet':
      return d.sheetId && c.nodes.has(nodeId('spreadsheet', d.sheetId))
        ? nodeId('spreadsheet', d.sheetId)
        : null
    case 'presentation':
      return d.presentId && c.nodes.has(nodeId('presentation', d.presentId))
        ? nodeId('presentation', d.presentId)
        : null
    case 'asset':
      return d.assetId && c.assetNode.has(d.assetId) ? c.assetNode.get(d.assetId)! : null
    case 'webembed': {
      if (!d.embed) return null
      const id = nodeId('web-embed', d.embed.id)
      if (!c.nodes.has(id)) {
        addNode(c, {
          id,
          entityId: d.embed.id,
          projectId: snap.projectId,
          kind: 'web-embed',
          label: d.embed.title || d.embed.url,
          subtitle: hostOf(d.embed.url),
          icon: kindMeta('web-embed').icon,
          colorToken: kindMeta('web-embed').color,
          metadata: { url: d.embed.url, boardId },
        })
      }
      return id
    }
    default:
      // image/video/link/file/embed3d/section cards are inline board content,
      // not standalone project entities — they get no node.
      return null
  }
}

/* ---------------- edge collection ---------------- */

function collectWikilinkEdges(snap: GraphSourceSnapshot, c: Collector) {
  const resolve = (raw: string): string | undefined =>
    c.titleIndex.get(raw.trim().toLowerCase())

  for (const n of snap.notes) {
    const from = nodeId('note', n.id)
    for (const m of n.content.matchAll(WIKILINK_RE)) {
      const to = resolve(m[1])
      if (to && to !== from) addEdge(c, from, to, 'references', 'wikilink')
    }
  }
  const linkFrom = (
    from: string,
    links: string[] | undefined,
  ) => {
    for (const l of links ?? []) {
      const to = resolve(l)
      if (to && to !== from) addEdge(c, from, to, 'references', 'wikilink')
    }
  }
  for (const d of snap.docs) linkFrom(nodeId('document', d.id), d.outgoingLinks)
  for (const co of snap.codeDocs) linkFrom(nodeId('code', co.id), co.outgoingLinks)
}

function collectSourceAssetEdges(snap: GraphSourceSnapshot, c: Collector) {
  const link = (from: string, sourceAssetId: string | undefined) => {
    if (!sourceAssetId) return
    const to = c.assetNode.get(sourceAssetId)
    if (to) addEdge(c, from, to, 'imported-from', 'asset-source', { label: 'source file' })
  }
  for (const d of snap.docs) link(nodeId('document', d.id), d.sourceAssetId)
  for (const co of snap.codeDocs) link(nodeId('code', co.id), co.sourceAssetId)
  for (const sh of snap.sheetDocs) link(nodeId('spreadsheet', sh.id), sh.sourceAssetId)
  for (const p of snap.presentDocs) link(nodeId('presentation', p.id), p.sourceAssetId)

  // rich-document embedded assets
  for (const d of snap.docs) {
    const from = nodeId('document', d.id)
    for (const assetId of d.linkedAssets ?? []) {
      const to = c.assetNode.get(assetId)
      if (to) addEdge(c, from, to, 'references', 'embed', { label: 'embeds' })
    }
  }

  // multi-file asset bundles (GLTF→BIN/textures, OBJ→MTL)
  for (const a of snap.assets) {
    const deps = (a as AssetDoc).bundle?.dependencies
    if (!deps) continue
    const from = c.assetNode.get(a.id)
    if (!from) continue
    for (const [path, depId] of Object.entries(deps)) {
      const to = c.assetNode.get(depId)
      if (to && to !== from) addEdge(c, from, to, 'depends-on', 'asset-source', { label: path })
    }
  }
}

function collectBoardEdges(
  snap: GraphSourceSnapshot,
  c: Collector,
  options: GraphBuildOptions,
) {
  for (const b of snap.boards) {
    const boardNode = nodeId('board', b.id)

    if (!options.showCardInstances) {
      // collapsed: Board → Entity, plus Entity ↔ Entity for drawn edges
      const cardEntity = new Map<string, string>()
      for (const card of b.nodes) {
        const entity = entityNodeForCard(c, snap, b.id, card)
        if (!entity) continue
        cardEntity.set(card.id, entity)
        addEdge(c, boardNode, entity, 'contains', 'board-card', { label: 'on board' })
      }
      for (const e of b.edges) {
        const s = cardEntity.get(e.source)
        const t = cardEntity.get(e.target)
        if (s && t && s !== t) {
          addEdge(c, s, t, 'linked-to', 'board-edge', {
            label: typeof e.label === 'string' ? e.label : undefined,
          })
        }
      }
      continue
    }

    // expanded: each card is its own instance node
    const sectionOf = new Map<string, string>() // cardId → section node id
    for (const card of b.nodes) {
      if (card.data.type === 'section' && card.data.section) {
        const sid = nodeId('section', card.data.section.id)
        addNode(c, {
          id: sid,
          entityId: card.data.section.id,
          projectId: snap.projectId,
          kind: 'section',
          label: card.data.section.title || 'Section',
          subtitle: kindMeta('section').typeLabel,
          icon: kindMeta('section').icon,
          colorToken: kindMeta('section').color,
          metadata: { boardId: b.id },
        })
        addEdge(c, boardNode, sid, 'contains', 'board-card')
        for (const childId of card.data.section.childCardIds) sectionOf.set(childId, sid)
      }
    }
    for (const card of b.nodes) {
      if (card.data.type === 'section') continue
      const entity = entityNodeForCard(c, snap, b.id, card)
      const cardNodeId = nodeId('plugin-entity', `card_${card.id}`)
      const kind: GraphEntityKind = entity ? c.nodes.get(entity)!.kind : 'plugin-entity'
      addNode(c, {
        id: cardNodeId,
        entityId: card.id,
        projectId: snap.projectId,
        kind,
        label: entity ? c.nodes.get(entity)!.label : (card.data.title ?? 'Card'),
        subtitle: 'Card instance',
        icon: entity ? c.nodes.get(entity)!.icon : kindMeta('plugin-entity').icon,
        colorToken: entity ? c.nodes.get(entity)!.colorToken : kindMeta('plugin-entity').color,
        metadata: { boardId: b.id, cardId: card.id },
      })
      const parent = sectionOf.get(card.id) ?? boardNode
      addEdge(c, parent, cardNodeId, 'contains', 'board-card')
      if (entity) addEdge(c, cardNodeId, entity, 'displayed-on', 'board-card', { label: 'shows' })
    }
    for (const e of b.edges) {
      const s = nodeId('plugin-entity', `card_${e.source}`)
      const t = nodeId('plugin-entity', `card_${e.target}`)
      if (c.nodes.has(s) && c.nodes.has(t)) {
        addEdge(c, s, t, 'linked-to', 'board-edge', {
          label: typeof e.label === 'string' ? e.label : undefined,
        })
      }
    }
  }
}

function collectTagEdges(snap: GraphSourceSnapshot, c: Collector) {
  const tagFor = (from: string, tags: string[] | undefined) => {
    for (const tag of tags ?? []) {
      if (!tag.trim()) continue
      const to = ensureTagNode(c, snap, tag)
      addEdge(c, from, to, 'tagged-with', 'tag')
    }
  }
  for (const n of snap.notes) tagFor(nodeId('note', n.id), n.tags)
  for (const d of snap.docs) tagFor(nodeId('document', d.id), d.tags)
  for (const sh of snap.sheetDocs) tagFor(nodeId('spreadsheet', sh.id), sh.tags)
  for (const p of snap.presentDocs) tagFor(nodeId('presentation', p.id), p.tags)
  for (const co of snap.codeDocs) tagFor(nodeId('code', co.id), co.tags)
}

function collectGithubEdges(snap: GraphSourceSnapshot, c: Collector) {
  const repo = snap.project?.github?.repo
  if (!repo) return
  const repoNode = nodeId('github-file', repo)
  for (const co of snap.codeDocs) {
    addEdge(c, nodeId('code', co.id), repoNode, 'github-source', 'github', {
      label: snap.project?.github?.branch,
    })
  }
}

function collectProjectHierarchy(snap: GraphSourceSnapshot, c: Collector) {
  if (!snap.project) return
  const projectNode = nodeId('project', snap.project.id)
  const contain = (child: string) => addEdge(c, projectNode, child, 'contains', 'project-hierarchy')
  for (const n of snap.notes) contain(nodeId('note', n.id))
  for (const d of snap.docs) contain(nodeId('document', d.id))
  for (const sh of snap.sheetDocs) contain(nodeId('spreadsheet', sh.id))
  for (const p of snap.presentDocs) contain(nodeId('presentation', p.id))
  for (const co of snap.codeDocs) contain(nodeId('code', co.id))
  for (const b of snap.boards) contain(nodeId('board', b.id))
  for (const a of snap.assets) {
    const id = c.assetNode.get(a.id)
    if (id) contain(id)
  }
}

/* ---------------- normalization ---------------- */

/**
 * Drop dangling edges (endpoint missing) and self-loops, deduplicate exact
 * relationships (same source, target, kind and origin), then stamp degree
 * and size onto every node.
 */
export function normalizeGraph(
  nodes: LatticeGraphNode[],
  edges: LatticeGraphEdge[],
): { nodes: LatticeGraphNode[]; edges: LatticeGraphEdge[] } {
  const nodeIds = new Set(nodes.map((n) => n.id))
  const seen = new Set<string>()
  const cleanEdges: LatticeGraphEdge[] = []
  for (const e of edges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue
    if (e.source === e.target) continue
    const key = `${e.source} ${e.target} ${e.kind} ${e.sourceSystem}`
    if (seen.has(key)) continue
    seen.add(key)
    cleanEdges.push(e)
  }
  const degree = computeDegrees(nodes, cleanEdges)
  const sizedNodes = nodes.map((n) => {
    const deg = degree.get(n.id) ?? 0
    return { ...n, degree: deg, size: sizeForDegree(deg) }
  })
  return { nodes: sizedNodes, edges: cleanEdges }
}

function snapshotRevision(snap: GraphSourceSnapshot, options: GraphBuildOptions): string {
  const parts: string[] = [snap.projectId, options.showCardInstances ? 'ci' : 'co']
  const stamp = (id: string, at?: number) => parts.push(id, String(at ?? 0))
  for (const n of snap.notes) stamp(n.id, n.updatedAt)
  for (const d of snap.docs) stamp(d.id, d.updatedAt)
  for (const sh of snap.sheetDocs) stamp(sh.id, sh.updatedAt)
  for (const p of snap.presentDocs) stamp(p.id, p.updatedAt)
  for (const co of snap.codeDocs) stamp(co.id, co.updatedAt)
  for (const a of snap.assets) stamp(a.id, a.importedAt)
  for (const b of snap.boards) parts.push(b.id, String(b.nodes.length), String(b.edges.length))
  return hashString(parts.join('|'))
}

/* ---------------- public API ---------------- */

/**
 * Build the full normalized graph for a project snapshot. Deterministic:
 * the same snapshot always yields the same nodes, edges and revision.
 */
export function extractGraph(
  snap: GraphSourceSnapshot,
  options: GraphBuildOptions = DEFAULT_BUILD_OPTIONS,
): LatticeGraphData {
  const c: Collector = {
    nodes: new Map(),
    edges: [],
    titleIndex: new Map(),
    assetNode: new Map(),
  }
  collectNodes(snap, c)
  collectWikilinkEdges(snap, c)
  collectSourceAssetEdges(snap, c)
  collectBoardEdges(snap, c, options)
  collectTagEdges(snap, c)
  collectGithubEdges(snap, c)
  collectProjectHierarchy(snap, c)

  const { nodes, edges } = normalizeGraph([...c.nodes.values()], c.edges)

  return {
    schemaVersion: GRAPH_SCHEMA_VERSION,
    projectId: snap.projectId,
    nodes,
    edges,
    generatedAt: new Date().toISOString(),
    revision: snapshotRevision(snap, options),
    statistics: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      orphanCount: nodes.filter((n) => (n.degree ?? 0) === 0).length,
      clusterCount: countComponents(nodes, edges),
    },
  }
}
