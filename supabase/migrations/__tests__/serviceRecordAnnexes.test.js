// Keeps 0082_service_record_annexes.sql inside §17's own transfer table: the performing
// annex has no workspace column of its own (it reads the core's), the property annex
// freezes its workspace at creation, and amendments are append-only.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0082_service_record_annexes.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0082_service_record_annexes migration", () => {
  it("creates exactly three tables, all in work", () => {
    const created = [...code.matchAll(/create table if not exists (work\.\w+)/gi)].map((m) => m[1]);
    expect(created.sort()).toEqual([
      "work.service_record_amendments",
      "work.service_record_performing_annexes",
      "work.service_record_property_annexes",
    ]);
  });

  it("the performing annex has no workspace_id column of its own", () => {
    const start = code.indexOf("create table if not exists work.service_record_performing_annexes");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).not.toMatch(/workspace_id/);
    expect(block).toMatch(/unique \(service_record_id\)/);
    expect(block).toMatch(/internal_cost\s+numeric\(12, 2\) null/);
    expect(block).toMatch(/margin\s+numeric\(12, 2\) null/);
    expect(block).toMatch(/supplier_used\s+text\s+null/);
  });

  it("the property annex freezes owning_workspace_id, not a foreign key to the property's current steward", () => {
    const start = code.indexOf("create table if not exists work.service_record_property_annexes");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/owning_workspace_id\s+uuid\s+not null/);
    expect(block).toMatch(/references workspace\.workspaces \(id\)/);
    expect(block).not.toMatch(/references property\.properties/);
    expect(block).toMatch(/unique \(service_record_id\)/);
  });

  it("both annexes are unique per service_record_id — at most one each", () => {
    const performingStart = code.indexOf("create table if not exists work.service_record_performing_annexes");
    const performingBlock = code.slice(performingStart, code.indexOf(");", performingStart) + 2);
    expect(performingBlock).toMatch(/constraint service_record_performing_annexes_one_per_record unique \(service_record_id\)/);

    const propertyStart = code.indexOf("create table if not exists work.service_record_property_annexes");
    const propertyBlock = code.slice(propertyStart, code.indexOf(");", propertyStart) + 2);
    expect(propertyBlock).toMatch(/constraint service_record_property_annexes_one_per_record unique \(service_record_id\)/);
  });

  it("amendments carry authorship, a field key, before/after values and a required reason", () => {
    const start = code.indexOf("create table if not exists work.service_record_amendments");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/authored_by_workspace_id\s+uuid\s+not null/);
    expect(block).toMatch(/field_key\s+text\s+not null/);
    expect(block).toMatch(/previous_value\s+text\s+null/);
    expect(block).toMatch(/corrected_value\s+text\s+null/);
    expect(block).toMatch(/reason\s+text\s+not null/);
  });

  it("amendments are unconditionally append-only", () => {
    expect(codeNoComments).toMatch(/service_record_amendments_reject_mutation/);
    expect(codeNoComments).toMatch(/before update or delete on work\.service_record_amendments/);
  });

  it("both annexes grant UPDATE but never DELETE; amendments get neither", () => {
    expect(code).toMatch(/grant update on work\.service_record_performing_annexes to klussie_engine_work/i);
    expect(code).toMatch(/grant update on work\.service_record_property_annexes to klussie_engine_work/i);
    expect(code).not.toMatch(/grant update on work\.service_record_amendments/i);
    expect(code).not.toMatch(/grant delete on work\.service_record/i);
  });

  it("revokes all three tables from anon, authenticated and service_role, adds no policy here", () => {
    for (const table of ["service_record_performing_annexes", "service_record_property_annexes", "service_record_amendments"]) {
      expect(code).toMatch(new RegExp(`revoke all on work\\.${table} from anon, authenticated, service_role`, "i"));
    }
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
