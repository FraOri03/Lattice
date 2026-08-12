/**
 * The dashboard's destinations (settled in 13.1, built in 15.1).
 *
 * One flat, ordered list: the lateral navigation renders it, the URL addresses
 * it (`?d=<destination>`) and `resolveNav` validates against it — so refreshing
 * on Trash keeps you on Trash, and Back walks the destinations instead of
 * skipping them.
 *
 * **Home is the absence of the token.** It is a destination like the others in
 * the navigation, but it serializes to the bare root URL, which is what keeps
 * every link written before this phase resolving to the same place.
 *
 * There is no `projects` destination: 13.1 settled that Home *is* the project
 * index, and a separate "All projects" page would be Home with the greeting
 * removed.
 *
 * Pure on purpose — no React, no store — so ordering and validation can be
 * asserted without a DOM, the way `lib/settings/sections` and `lib/nav/navUrl`
 * are.
 */

export type Destination = 'home' | 'recents' | 'starred' | 'shared' | 'invites' | 'trash'

/** Render order of the lateral navigation. The first entry is the default. */
export const DESTINATIONS = [
  'home',
  'recents',
  'starred',
  'shared',
  'invites',
  'trash',
] as const satisfies readonly Destination[]

/** Where the dashboard opens when the URL asks for nothing more specific. */
export const DEFAULT_DESTINATION: Destination = DESTINATIONS[0]

/**
 * The destinations that carry a `?d=` token — every one except Home, which is
 * the param-less URL. Typed as its own thing so `serializeNav` cannot be
 * written in a way that emits `?d=home`.
 */
export type DestinationToken = Exclude<Destination, 'home'>

export function isDestination(x: string | undefined | null): x is Destination {
  return !!x && (DESTINATIONS as readonly string[]).includes(x)
}

/**
 * The destination a link resolves to. An unknown value lands on Home rather
 * than refusing to open the dashboard — the same degradation the rest of the
 * URL contract follows (an unknown project becomes Home, an unknown mode
 * becomes `board`). `d=home` is accepted on the way in, because a hand-written
 * link should not break; it simply never comes back out (see `destinationToken`).
 */
export function resolveDestination(raw: string | undefined | null): Destination {
  return isDestination(raw) ? raw : DEFAULT_DESTINATION
}

/** The token to serialize, or nothing at all when the destination is Home. */
export function destinationToken(d: Destination): DestinationToken | undefined {
  return d === 'home' ? undefined : d
}
