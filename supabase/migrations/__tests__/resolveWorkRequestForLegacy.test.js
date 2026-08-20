// Keeps 0155_resolve_work_request_for_legacy.sql (Platform Activation Slice 2, WP 2.6)
// inside its own stated rules: a pure correlation lookup, no membership check, granted
// to authenticated only.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0155_resolve_work_request_for_legacy.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName, code) {
  const start = code.indexOf(`create or replace function ${functionName}`);
  const end = code.indexOf("$$;", start);
  return code.slice(start, end);
}

describe("0155_resolve_work_request_for_legacy migration", () => {
  it("looks up work.requests by service_request_id — the reverse of the dual-write's own correlation", () => {
    const block = bodyOf("work.resolve_work_request_for_legacy", codeNoComments);
    expect(block).toMatch(/where r\.service_request_id = p_service_request_id/);
  });

  it("adds no membership check — the result is a correlation, not request content", () => {
    const block = bodyOf("work.resolve_work_request_for_legacy", codeNoComments);
    expect(block).not.toMatch(/current_memberships/);
    expect(block).not.toMatch(/errcode/);
  });

  it("api.resolve_work_request_for_legacy() is a thin SECURITY DEFINER pass-through", () => {
    const block = bodyOf("api.resolve_work_request_for_legacy", codeNoComments);
    expect(block).toMatch(/security definer/i);
    expect(block).toMatch(/work\.resolve_work_request_for_legacy\(/);
  });

  it("is granted to authenticated only, never anon", () => {
    expect(codeNoComments).toMatch(
      /grant execute on function api\.resolve_work_request_for_legacy\(uuid\) to authenticated/
    );
    expect(codeNoComments).not.toMatch(
      /grant execute on function api\.resolve_work_request_for_legacy\(uuid\) to anon/
    );
  });

  it("work.resolve_work_request_for_legacy() is unreachable by any application role", () => {
    expect(codeNoComments).toMatch(
      /revoke all on function work\.resolve_work_request_for_legacy\(uuid\) from public, anon, authenticated, service_role/
    );
  });
});
