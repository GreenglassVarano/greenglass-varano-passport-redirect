/*
 * 1EG Passport durable-URL redirect — routing-contract test (local, no network).
 * Project Blackbook PB-PP-1EG-ARCH-2026-09-08-02.
 *
 * Proves the ONE parameterized rule (used by every candidate host — _redirects splat,
 * Azure SWA route, GitHub Pages 404.html JS) produces the correct destination for
 * Item IDs, Container IDs, missing / invalid / malformed routes, and that the
 * Record ID is preserved verbatim with no path/query corruption.
 *
 * Run:  node route-test.js
 */
"use strict";

const DEST = "https://dbgroupcorp.sharepoint.com/sites/1EG-PreservedItemCatalogue/SitePages/Passport.aspx";

// ---- the redirect rule, expressed once (matches the 404.html JS and the _redirects splat) ----
function resolve(durableUrl) {
  let path;
  try { path = new URL(durableUrl).pathname; }
  catch { path = durableUrl.startsWith("/") ? durableUrl : "/" + durableUrl; }
  const m = path.match(/\/1EG\/([^/?#]+)/i);
  if (m && m[1]) {
    const recordId = decodeURIComponent(m[1]).trim();
    return DEST + "?p=" + encodeURIComponent(recordId);
  }
  return DEST; // bare host, /1EG, /1EG/ -> Landing
}

// ---- what the SPFx page then does with ?p= (mirrors classifyRecordId in config.ts) ----
function classify(raw) {
  const id = (raw || "").trim().toUpperCase();
  if (!id) return "landing";
  if (id.indexOf("1EG-C-") === 0) return "container";
  if (id.indexOf("1EG-") === 0) return "item";
  return "not-found";
}
function paramOf(u) { const q = u.split("?p="); return q[1] ? decodeURIComponent(q[1]) : ""; }

const CASES = [
  // durable URL                                            expected ?p=        expected SPFx screen
  ["https://passport.greenglassvarano.com/1EG/1EG-0001",    "1EG-0001",          "item"],
  ["https://passport.greenglassvarano.com/1EG/1EG-0002",    "1EG-0002",          "item"],
  ["https://passport.greenglassvarano.com/1EG/1EG-C-0001",  "1EG-C-0001",        "container"],
  ["https://passport.greenglassvarano.com/1EG/1eg-0001",    "1eg-0001",          "item"],       // case preserved; SPFx upper-cases
  ["https://passport.greenglassvarano.com/1EG/1EG-0125",    "1EG-0125",          "item"],
  ["https://passport.greenglassvarano.com/1EG/1EG-9999",    "1EG-9999",          "item"],       // well-formed but absent -> SPFx "Passport not found"
  ["https://passport.greenglassvarano.com/1EG/GARBAGE",     "GARBAGE",           "not-found"],  // invalid id
  ["https://passport.greenglassvarano.com/1EG/",            "",                  "landing"],
  ["https://passport.greenglassvarano.com/1EG",             "",                  "landing"],
  ["https://passport.greenglassvarano.com/",               "",                  "landing"],
  ["https://passport.greenglassvarano.com/1EG/1EG-0001/",   "1EG-0001",          "item"],       // trailing slash tolerated
  ["https://passport.greenglassvarano.com/1EG/1EG-0001?x=1","1EG-0001",          "item"],       // stray query on the durable URL is dropped
  ["/1EG/1EG-C-0001",                                       "1EG-C-0001",        "container"],  // path-only form (host does the matching)
  ["https://passport.greenglassvarano.com/wrong/1EG-0001",  "",                  "landing"],    // wrong namespace -> Landing (no /1EG/ segment)
];

let fail = 0;
for (const [url, wantParam, wantScreen] of CASES) {
  const dest = resolve(url);
  const gotParam = paramOf(dest);
  const gotScreen = dest.includes("?p=") ? classify(gotParam) : "landing";
  const ok = gotParam === wantParam && gotScreen === wantScreen && dest.startsWith(DEST) && !/\/\/.*\/\//.test(dest.replace("https://",""));
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${url}\n      -> ${dest}\n      ?p="${gotParam}" (want "${wantParam}")  screen=${gotScreen} (want ${wantScreen})`);
}
console.log(fail === 0 ? `\nALL ${CASES.length} CASES PASS` : `\n${fail} FAILURE(S)`);
process.exit(fail === 0 ? 0 : 1);
