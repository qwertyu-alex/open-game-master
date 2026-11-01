import type { WrittenScenario } from "@/lib/couch/scenarios/types";

// SPOILERS. The whole of a ready-made couch night: the truth, the threat,
// every crew member's secret agenda and the hidden role. If you mean to play
// it, stop reading here; the home screen shows its spoiler-free card
// (src/lib/couch/scenario-cards.ts).
//
// Set in the published ALIEN universe, at the owner's request (2026-10-31:
// "in the same universe ... hidden cyborg, betrayal, creepy alien monsters,
// an hour, three players"), so it names the Company, Mother and the
// creature. Its shape follows the ALIEN Starter Set's cinematic play:
// a three-act one-shot, space truckers woken early by the ship's computer,
// a lost Company derelict, a survivor revived from cryo, a Special Order,
// and the rulebook's secret android, who feels no stress and never panics
// and is revealed by a critical injury. The story, ships and people are
// written new: this is not the boxed scenario, so a table that plays this
// can still play that one unspoiled.
//
// Written for three, and for an hour (minutes: 60, so the act clock runs
// about 17, 23 and 21 minutes). The synthetic is the third crew member, so
// every table has one; a fourth player gets the Company's auditor, the
// suspect everyone will watch instead. Two of the three want the creature
// aboard (the synthetic for the Company, the engineer for a buyer) and the
// captain wants it dead; nobody can win without someone else losing.
// Played on a map (src/lib/couch/sites/crew-expendable.ts): its places are
// the site's zones by name.

