# Lattice — mappa dei sottosistemi

Sintesi derivata dal knowledge graph Graphify (`graphify-out/`, ~1735 nodi ·
~4876 archi · 99% `EXTRACTED`) e **verificata sui sorgenti**. Non sostituisce
il codice: è una guida per orientarsi prima di leggere.

Rigenerare con `npm run graph:build`. Interrogare con
`python -m graphify explain "<file>"` / `affected "<file>"` / `path "<A>" "<B>"`.

> Stack: Vite + React 19 + TypeScript + Zustand + Yjs. Deploy Vercel (SPA + 4
> serverless function). **Non è Next.js e non ha un router.**

---

## Entry point, routing e layout

| | |
|---|---|
| **File** | `src/main.tsx` → `src/App.tsx` |
| **Responsabilità** | `main.tsx` monta `<App/>` in StrictMode, importa gli stili e (solo in DEV) espone `window.__lattice` / `__latticeDebug`. `App.tsx` compone provider, gate di login e workspace. |
| **Routing** | **Nessun router.** La navigazione è lo stato `viewMode` in `useStore` (`doc` \| `split` \| `board` \| `sheet` \| `presentation` \| `code`), reso da switch condizionali in `Workspace()`. Unico ingresso URL: invite link via hash `…/#invite=<token>` (`App.tsx:93`). |
| **Layout** | `Workspace()`: `Sidebar` · (`TopBar` + `ReadOnlyBanner` + pane attivo) · `Inspector`/`CollabPanel`. Pane per modo in `components/workspaces/ModeWorkspaces.tsx`. |
| **Provider globali** | `AccountProvider` (auth), `DialogHost` (`ui/ConfirmDialog`), `Toaster` (`ui/Toaster`) — montati in `App()`. |
| **Estensione** | Nuovo modo = nuovo valore `viewMode` + ramo in `Workspace()` + voce in `ModeWorkspaces`. |

## Boot della collaborazione

`App.tsx` → `useCollaboration()` avvia/ferma in un solo `useEffect` (ordine significativo):

`yjsManager.start()` → `collabHub.start()` → `presenceService` → `realtimeBoardSync` → `realtimeDocumentSync` → `notificationService` → `autoSnapshot` (stop in ordine inverso).

**Punto di estensione centrale**: ogni servizio realtime nuovo va agganciato qui.

## Stato e modello

- `src/store/useStore.ts` — store Zustand principale. **God node: 111 archi**, di gran lunga il più connesso del grafo.
- `src/store/useUiStore.ts` — stato UI effimero (progress import, dialog).
- `src/store/seed.ts` — dati iniziali.
- `src/types/model.ts`, `src/types/collab.ts` — modello dominio e tipi collaborazione.

## Autenticazione e identità

