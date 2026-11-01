import { beds, score, stings, type SoundPack } from "./build";

// Cosmic horror in the 1920s: investigators, a cult, a library book that
// should not exist, and the sea. Gas lamps, foghorns, an asylum. The score
// is dissonant strings, theremin and a low choir: the universe noticing.

const PACK = "cosmic_horror";

const STYLE =
  "cosmic horror film score set in the 1920s, dissonant string orchestra, theremin, celesta, low wordless male choir, waterphone and bowed metal textures, instrumental, no vocals, no lyrics";

export const COSMIC_HORROR: SoundPack = {
  id: PACK,
  label: "1920s cosmic horror",
  scorePrefix: "cosmic",
  defaultBed: "fog_street",
  cues: [
    ...beds(PACK, {
      study: {
        label: "Study",
        blurb: "A fire, a mantel clock, pages turning by lamplight.",
        keywords: ["study", "office", "parlour", "parlor", "reading room", "professor"],
        prompt: "A 1920s scholar's study at night, a wood fire crackling, a mantel clock ticking, rain against the window, an occasional page turning",
      },
      asylum: {
        label: "Asylum",
        blurb: "Long tiled halls, radiators knocking, cries from far off.",
        keywords: ["asylum", "sanitarium", "hospital", "ward", "cell"],
        prompt: "A 1920s asylum corridor at night, old radiators knocking and hissing, distant muffled cries from other wards, a metal door far away, a cold tiled echo",
        gain: 0.4,
      },
      docks: {
        label: "Docks",
        blurb: "Water lapping at pilings, a foghorn, rope creaking.",
        keywords: ["docks", "harbour", "harbor", "wharf", "pier", "port", "waterfront"],
        prompt: "A foggy 1920s harbour at night, water lapping against wooden pilings, mooring ropes creaking, a distant foghorn, a buoy bell clanging",
      },
      fog_street: {
        label: "Foggy street",
        blurb: "Gas lamps hissing, cobbles, a motorcar somewhere.",
        keywords: ["street", "town", "city", "alley", "lane", "arkham", "outside"],
        prompt: "A foggy 1920s town street at night, gas lamps hissing, footsteps on wet cobblestones, a distant vintage motorcar engine, a dog barking far away",
      },
      museum: {
        label: "Museum",
        blurb: "Marble halls, a radiator ticking, the exhibits watching.",
        keywords: ["museum", "university", "gallery", "archive", "exhibit", "collection"],
        prompt: "A vast empty marble museum hall at night, an old steam radiator ticking and knocking, rain on a high glass roof, slow footsteps echoing far off, a low electrical hum",
      },
      steam_train: {
        label: "Train",
        blurb: "A carriage at night, wheels on the rails, the whistle.",
        keywords: ["train", "carriage", "railway", "rail", "sleeper", "compartment"],
        prompt: "Inside a 1920s steam train passenger carriage at night, steady rhythmic clack of wheels on rails, the carriage swaying and creaking, a distant whistle",
      },
      ritual_chamber: {
        label: "Ritual chamber",
        blurb: "Wet stone underground, a hum you feel in your teeth.",
        keywords: ["ritual", "chamber", "temple", "altar", "sanctum", "lodge", "cult"],
        prompt: "An underground stone ritual chamber, water dripping into pools, a deep subsonic hum that pulses slowly, a cold draught from below, alien and vast",
      },
    }),
    ...score(PACK, "cosmic", STYLE, {
      calm: {
        label: "Cosmic: the inquiry",
        blurb: "A pleasant enough case, so far.",
        prompt: "A slow gentle celesta melody over warm muted strings, a soft clarinet, a faint ghostly theremin far in the background, around 72 BPM, no drums. Scholarly calm with a hint of strangeness.",
      },
      relief: {
        label: "Cosmic: daylight",
        blurb: "They are out, and the sun is up.",
        prompt: "Warm rising string chords, a hopeful solo oboe melody, soft harp, around 70 BPM, no percussion. Fragile relief, the memory of something vast still behind it.",
      },
      uneasy: {
        label: "Cosmic: the clue",
        blurb: "The pieces fit, and they should not.",
        prompt: "A ticking clock pulse at 62 BPM, a slowly turning celesta figure in an unusual mode, a theremin gliding between notes, sul ponticello string tremolos, faint waterphone. Curiosity curdling into unease.",
      },
      dread: {
        label: "Cosmic: the abyss",
        blurb: "They have glimpsed the scale of it.",
        prompt: "A vast low male choir humming one dissonant cluster, deep sub-bass, a theremin wailing high above, bowed metal and waterphone shimmering, microtonal string glissandi, very slow. Incomprehensible cosmic dread.",
      },
      danger: {
        label: "Cosmic: the cult",
        blurb: "The cult knows, and they are coming.",
        prompt: "A relentless string ostinato at 94 BPM, low timpani pulses, the choir chanting a two-note figure, a theremin rising, brass swells building one layer at a time. Tightening menace.",
      },
      chase: {
        label: "Cosmic: flight",
        blurb: "Running from something that should not move like that.",
        prompt: "Frantic at 142 BPM, racing strings, pounding timpani and low drums, shrieking theremin, stabbing brass, dissonant clusters. Fleeing a monstrous pursuer through fog.",
      },
      fight: {
        label: "Cosmic: the thing",
        blurb: "Fighting what cannot be fought.",
        prompt: "Overwhelming at 118 BPM, massive dissonant brass blasts, thunderous percussion, a roaring chanting choir, frenzied strings and theremin. Mortal humans fighting something ancient.",
      },
      aftermath: {
        label: "Cosmic: what remains",
        blurb: "A mind lost, or a friend.",
        prompt: "A slow broken solo violin over a distant low choir and a soft drone, sparse celesta notes, long silences, around 50 BPM, no drums. Sanity and grief slipping away.",
      },
      finale: {
        label: "Cosmic: the rising",
        blurb: "The last act: the stars are right.",
        prompt: "The climax: an enormous chanting choir, a relentless orchestral ostinato at 126 BPM, colossal brass, thunderous percussion and a screaming theremin, dissonance building to an overwhelming cosmic peak. An ancient god awakening.",
      },
    }),
    ...stings(PACK, {
      gramophone_scratch: { label: "Gramophone", blurb: "A record starts by itself, scratching.", keywords: ["gramophone", "record", "phonograph"], prompt: "A 1920s gramophone needle dropping onto a record, crackle and a few warped notes before scratching to a stop", seconds: 5 },
      foghorn: { label: "Foghorn", blurb: "Across the water, long and low.", keywords: ["foghorn", "horn", "lighthouse"], prompt: "A deep mournful ship foghorn sounding once across foggy water", seconds: 6 },
      slither: { label: "Something slithers", blurb: "Wet, heavy and moving.", keywords: ["slither", "tentacle", "crawl"], prompt: "A large wet slimy mass slithering across a stone floor, squelching", seconds: 4 },
      eldritch_whisper: { label: "The voice", blurb: "Words in no human language.", keywords: ["whisper", "voice", "chant"], prompt: "A deep inhuman whispering voice speaking an alien language, reverberating as if inside the head", seconds: 4 },
      revolver_shot: { label: "Revolver", blurb: "A shot from an old revolver.", keywords: ["revolver", "gunshot", "pistol"], prompt: "A single shot from a vintage revolver in a stone room, loud with echo", seconds: 3 },
      old_telephone: { label: "Telephone rings", blurb: "An old bell telephone, at 3 a.m.", keywords: ["telephone", "phone", "call"], prompt: "A 1920s candlestick telephone ringing with a loud mechanical bell twice", seconds: 4 },
      gibbering: { label: "Gibbering", blurb: "Many mouths, none of them right.", keywords: ["gibber", "mouths", "babble"], prompt: "A chorus of wet inhuman gibbering and babbling from many mouths in the dark", seconds: 4 },
      theremin_swell: { label: "Theremin", blurb: "A note from nowhere, rising.", keywords: ["theremin", "tone", "otherworldly"], prompt: "A single eerie theremin note swelling up and wavering, otherworldly", seconds: 5 },
      cosmic_hit: { label: "The revelation", blurb: "The hit on a reveal.", keywords: ["reveal", "shock"], prompt: "A massive dissonant orchestral hit with choir and brass and a deep sub-bass boom, cosmic horror revelation", seconds: 5, gain: 0.6 },
    }),
  ],
  shared: ["library", "coast", "cave", "crypt", "sewer", "ship", "underwater", "ruins", "swamp", "graveyard", "rain", "storm", "wind", "night", "bell", "heartbeat", "scream", "thunder", "chain", "door_creak", "door_slam", "crow", "death", "turn", "splash", "thud"],
};
