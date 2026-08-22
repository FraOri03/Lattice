import { useState } from 'react'
import { useI18n, useLocale, useTimeAgo } from '@/lib/i18n'
import type { Catalog } from '@/lib/i18n/messages'
import {
  byokKey,
  byokProviderByVendorId,
  byokVendorLabel,
  setByokKey,
  type ByokProviderMeta,
} from '@/lib/ai/byok'
import { grantConsent, revokeConsent, type AiConsentSubject } from '@/lib/ai/consent'
import { formatCostRange, formatMoney, type AiCostEstimate } from '@/lib/ai/cost'
import { aiFailureMessage, aiStateLabel } from '@/lib/ai/strings'
import { isTerminal } from '@/lib/ai/jobModel'
import type { AiActionAvailability } from '@/lib/ai/availability'
import type { AiJobEntry } from '@/lib/ai/jobsStore'
import { IcAlert, IcCheck, IcExternal, IcLock, IcSparkles, IcX } from '@/components/Icons'

/**
 * The pieces both AI surfaces are made of.
 *
 * The panel in the top bar and Photo mode's set designer ask the user the
 * same three questions — what leaves, what it costs, and do you agree — and
 * before this file they answered them differently or not at all. A second
 * feature copying Photo mode's key field is exactly the outcome 21.3 exists
 * to prevent, so the field, the disclosure and the consent card live here
 * and both surfaces render the same ones.
 */

const FIELD =
  'w-full rounded-md border border-bord bg-panel2 px-2 py-1 text-xs text-ink outline-none placeholder:text-muted focus:border-accent'

const GREEN = '#14ae5c'
const RED = '#f24822'

/** How a recipient is named on screen, from the stable id consent is filed under. */
export function recipientLabel(t: Catalog, subject: AiConsentSubject): string {
  if (subject.destination === 'deployment') return t.ai.consentRecipient.deployment
  const meta = byokProviderByVendorId(subject.vendor)
  return meta ? byokVendorLabel(meta) : t.ai.consentRecipient['third-party']
}

/**
 * What leaves, where it goes, who pays — the three facts owed before a
 * button is pressed, never after.
 *
 * Two halves of the seam answer it and neither can answer for the other:
 * the action says what a job CARRIES, the provider says where that GOES and
 * whose bill it is. The same upscale sends the same image whether it lands
 * on a rented GPU, on this machine, or nowhere at all.
 */
export function AiDisclosureNote({ availability }: { availability: AiActionAvailability }) {
  const t = useI18n()
  const { disclosure, carries, consent, provider } = availability

  /*
   * The disabled provider's disclosure is `device` / `free`, and rendering it
   * would be a reassurance about an action that cannot run: "it stays here,
   * nothing is billed" reads as *this one runs locally*, which is the
   * opposite of true. What leaves and who pays are answers only a configured
   * backend has, so this says that instead of borrowing the placeholder's.
   */
  if (provider.id === 'disabled') {
    return <p className="text-[10.5px] leading-relaxed text-muted">{t.ai.nothingRunsIt}</p>
  }

  /*
   * When the destination is this device, the "what leaves" half is skipped
   * rather than rendered and then contradicted. An action still *carries* a
   * prompt in the abstract, but a provider that runs here sends none of it
   * anywhere, and "your prompt leaves this device — it stays here" is a
   * sentence that makes a reader trust neither clause.
   */
  if (disclosure.destination === 'device') {
    return (
      <p className="text-[10.5px] leading-relaxed text-muted">
        {t.ai.destination.device}{' '}
        <span className="text-ink">{t.ai.billing[disclosure.cost]}</span>
      </p>
    )
  }

  const where =
    disclosure.destination === 'third-party'
      ? t.ai.destination['third-party'](consent ? recipientLabel(t, consent) : '')
      : t.ai.destination.deployment

  return (
    <p className="text-[10.5px] leading-relaxed text-muted">
      {t.ai.carries[carries]} {where} {t.ai.retention}{' '}
      <span className="text-ink">{t.ai.billing[disclosure.cost]}</span>
    </p>
  )
}

