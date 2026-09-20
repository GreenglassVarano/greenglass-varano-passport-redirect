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
  clients that already scanned a code, and weaken future portability. **No rule in this
  repository uses `301`** — canonicalising the Cloudflare-generated hostname onto the
  durable one is a hostname-level redirect and is handled outside this repository
  (see "Canonicalising the pages.dev hostname").
- **Changing the backend requires no QR regeneration.** Only `_redirects` changes.
- **Batch 002 URLs remain unchanged**, and remain valid across this migration.
- **The host holds no data** and is **deliberately dumb**: it does not check whether a
  Record ID exists. Item-vs-Container routing and "Passport not found" are decided by
  the SPFx Passport page.
- **Only the Record ID is preserved.** No inbound query string, tracking, session or
  user-specific parameter is forwarded.

## Routing authority — split, deliberately

| route | handled by |
|---|---|
| `/1EG/<one path segment>` | **`functions/1EG/[id].js`** — the Pages Function |
| everything else | the rules in **`_redirects`** |

Cloudflare applies a matching Pages Function ahead of `_redirects`, and **redirects
declared in `_redirects` do not apply to a request served by a matching Function**. The
Function therefore owns the dynamic Record-ID route outright; `_redirects` owns the
static fallbacks and substitutes nothing.

- The Function matches **one** segment after `/1EG/`. A trailing slash is accepted.
- **Nested paths do not match** the single-segment Function and fall through to
  `_redirects`, which sends them to the Landing — never a fabricated Record ID.

| request | result | status |
|---|---|---|
| `/1EG/1EG-0001` | `…Passport.aspx?p=1EG-0001` | 302 |
| `/1EG/1EG-C-0001` | `…Passport.aspx?p=1EG-C-0001` | 302 |
| `/1EG/1eg-0001` | `…Passport.aspx?p=1eg-0001` (verbatim; SPFx upper-cases) | 302 |
| `/1EG/1EG-9999` | `…Passport.aspx?p=1EG-9999` (well-formed, absent) | 302 |
| `/1EG/GARBAGE` | `…Passport.aspx?p=GARBAGE` (malformed, still forwarded) | 302 |
| `/1EG/1EG-0001/` | `…Passport.aspx?p=1EG-0001` (trailing slash tolerated) | 302 |
| `/1EG/1EG-0001?utm_source=qr&sid=abc` | `…Passport.aspx?p=1EG-0001` (inbound query discarded) | 302 |
| `/1EG/X&admin=1` | `…Passport.aspx?p=X%26admin%3D1` — **one** parameter | 302 |
| `/1EG/`, `/1EG` | Passport Landing, no `?p=` | 302 |
| `/` | Passport Landing | 302 |
| `/wrong/1EG-0001` | Passport Landing (never a fabricated ID) | 302 |
| `/1EG/a/b/c`, nested | Passport Landing (never a fabricated ID) | 302 |

**No open redirect.** Every destination is a hard-coded absolute URL on
`dbgroupcorp.sharepoint.com`. Nothing from the request reaches the destination scheme,
hostname or path — the Record ID lands only in the `p` query value, added through
`URLSearchParams.set`, which encodes it.

## Why the Pages Function exists — measured, not assumed

`_redirects` alone was **proven insufficient on the real Cloudflare edge**. Cloudflare
substitutes a captured placeholder **verbatim and unencoded**, so a raw query delimiter
in the path escaped the intended `p` parameter:

| request | `Location` produced by `_redirects` | parsed |
|---|---|---|
| `/1EG/X&admin=1` | `…Passport.aspx?p=X&admin=1` | `p=X` **and** `admin=1` |
| `/1EG/1EG-0001&utm=x` | `…Passport.aspx?p=1EG-0001&utm=x` | `p=1EG-0001` **and** `utm=x` |
| `/1EG/A&b&c` | `…Passport.aspx?p=A&b&c` | three parameters |

The second row is the dangerous one: a **valid** Record ID still routed correctly while
an attacker-chosen parameter rode along into the SharePoint request. Percent-encoded
input was safe (`/1EG/X%26admin%3D1` stayed one parameter) because Cloudflare does not
decode — the defect was specific to **raw** delimiters.

