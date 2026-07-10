import { useEffect, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import { MonacoBinding } from 'y-monaco'
import type { Awareness } from 'y-protocols/awareness'
import './monacoSetup'
import { useStore } from '@/store/useStore'
import { storage } from '@/lib/storage/StorageProvider'
import { useCollabStore, isLockFresh } from '@/lib/collab/collabStore'
import {
  colorForUser,
  currentIdentity,
  SESSION_ID,
} from '@/lib/collab/CollaborationProvider'
import { presenceService } from '@/lib/collab/PresenceService'
import { realtimeDocumentSync } from '@/lib/collab/RealtimeDocumentSync'
import { useReadOnly } from '@/lib/collab/useCollab'
import { yjsManager } from '@/lib/crdt/YjsManager'
import { useCrdtStore } from '@/lib/crdt/crdtStore'
import { codeNeedsSeed, codeText, seedCode } from '@/lib/crdt/CodeCRDT'
import { awareness as awarenessService } from '@/lib/crdt/AwarenessService'
import { toast } from '@/components/ui/Toaster'

/**
 * Monaco-backed editor bound to a code document.
 *
 * Two project-level collaboration modes (Project settings →
 * "Code editing policy"):
 *
 *  - collaborative (default): the buffer IS the shared Y.Text — several
 *    people type at once, cursors/selections/labels are live, offline
 *    edits queue in IndexedDB and merge deterministically on reconnect.
 *
 *  - checkout: Phase 7 soft locks — one active editor; others see a
 *    read-only buffer, may request control, and owner/admin can
 *    force-unlock. No CRDT binding in this mode.
 *
 * Either way, saves re-export the current buffer to the StorageProvider
 * so Drive backup, GitHub commits and digests read reconciled content.
 * `mini` is the trimmed read-only board-card variant (storage snapshot).
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
  const policy = useStore((s) => {
    const projectId = s.codeDocs[codeId]?.projectId ?? s.activeProjectId
    return s.projects[projectId]?.settings.codeEditingPolicy ?? 'collaborative'
  })
  if (!meta) return <div className="placeholder">Loading code…</div>
  if (!mini && policy === 'collaborative') {
    return <CollabCodeEditor codeId={codeId} readOnly={readOnly} />
  }
  return <CheckoutCodeEditor codeId={codeId} readOnly={readOnly} mini={mini} />
}

/* ================= collaborative (CRDT) mode ================= */

/** Escape a name for use inside a CSS content string. */
function cssName(name: string): string {
  return name.replace(/[\\"'\n\r{}<>]/g, '').slice(0, 40) || 'User'
}

/**
 * y-monaco renders remote selections with per-client class names but no
 * colors; this keeps one shared <style> element in sync with awareness
 * so every remote caret gets its user's color and a name label.
 */
function syncRemoteCursorStyles(aw: Awareness, styleEl: HTMLStyleElement): void {
  const rules: string[] = []
  aw.getStates().forEach((state, clientId) => {
    if (clientId === aw.clientID) return
    const user = (state as { user?: { name?: string; color?: string } }).user
    if (!user?.color) return
    const color = user.color
    const name = cssName(user.name ?? 'User')
    rules.push(
      `.yRemoteSelection-${clientId} { background-color: ${color}33; }`,
      `.yRemoteSelectionHead-${clientId} { position: relative; border-left: 2px solid ${color}; }`,
      `.yRemoteSelectionHead-${clientId}::after { content: "${name}"; position: absolute; top: -1.3em; left: -2px; padding: 0 4px; border-radius: 3px 3px 3px 0; background: ${color}; color: #fff; font-size: 9px; font-weight: 600; white-space: nowrap; pointer-events: none; z-index: 10; }`,
    )
  })
  styleEl.textContent = rules.join('\n')
}

function CollabCodeEditor({
  codeId,
  readOnly,
}: {
  codeId: string
  readOnly: boolean
}) {
  const meta = useStore((s) => s.codeDocs[codeId])
  const theme = useStore((s) => s.theme)
  const persistCodeContent = useStore((s) => s.persistCodeContent)
  const roleReadOnly = useReadOnly()
  const attachEpoch = useCrdtStore((s) => s.attachEpoch)
  const projectId =
    useStore((s) => s.codeDocs[codeId]?.projectId) ??
    useStore.getState().activeProjectId
  const [ready, setReady] = useState<string | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const effectiveReadOnly = readOnly || roleReadOnly

  // wait for the room's IndexedDB load + the stored body (migration seed)
  useEffect(() => {
    let alive = true
    setReady(null)
    const room = yjsManager.room(projectId)
    void Promise.all([
      room.loaded,
      storage.getDocument(codeId).catch(() => undefined),
    ]).then(([, body]) => {
      if (alive) setReady(typeof body === 'string' ? body : '')
    })
    return () => {
      alive = false
    }
  }, [codeId, projectId])

  // release binding + presence when unmounting or switching files
  useEffect(() => {
    return () => {
      cleanupRef.current?.()
      cleanupRef.current = null
      presenceService.setEditing(undefined)
      awarenessService.clearCodeLine()
    }
  }, [codeId, attachEpoch])

  const onMount: OnMount = (editor) => {
    const model = editor.getModel()
    if (!model) return
    const room = yjsManager.room(projectId)
    if (ready !== null && codeNeedsSeed(room, codeId)) {
      seedCode(room, codeId, ready)
    }
    const yText = codeText(room, codeId)
    const aw = yjsManager.contentAwareness(projectId) as Awareness
    const identity = currentIdentity()
    aw.setLocalStateField('user', {
      name: identity.name || 'User',
      color: colorForUser(identity.userId),
    })

    const binding = new MonacoBinding(yText, model, new Set([editor]), aw)

    // remote caret colors + labels
    const styleEl = document.createElement('style')
    document.head.appendChild(styleEl)
    const refreshStyles = () => syncRemoteCursorStyles(aw, styleEl)
    aw.on('change', refreshStyles)
    refreshStyles()

    // durable export: debounce-save the merged buffer; remote-only
    // changes persist silently (their author logs the activity)
    let saveTimer: number | undefined
    let locallyDirty = false
    const observer = (_e: unknown, tx: { origin: unknown }) => {
      if (tx.origin === binding) locallyDirty = true
      window.clearTimeout(saveTimer)
      saveTimer = window.setTimeout(() => {
        const silent = !locallyDirty
        locallyDirty = false
        persistCodeContent(codeId, yText.toString(), { silent })
      }, 600)
    }
    yText.observe(observer)

    // presence: active file + cursor line
    const m = useStore.getState().codeDocs[codeId]
    const cursorSub = editor.onDidChangeCursorPosition((e) => {
      awarenessService.setCodeLine({ codeId, line: e.position.lineNumber })
    })
    const focusSub = editor.onDidFocusEditorText(() => {
      presenceService.setEditing({
        kind: 'code',
        id: codeId,
        title: m ? `${m.title}.${m.extension}` : 'code',
      })
    })
    const blurSub = editor.onDidBlurEditorText(() =>
      presenceService.setEditing(undefined),
    )

    cleanupRef.current = () => {
      window.clearTimeout(saveTimer)
      // flush the latest merged state before unbinding
      persistCodeContent(codeId, yText.toString(), { silent: !locallyDirty })
      yText.unobserve(observer)
      aw.off('change', refreshStyles)
      styleEl.remove()
      cursorSub.dispose()
      focusSub.dispose()
      blurSub.dispose()
      binding.destroy()
    }
  }

  if (ready === null || !meta) {
    return <div className="placeholder">Loading code…</div>
  }

  return (
    <Editor
      key={`${codeId}:${attachEpoch}`}
      language={meta.language}
      theme={theme === 'dark' ? 'vs-dark' : 'light'}
      onMount={onMount}
      options={{
        readOnly: effectiveReadOnly,
        minimap: { enabled: true },
        fontSize: 13,
        lineNumbers: 'on',
        folding: true,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        padding: { top: 8 },
        renderLineHighlight: 'line',
        contextmenu: true,
      }}
    />
  )
}

/* ================= checkout (soft lock) mode ================= */

function CheckoutCodeEditor({
  codeId,
  readOnly,
  mini,
}: {
  codeId: string
  readOnly: boolean
  mini: boolean
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
