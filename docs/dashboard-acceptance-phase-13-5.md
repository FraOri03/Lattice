# Acceptance criteria, i18n and accessibility — Phase 13.5

The contract phase 15 is measured against. Written before the build, so #79 has
something to fail against rather than a reading of the mockup.

Same thesis as the rest of phase 13: the machinery already ships. There is one
app-wide live region, one global reduced-motion rule, one focus-ring
convention, and an i18n catalog where a missing Italian key is a **compile
error**. None of that gets reinvented for the dashboard.

Companions: [13.1](dashboard-ia-phase-13-1.md) (destinations),
[13.2](dashboard-visual-spec-phase-13-2.md) (states, tiers),
[13.3](dashboard-data-contract-phase-13-3.md) (sources),
[13.4](dashboard-search-and-new-phase-13-4.md) (search and New).

---

## 1. What already ships, and must be used

| Concern | What exists | Where |
|---|---|---|
| Announcements | one polite region, `announce(msg)`, with a nonce so a repeated message is re-read | `src/lib/a11y/announcer.ts`, `<LiveRegion/>` mounted in `App.tsx` |
| Reduced motion | a global `@media (prefers-reduced-motion: reduce)` rule collapsing every declared duration | `src/styles/index.css` |
| Focus ring | global `:focus-visible` | `src/styles/index.css` |
| Tiers | `full · compact · drawer · viewer`, published as `data-tier` | `src/lib/layout/` |
| Locale | `en` is the source; `it` is type-checked against `typeof en` | `src/lib/i18n/messages.ts` |
| Target size | ≥ 24 px asserted for the drawer and viewer tiers | phase 12 |

Two consequences worth stating, because both are easy to get wrong:

- **No second live region.** A section that wants to announce calls `announce()`.
- **The CSS rule cannot shorten a JS timer.** `index.css` says so itself; any
  timing the dashboard introduces — the 600 ms before a skeleton speaks (13.2),
  a toast dwell — checks `matchMedia('(prefers-reduced-motion: reduce)')` in
  code.

## 2. Global criteria

Every one of these is a statement that can fail.

1. Signing in lands on Home; no path lands in a project that the URL did not ask
   for.
2. `?d=<destination>` survives a refresh; an unknown value lands on Home; a URL
   carrying a valid `p` opens the project and ignores `d`.
3. Back and Forward walk the destinations without duplicate entries.
4. Switching workspace opens no project and creates none.
5. Every surface renders at 390 px with no horizontal page scroll, in both
   locales and both themes.
6. Every interactive target is ≥ 24 px in both dimensions, at every tier.
7. Every status is legible without colour: a shape or an icon plus a word.
8. No section shows an empty state it cannot justify — where the data has no
   source, the state is *unavailable* with the reason (13.3).
9. Keyboard alone reaches every destination, every card, and every card action.
10. `Ctrl/Cmd+K` opens the palette from every surface, and `Esc` closes it and
    returns focus to the control that opened it.

## 3. Criteria per section

| Section | Must be true |
|---|---|
| **Home** | shows every project in the active workspace, grouped Starred / Recent / Projects / Archived · a project appears in exactly one group · the resume rail hides below two entries · the four stat tiles always render, and storage says "nothing stored yet" rather than `0 B` · the grid/list toggle changes the project sections and nothing else |
| **Recents** | newest first, grouped by day · every row names its project and its workspace · a row whose entity no longer exists is dropped, not rendered dead · the log says it is device-local and capped |
| **Starred** | spans workspaces, with a workspace filter · every row can be unstarred from the row it is on · bulk unstar announces the count · order never changes on its own |
| **Shared with me** | groups by owner · each row states the role *and* what the role grants · each row states its scope (this browser / this Drive) · the page presents *unavailable* for anything outside those two paths |
| **Invites** | received is *unavailable* until #88 · sent lists real invitations with pending / accepted / revoked only · no delivery or expiry claim is made · the nav badge shows no count while the section cannot compute one |
| **Trash** | *unavailable* until #115 · when it lands: every row shows its purge date, restore says where the item will land, and Lattice's trash is never conflated with Drive's |
| **Search** | reaches every project the device holds · each result names its project · ranking is tiered, not insertion order · no results offers create-with-this-name · the launcher never holds text |
| **New** | the same list in the menu and the palette · every creation names its destination before it happens · from the dashboard a target is resolved, never inherited silently · New project lands in the active workspace |

## 4. Keyboard traversal and focus order

**Tab order** follows the DOM: sidebar (Home mark → workspace switcher →
destinations → project tree → settings), then the top bar (search launcher →
New → sync → notifications → theme → profile), then the content.

**Each card contributes three stops** — the card, its star, its overflow menu.
That is verbose across a twenty-card grid and it is still the right answer: the
alternative is hiding actions from the keyboard. The escape hatches are
structural rather than special-cased — every section is a `<section>` with a
heading, so heading navigation jumps sections, and the palette reaches anything
by name.

**Focus moves, and comes back:**

