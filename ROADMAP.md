# Lattice Roadmap

The roadmap lives in **GitHub Issues and a GitHub Project**, not in this file. This page
explains how it is organized and gives a light Now / Next / Later snapshot. It is
intentionally short: the issues are the source of truth, so nothing here is duplicated in
detail.

> **GitHub Project:** _Lattice Roadmap_ — **not created yet.** See
> [Creating the Project](#creating-the-github-project) for the exact `gh` commands.
> Once created, replace this line with the Project URL.

## How the roadmap works

- **Every roadmap item is a GitHub Issue.** Features, improvements, refactors, tech debt
  and bugs are all tracked as issues so each has one place for discussion, acceptance
  criteria and links to the PRs that close it.
- **The GitHub Project** ([Projects v2](https://docs.github.com/issues/planning-and-tracking-with-projects))
  gives the board / table / roadmap views over those issues.
- **Priorities and dates can change.** Nothing here is a commitment or a delivery date;
  ordering reflects current intent, not a schedule.

### Status (roadmap state)

`status:` labels track where an item is:

| Label | Meaning |
|---|---|
| `status: exploring` | Idea under consideration; scope not settled. |
| `status: planned` | Agreed to do; not started. |
| `status: ready` | Scoped and ready to pick up. |
| `status: in progress` | Actively being worked on. |
| `status: blocked` | Waiting on a dependency or decision. |
| `status: validating` | Implemented; under review/testing. |
| `status: shipped` | Merged and released (issue closed). |

An item carries **one** status at a time.

### Priority, area, type, stage

- **`priority:`** — `critical` / `high` / `medium` / `low`.
- **`area:`** — the product surface (`board`, `documents`, `notes`, `spreadsheets`,
  `presentations`, `code`, `collaboration`, `sync`, `import-export`, `storage`,
  `authentication`, `projects`, `ui-ux`, `accessibility`, `performance`,
  `developer-experience`).
- **`type:`** — `feature` / `bug` / `improvement` / `documentation` / `refactor` /
  `testing` / `infrastructure` / `security`.
- **`stage:`** — release maturity when useful (`exploring` / `prototype` / `alpha` /
  `beta` / `stable`).

### Milestones

**A milestone is a phase.** Development runs in numbered phases, and each one is a
milestone that holds the issues for its sub-steps
([all milestones](https://github.com/FraOri03/Lattice/milestones)):

| Milestone | What the phase is |
|---|---|
| [Phase 11](https://github.com/FraOri03/Lattice/milestone/4) | Application shell & navigation — **shipped** (closed for the record) |
| [Phase 12](https://github.com/FraOri03/Lattice/milestone/5) | Adaptive shell — responsive tiers, drawers, folding bars |
| [Phase 13](https://github.com/FraOri03/Lattice/milestone/6) | New dashboard — design & prototype |
| [Phase 14](https://github.com/FraOri03/Lattice/milestone/7) | Profile & settings |
| [Phase 15](https://github.com/FraOri03/Lattice/milestone/8) | New dashboard — implementation |
| [Phase 16](https://github.com/FraOri03/Lattice/milestone/9) | Identity model |
| [Phase 17](https://github.com/FraOri03/Lattice/milestone/10) | Supabase backend |
| [Phase 18](https://github.com/FraOri03/Lattice/milestone/11) | Email invitations |
| [Phase 19](https://github.com/FraOri03/Lattice/milestone/12) | Surface upgrades |
| [Phase 20](https://github.com/FraOri03/Lattice/milestone/13) | Suite toolbars |
| [Phase 21](https://github.com/FraOri03/Lattice/milestone/14) | AI — RunPod serverless + in-house ComfyUI |
| [Phase 22](https://github.com/FraOri03/Lattice/milestone/15) | Entitlements & billing |

Two release-intent milestones from the Phase 9 pass — **Public beta** and **Broader
adoption** — are closed: every issue they held is closed.
[Backlog / Future](https://github.com/FraOri03/Lattice/milestone/3) stays open for larger
engine and platform items that are not attached to a phase yet.

Version numbers are deliberately avoided until a release is actually cut. The app displays
a pinned release string (`Alpha v0.11.3.5`), which tracks the phase it was cut in, not a
published version — no tags or releases exist.

## Proposing work

- **Request a feature** → open a [Feature request](https://github.com/FraOri03/Lattice/issues/new?template=feature_request.yml).
- **Report a bug** → open a [Bug report](https://github.com/FraOri03/Lattice/issues/new?template=bug_report.yml).

New issues start unprioritized and without a status — triage assigns `status:`,
`priority:`, `area:` and a milestone. Templates never self-assign a high priority or a
"planned" state.

## Now / Next / Later

A snapshot — the [milestones](https://github.com/FraOri03/Lattice/milestones) are
authoritative. Each item links to its issue.

### Now — [phase 12](https://github.com/FraOri03/Lattice/milestone/5), the adaptive shell

12.0 (measured audit) and 12.1 (viewport tier model) have shipped. What is left:

- Sidebar and inspector become overlay drawers below Compact · [#63](https://github.com/FraOri03/Lattice/issues/63)
- The top bar folds: breadcrumb floor, right-cluster overflow, container queries · [#64](https://github.com/FraOri03/Lattice/issues/64)
- Board toolbar folds instead of being clipped below ~1060 px · [#47](https://github.com/FraOri03/Lattice/issues/47)
- The Viewer tier below 768 px · [#65](https://github.com/FraOri03/Lattice/issues/65), with the legacy `.tbtn` surfaces · [#48](https://github.com/FraOri03/Lattice/issues/48)

### Next — the dashboard, and settings around it

- [Phase 13](https://github.com/FraOri03/Lattice/milestone/6) — the new dashboard,
  design and prototype: IA ([#66](https://github.com/FraOri03/Lattice/issues/66)),
  prototype ([#67](https://github.com/FraOri03/Lattice/issues/67)), data contract
  ([#68](https://github.com/FraOri03/Lattice/issues/68)), search and New
  ([#69](https://github.com/FraOri03/Lattice/issues/69)), acceptance contract
  ([#70](https://github.com/FraOri03/Lattice/issues/70)).
- [Phase 14](https://github.com/FraOri03/Lattice/milestone/7) — profile & settings:
  shell ([#71](https://github.com/FraOri03/Lattice/issues/71)), account
  ([#72](https://github.com/FraOri03/Lattice/issues/72)), appearance
  ([#73](https://github.com/FraOri03/Lattice/issues/73)), notifications
  ([#74](https://github.com/FraOri03/Lattice/issues/74)), connected apps
  ([#75](https://github.com/FraOri03/Lattice/issues/75)).
- [Phase 15](https://github.com/FraOri03/Lattice/milestone/8) — building that dashboard
  ([#76](https://github.com/FraOri03/Lattice/issues/76)–[#80](https://github.com/FraOri03/Lattice/issues/80)).

### Later — the backend jump, then the suites

- [Phase 16](https://github.com/FraOri03/Lattice/milestone/9) — identity model. `User` and
  `UserIdentity` have shipped ([#81](https://github.com/FraOri03/Lattice/issues/81), see
  [docs/identity.md](docs/identity.md)), and authorisation is settled: it stays in `/api`,
  the browser never holds a database credential
  ([#83](https://github.com/FraOri03/Lattice/issues/83), see
  [docs/authorisation-phase-16-3.md](docs/authorisation-phase-16-3.md)). What is left is
  moving room memberships onto `userId`
  ([#82](https://github.com/FraOri03/Lattice/issues/82)), which needs a server that can
  resolve somebody else's address — so it lands with Phase 17.
- [Phase 17](https://github.com/FraOri03/Lattice/milestone/10) — Supabase, server sessions,
  e-mail OTP. Everything to the right of this depends on it. 16.3 already fixes its shape:
  service role only, deny-all RLS as a backstop, and Lattice-issued sessions rather than
  Supabase ones.
- [Phase 18](https://github.com/FraOri03/Lattice/milestone/11) — e-mail invitations, which
  unlock "Shared with me" and pending invites on the dashboard.
- [Phase 19](https://github.com/FraOri03/Lattice/milestone/12) — surface upgrades ·
  [20](https://github.com/FraOri03/Lattice/milestone/13) suite toolbars ·
  [21](https://github.com/FraOri03/Lattice/milestone/14) AI ·
  [22](https://github.com/FraOri03/Lattice/milestone/15) entitlements & billing.
- Not attached to a phase yet, in
  [Backlog / Future](https://github.com/FraOri03/Lattice/milestone/3): CRDT subdocument
  partitioning ([#28](https://github.com/FraOri03/Lattice/issues/28)), File System Access
  vault ([#29](https://github.com/FraOri03/Lattice/issues/29)), plugin API
  ([#30](https://github.com/FraOri03/Lattice/issues/30)), PR-based GitHub sync
  ([#31](https://github.com/FraOri03/Lattice/issues/31)), remote-deletion UI
  ([#32](https://github.com/FraOri03/Lattice/issues/32)).

### Dependencies worth knowing

```
phase 12 ─┐
phase 13 ─┼─ no external blocker
phase 14 ─┘

phase 16 ──▶ phase 17 ──┬──▶ phase 18 ──▶ (server-backed dashboard)
                        └──▶ phase 22
```

Phases 12–15 can be built on what exists today. Phase 17 is the single biggest
architectural jump on the roadmap: there is no database yet — the only server state is
Liveblocks room metadata.

### Shipped recently

- [Phase 11](https://github.com/FraOri03/Lattice/milestone/4) — dashboard root surface,
  toolbar normalisation across every surface, the Home screen, and one tab strip per
  project (the six entity slots retired).
- Project calls (LiveKit), Graph View, Photo mode, presentation-in-board, production
  realtime multiplayer, server-enforced permissions, workspaces, area comments, the
  notification centre and the format pipeline. See [CHANGELOG.md](CHANGELOG.md).

## Creating the GitHub Project

The Project could not be created automatically (the CLI token lacks the `project` scope).
To create and wire it up:

```bash
# 1. Grant the scope (opens a browser to authorize):
gh auth refresh -s project

# 2. Create the Project (owner = your user account):
gh project create --owner FraOri03 --title "Lattice Roadmap"

# 3. Note the returned project number, then add every open issue:
gh issue list --state open --limit 200 --json url -q '.[].url' \
  | xargs -n1 gh project item-add <PROJECT_NUMBER> --owner FraOri03 --url
```

Then, in the Project UI, add the views described in
[the PR](https://github.com/FraOri03/Lattice/pulls): **Roadmap** (group by milestone),
**Board** (columns = the `status:` values), **Table** (Title/Status/Priority/Area/
Milestone/Assignee/Linked PRs/Updated), **Bugs** (filter `type: bug`), and **Current work**
(filter `status: ready|in progress|blocked|validating`). Finally, replace the placeholder
link at the top of this file with the Project URL.
