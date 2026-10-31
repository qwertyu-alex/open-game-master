# Couch navigation

A couch night is played in one room. The players talk over where to go out
loud, so the map is shared knowledge, not a ballot: everyone can see where
the crew has been and which exits are open, and anyone says where the crew
goes in their action box ("We take the ladder up to the bridge"). The GM
moves the whole crew, or, when the players go different ways, splits it
(see Splitting up).

## The map

A deck plan in the couch's phosphor green, drawn from the GM's own
`move_party` and `update_location` records (`src/lib/couch/navigation*.ts`):

- **The trail**: the shortest recorded way from the first room the crew
  reached to the room it is in now, the current room last.
- **Side rooms**: rooms the crew visited off that trail, drawn beside the
  trail room they open from. A room with no recorded link sits beside the
  trail room the crew reached just before it.
- **Exits**: the known exits of the current room, dashed. The way back is
  the trail, so it is not listed again. A loop back to a visited room is
  drawn solid.

Only visited rooms and the current room's exits appear. An unvisited room's
own connections and description stay the GM's. It is a schematic, not a
geographic map: no compass, no distances.

## The deck plan

Each night gets the whole ship drawn once (`src/lib/couch/deck-plan*.ts`):
every room on a small grid and the corridors between them. A utility model
draws it in the background the first time a night with a story asks for
its map, from the scenario's setting and places and every room already
recorded (so a night already under way gets one built around where the crew
has been). It is kept in `couch_deck_plans`. Until it lands, or if the
planner fails twice, the map stands on the recorded rooms and their exits
alone. Whatever the GM records later joins the plan: a new room beside the
one it connects to, every recorded connection as a corridor. Nothing is
ever removed.

**The fog of war** is applied on the server, so a phone never receives what
it should not show:

- every room's outline and every corridor, from the start;
- a room's name once the crew has been in a room next to it;
- its inside and picture once they have been in it;
- a room the GM wrote down ahead of time that nothing leads to stays off the
  map until something does.

The walked way is lit, the scene's room marked, and each group's faces sit
on its room. The GM reads the whole plan (`DECK PLAN`): every room, every
corridor, and where the crew can go from here, and moves the crew only
along corridors, one room at a time.

