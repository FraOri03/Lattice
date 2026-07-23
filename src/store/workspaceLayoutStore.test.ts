import { beforeEach, describe, expect, it } from 'vitest'
import {
  clampRatio,
  MAX_RATIO,
  MIN_RATIO,
  useWorkspaceLayoutStore,
} from './workspaceLayoutStore'

/**
 * The workspace layout store owns the split (second pane) — the layout that
 * used to be smuggled inside ViewMode. It also enables the "editor on the left,
 * graph on the right" coexistence via the secondary pane's content.
 */

const reset = () =>
  useWorkspaceLayoutStore.setState({
    split: false,
    direction: 'horizontal',
    ratio: 0.5,
    secondaryContent: 'board',
  })

describe('clampRatio', () => {
  it('clamps to [MIN, MAX] and defaults NaN to centre', () => {
    expect(clampRatio(-1)).toBe(MIN_RATIO)
    expect(clampRatio(2)).toBe(MAX_RATIO)
    expect(clampRatio(0.42)).toBe(0.42)
    expect(clampRatio(Number.NaN)).toBe(0.5)
  })
})

describe('split layout', () => {
  beforeEach(reset)

  it('starts single (no split)', () => {
    expect(useWorkspaceLayoutStore.getState().split).toBe(false)
  })

  it('openSplit opens the second pane with the Board by default', () => {
    useWorkspaceLayoutStore.getState().openSplit()
    const s = useWorkspaceLayoutStore.getState()
    expect(s.split).toBe(true)
    expect(s.secondaryContent).toBe('board')
  })

  it('supports editor-left + graph-right (graph in the second pane)', () => {
    useWorkspaceLayoutStore.getState().openSplit({ secondary: 'graph' })
    const s = useWorkspaceLayoutStore.getState()
    expect(s.split).toBe(true)
    expect(s.secondaryContent).toBe('graph')
  })

  it('openSplit keeps the current secondary when called without options', () => {
    useWorkspaceLayoutStore.getState().setSecondaryContent('graph')
    useWorkspaceLayoutStore.getState().openSplit()
    expect(useWorkspaceLayoutStore.getState().secondaryContent).toBe('graph')
  })

  it('closeSplit returns to a single pane', () => {
    useWorkspaceLayoutStore.getState().openSplit()
    useWorkspaceLayoutStore.getState().closeSplit()
    expect(useWorkspaceLayoutStore.getState().split).toBe(false)
  })

  it('toggleSplit flips the layout', () => {
    const { toggleSplit } = useWorkspaceLayoutStore.getState()
    toggleSplit()
    expect(useWorkspaceLayoutStore.getState().split).toBe(true)
    toggleSplit()
    expect(useWorkspaceLayoutStore.getState().split).toBe(false)
  })

  it('setRatio clamps the primary fraction', () => {
    useWorkspaceLayoutStore.getState().setRatio(0.95)
    expect(useWorkspaceLayoutStore.getState().ratio).toBe(MAX_RATIO)
    useWorkspaceLayoutStore.getState().setRatio(0.05)
    expect(useWorkspaceLayoutStore.getState().ratio).toBe(MIN_RATIO)
  })
})
