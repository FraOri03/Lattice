# Contributing to Lattice

Lattice is a personal project, so this guide is intentionally light. The goal is a
consistent, reviewable history — not process for its own sake.

## Set up

```bash
npm install
npm run dev        # http://localhost:5173
```

Everything runs locally with no configuration. To exercise cloud/realtime features, copy
`.env.example` → `.env.local` and follow [docs/setup.md](docs/setup.md) and
[docs/integrations.md](docs/integrations.md).

## Pick something to work on

- Browse the [issues](https://github.com/FraOri03/Lattice/issues) and the
  [roadmap](ROADMAP.md). `status: ready` items are scoped and safe to pick up.
- Comment on the issue before starting anything non-trivial, so effort isn't duplicated.
- No matching issue? Open one first
  ([feature](https://github.com/FraOri03/Lattice/issues/new?template=feature_request.yml)
  / [bug](https://github.com/FraOri03/Lattice/issues/new?template=bug_report.yml)) so the
  change has a home and a place to agree on scope.

## Branches

Never work directly on `main`. Branch with a `type/short-slug` name, matching the existing
history:

```
feat/board-keyboard-nav
fix/drive-token-refresh
docs/roadmap-cleanup
refactor/collab-hub
audit/...
```

## Commits

Use short, imperative messages. A `type: summary` prefix (as already used for `docs:` and
phase commits) is encouraged but not enforced:

```
feat: add roving-tabindex focus to board cards
fix: refresh Drive token on 401 instead of erroring
docs: split README into docs/
```

Keep unrelated changes out of the same commit.

## Before opening a PR

Run what the repo actually has:

```bash
npm run typecheck   # or: npm run build  (typecheck + production build)
npm test            # vitest
```

- **Add or update tests** where it's reasonable (coverage is currently thin — new tests are
  welcome alongside features).
- **Update the docs** you touched: `docs/*` for behavior/architecture, `CHANGELOG.md`
  under `## [Unreleased]`, and the relevant issue.
- **Check accessibility** for any UI change — keyboard operability and non-color status
  cues are known weak spots (see [docs/limitations.md](docs/limitations.md)).

## Pull requests

- Open the PR against `main` and fill in the
  [template](.github/pull_request_template.md).
- **Link the issue** it closes: put `Closes #123` in the description.
- Add the relevant labels (`type:`, `area:`, and `priority:`/`status:` if you're triaging).
  Label meanings are in [ROADMAP.md](ROADMAP.md#how-the-roadmap-works).
- Draft PRs are fine for work in progress — mark them ready when they are.

## Definition of done

An item is done when: the acceptance criteria in its issue are met, `typecheck`/`build`
and `test` pass, docs and the changelog are updated, the PR links the issue, and no
unrelated product behavior changed.