/**
 * The estimate, labelled as one.
 *
 * A range rather than a number, and the word "estimate" beside it, because
 * queue time and cold start are not knowable in advance. What it actually
 * cost appears on the job row once the backend has reported worker seconds
 * — which is the only number in this surface that is a fact.
 */
export function AiCostNote({ estimate }: { estimate: AiCostEstimate | null }) {
  const t = useI18n()
  const locale = useLocale()
  if (!estimate) return <p className="text-[10.5px] text-muted">{t.ai.noGpuCost}</p>
  return (
    <p className="text-[10.5px] leading-relaxed text-muted">
      <span className="rounded-sm bg-panel2 px-1 text-[9.5px] font-semibold tracking-wide text-ink uppercase">
        {t.ai.estimate}
      </span>{' '}
      <span className="text-ink">{t.ai.estimateOf(formatCostRange(locale, estimate))}</span>{' '}
      {t.ai.estimateWhy}
    </p>
  )
}

/**
 * The question, asked before the first upload and never again for the same
 * recipient.
 *
 * Naming the recipient is the whole point: a dialog that says "send data?"
 * without saying where is a dialog that cannot be answered. Declining is a
 * first-class button, not an X in a corner — a consent screen with only one
 * way out is not consent.
 */
export function AiConsentCard({
  subject,
  onGranted,
  onDeclined,
}: {
  subject: AiConsentSubject
  onGranted: () => void
  onDeclined?: () => void
}) {
  const t = useI18n()
  const recipient = recipientLabel(t, subject)
  return (
    <div className="space-y-2 rounded-lg border border-accent/40 bg-accent/5 p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-accent uppercase">
        <IcLock size={13} /> {t.ai.consentTitle(recipient)}
      </div>
      <p className="text-[11px] leading-relaxed text-muted">
        {subject.destination === 'deployment'
          ? t.ai.consentBodyDeployment
          : t.ai.consentBodyThirdParty(recipient)}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn flex-1 !py-1 text-[11px]"
          onClick={() => {
            grantConsent(subject)
            onGranted()
          }}
        >
          {t.ai.consentGrant}
        </button>
        {onDeclined && (
          <button
            type="button"
            className="btn flex-1 !py-1 text-[11px]"
            onClick={onDeclined}
          >
            {t.ai.consentDecline}
          </button>
        )}
      </div>
    </div>
  )
}

/** One granted recipient, with the way to take it back. */
export function AiConsentRow({
  subject,
  grantedAt,
  onRevoked,
}: {
  subject: AiConsentSubject
  grantedAt: number
  onRevoked: () => void
}) {
  const t = useI18n()
  const timeAgo = useTimeAgo()
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 border-b border-bord py-1.5 last:border-b-0">
      <span className="min-w-0 flex-1 text-[11.5px]">{recipientLabel(t, subject)}</span>
      <span className="text-[10px] text-muted">{t.ai.consentGranted(timeAgo(grantedAt))}</span>
      <button
        type="button"
        className="cursor-pointer text-[10.5px] text-accent hover:underline"
        onClick={() => {
          revokeConsent(subject)
          onRevoked()
        }}
      >
        {t.ai.consentRevoke}
      </button>
    </div>
  )
}

/**
 * A key of the user's own, for one vendor.
 *
 * Generalised out of `PhotoAI.tsx`, which had it right for one provider and
 * had it welded to that provider. Three things it must always say, and does:
 * where the key is kept, who is billed for what it runs, and how to take it
 * away again.
 */