**On the TV** the plan replaces the rail in the corner under the title: the
whole ship on the same feathered dark patch, nothing interactive. **On the
phone** the Map sheet shows the same plan (scrolling sideways when the ship
is wider than the phone, opening on the player's own room), a pictured room
is a button, and under it "From the cargo hold you can go to", each way
marked Been there or Not explored. A night with no room on record yet keeps
the rail and the list below.

## On the TV

The picture stays in front. The map is one faint rail under the title, on a
feathered dark patch rather than a panel: the newest five rooms of the
trail (older ones fold into "3 earlier"), up to two side rooms hanging
under each, and up to four exits forking off the current room. Nothing on it
is interactive.

## On the phone

A Map button the size of the tabs sits beside Story and You in the top bar.
It opens the whole plan as a bottom sheet over the story, top to bottom, with
a key (you are here, been there, not explored) and one line on how to move:
just say it.

The sheet is a native `<dialog>` opened with `showModal()`: the page behind it
is inert and focus stays inside. Done, a swipe down on the grabber, a tap
outside, Escape and the phone's own Back all close it, and focus returns to
the Map button. It respects the safe areas, scrolls on its own, opens on the
current room, and is painted rather than blurred, like the rest of the phone
(`couch-phone.css`). Reduced motion drops the slide.

## Pictures of the places

Every place the crew stands in is painted once, wide and empty, so the room
gets a feel of what it just walked into and can look at it again later
(`src/lib/couch/place-shots*.ts`).

- **The establishing shot.** While the place the crew is in has no picture
  of its own, that turn's picture is it: the shot planner is told
  `ESTABLISHING SHOT`, the frame is forced wide with nobody in it, and with
  no usable plan the place's own description frames it. Still one picture
  per turn. If a faster turn replaces it in the queue, the place still owes
  one, so the next picture there is the establishing shot.
- **Kept with the place** in `couch_place_shots` (one row per place, made on
  first use like the forge's tables), not on upstream's `locations` row.
- **Looked at for the GM.** Once it is painted, a model looks at the
  picture and describes what is in it, since the image model invents
  details the narration never had. The GM reads that as `WHAT THE CREW SAW`
  for the current place. A text route that cannot see pictures answers
  `NO PICTURE`, and the frame the picture was painted from stands in. The
  agent harness hands the picture over as a file to a program that takes
  pictures with its message (Codex).
- **Reused.** Every later picture in that place is painted with the shot as
  its `place` reference (three faces and the place), and the planner's
  `PLACE` line says what it looks like. An insert is not, since it shows
  one thing up close.
- **Repainted** when the GM calls `repaint_place` with what changed (a fire,
  a breach): the next picture there is a new establishing shot, painted
  from the old one, with the change in the planner's brief. The old
  picture stays on the map until the new one lands.
- **On the TV**, a new place's name comes up large over the picture for six
  seconds as the crew arrives (not on a reload). Back in a place with a
  picture, that picture goes straight back up while the turn's own paints.
- **On the phone**, each pictured place on the plan is a button with its
  picture as a thumbnail. It opens the picture in the sheet with the
  place's name and what is in it, and Previous and Next (or a sideways
  swipe) page through every pictured place in plan order. Back, or the
  phone's Back, returns to the plan.

## Splitting up

The crew can go its separate ways (`src/lib/couch/whereabouts*.ts`). Each
crew member stands in one place, and a **group** is everyone in the same
place. Nobody declares a split or a reunion: walking into the room another
group stands in is the reunion.

- **At most three groups.** With five players alone in five rooms, each
  would wait four GM turns for theirs.
- **One group is in the scene**: the one the story follows. Its place is
  upstream's current location, so the GM's GAME STATE, `update_location`,
  the sound, the establishing shots and `repaint_place` all follow the
  scene and needed no change.
- **The GM cuts.** `cut_to` (a group's characterIds or its place) turns the
  scene to another group, and the GM opens the narration with the cut
  ("Meanwhile, in the cargo hold…"). The GM picks the moment; the prompt
  says how many of its turns each group has been off scene, what its players
  sent meanwhile, and "Cut to them soon" once a group has waited two turns
  or sent a move. A fight holds the scene until it is over.
- **The turn follows the scene.** A question the GM puts to someone off
  scene (`request_player_input`) cuts the scene to their group, so the TV
  turns to whoever's turn it is; asking people in both places asks only the
  scene's. A cut withdraws a question still waiting on someone now off
  scene, which would otherwise hold the new scene's phones on "Waiting on
  Rafe". The TV lights up whoever's turn it is, a question's or the open
  floor's: face ringed and glowing, name lit, "· your turn".
- **Moves.** `move_party` with no names moves only the group in the scene
  (the whole crew while it is together). Naming some of them splits it; the
  scene follows those who went. Someone off scene can move only into the
  scene's place: they arrive in the scene, and in a fight there they roll
  initiative and take a place in the order.

What only the scene gets: the table wait waits on its players alone, and the
TV reads only their moves before the passage; a roll, a spotlight question
or a group check reaches only them; only they are fielded in a fight; and
only they can be in the turn's picture. A crew member with no place yet (a
late arrival, a takeover) stands where the scene is.

**Off scene, on the phone**, the line above the action box says "The story is
with Kara and Sam in Medbay" and "You're in the cargo hold. Send your next
move any time: the GM plays it when the story cuts back to you." The box
never locks for them: the move is posted for the room, neither takes the
floor nor wakes the GM, and comes back to the GM with the cut. There is no
Pass, since nobody waits on them.

**The story marks its groups.** Every passage and move written while the
crew is split carries a small tag with its place and "Your group" or who
was in it, and "Off scene" on a move from a group the story was not with
(`couch_scene_tags`). An off-scene move shows to everyone at once rather
than waiting for the round, since it answers no round.

**On the map**, every room someone stands in shows their faces. The TV's
rail follows the scene, with each group's faces inside its own room's box
(a group whose room has folded into "earlier" is named under the rail
instead); the crew strip dims anyone off scene and shows their
room where their role was; a cut brings "Meanwhile", the place and who it is
with up large. Each phone's plan marks its own group's room "You are here"
and the scene's "In the scene", opens on its own room, never folds away an
occupied side room, and lists the exits from its own room.

## Why no setting or extra control

The Map button is the only control; a place's picture opens from the place
itself. Without it a player could not check the
plan on their own phone without asking the room; nothing else could show
it, because the TV keeps only the rail. Moving stays in the action box the
players already use, so there is no destination picker, vote or tie-break.
Splitting up needs no control either: players say they go different ways,
the GM splits the crew and cuts between the groups.

## Rules the server keeps

- Who a `move_party` moves is checked before any location is written
  (`couchMove`): a fourth group is refused as the rules, a name that is not
  crew or someone off scene going anywhere but the scene is a mistake in the
  call. Where the crew goes is the players' to say and the GM's to judge.
- `cut_to` refuses while the crew is together, while a fight is on, and a
  group that is already the scene.
- A `request_roll` for someone off scene is refused (`ai-gate.ts`), a
  spotlight drops them, group checks default to the scene's group
  (`check-tools.ts`), and `fieldedSheets` fields only the scene's group.
- The actions route posts an off-scene move without the floor and without
  waking the GM; the table wait counts only the scene's seats and posts.
- The GM is told to move when the crew goes together, to let a disagreement
  play out in the fiction or let them split, and to settle a lone player's
  quick look as an action rather than a split.
- Every move and cut publishes the new map to the table
  (`couch_navigation`), and a reload reads the same map from the snapshot.
  So does a place's picture landing, and the look at it. Group tags travel
  as `couch_scene_tag` and in the snapshot's `couchSceneTags`.

## Nights played on a map

A written scenario with a site replaces all of the above with an overhead
map of the whole site, drawn as the crew sees it: see
[couch-overhead-spec.md](couch-overhead-spec.md).
