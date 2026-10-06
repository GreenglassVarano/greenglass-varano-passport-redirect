/*
 * Project Passport — public data + media leak test (PASSPORT-DES-003 §6.3).
 *
 *   node tests/public-data-leak.test.mjs
 *
 * Dependency-free CI guard over what this repository actually serves. It does NOT replace the
 * governed export's leak test in the KB (which re-reads every media file with ExifTool and
 * reproduces the export byte-for-byte); it stops a hand edit or a bad export from shipping.
 *   PRIMARY  = allowlist: exact document set, exact keys, field keys pinned to the publisher's
 *              public projection (PASSPORT-ADR-002 D13 location narrowing applied).
 *   DEFENCE  = denylist over every key and value.
 *   MEDIA    = no orphan, SHA-256 exact, manifest exact, and a structural metadata scan:
 *              JPEG carries no EXIF/XMP/maker/vendor APPn segment and nothing after EOI;
 *              MP4 carries no udta / meta / vendor atom and zeroed capture dates.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "public-data", "1EG");
const MEDIA = path.join(ROOT, "public-media", "1EG");
let pass = 0, fail = 0;
const ok = (label, cond, detail) => { cond ? pass++ : fail++; if (!cond || process.env.VERBOSE) console.log(`${cond ? "PASS" : "FAIL"}  ${label}${!cond && detail ? "\n      << " + detail : ""}`); };

// Pinned to the publisher's public projection (passport-publish-projection.js ITEM_ALLOWLIST /
// CONTAINER_ALLOWLIST `.to`, Title excluded) MINUS the location read model (ADR-002 D13).
const ITEM_FIELDS = ["ContainerRef", "ItemName", "ShortDescription", "ItemClass", "ItemType", "OriginFloor", "OriginRoom", "OriginSubLocation", "Period", "Maker",
  "Significance", "PreservationRationale", "IntendedDisposition", "LifecycleStatus", "PhysicalState", "ConditionGrade", "ConditionNarrative", "DamageSummary", "FinalInstalledLocation"];
const CONTAINER_FIELDS = ["ContainerType", "ContainerDescription", "ContainerStatusExternal", "ContainerCondition"];
const DENY = [/StorageLocation/i, /field_\d+/i, /Tag ?Status/i, /Tag ?Claimed/i, /Event ?Log/i, /EventType|EventId|CorrelationId/i, /\bEV-[0-9a-f]{8}/i, /\bACT-[0-9a-f]{8}/i,
  /SourceListId|SourceItemId/i, /\bAuthor\b|\bEditor\b|Created ?By|Modified ?By/i, /sharepoint|dbgroupcorp|_api\//i, /1EG-TEST/i,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, /\bNotes?\b/, /Custodian|Address|Access ?Notes/i, /Physical ?Location|Rack|Shelf|Warehouse/i,
  /Galaxy|SM-S9\d\d|Samsung|Android|GPS|Latitude|Longitude/i];

const exact = (o, keys) => o && typeof o === "object" && !Array.isArray(o) && Object.keys(o).length === keys.length && keys.every((k) => Object.hasOwn(o, k));
const walk = (d) => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]) : [];
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const rel = (f, base) => path.relative(base, f).split(path.sep).join("/");
const read = (r) => JSON.parse(fs.readFileSync(path.join(DATA, r), "utf8"));

/* ---------- documents ---------- */
const docs = walk(DATA).map((f) => rel(f, DATA)).sort();
const GOVERNED = /^(catalog|issued-record-ids|export-manifest)\.json$|^items\/1EG-\d{4}\.json$|^containers\/1EG-C-\d{4}\.json$/;
ok("public-data holds only the governed document set", docs.length > 0 && docs.every((f) => GOVERNED.test(f)), docs.filter((f) => !GOVERNED.test(f)).join());
const items = docs.filter((f) => f.startsWith("items/")), containers = docs.filter((f) => f.startsWith("containers/"));
const referenced = new Map();
const MEDIA_SRC = (id) => new RegExp(`^/public-media/1EG/${id}/${id}-\\d{2}(-thumb|-display)?\\.(jpg|mp4)$`);
function media(owner, list, at) {
  ok(`${at}: media is an array`, Array.isArray(list));
  for (const m of list || []) {
    ok(`${at}: media entry keys exact`, exact(m, m.type === "image" ? ["type", "mediaType", "src", "width", "height", "bytes", "sha256", "thumb", "display"] : ["type", "mediaType", "src", "width", "height", "bytes", "sha256"]));
    ok(`${at}: media src governed`, MEDIA_SRC(owner).test(m.src), m.src);
    ok(`${at}: media type`, (m.type === "image" && m.mediaType === "image/jpeg" && m.src.endsWith(".jpg")) || (m.type === "video" && m.mediaType === "video/mp4" && m.src.endsWith(".mp4")));
    referenced.set(m.src, m.sha256);
    if (m.thumb) { ok(`${at}: thumb keys exact`, exact(m.thumb, ["src", "width", "height", "bytes", "sha256"])); ok(`${at}: thumb src governed`, MEDIA_SRC(owner).test(m.thumb.src) && m.thumb.src.endsWith("-thumb.jpg")); referenced.set(m.thumb.src, m.thumb.sha256); }
    if (m.display) { ok(`${at}: display keys exact`, exact(m.display, ["src", "width", "height", "bytes", "sha256"])); ok(`${at}: display src governed`, MEDIA_SRC(owner).test(m.display.src) && m.display.src.endsWith("-display.jpg")); referenced.set(m.display.src, m.display.sha256); }
  }
}
for (const f of items) {
  const d = read(f), id = path.basename(f, ".json");
  ok(`${f}: top-level keys exact`, exact(d, ["schema", "project", "recordId", "kind", "fields", "media"]), Object.keys(d).join());
  ok(`${f}: identity consistent`, d.schema === "project-passport/public-item@1" && d.project === "1EG" && d.recordId === id && d.kind === "item");
  ok(`${f}: fields == publisher public Item projection (location narrowed)`, exact(d.fields, ITEM_FIELDS), Object.keys(d.fields || {}).join());
  ok(`${f}: values are string|null`, Object.values(d.fields || {}).every((v) => v === null || typeof v === "string"));
  media(id, d.media, f);
}
for (const f of containers) {
  const d = read(f), id = path.basename(f, ".json");
  ok(`${f}: top-level keys exact`, exact(d, ["schema", "project", "recordId", "kind", "fields", "contents", "media"]));
  ok(`${f}: identity consistent`, d.schema === "project-passport/public-container@1" && d.project === "1EG" && d.recordId === id && d.kind === "container");
  ok(`${f}: fields == publisher public Container projection`, exact(d.fields, CONTAINER_FIELDS), Object.keys(d.fields || {}).join());
  ok(`${f}: contents are {recordId,itemName,thumb} of published Items`, Array.isArray(d.contents) && d.contents.every((c) => exact(c, ["recordId", "itemName", "thumb"]) && items.includes(`items/${c.recordId}.json`)));
  media(id, d.media, f);
}
const cat = read("catalog.json");
ok("catalog.json keys exact", exact(cat, ["schema", "project", "projectName", "records"]));
ok("catalog records exact {recordId,kind,title,summary,thumb}", cat.records.every((r) => exact(r, ["recordId", "kind", "title", "summary", "thumb"])));
ok("catalog lists exactly the published records", JSON.stringify(cat.records.map((r) => `${r.kind}s/${r.recordId}.json`).sort()) === JSON.stringify([...items, ...containers].sort()));
ok("catalog thumbs are referenced public thumbnails", cat.records.every((r) => r.thumb === null || referenced.has(r.thumb)));
const iss = read("issued-record-ids.json");
ok("issued-record-ids.json keys exact + identities only", exact(iss, ["schema", "project", "items", "containers"]) && iss.items.every((i) => /^1EG-\d{4}$/.test(i)) && iss.containers.every((c) => /^1EG-C-\d{4}$/.test(c)));
ok("every published record is issued", items.every((f) => iss.items.includes(path.basename(f, ".json"))) && containers.every((f) => iss.containers.includes(path.basename(f, ".json"))));
const man = read("export-manifest.json");
ok("manifest policy pins the same field allowlists", JSON.stringify(man.policy.itemFields) === JSON.stringify(ITEM_FIELDS) && JSON.stringify(man.policy.containerFields) === JSON.stringify(CONTAINER_FIELDS));
ok("manifest inputs carry hashes only (no paths)", Object.entries(man.inputs).every(([k, v]) => /Sha256$/.test(k) ? /^[0-9a-f]{64}$/.test(v) : /CapturedUtc$/.test(k)));

