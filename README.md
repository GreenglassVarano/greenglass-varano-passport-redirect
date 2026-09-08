# 1EG Passport — durable-URL redirect host

Translates the permanent public QR-facing URL

    https://passport.greenglassvarano.com/1EG/<RecordID>

to the current SharePoint Passport destination

    https://dbgroupcorp.sharepoint.com/sites/1EG-PreservedItemCatalogue/SitePages/Passport.aspx?p=<RecordID>

- **Holds no data.** It is a pure path→query redirect.
- Item vs Container routing is done by the Passport page itself.
- The redirect host may be replaced (Cloudflare Pages, Azure, …) **without changing the printed QR payload** —
  the durable URL is the permanent contract, this host is a replaceable implementation.

Project Blackbook: `PB-PP-1EG-ARCH-2026-09-08-02` / `PB-PP-1EG-ICR-2026-09-08-02`.
Governing repo: `GreenglassVarano/greenglass-varano-preconstruction-kb` (private).

## Files
| file | role |
|---|---|
| `index.html` | bare host `/` → Passport Landing |
| `404.html` | every other path → parameterized client-side redirect (`/1EG/<id>` → `?p=<id>`) |
| `route-test.js` | `node route-test.js` — offline routing-contract test (14 cases) |
| `CNAME` | *(added after DNS is confirmed)* custom domain marker |
