// Platform Activation Slice 1, WP 1.1a — Workspace lookup's read-only half. Reads
// through api.search_workspaces() (migration 0138). The platform_operations gate lives
// entirely in that function, not here — this module holds only the reshape and the
// fallback idiom every other read switch in this codebase already uses (see
// auditRecords.js, this file's own nearest precedent).
import { supabase } from "./supabaseClient";

export const WORKSPACE_LOOKUP_PAGE_SIZE = 20;

function reshape(row) {
  return {
    id: row.workspace_id,
    name: row.workspace_name,
    type: row.workspace_type,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
    ownerName: row.owner_name,
    ownerEmail: row.owner_email,
    propertyCount: row.property_count,
    membershipCount: row.membership_count,
    capabilityKeys: row.capability_keys ?? [],
    lastActivityAt: row.last_activity_at,
  };
}

/**
 * One page of workspace profiles, most recently created first, matching `query` against
 * a workspace's own id, name, owner's name/email, or a property's name — the real
 * columns the schema holds (property.properties has no address column; see
 * 0138_workspace_lookup.sql's own header for why "address" and "tier" from the
 * Programme's draft wording do not appear here).
 *
 * Never throws. A caller with no operator membership sees an empty page — the same
 * EXISTS-gated behaviour every read switch in this codebase already produces, matching
 * fetchAuditRecords()'s own stated design.
 */
export async function searchWorkspaces({ query, offset = 0 } = {}) {
  try {
    const { data, error } = await supabase.schema("api").rpc("search_workspaces", {
      p_query: query === "" ? null : (query ?? null),
      p_limit: WORKSPACE_LOOKUP_PAGE_SIZE,
      p_offset: offset,
    });
    if (error) {
      console.warn("workspace lookup unavailable:", error.message);
      return [];
    }
    return (data ?? []).map(reshape);
  } catch (err) {
    console.warn("workspace lookup unavailable:", err.message);
    return [];
  }
}