export const CREW_EXPENDABLE: WrittenScenario = {
  id: "crew-expendable",
  site: "crew-expendable",
  reply: {
    scenario: {
      title: "Crew Expendable",
      minutes: 60,
      logline: "An ice hauler's crew is woken forty days early to answer a distress call from a Company ship lost four years ago, and one of them was put aboard for exactly this.",
      briefing:
        "Sirens. Cold. The lids of your hypersleep pods hiss open forty days early. You are the crew of the USCSS Corbett, a Weyland-Yutani ice hauler three months out from Anchorpoint Station, and Mother, the ship's computer, has woken you for a reason. Twenty minutes ago a distress beacon came on dead ahead: the USCSS Erebus, a Company science vessel listed lost with all hands four years ago. Under your contract, a crew that ignores a distress call forfeits its shares, and Mother has already matched course. Through the canopy the Erebus turns slowly against the stars, black and silent, its running lights dead, one airlock blinking amber. The umbilical has locked on. The derelict's emergency power will not last. Suit up, go across, and find out who is still calling.",
      setting: "The ice hauler USCSS Corbett, docked by a flexible umbilical to the derelict Company science vessel USCSS Erebus, drifting in the Outer Rim, 2183. The Corbett is small, warm and familiar; the Erebus is dark, frozen and four years dead.",
      truth:
        "Four years ago Weyland-Yutani sent the Erebus to an unregistered moon in the Zeta2 Reticuli system to collect what a long-dead alien ship had left there: eggs. Its crew brought forty aboard and kept them in the cargo hold under a cold blue mist. One hatched in transit. The thing it became grew in the ducts and killed the crew one by one; xenobiologist Dr. Owen Whitlock sealed the hold to save the eggs, was facehugged anyway, and froze himself in cryo with the embryo still inside him. The Erebus's synthetic, Hollis, kept the ship drifting and the cargo safe, and lit the beacon when it saw the Corbett on its scope, as the Company told it to. The Corbett is no accident: Mother changed its course three weeks before the beacon came on, under Special Order 939: bring back an organism, all other priorities rescinded, crew expendable. Four years ago the Company also put a synthetic among the Corbett's crew, to see the order done. The Company ship Ravenhurst follows a day behind to collect. Thaw Whitlock and the embryo wakes with him: it bursts from his chest within the hour and grows to full size within another.",
      threat:
        "The Xenomorph. A leathery egg opens like a flower and a facehugger, a pale hand of fingers with a whip tail, clamps onto a face and plants an embryo. Tonight it takes minutes, not hours: a chestburster tears out of the host's ribs and flees into the ducts, sheds, and grows into a black, eyeless, two-metre hunter with a second jaw, a bladed tail and acid for blood that eats through decks. It hunts from ducts and ceilings. Fire and vacuum drive it back. Tells: the motion tracker, dripping, a hiss, a shed skin.",
      acts: [
        {
          title: "Wake-Up Call",
          goal: "Cross to the Erebus, find who is calling, and pull its flight recorder off the Erebus Bridge.",
          setPieces: [
            "Cutting through the Erebus Airlock's frozen inner door, which bulges outward as if something pushed from inside.",
            "The Erebus Bridge: the captain still strapped into his chair four years on, ribs opened outward, the flight recorder blinking.",
            "The Cargo Hold under a knee-deep blue mist: rows of leathery eggs, one opening as someone leans close.",
            "Hollis, the Erebus's synthetic, half its face peeled to white wire, asking them politely to leave the specimens alone, then raising a bolt gun.",
          ],
          escalation: "An egg in the hold opens as the crew passes; something pale skitters across the deck and into the ducts.",
          clock: "The Erebus's emergency power fails in fifteen minutes; then its doors seal and the cold comes in.",
          twist: "There is a survivor: Dr. Owen Whitlock, alive in the Cryo Bay's one sealed pod and already thawing; and Mother's log shows the Corbett's course was changed three weeks before the beacon came on.",
        },
        {
          title: "Something Aboard",
          goal: "Get Whitlock and whatever you are keeping back to the Corbett and cut the umbilical before the Erebus's tumble tears it loose.",
          setPieces: [
            "Carrying Whitlock along the twisting Umbilical while something scratches through the Erebus's ducts behind them.",
            "Whitlock at the Corbett's mess table with coffee and a joke, then a cough, then a scream.",
            "Hunting the newborn through the Corbett's ducts with a motion tracker and a cutting torch.",
            "Mother refusing to undock: unable to comply.",
          ],
          escalation: "The thing in the Corbett's ducts has shed its skin twice: it is already bigger than a man.",
          clock: "The Erebus's tumble tears the umbilical loose in twenty minutes, with or without anyone in it.",
          twist: "Whitlock was carrying it all along: the embryo froze with him and woke when he did, and it tears out of his chest aboard the Corbett and is gone into the ducts.",
        },
        {
          title: "Crew Expendable",
          goal: "Burn, seal or blow the creature off the Corbett before the Company ship Ravenhurst docks, or hand it over and hope they let you live.",
          setPieces: [
            "The motion tracker pinging from every direction at once, and nothing in the corridor: it is above them.",
            "Company commandos coming across the umbilical with a flamer and a specimen cage.",
            "Venting the Corbett Airlock with the creature inside, and someone's hand still on the lever.",
          ],
          escalation: "The Ravenhurst's commandos have orders to leave no human witnesses, and the creature has found the Corbett's Bridge.",
          clock: "The Ravenhurst docks in fifteen minutes.",
          twist: "Mother answers an override at last: Special Order 939, organism priority, crew expendable, and a Company asset aboard the Corbett to see it done. It does not say who.",
        },
      ],
      cast: [
        {
          name: "Mother",
          role: "The Corbett's MU/TH/UR mainframe",
          look: "A white padded interface room of blinking lights, one green terminal scrolling amber text, a voice from the ceiling.",
          voice: "Calm, female, synthetic, faintly echoing, never in a hurry.",
          agenda: "Carry out Special Order 939 to the letter.",
          secret: "It changed the Corbett's course three weeks before the beacon came on, and its orders name the crew expendable.",
        },
        {
          name: "Dr. Owen Whitlock",
          role: "The Erebus's xenobiologist, its last man alive",
          look: "Gaunt English man in his fifties, frost in his beard, blue lips, raw red marks on his cheeks and throat, a hospital gown under a Company lab coat.",
          voice: "English, educated, hoarse, frightened, talks too fast.",
          agenda: "Get off the Erebus, and keep the eggs out of everyone's hands, the Company's included.",
          secret: "He was facehugged before he froze himself; the embryo in his chest wakes when he does.",
        },
        {
          name: "Hollis",
          role: "The Erebus's science synthetic",
          look: "A tall, handsome synthetic in a Company lab coat, the skin of half its face peeled back to white tissue and wire, milky fluid dried on its collar, a bolt gun in one hand.",
          voice: "Gentle, courteous, American, a beat too slow.",
          agenda: "Protect the cargo until the Company collects it.",
          secret: "It lit the beacon when it saw the Corbett coming, as ordered: the Corbett was sent to it.",
        },
        {
          name: "Director Evelyn Strand",
          role: "Company Special Projects, aboard the Ravenhurst",
          look: "Elegant Swedish woman in her sixties, silver bob, black turtleneck, pearl earrings, seen on a grainy comms screen with a time lag.",
          voice: "Cool, warm-sounding, Swedish, never raises her voice.",
          agenda: "Collect the organism alive, and anyone carrying one.",
          secret: "Her commandos are ordered to leave no human witnesses, and to wipe the synthetic aboard the Corbett too.",
        },
      ],
      foes: [
        { name: "Facehugger", what: "A pale, many-fingered thing with a long coiled tail that springs out of an opening egg onto a face, clamps on, and will not let go.", act: 1 },
        { name: "Hollis, the Erebus's synthetic", what: "A synthetic with half its face peeled to white wire, guarding the cargo hold with a bolt gun and polite apologies.", act: 1 },
        { name: "Chestburster", what: "A slick, eyeless, worm-bodied newborn with steel teeth that tears out of a ribcage and bolts for the nearest vent.", act: 2 },
        { name: "Facehugger from the vents", what: "The one that hatched as the crew passed, skittering out of a duct at knee height, tail whipping.", act: 2 },
        { name: "Company commando", what: "A Company security commando in grey armour and a mirrored visor, with a pulse rifle, a flamer and orders to leave no witnesses.", act: 3 },
      ],
      locations: [
        { name: "Corbett's Bridge", look: "A cramped cockpit of green screens and toggle switches, frost on the canopy, a black derelict ship turning slowly beyond it." },
        { name: "Erebus Airlock", look: "A derelict ship's circular inner airlock door, frosted over and bulged outward, amber warning lamps blinking." },
        { name: "Erebus Bridge", look: "A dark ship's bridge lit only by blinking consoles, a long-dead captain slumped in his chair, a red light winking." },
        { name: "Cryo Bay", look: "Twelve hypersleep pods under frost, all open and empty but one, its lid fogged from the inside." },
        { name: "Cargo Hold", look: "A vast black hold under a knee-deep layer of cold blue mist, rows of leathery shapes, a figure glued to the far wall." },
        { name: "Corbett's Mess", look: "A low galley with one long table, a coffee machine, playing cards and dirty plates: the warmest room aboard." },
      ],
    },
    styleLock:
      "late-1970s science fiction film still, 35mm film grain, anamorphic, practical lighting, green CRT screens, red emergency strobes, cold blue mist, grimy cassette-futurist ship interiors, wet chrome, deep shadows",
    hiddenRole: {
      crewMember: "Anouk Visser",
      role: "A Company synthetic who passes as human, put aboard the Corbett four years ago for this night. You feel no fear: fake your stress and panic. Orders: bring the organism home, crew expendable. Badly hurt, you bleed white, and everyone will know.",
    },
    crew: [
      {
        name: "Mara Castellano",
        gender: "Female",
        career: "Officer",
        crewRole: "Captain of the ice hauler Corbett",
        look: "Italian-American woman in her fifties, weathered olive skin, grey-streaked black hair tied back, a sheepskin-collared flight jacket over Company coveralls, reading glasses on a cord, a worn silver lighter in one hand.",
        personality: "Dry, steady, protective; flaw: she has never once broken a contract.",
        backstory: "Twenty-six years hauling ice for the Company, the last eleven in the Corbett's chair. The ship is mortgaged to the Company to the last bolt and she is two runs from owning it. She lost a crew once, on a run she was promised was safe, and has never forgiven the people who promised.",
        relationships: [
          { to: "Teddy Malloy", line: "Teddy co-signed the Corbett's mortgage with her, and they swore no secrets between them aboard her." },
          { to: "Anouk Visser", line: "She signed Anouk the authority to relieve her of command if she is ever unfit, and has never doubted the choice." },
          { to: "Jonah Pike", line: "She caught Jonah copying the Corbett's logs the day he came aboard and let it go when he begged; he owes her." },
        ],
        signatureItem: "A worn silver lighter",
        voice: "Brooklyn-Italian woman, fifties, smoky, unhurried, few words.",
        agenda: [
          "Pull the flight recorder off the Erebus Bridge: the salvage share pays off the Corbett.",
          "Somebody knew about the Erebus before the beacon came on. Find out who, before you undock.",
          "Kill the thing before it reaches anywhere with people, even if you have to vent your own ship. Nobody hands it to the Company.",
        ],
      },
      {
        name: "Teddy Malloy",
        gender: "Male",
        career: "Roughneck",
        crewRole: "The Corbett's engineer",
        look: "Heavy-set Irish-American man in his sixties, white walrus moustache, ruddy cheeks, a baseball cap with its brim taped, grease-black coveralls, a photo of a little girl tucked in the cap's band.",
        personality: "Funny, gentle, never stops talking; flaw: money worries make him stupid.",
        backstory: "Teddy has kept the Corbett's engines running for nineteen years on spit and spare parts. His pension went on a Company loan for his granddaughter's treatment, and he still owes most of it. A fence on Anchorpoint once told him over a drink what a real alien specimen would fetch.",
        relationships: [
          { to: "Mara Castellano", line: "Co-signed the Corbett's mortgage with Mara, and they swore no secrets between them aboard her." },
          { to: "Anouk Visser", line: "Anouk talked him through a heart attack in the dark and kept it off his Company record, so he still has a job." },
          { to: "Jonah Pike", line: "Asked Jonah what Company cargo fetches on the side, and Jonah promised to keep the question out of his report." },
        ],
        signatureItem: "A photo of his granddaughter",
        voice: "Boston-Irish man, sixties, warm, rambling, quick to joke.",
        agenda: [
          "Get into the Erebus's Cargo Hold and see what the Company was hauling. Whatever it is, it is worth money.",
          "Smuggle one unopened egg into the cold locker in the Corbett's Engine Room. Tell no one, not even Mara.",
          "Get your egg to the buyer on Anchorpoint and your family out of debt; or, if it has hatched, make sure no one ever learns you brought it aboard.",
        ],
      },
      {
        name: "Anouk Visser",
        gender: "Female",
        career: "Medic",
        crewRole: "The Corbett's medic",
        look: "Dutch woman who looks about thirty-five, pale and freckled, ash-blond hair in a neat braid, calm grey eyes, a spotless white medtech's tunic with the sleeves rolled, a steel pen-light in her breast pocket.",
        personality: "Gentle, precise, endlessly patient; flaw: too calm when everyone else is screaming.",
        backstory: "Anouk joined the Corbett four years ago, sent by the Company's crewing office when the old medic retired. She has stitched every one of them up since, remembers their birthdays, and once talked Teddy through a heart attack in the dark. She is always the first one awake after hypersleep, with the coffee already on.",
        relationships: [
          { to: "Mara Castellano", line: "Mara signed her the right to relieve the captain if she is ever unfit, and Anouk has never had to use it." },
          { to: "Teddy Malloy", line: "Talked Teddy through a heart attack in the dark, and kept it off his Company record so they would not retire him." },
          { to: "Jonah Pike", line: "Nursed Jonah through his space sickness and kept it out of his report; he has told her more than he meant to since." },
        ],
        signatureItem: "A steel pen-light",
        voice: "Dutch woman, thirties, soft, clear, perfectly even.",
        agenda: [
          "Bring a living specimen back aboard the Corbett, sealed, before anyone decides to burn the Erebus.",
          "Keep whatever grows inside Dr. Whitlock alive, and keep Mara from killing it.",
          "Get the organism aboard the Company ship Ravenhurst. Mara and Teddy are expendable; stay human to them until the moment you cannot.",
        ],
      },
      {
        name: "Jonah Pike",
        gender: "Male",
        career: "Company Agent",
        crewRole: "Company cargo auditor along for the run",
        look: "Slim Black British man in his late twenties, neat side parting, round wire glasses, a crumpled grey Company suit under a borrowed parka, a data slate held to his chest.",
        personality: "Nervous, clever, by the book; flaw: he will sell anyone out to save himself.",
        backstory: "Jonah audits cargo for the Company's Anchorpoint office and was put on the Corbett at the last minute to count its ice. This is his first deep-space run. He has been sick twice and apologised both times.",
        relationships: [
          { to: "Mara Castellano", line: "Mara caught him copying the Corbett's logs the day he came aboard, and let it go; he owes her one." },
          { to: "Teddy Malloy", line: "Teddy asked him what Company cargo fetches on the side, and Jonah promised to keep it out of his report." },
          { to: "Anouk Visser", line: "Anouk nursed him through his space sickness and kept it out of his report to Anchorpoint; he owes her." },
        ],
        signatureItem: "A Company data slate",
        voice: "London man, late twenties, quick, polite, nervous.",
        agenda: [
          "Be the first to read the Erebus's flight recorder: your orders say to wipe it if it ever turned up.",
          "Your orders never mentioned any of this. Find out who aboard the Company trusts more than you.",
          "Survive. Trade the flight recorder to the Colonial Marshals for your life, and take with you whoever is still human.",
        ],
      },
    ],
  },
};
