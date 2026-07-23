# Features — Phase 9 (P1)

New and changed capabilities from the Phase 9 P1 pass (issues #8–#11). The full product feature inventory is in the [README](../README.md); this page is the focused index for what landed here.

## Accessibility (#8)

- **Keyboard-operable board:** Tab between cards, arrow-keys to move (Shift = coarse, Alt = precise), `Enter` to open, `L` to link, `Delete` to remove, `A` for a keyboard "Add card" menu, `Esc` to cancel — with live-region announcements and no interception inside editors. → [`accessibility.md`](accessibility.md)
- **Status is never colour-only:** sync, Drive, realtime, roles, presence and the minimap all combine text + icon/shape + accessible name.

## Collaboration honesty (#9)

- **One collaboration tier** drives every surface: presence badges, the Share button and dialog, and the status chip all state the same, honest scope — realtime (Liveblocks + Yjs), Drive polling, or same-browser tabs — with no avatar or control implying live remote collaboration that isn't configured. → [`collaboration.md`](collaboration.md)

## Navigation (#10)

- **Browser Back/Forward + deep links:** project, mode, board and the open entity are a navigable, refreshable URL (`?p&m&b&e`); invalid ids degrade safely; the `#invite=` flow is preserved. → [`navigation.md`](navigation.md)

## Performance (#11)

- **three.js is lazy:** removed from the main bundle (≈ 151 kB gz lighter) into a dedicated lazy chunk, with a loading skeleton.
- **No idle/off-screen loops:** 3D scenes and video suspend when off-screen, the tab is hidden, or the board is inactive; the asset viewer renders on-demand; a budget caps concurrent live 3D; a 100+ card board stays interactive. → [`performance.md`](performance.md)

## Scope

Only the **High/Critical** rilievi of issues #8–#11 were implemented. The Medium/Low items in those issues — Workspace auto-hide, responsive tiers, identity-vs-storage copy, sub-24px targets, etc. — were intentionally left for their own tickets, except where a minimal technical change was needed to complete a High+ requirement. (**Split-as-mode demotion has since shipped** on `feat/call-and-toolbar-ia`: Split is a layout toggle and Graph a content view — see [navigation.md](navigation.md#split-is-a-layout-not-a-mode).)
