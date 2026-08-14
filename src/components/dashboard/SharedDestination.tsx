import { useMemo } from 'react'
import { useStore } from '@/store/useStore'
import { useCollabStore } from '@/lib/collab/collabStore'
import { currentIdentity } from '@/lib/collab/CollaborationProvider'
import { useSyncStore } from '@/lib/sync/syncStore'
import { useI18n, useTimeAgo } from '@/lib/i18n'
import { collectShared, type SharedScope } from '@/lib/dashboard/honestSections'
import { useSharedIndex } from '@/lib/dashboard/sharedIndex'
import { ROLE_LABEL } from '@/types/collab'
import { IcFolder } from '@/components/Icons'

/**
 * Shared with me (13.3, 13.5 §3, completed by 18.4).
 *
 * The index this page needed did not exist on any device: a browser knows
 * only its own memberships, and the realtime backend is an *authority* rather
 * than an index — it can answer "may this address enter this room?" and not
 * "which rooms may it enter?". So the page listed what this device already
 * held and said plainly what it could not see.
 *
 * `/api/shared` is that index (#91). Rows now come from three places and each
 * says which: this browser, a shared Drive folder, or the server. A
 * server-only row is a project shared with you that has not reached this
 * device — it has a role and an owner but no name, because titles live in Yjs
 * and Drive and never touch the database that knows the membership.
 */
export function SharedDestination() {
  const t = useI18n()
  const timeAgo = useTimeAgo()
  const projects = useStore((s) => s.projects)
  const setActiveProject = useStore((s) => s.setActiveProject)
  const members = useCollabStore((s) => s.members)
  const provider = useSyncStore((s) => s.provider)
  const { index, unavailable, loaded } = useSharedIndex()

  const scope: SharedScope = provider === 'none' ? 'browser' : 'drive'
  const groups = useMemo(
    () => collectShared(projects, members, currentIdentity().userId, scope, index.projects),
    [projects, members, scope, index],
  )

  const grants = (role: 'admin' | 'editor' | 'commenter' | 'viewer') =>
    t.honest.shared.grants[role]

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <h1 className="text-[19px] font-bold tracking-tight">{t.destinations.title.shared}</h1>
      <p className="mt-1 text-[11.5px] text-muted">{t.destinations.description.shared}</p>

      <p className="mt-4 rounded-xl border border-bord bg-panel p-3 text-[11.5px] text-muted">
        {t.honest.shared.intro}
      </p>

      {groups.length === 0 ? (
        <p className="mt-4 text-[11.5px] text-muted">{t.honest.shared.empty}</p>
      ) : (
        groups.map((group) => (
          <section
            key={group.ownerEmail ?? '__unknown__'}
            aria-label={group.ownerName ?? t.honest.shared.unknownOwner}
            className="mt-5"
          >
            <h2 className="mb-2 text-[12px] font-semibold">
              {group.ownerName ?? t.honest.shared.unknownOwner}
              {group.ownerEmail && (
                <span className="ml-2 text-[10.5px] font-normal text-muted">
                  {group.ownerEmail}
                </span>
              )}
            </h2>
            <ul className="flex flex-col gap-1.5">
              {group.items.map((item) => (
                <li
                  key={item.projectId}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-bord bg-panel px-3 py-2"
                >
                  {/* a project this device has never held cannot be opened,
                      and a button that did nothing would be worse than none */}
                  {item.name === null ? (
                    <span className="flex min-w-0 flex-1 items-center gap-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium italic text-muted">
                          {t.honest.shared.notHereYet}
                        </span>
                        <span className="block truncate text-[10.5px] text-muted">
                          {t.honest.shared.role(ROLE_LABEL[item.role])} · {grants(item.role)}
                        </span>
                      </span>
                    </span>
                  ) : (
                    <button
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
                      onClick={() => setActiveProject(item.projectId)}
                      aria-label={t.dashboard.openProject(item.name)}
                    >
                      <span className="flex-none text-[13px]" aria-hidden>
                        {item.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium">
                          {item.name}
                        </span>
                        {/* the role AND what it grants: a role name alone is not
                            consent, and this page is where you learn what you got */}
                        <span className="block truncate text-[10.5px] text-muted">
                          {t.honest.shared.role(ROLE_LABEL[item.role])} · {grants(item.role)}
                        </span>
                      </span>
                    </button>
                  )}
                  {/* which of the two paths this row is READ from — never a
                      guess, and never colour alone */}
                  <span
                    className="flex-none rounded-full border border-bord bg-panel2 px-2 py-0.5 text-[10px] text-muted"
                    title={
                      item.scope === 'server'
                        ? t.honest.shared.scopeServerWhy
                        : item.scope === 'drive'
                          ? t.honest.shared.scopeDriveWhy
                          : t.honest.shared.scopeBrowserWhy
                    }
                  >
                    {item.scope === 'server'
                      ? t.honest.shared.scopeServer
                      : item.scope === 'drive'
                        ? t.honest.shared.scopeDrive
                        : t.honest.shared.scopeBrowser}
                  </span>
                  {item.updatedAt > 0 && (
                    <span className="flex-none text-[10.5px] text-muted">
                      {timeAgo(item.updatedAt)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {/* Stated whether or not the list found anything — but only while it is
          TRUE. With the index answering (18.4) the page is no longer partial,
          and repeating that it is would be its own kind of dishonesty. Until
          an answer arrives it is assumed partial, which is the conservative
          claim and the one that was correct before this phase. */}
      {(!loaded || unavailable) && (
        <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-dashed border-bord p-4">
          <IcFolder size={14} className="mt-0.5 flex-none text-muted" aria-hidden />
          <p className="text-[11.5px] text-muted">{t.honest.shared.whyPartial}</p>
        </div>
      )}
    </div>
  )
}
