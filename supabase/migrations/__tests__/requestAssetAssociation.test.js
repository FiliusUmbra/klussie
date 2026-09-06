// Keeps 0204_request_asset_association.sql inside its own stated shape:
// work.create_request_for_caller() (last redefined at a real, 20-parameter shape by
// 0175) never validated a given p_asset_id against the requesting workspace before this
// migration -- harmless while every real client caller hardcoded it to null, a real gap
// the instant the client half of this same slice starts sending a real one.
//
// This test file itself exists to catch the exact mistake the migration's own header
// confesses to: pinning the REAL, current 20-parameter signature (0175's, not 0146's
// stale 16-parameter one) is what would have caught, before merge, that the first draft
// redefined a function nothing calls. Structural, like every migration test in this
// repository (docs/engineering/TESTING.md §3).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0204_request_asset_association.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName) {
  const start = codeNoComments.indexOf(`create or replace function ${functionName}`);
  expect(start).toBeGreaterThan(-1);
  const end = codeNoComments.indexOf("\n$$;", start);
  return codeNoComments.slice(start, end);
}

const SIGNATURE =
  "work.create_request_for_caller(\n  p_request_id              uuid,\n  p_requesting_workspace_id uuid,\n  p_property_id             uuid,\n  p_asset_id                uuid,\n  p_location_id             uuid,\n  p_category_id             text,\n  p_service_id              uuid,\n  p_details                 text,\n  p_when_pref               text,\n  p_budget                  numeric,\n  p_details_json            jsonb,\n  p_ai_analysis             jsonb,\n  p_city                    text,\n  p_service_request_id      uuid,\n  p_directed_workspace_id   uuid,\n  p_auto_accept_max         numeric,\n  p_event_id                uuid,\n  p_correlation_id          uuid,\n  p_actor_type              platform.actor_type,\n  p_actor_ref               text\n)";

describe("0204_request_asset_association migration", () => {
  it("drops the stale 16-parameter overload the first draft mistakenly created", () => {
    expect(codeNoComments).toMatch(
      /drop function if exists work\.create_request_for_caller\(\s*\n\s*uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, uuid, numeric, uuid, uuid, platform\.actor_type, text\s*\n\s*\);/
    );
  });

  it("redefines the REAL, current 20-parameter signature (0175's), not a stale one", () => {
    // Fails loudly if a future edit reverts to the 16-param shape without also updating
    // this pin -- the exact class of mistake this migration's own header documents.
    expect(() => bodyOf(SIGNATURE)).not.toThrow();
  });

  it("keeps the existing requesting-workspace membership check, including the support-role exclusion from 0175", () => {
    const block = bodyOf(SIGNATURE);
    expect(block).toMatch(/select 1 from workspace\.current_memberships\(\) m where m\.workspace_id = p_requesting_workspace_id and m\.role <> 'support'/);
  });

  it("refuses a given asset_id that is not stewarded by the requesting workspace", () => {
    const block = bodyOf(SIGNATURE);
    expect(block).toMatch(/if p_asset_id is not null and not exists \(/);
    expect(block).toMatch(/join property\.properties p on p\.id = a\.property_id/);
    expect(block).toMatch(/where a\.id = p_asset_id and p\.steward_workspace_id = p_requesting_workspace_id/);
    expect(block).toMatch(/insufficient_privilege/);
  });

  it("places the new asset check after membership but before the directed-booking validation", () => {
    const block = bodyOf(SIGNATURE);
    const membershipIdx = block.indexOf("m.role <> 'support'");
    const assetCheckIdx = block.indexOf("if p_asset_id is not null");
    const directedCheckIdx = block.indexOf("if p_directed_workspace_id is not null then");
    expect(membershipIdx).toBeGreaterThan(-1);
    expect(assetCheckIdx).toBeGreaterThan(membershipIdx);
    expect(directedCheckIdx).toBeGreaterThan(assetCheckIdx);
  });

  it("still delegates to the unmodified work.create_request(), and still patches details_json/ai_analysis/city, directed-booking, and service_request_id in follow-up UPDATEs, unchanged from 0175", () => {
    const block = bodyOf(SIGNATURE);
    expect(block).toMatch(/perform work\.create_request\(/);
    expect(block).toMatch(/p_asset_id => p_asset_id/);
    expect(block).toMatch(/set details_json = p_details_json,\s*\n\s*ai_analysis = p_ai_analysis,\s*\n\s*city = p_city/);
    expect(block).toMatch(/set directed_workspace_id = p_directed_workspace_id,/);
    expect(block).toMatch(/set service_request_id = p_service_request_id/);
  });
});
