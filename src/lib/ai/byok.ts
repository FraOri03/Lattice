import { vaultKey } from '@/lib/storage/vaultScope'
import type { AiActionId } from './actions.js'

/**
 * Bring your own key — one place, for every vendor the user pays directly.
 *
 * Photo mode already did this correctly for one vendor: a key stored per
 * account through `vaultKey`, sent only to Google, with an offline fallback
 * when there is none. That behaviour is the thing worth keeping; the
 * *implementation* being welded to one provider file is the thing that must
 * not be repeated a second time, once per feature. So the storage, the
 * registry and the rules move here, and `GeminiSetDesignProvider` becomes
 * the first entry in a table rather than the only code that knows how a key
 * is kept.
 *
 * ## The four rules, and where each is enforced
 *
 *  - **Per account.** Every name goes through `vaultKey`, so the key lives
 *    in the signed-in account's slot. Another account on the same browser
 *    resolves a different slot and reads nothing (`vaultScope`, #257).
 *  - **Never synced.** The vault's `localStorage` is not what the Drive
 *    engine uploads — it moves documents, sheets, code and assets — so a
 *    key kept here has no path to Drive at all. It is a *local* credential
 *    by construction rather than by a filter somebody has to maintain.
 *  - **Only to its vendor.** {@link ByokProviderMeta.vendor} names who
 *    receives it, and the provider that reads the key is the only code that
 *    sends it anywhere. No Lattice endpoint ever sees one.
 *  - **Removable.** {@link clearByokKey} at any time; "forget this device"
 *    takes it with the rest of the slot, because the name is namespaced and
 *    that sweep matches by slot.
 *
 * ## What it deliberately does NOT do
 *
 * It does not clear on sign-out. The GitHub token does not either, and for
 * the same reason: the key belongs to the account, not to the session, and
 * a sign-out that destroyed it would charge the user a re-paste every time
 * they signed out on their own machine. Sign-out makes it *unreachable*,
 * which is the property that matters; deleting it is a button, and the
 * settings panel has one.
 */

export type ByokProviderId = 'gemini'

export interface ByokProviderMeta {
  readonly id: ByokProviderId
  /** Who receives the key and the prompt. Shown to the user, verbatim. */
  readonly vendor: string
  /**
   * The stable id the provider's `disclosure.vendor` carries, and therefore
   * the id a consent record is filed against. Kept here so the settings
   * panel can put a grant, a key and a vendor name in the same row without
   * a second table mapping one to the other.
   */
  readonly vendorId: string
  /** The model the key is spent against, so the user can price it themselves. */
  readonly model: string
  /** Where a key is obtained. Rendered as a link, never fetched. */
  readonly keysUrl: string
  /** The catalogue actions this key unlocks. */
  readonly actions: readonly AiActionId[]
  /**
   * The storage name, before namespacing.
   *
   * Gemini keeps the name Photo mode wrote, and that is not nostalgia: a
   * rename here would silently log out every user who already pasted a key,
   * with no error and no way to tell what happened.
   */
  readonly storageBase: string
}

export const BYOK_PROVIDERS: Readonly<Record<ByokProviderId, ByokProviderMeta>> = {
  gemini: {
    id: 'gemini',
    vendor: 'Google',
    vendorId: 'google-gemini',
    model: 'Gemini',
    keysUrl: 'https://aistudio.google.com/app/apikey',
    actions: ['design-set'],
    storageBase: 'lattice-photo-gemini-key',
  },
}

export const BYOK_PROVIDER_IDS = Object.keys(BYOK_PROVIDERS) as ByokProviderId[]

/** The namespaced storage name for this provider's key, in this account's slot. */
export function byokStorageKey(id: ByokProviderId): string {
  return vaultKey(BYOK_PROVIDERS[id].storageBase)
}

export function byokKey(id: ByokProviderId): string {
  try {
    return localStorage.getItem(byokStorageKey(id)) ?? ''
  } catch {
    // storage blocked (private mode, a hardened profile): no key, which is
    // an honest answer the surface already has a state for
    return ''
  }
}

export function hasByokKey(id: ByokProviderId): boolean {
  return byokKey(id).length > 0
}

/** Store a key, or remove it when the value is empty. */
export function setByokKey(id: ByokProviderId, key: string): void {
  const trimmed = key.trim()
  try {
    if (trimmed) localStorage.setItem(byokStorageKey(id), trimmed)
    else localStorage.removeItem(byokStorageKey(id))
  } catch {
    /* storage unavailable — the key just will not persist past this load */
  }
}

export function clearByokKey(id: ByokProviderId): void {
  setByokKey(id, '')
}

/** Every provider the user currently holds a key for. */
export function configuredByokProviders(): ByokProviderMeta[] {
  return BYOK_PROVIDER_IDS.filter(hasByokKey).map((id) => BYOK_PROVIDERS[id])
}

/** Whether any vendor is reachable on a key of the user's own. */
export function hasAnyByokKey(): boolean {
  return BYOK_PROVIDER_IDS.some(hasByokKey)
}

/** The vendor behind a consent record's id, when it is one we hold a key for. */
export function byokProviderByVendorId(vendorId: string): ByokProviderMeta | null {
  return BYOK_PROVIDER_IDS.map((id) => BYOK_PROVIDERS[id]).find((m) => m.vendorId === vendorId) ?? null
}

/** How a vendor is named on screen: the company, then the model. */
export function byokVendorLabel(meta: ByokProviderMeta): string {
  return `${meta.vendor} ${meta.model}`
}

/** The providers whose key would unlock this action. */
export function byokProvidersFor(action: AiActionId): ByokProviderMeta[] {
  return BYOK_PROVIDER_IDS.map((id) => BYOK_PROVIDERS[id]).filter((meta) =>
    meta.actions.includes(action),
  )
}

/**
 * Drop every stored key.
 *
 * Not called on sign-out (see the header); it is what the settings panel's
 * remove-all does, and what a test uses to get back to a known state.
 */
export function clearAllByokKeys(): void {
  for (const id of BYOK_PROVIDER_IDS) clearByokKey(id)
}
