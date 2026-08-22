import { vaultKey } from '@/lib/storage/vaultScope'
import type { AiBackendProvider, AiDisclosure } from './AiBackendProvider.js'

/**
 * Who the user has agreed to send data to, remembered per account.
 *
 * ## Two gates, and they answer different questions
 *
 * The seam already refuses a submission that carries binary inputs without
 * `uploadConsent` — that is a per-REQUEST assertion, enforced inside the
 * provider so a surface that forgot cannot upload anything at all. It says
 * nothing about who the recipient is; it only says *these* bytes were
 * agreed to.
 *
 * This file is the other half: a per-DESTINATION grant, remembered, so the
 * second generation of an afternoon does not put a dialog in front of a
 * decision the user already made. The surface reads the grant and passes
 * `uploadConsent` on its strength. Neither gate replaces the other —
 * remove this one and every run asks again; remove the flag and a bug in
 * one surface can upload without ever having asked.
 *
 * ## Why it is keyed by destination and vendor rather than by provider
 *
 * "I agreed to this" is about the recipient, not about which of our classes
 * did the sending. A grant recorded against `third-party:google-gemini`
 * stays true if the provider is rewritten, and stops applying the moment
 * the same action starts going somewhere else — which is exactly what
 * "re-asked when the destination changes" has to mean. Recording it against
 * a provider id would have survived a change of recipient, which is the one
 * failure mode a consent record must not have.
 *
 * `device` is not a destination anybody consents to: nothing leaves, so
 * there is nothing to agree to. {@link consentSubjectOf} returns `null` for
 * it, and a `null` subject means the action runs with no question asked.
 */

export type AiConsentDestination = Exclude<AiDisclosure['destination'], 'device'>

/** Who the data goes to. Two stable ids, never display strings. */
export interface AiConsentSubject {
  readonly destination: AiConsentDestination
  readonly vendor: string
}

export interface AiConsent extends AiConsentSubject {
  readonly grantedAt: number
}

const STORAGE_BASE = 'lattice-ai-consent'

const storageKey = () => vaultKey(STORAGE_BASE)

const idOf = (subject: AiConsentSubject) => `${subject.destination}:${subject.vendor}`

function read(): AiConsent[] {
  try {
    const raw = localStorage.getItem(storageKey())
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isConsent)
  } catch {
    // an unreadable record is not a grant: the safe answer is "never asked"
    return []
  }
}

function isConsent(value: unknown): value is AiConsent {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    (record.destination === 'deployment' || record.destination === 'third-party') &&
    typeof record.vendor === 'string' &&
    record.vendor.length > 0 &&
    typeof record.grantedAt === 'number'
  )
}

function write(records: readonly AiConsent[]): void {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(records))
  } catch {
    /* storage blocked — the grant holds for this page load and no longer */
  }
}

/**
 * What this provider needs consent for, or `null` when nothing leaves.
 *
 * A provider whose disclosure names a destination but no vendor is a
 * provider that has not said who receives the data. That is treated as a
 * distinct recipient called `unnamed` rather than as "no consent needed":
 * the failure of a provider to identify itself must not become a licence to
 * skip the question.
 */
export function consentSubjectOf(provider: AiBackendProvider): AiConsentSubject | null {
  const { destination, vendor } = provider.disclosure
  if (destination === 'device') return null
  return { destination, vendor: vendor ?? 'unnamed' }
}

/** The grant on record for this recipient, if any. */
export function consentFor(subject: AiConsentSubject): AiConsent | null {
  return read().find((record) => idOf(record) === idOf(subject)) ?? null
}

export function hasConsent(subject: AiConsentSubject | null): boolean {
  return subject === null || consentFor(subject) !== null
}

/** Record the user's yes. Re-granting refreshes the timestamp, never duplicates. */
export function grantConsent(subject: AiConsentSubject): AiConsent {
  const record: AiConsent = { ...subject, grantedAt: Date.now() }
  write([...read().filter((r) => idOf(r) !== idOf(subject)), record])
  return record
}

/** Take it back. The next run asks again. */
export function revokeConsent(subject: AiConsentSubject): void {
  write(read().filter((record) => idOf(record) !== idOf(subject)))
}

/** Everything granted in this account's vault, newest first. */
export function consentHistory(): AiConsent[] {
  return read().sort((a, b) => b.grantedAt - a.grantedAt)
}

export function clearConsentHistory(): void {
  try {
    localStorage.removeItem(storageKey())
  } catch {
    /* nothing to do: an unwritable store had nothing in it either */
  }
}

/**
 * Whether running this action through this provider needs a yes first.
 *
 * Asked before the action is offered, not after it fails, which is the
 * whole difference between a disclosure and an error message.
 */
export function needsConsent(provider: AiBackendProvider): boolean {
  const subject = consentSubjectOf(provider)
  return subject !== null && !hasConsent(subject)
}
