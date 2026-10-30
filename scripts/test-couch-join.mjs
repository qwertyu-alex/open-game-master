// Reconnecting during play exposes the same room code as the lobby without
// navigating away from the TV. The QR and address are resolved on the client.
import assert from "node:assert/strict";
import fs from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

register("./lib/register-alias.mjs", import.meta.url);
const { CouchTvJoin, CouchTvJoinButton } = await import("../src/components/couch/CouchTvJoin.tsx");

const button = renderToStaticMarkup(createElement(CouchTvJoinButton, { inviteCode: "REJOIN" }));
assert.match(button, /<button[^>]*type="button"[^>]*aria-haspopup="dialog"/);
assert.match(button, /aria-expanded="false"/);
assert.match(button, />Show join QR code<\/button>/);
assert.doesNotMatch(button, /<a\b/, "sharing should keep the TV mounted rather than navigate to the lobby");

const join = renderToStaticMarkup(createElement(CouchTvJoin, { inviteCode: "REJOIN" }));
assert.match(join, /aria-label="Join on your phone"/);
assert.match(join, /Room code/);
assert.match(join, />REJOIN</);
assert.match(join, /Finding this screen&#x27;s address/);
assert.doesNotMatch(join, /src=""/, "do not show a QR for an unresolved address");

const noCode = renderToStaticMarkup(createElement(CouchTvJoin, { inviteCode: "" }));
assert.doesNotMatch(noCode, /Room code/);

const untitled = renderToStaticMarkup(createElement(CouchTvJoin, { inviteCode: "REJOIN", titled: false }));
assert.doesNotMatch(untitled, /Join on your phone/, "the dialog's title is not repeated inside it");
assert.match(untitled, />REJOIN</);

// The global dialog scale-in fills `transform`, so centring with it put the
// dialog's corner, not its middle, at the centre of the TV.
const css = fs.readFileSync(path.resolve(import.meta.dirname, "../src/app/styles/couch.css"), "utf8");
const dialog = css.match(/\.couch-tv-join-dialog \{[^}]*\}/)?.[0] ?? "";
assert.match(dialog, /translate: -50% -50%/);
assert.doesNotMatch(dialog, /transform:/);
console.log("couch join: reconnect control and shared join details passed");
