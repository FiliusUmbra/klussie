// Keeps 0063_service_request_document_lookup.sql inside its own stated shape: a dedicated
// lookup via the bookkeeping join (never subject-based discovery), the same visibility
// rule as resolve_document() minus the public branch — request_photo stays private.
//
// Structural. Behaviour is proven against staging by VERIFY_SERVICE_REQUEST_DOCUMENT_LOOKUP.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0063_service_request_document_lookup.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0063_service_request_document_lookup migration", () => {
  it("joins via the bookkeeping column, never through property.document_attachments", () => {
    const start = codeNoComments.indexOf("create or replace function property.documents_for_service_request");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/join public\.service_request_photos srp on srp\.id = d\.service_request_photo_id/);
    expect(block).not.toMatch(/document_attachments/);
  });

  it("has no public-visibility branch — request_photo stays private", () => {
    const start = codeNoComments.indexOf("create or replace function property.documents_for_service_request");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).not.toMatch(/is_public/);
    expect(block).toMatch(/auth\.uid\(\) is not null/);
  });

  it("uses the identical owning-workspace-or-share rule as resolve_document()", () => {
    const start = codeNoComments.indexOf("create or replace function property.documents_for_service_request");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/d\.owning_workspace_id in \(select workspace_id from workspace\.current_memberships\(\)\)/);
    expect(block).toMatch(/document_shares ds/);
  });

  it("orders results by created_at, matching src/lib/requestPhotos.js's own original order", () => {
    const start = codeNoComments.indexOf("create or replace function property.documents_for_service_request");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/order by d\.created_at asc/);
  });

  it("the delegate is SECURITY DEFINER, granted to authenticated only — never anon, unlike the public document lookups", () => {
    expect(codeNoComments).toMatch(/create or replace function api\.documents_for_service_request[\s\S]*?security definer/);
    expect(code).toMatch(/grant execute on function api\.documents_for_service_request\(uuid\) to authenticated/i);
    expect(code).not.toMatch(/grant execute on function api\.documents_for_service_request\(uuid\) to anon/i);
  });

  it("revokes the engine function from every application role", () => {
    expect(code).toMatch(/revoke all on function property\.documents_for_service_request\(uuid\) from public, anon, authenticated, service_role/i);
  });

  it("keeps search_path empty on both functions", () => {
    const fns = [...codeNoComments.matchAll(/create or replace function ([\w.]+)\([^)]*\)[\s\S]*?set search_path = (\S+)/gi)];
    expect(fns.length).toBe(2);
    for (const [, name, path] of fns) {
      expect(path, `${name} does not use an empty search_path`).toBe("''");
    }
  });
});
