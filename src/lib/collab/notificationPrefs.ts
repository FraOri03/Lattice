import type { NotificationType } from '@/types/collab'

/**
 * Notification preferences (Phase 14.4).
 *
 * Preferences over the pipeline that already exists: `NotificationService`
 * derives every notification on this device and funnels them all through one
 * `notify()`, so a preference only has to be honoured in one place to be real.
 *
 * The rows below are **the events the app actually emits**, grouped so a
 * person recognises them. Three things the phase brief also listed — due
 * dates, role changes and administrative activity — have no producer in this
 * build: nothing watches `CommentThread.dueAt`, `MembersService` changes a
 * role without notifying, and the activity log is a log. A switch for them
 * would be a control that does nothing, so they are named in the panel
 * instead (the same rule the dashboard data contract sets for a section that
 * cannot answer).
 */

export type NotificationEvent =
  | 'mentions'
  | 'replies'
  | 'assignments'
  | 'resolved'
  | 'invites'
  | 'sync'
  | 'jobs'
  | 'versions'

/** Delivery routes. `email` exists as a preference before it exists as a route. */
export type NotificationChannel = 'inApp' | 'email'

/** Which raw notification types each row covers. */
export const EVENT_TYPES: Record<NotificationEvent, NotificationType[]> = {
  mentions: ['mention'],
  replies: ['reply'],
  assignments: ['assignment'],
  resolved: ['comment-resolved'],
  invites: ['invite'],
  sync: ['drive-failure', 'realtime-failure'],
  jobs: ['github-sync', 'conversion'],
  versions: ['version-restored'],
}

/** Render order of the panel. */
export const NOTIFICATION_EVENTS = Object.keys(EVENT_TYPES) as NotificationEvent[]

export type ChannelPrefs = Record<NotificationEvent, boolean>

export interface NotificationPrefs {
  inApp: ChannelPrefs
  email: ChannelPrefs
}

const all = (value: boolean): ChannelPrefs =>
  Object.fromEntries(NOTIFICATION_EVENTS.map((e) => [e, value])) as ChannelPrefs

/**
 * In-app on, e-mail off — and e-mail stays off until phase 18 gives it
 * somewhere to go. Defaulting it to "on" would store a consent nobody asked
 * for against an address nobody verified.
 */
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  inApp: all(true),
  email: all(false),
}

const TYPE_TO_EVENT = new Map<NotificationType, NotificationEvent>(
  NOTIFICATION_EVENTS.flatMap((event) =>
    EVENT_TYPES[event].map((type) => [type, event] as const),
  ),
)

export function eventOf(type: NotificationType): NotificationEvent | null {
  return TYPE_TO_EVENT.get(type) ?? null
}

/**
 * Whether this notification may be delivered on this channel.
 *
 * An unmapped type — a kind added later without a row here — is **allowed
 * in-app and never e-mailed**. Swallowing a notification because nobody
 * remembered to add a switch is the worse failure of the two; sending mail
 * nobody consented to is the other one.
 */
export function allows(
  prefs: NotificationPrefs,
  type: NotificationType,
  channel: NotificationChannel = 'inApp',
): boolean {
  const event = eventOf(type)
  if (!event) return channel === 'inApp'
  return prefs[channel][event] ?? channel === 'inApp'
}

/** Set one switch, leaving every other preference untouched. */
export function withPref(
  prefs: NotificationPrefs,
  channel: NotificationChannel,
  event: NotificationEvent,
  on: boolean,
): NotificationPrefs {
  return { ...prefs, [channel]: { ...prefs[channel], [event]: on } }
}
