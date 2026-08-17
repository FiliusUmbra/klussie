// Keeps 0058_document_isolation_policies.sql inside DATABASE_ARCHITECTURE.md §15's own
// warning: "attachment is not a visibility grant... nearly lost." This is the one test
// file in this repository whose central assertion is a negative — the policy must never
// reference property.document_attachments, so a future edit cannot reintroduce the exact
// mistake §15 names.
//
// Structural. Behaviour is proven against staging by VERIFY_DOCUMENT_ISOLATION_POLICIES.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0058_document_isolation_policies.sql";

const raw = readFileSync(MIGRATION, "utf8");
const codeNoComments = raw
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");
const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0058_document_isolation_policies migration", () => {
  it("adds exactly one real policy — on property.documents — nothing on the other three tables", () => {
    const policies = [...code.matchAll(/create policy "([^"]+)"\s+on (property\.\w+)/gi)];
    expect(policies.map((m) => m[2])).toEqual(["property.documents"]);
  });

  it("NEVER references property.document_attachments in actual SQL — the one thing this file must not do", () => {
    // codeNoComments, not raw: the header comments legitimately explain the rule by
    // naming document_attachments (that's the whole point of the header) — this
    // assertion is about the executable SQL never joining through it, not about the
    // prose never mentioning it.
    expect(codeNoComments).not.toMatch(/document_attachments/i);
  });

  it("grants visibility through exactly two paths: owning workspace, or an explicit share", () => {
    const start = code.indexOf('create policy "workspace members can view documents"');
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/owning_workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/i);
    expect(block).toMatch(/from property\.document_shares ds/i);
    expect(block).toMatch(/ds\.shared_with_workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/i);
  });

  it("uses no document-specific membership resolver anywhere", () => {
    expect(code).not.toMatch(/current_document_memberships|is_document_owner|is_document_shared/i);
  });

  it("is SELECT only, permissive, and re-runnable", () => {
    expect(code).not.toMatch(/for (insert|update|delete|all)/i);
    expect(code).not.toMatch(/with check/i);
    expect(code).not.toMatch(/\bas restrictive\b/i);
    expect(code).toMatch(/drop policy if exists "workspace members can view documents" on property\.documents/i);
  });
});
