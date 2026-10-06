/*
 * Project Passport — every path outside /1EG (PASSPORT-DES-003 §3.4).
 * Serves ONLY the explicitly public static paths (catalogue, assets, public-data, public-media);
 * everything else in the deployment returns a neutral 404. Thin wrapper over lib/passport.mjs.
 */
import { handleSite } from "../lib/passport.mjs";

export function onRequest(context) {
  return handleSite(context.request, context.env, context.next);
}
