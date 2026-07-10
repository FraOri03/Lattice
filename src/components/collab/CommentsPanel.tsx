import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/store/useStore'
import { useCollabStore } from '@/lib/collab/collabStore'
import { commentService } from '@/lib/collab/CommentService'
import { membersService } from '@/lib/collab/MembersService'
import { useCan, useMyRole } from '@/lib/collab/useCollab'
import { currentIdentity, colorForUser } from '@/lib/collab/CollaborationProvider'
import { can } from '@/lib/collab/permissions'
import type { CommentTargetType, CommentThread } from '@/types/collab'
import { toast } from '@/components/ui/Toaster'
import {
  IcCheck,
  IcMessage,
  IcPin,
  IcReply,
  IcRestore,
  IcSend,
  IcTrash,
} from '@/components/Icons'

/**
 * CommentsPanel — every thread in the project, filterable, threaded,
 * resolvable. The composer attaches to whatever the user is looking at
 * (selected card, open document/code/sheet, else the board itself);
 * board pins are placed with the pin tool in the canvas toolbar.
 */

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

/** Human label for a thread's target ("card ‘Roadmap’", "code utils.ts"). */
function useTargetLabel() {
  const boards = useStore((s) => s.boards)
  const docs = useStore((s) => s.docs)
  const codeDocs = useStore((s) => s.codeDocs)
  const sheetDocs = useStore((s) => s.sheetDocs)
  const assets = useStore((s) => s.assets)
  const notes = useStore((s) => s.notes)
  return (t: CommentThread): string => {
    switch (t.targetType) {
      case 'board':
        return `board “${boards[t.targetId]?.name ?? '?'}”`
      case 'doc':
        return `doc “${docs[t.targetId]?.title ?? '?'}”`
      case 'code': {
        const c = codeDocs[t.targetId]
        return c ? `code ${c.title}.${c.extension}${t.anchor?.line ? `:${t.anchor.line}` : ''}` : 'code file'
      }
      case 'sheet':
        return `sheet “${sheetDocs[t.targetId]?.title ?? '?'}”`
      case 'asset':
        return `asset “${assets[t.targetId]?.name ?? '?'}”`
      default: {
        const board = t.anchor?.boardId ? boards[t.anchor.boardId] : undefined
        const node = board?.nodes.find((n) => n.id === t.targetId)
        const title =
          node?.data.section?.title ??
          (node?.data.title as string | undefined) ??
          (node?.data.noteId ? notes[node.data.noteId]?.title : undefined) ??
          (node?.data.docId ? docs[node.data.docId]?.title : undefined) ??
          (node?.data.codeId ? codeDocs[node.data.codeId]?.title : undefined) ??
          (node?.data.sheetId ? sheetDocs[node.data.sheetId]?.title : undefined) ??
          (node?.data.assetId ? assets[node.data.assetId]?.name : undefined)
        return `${t.targetType === 'section' ? 'section' : 'card'}${title ? ` “${title}”` : ''}`
      }
    }
  }
}

function Avatar({ userId, name, avatarUrl }: { userId: string; name: string; avatarUrl?: string }) {
  return (
    <span
      className="flex h-6 w-6 flex-none items-center justify-center overflow-hidden rounded-full border border-bord bg-panel2 text-[10px] font-bold"
      style={{ color: colorForUser(userId) }}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </span>
  )
}

