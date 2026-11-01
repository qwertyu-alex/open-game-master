import { beds, score, stings, type SoundPack } from "./build";

// Zombie and post-apocalyptic survival: a dead city, a mall barricaded
// for the night, a horde somewhere out there. The score is sparse guitar
// and cello over distorted drones, and drums when it comes.

const PACK = "survival_horror";

const STYLE =
  "post-apocalyptic survival horror film score, sparse reverbed electric and acoustic guitar, bowed cello, distorted analog synth drones, pounding industrial percussion, instrumental, no vocals, no lyrics";

export const SURVIVAL_HORROR: SoundPack = {
  id: PACK,
  label: "Zombie survival",
  scorePrefix: "survival",
  defaultBed: "ruined_city",
  cues: [
    ...beds(PACK, {
      ruined_city: {
        label: "Dead city",
        blurb: "No traffic. Wind, loose paper, a far alarm still running.",
        keywords: ["city", "street", "town", "downtown", "ruins", "outside"],
        prompt: "An abandoned dead city street, total absence of traffic, wind blowing debris and paper along the road, a distant car alarm still sounding faintly, crows",
      },
      dead_mall: {
        label: "Dead mall",
        blurb: "A huge empty mall, rain on the skylights.",
        keywords: ["mall", "shop", "store", "supermarket", "shopping centre", "shopping center"],
        prompt: "Inside an abandoned shopping mall, a vast empty echo, rain on the glass skylights, a loose sign creaking, water dripping into puddles",
      },
      highway: {
        label: "Highway",
        blurb: "Abandoned cars, wind, an open road nobody drives.",
        keywords: ["highway", "road", "motorway", "bridge", "traffic jam", "interstate"],
        prompt: "An abandoned highway full of stalled cars, steady wind across the open road, a car door creaking in the breeze, distant crows",
      },
      bunker: {
        label: "Shelter",
        blurb: "A safe room: a generator, a radio hissing, people breathing.",
        keywords: ["bunker", "shelter", "safe room", "basement", "hideout", "barricade"],
        prompt: "Inside a barricaded shelter, a small generator chugging, a radio hissing with static, a fluorescent lamp buzzing, people shifting quietly",
      },
      dead_hospital: {
        label: "Dead hospital",
        blurb: "Dark wards, a monitor still beeping on battery.",
        keywords: ["hospital", "clinic", "ward", "pharmacy", "medical"],
        prompt: "An abandoned dark hospital ward, a single monitor beeping slowly on battery somewhere, dripping, a gurney wheel squeaking in a draught, distant shuffling",
      },
      horde_distant: {
        label: "The horde",
        blurb: "Far off, many of them, moaning.",
        keywords: ["horde", "herd", "swarm", "infected", "zombies"],
        prompt: "A huge horde of zombies far in the distance, a low continuous mass of moaning and groaning carried on the wind, shuffling feet, eerie",
      },
    }),
    ...score(PACK, "survival", STYLE, {
      calm: {
        label: "Survival: a quiet day",
        blurb: "Nothing has come for a while.",
        prompt: "A slow sparse acoustic guitar picking pattern with lots of reverb, a soft cello drone, distant ambient synth wash, around 70 BPM, no drums. Lonely, tender, an empty world.",
      },
      relief: {
        label: "Survival: safe for tonight",
        blurb: "The barricade held.",
        prompt: "Warm reverbed electric guitar chords, a hopeful cello melody, a soft swelling pad, around 76 BPM, light brushed drum. Tired relief among survivors.",
      },
      uneasy: {
        label: "Survival: too quiet",
        blurb: "Nothing is moving out there, and that is wrong.",
        prompt: "A single muted electric guitar note pulsing at 64 BPM, a low distorted synth drone, scraped cello harmonics, faint metallic textures. Waiting for something to move.",
      },
      dread: {
        label: "Survival: they are inside",
        blurb: "The noise was from inside the building.",
        prompt: "A deep distorted drone, a slow rising cello cluster, heartbeat-like kick drum pulses, reversed guitar swells, very slow and suffocating. No melody.",
      },
      danger: {
        label: "Survival: they are coming",
        blurb: "The horde has heard them.",
        prompt: "A driving distorted guitar ostinato at 100 BPM, pounding industrial drums entering one by one, a pulsing synth bass, rising cello, tension building without release.",
      },
      chase: {
        label: "Survival: run",
        blurb: "Running, with them right behind.",
        prompt: "Breakneck at 155 BPM, pounding industrial and tribal drums, a frantic tremolo-picked distorted guitar, a racing synth bass, screeching strings. Running for your life.",
      },
      fight: {
        label: "Survival: hold the line",
        blurb: "Fighting them off at the barricade.",
        prompt: "Brutal at 128 BPM, heavy industrial percussion and distorted drums, a crushing low guitar riff, aggressive cello ostinato, huge sub-bass impacts. Desperate close combat.",
      },
      aftermath: {
        label: "Survival: who we lost",
        blurb: "Someone was bitten.",
        prompt: "A slow mournful solo cello over a soft reverbed acoustic guitar and a distant drone, long silences, around 54 BPM, no drums. Grief in a dead world.",
      },
      finale: {
        label: "Survival: the last stand",
        blurb: "The last act: everything comes through the walls.",
        prompt: "The climax: a massive wall of distorted guitars and cello in a relentless ostinato at 130 BPM, thunderous industrial drums, roaring synths, building to an overwhelming desperate peak. A last stand against the horde.",
      },
    }),
    ...stings(PACK, {
      zombie_groan: { label: "Groan", blurb: "One of them, close.", keywords: ["groan", "zombie", "moan"], prompt: "A single wet guttural zombie groan very close by", seconds: 3 },
      runner_shriek: { label: "Shriek", blurb: "A fast one has seen them.", keywords: ["shriek", "runner", "scream"], prompt: "A fast infected zombie letting out a ragged furious shriek before charging", seconds: 3 },
      shotgun: { label: "Shotgun", blurb: "A blast, and the pump.", keywords: ["shotgun", "blast"], prompt: "A pump shotgun firing one deafening blast followed by the pump racking", seconds: 3 },
      car_alarm: { label: "Car alarm", blurb: "Someone set it off. Everything heard it.", keywords: ["car alarm", "alarm"], prompt: "A car alarm suddenly going off loudly on an empty street, whooping siren pattern", seconds: 5 },
      glass_crunch: { label: "Glass underfoot", blurb: "Broken glass, crunching. Too loud.", keywords: ["glass", "footstep", "crunch"], prompt: "A footstep crunching on broken glass in a silent room", seconds: 2 },
      barricade_bang: { label: "Pounding", blurb: "Hands on the barricade, many of them.", keywords: ["pounding", "barricade", "banging"], prompt: "Many fists pounding and scratching on a boarded-up wooden door, the boards straining", seconds: 5 },
      survival_hit: { label: "Impact", blurb: "The hit on a reveal.", keywords: ["reveal", "shock"], prompt: "A huge cinematic horror impact, a distorted guitar slam and a deep sub-bass boom", seconds: 4, gain: 0.6 },
    }),
  ],
  shared: ["camp", "forest", "deep_forest", "plains", "sewer", "river", "rain", "storm", "wind", "night", "crow", "wolf_howl", "heartbeat", "scream", "thud", "death", "turn", "splash", "farmhouse", "barn", "cornfield", "parking_garage", "subway", "rooftop", "helicopter", "gunshot", "siren_pass", "door_kick", "comms_static", "flatline"],
};
