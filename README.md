# 1EG Passport — durable-URL redirect host

Translates the permanent public QR-facing URL

    https://passport.greenglassvarano.com/1EG/<RecordID>

to the current SharePoint Passport destination

    https://dbgroupcorp.sharepoint.com/sites/1EG-PreservedItemCatalogue/SitePages/Passport.aspx?p=<RecordID>

Project Blackbook: `PB-PP-1EG-ARCH-2026-09-08-02` / `PB-PP-1EG-ICR-2026-09-08-02`, HK09.
Governing repo: `GreenglassVarano/greenglass-varano-preconstruction-kb` (private).

## The contract

**The durable hostname and path are the public identity contract.** They are printed
into QR codes and are permanent:

    https://passport.greenglassvarano.com/1EG/<RecordID>

**Cloudflare Pages is replaceable implementation infrastructure.** So is GitHub Pages,
so is the SharePoint destination. None of them is the contract.

- **The backend SharePoint hop is `302`, never `301`.** The hostname is permanent; the
  SharePoint URL is not. A cacheable permanent redirect would burn today's backend into
  clients that already scanned a code, and weaken future portability. `301` is reserved
  for canonicalising an *alternate hosting* hostname (e.g. `<project>.pages.dev`) onto
  the durable one.
- **Changing the backend requires no QR regeneration.** Only `_redirects` changes.
- **Batch 002 URLs remain unchanged**, and remain valid across this migration.
- **The host holds no data** and is **deliberately dumb**: it does not check whether a
  Record ID exists. Item-vs-Container routing and "Passport not found" are decided by
  the SPFx Passport page.
- **Only the Record ID is preserved.** No inbound query string, tracking, session or
  user-specific parameter is forwarded.

## Routing

| request | result | status |
|---|---|---|
| `/1EG/1EG-0001` | `…Passport.aspx?p=1EG-0001` | 302 |
| `/1EG/1EG-C-0001` | `…Passport.aspx?p=1EG-C-0001` | 302 |
| `/1EG/1eg-0001` | `…Passport.aspx?p=1eg-0001` (verbatim; SPFx upper-cases) | 302 |
| `/1EG/1EG-9999` | `…Passport.aspx?p=1EG-9999` (well-formed, absent) | 302 |
| `/1EG/GARBAGE` | `…Passport.aspx?p=GARBAGE` (malformed, still forwarded) | 302 |
| `/1EG/1EG-0001/` | `…Passport.aspx?p=1EG-0001` (trailing slash tolerated) | 302 |
| `/1EG/1EG-0001?x=1` | `…Passport.aspx?p=1EG-0001` (stray query dropped) | 302 |
| `/1EG/`, `/1EG` | Passport Landing, no `?p=` | 302 |
| `/` | Passport Landing | 302 |
| `/wrong/1EG-0001` | Passport Landing (never a fabricated ID) | 302 |
| `/1EG/a/b`, nested | Passport Landing (never a fabricated ID) | 302 |

**No open redirect.** Every destination is a hard-coded absolute URL on
`dbgroupcorp.sharepoint.com`. Nothing from the request reaches the destination host or
path — the single substituted value, `:id`, lands only in the `?p=` query value.

## Files

| file | role |
|---|---|
| `_redirects` | **production** — Cloudflare Pages true-HTTP redirect rules |
| `route-test.js` | `node route-test.js` — parses the shipped `_redirects` and asserts the contract |
| `.github/workflows/redirect-tests.yml` | CI — runs the suite on every push and PR |
| `index.html` | **rollback** — GitHub Pages bare host `/` → Landing |
| `404.html` | **rollback** — GitHub Pages client-side `/1EG/<id>` → `?p=<id>` |
| `CNAME` | custom domain marker — `passport.greenglassvarano.com` |

`index.html` and `404.html` are the **GitHub Pages pilot mechanism** and remain the
rollback implementation until HK09 closes. GitHub Pages ignores `_redirects`; Cloudflare
Pages ignores the HTML fallbacks because redirects are applied ahead of asset matching.
Both can therefore coexist during the migration.

## Staging acceptance — required before cutover

Two Cloudflare behaviours are **undocumented** and cannot be settled offline. Probe both
on the `*.pages.dev` staging deployment and record the results before any DNS change:

1. **Inbound query strings must not leak.** Request `/1EG/1EG-0001?utm_source=qr&sid=abc`
   and confirm the `Location` header is exactly
   `…Passport.aspx?p=1EG-0001` — with no `utm_source`, no `sid`, and no second `?`.
2. **Placeholder substitution must be encoded.** Request `/1EG/X%26admin%3D1` and
   `/1EG/X&admin=1` and confirm the `Location` value keeps the payload inside the `p`
   parameter rather than introducing a second query parameter.

If either probe fails, `_redirects` alone is insufficient and the rule must move to a
Pages Function or a Bulk Redirect rule. Do not cut over until both pass.

Also confirm: `curl -sI` returns a real `HTTP/2 302` with a `Location` header (not an
HTML page), and the cutover-only `pages.dev` canonicalisation in `_redirects` stays
commented out until DNS actually moves.
