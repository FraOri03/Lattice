# Photo mode — set & lighting planner

A **top-down photographic set planner**, last in the top navigation (**… · Code ·
Photo**). Plan a shoot on a metric canvas: place cameras, lights, people and props
from a categorised library, arrange them against backdrops, and read the resulting
**2D light simulation** (cones, falloff and shadows recomputed from each fixture's
type, power, spread and position).

## What it adds

A scene is a list of *shots*; each shot holds elements with position, rotation and
per-type parameters, edited through the inspector and the timeline (shot list). The
shot list is a **sequence**: shots can be reordered from the timeline, and their
numbers are positional, so they always read 1..n in the order shown. Elements are
drawn with the **Photoicons** top-down artwork.

An **AI set designer** can propose a setup from a prompt — it is **BYOK** (bring your
own key) and degrades to offline templates when no key is present, so the mode is
fully usable without any network call. Scenes import/export as JSON.

Since Phase 21.0 it runs on the shared AI provider seam rather than on its own
private path: `design-set` is an action in the catalogue, the vendor call and the
templates are two providers, and `src/lib/photo/ai.ts` is the adapter between them
and Photo mode's vocabulary. The key is still the user's, still stored per account,
and still sent only to Google. What the move bought — and what it cost the seam — is
in [architecture/ai.md](architecture/ai.md).

Phase 21.3 finished the job in the other direction. The panel now shows the
disclosure **before** the button — what leaves, where it goes, whose bill it is —
asks for consent once per recipient and remembers it, and renders the same key field
the top-bar AI panel does rather than a second copy of it. The run goes through the
shared jobs store, so a generation started here stays visible, cancellable and costed
from the AI panel after you have left Photo mode, and its completion raises a
notification. The panel is also EN/IT throughout, which it was not before.

## Board integration

A `photo` **card type** puts a live preview of one shot on the board;
double-clicking it opens Photo mode. Each card either **pins** a shot (picked in the
inspector, stored as `shotId` on the card) or **follows** whichever shot Photo mode
has open. Pinning is what lets one board show several setups side by side — every
unpinned card mirrors the editor, so they all show the same thing and change
together as you click through the shot list. A card whose pinned shot is deleted
says so and offers to follow the active shot again, rather than quietly drawing a
different set.

## State & collaboration

Photo scenes live in a **separate store** (`src/store/photoStore.ts`) persisted to
`localStorage` and keyed per project. They are deliberately *outside* the Yjs
document, so Photo mode adds nothing to the CRDT payload and the `local`, `drive`
and `realtime` (Yjs + Liveblocks) modes behave exactly as before. Board photo cards
sync like any other card, and card creation is gated by the existing permission
model (the canvas toolbar is hidden when read-only).

## Known limitations

- The scene itself is **local-only**: it is not synced through Drive or Liveblocks
  and is not part of the vault export, so collaborators opening a shared board see
  the photo card but render their own local scene. Use scene JSON export/import to
  hand a set over.
- Lighting is a **2D approximation** for planning, not a physically accurate render.
- The AI designer requires a user-supplied key for its non-heuristic path, and an
  explicit consent grant for the vendor before anything is sent. Declining leaves the
  offline templates working.
