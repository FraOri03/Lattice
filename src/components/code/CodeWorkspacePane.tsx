import { useRef } from 'react'
import { useStore } from '@/store/useStore'
import { useI18n } from '@/lib/i18n'
import { LANGUAGES, extForLang } from '@/lib/code/languages'
import { useCollabStore, isLockFresh } from '@/lib/collab/collabStore'
import { SESSION_ID } from '@/lib/collab/CollaborationProvider'
import { realtimeDocumentSync } from '@/lib/collab/RealtimeDocumentSync'
import { useCan, useReadOnly } from '@/lib/collab/useCollab'
import { githubProvider } from '@/lib/github/GithubCodeProvider'
import { toast } from '@/components/ui/Toaster'
import { IcGithub, IcLock, IcUnlock, IcX } from '@/components/Icons'
import { TOOLBAR_CONTROL_ATTR, useRovingFocus } from '@/components/ui/toolbar'
import CodeEditor from './CodeEditor'

/** Ties the tabs to the editor they control. */
const CODE_PANEL_ID = 'code-editor-panel'

/**
 * VS Code-style workspace pane: tab strip for open files, breadcrumbs,
 * language selector and the Monaco editor. Find/replace comes from Monaco
 * itself (Ctrl+F / Ctrl+H).
 *
 * Phase 7: shows the file's lock state ("‹name› is editing"), lets others
 * request edit control (owner/admin can force-unlock), and surfaces the
 * project's GitHub link state in the footer.
 */

/** Banner shown when another session holds this file's edit lock. */
function LockBanner({ fileId }: { fileId: string }) {
  const lock = useCollabStore((s) => s.locks[fileId])
  const mayForce = useCan('locks.force-unlock')
  if (!isLockFresh(lock) || lock.sessionId === SESSION_ID) return null
  return (
    <div className="flex flex-none items-center gap-2 border-b border-[#ffa629]/30 bg-[#ffa629]/10 px-3 py-1.5 text-[11.5px]">
      <IcLock size={12} className="flex-none text-[#ffa629]" />
      <span className="min-w-0 truncate">
        <b>{lock.userName}</b> is editing this file — it is read-only for you.
      </span>
      <div className="flex-1" />
      <button
        className="cursor-pointer text-[11px] font-medium text-accent hover:underline"
        onClick={() => realtimeDocumentSync.requestEditControl(fileId)}
      >
        Request edit
      </button>
      {mayForce && (
        <button
          className="flex cursor-pointer items-center gap-1 text-[11px] font-medium text-[#f24822] hover:underline"
          title="Owner/admin: break the lock"
          onClick={() => {
            if (realtimeDocumentSync.forceUnlock(fileId))
              toast.success('Lock removed', 'The file is editable again.')
          }}
        >
          <IcUnlock size={11} /> Force unlock
        </button>
      )}
    </div>
  )
}

