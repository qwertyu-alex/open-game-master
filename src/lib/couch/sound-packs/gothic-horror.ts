import { beds, score, stings, type SoundPack } from "./build";

// Gothic and supernatural horror: a haunted house, a cursed family, a
// possession. Old wood, candles, a clock that will not stop. The score is
// chamber strings, pipe organ, harpsichord and a music box, with a
// wordless choir when it goes wrong.

const PACK = "gothic_horror";

const STYLE =
  "gothic supernatural horror film score, chamber string orchestra with pipe organ, harpsichord, celesta and an antique music box, wordless choir textures, instrumental, no vocals, no lyrics";

export const GOTHIC_HORROR: SoundPack = {
  id: PACK,
  label: "Gothic horror",
  scorePrefix: "gothic",
  defaultBed: "manor_hall",
  sceneHint: "The house's halls and stairs are manor_hall; pick the room's own kind when it has one.",
  cues: [
    ...beds(PACK, {
      manor_hall: {
        label: "Manor hall",
        blurb: "A big old house: a grandfather clock, the timbers settling.",
        keywords: ["hall", "manor", "house", "mansion", "foyer", "landing", "stairs"],
        prompt: "Interior of a large old Victorian manor at night, slow grandfather clock ticking in a high hall, old floorboards and timbers settling and creaking, wind pressing faintly at the windows",
      },
      cellar: {
        label: "Cellar",
        blurb: "Damp stone under the house, a drip, something shifting.",
        keywords: ["cellar", "basement", "wine cellar", "vault", "under the house"],
        prompt: "Damp stone cellar beneath an old house, slow water drips, a faint low draught, dust shifting, an occasional distant creak from the house above",
      },
      attic: {
        label: "Attic",
        blurb: "Rafters, rain on the slates, things kept up here for a reason.",
        keywords: ["attic", "loft", "garret", "rafters", "roof space"],
        prompt: "Old house attic, rain pattering on slate roof tiles just overhead, rafters creaking in the wind, a loose shutter knocking softly now and then",
      },
      nursery: {
        label: "Nursery",
        blurb: "A child's room left as it was. Far too quiet.",
        keywords: ["nursery", "child's room", "playroom", "children"],
        prompt: "An abandoned Victorian nursery, near silence, a slow rocking chair creaking by itself, a faint wind through a gap in the window, a mantel clock ticking",
      },
      conservatory: {
        label: "Conservatory",
        blurb: "Glass and iron, rain on the panes, dead plants.",
        keywords: ["conservatory", "greenhouse", "orangery", "glasshouse"],
        prompt: "Victorian glass conservatory during steady rain, rain drumming on glass panes and iron frames, dripping leaves, a hollow resonance",
      },
      bedchamber: {
        label: "Bedchamber",
        blurb: "A fire burning low, heavy curtains, a clock on the mantel.",
        keywords: ["bedroom", "bedchamber", "chamber", "guest room", "boudoir"],
        prompt: "Old manor bedroom at night, a fire burning low and crackling in the grate, a mantel clock ticking, heavy curtains stirring in a draught",
      },
      ballroom: {
        label: "Ballroom",
        blurb: "A huge empty room that remembers a party.",
        keywords: ["ballroom", "great hall", "dining hall", "gallery", "drawing room"],
        prompt: "Vast empty abandoned ballroom, huge reverberant silence, a chandelier's crystals tinkling faintly in a draught, distant wind, dust",
      },
      servants_stair: {
        label: "Servants' passages",
        blurb: "Narrow back stairs and hidden corridors inside the walls.",
        keywords: ["servants", "back stairs", "passage", "corridor", "behind the walls", "hidden passage"],
        prompt: "Narrow wooden servants' passage inside the walls of an old house, close and muffled, boards creaking underfoot, a faint scratching somewhere inside the wall",
      },
      moor: {
        label: "Moor",
        blurb: "Open moorland at night, wind in the heather, nothing for miles.",
        keywords: ["moor", "heath", "grounds", "estate", "outside", "gardens"],
        prompt: "Bleak open moorland at night, cold wind sweeping through heather and grass, a distant dog barking once far away, desolate",
      },
    }),
    ...score(PACK, "gothic", STYLE, {
      calm: {
        label: "Gothic: the house at rest",
        blurb: "Nothing has happened yet. The house is only old.",
        prompt: "A slow melancholy solo piano waltz in a minor key, soft sustained strings beneath, a faint music box echoing the melody far away, around 70 BPM, no percussion. Elegant, sad, quietly uncanny.",
      },
      relief: {
        label: "Gothic: dawn",
        blurb: "Morning light, and they are still here.",
        prompt: "Warm string chords rising slowly, a gentle solo cello melody, soft harp arpeggios, a hint of hope that never fully brightens, around 66 BPM, no percussion. Weary relief at dawn after a terrible night.",
      },
      uneasy: {
        label: "Gothic: something is wrong",
        blurb: "A door that was shut is open.",
        prompt: "A plucked harpsichord figure repeating with a slightly wrong note, a ticking clock pulse, sul ponticello string tremolo whispering, a soft music box drifting out of tune, around 60 BPM. Unsettling, delicate, creeping.",
      },
      dread: {
        label: "Gothic: dread",
        blurb: "They know something is in the house with them.",
        prompt: "A deep sustained pipe organ pedal note, dissonant low string clusters slowly swelling, a breathy whispering choir texture, distant reversed piano notes, very slow. Suffocating supernatural dread, no melody.",
      },
      danger: {
        label: "Gothic: it is coming",
        blurb: "Footsteps on the stairs. Getting closer.",
        prompt: "A relentless string ostinato building at 92 BPM, an insistent harpsichord pulse, pounding low timpani entering one by one, the choir rising in pitch, organ swells. Tension tightening without release.",
      },
      chase: {
        label: "Gothic: run",
        blurb: "Running through the house, doors slamming behind.",
        prompt: "Frantic at 140 BPM, racing staccato strings, a wild harpsichord line, pounding timpani and low drums, shrieking violin glissandi, organ blasts. Headlong panic through dark corridors.",
      },
      fight: {
        label: "Gothic: confrontation",
        blurb: "Facing it, with whatever they have.",
        prompt: "Violent and massive at 120 BPM, a full choir chanting wordless syllables, thunderous pipe organ chords, pounding timpani and taiko, aggressive low strings and brass. Facing a demonic presence head on.",
      },
      aftermath: {
        label: "Gothic: mourning",
        blurb: "Someone did not make it.",
        prompt: "A slow funeral lament on solo violin over a soft organ chord, a distant music box playing a fragment of a lullaby, long reverberant silences, around 50 BPM, no drums. Grief in an empty house.",
      },
      finale: {
        label: "Gothic: the exorcism",
        blurb: "The last act's reckoning with what haunts the house.",
        prompt: "The climax: a colossal pipe organ playing a relentless descending progression, a huge choir in full voice, a frenzied string ostinato at 128 BPM, thunderous timpani and bells tolling, building to an overwhelming wall of sound. Apocalyptic, sacred, terrifying.",
      },
    }),
    ...stings(PACK, {
      piano_note: { label: "A piano note", blurb: "One low key, struck in an empty room.", keywords: ["piano"], prompt: "A single low piano note struck alone in a large empty room, ringing out with a long eerie reverberant decay", seconds: 5 },
      whispers: { label: "Whispers", blurb: "Words just too quiet to make out, right beside you.", keywords: ["whisper", "voices"], prompt: "Ghostly overlapping whispers very close to the ear, unintelligible, rising and then cut off", seconds: 4 },
      music_box: { label: "Music box", blurb: "A music box starts playing by itself.", keywords: ["music box", "lullaby"], prompt: "An old music box starting by itself, a few notes of a slow lullaby winding down and slowing out of tune", seconds: 6 },
      footsteps_above: { label: "Footsteps above", blurb: "Someone walking in the room overhead.", keywords: ["footsteps", "upstairs", "above"], prompt: "Slow heavy footsteps walking across wooden floorboards in the room directly above, then stopping", seconds: 5 },
      glass_shatter: { label: "Glass shatters", blurb: "A mirror or a window, all at once.", keywords: ["glass", "mirror", "window"], prompt: "A mirror shattering violently, glass shards falling and tinkling on a wooden floor", seconds: 3 },
      clock_strike: { label: "Clock strikes", blurb: "The grandfather clock strikes when it should not.", keywords: ["clock", "midnight", "chime"], prompt: "A grandfather clock striking three deep resonant chimes in an old hall", seconds: 6 },
      child_laugh: { label: "A child laughs", blurb: "Somewhere in the house, where no child is.", keywords: ["child", "laugh", "giggle"], prompt: "A faint distant child's giggle echoing down an empty old house corridor, eerie and brief", seconds: 3 },
      breath_close: { label: "Breath on the neck", blurb: "Something exhales, right behind you.", keywords: ["breath", "behind you"], prompt: "A slow cold rasping exhale very close behind the listener's ear", seconds: 3 },
      candles_out: { label: "Candles go out", blurb: "A gust from nowhere, then the dark.", keywords: ["candle", "lights out", "gust"], prompt: "A sudden gust of wind whooshing through a room and snuffing out candles, then silence", seconds: 3 },
      three_knocks: { label: "Three knocks", blurb: "From inside the wall.", keywords: ["knock", "knocking"], prompt: "Three slow heavy knocks on a thick wooden door, echoing in an old house", seconds: 3 },
      gothic_hit: { label: "Orchestral stab", blurb: "The shock chord on a reveal.", keywords: ["reveal", "shock", "jump scare"], prompt: "A violent horror movie orchestral stab, screeching strings and a slammed pipe organ chord with a huge low impact", seconds: 4, gain: 0.6 },
    }),
  ],
  shared: ["crypt", "graveyard", "library", "temple", "forest", "deep_forest", "rain", "storm", "wind", "night", "door_creak", "door_slam", "crow", "bell", "heartbeat", "scream", "chain", "thunder", "wolf_howl", "death", "turn", "thud"],
};