function ThreadCard({
  thread,
  label,
  focused,
}: {
  thread: CommentThread
  label: string
  focused: boolean
}) {
  const projectId = useStore((s) => s.activeProjectId)
  const myRole = useMyRole()
  const identity = currentIdentity()
  const [replying, setReplying] = useState(false)
  const [reply, setReply] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [focused])

  const own = thread.authorId === identity.userId
  const mayResolve =
    can(myRole, 'comments.resolve-any') || (own && can(myRole, 'comments.resolve-own'))
  const mayReply = can(myRole, 'comments.add')

  const sendReply = () => {
    if (commentService.reply(projectId, thread.id, reply)) {
      setReply('')
      setReplying(false)
    }
  }

  return (
    <div
      ref={ref}
      className={`mb-2 rounded-lg border p-2.5 ${
        focused ? 'border-accent bg-accent/5' : 'border-bord'
      } ${thread.resolved ? 'opacity-70' : ''}`}
    >
      <div className="mb-1 flex items-center gap-2">
        <Avatar userId={thread.authorId} name={thread.authorName} avatarUrl={thread.authorAvatar} />
        <div className="min-w-0 flex-1">
          <span className="text-[12px] font-semibold">{thread.authorName}</span>
          <span className="ml-1.5 text-[10px] text-muted">{timeAgo(thread.createdAt)}</span>
        </div>
        {thread.resolved ? (
          mayResolve && (
            <button
              className="icon-btn h-5 w-5"
              title="Reopen"
              aria-label="Reopen comment"
              onClick={() => commentService.setResolved(projectId, thread.id, false)}
            >
              <IcRestore size={11} />
            </button>
          )
        ) : (
          mayResolve && (
            <button
              className="icon-btn h-5 w-5"
              title="Resolve"
              aria-label="Resolve comment"
              onClick={() => commentService.setResolved(projectId, thread.id, true)}
            >
              <IcCheck size={11} />
            </button>
          )
        )}
        {own && (
          <button
            className="icon-btn h-5 w-5"
            title="Delete thread"
            aria-label="Delete comment thread"
            onClick={() => commentService.remove(projectId, thread.id)}
          >
            <IcTrash size={11} />
          </button>
        )}
      </div>
      <div className="mb-1 flex items-center gap-1 text-[10px] text-muted">
        <IcPin size={9} /> {label}
        {thread.resolved && thread.resolvedByName && (
          <span>· resolved by {thread.resolvedByName}</span>
        )}
      </div>
      <p className="text-[12px] leading-relaxed break-words whitespace-pre-wrap">{thread.body}</p>

      {thread.replies.map((r) => (
        <div key={r.id} className="mt-2 flex gap-2 border-l-2 border-bord pl-2">
          <Avatar userId={r.authorId} name={r.authorName} avatarUrl={r.authorAvatar} />
          <div className="min-w-0 flex-1">
            <div>
              <span className="text-[11.5px] font-semibold">{r.authorName}</span>
              <span className="ml-1.5 text-[10px] text-muted">{timeAgo(r.createdAt)}</span>
            </div>
            <p className="text-[11.5px] leading-relaxed break-words whitespace-pre-wrap">{r.body}</p>
          </div>
        </div>
      ))}

      {mayReply &&
        (replying ? (
          <div className="mt-2 flex gap-1.5">
            <input
              className="field !py-1 text-[12px]"
              placeholder="Reply… (@name to mention)"
              value={reply}
              autoFocus
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') sendReply()
                if (e.key === 'Escape') setReplying(false)
              }}
            />
            <button className="icon-btn" aria-label="Send reply" onClick={sendReply}>
              <IcSend size={12} />
            </button>
          </div>
        ) : (
          <button
            className="mt-1.5 flex cursor-pointer items-center gap-1 text-[11px] text-muted hover:text-accent"
            onClick={() => setReplying(true)}
          >
            <IcReply size={11} /> Reply
          </button>
        ))}
    </div>
  )
}

