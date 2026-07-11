import { backlinksTo, useStore } from '@/store/useStore'
import {
  CARD_COLORS,
  type BoardNode,
  type CardColor,
  type CardData,
} from '@/types/model'
import type { Edge } from '@xyflow/react'
import { downloadAsset } from '@/lib/assets/AssetRegistry'
import { plannedEditorFor } from '@/lib/registry/documents'
import { conversionNoteForAsset } from '@/lib/convert/ConversionService'
import { formatBytes } from '@/lib/media'
import { labelForLang } from '@/lib/code/languages'
import { KIND_LABEL } from '@/components/assetKinds'
import { useCollabStore } from '@/lib/collab/collabStore'
import { useMyRole, useOpenCommentCount, useReadOnly } from '@/lib/collab/useCollab'
import { ROLE_LABEL } from '@/types/collab'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { IcEdit, IcEye, IcMessage, IcTrash } from '@/components/Icons'
import { ActionIcon } from '@/components/ActionIcons'

const TYPE_LABEL: Record<CardData['type'], string> = {
  note: 'Note card',
  image: 'Image card',
  video: 'Video card',
  link: 'Link card',
  file: 'File card',
  embed3d: '3D embed',
  asset: 'Asset card',
  richdoc: 'Document card',
  code: 'Code card',
  sheet: 'Spreadsheet card',
  presentation: 'Presentation card',
  section: 'Section',
  webembed: 'Web embed card',
}

function ColorRow({
  value,
  onChange,
}: {
  value: CardColor
  onChange: (c: CardColor) => void
}) {
  return (
    <div className="flex gap-1.5">
      {(Object.keys(CARD_COLORS) as CardColor[]).map((c) => (
        <button
          key={c}
          title={c}
          onClick={() => onChange(c)}
          className="h-5 w-5 cursor-pointer rounded-full border-2"
          style={{
            background: CARD_COLORS[c],
            borderColor: c === value ? 'var(--ink)' : 'transparent',
          }}
        />
      ))}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5 text-[11.5px]">
      <span className="flex-none text-muted">{label}</span>
      <span className="min-w-0 truncate text-right" title={value}>
        {value}
      </span>
    </div>
  )
}

