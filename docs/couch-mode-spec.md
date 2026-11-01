# Couch mode: one TV, everyone's phone, an AI-run sci-fi horror one-shot

Status: P0 built 2026-10-29, plus `advance_act` / `award_story_point` /
`repaint_place`, transparent
dice feedback, dice thrown from each player's phone and landed in 3D on the TV
(2.10), fights with their own TV and phone screens and creature pictures
(2.11), and a trimmed tool set for couch tables. Stress and panic, the finale reveal and
name-only join are not built. Decisions: the Codex agent program writes the
story and paints the pictures (with portraits as references); ElevenLabs
speaks; 5e stays under the hood; at most one hidden role per crew. Start a
night at `/couch`.

## The night we are building for

- One laptop drives the TV over AirPlay or HDMI. It shows the shared screen and
  plays all the sound.
- Three to five friends sit on the couch. Each joins on their own phone over the
  cabin LAN, by scanning a QR code on the TV.
- Everyone is in the same room. Talk happens out loud, people point at the
  screen, and the only private things are what is on your own phone.
- The AI GM runs a 2 to 3 hour one-shot in the style of the ALIEN RPG's cinematic
  scenarios. It writes the scenario **and** the crew: who each character is,
  their backstory, how they know each other, what they look like, and a
  **secret agenda** that only that player sees.
- Every GM turn puts a new illustration on the TV. The crew look the same from
  picture to picture. The narrator and every character speak in ElevenLabs
  voices.

## Approach: couch is the product, the upstream app stays hidden

This fork plays couch nights and nothing else (AGENTS.md, "This fork"). Home
offers only **Start a night** and **Join with a code**, and nothing in the UI
creates any other kind of campaign. The upstream app is still in the tree,
reachable only by the host's escape hatch (`?host=1`), so merges from
upstream stay painless. Removing it outright is a later choice, worth making
only once no more upstream merges are wanted.

Couch mode is still one flag on the campaign (`gameSettings.couchMode`), set
by the couch night's own creator (`/couch`, `POST /api/couch`). It is not a
pile of toggles. It implies every removal and addition in this document,
which matches the repo's rule about settings ("one control per idea",
AGENTS.md).

There are three screens:

| Screen | Who | Route | Shows |
| --- | --- | --- | --- |
| **TV** | the laptop | `/campaigns/[id]/table` (the chrome-free table page, which renders the couch TV for a couch night) | the scene image, narration as subtitles, the crew strip, who the GM is waiting on, roll results. Plays all audio. |
| **Phone** | each player | `/campaigns/[id]` (renders the couch phone view when the campaign is in couch mode) | your character, your secret agenda, your action box, roll prompts, private GM messages |
| **Host setup** | the laptop, before play | `/couch`, then the host controls (`/campaigns/[id]?host=1`) | start the one-shot, then hand over to the TV view |

The TV signs in as its own **display seat**. It has no character, the GM never
waits on it, and it never receives whispers. If the TV used Alex's own account,
it would show Alex's secret agenda to the whole room.

---

## Part 1: what we remove

"Hide" means not rendered on the TV or the phone in couch mode. Everything stays
in the code.

### Play screen header

| Remove | Where it lives | Why we don't need it |
| --- | --- | --- |
| Voice chat dock (mediasoup / mesh) | `SessionHeader.tsx:228`, `VoiceDock.tsx` | Everyone is in the same room. |
| Dice menu (roll, 3D dice, shake to roll, customise dice) | `SessionHeader.tsx:232-288`, `DiceOverlay`, `DiceLookDialog` | The GM calls each roll; the player throws it from their phone and the TV lands it in 3D (2.10). |
| Narration volume and the ambience panel | `SessionHeader.tsx:289-316` | Sound plays only on the TV; use the TV remote. Ambience still runs, automatically. |
| Board/story toggle and the layout menu | `SessionHeader.tsx:317-331` | There is one layout per screen. |
| Coffee / break | `SessionHeader.tsx:332-336` | Just say "pause". |
| Rulebook, help, guided tours | `SessionHeader.tsx:337-352`, `SessionView.tsx:562-566` | The tour would pop up on every friend's phone 1.2 s after they sit down. |
| Campaign prep, all campaigns, account menu, phone header menu | `SessionHeader.tsx:353-376`, `HeaderPhoneMenu.tsx` | The host reaches these from the host controls (`?host=1`). |

### Right rail and its tabs

All of them go. One filter in `visiblePanelTabs()` (`src/lib/dm/table-tabs.ts:72-102`)
removes them from the desktop rail, the phone bottom bar and popped-out panes at
once.

| Tab | What goes with it |
| --- | --- |
| LEAD | floor control, director presets, encounter prep, map library, invites |
| PARTY | the roster cards, plus Bonds, Factions, Market, Arrange, travel formation, request a companion, change portrait, customise dice, save to library, trade, play-as, real-dice toggle. The phone gets its own character card instead (Part 2.7). |
| BATTLE / MAP | battle board, fog, initiative ribbon, combat card hand, overworld, atlas. Fights are theatre of the mind: the ALIEN RPG is about running, not grid tactics. |
| STORY | chapters, quests, timeline, facts, pins, lore, event log, export |
| NOTES | none; nobody takes notes on a couch |
| CHAT | side chat and the whisper panel. GM-to-player secrets move to the phone's own inbox (Part 2.7). |
| WORLD / CONTEXT | the secret outline and arc. Hidden in couch mode for everyone, including the lead, so the host isn't spoiled. |
| SETTINGS | game settings, story AI, rules, calendar, content import, edit campaign. The host sets these up before play. |

### Composer (the action box)

| Remove | Where | Why |
| --- | --- | --- |
| OOC mode | `Composer.tsx:290-299` | Out-of-character talk happens out loud. |
| Direct mode (lead steering the GM) | same | Alex plays too and should be surprised as well. |
| X-card button | `Composer.tsx:379-390` | Use a physical card or just speak up. Safety lines and veils still reach the GM. |
| "Ask the GM" dock | `SessionChatColumn.tsx:263-303` | Rules questions don't apply to a narrative one-shot. |
| Ruling bar, disputes, correction chips, item proposals, fight summary, utility call strip | `SessionChatColumn.tsx:263-303`, `SessionView.tsx:1074` | Arguing with the GM is a table conversation. |
| Message actions: renarrate, edit, pin, lore check, report, dispute | `MessageList` | The phone doesn't show the transcript. The TV has no controls. |

**Keep:** Do, Say, Pass, and the "GM is waiting on" gate (`TableWaitBanner.tsx`,
`src/lib/dm/table-wait.ts`). In a room, everyone acting and then the GM
answering in one go is exactly the right rhythm. The gate moves to the TV as
"waiting on Kara, Brakk". Every crew seat is waited on, whether or not its
phone is connected (a locked phone is still on the couch), and nobody sees
another player's move until the round closes: the phone's story shows only
your own posts after the GM's latest passage. The clock (five minutes after
the latest post) and Pass are what move a round someone sits out. When it
opens (everyone acted, or the time ran out), the TV fades out the passage still being read and drops what queued
behind it, so the room goes straight to the answers and the GM's reply
(`couch_answers` arriving live, `flush` in `useNarrationAudio.ts`). The
passage stays on screen and in the transcript.

### Game systems: off for the whole campaign

| Off | Setting that does it today |
| --- | --- |
| Companions, pacts, conscience ladder | `companions`, `companionConscience` |
| Bonds, romance | `relationships`, `romance` |
| Maps and the battle board | `mapsEnabled`, `boardDrawing`, `enemyIntent` |
| Market, loot, rest, travel, level-up moments | the one-shot is level-locked; the GM prompt says so (as `starter/one-shot.ts` does) |
| Calendar, factions, travel formation | hidden with their tabs |
| Real and Bluetooth dice | `dicePolicy` |
| Voice chat and transcription | `voice.enabled`, `voice.transcribe` |
| Add-ons | not loaded |

### Campaign creation and the lobby

| Today | Couch mode |
| --- | --- |
| A three-step wizard: title, who runs it, players, level, difficulty, 8 genres, theme, premise, language, world pack, length, character rules, house rules, lore, storyboard, safety, AI storytelling, bonds, battle board, variant rules, voice | **One screen.** Pick one of the written stories, each played on a map of its site ([couch-overhead-spec.md](couch-overhead-spec.md)), set the number of players (and any AI crewmates, 2.14), add one "anything off-limits tonight?" line, then Start. Safety stays because the repo keeps it before the first scene. |
| Every player builds a character in the builder, or picks one of four fixed 5e pregens | **Each story comes with its crew** (Part 2.1). Players pick a character from cards on their phone. |
| Every non-GM member needs a sheet and has to ready up before Begin (`viewer.ts:230-245`) | The display seat is exempt. Begin unlocks once every crew card is claimed, or every card left is the AI crewmates' to take (2.14). |
| Joining needs a username and password, or Discord | **Name-only join** from the TV's QR code. `ODM_DEVICE_WORLD=1` already does this; check what else that flag changes, or lift just its guest path into couch mode. |

