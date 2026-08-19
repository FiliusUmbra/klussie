// Keeps 0059_document_contract.sql inside ADR-0026's split (logic in property, thin
// SECURITY DEFINER delegates in api) and inside DATABASE_ARCHITECTURE.md §15's own
// attachment-vs-visibility distinction, applied a second time inside the contract
// functions themselves.
//
// Structural. Behaviour is proven against staging by VERIFY_DOCUMENT_CONTRACT.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0059_document_contract.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0059_document_contract migration", () => {
  it("defines property.my_documents and property.resolve_document, plus api delegates for both", () => {
    expect(code).toMatch(/create or replace function property\.my_documents\(/i);
    expect(code).toMatch(/create or replace function property\.resolve_document\(/i);
    expect(code).toMatch(/create or replace function api\.my_documents\(/i);
    expect(code).toMatch(/create or replace function api\.resolve_document\(/i);
  });

  it("my_documents takes four nullable subject parameters and requires exactly one", () => {
    const start = codeNoComments.indexOf("create or replace function property.my_documents");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/p_property_id\s+uuid default null/);
    expect(block).toMatch(/p_location_id\s+uuid default null/);
    expect(block).toMatch(/p_asset_id\s+uuid default null/);
    expect(block).toMatch(/p_workspace_id\s+uuid default null/);
    expect(block).toMatch(/num_nonnulls\(p_property_id, p_location_id, p_asset_id, p_workspace_id\) <> 1/);
    expect(block).toMatch(/raise exception/i);
  });

  it("my_documents joins attachment to find the subject's documents, then filters visibility separately", () => {
    const start = codeNoComments.indexOf("create or replace function property.my_documents");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/join property\.document_attachments da on da\.document_id = d\.id/);
    // The visibility clause must be its own condition, not derived from da.* at all.
    const visibilityStart = block.indexOf("and (");
    const visibilityBlock = block.slice(visibilityStart);
    expect(visibilityBlock).toMatch(/d\.owning_workspace_id in \(select workspace_id from workspace\.current_memberships\(\)\)/);
    expect(visibilityBlock).toMatch(/document_shares ds/);
    expect(visibilityBlock).not.toMatch(/da\./);
  });

  it("resolve_document applies the identical visibility rule, with no attachment join at all", () => {
    const start = codeNoComments.indexOf("create or replace function property.resolve_document");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).not.toMatch(/document_attachments/);
    expect(block).toMatch(/d\.owning_workspace_id in \(select workspace_id from workspace\.current_memberships\(\)\)/);
    expect(block).toMatch(/document_shares ds/);
  });

  it("both delegates are SECURITY DEFINER and set search_path to empty; both engine functions do not need SECURITY DEFINER but do set search_path empty", () => {
    const fns = [...codeNoComments.matchAll(/create or replace function ([\w.]+)\([^)]*\)[\s\S]*?(security definer\s*\n)?set search_path = (\S+)/gi)];
    expect(fns.length).toBe(4);
    for (const [, name, , path] of fns) {
      expect(path, `${name} does not use an empty search_path`).toBe("''");
    }
    expect(codeNoComments).toMatch(/create or replace function api\.my_documents\([\s\S]*?security definer/i);
    expect(codeNoComments).toMatch(/create or replace function api\.resolve_document\([\s\S]*?security definer/i);
  });

  it("grants execute on the api delegates to authenticated only, and revokes the engine functions from everyone", () => {
    expect(code).toMatch(/revoke all on function property\.my_documents\(uuid, uuid, uuid, uuid\) from public, anon, authenticated, service_role/i);
    expect(code).toMatch(/revoke all on function property\.resolve_document\(uuid\) from public, anon, authenticated, service_role/i);
    expect(code).toMatch(/grant execute on function api\.my_documents\(uuid, uuid, uuid, uuid\) to authenticated/i);
    expect(code).toMatch(/grant execute on function api\.resolve_document\(uuid\) to authenticated/i);
  });

  it("builds no share or revoke mutation function — nothing in the product creates a share today", () => {
    expect(codeNoComments).not.toMatch(/function (property|api)\.(share_document|revoke_share|create_share)/i);
  });

  it("returns storage_bucket alongside storage_path in every return shape", () => {
    const returnBlocks = [...codeNoComments.matchAll(/returns table \(([\s\S]*?)\)\nlanguage/g)];
    expect(returnBlocks.length).toBe(4);
    for (const [, block] of returnBlocks) {
      expect(block).toMatch(/storage_bucket\s+text/);
      expect(block).toMatch(/storage_path\s+text/);
    }
  });
});
