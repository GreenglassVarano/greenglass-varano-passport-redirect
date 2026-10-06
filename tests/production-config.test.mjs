/*
 * Project Passport — PRODUCTION configuration invariants (PASSPORT-DES-003 §12, ICR-005 cutover).
 *
 *   node tests/production-config.test.mjs
 *
 * The shipped Production renderer must target ONLY the Production Field Editor
 * ("1EG - Passport App", read from App Details 2026-10-06) and must carry no QA identifier,
 * QA URL or "QA STAFF HANDOFF" marker anywhere in served or runtime code.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG, staffLink, renderItem, renderContainer, renderInactive } from "../lib/passport.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROD = { app: "cc95f525-bd3c-4c4b-8ad2-1e6be1ed268d", env: "default-62ef81ec-93b4-43e1-841d-64a9f43216c0", tenant: "62ef81ec-93b4-43e1-841d-64a9f43216c0" };
const QA_APP = "fb9830e5-7a74-4e88-8327-75a8d86dd313";
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${!c && d ? "\n      << " + d : ""}`); };
const walk = (d) => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]) : [];

console.log("=== CONFIG ===");
ok("staffAppUrl is the Production App Details web link (no hint/sourcetime)", CONFIG.staffAppUrl === `https://apps.powerapps.com/play/e/${PROD.env}/a/${PROD.app}`, CONFIG.staffAppUrl);
ok("tenantId is the Production tenant", CONFIG.tenantId === PROD.tenant);
ok("environmentMarker is null", CONFIG.environmentMarker === null);
ok("durable origin unchanged", CONFIG.durableOrigin === "https://passport.greenglassvarano.com");

console.log("\n=== No QA identifier / marker in shipped code or data ===");
const shipped = [...walk(path.join(ROOT, "lib")), ...walk(path.join(ROOT, "functions")), ...walk(path.join(ROOT, "assets")), ...walk(path.join(ROOT, "public-data")),
  ...["index.html", "404.html", "robots.txt"].map((f) => path.join(ROOT, f))].filter((f) => fs.existsSync(f));
const hits = shipped.filter((f) => { const t = fs.readFileSync(f, "utf8"); return t.includes(QA_APP) || /QA STAFF HANDOFF|Passport App - QA/i.test(t); });
ok(`no QA app id, QA app name or QA marker in ${shipped.length} shipped files`, hits.length === 0, hits.map((f) => path.relative(ROOT, f)).join());

console.log("\n=== Every staff link targets Production with the same Record ID ===");
const pages = [
  ["1EG-0001", "edit", renderItem({ recordId: "1EG-0001", fields: { ItemName: "x" }, media: [] })],
  ["1EG-C-0001", "edit", renderContainer({ recordId: "1EG-C-0001", fields: {}, contents: [], media: [] })],
  ["1EG-0003", "activate", renderInactive("1EG-0003", "item")],
  ["1EG-C-0002", "edit", renderInactive("1EG-C-0002", "container")],
];
for (const [id, intent, html] of pages) {
  const hrefs = [...html.matchAll(/class="staff-btn" href="([^"]*)"/g)].map((m) => new URL(m[1].replace(/&amp;/g, "&")));
  const u = hrefs[0];
  ok(`${id}: one staff link → Production app, id=${id}, entry=passport, intent=${intent}`,
     hrefs.length === 1 && u.origin === "https://apps.powerapps.com" && u.pathname === `/play/e/${PROD.env}/a/${PROD.app}` &&
     [...u.searchParams.keys()].sort().join() === "entry,id,intent,tenantId" && u.searchParams.get("id") === id &&
     u.searchParams.get("entry") === "passport" && u.searchParams.get("intent") === intent && u.searchParams.get("tenantId") === PROD.tenant, u && u.href);
  ok(`${id}: no environment marker rendered`, !/env-marker|QA STAFF/.test(html));
}
ok("staffLink never emits the QA app", !staffLink("1EG-0001", "edit").includes(QA_APP));
ok("no secret-like material in config", !/secret|password|bearer|token=/i.test(JSON.stringify(CONFIG)));

console.log(`\n---------------------------------------------\nPRODUCTION CONFIG: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
