# The Lattice Creative Suite — phases 22–26

Lattice's professional creative suite is **four specialised environments on one shared
core**, not four applications sharing a login.

| Environment | Domain | Phase | Milestone | Epic |
|---|---|---|---|---|
| **Trace** | Vector & illustration | 23 | [milestone 17](https://github.com/FraOri03/Lattice/milestone/17) | [#206](https://github.com/FraOri03/Lattice/issues/206) |
| **Forge** | Image & painting | 24 | [milestone 18](https://github.com/FraOri03/Lattice/milestone/18) | [#207](https://github.com/FraOri03/Lattice/issues/207) |
| **Folio** | Layout & publishing | 25 | [milestone 19](https://github.com/FraOri03/Lattice/milestone/19) | [#208](https://github.com/FraOri03/Lattice/issues/208) |
| **Flux** | Video & motion | 26 | [milestone 20](https://github.com/FraOri03/Lattice/milestone/20) | [#209](https://github.com/FraOri03/Lattice/issues/209) |

They sit on the **Lattice Creative Core**, built in phase 22
([milestone 16](https://github.com/FraOri03/Lattice/milestone/16), epic
[#205](https://github.com/FraOri03/Lattice/issues/205)) before any of them starts.

> **Status: none of this exists yet.** As of phase 15 there is no Trace, Forge, Folio or
> Flux code, and no mockup of any of them, on any branch. Photo mode is a set and lighting
> planner, not an image editor. Everything below is a plan, and the issues are written so
> that a plan is never mistaken for an implementation.

## Why a foundation phase comes first

Left to themselves, four creative environments each invent a panel system, an icon set, a
colour model, a text engine, an export pipeline, an undo model and a snapping engine. The
precedent is already in this repository at one-surface scale: `src/components/Icons.tsx`
holds ~85 flat icon components with no registry, and `src/lib/photo/icons.ts` is a second,
separate icon system built for Photo mode alone.

Phase 22 exists so the same conceptual operation is *literally the same registered thing*
in all four environments — Move/Selection, Hand, Zoom, Eyedropper, Text, Transform, Align,
Color, Assets, History, Comments and Export share one id, one icon, one word, one shortcut
and one interaction model, and every intentional difference is recorded in a divergence
register with its reason.

## Phase dependency graph

```
                Phase 22 — Creative Suite Foundation
                                │
              ┌─────────┬───────┼───────┬─────────┐
              ↓         ↓       ↓       ↓         ↓
           Trace     Forge    Folio    Flux
          Phase 23  Phase 24 Phase 25 Phase 26
              │         │       │       │
              └─────────┴───┬───┴───────┘
                            ↓
                Phase 27 — Entitlements & billing
```

**23–26 are not strictly sequential.** Once phase 22 reaches architectural maturity —
22.1 (Core + mode registry), 22.3 (tool/icon registry), 22.4 (object model) landed, and
the 22.7 performance *requirements* settled — the four environments can proceed in partial
parallel. What they must not do is start before that point, because each would then settle
the same architecture differently.

Phase 27 depends on the suite only in the sense that gating an unfinished tool is worse
than not shipping it: an environment is gated after its production-hardening subphase
passes, not before.

## Cross-phase subphase dependencies

The dependencies that actually constrain scheduling run *between* phases, not just within
them.

```
22.5 Text engine
   ├──▶ 23.8  Trace typography
   ├──▶ 25.4  Folio typography      (and 25.5 flow, 25.6 styles)
   └──▶ 26.10 Flux titles

22.5 Colour service
   ├──▶ 23.11 Trace colour management  ┐ one implementation,
   ├──▶ 24.10 Forge colour management  ┘ two consumers
   └──▶ 25.12 Folio prepress

22.5 Export pipeline
   ├──▶ 23.12 Trace export  ┐
   ├──▶ 24.13 Forge export  ├─ one PDF writer, different profiles
   ├──▶ 25.13 Folio PDF/X   ┘
   └──▶ 26.15 Flux encoding   (own encoders, shared pipeline shape)

22.5 Snapping engine
   ├──▶ 23.10 Trace guides        (vector candidate providers)
   ├──▶ 25.7  Folio grids/guides  (layout candidate providers)
   └──▶ 26.3  Flux timeline       (time-domain candidate providers)

22.6 Interoperability contract
   ├──▶ 23.13 Trace links & graph
   ├──▶ 24.14 Forge cross-mode
   ├──▶ 25.9  Folio live Trace/Forge content
   └──▶ 26.11–26.13 Flux integrations

23.x Vector geometry core
   ├──▶ 24.4  Forge vector masks
   ├──▶ 24.11 Forge shape layers
   ├──▶ 25.3  Folio shaped frames
   └──▶ 26.8  Flux effect masks

23.3 Bezier interaction model
   └──▶ 26.6  Flux keyframe curve editor
```

Within each environment the order is engine → authoring → production:

```
22 Creative Core
      ↓
23.1 Trace engine
      ↓
23.2–23.10 core authoring
      ↓
23.11–23.14 production
```

The same shape holds for 24.1 → 24.2–24.12 → 24.13–24.15, for 25.1 → 25.2–25.11 →
25.12–25.15, and for 26.1 → 26.2–26.13 → 26.14–26.16.

## Issue hierarchy

```
Milestone (the phase)
     ↓
Epic issue (the environment)
     ↓
Subphase issue (23.3 Pen & Bezier editing)
     ↓
Implementation issues (spun out when the subphase is picked up)
```

Subphase issues carry the full contract — objective, scope, dependencies, technical
considerations, UX requirements, acceptance criteria, testing requirements and explicit
out-of-scope items. Implementation issues are created from the checklists inside them when
the subphase starts, so the tracker is not front-loaded with hundreds of issues nobody can
act on yet.

Issues are deliberately specific. "Implement a professional Pen Tool" is not an issue;
"the pen's current state (will-close, will-continue, will-add-anchor, will-convert) is
shown in the cursor before the click" is.

## The maturity ladder

Every subphase distinguishes three states, and carries a `stage:` label accordingly:

| State | Meaning |
|---|---|
| **Mocked UI** (`stage: prototype`) | It looks like the feature. Nothing is behind it. |
| **Functional** (`stage: alpha` / `beta`) | It works and persists, but has not met its performance, accessibility, i18n or compatibility bar. |
| **Production** (`stage: stable`) | It has passed the phase's hardening subphase (23.14 / 24.15 / 25.15 / 26.16). |

A feature that renders but does not persist is not functional. One that is functional but
misses its performance budget is not production. This ladder exists because the most
likely failure mode for a creative suite is four impressive-looking editors with no engines
underneath.

## What is shared, and what is deliberately not

**Shared across all four** — one implementation, no per-mode fork:

colour · swatches · gradients · typography and the text engine · fonts · assets · links ·
clipboard · comments · collaboration · history · autosave and recovery · the mode registry ·
the panel and workspace system · the tool, icon, cursor and shortcut registry · the object
model primitives (identity, hierarchy, transforms, bounds, metadata, visibility, locking,
references)

**Specialised** — shared interface, per-mode implementation, with the reason recorded:

| Service | Why |
|---|---|
| **Export** | A vector PDF, a flattened PNG, a PDF/X print file and an H.264 encode share a dialogue and a pipeline shape, and nothing else. |
| **Snapping** | Bezier anchors, pixel grid, baseline grid and timeline frames are four different candidate problems on one engine. |
| **Rulers / guides** | Spatial in Trace, Forge and Folio; Flux's ruler is time. Same model, different unit. |
| **Versioning granularity** | A vector snapshot and a 4K composite snapshot have different cost profiles. Same API, different policy. |

Flux gets the widest latitude: a time-based document genuinely differs from a static one,
and it must not be forced into a spatial-only object model or static-document undo
assumptions. Where the Core cannot express time-varying properties, that is a gap to fix in
22.4 — not a licence to fork the Core.

## What makes this Lattice rather than four clones

Illustrator, Photoshop, InDesign and Premiere are capability references. They are not the
plan. What the four environments have that those products do not is the environment they
share:

- **one project model** — a creative document is a project entity like any other, in
  recents, search, the tab strip, the command palette and the graph
- **one asset system** — one library, one identity per asset, across all four
- **one collaboration model** — the existing Liveblocks + Yjs stack, project roles and
  server-enforced ACL, unchanged
- **one history and version philosophy** — the existing `VersionHistoryService` and
  `AutoSnapshot`
- **shared design primitives** — one transform model, one object identity, one hierarchy
- **shared typography and colour** — one text engine for Trace, Folio and Flux; one colour
  implementation for Trace, Forge and Folio
- **linked creative assets** — placement is a link; flattening is an explicit, recorded
  choice
- **cross-mode editing** — edit the original in its own environment, see it update
  everywhere it is placed, with no manual re-import
- **Graph awareness** — creative documents and their links are explained nodes and edges in
  the existing project graph
- **local-first** — it works on your machine, and the cloud mirrors it

Switching between Trace, Forge, Folio and Flux is switching persona inside one
application: the shell, the project, the assets, the collaborators and the realtime
connection all survive the switch. See [#98](https://github.com/FraOri03/Lattice/issues/98)
for the switching contract.

## Open decisions requiring human approval

These are product-level calls made inside phase 22, not implementation details:

1. **`ViewMode` shape** (22.1, [#137](https://github.com/FraOri03/Lattice/issues/137)) —
   four new `ViewMode` values, or one `creative` value plus a discriminator. The `m=` URL
   token is a permanent public contract.
2. **Text engine** (22.5, [#141](https://github.com/FraOri03/Lattice/issues/141)) — almost
   certainly a new shared engine (HarfBuzz/WASM shaping) coexisting with, and unrelated to,
   the Tiptap document editor. The largest single technical commitment in the phase, and
   the longest dependency chain in the suite.
3. **Colour representation** (22.5) — float/linear and colour-managed from the start, or
   8-bit sRGB. Choosing sRGB makes 23.11, 24.10 and 25.12 undeliverable.
4. **Rendering baseline** (22.7, [#143](https://github.com/FraOri03/Lattice/issues/143)) —
   WebGL2 floor with a WebGPU upgrade, and the honest unavailable state when neither is
   present.
5. **Testing infrastructure** (22.8, [#144](https://github.com/FraOri03/Lattice/issues/144))
   — whether a headless browser and CI become prerequisites. There is no CI in this
   repository today.
6. **Toolbar form** ([#98](https://github.com/FraOri03/Lattice/issues/98)) — whether the
   four-mode cluster may expand inline at wide widths, or is always a menu. The top bar
   already measures ~1400 px of content in Italian inside a box 240 px narrower than the
   window.

## Issue index

**Phase 22 — Creative suite foundation** ([#205](https://github.com/FraOri03/Lattice/issues/205))
· [#137](https://github.com/FraOri03/Lattice/issues/137) 22.1 architecture & mode registry
· [#138](https://github.com/FraOri03/Lattice/issues/138) 22.2 creative shell & panels
· [#139](https://github.com/FraOri03/Lattice/issues/139) 22.3 tools, icons, shortcuts
· [#140](https://github.com/FraOri03/Lattice/issues/140) 22.4 object model
· [#141](https://github.com/FraOri03/Lattice/issues/141) 22.5 shared services
· [#142](https://github.com/FraOri03/Lattice/issues/142) 22.6 interoperability contract
· [#143](https://github.com/FraOri03/Lattice/issues/143) 22.7 performance foundation
· [#144](https://github.com/FraOri03/Lattice/issues/144) 22.8 testing foundation

**Phase 23 — Trace** ([#206](https://github.com/FraOri03/Lattice/issues/206)) ·
[#145](https://github.com/FraOri03/Lattice/issues/145)–[#158](https://github.com/FraOri03/Lattice/issues/158)
(23.1 engine · 23.2 selection · 23.3 pen & Bezier · 23.4 shapes & booleans · 23.5 fill &
stroke · 23.6 appearance · 23.7 layers & masks · 23.8 typography · 23.9 symbols ·
23.10 artboards · 23.11 colour · 23.12 import/export · 23.13 collaboration ·
23.14 production)

**Phase 24 — Forge** ([#207](https://github.com/FraOri03/Lattice/issues/207)) ·
[#159](https://github.com/FraOri03/Lattice/issues/159)–[#173](https://github.com/FraOri03/Lattice/issues/173)
(24.1 raster engine · 24.2 selection · 24.3 layers · 24.4 masks · 24.5 brush engine ·
24.6 painting · 24.7 retouching · 24.8 adjustments · 24.9 filters · 24.10 colour ·
24.11 type/vector · 24.12 RAW · 24.13 import/export · 24.14 cross-mode · 24.15 production)

**Phase 25 — Folio** ([#208](https://github.com/FraOri03/Lattice/issues/208)) ·
[#174](https://github.com/FraOri03/Lattice/issues/174)–[#188](https://github.com/FraOri03/Lattice/issues/188)
(25.1 page engine · 25.2 pages & masters · 25.3 frames · 25.4 typography · 25.5 flow ·
25.6 styles · 25.7 grids · 25.8 linked images · 25.9 live Trace/Forge · 25.10 tables ·
25.11 long documents · 25.12 prepress · 25.13 PDF/X · 25.14 collaboration ·
25.15 production)

**Phase 26 — Flux** ([#209](https://github.com/FraOri03/Lattice/issues/209)) ·
[#189](https://github.com/FraOri03/Lattice/issues/189)–[#204](https://github.com/FraOri03/Lattice/issues/204)
(26.1 media & time · 26.2 playback · 26.3 timeline · 26.4 tracks & clips · 26.5 editing ·
26.6 keyframes · 26.7 transform · 26.8 effects · 26.9 audio · 26.10 titles ·
26.11 Trace · 26.12 Forge · 26.13 assets/Folio · 26.14 proxies & cache · 26.15 encoding ·
26.16 production)

**Phase 27 — Entitlements & billing** ·
[#103](https://github.com/FraOri03/Lattice/issues/103)–[#106](https://github.com/FraOri03/Lattice/issues/106)
— unchanged in scope, renumbered from phase 22 when the suite was inserted ahead of it.

**Toolbar entry** · [#98](https://github.com/FraOri03/Lattice/issues/98) (20.2) — the
four-mode switcher and the switching contract.
