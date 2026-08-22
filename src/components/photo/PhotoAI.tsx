import { useState } from 'react'
import { usePhotoStore } from '@/store/photoStore'
import { generateSetLayout } from '@/lib/photo/ai'
import { AiJobError, aiFailureMessage } from '@/lib/ai'
import { aiAvailability } from '@/lib/ai/availability'
import { BYOK_PROVIDERS } from '@/lib/ai/byok'
import { hasConsent } from '@/lib/ai/consent'
import { useOptionalAccount } from '@/lib/auth/AccountProvider'
import { useOnline } from '@/lib/net/useOnline'
import { useI18n } from '@/lib/i18n'
import {
  AiConsentCard,
  AiCostNote,
  AiDisclosureNote,
  ByokField,
} from '@/components/ai/parts'
import { IcAlert, IcCheckCircle, IcSend, IcSparkles, IcX } from '@/components/Icons'

const FIELD =
  'w-full rounded-md border border-bord bg-panel2 px-2 py-1 text-xs text-ink outline-none placeholder:text-muted focus:border-accent'

const EXAMPLE_KEYS = ['beauty', 'ski', 'interview', 'night'] as const

/**
 * Right-side AI panel: prompt in, a generated set layout for the active shot.
 *
 * The surface 21.3 generalised FROM, and now the surface it applies back to.
 * Three things it did not have before, each of which the rest of the app now
 * shares with it (`components/ai/parts.tsx`):
 *
 *  - **The disclosure**, before the button rather than after a failure: what
 *    leaves this device, where it goes, and whose bill it is.
 *  - **Consent**, asked once for the recipient and remembered per account.
 *    Storing a key says the user has an account with the vendor; it does not
 *    say bytes may go there, and those were being treated as one answer.
 *  - **The key field**, which is the same component the top-bar panel
 *    renders — the second copy of it was the thing this issue existed to
 *    prevent.
 *
 * And the run itself now goes through the jobs store, so a generation
 * started here is visible, cancellable and costed from the AI panel even
 * after the user has left Photo mode.
 */
