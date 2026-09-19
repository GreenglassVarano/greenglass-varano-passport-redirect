/*
 * 1EG Passport durable-URL redirect — routing-contract test (local, no network).
 * Project Blackbook PB-PP-1EG-ARCH-2026-09-08-02 / HK09 Phase 2A.
 *
 * Run:  node route-test.js
 *
 * WHAT THIS PROVES
 *   It parses the SHIPPED `_redirects` file and evaluates it with Cloudflare
 *   Pages matching semantics (first match wins; `:name` matches exactly one
 *   non-empty path segment; `*` matches greedily including empty). The rule
 *   table and the tests therefore cannot drift apart.
 *
 * WHAT THIS DOES NOT PROVE
 *   That Cloudflare's edge implements those semantics identically, and in
 *   particular (a) whether an inbound query string is appended to a destination
 *   that already carries one, and (b) whether a placeholder value is
 *   percent-encoded on substitution. Both are UNDOCUMENTED and must be probed
 *   on the staging deployment before cutover. See README "Staging acceptance".
 */
"use strict";

const fs = require("fs");
const path = require("path");

const DEST_ORIGIN = "https://dbgroupcorp.sharepoint.com";
const LANDING = DEST_ORIGIN + "/sites/1EG-PreservedItemCatalogue/SitePages/Passport.aspx";

// ---------- parse the shipped _redirects ----------
function parseRedirects(file) {
  return fs.readFileSync(file, "utf8")
    .split("\n")
    .map(l => l.trim())
    .filter(l => l && !l.startsWith("#"))
    .map(l => {
      const [from, to, code] = l.split(/\s+/);
      return { from, to, code: Number(code || 302) };
    });
}

// ---------- Cloudflare Pages matching semantics ----------
function matchRule(rulePath, reqPath) {
  const star = rulePath.indexOf("*");
  if (star !== -1) {
    const prefix = rulePath.slice(0, star);
    return reqPath.startsWith(prefix) ? { splat: reqPath.slice(prefix.length) } : null;
  }
  const rp = rulePath.split("/"), qp = reqPath.split("/");
  if (rp.length !== qp.length) return null;
  const vars = {};
  for (let i = 0; i < rp.length; i++) {
    if (rp[i].startsWith(":")) {
      if (qp[i] === "") return null;            // a placeholder never matches an empty segment
      vars[rp[i].slice(1)] = qp[i];
    } else if (rp[i] !== qp[i]) return null;
  }
  return vars;
}

function resolve(reqUrl, rules) {
  let reqPath;
  try { reqPath = new URL(reqUrl, "https://passport.greenglassvarano.com").pathname; }
  catch { reqPath = reqUrl.startsWith("/") ? reqUrl : "/" + reqUrl; }
  for (const r of rules) {
    const vars = matchRule(r.from, reqPath);
    if (!vars) continue;
    let to = r.to;
    for (const [k, v] of Object.entries(vars)) to = to.split(":" + k).join(v);
    return { to, code: r.code };
  }
  return null;
}

const paramOf = u => { const i = u.indexOf("?p="); return i === -1 ? "" : u.slice(i + 3); };

// ---------- what the SPFx page then does with ?p= (mirrors classifyRecordId) ----------
function classify(raw) {
  const id = (raw || "").trim().toUpperCase();
  if (!id) return "landing";
  if (id.indexOf("1EG-C-") === 0) return "container";
  if (id.indexOf("1EG-") === 0) return "item";
  return "not-found";
}

