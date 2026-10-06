/*
 * ============================================================================
 * PROJECT PASSPORT — PUBLIC PASSPORT RENDERER  (PASSPORT-ADR-002 / DES-003 / ICR-005)
 * ============================================================================
 * Anonymous, read-only Passport pages at the durable URL
 *     https://passport.greenglassvarano.com/1EG/<RecordID>
 *
 * DATA AUTHORITY: only the static public export in this repository (public-data/1EG/*, built
 * from the governed published read model). This runtime holds NO Microsoft credential, token,
 * tenant secret or SharePoint endpoint and makes NO outbound request: data is read from this
 * deployment's own static assets (env.ASSETS).
 *
 * STAFF HANDOFF: every Passport carries a staff control that deep-links to the authenticated
 * Field Editor (Power Apps). The page never tries to detect staff; Power Apps authenticates.
 * The link is built with the URL API from a VALIDATED Record ID only.
 *
 * All routing and rendering lives here; the Pages Functions are thin wrappers so the routing
 * contract tests exercise exactly this shipped code.
 * ============================================================================
 */

/* ---------------- configuration (the only environment-specific values) ---------------- */
// PRODUCTION (DES-003 §12 cutover). Only this block differs from the QA preview build.
export const CONFIG = Object.freeze({
  project: "1EG",
  projectName: "1 Edmund Gate",
  durableOrigin: "https://passport.greenglassvarano.com",
  // Field Editor web link (App Details of "1EG - Passport App" (Production), read 2026-10-06; hint/sourcetime dropped). Identifiers, not secrets.
  staffAppUrl: "https://apps.powerapps.com/play/e/default-62ef81ec-93b4-43e1-841d-64a9f43216c0/a/cc95f525-bd3c-4c4b-8ad2-1e6be1ed268d",
  tenantId: "62ef81ec-93b4-43e1-841d-64a9f43216c0",
  environmentMarker: null, // Production: no environment marker
});

/* ---------------- record identity ---------------- */
const ITEM_ID = /^1EG-\d{4}$/;
const CONTAINER_ID = /^1EG-C-\d{4}$/;

/** Classify a raw path segment. Never throws; never trusts input. */
export function classify(rawSegment) {
  let decoded;
  try { decoded = decodeURIComponent(String(rawSegment)); } catch { return { kind: "invalid" }; }
  const id = decoded.trim().toUpperCase();
  if (CONTAINER_ID.test(id)) return { kind: "container", id };
  if (ITEM_ID.test(id)) return { kind: "item", id };
  return { kind: "invalid" };
}

/** HTTPS staff deep link into the Field Editor. Only a validated id ever reaches this. */
export function staffLink(id, intent) {
  if (!(ITEM_ID.test(id) || CONTAINER_ID.test(id))) throw new Error("staffLink requires a validated Record ID");
  if (intent !== "edit" && intent !== "activate") throw new Error("unknown intent");
  const u = new URL(CONFIG.staffAppUrl);
  u.searchParams.set("tenantId", CONFIG.tenantId);
  u.searchParams.set("id", id);
  u.searchParams.set("entry", "passport");
  u.searchParams.set("intent", intent);
  return u.toString();
}

/* ---------------- HTML helpers ---------------- */
export function esc(v) {
  return String(v ?? "").replace(/[&<>"'`]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" }[c]));
}
const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow",
};
function html(body, status = 200, extra = {}) {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache", ...SECURITY_HEADERS, ...extra } });
}
function redirect(location, status = 308) {
  return new Response(null, { status, headers: { Location: location, "Cache-Control": "no-cache", ...SECURITY_HEADERS } });
}

/* ---------------- public field labels (DES-003 §5; SPFx precedent) ---------------- */
// Display order + labels for the exported public Item fields. Keys are the publisher's
// public projection names; only fields present in the export are ever shown.
const ITEM_LABELS = [
  ["ShortDescription", "Description", true], ["ItemClass", "Category"], ["ItemType", "Subcategory"],
  ["Period", "Period / era"], ["Maker", "Maker / manufacturer"], ["PhysicalState", "Physical state"],
  ["ConditionGrade", "Initial condition"], ["ConditionNarrative", "Initial condition notes", true],
  ["DamageSummary", "Damage summary", true], ["Significance", "Historic significance"],
  ["PreservationRationale", "Preservation rationale", true], ["OriginFloor", "Original floor"],
  ["OriginRoom", "Original room / area"], ["OriginSubLocation", "Original sub-location"],
  ["LifecycleStatus", "Lifecycle status"], ["IntendedDisposition", "Intended disposition"],
  ["FinalInstalledLocation", "Final installed location"],
];
const CONTAINER_LABELS = [
  ["ContainerDescription", "Description", true], ["ContainerType", "Container type"],
  ["ContainerStatusExternal", "Status"], ["ContainerCondition", "Condition"],
];

