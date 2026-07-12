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

Milestones group issues by release intent (see the README's own P1/P2/P3 framing):

- **Public beta** — the P1 work that must land before a public beta.
- **Broader adoption** — the P2 work before wider adoption.
- **Backlog / Future** — P3 polish and larger engine/platform items, not yet scheduled.

Version numbers are deliberately avoided until a release is actually cut — the app reports
`0.8.0` today but no tags/releases exist.

## Proposing work

- **Request a feature** → open a [Feature request](https://github.com/FraOri03/Lattice/issues/new?template=feature_request.yml).
- **Report a bug** → open a [Bug report](https://github.com/FraOri03/Lattice/issues/new?template=bug_report.yml).

New issues start unprioritized and without a status — triage assigns `status:`,
`priority:`, `area:` and a milestone. Templates never self-assign a high priority or a
"planned" state.

## Now / Next / Later

A snapshot — the [Project](#creating-the-github-project) is authoritative. Each item links
to its issue.

### Now (P1 — before public beta)

- Board canvas keyboard accessibility · [#8](https://github.com/FraOri03/Lattice/issues/8)
- Propagate the realtime "off" state to presence/Share · [#9](https://github.com/FraOri03/Lattice/issues/9)
- Lazy-load three.js + board virtualization / pause off-screen loops · [#11](https://github.com/FraOri03/Lattice/issues/11)
- Browser history (back/forward) + entity deep links · [#10](https://github.com/FraOri03/Lattice/issues/10)
- Responsive tiers + drawer inspectors · [#14](https://github.com/FraOri03/Lattice/issues/14)

### Next (P2 — before broader adoption)

- Demote Split to a layout toggle; auto-hide single-workspace nesting · [#10](https://github.com/FraOri03/Lattice/issues/10)
- Presenter / slideshow mode · [#15](https://github.com/FraOri03/Lattice/issues/15)
- In-sheet save-level co-editing notice · [#17](https://github.com/FraOri03/Lattice/issues/17)
- Visible board undo/redo (Ctrl/Cmd+Z) · [#16](https://github.com/FraOri03/Lattice/issues/16)
- Onboarding tour + first-run ownership · [#18](https://github.com/FraOri03/Lattice/issues/18)
- Exact doc-range comment anchors · [#19](https://github.com/FraOri03/Lattice/issues/19)
- Status redundancy (color + icon + text) + identity-vs-storage cue · [#8](https://github.com/FraOri03/Lattice/issues/8), [#9](https://github.com/FraOri03/Lattice/issues/9)
- Expand automated test coverage · [#20](https://github.com/FraOri03/Lattice/issues/20)

### Later (P3 + engine/platform)

- Anonymous read-only public viewer / published boards · [#25](https://github.com/FraOri03/Lattice/issues/25)
- Unified import/export transfer dialog · [#26](https://github.com/FraOri03/Lattice/issues/26)
- Cell-level spreadsheet CRDT · [#27](https://github.com/FraOri03/Lattice/issues/27)
- CRDT subdocument partitioning for very large projects · [#28](https://github.com/FraOri03/Lattice/issues/28)
- File System Access API local vault · [#29](https://github.com/FraOri03/Lattice/issues/29)
- Plugin API for editors/cards · [#30](https://github.com/FraOri03/Lattice/issues/30)
- PR-based GitHub sync flow · [#31](https://github.com/FraOri03/Lattice/issues/31)
- Remote-deletion management UI · [#32](https://github.com/FraOri03/Lattice/issues/32)
- Polish: "Decks" filter chip ([#21](https://github.com/FraOri03/Lattice/issues/21)), preview→download fallback ([#22](https://github.com/FraOri03/Lattice/issues/22)), dedupe icon maps ([#23](https://github.com/FraOri03/Lattice/issues/23)), slide-level linking ([#24](https://github.com/FraOri03/Lattice/issues/24))

### Exploring

- AI assistant inside projects · web clipper · billing/subscriptions · dedicated
  mobile/tablet UI. These are directional ideas, not commitments (`status: exploring`).

### Shipped recently

- Presentation-in-Board (decks as first-class board cards) · [#7](https://github.com/FraOri03/Lattice/issues/7)
- Production realtime multiplayer (Liveblocks + Yjs), server-enforced permissions,
  workspaces, area comments, notification center, format pipeline (DOCX/PPTX/PDF export).
  See [CHANGELOG.md](CHANGELOG.md).

## Creating the GitHub Project

The Project could not be created automatically (the CLI token lacks the `project` scope).
To create and wire it up:

```bash
# 1. Grant the scope (opens a browser to authorize):
gh auth refresh -s project

# 2. Create the Project (owner = your user account):
gh project create --owner FraOri03 --title "Lattice Roadmap"

# 3. Note the returned project number, then add the roadmap issues:
for n in 8 9 10 11 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32; do \
  gh project item-add <PROJECT_NUMBER> --owner FraOri03 \
    --url https://github.com/FraOri03/Lattice/issues/$n; done
```

Then, in the Project UI, add the views described in
[the PR](https://github.com/FraOri03/Lattice/pulls): **Roadmap** (group by milestone),
**Board** (columns = the `status:` values), **Table** (Title/Status/Priority/Area/
Milestone/Assignee/Linked PRs/Updated), **Bugs** (filter `type: bug`), and **Current work**
(filter `status: ready|in progress|blocked|validating`). Finally, replace the placeholder
link at the top of this file with the Project URL.
