import type { SiteMap } from "@/lib/couch/site-map-logic";

// SPOILERS for Dead Air played on a map (src/lib/couch/scenarios/
// dead-air.ts, docs/couch-overhead-spec.md): Tern Relay Nine, three linked
// modules and an antenna mast, with the salvage tug Cormorant docked to its
// west airlock. Small on purpose: a forty-five-minute night crosses it in a
// few turns. The scenario's places are zones here by name ("The airlock"
// is the Airlock), and the Chorus moves where the cables run: the cable
// trunk under the station, with a vent into each room it wants.

export const DEAD_AIR_SITE: SiteMap = {
  id: "dead-air",
  name: "Tern Relay Nine",
  cols: 36,
  rows: 25,
  hull: [
    { x: 1, y: 10, w: 16, h: 7 },
    { x: 17, y: 4, w: 18, h: 20 },
    { x: 30, y: 0, w: 2, h: 4 },
  ],
  zones: [
    // The tug.
    { id: "cockpit", name: "Cormorant's Cockpit", kind: "room", rects: [{ x: 1, y: 11, w: 4, h: 5 }], look: "A cluttered tug cockpit, two worn seats, clamp controls under a hinged red cover, an intercom crackling.", exit: "Undocking: the clamp release under the red cover." },
    { id: "hold", name: "Cormorant's Hold", kind: "room", features: ["cluttered"], rects: [{ x: 5, y: 10, w: 6, h: 7 }], look: "The tug's cargo hold and engine bay in one, salvage strapped to the deck, the tug's own cable trunks open along the walls." },
    { id: "collar", name: "Docking Collar", kind: "corridor", rects: [{ x: 11, y: 12, w: 3, h: 3 }], look: "A ribbed flexible collar between tug and relay, frost creeping along its seams, the clamp groaning." },
    { id: "airlock", name: "Airlock", kind: "airlock", rects: [{ x: 14, y: 11, w: 3, h: 5 }], look: "A frosted circular airlock between tug and relay, red warning strobes, a dead technician standing at the inner window." },
    // The relay: the corridor through its three modules.
    { id: "main", name: "Main Corridor", kind: "corridor", features: ["dark"], rects: [{ x: 17, y: 11, w: 12, h: 5 }], look: "The relay's one corridor, emergency lamps every few metres, intercom grilles hissing in the dark." },
    // Hab module.
    { id: "quarters", name: "Crew Quarters", kind: "room", rects: [{ x: 17, y: 4, w: 6, h: 7 }], look: "Six bunks, lockers hanging open, a headset on every pillow." },
    { id: "galley", name: "Galley", kind: "room", rects: [{ x: 23, y: 4, w: 6, h: 7 }], look: "A narrow galley, coffee still warm on the hot plate, a tech slumped over the table with silver at his ears." },
    // Ops module.
    { id: "server", name: "Server Room", kind: "room", rects: [{ x: 17, y: 16, w: 6, h: 7 }], look: "Rows of humming server racks behind a barricaded door, green status lights, a fire axe scar on the frame." },
    { id: "comms", name: "Comms Room", kind: "room", rects: [{ x: 23, y: 16, w: 6, h: 7 }], look: "The broadcast desk, its microphone still live, a maintenance drone's ceiling rail running overhead." },
    // Power module and the mast.
    { id: "reactor", name: "Reactor Room", kind: "room", features: ["dark", "cluttered"], rects: [{ x: 29, y: 9, w: 6, h: 9 }], look: "A cramped black room around a small fusion cell, emergency lamps, cable trunks along every wall, an intercom grille." },
    { id: "mast-base", name: "Mast Base", kind: "room", rects: [{ x: 29, y: 4, w: 4, h: 5 }], look: "The foot of the antenna mast, cable bundles thick as arms climbing into the dark, a ladder in the middle." },
    { id: "mast", name: "Mast Crawlway", kind: "crawlway", features: ["cramped"], rects: [{ x: 30, y: 0, w: 2, h: 4 }], look: "A narrow ladder shaft up the antenna mast, cable bundles on every side, stars through a slit window.", exit: "Up the mast to the antenna dish." },
    // Where the Chorus runs.
    { id: "trunk", name: "Cable Trunk", kind: "crawlway", features: ["dark", "cramped"], rects: [{ x: 17, y: 23, w: 13, h: 1 }, { x: 29, y: 18, w: 1, h: 5 }], look: "The cable trunk under the floor, knee-high, every cable furred with fine silver threads that move when you breathe." },
  ],
  borders: [
    { a: "cockpit", b: "hold", kind: "door", at: { x: 5, y: 13.5 } },
    { a: "hold", b: "collar", kind: "hatch", at: { x: 11, y: 13.5 } },
    { a: "collar", b: "airlock", kind: "airlock", at: { x: 14, y: 13.5 } },
    { a: "airlock", b: "main", kind: "airlock", at: { x: 17, y: 13.5 }, span: 2 },
    { a: "main", b: "quarters", kind: "door", at: { x: 20, y: 11 } },
    { a: "main", b: "galley", kind: "door", at: { x: 26, y: 11 } },
    { a: "quarters", b: "galley", kind: "door", at: { x: 23, y: 7.5 } },
    { a: "main", b: "server", kind: "door", at: { x: 20, y: 16 }, state: "locked", key: "Marsh opening it, or Rory's cutting torch" },
    { a: "main", b: "comms", kind: "door", at: { x: 26, y: 16 } },
    { a: "server", b: "comms", kind: "door", at: { x: 23, y: 19.5 }, state: "locked", key: "Marsh opening it, or the cutting torch" },
    { a: "main", b: "reactor", kind: "door", at: { x: 29, y: 13.5 }, span: 2 },
    { a: "galley", b: "mast-base", kind: "door", at: { x: 29, y: 6.5 } },
    { a: "mast-base", b: "reactor", kind: "door", at: { x: 31, y: 9 } },
    { a: "mast-base", b: "mast", kind: "hatch", at: { x: 31, y: 4 } },
    { a: "trunk", b: "server", kind: "vent", at: { x: 19.5, y: 23 } },
    { a: "trunk", b: "comms", kind: "vent", at: { x: 26.5, y: 23 } },
    { a: "trunk", b: "reactor", kind: "vent", at: { x: 29.5, y: 18 } },
  ],
  props: [
    { kind: "console", x: 1.6, y: 12, w: 0.9, h: 3, label: "flight console" },
    { kind: "bench", x: 2.8, y: 12.3, w: 1, h: 0.9, label: "seat" },
    { kind: "bench", x: 2.8, y: 13.9, w: 1, h: 0.9, label: "seat" },
    { kind: "crate", x: 6, y: 11, w: 1.6, h: 1.4 },
    { kind: "crate", x: 8, y: 11, w: 1.4, h: 1.4 },
    { kind: "crate", x: 6, y: 14.6, w: 1.6, h: 1.4 },
    { kind: "tank", x: 8.6, y: 14.4, w: 1.6, h: 1.6, label: "drive" },
    { kind: "bed", x: 17.6, y: 4.6, w: 2, h: 0.9 },
    { kind: "bed", x: 17.6, y: 6.6, w: 2, h: 0.9 },
    { kind: "bed", x: 17.6, y: 8.6, w: 2, h: 0.9 },
    { kind: "locker", x: 21.6, y: 4.6, w: 0.8, h: 3 },
    { kind: "table", x: 24.6, y: 6.4, w: 3, h: 1.4, label: "galley table" },
    { kind: "bench", x: 23.6, y: 4.5, w: 3, h: 0.8, label: "counter" },
    { kind: "console", x: 17.6, y: 17.2, w: 0.8, h: 4.6, label: "racks" },
    { kind: "console", x: 19.4, y: 17.2, w: 0.8, h: 4.6, label: "racks" },
    { kind: "console", x: 21.2, y: 17.2, w: 0.8, h: 4.6, label: "racks" },
    { kind: "console", x: 24, y: 20.4, w: 4, h: 1.2, label: "broadcast desk" },
    { kind: "tank", x: 30.6, y: 12, w: 2.8, h: 2.8, label: "fusion cell" },
    { kind: "stairs", x: 30.3, y: 5, w: 1.4, h: 3.4, label: "ladder" },
  ],
  entities: [
    { id: "start", kind: "crew-start", name: "The crew", zone: "cockpit", note: "The Cormorant's clamp has just caught; the crew starts in the cockpit." },
    // Items.
    { id: "extinguisher", kind: "item", name: "CO2 extinguisher", zone: "reactor", note: "Freezing cold gas: it kills the threads where it lands. Three blasts." },
    { id: "batteries", kind: "item", name: "Spare power cells", zone: "galley", hidden: true, note: "Under the counter. Restarting the relay's power needs them in the reactor." },
    { id: "cutters", kind: "item", name: "Cable cutters", zone: "quarters", note: "A cut cable silences the Chorus on that run." },
    { id: "medkit", kind: "item", name: "Station medkit", zone: "quarters", hidden: true, note: "In a bunk locker." },
    // Clues.
    { id: "logs", kind: "clue", name: "Server logs", zone: "server", note: "The relay was built to catch something; six hours ago it caught it. Marsh's reports go to Director Pryce." },
    { id: "headset", kind: "clue", name: "Cracked headset", zone: "comms", note: "Still warm. The voice on it says the name of whoever picks it up." },
    // People.
    { id: "marsh", kind: "npc", name: "Odile Marsh", zone: "server", stance: "passive", note: "Barricaded in with a fire axe. Begs them through the door not to restore power. Aurex's handler and the Chorus's host." },
    { id: "benny", kind: "npc", name: "Benny Oyelaran", zone: "mast", stance: "passive", hidden: true, note: "Hiding up the mast with silver in his ear: only an Aurex tracker. Rory's nephew." },
    { id: "galley-body", kind: "body", name: "Slumped technician", zone: "galley", note: "Dead at the table, silver threads at his ears." },
    // Foes and the threat.
    { id: "tech", kind: "foe", name: "Threaded technician", foe: "zombie", zone: "main", stance: "passive", note: "The dead tech standing at the airlock's inner window, facing the crew. Moves in jerks once anyone opens the door." },
    { id: "drone", kind: "foe", name: "Hijacked maintenance drone", foe: "flying-sword", zone: "comms", stance: "active", act: 2, note: "Drops from the ceiling rail with a cutting arm, threads trailing from its housing." },
    { id: "swarm", kind: "foe", name: "Cable swarm", foe: "gray-ooze", zone: "trunk", stance: "active", act: 2, note: "Silver threads bursting out of a vent, wrapping limbs and burrowing for ears." },
    { id: "trooper", kind: "foe", name: "Aurex sterilisation trooper", foe: "hobgoblin", zone: "airlock", stance: "active", act: 3, note: "White armour, mirrored visor, stun baton and flamer, off the Halyard. Orders: no witnesses." },
    { id: "chorus", kind: "threat", name: "The Chorus", zone: "trunk", stance: "active", note: "In every cable. Never fought whole: cut, frozen or burned run by run. Speaks through every intercom; moves only where cables run (the trunk and its vents)." },
  ],
  // The tug can leave: the clamp lets go when the batteries die (act 1's
  // clock), or the crew blows it to break free (act 3).
  sections: [
    {
      id: "cormorant",
      name: "The Cormorant",
      zones: ["cockpit", "hold", "collar"],
      drift: { x: -6, y: 3, turn: -9 },
      note: "The crew's salvage tug, docked by its collar to the relay's airlock. adrift when the clamp releases or is blown (whoever is aboard goes with it); absent once it flies off.",
    },
  ],
};
