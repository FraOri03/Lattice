import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/store/useStore'
import { useUiStore } from '@/store/useUiStore'
import { useSyncStore } from '@/lib/sync/syncStore'
import { syncEngine } from '@/lib/sync/SyncEngine'
import { FileKindIcon, type FileKind } from '@/lib/registry/fileKinds'
import type { RecentEntry, ViewMode } from '@/types/model'
import { useCollabStore } from '@/lib/collab/collabStore'
import {
  IcActivity,
  IcBoard,
  IcClock,
  IcCloud,
  IcFolder,
  IcGithub,
  IcHistory,
  IcKeyboard,
  IcMessage,
  IcMoon,
  IcPlus,
  IcSearch,
  IcSun,
  IcUserPlus,
} from '@/components/Icons'

interface PaletteItem {
  key: string
  icon: React.ReactNode
  label: string
  hint?: React.ReactNode
  section: 'actions' | 'recent' | 'files' | 'projects' | 'boards'
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

/** Global command palette — Ctrl/Cmd+K. Actions, recents, project search. */
export function CommandPalette() {
  const open = useUiStore((s) => s.paletteOpen)
  const setOpen = useUiStore((s) => s.setPaletteOpen)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    if (open) {
      setQuery('')
      setCursor(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const items = usePaletteItems(query, () => setOpen(false))

  useEffect(() => setCursor(0), [query])

  if (!open) return null

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false)
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(c + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(c - 1, 0))
    } else if (e.key === 'Enter' && items[cursor]) {
      items[cursor].run()
    }
  }

