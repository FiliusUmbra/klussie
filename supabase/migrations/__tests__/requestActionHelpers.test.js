// Keeps 0152_request_action_helpers.sql (Platform Activation Slice 2, WP 2.6) inside its
// own stated rules: resolve_engagement_for_request() is two-sided and fails toward null,
// never an error; review_for_request() adds no narrower check than public.reviews'
// already-public policy; neither exposes work.requests.service_request_id itself to the
// client.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0152_request_action_helpers.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName, code) {
  const start = code.indexOf(`create or replace function ${functionName}`);
  const end = code.indexOf("$$;", start);
  return code.slice(start, end);
}

describe("0152_request_action_helpers migration", () => {
  describe("work.resolve_engagement_for_request()", () => {
    const block = bodyOf("work.resolve_engagement_for_request", codeNoComments);

    it("checks real membership in either the requesting or the performing workspace", () => {
      expect(block).toMatch(/e\.requesting_workspace_id in \(select workspace_id from workspace\.current_memberships\(\)\)/);
      expect(block).toMatch(/e\.performing_workspace_id in \(select workspace_id from workspace\.current_memberships\(\)\)/);
    });

    it("never raises — returns null when no engagement exists or the caller has no claim", () => {
      expect(block).not.toMatch(/raise exception/);
    });

    it("returns only the id, never service_request_id or any other row detail", () => {
      const sigStart = codeNoComments.indexOf("create or replace function work.resolve_engagement_for_request(");
      const returnsIdx = codeNoComments.indexOf("returns", sigStart);
      const returnsLine = codeNoComments.slice(returnsIdx, returnsIdx + 20);
      expect(returnsLine).toMatch(/returns uuid/);
    });
  });

  describe("work.review_for_request()", () => {
    const block = bodyOf("work.review_for_request", codeNoComments);

    it("joins to public.reviews via service_request_id, kept server-side", () => {
      expect(block).toMatch(/join public\.reviews r on r\.request_id = wr\.service_request_id/);
    });

    it("adds no membership or workspace check of its own", () => {
      expect(block).not.toMatch(/current_memberships/);
      expect(block).not.toMatch(/errcode/);
    });

    it("returns only stars and body, never the legacy request_id itself", () => {
      const sigStart = codeNoComments.indexOf("create or replace function work.review_for_request(");
      const returnsIdx = codeNoComments.indexOf("returns table", sigStart);
      const returnsLine = codeNoComments.slice(returnsIdx, codeNoComments.indexOf(")", returnsIdx) + 1);
      expect(returnsLine).toMatch(/stars integer, body text/);
    });
  });

  describe("delegates and access", () => {
    it("both api.* delegates are thin SECURITY DEFINER pass-throughs", () => {
      const engagementBlock = bodyOf("api.resolve_engagement_for_request", codeNoComments);
      expect(engagementBlock).toMatch(/security definer/i);
      expect(engagementBlock).toMatch(/work\.resolve_engagement_for_request\(/);

      const reviewBlock = bodyOf("api.review_for_request", codeNoComments);
      expect(reviewBlock).toMatch(/security definer/i);
      expect(reviewBlock).toMatch(/work\.review_for_request\(/);
    });

    it("api.review_for_request() is granted to anon too, matching reviews' own public policy", () => {
      expect(codeNoComments).toMatch(/grant execute on function api\.review_for_request\(uuid\) to anon, authenticated/);
    });

    it("api.resolve_engagement_for_request() is granted to authenticated only, never anon", () => {
      expect(codeNoComments).toMatch(/grant execute on function api\.resolve_engagement_for_request\(uuid\) to authenticated/);
      expect(codeNoComments).not.toMatch(/grant execute on function api\.resolve_engagement_for_request\(uuid\) to anon/);
    });

    it("both work.* functions are unreachable by any application role", () => {
      expect(codeNoComments).toMatch(
        /revoke all on function work\.resolve_engagement_for_request\(uuid\) from public, anon, authenticated, service_role/
      );
      expect(codeNoComments).toMatch(
        /revoke all on function work\.review_for_request\(uuid\) from public, anon, authenticated, service_role/
      );
    });
  });
});
