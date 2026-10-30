// The couch-night creator's limits, in a module of their own so the page
// (src/app/couch/page.tsx) can say them without shipping the forge's reader
// and its validator to the browser.
export const PLAYERS_MAX = 5;
export const SEED_MAX = 600;
export const OFF_LIMITS_MAX = 300;