---

## Part 2: what we add

### 2.1 Scenario forge: the written story and its crew

Every night is one of the written one-shots in `src/lib/couch/scenarios/`,
each played on its site. When the host presses Start, the forge reads it
(`readForge`, validated with zod) for the number of players: the crew cut
to the head count, ties to anyone not seated dropped, the hidden role given
to its holder. A story is written in this shape, with the ALIEN cinematic
scenario as the template. (Stories were once written by a model on Start
from the room's seed, in the same shape; that path was removed when every
night moved onto a map, and is in git history.)

```
scenario
  title, logline, the briefing (read aloud on the TV at the start)
  setting: ship/station/colony, the year, who owns it ("the Company")
  the truth (GM only): what is really going on, the creature or threat,
    and who knew
  three acts, each with: goal, set pieces, escalation, a clock or deadline
  cast: 3–6 NPCs, each with a look, voice, agenda and secret
  locations: 4–6 places, each with a one-line visual description

crew (one per player)
  name, career (Marine, Pilot, Medic, Roughneck, Company Agent, Scientist,
    Officer, Kid)
  look: a fixed, concrete visual description (face, hair, build, clothes,
    one prop). This text is the source of truth for every picture.
  personality: 2–3 traits and one flaw
  backstory: 3–4 sentences
  relationships: one line toward each other crew member (a "buddy" and a
    "rival", as in ALIEN)
  signature item
  voice: an ElevenLabs voice chosen to fit (age, gender, accent)
  agenda: act 1, act 2 and act 3 personal agendas (secret, see 2.2)
  hidden role (optional, at most one crew member): synthetic, or a
    Company plant
```

Afterwards:

1. **Mechanical sheets.** Each crew member becomes a sheet through the existing
   AI pregen path (`src/lib/dm/pregen-draft.ts` → the quick-build engine →
   `src/lib/characters/pregen-drafts.ts`). Today that path runs only in the
   Workshop, so it needs a route from a campaign. Careers are a reskin over
   classes with no spells (Marine = fighter, Roughneck = barbarian,
   Agent/Kid/Scientist = rogue, Pilot/Officer = ranger, Medic = fighter with
   Medicine). The phone shows the career and never the class.
2. **Portraits.** One per crew member and one per named NPC, painted in
   parallel while the TV plays the briefing. These are the reference images
   for every later scene (2.4). Art from the forge must follow
   `docs/art/token-readability.md`. Its creatures can come from any
   universe the table names, or be invented.
3. **Establishing shots.** One per act-1 location, painted ahead of time so
   turn 1 already has art.
4. **Introductions, then claiming.** Before anyone picks, the TV reads the
   briefing aloud and then introduces each crew member in turn over their
   portrait: role, backstory, temper and flaw, what they carry, and their
   ties to the others (on screen, not read). The words are the card's public
   fields (`src/lib/couch/intro-logic.ts`), and the forge is told that the
   room hears them, so they never give away an agenda or the hidden role.
   The narrator's clips are rendered as soon as the forge is ready
   (`src/lib/couch/intro.ts`) and play through the TV's own narration, so
   mute, volume and ambience ducking hold; with no voice a step stays up for
   its reading time. The lead's TV moves the step on
   (`POST /api/campaigns/[id]/couch/intro`, from the step it showed, so a
   second tab cannot skip one) and has Next and Skip to choosing. Phones
   read along, the current crew member marked, and the claim route refuses
   cards until the last introduction ends (`couch_forges.intro_step`).
   Players then take a crew card on their phone, first come first served.
   The secret part of the card appears only after it is claimed.
5. **The GM's spine.** Scenario, acts, truth and agendas are written into the
   GM's secret outline (`setDmOutline`, as the starter one-shot does), so the
   existing arc planner is skipped.

### 2.2 Secret agendas: the heart of the ALIEN feel

ALIEN's cinematic play gives each character a personal agenda for every act,
and the agendas are written to pull the crew apart: one wants to save a friend,
one has orders to bring back a sample, one is hiding an infection.

- **Data.** A new `agenda` block on the sheet:
  `{ acts: [a1, a2, a3], hiddenRole?, progress, storyPoints }`. The owner and
  the GM see it; nobody else does. The existing private-field filter
  (`src/lib/dm/sheet-view.ts`) and per-seat delivery
  (`src/lib/event-audience.ts`) already make "visible to owner + GM only"
  safe. Add the new field there.
- **GM prompt.** Inject the current act's agendas for every crew member, in the
  same place `hopes` goes (`src/lib/dm/prompt.ts:803-807`), but framed as a
  mission rather than a wish: "Create chances for each agenda every scene.
  Make agendas collide. Never reveal one aloud. Reward pursuing it."
- **Phone.** An "Agenda" card that is blurred until you press and hold it, so
  the person next to you can't read it over your shoulder. When a new act
  begins, the phone buzzes (Android only; iOS Safari has no vibration) and the
  new agenda is revealed.
- **Act changes.** A small GM tool, `advance_act`, moves everyone to the next
  agenda and shows an act title card on the TV (`SceneTitle.tsx` already
  exists). Like ALIEN's cinematic scenarios, an act closes on its story
  points: the GM passes 2 to 4 public, past-tense lines as `recap`, the TV
  shows them as "End of Act I · The story so far" one at a time before the
  new act's title (`CouchTvActBreak.tsx`), and the GM narrates on from the
  break (a cut ahead, the new act in motion). The recaps are kept (`couch_forges.recaps_json`) and follow the
  GM every later turn as THE STORY SO FAR (`src/lib/couch/act-break-logic.ts`).
  After the story so far the card calls the crew one by one: the story
  points each earned this act by chasing their agenda (counted in
  `couch_forges.act_points_json` as `award_story_point` lands) and their
  total, never what the agenda was, then "New agendas are on your phones".
  The narrator reads the whole card aloud on its own lane, so the GM's
  narration picks up at the cut into the new act and does not repeat it.
- **Story points.** ALIEN's cinematic rule (Starter Set rulebook, p. 26 and
  35): at the end of each act the GM judges every crew member once, in
  `advance_act`'s `earned`, and whoever took specific actions toward that
  act's agenda despite personal risk or sacrifice earns one story point.
  Nobody holds more than three. The GM is not offered a tool to award points
  mid-act: it gave one on every turn of a single scene's job (three in three
  minutes); the host's tool panel keeps `award_story_point` for corrections.
  Spending one turns your own failed check or save into a
  success, the dice as they fell: the one way a player overrides the dice.
  The phone's failed result offers "Make it succeed · 1 story point" beside
  the push, in the same 15-second window, even at full stress; the TV reads
  "Success · story point", and the GM's roll result carries the success and
  a note to narrate it (`spendCouchStoryPoint` in `src/lib/couch/push.ts`).
  This is the hook that makes players actually chase their agendas.
- **Ties.** Each crew member's ties name something concrete between them
  and each other crew member that can come due tonight (a debt, a promise,
  a life saved, a lie, a secret, a grudge), never a mood, and at least one
  of each person's ties pulls against an agenda. Ties are public (the TV
  shows them at the introductions); the GM reads them on each crew member's
  agenda line and is told to call one due each act and to put the owed
  person in the way of an agenda that pulls against them.
- **Private GM whispers.** `send_whisper` (`src/lib/dm/whispers.ts`) already
  exists and gets a prominent place on the phone: "the motion tracker shows
  something only you can see." A player can also whisper the GM from the phone,
  through the existing private line (`DmWhisperPanel.tsx`).
- **Finale reveal.** When the story ends, the TV runs a reveal sequence: each
  crew member's portrait, then their agendas one act at a time, whether they
  pulled it off, story points, and the hidden role. This is the moment the
  room is waiting for.
  Built as the closing (`src/lib/couch/finale.ts`, `finale-logic.ts`): the
  GM calls `end_night` in act III, outside a fight, in the reply that
  narrates the ending; the night ends once that passage is out, and the
  host's End the night (a TV host button, or End session) ends it at once.
  One story-model call over the transcript and the secret outline writes
  the headline, the recap, a verdict on each agenda, a highlight and an
  award each, and the GM's graded review; the facts (fates, agendas, story
  points, hidden roles, dice, the clock) are the server's, so a reply that
  fails still closes the night. The TV (`CouchTvFinale.tsx`) waits for the
  closing passage's voice, then steps through the end card, each recap
  beat, each crew member, what was really going on, the review and a board
  that stays; the laptop's arrow keys step through it. The night's own
  scene pictures carry it: the model picks the picture for each beat and
  each crew member's moment from the numbered pictures in the transcript
  (an even spread of the night where it picks none), the last scene sits
  behind the end card and a wall of the night behind the review. The
  narrator reads every step but the board (`finaleSpeech`, clips rendered
  ahead by `src/lib/couch/finale-voice.ts`), and a voiced step moves on
  when its clip ends. Each phone (`CouchPhoneFinale.tsx`) shows its
  player's own night, the review and the crew with the beats' pictures,
  with the story a tap away.
