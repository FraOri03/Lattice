import { useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import './monacoSetup'
import { useStore } from '@/store/useStore'
import { storage } from '@/lib/storage/StorageProvider'
import { useCollabStore, isLockFresh } from '@/lib/collab/collabStore'
import { SESSION_ID } from '@/lib/collab/CollaborationProvider'
import { presenceService } from '@/lib/collab/PresenceService'
import { realtimeDocumentSync } from '@/lib/collab/RealtimeDocumentSync'
import { useReadOnly } from '@/lib/collab/useCollab'
import { toast } from '@/components/ui/Toaster'

/**
 * Monaco-backed editor bound to a code document. Loads the source lazily
 * from the StorageProvider, debounce-saves back, and follows the app
 * theme. `mini` is the trimmed read-only variant used on board cards.
 *
 * Collaboration (Phase 7): editing takes a soft lock on the file — the
 * first keystroke acquires it, a heartbeat keeps it, and other sessions
 * see the editor read-only until it is released (see RealtimeDocumentSync).
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
  const roleReadOnly = useReadOnly()
  const lock = useCollabStore((s) => s.locks[codeId])
  const [initial, setInitial] = useState<string | null>(null)
  /** bumped when a remote save replaces the buffer, to remount Monaco */
  const [rev, setRev] = useState(0)
  const saveTimer = useRef<number | undefined>(undefined)
  const pending = useRef<string | null>(null)

  const lockedByOther = !mini && isLockFresh(lock) && lock.sessionId !== SESSION_ID
  const effectiveReadOnly = readOnly || roleReadOnly || lockedByOther

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

  // flush unsaved edits + release the lock when the editor unmounts
  useEffect(() => {
    return () => {
      if (pending.current !== null) {
        window.clearTimeout(saveTimer.current)
        persistCodeContent(codeId, pending.current)
        pending.current = null
      }
      if (!mini) {
        realtimeDocumentSync.releaseLock(codeId)
        presenceService.setEditing(undefined)
      }
    }
  }, [codeId, persistCodeContent, mini])

  // another session saved this file: refresh when we're not the editor
  useEffect(() => {
    if (mini) return
    return realtimeDocumentSync.onRemoteUpdate(codeId, () => {
      if (realtimeDocumentSync.iHoldLock(codeId)) return
      void storage.getDocument(codeId).then((v) => {
        if (typeof v === 'string') {
          setInitial(v)
          setRev((r) => r + 1)
        }
      })
    })
  }, [codeId, mini])

  if (initial === null || !meta) {
    return <div className="placeholder">Loading code…</div>
  }

  return (
    <Editor
      key={`${codeId}:${rev}`}
      defaultValue={initial}
      language={meta.language}
      theme={theme === 'dark' ? 'vs-dark' : 'light'}
      onChange={(value) => {
        if (effectiveReadOnly || value === undefined) return
        if (!mini && !realtimeDocumentSync.iHoldLock(codeId)) {
          if (!realtimeDocumentSync.acquireLock(codeId)) {
            toast.warning('File is being edited by someone else')
            return
          }
          presenceService.setEditing({
            kind: 'code',
            id: codeId,
            title: `${meta.title}.${meta.extension}`,
          })
        }
        pending.current = value
        window.clearTimeout(saveTimer.current)
        saveTimer.current = window.setTimeout(() => {
          pending.current = null
          persistCodeContent(codeId, value)
        }, 600)
      }}
      options={{
        readOnly: effectiveReadOnly,
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
