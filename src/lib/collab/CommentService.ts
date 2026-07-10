import { nid } from '@/lib/id'
import type {
  CommentAnchor,
  CommentReply,
  CommentTargetType,
  CommentThread,
} from '@/types/collab'
import { useCollabStore } from './collabStore'
import { currentIdentity } from './CollaborationProvider'
import { membersService } from './MembersService'
import { can } from './permissions'
import { activityLog } from './ActivityLogService'
import { collabHub } from './hub'

/**
 * CommentService — threaded comments on boards, cards, sections,
 * documents, code files, sheets, assets and web embeds. @name mentions
 * are parsed against the member list.
 */

const MENTION_RE = /@([\w.-]+)/g

function parseMentions(projectId: string, body: string): string[] {
  const memberNames = new Set(
    membersService
      .membersOf(projectId)
      .flatMap((m) => [m.name.toLowerCase(), m.email.split('@')[0]?.toLowerCase()])
      .filter(Boolean),
  )
  const found = new Set<string>()
  for (const m of body.matchAll(MENTION_RE)) {
    const name = m[1].toLowerCase()
    if (memberNames.has(name)) found.add(name)
  }
  return [...found]
}

class CommentService {
  threadsOf(projectId: string): CommentThread[] {
    return useCollabStore.getState().comments[projectId] ?? []
  }

  threadsForTarget(
    projectId: string,
    targetType: CommentTargetType,
    targetId: string,
  ): CommentThread[] {
    return this.threadsOf(projectId).filter(
      (t) => t.targetType === targetType && t.targetId === targetId,
    )
  }

  /** Unresolved-thread count for badges (cards, docs, code tabs). */
  openCount(projectId: string, targetType: CommentTargetType, targetId: string): number {
    return this.threadsForTarget(projectId, targetType, targetId).filter(
      (t) => !t.resolved,
    ).length
  }

  add(
    projectId: string,
    targetType: CommentTargetType,
    targetId: string,
    body: string,
    anchor?: CommentAnchor,
  ): CommentThread | null {
    const text = body.trim()
    if (!text) return null
    if (!can(membersService.effectiveRole(projectId), 'comments.add')) return null
    const identity = currentIdentity()
    const now = Date.now()
    const thread: CommentThread = {
      id: nid('cmt'),
      projectId,
      targetType,
      targetId,
      anchor,
      authorId: identity.userId,
      authorName: identity.name,
      authorAvatar: identity.avatarUrl || undefined,
      body: text,
      mentions: parseMentions(projectId, text),
      createdAt: now,
      updatedAt: now,
      resolved: false,
      replies: [],
    }
    const s = useCollabStore.getState()
    s.setComments(projectId, [thread, ...this.threadsOf(projectId)])
    activityLog.log(
      projectId,
      'comment.added',
      `Comment on ${targetType}: “${text.slice(0, 60)}${text.length > 60 ? '…' : ''}”`,
      thread.id,
    )
    collabHub.broadcastState(projectId)
    return thread
  }

  reply(projectId: string, threadId: string, body: string): boolean {
    const text = body.trim()
    if (!text) return false
    if (!can(membersService.effectiveRole(projectId), 'comments.add')) return false
    const identity = currentIdentity()
    const now = Date.now()
    const reply: CommentReply = {
      id: nid('rep'),
      authorId: identity.userId,
      authorName: identity.name,
      authorAvatar: identity.avatarUrl || undefined,
      body: text,
      createdAt: now,
      updatedAt: now,
    }
    this.patch(projectId, threadId, (t) => ({
      ...t,
      replies: [...t.replies, reply],
      updatedAt: now,
    }))
    return true
  }

  /** Resolve/reopen. Commenters may only resolve their own threads. */
  setResolved(projectId: string, threadId: string, resolved: boolean): boolean {
    const role = membersService.effectiveRole(projectId)
    const thread = this.threadsOf(projectId).find((t) => t.id === threadId)
    if (!thread) return false
    const identity = currentIdentity()
    const own = thread.authorId === identity.userId
    if (!(can(role, 'comments.resolve-any') || (own && can(role, 'comments.resolve-own'))))
      return false
    this.patch(projectId, threadId, (t) => ({
      ...t,
      resolved,
      resolvedBy: resolved ? identity.userId : undefined,
      resolvedByName: resolved ? identity.name : undefined,
      updatedAt: Date.now(),
    }))
    if (resolved) {
      activityLog.log(
        projectId,
        'comment.resolved',
        `Comment resolved: “${thread.body.slice(0, 50)}”`,
        threadId,
      )
    }
    return true
  }

  remove(projectId: string, threadId: string): boolean {
    const thread = this.threadsOf(projectId).find((t) => t.id === threadId)
    if (!thread) return false
    const identity = currentIdentity()
    const role = membersService.effectiveRole(projectId)
    if (thread.authorId !== identity.userId && !can(role, 'comments.resolve-any'))
      return false
    const s = useCollabStore.getState()
    s.setComments(
      projectId,
      this.threadsOf(projectId).filter((t) => t.id !== threadId),
    )
    collabHub.broadcastState(projectId)
    return true
  }

  private patch(
    projectId: string,
    threadId: string,
    fn: (t: CommentThread) => CommentThread,
  ): void {
    const s = useCollabStore.getState()
    s.setComments(
      projectId,
      this.threadsOf(projectId).map((t) => (t.id === threadId ? fn(t) : t)),
    )
    collabHub.broadcastState(projectId)
  }
}

export const commentService = new CommentService()