- **A night that keeps moving** (added after "Unto Us", 2026-10-30, where
  act I took 85 minutes and docking a pod took twenty replies). The couch
  rules (`src/lib/couch/prompt-logic.ts` COUCH_RULES, "DRIVE THE NIGHT")
  outrank the core rules on pacing: the world acts on its own (see
  Pressure, below), routine steps are skipped, a failed roll lands a
  complication rather than "time slips by", a stuck table is handed a lead
  and concrete options, and every act brings people who want something, a
  fight with the outline's foes and the act's twist. Every turn the GM reads
  a NIGHT PACE line (`src/lib/couch/pacing-logic.ts`): the act's minutes and
  replies against its share (40, 55 and 50 minutes), and from "late" on an
  order to end the act, never during a fight. The clock starts with the act
  (`couch_forges.act_since`).
- **Pressure** (added after the same night, from the ALIEN RPG's Game
  Mother advice: dread before terror, keep the monster hidden, breathers
  that let the crew lower its guard, the next challenge waiting when it
  does; and from tables that played it: pressure piled on pressure freezes
  a table). The rules say it in one line ("Play ALIEN's Game Mother"), and a
  TENSION line beside NIGHT PACE counts it (`src/lib/couch/tension*.ts`):
  the GM's replies since dice last threatened the crew. Only dice that can
  hurt restart it: an attack, a fight, damage, `apply_hazard`, a chase, a
  condition on a crew member. A warning, an alarm or a `spring_beat` does
  not ("Crew Expendable", 2026-10-31: the GM logged eleven prose strikes,
  each an alarm that reset the clock, and in seventy-five minutes the crew
  lost no hit points). Each act has a threshold (4, 3 and 2 replies):
  below it a **breather** (catch breath, plan, plant one sign) and then a
  **build** (a sign of the threat, or someone pressing a demand with a
  deadline); at it, **strike due**: one thing comes at the crew, one clear
  choice for a named crew member, landing with dice. Two replies past it the
  line turns **overdue**: stop warning, the thing warned of happens now with
  `apply_hazard` or a surprise attack, and it can wound, drop or kill. Act
  III has no breather. A round where every answer was a pass, and an act
  NIGHT PACE calls over time, get their strike now. The build line forbids
  repeating a warning (announced twice, it lands). TENSION is silent in a
  fight, which is the strike itself.
  - **Failure costs.** A crew member's failed check or save, and a failed
    group check, come back to the GM with a cost: if what they risked was
    physical, it hurts, with `apply_hazard` or `apply_damage`, in that
    reply; a wound described with no damage is not a cost.
  - **The deck.** The forge writes each act four or five beats, one sentence
    each, tagged sign, human or strike (`ForgedAct.beats`); the ready-made
    "Dead Air" and "Unto Us" carry hand-written ones. TENSION names the next
    unplayed beat the phase wants; `spring_beat` with its number marks it
    played (`couch_forges.beats_used_json`) and nothing more: a strike beat
    still lands with dice. A night without a deck improvises from the act's
    escalation, set pieces and foes.
  - **The quiet room.** When the GM has spoken and nobody has posted for
    three minutes, the server writes a table note ("The room has gone
    quiet.") and wakes the GM, whose TENSION then says so: the world acts
    and the reply ends on a choice for a named crew member. At most two in
    a row before someone speaks, so a break is not played through; never
    during a fight, a roll on a phone, a table break, the introductions, or
    before anyone has spoken; and a room silent ten minutes past due has
    left. The clock is armed when each narration lands and after a restart
    (`armCouchQuiet`, `rearmCouchQuiet`).
- **The objective on every screen.** `set_objective` (`src/lib/dm/couch-tools.ts`)
  puts what the crew must do now on the TV, small in the top-right corner
  (without its clock), and, with its clock, on each phone at the head of the
  story (`couch_objective` event,
  `src/lib/couch/pacing.ts`). A new act clears it, and NIGHT PACE asks for
  one until the GM sets it.
- **Twists and foes.** The forge asks for a twist per act and four to six
  fightable foes with the act each comes in (people, machines, the threat's
  young or victims; the threat itself is still fled or burned), and the
  outline lists them. The GM fights them from the couch enemy menu
  (`src/lib/couch/foes-logic.ts`: SRD stat blocks under sci-fi names, within
  the crew's deadly budget) instead of the fantasy catalog. The ready-made
  scenarios carry both.
- **Start light, find the rest.** A crew member starts with their armour,
  one weapon to hit with, one to shoot or throw with, ten rounds at most and
  their signature item (`src/lib/couch/kit-logic.ts`), not the class's whole
  pack; the GM puts a find in reach every scene or two and grants it with
  `grant_item`.
- **A short test night.** "Dead Air" (`src/lib/couch/scenarios/dead-air.ts`)
  runs about 45 minutes for two to four players: `scenario.minutes` scales
  the act clock (12, 17 and 16 minutes), and every act opens in motion with
  an objective, a foe and a twist, so one evening shows whether the pace
  rules hold.

### 2.3 Stress and panic: a light Year Zero layer

The 5e engine stays underneath, because its checks, HP and damage are tested.
On top of it goes the one ALIEN mechanic that makes the dread work, run by
the server so it never waits on the GM to remember a rule
(`src/lib/couch/stress*.ts`, `push.ts`):

- Each crew member has **Stress, from 0 to 10**: ten pips under the health
  bar on the TV's crew card (amber from 4, red from 7) and "Stress N" beside
  health on the phone's You tab. Kept in `couch_stress`.
- **It rises on its own**: +1 for every wound that gets through
  (`pc-damage.ts`), +1 to everyone else when a crew member drops or dies, +1
  for a push. The GM adds +1 or +2 for a horror seen and takes 1 off for real
  rest with `adjust_stress`; TENSION's build and breather lines remind it.
  The GM reads a STRESS line every turn while anyone has any.
- **Stress dice.** On a crew member's check or save (never an attack, damage
  or initiative) the server throws one d6 per point beside the d20, where the
  phone's throw resolves (`pending-rolls` route). Each 6 adds +2 as a
  modifier on the total, so the stored roll, its success and every readout
  agree; the TV reads the stress dice with the result.
- **Panic.** Any 1 sets off a panic roll, d6 + stress, on a short table:
  holds it together, jumpy (+1), drops it, freezes, screams (everyone else
  +1, and the threat hears), then the three that take the character out of
  their player's hands: bolts and lashes out (one move lost), catatonic (two).
  The GM reads the result in the roll's answer and narrates it; the TV shows
  a card ("Teddy Malloy panics", "Bolts"). While moves are lost the TV's card
  says "Panicking", the phone hides the action box behind a banner, the table
  does not wait on them and the server refuses their moves; the GM's replies
  count the lost moves off.
- **Push.** After a failed check or save (not a group check, not at 10), the
  phone's result offers "Push it · +1 stress" for 15 seconds (beside a story
  point to spend, 2.2), and the GM's
  turn waits for the answer: a push throws again with the new stress and
  answers the GM's call with the new roll; "Take the failure", or the window
  running out, lets the turn go on.

### 2.4 A picture every turn, with the same faces

Today a picture appears only when the GM decides to call `generate_image`, and
nothing keeps characters looking the same (`characterIds` is dropped at
`turn.ts:1958` and hard-coded to `[]` at `turn.ts:3248` and `images.ts:174`).
Couch mode makes a picture every GM turn and makes the faces stick.

