import { databaseClient } from './client.js'
import type { Repositories } from './repositories.js'
import { SupabaseRepositories } from './supabase.js'

/**
 * How an endpoint gets at the database (Phase 17.1, #84).
 *
 * ```ts
 * const db = repositories()
 * if (!db) { sendError(res, 501, NO_DATABASE); return }
 * ```
 *
 * The null branch is the same shape `liveblocksClient()` already has, and
 * it exists for the same reason: Lattice is local-first, so a deployment
 * with no Supabase project must keep working rather than crash. An
 * endpoint that genuinely needs a database answers 501 and says so.
 */

export type { Repositories } from './repositories.js'
export type {
  EntitlementRepository,
  IdentityRepository,
  InvitationRepository,
  MembershipRepository,
} from './repositories.js'
export { MemoryRepositories, MemoryDatabase } from './memory.js'
export { SupabaseRepositories } from './supabase.js'
export { databaseClient, databaseEnv, resetDatabaseClient } from './client.js'

let cached: Repositories | null = null

/** The repositories for this deployment, or null when it has no database. */
export function repositories(): Repositories | null {
  if (cached) return cached
  const client = databaseClient()
  if (!client) return null
  cached = new SupabaseRepositories(client)
  return cached
}

/** Forget the memoised repositories — tests only. */
export function resetRepositories(): void {
  cached = null
}

/** What an endpoint says when it needs a database and there is none. */
export const NO_DATABASE =
  'No database is configured on the server (SUPABASE_URL and a Supabase secret key are missing).'
