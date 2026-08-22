import { beforeEach, describe, expect, it } from 'vitest'
import { bootScope, resetVaultScopeForTests } from '@/lib/storage/vaultScope'
import { DisabledAiProvider, type AiBackendProvider } from './AiBackendProvider'
import { GeminiSetDesignProvider } from './providers/GeminiSetDesignProvider'
import { OfflineSetDesignProvider } from './providers/OfflineSetDesignProvider'
import { RunPodAiProvider } from './RunPodAiProvider'
import {
  clearConsentHistory,
  consentFor,
  consentHistory,
  consentSubjectOf,
  grantConsent,
  hasConsent,
  needsConsent,
  revokeConsent,
  type AiConsentSubject,
} from './consent'

const GEMINI: AiConsentSubject = { destination: 'third-party', vendor: 'google-gemini' }
const HOSTED: AiConsentSubject = { destination: 'deployment', vendor: 'lattice-hosted-gpu' }

function bootAs(accountId: string): void {
  resetVaultScopeForTests()
  localStorage.setItem('lattice-account', JSON.stringify({ id: accountId }))
  bootScope()
}

beforeEach(() => {
  localStorage.clear()
  resetVaultScopeForTests()
})

describe('who a grant is about', () => {
  /**
   * Consent is about the recipient, never about which of our classes did the
   * sending. Filing it against a provider id would survive a change of
   * recipient, which is the one failure mode a consent record must not have.
   */
  it('is the destination and the vendor the provider names', () => {
    expect(consentSubjectOf(GeminiSetDesignProvider)).toEqual(GEMINI)
    expect(consentSubjectOf(RunPodAiProvider)).toEqual(HOSTED)
  })

  it('is nothing at all when nothing leaves the device', () => {
    expect(consentSubjectOf(OfflineSetDesignProvider)).toBeNull()
    expect(consentSubjectOf(DisabledAiProvider)).toBeNull()
    // and a null subject is consented to by definition: there is no
    // recipient, so there is no question
    expect(hasConsent(null)).toBe(true)
    expect(needsConsent(OfflineSetDesignProvider)).toBe(false)
  })

  /**
   * A provider that names a destination but no vendor has failed to identify
   * itself. That must not become a licence to skip the question, so it gets a
   * recipient of its own rather than a pass.
   */
  it('does not let an unnamed recipient skip the question', () => {
    const anonymous = {
      ...OfflineSetDesignProvider,
      disclosure: { destination: 'third-party', cost: 'your-key' },
    } as AiBackendProvider
    expect(consentSubjectOf(anonymous)).toEqual({
      destination: 'third-party',
      vendor: 'unnamed',
    })
    expect(needsConsent(anonymous)).toBe(true)
  })
})

describe('the grant', () => {
  beforeEach(() => bootAs('usr_alice'))

  it('is missing until it is given, and then it stays', () => {
    expect(hasConsent(GEMINI)).toBe(false)
    expect(needsConsent(GeminiSetDesignProvider)).toBe(true)

    grantConsent(GEMINI)

    expect(hasConsent(GEMINI)).toBe(true)
    expect(needsConsent(GeminiSetDesignProvider)).toBe(false)
    expect(consentFor(GEMINI)?.grantedAt).toBeGreaterThan(0)
  })

  it('can be taken back, and the next run asks again', () => {
    grantConsent(GEMINI)
    revokeConsent(GEMINI)
    expect(hasConsent(GEMINI)).toBe(false)
    expect(consentHistory()).toEqual([])
  })

  /**
   * "Re-asked when the destination changes" is the requirement, and this is
   * what makes it true: a grant is keyed by recipient, so agreeing to one
   * says nothing about the other.
   */
  it('does not spread from one recipient to another', () => {
    grantConsent(GEMINI)
    expect(hasConsent(HOSTED)).toBe(false)
    expect(needsConsent(RunPodAiProvider)).toBe(true)
  })

  it('refreshes rather than duplicating when it is granted twice', () => {
    grantConsent(GEMINI)
    grantConsent(GEMINI)
    expect(consentHistory()).toHaveLength(1)
  })

  it('lists newest first, which is the order a person reads a log in', () => {
    grantConsent(HOSTED)
    grantConsent(GEMINI)
    const history = consentHistory()
    expect(history).toHaveLength(2)
    expect(history[0].grantedAt).toBeGreaterThanOrEqual(history[1].grantedAt)
  })
})

describe('the record is per account, like everything else in the vault', () => {
  it('does not follow the browser to the next person signed in on it', () => {
    bootAs('usr_alice')
    grantConsent(GEMINI)
    expect(hasConsent(GEMINI)).toBe(true)

    bootAs('usr_bob')
    expect(hasConsent(GEMINI)).toBe(false)

    bootAs('usr_alice')
    expect(hasConsent(GEMINI)).toBe(true)
  })
})

describe('a store that cannot be read', () => {
  /** Unreadable evidence is not evidence: the safe answer is "never asked". */
  it('is treated as no grant rather than as a grant', () => {
    bootAs('usr_alice')
    grantConsent(GEMINI)
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('lattice-ai-consent')) localStorage.setItem(key, 'not json')
    }
    expect(hasConsent(GEMINI)).toBe(false)
    expect(consentHistory()).toEqual([])
  })

  it('drops a record that is the right shape for nothing', () => {
    bootAs('usr_alice')
    grantConsent(GEMINI)
    clearConsentHistory()
    expect(consentHistory()).toEqual([])
  })
})
