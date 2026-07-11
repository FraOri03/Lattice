# Architecture

How Lattice is put together: the data model, stores, services, storage layer, the
collaboration/CRDT layer, and the main application flows. Everything here is verified
against the source in `src/`. For *what* the features do see
[features.md](features.md); for *how to configure* the external services see
[integrations.md](integrations.md); for realtime specifics see
[collaboration.md](collaboration.md).

## Mental model

> **Documents and assets are entities. Cards are views of them. Projects own them. The cloud mirrors them.**

- A **note** is a markdown document with `[[wikilinks]]`, backlinks and tags.
- An **asset** is any imported file (PDF, Office, media, 3D). Its metadata lives in the
  vault; its binary lives behind a storage interface.
- A **board** is an infinite canvas of **cards**; a card *references* a note, asset,
  document, sheet, code file or deck, so the same entity can appear on many boards.
  **Sections** group cards Figma-style; **web embeds** put live websites on the canvas.
- A **project** is an organizational space (like ChatGPT/Claude projects); it owns
  boards, notes, documents, code, sheets, decks and assets.
- A **workspace** wraps projects (`Workspace → Project → Mode → Entity → Card`).
- The app is **offline-first**: IndexedDB + localStorage are the working copy; Google
  Drive is a synced backup, never a requirement.

## Layered overview

```
            ┌───────────────────────────────────────────────────────┐
            │                        UI layer                        │
            │ Sidebar (ProjectSwitcher) · TopBar (6 modes, sync dot) │
            │ Board · Editors · Inspectors · CommandPalette · Login  │
            └──────┬──────────────────┬──────────────────┬──────────┘
                   │                  │                   │
            ┌──────┴──────────────────┴───────────────────┴─────────┐
            │              Vault store (Zustand, persisted)          │
            │  projects · boards · notes · asset/doc/code/sheet META │
            └──┬───────────┬───────────┬──────────────┬─────────────┘
               │           │           │              │
        ImportService  AssetRegistry  SyncEngine   AccountProvider
               │           │           │  ConflictResolver   │
        ┌──────┴───────────┴──────┐    │              AuthService
        │ StorageProvider (iface) │    │             (Google GIS / mock)
        │  IndexedDB (local)      │◄───┤
        │  GoogleDriveStorage-    │    └── GithubCodeProvider
        │  Provider (remote)      │        (code documents only)
        └─────────────────────────┘
```

## Data model

The entity model lives in `src/types/model.ts` (vault) and `src/types/collab.ts`
(collaboration). Core entities:

| Entity | Purpose |
|---|---|
| `Project` | Organizational space that owns all other entities; every entity carries a `projectId`. |
| `Account` / `SyncState` | Signed-in identity + per-entity sync bookkeeping. |
| `Board`, `BoardSection`, `WebEmbed` | Infinite canvas, Figma-like frames, sandboxed website cards. |
| `NoteDoc` | Markdown note with wikilinks/backlinks/tags. |
| `AssetDoc` | Imported binary's metadata (body behind `StorageProvider`). |
| `RichDocMeta` | Tiptap rich document (body lazy-loaded). |
| `CodeDocMeta` | Monaco code file (+ optional GitHub link metadata). |
| `SpreadsheetDocMeta` | Grid + formula document. |
| `PresentationDocMeta` | Slide deck (internal `presentModel.ts` format). |

A persisted-store migration stamps pre-Phase-6 vaults with a default project
automatically; a later migration wraps existing projects in a personal workspace.

## Stores

- **Vault store** — `src/store/useStore.ts` (+ `seed.ts`): Zustand, persisted and
  versioned with migrations. Holds projects, boards, notes and the metadata for
  assets/docs/code/sheets/decks. This is always the working copy.
- **UI store** — `src/store/useUiStore.ts`: transient UI state (active mode, selection…).
- **Collab store** — `src/lib/collab` (`collabStore`): members, invites, comments,
  activity, versions, presence.
- **Sync store** — `src/lib/sync` (`syncStore`): sync status surfaced by the top-bar chip.

## Named abstractions (and where they live)

