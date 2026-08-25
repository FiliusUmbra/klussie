// Fix: every real Service Record write function authorized on "does the caller hold
// ANY live membership in this workspace" — no role check. Continuing the write-path
// role audit begun in 0173/0174/0175/0176.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0177_exclude_support_role_from_service_record_writes.sql";
const PREVIOUS_FILE = "supabase/migrations/0163_service_record_contract.sql";

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
const previousCode = stripComments(readFileSync(PREVIOUS_FILE, "utf8"));

describe("0177_exclude_support_role_from_service_record_writes migration", () => {
  it("four single-workspace functions exclude role = 'support' from their own membership check", () => {
    for (const fn of [
      "work.create_service_record_for_caller",
      "work.record_service_record_approval_for_caller",
      "work.write_performing_annex_for_caller",
      "work.write_property_annex_for_caller",
    ]) {
      const block = bodyOf(fn, codeNoComments);
      expect(block, `${fn} missing the role guard`).toMatch(/workspace\.current_memberships\(\) m where m\.workspace_id = [a-z_.]+ and m\.role <> 'support'/);
    }
  });

  it("amend_service_record_for_caller excludes role = 'support' from the authorship membership check", () => {
    const block = bodyOf("work.amend_service_record_for_caller", codeNoComments);
    expect(block).toMatch(/where m\.workspace_id = p_authored_by_workspace_id and m\.role <> 'support'/);
  });

  it("changes no grants — every function's own access posture is untouched", () => {
    expect(codeNoComments).not.toMatch(/^grant\b/m);
    expect(codeNoComments).not.toMatch(/^revoke\b/m);
  });

  describe("every body is otherwise byte-for-byte identical to its last shipped version (0163)", () => {
    for (const fn of [
      "work.create_service_record_for_caller",
      "work.record_service_record_approval_for_caller",
      "work.write_performing_annex_for_caller",
      "work.write_property_annex_for_caller",
      "work.amend_service_record_for_caller",
    ]) {
      it(fn, () => {
        const previous = bodyOf(fn, previousCode);
        const current = bodyOf(fn, codeNoComments);
        const normalize = (s) => s.replace(/ and m\.role <> 'support'/g, "");
        expect(normalize(current)).toBe(previous);
      });
    }
  });
});
