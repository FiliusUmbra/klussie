// Keeps 0099_payments.sql inside §11.2's own rule: one table for both payments and
// payouts, distinguished by direction, immutable except one guarded transition out of
// pending.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0099_payments.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0099_payments migration", () => {
  it("creates exactly one table, in commerce", () => {
    const created = [...code.matchAll(/create table if not exists (commerce\.\w+)/gi)].map((m) => m[1]);
    expect(created).toEqual(["commerce.payments"]);
  });

  it("direction is constrained to inbound/outbound — one table, not two", () => {
    const rawStart = codeNoComments.indexOf("create table if not exists commerce.payments");
    const rawBlock = codeNoComments.slice(rawStart, codeNoComments.indexOf(");", rawStart) + 2);
    expect(rawBlock).toMatch(/check \(direction in \('inbound', 'outbound'\)\)/);
  });

  it("status defaults pending, constrained to three values, settled requires settled_at", () => {
    const rawStart = codeNoComments.indexOf("create table if not exists commerce.payments");
    const rawBlock = codeNoComments.slice(rawStart, codeNoComments.indexOf(");", rawStart) + 2);
    expect(rawBlock).toMatch(/status\s+text\s+not null default 'pending'/);
    expect(rawBlock).toMatch(/check \(status in \('pending', 'settled', 'failed'\)\)/);
    expect(rawBlock).toMatch(/check \(status <> 'settled' or settled_at is not null\)/);
  });

  it("invoice_id is nullable — a payout need not settle an invoice", () => {
    const start = code.indexOf("create table if not exists commerce.payments");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/invoice_id\s+uuid\s+null/);
    expect(block).toMatch(/references commerce\.invoices \(id\)/);
  });

  it("the guard trigger freezes every column except status/settled_at, and any non-pending status is a true terminal", () => {
    expect(codeNoComments).toMatch(/payments_guard_mutation/);
    const guardStart = codeNoComments.indexOf("if tg_op = 'UPDATE' then");
    const guardBlock = codeNoComments.slice(guardStart, codeNoComments.indexOf("if old.status <> 'pending'", guardStart));
    for (const col of ["id", "workspace_id", "invoice_id", "direction", "amount", "currency", "created_at"]) {
      expect(guardBlock, `guard does not check ${col}`).toMatch(new RegExp(`new\\.${col} is distinct from old\\.${col}`));
    }
    expect(guardBlock).not.toMatch(/new\.status is distinct from old\.status/);
    expect(guardBlock).not.toMatch(/new\.settled_at is distinct from old\.settled_at/);
    expect(codeNoComments).toMatch(/if old\.status <> 'pending' then\s*\n\s*raise exception/);
  });

  it("rejects delete unconditionally", () => {
    expect(codeNoComments).toMatch(/if tg_op = 'DELETE' then\s*\n\s*raise exception/);
    expect(codeNoComments).toMatch(/before update or delete on commerce\.payments/);
  });

  it("grants UPDATE, never DELETE, revokes from anon/authenticated/service_role, adds no policy here", () => {
    expect(code).toMatch(/grant update on commerce\.payments to klussie_engine_commerce/i);
    expect(code).not.toMatch(/grant delete on commerce\.payments/i);
    expect(code).toMatch(/revoke all on commerce\.payments from anon, authenticated, service_role/i);
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
