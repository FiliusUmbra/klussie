// Keeps 0202_document_understanding_endpoint.sql inside its own stated shape: it widens
// the existing ai_usage_log.endpoint check constraint to admit 'suggest-item-details'
// using the same dynamically-resolved-constraint-name idiom 0199_asset_document_
// attachment.sql already established for 'ask-about-item', without dropping any of the
// three endpoint names already there. Structural, like every migration test in this
// repository (docs/engineering/TESTING.md §3).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0202_document_understanding_endpoint.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("0202_document_understanding_endpoint migration", () => {
  it("resolves the existing constraint name dynamically rather than assuming it", () => {
    expect(codeNoComments).toMatch(
      /select conname into v_constraint_name\s*\n\s*from pg_constraint\s*\n\s*where conrelid = 'public\.ai_usage_log'::regclass\s*\n\s*and contype = 'c'\s*\n\s*and pg_get_constraintdef\(oid\) like '%endpoint%';/
    );
  });

  it("drops whatever the existing constraint was found to be named, only if one existed", () => {
    expect(codeNoComments).toMatch(/if v_constraint_name is not null then/);
    expect(codeNoComments).toMatch(/execute format\('alter table public\.ai_usage_log drop constraint %I', v_constraint_name\);/);
  });

  it("re-adds the constraint keeping every endpoint already allowed, plus the new one", () => {
    expect(codeNoComments).toMatch(
      /check \(endpoint in \('ai-intake', 'translate-message', 'ask-about-item', 'suggest-item-details'\)\)/
    );
  });
});
