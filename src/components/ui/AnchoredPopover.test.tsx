import { useRef, useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AnchoredPopover } from './AnchoredPopover'

/**
 * The bug this component exists for was invisible to every assertion the
 * suite had: the panel WAS in the DOM, with the right state and the right
 * children — it was just clipped out of sight by the top bar's
 * `overflow-x-auto`, which CSS promotes to a vertical scroll container too.
 *
 * jsdom has no layout, so "is it clipped" is not a question it can answer.
 * What it CAN pin is the structural property that makes clipping impossible
 * — the panel is not a descendant of the bar — plus the dismissal
 * behaviour, which the portal changed the ground rules for: `contains()`
 * stopped meaning "visually inside" the moment these panels became
 * siblings under `<body>`.
 */

function Harness({
  wrapperStyle,
  nested = false,
}: {
  wrapperStyle?: React.CSSProperties
  nested?: boolean
}) {
  const outer = useRef<HTMLButtonElement>(null)
  const inner = useRef<HTMLButtonElement>(null)
  const [openOuter, setOpenOuter] = useState(false)
  const [openInner, setOpenInner] = useState(false)

  return (
    <div>
      <button data-testid="elsewhere">elsewhere</button>
      <div style={wrapperStyle} data-testid="bar">
        <button ref={outer} onClick={() => setOpenOuter((v) => !v)}>
          open outer
        </button>
        <AnchoredPopover
          anchorRef={outer}
          open={openOuter}
          onClose={() => setOpenOuter(false)}
          role="dialog"
          label="outer"
        >
          <span>outer body</span>
          {nested && (
            <>
              <button ref={inner} onClick={() => setOpenInner((v) => !v)}>
                open inner
              </button>
              <AnchoredPopover
                anchorRef={inner}
                open={openInner}
                onClose={() => setOpenInner(false)}
                role="dialog"
                label="inner"
              >
                <span>inner body</span>
              </AnchoredPopover>
            </>
          )}
        </AnchoredPopover>
      </div>
    </div>
  )
}

const outerPanel = () => screen.queryByRole('dialog', { name: 'outer' })
const innerPanel = () => screen.queryByRole('dialog', { name: 'inner' })

describe('AnchoredPopover', () => {
  it('renders outside the container that would clip it', () => {
    // the real container is the top bar, whose overflow makes it a scroll
    // box; what matters is that the panel is not inside it at all
    render(<Harness wrapperStyle={{ overflowX: 'auto', height: 43 }} />)
    fireEvent.click(screen.getByText('open outer'))

    const panel = outerPanel()!
    expect(panel).toBeTruthy()
    expect(screen.getByTestId('bar').contains(panel)).toBe(false)
    expect(panel.parentElement).toBe(document.body)
  })

  it('closes on an outside mousedown but not on one inside itself', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('open outer'))

    fireEvent.mouseDown(screen.getByText('outer body'))
    expect(outerPanel()).toBeTruthy()

    fireEvent.mouseDown(screen.getByTestId('elsewhere'))
    expect(outerPanel()).toBeNull()
  })

  it('does not treat its own trigger as outside', () => {
    // otherwise the mousedown closes it and the click re-opens it, and the
    // popover can never be dismissed from the control that opened it
    render(<Harness />)
    const trigger = screen.getByText('open outer')
    fireEvent.click(trigger)

    fireEvent.mouseDown(trigger)
    fireEvent.click(trigger)
    expect(outerPanel()).toBeNull()
  })

  it('closes on Escape', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('open outer'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(outerPanel()).toBeNull()
  })

  describe('nested — the folded top bar, where the bell renders inside the ··· menu', () => {
    it('keeps the layer underneath open when the top layer is clicked', () => {
      // both panels are siblings under <body>, so a plain contains() check
      // would call this click "outside" the outer panel and close it,
      // unmounting the trigger and the panel the user just clicked
      render(<Harness nested />)
      fireEvent.click(screen.getByText('open outer'))
      fireEvent.click(screen.getByText('open inner'))
      expect(innerPanel()).toBeTruthy()

      fireEvent.mouseDown(screen.getByText('inner body'))
      expect(innerPanel()).toBeTruthy()
      expect(outerPanel()).toBeTruthy()
    })

    it('peels one layer per Escape, top layer first', () => {
      render(<Harness nested />)
      fireEvent.click(screen.getByText('open outer'))
      fireEvent.click(screen.getByText('open inner'))

      fireEvent.keyDown(window, { key: 'Escape' })
      expect(innerPanel()).toBeNull()
      expect(outerPanel()).toBeTruthy()

      fireEvent.keyDown(window, { key: 'Escape' })
      expect(outerPanel()).toBeNull()
    })

    it('closes only the top layer on an outside click', () => {
      render(<Harness nested />)
      fireEvent.click(screen.getByText('open outer'))
      fireEvent.click(screen.getByText('open inner'))

      fireEvent.mouseDown(screen.getByTestId('elsewhere'))
      expect(innerPanel()).toBeNull()
      expect(outerPanel()).toBeTruthy()
    })
  })
})
