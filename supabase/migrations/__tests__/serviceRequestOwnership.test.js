// Keeps 0210_service_request_ownership.sql inside its own stated shape. Found by a
// systematic sweep of every *_for_caller() function for the exact class of bug
// 0204/0208/0209 already fixed in this same function: a real, ownable foreign key,
// trusted from the client with no ownership check. p_service_request_id was the one
// parameter in this function pointing into a legacy table rather than the property
// engine, and was missed by all three prior passes.
//
// Because a `create or replace function` completely replaces the function body, this
// test re-asserts EVERY check that must survive from 0204/0208/0209 (membership,
// property, asset, location ownership, property/asset and property/location
// consistency) as well as the new service_request_id check -- proving this migration did
// not silently drop an earlier check while adding its own, and giving any future
// redefinition of this function the same trip-wire.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0210_service_request_ownership.sql";

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

describe("0210_service_request_ownership migration", () => {
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

  it("still refuses a property_id+asset_id or property_id+location_id pair that do not share a property, unchanged from 0209", () => {
    const block = bodyOf(SIGNATURE);
    expect(block).toMatch(/if p_property_id is not null and p_asset_id is not null and not exists \(/);
    expect(block).toMatch(/if p_property_id is not null and p_location_id is not null and not exists \(/);
  });

  it("refuses a given service_request_id whose legacy customer_id is not tied to a real membership in the requesting workspace -- the new check", () => {
    const block = bodyOf(SIGNATURE);
    expect(block).toMatch(/if p_service_request_id is not null and not exists \(/);
    expect(block).toMatch(/from public\.service_requests sr\s*\n\s*join identity\.identities i on i\.auth_user_id = sr\.customer_id\s*\n\s*join workspace\.memberships m on m\.person_ref = i\.person_ref/);
    expect(block).toMatch(/where sr\.id = p_service_request_id/);
  });

  it("applies the same membership-quality filter to the service_request check as the caller's own top check: active, unexpired, unscoped, non-support", () => {
    const start = codeNoComments.indexOf("if p_service_request_id is not null and not exists (");
    const end = codeNoComments.indexOf("\n  end if;", start);
    const block = codeNoComments.slice(start, end);
    expect(block).toMatch(/i\.erased_at is null/);
    expect(block).toMatch(/m\.role <> 'support'/);
    expect(block).toMatch(/m\.scope is null/);
    expect(block).toMatch(/m\.state = 'active'/);
    expect(block).toMatch(/m\.expires_at is null or m\.expires_at > now\(\)/);
  });

  it("evaluates every subject check, including the new service_request_id one, before work.create_request() is ever called", () => {
    const block = bodyOf(SIGNATURE);
    const membershipIdx = block.indexOf("select 1 from workspace.current_memberships()");
    const propertyIdx = block.indexOf("if p_property_id is not null and not exists");
    const assetIdx = block.indexOf("if p_asset_id is not null and not exists");
    const locationIdx = block.indexOf("if p_location_id is not null and not exists");
    const consistencyPaIdx = block.indexOf("if p_property_id is not null and p_asset_id is not null");
    const consistencyPlIdx = block.indexOf("if p_property_id is not null and p_location_id is not null");
    const serviceRequestIdx = block.indexOf("if p_service_request_id is not null and not exists");
    const directedIdx = block.indexOf("if p_directed_workspace_id is not null then");
    const performIdx = block.indexOf("perform work.create_request(");

    expect(membershipIdx).toBeGreaterThan(-1);
    expect(propertyIdx).toBeGreaterThan(membershipIdx);
    expect(assetIdx).toBeGreaterThan(propertyIdx);
    expect(locationIdx).toBeGreaterThan(assetIdx);
    expect(consistencyPaIdx).toBeGreaterThan(locationIdx);
    expect(consistencyPlIdx).toBeGreaterThan(consistencyPaIdx);
    expect(serviceRequestIdx).toBeGreaterThan(consistencyPlIdx);
    expect(directedIdx).toBeGreaterThan(serviceRequestIdx);
    expect(performIdx).toBeGreaterThan(directedIdx);
  });

  it("only fires the service_request_id check when it is actually given, so a subject-less or no-correlation request is unaffected", () => {
    const block = bodyOf(SIGNATURE);
    expect(block).toMatch(/if p_service_request_id is not null and not exists/);
  });

  it("still delegates to the unmodified work.create_request(), and still patches details_json/ai_analysis/city, directed-booking, and service_request_id in follow-up UPDATEs, unchanged from 0204/0208/0209", () => {
    const block = bodyOf(SIGNATURE);
    expect(block).toMatch(/perform work\.create_request\(/);
    expect(block).toMatch(/set details_json = p_details_json,\s*\n\s*ai_analysis = p_ai_analysis,\s*\n\s*city = p_city/);
    expect(block).toMatch(/set directed_workspace_id = p_directed_workspace_id,/);
    expect(block).toMatch(/set service_request_id = p_service_request_id/);
  });
});
