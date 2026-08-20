// Keeps 0156_submit_review_for_request.sql (Platform Activation Slice 2, WP 2.6) inside
// its own stated rules: customer_id is auth.uid(), never caller-supplied; pro_id is
// resolved from the engagement's own performing workspace; the legacy review and
// work.mark_request_reviewed() happen atomically, in one function.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0156_submit_review_for_request.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName, code) {
  const start = code.indexOf(`create or replace function ${functionName}`);
  const end = code.indexOf("$$;", start);
  return code.slice(start, end);
}

describe("0156_submit_review_for_request migration", () => {
  const block = bodyOf("work.submit_review_for_request", codeNoComments);

  it("checks real membership in the request's own requesting workspace, resolved from the row", () => {
    expect(block).toMatch(
      /select r\.requesting_workspace_id, r\.service_request_id\s*\n\s*into v_requesting_ws, v_legacy_request_id\s*\n\s*from work\.requests r where r\.id = p_request_id/
    );
    expect(block).toMatch(/select 1 from workspace\.current_memberships\(\) m where m\.workspace_id = v_requesting_ws/);
  });

  it("refuses when the request has no correlated legacy row, rather than writing a broken review", () => {
    expect(block).toMatch(/if v_legacy_request_id is null then/);
  });

  it("refuses when the request has no engagement at all", () => {
    expect(block).toMatch(/if v_engagement_id is null then/);
  });

  it("resolves pro_id from the engagement's own performing workspace, never a caller-supplied id", () => {
    expect(block).toMatch(/from workspace\.resolve_owner_auth_user_ids\(array\[v_performing_ws\]\)/);
    expect(block).not.toMatch(/p_pro_id/);
  });

  it("uses auth.uid() for customer_id, never a caller-supplied id", () => {
    expect(block).toMatch(/values \(v_legacy_request_id, auth\.uid\(\), v_pro_auth, p_stars, p_body\)/);
    expect(block).not.toMatch(/p_customer_id/);
  });

  it("writes the legacy review and completes the state machine in one function, review first", () => {
    const reviewIdx = block.indexOf("insert into public.reviews");
    const markIdx = block.indexOf("perform work.mark_request_reviewed(");
    expect(reviewIdx).toBeGreaterThan(-1);
    expect(markIdx).toBeGreaterThan(reviewIdx);
  });

  it("api.submit_review_for_request() is a thin SECURITY DEFINER pass-through", () => {
    const apiBlock = bodyOf("api.submit_review_for_request", codeNoComments);
    expect(apiBlock).toMatch(/security definer/i);
    expect(apiBlock).toMatch(/work\.submit_review_for_request\(/);
  });

  it("is granted to authenticated only, unreachable by any application role at the work layer", () => {
    expect(codeNoComments).toMatch(
      /grant execute on function api\.submit_review_for_request\([^)]+\) to authenticated/
    );
    expect(codeNoComments).toMatch(
      /revoke all on function work\.submit_review_for_request\([^)]+\) from public, anon, authenticated, service_role/
    );
  });
});
