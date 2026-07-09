import { useStore } from '@/store/useStore'
import { LANGUAGES, extForLang } from '@/lib/code/languages'
import { useCollabStore, isLockFresh } from '@/lib/collab/collabStore'
import { SESSION_ID } from '@/lib/collab/CollaborationProvider'
import { realtimeDocumentSync } from '@/lib/collab/RealtimeDocumentSync'
import { useCan, useReadOnly } from '@/lib/collab/useCollab'
import { githubProvider } from '@/lib/github/GithubCodeProvider'
import { toast } from '@/components/ui/Toaster'
import { IcGithub, IcLock, IcUnlock, IcX } from '@/components/Icons'
import CodeEditor from './CodeEditor'

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
  const codeTabs = useStore((s) => s.codeTabs)
  const openCode = useStore((s) => s.openCode)
  const closeCode = useStore((s) => s.closeCode)
  const closeCodeTab = useStore((s) => s.closeCodeTab)
  const updateCodeMeta = useStore((s) => s.updateCodeMeta)
  const project = useStore((s) => s.projects[s.activeProjectId])
  const readOnly = useReadOnly()

  const meta = activeCodeId ? codeDocs[activeCodeId] : undefined
  if (!meta) return null

  const tabs = codeTabs.map((id) => codeDocs[id]).filter(Boolean)
  const github = project?.settings.github
  const githubConnected = githubProvider.isConnected()

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col border-r border-bord bg-panel">
      {/* tab strip */}
      <div className="flex flex-none items-center gap-0.5 overflow-x-auto border-b border-bord bg-panel2 px-1 pt-1">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`code-tab ${tab.id === activeCodeId ? 'is-active' : ''}`}
            onClick={() => openCode(tab.id)}
            title={`${tab.title}.${tab.extension}`}
          >
            <span className="max-w-40 truncate">
              {tab.title}.{tab.extension}
            </span>
            <button
              className="icon-btn h-4 w-4"
              title="Close tab"
              aria-label={`Close ${tab.title}.${tab.extension}`}
              onClick={(e) => {
                e.stopPropagation()
                closeCodeTab(tab.id)
              }}
            >
              <IcX size={9} />
            </button>
          </div>
        ))}
        <div className="flex-1" />
        <button
          className="icon-btn mb-1 flex-none"
          title="Close code workspace"
          aria-label="Close code workspace"
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
          placeholder="filename"
          aria-label="File name"
        />
        <span className="flex-none text-[11px] text-muted">
          {meta.lineCount} lines
        </span>
        <select
          className="field h-6 w-32 flex-none cursor-pointer px-1 py-0 text-[11.5px]"
          value={meta.language}
          title="Language"
          aria-label="Language"
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

      <div className="min-h-0 flex-1">
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