| | |
|---|---|
| **File** | `lib/auth/AccountProvider.tsx`, `lib/auth/AuthService.ts`, `components/account/{LoginScreen,ProfileMenu,DriveDialog}.tsx` |
| **Responsabilità** | Google OAuth; `AuthService.getAccessToken()` è la fonte del token usato sia da Drive sia dall'auth realtime. `Gate()` in `App.tsx` mostra `LoginScreen` finché non c'è account (`loginSkipped` consente l'uso locale). |
| **Config** | `VITE_GOOGLE_CLIENT_ID`; senza, `hasGoogleAuth === false` → provider mock. |

## Autorizzazioni

| | |
|---|---|
| **File** | `lib/collab/permissions.ts`, `lib/collab/roleAccess.ts`, `lib/collab/ServerAclService.ts`, `components/collab/ReadOnlyBanner.tsx` |
| **Responsabilità** | Ruoli e capacità; `roleAccess.ts` deriva gli id di room (`contentRoomId`/`collabRoomId`) e le permission per ruolo. |
| **Nota chiave** | `roleAccess.ts` e `permissions.ts` sono **condivisi tra client e serverless**: `api/realtime/auth.ts` e `api/realtime/rooms.ts` importano da `../../src/lib/collab/…`. Il grafo lo segnala tra le "surprising connections". Modificarli tocca client **e** server insieme. |
| **Modello di fiducia** | Il ruolo dichiarato dal browser non è mai letto: lo scope del token Liveblocks deriva solo dall'ACL server-side. |

## Realtime — Liveblocks

| | |
|---|---|
| **File** | `lib/crdt/liveblocks.ts` (transport, **lazy-loaded**), `api/realtime/auth.ts`, `api/realtime/rooms.ts`, `api/_lib/realtime.ts` |
| **Responsabilità** | Due room Liveblocks per progetto: **content** (Yjs + presence) e **collab** (Yjs + broadcast `CollabMessage`: lock, fan-out). `attachLiveblocks()` fa bootstrap ACL server-side, entra nelle room, mappa lo stato connessione su UI onesta e traduce presence/eventi in `CollabMessage`. |
| **Auth** | `authEndpoint` → POST `/api/realtime/auth` con il token Google; il server lo verifica e conia un token Liveblocks con scope da ACL. |
| **Secret** | `LIVEBLOCKS_SECRET_KEY` — **solo server** (Vercel). Se manca, l'endpoint risponde 501 in modo esplicito. |
| **Attivazione** | `VITE_REALTIME_BACKEND=liveblocks` (`hasRealtimeBackend`); altrimenti restano i provider locale e Drive-polling. |

## Realtime — CRDT / Yjs

| | |
|---|---|
| **File** | `lib/crdt/YjsManager.ts` (orchestratore), `ProjectRoom.ts`, `{Document,Board,Code}CRDT.ts`, `AwarenessService.ts`, `CRDTPersistenceAdapter.ts`, `OfflineUpdateQueue.ts`, `crdtStore.ts` |
| **Responsabilità** | `YjsManager` gestisce le room CRDT e l'attach opzionale al transport realtime; `ProjectRoom` (god node, 27 archi) tiene i due doc Yjs (`content`, `collab`). Persistenza offline via `y-indexeddb`; binding editor via `y-prosemirror` / `y-monaco`. |
| **Estensione** | Nuovo tipo di contenuto collaborativo = nuovo `*CRDT.ts` + registrazione in `ProjectRoom`/`YjsManager`. |

## Collaborazione — servizi

`lib/collab/`: `CollaborationProvider.ts` (astrazione + `SESSION_ID`, `currentIdentity()` — god node 41 archi), `hub.ts` (fan-out), `DrivePollingCollaborationProvider.ts` (fallback senza Liveblocks), `RealtimeBoardSync.ts`, `RealtimeDocumentSync.ts`, `PresenceService.ts`, `CommentService.ts`, `NotificationService.ts`, `ActivityLogService.ts`, `VersionHistoryService.ts`, `AutoSnapshot.ts`, `MembersService.ts`, `InviteService.ts`, `collabStore.ts` (`useCollabStore`, god node 51 archi), `useCollab.ts`, `roleAccess.ts`, `permissions.ts`, `ConflictResolverV2.ts`.

**Commenti**: `CommentService` + `components/collab/{CommentPins,CommentAreas,CommentsPanel}.tsx`.
**Presence/cursori**: `PresenceService` + `AwarenessService` + `components/collab/{BoardPresenceLayer,PresenceAvatars,EntityPresence}.tsx`.

## Persistence e storage

| | |
|---|---|
| **File** | `lib/storage/StorageProvider.ts` (interfaccia + istanza `storage`), `lib/storage/GoogleDriveStorageProvider.ts` (god node, 29 archi), `lib/sync/SyncEngine.ts`, `lib/sync/ConflictResolver.ts`, `lib/sync/driveDiagnostics.ts`, `lib/sync/syncStore.ts` |
| **Responsabilità** | Astrazione storage locale-first; Drive come backend opzionale (scope `drive.file`, cartella visibile configurabile via `VITE_GOOGLE_DRIVE_APP_FOLDER`, default `Lattice`). `SyncEngine` orchestra push/pull e merge. |
| **Estensione** | Nuovo backend = implementare `StorageProvider`. |

## Editor

- **Documentale**: `components/richdoc/RichTextEditor.tsx` (TipTap + `extensions.ts`, `SlashCommandMenu`, `DocumentOutline`, `DocumentToolbar`, `AssetEmbedBlock`, `AssetPickerDialog`), modello `lib/richdoc/docjson.ts`.
- **Codice**: `components/code/CodeEditor.tsx` (Monaco + `monacoSetup.ts`, `y-monaco`), `lib/code/{languages,digest}.ts`.
- **Board / whiteboard**: `components/board/BoardCanvas.tsx` (`@xyflow/react`) + node types (`AssetCardNode`, `CodeCardNode`, `RichDocCardNode`, `SheetCardNode`, `WebEmbedCardNode`, `PresentationCardNode`, `SectionNode`), logica in `lib/board/sections.ts`.
- **Fogli**: `components/sheet/SpreadsheetEditor.tsx` + `lib/sheet/{FormulaEngine,sheetModel}.ts` (`cellKey()` god node, 26 archi).
- **Presentazioni**: `components/present/PresentationWorkspace.tsx` + `lib/present/{presentModel,presentPdf,presentPptx,presentImport}.ts`.

## Import / export / conversione

`lib/import/ImportService.ts`, `lib/export/ExportService.ts`, `lib/convert/{ConversionService,docx,odt,rtf}.ts`, `lib/convert/ConversionBackendProvider.ts`, `lib/registry/{documents,fileKinds,formatMatrix}.ts`, `lib/assets/{AssetRegistry,AssetBundle,detect}.ts`.
Worker di conversione remoto opzionale: `VITE_CONVERSION_API_URL` (`hasConversionBackend`); vuoto = disabilitato, e la UI lo dichiara.

## API route e Vercel

| | |
|---|---|
| **File** | `api/realtime/auth.ts`, `api/realtime/rooms.ts`, `api/_lib/realtime.ts`, `api/github/oauth.ts`, `vercel.json` |
| **Config** | `framework: vite`, `buildCommand: npm run build`, `outputDirectory: dist`, rewrite SPA `/((?!api/).*) → /index.html`, cache immutable su `/assets/*`. |
| **Secret server** | `LIVEBLOCKS_SECRET_KEY`, `GITHUB_CLIENT_SECRET` — letti **solo** in `/api`, mai nel bundle (`lib/env.ts` espone solo `VITE_*`). |

## Gestione errori

Nessun `ErrorBoundary` React nel repo (verificato). La strategia è locale:
`ui/Toaster.tsx` per messaggi utente, `try/catch` difensivi nei path realtime
(es. `liveblocks.ts` non fa mai crashare il chiamante su presence/broadcast
rifiutati), `ConfirmDialog` per conferme. `lib/security/secrets.ts` presidia i
segreti lato client.

## Test

`vitest` (nessun `vitest.config`: usa `vite.config.ts`). Solo **2 file**:
`lib/board/sections.test.ts`, `lib/present/presentBoardCard.test.ts`.
Nessun ESLint nel progetto: il gate statico è `npm run typecheck`.

---

## Rischi e osservazioni

1. **`useStore` è un god object** (111 archi, quasi 3× il successivo tra i moduli). Ogni sottosistema vi dipende: è il principale punto di attrito per refactoring e test.
2. **Ciclo di import a 5 file** rilevato dal grafo:
   `preview/ThreeDViewer.tsx → lib/import/ImportService.ts → lib/convert/ConversionService.ts → richdoc/extensions.ts → richdoc/AssetEmbedBlock.tsx → preview/ThreeDViewer.tsx`.
3. **Due conflict resolver coesistenti, non uno che sostituisce l'altro**: `sync/ConflictResolver.ts` serve `SyncEngine` (sync Drive), `collab/ConflictResolverV2.ts` serve `hub.ts` e `DrivePollingCollaborationProvider`. Il suffisso "V2" suggerisce una migrazione che non c'è: nomi fuorvianti, non codice morto.
4. **Accoppiamento `/api` → `/src`**: le serverless importano `src/lib/collab/{roleAccess,permissions}.ts`. Corretto per evitare drift delle regole, ma lega il deploy serverless al codice client: una modifica lì ha raggio d'azione doppio.
5. **Copertura test minima** (2 file) su un'app con CRDT, merge e permessi — le aree a maggior rischio sono quelle non coperte.
6. **Nessun ErrorBoundary**: un throw in render di un pane porta giù il workspace.

## Elementi non ancora configurati / in corso

- **i18n — lavoro in corso non committato** (al momento della stesura): `src/lib/i18n/{index,en,it,store,types}.ts` + `components/ui/LanguageSelector.tsx`, con modifiche a `App.tsx`, `Sidebar`, `TopBar`, `LoginScreen`, `ProfileMenu`, `assetKinds`, `types/collab.ts`. Non ancora riflesso stabilmente in questa mappa.
- **Photo mode — non committato**: `src/components/photo/{PhotoCanvas,PhotoLibrary,PhotoSceneRender}.tsx`, non ancora agganciato a un `viewMode`.
- **Realtime disattivato di default**: senza `VITE_REALTIME_BACKEND=liveblocks` restano provider locale/Drive-polling.
- **Conversione remota disattivata** senza `VITE_CONVERSION_API_URL`.
- **Grafo senza semantica LLM**: i markdown sono indicizzati solo per heading; l'estrazione semantica della prosa richiederebbe una API key e l'invio dei contenuti a un servizio esterno (non abilitata).