const hits = [];
const scan = (n, at) => { if (n == null) return; if (typeof n === "string") { for (const re of DENY) if (re.test(n)) hits.push(`${at} ~ ${re}`); return; } if (typeof n !== "object") return; for (const [k, v] of Object.entries(n)) { for (const re of DENY) if (re.test(k)) hits.push(`${at}.${k} ~ ${re}`); scan(v, `${at}.${k}`); } };
for (const f of docs) { const d = read(f); if (f === "export-manifest.json") { const { policy, ...rest } = d; scan(rest, f); } else scan(d, f); }
ok("denylist: no operational / custody / identity / device / SharePoint token in public JSON", hits.length === 0, hits.slice(0, 6).join(" | "));

/* ---------- media files ---------- */
const files = walk(MEDIA).map((f) => "/" + rel(f, ROOT)).sort();
ok("no orphan media", files.every((m) => referenced.has(m)), files.filter((m) => !referenced.has(m)).join());
ok("every referenced media file exists + SHA-256 exact", [...referenced].every(([m, h]) => fs.existsSync(path.join(ROOT, m)) && sha(path.join(ROOT, m)) === h));
ok("manifest outputs exact (path + SHA-256, complete)", man.outputs.every((o) => fs.existsSync(path.join(ROOT, o.path)) && sha(path.join(ROOT, o.path)) === o.sha256) && man.outputs.length === docs.length - 1 + files.length);

