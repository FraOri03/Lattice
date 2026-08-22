import { useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { BYOK_PROVIDERS, BYOK_PROVIDER_IDS } from '@/lib/ai/byok'
import { consentHistory } from '@/lib/ai/consent'
import { AiConsentRow, ByokField } from './parts'

/**
 * The AI row's second half, in the connected-apps panel.
 *
 * The row above it answers what this DEPLOYMENT talks to. This answers what
 * the USER has connected for themselves — the keys they pasted and the
 * recipients they agreed to — and those are genuinely different questions,
 * which is why the row has four states and this block exists at all.
 *
 * Lazily loaded from `panels.tsx`. The settings screen is mounted on every
 * page load, and the connections panel does not need the AI seam's strings,
 * cost tables and job model in order to render five other rows.
 */
export default function AiConnectionDetails() {
  const t = useI18n()
  const [revision, bump] = useState(0)
  const grants = consentHistory()
  void revision

  return (
    <div className="mt-2 space-y-3 rounded-md border border-bord bg-panel2/40 p-2.5">
      <div className="space-y-3">
        <h4 className="text-[10px] font-semibold tracking-widest text-muted uppercase">
          {t.ai.keysTitle}
        </h4>
        {BYOK_PROVIDER_IDS.map((id) => (
          <ByokField key={id} provider={BYOK_PROVIDERS[id]} onChange={() => bump((n) => n + 1)} />
        ))}
      </div>

      <div>
        <h4 className="mb-1 text-[10px] font-semibold tracking-widest text-muted uppercase">
          {t.ai.consentTitleList}
        </h4>
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
      </div>
    </div>
  )
}
