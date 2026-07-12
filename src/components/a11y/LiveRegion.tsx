import { useAnnouncer } from '@/lib/a11y/announcer'

/**
 * The one polite aria-live region for the whole app. Mounted once near the
 * root; stays in the DOM so screen readers keep observing it. A trailing
 * no-break space toggled by nonce parity forces a text change even when the
 * same message is announced twice in a row.
 */
export function LiveRegion() {
  const message = useAnnouncer((s) => s.message)
  const nonce = useAnnouncer((s) => s.nonce)
  const text = message ? message + (nonce % 2 ? ' ' : '') : ''
  return (
    <div aria-live="polite" role="status" aria-atomic="true" className="sr-only">
      {text}
    </div>
  )
}
