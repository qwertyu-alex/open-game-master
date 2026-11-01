# The overhead night: every couch night is played on a map

How a couch night is played. The TV shows the site from straight
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

**Status: built, and the only way a night is played.** Three written nights,
each on its own site: "The Haddon Distress Call" (a mining outpost, 2 to 5
players), "Dead Air" (a relay station and the salvage tug docked to it, 2
to 4 players, about 45 minutes) and "Crew Expendable" (an ice hauler and
the derelict it docks with, 3 or 4 players, about an hour). The seven
written nights that had no site, the AI-written night from a seed and the
deck plan that served both were removed when the map became the default;
their files are in git history before that change.

| Piece | File |
| --- | --- |
| The map format, checks, walls, line of sight, the fog, the TV's camera, stealth paths, the tracker, the GM's SITE MAP | `src/lib/couch/site-map-logic.ts` |
| The live map: its state, the players' view, the move checks, the six map tools | `src/lib/couch/site.ts` |
| The sites, and the nights written for them | `src/lib/couch/sites/` (`haddon-outpost.ts`, `dead-air.ts`, `crew-expendable.ts`), the same names in `src/lib/couch/scenarios/` |
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
2. Under "Tonight's story", pick one of the stories, and Start the night.
3. Players join from their phones with the QR code and take their crew
   cards as on any night. The TV shows the map from the first scene; each
   phone's Map button opens it.

To add a night, write its story in `src/lib/couch/scenarios/` with a card
in `scenario-cards.ts`, write its site in `src/lib/couch/sites/` (Part 3),
add it to `SITES`, put `site: "<id>"` on the scenario (it is required), and
make each of its locations a zone by name. `scripts/test-couch-site.mjs`
checks all of that for every night.

## Part 2: which night is overhead

**Every night.** There is no setting, toggle or picker: `/couch` offers
only written stories, and every written story has a site.

Why no control (AGENTS.md "Settings, options and toggles"): the map only
works when someone placed the rooms, doors and foes ahead of time, so it
belongs to the scenario, not to the room. A story without a site is not
offered until its site is written.

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
- **Reveals.** Nothing in a room shows until the GM's narration shows it:
  `reveal` puts a person, foe, item, clue or body on every screen, a hidden
  one only once the crew finds it; `take_item` takes an item or clue off
  the map.
- **What the crew knows of is marked.** A person, item, clue or body the
  crew has seen is known where they saw it, and stays on the map. When the
  crew learns where someone or something is without seeing it (Marsh over
  comms: "I'm barricaded in the server room"), the GM calls `mark_on_map`
  with its name: it is marked where it really is, its zone drawn as a bare
  named outline until someone sees into it. A landmark the site does not
  place ("Clamp release", "Barricade") is marked by a short name and its
  zone, at most sixteen, and taken off with `where: "gone"`. Foes and the
  threat are never marked: not knowing where it is is the horror.

### The map changes under the crew

A site is written once, but a night breaks it. Five things the GM can do to
the map, each on every screen at once with a red alarm ring where it
happened and a klaxon on the TV (both last until the crew next moves):

| What happens in the story | The GM calls | What the map does |
| --- | --- | --- |
| A fire breaks out | `set_zone` fire | It spreads into every zone open to it (open borders, open or broken doors, holes) each stealth turn, filling them with smoke; a shut door holds it, vacuum puts it out. The `move_party` answer says what spread. |
| Smoke, gas, a blizzard inside | `set_zone` smoke | Nobody sees into the zone, and from inside nobody sees out. |
| A hull breach, an airlock blown | `set_zone` vacuum | Every zone open to it vents at once, and again whenever a door to it is opened; a shut door holds the air. The answer names the crew caught in it. |
| An explosion, a collapse | `set_zone` wrecked, and fire next door | Nobody walks into or through it (a walk goes round); walking out is allowed. |
| The power fails; a flare is lit | `set_zone` dark / lit | Adds or lifts the rulebook's `dark` feature. |
| Something bursts through a wall | `set_border` broken between two zones with no way through | A hole on the wall they share: a way through, and the rooms see each other. |
| Mother locks the deck down | `set_border` with `to: "all"` | Every door, hatch and airlock of the zone at once. |
| A ship undocks, a clamp lets go, a dropship lifts off | `set_section` adrift / absent | Its zones, walls, furniture and tokens glide away and turn as one piece; the border to it is drawn cut (severed) and nobody crosses. Crew aboard go with it and still walk it. Absent, it is not sent at all. |
| A ship arrives and docks | `set_section` docked | It slides in, joined as written. |

`state: off` lifts a condition (the fire is out, the rubble cleared); a zone
open to vacuum vents again until its door is shut. Sections are written
with the site (`SiteMap.sections`: the zones, a drift vector and turn, a
note for the GM): the Cormorant on Dead Air, the Erebus on Crew
Expendable. `set_section` is offered only on a site that has one. Hazards
show on every zone drawn, even out of sight (the ship's alarms tell
everyone), and in the phone's ways out ("Door to Mess Hall · VACUUM").

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
| A zone next to one someone has stood in | a bare named outline (no walls, doors or furniture) until seen: the crew read the signs on the doors they passed |
| Other zones never seen | not sent at all: black |
| Anything on the map (people, foes, items, clues, bodies) | not until the GM reveals it as the narration shows it, so the map never shows what the story has not said; a foe that walks into sight (`move_foe`) is revealed by it, unless hidden |
| Foes, the threat | once revealed, only while someone can see their zone |
| People | once revealed, while seen; out of sight, a dashed "last seen" token where the crew last knew them, until they see that zone without them |
| Anything marked (`mark_on_map`) | in its zone, which is drawn as a bare named outline (no walls, doors or furniture) until seen |
| Items, clues, bodies | once revealed, while seen, and left where they were seen |
| Hidden things | once revealed, which the GM does only when the crew finds them |
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
zones left behind are dim. Crew tokens are their portraits. Every other
token shows what it is at a glance: a picture the night already has of it
(a person's portrait, a foe's picture from a fight, an item's icon or the
picture painted for it on someone's sheet; nothing is painted for the
map), or else its kind's drawn icon in its kind's shape: a person's head on
a blue disc, a skull on a red diamond, the threat's eye, a crate, a page, a
body laid out, a landmark's flag on an amber pin. Its name sits beside it
(a person last seen elsewhere with a "?"), never over another name, a
token or a zone's title: each name tries the spots around its token,
nearest first, and one that has to stand further off gets a thin line in
its kind's colour back to the token (`tagPlaces`). The tracker's
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

- **Tokens are portraits** (the crew's own); foes, people and items wear
  a picture the night has of them, or their kind's icon.
- **The picture every turn stays**, unchanged, as the corner inset.
- **The night starts black** and draws zones as they are seen; a big map
  is handled by the camera and the overview.
- **The GM moves foes** (`move_foe`), as the rulebook does.

## Part 7: next

- Sites for the nights that were set aside (Kessler's Moon, The Good
  Shepherd, Sixty Fathoms, Hollow Night, All Souls Station, Midwinter at
  Rime Station, Unto Us), restored from git history with a site each.
- Stories written tonight again, with a forged site: the forge drafts the
  zones and how they join, code lays out the rectangles, and
  `checkSiteMap` refuses it and asks again on any problem.
- A light source drawn on the floor (`set_zone lit` already lifts `dark`).
- Ships that arrive mid-night need zones written for them: the Aurex
  Halyard docking to Dead Air's relay in act 3 is the obvious first.
- Moving zones: a lift car between decks, an APC crossing the exterior.
