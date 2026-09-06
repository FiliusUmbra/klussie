// Keeps 0211_reparent_location_retired_destination.sql inside its own stated shape.
// Move Room UI slice (Home Builder completion) -- found while auditing
// property.reparent_location_for_caller() (0198) as this function's own first real
// caller: it never checked whether a given new parent was retired. A well-behaved
// client can practically never reach this (property.locations_for_property() already
// excludes retired rows from the picker), but nothing at the RPC layer enforced it.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0211_reparent_location_retired_destination.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const SIGNATURE =
  "property.reparent_location_for_caller(\n  p_location_id     uuid,\n  p_new_parent_id   uuid,\n  p_event_id        uuid,\n  p_correlation_id  uuid,\n  p_actor_type      platform.actor_type,\n  p_actor_ref       text\n)";

function bodyOf(functionName) {
  const start = codeNoComments.indexOf(`create or replace function ${functionName}`);
  expect(start).toBeGreaterThan(-1);
  const end = codeNoComments.indexOf("\n$$;", start);
  return codeNoComments.slice(start, end);
}

describe("0211_reparent_location_retired_destination migration", () => {
  it("still checks the caller's own membership against the location's current property, unchanged from 0198", () => {
    const block = bodyOf(SIGNATURE);
    expect(block).toMatch(/select l\.property_id into v_property_id from property\.locations l where l\.id = p_location_id/);
    expect(block).toMatch(/join workspace\.current_memberships\(\) m on m\.workspace_id = p\.steward_workspace_id/);
    expect(block).toMatch(/if v_steward_workspace_id is null then/);
  });

  it("refuses a given new parent that is retired (or does not exist at all) -- the new check", () => {
    const block = bodyOf(SIGNATURE);
    expect(block).toMatch(/if p_new_parent_id is not null and not exists \(\s*\n\s*select 1 from property\.locations l where l\.id = p_new_parent_id and l\.retired_at is null/);
  });

  it("evaluates the membership check before the retired-destination check, and both before delegating to property.reparent_location()", () => {
    const block = bodyOf(SIGNATURE);
    const membershipIdx = block.indexOf("if v_steward_workspace_id is null then");
    const retiredIdx = block.indexOf("if p_new_parent_id is not null and not exists");
    const performIdx = block.indexOf("perform property.reparent_location(");
    expect(membershipIdx).toBeGreaterThan(-1);
    expect(retiredIdx).toBeGreaterThan(membershipIdx);
    expect(performIdx).toBeGreaterThan(retiredIdx);
  });

  it("only fires the retired-destination check when a new parent is actually given -- moving to top level is unaffected", () => {
    const block = bodyOf(SIGNATURE);
    expect(block).toMatch(/if p_new_parent_id is not null and not exists/);
  });

  it("still delegates entirely to the unmodified property.reparent_location(), unchanged parameters", () => {
    const block = bodyOf(SIGNATURE);
    expect(block).toMatch(/perform property\.reparent_location\(\s*\n\s*p_location_id => p_location_id, p_new_parent_id => p_new_parent_id,/);
  });

  it("uses the same insufficient_privilege errcode as the membership check, non-enumerating", () => {
    const block = bodyOf(SIGNATURE);
    const retiredCheckStart = block.indexOf("if p_new_parent_id is not null and not exists");
    const retiredCheckEnd = block.indexOf("end if;", retiredCheckStart);
    const retiredBlock = block.slice(retiredCheckStart, retiredCheckEnd);
    expect(retiredBlock).toMatch(/using errcode = 'insufficient_privilege'/);
  });
});
