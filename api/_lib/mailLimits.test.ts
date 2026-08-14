import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRepositories } from './db/memory.js'
import { limitMessage, mailAllowance, recordSend } from './mailLimits.js'
import {
  MAIL_MAX_PER_PROJECT,
  MAIL_MAX_PER_RECIPIENT,
  MAIL_WINDOW_MS,
} from '../../src/types/mail.js'

/**
 * The ceilings 18.2 puts on mail, and the reason they count messages rather
 * than invitations: an invitation resent fifty times is one row in
 * `project_invitations` and fifty e-mails, and only the second number is a
 * problem for whoever receives them.
 */

const db = new MemoryRepositories()
const NOW = Date.UTC(2026, 7, 14, 12, 0, 0)

async function sent(count: number, recipient: string, scope: string, at = NOW) {
  for (let i = 0; i < count; i += 1) {
    await recordSend(db.mailSends, 'invitation', recipient, scope, at)
  }
}

beforeEach(() => {
  db.clear()
})

describe('per recipient', () => {
  it('allows a first message', async () => {
    expect(await mailAllowance(db.mailSends, 'grace@example.com', 'p1', NOW)).toEqual({
      allowed: true,
    })
  })

  it('refuses once the address has had its hour’s worth', async () => {
    await sent(MAIL_MAX_PER_RECIPIENT, 'grace@example.com', 'p1')
    const decision = await mailAllowance(db.mailSends, 'grace@example.com', 'p1', NOW)
    expect(decision).toEqual({ allowed: false, reason: 'recipient' })
  })

  it('counts across projects, which is the whole point of it', async () => {
    // each project stays well under its own ceiling; together they would
    // still bury one mailbox
    for (let i = 0; i < MAIL_MAX_PER_RECIPIENT; i += 1) {
      await sent(1, 'grace@example.com', `p${i}`)
    }
    const decision = await mailAllowance(db.mailSends, 'grace@example.com', 'p99', NOW)
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe('recipient')
  })

  it('ignores case, or the limit has a bypass anyone can type', async () => {
    await sent(MAIL_MAX_PER_RECIPIENT, 'grace@example.com', 'p1')
    const decision = await mailAllowance(db.mailSends, 'GRACE@Example.com', 'p1', NOW)
    expect(decision.allowed).toBe(false)
  })

  it('forgets what fell out of the window', async () => {
    await sent(MAIL_MAX_PER_RECIPIENT, 'grace@example.com', 'p1', NOW - MAIL_WINDOW_MS - 1)
    expect(await mailAllowance(db.mailSends, 'grace@example.com', 'p1', NOW)).toEqual({
      allowed: true,
    })
  })
})

describe('per project', () => {
  it('refuses a project that has sent its hour’s worth, to whoever', async () => {
    for (let i = 0; i < MAIL_MAX_PER_PROJECT; i += 1) {
      await sent(1, `person${i}@example.com`, 'p1')
    }
    const decision = await mailAllowance(db.mailSends, 'fresh@example.com', 'p1', NOW)
    expect(decision).toEqual({ allowed: false, reason: 'project' })
  })

  it('leaves other projects alone', async () => {
    for (let i = 0; i < MAIL_MAX_PER_PROJECT; i += 1) {
      await sent(1, `person${i}@example.com`, 'p1')
    }
    expect(await mailAllowance(db.mailSends, 'fresh@example.com', 'p2', NOW)).toEqual({
      allowed: true,
    })
  })

  it('reports the recipient ceiling first when both are hit', async () => {
    for (let i = 0; i < MAIL_MAX_PER_PROJECT; i += 1) {
      await sent(1, `person${i}@example.com`, 'p1')
    }
    await sent(MAIL_MAX_PER_RECIPIENT, 'grace@example.com', 'p1')
    // the stricter, more specific answer is the more useful one to show
    expect((await mailAllowance(db.mailSends, 'grace@example.com', 'p1', NOW)).reason).toBe(
      'recipient',
    )
  })
})

describe('recordSend', () => {
  it('stores the address lowercased', async () => {
    await recordSend(db.mailSends, 'invitation', 'GRACE@Example.com', 'p1', NOW)
    expect(await db.mailSends.countForRecipient('grace@example.com', 0)).toBe(1)
  })

  it('records a message with no project without counting it against one', async () => {
    await recordSend(db.mailSends, 'sign-in-code', 'ada@example.com', '', NOW)
    expect(await db.mailSends.countForRecipient('ada@example.com', 0)).toBe(1)
    expect(await db.mailSends.countForScope('', 0)).toBe(0)
  })
})

describe('limitMessage', () => {
  it('says which ceiling refused, because the two need different actions', () => {
    expect(limitMessage('project')).toContain('This project')
    expect(limitMessage('recipient')).toContain('This address')
  })
})
