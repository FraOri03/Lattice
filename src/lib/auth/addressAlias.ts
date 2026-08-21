/**
 * addressAlias — the label an address wears on screen.
 *
 * An operator's personal mailbox is a poor thing to put in front of the
 * people they share a project with: it is the address they sign in with,
 * not the name they trade under. This module lets a deployment say
 * "wherever you would print `owner@gmail.com`, print `admin@lattice.apps`"
 * without changing a single thing about who that person is.
 *
 * ## Display only, and nothing else
 *
 * An alias is a **label**. The ACL, the invitations, the Liveblocks
 * session key, the bindings in `acl.ts` and every address on the wire keep
 * the real value — the server has never heard of the alias and must not,
 * because identity is exactly what an alias is not. The one place the
 * mapping runs backwards is {@link realAddress}, used where a human may
 * have copied the label out of the UI and typed it back in.
 *
 * ## Configured, not committed
 *
 * The pairs come from `VITE_ADDRESS_ALIASES`, not from a constant here.
 * Writing the address into the source of a repository would publish the
 * very thing the alias exists to keep off the screen, and a build-time
 * variable also means the mapping belongs to the DEPLOYMENT: everyone
 * looking at the same build reads the same label, which a per-device
 * preference could never guarantee.
 *
 *   VITE_ADDRESS_ALIASES="owner@gmail.com=admin@lattice.apps"
 *
 * Several pairs are separated by commas, semicolons or newlines. A
 * malformed pair is dropped rather than guessed at: a half-read alias
 * would show one surface the real address and another the label, which is
 * worse than showing the real address everywhere.
 */

const SOURCE = (import.meta.env.VITE_ADDRESS_ALIASES as string | undefined) ?? ''

function parse(source: string): { forward: Map<string, string>; back: Map<string, string> } {
  const forward = new Map<string, string>()
  const back = new Map<string, string>()
  for (const entry of source.split(/[,;\n]/)) {
    const at = entry.indexOf('=')
    if (at <= 0) continue
    const real = entry.slice(0, at).trim().toLowerCase()
    const alias = entry.slice(at + 1).trim()
    if (!real.includes('@') || !alias) continue
    forward.set(real, alias)
    back.set(alias.toLowerCase(), real)
  }
  return { forward, back }
}

const { forward, back } = parse(SOURCE)

/** Whether this build renames anything at all — lets callers skip the work. */
export const hasAddressAliases = forward.size > 0

/**
 * The address as it should appear on screen.
 *
 * Pass this the value you were about to render, never the value you were
 * about to send. It is a no-op for every address the deployment has not
 * renamed, which is all of them by default.
 */
export function displayAddress(email: string | undefined | null): string {
  if (!email) return ''
  return forward.get(email.trim().toLowerCase()) ?? email
}

/**
 * The real address behind a label, for input a human may have copied out
 * of the UI. Anything else comes back unchanged.
 */
export function realAddress(email: string | undefined | null): string {
  if (!email) return ''
  const clean = email.trim()
  return back.get(clean.toLowerCase()) ?? clean
}

/**
 * Rename every aliased address that occurs inside a free-text string.
 *
 * For sentences this app did not compose — the realtime endpoint's
 * "<address> is not a member of this project (server check)", a mail
 * provider's rejection — where the address is embedded in prose and
 * cannot be substituted at the point it was chosen.
 */
export function maskAddresses(text: string | undefined | null): string {
  if (!text) return ''
  if (!hasAddressAliases) return text
  let out = text
  for (const [real, alias] of forward) {
    // addresses are matched case-insensitively, as everywhere else here
    out = out.replace(new RegExp(escapeRegExp(real), 'gi'), alias)
  }
  return out
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
