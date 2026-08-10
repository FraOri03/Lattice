import { useEffect, useRef } from 'react'
import { useStore } from '@/store/useStore'
import { useI18n } from '@/lib/i18n'
import { announce } from '@/lib/a11y/announcer'
import { useViewportTier } from '@/lib/layout/useViewportTier'
import { SETTINGS_SECTIONS, type SettingsSection } from '@/lib/settings/sections'
import { SettingsPanel } from './panels'
import {
  IcCloud,
  IcCode,
  IcEdit,
  IcLink,
  IcMessage,
  IcShield,
  IcSun,
  IcTag,
  IcUser,
  IcX,
} from '@/components/Icons'

/**
 * Settings (Phase 14.1) — a screen with lateral navigation, not one long
 * modal, and not a third surface either: it opens OVER whichever surface you
 * were on and `?s=<section>` rides alongside the surface params, so closing it
 * puts you back exactly where you were and a link can point at the panel that
 * fixes the problem instead of at "settings, go find it".
 *
 * ProfileMenu is absorbed here rather than duplicated: identity, the connected
 * services, sync and language live in the section each belongs to, and the
 * menu keeps only the identity header and the way in.
 */

const ICON: Record<SettingsSection, typeof IcUser> = {
  account: IcUser,
  profile: IcEdit,
  appearance: IcSun,
  notifications: IcMessage,
  security: IcShield,
  connections: IcLink,
  storage: IcCloud,
  billing: IcTag,
  developer: IcCode,
}

export function SettingsScreen() {
  const section = useStore((s) => s.settingsSection)
  const openSettings = useStore((s) => s.openSettings)
  const closeSettings = useStore((s) => s.closeSettings)
  const t = useI18n()
  const tier = useViewportTier()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const isOpen = section !== null
  const label = (s: SettingsSection) => t.settings.sections[s]

  // Focus enters on open and goes back to whatever opened it on close — the
  // control that opened settings is where the user's attention already was.
  useEffect(() => {
    if (!isOpen) return
    openerRef.current = document.activeElement as HTMLElement | null
    headingRef.current?.focus()
    return () => openerRef.current?.focus?.()
  }, [isOpen])

  // Switching panel does NOT move focus (that would evict a keyboard user from
  // the navigation they are still using), so the change is announced instead.
  useEffect(() => {
    if (section) announce(label(section))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section])

  if (!section) return null

  // Esc is handled on the container rather than on window: settings closes
  // only when the keystroke happened inside it, so a dialog opened above keeps
  // its own Escape.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      closeSettings()
    }
  }

  const sideways = tier === 'full' || tier === 'compact'

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-bg"
      role="dialog"
      aria-modal="true"
      aria-label={t.settings.title}
      onKeyDown={onKeyDown}
    >
      <header className="flex flex-none items-center gap-2 border-b border-bord px-4 py-3">
        <span className="flex-1 text-[14px] font-bold">{t.settings.title}</span>
        <button className="icon-btn" aria-label={t.settings.close} onClick={closeSettings}>
          <IcX size={14} />
        </button>
      </header>

      <div className={`flex min-h-0 flex-1 ${sideways ? 'flex-row' : 'flex-col'}`}>
        <nav
          aria-label={t.settings.navLabel}
          className={
            sideways
              ? 'w-56 flex-none overflow-y-auto border-r border-bord p-2'
              : 'flex flex-none gap-1 overflow-x-auto border-b border-bord p-2'
          }
        >
          {SETTINGS_SECTIONS.map((key) => {
            const Icon = ICON[key]
            const active = key === section
            return (
              <button
                key={key}
                aria-current={active ? 'page' : undefined}
                onClick={() => openSettings(key)}
                className={`flex min-h-8 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12.5px] whitespace-nowrap ${
                  sideways ? 'w-full text-left' : 'flex-none'
                } ${active ? 'bg-panel2 font-semibold text-ink' : 'text-muted hover:text-ink'}`}
              >
                <Icon size={14} />
                {label(key)}
              </button>
            )
          })}
        </nav>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-2xl px-4 py-6">
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="text-[17px] font-bold tracking-tight outline-none"
            >
              {label(section)}
            </h2>
            <p className="mt-1 mb-4 text-[11.5px] text-muted">{t.settings.intro[section]}</p>
            <SettingsPanel section={section} />
          </div>
        </main>
      </div>
    </div>
  )
}
