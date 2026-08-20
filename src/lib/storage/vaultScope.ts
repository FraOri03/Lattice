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
 *    unsuffixed keys. Those are {@link LEGACY_SLOT}, and the first scope
 *    entitled to them claims them — so the person already using Lattice
 *    keeps every byte exactly where it is, with no migration to run, no copy
 *    of a multi-gigabyte IndexedDB, and nothing to lose if the copy had
 *    failed halfway.
 *  - **work done before signing in is not thrown away.** "Continue without
 *    an account" writes to the guest slot. When that browser then signs in
 *    for the first time, {@link adoptGuestVault} re-points the map instead
 *    of moving anything: the same bytes, now owned by the account.
 *
 * ## Opaque, because a derived name collides (#257)
 *
 * The first version of this module derived the slot from the scope, so the
 * anonymous scope's slot was the literal string `guest` — and
 * {@link adoptGuestVault} then handed that same name to an account. Nothing
 * checked whether a name was already spoken for, so the second account on
 * any browser stored its vault in slot `guest`, and the next anonymous page
 * load derived `guest` again and read it. Signing out showed the departing
 * account's projects, and the account after that adopted the whole vault —
 * GitHub token and Gemini key included.
 *
 * Slots are therefore minted, not derived: {@link mintSlot} draws a name
 * nothing else holds, and {@link repairMap} evicts the anonymous scope from
 * a slot the buggy build already shared with an account.
 *
 * The scope is resolved ONCE per page load and cached, because the storage
 * names are read once too — `persist({ name })` captures it when the module
 * is imported. Changing accounts therefore means reloading; `AccountProvider`
 * is where that happens, and says why.
 */

const ACCOUNT_KEY = 'lattice-account'
const MAP_KEY = 'lattice-vaults'
/**
 * "Continue without an account" was chosen on this browser, and never
 * revoked by a sign-in. Read here — not just by the auth layer that writes
 * it — because it is the only surviving evidence of what the unsuffixed keys
 * are: see {@link mayClaimLegacy}.
 */
const SKIP_KEY = 'lattice-login-skipped'
/** Identity records, written the first time anybody signs in on this browser. */
const IDENTITY_KEY = 'lattice-identity'

/** The scope of a browser nobody is signed into. */
export const GUEST_SCOPE = 'guest'

/**
 * The unsuffixed keys — what every build before namespacing wrote to.
 *
 * Not a value to be tidied away: it is claimed by the first scope entitled
 * to it, which is what makes this change a no-op for data that already
 * exists.
 */
const LEGACY_SLOT = ''

/**
 * Keys that are deliberately NOT namespaced, and stay put across accounts.
 *
 * Each is here for a reason, not by omission:
 *
 *  - `lattice-account` and `lattice-vaults` are what the namespace is
 *    resolved FROM; suffixing them would be circular.
 *  - `lattice-identity` maps a provider subject to the user id it resolved
 *    to. Scoping it would mint a new id for the same person every time they
 *    signed in, orphaning the vault they signed in to reach.
 *  - `lattice-login-skipped` is about the browser, not about an account: it
 *    exists precisely when there is no account to scope it to.
 *  - `lattice-workspace-layout` and `lattice-call-ui` are per-device
 *    ergonomics — which panels you keep shut, where the call window sits.
 *    They hold no project data and no identity, and how wide this screen is
 *    does not change when somebody else signs in on it.
 *
 * Exported because "forget this device" needs to know what a slot does NOT
 * own before it deletes by pattern.
 */
export const UNSCOPED_KEYS: readonly string[] = [
  ACCOUNT_KEY,
  MAP_KEY,
  IDENTITY_KEY,
  SKIP_KEY,
  'lattice-workspace-layout',
  'lattice-call-ui',
]

