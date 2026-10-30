# Couch navigation

A couch night is played in one room. The players talk over where to go out
loud, so the map is shared knowledge, not a ballot: everyone can see where
the crew has been and which exits are open, and anyone says where the crew
goes in their action box ("We take the ladder up to the bridge"). The GM
moves the whole crew.

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

## Why no setting or extra control

The Map button is the only control. Without it a player could not check the
plan on their own phone without asking the room; nothing else could show
it, because the TV keeps only the rail. Moving stays in the action box the
players already use, so there is no destination picker, vote or tie-break.

## Rules the server keeps

- The crew never splits: a `move_party` that names some characters is
  refused before any location is written. Where the crew goes is the
  players' to say and the GM's to judge.
- The GM is told to move when the crew goes together (they agree, or
  whoever spoke points one way and nobody objects), to let a disagreement
  play out in the fiction first, and to resolve a lone player's detour as a
  quick action before everyone leaves, or say why it cannot happen.
- Every move publishes the new map to the table (`couch_navigation`), and a
  reload reads the same map from the snapshot.
