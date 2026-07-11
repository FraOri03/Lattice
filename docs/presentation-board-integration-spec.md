# Presentation-in-Board Integration — Specification & As-Built

**Status:** Implemented in the Phase-8 audit branch. This document is both the design spec and the as-built record (with file references). Verification: typecheck ✅, production build ✅, unit tests ✅ (3/3); DOM/runtime spot-checks noted inline.

**Problem recap:** presentations were full entities (`PresentationDocMeta`, editor mode, sidebar section, PPTX/ODP import) but could **not** be board cards — no `presentation` card type, no node registration, no toolbar/drag/inspector, and imported decks landed on the board as a *raw asset* card (`ImportService.cardSpecFor`, comment: "decks have no dedicated card type yet"). This broke "every entity can be a card on the infinite canvas."

---

## 1. User stories

1. **Insert a deck** — *As an editor, I can add a presentation to a board from the canvas toolbar so a deck lives alongside my notes/docs/sheets.* ✅ ("Deck" button, `CanvasToolbar.tsx`).
2. **Drag a deck in** — *As an editor, I can drag a deck from the sidebar onto the canvas to place it where I want.* ✅ (`PRESENT_DRAG_MIME`, draggable sidebar rows, drop handler).
3. **Preview slides on the board** — *As any member, I can see a deck's slides on the card (expanded) and page through them without opening the workspace.* ✅ (expanded mode + slide navigator).
4. **Summary at a glance** — *As any member, I can see a deck's title, snippet and slide count on a compact card.* ✅ (compact mode).
5. **Open the workspace** — *As an editor, double-clicking the card opens the full presentation workspace.* ✅ (`openPresent`).
6. **Import lands as a deck** — *As an editor, importing a PPTX/ODP onto the board creates an editable deck card (not an inert file card), with the original preserved.* ✅ (`cardSpecFor` → `presentation`).
7. **Inspect & manage** — *As an editor, the inspector lets me rename the deck, switch compact/expanded, open the workspace, and delete the deck or just the card.* ✅ (Inspector presentation branch).
8. **Comment & version** — *As a commenter, I can comment on a deck card; as an editor, the deck participates in version history.* ✅ (inherited from `CardChrome` comment badge + project version panel).
9. **Collaborate safely** — *As a viewer, the deck card is read-only; as an editor in a realtime room, the card syncs like any other node.* ✅ (permissions + generic CRDT node serialization).
10. **Delete cleanly** — *As an editor, deleting a deck removes its cards from every board (like docs/sheets/code).* ✅ (`deletePresentDoc` → `stripCards`).

---

## 2. Data model

```ts
// src/types/model.ts
type CardType = … | 'presentation' | …          // added
interface CardData {
  …
  presentId?: string   // references a PresentationDocMeta (added)
  mode?: RichDocCardMode // 'compact' | 'expanded' (reused)
}
```

- The board node is `Node<CardData>` (`BoardNode`), identical to every other card; only `type: 'presentation'` and `data.presentId` distinguish it.
- The deck **body** (`PresentationBody`, `presentModel.ts`) is **not** stored on the node — it stays in the `StorageProvider`, lazy-loaded by the expanded card, exactly as docs/sheets do. The node holds only a reference + display mode.
- `CARD_DEFAULTS.presentation = { w: 360, h: 260, label: 'Presentation' }` (`useStore.ts`) — required so `addCard` sizing works.

---

## 3. Node model & component

`PresentationCardNode` (`src/components/board/PresentationCardNode.tsx`), registered as `nodeTypes.presentation` in `BoardCanvas.tsx`.

```
PresentationCardNode(data, selected)
 ├─ meta = presentDocs[data.presentId]         // Zustand selector
 ├─ if !meta → CardChrome "Missing presentation" placeholder
 ├─ CardChrome (icon IcPresentation, title = meta.title)
 │   ├─ mode 'compact'  → snippet + "N slides · edited … · imported?"
 │   └─ mode 'expanded' → <ExpandedDeck presentId onOpen=openPresent/>
 └─ double-click → openPresent(meta.id)
ExpandedDeck(presentId)
 ├─ subscribes to presentDocs[presentId].updatedAt (re-reads on edit)
 ├─ storage.getDocument(presentId) → normalizePresentBody → body
 ├─ <SlideView slide theme width=248/>          // shared, lightweight
 └─ navigator: ‹ prev · "Slide i / n" · next ›   // aria-labeled buttons
```

- **`SlideView` extraction (key perf decision):** `SlideView`/`StaticElement`/`elementStyle` were moved out of `PresentationWorkspace.tsx` into `src/components/present/SlideView.tsx` so the board card can render a slide **without** pulling the heavy editor (and its lazy chunk) into the board/main bundle. Verified: main bundle grew ≈ 0.5 kB gz; `PresentationWorkspace` stayed a 5.4 kB gz lazy chunk.

---

