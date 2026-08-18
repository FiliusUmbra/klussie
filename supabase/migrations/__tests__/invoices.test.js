// Keeps 0097_invoices.sql inside §22/§11.2's own rules: immutable except status,
// multi-currency/jurisdiction from row one, corrections by credit never edit, and no
// subscription concept anywhere (that is Epic 22's own job, six epics later).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0097_invoices.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0097_invoices migration", () => {
  it("creates exactly one table, in commerce", () => {
    const created = [...code.matchAll(/create table if not exists (commerce\.\w+)/gi)].map((m) => m[1]);
    expect(created).toEqual(["commerce.invoices"]);
  });

  it("has no subscription table or column — Epic 22's own job", () => {
    expect(codeNoComments).not.toMatch(/create table.*subscription/i);
    expect(codeNoComments).not.toMatch(/subscription_id/);
  });

  it("kind is constrained to three real values, engagement_id required iff marketplace_commission", () => {
    const rawStart = codeNoComments.indexOf("create table if not exists commerce.invoices");
    const rawBlock = codeNoComments.slice(rawStart, codeNoComments.indexOf(");", rawStart) + 2);
    expect(rawBlock).toMatch(/check \(kind in \('marketplace_commission', 'subscription', 'other'\)\)/);
    expect(rawBlock).toMatch(
      /check \(\(kind = 'marketplace_commission'\) = \(engagement_id is not null\)\)/
    );
  });

  it("carries currency and jurisdiction as real, unconstrained columns — multi-currency from row one", () => {
    const start = code.indexOf("create table if not exists commerce.invoices");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/currency\s+text\s+not null/);
    expect(block).toMatch(/jurisdiction\s+text\s+not null/);
    expect(block).not.toMatch(/check \(currency in/);
  });

  it("total is checked equal to subtotal plus tax_amount", () => {
    const start = code.indexOf("create table if not exists commerce.invoices");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/check \(total = subtotal \+ tax_amount\)/);
  });

  it("payer_workspace_id is nullable, a forward-compatible column", () => {
    const start = code.indexOf("create table if not exists commerce.invoices");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/payer_workspace_id\s+uuid\s+null/);
  });

  it("the guard trigger freezes every column except status, and credited is a true terminal", () => {
    expect(codeNoComments).toMatch(/invoices_guard_mutation/);
    const guardStart = codeNoComments.indexOf("if tg_op = 'UPDATE' then");
    const guardBlock = codeNoComments.slice(guardStart, codeNoComments.indexOf("if old.status = 'credited'", guardStart));
    for (const col of ["id", "workspace_id", "payer_workspace_id", "kind", "engagement_id", "currency", "jurisdiction", "subtotal", "tax_rate", "tax_amount", "total", "issued_at"]) {
      expect(guardBlock, `guard does not check ${col}`).toMatch(new RegExp(`new\\.${col} is distinct from old\\.${col}`));
    }
    expect(guardBlock).not.toMatch(/new\.status is distinct from old\.status/);
    expect(codeNoComments).toMatch(
      /if old\.status = 'credited' then\s*\n\s*raise exception/
    );
  });

  it("rejects delete unconditionally", () => {
    expect(codeNoComments).toMatch(/if tg_op = 'DELETE' then\s*\n\s*raise exception/);
    expect(codeNoComments).toMatch(/before update or delete on commerce\.invoices/);
  });

  it("grants the engine the exact two cross-schema reads it needs, named and narrow", () => {
    expect(code).toMatch(/grant usage on schema work to klussie_engine_commerce/i);
    expect(code).toMatch(/grant select on work\.engagements to klussie_engine_commerce/i);
  });

  it("grants UPDATE, never DELETE, revokes from anon/authenticated/service_role, adds no policy here", () => {
    expect(code).toMatch(/grant update on commerce\.invoices to klussie_engine_commerce/i);
    expect(code).not.toMatch(/grant delete on commerce\.invoices/i);
    expect(code).toMatch(/revoke all on commerce\.invoices from anon, authenticated, service_role/i);
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
