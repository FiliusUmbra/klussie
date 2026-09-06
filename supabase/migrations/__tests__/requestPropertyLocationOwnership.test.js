// Keeps 0208_request_property_location_ownership.sql inside its own stated shape:
// work.create_request_for_caller() validated asset_id against the requesting workspace
// since 0204, but never did the same for property_id (a real, pre-existing gap named
// in both 0204's and 0205's own headers) or location_id (found while fixing property_id,
// the exact same class of gap, previously unnoticed because no real client caller has
// ever sent a non-null one). Structural, like every migration test in this repository
// (docs/engineering/TESTING.md §3).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0208_request_property_location_ownership.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const SIGNATURE =
  "work.create_request_for_caller(\n  p_request_id              uuid,\n  p_requesting_workspace_id uuid,\n  p_property_id             uuid,\n  p_asset_id                uuid,\n  p_location_id             uuid,\n  p_category_id             text,\n  p_service_id              uuid,\n  p_details                 text,\n  p_when_pref               text,\n  p_budget                  numeric,\n  p_details_json            jsonb,\n  p_ai_analysis             jsonb,\n  p_city                    text,\n  p_service_request_id      uuid,\n  p_directed_workspace_id   uuid,\n  p_auto_accept_max         numeric,\n  p_event_id                uuid,\n  p_correlation_id          uuid,\n  p_actor_type              platform.actor_type,\n  p_actor_ref               text\n)";

function bodyOf(functionName) {
  const start = codeNoComments.indexOf(`create or replace function ${functionName}`);
  expect(start).toBeGreaterThan(-1);
  const end = codeNoComments.indexOf("\n$$;", start);
  return codeNoComments.slice(start, end);
}

describe("0208_request_property_location_ownership migration", () => {
  it("refuses a given property_id not stewarded by the requesting workspace", () => {
    const block = bodyOf(SIGNATURE);
    expect(block).toMatch(/if p_property_id is not null and not exists \(/);
    expect(block).toMatch(/select 1 from property\.properties p\s*\n\s*where p\.id = p_property_id and p\.steward_workspace_id = p_requesting_workspace_id/);
  });

  it("still refuses a given asset_id not stewarded by the requesting workspace, unchanged from 0204", () => {
    const block = bodyOf(SIGNATURE);
    expect(block).toMatch(/if p_asset_id is not null and not exists \(/);
    expect(block).toMatch(/join property\.properties p on p\.id = a\.property_id/);
  });

  it("refuses a given location_id not stewarded by the requesting workspace -- found alongside property_id, fixed in the same pass", () => {
    const block = bodyOf(SIGNATURE);
    expect(block).toMatch(/if p_location_id is not null and not exists \(/);
    expect(block).toMatch(/join property\.properties p on p\.id = l\.property_id/);
    expect(block).toMatch(/where l\.id = p_location_id and p\.steward_workspace_id = p_requesting_workspace_id/);
  });

  it("checks property_id before asset_id before location_id, all before the membership-independent directed-booking validation", () => {
    const block = bodyOf(SIGNATURE);
    const propertyIdx = block.indexOf("if p_property_id is not null");
    const assetIdx = block.indexOf("if p_asset_id is not null");
    const locationIdx = block.indexOf("if p_location_id is not null and not exists");
    const directedIdx = block.indexOf("if p_directed_workspace_id is not null then");
    expect(propertyIdx).toBeGreaterThan(-1);
    expect(assetIdx).toBeGreaterThan(propertyIdx);
    expect(locationIdx).toBeGreaterThan(assetIdx);
    expect(directedIdx).toBeGreaterThan(locationIdx);
  });

  it("keeps the existing membership check, including the support-role exclusion, unchanged", () => {
    const block = bodyOf(SIGNATURE);
    expect(block).toMatch(/select 1 from workspace\.current_memberships\(\) m where m\.workspace_id = p_requesting_workspace_id and m\.role <> 'support'/);
  });

  it("still delegates to the unmodified work.create_request(), and still patches details_json/ai_analysis/city, directed-booking, and service_request_id in follow-up UPDATEs, unchanged from 0204", () => {
    const block = bodyOf(SIGNATURE);
    expect(block).toMatch(/perform work\.create_request\(/);
    expect(block).toMatch(/set details_json = p_details_json,\s*\n\s*ai_analysis = p_ai_analysis,\s*\n\s*city = p_city/);
    expect(block).toMatch(/set directed_workspace_id = p_directed_workspace_id,/);
    expect(block).toMatch(/set service_request_id = p_service_request_id/);
  });
});
