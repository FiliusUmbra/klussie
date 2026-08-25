// Fix: two write functions the earlier sweeps (0173/0174/0175/0176/0177) missed because
// neither lives in a migration whose name matches "write_contract" for the schema it
// belongs to. Found by walking every migration referencing
// workspace.current_memberships() at all, not just the already-audited file patterns.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0178_exclude_support_role_from_provisioning_writes.sql";

const PREVIOUS = {
  "property.create_property_for_caller": "supabase/migrations/0143_property_write_contract_for_caller.sql",
  "work.create_manual_maintenance_obligation": "supabase/migrations/0142_maintenance_write_delegate.sql",
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

describe("0178_exclude_support_role_from_provisioning_writes migration", () => {
  it("both functions exclude role = 'support' from their own membership check", () => {
    for (const fn of ["property.create_property_for_caller", "work.create_manual_maintenance_obligation"]) {
      const block = bodyOf(fn, codeNoComments);
      expect(block, `${fn} missing the role guard`).toMatch(/workspace\.current_memberships\(\) m where m\.workspace_id = [a-z_.]+ and m\.role <> 'support'/);
    }
  });

  it("changes no grants — every function's own access posture is untouched", () => {
    expect(codeNoComments).not.toMatch(/^grant\b/m);
    expect(codeNoComments).not.toMatch(/^revoke\b/m);
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
