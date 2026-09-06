// Keeps 0209_request_subject_consistency.sql inside its own stated shape. Confirmed on
// current origin/main before writing this file: 0208_request_property_location_ownership.sql
// already closed the reported property_id gap (and the location_id gap found alongside
// it). This migration closes a DIFFERENT, adjacent gap found while re-auditing subject
// paths: property_id/asset_id/location_id were each checked against the requesting
// workspace independently, but never against EACH OTHER, even though a real client
// caller (createServiceRequest()) sends property_id and asset_id together today.
//
// Only two new checks, not three: property_id+asset_id and property_id+location_id.
// asset_id+location_id is deliberately NOT checked -- work.requests' own pre-existing
// requests_at_most_one_subject check constraint (num_nonnulls(asset_id, location_id) <=
// 1) already makes that pair mutually exclusive unconditionally, confirmed live on
// staging. An application-level check for an input shape the table itself can never
// accept would be dead code, not defense in depth.
//
// Because a `create or replace function` completely replaces the function body, this
// test re-asserts EVERY check that must survive from 0204/0208 (membership, property,
// asset, location ownership) as well as the two new consistency checks -- proving this
// migration did not silently drop an earlier check while adding its own, and giving any
// future redefinition of this function the same trip-wire.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0209_request_subject_consistency.sql";

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

describe("0209_request_subject_consistency migration", () => {
  it("still excludes support-role and scoped memberships from the top membership check, unchanged since 0175/0161/0194", () => {
    const block = bodyOf(SIGNATURE);
    expect(block).toMatch(/select 1 from workspace\.current_memberships\(\) m where m\.workspace_id = p_requesting_workspace_id and m\.role <> 'support'/);
  });

  it("still refuses a given property_id not stewarded by the requesting workspace, unchanged from 0208", () => {
    const block = bodyOf(SIGNATURE);
    expect(block).toMatch(/if p_property_id is not null and not exists \(\s*\n\s*select 1 from property\.properties p\s*\n\s*where p\.id = p_property_id and p\.steward_workspace_id = p_requesting_workspace_id/);
  });

  it("still refuses a given asset_id not stewarded by the requesting workspace, unchanged from 0204", () => {
    const block = bodyOf(SIGNATURE);
    expect(block).toMatch(/if p_asset_id is not null and not exists \(/);
    expect(block).toMatch(/join property\.properties p on p\.id = a\.property_id/);
  });

  it("still refuses a given location_id not stewarded by the requesting workspace, unchanged from 0208", () => {
    const block = bodyOf(SIGNATURE);
    expect(block).toMatch(/if p_location_id is not null and not exists \(\s*\n\s*select 1 from property\.locations l\s*\n\s*join property\.properties p on p\.id = l\.property_id/);
  });

  it("refuses a given property_id + asset_id pair that do not share a property -- the new consistency gap", () => {
    const block = bodyOf(SIGNATURE);
    expect(block).toMatch(/if p_property_id is not null and p_asset_id is not null and not exists \(\s*\n\s*select 1 from property\.assets a where a\.id = p_asset_id and a\.property_id = p_property_id/);
  });

  it("refuses a given property_id + location_id pair that do not share a property", () => {
    const block = bodyOf(SIGNATURE);
    expect(block).toMatch(/if p_property_id is not null and p_location_id is not null and not exists \(\s*\n\s*select 1 from property\.locations l where l\.id = p_location_id and l\.property_id = p_property_id/);
  });

  it("does NOT check asset_id+location_id consistency -- confirmed unreachable, not an oversight", () => {
    const block = bodyOf(SIGNATURE);
    expect(block).not.toMatch(/p_asset_id is not null and p_location_id is not null/);
    // The migration's own header must document why, so a future reader doesn't "fix" a
    // false gap by adding a redundant check for an input shape the table already forbids.
    const rawFile = readFileSync(MIGRATION, "utf8");
    expect(rawFile).toMatch(/requests_at_most_one_subject/);
  });

  it("evaluates membership, then each ownership check, then each consistency check, then directed-booking validation, in that order", () => {
    const block = bodyOf(SIGNATURE);
    const membershipIdx = block.indexOf("select 1 from workspace.current_memberships()");
    const propertyIdx = block.indexOf("if p_property_id is not null and not exists");
    const assetIdx = block.indexOf("if p_asset_id is not null and not exists");
    const locationIdx = block.indexOf("if p_location_id is not null and not exists");
    const consistencyPaIdx = block.indexOf("if p_property_id is not null and p_asset_id is not null");
    const consistencyPlIdx = block.indexOf("if p_property_id is not null and p_location_id is not null");
    const directedIdx = block.indexOf("if p_directed_workspace_id is not null then");

    expect(membershipIdx).toBeGreaterThan(-1);
    expect(propertyIdx).toBeGreaterThan(membershipIdx);
    expect(assetIdx).toBeGreaterThan(propertyIdx);
    expect(locationIdx).toBeGreaterThan(assetIdx);
    expect(consistencyPaIdx).toBeGreaterThan(locationIdx);
    expect(consistencyPlIdx).toBeGreaterThan(consistencyPaIdx);
    expect(directedIdx).toBeGreaterThan(consistencyPlIdx);
  });

  it("only fires each consistency check when both sides of the pair are given, so single-subject and no-subject paths are unaffected", () => {
    const block = bodyOf(SIGNATURE);
    expect(block).toMatch(/if p_property_id is not null and p_asset_id is not null and not exists/);
    expect(block).toMatch(/if p_property_id is not null and p_location_id is not null and not exists/);
  });

  it("still delegates to the unmodified work.create_request(), and still patches details_json/ai_analysis/city, directed-booking, and service_request_id in follow-up UPDATEs, unchanged from 0204/0208", () => {
    const block = bodyOf(SIGNATURE);
    expect(block).toMatch(/perform work\.create_request\(/);
    expect(block).toMatch(/set details_json = p_details_json,\s*\n\s*ai_analysis = p_ai_analysis,\s*\n\s*city = p_city/);
    expect(block).toMatch(/set directed_workspace_id = p_directed_workspace_id,/);
    expect(block).toMatch(/set service_request_id = p_service_request_id/);
  });

  it("does not filter property.assets by lifecycle_state -- deliberately unchanged, not an invented new lifecycle rule", () => {
    const block = bodyOf(SIGNATURE);
    expect(block).not.toMatch(/lifecycle_state/);
  });
});
