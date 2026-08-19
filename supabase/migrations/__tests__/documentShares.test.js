// Keeps 0057_document_shares.sql independent of attachment (DATABASE_ARCHITECTURE.md §15)
// and Transactional rather than Historical — a share is revoked by deletion, unlike every
// append-only table this schema has built so far.
//
// Structural. Behaviour is proven against staging by VERIFY_DOCUMENT_SHARES.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0057_document_shares.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0057_document_shares migration", () => {
  it("creates one table naming who may see a document, keyed to a workspace", () => {
    const start = code.indexOf("create table if not exists property.document_shares (");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/document_id\s+uuid\s+not null\s*\n\s*references property\.documents \(id\)/);
    expect(block).toMatch(/shared_with_workspace_id\s+uuid\s+not null\s*\n\s*references workspace\.workspaces \(id\)/);
  });

  it("prevents duplicate shares of the same document to the same workspace", () => {
    expect(codeNoComments).toMatch(
      /constraint document_shares_unique unique \(document_id, shared_with_workspace_id\)/
    );
  });

  it("grants DELETE — sharing is revoked by deletion, unlike every Historical table so far", () => {
    expect(code).toMatch(/grant delete on property\.document_shares to klussie_engine_property/i);
  });

  it("has no id default — minted explicitly, matching property.document_attachments", () => {
    const start = code.indexOf("create table if not exists property.document_shares (");
    const block = code.slice(start, code.indexOf("constraint document_shares_pkey", start));
    expect(block).toMatch(/id\s+uuid\s+not null,/);
    expect(block).not.toMatch(/id\s+uuid.*default/i);
  });

  it("adds no isolation policy — reachable only through the engine contract and 0058's own policy", () => {
    expect(code).not.toMatch(/create policy/i);
  });

  it("revokes all from anon, authenticated and service_role", () => {
    expect(code).toMatch(/revoke all on property\.document_shares from anon, authenticated, service_role/i);
  });
});
