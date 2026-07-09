import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react'
import { Extension, type Editor, type Range } from '@tiptap/core'
import { ReactRenderer } from '@tiptap/react'
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'

/** Callbacks the editor host injects for items that need UI (pickers). */
export interface SlashActions {
  openImagePicker: (insertAt: number) => void
  openAssetPicker: (insertAt: number) => void
}

export interface SlashItem {
  title: string
  hint: string
  /** short text badge shown as the item icon */
  badge: string
  keywords: string
  run: (editor: Editor, range: Range) => void
}

function buildSlashItems(actions: SlashActions): SlashItem[] {
  const block = (fn: (e: Editor) => void) => (editor: Editor, range: Range) => {
    editor.chain().focus().deleteRange(range).run()
    fn(editor)
  }
  return [
    { title: 'Text', hint: 'Plain paragraph', badge: 'T', keywords: 'paragraph plain',
      run: block((e) => e.chain().focus().setParagraph().run()) },
    { title: 'Heading 1', hint: 'Section title', badge: 'H1', keywords: 'h1 title',
      run: block((e) => e.chain().focus().setHeading({ level: 1 }).run()) },
    { title: 'Heading 2', hint: 'Subsection', badge: 'H2', keywords: 'h2',
      run: block((e) => e.chain().focus().setHeading({ level: 2 }).run()) },
    { title: 'Heading 3', hint: 'Small heading', badge: 'H3', keywords: 'h3',
      run: block((e) => e.chain().focus().setHeading({ level: 3 }).run()) },
    { title: 'Bullet list', hint: 'Unordered list', badge: '•', keywords: 'ul bullet list',
      run: block((e) => e.chain().focus().toggleBulletList().run()) },
    { title: 'Numbered list', hint: 'Ordered list', badge: '1.', keywords: 'ol numbered ordered',
      run: block((e) => e.chain().focus().toggleOrderedList().run()) },
    { title: 'Checklist', hint: 'To-do items', badge: '☑', keywords: 'task todo check',
      run: block((e) => e.chain().focus().toggleTaskList().run()) },
    { title: 'Quote', hint: 'Blockquote', badge: '❝', keywords: 'quote blockquote',
      run: block((e) => e.chain().focus().toggleBlockquote().run()) },
    { title: 'Code block', hint: 'Monospaced block', badge: '{}', keywords: 'code pre',
      run: block((e) => e.chain().focus().toggleCodeBlock().run()) },
    { title: 'Table', hint: '3 × 3 with header row', badge: '⊞', keywords: 'table grid',
      run: block((e) =>
        e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      ) },
    { title: 'Callout', hint: 'Highlighted info box', badge: 'ℹ', keywords: 'callout info note',
      run: block((e) => e.chain().focus().toggleCallout('info').run()) },
    { title: 'Warning callout', hint: 'Highlighted warning box', badge: '⚠', keywords: 'callout warning',
      run: block((e) => e.chain().focus().toggleCallout('warning').run()) },
    { title: 'Divider', hint: 'Horizontal rule', badge: '—', keywords: 'hr divider rule',
      run: block((e) => e.chain().focus().setHorizontalRule().run()) },
    { title: 'Image', hint: 'Upload and embed an image', badge: '🖼', keywords: 'image picture photo upload',
      run: (editor, range) => {
        const at = range.from
        editor.chain().focus().deleteRange(range).run()
        actions.openImagePicker(at)
      } },
    { title: 'Embed asset', hint: 'PDF, video, audio, 3D…', badge: '📎', keywords: 'asset embed file pdf video 3d',
      run: (editor, range) => {
        const at = range.from
        editor.chain().focus().deleteRange(range).run()
        actions.openAssetPicker(at)
      } },
  ]
}

/* ---------------- menu list component ---------------- */

interface SlashMenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean
}

interface SlashMenuListProps {
  items: SlashItem[]
  command: (item: SlashItem) => void
}

const SlashMenuList = forwardRef<SlashMenuHandle, SlashMenuListProps>(
  function SlashMenuList({ items, command }, ref) {
    const [index, setIndex] = useState(0)
    useEffect(() => setIndex(0), [items])

    useImperativeHandle(ref, () => ({
      onKeyDown(event) {
        if (event.key === 'ArrowDown') {
          setIndex((i) => (i + 1) % Math.max(items.length, 1))
          return true
        }
        if (event.key === 'ArrowUp') {
          setIndex((i) => (i - 1 + items.length) % Math.max(items.length, 1))
          return true
        }
        if (event.key === 'Enter') {
          if (items[index]) command(items[index])
          return true
        }
        return false
      },
    }))

    if (!items.length) {
      return <div className="slash-menu"><div className="slash-empty">No matches</div></div>
    }
    return (
      <div className="slash-menu">
        {items.map((item, i) => (
          <button
            key={item.title}
            className={`slash-item ${i === index ? 'is-active' : ''}`}
            onMouseEnter={() => setIndex(i)}
            onClick={() => command(item)}
          >
            <span className="slash-badge">{item.badge}</span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium">{item.title}</span>
              <span className="block truncate text-[10.5px] text-muted">{item.hint}</span>
            </span>
          </button>
        ))}
      </div>
    )
  },
)

/* ---------------- suggestion plumbing ---------------- */

type SlashSuggestionProps = SuggestionProps<SlashItem>

function createSlashRenderer() {
  let renderer: ReactRenderer<SlashMenuHandle, SlashMenuListProps> | null = null
  let anchor: HTMLDivElement | null = null

  const position = (clientRect?: (() => DOMRect | null) | null) => {
    const rect = clientRect?.()
    if (!rect || !anchor) return
    const menuH = anchor.offsetHeight || 320
    const menuW = anchor.offsetWidth || 260
    const top =
      rect.bottom + menuH + 8 > window.innerHeight
        ? Math.max(8, rect.top - menuH - 6)
        : rect.bottom + 6
    anchor.style.top = `${top}px`
    anchor.style.left = `${Math.min(rect.left, window.innerWidth - menuW - 8)}px`
  }

  const destroy = () => {
    renderer?.destroy()
    anchor?.remove()
    renderer = null
    anchor = null
  }

  return {
    onStart: (props: SlashSuggestionProps) => {
      renderer = new ReactRenderer(SlashMenuList, {
        props: { items: props.items, command: props.command },
        editor: props.editor,
      })
      anchor = document.createElement('div')
      anchor.style.position = 'fixed'
      anchor.style.zIndex = '1000'
      anchor.appendChild(renderer.element)
      document.body.appendChild(anchor)
      position(props.clientRect)
    },
    onUpdate: (props: SlashSuggestionProps) => {
      renderer?.updateProps({ items: props.items, command: props.command })
      position(props.clientRect)
    },
    onKeyDown: (props: { event: KeyboardEvent }) => {
      if (props.event.key === 'Escape') {
        destroy()
        return true
      }
      return renderer?.ref?.onKeyDown(props.event) ?? false
    },
    onExit: destroy,
  }
}

/** The slash-command extension. Create one per editor instance. */
export function SlashCommands(actions: SlashActions) {
  const allItems = buildSlashItems(actions)
  return Extension.create({
    name: 'slashCommands',
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashItem>({
          editor: this.editor,
          char: '/',
          pluginKey: new PluginKey('slashCommands'),
          command: ({ editor, range, props }) => props.run(editor, range),
          items: ({ query }) => {
            const q = query.toLowerCase()
            return allItems.filter(
              (i) =>
                !q ||
                i.title.toLowerCase().includes(q) ||
                i.keywords.includes(q),
            )
          },
          render: createSlashRenderer,
        }),
      ]
    },
  })
}
