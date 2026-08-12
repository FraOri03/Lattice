import { useMemo } from 'react'
import { useStore } from '@/store/useStore'
import { useCollabStore } from '@/lib/collab/collabStore'
import { currentIdentity } from '@/lib/collab/CollaborationProvider'
import { useSyncStore } from '@/lib/sync/syncStore'
import { useI18n, useTimeAgo } from '@/lib/i18n'
import { collectShared, type SharedScope } from '@/lib/dashboard/honestSections'
import { ROLE_LABEL } from '@/types/collab'
import { IcFolder } from '@/components/Icons'

/**
 * Shared with me (13.3, 13.5 §3) — the honest half.
 *
 * The prototype shows a full index of everything anyone ever shared with you.
 * There is no such index anywhere, on any device: the realtime backend is an
 * *authority*, not an index — it can answer "may this e-mail enter this room?"
 * and cannot answer "which projects has anyone shared with me?".
 *
 * What exists is narrower and real: a project whose data already reaches this
 * browser, because it was shared inside this profile or arrives through a Drive
 * folder you both hold. That is what this lists, grouped by owner, with the
 * scope named on every row — and then it says what it cannot list, rather than
 * showing an empty page and letting you conclude nobody shared anything.
 */
export function SharedDestination() {
  const t = useI18n()
  const timeAgo = useTimeAgo()
  const projects = useStore((s) => s.projects)
  const setActiveProject = useStore((s) => s.setActiveProject)
  const members = useCollabStore((s) => s.members)
  const provider = useSyncStore((s) => s.provider)

  const scope: SharedScope = provider === 'none' ? 'browser' : 'drive'
  const groups = useMemo(
    () => collectShared(projects, members, currentIdentity().userId, scope),
    [projects, members, scope],
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
                  {/* which of the two paths this row is READ from — never a
                      guess, and never colour alone */}
                  <span
                    className="flex-none rounded-full border border-bord bg-panel2 px-2 py-0.5 text-[10px] text-muted"
                    title={
                      item.scope === 'drive'
                        ? t.honest.shared.scopeDriveWhy
                        : t.honest.shared.scopeBrowserWhy
                    }
                  >
                    {item.scope === 'drive'
                      ? t.honest.shared.scopeDrive
                      : t.honest.shared.scopeBrowser}
                  </span>
                  <span className="flex-none text-[10.5px] text-muted">
                    {timeAgo(item.updatedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {/* the unavailable half, always present: what this page cannot see is a
          property of the product, not of your account, so it is stated whether
          or not the list above found anything */}
      <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-dashed border-bord p-4">
        <IcFolder size={14} className="mt-0.5 flex-none text-muted" aria-hidden />
        <p className="text-[11.5px] text-muted">{t.honest.shared.whyPartial}</p>
      </div>
    </div>
  )
}
