// Keeps 0055_documents.sql inside ADR-0028's shape (repeated for document versioning, not
// re-decided) and inside DATABASE_ARCHITECTURE.md §15's explicit rules: retention is
// carried by document type, not by a user's judgement in the moment, and deletion of an
// evidence-class document is never possible.
//
// Structural. Behaviour is proven against staging by VERIFY_DOCUMENTS.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0055_documents.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0055_documents migration", () => {
  it("creates exactly three tables, all in property, none new schemas", () => {
    const created = [...code.matchAll(/create table if not exists (property\.\w+)/gi)].map((m) => m[1]);
    expect(created.sort()).toEqual([
      "property.document_types", "property.document_versions", "property.documents",
    ]);
  });

  it("seeds exactly two document types, both convenience-class", () => {
    const start = codeNoComments.indexOf("insert into property.document_types");
    const block = codeNoComments.slice(start, codeNoComments.indexOf(";", start));
    expect(block).toMatch(/'portfolio_photo', 'convenience'/);
    expect(block).toMatch(/'request_photo', 'convenience'/);
    expect((block.match(/convenience/g) || []).length).toBe(2);
    expect(block).not.toMatch(/'evidence'/);
  });

  it("constrains retention_class to exactly two values", () => {
    const start = code.indexOf("create table if not exists property.document_types");
    const block = code.slice(start, code.indexOf(");", start));
    expect(block).toMatch(/check \(retention_class in \(''.*''\)\)/);
    expect(codeNoComments.slice(start, codeNoComments.indexOf(");", start))).toMatch(
      /check \(retention_class in \('evidence', 'convenience'\)\)/
    );
  });

  it("gives property.documents a mutable current version directly on the row — no pointer into document_versions", () => {
    const start = code.indexOf("create table if not exists property.documents (");
    const block = code.slice(start, code.indexOf("create index", start));
    expect(block).toMatch(/storage_bucket\s+text\s+not null default ''/);
    const rawBlock = codeNoComments.slice(
      codeNoComments.indexOf("create table if not exists property.documents ("),
      codeNoComments.indexOf("create index", codeNoComments.indexOf("create table if not exists property.documents ("))
    );
    expect(rawBlock).toMatch(/storage_bucket\s+text\s+not null default 'documents'/);
    expect(block).toMatch(/storage_path\s+text\s+not null/);
    expect(block).toMatch(/issuer\s+text/);
    expect(block).toMatch(/valid_from\s+date/);
    expect(block).toMatch(/valid_until\s+date/);
    expect(block).toMatch(/version_since\s+timestamptz\s+not null default now\(\)/);
    // No FK into document_versions from documents — the circular-pointer shape this
    // migration's own header explicitly rejects in favour of ADR-0028's real shape.
    expect(block).not.toMatch(/current_version_id/);
    expect(block).not.toMatch(/references property\.document_versions/);
  });

  it("document_versions holds only closed versions — both began_at and superseded_at required, checked in order", () => {
    const start = code.indexOf("create table if not exists property.document_versions");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/began_at\s+timestamptz\s+not null/);
    expect(block).toMatch(/superseded_at\s+timestamptz\s+not null/);
    expect(block).toMatch(/check \(superseded_at > began_at\)/);
  });

  it("document_versions is append-only, identical shape to asset_placements/stewardship_periods/membership_history", () => {
    expect(codeNoComments).toMatch(/document_versions_reject_mutation/);
    expect(codeNoComments).toMatch(/before update or delete on property\.document_versions/);
  });

  it("deletion of property.documents is guarded conditionally by retention_class, not withheld outright", () => {
    expect(codeNoComments).toMatch(/documents_guard_deletion/);
    expect(codeNoComments).toMatch(/before delete on property\.documents/);
    expect(codeNoComments).toMatch(/if v_retention_class = 'evidence' then/);
    expect(code).toMatch(/grant delete on property\.documents to klussie_engine_property/i);
  });

  it("withholds DELETE on document_versions — a superseded version is never removed", () => {
    expect(code).not.toMatch(/grant delete on property\.document_versions/i);
  });

  it("every function sets search_path to empty", () => {
    const fns = [...codeNoComments.matchAll(/create or replace function ([\w.]+)\([^)]*\)[\s\S]*?set search_path = (\S+)/gi)];
    expect(fns.length).toBeGreaterThan(0);
    for (const [, name, path] of fns) {
      expect(path, `${name} does not use an empty search_path`).toBe("''");
    }
  });

  it("revokes all three tables from anon, authenticated and service_role", () => {
    expect(code).toMatch(/revoke all on property\.document_types from anon, authenticated, service_role/i);
    expect(code).toMatch(/revoke all on property\.documents from anon, authenticated, service_role/i);
    expect(code).toMatch(/revoke all on property\.document_versions from anon, authenticated, service_role/i);
  });

  it("adds no isolation policy here — that is 0058's own job", () => {
    expect(code).not.toMatch(/create policy/i);
  });
});
