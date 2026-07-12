# Collaboration — realtime vs Drive vs local

The full collaboration architecture lives in the README (§13–15). This doc covers the Phase 9 honesty fix for issue **#9** (`COL-1` High): making the whole UI communicate, consistently, what "collaborate" means right now.

## The problem

Lattice's realtime chip was honest ("Realtime off" + setup checklist), but the surrounding UI wasn't: presence avatars and the Share button were always shown, so a user could reasonably believe they were collaborating live with a remote teammate when — without `VITE_REALTIME_BACKEND=liveblocks` + Google sign-in — "live" meant only tabs of one browser (BroadcastChannel) plus ~20 s Drive polling.

## One source of truth

`src/lib/collab/collabPresentation.ts` derives a single **collaboration tier** from the active provider's real capability signals — never from scattered env reads:

```ts
deriveCollabMode({ hasRealtimeBackend, googleSignedIn, driveConnected }) → CollabMode
```

| Tier | When | Scope | Presence badge |
|---|---|---|---|
| **realtime** | backend configured **and** signed in with Google | everyone, live | "live" |
| **drive** | otherwise, Drive connected | same Google Drive (~20 s, no live presence) | "Drive" |
| **local** | otherwise | tabs of this browser (BroadcastChannel) | "same browser" |

`realtime` requires **both** a configured backend and a Google identity — exactly the condition under which `RealtimeCollaborationProvider` joins the hub. A mock account never counts.

## Where it shows

Every surface reads from this one module, so wording can't drift:

- **Presence avatars** carry a scope badge ("same browser" / "Drive") with an icon + tooltip when realtime is off; the group's accessible name states the scope. No avatar implies live remote collaboration that isn't configured.
- **Share button** (top bar) states the scope in its tooltip and accessible name, with a short tier chip.
- **Share dialog** shows one honest banner describing exactly what collaboration currently delivers, and the divergent footer copy was removed.
- **RealtimeStatusChip** keeps the honest connection status (with the setup checklist when unconfigured) and per-state icons (see [`accessibility.md`](accessibility.md)).

The three transports themselves are unchanged (README §13/§15.2): `LocalCollaborationProvider` (BroadcastChannel), `DrivePollingCollaborationProvider` (~20 s), `RealtimeCollaborationProvider` (Liveblocks + Yjs). Nothing is simulated; the setup checklist stays available when no backend is configured.

## Reactivity

`useCollabMode()` recomputes on the two signals that actually change what collaboration means — **account** (login/logout, via `AccountProvider`) and **Drive connection** (via `useSyncStore`) — so the labels stay correct across sign-in, sign-out, Drive connect/disconnect and provider changes.

## Tests

`src/lib/collab/collabPresentation.test.ts` locks the three tiers, including the "backend configured but not signed in ⇒ not realtime" case, so no surface can over-promise.
