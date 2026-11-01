// A written scenario, in exactly the shape the forge asks the story model
// for (src/lib/couch/forge-logic.ts REPLY_SHAPE), so the forge's own reader
// (readForge) seats it: it takes the first N crew members for N players,
// drops ties to anyone not seated, and gives the hidden role to its holder.
// Written for that cut: the hidden role's holder sits within the scenario's
// minimum crew, and a crew member's agendas name only the people listed
// before them (or, for the first two, each other), so no seated crew member
// is ever told to chase someone who is not at the table.

export type WrittenCrew = {
  name: string;
  gender: "Female" | "Male" | "Nonbinary";
  career: "Marine" | "Pilot" | "Medic" | "Roughneck" | "Company Agent" | "Scientist" | "Officer" | "Kid";
  crewRole: string;
  look: string;
  personality: string;
  backstory: string;
  relationships: Array<{ to: string; line: string }>;
  signatureItem: string;
  voice: string;
  agenda: [string, string, string];
};

export type WrittenScenario = {
  // The card's id (src/lib/couch/scenario-cards.ts).
  id: string;
  // The site an overhead night is played on (src/lib/couch/sites), whose
  // zones are its locations (docs/couch-overhead-spec.md).
  site?: string;
  reply: {
    scenario: {
      title: string;
      // A night written shorter than the usual two and a half hours.
      minutes?: number;
      logline: string;
      briefing: string;
      setting: string;
      truth: string;
      threat: string;
      // beats: the act's deck of scares (src/lib/couch/tension-logic.ts);
      // a scenario without one improvises from its escalation and foes.
      acts: Array<{ title: string; goal: string; setPieces: string[]; escalation: string; clock: string; twist: string; beats?: Array<{ kind: "sign" | "human" | "strike"; what: string }> }>;
      cast: Array<{ name: string; role: string; look: string; voice: string; agenda: string; secret: string }>;
      // What the crew can fight, act by act: people, machines, the threat's
      // spawn or victims, never the threat itself at full strength.
      foes: Array<{ name: string; what: string; act: 1 | 2 | 3 }>;
      locations: Array<{ name: string; look: string }>;
    };
    styleLock: string;
    hiddenRole: { crewMember: string; role: string };
    crew: WrittenCrew[];
  };
};
