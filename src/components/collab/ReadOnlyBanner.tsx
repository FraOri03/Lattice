import { useCollabStore } from '@/lib/collab/collabStore'
import { useMyRole, useReadOnly } from '@/lib/collab/useCollab'
import { ROLE_LABEL } from '@/types/collab'
import { IcEye, IcMessage, IcX } from '@/components/Icons'

/**
 * ReadOnlyBanner — a thin strip under the top bar whenever the effective
 * role cannot edit. Tells the user WHY the UI is read-only instead of
 * letting controls silently fail, and offers the comment path when the
 * role allows it. Also the escape hatch for the owner's "view as" preview.
 */
export function ReadOnlyBanner() {
  const readOnly = useReadOnly()
  const role = useMyRole()
  const viewAsRole = useCollabStore((s) => s.viewAsRole)
  const setViewAsRole = useCollabStore((s) => s.setViewAsRole)
  const setPanel = useCollabStore((s) => s.setPanel)
  if (!readOnly) return null

  return (
    <div className="flex h-8 flex-none items-center gap-2 border-b border-[#ffa629]/30 bg-[#ffa629]/10 px-3 text-[11.5px]">
      <IcEye size={13} className="flex-none text-[#ffa629]" />
      <span className="min-w-0 truncate">
        {viewAsRole ? (
          <>
            Previewing as <b>{ROLE_LABEL[role]}</b> — the project is read-only in this view.
          </>
        ) : (
          <>
            You are a <b>{ROLE_LABEL[role].toLowerCase()}</b> in this project — content is
            read-only{role === 'commenter' ? ', comments are welcome' : ''}.
          </>
        )}
      </span>
      <div className="flex-1" />
      {role === 'commenter' && (
        <button
          className="flex cursor-pointer items-center gap-1 text-[11px] font-medium text-accent hover:underline"
          onClick={() => setPanel('comments')}
        >
          <IcMessage size={11} /> Comment
        </button>
      )}
      {viewAsRole && (
        <button
          className="flex cursor-pointer items-center gap-1 rounded-md border border-bord px-1.5 py-0.5 text-[11px] font-medium hover:border-accent"
          onClick={() => setViewAsRole(null)}
        >
          <IcX size={10} /> Exit preview
        </button>
      )}
    </div>
  )
}
