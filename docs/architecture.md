# Architecture — Phase 9 modules

The overall app architecture (document engine, storage/sync, collaboration/CRDT, projects/workspaces) is documented in the [README](../README.md) §3, §13–15. This doc covers the **modules added for the Phase 9 P1 work** (issues #8–#11) and the key architectural decisions behind them.

## New modules

| Module | Role |
|---|---|
| `src/lib/a11y/announcer.ts` | Zustand store behind one app-wide polite `aria-live` region; `announce(msg)` works from React and from controllers |
| `src/components/a11y/LiveRegion.tsx` | The single live region, mounted at the app root |
| `src/lib/board/keyboardNav.ts` | **Pure** board keyboard logic: `resolveBoardKey`, `isEditableTarget`, step sizes, accessible names, spatial targeting |
| `src/components/board/useBoardKeyboard.ts` | React hook that binds the pure logic to store mutations, focus and announcements |
| `src/components/board/BoardAddMenu.tsx` | Keyboard-navigable `role="menu"` "Add card" affordance |
| `src/lib/collab/collabPresentation.ts` | Single source of truth for the collaboration tier (realtime / drive / local) + `useCollabMode()` |
| `src/lib/nav/navUrl.ts` | **Pure** URL serialize / parse / validate for the navigable state |
| `src/lib/nav/useUrlHistory.ts` | Binds the store to the History API (push / popstate / restore) |
| `src/lib/perf/viewerBudget.ts` | Observable cap on concurrent live 3D viewers |
| `src/lib/perf/useInViewport.ts` | `IntersectionObserver` + page-visibility → `active` |
| `src/lib/perf/useViewerSlot.ts` | Hook that holds/releases a `ViewerBudget` slot |
| `src/lib/perf/visibility.ts` | Pure `computeActive` / `shouldAnimate` |
| `src/components/board/ThreeScene.tsx` | Lazy-loaded `embed3d` three.js scene (pause-aware) |
| `src/components/preview/ThreeDViewerLazy.tsx` | Lazy + viewport-gated wrapper around the asset `ThreeDViewer` |

New store actions: `nudgeCards` (arrow-move), `selectCard` (keyboard selection), `applyNav` (history restore).

## Decisions

1. **Pure logic + thin hook, everywhere.** Keyboard resolution, nav serialization, and the visibility/budget decisions live in framework-free modules that are unit-tested directly. The React hooks just apply the results. This is why the test suite needs neither a mounted React Flow (which requires layout/WebGL) nor real cloud/timers.

2. **Extend React Flow, don't replace it.** For keyboard operability, React Flow keeps `nodesFocusable` (Tab focus + `node.ariaLabel`) while `disableKeyboardA11y` turns off *its* key handling, so one app controller owns arrow-move/open/link/delete/add with no double-firing and no lost pointer behavior. (`node.domAttributes`/`ariaLabel` are applied in a derived `renderNodes`, never in persisted board data.)

3. **One source of truth for collaboration wording.** The realtime/drive/local tier is derived once from provider-capability signals (`collabPresentation`), so presence, the Share button, the Share dialog and the status chip can't drift apart or over-promise.

4. **URL owns the search string only.** History sync uses `?p/m/b/e` and always preserves `location.hash`, so the pre-existing `#invite=` flow is untouched. A `navKey` dedup + an `applying` guard prevent React↔URL↔popstate loops, and transient state is never serialized.

5. **Content-windowing over destructive virtualization.** three.js loads only through lazy boundaries (kept in one `manualChunks` `three` chunk); off-screen/idle viewers suspend their loops and render on-demand; a budget caps concurrency. Card chrome stays mounted (stable placeholders, intact edges/selection), so no CRDT/editor state is lost — chosen over React Flow's `onlyRenderVisibleElements`, which unmounts nodes. See [`performance.md`](performance.md).

## Compatibility

All changes are additive: no data migration, no persisted-schema change (the persisted store `partialize` and `version` are unchanged), and every Phase 1–8.5 capability — storage/Drive/CRDT/Liveblocks, editors, import/export, presentations, GitHub sync — is preserved. Vitest gains a `jsdom` environment + setup shim (`src/test/setup.ts`) for the component tests; the `test` script is unchanged (`vitest run`).
