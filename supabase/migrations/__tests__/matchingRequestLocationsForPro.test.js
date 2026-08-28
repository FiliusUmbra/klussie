// Beta priority: "the professional sees only approximate location information during
// quotation" — the bridge from fetchProLeads()'s own legacy-keyed candidates to
// api.matching_requests_for_pro()'s (0183) location fields, mirroring
// request_lifecycle_statuses()'s (0150) established batch-by-legacy-id shape.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0187_matching_request_locations_for_pro_by_legacy_ids.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName, code) {
  const start = code.indexOf(`create or replace function ${functionName}`);
  const end = code.indexOf("\n$$;", start);
  return code.slice(start, end);
}

describe("0187_matching_request_locations_for_pro_by_legacy_ids migration", () => {
  const FN = "api.matching_request_locations_for_pro";

  it("is keyed back by the legacy service_request_id, matching request_lifecycle_statuses()'s own bridge shape", () => {
    const block = bodyOf(FN, codeNoComments);
    expect(block).toMatch(/p_service_request_ids uuid\[\]/);
    expect(block).toMatch(/returns table \(\s*\n\s*service_request_id uuid,/);
    expect(block).toMatch(/where r\.service_request_id = any\(p_service_request_ids\);/);
  });

  it("never returns street, house number, postcode or access instructions as an output column — same restraint as api.matching_requests_for_pro()", () => {
    const block = bodyOf(FN, codeNoComments);
    const returnsTable = block.slice(block.indexOf("returns table"), block.indexOf(")\nlanguage"));
    expect(returnsTable).not.toMatch(/\bstreet\b|house_number|postcode|latitude|longitude|access_instructions/);
  });

  it("latitude/longitude appear only inside the null-check for distance_band, never as a selected column — same idiom as api.matching_requests_for_pro()", () => {
    const block = bodyOf(FN, codeNoComments);
    expect(block).toMatch(/when p\.latitude is null or p\.longitude is null then null/);
    expect(block).not.toMatch(/p\.latitude,|p\.longitude,|select p\.latitude|select p\.longitude/);
  });

  it("only returns municipality/country/distance_band/property_type/quote_prep_notes", () => {
    const block = bodyOf(FN, codeNoComments);
    for (const col of ["municipality", "country", "distance_band", "property_type", "quote_prep_notes"]) {
      expect(block).toMatch(new RegExp(col));
    }
  });

  it("gates on the caller's own pro_services membership, the same authorization join as api.matching_requests_for_pro()", () => {
    const block = bodyOf(FN, codeNoComments);
    expect(block).toMatch(/join public\.pro_services ps\s*\n\s*on ps\.service_id = r\.service_id\s*\n\s*and ps\.workspace_id in \(select workspace_id from workspace\.current_memberships\(\)\)/);
  });

  it("is security definer, revoked from anon/service_role, granted only to authenticated", () => {
    const block = bodyOf(FN, codeNoComments);
    expect(block).toMatch(/security definer/);
    expect(codeNoComments).toMatch(/revoke all on function api\.matching_request_locations_for_pro\(uuid\[\]\) from public, anon, service_role;/);
    expect(codeNoComments).toMatch(/grant execute on function api\.matching_request_locations_for_pro\(uuid\[\]\) to authenticated;/);
  });
});
