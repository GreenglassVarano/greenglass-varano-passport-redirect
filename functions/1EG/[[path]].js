/*
 * Project Passport — /1EG and every path below it (PASSPORT-DES-003 §3).
 * Thin wrapper: all routing and rendering lives in lib/passport.mjs so the routing-contract
 * tests exercise exactly the shipped code. Replaces the HK09 SharePoint 302 (main keeps it
 * as the rollback baseline until the owner authorises cutover).
 */
import { handleRecordRoute } from "../../lib/passport.mjs";

export function onRequest(context) {
  return handleRecordRoute(context.request, context.env);
}
