import { cueById, cueIds, sceneIds } from "@/lib/ambience/catalog";
import { soundPackById, type CouchSoundPack } from "@/lib/couch/sound-catalog";

// What a couch night is offered to hear, and how the GM's tools name it
// (src/lib/couch/sound-catalog.ts holds the sounds themselves).
//
// The upstream tool definitions list the fantasy library's places and cues;
// on a couch night the same tools are rewritten here to list the night's
// pack, so a crew aboard a tug is filed as a ship's corridor, never as a
// sailing ship. One rewrite at the edge of the tool list, rather than a
// couch copy of every tool that names a place.
//
// Pure, for scripts/test-couch-sound.mjs.

type CouchFlag = { gameSettings: { couchMode?: boolean } };

// Every couch night is a sci-fi horror one-shot today. A night of another
// genre names its pack here (from the forge), and everything below follows.
export function couchSoundPack(campaign: CouchFlag): CouchSoundPack | null {
  return campaign.gameSettings.couchMode ? "scifi_horror" : null;
}

// Where a sci-fi night is when nothing says: aboard. Each pack names its own.
export const COUCH_DEFAULT_BED = "hull";

function defaultBed(pack: CouchSoundPack): string {
  return soundPackById(pack)?.defaultBed ?? COUCH_DEFAULT_BED;
}

// A place filed before the pack existed, or under an upstream kind the pack
// does not play: the nearest sci-fi sound when the pack has it, else the
// pack's own default place. A night that was already running keeps its
// places and loses the sea.
const LEGACY_BED: Record<string, string> = {
  ship: "hull",
  keep: "hull",
  dungeon: "ducts",
  sewer: "ducts",
  mine: "cargo",
  cave: "derelict",
  crypt: "derelict",
  ruins: "derelict",
  graveyard: "derelict",
  forge: "engineering",
  library: "lab",
  arcane: "lab",
  temple: "hab",
  town: "hab",
  city: "hab",
  market: "hab",
  crowd: "hab",
  tavern: "mess",
  camp: "mess",
  coast: "exo_storm",
  mountain: "exo_storm",
  river: "seafloor",
  waterfall: "seafloor",
  swamp: "hive",
  jungle: "hive",
  forest: "plains",
  deep_forest: "plains",
};

export function couchBed(bed: string | null | undefined, pack: CouchSoundPack): string {
  const id = (bed ?? "").trim();
  if (id && sceneIds(pack).includes(id)) return id;
  const mapped = LEGACY_BED[id];
  return mapped && sceneIds(pack).includes(mapped) ? mapped : defaultBed(pack);
}

// The scene list as the GM reads it: each id with its few words, so the
// model needs no guessing at what "cargo" or "hive" is.
export function couchSceneDescription(pack: CouchSoundPack): string {
  const kinds = sceneIds(pack).map((id) => `${id} (${cueById(id)?.label.toLowerCase() ?? id})`);
  const hint = soundPackById(pack)?.sceneHint;
  return `What kind of place this is, for its sound and picture. Set it when the crew arrives somewhere new.${hint ? ` ${hint}` : ""} Kinds: ${kinds.join(", ")}.`;
}

type Tool = { type?: string; function?: { name?: string; description?: string; parameters?: { properties?: Record<string, unknown> } } };

const SCENE_TOOLS = new Set(["move_party", "update_location", "start_encounter"]);

function withProperty(tool: Tool, name: string, patch: (property: Record<string, unknown>) => Record<string, unknown>): Tool {
  const property = tool.function?.parameters?.properties?.[name];
  if (!property || typeof property !== "object") return tool;
  return {
    ...tool,
    function: {
      ...tool.function,
      parameters: {
        ...tool.function!.parameters,
        properties: { ...tool.function!.parameters!.properties, [name]: patch(property as Record<string, unknown>) },
      },
    },
  };
}

// One tool, as a couch night of this pack is offered it. Tools that name no
// place or cue come back as they were.
export function couchSoundTool<T>(tool: T, pack: CouchSoundPack): T {
  const typed = tool as Tool;
  const name = typed.function?.name ?? "";
  if (SCENE_TOOLS.has(name)) {
    return withProperty(typed, "scene", (property) => ({
      ...property,
      enum: sceneIds(pack),
      ...(name === "start_encounter" ? {} : { description: couchSceneDescription(pack) }),
    })) as T;
  }
  if (name === "set_ambience") {
    let next = withProperty(typed, "bed", (property) => ({ ...property, enum: [...cueIds("bed", pack), "none"] }));
    next = withProperty(next, "music", (property) => ({
      ...property,
      enum: [...cueIds("music", pack), "none"],
      description: "What the scene is doing to them. The mood (set_mood) already picks the score; set it here only with hold, when the music is the point.",
    }));
    return next as T;
  }
  if (name === "play_sting") {
    return withProperty(typed, "cue", (property) => ({
      ...property,
      enum: cueIds("sting", pack),
      description: `One beat for the room to flinch at (${cueIds("sting", pack).slice(0, 4).map((id) => cueById(id)?.label.toLowerCase() ?? id).join(", ")}…). One or two a scene, at the moment it lands.`,
    })) as T;
  }
  return tool;
}
