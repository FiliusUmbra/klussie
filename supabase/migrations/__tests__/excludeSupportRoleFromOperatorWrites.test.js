// Fix: a real privilege-escalation loop within Platform Operations itself.
// workspace.grant_support_access_for_caller() (0172) never refused the operations
// workspace itself as a target, and three functions decided "is this caller an
// operator" via workspace_has_capability(m.workspace_id, 'platform_operations') without
// excluding role = 'support' — so a support grant minted on the operations workspace
// became a full pseudo-operator: able to grant/end further support access anywhere and
// decide Trust & Safety cases (including suspending a business).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0179_exclude_support_role_from_operator_writes.sql";

const PREVIOUS = {
  "safety.record_decision_for_caller": "supabase/migrations/0171_trust_safety_contract.sql",
  "workspace.grant_support_access_for_caller": "supabase/migrations/0172_support_access_contract.sql",
  "workspace.end_support_access_for_caller": "supabase/migrations/0172_support_access_contract.sql",
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

describe("0179_exclude_support_role_from_operator_writes migration", () => {
  it("all three functions exclude role = 'support' from their own platform_operations check", () => {
    for (const fn of [
      "safety.record_decision_for_caller",
      "workspace.grant_support_access_for_caller",
      "workspace.end_support_access_for_caller",
    ]) {
      const block = bodyOf(fn, codeNoComments);
      expect(block, `${fn} missing the role guard`).toMatch(
        /workspace\.workspace_has_capability\(m\.workspace_id, 'platform_operations'\) and m\.role <> 'support'/
      );
    }
  });

  it("changes no grants — every function's own access posture is untouched", () => {
    expect(codeNoComments).not.toMatch(/^grant\b/m);
    expect(codeNoComments).not.toMatch(/^revoke\b/m);
  });

  it("does not touch the read functions sharing the same capability-check shape", () => {
    expect(codeNoComments).not.toMatch(/trust_safety_queue_for_caller/);
    expect(codeNoComments).not.toMatch(/case_detail_for_caller/);
    expect(codeNoComments).not.toMatch(/list_audit_records/);
  });

  describe("every body is otherwise byte-for-byte identical to its last shipped version", () => {
    for (const [fn, file] of Object.entries(PREVIOUS)) {
      it(fn, () => {
        const previous = bodyOf(fn, stripComments(readFileSync(file, "utf8")));
        const current = bodyOf(fn, codeNoComments);
        const normalize = (s) => s.replace(/ and m\.role <> 'support'/g, "");
        expect(normalize(current)).toBe(previous);
      });
    }
  });
});
