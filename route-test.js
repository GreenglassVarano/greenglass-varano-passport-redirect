/*
 * 1EG Passport durable-URL redirect — routing-contract test (local, no network).
 * Project Blackbook PB-PP-1EG-ARCH-2026-09-08-02 / HK09 Phase 2A.1.
 *
 * Run:  node route-test.js
 *
 * WHAT THIS PROVES
 *   1. It loads the SHIPPED `functions/1EG/[id].js` and INVOKES it, then parses the
 *      real `Location` of the Response it returns. The single-segment Record ID
 *      route is therefore tested as code, not as a model of code.
 *   2. It parses the SHIPPED `_redirects` and evaluates the remaining fallback
 *      rules with Cloudflare matching semantics.
 *   Neither the Function nor the rule table can drift away from these tests.
 *
 * WHY THE FUNCTION EXISTS — see functions/1EG/[id].js. `_redirects` substitutes a
 * captured placeholder verbatim and unencoded, so a raw `&` in the path escaped
 * the `p` parameter on the real Cloudflare edge.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const DEST_ORIGIN = "https://dbgroupcorp.sharepoint.com";
const DEST_PATH = "/sites/1EG-PreservedItemCatalogue/SitePages/Passport.aspx";
const LANDING = DEST_ORIGIN + DEST_PATH;

let fail = 0;
const ok = (cond, label, detail) => {
  if (!cond) fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? "\n      " + detail : ""}`);
};

// ---------- load the SHIPPED Pages Function and invoke it ----------
// The file is an ES module (Cloudflare requires it). Strip the `export` keyword so
// it can be evaluated here without a package.json "type" change that would alter
// how Cloudflare's build treats the project.
function loadOnRequest() {
  const src = fs.readFileSync(path.join(__dirname, "functions", "1EG", "[id].js"), "utf8");
  const ctx = { URL, URLSearchParams, Response, String, module: {} };
  vm.createContext(ctx);
  vm.runInContext(src.replace(/^\s*export\s+function\s+onRequest/m, "function onRequest") +
                  "\nmodule.onRequest = onRequest;", ctx);
  return ctx.module.onRequest;
}
const onRequest = loadOnRequest();

const locationOf = res => res.headers.get("location");

// ---------- the Record IDs the Function must contain inside a single `p` ----------
const IDS = [
  "1EG-0001", "1EG-C-0001", "1eg-0001", "1eg-c-0001", "1EG-9999", "GARBAGE",
  "X&admin=1", "1EG-0001&utm=x", "A&b&c", "X=admin", "X?admin=1",
  "X%26admin%3D1", "..%2f..%2fevil.com", "@evil.com", "https://evil.com", "%2e%2e%2f",
];

console.log("=== Pages Function — single-segment Record ID ===");
for (const id of IDS) {
  const loc = locationOf(onRequest({ params: { id } }));
  const u = new URL(loc);
  const keys = [...u.searchParams.keys()];
  const good =
    u.protocol === "https:" &&
    u.hostname === "dbgroupcorp.sharepoint.com" &&
    u.pathname === DEST_PATH &&
    keys.length === 1 &&
    keys[0] === "p" &&
    u.searchParams.get("p") === id;
  ok(good, `id=${JSON.stringify(id)}`,
     `-> ${loc}\n      params=${JSON.stringify([...u.searchParams.entries()])}`);
}

console.log("\n=== Function invariants ===");
{
  const loc = locationOf(onRequest({ params: { id: "1EG-0001&utm=x" } }));
  const u = new URL(loc);
  ok(!u.searchParams.has("utm"), "a raw & in the Record ID cannot create a second parameter",
     `params=${JSON.stringify([...u.searchParams.entries()])}`);
  ok([...u.searchParams.keys()].length === 1, "exactly one destination query parameter");
}
{
  // Inbound query strings are discarded: the Function never reads request.url.
  const src = fs.readFileSync(path.join(__dirname, "functions", "1EG", "[id].js"), "utf8");
  ok(!/context\.request|request\.url|\.search\b/.test(src),
     "the Function never reads the inbound request URL or its query string");
  ok(!/\+\s*["'`]\?p=|`.*\$\{.*\}.*\?p=/.test(src),
     "the Record ID is never concatenated into a query string");
  const hosts = src.match(/https?:\/\/[^"'\s]+/g) || [];
  ok(hosts.every(h => h.startsWith(DEST_ORIGIN + "/sites/1EG-PreservedItemCatalogue")),
     "every URL literal in the Function is the governed SharePoint destination");
  ok(/Response\.redirect\([^,]+,\s*302\s*\)/.test(src), "the Function issues a genuine 302");
}

// ---------- the SHIPPED _redirects fallbacks ----------
function parseRedirects(file) {
  return fs.readFileSync(file, "utf8").split("\n").map(l => l.trim())
    .filter(l => l && !l.startsWith("#"))
    .map(l => { const [from, to, code] = l.split(/\s+/); return { from, to, code: Number(code || 302) }; });
}
function matchRule(rulePath, reqPath) {
  const star = rulePath.indexOf("*");
  if (star !== -1) {
    const prefix = rulePath.slice(0, star);
    return reqPath.startsWith(prefix) ? {} : null;
  }
  return rulePath === reqPath ? {} : null;
}
function resolveFallback(reqPath, rules) {
  for (const r of rules) if (matchRule(r.from, reqPath)) return r;
  return null;
}

const rules = parseRedirects(path.join(__dirname, "_redirects"));

console.log("\n=== _redirects fallbacks (Landing, never a fabricated ID) ===");
for (const p of ["/1EG/", "/1EG", "/", "/wrong/1EG-0001", "/1EG/a/b/c", "/anything/else"]) {
  const r = resolveFallback(p, rules);
  ok(!!r && r.to === LANDING && r.code === 302, `${p} -> Landing, no ?p=`,
     r ? `-> ${r.to} [${r.code}]` : "(no rule matched)");
}

console.log("\n=== _redirects whole-table invariants ===");
ok(rules.every(r => r.to === LANDING), "every remaining rule is the bare Landing URL");
ok(rules.every(r => !r.to.includes("?")), "no remaining rule produces a query string at all");
ok(rules.every(r => !/:\w/.test(r.from) && !/:\w/.test(r.to.replace(/^https:/, ""))),
   "NO remaining rule substitutes a captured placeholder");
ok(rules.every(r => !r.to.includes(":splat")), "no remaining rule forwards a splat");
ok(rules.every(r => r.code === 302), "the backend hop is 302, never 301");
ok(!rules.some(r => r.from.includes("pages.dev") || r.to.includes("pages.dev")),
   "the cutover-only pages.dev canonicalisation is NOT active");
ok(!fs.readFileSync(path.join(__dirname, "_redirects"), "utf8")
     .split("\n").filter(l => l.trim() && !l.trim().startsWith("#"))
     .some(l => /\?p=/.test(l)),
   "no ?p= rule remains in _redirects — the Function is the sole Record-ID authority");

console.log(fail === 0 ? `\nALL CHECKS PASS` : `\n${fail} FAILURE(S)`);
process.exit(fail === 0 ? 0 : 1);
