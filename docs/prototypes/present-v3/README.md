# Lattice Present v3 — UI prototype

![Present v3 prototype](preview.webp)

The interactive prototype that specified **19E — Presentation upgrades**
(epic [#96](https://github.com/FraOri03/Lattice/issues/96)).

It lived in a download folder while the work was being done, which is the worst
place for the document five issues were written against. It is committed here
for the same reason the Trace prototype is: a prototype nobody can find is a
prototype nobody can check.

## Run it

Any static server works — the page loads `support.js` from the same directory,
so `file://` will not do.

```bash
python -m http.server 8899 --directory docs/prototypes/present-v3
```

Then open `http://localhost:8899/Lattice Present - Issue 96.dc.html`.

## What it specified, and what shipped

Seven frames, each of which became a subphase of the epic. All five subphases
are merged.

| Frame | What it drew | Where it landed |
| --- | --- | --- |
| **1a** | Contextual bar, rail with sections and hidden slides, three-scope inspector, notes as a strip, status bar | [#238](https://github.com/FraOri03/Lattice/issues/238) — 19E.1 |
| **1b** | Multi-select, smart guides, layers column, undo stack | [#237](https://github.com/FraOri03/Lattice/issues/237) — 19E.0 (canvas) and [#238](https://github.com/FraOri03/Lattice/issues/238) (layers) |
| **1c** | Masters and semantic layouts, overrides visible and reversible, free objects | [#239](https://github.com/FraOri03/Lattice/issues/239) — 19E.2 |
| **1d** | Structured rich text, named styles with overrides, honest overflow | [#240](https://github.com/FraOri03/Lattice/issues/240) — 19E.3 |
| **1e** | Non-destructive crop with a focal point, adjustments, assets by reference | [#241](https://github.com/FraOri03/Lattice/issues/241) — 19E.4 |
| **1f** | Tables, and a Sheet-linked chart that reports when its source moved on | [#241](https://github.com/FraOri03/Lattice/issues/241) — 19E.4 |
| **1g** | Copy / embed / link as one model, with a deck-wide panel | [#241](https://github.com/FraOri03/Lattice/issues/241) — 19E.4 |

The **Present** button the prototype draws is a button here and a screen in
[#244](https://github.com/FraOri03/Lattice/issues/244), which built the
presenter itself.

## Where it differs from what shipped

Kept for honesty — a prototype that is quietly out of date is worse than none.

- **Per-master layout subsets and user-authored layouts** ("Layouts in Content
  · 6 layouts", "Duplicate as linked layout") are drawn but not built: the
  catalogue is built in and every master offers all ten. A layout *editor* is a
  feature in its own right.
- **A logo as furniture** is drawn; rule, footer text and slide number are what
  is implemented, because an image logo needs the by-reference asset model.
- **The single contextual bar** is drawn as one row. The bar was extended
  rather than rebuilt: consolidating it needs the toolbar overflow work, and
  without that it would simply wrap on a narrow window.
- **AI touches** (`✦ Expand with AI`, `✦ Generate from Brand`) are drawn and
  deliberately not built — there is no provider seam in the deck editor yet.

## Provenance

Authored outside the repository against the real source: `github.md` records
the sync, the branch and which files each screen was built from.
