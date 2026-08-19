// Keeps 0062_document_public_visibility.sql inside its own stated rule: public visibility
// is carried by document TYPE (matching retention_class's own precedent), never a per-row
// flag, and request_photo must stay private — this migration resolves the portfolio half
// of implementation/epic-08/COMPLETION.md §5.5, not the request-photo half (0063).
//
// Structural. Behaviour is proven against staging by VERIFY_DOCUMENT_PUBLIC_VISIBILITY.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0062_document_public_visibility.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0062_document_public_visibility migration", () => {
  it("adds is_public to document_types, not to documents itself", () => {
    expect(codeNoComments).toMatch(
      /alter table property\.document_types\s*\n\s*add column if not exists is_public boolean not null default false/
    );
    expect(codeNoComments).not.toMatch(/alter table property\.documents\s*\n\s*add column if not exists is_public/);
  });

  it("marks exactly portfolio_photo as public, leaving request_photo private", () => {
    expect(codeNoComments).toMatch(/update property\.document_types set is_public = true where type_key = 'portfolio_photo'/);
    expect(codeNoComments).not.toMatch(/is_public = true where type_key = 'request_photo'/);
  });

  it("the isolation policy checks a public type before checking membership, and guards the membership branch on auth.uid()", () => {
    const start = codeNoComments.indexOf('create policy "workspace members can view documents"');
    const block = codeNoComments.slice(start, codeNoComments.indexOf(");", start) + 2);
    expect(block).toMatch(/exists \(select 1 from property\.document_types dt where dt\.type_key = documents\.type_key and dt\.is_public\)/);
    expect(block).toMatch(/auth\.uid\(\) is not null/);
    expect(block).toMatch(/to anon, authenticated/);
  });

  it("both engine contract functions gain the identical public-type branch, guarded the same way", () => {
    const myDocsStart = codeNoComments.indexOf("create or replace function property.my_documents");
    const myDocsBlock = codeNoComments.slice(myDocsStart, codeNoComments.indexOf("$$;", myDocsStart));
    expect(myDocsBlock).toMatch(/exists \(select 1 from property\.document_types dt where dt\.type_key = d\.type_key and dt\.is_public\)/);
    expect(myDocsBlock).toMatch(/auth\.uid\(\) is not null/);

    const resolveStart = codeNoComments.indexOf("create or replace function property.resolve_document");
    const resolveBlock = codeNoComments.slice(resolveStart, codeNoComments.indexOf("$$;", resolveStart));
    expect(resolveBlock).toMatch(/exists \(select 1 from property\.document_types dt where dt\.type_key = d\.type_key and dt\.is_public\)/);
    expect(resolveBlock).toMatch(/auth\.uid\(\) is not null/);
  });

  it("grants both api delegates to anon, matching portfolio_items' own real RLS", () => {
    expect(code).toMatch(/grant execute on function api\.my_documents\(uuid, uuid, uuid, uuid\) to anon/i);
    expect(code).toMatch(/grant execute on function api\.resolve_document\(uuid\) to anon/i);
  });

  it("every function keeps search_path empty", () => {
    const fns = [...codeNoComments.matchAll(/create or replace function ([\w.]+)\([^)]*\)[\s\S]*?set search_path = (\S+)/gi)];
    expect(fns.length).toBeGreaterThan(0);
    for (const [, name, path] of fns) {
      expect(path, `${name} does not use an empty search_path`).toBe("''");
    }
  });
});
