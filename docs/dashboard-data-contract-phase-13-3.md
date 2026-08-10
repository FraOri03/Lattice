# Dashboard data contract — Phase 13.3

Every section of the new dashboard, with where its data comes from today and
what it is allowed to say while that answer is "nowhere". Written so phase 15
cannot promise something the app cannot answer, and so #80 has something
concrete to be measured against.

Two corrections to the assumptions this phase started from. **More exists than
the brief assumed:** invitations, members, roles, an activity log and a
server-side ACL all ship today (`src/lib/collab/`), so invites are not simply
"phase 18". **Less exists than the prototype shows:** there is no invite inbox,
no shared-projects index and no trash of any kind — `deleteProject` is a hard
delete that also calls `storage.deleteDocument` on everything the project owns.

Companions: [dashboard-ia-phase-13-1.md](dashboard-ia-phase-13-1.md) (which
sections exist) and
[dashboard-visual-spec-phase-13-2.md](dashboard-visual-spec-phase-13-2.md)
(what each state looks like).

---

## The three sources, and what each one can answer

1. **The local store** — `useStore` and `useCollabStore`, persisted to
   localStorage in this browser profile. Projects, workspaces, entities,
   recents, members, invites, comments, activity, versions, notifications.
2. **The Google Drive app folder** — the same data mirrored when Drive is
   connected. `DrivePollingCollaborationProvider` declares its own honest
   capabilities: `scope: 'same Google Drive'`, `latency: 'seconds'`. Two people
   see each other's work if they share the folder, in seconds, not instantly.
3. **The realtime backend** — only when `VITE_REALTIME_BACKEND=liveblocks`.
   `ServerAclService` posts role changes to `api/realtime/rooms`, and the server
   re-checks the caller's role on every request.

The third one matters most for this document, because of what it is **not**:

> The realtime backend is an *authority*, not an *index*. It can answer "may
> this e-mail enter this room?". It cannot answer "which projects has anyone
> shared with me?" — nothing stores that question's answer, on any device.

That single gap is what makes Shared with me and the invite inbox impossible
today, and it is exactly what phase 18 exists to fix.

---

## The mapping

