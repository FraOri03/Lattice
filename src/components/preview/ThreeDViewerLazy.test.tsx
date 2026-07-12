import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThreeDViewer } from './ThreeDViewerLazy'

/**
 * PERF-1 / PERF-2: the 3D viewer is lazy AND viewport-gated. jsdom's
 * IntersectionObserver (test setup) never reports intersection, so the
 * viewer stays off-screen — proving the heavy three.js chunk is not even
 * requested until a model scrolls into view, and a stable placeholder holds
 * the space meanwhile.
 */
describe('ThreeDViewer lazy wrapper', () => {
  it('renders a placeholder and does not mount three.js while off-screen', () => {
    render(<ThreeDViewer url="blob:model" ext="glb" />)
    expect(screen.getByText(/scroll into view to load/i)).toBeInTheDocument()
    // the lazy chunk's own fallback ("Loading 3D…") only appears once mounted
    expect(screen.queryByText(/loading 3d/i)).toBeNull()
  })
})
