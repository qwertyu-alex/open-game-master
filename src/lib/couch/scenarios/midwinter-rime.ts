import type { WrittenScenario } from "@/lib/couch/scenarios/types";

// SPOILERS. The whole of a ready-made couch night: the truth, the threat,
// every crew member's secret agenda and the hidden role. If you mean to play
// it, stop reading here; the home screen shows its spoiler-free card
// (src/lib/couch/scenario-cards.ts).

export const MIDWINTER_RIME: WrittenScenario = {
  id: "midwinter-rime",
  reply: {
    scenario: {
      title: "Midwinter at Rime Station",
      logline: "On Christmas Eve at the edge of a world's endless night, the supply sleigh crashes on the ice, the wind starts ringing like bells, and the director is making a list.",
      briefing:
        "Christmas Eve, 2201. Rime Station sits on the ice at the edge of Hesper's night side, where the sun never rises. Once a year, at midwinter, Northlight's supply drone flies in with parts, fuel, and presents from home. The crew call it the sleigh. Tonight it came in off course and went down on the ice two kilometres out, its beacon blinking red. A storm front is coming in behind it. Director Halloran has hung tinsel in the galley, put a turkey in the oven, and asked you to take the tracked hauler, bring the sleigh's crates home before the storm, and be back in time for dinner. Out on the ice, the wind has started to sound like bells.",
      setting:
        "Rime Station, a research outpost of eleven on the night side of the tidally locked world Hesper, 2201. Owned by Northlight Consolidated.",
      truth:
        "Every Hesper midwinter a migratory predator, the rimewalker, crosses this stretch of ice. Northlight sited Rime on its path to capture one alive. Thirty years ago the station's first crew vanished on midwinter night and the Company called it a storm. Director Halloran keeps a list: the crew with the most Company demerits, the naughty list, chosen to be left out at the bait stakes on the ice tonight. The sleigh carries no presents: its crates hold a capture cage, tranquilliser harpoons and bait beacons. Halloran had its flight plan changed to drop it on the walker's path, to draw the crew out early.",
      threat:
        "The rimewalker: three metres tall, pale as frost, on stilt-thin legs, with a branching crest of antler-like sensory horns. Ice crystals in its shaggy coat chime like sleigh bells. It climbs down heat stacks and chimneys toward warmth, takes people alive into a sack-like belly pouch where they sleep, cold and sedated, and stores them in an ice-cave larder for the long night. It does not see what keeps perfectly still. Flame scorches it and drives it back. Tells: bells in the wind, three-toed hoarfrost tracks, soot scraped clean from the exhaust stack.",
      acts: [
        {
          title: "The Sleigh",
          goal: "Reach the crashed supply drone on the ice and bring its crates home before the storm.",
          setPieces: [
            "The hauler's crawl through the blizzard while bells ring somewhere close.",
            "Opening the crates: a cage, harpoons and bait beacons where the presents should be.",
            "A second, older drone wreck nearby, its gifts frozen in their wrapping for thirty years.",
          ],
          escalation: "On the drive back, someone outside the hauler is taken, and their radio stays on.",
          clock: "The storm front closes the ice within the hour.",
          twist: "The bait beacons in the sleigh's crates switched on when it hit the ice and have been calling ever since: the crash site is a lure, and the hauler is the warmest thing on it.",
        },
        {
          title: "The List",
          goal: "Learn what Northlight is doing, find the list, and find out where the taken went.",
          setPieces: [
            "Christmas dinner in the galley, interrupted by soot falling from the heat stack.",
            "Halloran's office: the list of names, the thirty-year-old logbook, the capture plan.",
            "Old Petra's carol, sung low, about the tall one who comes down when the fire is lit.",
          ],
          escalation: "Halloran locks the outer doors with some of the crew on the wrong side of them.",
          clock: "The bait stakes are to be manned by midnight.",
          twist: "The Board's latest transmission puts Halloran's own name on the list unless the cage is full by midnight. The jolly director stops pretending, and starts herding.",
        },
        {
          title: "Christmas Morning",
          goal: "Survive until the midwinter twilight, rescue the taken from the larder, and decide whether Northlight gets its prize.",
          setPieces: [
            "The ice-cave larder: people hanging in frost, asleep and alive.",
            "The bait stakes under floodlights, the cage open, the bells coming closer.",
            "The brief grey twilight of Christmas morning, when the walker moves on.",
          ],
          escalation: "The generator fails, every heater goes out, and the station becomes the warmest dark thing on the ice.",
          clock: "Six hours to the twilight, and the generator's last fuel.",
          twist: "The larder holds more than tonight's taken: among the frosted sleepers hangs a woman in a thirty-year-old Northlight parka, still faintly breathing. Petra's mother.",
        },
      ],
      cast: [
        {
          name: "Director Conrad Halloran",
          role: "Station director",
          look: "White man in his sixties, rosy cheeks, neatly trimmed white beard, round belly, a red Northlight parka trimmed with white fur, half-moon glasses.",
          voice: "Hearty, jolly, warm, Canadian.",
          agenda: "A rimewalker caged alive by morning, and his retirement.",
          secret: "He wrote the list, and had the sleigh's flight plan changed.",
        },
        {
          name: "Petra Lund",
          role: "Station cook",
          look: "Tiny Swedish woman in her seventies, white braid, a flour-dusted apron over a heavy jumper, a wooden spoon.",
          voice: "Small, cracked, Swedish, often singing.",
          agenda: "Get everyone through the night with the oven lit.",
          secret: "Her mother was on the first crew thirty years ago; she came to Rime to find out what happened.",
        },
        {
          name: "Felix Garrow",
          role: "Junior technician",
          look: "Cheerful Black British man in his twenties, short twists, a Christmas jumper under his parka, reindeer antlers on his hat.",
          voice: "Bright south London, then a faint, sleepy whisper over the radio.",
          agenda: "Get home.",
          secret: "He is alive in the walker's larder, and his radio is still on.",
        },
        {
          name: "Northlight Board",
          role: "The Company, by delayed transmission",
          look: "A boardroom of grey suits on a crackling screen, the Northlight star logo behind them.",
          voice: "Several calm voices speaking as one, American.",
          agenda: "One live specimen.",
          secret: "They have written off the station's crew as an acceptable cost.",
        },
        {
          name: "Sabine Ruel",
          role: "Leader of Northlight's capture team, landing at midnight",
          look: "French-Canadian woman in her forties, weathered tan face, a scar through one eyebrow, white snow armour, goggles, a tranquilliser harpoon gun slung on her back.",
          voice: "Low, tired, Quebecois accent, very few words.",
          agenda: "Cage the rimewalker alive by twilight, using whatever bait the station gives her.",
          secret: "She lost a whole team to a walker on another world, and her hands have not stopped shaking since.",
        },
      ],
      foes: [
        { name: "Northlight harpoon drone", what: "A squat four-rotor drone from the sleigh's crates, woken by the bait beacons; it hunts by heat through the blizzard and fires tranquilliser harpoons on cables.", act: 1 },
        { name: "Halloran's loader", what: "A burly station hand in a red Northlight parka with a flare gun and a tranquilliser rifle, sent by the director to walk listed crew out to the bait stakes.", act: 2 },
        { name: "Director Halloran, armed", what: "Rosy-cheeked and jolly in his fur-trimmed parka, a flare pistol in one hand and the outer-door keys in the other; he talks kindly while he locks you out.", act: 2 },
        { name: "Northlight capture hunter", what: "One of Ruel's team in white snow armour and fogged goggles, with a tranquilliser harpoon gun and a weighted net; anyone in the way of the cage is bait.", act: 3 },
        { name: "Larder waker", what: "A taken colonist woken too fast in the ice cave, frost-blind and frostbitten, clawing and screaming at rescuers in the blue dark before they know them.", act: 3 },
      ],
      locations: [
        { name: "The galley", look: "A warm, low galley strung with tinsel and coloured bulbs, a plastic tree, a roast in the oven, a heat stack rising through the ceiling." },
        { name: "The ice field", look: "Black ice under a starless sky, a blizzard in floodlights, a red beacon blinking on a wrecked cargo drone." },
        { name: "The tracked hauler", look: "A cramped orange snow-hauler cab, frosted windscreen, wipers fighting the snow, a radio hissing." },
        { name: "Halloran's office", look: "A wood-panelled office with a fake fireplace, a framed Northlight star, files and a ledger on the desk." },
        { name: "The larder", look: "A blue ice cave hung with frost-covered sleeping figures, breath faintly misting." },
        { name: "The bait stakes", look: "A row of steel posts with chains on the ice under floodlights, an open cage beside them." },
      ],
    },
    styleLock:
      "late-1970s science fiction film still, 35mm film grain, warm Christmas-bulb red and green against cold blue snow light, cramped polar research station interiors, blizzards, deep shadows",
    hiddenRole: {
      crewMember: "Mattias Krey",
      role: "Northlight's man on the ice. He holds a copy of the director's list, and his orders are to see the listed crew out at the bait stakes by midnight so the rimewalker can be caught alive.",
    },
    crew: [
      {
        name: "Ingrid Solberg",
        gender: "Female",
        career: "Scientist",
        crewRole: "Glaciologist",
        look: "Norwegian woman in her forties, wind-burned pale skin, white-blonde hair in two plaits, ice-blue eyes, a red knitted hat with a pompom, a heavy yellow expedition parka, an ice axe.",
        personality: "Fearless, curious, funny; flaw: trusts the ice more than people.",
        backstory: "Four winters at Rime drilling ice cores, the station's longest-serving scientist. She has always wondered why Northlight pays so much for so little science.",
        relationships: [
          { to: "Mattias Krey", line: "Mattias kept her unlogged hauler run last winter out of the demerit book, and she owes him one favour, no questions asked." },
          { to: "Haldor Brekke", line: "Haldor pulled her out of a crevasse her first winter, and she swore she would go out on the ice for him any night." },
          { to: "Noor Haddad", line: "She paid the last of Noor's medical-school fees and has never once asked for it back." },
          { to: "Wynn Calder", line: "Wynn took the demerit for flying her to the far drill site through a whiteout, and she has never paid them back." },
        ],
        signatureItem: "An ice axe with her name burned into the handle",
        voice: "Norwegian woman, forties, cheerful and blunt.",
        agenda: [
          "Recover the supply drone before the storm: your ice-core drill parts are on it.",
          "The thirty-year-old logbook says the first crew vanished on midwinter night and the Company knew. Get it to Mattias before Halloran burns it.",
          "Get the logbook's truth off Hesper, even if it means Northlight never gets its prize.",
        ],
      },
      {
        name: "Mattias Krey",
        gender: "Male",
        career: "Officer",
        crewRole: "Deputy director of Rime Station",
        look: "German man in his late thirties, pale with dark stubble, black hair combed back, tall and lean, a navy Northlight officer's parka, a leather-bound notebook.",
        personality: "Courteous, controlled, quietly ambitious; flaw: always follows orders.",
        backstory: "Two years as Halloran's deputy and his likely successor. He runs the station's rotas and keeps the demerit book. The crew think he is cold but fair.",
        relationships: [
          { to: "Ingrid Solberg", line: "He kept her unlogged hauler run last winter out of the demerit book, and Ingrid owes him a favour, no questions asked." },
          { to: "Haldor Brekke", line: "Haldor carried him out of the fume-filled generator shed, and Mattias wrote him up for the broken door next morning." },
          { to: "Noor Haddad", line: "Noor nursed him through the winter flu, and he promised her a clean page in the demerit book for it." },
          { to: "Wynn Calder", line: "He signed tonight's sleigh flight plan and gave Wynn his word it was the usual route." },
        ],
        signatureItem: "A leather-bound notebook",
        voice: "German man, late thirties, quiet, measured, polite.",
        agenda: [
          "Keep the crew from opening the sleigh's crates until the director says so.",
          "Get the people on the list outside after dark, on any excuse, and keep yourself off it.",
          "Make sure the capture works: the rimewalker caged and alive by morning, whatever it costs.",
        ],
      },
      {
        name: "Haldor Brekke",
        gender: "Male",
        career: "Roughneck",
        crewRole: "Generator and plant technician",
        look: "Huge Icelandic man in his fifties, red-grey beard down to his chest, ruddy face, a knitted wool jumper and greasy overalls, a heavy flashlight.",
        personality: "Gruff, loyal, sentimental; flaw: a temper with a long fuse and a big bang.",
        backstory: "He keeps the generator alive through the long night, and it has never once failed on his watch. He took Felix, the junior tech, under his wing like a son.",
        relationships: [
          { to: "Ingrid Solberg", line: "He pulled Ingrid out of a crevasse her first winter, and she swore she would come out on the ice for him the same way." },
          { to: "Mattias Krey", line: "He carried Mattias out of the fume-filled generator shed, and got written up for the broken door the next morning." },
          { to: "Noor Haddad", line: "Noor kept his broken hand off the books so he kept his post, on his promise to stay off the ice until it heals." },
          { to: "Wynn Calder", line: "He taught Wynn to keep the hauler alive, and they promised him its keys any night he asks, no questions." },
        ],
        signatureItem: "A heavy steel flashlight",
        voice: "Icelandic man, fifties, deep, rumbling, slow.",
        agenda: [
          "Keep the generator running through the storm: if it fails, everyone freezes.",
          "Felix was taken, and you can hear him on the radio from somewhere out on the ice. Go and get him, whoever says no.",
          "Bring Felix home alive, and settle up with Halloran.",
        ],
      },
      {
        name: "Noor Haddad",
        gender: "Female",
        career: "Medic",
        crewRole: "Station medic",
        look: "Lebanese woman in her early thirties, olive skin, dark eyes, black hair in a messy bun, a red-and-white medic's parka, a stethoscope and a thermos.",
        personality: "Warm, sharp, principled; flaw: cannot leave a question alone.",
        backstory: "Her first winter on the ice. She took the post to pay off medical school. Last week the director requisitioned every sedative in her infirmary, and would not say why.",
        relationships: [
          { to: "Ingrid Solberg", line: "Ingrid paid the last of her medical-school fees, and Noor has not yet paid back a single krone." },
          { to: "Mattias Krey", line: "She nursed Mattias through the winter flu, and he promised to keep her name out of the demerit book." },
          { to: "Haldor Brekke", line: "She hid Haldor's broken hand from the director so he kept his post, on his promise to stay off the ice until it heals." },
          { to: "Wynn Calder", line: "On her first night she and Wynn swore to tell each other first anything they learn about the director." },
        ],
        signatureItem: "A thermos of cardamom coffee",
        voice: "Lebanese woman, thirties, warm and quick.",
        agenda: [
          "Find out why the director has requisitioned every sedative on the station.",
          "You are on the list. Find out what it means, and do not let Mattias know you have seen it.",
          "Get everyone on the list, yourself included, through the night alive.",
        ],
      },
      {
        name: "Wynn Calder",
        gender: "Nonbinary",
        career: "Pilot",
        crewRole: "Drone pilot and hauler driver",
        look: "Scottish person in their mid-twenties, pale and freckled, shaggy copper hair, a nose ring, a battered green flight parka covered in patches, fingerless gloves, a drone controller on a strap.",
        personality: "Quick, irreverent, proud of their flying; flaw: takes every mistake personally.",
        backstory: "They fly Rime's drones and drive its hauler, and they have brought the sleigh in clean a hundred times. Tonight it came down two kilometres off course, and they are sure they did nothing wrong.",
        relationships: [
          { to: "Ingrid Solberg", line: "Took the demerit for flying Ingrid through a whiteout to the far drill site; she calls them 'kid' and still owes them." },
          { to: "Mattias Krey", line: "Mattias signed tonight's sleigh flight plan and swore it was the usual route; they flew it on his word." },
          { to: "Haldor Brekke", line: "Haldor taught them to keep the hauler alive, and they promised him its keys any night he asks." },
          { to: "Noor Haddad", line: "Swore with Noor on her first night to tell each other first anything they learn about the director." },
        ],
        signatureItem: "A drone controller on a strap",
        voice: "Scottish, mid-twenties, fast, dry and sardonic.",
        agenda: [
          "Find out why the sleigh came in off course: you have flown that route clean a hundred times.",
          "Someone changed the sleigh's flight plan to drop it on the walker's path. Find out whether it was Mattias.",
          "Get the hauler to the landing strip at twilight, with everyone who is left aboard it.",
        ],
      },
    ],
  },
};
