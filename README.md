# Lattice

A **local-first unified creative workspace** — Obsidian-style linked notes, a Figma-style
infinite board with sections, a Word/Notion-style rich document editor, a VS Code-style
code workspace with GitHub sync, an Excel-style spreadsheet engine, and a slide editor,
all organized into **projects** inside **workspaces**, with optional Google Drive cloud
sync and CRDT realtime collaboration.

One vault holds every kind of thing you work with — notes, documents, spreadsheets, decks,
boards, code and imported files — and every one of them can be a **card** on an infinite
canvas, linked visually and semantically.

> **Documents and assets are entities. Cards are views of them. Projects own them. The cloud mirrors them.**

## Project status

**Alpha / experimental.** Functionally broad, but no public release has been cut (no Git
tags, no CI). Based on the project's own [UX/UI audit](https://github.com/FraOri03/Lattice/issues/5):
single-user local work is the most mature (late-alpha / early-beta); team & realtime
features work but are **config-gated and alpha**. Cloud and realtime features degrade
honestly when unconfigured — nothing is faked. See [docs/limitations.md](docs/limitations.md).

## Features

- **Six editing surfaces** — board, rich documents, markdown notes, spreadsheets, slide
  decks, and a Monaco code workspace.
- **Infinite board** — Figma-like sections, web-embed cards, and a card view for every
  entity kind.
- **Universal import/export** — PDF, Office (DOCX/XLSX/PPTX/ODF), media, 3D, code;
  DOCX/PPTX/PDF export. See [docs/file-formats.md](docs/file-formats.md).
- **Projects & workspaces** — everything scoped to the active project; command palette,
  quick create, recents, dark/light theme.
- **Cloud sync** — offline-first Google Drive backup (`drive.file` scope; single-user,
  multi-device).
- **GitHub code sync** — connect a repo, import/commit code documents to a feature branch.
- **Collaboration** — roles & server-enforced permissions, presence, comments, version
  history, and CRDT co-editing (Liveblocks + Yjs) when configured. See
  [docs/collaboration.md](docs/collaboration.md).

A full, status-tagged inventory is in [docs/features.md](docs/features.md).

## Tech stack

React 19 · TypeScript · Vite 6 · Zustand · Tiptap (ProseMirror) · Monaco · React Flow ·
Yjs + Liveblocks (CRDT realtime) · SheetJS · jsPDF · three.js · Tailwind CSS. Deployed on
Vercel with serverless functions for GitHub OAuth and realtime auth.

## Quick start

```bash
npm install
npm run dev        # → http://localhost:5173
```

With no configuration the app runs fully local (mock account, sync disabled, GitHub via
personal access token, realtime limited to tabs of one browser).

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server (HMR) at http://localhost:5173 |
| `npm run build` | Typecheck + production build → `dist/` |
| `npm run typecheck` | TypeScript typecheck only |
| `npm test` | Unit tests (Vitest) |
| `npm run preview` | Serve the production build locally |

### Minimal configuration

Everything is optional. Copy the template and fill in only what you need:

```bash
cp .env.example .env.local
```

| Variable | Unlocks |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Google sign-in + Drive sync |
| `VITE_GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` | One-click GitHub OAuth (PAT works without it) |
| `VITE_REALTIME_BACKEND=liveblocks` + `LIVEBLOCKS_SECRET_KEY` | Cross-device realtime |

Full setup, provider configuration and deployment are in [docs/setup.md](docs/setup.md)
and [docs/integrations.md](docs/integrations.md).

> **Deployment:** the repo is Vercel-ready (`vercel.json` + `api/`), but no public demo
> URL is published in this repository. Deploy your own following
> [docs/setup.md](docs/setup.md#deployment-vercel).

## Roadmap

Planning lives in **GitHub Issues and a GitHub Project**, not in this README.

- **GitHub Project — _Lattice Roadmap_:** _pending — see [ROADMAP.md](ROADMAP.md#creating-the-github-project) for the setup commands._ <!-- Replace with the Project URL once created. -->
- **Roadmap overview & conventions:** [ROADMAP.md](ROADMAP.md)
- **Open issues:** https://github.com/FraOri03/Lattice/issues
- **What already shipped:** [CHANGELOG.md](CHANGELOG.md)

## Documentation

| Doc | Contents |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Data model, stores, services, CRDT layer, source layout |
| [docs/features.md](docs/features.md) | Status-tagged feature inventory |
| [docs/setup.md](docs/setup.md) | Install, commands, build, test, deploy, troubleshooting |
| [docs/integrations.md](docs/integrations.md) | Google, Drive, GitHub, Liveblocks, conversion backend |
| [docs/collaboration.md](docs/collaboration.md) | Realtime model, permission matrix, honest limits |
| [docs/file-formats.md](docs/file-formats.md) | Import/export support matrix and fidelity |
| [docs/limitations.md](docs/limitations.md) | Known limitations and the security model |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). In short: branch from `main`, pick or open an
issue, run `npm run build` and `npm test`, update the docs you touch, and link the issue
in your PR.

## License

Released under the **[CC0 1.0 Universal](LICENSE)** public-domain dedication — do whatever
you like with it, no attribution required.