1. **Visual bible.** Written once by the forge and frozen:
   - a style lock (one art direction string, e.g. "late-70s sci-fi film still,
     35mm grain, practical lighting, cassette-futurist interiors, deep shadows,
     anamorphic flares");
   - each crew member's and NPC's `look` text and portrait file;
   - each location's one-line description and its establishing shot.
2. **Shot planner.** After each GM message, a cheap utility-model call turns the
   narration into
   `{ shot: wide|medium|close|insert, subjects: [ids], location, prompt }`.
   The prompt says what the camera sees at this moment. It does not summarise
   the plot.
3. **Render with references.** Send the style lock, the shot prompt, each
   subject's `look` text and up to 4 reference images (subject portraits plus
   the location's establishing shot) to OpenAI's `POST /v1/images/edits`. That
   endpoint takes up to 16 input images on the gpt-image models. Today
   `openai-images.ts` posts only to `/images/generations`, so this is a new
   multipart path next to line 169. If the server has only ComfyUI, fall back
   to text-only with the `look` text injected; the faces will drift.
4. **Hook.** `finalize()` in `src/lib/dm/turn.ts` (~3286), next to the existing
   image and narration enqueues. Use one job label per campaign, so if turns
   come faster than pictures, only the newest scene waits on the queue.
5. **Display.** The image already becomes every device's full-screen background
   through the `image_ready` event (`CinematicParts.tsx:41-84`). The TV adds a
   slow Ken Burns drift so the screen stays alive while the next picture
   paints, and crossfades when it lands. Phones show it only as a small
   thumbnail.
6. **Latency budget.** Narration audio should start within about 2 s of the GM
   finishing. The picture arrives some seconds later and fades in. The old
   picture stays up until then, so nobody waits on art.
7. **Inserts: a find beside the place.** When the narration reveals something
   found, opened, read or examined in the place already on screen (a
   mechanism behind a panel, a letter in a drawer), the planner answers
   `insert` and frames that thing alone. It is told what is on screen
   (`ON SCREEN NOW`, the place picture's own frame), so it does not repaint
   the room or fall back on the finder's face. An insert is painted square,
   with no portraits as references, and the picture keeps its framing
   (`GeneratedImage.shot`: kind, frame, place id).
   - The TV splits 60/40: the place moves into the left 60% and keeps
     drifting, and the insert's square fills the top of the right 40%,
     fading into the dark foot where the subtitles run. The next picture of a
     place retires the insert, and a newer insert replaces it
     (`sceneComposition` in `src/lib/dm/scene-shot-logic.ts`).
   - Still one picture per turn. An insert needs a picture of this place to
     sit beside: with none on screen, or after the party has moved to a new
     place, an insert is painted as a close-up that stands on its own.
   - The web table's backdrop and the home page's tile keep the place. Phones
     and the transcript show the insert under its passage, square.
   - Later: a new place and a find in the same turn (two pictures, twice the
     wait), and `shot: "insert"` on `generate_image` for the narrator and a
     human GM.
8. **Establishing shots.** A place's first picture is a wide, empty shot of
   it, kept with the place, described for the GM by a model looking at it,
   and used as the place reference for every later picture there.
   `repaint_place` has it painted anew. See docs/couch-navigation.md
   "Pictures of the places".

### 2.5 ElevenLabs voices

The TTS pipeline already splits narration from quoted lines and casts a voice
per character, NPC and monster (`src/lib/dm/speech.ts`,
`src/lib/tts-segments.ts`, `src/lib/tts-roster.ts`). What's missing is a
backend that speaks ElevenLabs.

- **Backend.** Add `elevenlabs` to `TtsProvider` in `src/lib/tts-backend.ts`.
  Speech goes through `POST /v1/text-to-speech/{voice_id}` with an
  `xi-api-key` header, `model_id` and `output_format=mp3_44100_128`. The voice
  list comes from the account's voices endpoint, with their gender and accent
  labels feeding auto-casting (`src/lib/tts-cast.ts`).
- **Model.** `eleven_v4_turbo`: low latency and supports audio tags. Fall back
  to `eleven_flash_v2_5` if the quota gets tight.
- **Audio tags.** Let the GM mark delivery in narration, e.g. `[whispers]`,
  `[breathing heavily]`, `[screams]`. Strip the tags from the text shown on
  screen and pass them to the TTS. For horror this is a big win.
- **Casting.** The forge picks a voice for each crew member and NPC from the
  account's library. A short curated list (a gravelly narrator, a clipped
  Company voice, a synthetic-flat voice for androids) can be the defaults.
- **Key.** Stored like the other paid keys: the admin settings DB row
  (`speech.ttsApiKey`), or `ELEVENLABS_API_KEY` in `.env.server`. Never sent
  to the browser. Counted as paid in `src/lib/tts.ts:153`.
- **Every file that lists providers** needs the new entry. The list is long but
  mechanical: `tts-backend.ts`, `tts-cast.ts`, `tts.ts`, the global-config
  schema, the admin settings route and speech section, the tts-test route,
  `capabilities.ts`, `NarrationNote.tsx`, the setup wizard, `VoicePicker.tsx`
  and the tts test scripts.
- **TV only.** Narration autoplays on every connected device today
  (`useCampaignStream.ts:635-652` → `useNarrationAudio`). Add a per-device "play
  narration here" flag in `src/lib/audio-devices.ts` (which never syncs to the
  account, unlike mute). It defaults to on for the TV view and off for phones.
- **Autoplay.** The TV needs one tap or click before the browser will play
  sound. The TV's lobby screen shows a big "Tap to start sound" before the
  briefing.
- **Who is talking.** While an NPC, creature or crew member's line is heard,
  the TV shows their face and name over the subtitles, and a crew member's
  tile in the strip lights. Each clip's length is read from its MP3 frames
  (`src/lib/mp3-logic.ts`) into cues: who is heard from when to when
  (`src/lib/narration-cues-logic.ts`). The cues are sent as the clips land
  (`tts_cues`), with `tts_ready`, and in the snapshot for the newest takes,
  and saved beside each take as `<message>.cues.json`. The TV reads the cue
  under the narration clock (`CouchTvSpeaker.tsx`). A line only gets a face
  when its speaker has a voice of their own; the narrator has none.

### 2.6 The TV view

During play, **Show join QR code** beside **Host controls** opens the same
join link and room code as the lobby, without leaving the scene or stopping
audio. Hosts need this when a player loses their connection: the lobby's code
is otherwise no longer visible, and keeping it on the scene throughout play
would obscure the game. **Back to game** or Escape closes the dialog. Both
buttons, and the cursor, leave the scene after three seconds without input
and return on any mouse movement, touch or key press. A button under the
pointer or holding keyboard focus stays.

Implemented dice feedback: the opening rules are a durable narrated passage
before the opening scene. A crew member's own roll is called on the TV and
thrown from their phone (2.10). Rolls the server makes itself (an enemy's
attack) get a spoken announcement (dice, target, and stakes when supplied),
3D dice landing on the server's faces (the flat tumbling die and the shipped
dice sound where WebGL is missing), then faces, modifiers, total and verdict. Consecutive rolls
queue; private rolls stay off the TV. Reduced motion removes the tumble; muted
or failed speech falls back to readable timing. Phones keep a rules reference,
a reminder of when checks happen, and recent public roll results. Narration
explains the scene consequence after the server's numeric readout. A story
point can be spent on a failed check or save (2.2), which the briefing says.

Implemented item pictures (`src/lib/couch/item-show*.ts`): the TV shows the
pictures the phones' Gear section uses (painted icons, or the night's own
paintings). A crew member's attack or damage roll with a weapon they carry
puts the weapon in a tile on the roll card. The tile lights on a hit and
dims on a miss. A `use_item` the GM makes in the open (`couch_item`, sent to
the whole table) takes the find's column beside the scene, with the item's
name and "Renn uses it on Vasquez · 1 left" under it. It stays up for that
turn and gives way to the next turn's narration, or to a close-up the same
turn painted. An item with no picture yet shows nothing, and the TV asks for
one to be painted so the next use has it. A fight hides the column, so the
weapon tile is the only item picture during a fight.

Implemented difficulty: the GM picks a check's tier by what resists
(`COUCH_RULES` in `src/lib/couch/prompt-logic.ts`). A creature resisting
directly is a contest from its stat block; otherwise very_easy is only the
surrounding danger, easy (the default) a crew member's ordinary work,
moderate one real obstacle, hard an expert or stacked obstacles, very_hard
beyond any professional, and nearly_impossible an insane ask that could just
work. Circumstances are advantage or disadvantage, never a tier, and each
obstacle gets one roll. Level-1 bonuses top out near +5, so DC 25 and 30
could otherwise almost never pass: on a couch night a natural 20 passes a
very_hard or nearly_impossible check (`src/lib/couch/check-logic.ts`, applied
where the roll is stored), and the GM names a long shot before the throw.

Extend `src/app/campaigns/[campaignId]/table/page.tsx`. It is already a
chrome-free TV route, but it shows no story text and plays no sound.

- **Lobby.** While the forge sets up: the title, a large QR code and LAN
  address (`InviteQr`, `src/lib/server-address.ts`). Then the introductions
  (2.1 step 4, `CouchTvIntro.tsx`): the briefing over the cover, then each
  crew member full screen, the crew strip along the foot and a small join
  code in the corner. Then the choosing: "Choose your character on your
  phone", the QR, and the crew cards greying out as they are claimed.
- **Play.**
  - The full-bleed scene image.
  - The newest narration as large subtitles, paced to the audio.
  - A crew strip along the bottom: portrait, name, health, stress, and a glow
    on whoever is speaking.
  - "Waiting on: Kara, Brakk" in a corner.
  - While the GM answers (thinking, narrating or rolling: `gmAtWork`), the
    scene dims, the screen's edge breathes and a pill at the top says "The
    GM is thinking…" or "Dice are rolling…". The dice stay bright.
  - Roll and panic results as big animated cards (`RollToast` exists).
  - Act title cards.