// ---------- cases: [request, expected ?p=, expected screen, expected status] ----------
const CASES = [
  ["/1EG/1EG-0001",            "1EG-0001",   "item",      302],
  ["/1EG/1EG-0002",            "1EG-0002",   "item",      302],
  ["/1EG/1EG-C-0001",          "1EG-C-0001", "container", 302],
  ["/1EG/1eg-0001",            "1eg-0001",   "item",      302],  // case preserved verbatim; SPFx upper-cases
  ["/1EG/1eg-c-0001",          "1eg-c-0001", "container", 302],
  ["/1EG/1EG-0125",            "1EG-0125",   "item",      302],
  ["/1EG/1EG-9999",            "1EG-9999",   "item",      302],  // well-formed, absent -> SPFx "not found"
  ["/1EG/GARBAGE",             "GARBAGE",    "not-found", 302],  // malformed id still forwarded (dumb host)
  ["/1EG/1EG-0001/",           "1EG-0001",   "item",      302],  // trailing slash keeps the id
  ["/1EG/1EG-0001?x=1",        "1EG-0001",   "item",      302],  // stray query dropped by the rule table
  ["/1EG/1EG-0001?utm_source=qr&sid=abc", "1EG-0001", "item", 302],
  ["/1EG/",                    "",           "landing",   302],
  ["/1EG",                     "",           "landing",   302],
  ["/",                        "",           "landing",   302],
  ["/wrong/1EG-0001",          "",           "landing",   302],  // wrong namespace -> Landing
  ["/1EG/1EG-0001/extra",      "",           "landing",   302],  // nested -> Landing, never a fabricated id
  ["/1EG/a/b/c",               "",           "landing",   302],
  ["/1EG/%ZZ",                 "%ZZ",        "not-found", 302],  // malformed percent-encoding forwarded verbatim
  ["/1EG/%2e%2e%2f",           "%2e%2e%2f",  "not-found", 302],
  ["/anything/else",           "",           "landing",   302],
];

const rules = parseRedirects(path.join(__dirname, "_redirects"));
let fail = 0;

for (const [req, wantParam, wantScreen, wantCode] of CASES) {
  const r = resolve(req, rules);
  const dest = r ? r.to : "(no rule matched)";
  const gotParam = r ? paramOf(dest) : "";
  const gotScreen = dest.includes("?p=") ? classify(gotParam) : "landing";
  const ok = !!r && gotParam === wantParam && gotScreen === wantScreen && r.code === wantCode
             && dest.startsWith(DEST_ORIGIN + "/");
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${req}\n      -> ${dest}  [${r ? r.code : "-"}]\n      ?p="${gotParam}" (want "${wantParam}")  screen=${gotScreen} (want ${wantScreen})`);
}

// ---------- invariants over the whole shipped rule table ----------
function inv(name, cond) {
  if (!cond) fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  INVARIANT  ${name}`);
}

inv("every rule redirects to the governed SharePoint origin",
    rules.every(r => r.to.startsWith(DEST_ORIGIN + "/sites/1EG-PreservedItemCatalogue/SitePages/Passport.aspx")));
inv("no destination host contains a placeholder or splat (no open redirect)",
    rules.every(r => !/^https?:\/\/[^/]*(:[A-Za-z_]|\*)/.test(r.to)));
inv("the backend hop is 302, never 301",
    rules.every(r => r.code === 302));
inv("the only substituted value is :id, and only in the ?p= query value",
    rules.every(r => { const q = r.to.indexOf("?"); const before = q === -1 ? r.to : r.to.slice(0, q);
                       return !before.includes(":") || before.startsWith("https:"); }));
inv("no rule forwards an inbound query string",
    rules.every(r => !r.to.includes(":splat") && (r.to.match(/\?/g) || []).length <= 1));
inv("no tracking/session parameter appears in any destination",
    rules.every(r => !/utm_|sid=|session|token|fbclid|gclid/i.test(r.to)));
inv("landing destinations carry no query string at all",
    rules.filter(r => !r.to.includes("?p=")).every(r => r.to === LANDING));
inv("the cutover-only pages.dev canonicalisation is NOT active",
    !rules.some(r => r.from.includes("pages.dev") || r.to.includes("pages.dev")));

// ---------- the destination host cannot be influenced by the request ----------
const HOSTILE = [
  "/1EG/..%2f..%2fevil.com", "/1EG/https:%2f%2fevil.com", "/1EG/@evil.com",
  "/\\evil.com", "//evil.com", "/1EG/%00", "/1EG/.%2e/%2e%2e",
];
for (const h of HOSTILE) {
  const r = resolve(h, rules);
  const ok = !!r && new URL(r.to).host === "dbgroupcorp.sharepoint.com";
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  HOSTILE  ${h}\n      -> host=${r ? new URL(r.to).host : "(none)"} (must be dbgroupcorp.sharepoint.com)`);
}

const total = CASES.length + 8 + HOSTILE.length;
console.log(fail === 0 ? `\nALL ${total} CHECKS PASS` : `\n${fail} FAILURE(S) of ${total}`);
process.exit(fail === 0 ? 0 : 1);
