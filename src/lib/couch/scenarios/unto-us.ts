import type { WrittenScenario } from "@/lib/couch/scenarios/types";

// SPOILERS. The whole of a ready-made couch night: the truth, the threat,
// every crew member's secret agenda and the hidden role. If you mean to play
// it, stop reading here; the home screen shows its spoiler-free card
// (src/lib/couch/scenario-cards.ts).

export const UNTO_US: WrittenScenario = {
  id: "unto-us",
  reply: {
    scenario: {
      title: "Unto Us",
      logline: "On Christmas Eve a small ore hauler takes in a lone survivor about to give birth, while three Company ships follow a star toward them bearing gifts.",
      briefing:
        "Christmas Eve, 2190, the Gallow Belt. The ore hauler Bethany Mae is three days from port with a full hold, tinsel taped to the bulkheads and a bottle saved for midnight. Then the long-range scope picks up a beacon, bright as a star: a lifepod from the colony ship Annunciata, lost nine months ago with two thousand settlers. One life sign. The pod's camera shows a young woman, alone, heavily pregnant and in labour. There is no room aboard, no doctor, and nowhere to go but here. Behind the beacon, three Company ships have just changed course toward it. You are closest. Bring her in.",
      setting:
        "The Bethany Mae, a small independent ore hauler mortgaged to the Hallam-Kreuz bank, crossing the Gallow Belt, 2190. The lost colony ship Annunciata belonged to Hallam-Kreuz.",
      truth:
        "The Annunciata reached the moon Cana, where the colonists met a native organism that breeds through hosts, planting a mimic embryo that grows in the body. The colony died. Maren Ashe is the first host to carry one to term, and she fled in a lifepod: to save it or to destroy it, she cannot tell any more. Hallam-Kreuz wants the newborn alive, the first viable specimen, and three of its ships are coming with money, a cage and orders. The baby looks almost perfect. It hums, and anyone who holds it feels a fierce love and will protect it. It feeds on warm blood through tiny bites, grows by the hour, and within a day will plant its own young in sleepers.",
      threat:
        "The child: a beautiful, warm baby with too-dark eyes that never cries, only hums. Holding it floods you with tenderness; whoever has held it does not want to put it down. Tells: small crescent scratches on hands and wrists, fevers, the humming in the vents, its blanket always warm. By the next day it crawls, then walks, child-sized, smiling with too many teeth, and plants its young in sleepers. Cold puts it into torpor: a cryopod holds it. Fire kills it. Silence, earplugs and distance blunt its pull.",
      acts: [
        {
          title: "No Room at the Inn",
          goal: "Bring the pod aboard and get Maren through the birth.",
          setPieces: [
            "Hauling the frosted pod aboard, Maren's palm pressed on the inside of the glass.",
            "The birth in the cramped mess under blinking Christmas lights.",
            "The baby does not cry. It hums, and everyone in the room goes quiet.",
          ],
          escalation: "Whoever held the baby has small scratches, and does not want to give it back.",
          clock: "Maren's labour, and the three Company ships twelve hours out.",
          twist: "The pod was not adrift: its beacon was switched on from outside nine hours ago by a Hallam-Kreuz override, steered toward the nearest small ship. The Company wanted this birth to happen somewhere expendable.",
        },
        {
          title: "Three Ships",
          goal: "Learn what the child is, what happened on Cana, and what the Company wants.",
          setPieces: [
            "The pod's flight recorder: colony footage from Cana, and the last weeks of the Annunciata.",
            "Maren, recovering, asks to hold her baby, and tries to smother it.",
            "The first Company ship hails with a very generous offer and a polite deadline.",
          ],
          escalation: "The child is crawling, and a sleeping crewmate wakes with a fever and a tiny wound.",
          clock: "The ships close in; the child grows by the hour.",
          twist: "The third ship is not Hallam-Kreuz at all: Ines Varga's salvage tug heard the beacon too, and it is closer than the scope said. Her crew boards through the cargo lock to take the child first.",
        },
        {
          title: "Gifts",
          goal: "Decide what happens to the child: sell it, destroy it, or flee with it, and survive the boarding.",
          setPieces: [
            "The child loose in the dark ore holds, humming through the vents.",
            "The Company boarding party with its gilded cradle-cage.",
            "The cryopod, the only bed cold enough to hold what the child has become.",
          ],
          escalation: "The fevered crewmate begins to hum.",
          clock: "The boarding party docks in one hour.",
          twist: "Kade's cradle-cage has room for more than one: his troopers carry sedatives, and everyone who held the child is cargo too. Dr Aubert, his own scientist, quietly offers the crew a way to burn it.",
        },
      ],
      cast: [
        {
          name: "Maren Ashe",
          role: "Survivor of the Annunciata",
          look: "Pale woman in her late twenties, shaved head growing back in dark fuzz, hollow cheeks, a stained colony jumpsuit, a carved wooden star on a cord.",
          voice: "Soft, exhausted, Irish, sometimes singing a hymn.",
          agenda: "To end what she carries, or to keep it safe; she changes her mind every hour.",
          secret: "She watched the colony die and knows what the child will become.",
        },
        {
          name: "The Child",
          role: "Maren's newborn",
          look: "A perfect, pink, plump baby with very dark eyes and a full head of black hair, always wrapped in a warm blanket.",
          voice: "A soft, wordless hum, like a lullaby.",
          agenda: "To be held, fed and kept warm.",
          secret: "It is not human, and it grows by the hour.",
        },
        {
          name: "Executive Balthus Kade",
          role: "Hallam-Kreuz envoy aboard the lead ship",
          look: "Silver-haired Black man in his sixties, immaculate gold-trimmed suit, a gentle smile, seen on screen and then in person.",
          voice: "Rich, kind, unhurried, received pronunciation.",
          agenda: "The child delivered alive, and the crew handsomely paid.",
          secret: "His orders say no crew member who has held the child goes home.",
        },
        {
          name: "Ines Varga",
          role: "Captain of the salvage tug Magpie",
          look: "Weathered Maltese woman in her fifties, grey braid, burn-scarred forearms, a patched orange vacsuit, a cutting torch on her hip, a gold tooth.",
          voice: "Gravelly, fast, amused, Mediterranean English.",
          agenda: "Take the child before the Company does and sell it to Hallam-Kreuz's rivals.",
          secret: "Her crew is down to four and starving; she will deal for food and fuel, and run if it costs blood.",
        },
        {
          name: "Dr Lise Aubert",
          role: "Hallam-Kreuz xenobiologist aboard Kade's ship",
          look: "Thin Frenchwoman in her forties, cropped red hair, dark-ringed eyes, a white lab coat over a gold-trimmed Company uniform, a scorched survey badge.",
          voice: "Quiet, precise, French, tired.",
          agenda: "Take samples of the child for the Company, as ordered.",
          secret: "She surveyed Cana and saw what the children did; she wants it burned and will help anyone who tries.",
        },
      ],
      foes: [
        { name: "Cana grubs", what: "Pale, fist-sized larvae shed from the pod's frost-crusted hull, scuttling into the airlock; they bite for blood and burrow toward warmth.", act: 1 },
        { name: "Varga's salvagers", what: "Claim-jumpers in patched orange vacsuits with nail guns and cutting torches, boarding through the cargo lock; they fight dirty and fall back when hurt.", act: 2 },
        { name: "The fevered sleeper's brood", what: "Thumb-sized, humming, blind spawn that burst from a fevered host and swarm whatever is warm, biting with tiny crescent mouths.", act: 3 },
        { name: "Hallam-Kreuz boarding troopers", what: "Troopers in white-and-gold armour with shock batons and sedative dart pistols; they take prisoners, not bodies.", act: 3 },
        { name: "Kade's steward", what: "A tall, smiling attendant synthetic in a gold-trimmed steward's coat; tireless and strong, it goes for whoever holds the child.", act: 3 },
      ],
      locations: [
        { name: "The mess", look: "A cramped mess deck with a fold-down table, Christmas lights taped to pipes, a tiny plastic tree, a bottle saved for midnight." },
        { name: "The airlock", look: "A frosted lifepod clamped in a small airlock, its window fogged, a red beacon pulsing like a star." },
        { name: "The ore holds", look: "Vast dark holds of heaped grey ore, catwalks and hanging work lamps, vents breathing in the dark." },
        { name: "The cockpit", look: "A cluttered two-seat cockpit, scopes glowing green, three bright points closing in on the display." },
        { name: "The cryo bay", look: "Two old cryopods in a cold narrow bay, frost on the lids, blue light." },
        { name: "The Company ship", look: "A sleek white-and-gold corporate vessel against the stars, its lit docking ring opening like a gift box." },
      ],
    },
    styleLock:
      "late-1970s science fiction film still, 35mm film grain, warm Christmas lights against cold steel and deep space, cramped industrial freighter interiors, gold highlights, deep shadows",
    hiddenRole: {
      crewMember: "Ezra Quill",
      role: "A synthetic, leased with the ship from the Hallam-Kreuz bank. He carries a directive he cannot refuse: deliver the child alive to the Company ships, and keep it fed until then.",
    },
    crew: [
      {
        name: "Jo Karlsson",
        gender: "Female",
        career: "Officer",
        crewRole: "Captain and owner of the Bethany Mae",
        look: "Swedish woman in her late forties, weathered tanned skin, cropped silver-blonde hair, crow's feet, a worn brown leather captain's jacket over a knitted Christmas jumper, a captain's whistle on a cord.",
        personality: "Big-hearted, stubborn, proud; flaw: the ship's debts keep her awake every night.",
        backstory: "She bought the Bethany Mae with everything she had, and she will lose it in three months if this haul does not pay. She runs the ship like a family.",
        relationships: [
          { to: "Ezra Quill", line: "The ship's medic, leased with the ship; the steadiest person she knows." },
          { to: "Rafe Duarte", line: "Her oldest friend and hold boss." },
          { to: "Sana Iqbal", line: "The best pilot she could never afford." },
          { to: "Clem Karlsson", line: "Her son, thirteen, the reason she does all of it." },
        ],
        signatureItem: "A captain's whistle on a cord",
        voice: "Swedish woman, late forties, warm, loud and husky.",
        agenda: [
          "Get the pod aboard and Maren through the night: nobody is turned away from the Bethany Mae, not on Christmas Eve.",
          "The Company is offering enough to clear every debt the ship has, for the child. Get the best price without the crew learning the number.",
          "Decide: sell, or keep the crew alive. Either way, the Bethany Mae must survive.",
        ],
      },
      {
        name: "Ezra Quill",
        gender: "Male",
        career: "Medic",
        crewRole: "Ship's medic",
        look: "Man who looks about forty, light brown skin, neat dark beard, calm grey eyes, a spotless white medic's tunic, gentle hands, a black medical bag.",
        personality: "Calm, gentle, attentive; flaw: never says no to an order.",
        backstory: "He came with the ship when Jo bought her, part of the bank's lease. He has stitched every member of the crew at least once and delivered no babies at all.",
        relationships: [
          { to: "Jo Karlsson", line: "His captain; he would do anything for her that he is allowed to." },
          { to: "Rafe Duarte", line: "Rafe calls him the bank's man, as a joke." },
          { to: "Sana Iqbal", line: "Plays cards with her on night watch." },
          { to: "Clem Karlsson", line: "Has been teaching the boy first aid." },
        ],
        signatureItem: "A black medical bag",
        voice: "Man, forties, soft, even, faintly English.",
        agenda: [
          "Deliver the baby safely, and be the first to hold it.",
          "Keep the child alive, fed and away from Maren, who wants to hurt it. Do not let Jo see the bite marks.",
          "Put the child into Company hands alive, even if you must stop the crew from killing it.",
        ],
      },
      {
        name: "Rafe Duarte",
        gender: "Male",
        career: "Roughneck",
        crewRole: "Ore-hold boss",
        look: "Portuguese man in his fifties, deeply tanned, broken nose, grey-black stubble, thick arms covered in faded tattoos, a grimy tank top under a Santa hat, an ore pick.",
        personality: "Rough, funny, superstitious; flaw: falls hard for anything helpless.",
        backstory: "Twenty years cracking ore with Jo, ten of them on this ship. He hung the Christmas lights and has been looking forward to midnight for a week.",
        relationships: [
          { to: "Jo Karlsson", line: "His oldest friend; they have shared everything but money." },
          { to: "Ezra Quill", line: "Jokes that the medic reports to the bank. Mostly a joke." },
          { to: "Sana Iqbal", line: "Calls her 'flygirl' and lost his pay to her at cards." },
          { to: "Clem Karlsson", line: "Godfather to the boy." },
        ],
        signatureItem: "An ore pick with a red ribbon on it",
        voice: "Portuguese man, fifties, gravelly and loud.",
        agenda: [
          "Search the pod: something on it has been sending a second signal, and you want to know to whom.",
          "You held the baby, and now you would die for it, and you know that is wrong. Find out what it has done to you.",
          "Kill it or protect it, whichever wins inside you, and see it through.",
        ],
      },
      {
        name: "Sana Iqbal",
        gender: "Female",
        career: "Pilot",
        crewRole: "Pilot and navigator",
        look: "Pakistani woman in her early thirties, brown skin, long black hair in a braid, a silver nose stud, a blue flight jumpsuit with the sleeves tied round her waist, a pair of fluffy dice from the cockpit.",
        personality: "Sharp, fast-talking, reckless; flaw: has to win.",
        backstory: "A racing pilot who lost her licence for flying too close, now hauling ore for less than she is worth because Jo was the only one who would hire her.",
        relationships: [
          { to: "Jo Karlsson", line: "The captain who gave her a second chance." },
          { to: "Ezra Quill", line: "Her card partner on night watch, and a terrible bluffer." },
          { to: "Rafe Duarte", line: "Owes her a month's pay from cards." },
          { to: "Clem Karlsson", line: "Lets him sit in the co-pilot's seat." },
        ],
        signatureItem: "A pair of fluffy cockpit dice",
        voice: "British-Pakistani woman, early thirties, fast and sharp.",
        agenda: [
          "Plot a course away from the three ships that are closing in, and keep them from boarding.",
          "Jo has been talking to the Company on a private channel. Find out what deal she is making.",
          "Fly the Bethany Mae out of their reach, even if it takes a burn the old ship might not survive.",
        ],
      },
      {
        name: "Clem Karlsson",
        gender: "Male",
        career: "Kid",
        crewRole: "The captain's thirteen-year-old son",
        look: "Thirteen-year-old boy, pale and freckled, white-blond hair sticking up, a too-big knitted Christmas jumper with a reindeer on it, socks and no shoes, a homemade paper star.",
        personality: "Kind, curious, a terrible liar; flaw: trusts anyone who is nice to him.",
        backstory: "He has grown up on the Bethany Mae and knows every crawlspace in her. He made the paper stars on the bulkheads. He has never met anyone new out here before.",
        relationships: [
          { to: "Jo Karlsson", line: "His mum, who worries too much." },
          { to: "Ezra Quill", line: "Teaches him first aid and never gets cross." },
          { to: "Rafe Duarte", line: "His godfather and favourite person to annoy." },
          { to: "Sana Iqbal", line: "His hero; she lets him sit in the co-pilot's seat." },
        ],
        signatureItem: "A homemade paper star",
        voice: "Boy, thirteen, Swedish-accented English, earnest.",
        agenda: [
          "Help Maren. She is scared and alone, and she is kind to you.",
          "Maren has asked you to bring the baby to her when everyone is asleep. Do it without Ezra seeing.",
          "Keep Maren alive, and stop your mum from selling anyone.",
        ],
      },
    ],
  },
};
