import { useMemo, useRef } from 'react'
import { useStore } from '@/store/useStore'
import { activeTab, tabKey, type EntityTab } from '@/lib/tabs/tabSession'
import { describeEntity } from '@/lib/entities/entityLabel'
import { TOOLBAR_CONTROL_ATTR, useRovingFocus } from '@/components/ui/toolbar'
import { useI18n } from '@/lib/i18n'
import {
  IcCode,
  IcDoc,
  IcFile,
  IcNote,
  IcPresentation,
  IcTable,
  IcX,
} from '@/components/Icons'

const TAB_ICON = {
  note: IcNote,
  doc: IcDoc,
  sheet: IcTable,
  present: IcPresentation,
  code: IcCode,
  asset: IcFile,
} as const satisfies Record<EntityTab['kind'], unknown>

/**
 * The open entities of this project, across every section (Phase 11.3.3).
 *
 * One strip for the whole project, not one per section: the session is the
 * project's, and a note, a spreadsheet and a code file are all just things
 * you have open. Selecting a tab takes you to the section that entity lives
 * in, which is why the strip can sit above the workspace and outlive the
 * section switch underneath it.
 *
 * It replaces the code-only strip that used to live inside the code pane.
 * That strip listed the same session filtered by kind, so keeping both would
 * have shown the same files twice on the same screen. Its accessibility work
 * (Phase 11.1.6c) is carried over here rather than lost: a real `tablist`
 * with one tab stop and arrow navigation, close targets that clear the 24px
 * floor of WCAG 2.2 SC 2.5.8, and every control named after its file.
 */
export function EntityTabStrip() {
  const t = useI18n().tabs
  const activeProjectId = useStore((s) => s.activeProjectId)
  const session = useStore((s) => s.tabSessions[s.activeProjectId])
  const notes = useStore((s) => s.notes)
  const docs = useStore((s) => s.docs)
  const sheetDocs = useStore((s) => s.sheetDocs)
  const presentDocs = useStore((s) => s.presentDocs)
  const codeDocs = useStore((s) => s.codeDocs)
  const assets = useStore((s) => s.assets)
  const boards = useStore((s) => s.boards)
  const projects = useStore((s) => s.projects)
  const activateEntityTab = useStore((s) => s.activateEntityTab)
  const closeEntityTab = useStore((s) => s.closeEntityTab)

  const strip = useRef<HTMLDivElement>(null)
  const roving = useRovingFocus(strip, 'horizontal')

  // resolved in a memo rather than in the selector, so React sees a stable
  // snapshot instead of a freshly built array on every store read
  const tabs = useMemo(() => {
    const src = { notes, docs, sheetDocs, presentDocs, codeDocs, assets, boards, projects }
    return (session?.tabs ?? [])
      .map((tab) => {
        const hit = describeEntity(tab.kind, tab.id, src)
        return hit ? { tab, title: hit.title } : null
      })
      .filter((x): x is { tab: EntityTab; title: string } => !!x)
  }, [session, notes, docs, sheetDocs, presentDocs, codeDocs, assets, boards, projects])

  // no open entities, no bar: an empty strip is a row of chrome that says
  // nothing, and it would push every section down by its own height
  if (!tabs.length) return null

  const current = session ? activeTab(session) : null
  const currentKey = current ? tabKey(current) : null

  return (
    <div
      ref={strip}
      role="tablist"
      aria-label={t.strip}
      aria-orientation="horizontal"
      className="flex flex-none items-center gap-0.5 overflow-x-auto border-b border-bord bg-panel2 px-1 pt-1"
      onKeyDown={roving.onKeyDown}
      onFocus={roving.onFocus}
      data-project={activeProjectId}
    >
      {tabs.map(({ tab, title }) => {
        const Icon = TAB_ICON[tab.kind]
        const selected = tabKey(tab) === currentKey
        return (
          <div key={tabKey(tab)} className={`code-tab ${selected ? 'is-active' : ''}`}>
            <button
              type="button"
              role="tab"
              {...{ [TOOLBAR_CONTROL_ATTR]: '' }}
              aria-selected={selected}
              className="flex max-w-40 cursor-pointer items-center gap-1.5 truncate bg-transparent"
              title={title}
              onClick={() => activateEntityTab(tab)}
            >
              <Icon size={11} className="flex-none text-muted" aria-hidden />
              <span className="truncate">{title}</span>
            </button>
            <button
              type="button"
              {...{ [TOOLBAR_CONTROL_ATTR]: '' }}
              className="icon-btn -m-1 h-6 w-6 p-1"
              title={t.close(title)}
              aria-label={t.close(title)}
              onClick={() => closeEntityTab(tab)}
            >
              <IcX size={9} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
