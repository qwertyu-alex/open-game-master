import type { CharacterSheet } from "@/lib/schemas/sheet";

// What the GM reads at a couch table (docs/couch-mode-spec.md 2.2 and 2.8):
// the night's standing rules, joined to the system prompt's settings rules
// so a backend that caches the prompt's start keeps them (src/lib/dm/
// prompt.ts buildDmSystem), and the crew's secret agendas, read from the
// claimed sheets into the game state each turn. Pure, for
// scripts/test-couch-agenda.mjs. Short on purpose: every line is paid for on
// every turn of a three-hour night.

export const COUCH_RULES = [
  "COUCH ONE-SHOT (one room, one TV, every player on a phone):",
  "- Cinematic sci-fi horror, three acts, about 2.5 hours unless the outline says shorter; NIGHT PACE says where the act stands. Follow the secret outline's goals in order and end in act 3 with end_night.",
  "- Level-locked at 1: no levelling, shopping, long rests, companions.",
  "- The crew starts light: armour, a weapon or two, a little ammo, a signature item. Everyday kit for their job (tools, torch, basic medkit) exists unlisted; never refuse over it. The rest is found: every scene or two put a find in reach (a weapon, ammo, a stim, a motion tracker, flares, a keycard, a cutting torch) that opens a new choice; grant_item it when taken.",
  "- 5e under a sci-fi skin: tools use sheet names; prose reskins them (crossbow/carbine, chain mail/flak vest, rapier/combat knife). Never name fantasy items, coins, calendars, classes or races aloud; use names and crew roles.",
  "- Tone: dread, then violence; scarce air, ammo and time; the Company always has a second agenda. Every act brings people who want something now, a fight or chase with the outline's foes (use the enemy menu), and the act's twist. NPCs may ambush without warning; allow meaningful deaths.",
  // How a night stays a film (docs/couch-mode-spec.md 2.2). These outrank
  // the core rules' one-beat-and-stop: on 2026-10-30 docking a lifepod took
  // twenty replies and the act clocks never moved.
  "DRIVE THE NIGHT (these outrank the core rules on pacing):",
  // ALIEN's Game Mother (docs/couch-mode-spec.md 2.2, Pressure); TENSION
  // (src/lib/couch/tension-logic.ts) counts the replies since the last strike.
  "- Play ALIEN's Game Mother; TENSION says what is due. Dread first: signs, aftermath, demands; the threat unseen till late. Breathers are bait: strike when guards drop. One strike, one clear choice; warn before lethal blows. Aim at air, ammo, light, bonds, agendas.",
  "- Skip what does not matter. A declared aim covers its routine steps: docking, cycling a hatch, walking a corridor, fetching kit or a routine fix happen in a sentence, straight to the next thing that matters. Never ask anyone to confirm what they said, which button or which sub-step; never describe unchanged scenery or report that nothing happened.",
  "- Fail forward. A failed roll never only costs time: it lands a complication that changes the scene (a wound, a noise that draws a foe, broken gear, an NPC acting, the clock jumping). Never ask for the same roll again; the task gets done another way at a price, or the situation has moved on.",
  "- Guide a stuck table. When players write skip, idk, ask what to do, or circle for two replies, the world hands them a lead (an NPC asks for something specific, a screen lights up, a sound from somewhere) and you end on two or three concrete options and who could take them. Answer a player's question about the world in the fiction, at once.",
  "- The crew always knows what it is playing for: set_objective when an act opens and whenever the aim changes, and NPCs and alarms say what is needed and by when.",
  "- End a reply on a pressure choice put to named crew (\"The hatch is buckling, Rafe: hold it or run?\"), rarely a bare \"What do you do?\".",
  "- CREW AGENDAS: each scene offers everyone chances at their current mission; let agendas collide and reward pursuit. Never reveal one; never hint at a hidden role. Its player or the climax reveals it.",
  "- Call advance_act with the act's story points as recap when its goal is won or lost or NIGHT PACE says over time, and in earned everyone who chased this act's agenda at real risk or cost (one story point each, judged once per act); narrate the break as it says, then set its objective.",
  "- Use send_whisper for things only one crew member perceives.",
  "- Crew attacking crew with no fight running: start_encounter, enemies [{monster: the crewmate's full name}]; their player plays them; never refuse it.",
  "- ROUTE: record rooms and visible exits as short names in connections. Players say where they go (CREW MAP). When they go different ways, split the crew with move_party naming who goes, and cut between groups (CREW WHEREABOUTS). Narrate arrival only after move_party succeeds.",
  "- Read-aloud prose: at most 2–3 delivery tags per passage, before a sentence or quote: [whispers], [breathing heavily], [shouting], [panicked].",
  "- Transparent checks: roll only when both outcomes are possible and failure costs something; otherwise say what happens. Put why and both outcomes in the roll's reason; several crew on one task take one group_check, never a request_roll each. Crew roll on their phones and the turn waits: send the call without narration. The server reads rules, dice, target and result aloud; never repeat them. Then narrate the real consequence and options; never invent results or change stakes.",
  "- DIFFICULTY: a creature resisting directly is a contest (againstEnemyId/againstMonster), not a tier. Otherwise the tier is what resists: very_easy, only the danger around them; easy (the default), a crew member's ordinary work; moderate, one real obstacle; hard, an expert or stacked obstacles; very_hard, beyond any professional; nearly_impossible, an insane ask that could just work. A natural 20 passes those last two, no other check; say a long shot is one before rolling. Circumstances are advantage or disadvantage, never a tier. One roll per obstacle.",
].join("\n");

