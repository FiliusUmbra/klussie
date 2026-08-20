// Keeps 0161_scoped_membership_authorization.sql inside its own stated rules: exactly
// five property.* policies gain a scope-aware branch, workspace.current_memberships()
// excludes every scoped row so every OTHER policy in the platform is untouched by
// construction, and no policy outside property.* is edited at all.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0161_scoped_membership_authorization.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName, code) {
  const start = code.indexOf(`create or replace function ${functionName}`);
  const end = code.indexOf("$$;", start);
  return code.slice(start, end);
}

describe("0161_scoped_membership_authorization migration", () => {
  it("workspace.current_memberships() now excludes every scoped row — scope is null, explicitly", () => {
    const block = bodyOf("workspace.current_memberships", codeNoComments);
    expect(block).toMatch(/and m\.scope is null;/);
  });

  it("workspace.current_property_scope() resolves only scoped rows carrying a real propertyId", () => {
    const block = bodyOf("workspace.current_property_scope", codeNoComments);
    expect(block).toMatch(/m\.scope is not null/);
    expect(block).toMatch(/m\.scope \? 'propertyId'/);
    expect(block).toMatch(/i\.auth_user_id = auth\.uid\(\)/);
    expect(block).toMatch(/m\.state = 'active'/);
    expect(block).toMatch(/m\.expires_at is null or m\.expires_at > now\(\)/);
  });

  it("api.current_property_scope() is a thin SECURITY DEFINER pass-through, granted to authenticated only", () => {
    const block = bodyOf("api.current_property_scope", codeNoComments);
    expect(block).toMatch(/security definer/i);
    expect(codeNoComments).toMatch(/revoke all on function api\.current_property_scope\(\) from public, anon, service_role/);
    expect(codeNoComments).toMatch(/grant execute on function api\.current_property_scope\(\) to authenticated/);
    expect(codeNoComments).toMatch(
      /revoke all on function workspace\.current_property_scope\(\) from public, anon, authenticated, service_role/
    );
  });

  it("touches exactly five property.* policies, dropped before recreated", () => {
    for (const table of ["properties", "locations", "assets", "asset_facets", "documents"]) {
      expect(codeNoComments, `${table} policy not dropped first`).toMatch(
        new RegExp(`drop policy if exists "workspace members can view ${table}" on property\\.${table}`)
      );
    }
    expect((codeNoComments.match(/create policy/g) || []).length).toBe(5);
  });

  it("each of the four simple property.* policies keeps its unscoped branch unchanged and adds exactly one scoped OR-branch", () => {
    for (const table of ["properties", "locations", "assets", "asset_facets"]) {
      const start = codeNoComments.indexOf(`create policy "workspace members can view ${table}"`);
      const end = codeNoComments.indexOf(";", codeNoComments.indexOf("using (", start));
      const block = codeNoComments.slice(start, end);
      expect(block, `${table} missing the unscoped branch`).toMatch(/api\.current_workspace_memberships\(\)/);
      expect(block, `${table} missing the scoped branch`).toMatch(/api\.current_property_scope\(\)/);
    }
  });

  it("the documents policy's new branch resolves through document_attachments, never through owning_workspace_id alone", () => {
    const start = codeNoComments.indexOf('create policy "workspace members can view documents"');
    const block = codeNoComments.slice(start, codeNoComments.indexOf("comment on policy", start));
    expect(block).toMatch(/from property\.document_attachments da/);
    expect(block).toMatch(/coalesce\(da\.property_id, a\.property_id, l\.property_id\)/);
    expect(block).toMatch(/api\.current_property_scope\(\)/);
    // The original three branches (public type, owning workspace, explicit share) stay.
    expect(block).toMatch(/dt\.is_public/);
    expect(block).toMatch(/owning_workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/);
    expect(block).toMatch(/property\.document_shares ds/);
  });

  it("touches no policy outside property.* — every other engine's policy is protected by the function change alone", () => {
    expect(codeNoComments).not.toMatch(/on work\./);
    expect(codeNoComments).not.toMatch(/on workspace\.memberships/);
    expect(codeNoComments).not.toMatch(/on knowledge\./);
    expect(codeNoComments).not.toMatch(/on commerce\./);
  });

  describe("the seven read functions that bake in their own membership check, not merely RLS", () => {
    const scopeAware = [
      "property.resolve_property", "property.resolve_asset", "property.resolve_document",
      "property.locations_for_property", "property.my_assets", "property.my_documents",
      "property.assemble_twin",
    ];

    it("each gains a scoped OR-branch alongside its unchanged unscoped-membership branch", () => {
      for (const fn of scopeAware) {
        const block = bodyOf(fn, codeNoComments);
        expect(block, `${fn} missing`).not.toBe("");
        expect(block, `${fn} missing the unscoped branch`).toMatch(/workspace\.current_memberships\(\)/);
        expect(block, `${fn} missing the scoped branch`).toMatch(/workspace\.current_property_scope\(\)/);
      }
    });

    it("none of the seven are re-parameterised or given a different return shape — CREATE OR REPLACE only, no DROP", () => {
      for (const fn of scopeAware) {
        expect(codeNoComments, `${fn} unexpectedly dropped`).not.toMatch(new RegExp(`drop function.*${fn.replace(".", "\\.")}`));
      }
    });

    it("my_documents() parenthesises its five-subject OR-chain together, so the visibility check gates every subject branch — not only the last one", () => {
      // Regression pin for a real, pre-existing bug this migration's own adversarial
      // diagnostic found: without the outer parens, `A or B or C or D or E and F` parses
      // as `A or B or C or D or (E and F)` — only the last subject clause was ever really
      // gated by visibility.
      const block = bodyOf("property.my_documents", codeNoComments);
      expect(block).toMatch(
        /where \(\s*\n\s*\(p_property_id is not null and da\.property_id = p_property_id\)/
      );
      expect(block).toMatch(/\(p_request_id is not null and da\.request_id = p_request_id\)\s*\n\s*\)\s*\n\s*and \(/);
    });

    it("resolve_document and my_documents resolve scope through document_attachments, never workspace/request subjects", () => {
      for (const fn of ["property.resolve_document", "property.my_documents"]) {
        const block = bodyOf(fn, codeNoComments);
        expect(block).toMatch(/document_attachments/);
        expect(block).not.toMatch(/p_workspace_id is not null[\s\S]{0,80}current_property_scope/);
        expect(block).not.toMatch(/p_request_id is not null[\s\S]{0,80}current_property_scope/);
      }
    });

    it("assemble_twin's scoped branch gates the whole summary row, including maintenance/service-record counts", () => {
      const block = bodyOf("property.assemble_twin", codeNoComments);
      expect(block).toMatch(/open_maintenance_obligation_count|work\.maintenance_obligations/);
      expect(block).toMatch(/work\.service_records/);
      expect(block).toMatch(/workspace\.current_property_scope\(\)/);
    });

    it("deliberately does not touch my_properties(), timeline_segment(), or documents_for_service_request()", () => {
      expect(codeNoComments).not.toMatch(/create or replace function property\.my_properties/);
      expect(codeNoComments).not.toMatch(/create or replace function property\.timeline_segment/);
      expect(codeNoComments).not.toMatch(/create or replace function property\.documents_for_service_request/);
    });
  });

  it("grants authenticated USAGE on schema property and SELECT only on the five RLS-gated tables", () => {
    expect(codeNoComments).toMatch(/grant usage on schema property to authenticated/);
    const start = codeNoComments.indexOf("grant select on\n  property.properties");
    const block = codeNoComments.slice(start, codeNoComments.indexOf(";", start) + 1);
    for (const table of ["property.properties", "property.locations", "property.assets", "property.asset_facets", "property.documents"]) {
      expect(block, `missing SELECT grant on ${table}`).toContain(table);
    }
    expect(codeNoComments).not.toMatch(/grant (insert|update|delete|all) on property\./i);
  });
});
