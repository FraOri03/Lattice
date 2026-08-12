import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/store/useStore'
import { useWorkspaceLayoutStore } from '@/store/workspaceLayoutStore'
import { useUiStore } from '@/store/useUiStore'
import { useSyncStore } from '@/lib/sync/syncStore'
import { syncEngine } from '@/lib/sync/SyncEngine'
import { FileKindIcon, type FileKind } from '@/lib/registry/fileKinds'
import type { RecentEntry, ViewMode } from '@/types/model'
import { useCollabStore } from '@/lib/collab/collabStore'
import { nextTheme, setThemeAnimated } from '@/lib/theme/animateTheme'
import { useI18n } from '@/lib/i18n'
import { announce } from '@/lib/a11y/announcer'
import { search, type PaletteSection, type Rankable } from '@/lib/palette/rank'
import { CREATE_KINDS, needsTarget, type CreateKind } from '@/lib/palette/createKinds'
import { DESTINATIONS, type Destination } from '@/lib/dashboard/destinations'
import { workspaceOfProject } from '@/lib/dashboard/shelves'
import {
  IcActivity,
  IcBoard,
  IcClock,
  IcCloud,
  IcFolder,
  IcGithub,
  IcGraph,
  IcHistory,
  IcKeyboard,
  IcMessage,
  IcMoon,
  IcPlus,
  IcSearch,
  IcSettings,
  IcSplit,
  IcSun,
  IcUserPlus,
} from '@/components/Icons'

interface PaletteItem extends Rankable {
  icon: React.ReactNode
  /** What is shown; `name` is what is matched and sorted. */
  label: string
  hint?: React.ReactNode
  disabled?: boolean
  run: () => void
}

const RECENT_KIND_ICON: Record<RecentEntry['kind'], FileKind> = {
  note: 'note',
  doc: 'richdoc',
  sheet: 'sheet',
  present: 'presentation',
  code: 'code',
  asset: 'file',
  board: 'board',
}

const CREATE_ICON: Record<CreateKind, FileKind | 'board' | 'project'> = {
  project: 'project',
  board: 'board',
  doc: 'richdoc',
  note: 'note',
  sheet: 'sheet',
  present: 'presentation',
  code: 'code',
}

/**
 * The command palette — Ctrl/Cmd+K, and the app's only search (13.4).
 *
 * Three things changed in 15.3, each of which was a bug the moment a surface
 * with no project open existed:
 *
 * - **Search is global.** Every entity loop used to filter on `activeProjectId`,
 *   and going Home deliberately leaves that id intact — so from the dashboard
 *   the palette silently searched the last project you happened to open while
 *   presenting itself as global. Nothing is hidden now; the open project's items
 *   just rank first, and every result names where it lives.
 * - **Order is a ranking**, not the order the maps were walked in. See
 *   `lib/palette/rank`.
 * - **Creation names its destination.** `createNote()` files into
 *   `activeProjectId`, so "New note" from Home used to land in whatever project
 *   was last open, invisibly. From the dashboard the palette now asks — one
 *   keystroke when there is an obvious answer, and nothing at all when there is
 *   only one project.
 *
 * The launcher on the dashboard holds no text and never did: it opens this.
 * One search, one ranking, one keyboard model (13.4 §1).
 */
