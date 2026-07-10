import { InputRule, Node, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { AssetEmbedBlock } from './AssetEmbedBlock'

export type CalloutKind = 'info' | 'warning' | 'success' | 'danger'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      toggleCallout: (kind?: CalloutKind) => ReturnType
    }
  }
}

/**
 * Obsidian-style [[wikilink]] as an inline atom. Typing "[[Title]]"
 * converts to a node; clicks are handled by the editor (handleClickOn)
 * so links resolve through the store's universal wikilink opener.
 */
export const Wikilink = Node.create({
  name: 'wikilink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      target: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-wikilink') ?? '',
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-wikilink]' }]
  },

  renderHTML({ node }) {
    return [
      'span',
      { 'data-wikilink': node.attrs.target, class: 'wikilink' },
      String(node.attrs.target),
    ]
  },

  renderText({ node }) {
    return `[[${node.attrs.target}]]`
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\[\[([^[\]]+)\]\]$/,
        handler: ({ range, match, chain }) => {
          chain()
            .insertContentAt(range, [
              { type: this.name, attrs: { target: match[1].trim() } },
              { type: 'text', text: ' ' },
            ])
            .run()
        },
      }),
    ]
  },
})

/** Notion-style callout block wrapping one or more paragraphs. */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'paragraph+',
  defining: true,

  addAttributes() {
    return {
      kind: {
        default: 'info',
        parseHTML: (el) => el.getAttribute('data-callout') ?? 'info',
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-callout': node.attrs.kind,
        class: `callout callout-${node.attrs.kind}`,
      }),
      0,
    ]
  },

  addCommands() {
    return {
      toggleCallout:
        (kind = 'info') =>
        ({ commands }) =>
          commands.toggleWrap(this.name, { kind }),
    }
  },
})

/**
 * AssetEmbedBlock: embeds any vault asset (image, PDF, video, audio,
 * 3D model, office file) inside a document. Rendered through the same
 * preview machinery the boards use; serialized as a reference, so the
 * document JSON stays small and the binary stays in the StorageProvider.
 */
export const AssetEmbed = Node.create({
  name: 'assetEmbed',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      assetId: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-asset-embed') ?? '',
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-asset-embed]' }]
  },

  renderHTML({ node }) {
    return [
      'div',
      { 'data-asset-embed': node.attrs.assetId, class: 'asset-embed' },
      `[embedded asset ${node.attrs.assetId}]`,
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(AssetEmbedBlock)
  },
})

const richExtensions = [
  Underline,
  Link.configure({ openOnClick: false, autolink: true }),
  Image.configure({ allowBase64: true }),
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  TaskList,
  TaskItem.configure({ nested: true }),
  Wikilink,
  Callout,
  AssetEmbed,
]

/**
 * Schema-relevant extensions, shared by every consumer that must agree on
 * the document format: DOCX import (generateJSON), HTML export
 * (generateHTML) and any headless transformation. Editor-only concerns
 * (placeholder, slash commands) are added by RichTextEditor on top.
 */
export const baseExtensions = [StarterKit, ...richExtensions]

/**
 * The live editor's variant: identical schema, but StarterKit's history
 * is disabled — undo/redo comes from the Yjs UndoManager through the
 * Collaboration extension (local-only undo that never rolls back other
 * people's edits).
 */
export const collabBaseExtensions = [
  StarterKit.configure({ history: false }),
  ...richExtensions,
]
