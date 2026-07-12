/**
 * GraphRegistry — the extension surface for Graph View.
 *
 *  - graph PROVIDERS (where data comes from: local, future server/AI/plugin);
 *  - plugin-defined NODE kinds and EDGE kinds, so a plugin can contribute new
 *    entity/relationship types that flow through the same contract, renderer,
 *    filters and legend.
 *
 * Nothing here is wired to a network or the store — it is a plain registry so
 * it is safe to import from the worker and from tests.
 */
import type { GraphProvider } from './GraphProvider'
import type { GraphColorToken } from './graphKindMeta'
import { localGraphProvider } from './LocalGraphProvider'

export interface PluginNodeKindSpec {
  kind: string
  label: string
  color: GraphColorToken
  icon: string
}

export interface PluginEdgeKindSpec {
  kind: string
  label: string
  /** rendered line style hint */
  style?: 'solid' | 'dashed' | 'dotted'
}

class GraphRegistry {
  private providers = new Map<string, GraphProvider>()
  private nodeKinds = new Map<string, PluginNodeKindSpec>()
  private edgeKinds = new Map<string, PluginEdgeKindSpec>()
  private activeProviderId = 'local'

  constructor() {
    this.registerProvider(localGraphProvider)
  }

  registerProvider(provider: GraphProvider) {
    this.providers.set(provider.id, provider)
  }

  getProvider(id = this.activeProviderId): GraphProvider {
    return this.providers.get(id) ?? localGraphProvider
  }

  setActiveProvider(id: string) {
    if (this.providers.has(id)) this.activeProviderId = id
  }

  listProviders(): GraphProvider[] {
    return [...this.providers.values()]
  }

  registerNodeKind(spec: PluginNodeKindSpec) {
    this.nodeKinds.set(spec.kind, spec)
  }

  registerEdgeKind(spec: PluginEdgeKindSpec) {
    this.edgeKinds.set(spec.kind, spec)
  }

  getNodeKind(kind: string): PluginNodeKindSpec | undefined {
    return this.nodeKinds.get(kind)
  }

  getEdgeKind(kind: string): PluginEdgeKindSpec | undefined {
    return this.edgeKinds.get(kind)
  }
}

export const graphRegistry = new GraphRegistry()