export function PhotoAI() {
  const t = useI18n()
  const loadRawElements = usePhotoStore((s) => s.loadRawElements)
  const setAiPanelOpen = usePhotoStore((s) => s.setAiPanelOpen)
  const projectId = usePhotoStore((s) => s.projectId)
  const online = useOnline()
  // `useOptionalAccount`, not `useAccount`: the identity only DECORATES this
  // surface — it decides which sentence the hosted backend gets — and a panel
  // that cannot render without the provider is a panel that cannot be tested
  // or reused. Anything that acts on the account still uses `useAccount`.
  const account = useOptionalAccount()
  const signedIn = !!account && account.providers.includes('google')

  const [prompt, setPrompt] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [lastPrompt, setLastPrompt] = useState('')
  /** A prompt held back until the recipient has been agreed to. */
  const [awaitingConsent, setAwaitingConsent] = useState<string | null>(null)
  const [revision, bump] = useState(0)

  const availability = aiAvailability('design-set', { online, signedIn })
  void revision

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  const handleGenerate = async (selectedPrompt: string, forceOffline = false) => {
    /*
     * The gate, and it only guards the path that actually sends something.
     * The offline templates run on this device, so asking permission to talk
     * to nobody would be a dialog in front of a local computation.
     */
    if (!forceOffline && availability.consent && !hasConsent(availability.consent)) {
      setAwaitingConsent(selectedPrompt)
      return
    }
    setAwaitingConsent(null)
    setIsLoading(true)
    setError(null)
    setSuccess(null)
    setLastPrompt(selectedPrompt)

    try {
      const stepPromise = (async () => {
        for (const step of t.ai.photo.steps) {
          setLoadingStep(step)
          await sleep(450)
        }
      })()
      const [, result] = await Promise.all([
        stepPromise,
        generateSetLayout(selectedPrompt, {
          forceOffline,
          projectId: projectId ?? '',
          uploadConsent: true,
        }),
      ])

      loadRawElements(result.elements)
      const cameras = result.elements.filter((e) => e.type === 'camera').length
      const lights = result.elements.filter((e) => e.type === 'light').length
      const others = result.elements.length - cameras - lights
      setSuccess(
        t.ai.photo.success(
          result.source === 'gemini' ? t.ai.photo.engineModel : t.ai.photo.engineOffline,
          cameras,
          lights,
          others,
        ),
      )
    } catch (err) {
      // The seam answers with a reason as well as a sentence, so the panel
      // can say what happened AND whether retrying is worth it — in the
      // reader's language rather than the vendor's.
      setError(
        err instanceof AiJobError
          ? aiFailureMessage(t, err.failure)
          : err instanceof Error
            ? err.message
            : t.ai.photo.unknownError,
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (prompt.trim()) void handleGenerate(prompt.trim())
  }

  return (
    <aside className="flex h-full w-72 flex-none flex-col border-l border-bord bg-panel">
      <div className="flex h-9 flex-none items-center justify-between border-b border-bord px-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold tracking-widest text-muted uppercase">
          <IcSparkles size={14} className="text-accent" /> {t.ai.photo.title}
        </div>
        <button
          onClick={() => setAiPanelOpen(false)}
          className="icon-btn"
          title={t.ai.photo.close}
          aria-label={t.ai.photo.close}
        >
          <IcX size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-3">
        <p className="text-[11px] leading-relaxed text-muted">{t.ai.photo.intro}</p>

        {/* what leaves, where it goes, who pays — before the button */}
        <div className="space-y-1 rounded-lg border border-bord bg-panel2/40 p-2">
          <AiDisclosureNote availability={availability} />
          <AiCostNote estimate={availability.cost} />
          {availability.blocked && (
            <p className="text-[10.5px] leading-relaxed text-ink">
              {t.ai.blocked[availability.blocked]}
            </p>
          )}
        </div>

        {/* quick examples */}
        <div>
          <span className="mb-1.5 block text-[10px] font-semibold tracking-widest text-muted uppercase">
            {t.ai.photo.examplesTitle}
          </span>
          <div className="space-y-1.5">
            {EXAMPLE_KEYS.map((key) => {
              const example = t.ai.photo.examples[key]
              return (
                <button
                  key={key}
                  onClick={() => {
                    setPrompt(example.prompt)
                    void handleGenerate(example.prompt)
                  }}
                  disabled={isLoading}
                  className="group flex w-full cursor-pointer items-center justify-between rounded-lg border border-bord bg-panel2/50 p-2 text-left text-xs hover:border-accent disabled:opacity-50"
                >
                  <span className="truncate pr-2 font-medium group-hover:text-ink">
                    {example.title}
                  </span>
                  <IcSparkles
                    size={12}
                    className="flex-none text-accent opacity-40 group-hover:opacity-100"
                  />
                </button>
              )
            })}
          </div>
        </div>

        {/* prompt */}
        <form onSubmit={handleSubmit} className="border-t border-bord pt-3">
          <div className="relative">
            <textarea
              rows={3}
              placeholder={t.ai.photo.promptPlaceholder}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isLoading}
              className={`${FIELD} resize-none pr-9`}
              aria-label={t.ai.photo.promptPlaceholder}
            />
            <button
              type="submit"
              disabled={isLoading || !prompt.trim()}
              className="absolute right-2 bottom-2 cursor-pointer rounded-md border border-bord bg-panel2 p-1.5 text-accent hover:border-accent disabled:cursor-default disabled:text-muted disabled:opacity-50"
              title={t.ai.photo.generate}
              aria-label={t.ai.photo.generate}
            >
              <IcSend size={13} />
            </button>
          </div>
        </form>

        {/* consent, asked once for this recipient and then remembered */}
        {awaitingConsent && availability.consent && (
          <AiConsentCard
            subject={availability.consent}
            onGranted={() => {
              bump((n) => n + 1)
              void handleGenerate(awaitingConsent)
            }}
            onDeclined={() => setAwaitingConsent(null)}
          />
        )}

        {/* progress */}
        {isLoading && (
          <div className="space-y-2 rounded-lg border border-accent/40 bg-accent/5 p-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
              </span>
              <span className="text-[10px] font-bold tracking-wider text-accent uppercase">
                {t.ai.photo.generating}
              </span>
            </div>
            <p className="text-[11px] text-muted italic" aria-live="polite">
              {loadingStep}
            </p>
          </div>
        )}

        {/* result banners */}
        {success && (
          <div className="space-y-1 rounded-lg border border-[#14ae5c]/40 bg-[#14ae5c]/10 p-2.5 text-xs">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-[#14ae5c] uppercase">
              <IcCheckCircle size={14} /> {t.ai.photo.successTitle}
            </div>
            <p className="text-[11px] leading-relaxed text-muted" aria-live="polite">
              {success}
            </p>
          </div>
        )}
        {error && (
          <div className="space-y-1.5 rounded-lg border border-[#f24822]/40 bg-[#f24822]/10 p-2.5 text-xs">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-[#f24822] uppercase">
              <IcAlert size={14} /> {t.ai.photo.failureTitle}
            </div>
            <p className="text-[11px] leading-relaxed text-muted" aria-live="assertive">
              {error}
            </p>
            {lastPrompt && (
              <button
                className="btn w-full !py-1 text-[11px]"
                onClick={() => void handleGenerate(lastPrompt, true)}
              >
                {t.ai.photo.useOffline}
              </button>
            )}
          </div>
        )}
      </div>

      {/* the key, and the same field the AI panel shows */}
      <div className="flex-none border-t border-bord p-3">
        <ByokField provider={BYOK_PROVIDERS.gemini} onChange={() => bump((n) => n + 1)} />
      </div>
    </aside>
  )
}
