/**
 * vaultScope — whose local vault this page load is looking at.
 *
 * Everything Lattice keeps on the machine (the vault in `localStorage`, the
 * document bodies and asset binaries in IndexedDB, the Drive push
 * bookkeeping, the collaboration records, the connected-service
 * credentials) used to live under fixed, per-ORIGIN keys. That is one vault
 * per browser, not one per account — so signing out and signing in with a
 * second Google account showed the first account's projects on the
 * dashboard, and worse: the sync engine then treated them as the new
 * account's own and pushed them to *their* Drive.
 *
 * The fix is a namespace. Every storage name goes through {@link vaultKey},
 * which suffixes it with the SLOT that belongs to the current scope — the
 * signed-in account id, or {@link GUEST_SCOPE} when nobody is signed in.
 *
 * ## Slots, and why they are not just the scope
 *
 * A slot is an opaque name for a pile of bytes; the map from scope to slot
 * is the only thing that says who owns it. That indirection buys two things
 * no amount of prefixing would:
 *
 *  - **the upgrade costs nothing.** The build before this one wrote to the
 *    unsuffixed keys. Those are {@link LEGACY_SLOT}, and the first scope to
 *    ask for a slot claims them — so the person already using Lattice keeps
 *    every byte exactly where it is, with no migration to run, no copy of a
 *    multi-gigabyte IndexedDB, and nothing to lose if the copy had failed
 *    halfway.
 *  - **work done before signing in is not thrown away.** "Continue without
 *    an account" writes to the guest slot. When that browser then signs in
 *    for the first time, {@link adoptGuestVault} re-points the map instead
 *    of moving anything: the same bytes, now owned by the account.
 *
 * The scope is resolved ONCE per page load and cached, because the storage
 * names are read once too — `persist({ name })` captures it when the module
 * is imported. Changing accounts therefore means reloading; `AccountProvider`
 * is where that happens, and says why.
 */

const ACCOUNT_KEY = 'lattice-account'
const MAP_KEY = 'lattice-vaults'

/** The scope of a browser nobody is signed into. */
export const GUEST_SCOPE = 'guest'

/**
 * The unsuffixed keys — what every build before namespacing wrote to.
 *
 * Not a value to be tidied away: it is claimed by the first scope that asks,
 * which is what makes this change a no-op for data that already exists.
 */
const LEGACY_SLOT = ''

/** scope (account id, or `guest`) → slot */
type VaultMap = Record<string, string>

function accountIdFromStorage(): string | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY)
    if (!raw) return null
    const id = (JSON.parse(raw) as { id?: string }).id
    return id || null
  } catch {
    return null
  }
}

function readMap(): VaultMap {
  try {
    const raw = localStorage.getItem(MAP_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const map: VaultMap = {}
    for (const [scope, slot] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof slot === 'string') map[scope] = slot
    }
    return map
  } catch {
    // a corrupt map must not lock anyone out: the claim below rebuilds it
    return {}
  }
}

function writeMap(map: VaultMap): void {
  try {
    localStorage.setItem(MAP_KEY, JSON.stringify(map))
  } catch {
    // storage blocked: the slot still holds for this page load, which is
    // as long as anything else here survives anyway
  }
}

/**
 * The slot this scope owns, creating one if it has none.
 *
 * The unsuffixed keys go to whoever asks first — on an existing install that
 * is the account already signed in, which is precisely the data they should
 * keep. Every later scope gets a namespace of its own and therefore an empty
 * vault, which is the whole point.
 */
function claimSlot(scope: string): string {
  const map = readMap()
  const existing = map[scope]
  if (typeof existing === 'string') return existing
  const legacyTaken = Object.values(map).includes(LEGACY_SLOT)
  const slot = legacyTaken ? scope : LEGACY_SLOT
  map[scope] = slot
  writeMap(map)
  return slot
}

let resolved: { scope: string; slot: string } | null = null

function current(): { scope: string; slot: string } {
  if (resolved) return resolved
  const scope = accountIdFromStorage() ?? GUEST_SCOPE
  resolved = { scope, slot: claimSlot(scope) }
  return resolved
}

/**
 * The scope this page load is reading and writing — the account id signed in
 * when the app booted, or {@link GUEST_SCOPE}.
 *
 * Deliberately NOT re-read after a sign-in: it is what the currently loaded
 * modules are keyed to, so comparing a fresh account id against it is exactly
 * the test for "this browser is now someone else".
 */
export function bootScope(): string {
  return current().scope
}

/** Namespace a storage name (localStorage key, IndexedDB database) for this scope. */
export function vaultKey(base: string): string {
  const { slot } = current()
  return slot ? `${base}::${slot}` : base
}

/**
 * Hand the guest vault to an account signing in for the first time here.
 *
 * Someone who chose "continue without an account", worked, and then signed
 * in did that work themselves — dropping it on the floor would be a second
 * bug wearing the first one's clothes. Re-pointing the map moves it without
 * touching a byte.
 *
 * Refused when the account already owns a slot on this machine: that vault
 * is their real one, and merging a stranger's guest session into it is the
 * leak this module exists to prevent.
 *
 * @returns whether the guest vault changed hands.
 */
export function adoptGuestVault(accountId: string): boolean {
  if (!accountId || accountId === GUEST_SCOPE) return false
  const map = readMap()
  if (map[accountId] !== undefined) return false
  const guestSlot = map[GUEST_SCOPE]
  if (guestSlot === undefined) return false
  delete map[GUEST_SCOPE]
  map[accountId] = guestSlot
  writeMap(map)
  return true
}

/** Drop the cached resolution — tests only; a real switch reloads the page. */
export function resetVaultScopeForTests(): void {
  resolved = null
}