- **Ambience.** On, automatic and TV-only (`ambienceAuto`). A couch night
  plays its own sound pack (`src/lib/couch/sound-catalog.ts`, pack
  `scifi_horror`), never the fantasy library: 16 places (`hull`,
  `engineering`, `bridge`, `medbay`, `cryo`, `ducts`, `airlock`, `eva`,
  `derelict`, `hive`, `hab`, `mess`, `lab`, `cargo`, `exo_storm`,
  `seafloor`, plus a few shared outdoor sounds), a hybrid-orchestral score
  with one cue per mood (`score_*`), and 14 stings (motion tracker, klaxon,
  braam…). The GM's place and sound tools list only the pack
  (`src/lib/couch/sound-logic.ts`), a place filed under an upstream kind is
  heard as the nearest couch one, and a place with no kind is `hull`. The
  files are generated once with ElevenLabs and loudness-matched per layer
  (`scripts/generate-ambience.mjs --backend elevenlabs --pack scifi_horror`).
  Five more genre packs are made and wait for a night of their genre
  (`src/lib/couch/sound-packs/`): `gothic_horror` (haunted manor: organ,
  harpsichord, music box), `thriller` (conspiracy: synths, ticking strings),
  `folk_horror` (village cult: hurdy-gurdy, fiddle, analog synths),
  `cosmic_horror` (1920s investigators: theremin, low choir) and
  `survival_horror` (zombies: guitar, cello, industrial drums). Each has its
  places, a score cue per mood (`${prefix}_${mood}`) and stings, and may
  share sounds with the upstream library or another pack. Today every night
  plays `scifi_horror` (`couchSoundPack`); the forge choosing a genre is
  what switches it.
  The music follows the scene's mood
  (`src/lib/couch/mood.ts`): the GM names it with `set_mood` (calm, relief,
  uneasy, aftermath, dread, danger, chase, fight), attacks and damage raise
  it on their own, and each act sets a floor until the GM speaks. It climbs
  at once and comes down only after 90 seconds, so it never flickers; a
  last-act fight plays the big one.
- **Finale.** The agenda reveal sequence (2.2).
- **Nothing to click** except a hidden exit, as today.

### 2.7 The phone view

The TV is what the room shares: names, health, the picture, the route. The
phone is each player's own, laid out for deciding what to try, in two views
behind two tabs along the top (`CouchPhoneView.tsx`, `couch-phone.css`). The
Character tab is your face, name and health, so health stays in sight from
the story. A dot on a tab says something waits there: a new passage, a
whisper or your turn on Story, an unread agenda on Character.

**Story**, read like a chat:

1. The story runs down to the newest GM passage, with its picture, which the
   phone scrolls into view when it lands. Each roll stands in the passage
   where the GM rolled it. What the players said since then appears as chat
   lines, with your own on the right. Everything older folds under "Earlier
   in the story".
2. **Only you & the GM**: each private exchange stands in the story where
   it was asked: your question, and the GM's answer when its next turn
   brings one, which joins the question there rather than landing further
   down. It shows open while it is new or waiting, folds to one dashed line
   once the story moves past it, and never folds while unread (Earlier
   opens while it holds one). When an unread one is out of sight, "The GM
   wrote to you privately" above the action box brings it up. "Ask a
   follow-up" opens the action box in Ask GM.
3. **The map**, behind a Map button beside the tabs: the night's site from
   above, as a sheet (docs/couch-navigation.md,
   docs/couch-overhead-spec.md). Nobody votes; players say where they go.
4. **The action box**, pinned to the foot and drawn like a chat app's. At
   rest it is one rounded line with a send button. While you write it is a
   card with three toggles beside the send: Do, Say and Ask GM. Ask GM
   turns the box dashed and says that only the GM sees it; Do or Say goes
   back to the table. When the iOS keyboard is up the box rides on
   top of it. At the foot of the story, under the newest passage, one line
   says whose move it is: "Your turn" with the GM's question, who the GM is
   waiting on, or what the GM is doing (pinned to the box it took too much
   of the screen). Pass sits on that line when the GM is waiting on you.
   You can write while it is someone else's move; only
   sending waits. While the GM itself answers, Do and Say rest: the box is
   locked with a light running round its rim, keeping any draft, and the
   phone's edge breathes like the TV's on every tab, so the story and the
   sheet stay open to read. Ask GM reaches the GM at any time. A roll the GM asks for
   opens its own sheet over the screen (`CouchRollPrompt.tsx`).

**Character**, everything that is yours, sorted by when a player reaches
for it (`CouchCharacter.tsx`). On top, whichever section is open: your
face, name and role, health, armour, and any condition. Below, three
sections behind a segmented control:

- **Gear**, what you can use. It changes as things are found and spent, so
  it is pictures you can scan: your signature item on its own, large; your
  weapons with to-hit and damage; then what you wear and carry as a grid of
  pictures with their counts. A thing picked up since you last looked says
  New, and puts a dot on the Gear section and the Character tab. Tapping a
  thing opens it as a sheet: the picture large, its whole line, what the
  rules say it does, and Use, which takes you back to Story with "I use my
  … to " started in the action box.
- **Skills**, what you are good at: your best checks first, with Trained and
  Expert marked and all eighteen one tap away; what each feature does; the
  six abilities with their saves.
- **About**, who you are: the agenda (press and hold to read, story points
  beside it), your story as the crew knows it, your tie to each crewmate
  beside their face, and how to play you. How to play the game closes it.

The tab opens on About while the agenda is unread and until you have made
your first move, and on Gear when you have just picked something up;
otherwise on the section you left (`sectionOnEntry`). The numbers come
from the helpers the table's own sheet uses, so they are the ones the GM
rolls with (`character-logic.ts`).

Every item has a picture. The painted icon set's comes first (the SRD's
weapons, armour, potions and some gear); anything it lacks (the signature
item, a keycard the GM hands over, a backpack) is painted once per name per
night in the night's own look, on the media queue beside the portraits
(`src/lib/couch/item-art.ts`, at most 90 a night). Until it lands, the
thing's first letter stands in.

The phone turns off the app's animated backdrop while it is up, and its
pinned bars are painted rather than blurred. A canvas redrawn under
translucent pinned bars made iPhones flicker until parts of the screen
dropped out.

### 2.8 A sci-fi horror genre preset

Add a `scifi-horror` preset beside the others in `src/lib/genres.ts`:
dmFlavor, portraitStyle, sceneStyle, nameHints, and careers instead of
classes. Franchise names are allowed: a night can build on any existing
universe, its creatures, companies and ships, as Crew Expendable does.

Tone lines for the GM: "slow dread, then violence; scarcity of ammo, air and
time; the Company always has a second agenda; let the crew distrust each
other; one horrible thing per act; deaths are possible and meaningful."

### 2.9 A leaner GM turn (P1)

Every GM turn carries about 12K tokens of rules and 22–33K tokens of 5e tool
schemas (`docs/agent-context-efficiency-audit-2026-10-17.md`). For a narrative
one-shot, offer only: `request_roll`, damage/heal, `adjust_stress`,
`award_story_point`, `advance_act`, `send_whisper`, ambience, and end-of-story.
The tools are listed in `src/lib/dm/turn.ts` around 1132-1144. A smaller turn
means faster turns, and on a couch, waiting is what kills the mood.

### 2.10 Dice: thrown from the phone, landed on the TV

Everyone should see every roll happen, and the player whose character is on
the line should be the one who throws it.

1. **The GM calls it.** A couch table holds every crew member's rolls
   (`rollHolderIds` in `src/lib/dice/held-rolls.ts`), so a `request_roll`,
   `pc_attack` or initiative for a crew member parks the GM's turn, as a "hold
   my rolls" player's does at an ordinary table. The GM's standing rules say
   so in one line (`COUCH_RULES`).
2. **The TV shows the call** from the stream's own `roll_pending`: the crew
   member's face and name, what the roll is for, the GM's reason, the dice and
   bonus, the target, and advantage in words (`CouchRolls.tsx`,
   `couchRollCall`). The narrator reads it once
   (`announceCouchRollCalls`, voice id `couch-roll-<pending>-call`); the
   throw cuts that reading short, or drops it if it has not started, so the
   room hears the result instead of the rest of the call. After
   45 s the host's seat offers "Roll for Kara", the digital fallback the
   pending-roll route already allows whoever steers the story, so a flat
   phone never stalls the night.
3. **The phone becomes the die.** `CouchRollPrompt.tsx` opens a full-screen
   sheet with one big Roll button, the odds on one line, and shake to throw
   where the phone reports motion without a prompt (HTTPS, not iOS). The
   server draws the number when the button is pressed; the phone never
   holds a face it could choose.
4. **The TV lands it.** The pending-roll route publishes `couch_roll` with the
   `pendingId`. The TV throws the same faces with dice-box-threejs, with its
   own collision sounds once they have loaded (`useCouchDice.ts`). The dice
   are large and in one fixed high-contrast look, the phone's green Roll die
   with near-black numbers, never the host's own dice look, which washes out
   under a dark scene at TV distance. Then it shows
   the total and verdict, and the narrator reads the result. The phone holds
   its number back for about three seconds so the room sees it land first.
5. **The GM resumes** from the stored roll once every parked roll is in, and
   narrates what it changed. A hit from a parked `pc_attack` parks its damage
   next, called and thrown the same way.

There is no setting: rolling is how couch mode plays. Reduced motion skips the
3D throw, and a TV without WebGL shows the flat die.