// The sanitizer keeps ONE minimal EXIF block: IFD0 Orientation (upright rendering) + resolution.
// Anything else in it — an Exif/GPS/Interop sub-IFD pointer, Make/Model/Software/DateTime, or an
// IFD1 thumbnail — is a leak.
const IFD0_ALLOWED = new Set([0x0112 /* Orientation */, 0x011a /* XResolution */, 0x011b /* YResolution */, 0x0128 /* ResolutionUnit */, 0x0213 /* YCbCrPositioning */]);
function exifProblems(tiff) {
  try { return exifIfd0(tiff); } catch { return ["EXIF: malformed block"]; }
}
function exifIfd0(tiff) {
  const order = tiff.toString("latin1", 0, 2), le = order === "II";
  if (!le && order !== "MM") return ["EXIF: bad TIFF header"];
  const u16 = (o) => le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o), u32 = (o) => le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o);
  const ifd0 = u32(4), n = u16(ifd0), out = [];
  for (let k = 0; k < n; k++) { const tag = u16(ifd0 + 2 + k * 12); if (!IFD0_ALLOWED.has(tag)) out.push(`EXIF IFD0 tag 0x${tag.toString(16).padStart(4, "0")} not allowed`); }
  if (u32(ifd0 + 2 + n * 12) !== 0) out.push("EXIF IFD1 (embedded thumbnail) present");
  return out;
}
function jpegProblems(buf) {
  const out = [];
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return ["not a JPEG"];
  let i = 2, sos = -1;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { out.push(`bad marker at ${i}`); break; }
    const m = buf[i + 1];
    if (m === 0xda) { sos = i; break; }
    const len = buf.readUInt16BE(i + 2), seg = buf.subarray(i + 4, i + 2 + len);
    if (m >= 0xe0 && m <= 0xef) {
      const id = seg.subarray(0, Math.max(0, seg.indexOf(0))).toString("latin1");
      if (m === 0xe1 && id === "Exif") out.push(...exifProblems(seg.subarray(6)));
      else if (!(m === 0xe0 && id === "JFIF") && !(m === 0xe2 && id === "ICC_PROFILE") && !(m === 0xee && id.startsWith("Adobe"))) out.push(`APP${m - 0xe0} "${id.slice(0, 24)}"`);
    }
    if (m === 0xfe) out.push("COM segment");
    i += 2 + len;
  }
  if (sos < 0) out.push("no SOS");
  const eoi = buf.lastIndexOf(Buffer.from([0xff, 0xd9]));
  if (eoi !== buf.length - 2) out.push(`${buf.length - 2 - eoi} bytes after the final EOI`);
  return out;
}
function mp4Problems(buf) {
  const out = [], CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "dinf", "edts", "udta"]);
  const FORBIDDEN = new Set(["udta", "meta", "keys", "ilst", "uuid", "smta", "sefd", "auth", "©xyz", "loci", "©mod", "©too"]);
  const MAC_EPOCH_ZERO = 0; // ExifTool writes 0000:00:00 00:00:00 as 0
  const walkBoxes = (s, e, depth) => {
    for (let p = s; p + 8 <= e;) {
      let size = buf.readUInt32BE(p); const type = buf.toString("latin1", p + 4, p + 8); let hdr = 8;
      if (size === 1) { size = Number(buf.readBigUInt64BE(p + 8)); hdr = 16; } else if (size === 0) size = e - p;
      if (size < hdr || p + size > e) { out.push(`malformed box ${JSON.stringify(type)} at ${p}`); return; }
      if (FORBIDDEN.has(type)) out.push(`${"  ".repeat(depth)}${type} atom present`);
      if (["mvhd", "tkhd", "mdhd"].includes(type)) {
        const v = buf[p + hdr], c = v === 1 ? Number(buf.readBigUInt64BE(p + hdr + 4)) : buf.readUInt32BE(p + hdr + 4), mo = v === 1 ? Number(buf.readBigUInt64BE(p + hdr + 12)) : buf.readUInt32BE(p + hdr + 8);
        if (c !== MAC_EPOCH_ZERO || mo !== MAC_EPOCH_ZERO) out.push(`${type} capture/modify date not zeroed`);
      }
      if (CONTAINERS.has(type)) walkBoxes(p + hdr, p + size, depth + 1);
      p += size;
    }
  };
  walkBoxes(0, buf.length, 0);
  return out;
}
for (const m of files) {
  const buf = fs.readFileSync(path.join(ROOT, m));
  const problems = m.endsWith(".jpg") ? jpegProblems(buf) : mp4Problems(buf);
  ok(`media structurally free of metadata: ${m}`, problems.length === 0, problems.join("; "));
}

