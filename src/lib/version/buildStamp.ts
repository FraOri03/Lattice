/**
 * The version the app *displays* is composed at build time, not by hand:
 * `<major>.<minor>.<build>`, where the build number ticks up on its own so
 * every production deploy shows a version that is visibly newer than the
 * one before it.
 *
 * The build number is **minutes elapsed since the epoch below, UTC**.
 * Why time and not a git commit count, which would read more naturally:
 * hosting providers clone shallowly, so `git rev-list --count` answers a
 * small number that depends on the clone depth rather than the history.
 * A count that silently stops growing — or goes backwards — is worse than
 * an opaque number that cannot, and this one only needs to be monotonic
 * and different per deploy.
 *
 * `major.minor` still come from `package.json`, so the semantic part of
 * the version stays a human decision; only the tail is automatic.
 */

/**
 * Hand-pinned display version. When it is a non-empty string it is what the
 * app shows, verbatim, everywhere — the automatic `major.minor.<build>`
 * stamping below applies only while this is `''`.
 *
 * A pin is the only way to show a version this repo can name (`package.json`
 * has to stay valid semver, and `.env` is git-ignored so `VITE_APP_VERSION`
 * cannot be committed). What a pin costs is the "every deploy looks newer"
 * property: two deploys of the same pin are indistinguishable by version.
 * The short commit sha next to the version in the account menu still tells
 * them apart, which is what that field is for.
 */
export const PINNED_VERSION = '0.11.3.5'

/** 2025-01-01T00:00:00Z — chosen so the number stays six digits for years. */
export const BUILD_EPOCH_MS = Date.UTC(2025, 0, 1)

/** Minutes since the epoch. Monotonic by construction, one tick a minute. */
export function buildNumber(now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - BUILD_EPOCH_MS) / 60_000))
}

/**
 * `0.8.0` + a build number → `0.8.833760`.
 *
 * The declared patch is dropped rather than appended: a four-part version
 * is not semver, and the patch in `package.json` has never been the thing
 * that changes per deploy. A version string that cannot be read as
 * `major.minor.something-that-grows` is returned untouched, so a
 * hand-pinned `VITE_APP_VERSION` is never mangled.
 */
export function composeVersion(declared: string, build: number): string {
  const match = /^(\d+)\.(\d+)(?:\.|$)/.exec(declared.trim())
  if (!match) return declared
  return `${match[1]}.${match[2]}.${build}`
}

/** Short commit sha for traceability, from whichever CI is building. */
export function commitRef(env: Record<string, string | undefined>): string {
  const sha =
    env.VERCEL_GIT_COMMIT_SHA ?? env.GITHUB_SHA ?? env.COMMIT_REF ?? env.CF_PAGES_COMMIT_SHA
  return sha ? sha.slice(0, 7) : 'local'
}
