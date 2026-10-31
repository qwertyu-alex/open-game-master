# The overhead night: a couch night played on a map

A second way to play a couch night. The TV shows the site from straight
above, like the rulebook's location maps: walls, doors, furniture, the
crew's faces and whatever they can see. The scenario's author placed
everything ahead of time: the rooms, the doors that are locked and what
opens them, the items, the people, the foes and the thing in the lift
shaft. The GM still writes and voices the night; the map keeps it honest
about where everyone is and what can be seen.

Everything in [couch-mode-spec.md](couch-mode-spec.md) still holds: one TV,
three to five phones, secret agendas, stress and panic, dice thrown from
the phone, fights, death, splitting up. This document covers only what
changes.

**Status: built.** Two nights play on a map: "The Haddon Distress Call"
(a mining outpost, 2 to 5 players) and "Dead Air" (a relay station and the
salvage tug docked to it, 2 to 4 players, about 45 minutes).

| Piece | File |
| --- | --- |
| The map format, checks, walls, line of sight, the fog, the TV's camera, stealth paths, the tracker, the GM's SITE MAP | `src/lib/couch/site-map-logic.ts` |
| The live map: its state, the players' view, the move checks, the five map tools | `src/lib/couch/site.ts` |
| The sites, and the nights written for them | `src/lib/couch/sites/` (`haddon-outpost.ts`, `dead-air.ts`), `src/lib/couch/scenarios/haddon-outpost.ts`, `dead-air.ts` |
| The drawing, the TV's camera and overview, the phone's map | `src/components/couch/CouchSiteMap.tsx`, `src/app/styles/couch-site.css` |
| Hooks into the night | `move_party` in `src/lib/dm/turn.ts`; the prompt in `src/lib/couch/navigation.ts`; the tools in `turn.ts`, `invoke-dispatch.ts`, `tool-profiles.ts`; the snapshot's `couchSite` and the `couch_site` event; `CouchTv.tsx`, `CouchNavigation.tsx`, `CouchPhoneView.tsx` |
| A preview page drawn by the real component | `node scripts/preview-site-map.mjs > docs/prototypes/haddon-outpost.html` |
| Tests | `scripts/test-couch-site.mjs` |

## Part 1: what a night looks like

The crew walks in through the north airlock. The TV is black except for
the airlock they stand in and their faces on it. The GM opens the inner
door (`set_border`) and the North Corridor draws itself, with a shut door
on either side.

Kara says "I open the door on the left." The Workshop appears: its
workbench, two tools on the floor, a vent at knee height. Rafe goes in;
Kara and Sam head down the corridor. Two lit groups now, the scene's
brighter.

Later Sam has the motion tracker. "I check the tracker." The GM rolls the
power supply and calls `track`: two red rings pulse on the TV, one out in
the black where nobody has been yet, and the TV beeps twice. Nobody on the
couch needs telling what to do next.

## How to start one

1. Run the night as usual (`npm run dev:lan`) and open `/couch` on the
   laptop that drives the TV, signed in.
2. Under "Tonight's story", pick a card whose first tag is **Played on a
   map** (The Haddon Distress Call, or Dead Air), and Start the night.
3. Players join from their phones with the QR code and take their crew
   cards as on any night. The TV shows the map from the first scene; each
   phone's Map button opens it.

To make another written night play on a map, write a site in
`src/lib/couch/sites/` (Part 3), add it to `SITES`, put `site: "<id>"` on
the scenario, make each of its locations a zone by name, and put "Played on
a map" first in its card's mood with `onMap: true`.
`scripts/test-couch-site.mjs` checks all of that for every such night.

## Part 2: which night is overhead

**A written scenario with a site plays overhead. Nothing else does.** No
setting, no toggle, no picker: the card on `/couch` carries "Played on a
map" as its first mood tag, and that is the whole choice. A night the
forge writes tonight keeps today's deck plan.

Why no control (AGENTS.md "Settings, options and toggles"): the map only
works when someone placed the rooms, doors and foes ahead of time, so it
belongs to the scenario, not to the room.

## Part 3: the map is code

A site is one TypeScript object (`SiteMap`), checked by `checkSiteMap`, and
drawn by one component. No image is involved at any point.

```ts
{ id: "workshop", name: "Workshop", kind: "room", features: ["cluttered"],
  rects: [{ x: 10, y: 5, w: 7, h: 7 }],
  look: "Machine shop, a workbench under a hoist, tools scattered..." }

{ a: "north-corridor", b: "workshop", kind: "door", at: { x: 17, y: 9 } }
{ a: "lower-landing", b: "lift", kind: "door", at: { x: 30, y: 44 }, span: 2,
  state: "locked", key: "the lift keycard on the body in hypersleep" }

{ id: "host-1", kind: "foe", name: "Feral Host", foe: "ghoul",
  zone: "sample-lab", stance: "passive", note: "..." }
```

- **The grid.** Tiles of about two metres. Haddon is 40 by 50.
- **Zones** are the rulebook's zones (p. 48): a room, a stretch of
  corridor, a crawlway, an airlock, ground outside. One or more rectangles
  each, so an L-shaped motor pool is two. A name, a kind, the rulebook's
  features (`dark`, `cluttered`, `cramped`), a `look` for the GM, and an
  `exit` when it leads off the map.
