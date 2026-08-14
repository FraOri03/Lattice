repo: FraOri03/Lattice
branch: main

## Last sync
date: 2026-08-13T08:16:43Z

### Updated in this project
- Built Vector Mode UI mockup (`Lattice Vector Mode.dc.html`) on Lattice's real design tokens.
- Grounded the shell in TopBar/SectionTabs source: breadcrumb, segmented clusters, `.btn`/`.icon-btn`, Inter type stack.
- Reused Icons.tsx path data for shared Creative actions (cursor, hand, search, edit, image, eye, lock, command, alert, history).
- Toolbar consolidated into long-press groups so the column fits the shell without clipping.

## Screen map
| Screen / area | Built from |
| --- | --- |
| Design tokens, `.btn`, `.icon-btn`, density | src/styles/index.css |
| Topbar: breadcrumb, presence, Share, ⌘K, comments/history | src/components/TopBar.tsx |
| Mode + Edit/Review/Present segmented clusters | src/components/shell/SectionTabs.tsx |
| Toolbar dividers (horizontal rule pattern) | src/components/ui/ToolbarDivider.tsx |
| Inspector width / collapsible panel model (280px) | src/components/shell/InspectorPanel.tsx |
| Shared Creative icon vocabulary | src/components/Icons.tsx |

## Notes
- Vector Mode is additive: no existing Lattice screens were modified.
- Deliberate evolutions of Lattice patterns, for professional vector work: a persistent context bar above the canvas, a compact 44px vertical tool rail, and a document status bar — none exist in the current shell.
