import type { WrittenScenario } from "@/lib/couch/scenarios/types";

// SPOILERS. The whole of a ready-made couch night: the truth, the threat,
// every crew member's secret agenda and the hidden role. If you mean to play
// it, stop reading here; the home screen shows its spoiler-free card
// (src/lib/couch/scenario-cards.ts).

export const SIXTY_FATHOMS: WrittenScenario = {
  id: "sixty-fathoms",
  reply: {
    scenario: {
      title: "Sixty Fathoms",
      logline: "A maintenance crew rides a diving bell down to a silent research station on an alien sea floor, where someone is still calling for help in a voice they know.",
      briefing:
        "The ocean moon Mareth. A storm has been raging on the surface for four days, and for three of them Benthic Station Lir, sixty fathoms down, has said nothing. The support ship Gannet has brought you, the maintenance crew, to the dive site. Your job: ride the diving bell down, dock at Lir's moon pool, restart the pumps and the uplink buoy, and bring up anyone who wants to come. Twelve staff are aboard. The storm will not let the Gannet recover the bell for six hours. As the bell's hatch seals, the station channel crackles: a calm woman's voice, asking for help.",
      setting:
        "Benthic Station Lir, a research station of linked steel modules on the sea floor of the ocean moon Mareth, 2203. Owned by the Pelagic Holdings Concern, under a defence contract.",
      truth:
        "Lir studied the cantor, an abyssal ambush predator of Mareth that lures prey by mimicking its sounds. Under a defence contract for sonar deception, Director Benedetti's team bred cantors larger in a pen and taught them human speech by piping in the station's radio traffic. During the storm he ordered the pen enlarged against advice, and it breached. The cantors have killed most of the staff through the moon pool and flooded sections, and they call on the station channel in the dead staff's voices to lure divers out. The calm woman on the radio is Dr. Anja Sorensen, dead two days. One true survivor, the junior tech Pell, hides in the decompression chamber and will not speak, because they listen and learn. Pelagic topside has ordered the Gannet to cut the tether if the crew bring back anything alive.",
      threat:
        "The cantor: a pale eel-like predator as long as a minibus, eyeless, with a swollen resonant skull, a lantern-like lure of blue light and a jaw that unhinges wide. It hunts by sound and mimics any voice it has heard, and it learns more with every word spoken near water. It cannot leave the water, but it reaches through moon pools, flooded corridors and open hatches in a lightning strike. Loud noise, sonar pings and explosive charges stun it; silence is safety. Tells: the station channel speaking in a dead person's voice, blue light in a flooded hatch, water that goes perfectly still.",
      acts: [
        {
          title: "The Descent",
          goal: "Ride the bell down, dock at Lir's moon pool, and get power and the uplink buoy running.",
          setPieces: [
            "The bell sinks through storm surge into black water as something huge brushes past the portholes.",
            "Docking at the moon pool while a woman's voice on the channel begs them to hurry.",
            "The dark station, water to the shins, a meal still on a table and every bunk empty.",
          ],
          escalation: "The voice on the channel calls one of the crew by name.",
          clock: "Six hours before the Gannet can recover the bell; the station's emergency air is failing module by module.",
          twist: "Lir's uplink buoy did not fail in the storm: it was cut loose from inside, on Director Benedetti's code, nine hours ago. Someone down here is alive, and did not want to be heard.",
        },
        {
          title: "Voices",
          goal: "Find the survivors and the truth, and reach the sealed acoustics lab.",
          setPieces: [
            "A tape recorder in the crew quarters playing hours of the staff saying single words, over and over.",
            "The pen bay: a huge window onto torn nets in floodlit murk, and blue lights circling slowly.",
            "A crew member's own voice on the channel, from a module they are not in.",
          ],
          escalation: "The cantors start speaking in the crew's voices, learned over the radio, and pull them apart.",
          clock: "The pumps are losing: each scene, the water rises a hand's breadth.",
          twist: "The pen held a breeding pair. The cantors' young are loose in the flooded modules, smaller and quicker than the adults, and they learn new voices faster.",
        },
        {
          title: "Surface Interval",
          goal: "Get topside alive, and decide what comes up with them: the archive, the director, the truth.",
          setPieces: [
            "Hours of compression time to burn in the decompression chamber while something knocks on the hull.",
            "A swim between flooded modules in total dark, nobody daring to speak.",
            "The bell's ascent with a cantor coiled around the tether.",
          ],
          escalation: "Captain Brann on the radio, ordered to cut the tether if anything alive comes up.",
          clock: "The bell's air for the ascent, and a surfacing too fast to survive.",
          twist: "Captain Brann refuses her order to cut the tether, so Pelagic has sent its own: the security cutter Tern has relieved the Gannet topside, and its divers are coming down for the archive, not the crew.",
        },
      ],
      cast: [
        {
          name: "Dr. Aurelio Benedetti",
          role: "Station director",
          look: "White Italian man in his sixties, white beard, soaked cardigan, a pistol he cannot hold steady.",
          voice: "Cultured Italian accent, cracking under strain.",
          agenda: "Save the acoustics archive and keep his name out of it.",
          secret: "He ordered the pen enlarged during the storm against his staff's advice.",
        },
        {
          name: "Dr. Anja Sorensen",
          role: "Marine acoustician, heard only on the station channel",
          look: "A Danish woman in her forties with short ash-blonde hair, seen only on a staff photo by the moon pool.",
          voice: "Calm, kind, Danish accent.",
          agenda: "To be rescued, she says.",
          secret: "She has been dead for two days.",
        },
        {
          name: "Pell Ruiz-Ahn",
          role: "Junior technician, hiding",
          look: "Mexican-Korean woman in her twenties, bleach-blond buzzcut, torn wetsuit, writes on a grease-pencil slate instead of speaking.",
          voice: "A barely audible whisper, Californian.",
          agenda: "Get out alive.",
          secret: "She knows they listen and learn: do not say your names near the water.",
        },
        {
          name: "Captain Hilde Brann",
          role: "Skipper of the support ship Gannet, on the radio",
          look: "Norwegian woman in her sixties, wind-burned face, yellow oilskins, heard over the crackle of the storm.",
          voice: "Gruff, Norwegian, steady.",
          agenda: "Get the crew back safe.",
          secret: "Pelagic has ordered her to cut the tether if the crew bring anything alive up with them.",
        },
        {
          name: "Lieutenant Corrie Mbatha",
          role: "Commander of the Pelagic security cutter Tern",
          look: "South African woman in her forties, cropped grey hair, a black Pelagic drysuit with silver rank bars, a dive mask pushed up on her head, a pistol in a chest holster.",
          voice: "Clipped, courteous, Johannesburg accent, never raised.",
          agenda: "Recover the acoustics archive and Director Benedetti, and make sure nothing else from Lir reaches the surface.",
          secret: "Her orders are to set demolition charges on Lir and log it lost in the storm, maintenance crew included.",
        },
      ],
      foes: [
        { name: "Haywire hull-crawler drone", what: "A crab-legged repair drone gone wrong on failing power, scuttling over the moon pool walls and lashing out with a blinding arc-welder at anything that moves.", act: 1 },
        { name: "Cantor young", what: "Pale eyeless eels the length of a man, blue lures flickering, that lunge in pairs from flooded hatches and squeal back half-learned words; noise and a hard blow drive them off.", act: 2 },
        { name: "Director Benedetti, cornered", what: "Soaked and shaking, firing his pistol at anyone who reaches for the archive; dangerous to stand in front of, easy to disarm if someone keeps him talking.", act: 2 },
        { name: "Pelagic security diver", what: "Black drysuit, mirrored full-face mask, spear gun and shock prod; comes down the tether to take the archive and seal the crew below.", act: 3 },
        { name: "Pelagic charge drone", what: "A torpedo-shaped tethered drone with one floodlight eye and a manipulator arm, gliding through flooded modules and laying demolition charges on the hull.", act: 3 },
      ],
      locations: [
        { name: "The diving bell", look: "A cramped yellow steel sphere, three portholes, condensation dripping, a tether winch and a sonar screen glowing green." },
        { name: "The moon pool", look: "A square of perfectly black water in the floor of a steel chamber under sodium lights, a dive ladder going down." },
        { name: "Station corridors", look: "Narrow dripping steel tubes lit emergency red, water sloshing at shin height, hatches every few metres." },
        { name: "The pen bay", look: "A huge curved window onto torn nets and floodlit murky water, slow blue lights circling beyond." },
        { name: "The acoustics lab", look: "A sealed bulkhead room of tape reels, waveform screens and speaker cones, cables everywhere." },
        { name: "Decompression chamber", look: "A round steel chamber with bunks, a big brass pressure gauge, and one small porthole onto the dark." },
      ],
    },
    styleLock:
      "late-1970s science fiction film still, 35mm film grain, emergency red and sodium orange practical lighting, cramped wet steel underwater interiors, murky blue-green water, deep shadows",
    hiddenRole: {
      crewMember: "Yi-ling Sun",
      role: "A Pelagic synthetic who knows what she is and hides it. Her directive: recover the acoustics archive, and make sure the cantor program never becomes public.",
    },
    crew: [
      {
        name: "Tor Eide",
        gender: "Male",
        career: "Roughneck",
        crewRole: "Saturation diver and crew chief",
        look: "White Norwegian man in his fifties, weathered red face, grey stubble, bald head under a black wool watch cap, barrel-chested, a scarred neoprene drysuit, a heavy dive knife strapped to his calf.",
        personality: "Steady, gruff, stubbornly decent; flaw: cannot let go of the past.",
        backstory: "Thirty years of commercial diving on three worlds, the man every maintenance crew wants as chief. He took this job without asking much about it. His ex-wife, Dr. Anja Sorensen, took a posting at Lir a year ago.",
        relationships: [
          { to: "Yi-ling Sun", line: "His bell pilot for two years; he trusts her with his life." },
          { to: "Ify Bassey", line: "Bosses him about his blood pressure and wins." },
          { to: "Hamid Rostami", line: "Thinks the scientist asks too many questions for a passenger." },
          { to: "Ash Moreau", line: "Does not like having a gun on a dive." },
        ],
        signatureItem: "A heavy dive knife",
        voice: "Norwegian man, fifties, low, slow and gruff.",
        agenda: [
          "Get Lir's pumps and uplink buoy running: the crew's pay depends on a finished job.",
          "The voice on the channel is your ex-wife Anja's. Find her, whatever the others say.",
          "Find out who is responsible for what happened to Anja, and make them answer for it.",
        ],
      },
      {
        name: "Yi-ling Sun",
        gender: "Female",
        career: "Pilot",
        crewRole: "Diving bell pilot",
        look: "Chinese woman in her thirties, light skin, sleek black bob, small and composed, a fitted teal drysuit, a headset slung around her neck.",
        personality: "Calm, exact, warm in small ways; flaw: never says what she is thinking.",
        backstory: "She flies the bell for Tor's crew and has never made a bad descent. Two years together and none of the crew knows where she is from. She is the steadiest hand any of them has met.",
        relationships: [
          { to: "Tor Eide", line: "Her chief; she would rather not have to lie to him." },
          { to: "Ify Bassey", line: "Ify keeps trying to give her a check-up, and she keeps finding reasons not to." },
          { to: "Hamid Rostami", line: "Recognised his name on a list she was given." },
          { to: "Ash Moreau", line: "Both of them came on this job with orders, and both know it." },
        ],
        signatureItem: "A bell pilot's headset",
        voice: "Woman, thirties, quiet Mandarin-accented English, very precise.",
        agenda: [
          "Keep the bell ready and the crew together, and let nobody use the long-range radio until you have seen the lab.",
          "Get into the acoustics lab alone and copy the archive before Tor or anyone else sees what is on it.",
          "Bring the archive topside. If the crew mean to make it public, the bell goes up without them.",
        ],
      },
      {
        name: "Ify Bassey",
        gender: "Female",
        career: "Medic",
        crewRole: "Dive medic",
        look: "Nigerian woman in her forties, dark skin, short natural hair under a red bandana, solid build, a black drysuit with a white medic's cross, a waterproof medical case.",
        personality: "Brisk, funny, unshakeable; flaw: will not leave anyone behind, ever.",
        backstory: "A former navy dive doctor who has treated the bends on six oceans. She runs the crew's decompression tables and will fight anyone who cheats them. She has heard rumours about Lir's injury reports.",
        relationships: [
          { to: "Tor Eide", line: "Old friend; she was at his wedding to Anja." },
          { to: "Yi-ling Sun", line: "Has never managed to take her pulse, which bothers her more than she says." },
          { to: "Hamid Rostami", line: "Likes him; he is the only one who reads her safety notes." },
          { to: "Ash Moreau", line: "Has patched up mercenaries before, and did not enjoy it." },
        ],
        signatureItem: "A waterproof medical case",
        voice: "Nigerian woman, forties, warm, brisk and commanding.",
        agenda: [
          "Keep everyone's decompression honest, nobody surfaces too fast on your watch, and get a look at the station's medical logs.",
          "The medical logs show staff were hurt by an animal weeks ago and Director Benedetti buried it. Get proof that will stand up.",
          "Get every living person, Pell and Benedetti included, up the tether alive, even the ones who do not deserve it.",
        ],
      },
      {
        name: "Hamid Rostami",
        gender: "Male",
        career: "Scientist",
        crewRole: "Marine biologist on a government permit",
        look: "Iranian man in his early thirties, olive skin, curly black hair, thick-rimmed glasses, lanky, a yellow drysuit too big for him, an underwater recorder clipped to his chest.",
        personality: "Eager, kind, easily awed; flaw: will risk anything for a discovery.",
        backstory: "An independent marine biologist with a government permit to inspect Lir's specimens. The station's paperwork lists nothing larger than a dinner plate. He has wanted to see Mareth's deep water all his life.",
        relationships: [
          { to: "Tor Eide", line: "Thinks Tor is the bravest man he has met." },
          { to: "Yi-ling Sun", line: "She looked at his permit as if she had seen it before." },
          { to: "Ify Bassey", line: "The only one who laughs at his jokes." },
          { to: "Ash Moreau", line: "Unsettled that a scientist's job needs a gun." },
        ],
        signatureItem: "An underwater sound recorder",
        voice: "Iranian-Canadian man, thirties, fast and enthusiastic.",
        agenda: [
          "Find out what Lir was really keeping in its pen; the permits list nothing larger than a dinner plate.",
          "Record a living cantor speaking: proof of the most important discovery of the century.",
          "Get your proof topside, even if Pelagic wants it buried, and keep it out of Yi-ling's hands.",
        ],
      },
      {
        name: "Ash Moreau",
        gender: "Nonbinary",
        career: "Marine",
        crewRole: "Pelagic security contractor, ex-colonial marine",
        look: "French person in their late twenties, pale skin, shaved head with a scar over one ear, wiry and tense, a black tactical drysuit, a short-barrelled harpoon rifle.",
        personality: "Cool, sardonic, alert; flaw: always for sale.",
        backstory: "Six years in the colonial marines, then private security for whoever pays. Pelagic sent them down with the crew to secure the station and its director. Nobody else asked for them.",
        relationships: [
          { to: "Tor Eide", line: "The chief who did not want them, and said so." },
          { to: "Yi-ling Sun", line: "Both came with orders; they suspect hers are worse." },
          { to: "Ify Bassey", line: "The medic who patched them up and lectured them for it." },
          { to: "Hamid Rostami", line: "Finds his wide-eyed wonder exhausting, and oddly endearing." },
        ],
        signatureItem: "A short-barrelled harpoon rifle",
        voice: "French person, late twenties, flat and dry.",
        agenda: [
          "Your contract says secure the armoury and the director: find Benedetti and keep him alive.",
          "Benedetti offers you a fortune to get him and his archive out quietly. Get him to the bell, and keep Ify from talking to him.",
          "Decide who is really paying you, Benedetti, Pelagic or your own conscience, and get that one to the surface.",
        ],
      },
    ],
  },
};