- **Borders** join two zones: `open` (no wall at all), `door`, `hatch`,
  `vent` or `airlock`, with a `state` (`open`, `closed`, `locked`, `sealed`,
  `broken`) and the `key` that opens a locked one.
- **Props** are the furniture, drawn in a few CSS strokes.
- **Entities** are what the scenario places: the crew's start, items,
  clues, bodies, people, foes and the threat. A foe names its `COUCH_FOES`
  slug and its `stance` (p. 51). Anything can be `hidden` until found or
  held back until an `act`.

The written scenario names its site (`site: "haddon-outpost"`) and its
locations are the site's zones by name, so the rest of the night (pictures,
sound, whereabouts) sees the same places.

**Why rectangles and borders.** They are what a person or a model can write
and a check can verify: `checkSiteMap` names zones that overlap or run off
the map, a door that is not on the wall its two zones share, a border to a
zone that does not exist, and any room the crew cannot reach from the
start. Walls are never written: `wallRuns` works them out as every tile
edge between two zones, or a zone and solid wall, except across an open
border.

**Why HTML.** Every floor, wall, door, prop and token is a `<div>` placed in
tile units. One transform fits it to any TV; a zone on the phone is a real
`<button>`; every token is named for a screen reader; tokens slide and the
camera glides by CSS transition; a ping is a CSS ring.

## Part 4: the rules the map keeps

From the rulebook's chapter 4, cut to what a room of phones needs.

- **Line of sight.** A zone sees itself and every zone across an open
  border or an open door; a closed door blocks the view.
- **Stealth turns.** `move_party` takes a zone's name. Each group walks at
  most two zones per call, through open or closed doors; a third zone, or a
  locked or sealed door, is refused with the reason and the zone it can
  reach. The crew crawls a vent only when sent into or out of a crawlway,
  so a walk to the next room is never quietly routed through the ducts.
  The first move of the night is to the crew's start.
- **The GM moves foes, as in the rulebook.** After the crew moves,
  `move_foe` moves a foe or person up to two zones (the threat three), vents
  included, or takes them off the map ("gone"). It can turn a passive foe
  active. The answer says whether the crew can see it and, if it walked
  into the crew, to play the detection and start the fight.
- **Fights** run exactly as today (spec 2.11). The fight takes the TV's
  stage back for the creature; the map returns when it ends.
- **The motion tracker.** Whoever holds it says they check it; the GM rolls
  the power supply and calls `track`. Every active foe, person or the threat
  within four zones pings, in rooms nobody has seen too; passive (still)
  things do not. The pings stay until the crew next moves.
- **Finds.** `reveal` puts a hidden thing on every screen; `take_item`
  takes an item or clue off the map.

The GM reads all of it as `SITE MAP` from the night's first turn: the
rules above, the scene's zone and its look, its ways out with their states
and keys, what is in sight, every entity with its stance, act and notes,
and every zone's ways out.

## Part 5: what each screen shows

### The fog, applied on the server

`siteView(map, state, "players")` is the only thing a screen receives, so a
phone never holds what it should not show:

| | Players |
| --- | --- |
| A zone, its walls, doors and furniture | once someone has seen into it; it stays drawn |
| Zones never seen | not sent at all: black |
| People, foes | only while someone can see their zone |
| Items, clues, bodies | while seen, and left where they were seen |
| Hidden things | once revealed |
| A later act's entities | not until that act |
| Pings | until the crew next moves |
| Active or passive | never |

### On the TV

The stage is split. The map takes the left 60%, above the crew strip; the
turn's painted picture fills a full-height column on the right, with the
subtitles over its foot and "Waiting on" over its top. Until a night has a
picture, the map takes the whole stage. A fight takes the whole stage back
for the creature, and the map returns when it ends.

While everything found fits the map's panel at a readable size (26px a
tile), the panel shows all of it. Past that the camera frames the scene's
zone and what can be seen from it, and a small map of everything found sits
in the panel's corner with the camera's frame on it. The camera glides
between frames. The scene's zone is brightest, zones in sight are lit,
zones left behind are dim. Crew tokens are their portraits. The tracker's
pings beep twice.

### On the phone

The Map button opens the same view at a tile a thumb wide, scrolled to the
player's own token. Every found zone is a button: tapping one closes the
sheet and puts "I go to the Workshop." in the action box; nothing is sent
until the player sends it. Under the map: their zone and its features, its
ways out ("Door to North Corridor", "Vent to somewhere dark", locked or
closed), and what lies there.

Why the tap (the one new control): naming a room you have only seen across
the couch is awkward, and spelling it on a phone keyboard worse. It fills
the box the player already uses, so moving still goes through the GM, with
no vote and no destination picker.

## Part 6: decided

- **Tokens are portraits** (the crew's own); foes, people and items are
  shapes.
- **The picture every turn stays**, unchanged, as the corner inset.
- **The night starts black** and draws zones as they are seen; a big map
  is handled by the camera and the overview.
- **The GM moves foes** (`move_foe`), as the rulebook does.

## Part 7: next

- A cover picture for the Haddon card (`scripts/paint-scenario-covers.mjs`);
  until then the card shows its plain backdrop.
- Forged sites: the forge drafts a `SiteMap` for a story written tonight,
  and `checkSiteMap` refuses it and asks again on any problem.
- A light source on the map: a flashlight or flare lifting `dark` from a
  zone, shown on the floor.
