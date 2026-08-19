// Keeps 0098_credits.sql inside §11.2's own rule: corrections are credits, never edits,
// and a credit is itself permanent once issued.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0098_credits.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0098_credits migration", () => {
  it("creates exactly one table, in commerce", () => {
    const created = [...code.matchAll(/create table if not exists (commerce\.\w+)/gi)].map((m) => m[1]);
    expect(created).toEqual(["commerce.credits"]);
  });

  it("references commerce.invoices, amount is positive, reason is required", () => {
    const start = code.indexOf("create table if not exists commerce.credits");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/invoice_id\s+uuid\s+not null/);
    expect(block).toMatch(/references commerce\.invoices \(id\)/);
    expect(block).toMatch(/amount\s+numeric\(12, 2\) not null/);
    expect(block).toMatch(/check \(amount > 0\)/);
    expect(block).toMatch(/reason\s+text\s+not null/);
  });

  it("is unconditionally append-only", () => {
    expect(codeNoComments).toMatch(/credits_reject_mutation/);
    expect(codeNoComments).toMatch(/before update or delete on commerce\.credits/);
  });

  it("has no grant at all — engine-internal, written only via the contract function", () => {
    expect(code).not.toMatch(/grant update on commerce\.credits/i);
    expect(code).not.toMatch(/grant delete on commerce\.credits/i);
    expect(code).toMatch(/revoke all on commerce\.credits from anon, authenticated, service_role/i);
    expect(code).not.toMatch(/create policy/i);
  });

  it("every function sets search_path to empty", () => {
    const fns = [...codeNoComments.matchAll(/create or replace function ([\w.]+)\([^)]*\)[\s\S]*?set search_path = (\S+)/gi)];
    expect(fns.length).toBeGreaterThan(0);
    for (const [, name, path] of fns) {
      expect(path, `${name} does not use an empty search_path`).toBe("''");
    }
  });
});
