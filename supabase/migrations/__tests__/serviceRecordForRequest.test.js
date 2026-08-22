// Platform Activation Slice 3, WP 3.0 follow-up — 0164 closes the one read WP 3.0 (0163)
// left the client no way to reach: "does this request's engagement have a Service
// Record yet." See 0164's own header for why this is a new function, not a widened
// my_engagements()/my_service_records() shape.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0164_service_record_for_request.sql";

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

describe("0164_service_record_for_request migration", () => {
  it("work.resolve_service_record_for_request() is two-sided — the same predicate as resolve_engagement_for_request (0152)", () => {
    const block = bodyOf("work.resolve_service_record_for_request", codeNoComments);
    expect(block).toMatch(/e\.requesting_workspace_id in \(select workspace_id from workspace\.current_memberships\(\)\)/);
    expect(block).toMatch(/e\.performing_workspace_id in \(select workspace_id from workspace\.current_memberships\(\)\)/);
  });

  it("joins through work.engagements.service_record_id — zero rows, not an error, when no record has been authored yet", () => {
    const block = bodyOf("work.resolve_service_record_for_request", codeNoComments);
    expect(block).toMatch(/from work\.engagements e\s*\n\s*join work\.service_records sr on sr\.id = e\.service_record_id/);
    expect(block).toMatch(/where e\.request_id = p_request_id/);
  });

  it("is not SECURITY DEFINER — reachable only through its api.* delegate", () => {
    const block = bodyOf("work.resolve_service_record_for_request", codeNoComments);
    expect(block).not.toMatch(/security definer/);
  });

  it("api.resolve_service_record_for_request delegates entirely to the work.* function", () => {
    const block = bodyOf("api.resolve_service_record_for_request", codeNoComments);
    expect(block).toMatch(/security definer/);
    expect(block).toContain("work.resolve_service_record_for_request");
  });

  it("revokes the work.* function from every role, and grants only authenticated on the api.* delegate", () => {
    expect(codeNoComments).toMatch(
      /revoke all on function work\.resolve_service_record_for_request\(uuid\) from public, anon, authenticated, service_role/
    );
    expect(codeNoComments).toMatch(
      /revoke all on function api\.resolve_service_record_for_request\(uuid\) from public, anon, service_role/
    );
    expect(codeNoComments).toMatch(
      /grant execute on function api\.resolve_service_record_for_request\(uuid\) to authenticated/
    );
  });
});
