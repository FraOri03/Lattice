import { useStore } from '@/store/useStore'
import { messages, timeAgo, type Catalog } from './messages'

export { messages, detectLocale, timeAgo } from './messages'
export type { Catalog, Locale } from './messages'

/**
 * The active catalog for the current UI language. Subscribes to `locale`, so
 * every component using it re-renders the instant the language switches.
 *
 *   const t = useI18n()
 *   <button>{t.topbar.share}</button>
 *   <span>{t.share.subtitle(role, n, pending)}</span>
 */
export function useI18n(): Catalog {
  return messages[useStore((s) => s.locale)]
}

/** Just the active locale, e.g. to drive `timeAgo` or highlight the switch. */
export function useLocale() {
  return useStore((s) => s.locale)
}

/** `timeAgo` bound to the current locale, for components that show timestamps. */
export function useTimeAgo() {
  const locale = useStore((s) => s.locale)
  return (ts: number | null | undefined) => timeAgo(locale, ts)
}