| Abstraction | File | Role |
|---|---|---|
| `StorageProvider` | `src/lib/storage/StorageProvider.ts` | Binary + document-body storage interface (IndexedDB impl). |
| `GoogleDriveStorageProvider` | `src/lib/storage/GoogleDriveStorageProvider.ts` | Real Drive REST v3 client implementing the same interface + path-aware ops. |
| `SyncEngine` | `src/lib/sync/SyncEngine.ts` | Offline-first push/pull between vault and Drive. |
| `ConflictResolver` | `src/lib/sync/ConflictResolver.ts` | Newest-wins policy + conflict records. |
| `AuthService` | `src/lib/auth/AuthService.ts` | Google OAuth (GIS token flow) or honest mock. |
| `AccountProvider` | `src/lib/auth/AccountProvider.tsx` | React session context. |
| `GithubCodeProvider` | `src/lib/github/GithubCodeProvider.ts` | GitHub REST client — code documents only. |
| `ProjectRegistry` / `ProjectStore` | `src/lib/projects/` | Project helpers + hook-level API. |
| `FileKindRegistry` / `FileKindIcon` | `src/lib/registry/fileKinds.tsx` | Unified kind → icon/label/color. |
| `DocumentRegistry` / `EditorRegistry` | `src/lib/registry/documents.ts` | Document kinds → editors (plugin seam). |
| `WebEmbedService` | `src/lib/web/WebEmbedService.ts` | URL sanitization + embed payloads. |
| `ImportService` | `src/lib/import/ImportService.ts` | Universal import pipeline (+ progress). |
| `AssetRegistry` | `src/lib/assets/AssetRegistry.ts` | Asset id → object URL cache. |
| `formatMatrix` | `src/lib/registry/formatMatrix.ts` | Single source of truth for format support ([file-formats.md](file-formats.md)). |

## Collaboration & CRDT layer

The Phase 7 provider architecture and the Phase 8 CRDT engine sit behind one router.

```
                 UI: ShareDialog · PresenceAvatars · BoardPresenceLayer ·
                     CommentPins · CollabPanel (Comments/Activity/Versions) ·
                     ReadOnlyBanner · lock banners
                                   │  (hooks: useMyRole/useCan/usePeers…)
      ┌────────────────────────────┴─────────────────────────────┐
      │                collab services (src/lib/collab)           │
      │  PermissionsService · MembersService · InviteService      │
      │  PresenceService · CommentService · ActivityLogService    │
      │  VersionHistoryService · RealtimeBoardSync                │
      │  RealtimeDocumentSync (incl. code locks)                  │
      └──────────────┬──────────────────────────┬────────────────┘
                     │ collabStore (Zustand)     │ ConflictResolverV2
      ┌──────────────┴──────────────────────────┴────────────────┐
      │                     CollabHub (router)                    │
      │   send() ─▶ every active provider · recv ─▶ handlers      │
      └──────┬─────────────────────┬──────────────────┬──────────┘
             │                     │                  │
   LocalCollaborationProvider   DrivePolling-       Realtime-
   (BroadcastChannel: REAL      Collaboration-      CollaborationProvider
    live sync between tabs)     Provider (~20s)     (Liveblocks + Yjs)
```

`CollaborationProvider` is a transport interface with self-reported capabilities
(`presence`, `liveCursors`, `latency`, `scope`). The hub runs every available provider
simultaneously; merging is structure-aware (`ConflictResolverV2`). See
[collaboration.md](collaboration.md) for the provider matrix, the permission model and
the honest limitations.

### CRDT engine (`src/lib/crdt/`)

```
YjsManager ── one ProjectRoom per project ──┬─ content Y.Doc: documents (Y.XmlFragment),
  │ owns rooms + optional realtime attach   │  code (Y.Text), boards (Y.Map per board),
  │                                         │  projectMetadata
  ├─ OfflineUpdateQueue (y-indexeddb holds  └─ collab Y.Doc: comments/areas, durable
  │  the data; honest pending counter)         collab-state mirror, version bodies ≤200 KB
  ├─ AwarenessService (drag ghosts, sheet cells, code lines → presence)
  └─ CRDTPersistenceAdapter (labelled binary snapshots for migrations/versions)
```

Persistence roles: **Liveblocks** = active shared state · **y-indexeddb** = local CRDT
cache (offline editing, instant loads, deterministic replay) · **Google Drive** = durable
JSON bodies + assets · **version history** = explicit restorable states. With no backend
configured, tabs of one browser still co-edit through a BroadcastChannel Yjs relay.

