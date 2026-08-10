# Dashboard information architecture — Phase 13.1

The structure the new dashboard is built on, settled before any pixel is final
and before phase 15 writes a line of it. It answers four questions the visual
prototype leaves open: **which destinations exist**, **what each one is scoped
to**, **what the URL says about them**, and **what switching workspace does**.

Two inputs: the `UI Board Mockup` prototype (issue #67) and the data model that
actually ships — `src/types/model.ts`, `src/store/useStore.ts`,
`src/lib/nav/navUrl.ts`. Where the two disagree, the model wins and the
prototype changes; those cases are listed at the end.

---

## The shape that already exists

The hierarchy is not an open question. `src/types/model.ts` fixes it:

- **Workspace → Project → entities.** The comment on `Workspace` is explicit:
  *"The information architecture stops here on purpose — no deeper nesting."*
  Projects join a workspace through `workspace.projectIds`; access control is
  enforced per project, workspace membership is organisational grouping.
- **`Folder` is not a container for projects.** It is a user-created folder
  *inside one sidebar category, scoped to a project* (`FolderCategory` is
  `boards | docs | sheets | presentations | code | notes | assets`), and
  membership lives on the item as `folderId`. A folder groups entities of one
  kind inside one project. It has no meaning above a project, and it never
  appears on the dashboard.

So the dashboard has exactly three levels to show: the **workspace** you are
in, the **projects** it holds, and the **entities** those projects hold. There
is no fourth.

---

## Destinations

| Destination | The question it answers | Scope | URL |
|---|---|---|---|
| **Home** | What is in this workspace, and what did I touch last? | Active workspace | `/` (bare) |
| **Recents** | What have I opened, newest first? | Every workspace, labelled per row | `?d=recents` |
| **Starred** | What did I pin, and where is it? | Every workspace, labelled per row | `?d=starred` |
| **Shared with me** | What has someone else given me access to? | Every workspace, grouped by owner | `?d=shared` |
| **Invites** | Who is asking, and what would I be agreeing to? | Every workspace, grouped by sender | `?d=invites` |
| **Trash** | What did I delete, and how long do I have? | Active workspace | `?d=trash` |

**There is no Projects destination.** Home *is* the project index — it already
groups the workspace's projects as Starred / Recent / Projects / Archived, the
same order `groupProjects()` produces for the switcher — and the project
*surface* is the existing shell, reached by opening one. A separate "All
projects" page would be Home with the greeting removed.

**Invites is a destination**, even though the phase description lists six. It
owns a badge in the nav, a strip on Home and a full page in the prototype; it
is cheaper to name it now than to discover it during implementation.

### One rule for scoping

> **Personal shelves span workspaces and label every row. Workspace-owned
> surfaces scope to the active workspace. People-owned surfaces span workspaces
> and group by whoever is on the other side.**

Recents and Starred are shelves: they answer questions about *you*, and hiding
the file you closed two minutes ago because you switched workspace afterwards
would be a bug, not a feature. Both therefore carry a workspace label on every
row and a filter that narrows to the active workspace — the filter the
prototype already gives Starred (`All workspaces / … / Studio Nord`), extended
to Recents, which today shows Studio Nord rows with no scoping control at all.

Trash is workspace-owned because *restore* has to put an item back somewhere
real; a cross-workspace trash makes "restore" ambiguous the moment the two
workspaces hold projects with the same name.

Shared and Invites are about other people, and an invitation can name a project
in a workspace you are not a member of yet — scoping them to the active
workspace would hide exactly the thing you came to look at.

---

## Switching workspace never opens a project

Today `setActiveWorkspace` picks the first non-archived project of the target
workspace and calls `setActiveProject` on it — and creates a project if the
workspace is empty. On the dashboard that is an implicit fallback into a
project, which is the one thing `docs/navigation.md` rules out ("landing in a
different project than the link asked for is a worse answer than landing
Home").

The rule, from phase 15 onwards:

| You are on | You switch workspace | You land on |
|---|---|---|
| Home | any workspace | **Home**, re-scoped |
| A dashboard destination | any workspace | **the same destination**, re-scoped or re-filtered |
| A project surface | any workspace | **Home** of the new workspace |

No project is opened, and no project is created as a side effect of switching.
An empty workspace shows Home's empty state, which is a screen that has to
exist anyway.

The active workspace stays where it is today — persisted store state, not a URL
parameter. A dashboard link therefore resolves against *the recipient's* active
workspace, which is correct: `?d=recents` carries no ids and means "your
recents", not "mine".

---

## The URL owns the destination too

The dashboard is currently a single param-less URL: `serializeNav` returns `""`
for it and `navKey` returns `"dashboard"`. With six destinations that breaks two
invariants phase 11 established — refreshing on Trash would drop you on Home,
and Back would skip every destination you visited.

The extension is one token:

- `?d=recents | starred | shared | invites | trash` — **Home is the absence of
  the token**, so the bare root URL keeps meaning Home and every existing link
  keeps resolving.
- **`p` wins over `d`.** A URL carrying a valid project is the project surface;
  a stray `d` alongside it is dropped, exactly as `m=doc` without `p` is
  dropped today.
- **Unknown value degrades to Home**, matching the existing rule for an unknown
  project id — never a guess.
- `navKey` becomes `dashboard` for Home and `dashboard|<d>` for the rest, so
  Back/Forward move between destinations without duplicate history entries.

`navSurface` stays unpersisted: the URL owning the destination is what makes
"refresh keeps you on Trash" true without a special case.

---

## Entry rules, complete

Phase 11's rules hold unchanged; the last row is the only addition.

| Entry point | Lands on |
|---|---|
| Fresh sign-in | **Home** — never the last project |
| Bare root URL | **Home** |
| Valid project deep link | that **project** |
| Refresh inside a project | the **same project** |
| Deep link to an entity | that **entity**, in its project |
| Unknown / deleted project id | **Home** |
| Refresh on a dashboard destination | **the same destination** |

---

## What changes in the prototype

Three things in `UI Board Mockup` describe a model Lattice does not have. They
are cheap to correct now and expensive to correct in 15.1.

1. **"Folders" on Home are workspaces.** The chip row — Clienti, Personale,
   Università, Archivio 2026, each holding projects — is the workspace list
   wearing a folder icon. Relabel the row **Workspaces**, show each workspace's
   project count, and make a chip switch the active workspace and stay on Home.
   No new concept, and the row keeps the job it was designed for: fast re-entry
   into a group of projects.
2. **The sidebar tree has the same problem**, folder → projects. It becomes
   workspace switcher → the active workspace's projects, grouped Starred /
   Active / Archived like `groupProjects()` already groups them for the
   switcher. Real folders keep working where they already work — inside a
   project, per category, on the project surface.
3. **A folder cannot be starred.** `Folder` has no `starred` field, so the
   `kind: 'folder'` row in the prototype's Starred page has nothing behind it.
   Starred spans projects and entities; folders are not members of it.

**Naming.** The app ships `Starred` / `Preferiti` (`src/lib/i18n/messages.ts`),
the membership gesture is a star, and the field is `Project.starred`. The
destination is therefore **Starred**, not Favorites — one concept, one word, in
both locales. The phase description's "Favourites" is this destination.

---

## Dependencies this IA creates

Named here so 13.3 can map them and 15.2 can cost them — not decided here.

- **Starred across entity kinds needs a model change.** Only `Project` has
  `starred` today; notes, docs, sheets, decks, code files and assets do not.
- **Recents as a destination needs a longer log.** `RecentEntry` is
  `{ kind, id, at }`, capped at 15 entries by `pushRecent`, with no project
  attribution — `resolveRecents` derives the project from the entity. A page
  that groups by day needs both a larger cap and a decision about what an
  unattributed entry looks like.
- **Trash has no model at all.** Nothing in the store records a deletion,
  a deletion time or a purge date.
- **Shared with me and Invites have no index**, which is why phase 18 exists.

## Deliberately not settled here

Card and row anatomy, density, the states each section owes — settled next door
in [dashboard-visual-spec-phase-13-2.md](dashboard-visual-spec-phase-13-2.md); where
each section's data comes from and how the server-backed ones present
themselves until they are real (13.3); search and the New entry point (13.4);
acceptance criteria, the EN/IT key list and the accessibility contract (13.5).
