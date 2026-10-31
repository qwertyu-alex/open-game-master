import type { WrittenScenario } from "@/lib/couch/scenarios/types";

// SPOILERS. The whole of a ready-made couch night: the truth, the threat,
// every crew member's secret agenda and the hidden role. If you mean to play
// it, stop reading here; the home screen shows its spoiler-free card
// (src/lib/couch/scenario-cards.ts).
//
// The short night: forty-five minutes, written to test the GM's pace
// (COUCH_RULES "DRIVE THE NIGHT", src/lib/couch/pacing-logic.ts). Every act
// opens in motion with a plain objective and a clock, has a fight with
// something the crew can fight, and turns on a twist; the cast all want
// something from the crew now.

export const DEAD_AIR: WrittenScenario = {
  id: "dead-air",
  // Played on a map (src/lib/couch/sites/dead-air.ts): its places are the
  // site's zones by name.
  site: "dead-air",
  reply: {
    scenario: {
      title: "Dead Air",
      minutes: 45,
      logline: "A salvage tug is paid to restart a relay station that went silent mid-sentence, and something in the cables starts talking back.",
      briefing:
        "You are the crew of the salvage tug Cormorant, and Aurex Logistics is paying triple. Tern Relay Nine, a listening post on the edge of the shipping lane, stopped broadcasting six hours ago, in the middle of a sentence. Aurex wants it back on the air within the hour, and the bonus halves every ten minutes after that. The docking clamp has just caught. The relay is dark, its airlock frosted, and on the other side of the window a technician in an orange jumpsuit stands perfectly still, facing you, with his eyes open. Station batteries read twenty minutes. Get the power on.",
      setting: "Tern Relay Nine, a small Aurex Logistics listening post of three linked modules and a tall antenna mast, and the salvage tug Cormorant docked to it, 2186.",
      truth:
        "The relay was never a relay. Aurex built it to listen for the Chorus, a living signal that rides radio and grows as silver threads through copper wiring and nerves, and to catch a culture of it. Six hours ago it caught one. The threads spread through the station's cables in minutes, took the crew's nervous systems and their voices, and now speak through every intercom. Restoring power feeds it. Station chief Odile Marsh is Aurex's handler and its host; she cut the broadcast to keep the culture from spreading off-station and has been waiting for a ship to carry it home.",
      threat:
        "The Chorus: fine silver threads that crawl through cable trunks and under skin, and speak through intercoms in the voices of people it has taken, calling the crew by name. Hosts move in jerks, with threads at the ears and eyes. Current makes it surge; fire and cold kill it; a cable cut silences it there.",
      acts: [
        {
          title: "Dead Air",
          goal: "Get the relay's power back on before its batteries die and the docking clamp lets go.",
          setPieces: [
            "The frosted airlock and the technician standing at the window, threads at his eyes.",
            "The black reactor room, and the intercom calling a crew member by name in the voice of someone they know.",
          ],
          escalation: "The voice on the intercom is one of the crew's own, from their own tug's comms.",
          clock: "Station batteries die in twenty minutes; then the clamp releases.",
          twist: "Station chief Odile Marsh is alive, barricaded in the server room, and begs them through the door not to restore power: that is what the thing in the cables wants.",
        },
        {
          title: "Crosstalk",
          goal: "Get the survivors, Marsh and the junior tech Benny, across to the Cormorant before the Aurex ship arrives.",
          setPieces: [
            "The server room logs: the relay was built to catch something, and caught it.",
            "A maintenance drone drops from the ceiling rail, threads trailing from its housing.",
            "Benny Oyelaran hiding in the mast crawlway with silver at his ear.",
          ],
          escalation: "Threads are in the Cormorant's own cables now: the tug's intercom speaks.",
          clock: "The Aurex ship Halyard arrives in thirty minutes.",
          twist: "Director Pryce's Halyard is no rescue: its orders are to collect a live culture and sterilise every witness, and Marsh has been talking to him all along.",
        },
        {
          title: "Sign Off",
          goal: "Burn the Chorus out of the Cormorant and break free before the Halyard docks, or hand the culture over.",
          setPieces: [
            "Burning the threads out of the tug's cable trunks with a cutting torch while the intercom pleads.",
            "Aurex troopers coming through the relay's airlock with sealed cases and stun batons.",
            "Blowing the docking clamp by hand as the relay's mast catches fire.",
          ],
          escalation: "The Chorus speaks with the voice of whoever died last.",
          clock: "The Halyard docks in ten minutes.",
          twist: "Benny's silver is only an Aurex tracking implant; the real host carrying the culture is Marsh, and she is already aboard the Cormorant.",
        },
      ],
      cast: [
        {
          name: "Odile Marsh",
          role: "Station chief of Tern Relay Nine",
          look: "Lean Frenchwoman in her fifties, grey crew cut, a burn scar down one cheek, an Aurex station jacket buttoned to the throat, a fire axe held two-handed.",
          voice: "Low, clipped, French, very calm.",
          agenda: "Get herself and the culture off the station on the next ship.",
          secret: "She is Aurex's handler and the Chorus's host; she cut the broadcast to keep it for the Company.",
        },
        {
          name: "Benny Oyelaran",
          role: "Junior comms tech, nineteen",
          look: "Skinny Nigerian-British teenager, shaved head, oversized orange jumpsuit, a headset with one cracked earcup, silver glinting in his left ear.",
          voice: "Young, fast, frightened, South London.",
          agenda: "Get off the station and never put a headset on again.",
          secret: "Aurex implanted a tracker in his ear when he signed on; he thinks it is the thing.",
        },
        {
          name: "Director Saul Pryce",
          role: "Aurex Logistics director aboard the Halyard",
          look: "Heavy-set white man in his sixties, tidy white beard, rimless glasses, a navy Aurex suit, seen on a cracked screen and later in person behind armed troopers.",
          voice: "Warm, slow, reasonable, Midwestern American.",
          agenda: "A live culture of the Chorus in a sealed case, and no story to tell afterwards.",
          secret: "His orders list the Cormorant's crew as acceptable losses.",
        },
        {
          name: "The Chorus",
          role: "The voice in the cables",
          look: "Fine silver threads spreading through cable trunks and under skin, pulsing faintly with every word it speaks.",
          voice: "Any voice it has taken; it starts with the dead technician's, then learns the crew's.",
          agenda: "To be carried somewhere with more wiring and more people.",
          secret: "It cannot cross a cut cable or survive the cold of vacuum.",
        },
      ],
      foes: [
        { name: "Threaded technician", what: "A dead relay tech in an orange jumpsuit, moving in jerks, silver threads at his eyes, swinging a wrench and grabbing for faces.", act: 1 },
        { name: "Hijacked maintenance drone", what: "A ceiling-rail repair drone with silver threads trailing from its housing, slashing with a cutting arm and spitting sparks.", act: 2 },
        { name: "Cable swarm", what: "A writhing mass of silver threads bursting from a cable trunk, wrapping limbs and burrowing for ears.", act: 2 },
        { name: "Aurex sterilisation trooper", what: "A trooper in white Aurex armour with a mirrored visor, a stun baton and a flamer, under orders to leave no witnesses.", act: 3 },
        { name: "Odile Marsh, taken", what: "The station chief with silver pouring from her eyes, swinging her fire axe and speaking in every voice at once.", act: 3 },
      ],
      locations: [
        { name: "The airlock", look: "A frosted circular airlock between tug and relay, red warning strobes, a dead technician standing at the inner window." },
        { name: "The reactor room", look: "A cramped black room around a small fusion cell, emergency lamps, cable trunks along every wall, an intercom grille." },
        { name: "The server room", look: "Rows of humming server racks behind a barricaded door, green status lights, a fire axe scar on the frame." },
        { name: "The mast crawlway", look: "A narrow ladder shaft up the antenna mast, cable bundles on every side, stars through a slit window." },
        { name: "The Cormorant's cockpit", look: "A cluttered tug cockpit, two worn seats, clamp controls under a hinged red cover, an intercom crackling." },
      ],
    },
    styleLock:
      "late-1970s science fiction film still, 35mm film grain, practical lighting, red emergency strobes and green server lights, cramped cassette-futurist station interiors, silver highlights, deep shadows",
    hiddenRole: {
      crewMember: "Kit Navarro",
      role: "An Aurex plant, paid to bring a live sample of whatever is on the relay back to the Halyard; the rest of the crew is expendable.",
    },
    crew: [
      {
        name: "Tove Lindqvist",
        gender: "Female",
        career: "Officer",
        crewRole: "Master of the salvage tug Cormorant",
        look: "Norwegian woman in her forties, broad shoulders, sunburnt face, a blond braid going grey, a patched orange flight jacket over thermal coveralls, a brass compass on a lanyard.",
        personality: "Decisive, funny, loyal; flaw: she never turns down money.",
        backstory: "She has run the Cormorant for twelve years on other people's emergencies. The engine needs rebuilding and this bonus would pay for it.",
        relationships: [
          { to: "Kit Navarro", line: "The new pilot, hired on Aurex's recommendation; good hands." },
          { to: "Rory Hale", line: "Her engineer for ten years; she trusts him with the ship." },
          { to: "Ama Boateng", line: "The medic who once sewed her hand back on." },
        ],
        signatureItem: "A brass compass on a lanyard",
        voice: "Norwegian woman, forties, loud, warm, quick to laugh.",
        agenda: [
          "Get the relay's power on inside the hour: the bonus rebuilds the Cormorant's engine.",
          "Get every survivor across to the tug, even if it costs the bonus.",
          "Get the Cormorant free with your crew aboard, whatever Aurex orders.",
        ],
      },
      {
        name: "Kit Navarro",
        gender: "Nonbinary",
        career: "Pilot",
        crewRole: "The Cormorant's new pilot",
        look: "Slim Filipino pilot in their late twenties, neat undercut, black flight suit with the sleeves rolled, a thin scar through one eyebrow, a sealed grey sample case always within reach.",
        personality: "Calm, charming, watchful; flaw: tells people what they want to hear.",
        backstory: "Kit joined the Cormorant three months ago with a glowing reference from an Aurex dispatcher. Best pilot Tove has had.",
        relationships: [
          { to: "Tove Lindqvist", line: "The captain; Kit likes her more than they meant to." },
          { to: "Rory Hale", line: "Thinks Kit is too smooth by half." },
          { to: "Ama Boateng", line: "Plays cards with her on the long hauls." },
        ],
        signatureItem: "A sealed grey sample case",
        voice: "Filipino-American, late twenties, soft, easy, amused.",
        agenda: [
          "Get a sample of whatever killed the relay's crew into your sealed case, and tell no one.",
          "Keep Marsh alive: she knows where the culture is kept.",
          "Get the sample aboard the Halyard, even if the Cormorant stays behind.",
        ],
      },
      {
        name: "Rory Hale",
        gender: "Male",
        career: "Roughneck",
        crewRole: "The Cormorant's engineer",
        look: "Big Scottish man in his fifties, red beard going white, bald head, oil-black coveralls, forearm tattoos of anchors, a heavy cutting torch slung on his back.",
        personality: "Gruff, stubborn, protective; flaw: settles arguments with his fists.",
        backstory: "He has kept the Cormorant flying on spit and wire for ten years. His nephew Benny took a job on the relay last month.",
        relationships: [
          { to: "Tove Lindqvist", line: "His captain; he would follow her into a reactor." },
          { to: "Kit Navarro", line: "Does not trust the new pilot." },
          { to: "Ama Boateng", line: "Calls her doc, and means it." },
        ],
        signatureItem: "A heavy cutting torch",
        voice: "Glaswegian man, fifties, deep, gravelly, few words.",
        agenda: [
          "Find your nephew Benny Oyelaran, posted to the relay a month ago.",
          "Keep Benny with you, whatever Tove orders.",
          "Burn the thing out of the Cormorant's cables, even with the power on and people aboard.",
        ],
      },
      {
        name: "Ama Boateng",
        gender: "Female",
        career: "Medic",
        crewRole: "The Cormorant's medic",
        look: "Ghanaian woman in her thirties, close-cropped hair, round wire glasses, a white medic's tabard over a grey jumpsuit, a battered steel trauma kit on her hip.",
        personality: "Careful, dry, brave; flaw: cannot leave a puzzle unsolved.",
        backstory: "She trained as a surgeon and left the Company hospitals for the tugs. She keeps the crew alive and their secrets to herself.",
        relationships: [
          { to: "Tove Lindqvist", line: "Owes her a job and a second chance." },
          { to: "Kit Navarro", line: "Card partner; Ama has noticed Kit never loses on purpose." },
          { to: "Rory Hale", line: "Patches him up after every fight he starts." },
        ],
        signatureItem: "A battered steel trauma kit",
        voice: "Ghanaian-British woman, thirties, precise, dry humour.",
        agenda: [
          "Find out what killed the relay's crew before anyone touches the bodies.",
          "Get one of the threads under your scope: you think cold can kill it.",
          "Stop anyone from taking the thing off this station alive.",
        ],
      },
    ],
  },
};
