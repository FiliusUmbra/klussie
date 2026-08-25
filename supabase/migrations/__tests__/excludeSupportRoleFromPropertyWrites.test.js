// Fix: every real write function in the Property engine authorized on "does the caller
// hold ANY live membership in this workspace" — no role check. Continuing the write-path
// role audit SUPPORT_ACCESS_DESIGN.md §1.3(b) names, begun in 0173 for the marketplace.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0174_exclude_support_role_from_property_writes.sql";

const PREVIOUS = {
  "property.create_asset": "supabase/migrations/0139_asset_write_contract.sql",
  "property.update_asset": "supabase/migrations/0139_asset_write_contract.sql",
  "property.retire_asset": "supabase/migrations/0139_asset_write_contract.sql",
  "property.dispose_asset": "supabase/migrations/0139_asset_write_contract.sql",
  "property.create_location": "supabase/migrations/0140_location_write_contract.sql",
  "property.create_document": "supabase/migrations/0141_document_write_contract.sql",
  "property.create_document_for_request": "supabase/migrations/0149_document_request_attachment.sql",
  "property.create_document_for_service_record": "supabase/migrations/0165_service_record_evidence_documents.sql",
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

describe("0174_exclude_support_role_from_property_writes migration", () => {
  it("all four asset functions exclude role = 'support' from their own membership join", () => {
    for (const fn of ["property.create_asset", "property.update_asset", "property.retire_asset", "property.dispose_asset"]) {
      const block = bodyOf(fn, codeNoComments);
      expect(block, `${fn} missing the role guard`).toMatch(/join workspace\.current_memberships\(\) m on m\.workspace_id = [a-z_.]+ and m\.role <> 'support'/);
    }
  });

  it("create_location excludes role = 'support'", () => {
    const block = bodyOf("property.create_location", codeNoComments);
    expect(block).toMatch(/join workspace\.current_memberships\(\) m on m\.workspace_id = p\.steward_workspace_id and m\.role <> 'support'/);
  });

  it("create_document excludes role = 'support'", () => {
    const block = bodyOf("property.create_document", codeNoComments);
    expect(block).toMatch(/join workspace\.current_memberships\(\) m on m\.workspace_id = p\.steward_workspace_id and m\.role <> 'support'/);
  });

  it("create_document_for_request excludes role = 'support'", () => {
    const block = bodyOf("property.create_document_for_request", codeNoComments);
    expect(block).toMatch(/join workspace\.current_memberships\(\) m on m\.workspace_id = r\.requesting_workspace_id and m\.role <> 'support'/);
  });

  it("create_document_for_service_record excludes role = 'support' inside its own IN (subquery)", () => {
    const block = bodyOf("property.create_document_for_service_record", codeNoComments);
    expect(block).toMatch(/e\.performing_workspace_id in \(select workspace_id from workspace\.current_memberships\(\) where role <> 'support'\)/);
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
