import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store/useStore'
import { usePhotoStore } from '@/store/photoStore'
import { useOptionalAccount } from '@/lib/auth/AccountProvider'
import { useOnline } from '@/lib/net/useOnline'
import { useI18n, useLocale } from '@/lib/i18n'
import { AI_ACTION_IDS } from '@/lib/ai/actions'
import { aiAvailability, aiSurfaceState } from '@/lib/ai/availability'
import { BYOK_PROVIDERS, BYOK_PROVIDER_IDS } from '@/lib/ai/byok'
import { consentHistory } from '@/lib/ai/consent'
import { formatMoney } from '@/lib/ai/cost'
import { activeEntries, spentThisSession, useAiJobs } from '@/lib/ai/jobsStore'
import { AiCostNote, AiDisclosureNote, AiConsentRow, AiJobRow, ByokField } from './parts'
import { IcSparkles, IcX } from '@/components/Icons'

/**
 * The AI surface: what an action costs, what leaves the device, whose key
 * runs it, and what is running right now.
 *
 * Default-exported and reached only through `React.lazy` from
 * [`AiTab`](./AiTab.tsx) — this module is where the whole `lib/ai` seam
 * enters the graph, and it must not enter it on a page load that never opens
 * the panel.
 *
 * ## What it does not do
 *
 * It does not run a text-to-image. Not an omission: a generated image needs
 * somewhere to be stored and something to be dropped into, and both are
 * 21.5's. Offering a button that produces bytes with nowhere to put them
 * would be the dead-end this phase is supposed to be removing, so each
 * action says where it is run from — and for the one that has a home today,
 * says it with a button.
 */
export default function AiPanel({ onClose }: { onClose: () => void }) {
  const t = useI18n()
  const locale = useLocale()
  const online = useOnline()
  // `useOptionalAccount`, not `useAccount`: the identity only DECORATES this
  // surface — it decides which sentence the hosted backend gets — and a panel
  // that cannot render without the provider is a panel that cannot be tested
  // or reused. Anything that acts on the account still uses `useAccount`.
  const account = useOptionalAccount()
  const signedIn = !!account && account.providers.includes('google')
  const entries = useAiJobs((s) => s.entries)
  const cancel = useAiJobs((s) => s.cancel)
  const dismiss = useAiJobs((s) => s.dismiss)
  const setViewMode = useStore((s) => s.setViewMode)
  // consent and keys live in storage, not in a store: this is what re-reads
  // them after the panel itself has changed one
  const [revision, bump] = useState(0)
  const heading = useRef<HTMLHeadingElement>(null)

  // focus lands inside the panel when it opens; AiTab puts it back on close
  useEffect(() => heading.current?.focus(), [])

  const ctx = { online, signedIn }
  const state = aiSurfaceState(ctx)
  const running = activeEntries(entries)
  const spent = spentThisSession(entries)
  const grants = consentHistory()
  void revision

  return (
    <div className="flex max-h-full min-h-0 flex-col">
      <div className="flex h-9 flex-none items-center justify-between border-b border-bord px-3">
        <h2
          ref={heading}
          tabIndex={-1}
          className="flex items-center gap-2 text-[11px] font-semibold tracking-widest text-muted uppercase outline-none"
        >
          <IcSparkles size={14} className="text-accent" /> {t.ai.panelTitle}
        </h2>
        <button type="button" onClick={onClose} className="icon-btn" aria-label={t.ai.close}>
          <IcX size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {/* the one-line state of the whole surface — and it is a sentence,
            because "AI unavailable" is the message this phase removes */}
        <p aria-live="polite" className="text-[11px] leading-relaxed text-ink">
          {t.ai.surface[state]}
        </p>
        {!online && <p className="text-[10.5px] leading-relaxed text-muted">{t.ai.offlinePolicy}</p>}

        {/* ---- what is running ---- */}
        <section>
          <SectionTitle>
            {t.ai.jobsTitle}
            {running.length > 0 && (
              <span className="ml-2 font-normal normal-case">{t.ai.jobsRunning(running.length)}</span>
            )}
          </SectionTitle>
          {entries.length === 0 ? (
            <p className="text-[10.5px] text-muted">{t.ai.jobsEmpty}</p>
          ) : (
            entries.map((entry) => (
              <AiJobRow
                key={entry.snapshot.jobId}
                entry={entry}
                onCancel={(id) => void cancel(id)}
                onDismiss={dismiss}
              />
            ))
          )}
          {/* the only spend number this phase can state as a fact, next to
              the sentence that says what it is not */}
          <p className="mt-2 text-[10.5px] text-ink">
            {t.ai.spentThisSession(formatMoney(locale, spent))}
          </p>
          <p className="text-[10.5px] leading-relaxed text-muted">{t.ai.noBudgetYet}</p>
        </section>

        {/* ---- the catalogue, with its disclosures ---- */}
        <section>
          <SectionTitle>{t.ai.actionsTitle}</SectionTitle>
          {AI_ACTION_IDS.map((actionId) => {
            const availability = aiAvailability(actionId, ctx)
            const inPhoto = actionId === 'design-set'
            return (
              <div key={actionId} className="space-y-1 border-b border-bord py-2 last:border-b-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11.5px] font-medium">{t.ai.actions[actionId]}</span>
                  {availability.blocked && (
                    <span className="rounded-full bg-panel2 px-1.5 py-0.5 text-[10px] text-muted">
                      {t.ai.blocked[availability.blocked]}
                    </span>
                  )}
                  <span className="flex-1" />
                  {inPhoto && availability.runnable && (
                    <button
                      type="button"
                      className="cursor-pointer text-[10.5px] text-accent hover:underline"
                      onClick={() => {
                        setViewMode('photo')
                        usePhotoStore.getState().setAiPanelOpen(true)
                        onClose()
                      }}
                    >
                      {t.ai.openInPhoto}
                    </button>
                  )}
                </div>
                <AiDisclosureNote availability={availability} />
                <AiCostNote estimate={availability.cost} />
                <p className="text-[10.5px] text-muted">
                  {inPhoto ? t.ai.hostPhoto : t.ai.noHostYet}
                </p>
              </div>
            )
          })}
        </section>

        {/* ---- keys of the user's own ---- */}
        <section className="space-y-3">
          <SectionTitle>{t.ai.keysTitle}</SectionTitle>
          {BYOK_PROVIDER_IDS.map((id) => (
            <ByokField key={id} provider={BYOK_PROVIDERS[id]} onChange={() => bump((n) => n + 1)} />
          ))}
        </section>

        {/* ---- what has been agreed to ---- */}
        <section>
          <SectionTitle>{t.ai.consentTitleList}</SectionTitle>
          {grants.length === 0 ? (
            <p className="text-[10.5px] text-muted">{t.ai.consentEmpty}</p>
          ) : (
            grants.map((grant) => (
              <AiConsentRow
                key={`${grant.destination}:${grant.vendor}`}
                subject={grant}
                grantedAt={grant.grantedAt}
                onRevoked={() => bump((n) => n + 1)}
              />
            ))
          )}
        </section>
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-1.5 text-[10px] font-semibold tracking-widest text-muted uppercase">
      {children}
    </h3>
  )
}
