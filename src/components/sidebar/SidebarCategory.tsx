import { useState, type ReactNode } from 'react'
import { useStore } from '@/store/useStore'
import type { Folder, FolderCategory } from '@/types/model'
import {
  applyAutoGroups,
  DRAG_MIME_FOR_CATEGORY,
  foldersOf,
  groupByFolder,
  type AutoGroup,
  type FoldableItem,
} from '@/lib/sidebar/folders'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import {
  IcChevronDown,
  IcChevronRight,
  IcEdit,
  IcFolder,
  IcPlus,
  IcSection,
  IcTrash,
} from '@/components/Icons'

/**
 * One sidebar section (Boards, Documents, …) with collapsible user folders.
 *
 * Folders group items INSIDE a category, so the item rendering stays with
 * the caller — this component owns only the tree around it: collapse
 * state, folder CRUD, and the drop targets that move an item between
 * folders. Items publish their id on the category's existing drag MIME, so
 * dragging to the canvas keeps working unchanged.
 */

export interface SidebarCategoryProps<T extends FoldableItem> {
  category: FolderCategory
  label: string
  items: T[]
  renderItem: (item: T) => ReactNode
  /** shown when the category has no items at all */
  emptyHint?: string
  /** create a new item of this kind (hidden for read-only roles) */
  onCreate?: () => void
  createLabel?: string
  /** false hides folder creation (read-only roles) */
  mayEditFolders?: boolean
  /**
   * No folder tree at all: one list, newest first. For categories that are
   * capture rather than filing (Notes) — an inbox you skim, not a cabinet
   * you organise. Any folder record a category once had is left untouched
   * in the store, and its items simply appear in the flat list.
   */
  flat?: boolean
  /**
   * Derived groups shown under the user folders, for items no folder
   * claims. Read-only: they come from the data, so there is nothing to
   * rename, delete or drop into.
   */
  autoGroups?: AutoGroup<T>[]
}

export function SidebarCategory<T extends FoldableItem>({
  category,
  label,
  items,
  renderItem,
  emptyHint,
  onCreate,
  createLabel,
  mayEditFolders = true,
  flat = false,
  autoGroups,
}: SidebarCategoryProps<T>) {
  const allFolders = useStore((s) => s.folders)
  const activeProjectId = useStore((s) => s.activeProjectId)
  const collapsedCategories = useStore((s) => s.collapsedCategories)
  const createFolder = useStore((s) => s.createFolder)
  const toggleCategoryCollapsed = useStore((s) => s.toggleCategoryCollapsed)
  const moveToFolder = useStore((s) => s.moveToFolder)

  const [dropTarget, setDropTarget] = useState<string | null>(null)
  // derived groups have no persisted record to collapse, so the open/shut
  // state lives here rather than in the store
  const [shutGroups, setShutGroups] = useState<string[]>([])

  const folders = flat ? [] : foldersOf(allFolders, category, activeProjectId)
  const { groups, unfiled } = groupByFolder(items, folders)
  const { groups: derived, rest } = applyAutoGroups(unfiled, autoGroups ?? [])
  const collapsed = collapsedCategories.includes(category)
  const mime = DRAG_MIME_FOR_CATEGORY[category]

  /** Accept a drop only when it carries this category's own item type. */
  const dragHasItem = (e: React.DragEvent) => e.dataTransfer.types.includes(mime)

  const onDropInto = (folderId: string | null) => (e: React.DragEvent) => {
    const itemId = e.dataTransfer.getData(mime)
    setDropTarget(null)
    if (!itemId) return
    e.preventDefault()
    e.stopPropagation()
    moveToFolder(category, itemId, folderId)
  }

  const dropProps = (key: string, folderId: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragHasItem(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move' as const
      setDropTarget(key)
    },
    onDragLeave: () => setDropTarget((t) => (t === key ? null : t)),
    onDrop: onDropInto(folderId),
  })

  return (
    <>
      <div className="insp-h flex items-center justify-between">
        <button
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 text-left"
          onClick={() => toggleCategoryCollapsed(category)}
          aria-expanded={!collapsed}
          title={collapsed ? `Expand ${label}` : `Collapse ${label}`}
        >
          {collapsed ? <IcChevronRight size={11} /> : <IcChevronDown size={11} />}
          <span className="truncate">{label}</span>
          {collapsed && items.length > 0 && (
            <span className="ml-1 text-[10px] font-normal text-muted">{items.length}</span>
          )}
        </button>
        {!collapsed && mayEditFolders && !flat && (
          <button
            className="icon-btn h-5 w-5"
            title={`New folder in ${label}`}
            aria-label={`New folder in ${label}`}
            onClick={() => createFolder(category)}
          >
            <IcFolder size={12} />
          </button>
        )}
        {!collapsed && onCreate && (
          <button
            className="icon-btn h-5 w-5"
            title={createLabel}
            aria-label={createLabel}
            onClick={onCreate}
          >
            <IcPlus size={12} />
          </button>
        )}
      </div>

      {!collapsed && (
        <>
          {groups.map(({ folder, items: filed }) => (
            <FolderRow
              key={folder.id}
              folder={folder}
              count={filed.length}
              isDropTarget={dropTarget === folder.id}
              dropProps={dropProps(folder.id, folder.id)}
              mayEdit={mayEditFolders}
            >
              {filed.map(renderItem)}
            </FolderRow>
          ))}

          {derived.map((group) => (
            <AutoGroupRow
              key={group.id}
              label={group.label}
              hint={group.hint}
              count={group.items.length}
              collapsed={shutGroups.includes(group.id)}
              onToggle={() =>
                setShutGroups((shut) =>
                  shut.includes(group.id)
                    ? shut.filter((id) => id !== group.id)
                    : [...shut, group.id],
                )
              }
            >
              {group.items.map(renderItem)}
            </AutoGroupRow>
          ))}

          {/* unfiled items double as the "move out of a folder" drop target */}
          <div
            className={`rounded-md ${
              dropTarget === '__unfiled__' ? 'bg-accent-soft ring-1 ring-accent' : ''
            }`}
            {...dropProps('__unfiled__', null)}
          >
            {rest.map(renderItem)}
            {folders.length > 0 && unfiled.length === 0 && (
              <div className="px-2 py-1 text-[11px] text-muted italic">
                Drag here to remove from a folder
              </div>
            )}
          </div>

          {items.length === 0 && emptyHint && (
            <div className="px-2 py-1 text-[11px] text-muted italic">{emptyHint}</div>
          )}
        </>
      )}
    </>
  )
}

