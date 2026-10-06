/*
 * Project Passport — public routing + rendering contract (PASSPORT-DES-003 §3, §7, §11).
 * Successor to the HK09 `route-test.js` (which tested the SharePoint 302 that remains on `main`).
 *
 *   node tests/public-routing.test.mjs
 *
 * Imports the SHIPPED lib/passport.mjs (the Pages Functions are one-line wrappers over it) and
 * invokes it with an `env.ASSETS` / `next()` that serve this repository's own files, exactly as
 * Cloudflare Pages serves the deployment's static assets. No network, no secrets.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleRecordRoute, handleSite, staffLink, classify, esc, renderItem, renderContainer, renderInactive, CONFIG } from "../lib/passport.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://passport.greenglassvarano.com";
const QA_APP = "fb9830e5-7a74-4e88-8327-75a8d86dd313";
const PROD_APP = "cc95f525-bd3c-4c4b-8ad2-1e6be1ed268d";
let pass = 0, fail = 0;
const ok = (label, cond, detail) => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${label}${!cond && detail ? "\n      << " + detail : ""}`); };

/* ---------- a Cloudflare-Pages-shaped static asset server over this repository ---------- */
const TYPES = { ".json": "application/json", ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "application/javascript", ".jpg": "image/jpeg", ".mp4": "video/mp4", ".txt": "text/plain" };
function serve(pathname) {
  const rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory())
    return new Response(fs.readFileSync(path.join(ROOT, "404.html")), { status: 404, headers: { "content-type": TYPES[".html"] } });
  return new Response(fs.readFileSync(file), { status: 200, headers: { "content-type": TYPES[path.extname(file)] || "application/octet-stream" } });
}
const assetLog = [];
const env = { ASSETS: { fetch: async (req) => { const u = new URL(req.url); assetLog.push(u); return serve(u.pathname); } } };
const get = (p, method = "GET") => new Request(ORIGIN + p, { method });
const record = (p, method) => handleRecordRoute(get(p, method), env);
const site = (p, method) => { const r = get(p, method); return handleSite(r, env, async () => serve(new URL(r.url).pathname)); };
const staffHrefs = (html) => [...html.matchAll(/class="staff-btn" href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
const SEC = ["content-security-policy", "x-content-type-options", "referrer-policy", "x-frame-options", "x-robots-tag"];
const hasSec = (res) => SEC.every((h) => res.headers.get(h));

/** A staff link must be exactly: QA Field Editor, 4 parameters, the validated id. */
function staffLinkOk(href, id, intent) {
  const u = new URL(href);
  return u.origin === "https://apps.powerapps.com" && u.pathname.endsWith(`/a/${QA_APP}`) &&
    [...u.searchParams.keys()].sort().join() === "entry,id,intent,tenantId" &&
    u.searchParams.get("id") === id && u.searchParams.get("intent") === intent &&
    u.searchParams.get("entry") === "passport" && u.searchParams.get("tenantId") === CONFIG.tenantId;
}
const allLocations = [];
async function expectRedirect(p, to) {
  const res = await record(p); const loc = res.headers.get("location"); allLocations.push(loc);
  ok(`${p} → 308 ${to}`, res.status === 308 && loc === to, `${res.status} ${loc}`);
}
async function expectNotFound(p, label = p) {
  const res = await record(p); const body = await res.text(); if (res.headers.get("location")) allLocations.push(res.headers.get("location"));
  ok(`${label} → 404 neutral Not Found, no staff control`, res.status === 404 && /Passport not found/.test(body) && !/staff-btn/.test(body) && hasSec(res), `${res.status}`);
}

console.log("=== 1. Published Item ===");
{
  const res = await record("/1EG/1EG-0001"); const body = await res.text();
  ok("/1EG/1EG-0001 → 200 HTML", res.status === 200 && /text\/html/.test(res.headers.get("content-type")));
  ok("renders the published Item name + Record ID", body.includes("Coffee cup") && body.includes(">1EG-0001<"));
  ok("renders a published field (Description)", body.includes("Coffee cup used"));
  ok("hero image + video come from public-media only", body.includes('src="/public-media/1EG/1EG-0001/1EG-0001-01.jpg"') && body.includes('src="/public-media/1EG/1EG-0001/1EG-0001-04.mp4"'));
  ok("links the published Container", body.includes('href="/1EG/1EG-C-0001"'));
  const s = staffHrefs(body);
  ok("exactly one staff control: Open in Field Editor (intent=edit)", s.length === 1 && body.includes("Greenglass Varano Staff · Open in Field Editor") && staffLinkOk(s[0], "1EG-0001", "edit"), s.join());
  ok("staff href is HTML-escaped in the markup (&amp; separators)", /class="staff-btn" href="https:\/\/apps\.powerapps\.com\/[^"]*&amp;id=1EG-0001&amp;entry=passport&amp;intent=edit"/.test(body));
  ok("preview marker 'QA STAFF HANDOFF' is shown", body.includes(">QA STAFF HANDOFF<"));
  ok("security headers present (CSP, nosniff, no-referrer, DENY, noindex)", hasSec(res));
  ok("no SharePoint / tenant host / location / Tag Status text in the page", !/sharepoint|dbgroupcorp|StorageLocation|Tag Status|field_\d/i.test(body));
  ok("no inline script and no third-party origin in the page", !/<script/i.test(body) && ![...body.matchAll(/(?:src|href)="(https?:[^"]*)"/g)].some((m) => !m[1].startsWith("https://apps.powerapps.com/")));
  const head = await record("/1EG/1EG-0001", "HEAD");
  ok("HEAD /1EG/1EG-0001 → 200", head.status === 200);
}

console.log("\n=== 2. Published Container ===");
{
  const res = await record("/1EG/1EG-C-0001"); const body = await res.text();
  ok("/1EG/1EG-C-0001 → 200", res.status === 200);
  ok("renders type, status, condition", body.includes("Cardboard Box") && body.includes("Preparing") && body.includes("Good"));
  ok("Contents manifest links both published Items", body.includes('href="/1EG/1EG-0001"') && body.includes('href="/1EG/1EG-0002"') && body.includes("Kirkland Water Bottle"));
  const s = staffHrefs(body);
  ok("staff control: Open Container (intent=edit)", s.length === 1 && body.includes("Greenglass Varano Staff · Open Container") && staffLinkOk(s[0], "1EG-C-0001", "edit"), s.join());
}

console.log("\n=== 3. Issued but not yet published (inactive) ===");
for (const id of ["1EG-0003", "1EG-0100", "1EG-0250"]) {
  const res = await record(`/1EG/${id}`); const body = await res.text(); const s = staffHrefs(body);
  ok(`/1EG/${id} → 200 "This Passport has not yet been activated." + ACTIVATE PASSPORT (intent=activate)`,
     res.status === 200 && body.includes("This Passport has not yet been activated.") && body.includes("Greenglass Varano Staff · Activate Passport") && s.length === 1 && staffLinkOk(s[0], id, "activate"), `${res.status} ${s}`);
  ok(`/1EG/${id} discloses nothing beyond the Record ID`, !/Coffee|Kirkland|Cardboard|fields|gallery/.test(body));
}
{
  const body = renderInactive("1EG-C-0002", "container"); const s = staffHrefs(body);
  ok("inactive Container → neutral copy + OPEN CONTAINER (intent=edit)", body.includes("This Passport has not yet been activated.") && body.includes("Greenglass Varano Staff · Open Container") && staffLinkOk(s[0], "1EG-C-0002", "edit"));
}

console.log("\n=== 4. Invalid / never-issued IDs → neutral Not Found ===");
for (const p of ["/1EG/1EG-0251", "/1EG/1EG-9999", "/1EG/1EG-0000", "/1EG/1EG-C-0002", "/1EG/GARBAGE", "/1EG/1EG-TEST", "/1EG/1EG-00001", "/1EG/1EG-001", "/1EG/2EG-0001", "/1EG/%20"])
  await expectNotFound(p);

console.log("\n=== 5. Canonicalisation (lowercase, trailing slash, percent-encoded) ===");
await expectRedirect("/1EG/1eg-0001", "/1EG/1EG-0001");
await expectRedirect("/1EG/1eg-c-0001", "/1EG/1EG-C-0001");
await expectRedirect("/1EG/1EG-0001/", "/1EG/1EG-0001");
await expectRedirect("/1EG/1EG-C-0001/", "/1EG/1EG-C-0001");
await expectRedirect("/1EG/1EG%2D0001", "/1EG/1EG-0001");
await expectRedirect("/1EG/%31%45%47-0003", "/1EG/1EG-0003");
await expectRedirect("/1EG", "/");
await expectRedirect("/1EG/", "/");
await expectRedirect("/1EG/.", "/");   // dot segments are resolved by the URL parser before routing
await expectRedirect("/1EG/..", "/");

console.log("\n=== 6. Inbound query strings are ignored ===");
{
  const res = await record("/1EG/1EG-0001?utm_source=qr&sid=abc&intent=activate&id=1EG-0002"); const body = await res.text(); const s = staffHrefs(body);
  ok("/1EG/1EG-0001?utm_source=qr&sid=abc&intent=activate&id=1EG-0002 → 200 Item page", res.status === 200 && body.includes("Coffee cup"));
  ok("no inbound parameter reaches the page or the staff link", !/utm_source|sid=abc/.test(body) && staffLinkOk(s[0], "1EG-0001", "edit"), s.join());
  const red = await record("/1EG/1eg-0001?utm_source=qr");
  ok("canonical redirect drops the query string", red.headers.get("location") === "/1EG/1EG-0001");
}

console.log("\n=== 7. Raw & / encoded delimiters / traversal → Not Found, never a parameter ===");
for (const p of ["/1EG/X&admin=1", "/1EG/1EG-0001&utm=x", "/1EG/A&b&c", "/1EG/X=admin", "/1EG/X%26admin%3D1", "/1EG/1EG-0001%26intent%3Dactivate",
                 "/1EG/1EG-0001%3Fintent%3Dactivate", "/1EG/..%2F..%2Fevil.com", "/1EG/%2e%2e%2f", "/1EG/%", "/1EG/%ZZ", "/1EG/@evil.com",
                 "/1EG/https:%2F%2Fevil.com", "/1EG/%3Cscript%3E", "/1EG/1EG-0001%00"])
  await expectNotFound(p);

console.log("\n=== 8. Nested paths → Not Found (never a fabricated ID) ===");
for (const p of ["/1EG/1EG-0001/extra", "/1EG/a/b/c", "/1EG/1EG-0001//", "/1EG//evil.com", "/1EG/1EG-0001/1EG-0002"])
  await expectNotFound(p);

console.log("\n=== 9. No open redirect ===");
ok(`every Location produced (${allLocations.length}) is a same-origin absolute path`, allLocations.length > 0 && allLocations.every((l) => /^\/(1EG\/1EG-(C-)?\d{4})?$/.test(l)), allLocations.join(" "));
{
  const res = await record("/1EG/1EG-0001", "POST");
  ok("POST → 405 (GET/HEAD only)", res.status === 405);
}

console.log("\n=== 10. Data is read ONLY from this deployment's own public-data ===");
ok("every ASSETS fetch was same-origin under /public-data/1EG/", assetLog.length > 0 && assetLog.every((u) => u.origin === ORIGIN && /^\/public-data\/1EG\/(items\/1EG-\d{4}|containers\/1EG-C-\d{4}|issued-record-ids)\.json$/.test(u.pathname)),
   assetLog.map((u) => u.href).filter((h) => !h.includes("/public-data/1EG/")).join());
{
  const src = fs.readFileSync(path.join(ROOT, "lib", "passport.mjs"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  ok("lib/passport.mjs makes no outbound fetch (only env.ASSETS.fetch)", (code.match(/fetch\(/g) || []).length === 1 && /env\.ASSETS\.fetch\(/.test(code));
  ok("lib/passport.mjs holds no SharePoint endpoint, Graph, token or secret", !/sharepoint|graph\.microsoft|login\.microsoftonline|client_secret|bearer|Authorization/i.test(code));
  for (const f of ["functions/1EG/[[path]].js", "functions/[[path]].js"]) {
    const w = fs.readFileSync(path.join(ROOT, f), "utf8");
    ok(`${f} is a thin wrapper over lib/passport.mjs`, /from "(\.\.\/)+lib\/passport\.mjs"/.test(w) && !/fetch\(|sharepoint/i.test(w.replace(/\/\*[\s\S]*?\*\//g, "")));
  }
  ok("the HK09 SharePoint Function and _redirects are retired on this branch", !fs.existsSync(path.join(ROOT, "functions", "1EG", "[id].js")) && !fs.existsSync(path.join(ROOT, "_redirects")));
}

console.log("\n=== 11. Staff link construction ===");
ok("staffLink(1EG-0001, edit) is exact", staffLinkOk(staffLink("1EG-0001", "edit"), "1EG-0001", "edit"));
ok("staffLink(1EG-0003, activate) is exact", staffLinkOk(staffLink("1EG-0003", "activate"), "1EG-0003", "activate"));
for (const bad of ["1EG-0001&intent=activate", "1EG-0001?x=1", "<script>", "1eg-0001", "1EG-TEST", "", "1EG-0001#x", "1EG-0001 "]) {
  let threw = false; try { staffLink(bad, "edit"); } catch { threw = true; }
  ok(`staffLink rejects an unvalidated id ${JSON.stringify(bad)}`, threw);
}
for (const bad of ["delete", "", "EDIT", "edit&x=1"]) {
  let threw = false; try { staffLink("1EG-0001", bad); } catch { threw = true; }
  ok(`staffLink rejects an unknown intent ${JSON.stringify(bad)}`, threw);
}
ok("PREVIEW config targets the QA app, never Production", CONFIG.staffAppUrl.endsWith(`/a/${QA_APP}`) && !CONFIG.staffAppUrl.includes(PROD_APP) && CONFIG.environmentMarker === "QA STAFF HANDOFF");
ok("staff link host is apps.powerapps.com over HTTPS", new URL(CONFIG.staffAppUrl).protocol === "https:" && new URL(CONFIG.staffAppUrl).host === "apps.powerapps.com");

console.log("\n=== 12. Output encoding (hostile published values cannot inject markup) ===");
{
  const evil = '<img src=x onerror=alert(1)>"\'`=&';
  const item = renderItem({ recordId: "1EG-0001", fields: { ItemName: evil, ShortDescription: evil, Maker: evil, ContainerRef: '1EG-C-0001"><script>' }, media: [] });
  ok("hostile Item values are escaped", !item.includes("<img src=x") && item.includes("&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&#96;=&amp;"));
  ok("a malformed ContainerRef produces no relation link", !item.includes('class="relation"'));
  const cont = renderContainer({ recordId: "1EG-C-0001", fields: { ContainerType: evil }, contents: [{ recordId: "1EG-0001", itemName: evil, thumb: null }], media: [] });
  ok("hostile Container values are escaped", !cont.includes("<img src=x"));
  ok("esc() covers & < > \" ' ` (all attribute values are double-quoted)", esc('&<>"\'`') === "&amp;&lt;&gt;&quot;&#39;&#96;");
  ok("classify() never throws on malformed input", ["%", "%E0%A4%A", "\u0000", "a".repeat(5000)].every((s) => classify(s).kind === "invalid"));
}

console.log("\n=== 13. Site paths outside /1EG ===");
{
  const home = await site("/"); const hb = await home.text();
  ok("/ → 200 catalogue with search + Items/Containers tabs, security headers", home.status === 200 && hb.includes('id="q"') && hb.includes('data-kind="container"') && hasSec(home));
  ok("catalogue page has no inline script/handler (CSP script-src 'self')", !/<script(?![^>]*\bsrc=)/i.test(hb) && !/\son[a-z]+=/i.test(hb));
  for (const p of ["/assets/passport.css", "/assets/catalog.js", "/robots.txt", "/public-data/1EG/catalog.json", "/public-data/1EG/items/1EG-0001.json", "/public-media/1EG/1EG-0001/1EG-0001-01-thumb.jpg", "/public-media/1EG/1EG-0001/1EG-0001-04.mp4"]) {
    const r = await site(p); ok(`${p} → 200 (public static)`, r.status === 200 && hasSec(r), r.status);
  }
  for (const p of ["/README.md", "/route-test.js", "/lib/passport.mjs", "/functions/[[path]].js", "/tests/public-routing.test.mjs", "/.github/workflows/redirect-tests.yml",
                   "/CNAME", "/package.json", "/public-data/1EG/items/1EG-TEST.json", "/public-media/1EG/../../README.md", "/wrong/1EG-0001", "/1eg/1EG-0001", "/.git/config"]) {
    const r = await site(p); ok(`${p} → 404 (not public)`, r.status === 404, r.status);
  }
  const r = await site("/", "POST"); ok("POST / → 405", r.status === 405);
}

console.log("\n---------------------------------------------");
console.log(`PUBLIC ROUTING: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
