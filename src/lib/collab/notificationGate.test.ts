import { beforeEach, describe, expect, it } from 'vitest'
import { useCollabStore } from './collabStore'
import { notificationService } from './NotificationService'
import { DEFAULT_NOTIFICATION_PREFS, withPref } from './notificationPrefs'

/**
 * The preference has to be honoured where the notifications are raised, not
 * where they are drawn: a muted event that still lands in the store is a
 * badge that lights up for something the user switched off.
 */

const raise = (type: Parameters<typeof notificationService.notify>[1]) =>
  notificationService.notify('proj_a', type, 'title', 'body')

beforeEach(() => {
  useCollabStore.setState({
    notifications: [],
    notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
  })
})

describe('notify() respects the preferences', () => {
  it('raises what is switched on', () => {
    raise('mention')
    expect(useCollabStore.getState().notifications).toHaveLength(1)
  })

  it('drops what is switched off, instead of storing it unread', () => {
    useCollabStore.setState({
      notificationPrefs: withPref(DEFAULT_NOTIFICATION_PREFS, 'inApp', 'mentions', false),
    })
    raise('mention')
    expect(useCollabStore.getState().notifications).toEqual([])
  })

  it('mutes every type the row covers', () => {
    useCollabStore.setState({
      notificationPrefs: withPref(DEFAULT_NOTIFICATION_PREFS, 'inApp', 'sync', false),
    })
    raise('drive-failure')
    raise('realtime-failure')
    expect(useCollabStore.getState().notifications).toEqual([])
  })

  it('leaves the neighbouring rows alone', () => {
    useCollabStore.setState({
      notificationPrefs: withPref(DEFAULT_NOTIFICATION_PREFS, 'inApp', 'mentions', false),
    })
    raise('mention')
    raise('reply')
    expect(useCollabStore.getState().notifications.map((n) => n.type)).toEqual(['reply'])
  })

  it('does not let the e-mail switch silence the in-app one', () => {
    useCollabStore.setState({
      notificationPrefs: withPref(DEFAULT_NOTIFICATION_PREFS, 'email', 'invites', false),
    })
    raise('invite')
    expect(useCollabStore.getState().notifications).toHaveLength(1)
  })
})
