// Keeps 0056_document_attachments.sql inside DATABASE_ARCHITECTURE.md §15's "attachment is
// not a visibility grant" rule (structurally — no policy exists on this table at all) and
// scoped to subjects that have a real table today.
//
// Structural. Behaviour is proven against staging by VERIFY_DOCUMENT_ATTACHMENTS.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0056_document_attachments.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0056_document_attachments migration", () => {
  it("creates one table with four nullable subject columns, all real foreign keys", () => {
    const start = code.indexOf("create table if not exists property.document_attachments (");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/property_id\s+uuid\s+references property\.properties \(id\)/);
    expect(block).toMatch(/location_id\s+uuid\s+references property\.locations \(id\)/);
    expect(block).toMatch(/asset_id\s+uuid\s+references property\.assets \(id\)/);
    expect(block).toMatch(/workspace_id\s+uuid\s+references workspace\.workspaces \(id\)/);
  });

  it("requires exactly one subject per row via num_nonnulls, not a stringly-typed pair", () => {
    expect(codeNoComments).toMatch(
      /check \(num_nonnulls\(property_id, location_id, asset_id, workspace_id\) = 1\)/
    );
    expect(codeNoComments).not.toMatch(/subject_type/i);
  });

  it("deliberately has no column for maintenance record or marketplace engagement", () => {
    expect(codeNoComments).not.toMatch(/maintenance_record_id/i);
    expect(codeNoComments).not.toMatch(/engagement_id/i);
  });

  it("has no id default — minted explicitly by every caller, matching property.asset_placements", () => {
    const start = code.indexOf("create table if not exists property.document_attachments (");
    const block = code.slice(start, code.indexOf("constraint document_attachments_pkey", start));
    expect(block).toMatch(/id\s+uuid\s+not null,/);
    expect(block).not.toMatch(/id\s+uuid.*default/i);
  });

  it("adds no isolation policy — engine-internal only, the absent policy is still the deny", () => {
    expect(code).not.toMatch(/create policy/i);
  });

  it("revokes all from anon, authenticated and service_role", () => {
    expect(code).toMatch(/revoke all on property\.document_attachments from anon, authenticated, service_role/i);
  });

  it("indexes every subject column for lookup", () => {
    expect(code).toMatch(/create index if not exists document_attachments_property_id_idx/i);
    expect(code).toMatch(/create index if not exists document_attachments_location_id_idx/i);
    expect(code).toMatch(/create index if not exists document_attachments_asset_id_idx/i);
    expect(code).toMatch(/create index if not exists document_attachments_workspace_id_idx/i);
  });
});