/** Separator between a base storage name and its slot. */
const SLOT_SEPARATOR = '::'

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
 * Undo the collision the derived-name build left in storage (#257).
 *
 * A map written by that build can already read
 * `{alice: '', bob: 'guest', guest: 'guest'}` — Bob and the anonymous scope
 * pointing at one pile of bytes. Minting cannot help a map that is already
 * wrong, so the entry is dropped and the anonymous scope re-claims a slot of
 * its own on the next line.
 *
 * Only the guest entry is ever dropped. Dropping an account's would orphan a
 * real vault, which is a worse bug than the one being repaired — so two
 * accounts sharing a slot (which minting makes impossible, and deriving
 * never produced) is left alone rather than resolved by guesswork.
 *
 * @returns whether anything changed.
 */
function repairMap(map: VaultMap): boolean {
  const guestSlot = map[GUEST_SCOPE]
  if (guestSlot === undefined) return false
  const sharedWithAnAccount = Object.entries(map).some(
    ([scope, slot]) => scope !== GUEST_SCOPE && slot === guestSlot,
  )
  if (!sharedWithAnAccount) return false
  delete map[GUEST_SCOPE]
  return true
}

/**
 * May this scope have the unsuffixed keys?
 *
 * Whoever wrote them was signed in, unless the browser has never had anybody
 * signed in at all — so a signed-in scope may take them, and the anonymous
 * scope may only when both surviving traces agree that no account was ever
 * here: "continue without an account" is still in force, and no identity has
 * ever been resolved.
 *
 * Without this the leak had a second door (#257): the first page load after
 * the namespacing build, on a browser whose owner had signed out before
 * updating, resolves to the anonymous scope — and it took the whole vault.
 */
function mayClaimLegacy(scope: string): boolean {
  if (scope !== GUEST_SCOPE) return true
  try {
    if (localStorage.getItem(SKIP_KEY) !== '1') return false
    const identities = localStorage.getItem(IDENTITY_KEY)
    if (!identities) return true
    const users = (JSON.parse(identities) as { users?: unknown[] }).users
    return !Array.isArray(users) || users.length === 0
  } catch {
    // unreadable evidence is not evidence: the empty vault is the safe answer
    return false
  }
}

/** A slot name nothing in `taken` holds. Opaque, so it can never be derived. */
function mintSlot(taken: ReadonlySet<string>): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    const slot = `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
    if (!taken.has(slot)) return slot
  }
  // 100 collisions against a random 40-bit suffix does not happen; a name
  // that cannot collide does, and an unusable vault is worse than a long one
  let slot = `v${Date.now().toString(36)}`
  while (taken.has(slot)) slot += 'x'
  return slot
}

/**
 * The slot this scope owns, creating one if it has none.
 *
 * The unsuffixed keys go to the first scope entitled to them — on an existing
 * install that is the account already signed in, which is precisely the data
 * they should keep. Every later scope gets a namespace of its own and
 * therefore an empty vault, which is the whole point.
 */
function claimSlot(scope: string): string {
  const map = readMap()
  const repaired = repairMap(map)
  const existing = map[scope]
  if (typeof existing === 'string') {
    if (repaired) writeMap(map)
    return existing
  }
  const taken = new Set(Object.values(map))
  const slot =
    !taken.has(LEGACY_SLOT) && mayClaimLegacy(scope) ? LEGACY_SLOT : mintSlot(taken)
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

/** The slot {@link vaultKey} is suffixing with — for "forget this device". */
export function bootSlot(): string {
  return current().slot
}

/** Namespace a storage name (localStorage key, IndexedDB database) for this scope. */
export function vaultKey(base: string): string {
  const { slot } = current()
  return slot ? `${base}${SLOT_SEPARATOR}${slot}` : base
}

/**
 * Does this storage name belong to `slot`?
 *
 * The legacy slot has no suffix, so it cannot be recognised by one: its keys
 * are every `lattice-` name that carries no slot at all and is not one of the
 * {@link UNSCOPED_KEYS} that live outside the namespace on purpose.
 */
export function keyBelongsToSlot(name: string, slot: string): boolean {
  if (slot) return name.endsWith(`${SLOT_SEPARATOR}${slot}`)
  return (
    name.startsWith('lattice-') &&
    !name.includes(SLOT_SEPARATOR) &&
    !UNSCOPED_KEYS.includes(name)
  )
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
 * The slot the account walks away with is opaque, so the anonymous scope
 * cannot derive its way back into it — which is exactly what it used to do
 * the next time somebody signed out (#257).
 *
 * @returns whether the guest vault changed hands.
 */
export function adoptGuestVault(accountId: string): boolean {
  if (!accountId || accountId === GUEST_SCOPE) return false
  const map = readMap()
  repairMap(map)
  if (map[accountId] !== undefined) return false
  const guestSlot = map[GUEST_SCOPE]
  if (guestSlot === undefined) return false
  delete map[GUEST_SCOPE]
  map[accountId] = guestSlot
  writeMap(map)
  return true
}

/**
 * Give up this scope's claim on its slot, so nothing points at those bytes.
 *
 * Called by "forget this device" AFTER the bytes are gone: a map entry
 * pointing at a deleted vault would hand the same empty slot back on the
 * next load, and — for the legacy slot — hand it to somebody else.
 */
export function releaseSlot(scope: string): void {
  const map = readMap()
  if (map[scope] === undefined) return
  delete map[scope]
  writeMap(map)
}

/** Drop the cached resolution — tests only; a real switch reloads the page. */
export function resetVaultScopeForTests(): void {
  resolved = null
}
