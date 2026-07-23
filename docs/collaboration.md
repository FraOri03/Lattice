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

## Presence, realtime editing and the media call are three different things

Project calls (audio / camera / screen share) run on **LiveKit**, a separate
transport added alongside — never inside — the collaboration stack. The split is
deliberate and total:

| Concern | Owner | Notes |
|---|---|---|
| CRDT content (docs, code, sheets, boards) | **Liveblocks + Yjs** | unchanged |
| Presence, cursors, selections | **Liveblocks** | unchanged |
| Comments, activity, versions | **Liveblocks** | unchanged |
| Roles & content permissions | **project ACL** (Liveblocks room metadata) | unchanged |
| Microphone, camera, screen share | **LiveKit** | new |

Audio/video is never tunnelled through Liveblocks, and LiveKit never carries
project content.

**Being present ≠ being in the call.** The presence avatars show who has the
project open; the call is joined only by an explicit action, and the topbar
keeps the two states visually distinct ("Join call" vs an "In call" chip).

### What the initial implementation does and does not do

Implemented: join/leave, microphone, camera, screen share (start, stop, correct
recovery when the browser's own "Stop sharing" ends it), a compact call island
with a participant filmstrip, focus on a shared screen, a device picker, and
accessible announcements for join/leave/mute/media failures.

**Microphone and camera are OFF on join.** `room.connect()` publishes no
tracks, so the browser is not asked for device permission until the user
presses mic, camera or screen share.

Not implemented in this first pass, and not claimed anywhere in the UI:
recording, dial-in/telephony, chat inside the call (comments already exist),
background blur/virtual backgrounds, breakout rooms, and turning a screen share
into a persistent Board card. A seam exists for a future "open screen share in
a split pane", but nothing ships on it yet.

### Media permissions

Role → media capability is a single shared module,
`src/lib/media/mediaPermissions.ts`, imported verbatim by the UI and by
`api/realtime/media-token.ts` — the same pattern as `roleAccess.ts`.

That module speaks only in *abstract* capabilities (join / audio / video /
screenShare / moderate) and stays dependency-free, because it ships in the
client bundle. Turning a capability into LiveKit's `TrackSource` enum requires
`livekit-server-sdk`, which is server-only, so that mapping lives in the
endpoint alone.

| Role | join | mic | camera | screen share | moderate |
|---|---|---|---|---|---|
| owner | ✅ | ✅ | ✅ | ✅ | ✅ |
| admin | ✅ | ✅ | ✅ | ✅ | ✅ |
| editor | ✅ | ✅ | ✅ | ✅ | — |
| commenter | ✅ | ✅ | ✅ | — | — |
| viewer | ✅ | ✅ | ✅ | — | — |

How this was derived, rather than assumed:

- **mic/camera for everyone, viewers included** — viewers already hold
  `room:presence:write` on both Liveblocks rooms, i.e. they may broadcast
  presence. Speaking or showing a face is presence; it mutates no content.
- **screen share = the content-writing roles** (`roleWritesContent`) — a screen
  share broadcasts arbitrary content into the project's space, which is the
  media analogue of contributing content. A commenter cannot create or edit
  content, so they do not broadcast it either. (The original brief allowed
  commenter screen share "if coherent with the existing matrix"; it is not.)
- **moderation = `members.manage`** — owners and admins administer people;
  editors administer content.

A test asserts these two predicates agree with the existing matrix for every
role, so the media rules cannot silently drift from the content rules.

**The token is the enforcement boundary.** The client hides controls a role
cannot use, but that is only courtesy: capabilities are baked into the signed
LiveKit token (`canPublishSources`, `roomAdmin`), so a tampered client still
cannot publish a screen share it was not granted. The endpoint derives identity
from a Google-verified token and the role from the project ACL; a `role` in the
request body is ignored.

### Configured vs not configured

Calls need `VITE_LIVEKIT_URL` (public), `LIVEKIT_API_KEY` + `LIVEKIT_API_SECRET`
(server-only) **and** the realtime backend, because membership is read from the
Liveblocks ACL. With any of them missing:

- nothing connects and no device is touched;
- "Join call" is disabled and explains why;
- the endpoint answers `501` with a specific message;
- Liveblocks/Yjs collaboration is entirely unaffected;
- tests need no real credentials.

## Tests

`src/lib/collab/collabPresentation.test.ts` locks the three tiers, including the "backend configured but not signed in ⇒ not realtime" case, so no surface can over-promise.

For calls: `src/lib/media/mediaRoomId.test.ts` (deterministic room id, no
collision with the Liveblocks namespace), `src/lib/media/mediaPermissions.test.ts`
(the matrix, cross-checked against the content matrix; viewer and commenter get
no unauthorised capability), `api/realtime/media-token.test.ts` (identity and
role never taken from the body, 401/403/501 paths, secret hygiene — all
dependencies mocked), `api/realtime/media-token.grant.test.ts` (the grant is
signed by the *real* LiveKit SDK and the JWT decoded, so a `canPublishSources`
LiveKit would reject cannot pass while the signer is stubbed — it runs under
`@vitest-environment node`, since jsdom cannot sign), and
`src/components/call/CallProvider.test.tsx`
(joining turns on no device; an unconfigured deployment attempts nothing).