| Section | What it shows | Source today | Status | Until it is real |
|---|---|---|---|---|
| Greeting · workspace · sync line | active workspace, sync provider, `lastSyncAt` | local + `syncStore` | **Ships** | — |
| Stat tiles — projects · boards · files | counted per `projectId` over the workspace's entities | local | **Ships** | — |
| Stat tile — storage | sum of `asset.size` for the workspace | local | **Ships, with a caveat** | it is the assets' bytes, not the vault's; the Drive mirror's size needs a Drive call nobody makes yet |
| Resume rail | last opened entities | `recents` + `resolveRecents` | **Ships, capped** | `pushRecent` keeps **15** entries and `RecentEntry` is `{ kind, id, at }`; the rail and the Recents page draw from the same 15 |
| Workspaces row | the user's workspaces + project counts | local | **Ships** | — |
| Starred | `Project.starred` | local | **Ships for projects only** | no entity carries `starred`; a Starred page spanning kinds needs the model change named in 13.1 |
| Recent projects · Projects · Archived | `groupProjects()` over the workspace | local | **Ships** | — |
| Recents page | the same log, grouped by day | `recents` | **Partial** | 15 entries cannot fill a day-grouped page, and no entry records which device or project wrote it |
| Shared with me | projects other people gave you access to | **nothing** | **Needs a server** (#91) | a project only becomes visible if its data already reaches your browser — same profile, or the same Drive folder |
| Invites — received | invitations addressed to you | **nothing** | **Needs a server** (#88, #90) | `collabStore.invites` is keyed by project and lives on the **inviter's** device; you learn of an invite by opening its `#invite=` link, so an inbox has no source |
| Invites — sent | invitations you issued | `inviteService.invitesOf(projectId)` | **Ships as an aggregation** | real per project; a workspace-wide list is a UI fold over the projects you hold locally, not a server feature |
| Invite statuses | pending · accepted · revoked · expired | `InviteStatus` | **Partial** | there is no e-mail backend, so no *delivered* and no *failed*; no `expiresAt` field, so no countdown and nothing computes *expired*; no *declined* at all |
| Trash | deleted items, countdown, restore | **nothing** | **Needs a model and a server** | `deleteProject` deletes; there is no `deletedAt`, no purge date, no recovery path |
| Notifications | mentions, replies, invites, sync failures | `AppNotification`, derived locally | **Ships** | read state is per device by design and never leaves it |
| Collaborator avatars on a card | who else is in this project | `ProjectMember` | **Ships — as members** | presence (`PresencePeer`) exists only inside an attached project room; on the dashboard no room is attached, so these are members, not live presence |
| Sync chip | local · syncing · synced · failed · offline | `syncStore` | **Ships** | realtime states only when the backend is configured |
| Sidebar — RunPod credit | balance, spend, runway | **nothing** | **Phase 21** | already honest in the prototype: reserved, named, nothing estimated |
| Sidebar — System | CPU, memory, GPU, disk | **nothing** | **Not planned** | the browser cannot read these without a native host |
| Sidebar — Storage | vault size, Drive mirror, free space | local (partly) | **Partial** | vault size ships; "free space" and the Drive mirror figure have no source |

---

## The sixth state: unavailable

13.2 settles five states — loading, empty, no-results, offline, error. This
document adds the one they cannot express:

> **An empty state may only be shown when the section could have had content.**

"No shared projects yet" on a surface with no index anywhere is not an empty
state; it is a false negative. The user reads it as *nobody has shared anything
with me*, when the truth is *Lattice cannot know*. The distinction is the whole
point of this phase, and it needs its own presentation:

| | Empty | Unavailable |
|---|---|---|
| Means | there is nothing, and we looked | we cannot look |
| Tone | invitational | explanatory |
| Action | the thing that creates content | what unlocks the answer, or nothing |
| Example | "Nothing starred yet — the star on any card pins it here." | "Lattice cannot list projects shared with you yet. Invitations arrive as links today; a shared-projects index needs the server planned for phase 18." |

Three shapes to choose between, in order of how much they promise:

1. **Reserved and named** — the row or section exists, states that the
   integration does not, and explains why nothing is estimated. This is the
   pattern the prototype's RunPod and System bars already use, and it is the
   right default for anything structural: *"Reserved space, deliberately empty."*
2. **Present and explained** — the destination exists in the nav and opens to an
   unavailable state with the reason. For Shared with me and received Invites,
   because 13.1 settled the destination set and a nav that changes shape with
   configuration is a worse answer than one that explains itself.
3. **Absent** — nothing is drawn. Only for sections whose absence is invisible:
   an empty invite strip on Home, a resume rail with one entry.

Two rules that follow:

- **A badge may never show a number the app cannot compute.** The prototype's
  Invites badge reads `2` against a source that holds none for the recipient.
  A destination in state (2) shows no count at all.
- **The reason names the constraint, not the schedule.** "needs the server
  planned for phase 18" is a fact about the product; "coming soon" is a promise
  nobody is holding.

---

## What the prototype must change

1. **Invites — received.** The tab cannot be populated. Either it shows the
   unavailable state, or the page ships as *Sent* only until #88 lands. The
   delivery lifecycle (delivered · failed · queued) and the expiry countdown
   come out entirely: no e-mail backend, no `expiresAt`.
2. **Invites — sent.** Keeps pending · accepted · revoked, drops declined.
   Delivery is *"copy the link and send it yourself"*, which is what
   `inviteService.linkFor()` actually does, and the page should say so.
3. **Shared with me.** The two-scope split (same browser / same Drive) is the
   right model and the honest one — but each group must say which of the two it
   is *reading*, and the page needs the unavailable state for everything
   outside those two paths.
4. **Trash.** Nothing behind it. The whole surface is state (2) until a
   soft-delete model exists; the 30-day countdown, byte accounting, restore
   semantics and the Drive-trash distinction are the design for after that.
5. **Card avatars.** Label them members. A presence-scope tooltip on a Home card
   claims a room that is not attached.
6. **Storage bar.** "Free space" and the Drive mirror figure have no source —
   reserve them or drop them.
7. **Recents.** Day grouping needs more than 15 entries; either the cap rises
   (a store change, cheap) or the page presents itself as a short list, which is
   what it is.

## Where each gap is delivered

| Gap | Issue |
|---|---|
| Server invitation model | #88 (18.1) |
| E-mail delivery, localised templates | #89 (18.2) |
| Acceptance with verified e-mail | #90 (18.3) |
| Shared-projects index | #91 (18.4) |
| Identity with a stable `userId` | #81 (16.1) |
| ACL migration `projectRole[email]` → `projectRole[userId]` | #82 (16.2) |
| Server-backed sections stay honest until then | #80 (15.5) |
| Entity-level starring, longer recents log | #77 (15.2) |

Trash has no issue yet: it needs a soft-delete model before it needs a server,
and neither is scheduled.
