import { describe, expect, it } from 'vitest'
import type { NotificationType } from '@/types/collab'
import {
  DEFAULT_NOTIFICATION_PREFS,
  EVENT_TYPES,
  NOTIFICATION_EVENTS,
  allows,
  eventOf,
  withPref,
} from './notificationPrefs'

describe('the event catalogue', () => {
  it('maps every type to exactly one row', () => {
    const seen = new Map<NotificationType, number>()
    for (const event of NOTIFICATION_EVENTS) {
      for (const type of EVENT_TYPES[event]) {
        seen.set(type, (seen.get(type) ?? 0) + 1)
      }
    }
    for (const [type, count] of seen) expect([type, count]).toEqual([type, 1])
  })

  it('answers with the row a type belongs to', () => {
    expect(eventOf('mention')).toBe('mentions')
    expect(eventOf('drive-failure')).toBe('sync')
    expect(eventOf('realtime-failure')).toBe('sync')
    expect(eventOf('conversion')).toBe('jobs')
  })
})

describe('defaults', () => {
  it('turns every in-app row on', () => {
    for (const event of NOTIFICATION_EVENTS) {
      expect(DEFAULT_NOTIFICATION_PREFS.inApp[event]).toBe(true)
    }
  })

  it('leaves every e-mail row off — there is nowhere to send it yet', () => {
    for (const event of NOTIFICATION_EVENTS) {
      expect(DEFAULT_NOTIFICATION_PREFS.email[event]).toBe(false)
    }
  })
})

describe('allows', () => {
  it('follows the switch for the row a type belongs to', () => {
    const muted = withPref(DEFAULT_NOTIFICATION_PREFS, 'inApp', 'mentions', false)
    expect(allows(muted, 'mention')).toBe(false)
    expect(allows(muted, 'reply')).toBe(true)
  })

  it('mutes every type a row covers, not just the first', () => {
    const muted = withPref(DEFAULT_NOTIFICATION_PREFS, 'inApp', 'sync', false)
    expect(allows(muted, 'drive-failure')).toBe(false)
    expect(allows(muted, 'realtime-failure')).toBe(false)
  })

  it('lets an unmapped type through in-app rather than swallowing it', () => {
    // a kind added later without a row here: silence would be the worse bug
    expect(allows(DEFAULT_NOTIFICATION_PREFS, 'unheard-of' as NotificationType)).toBe(true)
  })

  it('never e-mails an unmapped type', () => {
    expect(
      allows(DEFAULT_NOTIFICATION_PREFS, 'unheard-of' as NotificationType, 'email'),
    ).toBe(false)
  })

  it('keeps the channels independent', () => {
    const prefs = withPref(DEFAULT_NOTIFICATION_PREFS, 'email', 'invites', true)
    expect(allows(prefs, 'invite', 'email')).toBe(true)
    expect(allows(prefs, 'invite', 'inApp')).toBe(true)
    expect(allows(withPref(prefs, 'inApp', 'invites', false), 'invite', 'email')).toBe(true)
  })
})

describe('withPref', () => {
  it('changes one switch and copies rather than mutates', () => {
    const next = withPref(DEFAULT_NOTIFICATION_PREFS, 'inApp', 'jobs', false)
    expect(next.inApp.jobs).toBe(false)
    expect(DEFAULT_NOTIFICATION_PREFS.inApp.jobs).toBe(true)
    expect(next.email).toEqual(DEFAULT_NOTIFICATION_PREFS.email)
  })
})
