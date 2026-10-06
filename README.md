# Project Passport — public Passport host (`passport.greenglassvarano.com`)

> **Branch `passport/public-experience` — PREVIEW ONLY. Not merged, not in Production.**
> `main` still runs the HK09 implementation (a `302` to the SharePoint Passport page) and is
> the rollback baseline. Cutover to this branch requires separate owner authorization
> (PASSPORT-ADR-002 / PASSPORT-DES-003 §12 / PASSPORT-ICR-005).

On this branch the durable QR URL

    https://passport.greenglassvarano.com/1EG/<RecordID>

serves an **anonymous, read-only public Passport** rendered from a static export of the
governed **published read model**. There is no Microsoft sign-in, no guest invitation, no
SharePoint hop and no Power Apps scanner dependency for the public. Staff reach the
authenticated Field Editor from a control on every page.

## Product boundary

This repository is **Project Passport implementation infrastructure**, not part of the Project Blackbook Operating System.

Project Blackbook remains the canonical Greenglass Varano authority for brand/visual compliance, governance standards, case-study knowledge, tender/scope intelligence and Blackbook Operating System documents. Passport consumes those standards; it does not redefine them.

Historical implementation provenance remains recorded in Project Blackbook as `PB-PP-1EG-ARCH-2026-09-08-02` / `PB-PP-1EG-ICR-2026-09-08-02`, HK09. Those records are retained as durable evidence of how the 1EG implementation was built.

Blackbook governing standards repository: `GreenglassVarano/greenglass-varano-preconstruction-kb` (private).

Project Passport's reusable domain is inventory identity, item/container records, durable QR/deep-link routing, location/status/custody history, publication/read-model patterns and project-specific or company-wide asset inventory applications.

Project Handshake may reuse selected Passport infrastructure such as durable QR IDs, redirect/deep-link patterns and permission-aware views, while remaining a separate people/access/contact product.

## The contract (unchanged)

**The durable hostname and path are the public identity contract.** They are printed into
QR codes and are permanent. This branch changes what is *behind* the URL, never the URL:
no QR regeneration, no change to PassportURL / QRCodeURL, no hostname change.
Cloudflare Pages, the export and the renderer are replaceable implementation.

## Data boundary

| what | where it comes from |
|---|---|
| public Item / Container fields | `public-data/1EG/{items,containers}/*.json` — the publisher's **public projection**, exported by the governed tool in the KB (`01_WORKING/Project_Passport/Source/Public-Export/`) |
| photographs / video | `public-media/1EG/<id>/*` — **Anonymous Public Media**: only files associated with a published record **and** explicitly approved for anonymous publication after a privacy review (ADR-002 D14; default deny). Sanitized copies (metadata removed and proven; originals never committed). Public file names are stable and never reused, so numbering may have gaps. |
| "not yet activated" | `public-data/1EG/issued-record-ids.json` — issued identities only (no names, no status) |
| catalogue | `public-data/1EG/catalog.json` |
| evidence | `public-data/1EG/export-manifest.json` — input hashes, policy, SHA-256 of every output |

**This deployment holds no Microsoft credential, token, tenant secret, Graph access or
operational SharePoint path.** The renderer reads only its own static assets
(`env.ASSETS`). Location / custody / Event Log / notes / users / Tag Status and any
unpublished media are never exported (ADR-002 D13: the location read model is deliberately
omitted from the anonymous export).

## Routes

| request | result |
|---|---|
| `/` | catalogue — intro, search by Record ID or name, Items / Containers, thumbnails |
| `/1EG/1EG-0001` (published Item) | **200** Item Passport + staff control *Open in Field Editor* |
| `/1EG/1EG-C-0001` (published Container) | **200** Container Passport + Contents + staff control *Open Container* |
| `/1EG/1EG-0003` (issued, not published) | **200** "This Passport has not yet been activated." + staff control *Activate Passport* |
| `/1EG/1EG-9999`, `/1EG/GARBAGE`, `/1EG/1EG-TEST` | **404** neutral *Passport not found* (no staff control) |
| `/1EG/1eg-0001`, `/1EG/1EG-0001/`, `/1EG/1EG%2D0001` | **308** → `/1EG/1EG-0001` (canonical) |
| `/1EG`, `/1EG/` | **308** → `/` |
| `/1EG/1EG-0001?utm_source=qr` | the inbound query is ignored |
| `/1EG/X&admin=1`, `/1EG/1EG-0001&utm=x`, encoded delimiters | **404** — never parsed as parameters |
| `/1EG/a/b`, any nested path | **404** — never a fabricated ID |
| anything else not explicitly public (README, tests, lib, workflows, …) | **404** |

Every redirect is a same-origin path. Responses carry a strict CSP (`default-src 'none'`,
self-only scripts/styles/media, no framing), `nosniff`, `no-referrer` and `noindex`.

## Staff handoff

The staff control is an HTTPS link to the Field Editor's App Details web link with exactly
four parameters, built with the URL API from a **validated** Record ID:

    https://apps.powerapps.com/play/e/<env>/a/<app>?tenantId=<tenant>&id=<RecordID>&entry=passport&intent=edit|activate

The page does not try to detect staff — Power Apps authenticates. On this branch the link
targets **`1EG - Passport App - QA`** and pages show the marker **QA STAFF HANDOFF**;
Production values are set only at cutover (one `CONFIG` block in `lib/passport.mjs`).

## Files

| file | role |
|---|---|
| `lib/passport.mjs` | all routing, rendering, staff-link construction, security headers |
| `functions/1EG/[[path]].js` | thin wrapper — `/1EG` and everything below it |
| `functions/[[path]].js` | thin wrapper — serves only the explicitly public static paths |
| `index.html`, `assets/catalog.js`, `assets/passport.css` | catalogue + GV brand styling (no third-party requests) |
| `404.html`, `robots.txt` | neutral not-found page; `Disallow: /` |
| `public-data/`, `public-media/` | the governed export (do not hand-edit — re-run the export) |
| `tests/public-routing.test.mjs` | routing + rendering + staff-link contract — **invokes the shipped renderer** |
| `tests/public-data-leak.test.mjs` | allowlist / denylist / hash / manifest / media-metadata leak test |
| `.github/workflows/redirect-tests.yml` | CI — runs both suites and the structural guards on every push and PR |
| `CNAME` | `passport.greenglassvarano.com` |

    node tests/public-routing.test.mjs
    node tests/public-data-leak.test.mjs

The HK09 `route-test.js`, `functions/1EG/[id].js` and `_redirects` are retired **on this
branch only**; they remain on `main` with the SharePoint redirect they test.

## Rollback

Production serves `main`. Until cutover, nothing on this branch affects
`passport.greenglassvarano.com`. After cutover, rollback = redeploy the recorded
pre-cutover `main` commit (SharePoint `302`) in Cloudflare Pages; QR codes are unaffected
either way. The `pages.dev` → durable-host Bulk Redirect (HK09 Phase 2B) covers the
production `pages.dev` hostname only, so branch preview hostnames remain reachable for
acceptance testing.