**A group check is thrown together.** When several crew attempt one thing
(sneak past, climb out, hold the door), the GM calls `group_check` once
(`COUCH_RULES` says so), never a `request_roll` each, which read the same
call aloud once per crew member and paused the turn each time.

1. `group_check` parks every named crew member's roll at once
   (`handleGroupCheck`'s `park` option in `src/lib/dm/check-tools.ts`, branched
   to from `turn.ts` on a couch table) and `src/lib/couch/group-check.ts` keeps
   them as one group (`couch_group_checks`), published as `couch_group`
   before the rolls themselves. The dead fail without a throw.
2. The narrator reads one call for everyone (`couchGroupCall`, voice id
   `couch-group-<id>-call`): what, why, the target and how many must make
   it. The single-roll calls are not read.
3. Every phone shows its ordinary roll sheet, marked "Group check" with how
   many must make it; everyone throws whenever they like.
4. The TV shows one card (`CouchTvGroupCheck.tsx`): a place per crew member
   that fills as their die lands in the tray, one at a time even when the
   phones throw together, and a count of who made it. Each throw still
   publishes its own `couch_roll`, tagged with the `groupId`, so the phone
   shows its own result, but the TV keeps it in the card and nobody reads it
   aloud. After 45 s the host's seat offers to roll for every phone still
   quiet.
5. When the last die lands the group is settled by group_check's own rule (at
   least half pass), the card marks whose throw decided it, and the narrator
   reads the verdict once (`couchGroupResult`). The resumed GM turn reads one
   answer for its one call (`takeCouchGroupAnswers`), in the shape
   `group_check` returns when the server throws for everyone.

### 2.11 Fights: the story waits until the fight is over

A fight is the scene until it ends. The engine's own encounter runs it
(`start_encounter`, initiative, `pc_attack`, `enemy_attack`); the couch adds
the rules a room of phones needs, its own screens, and pictures of the
creature.

**Who acts.** The initiative order holds the floor: only the crew member
whose turn it is can send Do or Say. Everyone else's phone says whose move it
is and when theirs comes; Ask GM still reaches the GM. A split crew's fight
is the scene's group's (docs/couch-navigation.md "Splitting up"): the others
are not in it until they run into the room, when they roll initiative and
take a place in the order. Their phones keep taking moves meanwhile.

**One action, one turn.** A crew member's turn is the one thing their player
said. Nobody on a phone knows to say "I end my turn", and there is no End
Turn button, so once the GM rules on the action (the attack thrown from
their phone, a check, a spell) the turn ends after the narration, and the
creatures and the next crew member follow (`turn.ts`, beside
`readTurnEndInWords`). A walk into reach alone is no ruling: the GM that
only moved them asks what they do. The GM reads `COUCH_FIGHT_RULES`
(`src/lib/couch/prompt-logic.ts`) only while a fight runs: describe the
creature concretely when it appears, resolve the action with its tool and
stop, never offer movement, bonus actions or ending the turn. Words alone
are an action too: a turn that neither walked the crew member nor asked
them for more (`request_player_input`) ends after the narration like a
ruling (`leftMoveOpen` in `claims.ts`). Before, a plea or an offer of peace
had no tool, so the turn stayed with the speaker while the GM asked the
others "do you accept?", and nobody else's phone could answer. A fight the
GM opens without asking anyone's initiative starts at the end of that turn
anyway: no phone has a roll to throw, so the server rolls the missing
initiative itself (`startStalledFight` in `encounter-tools.ts`).

**The story waits.** `advance_act` is refused while a fight runs, and
`move_party` is not offered in one (`tool-profiles.ts`). It ends when the
last creature falls, or with `end_encounter` (flight, surrender, a truce).

**A truce** (`src/lib/couch/truce*.ts`, `CouchTruce.tsx`). A crew member
offers it on their turn, in their own words ("I offer a truce", "everyone
stand down"); the GM calls `offer_truce` (couch only, offered only in a
fight), which spends that turn. Every other crew member standing in the
fight is asked on their phone, out of turn: Accept truce or Fight on, a card
over the turn line ("It doesn't use your turn"). The TV puts the offer where
the move banner sits, with each answer filling in, and the narrator reads
the offer and the verdict. One "fight on" settles it: the table is told who
refused and the fight goes on. When all accept, any crew who turned stand
with the others again; with no foe left standing the server ends the fight
as a truce (the closing card reads "A truce") and wakes the GM to narrate
the peace. The answers settle in the DM queue, never mid-turn. Creatures
are never asked: with nobody else on a phone, the GM rules on them and ends
the fight with `end_encounter`. The phone's "your move" line says "or offer
a truce", so the room knows it can. POST
`/api/campaigns/[id]/couch/truce` takes an answer; `couch_truce` streams it.

**Crew against crew.** Players can fight each other (`src/lib/couch/crew-fight*.ts`).
A fight has two sides, the crew's and the foes' (the engine's
`combat-sides`), and a crew member who turns on the others fights on the
foes' side as themselves: the same sheet, still played from their own
phone. Two ways in: the GM starts a fight naming a crew member as the enemy
(`start_encounter` or `add_enemies`; a couch night lets the roster name a
crew member by full name, or by a first name nobody else has), or a crew
member attacks a crewmate on their own turn mid-fight, and `pc_attack`
moves the attacker across first instead of refusing an attack on an ally.
A refused attack (not their turn) moves nobody. A crew member fielded on
the far side as a fight starts stands beside the crew (`standWithCrew`): the
engine puts a character joining the foes near the other foes and away from
the party, which with no creature in the fight left them across the map,
out of every swing's reach. Rolling someone's initiative is no ruling on
their action (`claims.ts` `ruledFor`), so the first crew member's turn is
not ended by the roll that ordered it. The side lasts for that fight; the
fight ends when either side is down. On the TV the turned crew
member is a foe card with their own face (then their fight pictures,
painted from their portrait), red in the turn order and "Fighting the crew"
on their card, and the move line reads "Against the crew". Their phone's
fight strip lists the crew as the other side ("you against the crew"). The
closing card names the winners ("Brakk Oduya wins") rather than saying the
crew won. Both GM rule blocks say how (`COUCH_RULES`, `COUCH_FIGHT_RULES`):
without the explicit "pc_attack with targetEnemyId set to that crewmate's
characterId", the GM refused a player's attack on a crewmate as impossible.

**Engine fixes the couch needed.** A to-hit thrown from a phone is recorded
on the turn like a digital one (`pc-attack-parked.ts`, `noteSwing`). Before,
the narration guard sent back every hit the GM narrated as "an attack no
tool rolled", and the GM rewrote it into nothing. The TV reads Hit or Miss
from the engine's own ruling on the throw (`parkedAttackOutcome`). Surprise
costs the first turn only: a surprised crew member at the head of the order
used to lose round 2's turn as well (`encounter-tools.ts` `advancePointer`).

**On the TV** (`CouchTvFight.tsx`, `couch-fight.css`), laid out like a
turn-based game in zones that never overlap, so the room reads who fights
whom at a glance and nothing covers the faces in the scene:

- a slow red edge, so the room can tell a fight from the story;
- the scene picture steps into the space left of the creatures and pulls
  back from its usual overhang, so none of it sits under a card; its edge
  feathers into a blurred, darkened copy of the same picture behind the
  creatures' column (a find shown beside the place gives way meanwhile);
- the turn order across the top centre: crew faces and the creatures'
  pictures, the one acting lit, the fallen greyed, and the round; the
  objective and "Waiting on" are set aside until the fight ends;
- the enemy side down the right under "Enemies · 2 of 3 standing": each
  creature's picture, name, health in words (Unhurt, Hurt, Bloodied, Near
  death, Down) and four pips, never a number, and "Their move" on the one
  acting; a blow flashes the card, a fall stamps it;
- the crew's side along the bottom: a card each with no role line, the one
  moving lit and larger ("Your move"), the next marked "Next", one hit in
  the fight outlined red and marked "Hit" for five seconds, one elsewhere
  dimmed with the room they are in;
- whose move it is in the bottom right corner under the creatures, "Kara,
  what do you do? · Say it on your phone · then Brakk", or "Hunter 1 moves ·
  Then Brakk" in red; it gives way while the GM answers or a roll is
  called;