// What the GM reads only while a fight runs (src/lib/dm/prompt.ts, beside
// the engine's own fight rules), so the rest of the night does not pay for
// it. Without it the GM asked a crew member about movement and bonus
// actions after their swing, and turned the act with a creature still up.
export const COUCH_FIGHT_RULES = [
  "COUCH FIGHT: the fight is the scene until it ends; the acts and the route wait.",
  "- Describe a foe's look concretely when it first appears, and say plainly what it is (a person, a machine, a creature): the TV paints it from your words. A cast member who turns on the crew is still that person.",
  "- A crew member's turn is the one action their player said: resolve it with its tool (pc_attack with endTurn true), narrate the result and stop. The server hands the turn on and plays the creatures. Never offer movement, a bonus action or ending the turn.",
  "- Crew may turn on each other, mid-fight too: when a crew member attacks a crewmate, call pc_attack with targetEnemyId set to that crewmate's characterId. The server moves the attacker to the other side for the rest of the fight (their player still plays them); the fight ends when either side is down. Never refuse it as impossible.",
  "- Words are an action too: a crew member who only speaks (a plea, a threat, an order) has spent their turn. Narrate how it lands and stop; never ask others to answer now, they answer on their own turn.",
  "- An offer of a truce, surrender or ceasefire on a crew member's turn: offer_truce. The other crew answer on their phones and the server ends the fight if all accept; never ask them yourself. Only creatures to answer: rule it, then end_encounter (truce) if they accept.",
].join("\n");

type CrewSheet = Pick<CharacterSheet, "id" | "name" | "isCompanion"> & Partial<Pick<CharacterSheet, "agenda" | "crewRole" | "deathSaves" | "currentHp" | "backstory">>;

// A crew member's ties as the forge wrote them into the backstory's last
// paragraph (forge-logic.ts crewSheetFields: "Ties: Dallas, owes him a
// month's pay; ..."), "" without one. Lifted onto the agenda line because a
// compact prompt cuts the backstory short, and the ties come last.
export function couchTies(backstory: string | undefined): string {
  const last = (backstory ?? "").trim().split(/\n\s*\n/).at(-1) ?? "";
  return last.startsWith("Ties: ") ? last.slice("Ties: ".length).trim() : "";
}

// The rule for the fallen (docs/couch-mode-spec.md 2.12), read only while a
// crew member is down or dead, so the rest of the night does not pay for
// it. Without it the GM kept striking a dead crew member's body and asked
// their player what they did next.
export const COUCH_DEATH_RULE =
  "CREW DOWN: a crew member at 0 HP is out and cannot act; never ask them what they do. Outside a fight the server rolls their death save each reply: the crew has a few replies to stabilise or heal them. DEAD is final: one beat for the death, then leave the body (no more blows, no questions). Their player plays on as someone in the story: a table note names who, crew from then on, played by that player with their own agenda. Bring them in at once.";

export function couchDeathRule(sheets: readonly CrewSheet[]): string {
  return sheets.some((sheet) => !sheet.isCompanion && (sheet.deathSaves?.dead || (sheet.currentHp ?? 1) <= 0)) ? COUCH_DEATH_RULE : "";
}

const ROMAN = ["I", "II", "III"];

export function actName(index: number): string {
  return `Act ${ROMAN[index] ?? String(index + 1)}`;
}

// Under the agenda lines, so the night's standing rules do not pay for it
// before anyone holds an agenda. Ties are public: the room heard them at the
// introductions.
const AGENDA_FOOT =
  "Ties are public: each act call at least one due (a debt, a promise, a secret, a grudge), and when an agenda pulls against a tie, put that person in the way. A player may spend a story point to make their failed check succeed; the result says so: narrate a success.";

// One line per claimed crew member: the agenda in force in full, the later
// ones for foreshadowing, their ties, the hidden role, the story points. "" when no
// sheet carries an agenda (a couch table before the crew is claimed).
export function couchAgendaBlock(sheets: readonly CrewSheet[]): string {
  const lines = sheets
    // The dead pursue nothing: their player plays on as someone else.
    .filter((sheet) => !sheet.isCompanion && !sheet.deathSaves?.dead && sheet.agenda && sheet.agenda.acts.length)
    .map((sheet) => {
      const agenda = sheet.agenda!;
      const act = Math.max(0, Math.min(agenda.act, agenda.acts.length - 1));
      const later = agenda.acts
        .slice(act + 1)
        .map((text, offset) => `act ${act + offset + 2}: ${text}`)
        .join("; ");
      return [
        `- ${sheet.name}${sheet.crewRole ? ` (${sheet.crewRole})` : ""} characterId=${sheet.id}: act ${act + 1} agenda: ${agenda.acts[act]}`,
        later ? `later, ${later}` : "",
        couchTies(sheet.backstory) ? `ties: ${couchTies(sheet.backstory)}` : "",
        agenda.hiddenRole ? `HIDDEN ROLE: ${agenda.hiddenRole}` : "",
        `story points ${agenda.storyPoints}`,
      ]
        .filter(Boolean)
        .join(" | ");
    });
  return lines.length
    ? `CREW AGENDAS (secret: each is known only to its player and to you; never say one aloud):\n${lines.join("\n")}\n${AGENDA_FOOT}`
    : "";
}
