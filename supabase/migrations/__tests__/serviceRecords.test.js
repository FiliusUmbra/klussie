// Keeps 0081_service_records.sql inside DATABASE_ARCHITECTURE.md §17's own rules: no
// owning_workspace_id (the core follows the property, live), performing_workspace_id is
// the permanent grant itself, and the core is immutable except customer_approved moving
// false -> true exactly once.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0081_service_records.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0081_service_records migration", () => {
  it("creates exactly one table, in work", () => {
    const created = [...code.matchAll(/create table if not exists (work\.\w+)/gi)].map((m) => m[1]);
    expect(created).toEqual(["work.service_records"]);
  });

  it("has no owning_workspace_id column — property-side visibility resolves live through property_id", () => {
    const start = code.indexOf("create table if not exists work.service_records");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).not.toMatch(/owning_workspace_id/);
    expect(block).toMatch(/property_id\s+uuid\s+not null/);
    expect(block).toMatch(/references property\.properties \(id\)/);
  });

  it("performing_workspace_id is a required, direct column — not a separate grants table", () => {
    const created = [...code.matchAll(/create table if not exists (work\.\w+)/gi)].map((m) => m[1]);
    expect(created.some((t) => /grant/i.test(t))).toBe(false);
    const start = code.indexOf("create table if not exists work.service_records");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/performing_workspace_id\s+uuid\s+not null/);
    expect(block).toMatch(/references workspace\.workspaces \(id\)/);
  });

  it("allows at most one of asset_id/location_id, both optional (property-level work is valid alone)", () => {
    const start = code.indexOf("create table if not exists work.service_records");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/asset_id\s+uuid\s+null/);
    expect(block).toMatch(/location_id\s+uuid\s+null/);
    expect(block).toMatch(/check \(num_nonnulls\(asset_id, location_id\) <= 1\)/);
  });

  it("work_performed is the one required rich-content column; everything else optional or jsonb", () => {
    const start = code.indexOf("create table if not exists work.service_records");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/work_performed\s+text\s+not null/);
    expect(block).toMatch(/content\s+jsonb\s+not null default/);
    expect(block).toMatch(/warranty_until\s+date\s+null/);
    expect(block).toMatch(/agreed_price\s+numeric\(12, 2\) null/);

    const rawStart = codeNoComments.indexOf("create table if not exists work.service_records");
    const rawBlock = codeNoComments.slice(rawStart, codeNoComments.indexOf(");", rawStart) + 2);
    expect(rawBlock).toMatch(/content\s+jsonb\s+not null default '\{\}'::jsonb/);
  });

  it("customer_approved and customer_approved_at are consistent, and false by default", () => {
    const start = code.indexOf("create table if not exists work.service_records");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/customer_approved\s+boolean\s+not null default false/);
    expect(block).toMatch(/check \(customer_approved = \(customer_approved_at is not null\)\)/);
  });

  it("the guard trigger freezes every column except customer_approved/customer_approved_at", () => {
    expect(codeNoComments).toMatch(/service_records_guard_mutation/);
    const guardStart = codeNoComments.indexOf("if tg_op = 'UPDATE' then");
    const guardBlock = codeNoComments.slice(guardStart, codeNoComments.indexOf("if old.customer_approved", guardStart));
    for (const col of [
      "id", "property_id", "asset_id", "location_id", "performing_workspace_id",
      "performed_at", "work_performed", "agreed_price", "price_currency",
      "warranty_until", "ai_summary", "recommendations", "content", "created_at",
    ]) {
      expect(guardBlock, `guard does not check column '${col}'`).toMatch(new RegExp(`new\\.${col} is distinct from old\\.${col}`));
    }
    expect(guardBlock).not.toMatch(/new\.customer_approved is distinct from old\.customer_approved/);
    expect(guardBlock).not.toMatch(/new\.customer_approved_at is distinct from old\.customer_approved_at/);
  });

  it("customer_approved may only move false -> true, never reset", () => {
    expect(codeNoComments).toMatch(
      /if old\.customer_approved and not new\.customer_approved then\s*\n\s*raise exception/
    );
  });

  it("rejects delete unconditionally", () => {
    expect(codeNoComments).toMatch(/if tg_op = 'DELETE' then\s*\n\s*raise exception/);
    expect(codeNoComments).toMatch(/before update or delete on work\.service_records/);
  });

  it("grants UPDATE (for the one exception path) but never DELETE, revokes from anon/authenticated/service_role, adds no policy here", () => {
    expect(code).toMatch(/grant update on work\.service_records to klussie_engine_work/i);
    expect(code).not.toMatch(/grant delete on work\.service_records/i);
    expect(code).toMatch(/revoke all on work\.service_records from anon, authenticated, service_role/i);
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