/* ---------------- page chrome ---------------- */
function page({ title, main, staff }) {
  const marker = CONFIG.environmentMarker ? `<p class="env-marker">${esc(CONFIG.environmentMarker)}</p>` : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer">
<title>${esc(title)} · Project Passport</title>
<link rel="stylesheet" href="/assets/passport.css">
</head>
<body>
<header class="band-top"><a class="brand" href="/"><span class="kicker">Project Passport · ${esc(CONFIG.projectName)}</span><span class="wordmark">Greenglass Varano</span></a></header>
<main class="shell">
${main}
</main>
${staff ? `<section class="staff" aria-label="Greenglass Varano staff">${marker}${staff}</section>` : ""}
<footer class="band-bottom"><span>Greenglass Varano · Project Passport</span><a href="/">All Passports</a></footer>
</body>
</html>
`;
}
const staffButton = (label, href) => `<a class="staff-btn" href="${esc(href)}">${esc(label)}</a>`;

function fieldsHtml(fields, labels) {
  const rows = labels.filter(([k]) => fields[k]).map(([k, label, multi]) =>
    `<div class="field"><div class="field-label">${esc(label)}</div><div class="field-value${multi ? " multiline" : ""}">${esc(fields[k])}</div></div>`);
  return rows.length ? `<div class="fields">${rows.join("")}</div>` : "";
}
function mediaHtml(media, name) {
  const images = media.filter((m) => m.type === "image");
  const videos = media.filter((m) => m.type === "video");
  if (!images.length && !videos.length) return `<div class="no-media">No photographs published yet</div>`;
  // Hero = the 1600px display rendition (mobile first); tapping opens the full sanitized original.
  const h = images[0] && (images[0].display || images[0]);
  const hero = h
    ? `<a class="hero" href="${esc(images[0].src)}"><img src="${esc(h.src)}" width="${esc(h.width)}" height="${esc(h.height)}" alt="${esc(name)}" fetchpriority="high"></a>` : "";
  const strip = images.length > 1
    ? `<div class="thumbs">${images.slice(1).map((m, i) => `<a href="${esc(m.src)}"><img src="${esc((m.thumb || m).src)}" width="${esc((m.thumb || m).width)}" height="${esc((m.thumb || m).height)}" alt="${esc(name)} — photograph ${i + 2}" loading="lazy" decoding="async"></a>`).join("")}</div>` : "";
  const vids = videos.map((v) => `<video class="video" controls playsinline preload="metadata" width="${esc(v.width)}" height="${esc(v.height)}"><source src="${esc(v.src)}" type="video/mp4"></video>`).join("");
  return `<section class="gallery">${hero}${strip}${vids}</section>`;
}

/* ---------------- page renderers ---------------- */
export function renderItem(doc) {
  const f = doc.fields;
  const container = f.ContainerRef && CONTAINER_ID.test(f.ContainerRef)
    ? `<a class="relation" href="/1EG/${esc(f.ContainerRef)}"><span class="relation-label">Stored in container</span><span class="relation-value">${esc(f.ContainerRef)}</span></a>` : "";
  const main = `<article class="passport">
<p class="rec-id">${esc(doc.recordId)}</p>
<p class="rec-type">Preserved Item Passport</p>
<h1 class="rec-name">${esc(f.ItemName || doc.recordId)}</h1>
${mediaHtml(doc.media, f.ItemName || doc.recordId)}
${fieldsHtml(f, ITEM_LABELS)}
${container}
</article>`;
  return page({ title: `${doc.recordId} ${f.ItemName || ""}`.trim(), main, staff: staffButton("Greenglass Varano Staff · Open in Field Editor", staffLink(doc.recordId, "edit")) });
}

export function renderContainer(doc) {
  const f = doc.fields;
  const list = doc.contents.length
    ? `<div class="manifest">${doc.contents.map((c) => `<a class="manifest-card" href="/1EG/${esc(c.recordId)}">${c.thumb ? `<img src="${esc(c.thumb)}" alt="" loading="lazy" decoding="async">` : `<span class="manifest-blank"></span>`}<span class="manifest-meta"><span class="manifest-id">${esc(c.recordId)}</span><span class="manifest-name">${esc(c.itemName || "")}</span></span></a>`).join("")}</div>`
    : `<p class="empty">No published items are currently assigned to this container.</p>`;
  const main = `<article class="passport">
<p class="rec-id">${esc(doc.recordId)}</p>
<p class="rec-type">Container Passport</p>
<h1 class="rec-name">${esc(f.ContainerType || "Container")}</h1>
${doc.media.length ? mediaHtml(doc.media, f.ContainerType || doc.recordId) : ""}
${fieldsHtml(f, CONTAINER_LABELS)}
<h2 class="section-h">Contents</h2>
${list}
</article>`;
  return page({ title: `${doc.recordId} ${f.ContainerType || ""}`.trim(), main, staff: staffButton("Greenglass Varano Staff · Open Container", staffLink(doc.recordId, "edit")) });
}

export function renderInactive(id, kind) {
  const main = `<article class="passport state">
<p class="kicker-lg">Project Passport</p>
<p class="rec-id rec-id-lg">${esc(id)}</p>
<p class="state-text">This Passport has not yet been activated.</p>
</article>`;
  const staff = kind === "item"
    ? staffButton("Greenglass Varano Staff · Activate Passport", staffLink(id, "activate"))
    : staffButton("Greenglass Varano Staff · Open Container", staffLink(id, "edit"));
  return page({ title: id, main, staff });
}

export function renderNotFound() {
  const main = `<article class="passport state">
<p class="kicker-lg">Project Passport</p>
<h1 class="state-title">Passport not found</h1>
<p class="state-text">That link doesn’t point to a valid Passport.</p>
<p><a class="nav-btn" href="/">Browse all Passports</a></p>
</article>`;
  return page({ title: "Passport not found", main, staff: null });
}

/* ---------------- data access (own static assets only) ---------------- */
async function asset(env, request, path) {
  const res = await env.ASSETS.fetch(new Request(new URL(path, request.url).toString(), { method: "GET" }));
  if (!res.ok) return null;
  const type = res.headers.get("content-type") || "";
  if (!/json/.test(type) && !path.endsWith(".json")) return null;
  try { return await res.json(); } catch { return null; }
}

/* ---------------- routes ---------------- */
/** /1EG and everything below it. */
export async function handleRecordRoute(request, env) {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD", ...SECURITY_HEADERS } });
  const pathname = new URL(request.url).pathname;           // the inbound query string is ignored
  const segs = pathname.split("/").slice(2);                 // after "", "1EG"
  if (segs.length === 0 || (segs.length === 1 && segs[0] === "")) return redirect("/");   // /1EG, /1EG/
  const trailing = segs.length === 2 && segs[1] === "";
  if (segs.length > 2 || (segs.length === 2 && !trailing)) return html(renderNotFound(), 404);   // nested paths
  const c = classify(segs[0]);
  if (c.kind === "invalid") return html(renderNotFound(), 404);
  const canonical = `/1EG/${c.id}`;
  if (pathname !== canonical) return redirect(canonical);   // lowercase, %-encoded, trailing slash -> canonical

  const doc = await asset(env, request, `/public-data/1EG/${c.kind === "item" ? "items" : "containers"}/${c.id}.json`);
  if (doc && doc.recordId === c.id) return html(c.kind === "item" ? renderItem(doc) : renderContainer(doc));
  const issued = await asset(env, request, "/public-data/1EG/issued-record-ids.json");
  const list = issued ? (c.kind === "item" ? issued.items : issued.containers) : [];
  if (Array.isArray(list) && list.includes(c.id)) return html(renderInactive(c.id, c.kind));
  return html(renderNotFound(), 404);
}

// Static paths that are public. Anything else in the deployment (README, tests, tooling,
// workflow files) is not served.
const PUBLIC_STATIC = [/^\/$/, /^\/index\.html$/, /^\/assets\/[a-z0-9-]+\.(css|js|svg|ico|png)$/, /^\/favicon\.ico$/, /^\/robots\.txt$/,
  /^\/public-data\/1EG\/(catalog|issued-record-ids|export-manifest)\.json$/, /^\/public-data\/1EG\/items\/1EG-\d{4}\.json$/,
  /^\/public-data\/1EG\/containers\/1EG-C-\d{4}\.json$/, /^\/public-media\/1EG\/1EG-(C-)?\d{4}\/1EG-(C-)?\d{4}-\d{2}(-thumb|-display)?\.(jpg|mp4)$/];

/** Everything outside /1EG. */
export async function handleSite(request, env, next) {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD", ...SECURITY_HEADERS } });
  const pathname = new URL(request.url).pathname;
  if (PUBLIC_STATIC.some((re) => re.test(pathname))) {
    const res = await next();
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
    return out;
  }
  return html(renderNotFound(), 404);
}
