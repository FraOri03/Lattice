import { useStore } from '@/store/useStore'
import { LANGUAGES, extForLang } from '@/lib/code/languages'
import { IcX } from '@/components/Icons'
import CodeEditor from './CodeEditor'

/**
 * VS Code-style workspace pane: tab strip for open files, breadcrumbs,
 * language selector and the Monaco editor. Find/replace comes from Monaco
 * itself (Ctrl+F / Ctrl+H).
 */
export default function CodeWorkspacePane() {
  const codeDocs = useStore((s) => s.codeDocs)
  const activeCodeId = useStore((s) => s.activeCodeId)
  const codeTabs = useStore((s) => s.codeTabs)
  const openCode = useStore((s) => s.openCode)
  const closeCode = useStore((s) => s.closeCode)
  const closeCodeTab = useStore((s) => s.closeCodeTab)
  const updateCodeMeta = useStore((s) => s.updateCodeMeta)

  const meta = activeCodeId ? codeDocs[activeCodeId] : undefined
  if (!meta) return null

  const tabs = codeTabs.map((id) => codeDocs[id]).filter(Boolean)

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
          onClick={closeCode}
        >
          <IcX size={13} />
        </button>
      </div>

      {/* breadcrumbs + file header */}
      <div className="flex flex-none items-center gap-2 border-b border-bord px-3 py-1.5">
        <span className="flex-none text-[11px] text-muted">
          vault / code /
        </span>
        <input
          className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold outline-none"
          value={meta.title}
          onChange={(e) => updateCodeMeta(meta.id, { title: e.target.value })}
          placeholder="filename"
        />
        <span className="flex-none text-[11px] text-muted">
          {meta.lineCount} lines
        </span>
        <select
          className="field h-6 w-32 flex-none cursor-pointer px-1 py-0 text-[11.5px]"
          value={meta.language}
          title="Language"
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

      <div className="flex-none border-t border-bord px-3 py-1 text-[10.5px] text-muted">
        Ctrl+F find · Ctrl+H replace · edits auto-save to the vault
      </div>
    </section>
  )
}