export function CommentsPanel() {
  const projectId = useStore((s) => s.activeProjectId)
  const viewMode = useStore((s) => s.viewMode)
  const activeBoardId = useStore((s) => s.activeBoardId)
  const activeDocId = useStore((s) => s.activeDocId)
  const activeCodeId = useStore((s) => s.activeCodeId)
  const activeSheetId = useStore((s) => s.activeSheetId)
  const activeAssetId = useStore((s) => s.activeAssetId)
  const boards = useStore((s) => s.boards)
  const comments = useCollabStore((s) => s.comments[projectId]) ?? []
  const filter = useCollabStore((s) => s.commentFilter)
  const setFilter = useCollabStore((s) => s.setCommentFilter)
  const focusedThreadId = useCollabStore((s) => s.focusedThreadId)
  const [draft, setDraft] = useState('')
  const mayComment = useCan('comments.add')
  const labelOf = useTargetLabel()

  const visible = useMemo(
    () =>
      comments
        .filter((t) =>
          filter === 'all' ? true : filter === 'open' ? !t.resolved : t.resolved,
        )
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [comments, filter],
  )

  /** Where a new comment lands, based on what's on screen. */
  const target = useMemo((): {
    type: CommentTargetType
    id: string
    label: string
    anchor?: { boardId: string }
  } | null => {
    if (activeDocId) return { type: 'doc', id: activeDocId, label: 'this document' }
    if (activeCodeId) return { type: 'code', id: activeCodeId, label: 'this code file' }
    if (activeSheetId) return { type: 'sheet', id: activeSheetId, label: 'this sheet' }
    if (activeAssetId) return { type: 'asset', id: activeAssetId, label: 'this asset' }
    if (viewMode === 'board' || viewMode === 'split') {
      const board = boards[activeBoardId]
      if (!board) return null
      const selected = board.nodes.find((n) => n.selected)
      if (selected) {
        return {
          type: selected.type === 'section' ? 'section' : 'card',
          id: selected.id,
          label: 'selected card',
          anchor: { boardId: activeBoardId },
        }
      }
      return { type: 'board', id: activeBoardId, label: `board “${board.name}”` }
    }
    return null
  }, [activeDocId, activeCodeId, activeSheetId, activeAssetId, viewMode, boards, activeBoardId])

  const send = () => {
    if (!target || !draft.trim()) return
    const thread = commentService.add(projectId, target.type, target.id, draft, target.anchor)
    if (thread) {
      setDraft('')
      if (thread.mentions.length) toast.info(`Mentioned: ${thread.mentions.join(', ')}`)
    }
  }

  const counts = {
    open: comments.filter((t) => !t.resolved).length,
    resolved: comments.filter((t) => t.resolved).length,
  }

  return (
    <div className="flex h-full flex-col">
      {/* filter chips */}
      <div className="flex gap-1.5 px-3 pt-2 pb-1">
        {(['open', 'resolved', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`cursor-pointer rounded-full border px-2 py-0.5 text-[10.5px] font-medium capitalize ${
              filter === f
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-bord text-muted hover:text-ink'
            }`}
          >
            {f}
            {f !== 'all' && ` (${counts[f]})`}
          </button>
        ))}
      </div>

      {/* threads */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {visible.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted">
            <IcMessage size={22} />
            <p className="text-[12px]">No {filter !== 'all' ? filter : ''} comments</p>
            <p className="max-w-52 text-[11px]">
              {mayComment
                ? 'Comment below, or use the pin tool on the board toolbar to comment a spot on the canvas.'
                : 'Your role can view comments but not add them.'}
            </p>
          </div>
        )}
        {visible.map((t) => (
          <ThreadCard key={t.id} thread={t} label={labelOf(t)} focused={t.id === focusedThreadId} />
        ))}
      </div>

      {/* composer */}
      {mayComment && target && (
        <div className="border-t border-bord p-2.5">
          <div className="mb-1 text-[10px] text-muted">
            Commenting on <span className="font-medium">{target.label}</span>
          </div>
          <div className="flex gap-1.5">
            <input
              className="field text-[12px]"
              placeholder="Add a comment… (@name mentions)"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') send()
              }}
              aria-label="New comment"
            />
            <button className="icon-btn" aria-label="Send comment" onClick={send} disabled={!draft.trim()}>
              <IcSend size={13} />
            </button>
          </div>
          {membersService.membersOf(projectId).length > 1 && (
            <div className="mt-1 truncate text-[9.5px] text-muted">
              Mention:{' '}
              {membersService
                .membersOf(projectId)
                .slice(0, 4)
                .map((m) => `@${(m.name || m.email.split('@')[0]).toLowerCase().replace(/\s+/g, '')}`)
                .join(' ')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
