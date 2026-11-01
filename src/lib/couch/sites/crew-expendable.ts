import type { SiteMap } from "@/lib/couch/site-map-logic";

// SPOILERS for Crew Expendable played on a map (src/lib/couch/scenarios/
// crew-expendable.ts, docs/couch-overhead-spec.md): the crew's own ice
// hauler, the Corbett, docked by a flexible umbilical to the derelict
// Erebus. Two small ships on purpose: an hour's night crosses them in a few
// turns, and act 3 brings the threat home to the Corbett, so the crew is
// hunted through rooms it already knows. Each ship has its own ducts and
// they never join: what crosses between them crosses the umbilical, where
// it can be seen, and where a cut umbilical stops it.

export const CREW_EXPENDABLE_SITE: SiteMap = {
  id: "crew-expendable",
  name: "The Corbett and the Erebus",
  cols: 40,
  rows: 23,
  hull: [
    { x: 1, y: 4, w: 14, h: 18 },
    { x: 15, y: 11, w: 2, h: 4 },
    { x: 17, y: 12, w: 4, h: 2 },
    { x: 21, y: 11, w: 3, h: 4 },
    { x: 24, y: 4, w: 15, h: 19 },
  ],
  zones: [
    // The Corbett: home, and in act 3 the hunting ground.
    { id: "interface", name: "Interface Room", kind: "room", rects: [{ x: 1, y: 5, w: 4, h: 4 }], look: "A white padded cell of blinking lights off the bridge, one green terminal scrolling amber text: the ship's computer, Mother." },
    { id: "corbett-bridge", name: "Corbett's Bridge", kind: "room", rects: [{ x: 1, y: 9, w: 4, h: 8 }], look: "A cramped cockpit of green screens and toggle switches, frost on the canopy, the derelict turning slowly beyond it." },
    { id: "corbett-corridor", name: "Corbett Corridor", kind: "corridor", rects: [{ x: 5, y: 11, w: 9, h: 4 }], look: "The hauler's one corridor, ribbed white panels, steam venting from a joint, warning stripes at every hatch." },
    { id: "corbett-mess", name: "Corbett's Mess", kind: "room", rects: [{ x: 5, y: 5, w: 5, h: 6 }], look: "A low galley with one long table, a coffee machine, playing cards and dirty plates: the warmest room aboard." },
    { id: "hypersleep", name: "Hypersleep Vault", kind: "room", rects: [{ x: 10, y: 5, w: 4, h: 6 }], look: "Four white sleep pods in a ring, lids up, still fogged from the crew waking." },
    { id: "medbay", name: "Corbett's Medbay", kind: "room", rects: [{ x: 5, y: 15, w: 5, h: 6 }], look: "One autodoc bed under a surgical arm, a lockable glass door, a scanner that sees through bone." },
    { id: "engine-room", name: "Engine Room", kind: "room", features: ["cluttered"], rects: [{ x: 10, y: 15, w: 4, h: 6 }], look: "Hot, loud and red-lit, pipes everywhere, a cold locker for perishables bolted to one wall." },
    { id: "corbett-airlock", name: "Corbett Airlock", kind: "airlock", rects: [{ x: 14, y: 11, w: 3, h: 4 }], look: "A narrow airlock with a big red outer-door lever under a hinged cover and a window onto the umbilical." },
    { id: "corbett-ducts", name: "Corbett Ducts", kind: "crawlway", features: ["dark", "cramped"], rects: [{ x: 5, y: 4, w: 9, h: 1 }, { x: 14, y: 5, w: 1, h: 6 }, { x: 14, y: 15, w: 1, h: 6 }, { x: 5, y: 21, w: 9, h: 1 }], look: "Air ducts a body can just crawl, ladders at the bends, condensation dripping, every sound coming from every direction." },
    // Between the ships.
    { id: "umbilical", name: "Umbilical", kind: "corridor", features: ["cramped"], rects: [{ x: 17, y: 12, w: 4, h: 2 }], look: "A ribbed flexible tube between the ships, groaning and twisting as the derelict tumbles, stars through its seams.", exit: "Cut loose, the ships drift apart." },
    // The Erebus: dark, cold, four years dead.
    { id: "erebus-airlock", name: "Erebus Airlock", kind: "airlock", rects: [{ x: 21, y: 11, w: 3, h: 4 }], look: "The derelict's airlock, its inner door frosted over and bulged outward, as if something pushed from inside." },
    { id: "erebus-corridor", name: "Erebus Corridor", kind: "corridor", features: ["dark"], rects: [{ x: 24, y: 11, w: 11, h: 4 }], look: "A long black corridor, frost on every surface, emergency lamps blinking amber, a smear of something dried along one wall." },
    { id: "erebus-bridge", name: "Erebus Bridge", kind: "room", rects: [{ x: 35, y: 9, w: 4, h: 8 }], look: "A dark bridge lit only by blinking consoles, the captain still strapped into his chair, slumped, the flight recorder winking red." },
    { id: "cryo-bay", name: "Cryo Bay", kind: "room", rects: [{ x: 24, y: 5, w: 6, h: 6 }], look: "Twelve hypersleep pods under frost, all open and empty but one, its lid fogged from the inside." },
    { id: "lab", name: "Specimen Lab", kind: "room", rects: [{ x: 30, y: 5, w: 5, h: 6 }], look: "Steel benches and empty glass specimen tanks, one cracked; on the wall, X-rays of a man's chest with a shadow inside it." },
    { id: "cargo-hold", name: "Cargo Hold", kind: "room", features: ["dark"], rects: [{ x: 24, y: 15, w: 7, h: 8 }], look: "A vast black hold under a knee-deep layer of cold blue mist, rows of leathery eggs, a crewman cocooned on the far wall." },
    { id: "erebus-engineering", name: "Erebus Engineering", kind: "room", features: ["dark", "cluttered"], rects: [{ x: 31, y: 15, w: 4, h: 6 }], look: "A dead reactor room, frost on the pipes, tool lockers torn open, a scorch mark where someone made a stand." },
    { id: "erebus-ducts", name: "Erebus Ducts", kind: "crawlway", features: ["dark", "cramped"], rects: [{ x: 24, y: 4, w: 11, h: 1 }, { x: 35, y: 5, w: 1, h: 4 }, { x: 31, y: 21, w: 4, h: 1 }], look: "Frozen ducts behind the derelict's walls, the frost scraped off in long tracks." },
  ],
  borders: [
    // The Corbett.
    { a: "interface", b: "corbett-bridge", kind: "door", at: { x: 2.5, y: 9 } },
    { a: "corbett-bridge", b: "corbett-corridor", kind: "door", at: { x: 5, y: 13 }, span: 2 },
    { a: "corbett-corridor", b: "corbett-mess", kind: "door", at: { x: 7.5, y: 11 } },
    { a: "corbett-corridor", b: "hypersleep", kind: "door", at: { x: 12, y: 11 } },
    { a: "corbett-corridor", b: "medbay", kind: "door", at: { x: 7.5, y: 15 } },
    { a: "corbett-corridor", b: "engine-room", kind: "door", at: { x: 12, y: 15 } },
    { a: "corbett-mess", b: "hypersleep", kind: "door", at: { x: 10, y: 7.5 } },
    { a: "corbett-corridor", b: "corbett-airlock", kind: "airlock", at: { x: 14, y: 13 }, span: 2 },
    { a: "corbett-airlock", b: "umbilical", kind: "airlock", at: { x: 17, y: 13 }, span: 2 },
    // The derelict: its outer door frozen shut, its hold sealed by the last
    // man alive.
    { a: "umbilical", b: "erebus-airlock", kind: "airlock", at: { x: 21, y: 13 }, span: 2, state: "locked", key: "the cutting torch from the Corbett's Engine Room" },
    { a: "erebus-airlock", b: "erebus-corridor", kind: "airlock", at: { x: 24, y: 13 }, span: 2 },
    { a: "erebus-corridor", b: "cryo-bay", kind: "door", at: { x: 27, y: 11 } },
    { a: "erebus-corridor", b: "lab", kind: "door", at: { x: 32.5, y: 11 } },
    { a: "cryo-bay", b: "lab", kind: "door", at: { x: 30, y: 8 } },
    { a: "erebus-corridor", b: "erebus-bridge", kind: "door", at: { x: 35, y: 13 }, span: 2 },
    { a: "erebus-corridor", b: "cargo-hold", kind: "door", at: { x: 27.5, y: 15 }, span: 2, state: "locked", key: "the hold code on the Erebus Bridge console, or the cutting torch" },
    { a: "erebus-corridor", b: "erebus-engineering", kind: "door", at: { x: 33, y: 15 } },
    { a: "cargo-hold", b: "erebus-engineering", kind: "door", at: { x: 31, y: 18 } },
    // Vents: a grille at knee height into the ducts.
    { a: "corbett-ducts", b: "corbett-mess", kind: "vent", at: { x: 7.5, y: 5 } },
    { a: "corbett-ducts", b: "hypersleep", kind: "vent", at: { x: 14, y: 7.5 } },
    { a: "corbett-ducts", b: "engine-room", kind: "vent", at: { x: 14, y: 17.5 } },
    { a: "corbett-ducts", b: "medbay", kind: "vent", at: { x: 7.5, y: 21 } },
    { a: "erebus-ducts", b: "cryo-bay", kind: "vent", at: { x: 26.5, y: 5 } },
    { a: "erebus-ducts", b: "lab", kind: "vent", at: { x: 32.5, y: 5 } },
    { a: "erebus-ducts", b: "erebus-bridge", kind: "vent", at: { x: 35.5, y: 9 } },
    { a: "erebus-ducts", b: "erebus-engineering", kind: "vent", at: { x: 32.5, y: 21 } },
    { a: "erebus-ducts", b: "cargo-hold", kind: "vent", at: { x: 31, y: 21.5 } },
  ],
  props: [
    { kind: "console", x: 1.5, y: 5.5, w: 3, h: 0.8, label: "Mother" },
    { kind: "console", x: 1.4, y: 10, w: 0.8, h: 6, label: "flight console" },
    { kind: "bench", x: 2.6, y: 11.2, w: 1, h: 0.9, label: "seat" },
    { kind: "bench", x: 2.6, y: 13.9, w: 1, h: 0.9, label: "seat" },
    { kind: "table", x: 5.8, y: 6.6, w: 1.6, h: 3.4, label: "mess table" },
    { kind: "bench", x: 8.2, y: 5.4, w: 1.4, h: 0.8, label: "coffee" },
    { kind: "pod", x: 10.4, y: 5.6, w: 0.9, h: 2 },
    { kind: "pod", x: 12.6, y: 5.6, w: 0.9, h: 2 },
    { kind: "pod", x: 10.4, y: 8.4, w: 0.9, h: 2 },
    { kind: "pod", x: 12.6, y: 8.4, w: 0.9, h: 2 },
    { kind: "bed", x: 6.4, y: 16.4, w: 1.2, h: 2.4, label: "autodoc" },
    { kind: "locker", x: 8.6, y: 15.4, w: 1, h: 0.8 },
    { kind: "tank", x: 10.6, y: 16, w: 2.6, h: 2.2, label: "drive" },
    { kind: "locker", x: 10.4, y: 19.6, w: 2, h: 0.9, label: "cold locker" },
    { kind: "pod", x: 24.5, y: 5.6, w: 0.9, h: 2 },
    { kind: "pod", x: 26, y: 5.6, w: 0.9, h: 2 },
    { kind: "pod", x: 27.5, y: 5.6, w: 0.9, h: 2 },
    { kind: "pod", x: 24.5, y: 8.4, w: 0.9, h: 2 },
    { kind: "pod", x: 26, y: 8.4, w: 0.9, h: 2 },
    { kind: "pod", x: 27.5, y: 8.4, w: 0.9, h: 2, label: "sealed pod" },
    { kind: "bench", x: 30.6, y: 6, w: 3.6, h: 0.9, label: "bench" },
    { kind: "tank", x: 31, y: 8.2, w: 1.2, h: 1.2 },
    { kind: "tank", x: 32.8, y: 8.2, w: 1.2, h: 1.2 },
    { kind: "console", x: 37.6, y: 9.6, w: 0.8, h: 6.8, label: "consoles" },
    { kind: "bench", x: 36, y: 12.3, w: 1, h: 1, label: "captain's chair" },
    { kind: "tank", x: 25, y: 16, w: 0.8, h: 0.8 },
    { kind: "tank", x: 26.4, y: 16, w: 0.8, h: 0.8 },
    { kind: "tank", x: 27.8, y: 16, w: 0.8, h: 0.8 },
    { kind: "tank", x: 25, y: 18, w: 0.8, h: 0.8 },
    { kind: "tank", x: 26.4, y: 18, w: 0.8, h: 0.8 },
    { kind: "tank", x: 27.8, y: 18, w: 0.8, h: 0.8 },
    { kind: "tank", x: 25, y: 20, w: 0.8, h: 0.8 },
    { kind: "tank", x: 26.4, y: 20, w: 0.8, h: 0.8 },
    { kind: "tank", x: 27.8, y: 20, w: 0.8, h: 0.8 },
    { kind: "crate", x: 29.4, y: 20.6, w: 1.2, h: 1.2 },
    { kind: "tank", x: 31.6, y: 15.8, w: 2.6, h: 2.6, label: "reactor" },
    { kind: "locker", x: 31.4, y: 19.4, w: 3, h: 0.8 },
  ],
  entities: [
    { id: "start", kind: "crew-start", name: "The crew", zone: "corbett-bridge", note: "Woken forty days early by Mother; the crew starts on the Corbett's bridge with the derelict outside the canopy." },
    // Items.
    { id: "torch", kind: "item", name: "Cutting torch", zone: "engine-room", note: "Cuts the Erebus's frozen airlock open in a turn, welds a door or a vent shut in one, and the creature backs away from its flame." },
    { id: "tracker", kind: "item", name: "Motion tracker", zone: "corbett-bridge", note: "Pings large moving things within four zones, once a stealth turn, on a power roll. It does not say whether it is above you." },
    { id: "medkit", kind: "item", name: "Medkit", zone: "medbay", note: "The Corbett's only one." },
    { id: "case", kind: "item", name: "Specimen case", zone: "lab", note: "A sealed cold case built to carry one living specimen. Exactly what the synthetic needs." },
    { id: "incinerator", kind: "item", name: "Incinerator unit", zone: "erebus-engineering", hidden: true, act: 2, note: "In a torn-open locker behind the reactor, half a tank left: four bursts of fire. The one weapon the grown thing fears." },
    { id: "boltgun", kind: "item", name: "Bolt gun", zone: "cargo-hold", hidden: true, note: "Hollis's, once it is down. Six bolts." },
    // Clues.
    { id: "order", kind: "clue", name: "Course change order", zone: "interface", note: "Mother's log: the Corbett's course was changed toward the Erebus three weeks before its beacon came on. Asking Mother why answers only: priority one, Special Order, clearance required." },
    { id: "recorder", kind: "clue", name: "Flight recorder", zone: "erebus-bridge", note: "Four years of log: forty eggs loaded on an unregistered moon, one hatched in transit, the crew dying one by one, and the hold code. The last entry is Hollis lighting the beacon when the Corbett appeared on its scope." },
    { id: "xrays", kind: "clue", name: "Chest X-rays", zone: "lab", note: "Whitlock's own chest, taken the day he froze himself: a curled shadow under the breastbone." },
    // People.
    { id: "mother", kind: "npc", name: "Mother", zone: "interface", stance: "passive", note: "The Corbett's computer. Polite, literal, never lies outright: it refuses. Carries Special Order 939 and, in act 3, will not undock or vent on command." },
    { id: "whitlock", kind: "npc", name: "Dr. Owen Whitlock", zone: "cryo-bay", stance: "passive", note: "The last man alive, frozen in the sealed pod. Thaw him and the embryo in his chest wakes too: it bursts out in act 2, aboard the Corbett if they took him there." },
    { id: "captain", kind: "body", name: "The Erebus's captain", zone: "erebus-bridge", note: "Strapped into his chair four years, his ribs opened outward from inside." },
    { id: "cocoon", kind: "body", name: "Cocooned crewman", zone: "cargo-hold", note: "Glued to the far wall in resin, still alive, begging to be killed." },
    // Foes and the threat.
    { id: "hollis", kind: "foe", name: "Hollis", foe: "skeleton", zone: "cargo-hold", stance: "passive", note: "The Erebus's synthetic, half its face peeled to white wire. Polite until anyone touches an egg, then the bolt gun." },
    { id: "hugger", kind: "foe", name: "Facehugger", foe: "stirge", zone: "cargo-hold", stance: "passive", note: "In the egg nearest the door, which opens like a flower when someone leans close." },
    { id: "hugger-2", kind: "foe", name: "Facehugger from the vents", foe: "stirge", zone: "erebus-ducts", stance: "active", act: 2, note: "The one that hatched as the crew passed. Drops out of any Erebus vent near breathing." },
    { id: "burster", kind: "foe", name: "Chestburster", foe: "giant-centipede", zone: "corbett-mess", stance: "passive", hidden: true, act: 2, note: "Tears out of Whitlock wherever he is, at the Mess if they fed him, then bolts for the nearest vent. Move it with him." },
    { id: "commando", kind: "foe", name: "Company commando", foe: "hobgoblin", zone: "erebus-airlock", stance: "active", act: 3, note: "From the Company ship docking at the Erebus's far side. Comes across the umbilical with a flamer and a specimen cage. No human witnesses." },
    { id: "creature", kind: "threat", name: "The creature", zone: "corbett-ducts", stance: "active", act: 3, note: "The chestburster grown in an hour: two metres, black, eyeless, acid blood. Never fought: burned back, sealed in, or blown out the airlock. Moves three zones a turn through ducts and corridors alike." },
  ],
  // The derelict can tear loose: the tumble rips the umbilical in act 2,
  // or the crew cuts it to leave whatever is aboard behind.
  sections: [
    {
      id: "erebus",
      name: "The Erebus",
      zones: ["erebus-airlock", "erebus-corridor", "erebus-bridge", "cryo-bay", "lab", "cargo-hold", "erebus-engineering", "erebus-ducts"],
      drift: { x: 6, y: 2, turn: 8 },
      note: "The derelict, joined to the Corbett's umbilical at its airlock. adrift when the umbilical is cut or torn loose (whoever is aboard is stranded); absent once it has tumbled out of sight.",
    },
  ],
};