export function ByokField({
  provider,
  onChange,
}: {
  provider: ByokProviderMeta
  onChange?: () => void
}) {
  const t = useI18n()
  const [value, setValue] = useState(() => byokKey(provider.id))
  const label = byokVendorLabel(provider)

  const write = (next: string) => {
    setValue(next)
    setByokKey(provider.id, next)
    onChange?.()
  }

  return (
    <div className="space-y-1.5">
      <label
        className="block text-[10px] font-medium text-muted"
        htmlFor={`byok-${provider.id}`}
      >
        {t.ai.keyLabel(label)}
      </label>
      <input
        id={`byok-${provider.id}`}
        type="password"
        value={value}
        onChange={(e) => write(e.target.value)}
        placeholder={t.ai.keyPlaceholder}
        className={`${FIELD} font-mono`}
        autoComplete="off"
        spellCheck={false}
      />
      <p className="text-[10px] leading-relaxed text-muted">
        {t.ai.keysBody} {t.ai.keyBilled}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className={`flex items-center gap-1 text-[10px] ${value ? 'text-ink' : 'text-muted'}`}
        >
          {value ? <IcCheck size={9} /> : <IcX size={9} />}
          {value ? t.ai.keyStored : t.ai.keyNone}
        </span>
        <a
          href={provider.keysUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center gap-1 text-[10.5px] text-accent hover:underline"
        >
          {t.ai.keyGet} <IcExternal size={10} />
        </a>
        {value && (
          <button
            type="button"
            className="cursor-pointer text-[10.5px] text-accent hover:underline"
            onClick={() => write('')}
          >
            {t.ai.keyRemove}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * One generation, from queued to whatever ended it.
 *
 * Progress is a bar AND a word: `docs/accessibility.md` records "state
 * conveyed by colour alone" as an open debt of this app, and a new surface
 * must not add to it. The cold-start wait says what it is waiting for rather
 * than spinning silently — `cold-start` exists as a state precisely so this
 * row can name it.
 */
export function AiJobRow({
  entry,
  onCancel,
  onDismiss,
}: {
  entry: AiJobEntry
  onCancel: (jobId: string) => void
  onDismiss: (jobId: string) => void
}) {
  const t = useI18n()
  const locale = useLocale()
  const { snapshot } = entry
  const done = isTerminal(snapshot.state)
  const failed = done && snapshot.state !== 'succeeded'
  const action = t.ai.actions[snapshot.actionId]
  const percent = Math.round(Math.min(1, Math.max(0, snapshot.progress)) * 100)

  return (
    <div className="space-y-1.5 border-b border-bord py-2 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <IcSparkles size={12} className="flex-none text-muted" />
        <span className="text-[11.5px] font-medium">{action}</span>
        <span
          className="flex items-center gap-1 rounded-full bg-panel2 px-1.5 py-0.5 text-[10px] font-medium"
          style={{ color: failed ? RED : done ? GREEN : undefined }}
        >
          {failed ? <IcAlert size={9} /> : done ? <IcCheck size={9} /> : null}
          {aiStateLabel(t, snapshot.state)}
        </span>
        <span className="flex-1" />
        {!done && (
          <button
            type="button"
            className="cursor-pointer text-[10.5px] text-accent hover:underline"
            onClick={() => onCancel(snapshot.jobId)}
          >
            {t.ai.cancel}
          </button>
        )}
        {done && (
          <button
            type="button"
            className="cursor-pointer text-[10.5px] text-muted hover:text-ink"
            onClick={() => onDismiss(snapshot.jobId)}
          >
            {t.ai.dismiss}
          </button>
        )}
      </div>

      {!done && (
        <div
          role="progressbar"
          aria-label={t.ai.progressAria(action, percent)}
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1 w-full overflow-hidden rounded-full bg-panel2"
        >
          <div className="h-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
        </div>
      )}

      {snapshot.state === 'cold-start' && (
        <p className="text-[10.5px] text-muted">{t.ai.coldStartHint}</p>
      )}
      {snapshot.queuePosition !== undefined && !done && (
        <p className="text-[10.5px] text-muted">{t.ai.queuePosition(snapshot.queuePosition)}</p>
      )}
      {entry.failure && (
        <p className="text-[10.5px] leading-relaxed" style={{ color: RED }}>
          {aiFailureMessage(t, entry.failure)}
        </p>
      )}
      {snapshot.state === 'succeeded' && (
        <p className="text-[10.5px] text-muted">
          {entry.cost
            ? t.ai.actualCost(
                formatMoney(locale, entry.cost.amount),
                Math.round(entry.cost.gpuSeconds),
              )
            : t.ai.notifyNoWorkerTime}
        </p>
      )}
    </div>
  )
}