- where everyone stands, in the clear middle (`CouchTvFightMap.tsx`,
  `src/lib/couch/fight-map*.ts`, GET `/api/campaigns/[id]/couch/fight-map`):
  the fight's own battle map cropped to the fighters, with walls, water and
  rough ground, each crew member and creature as their picture on their
  square, each creature's reach dashed red, where the crew member whose
  move it is can still walk in green, with the feet left in the legend
  (the board's own lit squares and budget, `pcMoveBudget`: movement
  already spent this turn, Dash, prone and conditions count; when the
  floor is not on initiative the TV walks the feet left out itself,
  rough ground at double cost, never through a wall or a creature), and a line from them to each
  creature with the distance ("20 ft", or "In reach"), so the room can
  tell a swing from a shot. The TV signs in as the host, who plays no
  character, so the board's own projection would show it no creature; the
  route returns only the crew in the fight and the creatures still
  standing that the GM has not hidden, which the TV names anyway. What
  happens plays on it, every effect from an outcome the server resolved:
  an attack lunges (melee) or flies (ranged) and lands "Hit", "Critical!"
  or "Miss" with the target shaking; a spell bursts in its damage's
  colour; a heal, a condition and a fall say so over the figure; a figure
  on a new square slides there over a fading trail with "Moves 15 ft", or
  "Runs 45 ft" past its speed; a check thrown in the fight plays on the
  thrower (talk ripples for Persuasion, Deception, Intimidation; a sneak
  fades them; Athletics and Acrobatics leap; a search sweeps; a save
  braces) with what they did and whether it worked. A crew member's
  attack thrown from their phone plays as a digital one does
  (`pc-attack-parked.ts` publishes the swing once the d20 lands). With
  reduced motion each effect fades in place instead. On a tall screen the
  grid takes the full width under the order, the creatures sit in a band
  under it, then the prompt, the story line and the crew;
- the story as one sentence at a time under the grid, no earlier
  passage (the voice reads all of it, the phones hold it); the answers and
  the dice move left of the creatures, and the answers give way to a roll
  call rather than sit under it;
- when the fight ends, a card for 16 seconds: how it ended, how many
  rounds, what each crew member dealt and took and their natural 20s, over
  the creature's down picture, stamped.

**On the phone**: a strip over the turn line with the round and each
creature's health in words and pips, how far each stands from the
player's character on their own board ("Next to you", "30 ft"; only what
that phone's board shows), and on their move how far they can still walk; the turn line says "Your move in the
fight" with "One action: strike, shoot, run, hide, help someone, or offer a truce. Say it.",
or whose move it is and "You're up next." The story's dice lines name a
creature's attack by the creature, not by the crew member it hit.

**Pictures of the foe** (`src/lib/couch/fight-art*.ts`, GET
`/api/campaigns/[id]/couch/fight-art`): three per kind of foe, in the
night's style lock: whole as it attacks, hurt from bloodied down, and down.
Anyone can fight anyone, so a foe is drawn as what the story says it is: a
person stays a person, a droid a droid, a creature a creature. A foe the
night already knows by name or alias (a forge cast member, an NPC, a crew
sheet; `knownFoe`) is painted from that fixed look, and from their portrait
when they have one, so a mechanic who turns on the crew is that mechanic.
The first ask of the TV starts them; the hurt and down pictures are painted
from the whole one as their reference, so it stays the same beast. A
numbered pack ("Hunter 2") is one kind, and the same name in a later fight
reuses its pictures. On a painter that is not this machine's GPU (the agent
program, OpenAI) they run on the night's own media lane, beside the turn's
scene picture rather than behind it. Measured on 2026-10-30 with the agent
program's painter: the whole picture 23 seconds after the fight started,
hurt and down at 51 to 53 seconds, before round 1 was over. Until a stage
is painted the card shows the one before under a red treatment for how
hurt it is. Every scene picture during a fight takes the creature's current
picture as a reference (`scene-shot.ts` `sceneShotCast`), so the beast in
the scene is the one on the card. At most 12 kinds a night, two tries each.

There is no setting: a fight is how a fight plays. The prompt paints a
creature as the story describes it, from any universe, and never turns a
person into a monster.

### 2.12 Death, and playing on

Deaths are meant to happen, and they must never send a friend home early. As
in cinematic sci-fi horror games, a player whose character dies takes over
someone already in the story and plays on. There is no cost and no wait
beyond the writing, and no setting.

1. **The death lands.** The death engine marks the sheet dead
   (`src/lib/dm/death.ts`). The TV shows a card ("Renn Calder is dead",
   `src/lib/couch/death.ts`), and the crew strip shrinks the card to a
   dark face marked Dead at the end of the strip, instead of an empty
   health bar, so the living keep the room. While a crew member is
   down or dead, the GM reads one more rule (`COUCH_DEATH_RULE`, only
   then, so the rest of the night does not pay for it): a crew member at
   0 hit points cannot act, and a dead one gets one beat, with no more
   blows on the body and no "what does Renn do now?".
   Nobody waits on a player whose only character is dead
   (`table-wait.ts` `playerSeats`).
2. **The phone offers who to play.** Where the action box was, the dead
   player's Story view lists the people they can play from now on
   (`CouchTakeover.tsx`, `GET /api/campaigns/[id]/couch/takeover`): the
   NPCs the crew has met first, then the forge's cast still to turn up,
   then "Someone new". Out: anyone hostile, fighting the crew or killed in
   a fight, an NPC who left the story, and anyone already on a sheet or
   being taken over by another player (`takeover-logic.ts`
   `takeoverCandidates`). The phone shows a name, role, look and where
   they were met, never what they want or hide.
3. **The GM writes them up.** One story-model call turns the person into
   a crew member, keeping their name, look and voice. What they want and
   their secret become an agenda for each act left, aimed at the crew's
   situation; the earlier acts read "Not yet with the crew". A reply that
   says the story has them dead is passed back to the player to choose
   again. A model that is down or unreadable never strands a player: the
   person is built from the forge's cast entry as it stands
   (`fallbackTakeover`). The sheet passes the table's own door, as the
   forge's crew does (`forge.ts` `tableJudge`).
4. **They join.** The new sheet takes the player's seat, and the phone
   switches to it from the stream. The dead sheet stays, so the GM still
   reads it as DEAD and the story keeps the body. The NPC row stands behind
   the new sheet as a companion's does (`companion_sheet_id`), so the GM
   never plays them twice, and they keep the voice the room knows. The
   new crew card carries the portrait, or one is painted. A table note
   ("Renn Calder is gone. Alex plays on as Kade Orr, station steward.")
   tells the room and the GM, and the TV shows "Kade Orr joins the crew".
   From then on their agenda is in CREW AGENDAS; the dead character's
   agenda is not, and act changes and story points skip the dead.

A whole crew dying is the same: every player takes someone over, and the
story carries on with them.

---

### 2.13 Hidden effects, the ship's harm and ambushes

The surprises an ALIEN night is remembered for: the parasite planted an act
ago, the vent that blows while someone is still in the lock, the friendly
NPC who opens fire. All harm is **damage**, never a scripted death: it can
kill only the way 5e kills (failed death saves, damage taken while dying,
massive damage), so the dice keep the last word.

- **Hidden effects** (`src/lib/couch/hidden-effects*.ts`, the GM's
  `hidden_effect` tool). The GM plants a secret in one crew member: a name
  for the TV ("Parasite"), the truth (the GM's alone), and two to four
  stages, each a symptom the room can notice, the last the payoff. At most
  three grow at once. Each turn the GM reads a secret HIDDEN EFFECTS block
  (left out of an answer the whole table reads): truth, stage, symptom, and
  the replies spent at that stage. After `everyReplies` (six by default) the
  next symptom is due, then the payoff. `advance` moves it on, `reveal` puts
  a card on the TV once (name over the host's name), `cure` ends it at a
  cost, and `payoff`, only at the last stage, reveals it and, with damage
  dice, hurts its host through the damage engine (`applyPcDamage`).
  Nothing reaches the phones: even the host learns of it only through what
  the GM narrates or whispers. Kept in `couch_hidden_effects`.
- **The ship's harm.** `apply_hazard` (vents, fire, vacuum, falls, a
  bespoke hazard with its own dice, save and DC) is offered on every couch
  turn, not only when a player names fire. The GM warns before a hazard
  that could kill.
- **Dying outside a fight** (`src/lib/couch/dying.ts`). The engine rolls
  death saves only on combat turns, so a crew member a hazard or a payoff
  dropped outside a fight would lie dying forever. On a couch night each GM
  turn outside a fight rolls one death save for each dying crew member
  before the GM reads the table, and `COUCH_DEATH_RULE` says so: the crew
  has a few replies to stabilise or heal them.
- **Ambushes.** The rules allow NPCs to attack without warning, and TENSION's
  strike names it (`start_encounter` with `surprised: party`), beside the
  ship hurting the crew and a hidden effect paying off.

### 2.14 AI crewmates: a small room still fills the crew

A story's crew has a minimum, and a room may be smaller than it, or want a
bigger crew than it has people. The start screen's second count, **AI
crewmates**, says how many of the crew the AI plays besides the players on
phones. Players and AI together must fit the story's crew, and at least one
person plays. It starts at none and rises on its own only as far as the
story's minimum (one person picking a two-to-five story gets one AI
crewmate). `crewSeats` and `fitAiCrew` in `src/lib/couch/scenario-cards.ts`.

1. **The forge cuts the crew for everyone.** `couch_forges.ai_crew` sits
   beside `players`, and the forge reads the story for their sum, so the
   ties and the hidden role are cut exactly as for that many people.
