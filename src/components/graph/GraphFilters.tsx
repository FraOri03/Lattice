import type { GraphEntityKind, GraphRelationshipKind, GraphViewSettings } from '@/lib/graph/graphTypes'
import { GraphNodeIcon, graphNodeColor } from './graphVisuals'
import { kindMeta } from '@/lib/graph/graphKindMeta'
import {
  ENTITY_LABEL,
  FILTERABLE_ENTITY_KINDS,
  FILTERABLE_RELATIONSHIP_KINDS,
  RELATIONSHIP_LABEL,
} from './graphLabels'
import { IcX } from '@/components/Icons'

interface GraphFiltersProps {
  settings: GraphViewSettings
  update: (patch: Partial<GraphViewSettings>) => void
  onClose: () => void
}

function toggleInArray<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex items-center justify-between gap-2 py-1 text-[12px]">
      <span className="text-muted">{label}</span>
      {children}
    </label>
  )
}

function Check({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: () => void
  children: React.ReactNode
}) {
  return (
    <button
      role="checkbox"
      aria-checked={checked}
      onClick={onChange}
      className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[11.5px] hover:bg-panel2"
    >
      <span
        className={`flex h-3.5 w-3.5 flex-none items-center justify-center rounded border ${
          checked ? 'border-accent bg-accent text-white' : 'border-bord'
        }`}
      >
        {checked && <span className="text-[9px] leading-none">✓</span>}
      </span>
      {children}
    </button>
  )
}

/** Collapsible left panel: scope, layout, node & relationship visibility. */
export function GraphFilters({ settings, update, onClose }: GraphFiltersProps) {
  return (
    <aside
      className="flex h-full w-60 flex-none flex-col border-r border-bord bg-panel"
      aria-label="Graph filters"
    >
      <div className="flex items-center gap-2 border-b border-bord px-3 py-2">
        <span className="flex-1 text-[12px] font-semibold">Filters &amp; layout</span>
        <button className="icon-btn" aria-label="Close filters" onClick={onClose}>
          <IcX size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <div className="insp-h !mt-3">Scope</div>
        <div className="flex rounded-lg border border-bord bg-panel2 p-0.5" role="tablist">
          {(['project', 'local'] as const).map((scope) => (
            <button
              key={scope}
              role="tab"
              aria-selected={settings.scope === scope}
              className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium capitalize ${
                settings.scope === scope ? 'bg-panel text-ink shadow-sm' : 'text-muted'
              }`}
              onClick={() => update({ scope })}
            >
              {scope}
            </button>
          ))}
        </div>
        {settings.scope === 'local' && (
          <Row label={`Depth: ${settings.depth}`}>
            <input
              type="range"
              min={1}
              max={5}
              value={settings.depth}
              onChange={(e) => update({ depth: Number(e.target.value) })}
              className="w-28 accent-[var(--accent)]"
              aria-label="Local graph depth"
            />
          </Row>
        )}

        <div className="insp-h">Layout</div>
        <select
          className="field"
          value={settings.layout}
          onChange={(e) => update({ layout: e.target.value as GraphViewSettings['layout'] })}
          aria-label="Graph layout"
        >
          <option value="force">Force directed</option>
          <option value="grid-by-type">Grid by type</option>
          <option value="radial">Radial from selection</option>
        </select>
        <Row label={`Link distance: ${settings.linkDistance}`}>
          <input
            type="range"
            min={30}
            max={400}
            step={10}
            value={settings.linkDistance}
            onChange={(e) => update({ linkDistance: Number(e.target.value) })}
            className="w-28 accent-[var(--accent)]"
            aria-label="Link distance"
          />
        </Row>

        <div className="insp-h">Labels &amp; nodes</div>
        <select
          className="field mb-1.5"
          value={settings.showLabels}
          onChange={(e) => update({ showLabels: e.target.value as GraphViewSettings['showLabels'] })}
          aria-label="Label display"
        >
          <option value="smart">Smart labels</option>
          <option value="all">All labels</option>
          <option value="selected">Selected only</option>
          <option value="none">No labels</option>
        </select>
        <Check
          checked={settings.nodeSizeMode === 'fixed'}
          onChange={() =>
            update({ nodeSizeMode: settings.nodeSizeMode === 'fixed' ? 'degree' : 'fixed' })
          }
        >
          Fixed node size (accessibility)
        </Check>
        <Check checked={settings.showOrphans} onChange={() => update({ showOrphans: !settings.showOrphans })}>
          Show orphans
        </Check>
        <Check checked={settings.showTags} onChange={() => update({ showTags: !settings.showTags })}>
          Show tags
        </Check>
        <Check checked={settings.showProject} onChange={() => update({ showProject: !settings.showProject })}>
          Show project hub
        </Check>
        <Check
          checked={settings.showCardInstances}
          onChange={() => update({ showCardInstances: !settings.showCardInstances })}
        >
          Show board card instances
        </Check>

        <div className="insp-h">Entity types</div>
        {FILTERABLE_ENTITY_KINDS.map(({ group, kinds }) => (
          <div key={group} className="mb-1.5">
            <div className="px-1.5 py-0.5 text-[9.5px] tracking-wider text-muted uppercase">
              {group}
            </div>
            {kinds.map((kind: GraphEntityKind) => (
              <Check
                key={kind}
                checked={settings.visibleNodeKinds.includes(kind)}
                onChange={() =>
                  update({ visibleNodeKinds: toggleInArray(settings.visibleNodeKinds, kind) })
                }
              >
                <span
                  className="h-2.5 w-2.5 flex-none rounded-full"
                  style={{ background: graphNodeColor(kindMeta(kind).color) }}
                  aria-hidden
                />
                <GraphNodeIcon icon={kindMeta(kind).icon} size={11} />
                {ENTITY_LABEL[kind]}
              </Check>
            ))}
          </div>
        ))}

        <div className="insp-h">Relationships</div>
        {FILTERABLE_RELATIONSHIP_KINDS.map((kind: GraphRelationshipKind) => (
          <Check
            key={kind}
            checked={settings.visibleRelationshipKinds.includes(kind)}
            onChange={() =>
              update({
                visibleRelationshipKinds: toggleInArray(settings.visibleRelationshipKinds, kind),
              })
            }
          >
            {RELATIONSHIP_LABEL[kind]}
          </Check>
        ))}
      </div>
    </aside>
  )
}
