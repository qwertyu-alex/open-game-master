# This fork: couch nights only

This repository is a fork of [Open Game Master](https://github.com/Lebbitheplow/open-game-master)
(the `origin` remote; this fork is `private`) with one product: the **couch
night**. One laptop drives the TV, three to five friends in the same room
play on their phones, and the AI writes and runs a sci-fi horror one-shot.
Read [docs/couch-mode-spec.md](docs/couch-mode-spec.md) for what a night is
and how it is built, and [docs/couch-navigation.md](docs/couch-navigation.md)
for the map.

Assume without being told:

- **Every task is about couch nights.** "The game", "the table", "the
  player" and "the GM" mean the couch TV, a couch phone and the AI GM of a
  campaign with `gameSettings.couchMode`. Ask only if a request plainly
  names an upstream feature.
- **Every other mode is out of scope.** The campaign wizard
  (`CreateCampaignDialog`), Quick start / starter adventures, solo
  adventures, human or co-DM tables, the workshop, the character builder,
  the rulebook, the battle map, fog and initiative, voice chat, VTT parity,
  addons, the desktop and Android app shells, and the upstream release
  process. Do not design for them, extend them, test them, or fix their
  bugs unless asked. When a shared change would affect them, keep them
  compiling and move on; do not run their browser scenarios.
- **Soft fork: hide, don't delete.** Upstream code stays in the tree so
  merges from `origin` stay cheap. Keep upstream files' diffs small: put
  new work in couch files and branch on couch mode at the narrowest point
  (`couchSeatView` in `src/components/couch/couch-logic.ts`, the couch
  branches in `src/lib/dm/`). Do not delete upstream features unless asked.
- **Home is couch-only.** `/` offers Start a night (`/couch`) and Join with
  a code. Nothing in the UI creates any other kind of campaign; the shells'
  `?new=` links open `/couch`. The lead's full upstream screens exist only
  as the host's escape hatch (`/campaigns/[id]?host=1`).
- **Two screens, designed for the room.** The TV
  (`/campaigns/[id]/table`, `src/components/couch/CouchTv*.tsx`) is seen
  from the couch: large type, no controls the room must reach, all the
  sound. The phone (`/campaigns/[id]`, `CouchPhoneView.tsx`) is one thumb's
  worth: your character, your secret agenda, your action box, your rolls.
  A new feature says which of the two it lives on.

Where couch lives: `src/app/couch` (start a night), `src/app/api/couch` and
`src/app/api/campaigns/[campaignId]/couch` (routes), `src/components/couch`
(TV and phone), `src/lib/couch` (forge, rules, answers, navigation, roll
feedback, fights and their creature pictures), `src/lib/dm/scene-shot*.ts` and `tool-profiles.ts` (pictures and
the trimmed GM tool set), `src/lib/tts-elevenlabs*.ts` (voices),
`src/app/styles/couch*.css`.

Run a night with `npm run dev:lan` (or `start:lan`): the server on port
3005 behind a named Cloudflare Tunnel, so the phones' join QR works
(`scripts/start-local.mjs`). The checks that matter
are the couch suites, `node scripts/test-couch-*.mjs`, plus
`scripts/test-home-glance.mjs`, typecheck and lint.

Lean towards opening a browser to check your work. This request counts as
the user asking for browser work. After changing couch UI (TV or phone),
verify it in T3's preview browser: open `/campaigns/[id]/table` and
`/campaigns/[id]` at phone width, and snapshot both. Tests passing is not
enough for a screen the room will see.

**Verifying a real run.** To see a real night on the running server, sign
in as its TV or one of its phones with `scripts/agent-session.mjs`. It
needs no password, and it adds no web route on purpose: the server is
public through the tunnel, and tunnel requests look local, so only the
database file on this machine can grant a sign-in.

1. `node scripts/agent-session.mjs list` shows the newest campaigns;
   `list --campaign <id>` shows the host and the players' characters.
2. `node scripts/agent-session.mjs login --campaign <id> --as host` (or a
   character name, or a user id) prints a token that lasts two hours
   (`--hours`, at most 12), the TV and phone URLs, and a `document.cookie`
   line.
3. In T3's preview browser, open `http://localhost:3005/` in the Incognito
   profile (a signed-in tab's own cookie cannot be replaced from script),
   run that line with `preview_evaluate`, then navigate to the TV or phone
   URL.
4. Always run `node scripts/agent-session.mjs revoke` when done. It removes
   only the sessions the tool minted, never anyone's own.

**Stand-in players.** On the TV, the host controls hold **Play a turn**
(a move for everyone the GM waits on, written by the GM's own model and
posted through the real routes as each player, plus their rolls and truce
answers) and **Autoplay** (presses it again after each passage is read,
until turned off). They show only in development or with
`COUCH_AUTOPLAY=1` (`src/lib/couch/autoplay*.ts`). From a terminal,
`node scripts/couch-autoplay.mjs --campaign <id>`
sits in the player seats (all, or `--as "Teddy,Anouk"`) and plays them:
whenever the GM waits on one it writes a move with `claude -p` (`--model`,
default haiku), throws its rolls and answers its truces, so a night runs on
one machine with only the TV open. `--prompt` asks you for each move
instead (an empty line lets the AI write it); `--note` steers every AI move;
`--dry-run` prints the moves and posts nothing. While it runs, type
`Name: move` to step in, or `!note`, `!pause`, `!resume`, `!prompt`,
`!auto`, `!quit`. It signs in through agent-session and revokes its own
sessions on exit.

The sections below come from upstream. Their conventions (CONTRIBUTING,
settings, token and creature art) still hold for couch work. "Releases" and
"Addon framework" do not apply to this fork unless asked.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Contributing

Before writing code here, read [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md):
the conventions the code keeps (pure `*-logic.ts` modules, zod at every
route, tool errors that say retry or refused, comments that say why), the
checks to run, and short guides for a new DM tool, route or test suite. The
sections below cover the areas with rules of their own.

## Token artwork

Before creating or replacing monster, NPC or character artwork, read
[docs/art/token-readability.md](docs/art/token-readability.md). These images also
appear as small round tokens: review the shipped asset at 96px and 40px, preserve
existing paths for repaints, and reuse approved art that already reads well.

## Creature artwork and content sources

Before creating or replacing creature art, adding bestiary content, or changing
image prompts, read [docs/art/creature-art-guidance.md](docs/art/creature-art-guidance.md).
Use a named SRD creature, an original design, or a separately licensed subject
with recorded permission. Do not let a generic prompt such as "aberration"
introduce a beholder or mind flayer. Inspect the rendered anatomy as well as the
prompt, and preserve the source and edit history with each art change.

This fork: the content-source rule above (and CONTRIBUTING's) does not bind
couch nights. A night may build on any existing universe, franchise, film,
game or book, with its creatures, companies, ships and names, in the forge,
the GM's prose and the pictures. Do not add rules, prompts or tests that keep
franchise names out of couch code.

## Addon framework

Before changing anything under `src/lib/addons/`, the addon routes, or the
board view bridge, read [docs/addons/framework.md](docs/addons/framework.md):
the code map, the rules every change keeps (addons propose and the server
disposes, no secrets in an addon's environment, sandboxed board views), and
the steps for a new manifest field, bridge message or extension point.
Regenerate `docs/addons/addon.schema.json` with
`node scripts/build-addon-schema.mjs` whenever the manifest schema changes.

## Settings, options and toggles

Every control is paid for by everyone who meets it: a setting by every
player who sets up a campaign, a field by every author who fills the form.
Add one when the feature needs it, and earn its place first. Before adding a
setting, option, toggle, picker, button or field anywhere (the campaign
creator, a campaign's panels, the sheet, the admin console, the workshop),
and when reviewing an issue or pull request that asks for one:

1. Ship a good default first. If one default serves most tables, the feature
   needs no setting. A default that is only "off" or "same as before" means
   the feature is not finished.
2. Keep it out of the campaign creator unless it must be decided before the
   first scene and has no safe default (today: the setting, who runs the
   story, the players, safety). Everything else starts from its default and
   is changed later in the campaign's own settings.
3. One control per idea. A preset picker beats several toggles; "Custom"
   opens the detailed fields.
4. Show a control only when it can matter: no art style while pictures are
   off.
5. Someone who always customizes the same way saves it once as their
   personal defaults (`src/app/create-campaign/defaults.ts`); that is not a
   reason for another toggle.
6. Stop and justify it before building. Write down what goes wrong without
   the control, why a good default or a control that already exists cannot
   cover it, and who will use it. If that holds, build it; if it does not,
   the feature needs no control. The pull request carries the justification
   and a screenshot of the control where it lives, with its default (the
   feature request and pull request templates ask for these).
7. Make it accessible and easy to understand:
   - a visible label in plain words that says what it does, and a short
     hint or an ⓘ glossary where the choice or its terms are not obvious;
   - named for screen readers (a real label, `aria-label` on an icon-only
     button, a group or dialog role for a question it asks), reachable and
     usable by keyboard with a visible focus ring, never only on hover;
   - a finger-sized target on phones (at least 40px, the size of the kit's
     own controls), readable at phone width, and legible in the day and
     night themes;
   - moving and placed like the controls around it, so it looks like it
     belongs there;
   - checked on the website and in the app shells (`--app` in the browser
     harness), with axe where a page has a scenario for it
     (`32-builder-a11y`).

## Releases

Before cutting, promoting or fixing a release of the server or the apps, read
[docs/releases.md](docs/releases.md). Versions are plain `x.y.z`; whether a
release is a beta or stable is only its GitHub prerelease flag. Once betas
have started (the client repository's `PUBLISH_AS_BETA` variable is `true`),
publish every server release with `--prerelease`, never `--latest`, and make
a release stable only by promoting a beta that meets the doc's checks. Never
promote a release, or set that variable, unless the maintainer asks for it.