export default function CodeWorkspacePane() {
  const codeDocs = useStore((s) => s.codeDocs)
  const activeCodeId = useStore((s) => s.activeCodeId)
  // the code files of this project's tab session — since 11.3 there is no
  // separate code-only tab list to keep in step with the open entity
  const session = useStore((s) => s.tabSessions[s.activeProjectId])
  const openCode = useStore((s) => s.openCode)
  const closeCode = useStore((s) => s.closeCode)
  const closeEntityTab = useStore((s) => s.closeEntityTab)
  const updateCodeMeta = useStore((s) => s.updateCodeMeta)
  const project = useStore((s) => s.projects[s.activeProjectId])
  const readOnly = useReadOnly()
  const tc = useI18n().toolbar.code
  const tabStrip = useRef<HTMLDivElement>(null)
  // the tablist borrows the toolbar's roving focus: one tab stop, arrows
  // between files. It is a keyboard model, not a toolbar-only behaviour.
  const tabRoving = useRovingFocus(tabStrip, 'horizontal')

  const meta = activeCodeId ? codeDocs[activeCodeId] : undefined
  if (!meta) return null

  const tabs = (session?.tabs ?? [])
    .filter((t) => t.kind === 'code')
    .map((t) => codeDocs[t.id])
    .filter(Boolean)
  const github = project?.settings.github
  const githubConnected = githubProvider.isConnected()

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col border-r border-bord bg-panel">
      {/* Tab strip. Not a toolbar — Phase 11.1 deliberately does not invent
          one for Code, which has no tools to put in it. It is a tablist, and
          it is now reachable: the chips used to be plain <div onClick>, so
          switching file was impossible without a mouse. */}
      <div
        ref={tabStrip}
        role="tablist"
        aria-label={tc.tabs}
        aria-orientation="horizontal"
        className="flex flex-none items-center gap-0.5 overflow-x-auto border-b border-bord bg-panel2 px-1 pt-1"
        onKeyDown={tabRoving.onKeyDown}
        onFocus={tabRoving.onFocus}
      >
        {tabs.map((tab) => {
          const name = `${tab.title}.${tab.extension}`
          return (
            <div
              key={tab.id}
              className={`code-tab ${tab.id === activeCodeId ? 'is-active' : ''}`}
            >
              <button
                type="button"
                role="tab"
                {...{ [TOOLBAR_CONTROL_ATTR]: '' }}
                aria-selected={tab.id === activeCodeId}
                aria-controls={CODE_PANEL_ID}
                className="max-w-40 cursor-pointer truncate bg-transparent"
                title={name}
                onClick={() => openCode(tab.id)}
              >
                {name}
              </button>
              <button
                type="button"
                {...{ [TOOLBAR_CONTROL_ATTR]: '' }}
                /* the glyph stays 9px, but the target no longer does: it was
                   16×16, under the 24px floor of WCAG 2.2 SC 2.5.8 */
                className="icon-btn -m-1 h-6 w-6 p-1"
                title={tc.closeTab(name)}
                aria-label={tc.closeTab(name)}
                onClick={() => closeEntityTab({ kind: 'code', id: tab.id })}
              >
                <IcX size={9} />
              </button>
            </div>
          )
        })}
        <div className="flex-1" />
        <button
          type="button"
          {...{ [TOOLBAR_CONTROL_ATTR]: '' }}
          className="icon-btn mb-1 flex-none"
          title={tc.closeWorkspace}
          aria-label={tc.closeWorkspace}
          onClick={closeCode}
        >
          <IcX size={13} />
        </button>
      </div>

      <LockBanner fileId={meta.id} />

      {/* breadcrumbs + file header */}
      <div className="flex flex-none items-center gap-2 border-b border-bord px-3 py-1.5">
        <span className="flex-none text-[11px] text-muted">
          vault / code /
        </span>
        <input
          className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold outline-none"
          value={meta.title}
          disabled={readOnly}
          onChange={(e) => updateCodeMeta(meta.id, { title: e.target.value })}
          placeholder={tc.fileNamePlaceholder}
          aria-label={tc.fileName}
        />
        <span className="flex-none text-[11px] text-muted">{tc.lines(meta.lineCount)}</span>
        <select
          className="field h-6 w-32 flex-none cursor-pointer px-1 py-0 text-[11.5px]"
          value={meta.language}
          title={tc.language}
          aria-label={tc.language}
          disabled={readOnly}
          onChange={(e) =>
            updateCodeMeta(meta.id, {
              language: e.target.value,
              extension: extForLang(e.target.value),
            })
          }
        >
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      <div
        id={CODE_PANEL_ID}
        role="tabpanel"
        aria-label={tc.editor}
        className="min-h-0 flex-1"
      >
        <CodeEditor codeId={meta.id} />
      </div>

      <div className="flex flex-none items-center gap-2 border-t border-bord px-3 py-1 text-[10.5px] text-muted">
        <span>Ctrl+F find · Ctrl+H replace · edits auto-save to the vault</span>
        <div className="flex-1" />
        <span
          className="flex items-center gap-1"
          title={
            github
              ? `Linked to ${github.repo} (branch ${github.branch})${githubConnected ? '' : ' — GitHub not connected in this session'}`
              : 'No GitHub repository linked — open the GitHub dialog from the profile menu'
          }
        >
          <IcGithub size={11} />
          {github
            ? `${github.repo} · ${github.branch}${githubConnected ? '' : ' (offline)'}`
            : 'not linked'}
        </span>
      </div>
    </section>
  )
}
