# Lattice

A **local-first unified creative workspace** — Obsidian-style linked notes, a Figma-style
infinite board with sections, a Word/Notion-style rich document editor, a VS Code-style
code workspace with GitHub sync, an Excel-style spreadsheet engine, a slide editor and a
photographic set planner, all organized into **projects** inside **workspaces**, with
optional Google Drive cloud sync and CRDT realtime collaboration.

One vault holds every kind of thing you work with — notes, documents, spreadsheets, decks,
boards, code and imported files — and every one of them can be a **card** on an infinite
canvas, linked visually and semantically.

> **Documents and assets are entities. Cards are views of them. Projects own them. The cloud mirrors them.**

## Project status

**Alpha / experimental.** No public release has been cut — no Git tags, no CI. Single-user
local work is the most mature part; team and realtime features work but are **config-gated
and alpha**. Cloud and realtime degrade honestly when unconfigured: nothing is faked. See
[docs/limitations.md](docs/limitations.md).

Development runs in numbered **phases**, tracked as
[GitHub milestones](https://github.com/FraOri03/Lattice/milestones). The current one is
**phase 12.2 — the adaptive shell**: 12.0 measured the shell against every viewport, 12.1
shipped the viewport tier model, and 12.2 turns the sidebar and inspector into drawers. The
phase number is not the version the app displays — that is a pinned release string
(`Alpha v0.11.3.5`), explained in [docs/limitations.md](docs/limitations.md#project-maturity).

## Features

- **Home dashboard** — sign-in lands on Home, not inside a project: recents, favourites and
  projects, with a deep link still opening its entity directly.
- **One tab strip per project** — the open entities of every section, restored per project;
  the URL serialises from the tab session, and Back/Forward work.
- **Six sections** — board, rich documents (with markdown notes for capture), spreadsheets,
  slide decks, a Monaco code workspace and Photo mode. The **Graph** view and the **Split**
  layout compose on top of them rather than replacing one.
- **Infinite board** — Figma-like sections, web-embed cards, and a card view for every
  entity kind, including decks and photo shots.
- **Project graph** — an automatically generated relationship browser over wikilinks, board
  membership, source assets, tags and GitHub links; read-only, and it explains every edge.
- **Photo mode** — a top-down set and lighting planner with a 2D light simulation.
  See [docs/photo-mode.md](docs/photo-mode.md).
- **Universal import/export** — PDF, Office (DOCX/XLSX/PPTX/ODF), media, 3D, code;
  DOCX/PPTX/PDF export. See [docs/file-formats.md](docs/file-formats.md).
- **Cloud sync** — offline-first Google Drive backup (`drive.file` scope; single-user,
  multi-device).
- **GitHub code sync** — connect a repo, import/commit code documents to a feature branch.
- **Collaboration** — roles and server-enforced permissions, presence, comments, version
  history, CRDT co-editing (Liveblocks + Yjs) and project calls over LiveKit (audio, camera,
  screen share). See [docs/collaboration.md](docs/collaboration.md).

A status-tagged inventory is in [docs/features.md](docs/features.md); what is missing or
degraded is in [docs/limitations.md](docs/limitations.md).

## Tech stack

React 19 · TypeScript · Vite 6 · Zustand · Tiptap (ProseMirror) · Monaco · React Flow ·
Yjs + Liveblocks (CRDT realtime) · LiveKit (calls) · SheetJS · jsPDF · three.js ·
Tailwind CSS. Deployed on Vercel with serverless functions for GitHub OAuth, realtime auth
and media tokens.

## Quick start

```bash
npm install
npm run dev        # → http://localhost:5173
```

With no configuration the app runs fully local (mock account, sync disabled, GitHub via
personal access token, realtime limited to tabs of one browser).

| Command | What it does |
|---|---|
| `npm run dev` | Dev server (HMR) at http://localhost:5173 |
| `npm run build` | Typecheck + production build → `dist/` |
| `npm run typecheck` | TypeScript typecheck only — there is no ESLint; this is the static gate |
| `npm test` | Unit tests (Vitest) |
| `npm run preview` | Serve the production build locally |
| `npm run graph:build` | Rebuild the local Graphify code graph (dev-only, git-ignored output) |

### Configuration

Everything is optional. Copy the template and fill in only what you need:

```bash
cp .env.example .env.local
```

| Variable | Unlocks |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Google sign-in + Drive sync |
| `VITE_GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` | One-click GitHub OAuth (a PAT works without it) |
| `VITE_REALTIME_BACKEND=liveblocks` + `LIVEBLOCKS_SECRET_KEY` | Cross-device realtime |
| `VITE_LIVEKIT_URL` + `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` | Project calls (audio, camera, screen share) |

Full setup, provider configuration and deployment are in [docs/setup.md](docs/setup.md) and
[docs/integrations.md](docs/integrations.md).

> **Deployment:** the repo is Vercel-ready (`vercel.json` + `api/`), but no public demo URL
> is published here. Deploy your own following
> [docs/setup.md](docs/setup.md#deployment-vercel).

## Roadmap

Planning lives in GitHub: **milestones are the phases, issues are the work.** Conventions
and the label taxonomy are in [ROADMAP.md](ROADMAP.md); what already shipped is in
[CHANGELOG.md](CHANGELOG.md).

| Phase | | |
|---|---|---|
| [11](https://github.com/FraOri03/Lattice/milestone/4) | Application shell & navigation — dashboard root, toolbar normalisation, Home, tab sessions | shipped |
| [12](https://github.com/FraOri03/Lattice/milestone/5) | Adaptive shell — responsive tiers, drawers, folding top bar and toolbars | **current** |
| [13](https://github.com/FraOri03/Lattice/milestone/6) | New dashboard — design & prototype | |
| [14](https://github.com/FraOri03/Lattice/milestone/7) | Profile & settings | |
| [15](https://github.com/FraOri03/Lattice/milestone/8) | New dashboard — implementation | |
| [16](https://github.com/FraOri03/Lattice/milestone/9) | Identity model — a stable `userId` independent of the provider | |
| [17](https://github.com/FraOri03/Lattice/milestone/10) | Supabase backend — schema, server sessions, e-mail OTP | |
| [18](https://github.com/FraOri03/Lattice/milestone/11) | Email invitations | |
| [19](https://github.com/FraOri03/Lattice/milestone/12) | Surface upgrades — dashboard, graph, documents, sheets, presentations | |
| [20](https://github.com/FraOri03/Lattice/milestone/13) | Suite toolbars — documents · creative · AI | |
| [21](https://github.com/FraOri03/Lattice/milestone/14) | AI — RunPod serverless + in-house ComfyUI | |
| [22](https://github.com/FraOri03/Lattice/milestone/15) | Entitlements & billing | |

Ordering reflects current intent, not a schedule: nothing here is a delivery date.

## Documentation

| Doc | Contents |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Data model, stores, services, CRDT layer, source layout |
| [docs/architecture/app-shell.md](docs/architecture/app-shell.md) | Who owns navigation, tabs, the active project; what the URL defines |
| [docs/features.md](docs/features.md) | Status-tagged feature inventory |
| [docs/setup.md](docs/setup.md) | Install, commands, build, test, deploy, troubleshooting |
| [docs/integrations.md](docs/integrations.md) | Google, Drive, GitHub, Liveblocks, LiveKit, conversion backend |
| [docs/collaboration.md](docs/collaboration.md) | Realtime model, permission matrix, calls, honest limits |
| [docs/navigation.md](docs/navigation.md) | URL contract, history, deep links, split as a layout |
| [docs/accessibility.md](docs/accessibility.md) · [docs/performance.md](docs/performance.md) | Keyboard model and announcements · bundle budget and off-screen work |
| [docs/file-formats.md](docs/file-formats.md) | Import/export support matrix and fidelity |
| [docs/photo-mode.md](docs/photo-mode.md) | Set & lighting planner, board cards, local-only scenes |
| [docs/responsive-audit-phase-12.md](docs/responsive-audit-phase-12.md) | Measured viewport baseline and the tier model |
| [docs/dashboard-ia-phase-13-1.md](docs/dashboard-ia-phase-13-1.md) | Dashboard destinations, scoping, URL token and entry rules |
| [docs/dashboard-visual-spec-phase-13-2.md](docs/dashboard-visual-spec-phase-13-2.md) | Dashboard density, card and row anatomy, state matrix, 390 px contract |
| [docs/dashboard-data-contract-phase-13-3.md](docs/dashboard-data-contract-phase-13-3.md) | What each dashboard section is backed by, and how the rest presents itself |
| [docs/limitations.md](docs/limitations.md) | Known limitations and the security model |

Graph View has its own set: [architecture](docs/graph-view-architecture.md),
[data model](docs/graph-view-data-model.md),
[interactions](docs/graph-view-interactions.md),
[accessibility](docs/graph-view-accessibility.md),
[performance](docs/graph-view-performance.md),
[licensing](docs/graph-view-licensing.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). In short: branch from `main`, pick or open an
issue, run `npm run build` and `npm test`, update the docs you touch, and link the issue
in your PR.

## License

Released under the **[CC0 1.0 Universal](LICENSE)** public-domain dedication — do whatever
you like with it, no attribution required.