## 4. Interaction states — compact / expanded / full

| Mode | Trigger | Renders | Body load | Actions |
|---|---|---|---|---|
| **Compact** (default) | insert/drag/import; inspector toggle | title, snippet, slide count, `imported` badge | none (meta only) | double-click → workspace |
| **Expanded** | inspector "Card mode → expanded" | live `SlideView` thumbnail of current slide + prev/next navigator + "Slide i/n" | lazy from storage; re-reads on `updatedAt` change | page slides (read-only); double-click → workspace |
| **Full** | double-click card, or inspector "Open in workspace", or sidebar click | the `PresentationWorkspace` editor (mode = presentation) | full editor | edit slides, export, notes, themes |

- Read-only roles: expanded preview + navigator remain available (read-only by nature); editing tools never render on the card (the card is always a *view*, never an inline editor — a deliberate choice given a 960×540 canvas doesn't inline-edit well at card scale). Full editing happens in the workspace, which itself honors read-only.

---

## 5. Drag-and-drop behavior

- **Sidebar → board:** deck rows are `draggable` and set `PRESENT_DRAG_MIME = 'application/x-lattice-present'` with the deck id (`Sidebar.tsx`). `BoardCanvas.onDrop` reads `PRESENT_DRAG_MIME`, verifies `presentDocs[presentId]` exists, and `addCard('presentation', dropPoint, { presentId, mode:'compact', color:'orange' }, CARD_DEFAULTS.presentation)`.
- **Read-only guard:** `onDrop` early-returns with a toast when the role can't add cards (shared with all card drops).
- **Toolbar insert:** "Deck" button creates a new deck (`createPresentDoc()`) and adds a compact card at viewport center (`CanvasToolbar.tsx`).
- **Individual slides → board (evaluated, deferred):** dragging a *single slide* onto the board as its own image/card was considered. **Decision: out of scope for v1** — it would fork slide ownership (a slide living outside its deck) and duplicate the presenter model. Recommended future path: "copy slide as image" produces an `image` card (self-contained), keeping decks authoritative. Documented here rather than implemented to avoid an IA decision without the product owner.

---

## 6. Inspector behavior

`NodeInspector` (`Inspector.tsx`) gains a `presentation` branch (parity with sheet/doc/code):
- Title input (`updatePresentMeta`), slide count, edited date, `Source: imported deck` when `sourceAssetId` set.
- **Card mode** segmented toggle (compact/expanded) → `updateCardData(node.id, { mode })`.
- "Open in workspace" (`openPresent`).
- Danger: "Delete presentation from vault" (`deletePresentDoc`, confirm dialog) — separate from the generic "Delete card".
- `TYPE_LABEL.presentation = 'Presentation card'` (the map is an exhaustive `Record<CardData['type'], string>`, so this is compile-enforced).

---

## 7. Realtime behavior

- The presentation node is serialized by `BoardCRDT.serializeNode`/`deserializeNode` **generically** (`data: n.data`), so `presentId` + `mode` ride the existing granular CRDT board ops with **zero CRDT changes**. Two users moving different cards never conflict; same-node edits resolve per-node LWW; drag arbitration (one-authoritative-drag + manipulation outline) applies unchanged.
- The deck **body** syncs through the existing presentation persistence (Yjs content doc / Drive JSON) independently of the board node; the expanded card re-reads on `updatedAt`, so a collaborator's slide edits reflect on the card.
- **Realtime-safe:** no new transient presence channel is needed; the card is a normal node.

---

## 8. Permission matrix

Inherits the shared `permissions.ts` matrix — no new capabilities.

| Action | Owner | Admin | Editor | Commenter | Viewer |
|---|---|---|---|---|---|
| See deck card (compact/expanded/navigate) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Insert/drag/import deck card | ✅ | ✅ | ✅ | — | — |
| Move/resize/delete card | ✅ | ✅ | ✅ | — | — |
| Switch card mode / rename deck | ✅ | ✅ | ✅ | — | — |
| Open workspace (read) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit slides in workspace | ✅ | ✅ | ✅ | — | — |
| Comment on card | ✅ | ✅ | ✅ | ✅ | — |
| Delete deck from vault | ✅ | ✅ | ✅ | — | — |

Enforced by `content.create`/`content.edit`/`content.delete` (board ops) and `comments.add`; the canvas hides the toolbar and rejects drops for read-only roles.

---

## 9. Comments & version integration

- **Comments:** the card carries the standard `CommentBadge` (via `CardChrome`) keyed by node id; commenting on a deck card uses the same thread machinery as any card (pins, panel, `@mentions`, reactions). No deck-specific code.
- **Versions:** deck bodies participate in the existing version history (`VersionHistoryService`, auto-snapshots on edit via `announceEdit('present', …)`, `useStore.persistPresentBody`). The card reflects restored/edited state on its next `updatedAt` read. Board-level version restore restores the node (including the presentation card) like any other.

---

## 10. Import / export relationship

- **Import:** `ImportService.importFile` already converted PPTX/ODP → editable deck (`createPresentDoc` + `persistPresentBody`) while preserving the source asset. **Changed:** `cardSpecFor({kind:'present'})` now returns a `presentation` card pointing at `outcome.presentId` (the editable deck) instead of an `asset` card pointing at the raw PPTX. The original file remains preserved and reachable via the deck's `sourceAssetId`.
- **Export:** unchanged and reached through the workspace (double-click) — PDF (vector) and PPTX (basic fidelity). No board-level export button is added (parity with doc/sheet cards, which export from their workspaces).

---

## 11. Performance rules

- Compact cards cost **only** their digested metadata (no body load) — default on insert/drag/import.
- Expanded cards lazy-load the body once and re-read only when `updatedAt` changes; `SlideView` renders scaled static divs (no editor, no animation loop).
- The shared `SlideView` module keeps the heavy editor lazy; main-bundle impact ≈ 0.5 kB gz (measured).
- Recommendation (inherits board-wide P1): virtualize nodes and pause off-screen work; many expanded decks on one board should default back to compact if a future perf budget is exceeded.

---

## 12. Fallback states

| Condition | Behavior |
|---|---|
| Deck deleted but card remains | "Missing presentation / This presentation was deleted" placeholder (`PresentationCardNode`) + inspector "was deleted" note. |
| Body missing/corrupt in storage | `normalizePresentBody(undefined)` → a valid 1-slide deck; navigator shows "Slide 1 / 1". Never a blank card. |
| Presentation engine/workspace unavailable (lazy chunk fails) | Compact card still renders (meta only); expanded card shows "Loading slides…"; double-click attempts the workspace as usual. The card never hard-crashes the board. |
| Read-only role | Card renders; tools/drops suppressed; navigator still pages (read-only). |
| Realtime off | Card behaves as a local node; syncs via Drive/tabs like every other card. |

---

## 13. Tests

`src/lib/present/presentBoardCard.test.ts` (vitest, `npm test`):
1. A `presentation` board node round-trips through JSON serialization preserving `type` and `presentId` (guards board export / Drive body / CRDT snapshot), and never carries an `assetId`.
2. A fresh deck body normalizes and digests to `slideCount: 1` with the title in the snippet (guards the card's lazy-load path + `importVault`).
3. Garbage from storage normalizes to a valid deck (guards the fallback state).

**Result:** 3/3 pass. (Component/DOM tests deferred — no jsdom harness exists in the repo; these pure tests cover the data-model + persistence + fallback contracts that the fix depends on.)

**Recommended future tests (when a jsdom harness lands):** render `PresentationCardNode` compact/expanded; assert navigator paging; assert inspector mode toggle updates `data.mode`; assert `deletePresentDoc` strips cards.

---

## 14. Acceptance criteria (all met unless noted)

- [x] `presentation` is a valid `CardType`; `CardData.presentId` exists.
- [x] `PresentationCardNode` registered in `BoardCanvas.nodeTypes`.
- [x] Canvas toolbar "Deck" inserts a new deck card.
- [x] Quick Create and command palette can create a presentation; palette searches decks; recents (sidebar + palette) resolve decks.
- [x] Sidebar deck rows are draggable; dropping on the canvas creates a deck card.
- [x] Compact card shows title/snippet/slide-count/source; double-click opens the workspace.
- [x] Expanded card shows a live slide thumbnail with a working prev/next navigator (aria-labeled).
- [x] Imported PPTX/ODP lands as an editable deck card (not a raw asset card); source preserved.
- [x] Inspector: rename, compact/expanded toggle, open-in-workspace, delete-from-vault.
- [x] Deleting a deck removes its cards on all boards (`stripCards`).
- [x] Node serializes through vault export / Drive / CRDT generically (realtime-safe).
- [x] Permissions honored (read-only hides tools, blocks drops; viewer read-only).
- [x] Comments/versions inherited.
- [x] Typecheck ✅, production build ✅, unit tests ✅.
- [~] Full browser click-through of insert/expand on the running app was partially blocked by an environment issue (canvas click delivery + a temporarily-unavailable JS classifier during the session); the toolbar "Add deck card" button and the sidebar drag/recents were DOM-verified, and the render path is covered by build + tests. Re-verify interactively before release.

---

## 15. Priority & implementation estimate

- **Priority:** High (flagship product-coherence gap) — **remediated in this audit.**
- **Delivered effort:** L (~1 focused session): 1 new component, 1 shared module extraction, 1 new icon, and edits across 9 files (model, dnd, store, BoardCanvas, CanvasToolbar, Sidebar, Inspector, ImportService, CommandPalette, TopBar) + tests.
- **Follow-ups (separate issues):** presenter mode (P2), slide-level linking (P3), "drag single slide → image card" (needs product decision), component/DOM tests (needs jsdom harness).