export function CommandPalette() {
  const open = useUiStore((s) => s.paletteOpen)
  const setOpen = useUiStore((s) => s.setPaletteOpen)
  const t = useI18n()
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  /** The create kind waiting for a target, when the palette is asking. */
  const [pending, setPending] = useState<CreateKind | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(!useUiStore.getState().paletteOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])

  // focus goes in on open and back to whatever opened it on close (13.5 §4)
  useEffect(() => {
    if (open) {
      openerRef.current = document.activeElement as HTMLElement | null
      setQuery('')
      setCursor(0)
      setPending(null)
      setTimeout(() => inputRef.current?.focus(), 0)
    } else {
      openerRef.current?.focus?.()
    }
  }, [open])

  const driveConnected = useSyncStore((s) => s.provider) === 'google-drive'
  const sections = usePaletteSections(query, pending, {
    close: () => setOpen(false),
    ask: setPending,
  })
  const items = sections.flatMap((s) => s.items)

  useEffect(() => setCursor(0), [query, pending])

  /**
   * The result count is announced, debounced — never per keystroke (13.5 §5),
   * which would read the whole list again on every letter.
   */
  // a dead end found nothing — the create offers below it are a way out, not
  // three results, and announcing them as results would say the opposite of
  // what the screen says. A boolean rather than `sections` itself: the array is
  // a fresh object on every store read, and depending on it would restart the
  // debounce often enough that the announcement might never land.
  const deadEnd = sections.some((s) => s.deadEnd)

  useEffect(() => {
    if (!open || !query) return
    const id = setTimeout(
      () =>
        announce(deadEnd ? t.palette.noResults(query) : t.announcements.results(items.length)),
      500,
    )
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, items.length, deadEnd])

  if (!open) return null

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      // Escape closes the topmost layer only: the target question is a layer
      if (pending) setPending(null)
      else setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(c + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(c - 1, 0))
    } else if (e.key === 'Enter' && items[cursor] && !items[cursor].disabled) {
      items[cursor].run()
    }
  }

  const activeId = items[cursor] ? `palette-opt-${items[cursor].key}` : undefined

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[14vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false)
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.palette.label}
        className="w-[560px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-bord bg-panel shadow-2xl"
      >
        {pending && (
          <div className="flex items-center gap-2 border-b border-bord bg-panel2 px-3 py-2 text-[11.5px]">
            <span className="flex-1 font-semibold">
              {t.create.chooseTarget(t.create.kinds[pending])}
            </span>
            <button className="btn" onClick={() => setPending(null)}>
              {t.create.back}
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 border-b border-bord px-3">
          <IcSearch size={14} className="text-muted" />
          <input
            ref={inputRef}
            className="h-11 min-w-0 flex-1 bg-transparent text-[13px] outline-none"
            placeholder={t.palette.placeholder}
            aria-label={t.palette.placeholder}
            aria-controls="palette-results"
            aria-activedescendant={activeId}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <kbd className="rounded border border-bord bg-panel2 px-1.5 py-0.5 text-[10px] text-muted">
            esc
          </kbd>
        </div>
        <div
          id="palette-results"
          role="listbox"
          aria-label={t.palette.results}
          className="max-h-[46vh] overflow-y-auto p-1.5"
        >
          {/* the query, quoted, so a typo is visible — shown above the create
              offers rather than instead of them (13.4 §5) */}
          {(items.length === 0 || deadEnd) && (
            <div className="px-3 pt-4 pb-2 text-center text-[12px] text-muted">
              <p>{t.palette.noResults(query)}</p>
              {/* the scope, but only when it is not everything (13.4 §5): with
                  Drive connected, "not here" and "does not exist" differ */}
              {driveConnected && (
                <p className="mt-2 text-[11px]">{t.palette.driveScope}</p>
              )}
            </div>
          )}
          {sections.map((section) => (
            <div key={section.section}>
              <div className="px-2.5 pt-2 pb-1 text-[9.5px] font-semibold tracking-widest text-muted uppercase">
                {t.palette.sections[section.section]}
              </div>
              {section.items.map((item) => {
                const i = items.indexOf(item)
                return (
                  <button
                    key={item.key}
                    id={`palette-opt-${item.key}`}
                    role="option"
                    aria-selected={i === cursor}
                    aria-disabled={item.disabled || undefined}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] ${
                      item.disabled
                        ? 'cursor-not-allowed text-muted opacity-60'
                        : i === cursor
                          ? 'cursor-pointer bg-panel2 text-ink'
                          : 'cursor-pointer text-muted hover:bg-panel2/60'
                    }`}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => !item.disabled && item.run()}
                  >
                    <span className="flex h-5 w-5 flex-none items-center justify-center">
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.hint && (
                      <span className="flex-none text-[10px] text-muted">{item.hint}</span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Everything the palette can offer, ranked and grouped.
 *
 * Built as one flat pool and handed to `search`, so there is exactly one place
 * that decides order — adding a source cannot accidentally add a second
 * ranking.
 */
function usePaletteSections(
  query: string,
  pending: CreateKind | null,
  cb: { close: () => void; ask: (kind: CreateKind) => void },
): { section: PaletteSection; items: PaletteItem[]; deadEnd?: boolean }[] {
  const s = useStore()
  const t = useI18n()
  const syncProvider = useSyncStore((st) => st.provider)
  const setGithubDialogOpen = useUiStore((st) => st.setGithubDialogOpen)
  const setDriveDialogOpen = useUiStore((st) => st.setDriveDialogOpen)
  const setShareDialogOpen = useUiStore((st) => st.setShareDialogOpen)
  const setShortcutsOpen = useUiStore((st) => st.setShortcutsOpen)
  const setPanel = useCollabStore((st) => st.setPanel)

  return useMemo(() => {
    const done = (fn: () => void) => () => {
      fn()
      cb.close()
    }
    const onDashboard = s.navSurface === 'dashboard'
    const projectList = Object.values(s.projects).filter((p) => !p.archived && !p.deletedAt)

    /* ---------- the target question, when one is pending ---------- */

    if (pending) {
      return [
        {
          section: 'projects' as const,
          items: projectList.map((p) => ({
            key: `t:${p.id}`,
            name: p.name,
            section: 'projects' as const,
            icon: <IcFolder size={14} />,
            label: `${p.icon} ${p.name}`,
            run: done(() => createIn(pending, p.id)),
          })),
        },
      ]
    }

    /**
     * Create `kind` in `projectId`, and say where it went.
     *
     * The project moves first: every `create*` action files into
     * `activeProjectId`, so setting the target is what makes the creation land
     * anywhere other than wherever the user happened to be last.
     */
    function createIn(kind: CreateKind, projectId: string, title?: string) {
      if (kind === 'project') {
        s.setActiveProject(s.createProject(title ? { name: title } : undefined))
        return
      }
      if (s.activeProjectId !== projectId) s.setActiveProject(projectId)
      const st = useStore.getState()
      const named = title ? { title } : undefined
      const id =
        kind === 'note' ? st.createNote(named)
        : kind === 'doc' ? st.createDoc(named)
        : kind === 'sheet' ? st.createSheetDoc(named)
        : kind === 'present' ? st.createPresentDoc(named)
        : kind === 'code' ? st.createCode(named)
        : ''
      const after = useStore.getState()
      if (kind === 'board') after.addBoard()
      else if (kind === 'note') after.openNote(id)
      else if (kind === 'doc') after.openDoc(id)
      else if (kind === 'sheet') after.openSheet(id)
      else if (kind === 'present') after.openPresent(id)
      else if (kind === 'code') after.openCode(id)

      const fresh = useStore.getState()
      const name =
        kind === 'note' ? fresh.notes[id]?.title
        : kind === 'doc' ? fresh.docs[id]?.title
        : kind === 'sheet' ? fresh.sheetDocs[id]?.title
        : kind === 'present' ? fresh.presentDocs[id]?.title
        : kind === 'code' ? fresh.codeDocs[id]?.title
        : fresh.boards[fresh.activeBoardId]?.name
      announce(
        t.announcements.created(
          t.create.kinds[kind],
          name ?? '',
          fresh.projects[projectId]?.name ?? '',
        ),
      )
    }

    const pool: PaletteItem[] = []

    /* ---------- create (13.4 §6) ---------- */

    // where a creation would land without asking: the open project, or the one
    // opened most recently when the dashboard is showing
    const fallbackTarget = onDashboard
      ? (s.recentProjectIds.find((id) => s.projects[id] && !s.projects[id].archived) ??
        projectList[0]?.id)
      : s.activeProjectId
    const targetName = fallbackTarget ? s.projects[fallbackTarget]?.name : undefined

    for (const kind of CREATE_KINDS) {
      const kindLabel = t.create.kinds[kind]
      const targeted = needsTarget(kind)
      // no project to file into: the entity items say why rather than creating
      // one silently. New project stays live, because it is the way out.
      const blocked = targeted && projectList.length === 0
      // more than one candidate and no project open ⇒ ask; otherwise resolve
      const mustAsk = targeted && onDashboard && projectList.length > 1
      pool.push({
        key: `new:${kind}`,
        name: t.create.newLabel(kindLabel),
        section: 'create',
        isAction: true,
        icon:
          kind === 'project' ? (
            <IcPlus size={14} />
          ) : kind === 'board' ? (
            <IcBoard size={14} />
          ) : (
            <FileKindIcon kind={CREATE_ICON[kind] as FileKind} size={14} />
          ),
        label: t.create.newLabel(kindLabel),
        // every creation names its destination BEFORE it happens
        hint: blocked
          ? t.create.noProjects
          : targeted && targetName && !mustAsk
            ? t.palette.inProject(targetName)
            : undefined,
        disabled: blocked,
        run: blocked
          ? () => {}
          : mustAsk
            ? () => cb.ask(kind)
            : done(() => createIn(kind, fallbackTarget ?? '')),
      })
    }

    /* ---------- go to: the six destinations (13.4 §4) ---------- */

    for (const d of DESTINATIONS) {
      pool.push({
        key: `go:${d}`,
        name: t.destinations.title[d as Destination],
        section: 'goto',
        isAction: true,
        icon: <IcSearch size={14} />,
        label: t.destinations.title[d as Destination],
        run: done(() => s.openDestination(d)),
      })
    }

    /* ---------- workspaces ---------- */

    for (const ws of Object.values(s.workspaces)) {
      if (ws.archived && ws.id !== s.activeWorkspaceId) continue
      pool.push({
        key: `ws:${ws.id}`,
        name: ws.name,
        section: 'workspace',
        isAction: true,
        icon: <IcFolder size={14} />,
        label: `${ws.icon} ${ws.name}`,
        hint: ws.id === s.activeWorkspaceId ? t.palette.currentProject : t.palette.switchWorkspace,
        run: done(() => s.setActiveWorkspace(ws.id)),
      })
    }

    /* ---------- recents, only with an empty query ---------- */

    const recentRankOf = new Map<string, number>()
    s.recents.forEach((r, i) => recentRankOf.set(`${r.kind}:${r.id}`, i))

    if (!query.trim()) {
      for (const r of s.recents.slice(0, 6)) {
        const resolved =
          r.kind === 'note' ? s.notes[r.id]?.title
          : r.kind === 'doc' ? s.docs[r.id]?.title
          : r.kind === 'sheet' ? s.sheetDocs[r.id]?.title
          : r.kind === 'present' ? s.presentDocs[r.id]?.title
          : r.kind === 'code' ? s.codeDocs[r.id] && `${s.codeDocs[r.id].title}.${s.codeDocs[r.id].extension}`
          : r.kind === 'asset' ? s.assets[r.id]?.name
          : s.boards[r.id]?.name
        if (!resolved) continue
        pool.push({
          key: `r:${r.kind}:${r.id}`,
          name: resolved,
          section: 'recent',
          recentRank: recentRankOf.get(`${r.kind}:${r.id}`),
          icon: <FileKindIcon kind={RECENT_KIND_ICON[r.kind]} size={14} />,
          label: resolved,
          hint: <IcClock size={10} />,
          run: done(() => {
            if (r.kind === 'note') s.openNote(r.id)
            else if (r.kind === 'doc') s.openDoc(r.id)
            else if (r.kind === 'sheet') s.openSheet(r.id)
            else if (r.kind === 'present') s.openPresent(r.id)
            else if (r.kind === 'code') s.openCode(r.id)
            else if (r.kind === 'asset') s.openAsset(r.id)
            else s.setActiveBoard(r.id)
          }),
        })
      }
    }

    /* ---------- entities: every project this device holds (13.4 §2) ---------- */

    if (query.trim()) {
      /** Where a result lives — its project, and its workspace when that is not the active one. */
      const where = (projectId: string | undefined) => {
        if (!projectId) return undefined
        const project = s.projects[projectId]
        if (!project) return undefined
        const ws = workspaceOfProject(projectId, s.workspaces)
        return ws && ws.id !== s.activeWorkspaceId
          ? `${project.name} · ${ws.name}`
          : project.name
      }

      const push = (
        key: string,
        name: string,
        kind: FileKind,
        projectId: string | undefined,
        recentKey: string,
        run: () => void,
      ) =>
        pool.push({
          key,
          name,
          section: 'files',
          inActiveProject: projectId === s.activeProjectId,
          recentRank: recentRankOf.get(recentKey),
          icon: <FileKindIcon kind={kind} size={14} />,
          label: name,
          hint: where(projectId),
          // the project moves FIRST, for the reason `openRecent` documents:
          // `setActiveProject` clears all six entity slots, so opening then
          // switching would open the file and immediately wipe it. Global
          // search is what makes this reachable — every result used to be in
          // the project already.
          run: done(() => {
            if (projectId && projectId !== s.activeProjectId) s.setActiveProject(projectId)
            run()
          }),
        })

      // search reaches what this device holds — minus what it has thrown away
      const live = <T extends { deletedAt?: number }>(m: Record<string, T>) =>
        Object.values(m).filter((e) => !e.deletedAt)

      for (const n of live(s.notes))
        push(`n:${n.id}`, n.title, 'note', n.projectId, `note:${n.id}`, () => s.openNote(n.id))
      for (const d of live(s.docs))
        push(`d:${d.id}`, d.title, 'richdoc', d.projectId, `doc:${d.id}`, () => s.openDoc(d.id))
      for (const sh of live(s.sheetDocs))
        push(`s:${sh.id}`, sh.title, 'sheet', sh.projectId, `sheet:${sh.id}`, () => s.openSheet(sh.id))
      for (const p of live(s.presentDocs))
        push(`pr:${p.id}`, p.title, 'presentation', p.projectId, `present:${p.id}`, () => s.openPresent(p.id))
      for (const c of live(s.codeDocs))
        push(`c:${c.id}`, `${c.title}.${c.extension}`, 'code', c.projectId, `code:${c.id}`, () => s.openCode(c.id))
      for (const a of live(s.assets))
        push(`as:${a.id}`, a.name, 'file', a.projectId, `asset:${a.id}`, () => s.openAsset(a.id))

      for (const b of live(s.boards)) {
        pool.push({
          key: `b:${b.id}`,
          name: b.name,
          section: 'boards',
          inActiveProject: b.projectId === s.activeProjectId,
          recentRank: recentRankOf.get(`board:${b.id}`),
          icon: <IcBoard size={14} />,
          label: b.name,
          hint: where(b.projectId),
          run: done(() => {
            if (b.projectId && b.projectId !== s.activeProjectId) s.setActiveProject(b.projectId)
            useStore.getState().setActiveBoard(b.id)
            useStore.getState().setViewMode('board')
          }),
        })
      }

      for (const p of live(s.projects)) {
        pool.push({
          key: `p:${p.id}`,
          name: p.name,
          section: 'projects',
          icon: <IcFolder size={14} />,
          label: `${p.icon} ${p.name}`,
          hint: p.id === s.activeProjectId ? t.palette.currentProject : t.palette.switchProject,
          run: done(() => s.setActiveProject(p.id)),
        })
      }
    }

    /* ---------- utility commands ---------- */

    const cmd = t.palette.commands
    const actions: [string, React.ReactNode, () => void, string?][] = [
      [cmd.graph, <IcGraph size={14} />, () => s.setViewMode('graph'), 'G G'],
      [
        cmd.split,
        <IcSplit size={14} />,
        () => useWorkspaceLayoutStore.getState().toggleSplit({ secondary: 'board' }),
      ],
      [
        s.theme === 'dark' ? cmd.toLight : cmd.toDark,
        s.theme === 'dark' ? <IcSun size={14} /> : <IcMoon size={14} />,
        () =>
          setThemeAnimated(nextTheme(s.theme), s.setTheme, {
            x: window.innerWidth / 2,
            y: window.innerHeight / 3,
          }),
      ],
      [cmd.github, <IcGithub size={14} />, () => setGithubDialogOpen(true)],
      [cmd.drive, <IcCloud size={14} />, () => setDriveDialogOpen(true)],
      [cmd.share, <IcUserPlus size={14} />, () => setShareDialogOpen(true)],
      [cmd.comments, <IcMessage size={14} />, () => setPanel('comments')],
      [cmd.activity, <IcActivity size={14} />, () => setPanel('activity')],
      [cmd.versions, <IcHistory size={14} />, () => setPanel('versions')],
      [cmd.shortcuts, <IcKeyboard size={14} />, () => setShortcutsOpen(true), 'Ctrl /'],
      [cmd.settings, <IcSettings size={14} />, () => s.openSettings()],
    ]
    if (syncProvider === 'google-drive') {
      actions.push([cmd.syncNow, <IcCloud size={14} />, () => void syncEngine.syncNow()])
    }
    const MODES: ViewMode[] = ['board', 'doc', 'sheet', 'presentation', 'code', 'photo']
    for (const mode of MODES) {
      actions.push([
        cmd.goToSection(t.palette.viewModes[mode as keyof typeof t.palette.viewModes]),
        <IcBoard size={14} />,
        () => s.setViewMode(mode),
        cmd.modeHint,
      ])
    }
    for (const [label, icon, run, hint] of actions) {
      pool.push({
        key: `a:${label}`,
        name: label,
        section: 'actions',
        isAction: true,
        icon,
        label,
        hint,
        run: done(run),
      })
    }

    /**
     * With an empty query the palette is not showing results, it is showing its
     * home screen — so the sections are the fixed list 13.4 §4 settles, in that
     * order. Ranking here would be ranking nothing against nothing, and the
     * twenty-item budget would silently drop whichever section sorted last:
     * "Go to" is the palette's keyboard route to five destinations, and it
     * cannot be the thing that falls off the end.
     */
    if (!query.trim()) {
      const order: PaletteSection[] = ['recent', 'create', 'goto', 'workspace', 'actions']
      return order
        .map((section) => ({ section, items: pool.filter((i) => i.section === section) }))
        .filter((g) => g.items.length > 0)
    }

    const found = search(pool, query)

    /**
     * A search that failed has already told us what the user wanted to call the
     * thing (13.4 §5), so the dead end becomes a place to act. These are real
     * options in the list rather than text below it — otherwise the one useful
     * thing on the screen would be the one thing the keyboard cannot reach.
     */
    if (found.length === 0 && query.trim()) {
      const named = query.trim()
      const kinds: CreateKind[] = ['note', 'doc', 'board']
      return [
        {
          deadEnd: true,
          section: 'create' as const,
          items: kinds.map((kind) => ({
            key: `mk:${kind}`,
            name: named,
            section: 'create' as const,
            isAction: true,
            icon:
              kind === 'board' ? (
                <IcBoard size={14} />
              ) : (
                <FileKindIcon kind={CREATE_ICON[kind] as FileKind} size={14} />
              ),
            label: t.palette.createNamed(t.create.kinds[kind], named),
            hint: targetName ? t.palette.inProject(targetName) : t.create.noProjects,
            disabled: !fallbackTarget,
            run: fallbackTarget
              ? done(() => createIn(kind, fallbackTarget, named))
              : () => {},
          })),
        },
      ]
    }

    return found
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, pending, s, t, syncProvider, setGithubDialogOpen, setDriveDialogOpen, setShareDialogOpen, setShortcutsOpen, setPanel])
}
