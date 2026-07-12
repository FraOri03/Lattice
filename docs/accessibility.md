# Accessibility

Status of the accessibility work, focused on the Phase 9 P1 fixes for issue **#8** (`LAT-2` Critical, `LAT-11`/A11Y-2 High). Preserves every accessible feature shipped earlier (global `:focus-visible`, broad `aria-label`s, `prefers-reduced-motion`, styled dialogs, the slide inspector's numeric X/Y/W/H fields as a drag alternative).

## Board canvas is keyboard-operable (A11Y-1)

The infinite board — previously pointer-only — is now fully operable from the keyboard. The design **extends** React Flow instead of replacing it:

- React Flow keeps nodes **Tab-focusable** (`nodesFocusable`, default) so every card is reachable and carries an accessible name (`node.ariaLabel`, e.g. *"Document card: Roadmap"*).
- React Flow's own key handling is disabled (`disableKeyboardA11y`) so it never fights the app; a single controller owns board keys.
- The controller is split into a **pure, unit-tested decision module** (`src/lib/board/keyboardNav.ts`) and a thin React hook (`src/components/board/useBoardKeyboard.ts`) that applies store mutations, focus moves and announcements.

### Keyboard shortcuts

| Key | Action |
|---|---|
| `Tab` / `Shift+Tab` | Move focus between cards (the focused card is selected and announced) |
| `↑ ↓ ← →` | Move the focused card (10 px) |
| `Shift` + arrow | Coarse move (50 px) |
| `Alt` + arrow | Precise move (1 px) |
| `Enter` | Open the focused card's entity in its workspace |
| `L` | Start a keyboard link from the focused card; `Enter`/`L` on a second card connects, `Esc` cancels |
| `Delete` / `Backspace` | Delete the current selection (or the focused card) |
| `A` | Open the keyboard-navigable **Add card** menu (Up/Down/Home/End, Enter, Esc) |
| `Esc` | Cancel a keyboard link / close the add menu |

### Guarantees

- **Never intercepts typing.** `isEditableTarget` excludes `<input>`, `<textarea>`, `<select>`, contenteditable (Tiptap), Monaco (`.monaco-editor`) and the spreadsheet grid (`.sheet-scroll`). Delete/Backspace and letter shortcuts do nothing while an editor has focus.
- **Focus follows lifecycle.** Creating a card focuses it; deleting returns focus to the board region; opening moves to the workspace; selection tracks focus.
- **Announcements.** One polite `aria-live` region (`src/lib/a11y/announcer.ts`, rendered by `<LiveRegion/>` at the app root) announces selection, movement (with coordinates), linking, creation and deletion. A trailing-space nonce guarantees repeats are re-read.
- **Valid ARIA.** The board is a `role="application"` region with `aria-describedby` pointing at a visually-hidden instructions block. No non-conformant widget roles are faked.
- **Read-only roles** keep read access: viewers/commenters can Tab, focus and `Enter`-open, but move/delete/link/add are refused.
- **Pointer parity.** Mouse drag, box-select (`Shift`+drag), connection-handle dragging and double-click-to-open are unchanged.

## No status by colour alone (A11Y-2)

Every status that previously leaned on colour now combines **text + icon/shape + accessible name**, with colour as reinforcement only:

| Surface | Redundancy |
|---|---|
| Realtime chip | Per-state icon (check / spinner / alert / cloud-off / lock) + label + `aria-label` spelling the state |
| Sync / Drive chip | Icon (cloud / spinner / **alert** on error / wifi-off) + label + descriptive `aria-label` |
| Presence | Avatars + a scope badge ("same browser" / "Drive") with icon and tooltip |
| Roles | Text labels everywhere (`ROLE_LABEL`) |
| Minimap | `ariaLabel` on the React Flow `MiniMap` |

`:focus-visible` (a visible ring, including a card-sized ring on focused board nodes) and `prefers-reduced-motion` remain global.

## Tests

`src/lib/board/keyboardNav.test.ts` (key→action resolution, the editor guard, step sizes, accessible names, spatial targeting), `src/store/boardActions.test.ts` (create/select/move/link/delete + large board), and `src/components/collab/RealtimeStatusChip.test.tsx` (status carried by accessible name + icon, not colour).

## Known limitations

- Focus order across the board is DOM order (not a single-stop roving tabindex): arrow keys are reserved for *moving* a card, so cards are individually reachable via `Tab`. This is fully operable; a single-stop roving model would require re-purposing the arrow keys.
- Deep screen-reader testing across NVDA/JAWS/VoiceOver is not yet part of CI.