/* ---------- negative controls: the scanners actually catch things ---------- */
{
  const exif = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x0a]), Buffer.from("Exif\0\0MM", "latin1"), Buffer.from([0xff, 0xda, 0, 2, 0xff, 0xd9])]);
  ok("negative control: a malformed/foreign EXIF APP1 is caught", jpegProblems(exif).some((p) => /^EXIF/.test(p)));
  const trailer = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xda, 0, 2, 0xff, 0xd9]), Buffer.from("MPF trailer")]);
  ok("negative control: data after EOI is caught", jpegProblems(trailer).some((p) => /after the final EOI/.test(p)));
  const box = (t, body) => { const b = Buffer.alloc(8); b.writeUInt32BE(8 + body.length); b.write(t, 4, "latin1"); return Buffer.concat([b, body]); };
  const mvhd = Buffer.alloc(100); mvhd.writeUInt32BE(3_000_000_000, 4);
  const moov = box("moov", Buffer.concat([box("mvhd", mvhd), box("udta", box("©xyz", Buffer.from("+43.6-079.3/")))]));
  const probs = mp4Problems(Buffer.concat([box("ftyp", Buffer.from("isom0000")), moov]));
  ok("negative control: MP4 udta/©xyz + non-zero date are caught", probs.some((p) => /udta/.test(p)) && probs.some((p) => /©xyz/.test(p)) && probs.some((p) => /not zeroed/.test(p)), probs.join());
  const before = hits.length; scan({ fields: { Maker: "Samsung Galaxy S24 Ultra", Note: "x" } }, "neg");
  const caught = hits.splice(before);
  ok("negative control: device / notes tokens are caught by the denylist", caught.some((h) => /Galaxy|Samsung/.test(h)) && caught.some((h) => /Note/.test(h)), caught.join());
  const tiff = (tags, next) => { const b = Buffer.alloc(8 + 2 + tags.length * 12 + 4); b.write("MM", 0, "latin1"); b.writeUInt16BE(42, 2); b.writeUInt32BE(8, 4); b.writeUInt16BE(tags.length, 8); tags.forEach((t, k) => b.writeUInt16BE(t, 10 + k * 12)); b.writeUInt32BE(next, 10 + tags.length * 12); return b; };
  ok("negative control: minimal EXIF (Orientation only) is accepted", exifProblems(tiff([0x0112], 0)).length === 0);
  ok("negative control: EXIF Make (0x010f) / GPS pointer (0x8825) / IFD1 thumbnail are caught", exifProblems(tiff([0x010f, 0x0112, 0x8825], 40)).length === 3);
}

console.log(`\n---------------------------------------------\nPUBLIC DATA LEAK: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