/**
 * A derived group's header. Deliberately thinner than FolderRow: no
 * rename, no delete, no drop target — the group is a reading of the data,
 * so the only thing the user owns here is whether it is open.
 */
function AutoGroupRow({
  label,
  hint,
  count,
  collapsed,
  onToggle,
  children,
}: {
  label: string
  hint?: string
  count: number
  collapsed: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div>
      <button
        className="flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-muted hover:bg-panel2/60"
        onClick={onToggle}
        aria-expanded={!collapsed}
        title={hint}
      >
        {collapsed ? <IcChevronRight size={11} /> : <IcChevronDown size={11} />}
        <IcSection size={13} />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{label}</span>
        <span className="text-[10px] text-muted">{count}</span>
      </button>
      {!collapsed && <div className="ml-3">{children}</div>}
    </div>
  )
}

function FolderRow({
  folder,
  count,
  children,
  isDropTarget,
  dropProps,
  mayEdit,
}: {
  folder: Folder
  count: number
  children: ReactNode
  isDropTarget: boolean
  dropProps: Record<string, unknown>
  mayEdit: boolean
}) {
  const toggleFolderCollapsed = useStore((s) => s.toggleFolderCollapsed)
  const renameFolder = useStore((s) => s.renameFolder)
  const deleteFolder = useStore((s) => s.deleteFolder)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(folder.name)

  const commit = () => {
    setEditing(false)
    const next = draft.trim()
    if (next && next !== folder.name) renameFolder(folder.id, next)
    else setDraft(folder.name)
  }

  return (
    <div className={isDropTarget ? 'rounded-md bg-accent-soft ring-1 ring-accent' : ''}>
      <div
        className="group flex items-center gap-1 rounded-md px-2 py-1.5 text-muted hover:bg-panel2/60"
        {...dropProps}
      >
        <button
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
          onClick={() => toggleFolderCollapsed(folder.id)}
          aria-expanded={!folder.collapsed}
          title={folder.collapsed ? 'Expand folder' : 'Collapse folder'}
        >
          {folder.collapsed ? <IcChevronRight size={11} /> : <IcChevronDown size={11} />}
          <IcFolder size={13} />
          {editing ? (
            <input
              className="field h-5 min-w-0 flex-1 px-1 py-0 text-xs"
              value={draft}
              autoFocus
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit()
                if (e.key === 'Escape') {
                  setDraft(folder.name)
                  setEditing(false)
                }
              }}
              aria-label="Folder name"
            />
          ) : (
            <span className="min-w-0 flex-1 truncate text-xs font-medium">{folder.name}</span>
          )}
          <span className="text-[10px] text-muted">{count}</span>
        </button>
        {mayEdit && !editing && (
          <>
            <button
              className="icon-btn hidden h-5 w-5 group-hover:flex"
              title="Rename folder"
              aria-label={`Rename folder ${folder.name}`}
              onClick={() => {
                setDraft(folder.name)
                setEditing(true)
              }}
            >
              <IcEdit size={11} />
            </button>
            <button
              className="icon-btn hidden h-5 w-5 group-hover:flex"
              title="Delete folder"
              aria-label={`Delete folder ${folder.name}`}
              onClick={async () => {
                if (
                  await confirmDialog({
                    title: `Delete folder “${folder.name}”?`,
                    body: count
                      ? `The ${count} item${count === 1 ? '' : 's'} inside are kept — they move back to the unfiled list.`
                      : 'The folder is empty.',
                    confirmLabel: 'Delete folder',
                    danger: true,
                  })
                )
                  deleteFolder(folder.id)
              }}
            >
              <IcTrash size={11} />
            </button>
          </>
        )}
      </div>
      {!folder.collapsed && <div className="ml-3">{children}</div>}
    </div>
  )
}
