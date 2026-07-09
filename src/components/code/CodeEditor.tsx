import { useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import './monacoSetup'
import { useStore } from '@/store/useStore'
import { storage } from '@/lib/storage/StorageProvider'

/**
 * Monaco-backed editor bound to a code document. Loads the source lazily
 * from the StorageProvider, debounce-saves back, and follows the app
 * theme. `mini` is the trimmed read-only variant used on board cards.
 */
export default function CodeEditor({
  codeId,
  readOnly = false,
  mini = false,
}: {
  codeId: string
  readOnly?: boolean
  mini?: boolean
}) {
  const meta = useStore((s) => s.codeDocs[codeId])
  const theme = useStore((s) => s.theme)
  const persistCodeContent = useStore((s) => s.persistCodeContent)
  const [initial, setInitial] = useState<string | null>(null)
  const saveTimer = useRef<number | undefined>(undefined)
  const pending = useRef<string | null>(null)

  useEffect(() => {
    let alive = true
    setInitial(null)
    pending.current = null
    void storage
      .getDocument(codeId)
      .then((v) => {
        if (alive) setInitial(typeof v === 'string' ? v : '')
      })
      .catch(() => {
        if (alive) setInitial('')
      })
    return () => {
      alive = false
    }
  }, [codeId])

  // flush unsaved edits when the editor unmounts
  useEffect(() => {
    return () => {
      if (pending.current !== null) {
        window.clearTimeout(saveTimer.current)
        persistCodeContent(codeId, pending.current)
        pending.current = null
      }
    }
  }, [codeId, persistCodeContent])

  if (initial === null || !meta) {
    return <div className="placeholder">Loading code…</div>
  }

  return (
    <Editor
      key={codeId}
      defaultValue={initial}
      language={meta.language}
      theme={theme === 'dark' ? 'vs-dark' : 'light'}
      onChange={(value) => {
        if (readOnly || value === undefined) return
        pending.current = value
        window.clearTimeout(saveTimer.current)
        saveTimer.current = window.setTimeout(() => {
          pending.current = null
          persistCodeContent(codeId, value)
        }, 600)
      }}
      options={{
        readOnly,
        minimap: { enabled: !mini },
        fontSize: mini ? 12 : 13,
        lineNumbers: mini ? 'off' : 'on',
        folding: !mini,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        padding: { top: 8 },
        renderLineHighlight: mini ? 'none' : 'line',
        contextmenu: !mini,
        scrollbar: mini
          ? { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 }
          : undefined,
      }}
    />
  )
}
