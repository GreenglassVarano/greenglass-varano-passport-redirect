/*
 * 1EG Passport durable-URL redirect — single-segment Record ID route.
 * Project Blackbook HK09 Phase 2A.1.
 *
 * WHY THIS FUNCTION EXISTS
 *   `_redirects` placeholder substitution was proven on the REAL Cloudflare edge
 *   to insert a captured path segment VERBATIM AND UNENCODED. A raw `&` in the
 *   path therefore escaped the intended `p` parameter:
 *
 *       /1EG/X&admin=1        ->  ...Passport.aspx?p=X&admin=1   (p=X AND admin=1)
 *       /1EG/1EG-0001&utm=x   ->  ...Passport.aspx?p=1EG-0001&utm=x
 *
 *   `_redirects` offers no way to encode a captured value, so authority for the
 *   dynamic route moved here, where the destination is built with the URL API and
 *   the Record ID is encoded by `searchParams.set`.
 *
 * INVARIANTS
 *   - The destination is a hard-coded absolute URL. Scheme, hostname and path are
 *     NEVER derived from request input.
 *   - The Record ID is never concatenated into a query string.
 *   - Exactly one query parameter, `p`, can ever be produced.
 *   - Inbound query strings are discarded: the destination is built fresh.
 *   - The host stays DUMB — no record-existence check, no production-range check,
 *     lowercase accepted, unknown IDs passed through. SPFx classifies downstream.
 */

const DESTINATION =
  "https://dbgroupcorp.sharepoint.com/sites/1EG-PreservedItemCatalogue/SitePages/Passport.aspx";

export function onRequest(context) {
  const destination = new URL(DESTINATION);

  destination.searchParams.set("p", String(context.params.id));

  return Response.redirect(destination.toString(), 302);
}
