import { beds, score, stings, type SoundPack } from "./build";

// The paranoid thriller: a conspiracy, a heist gone wrong, one of the crew
// working for the other side. City at night, fluorescent offices, a car
// park nobody should be in. The score is pulsing synths and taut strings
// over a ticking clock.

const PACK = "thriller";

const STYLE =
  "modern espionage thriller film score, pulsing analog synthesizers and electronic beats with taut string ostinatos, ticking percussion, felt piano, deep sub-bass, instrumental, no vocals, no lyrics";

export const THRILLER: SoundPack = {
  id: PACK,
  label: "Paranoid thriller",
  scorePrefix: "thriller",
  defaultBed: "city_night",
  cues: [
    ...beds(PACK, {
      city_night: {
        label: "City at night",
        blurb: "Traffic hiss, a far siren, the city awake at 3 a.m.",
        keywords: ["city", "street", "downtown", "alley", "outside", "night"],
        prompt: "A big city street at 3 a.m., distant traffic hiss on wet roads, a far-off siren fading, an air conditioner unit humming, footsteps passing",
      },
      office_late: {
        label: "Office after hours",
        blurb: "Empty open-plan floor, fluorescent hum, a printer waking up.",
        keywords: ["office", "corporate", "cubicle", "boardroom", "headquarters", "bank"],
        prompt: "An empty corporate office floor late at night, fluorescent light hum, air conditioning, a distant printer whirring briefly, elevator machinery far off",
      },
      server_room: {
        label: "Server room",
        blurb: "Racks of fans roaring, cold air, blinking lights.",
        keywords: ["server", "data center", "data centre", "it room", "control room"],
        prompt: "A cold data center server room, a steady roar of cooling fans, hard drive clicking, high electrical whine, air conditioning",
      },
      parking_garage: {
        label: "Car park",
        blurb: "Concrete, a buzzing light, footsteps that echo too long.",
        keywords: ["parking", "garage", "car park", "basement level", "underground"],
        prompt: "An empty underground concrete parking garage at night, a fluorescent tube buzzing and flickering, distant dripping, a far-off car engine echoing, cavernous reverb",
      },
      safehouse: {
        label: "Safehouse",
        blurb: "A rented flat: fridge hum, rain on the window, the city outside.",
        keywords: ["safehouse", "apartment", "flat", "motel", "hideout", "hotel room"],
        prompt: "A small apartment at night, refrigerator humming, rain on the window, muffled traffic outside, radiator ticking",
      },
      subway: {
        label: "Subway",
        blurb: "Tunnels, a distant train, wind pushed down the platform.",
        keywords: ["subway", "metro", "underground", "station", "platform", "tunnel"],
        prompt: "An empty subway platform late at night, a distant train rumbling in the tunnels, wind pushed along the platform, electrical hum, dripping",
      },
      rooftop: {
        label: "Rooftop",
        blurb: "High up: wind, vents, the city far below.",
        keywords: ["roof", "rooftop", "helipad", "ledge", "skyscraper"],
        prompt: "A skyscraper rooftop at night, strong steady wind, large ventilation units humming, the city's traffic a faint wash far below",
      },
      hotel_corridor: {
        label: "Hotel corridor",
        blurb: "Thick carpet, an ice machine, muffled TVs behind doors.",
        keywords: ["hotel", "corridor", "hallway", "casino", "lobby"],
        prompt: "A long quiet hotel corridor at night, carpeted hush, an ice machine humming and dropping ice, a muffled television behind a door, air conditioning",
      },
      interrogation: {
        label: "Interrogation room",
        blurb: "A small bare room, a light buzzing overhead.",
        keywords: ["interrogation", "cell", "precinct", "police", "holding", "bunker"],
        prompt: "A small bare interrogation room, a single overhead light buzzing, ventilation hum, a wall clock ticking loudly, a chair creaking",
      },
    }),
    ...score(PACK, "thriller", STYLE, {
      calm: {
        label: "Thriller: cover",
        blurb: "Blending in. Nothing is wrong, officially.",
        prompt: "A cool minimal synth pulse at 80 BPM, a soft felt piano motif of four notes, airy pads, light brushed electronic percussion. Calm on the surface, watchful underneath.",
      },
      relief: {
        label: "Thriller: clean",
        blurb: "They got out clean. For now.",
        prompt: "Warm analog synth chords opening up, a hopeful repeating piano figure, soft strings swelling, a gentle electronic beat at 90 BPM. Release and exhausted relief.",
      },
      uneasy: {
        label: "Thriller: being watched",
        blurb: "Someone has been in the flat. Someone is following.",
        prompt: "A ticking clock at 70 BPM, a low pulsing synth bass, a nervous two-note string ostinato, glitchy electronic textures, a single piano note repeated. Paranoid, surveilled, nothing resolves.",
      },
      dread: {
        label: "Thriller: the setup",
        blurb: "They have realised it was a trap all along.",
        prompt: "A deep sub-bass drone, a slowly rising Shepard tone in synths and strings, distorted heartbeat-like kicks, cold metallic textures, very slow. The floor dropping away.",
      },
      danger: {
        label: "Thriller: the clock",
        blurb: "Minutes left. Every second counts.",
        prompt: "A relentless sixteenth-note synth arpeggio at 110 BPM locked to a ticking clock, driving string ostinato, layered electronic and orchestral drums entering one by one, rising tension, no release.",
      },
      chase: {
        label: "Thriller: pursuit",
        blurb: "On foot or by car, they are right behind.",
        prompt: "Breakneck at 150 BPM, a pounding electronic breakbeat with orchestral percussion, aggressive staccato strings, a distorted synth bass riff, brass hits. A desperate chase through city streets.",
      },
      fight: {
        label: "Thriller: firefight",
        blurb: "Guns out, nowhere to go.",
        prompt: "Hard-hitting at 128 BPM, heavy industrial percussion and taiko, a growling distorted synth bass ostinato, stabbing strings and huge low brass hits. Brutal close-quarters violence.",
      },
      aftermath: {
        label: "Thriller: burned",
        blurb: "Someone is dead, or someone was the mole.",
        prompt: "A slow lonely felt piano melody over a cold synth pad, distant cello, sparse electronic pulses, long silences, around 60 BPM, no drums. Betrayal and loss.",
      },
      finale: {
        label: "Thriller: endgame",
        blurb: "The last act: the whole conspiracy, face to face.",
        prompt: "The climax: a massive driving synth and string ostinato at 125 BPM, thunderous hybrid percussion, a ticking clock high above, huge brass and sub-bass impacts, building and building to an overwhelming peak. Everything at stake.",
      },
    }),
    ...stings(PACK, {
      phone_buzz: { label: "Phone buzzes", blurb: "A text, from a number nobody knows.", keywords: ["phone", "text", "call"], prompt: "A smartphone vibrating twice on a hard wooden table", seconds: 2 },
      gunshot: { label: "Gunshot", blurb: "One shot, very loud.", keywords: ["gunshot", "shot", "pistol"], prompt: "A single loud pistol gunshot in a concrete space with a sharp echo", seconds: 3 },
      silenced_shot: { label: "Suppressed shot", blurb: "A cough of a sound, and someone falls.", keywords: ["silencer", "suppressed"], prompt: "Two quick suppressed pistol shots followed by a body falling to the floor", seconds: 3 },
      tyre_screech: { label: "Tyres screech", blurb: "A car taking a corner far too fast.", keywords: ["car", "tyres", "tires", "brakes"], prompt: "A car's tyres screeching as it brakes hard and swerves on asphalt", seconds: 3 },
      siren_pass: { label: "Sirens", blurb: "Police going by, or coming here.", keywords: ["siren", "police", "cops"], prompt: "A police siren approaching quickly and passing by outside", seconds: 6 },
      door_kick: { label: "Door kicked in", blurb: "The door bursts off its frame.", keywords: ["breach", "kick", "raid"], prompt: "A door being kicked in violently, wood splintering and the door slamming against a wall", seconds: 2 },
      elevator_ding: { label: "Elevator arrives", blurb: "Ding. The doors open on someone.", keywords: ["elevator", "lift"], prompt: "An elevator arrival chime followed by the doors sliding open", seconds: 3 },
      camera_shutter: { label: "Camera shutter", blurb: "Someone took a photo.", keywords: ["camera", "photo", "surveillance"], prompt: "A burst of rapid camera shutter clicks from a telephoto camera", seconds: 2 },
      helicopter: { label: "Helicopter", blurb: "Rotors overhead, a searchlight sweeping.", keywords: ["helicopter", "chopper"], prompt: "A helicopter flying low overhead, rotor blades thumping loudly then moving away", seconds: 6 },
      keycard_beep: { label: "Keycard", blurb: "Access granted, or denied.", keywords: ["keycard", "access", "lock"], prompt: "An electronic keycard reader beeping and a magnetic door lock releasing with a clunk", seconds: 2 },
      thriller_hit: { label: "Impact", blurb: "The low hit on a reveal.", keywords: ["reveal", "impact", "twist"], prompt: "A deep cinematic thriller impact, a sub-bass boom with a reversed synth riser into a metallic hit", seconds: 4, gain: 0.6 },
    }),
  ],
  shared: ["rain", "storm", "wind", "night", "crowd", "heartbeat", "thud", "death", "turn", "splash", "scream", "flatline", "comms_static", "power_down"],
};