  let lastSection: string | null = null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[14vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false)
      }}
    >
      <div className="w-[560px] overflow-hidden rounded-xl border border-bord bg-panel shadow-2xl">
        <div className="flex items-center gap-2 border-b border-bord px-3">
          <IcSearch size={14} className="text-muted" />
          <input
            ref={inputRef}
            className="h-11 min-w-0 flex-1 bg-transparent text-[13px] outline-none"
            placeholder="Search files, boards, projects — or type a command…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <kbd className="rounded border border-bord bg-panel2 px-1.5 py-0.5 text-[10px] text-muted">
            esc
          </kbd>
        </div>
        <div ref={listRef} className="max-h-[46vh] overflow-y-auto p-1.5">
          {items.length === 0 && (
            <div className="px-3 py-6 text-center text-[12px] text-muted">
              Nothing matches “{query}”
            </div>
          )}
          {items.map((item, i) => {
            const header = item.section !== lastSection ? item.section : null
            lastSection = item.section
            return (
              <div key={item.key}>
                {header && (
                  <div className="px-2.5 pt-2 pb-1 text-[9.5px] font-semibold tracking-widest text-muted uppercase">
                    {header === 'recent' ? 'Recently opened' : header}
                  </div>
                )}
                <button
                  className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] ${
                    i === cursor ? 'bg-panel2 text-ink' : 'text-muted hover:bg-panel2/60'
                  }`}
                  onMouseEnter={() => setCursor(i)}
                  onClick={item.run}
                >
                  <span className="flex h-5 w-5 flex-none items-center justify-center">
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.hint && (
                    <span className="flex-none text-[10px] text-muted">{item.hint}</span>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function usePaletteItems(query: string, close: () => void): PaletteItem[] {
  const s = useStore()
  const syncProvider = useSyncStore((st) => st.provider)
  const setGithubDialogOpen = useUiStore((st) => st.setGithubDialogOpen)
  const setDriveDialogOpen = useUiStore((st) => st.setDriveDialogOpen)
  const setShareDialogOpen = useUiStore((st) => st.setShareDialogOpen)
  const setShortcutsOpen = useUiStore((st) => st.setShortcutsOpen)
  const setPanel = useCollabStore((st) => st.setPanel)

  return useMemo(() => {
    const q = query.trim().toLowerCase()
    const match = (text: string) => !q || text.toLowerCase().includes(q)
    const done = (fn: () => void) => () => {
      fn()
      close()
    }
    const items: PaletteItem[] = []

    /* actions */
    const actions: [string, React.ReactNode, () => void, string?][] = [
      ['New note', <FileKindIcon kind="note" size={14} />, () => s.openNote(s.createNote())],
      ['New document', <FileKindIcon kind="richdoc" size={14} />, () => s.openDoc(s.createDoc())],
      ['New spreadsheet', <FileKindIcon kind="sheet" size={14} />, () => s.openSheet(s.createSheetDoc())],
      ['New presentation', <FileKindIcon kind="presentation" size={14} />, () => s.openPresent(s.createPresentDoc())],
      ['New code file', <FileKindIcon kind="code" size={14} />, () => s.openCode(s.createCode())],
      ['New board', <IcBoard size={14} />, () => s.addBoard()],
      ['New project', <IcPlus size={14} />, () => s.setActiveProject(s.createProject())],
      [
        s.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        s.theme === 'dark' ? <IcSun size={14} /> : <IcMoon size={14} />,
        () => s.setTheme(s.theme === 'dark' ? 'light' : 'dark'),
      ],
      ['GitHub — sync code', <IcGithub size={14} />, () => setGithubDialogOpen(true)],
      ['Google Drive — connect & diagnostics', <IcCloud size={14} />, () => setDriveDialogOpen(true)],
      ['Share — members & invites', <IcUserPlus size={14} />, () => setShareDialogOpen(true)],
      ['Comments', <IcMessage size={14} />, () => setPanel('comments')],
      ['Activity log', <IcActivity size={14} />, () => setPanel('activity')],
      ['Version history', <IcHistory size={14} />, () => setPanel('versions')],
      ['Keyboard shortcuts', <IcKeyboard size={14} />, () => setShortcutsOpen(true), 'Ctrl /'],
    ]
    if (syncProvider === 'google-drive') {
      actions.push(['Sync now (Google Drive)', <IcCloud size={14} />, () => void syncEngine.syncNow()])
    }
    const MODES: [ViewMode, string][] = [
      ['board', 'Go to Board'],
      ['split', 'Go to Split'],
      ['doc', 'Go to Document'],
      ['sheet', 'Go to Sheet'],
      ['presentation', 'Go to Presentation'],
      ['code', 'Go to Code'],
      ['photo', 'Go to Photo'],
    ]
    for (const [mode, label] of MODES) {
      actions.push([label, <IcBoard size={14} />, () => s.setViewMode(mode), 'mode'])
    }
    for (const [label, icon, run, hint] of actions) {
      if (match(label)) {
        items.push({ key: `a:${label}`, icon, label, hint, section: 'actions', run: done(run) })
      }
    }

    /* recents (only when not searching) */
    if (!q) {
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
        items.push({
          key: `r:${r.kind}:${r.id}`,
          icon: <FileKindIcon kind={RECENT_KIND_ICON[r.kind]} size={14} />,
          label: resolved,
          hint: <IcClock size={10} />,
          section: 'recent',
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

    /* project-scoped entity search */
    if (q) {
      const pid = s.activeProjectId
      const pool: PaletteItem[] = []
      for (const n of Object.values(s.notes)) {
        if (n.projectId === pid && match(n.title)) {
          pool.push({
            key: `n:${n.id}`, icon: <FileKindIcon kind="note" size={14} />, label: n.title,
            hint: 'note', section: 'files', run: done(() => s.openNote(n.id)),
          })
        }
      }
      for (const d of Object.values(s.docs)) {
        if (d.projectId === pid && match(d.title)) {
          pool.push({
            key: `d:${d.id}`, icon: <FileKindIcon kind="richdoc" size={14} />, label: d.title,
            hint: 'document', section: 'files', run: done(() => s.openDoc(d.id)),
          })
        }
      }
      for (const sh of Object.values(s.sheetDocs)) {
        if (sh.projectId === pid && match(sh.title)) {
          pool.push({
            key: `s:${sh.id}`, icon: <FileKindIcon kind="sheet" size={14} />, label: sh.title,
            hint: 'sheet', section: 'files', run: done(() => s.openSheet(sh.id)),
          })
        }
      }
      for (const p of Object.values(s.presentDocs)) {
        if (p.projectId === pid && match(p.title)) {
          pool.push({
            key: `pr:${p.id}`, icon: <FileKindIcon kind="presentation" size={14} />, label: p.title,
            hint: 'presentation', section: 'files', run: done(() => s.openPresent(p.id)),
          })
        }
      }
      for (const c of Object.values(s.codeDocs)) {
        if (c.projectId === pid && match(`${c.title}.${c.extension}`)) {
          pool.push({
            key: `c:${c.id}`, icon: <FileKindIcon kind="code" size={14} />,
            label: `${c.title}.${c.extension}`, hint: c.language, section: 'files',
            run: done(() => s.openCode(c.id)),
          })
        }
      }
      for (const a of Object.values(s.assets)) {
        if (a.projectId === pid && match(a.name)) {
          pool.push({
            key: `as:${a.id}`, icon: <FileKindIcon kind="file" size={14} />, label: a.name,
            hint: a.kind, section: 'files', run: done(() => s.openAsset(a.id)),
          })
        }
      }
      items.push(...pool.slice(0, 12))

      for (const b of Object.values(s.boards)) {
        if (b.projectId === pid && match(b.name)) {
          items.push({
            key: `b:${b.id}`, icon: <IcBoard size={14} />, label: b.name,
            hint: `${b.nodes.length} cards`, section: 'boards',
            run: done(() => {
              s.setActiveBoard(b.id)
              if (s.viewMode !== 'board' && s.viewMode !== 'split') s.setViewMode('board')
            }),
          })
        }
      }
      for (const p of Object.values(s.projects)) {
        if (match(p.name)) {
          items.push({
            key: `p:${p.id}`, icon: <IcFolder size={14} />,
            label: `${p.icon} ${p.name}`,
            hint: p.id === s.activeProjectId ? 'current' : 'switch project',
            section: 'projects', run: done(() => s.setActiveProject(p.id)),
          })
        }
      }
    }

    return items.slice(0, 30)
  }, [query, s, syncProvider, setGithubDialogOpen, setDriveDialogOpen, setShareDialogOpen, setShortcutsOpen, setPanel, close])
}
