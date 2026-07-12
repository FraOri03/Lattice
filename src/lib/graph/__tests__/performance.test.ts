import { describe, expect, it } from 'vitest'
import { extractGraph } from '../GraphBuilder'
import { applyFilters } from '../GraphFilterService'
import { computeLayout } from '../forceLayout'
import { defaultGraphSettings } from '../GraphSettingsService'
import { syntheticSnapshot } from './fixtures'

/**
 * Performance fixtures for the four tiers (small/medium/large/extreme). These
 * assert the pipeline stays correct and completes within generous CI budgets;
 * the console output records index + layout timings for the perf doc.
 *
 * Timings are intentionally loose — they guard against accidental O(n²)
 * regressions, not against exact wall-clock numbers on any given machine.
 */
const TIERS = [
  { name: 'small', nodes: 500, indexBudgetMs: 500, layoutBudgetMs: 2500 },
  { name: 'medium', nodes: 5000, indexBudgetMs: 3000, layoutBudgetMs: 15000 },
  { name: 'extreme', nodes: 20000, indexBudgetMs: 12000, layoutBudgetMs: 45000 },
]

describe('Graph performance fixtures', () => {
  for (const tier of TIERS) {
    it(`builds and lays out a ${tier.nodes}-node project (${tier.name})`, { timeout: 60000 }, () => {
      const snap = syntheticSnapshot(tier.nodes)

      const t0 = performance.now()
      const data = extractGraph(snap, { showCardInstances: false })
      const indexMs = performance.now() - t0
      // exactly `nodes` note entities (+ one shared tag cluster node)
      expect(data.nodes.filter((n) => n.kind === 'note').length).toBe(tier.nodes)
      expect(data.nodes.length).toBe(tier.nodes + 1)
      expect(data.edges.length).toBeGreaterThan(0)
      expect(indexMs).toBeLessThan(tier.indexBudgetMs)

      const filtered = applyFilters({ data, settings: defaultGraphSettings() })

      const t1 = performance.now()
      const positions = computeLayout({
        nodes: filtered.nodes,
        edges: filtered.edges,
        settings: defaultGraphSettings(),
        seed: snap.projectId,
      })
      const layoutMs = performance.now() - t1
      expect(Object.keys(positions).length).toBe(filtered.nodes.length)
      expect(layoutMs).toBeLessThan(tier.layoutBudgetMs)

      // deterministic layout: same input, same first position
      const again = computeLayout({
        nodes: filtered.nodes,
        edges: filtered.edges,
        settings: defaultGraphSettings(),
        seed: snap.projectId,
      })
      const firstId = filtered.nodes[0].id
      expect(again[firstId]).toEqual(positions[firstId])

      // eslint-disable-next-line no-console
      console.log(
        `[graph perf] ${tier.name.padEnd(7)} ${tier.nodes} nodes / ${data.edges.length} edges` +
          ` — index ${indexMs.toFixed(0)}ms, layout ${layoutMs.toFixed(0)}ms`,
      )
    })
  }
})
