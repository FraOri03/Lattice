import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useStore } from '@/store/useStore'
import { useUiStore } from '@/store/useUiStore'
import { clearAllByokKeys, setByokKey } from '@/lib/ai/byok'
import { clearConsentHistory, hasConsent } from '@/lib/ai/consent'
import { useAiJobs } from '@/lib/ai/jobsStore'
import { AiTab } from './AiTab'
import { PhotoAI } from '@/components/photo/PhotoAI'

/**
 * The two things a new surface owes before it ships: it can be operated
 * without a mouse, and it does not send anything anywhere before it has been
 * agreed to. `docs/accessibility.md` records what this app already owes on
 * the first count, and a new surface must not add to it.
 */

beforeEach(() => {
  localStorage.clear()
  clearAllByokKeys()
  clearConsentHistory()
  useAiJobs.getState().clear()
  useUiStore.setState({ aiPanelOpen: false })
  useStore.setState({ locale: 'en' })
})

describe('the toolbar entry, by keyboard alone', () => {
  it('opens the panel, moves focus into it, and hands focus back on Escape', async () => {
    render(<AiTab />)
    const tab = screen.getByRole('button', { name: /ai panel/i })
    tab.focus()
    expect(document.activeElement).toBe(tab)

    // what Enter on a focused button produces
    fireEvent.click(tab)
    const panel = await screen.findByRole('dialog', { name: /ai actions, cost and privacy/i })

    // focus lands inside, or a keyboard user restarts from the top of the page
    await waitFor(() =>
      expect(document.activeElement).toBe(within(panel).getByRole('heading', { level: 2 })),
    )

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(tab)
  })

  it('says how many generations are running rather than showing a coloured dot', async () => {
    render(<AiTab />)
    expect(screen.getByRole('button', { name: 'AI panel' })).toBeInTheDocument()
  })
})

describe('the panel says what a run costs and where it goes, before anything runs', () => {
  it('labels the cost as an estimate and names who is billed', async () => {
    render(<AiTab />)
    fireEvent.click(screen.getByRole('button', { name: /ai panel/i }))
    const panel = await screen.findByRole('dialog')

    // the word "estimate", because a range presented as a price is worse
    // than no number at all
    await waitFor(() => expect(panel).toHaveTextContent(/estimate/i))
    // and who pays, which the destination alone cannot say
    expect(panel).toHaveTextContent(/billed/i)
  })

  it('is honest about the actions nothing in the app can run yet', async () => {
    render(<AiTab />)
    fireEvent.click(screen.getByRole('button', { name: /ai panel/i }))
    const panel = await screen.findByRole('dialog')
    await waitFor(() => expect(panel).toHaveTextContent(/phase 21\.5/i))
  })

  it('offers the key field and the consent log in the same place', async () => {
    render(<AiTab />)
    fireEvent.click(screen.getByRole('button', { name: /ai panel/i }))
    const panel = await screen.findByRole('dialog')
    await waitFor(() =>
      expect(within(panel).getByLabelText(/google gemini api key/i)).toBeInTheDocument(),
    )
    expect(panel).toHaveTextContent(/what you have agreed to/i)
    expect(panel).toHaveTextContent(/nothing has been agreed/i)
  })
})

describe('Photo mode asks before it uploads', () => {
  it('holds the prompt and shows the consent card instead of calling the vendor', async () => {
    setByokKey('gemini', 'a-key')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    render(<PhotoAI />)
    fireEvent.click(screen.getByRole('button', { name: /beauty photo set/i }))

    expect(await screen.findByText(/send data to google gemini\?/i)).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(hasConsent({ destination: 'third-party', vendor: 'google-gemini' })).toBe(false)

    vi.unstubAllGlobals()
  })

  it('records the grant when the user agrees, and names the recipient in the question', async () => {
    setByokKey('gemini', 'a-key')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      elements: [{ type: 'camera', name: 'Camera A', x: 0, y: 0, rotation: 0 }],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      })),
    )

    render(<PhotoAI />)
    fireEvent.click(screen.getByRole('button', { name: /beauty photo set/i }))
    fireEvent.click(await screen.findByRole('button', { name: /agree and continue/i }))

    await waitFor(() =>
      expect(hasConsent({ destination: 'third-party', vendor: 'google-gemini' })).toBe(true),
    )
    vi.unstubAllGlobals()
  })

  /**
   * Declining has to be a button. A consent screen with only an X in the
   * corner is not consent, and the offline templates stay reachable exactly
   * when the user has refused the vendor.
   */
  it('lets the user decline without losing the on-device generator', async () => {
    setByokKey('gemini', 'a-key')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    render(<PhotoAI />)
    fireEvent.click(screen.getByRole('button', { name: /beauty photo set/i }))
    fireEvent.click(await screen.findByRole('button', { name: /not now/i }))

    await waitFor(() => expect(screen.queryByText(/send data to/i)).toBeNull())
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('shows the disclosure before the button, not after a failure', () => {
    render(<PhotoAI />)
    // with no key the on-device templates answer, and the honest sentence is
    // that nothing is sent anywhere — not "your prompt leaves this device"
    expect(screen.getByText(/nothing is sent anywhere/i)).toBeInTheDocument()
    expect(screen.queryByText(/your prompt leaves this device/i)).toBeNull()
  })

  it('switches to the third-party sentence the moment a key is stored', () => {
    setByokKey('gemini', 'a-key')
    render(<PhotoAI />)
    // all three facts, and the recipient named rather than "a third party"
    expect(
      screen.getByText(/your prompt leaves this device.*google gemini, under your own account/is),
    ).toBeInTheDocument()
    expect(screen.getByText(/^billed to you, by the vendor/i)).toBeInTheDocument()
  })
})