function NodeInspector({ node }: { node: BoardNode }) {
  const updateCardData = useStore((s) => s.updateCardData)
  const deleteCard = useStore((s) => s.deleteCard)
  const updateNote = useStore((s) => s.updateNote)
  const openNote = useStore((s) => s.openNote)
  const openAsset = useStore((s) => s.openAsset)
  const openDoc = useStore((s) => s.openDoc)
  const openCode = useStore((s) => s.openCode)
  const openSheet = useStore((s) => s.openSheet)
  const openPresent = useStore((s) => s.openPresent)
  const deleteAsset = useStore((s) => s.deleteAsset)
  const deleteDoc = useStore((s) => s.deleteDoc)
  const deleteCode = useStore((s) => s.deleteCode)
  const deleteSheetDoc = useStore((s) => s.deleteSheetDoc)
  const deletePresentDoc = useStore((s) => s.deletePresentDoc)
  const renameAsset = useStore((s) => s.renameAsset)
  const updateDocMeta = useStore((s) => s.updateDocMeta)
  const updateCodeMeta = useStore((s) => s.updateCodeMeta)
  const updateSheetMeta = useStore((s) => s.updateSheetMeta)
  const updatePresentMeta = useStore((s) => s.updatePresentMeta)
  const notes = useStore((s) => s.notes)
  const assets = useStore((s) => s.assets)
  const docs = useStore((s) => s.docs)
  const codeDocs = useStore((s) => s.codeDocs)
  const sheetDocs = useStore((s) => s.sheetDocs)
  const presentDocs = useStore((s) => s.presentDocs)
  const note = node.data.noteId ? notes[node.data.noteId] : undefined
  const asset = node.data.assetId ? assets[node.data.assetId] : undefined
  const richdoc = node.data.docId ? docs[node.data.docId] : undefined
  const codeDoc = node.data.codeId ? codeDocs[node.data.codeId] : undefined
  const sheetDoc = node.data.sheetId ? sheetDocs[node.data.sheetId] : undefined
  const presentDoc = node.data.presentId ? presentDocs[node.data.presentId] : undefined
  const backlinks = note ? backlinksTo(notes, note) : []
  const plannedEditor = asset ? plannedEditorFor(asset.kind) : null
  const conversionNote = asset ? conversionNoteForAsset(asset) : null

  const d = node.data
  const w = node.width ?? node.measured?.width
  const h = node.height ?? node.measured?.height

  return (
    <>
      <div className="insp-h">Card</div>
      <div className="mb-2 text-xs font-semibold">
        {d.type === 'asset' && asset
          ? `${KIND_LABEL[asset.kind]} card`
          : TYPE_LABEL[d.type]}
      </div>
      <ColorRow value={d.color} onChange={(color) => updateCardData(node.id, { color })} />
      <div className="mt-2 grid grid-cols-2 gap-x-3 text-[11px] text-muted">
        <span>x {Math.round(node.position.x)}</span>
        <span>y {Math.round(node.position.y)}</span>
        {w != null && <span>w {Math.round(w)}</span>}
        {h != null && <span>h {Math.round(h)}</span>}
      </div>

      {note && (
        <>
          <div className="insp-h">Note</div>
          <input
            className="field mb-2"
            value={note.title}
            onChange={(e) => updateNote(note.id, { title: e.target.value })}
            placeholder="Title"
          />
          <textarea
            className="field mb-2 h-44 resize-none font-mono text-[12px] leading-relaxed"
            value={note.content}
            onChange={(e) => updateNote(note.id, { content: e.target.value })}
            placeholder="Write markdown… link other notes with [[Title]]"
          />
          <input
            key={`tags-${note.id}`}
            className="field mb-2"
            defaultValue={note.tags.join(', ')}
            placeholder="tags, comma, separated"
            onBlur={(e) =>
              updateNote(note.id, {
                tags: e.target.value
                  .split(',')
                  .map((t) => t.trim().toLowerCase())
                  .filter(Boolean),
              })
            }
          />
          <button className="btn w-full" onClick={() => openNote(note.id)}>
            <IcEdit size={12} /> Open in editor
          </button>
          {backlinks.length > 0 && (
            <>
              <div className="insp-h">Backlinks</div>
              {backlinks.map((b) => (
                <button
                  key={b.id}
                  className="block w-full cursor-pointer truncate rounded px-2 py-1 text-left text-xs text-accent hover:bg-panel2"
                  onClick={() => openNote(b.id)}
                >
                  ← {b.title}
                </button>
              ))}
            </>
          )}
        </>
      )}

      {d.type === 'asset' && asset && (
        <>
          <div className="insp-h">Asset</div>
          <input
            className="field mb-2"
            value={asset.name}
            onChange={(e) => renameAsset(asset.id, e.target.value)}
            placeholder="Asset name"
          />
          <InfoRow label="Kind" value={KIND_LABEL[asset.kind]} />
          <InfoRow label="Format" value={asset.ext ? asset.ext.toUpperCase() : asset.mime} />
          <InfoRow label="Size" value={formatBytes(asset.size)} />
          <InfoRow label="Original" value={asset.originalName} />
          <InfoRow
            label="Imported"
            value={new Date(asset.importedAt).toLocaleDateString()}
          />
          <InfoRow label="Vault path" value={asset.assetPath} />
          {conversionNote ? (
            <p className="mt-1.5 rounded-md border border-bord bg-panel2 px-2 py-1.5 text-[11px] leading-relaxed text-muted">
              {conversionNote}
            </p>
          ) : (
            plannedEditor &&
            plannedEditor.status === 'planned' && (
              <p className="mt-1.5 rounded-md border border-bord bg-panel2 px-2 py-1.5 text-[11px] leading-relaxed text-muted">
                {plannedEditor.editorHint} arrives in Phase {plannedEditor.phase}.
              </p>
            )
          )}
          <div className="mt-2 flex gap-2">
            <button className="btn flex-1" onClick={() => openAsset(asset.id)}>
              <IcEye size={12} /> Preview
            </button>
            <button
              className="btn flex-1"
              title="Download the original file to this device"
              onClick={() => void downloadAsset(asset)}
            >
              <ActionIcon.DownloadLocal size={12} /> Download
            </button>
          </div>
        </>
      )}
      {d.type === 'asset' && !asset && (
        <p className="mt-2 text-xs text-muted">
          The asset behind this card was removed from the vault.
        </p>
      )}

      {d.type === 'richdoc' && richdoc && (
        <>
          <div className="insp-h">Document</div>
          <input
            className="field mb-2"
            value={richdoc.title}
            onChange={(e) => updateDocMeta(richdoc.id, { title: e.target.value })}
            placeholder="Document title"
          />
          <InfoRow label="Words" value={String(richdoc.wordCount)} />
          <InfoRow
            label="Edited"
            value={new Date(richdoc.updatedAt).toLocaleDateString()}
          />
          {richdoc.sourceAssetId && <InfoRow label="Source" value="imported DOCX" />}
          <div className="insp-h">Card mode</div>
          <div className="flex rounded-lg border border-bord bg-panel2 p-0.5">
            {(['compact', 'expanded'] as const).map((m) => (
              <button
                key={m}
                onClick={() => updateCardData(node.id, { mode: m })}
                className={`flex-1 cursor-pointer rounded-md px-2 py-1 text-xs font-medium capitalize ${
                  (d.mode ?? 'compact') === m
                    ? 'bg-panel text-ink shadow-sm'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted">
            Compact shows a preview snippet; expanded is an editable inline
            editor. Double-click the card for the full workspace.
          </p>
          <button className="btn mt-2 w-full" onClick={() => openDoc(richdoc.id)}>
            <IcEdit size={12} /> Open in workspace
          </button>
        </>
      )}
      {d.type === 'richdoc' && !richdoc && (
        <p className="mt-2 text-xs text-muted">
          The document behind this card was deleted.
        </p>
      )}

      {d.type === 'code' && codeDoc && (
        <>
          <div className="insp-h">Code file</div>
          <input
            className="field mb-2"
            value={codeDoc.title}
            onChange={(e) => updateCodeMeta(codeDoc.id, { title: e.target.value })}
            placeholder="filename"
          />
          <InfoRow label="Language" value={labelForLang(codeDoc.language)} />
          <InfoRow label="Lines" value={String(codeDoc.lineCount)} />
          <InfoRow label="Size" value={formatBytes(codeDoc.size)} />
          <div className="insp-h">Card mode</div>
          <div className="flex rounded-lg border border-bord bg-panel2 p-0.5">
            {(['compact', 'expanded'] as const).map((m) => (
              <button
                key={m}
                onClick={() => updateCardData(node.id, { mode: m })}
                className={`flex-1 cursor-pointer rounded-md px-2 py-1 text-xs font-medium capitalize ${
                  (d.mode ?? 'compact') === m
                    ? 'bg-panel text-ink shadow-sm'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted">
            Compact shows file info; expanded is a read-only syntax preview.
            Double-click the card for the code workspace.
          </p>
          <button className="btn mt-2 w-full" onClick={() => openCode(codeDoc.id)}>
            <IcEdit size={12} /> Open in code workspace
          </button>
        </>
      )}
      {d.type === 'code' && !codeDoc && (
        <p className="mt-2 text-xs text-muted">
          The code file behind this card was deleted.
        </p>
      )}

      {d.type === 'sheet' && sheetDoc && (
        <>
          <div className="insp-h">Spreadsheet</div>
          <input
            className="field mb-2"
            value={sheetDoc.title}
            onChange={(e) => updateSheetMeta(sheetDoc.id, { title: e.target.value })}
            placeholder="Spreadsheet title"
          />
          <InfoRow label="Sheets" value={sheetDoc.sheetNames.join(', ')} />
          <InfoRow label="Cells" value={String(sheetDoc.cellCount)} />
          <InfoRow
            label="Edited"
            value={new Date(sheetDoc.updatedAt).toLocaleDateString()}
          />
          {sheetDoc.sourceAssetId && <InfoRow label="Source" value="imported file" />}
          <div className="insp-h">Card mode</div>
          <div className="flex rounded-lg border border-bord bg-panel2 p-0.5">
            {(['compact', 'expanded'] as const).map((m) => (
              <button
                key={m}
                onClick={() => updateCardData(node.id, { mode: m })}
                className={`flex-1 cursor-pointer rounded-md px-2 py-1 text-xs font-medium capitalize ${
                  (d.mode ?? 'compact') === m
                    ? 'bg-panel text-ink shadow-sm'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted">
            Compact shows a data preview; expanded is a read-only mini grid
            with live formulas. Double-click the card for the full workspace.
          </p>
          <button className="btn mt-2 w-full" onClick={() => openSheet(sheetDoc.id)}>
            <IcEdit size={12} /> Open in workspace
          </button>
        </>
      )}
      {d.type === 'sheet' && !sheetDoc && (
        <p className="mt-2 text-xs text-muted">
          The spreadsheet behind this card was deleted.
        </p>
      )}

      {d.type === 'presentation' && presentDoc && (
        <>
          <div className="insp-h">Presentation</div>
          <input
            className="field mb-2"
            value={presentDoc.title}
            onChange={(e) => updatePresentMeta(presentDoc.id, { title: e.target.value })}
            placeholder="Presentation title"
          />
          <InfoRow label="Slides" value={String(presentDoc.slideCount)} />
          <InfoRow
            label="Edited"
            value={new Date(presentDoc.updatedAt).toLocaleDateString()}
          />
          {presentDoc.sourceAssetId && <InfoRow label="Source" value="imported deck" />}
          <div className="insp-h">Card mode</div>
          <div className="flex rounded-lg border border-bord bg-panel2 p-0.5">
            {(['compact', 'expanded'] as const).map((m) => (
              <button
                key={m}
                onClick={() => updateCardData(node.id, { mode: m })}
                className={`flex-1 cursor-pointer rounded-md px-2 py-1 text-xs font-medium capitalize ${
                  (d.mode ?? 'compact') === m
                    ? 'bg-panel text-ink shadow-sm'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted">
            Compact shows a slide summary; expanded is a read-only slide
            thumbnail with a navigator. Double-click the card for the full
            presentation workspace.
          </p>
          <button className="btn mt-2 w-full" onClick={() => openPresent(presentDoc.id)}>
            <IcEdit size={12} /> Open in workspace
          </button>
        </>
      )}
      {d.type === 'presentation' && !presentDoc && (
        <p className="mt-2 text-xs text-muted">
          The presentation behind this card was deleted.
        </p>
      )}

      {(d.type === 'image' || d.type === 'video' || d.type === 'link') && (
        <>
          <div className="insp-h">{d.type === 'image' ? 'Source' : 'URL'}</div>
          <input
            key={`title-${node.id}`}
            className="field mb-2"
            defaultValue={d.title ?? ''}
            placeholder="Title"
            onBlur={(e) => updateCardData(node.id, { title: e.target.value })}
          />
          <input
            key={`url-${node.id}`}
            className="field mb-2"
            defaultValue={(d.type === 'image' ? d.src : d.url) ?? ''}
            placeholder={
              d.type === 'image'
                ? 'https://… image URL'
                : d.type === 'video'
                  ? 'YouTube / Vimeo / .mp4 URL'
                  : 'https://…'
            }
            onBlur={(e) =>
              updateCardData(
                node.id,
                d.type === 'image' ? { src: e.target.value } : { url: e.target.value },
              )
            }
          />
          {d.type === 'image' && (
            <input
              key={`cap-${node.id}`}
              className="field mb-2"
              defaultValue={d.caption ?? ''}
              placeholder="Caption"
              onBlur={(e) => updateCardData(node.id, { caption: e.target.value })}
            />
          )}
        </>
      )}

      {d.type === 'embed3d' && (
        <>
          <div className="insp-h">3D embed</div>
          <p className="text-[11px] leading-relaxed text-muted">
            Placeholder three.js scene — drag inside the card to orbit. Import a
            GLB/GLTF/OBJ file to get a real model card.
          </p>
        </>
      )}

      <div className="insp-h">Danger</div>
      <button
        className="btn w-full text-[#f24822]"
        onClick={async () => {
          if (
            await confirmDialog({
              title: 'Delete this card?',
              body: 'Only the card is removed — linked notes, documents and assets stay in the vault.',
              confirmLabel: 'Delete card',
              danger: true,
            })
          )
            deleteCard(node.id)
        }}
      >
        <IcTrash size={12} /> Delete card
      </button>
      {d.type === 'asset' && asset && (
        <button
          className="btn mt-2 w-full text-[#f24822]"
          onClick={async () => {
            if (
              await confirmDialog({
                title: `Delete asset “${asset.name}”?`,
                body: 'The file and its cards on all boards are removed from the vault.',
                confirmLabel: 'Delete asset',
                danger: true,
              })
            )
              deleteAsset(asset.id)
          }}
        >
          <IcTrash size={12} /> Delete asset from vault
        </button>
      )}
      {d.type === 'richdoc' && richdoc && (
        <button
          className="btn mt-2 w-full text-[#f24822]"
          onClick={async () => {
            if (
              await confirmDialog({
                title: `Delete “${richdoc.title}”?`,
                body: 'The document and its cards on all boards are removed.',
                confirmLabel: 'Delete document',
                danger: true,
              })
            )
              deleteDoc(richdoc.id)
          }}
        >
          <IcTrash size={12} /> Delete document from vault
        </button>
      )}
      {d.type === 'code' && codeDoc && (
        <button
          className="btn mt-2 w-full text-[#f24822]"
          onClick={async () => {
            if (
              await confirmDialog({
                title: `Delete “${codeDoc.title}.${codeDoc.extension}”?`,
                body: 'The file and its cards on all boards are removed.',
                confirmLabel: 'Delete file',
                danger: true,
              })
            )
              deleteCode(codeDoc.id)
          }}
        >
          <IcTrash size={12} /> Delete code file from vault
        </button>
      )}
      {d.type === 'sheet' && sheetDoc && (
        <button
          className="btn mt-2 w-full text-[#f24822]"
          onClick={async () => {
            if (
              await confirmDialog({
                title: `Delete “${sheetDoc.title}”?`,
                body: 'The spreadsheet and its cards on all boards are removed.',
                confirmLabel: 'Delete spreadsheet',
                danger: true,
              })
            )
              deleteSheetDoc(sheetDoc.id)
          }}
        >
          <IcTrash size={12} /> Delete spreadsheet from vault
        </button>
      )}
      {d.type === 'presentation' && presentDoc && (
        <button
          className="btn mt-2 w-full text-[#f24822]"
          onClick={async () => {
            if (
              await confirmDialog({
                title: `Delete “${presentDoc.title}”?`,
                body: 'The presentation and its cards on all boards are removed. A preserved source file (if any) stays in Files.',
                confirmLabel: 'Delete presentation',
                danger: true,
              })
            )
              deletePresentDoc(presentDoc.id)
          }}
        >
          <IcTrash size={12} /> Delete presentation from vault
        </button>
      )}
    </>
  )
}

/** Comments summary + entry point for the selected card. */
function CardCommentsRow({ nodeId }: { nodeId: string }) {
  const count = useOpenCommentCount(nodeId)
  const setPanel = useCollabStore((s) => s.setPanel)
  const setFocusedThread = useCollabStore((s) => s.setFocusedThread)
  return (
    <>
      <div className="insp-h">Comments</div>
      <button
        className="btn w-full"
        onClick={() => {
          const projectId = useStore.getState().activeProjectId
          const thread = (useCollabStore.getState().comments[projectId] ?? []).find(
            (t) => t.targetId === nodeId && !t.resolved,
          )
          setPanel('comments')
          setFocusedThread(thread?.id ?? null)
        }}
      >
        <IcMessage size={12} />
        {count ? `${count} open comment${count > 1 ? 's' : ''}` : 'Comment on this card'}
      </button>
    </>
  )
}

function EdgeInspector({ edge }: { edge: Edge }) {
  const updateEdgeLabel = useStore((s) => s.updateEdgeLabel)
  const deleteEdge = useStore((s) => s.deleteEdge)
  return (
    <>
      <div className="insp-h">Connection</div>
      <input
        key={edge.id}
        className="field mb-2"
        defaultValue={typeof edge.label === 'string' ? edge.label : ''}
        placeholder="Label this connection…"
        onBlur={(e) => updateEdgeLabel(edge.id, e.target.value)}
      />
      <button className="btn w-full text-[#f24822]" onClick={() => deleteEdge(edge.id)}>
        <IcTrash size={12} /> Delete connection
      </button>
    </>
  )
}

export function Inspector() {
  const board = useStore((s) => s.boards[s.activeBoardId])
  const readOnly = useReadOnly()
  const role = useMyRole()
  const selectedNodes = board.nodes.filter((n) => n.selected)
  const selectedEdge = board.edges.find((e) => e.selected)

  return (
    <aside className="w-70 flex-none overflow-y-auto border-l border-bord bg-panel px-4 pb-6">
      {readOnly && (
        <div className="mt-3 flex items-center gap-1.5 rounded-md bg-panel2 px-2 py-1.5 text-[10.5px] text-muted">
          <IcEye size={11} className="flex-none" />
          {ROLE_LABEL[role]} access — fields are read-only
        </div>
      )}
      {/* comments stay usable for commenter roles, so they live outside the
          disabled fieldset that neutralizes every editing control below */}
      {selectedNodes.length === 1 && <CardCommentsRow nodeId={selectedNodes[0].id} />}
      <fieldset
        disabled={readOnly}
        className="m-0 min-w-0 border-0 p-0"
        style={{ minInlineSize: 'auto' }}
      >
      {selectedNodes.length === 1 ? (
        <NodeInspector node={selectedNodes[0]} />
      ) : selectedNodes.length > 1 ? (
        <>
          <div className="insp-h">Selection</div>
          <p className="text-xs text-muted">
            {selectedNodes.length} cards selected. Press{' '}
            <kbd className="rounded border border-bord bg-panel2 px-1">Delete</kbd> to
            remove them.
          </p>
        </>
      ) : selectedEdge ? (
        <EdgeInspector edge={selectedEdge} />
      ) : (
        <>
          <div className="insp-h">Board</div>
          <div className="mb-3 text-xs text-muted">
            {board.nodes.length} cards · {board.edges.length} connections
          </div>
          <div className="insp-h">Tips</div>
          <ul className="space-y-1.5 text-[11.5px] leading-relaxed text-muted">
            <li>· Drag cards by their header bar</li>
            <li>· Drag the dot on a card's right edge onto another card to link</li>
            <li>· Double-click a note or asset card to open it</li>
            <li>· Drop any file — PDF, Office, media, 3D — onto the canvas</li>
            <li>· Drag notes and assets from the sidebar onto the board</li>
            <li>· Shift + drag for box select · Delete removes selection</li>
            <li>· Use [[Note title]] inside markdown to create backlinks</li>
          </ul>
        </>
      )}
      </fieldset>
    </aside>
  )
}