`_redirects` has no way to encode a captured value, so the dynamic route moved to the
Function, where the destination is built with the URL API. The two `:id` rules were
**removed** from `_redirects`; CI fails if a `?p=` or `:placeholder` rule reappears.

### Malformed percent-encoding — measured on the real edge

Behaviour **differs between the two implementations**, so the two are recorded
separately. Both were measured; neither is inferred.

**Phase 2A / pre-Function behaviour** (`_redirects` owned the Record-ID route):

| request | result |
|---|---|
| `/1EG/%ZZ` | **400**, no `Location` |
| `/1EG/%` | **500**, no `Location` |
| `/1EG/..%2F..%2Fevil.com` | **400**, no `Location` |

**Phase 2A.1 / current Function behaviour** — this is the behaviour that ships:

| request | result |
|---|---|
| `/1EG/%ZZ` | **400**, no `Location` — rejected by the edge before the Function runs |
| `/1EG/..%2F..%2Fevil.com` | **400**, no `Location` — rejected by the edge before the Function runs |
| **`/1EG/%`** | **302** → `…Passport.aspx?p=%25`, parsed **`p = %`** — the Function handles it cleanly |

So the Function *improved* one case: the bare `%` that previously produced a 500 now
produces a normal single-parameter redirect. The two genuinely malformed escapes are
still rejected by Cloudflare **before** any Function or redirect rule runs. **Failing
closed is acceptable** and no attempt is made to bypass it; a damaged QR scan yields an
error page rather than the Landing.

## Files

| file | role |
|---|---|
| `functions/1EG/[id].js` | **production** — Pages Function; sole authority for `/1EG/<RecordID>` |
| `_redirects` | **production** — static fallbacks; substitutes nothing |
| `route-test.js` | `node route-test.js` — **invokes** the shipped Function and parses the shipped `_redirects` |
| `.github/workflows/redirect-tests.yml` | CI — runs the suite on every push and PR |
| `index.html` | **rollback** — GitHub Pages bare host `/` → Landing |
| `404.html` | **rollback** — GitHub Pages client-side `/1EG/<id>` → `?p=<id>` |
| `CNAME` | custom domain marker — `passport.greenglassvarano.com` |

`index.html` and `404.html` are the **GitHub Pages pilot mechanism** and remain the
rollback implementation until HK09 closes. GitHub Pages ignores `_redirects`; Cloudflare
Pages ignores the HTML fallbacks because redirects are applied ahead of asset matching.
Both can therefore coexist during the migration.

## Staging acceptance — settled on the real edge

Both previously undocumented behaviours were probed on a Cloudflare Pages preview and are
now settled facts:

1. **Inbound query strings do not leak.** `/1EG/1EG-0001?utm_source=qr&sid=abc` produced
   exactly `…Passport.aspx?p=1EG-0001` — no `utm_source`, no `sid`, no second `?`.
2. **Placeholder substitution was NOT encoded** — this is what forced the Function. See
   "Why the Pages Function exists" above.

Before any DNS change, re-confirm on a preview deployment that
`/1EG/1EG-0001&utm=x` yields a destination whose query parameters are exactly
`p=1EG-0001&utm=x` and nothing else, and that `curl -sI` returns a real `HTTP/2 302`
with a `Location` header rather than an HTML page.

## Canonicalising the `pages.dev` hostname — NOT done in this repository

**Cloudflare Pages `_redirects` matches paths only. It cannot match on hostname**, so
`greenglass-varano-passport-redirect.pages.dev` → `passport.greenglassvarano.com`
**cannot** be expressed in `_redirects`. An earlier revision of this repository carried a
commented-out example implying it could; that was wrong and has been removed.

The supported mechanism is an account-level **Cloudflare Bulk Redirect**:

| field | value |
|---|---|
| source hostname | `greenglass-varano-passport-redirect.pages.dev` |
| destination | `https://passport.greenglassvarano.com` |
| status | **301** |
| options | preserve path suffix · preserve query string · subpath matching |

**Intent:** canonicalise the Cloudflare-generated production hostname onto the permanent
public hostname, so only the durable URL is ever indexed or shared.

It is created in the **Cloudflare dashboard, not in this repository**, and only **after**
the durable custom domain has successfully cut over and passed acceptance testing. It
does not exist yet.
