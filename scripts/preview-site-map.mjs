// Renders a written site map to one self-contained HTML page, through the
// real CouchSiteMap component and couch-site.css: the GM's view beside the
// players' view mid-night (docs/couch-overhead-spec.md). For looking at a
// map while writing it:
//
//   node scripts/preview-site-map.mjs [site-id] > docs/prototypes/site.html
import { register } from "node:module";
import { readFileSync } from "node:fs";

register("./lib/register-alias.mjs", import.meta.url);
const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { siteView, checkSiteMap } = await import("../src/lib/couch/site-map-logic.ts");
const { HADDON_OUTPOST } = await import("../src/lib/couch/sites/haddon-outpost.ts");
const { CouchSiteMap } = await import("../src/components/couch/CouchSiteMap.tsx");

const map = HADDON_OUTPOST;
const problems = checkSiteMap(map);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
const door = (a, b) => map.borders.findIndex((border) => (border.a === a && border.b === b) || (border.a === b && border.b === a));
// Act two, a few stealth turns in: two crew went down the spine, two are in
// the workshop with its door open, the medkit found, the crawler pinging.
const state = {
  act: 2,
  crew: [
    { id: "kara", name: "Kara Okafor", zone: "spine-north" },
    { id: "sam", name: "Sam Reyes", zone: "spine-north" },
    { id: "rafe", name: "Rafe Lindqvist", zone: "workshop" },
    { id: "jun", name: "Jun Park", zone: "workshop" },
  ],
  scene: "spine-north",
  visited: ["north-airlock", "north-corridor", "hub", "workshop", "west-corridor", "infirmary"],
  seen: [],
  borders: { [door("workshop", "west-corridor")]: "open", [door("hypersleep", "spine-north")]: "open", [door("north-airlock", "north-corridor")]: "open" },
  moved: {},
  found: [],
  pings: ["east-crawl", "hypersleep"],
};
const css = readFileSync(new URL("../src/app/styles/couch-site.css", import.meta.url), "utf8");
const panel = (title, audience) =>
  `<section><h2>${title}</h2>${renderToStaticMarkup(createElement(CouchSiteMap, { view: siteView(map, state, audience), variant: "tv", tile: 16, youId: "kara" }))}</section>`;
process.stdout.write(`<!doctype html><html><head><meta charset="utf-8"><title>${map.name}</title><style>
body{margin:0;background:#06080a;color:#e8eeea;font-family:ui-monospace,monospace;display:flex;gap:24px;padding:16px;justify-content:center}
h2{font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#8fe0b5;margin:0 0 8px}
section{position:relative;width:640px;height:800px;background:#030506}
.couch-site{position:absolute;left:0;top:0}
${css}</style></head><body>${panel("GM view — no fog", "gm")}${panel("TV — what the room sees", "players")}</body></html>`);