2. **Phones choose first.** The lobby (TV and phone) waits only on the
   people the AI does not stand in for (`peopleNeeded`), and marks the
   free cards "AI plays" once that is all that is left.
3. **Begin gives the AI the rest.** The TV's Begin first asks
   `POST /api/campaigns/[id]/couch/ai-crew` (host only, lobby only): the
   AI takes the free cards in the story's order, as many as it has
   crewmates (`aiCrewCards`). Each is an ordinary claim
   (`claimCrew`) by a member nobody can sign in as (`addAiCrewMember`, a
   `comp_crew_` user with no password, swept with the campaign like a
   companion's owner). So the crew strip, the agenda and its act moves,
   story points, the GM's party, the table's wait, fights and death treat
   an AI crewmate as they treat a phone. The cards show "AI crewmate".
4. **It plays through the phone's routes.** A driver per night
   (`src/lib/couch/ai-crew.ts`) listens on the night's event bus and, once
   it falls quiet (a passage written, a roll called, a truce offered),
   plays the stand-ins' round (`src/lib/couch/autoplay.ts`) kept to the AI
   seats, with a crewmate's prompt: leave the people in the room the big
   moments, back their plans, chase the secret agenda quietly. Moves, rolls
   (thrown digitally) and truce answers go through the same routes a phone
   uses, signed in as the seat for that one request. A move a route
   refused is not written again for the same passage; a move the model
   failed to write is asked again a few seconds later, up to three times,
   before the seat sits the passage out and the table's wait clock moves
   on. After a restart the driver comes back the next time a screen reads
   the night (`GET /api/campaigns/[id]`), and in development a hot reload
   swaps a driver still running the old code. A dead AI crewmate plays no
   more and takes nobody over.
5. **The TV says who is AI.** The crew strip puts a small "AI" tag before
   an AI crewmate's name (read as "AI crewmate:").
6. **A friend who comes late takes one over.** A night with AI crew keeps
   joining open after Begin (`midGameJoinOpen`), with room for one person
   per AI seat (`maxPlayers` counts AI seats twice). Their phone offers the
   AI's cards ("Played by the AI. Yours if you want them."), and taking one
   hands over the sheet as it stands, wounds, gear and agenda, with any
   roll it still owes; the AI's seat leaves the table
   (`handCrewCardFromAi`). Not during a fight, whose turn order names its
   seats: the phone is told to take them over once it ends.

## Part 3: one turn, end to end

1. The TV shows the scene and "Waiting on: Kara, Brakk, Sam".
   With the crew split, it waits only on the group in the scene; the
   others write their next moves for the GM's cut to them
   (docs/couch-navigation.md "Splitting up").
2. Each player types on their phone (Do or Say), or presses Pass. The TV ticks
   names off.
3. Once everyone has acted or the timer runs out, the GM turn starts. It sees
   every action, every current-act agenda, stress levels and the outline.
4. The GM may ask for a roll. The TV calls it, the player's phone shows one
   big Roll button, and the TV lands the dice in 3D (2.10). Stress dice and
   panic are not built.
5. The GM's narration lands. ElevenLabs starts on the TV within about 2 s:
   the narrator's voice for prose, character voices for quotes, audio tags for
   delivery. Subtitles follow along.
6. The shot planner and image job run in parallel. The new picture crossfades
   in when it is ready.
7. Whispers, if any, buzz the right phone only.
8. Repeat. `advance_act` brings a title card and new agendas. The ending runs
   the reveal.

---

## Part 4: priorities for tomorrow

**P0: the night does not work without these**

1. A couch mode flag on the campaign, plus the phone strip: the tabs, header,
   composer modes, tours and strips in Part 1.
2. The display seat: exempt from the wait and ready gates, never sent whispers.
3. Name-only join from the QR code.
4. ElevenLabs backend, with narration playing only on the TV.
5. The scenario forge: the written story's crew, portraits, agendas, the
   outline, and claiming crew cards on the phone.
6. The agenda field, GM prompt injection and the phone agenda card.
7. A picture every turn with reference portraits (OpenAI edits).
8. The TV view: scene, subtitles, crew strip, waiting-on list and the lobby QR.
9. The sci-fi horror preset.

**P1: much better if there is time**

10. Stress dice, panic and push.
11. Story points, `advance_act` and act title cards.
12. The finale reveal on the TV.
13. Audio tags in narration.
14. The lean tool set (2.9).

**P2: later**

15. ElevenLabs sound effects for stingers (motion-tracker pings, vents,
    alarms).
16. The ElevenLabs dialogue endpoint for multi-voice scenes.
17. Streaming partial images so pictures sharpen in while you watch.
18. Speaking actions into the phone (dictation needs HTTPS on the LAN).
19. A recap reel of the night's images with narration.

---

## Part 5: risks

| Risk | Mitigation |
| --- | --- |
| The TV leaks someone's agenda | The TV is its own display seat and never one of the players' accounts. Before guests arrive, test: whisper player A, check the TV and player B's phone. |
| Turns feel slow | Audio starts before the picture. The lean tool set (P1). Pass moves a round on; the five-minute clock is only for a phone that died. |
| Image moderation blocks horror shots | Write shot prompts as implied horror (shadows, aftermath, faces reacting), never gore. Use `moderation: "low"` on the edits call. On refusal, keep the old picture. |
| ElevenLabs quota runs out mid-game | Three hours is likely 100K+ characters of narration; check the plan's quota first. On quota errors, fall back to Kokoro automatically. |
| No internet at the cabin | Test the cabin connection. ElevenLabs and OpenAI need it; Kokoro and ComfyUI don't. Keep a local fallback configured. |
| The TV is silent at the start | The TV lobby's "Tap to start sound" (2.5). |
| The AI-built crew fails the 5e admission check | Keep the career-to-class map to classes with no spells. If a sheet fails, fall back to the nearest of the four existing pregens and reskin it. |
| The host spoils themselves | World, Context and the outline are hidden in couch mode for everyone, the lead included. The forge output is never shown on the laptop's setup screen. |

---

## Part 6: open questions for Alex

1. **Images.** Does the server have an OpenAI image key? Same faces across
   pictures needs the edits endpoint with reference images. ComfyUI alone gives
   matching style but drifting faces.
2. **Players.** How many, and are you playing too? (The spec assumes yes, so
   the TV is a separate display account.)
3. **Rules.** Keep the 5e engine underneath with the stress layer on top
   (recommended, lowest risk), or go fully narrative with Year Zero dice pools
   (truer to ALIEN, but a new dice path to build and test in a day)?
4. **Hidden role.** Should one crew member possibly be a synthetic or a Company
   plant, unknown to the others? It's the most ALIEN thing you can do, but it
   can sour a table that doesn't expect betrayal.
5. **ElevenLabs.** The key (requested through a secure prompt when we build
   the backend, never in chat) and which plan tier, for the quota.
6. **Where to build.** On `main` in this repo (no new branch unless you want
   one).

---

## Appendix: file map

| Area | Files |
| --- | --- |
| Tab filter | `src/lib/dm/table-tabs.ts:72-102`, `SessionTabs.tsx:85-195`, `SidePanelRouter.tsx:280-292` |
| Header | `SessionHeader.tsx:224-376`, `HeaderPhoneMenu.tsx` |
| Composer | `Composer.tsx:198-397`, `TableWaitBanner.tsx`, `SessionChatColumn.tsx:263-303` |
| Turn gate | `src/lib/dm/table-wait.ts`, `table-wait-logic.ts`, `api/campaigns/[id]/actions/route.ts:328-353` |
| TV route | `src/app/campaigns/[campaignId]/table/page.tsx` |
| Settings schema | `src/lib/schemas/game-settings.ts` |
| Lobby gate | `src/lib/dm/viewer.ts:230-245` |
| Join | `src/app/join/[code]/page.tsx`, `AuthForm.tsx`, `src/lib/server-env.ts:62` |
| Story setup | `src/lib/dm/setup.ts`, `src/lib/starter/one-shot.ts`, `api/campaigns/[id]/route.ts:318-357` |
| Pregens | `src/lib/dm/pregen-draft*.ts`, `src/lib/characters/pregen-drafts.ts`, `src/lib/db/pregen-offers.ts` |
| Private data | `src/lib/dm/sheet-view.ts`, `src/lib/event-audience.ts`, `src/lib/dm/whispers.ts`, `prompt.ts:803-807` |
| GM prompt | `src/lib/dm/prompt.ts:113-170` (system), `843-1250` (game state), `prompt-rules.ts` |
| Turn finalize | `src/lib/dm/turn.ts:3161-3313` |
| Images | `src/lib/dm/images.ts`, `src/lib/openai-images.ts`, `image-generate.ts`, `art-direction.ts`, `CinematicParts.tsx:41-84` |
| TTS | `src/lib/tts-backend.ts`, `tts.ts`, `tts-cast.ts`, `tts-segments.ts`, `tts-roster.ts`, `useNarrationAudio.ts`, `audio-devices.ts` |
| Genres | `src/lib/genres.ts`, `src/lib/classes/*.json` |
