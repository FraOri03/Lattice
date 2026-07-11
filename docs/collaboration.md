# Collaboration

Lattice's realtime, permissions, presence, comments and version model — and, most
importantly, an honest account of what "live" means in each configuration. The transport
architecture is in [architecture.md](architecture.md#collaboration--crdt-layer); how to
configure the realtime backend is in [integrations.md](integrations.md#realtime-collaboration-liveblocks--yjs).

## What "collaboration" means in each mode

Lattice runs every available transport at once behind `CollabHub`, and each transport
reports its own honest capabilities. Concretely:

| Transport | Scope | Latency | Presence / cursors | Needs |
|---|---|---|---|---|
| `LocalCollaborationProvider` | Tabs/windows of **one browser** | Instant | Yes (real) | Nothing — always on. |
| `DrivePollingCollaborationProvider` | Anyone with access to the project's Drive folder | ~20s poll | Last-active timestamps only | Google Drive access. |
| `RealtimeCollaborationProvider` | **Cross-device**, cross-user | Live | Yes (real) | `VITE_REALTIME_BACKEND=liveblocks` + `LIVEBLOCKS_SECRET_KEY` + Google sign-in. |

> **Honesty note (audit `COL-1`):** without the realtime backend configured, "live" means
> only *tabs of one browser* + ~20s Drive polling. The realtime status chip states this,
> but the surrounding presence/Share UI does not yet visibly downgrade — propagating that
> honesty is a tracked P1 roadmap item. Do **not** describe cross-device realtime as
> turnkey; it is experimental and config-gated (alpha).

## Permission model

Roles and their capabilities are defined **once** in `src/lib/collab/permissions.ts` and
imported by both the UI and the server-side room ACL, so the two can never drift. The
matrix below is generated from that module.

| Capability | Owner | Admin | Editor | Commenter | Viewer |
|---|:---:|:---:|:---:|:---:|:---:|
| View content | ✅ | ✅ | ✅ | ✅ | ✅ |
| Add comments / resolve own | ✅ | ✅ | ✅ | ✅ | — |
| Resolve any comment | ✅ | ✅ | ✅ | — | — |
| Create / edit / delete content | ✅ | ✅ | ✅ | — | — |
| Create & restore versions | ✅ | ✅ | ✅ | — | — |
| Manage members (below own rank) + invites | ✅ | ✅ | — | — | — |
| Force-unlock locked code files | ✅ | ✅ | — | — | — |
| Project settings | ✅ | ✅ | — | — | — |
| Manage integrations (Drive/GitHub) | ✅ | — | — | — | — |
| Manage admins | ✅ | — | — | — | — |
| Delete project / transfer ownership | ✅ | — | — | — | — |

Ranks (`owner > admin > editor > commenter > viewer`) drive "who may change whose role":
owners manage everyone but owners; admins manage everyone below admin. The owner can
**preview the app as any role** from Share → Settings.

## Server-enforced permissions

When the realtime backend is configured, two Vercel functions
(`api/realtime/auth.ts`, `api/realtime/rooms.ts`) plus `LIVEBLOCKS_SECRET_KEY` enforce
access on the server:

- **Identity** — the client sends its Google OAuth access token; the server verifies it
  against Google (`tokeninfo`, audience-checked against `VITE_GOOGLE_CLIENT_ID`) and
  derives the e-mail from Google's answer, never from the request body.
- **Authorization** — each project maps to two rooms: *content* (docs/code/boards;
  writable by owner/admin/editor) and *collab* (comments/areas/durable state; writable by
  commenters too). The ACL lives in room metadata, mutated only through the rooms
  endpoint, which evaluates the **same `permissions.ts` matrix the UI uses**. Tokens are
  minted per-role (`room:write` vs `room:read` + `room:presence:write`) and Liveblocks
  enforces them on every websocket op — a tampered client cannot exceed its role; viewers
  can present but cannot write a single CRDT byte.
- Invites/role changes/removals mirror to the server ACL automatically (`ServerAclService`);
  ACL keys are Google e-mails, so invite people with the address they sign in with.

## CRDT co-editing

- **Rich documents** — CRDT-native Tiptap (`Collaboration` + `CollaborationCursor`):
  simultaneous typing, remote carets/selections with names + colors, collaborative
  tables/lists, offline merge, undo via `Y.UndoManager`. Existing Tiptap bodies migrate
  **once** (marker-guarded, with a "Before CRDT migration" version created first and the
  original body preserved).
- **Code** — y-monaco with remote cursors/selections/labels and a per-project **Code
  editing policy**: *Collaborative* (CRDT multiplayer, default) or *Checkout required*
  (soft locks: request control, owner/admin force-unlock). GitHub commits stay explicit
  and ship the reconciled CRDT state; realtime edits never auto-commit.
- **Boards** — granular CRDT ops (node upserts/patches/data updates, edge ops, layer
  order). During drags, geometry travels as throttled transient presence (a dashed outline
  in the dragger's color); the committed op lands on drag end. A node a peer is dragging is
  locally non-draggable (one authoritative drag; takeover after release).

## Presence, comments, notifications

- **Presence** — active avatars in the top bar, per-user location ("viewing X", "editing
  Y"), last-active times. Real across tabs; cross-device needs the backend.
- **Comments** — pins on the canvas and threads on cards/sections/docs/code/sheets/
  assets/embeds; replies, resolve/reopen, @mentions, filters, badges. **Area comments**:
  click = pin, drag = translucent rectangle (C activates, Esc cancels, Enter submits);
  areas live in flow coordinates, can be moved/resized (with numeric X/Y/W/H fields for
  keyboard access), and the panel zooms the board to them. **Comments 2.0** adds
  reactions, assignment to a member, and due dates with overdue highlight.
- **Notification center** — the top-bar bell derives per-device notifications from synced
  state (mentions, replies, assignments, invites, resolved/reopened, Drive failures,
  realtime failures) with deep links that focus threads and zoom areas.

## Version history

Snapshots of boards/docs/code/project metadata; restore (with auto-backup), duplicate,
line diff. Bodies ≤200 KB sync through the collab CRDT doc; larger payloads stay
device-local (the index still syncs). See [limitations.md](limitations.md).

## Conflict merging

Merging is structure-aware (`ConflictResolverV2`): collab records union by id with
per-record newest-wins, comment replies always union, activity/version sets union, and
boards merge **node-by-node** so two people moving different cards both keep their change.
Same-node board conflicts resolve last-writer-wins per node.

## Honest limitations (collaboration)

- Cross-device realtime is **config-gated and experimental** (alpha). Without it, "live"
  is same-browser tabs + Drive polling — and the presence/Share UI does not yet downgrade
  to say so (tracked P1).
- Invites are **links, not e-mails** — Lattice has no mail server and says so in the
  dialog. With the realtime backend, the invitee's Google e-mail is recognized server-side
  on sign-in.
- Sheet editing is **body-level** (save-granular), not cell-level CRDT; sheet/deck
  *presence* is live.
- Rich-document comments are **not anchored to exact text ranges** yet.
- Version snapshot payloads over 200 KB stay device-local.
- **No anonymous / public no-login share links** yet — sharing is role-based and
  server-enforced. This is a tracked roadmap item.
