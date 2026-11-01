import { beds, score, stings, type SoundPack } from "./build";

// Folk horror and the small town: a village with a festival, a cult in the
// woods, a harvest that wants something back. The score is droning folk
// instruments over vintage analog synths.

const PACK = "folk_horror";

const STYLE =
  "folk horror film score, droning hurdy-gurdy, fiddle, recorder and bowed psaltery over vintage 1980s analog synthesizers, frame drums, instrumental, no vocals, no lyrics";

export const FOLK_HORROR: SoundPack = {
  id: PACK,
  label: "Folk horror",
  scorePrefix: "folk",
  defaultBed: "village_green",
  cues: [
    ...beds(PACK, {
      village_green: {
        label: "Village green",
        blurb: "Birdsong, sheep far off, a church bell over the fields.",
        keywords: ["village", "green", "square", "hamlet", "town", "high street"],
        prompt: "A quiet English village green on a summer afternoon, birdsong, sheep bleating far off across fields, a distant church bell, a light breeze in the trees",
      },
      woods_night: {
        label: "Woods at night",
        blurb: "Owls, branches, and something stepping carefully.",
        keywords: ["woods", "wood", "forest at night", "trees", "clearing", "path"],
        prompt: "Dense woodland at night, an owl calling, branches creaking in the wind, leaves rustling, an occasional twig snapping somewhere in the dark",
      },
      cornfield: {
        label: "Fields",
        blurb: "Wind moving through tall crops, crows.",
        keywords: ["field", "fields", "corn", "wheat", "crops", "harvest", "farmland"],
        prompt: "A vast field of tall dry wheat in the wind, a dry rustling sea of stalks, crows cawing in the distance, insects humming",
      },
      farmhouse: {
        label: "Farmhouse",
        blurb: "A kitchen clock, a kettle, an old dog sleeping.",
        keywords: ["farmhouse", "cottage", "kitchen", "inn", "pub", "home"],
        prompt: "Inside an old farmhouse kitchen, a wall clock ticking, a kettle simmering on a stove, a wood fire crackling, wind outside the windows",
      },
      barn: {
        label: "Barn",
        blurb: "Animals shifting in the dark, old timber, straw.",
        keywords: ["barn", "stable", "byre", "shed", "hayloft"],
        prompt: "Inside an old wooden barn at night, animals shifting restlessly in their stalls, straw rustling, old timbers creaking, wind whistling through gaps in the boards",
      },
      festival_night: {
        label: "The festival",
        blurb: "A bonfire, a crowd, laughter that goes on too long.",
        keywords: ["festival", "bonfire", "celebration", "feast", "procession", "may day"],
        prompt: "A village festival around a huge bonfire at night, crackling roaring flames, a crowd murmuring and laughing at a distance",
      },
      stone_circle: {
        label: "Standing stones",
        blurb: "A ring of old stones on a hill, the wind humming through them.",
        keywords: ["stones", "stone circle", "altar", "hill", "barrow", "ritual site"],
        prompt: "An ancient stone circle on an open hilltop, cold wind moaning and humming between the standing stones, grass hissing, a deep low drone",
      },
      still_lake: {
        label: "Lake",
        blurb: "Still water, reeds, a loon calling somewhere.",
        keywords: ["lake", "pond", "mere", "tarn", "shore", "water"],
        prompt: "A still lake at dusk, gentle water lapping on reeds, a loon calling across the water, frogs, a faint breeze",
      },
    }),
    ...score(PACK, "folk", STYLE, {
      calm: {
        label: "Folk: summer",
        blurb: "A lovely village. Everyone is so welcoming.",
        prompt: "A gentle pastoral folk melody on recorder and fiddle over a soft warm analog synth pad, light plucked psaltery, around 80 BPM, no drums. Idyllic and sunlit, but very slightly too sweet.",
      },
      relief: {
        label: "Folk: away",
        blurb: "They have got clear of the village. For now.",
        prompt: "Open warm analog synth chords, a rising fiddle melody, a soft frame drum heartbeat, around 84 BPM. Exhausted relief on an open road, still looking back.",
      },
      uneasy: {
        label: "Folk: the customs",
        blurb: "The villagers know something they are not saying.",
        prompt: "A droning hurdy-gurdy holding one note, a recorder playing a simple modal tune slightly out of tune, a slow analog synth arpeggio underneath, around 66 BPM. Quaint and deeply wrong.",
      },
      dread: {
        label: "Folk: the old ways",
        blurb: "They have seen what the festival is for.",
        prompt: "A deep bowed drone, dissonant scraping fiddle harmonics, a low modular synth pulse like a slow heartbeat, a distant frame drum, very slow and oppressive. Ancient pagan dread, no melody.",
      },
      danger: {
        label: "Folk: the procession",
        blurb: "The procession is coming down the lane.",
        prompt: "A relentless processional frame drum rhythm at 96 BPM, a droning hurdy-gurdy, a repeating fiddle ostinato, analog synth bass pulses building, layers entering one by one. Ritual inevitability.",
      },
      chase: {
        label: "Folk: the hunt",
        blurb: "Running through the fields with the village behind them.",
        prompt: "Frantic at 145 BPM, a wild driving fiddle reel turned sinister, pounding frame drums and toms, a racing analog synth sequence, shrieking recorder. Being hunted through the woods.",
      },
      fight: {
        label: "Folk: the rite",
        blurb: "Fighting for their lives at the bonfire.",
        prompt: "Savage at 124 BPM, thunderous tribal drums, a roaring distorted hurdy-gurdy, aggressive fiddle ostinato, heavy analog synth bass and low drones. Primal pagan violence.",
      },
      aftermath: {
        label: "Folk: harvest",
        blurb: "The price was paid.",
        prompt: "A slow lonely lament on solo fiddle over a soft analog synth drone, a sparse plucked psaltery, long silences, around 54 BPM, no drums. Mourning in the empty fields.",
      },
      finale: {
        label: "Folk: the wicker",
        blurb: "The last act: the festival's true climax.",
        prompt: "The climax: a massive ritual drum ensemble at 128 BPM, droning hurdy-gurdies and fiddles in frenzied unison, roaring analog synths, building and building to an ecstatic terrifying peak. A pagan sacrifice reaching its height.",
      },
    }),
    ...stings(PACK, {
      procession_drum: { label: "Drums", blurb: "A slow drum from the woods.", keywords: ["drum", "drums", "procession"], prompt: "A slow heavy ritual frame drum beating three times in an open landscape, echoing", seconds: 5 },
      chant: { label: "Chanting", blurb: "Many voices, together, in the distance.", keywords: ["chant", "chanting", "singing"], prompt: "A crowd of distant voices chanting in unison in the night, a slow pagan chant swelling then fading", seconds: 6 },
      animal_scream: { label: "Animal scream", blurb: "A goat, or something like one.", keywords: ["goat", "animal", "bleat"], prompt: "A goat screaming loudly in the dark, a shrill human-like scream", seconds: 2 },
      branch_snap: { label: "Branch snaps", blurb: "Someone stepped on it. Close.", keywords: ["twig", "branch", "snap"], prompt: "A dry branch snapping under a foot in a quiet forest at night, close by", seconds: 2 },
      distant_laughter: { label: "Laughter", blurb: "The village, laughing at something.", keywords: ["laugh", "laughter"], prompt: "A group of villagers laughing together in the distance at night, warm and unsettling", seconds: 4 },
      bonfire_roar: { label: "Bonfire catches", blurb: "The fire goes up all at once.", keywords: ["fire", "bonfire", "flames"], prompt: "A huge bonfire igniting with a whoosh and roaring up into large crackling flames", seconds: 4 },
      flute_wail: { label: "A pipe plays", blurb: "One note on a pipe, somewhere out there.", keywords: ["flute", "pipe", "whistle"], prompt: "A single long eerie wooden flute note wavering across an empty field at dusk", seconds: 5 },
      bells_jangle: { label: "Morris bells", blurb: "Little bells, jingling as someone dances.", keywords: ["bells", "dance", "jingle"], prompt: "Small leg bells jangling in a rhythmic dance step, approaching on a gravel path", seconds: 4 },
      folk_hit: { label: "Ritual hit", blurb: "The drum hit on a reveal.", keywords: ["reveal", "shock"], prompt: "A huge cinematic hit of a massive ritual drum and a shrieking bowed string, with a deep low boom", seconds: 4, gain: 0.6 },
    }),
  ],
  shared: ["forest", "deep_forest", "swamp", "river", "night", "rain", "storm", "wind", "temple", "graveyard", "crow", "bell", "wolf_howl", "horn", "heartbeat", "scream", "death", "turn", "splash", "thud", "door_creak", "door_slam"],
};
