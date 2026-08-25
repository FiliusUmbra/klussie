// Fix: every remaining Request-engine write function authorized on "does the caller
// hold ANY live membership in this workspace" — no role check. Continuing the
// write-path role audit begun in 0173 (marketplace) and 0174 (property engine).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0175_exclude_support_role_from_request_writes.sql";

const PREVIOUS = {
  "work.create_request_for_caller": "supabase/migrations/0154_request_structured_intake_fields.sql",
  "work.withdraw_request_for_caller": "supabase/migrations/0146_marketplace_write_contract.sql",
  "work.decline_quote_for_caller": "supabase/migrations/0146_marketplace_write_contract.sql",
  "work.complete_engagement_for_caller": "supabase/migrations/0146_marketplace_write_contract.sql",
  "work.cancel_engagement_for_caller": "supabase/migrations/0146_marketplace_write_contract.sql",
  "work.mark_request_reviewed_for_caller": "supabase/migrations/0146_marketplace_write_contract.sql",
  "work.submit_review_for_request": "supabase/migrations/0156_submit_review_for_request.sql",
};

function stripComments(raw) {
  return raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

function bodyOf(functionName, code) {
  const start = code.indexOf(`create or replace function ${functionName}`);
  const end = code.indexOf("\n$$;", start);
  return code.slice(start, end);
}

const codeNoComments = stripComments(readFileSync(MIGRATION, "utf8"));

describe("0175_exclude_support_role_from_request_writes migration", () => {
  it("six single-workspace functions exclude role = 'support' from their own membership check", () => {
    for (const fn of [
      "work.create_request_for_caller",
      "work.withdraw_request_for_caller",
      "work.decline_quote_for_caller",
      "work.complete_engagement_for_caller",
      "work.mark_request_reviewed_for_caller",
      "work.submit_review_for_request",
    ]) {
      const block = bodyOf(fn, codeNoComments);
      expect(block, `${fn} missing the role guard`).toMatch(/workspace\.current_memberships\(\) m where m\.workspace_id = [a-z_.]+ and m\.role <> 'support'/);
    }
  });

  it("cancel_engagement_for_caller excludes role = 'support' from its own two-sided IN check", () => {
    const block = bodyOf("work.cancel_engagement_for_caller", codeNoComments);
    expect(block).toMatch(/where m\.workspace_id in \(v_requesting_ws, v_performing_ws\) and m\.role <> 'support'/);
  });

  it("changes no grants — every function's own access posture is untouched", () => {
    expect(codeNoComments).not.toMatch(/^grant\b/m);
    expect(codeNoComments).not.toMatch(/^revoke\b/m);
  });

  describe("every body is otherwise byte-for-byte identical to its last shipped version", () => {
    for (const [fn, file] of Object.entries(PREVIOUS)) {
      it(`${fn}`, () => {
        const previous = bodyOf(fn, stripComments(readFileSync(file, "utf8")));
        const current = bodyOf(fn, codeNoComments);
        const normalize = (s) =>
          s
            .replace(/ and m\.role <> 'support'/g, "")
            .replace(/ where role <> 'support'/g, "");
        expect(normalize(current)).toBe(previous);
      });
    }
  });
});