| Opening | Focus goes to | On close it returns to |
|---|---|---|
| Palette (click or `Ctrl/Cmd+K`) | the palette input | the launcher, or the element that had focus |
| New menu | the first item | the New button |
| Target picker | the project field, pre-filled and selected | the New button |
| Notification panel | the panel heading | the bell |
| Sidebar drawer (drawer/viewer tiers) | the first destination | the edge handle |
| Any dialog | the dialog | the control that opened it |

`Esc` closes the topmost layer only, and never navigates.

**Roles:** the palette is a `role="dialog"` with `aria-modal`, its result list a
`listbox` with `aria-activedescendant` following the cursor — it is a plain
overlay with none of this today. Section lists are `role="list"`. The grid/list
toggle is two buttons carrying `aria-pressed`. The active destination carries
`aria-current="page"`.

## 5. Announcements

Through `announce()`. Message patterns, not sentences to translate ad hoc — each
gets an i18n key.

| Event | Announcement |
|---|---|
| Star / unstar | `“Brand Guidelines” starred` / `unstarred` |
| Bulk unstar | `4 items unstarred` |
| Restore / purge | `“Q2 Budget” restored to Studio Nord` / `permanently deleted` |
| Invite accepted / declined | `Joined “Acme Rebrand” as Editor` / `Invitation declined` |
| Workspace switched | `Studio Nord — 3 projects` |
| Destination changed | the destination name, once, on arrival |
| View switched | `List view` / `Grid view` |
| Filters reset | `Filters cleared — 12 items` |
| Section resolved after a skeleton | `Recents loaded — 14 items` |
| Search results | debounced 500 ms, `12 results` — never per keystroke |
| Creation | `Created note “Untitled note” in Acme Rebrand` |
| Sync state change | the same words the chip shows |

## 6. Target sizes

≥ 24 × 24 px (WCAG 2.2 SC 2.5.8), at every tier, with the spacing exception
allowed only where a 24 px target would break a dense row *and* the row itself
is activatable.

Known offenders in the prototype, all cheap to fix: the selection checkboxes in
Starred and Trash render at 16 px, and the "Mark all read" link button has no
padding at all. Passing today: top-bar icon buttons at 28 px, `EntityCard`'s
star and overflow at exactly 24, the Trash purge glyph at 26, mobile rows at
48–60.

## 7. Reduced motion

The global rule handles durations. What still needs a decision:

- **Skeletons** must never be the only signal that something is happening —
  the delayed line from 13.2 is what carries the meaning when the pulse is off.
- **Stagger** (`anim-stagger`, `--i`) may delay *motion*, never *content*: with
  reduced motion the eighth card is present immediately, not eight steps later.
- **The theme reveal** already checks the preference in `animateTheme`; the
  dashboard adds nothing to it.
- **Auto-scrolling rails** do not exist and must not arrive: a horizontal rail
  scrolls because the user scrolls it.

## 8. i18n

`en` is the source and `it` is checked against `typeof en`, so **enumerating
the keys is writing the English block** — the compiler then refuses to build
until Italian exists. That is the whole enforcement mechanism, and it is why
this section lists shapes rather than a two-column glossary.

**Blocks to add**, alongside the `dashboard` block that already ships:

| Namespace | Covers | Notable shapes |
|---|---|---|
| `dashboard` (extend) | greeting, stat tiles, section headings, view toggle | already has `boardCount(n)`, `fileCount(n)`, `updated(when)` — the plural pattern to copy |
| `destinations` | the six names, their descriptions, their empty and unavailable copy | one `title` + `empty` + `unavailable` per destination |
| `states` | loading, empty, no-results, offline, error, unavailable | each takes `(what: string)` where the subject varies |
| `cards` | anatomy labels, star/unstar, overflow items, sync scope | `starLabel(name)`, `unstarLabel(name)` for accessible names |
| `palette` | placeholder, section headers, no-results, create-from-query | `createNamed(kind, name)` |
| `create` | the seven kinds, the target line, per-kind capability notes | `createIn(project)` |
| `announcements` | every row of §5 | all functions; none concatenated at the call site |

**Rules**

- No concatenation in components. A sentence with a name in it is a function
  taking the name, as `openProject(name)` already is.
- Plurals go through a function per string, following `boardCount`. Italian and
  English agree on one/other, so no plural library is needed.
- Relative times go through `useTimeAgo`; no dashboard-local date formatting.
- Names are never translated: projects, workspaces, files, people, e-mails.
- The destination is **Starred / Preferiti** — the keys already ship
  (`dashboard.starred`), and 13.1 settled that it is not called Favorites.
- Italian runs long: phase 12 measured about 70 px more than English across a
  bar of controls. The layouts to check in Italian before shipping are the
  60 px compact rail, the status-bar rows, the role and scope chips, and the
  two-button invite rows.

## 9. How this is verified

- **Pure parts, unit-tested**: destination resolution from the URL, ranking
  order, tier selection, the state chosen for a given data condition.
- **Rendered checks**: focus returns to the opener on close, `aria-current` on
  the active destination, no horizontal overflow at 390 px, target sizes.
- **Manual, once per locale**: the Italian pass over the four layouts named
  above, and a keyboard-only run through §3 with the screen reader on.

The pure parts are where the leverage is: the existing `tiers.test.ts` and
`navUrl.test.ts` are the model — decisions extracted into functions that can be
asserted without a DOM.
