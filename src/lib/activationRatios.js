// The Overview screen's own read path — PLATFORM_ACTIVATION_PROGRAMME.md §4's Activation
// Ratio formula, made computable through api.activation_ratios() (migration 0180). See
// ACTIVATION_RATIO_OVERVIEW_DESIGN.md for the full reasoning behind each journey.
import { supabase } from "./supabaseClient";

export const ACTIVATION_RATIO_WINDOW_DAYS = 30;

// Fixed order and display labels for the five named journeys
// (PLATFORM_ACTIVATION_PROGRAMME.md §4's own table) — the database returns them in
// whatever order its own UNION ALL happens to produce, and this screen's whole point is a
// stable, always-five-rows read, not a table that reorders itself between loads.
export const ACTIVATION_JOURNEYS = [
  { key: "property_asset_recorded", label: "Property/asset recorded" },
  { key: "request_to_booking", label: "Request → booking" },
  { key: "work_performed_to_service_record", label: "Work performed → Service Record" },
  { key: "conversation", label: "Conversation" },
  { key: "report_or_dispute", label: "Report / dispute" },
];

function reshape(row) {
  return {
    journeyKey: row.journey_key,
    platformCount: row.platform_count,
    legacyCount: row.legacy_count,
    ratio: row.ratio == null ? null : Number(row.ratio),
    windowFrom: row.window_from,
    windowTo: row.window_to,
  };
}

/**
 * The five journeys' Activation Ratios over a fixed window, in
 * ACTIVATION_JOURNEYS' own stable display order.
 *
 * Never throws. A caller with no operator membership sees an empty list — the same
 * EXISTS-gated behaviour every other operator-only read in this codebase already
 * produces (see fetchAuditRecords()) — and so does a caller hitting any other failure.
 */
export async function fetchActivationRatios({ windowDays = ACTIVATION_RATIO_WINDOW_DAYS } = {}) {
  try {
    const { data, error } = await supabase.schema("api").rpc("activation_ratios", {
      p_window_days: windowDays,
    });
    if (error) {
      console.warn("activation ratios unavailable:", error.message);
      return [];
    }
    const byKey = new Map((data ?? []).map(reshape).map((row) => [row.journeyKey, row]));
    return ACTIVATION_JOURNEYS.map((j) => byKey.get(j.key) ?? {
      journeyKey: j.key,
      platformCount: 0,
      legacyCount: 0,
      ratio: null,
      windowFrom: null,
      windowTo: null,
    });
  } catch (err) {
    console.warn("activation ratios unavailable:", err.message);
    return [];
  }
}