## Cloud storage layout (Google Drive)

```
/Lattice
  /projects/<project-id>
    project.json          # project + all entity metadata (incl. boards & notes)
    /documents/<id>.json  # rich document bodies (Tiptap JSON)
    /spreadsheets/<id>.json
    /code/<id>.<ext>      # code sources as real text files
    /assets/<id>.<ext>    # imported binaries
    collab.json           # durable collaboration state (DrivePolling provider)
  /data                   # flat area used by the raw StorageProvider interface
```

## Serverless functions (`api/`)

| Function | Role |
|---|---|
| `api/github/oauth.ts` | GitHub OAuth token exchange (server-side; keeps the client secret off the client). |
| `api/realtime/auth.ts` | Verifies the Google identity and mints scoped Liveblocks room tokens. |
| `api/realtime/rooms.ts` | Server-side membership ACL; evaluates the shared `permissions.ts` matrix. |
| `api/_lib/realtime.ts` | Shared helpers for the realtime functions. |

## Source layout

```
api/
  github/oauth.ts                # Vercel function: GitHub OAuth token exchange
  realtime/{auth,rooms}.ts       # realtime identity + room ACLs
  _lib/realtime.ts
src/
  App.tsx                        # providers + login gate + mode router
  types/model.ts                 # vault entities
  types/collab.ts                # roles, members, invites, presence, comments, activity, versions
  store/                         # useStore.ts (persisted, versioned), seed.ts, useUiStore.ts
  lib/
    env.ts                       # VITE_* configuration
    auth/                        # AuthService (Google GIS / mock) + AccountProvider
    collab/                      # hub + providers (local/drive-polling/realtime),
                                 #   permissions, members, invites, presence, comments,
                                 #   activity, versions, board/document sync, ConflictResolverV2
    crdt/                        # Yjs manager, Liveblocks attach, awareness, persistence
    sync/                        # SyncEngine + ConflictResolver + syncStore
    storage/                     # StorageProvider (IndexedDB) + GoogleDriveStorageProvider
    github/GithubCodeProvider.ts
    projects/                    # ProjectRegistry + ProjectStore
    registry/                    # fileKinds, documents, formatMatrix
    web/WebEmbedService.ts       # URL sanitization + embeds
    board/                       # section geometry/ordering helpers
    security/                    # secret detection, sanitization helpers
    import/ export/ convert/ assets/ code/ present/ richdoc/ sheet/   # engines
  components/
    Sidebar.tsx TopBar.tsx CommandPalette.tsx Inspector.tsx DocumentView.tsx
    ui/                          # Toaster, ConfirmDialog (confirm/prompt), ShortcutsDialog
    collab/                      # ShareDialog, PresenceAvatars, BoardPresenceLayer,
                                 #   CommentPins, CollabPanel, ReadOnlyBanner
    account/                     # LoginScreen + ProfileMenu
    projects/ProjectSwitcher.tsx
    github/GithubDialog.tsx
    workspaces/ModeWorkspaces.tsx
    board/                       # canvas, cards, SectionNode, WebEmbedCardNode, PresentationCardNode
    present/ richdoc/ code/ sheet/ preview/   # editors & previews
```

## Virtual vault layout

Mirrors the cloud layout and a future on-disk layout:

```
/projects/<id>    project spaces (config in project.json when synced)
  /notes /documents /spreadsheets /presentations /code /boards /assets /imports /config
```

## Architectural decisions worth knowing

- **Provider seams everywhere** — `StorageProvider`, `CollaborationProvider`,
  `ConversionBackendProvider` and the registries all have interface boundaries with
  honest, self-reported capabilities. No vendor lock-in: Liveblocks can be swapped for
  PartyKit behind `RealtimeAttachment` in `src/lib/crdt/liveblocks.ts`.
- **Single source of truth modules** — the permission matrix (`permissions.ts`) is
  imported by both UI and server ACL so rules cannot drift; the format matrix
  (`formatMatrix.ts`) backs both code and docs.
- **Offline-first, not offline-optional** — the vault is authoritative; every cloud/realtime
  layer is additive and degrades honestly when unconfigured.
