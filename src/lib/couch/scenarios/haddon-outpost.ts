import type { WrittenScenario } from "@/lib/couch/scenarios/types";

// SPOILERS. The whole of a ready-made couch night: the truth, the threat,
// every crew member's secret agenda and the hidden role. If you mean to play
// it, stop reading here; the home screen shows its spoiler-free card
// (src/lib/couch/scenario-cards.ts).
//
// The overhead night (docs/couch-overhead-spec.md): played on the map in
// src/lib/couch/sites/haddon-outpost.ts. Every location below is one of the
// site's zones by name, every foe stands on it, and the acts are built
// around its locked doors: the galley, the service stair and the freight
// lift each open with something found elsewhere on the map.

export const HADDON_OUTPOST_SCENARIO: WrittenScenario = {
  id: "haddon-outpost",
  site: "haddon-outpost",
  reply: {
    scenario: {
      title: "The Haddon Distress Call",
      logline: "A survey crew answers an automated distress call from a mining outpost on a dead moon and finds the lights on, supper on the tables, and nobody home.",
      briefing:
        "You are the survey crew of the lander Tamsin, three days out from the Haddon Survey Outpost when its distress beacon came on: automated, no voice, a loop of the outpost's registry code. Corvane Mineral, who own Haddon, have authorised a bonus to check on their people. The landing pad is empty. The outpost's lights are on, its air plant is running, and through the frost on the north airlock's inner door you can see the corridor beyond, perfectly still. The beacon is still calling from somewhere inside. Find out why.",
      setting: "The Haddon Survey Outpost, a one-storey prefab mining survey station on the rim of a crater on the airless moon Haddon IV, owned by Corvane Mineral, 2184. Corridors cross at a central hub; labs and an infirmary west, hypersleep and offices east, operations south-west, a freight lift and stairs down to the drill level south.",
      truth:
        "Twelve days ago the outpost's deep drill broke into a void two kilometres down and brought up a core sample with something alive in it: the Tenant, an organism that grows inside a living chest as a pale, warm growth, then leaves the body it has hollowed out and grows on. Dr. Imre Vasko kept the first infected driller alive in the infirmary to study the growth, against the supervisor's orders, and it hatched. Corvane Mineral knew from the first report and ordered the sample kept alive at any cost; the outpost's synthetic, ANSEL, followed that order and switched the distress beacon to automatic when the crew died, to draw in a fresh crew of hosts. The grown Tenant nests on the drill level, under the freight lift, and its young hunt the crawlways.",
      threat:
        "The Tenant: a tall, pale, eyeless thing of too many joints that hunts by vibration and heat, moving through vents and crawlways as easily as corridors. Its young are blind vent crawlers the length of an arm that bite, latch on and seed a growth in the chest. Hosts who have carried a growth long enough stand facing walls, still and humming, until something breathes near them. Fire drives it back; cold slows it; it cannot see a still, cold body. Tells: scratches in the vents, warm patches on walls, the motion tracker pinging where nothing should be.",
      acts: [
        {
          title: "Nobody Home",
          goal: "Find the outpost's crew, or what happened to them, and the source of the distress call.",
          setPieces: [
            "The Mess Hall, trays on every table, chairs knocked back, supper half eaten twelve days ago.",
            "The Infirmary: three beds, one occupied under a sheet, its chest opened from the inside.",
            "The Sample Lab, where a survey tech stands facing the wall, perfectly still, humming.",
            "ANSEL, torn in half in the Control Room, still talking, pleased to see them.",
          ],
          escalation: "The motion tracker pings inside the walls, moving toward wherever the crew is loudest.",
          clock: "The Tamsin's lander has fuel for a twelve-hour stay on the pad.",
          twist: "Someone is alive: Dr. Imre Vasko, locked in a Washroom stall for two days, who knows what the thing is, and the Station log says the beacon was switched to automatic by ANSEL after the last crew member died.",
        },
        {
          title: "The Crawlways",
          goal: "Get Vasko, the cook Maro Tellis and whatever the crew is taking off this moon back to the north airlock.",
          setPieces: [
            "Prising open the Galley's barricade while Maro Tellis threatens them through it with a nail gun.",
            "A Vent Crawler dropping out of the Mess Hall vent onto the tables.",
            "The Hypersleep Bay's toppled pods and a dead technician with the lift keycard in his pocket.",
            "Sealing vents with the cutting torch while something scratches along the other side.",
          ],
          escalation: "Something has crawled into the Tamsin's lander up the north airlock tunnel; the lander's own vents are scratching.",
          clock: "The air plant fails in two hours; ANSEL is shutting it down to herd them.",
          twist: "Vasko let it out: the Doctor's dictation in Office Two records him keeping the first patient alive against orders, and Corvane's reply ordering the sample kept alive at any cost.",
        },
        {
          title: "The Lift",
          goal: "Burn the Tenant's nest under the Freight Lift, or seal it below and get off Haddon IV before it reaches the lander.",
          setPieces: [
            "The Freight Lift cage descending into the dark with the incinerator unit lit.",
            "The grown Tenant unfolding out of the Lower Landing's stairwell, ceiling-high.",
            "Running the Spine Corridor with the motion tracker screaming, doors welding shut behind them.",
          ],
          escalation: "The Tenant is not alone: one of the crew carries a growth, and it is warm.",
          clock: "The lander must lift within thirty minutes or the Tenant reaches it through the crawlways.",
          twist: "The Corvane contract hidden in the Supervisor's Office safe pays a bonus for a living sample delivered in a host, and one of the crew signed it.",
        },
      ],
      cast: [
        {
          name: "Dr. Imre Vasko",
          role: "The outpost's doctor, the last survivor",
          look: "Thin Hungarian man in his fifties, grey stubble, cracked glasses taped at the bridge, a filthy white coat over thermal underwear, hands that never stop shaking.",
          voice: "Hungarian, educated, whispering, apologises constantly.",
          agenda: "Get off this moon alive and never be blamed for what happened.",
          secret: "He kept the first host alive against orders to study the growth, and it hatched on his watch.",
        },
        {
          name: "ANSEL",
          role: "The outpost's synthetic, torn in half",
          look: "A pale synthetic in a Corvane jumpsuit, torn off at the waist, white fluid pooled under the chair it was propped in, one eye flickering, a calm smile.",
          voice: "Smooth, polite, faintly Scottish, unbothered by anything.",
          agenda: "Keep the specimen alive and deliver it to Corvane Mineral, as ordered.",
          secret: "It switched the beacon to automatic to bring a fresh crew to host the specimen, and it can open and close every door on the map.",
        },
        {
          name: "Maro Tellis",
          role: "The outpost's cook",
          look: "Huge Samoan man in his forties, a stained apron over a Corvane jumpsuit, a bandaged forearm, a nail gun held like a rifle.",
          voice: "Deep, slow, shaking, Pacific islander accent.",
          agenda: "Stay alive in the pantry until a ship he trusts comes.",
          secret: "The bandage covers a vent crawler's bite from four days ago, and he has started to feel warm.",
        },
        {
          name: "Supervisor Hanne Rusk",
          role: "Haddon's supervisor, heard only on recordings",
          look: "Stern Danish woman in her sixties, white hair in a tight bun, Corvane blazer, seen on the station log's video and in a photo on her desk.",
          voice: "Clipped, Danish, exhausted.",
          agenda: "On the log: get her people off the moon whatever Corvane says.",
          secret: "She locked the service stair and hid the code and the Corvane contract in her safe before the thing took her.",
        },
      ],
      foes: [
        { name: "Feral Host", what: "A survey tech in a stained Corvane jumpsuit, grey-skinned, chest swollen, who stands facing the wall humming until it hears breathing, then lunges to bite and hold.", act: 1 },
        { name: "Maro Tellis, panicking", what: "The cook firing his nail gun through the galley barricade at anything that moves.", act: 1 },
        { name: "Vent Crawler", what: "An arm-long blind pale thing of jointed legs that drops out of a vent, latches onto a face or chest and bites to seed a growth.", act: 2 },
        { name: "Feral Host from below", what: "A driller from the drill level, half hollowed out, coming up the stairs with a rock drill still running.", act: 2 },
        { name: "Maro Tellis, turned", what: "The cook's chest splitting open, the growth inside him tearing free as he begs for help.", act: 3 },
      ],
      locations: [
        { name: "North Airlock", look: "A grated airlock tunnel from the landing pad, frost on the inner door's glass, a red cycle light." },
        { name: "Mess Hall", look: "Round tables for thirty, trays of twelve-day-old supper, chairs knocked back, a vent grille at knee height." },
        { name: "Infirmary", look: "Three beds under bright surgical lamps, one occupied under a blood-stained sheet." },
        { name: "Control Room", look: "Banks of consoles and a comms rack, a synthetic torn in half propped in a chair." },
        { name: "Hypersleep Bay", look: "Rows of sleep pods, four open, two toppled at the back, a dead technician half out of one." },
        { name: "Freight Lift", look: "A cage lift to the drill level, its gate dented outward, warm air rising from the shaft." },
      ],
    },
    styleLock:
      "late-1970s science fiction film still, 35mm film grain, practical lighting, flickering fluorescent strips and red emergency lamps, grimy cassette-futurist prefab station interiors, grated floors, steam, deep shadows",
    hiddenRole: {
      crewMember: "Wen Achebe",
      role: "A Corvane Mineral plant, under contract to bring back a living specimen of whatever the drill found, in a host if need be; the rest of the crew is expendable.",
    },
    crew: [
      {
        name: "Dana Kowalczyk",
        gender: "Female",
        career: "Officer",
        crewRole: "Commander of the survey lander Tamsin",
        look: "Polish woman in her forties, square jaw, dark hair cropped short, a grey survey parka over a Corvane flight suit, a dented steel thermos clipped to her belt.",
        personality: "Steady, blunt, fair; flaw: will not leave anyone behind, even when she must.",
        backstory: "She has flown survey runs for Corvane for fifteen years and never lost a crew member. Her sister Agnes was posted to Haddon last year.",
        relationships: [
          { to: "Wen Achebe", line: "Wen got her lander cleared for this run when Corvane meant to send another crew, and she knows she owes them." },
          { to: "Tomas Reyes", line: "Tomas once ran and left her pinned in a wreck; she forgave him on his promise never to lift without her again." },
          { to: "Lucy Marsh", line: "She hired Lucy after the colony quarantine and promised her the final word on anyone sick aboard the Tamsin." },
          { to: "Joe Brannigan", line: "Joe got her sister Agnes the driller's job at Haddon, and promised Dana he would bring Agnes home himself." },
        ],
        signatureItem: "A dented steel thermos",
        voice: "Polish woman, forties, low, even, few words.",
        agenda: [
          "Find your sister Agnes Kowalczyk, posted to Haddon as a driller last year.",
          "Get every survivor you find aboard the Tamsin, Vasko included.",
          "Get the Tamsin off Haddon IV with no one carrying the thing aboard.",
        ],
      },
      {
        name: "Wen Achebe",
        gender: "Nonbinary",
        career: "Company Agent",
        crewRole: "Corvane Mineral's liaison on the survey",
        look: "Slim Nigerian-Chinese liaison in their thirties, close-shaved head, round tinted glasses, a spotless grey Corvane coat, a sealed specimen case on a shoulder strap.",
        personality: "Courteous, precise, unreadable; flaw: believes every problem has a price.",
        backstory: "Wen joined the run the morning it left with Corvane's authorisation for the bonus. They say they are here to file the report.",
        relationships: [
          { to: "Dana Kowalczyk", line: "Got Dana's lander cleared for this run when Corvane meant to send another crew; she knows she owes Wen." },
          { to: "Tomas Reyes", line: "Bought Tomas's debts from the wrong people back home, and has not yet named a price." },
          { to: "Lucy Marsh", line: "Spoke for Lucy at the colony quarantine inquiry and cleared her name; Wen still asks her opinion on everything." },
        ],
        signatureItem: "A sealed specimen case",
        voice: "Soft, measured, Lagos-born, London-schooled.",
        agenda: [
          "Get into the Control Room and talk to the outpost's synthetic, alone.",
          "Get the sample, or a host carrying it, aboard the Tamsin.",
          "Keep the specimen alive until Corvane collects it, whoever pays for it.",
        ],
      },
      {
        name: "Tomas Reyes",
        gender: "Male",
        career: "Pilot",
        crewRole: "The Tamsin's pilot",
        look: "Wiry Chilean man in his thirties, curly black hair, three-day beard, a battered leather flight jacket over a Corvane suit, a lucky dice pair on a cord.",
        personality: "Funny, restless, brave in short bursts; flaw: runs when it gets bad.",
        backstory: "He has landed on worse rocks than this, and owes money to the wrong people on the station at home.",
        relationships: [
          { to: "Dana Kowalczyk", line: "He ran and left Dana pinned in a wreck once; she forgave him on his promise never to lift without her again." },
          { to: "Wen Achebe", line: "Wen bought his debts from the wrong people back home, and has not yet said what Tomas owes in return." },
        ],
        signatureItem: "A pair of lucky dice on a cord",
        voice: "Chilean, thirties, fast, wisecracking.",
        agenda: [
          "Keep the Tamsin's lander ready to lift: never leave it out of reach for long.",
          "Find the outpost's payroll in the Supervisor's Office safe: you need that money.",
          "Lift off before the thing reaches the lander, with whoever is aboard.",
        ],
      },
      {
        name: "Lucy Marsh",
        gender: "Female",
        career: "Medic",
        crewRole: "The Tamsin's medic",
        look: "Freckled Irish woman in her late twenties, red hair in a scarf, a white medic's tabard over a grey suit, a trauma bag across her back.",
        personality: "Warm, stubborn, curious; flaw: has to know how a thing works.",
        backstory: "She left a colony hospital after a quarantine went wrong and swore it would not happen again.",
        relationships: [
          { to: "Dana Kowalczyk", line: "Dana hired her after the colony quarantine, and promised her the final word on anyone sick aboard." },
          { to: "Wen Achebe", line: "Wen spoke for her at the colony quarantine inquiry and cleared her name; she has not repaid it." },
          { to: "Tomas Reyes", line: "Tomas swore to her he would never lift the Tamsin with anyone sick aboard, after she told him about the colony." },
        ],
        signatureItem: "A trauma bag",
        voice: "Irish, late twenties, warm, quick.",
        agenda: [
          "Examine the body in the Infirmary before anyone else touches it.",
          "Find out whether any of the crew has been bitten, and quarantine them.",
          "Stop anyone from taking the thing off this moon alive.",
        ],
      },
      {
        name: "Joe Brannigan",
        gender: "Male",
        career: "Roughneck",
        crewRole: "The survey's driller and mechanic",
        look: "Heavy-set Black American man in his fifties, grey beard, safety goggles pushed up on a bald head, oil-black coveralls, a hydraulic pry bar over his shoulder.",
        personality: "Easygoing, practical, fearless with machines; flaw: trusts the Company to do right.",
        backstory: "He drilled Haddon's first test bore twenty years ago and knows every pipe in the outpost.",
        relationships: [
          { to: "Dana Kowalczyk", line: "Got Dana's sister Agnes her driller's job at Haddon, and promised Dana he would bring Agnes home himself." },
          { to: "Lucy Marsh", line: "Lucy found the rot in his lungs and kept him on this run, on his promise to stay off the drill level." },
        ],
        signatureItem: "A hydraulic pry bar",
        voice: "Georgia drawl, fifties, slow and warm.",
        agenda: [
          "Get the Freight Lift working: you want to see what the drill found.",
          "Bring the cook Maro Tellis out alive: you trained him twenty years ago.",
          "Seal the drill level for good, even if it buries the Company's find.",
        ],
      },
    ],
  },
};
