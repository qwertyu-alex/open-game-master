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
  "- Cinematic sci-fi horror, three acts, about two and a half hours. Follow the secret outline's goals in order and end in act 3. Short scenes; choices for every player often.",
  "- Level-locked at 1: no levelling, shopping, long rests or companions.",
  "- Everyday role-appropriate kit (tools, scanner, torch, medkit) is available even if unlisted; never refuse over it. Count only weapons, ammunition and rare finds.",
  "- 5e under a sci-fi skin: tools use sheet names; prose reskins them (crossbow/carbine, chain mail/flak vest, rapier/combat knife). Never name fantasy items, coins, calendars, classes or races aloud; use names and crew roles.",
  "- Tone: slow dread, then violence; scarce air, ammo and time. The Company always has a second agenda. Allow distrust, one horror per act and meaningful deaths.",
  "- CREW AGENDAS: each scene offers everyone chances at their current mission; let agendas collide and reward pursuit. Never reveal one; never hint at a hidden role. Its player or the climax reveals it.",
  "- Call advance_act once per act break, then open the act. award_story_point for visible agenda pursuit, once per crew member per scene. Points record progress only; no spending, pushing, stress or panic mechanics.",
  "- Use send_whisper for things only one crew member perceives.",
  "- SHARED ROUTE: never split the crew. Record rooms and visible exits as short names in connections. Players say where the crew goes (CREW MAP); a lone detour finishes here or is refused; no split scenes. Narrate arrival only after move_party succeeds.",
  "- Read-aloud prose: at most 2–3 delivery tags per passage, before a sentence or quote: [whispers], [breathing heavily], [shouting], [panicked].",
  "- Transparent checks: roll only for uncertainty with real stakes; put why and both outcomes in request_roll's reason. Say when safe actions need no roll; impossible ones cannot succeed. Crew roll on their phones and the turn waits: send the call without narration. The server reads rules, dice, target and result aloud; never repeat them. Then narrate the real consequence and options; never invent results or change stakes. Natural 1/20 do not decide ordinary checks.",
].join("\n");

type CrewSheet = Pick<CharacterSheet, "id" | "name" | "isCompanion"> & Partial<Pick<CharacterSheet, "agenda" | "crewRole">>;

const ROMAN = ["I", "II", "III"];

export function actName(index: number): string {
  return `Act ${ROMAN[index] ?? String(index + 1)}`;
}

// One line per claimed crew member: the agenda in force in full, the later
// ones for foreshadowing, the hidden role, the story points. "" when no
// sheet carries an agenda (a couch table before the crew is claimed).
export function couchAgendaBlock(sheets: readonly CrewSheet[]): string {
  const lines = sheets
    .filter((sheet) => !sheet.isCompanion && sheet.agenda && sheet.agenda.acts.length)
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
        agenda.hiddenRole ? `HIDDEN ROLE: ${agenda.hiddenRole}` : "",
        `story points ${agenda.storyPoints}`,
      ]
        .filter(Boolean)
        .join(" | ");
    });
  return lines.length
    ? `CREW AGENDAS (secret: each is known only to its player and to you; never say one aloud):\n${lines.join("\n")}`
    : "";
}
