// Keeps 0087_engagements.sql inside DATABASE_ARCHITECTURE.md §19's own shape: a
// bilateral object with both parties denormalised, permanent once it exists, no scoped
// membership ever created automatically by this migration.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0087_engagements.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0087_engagements migration", () => {
  it("creates exactly one table, in work", () => {
    const created = [...code.matchAll(/create table if not exists (work\.\w+)/gi)].map((m) => m[1]);
    expect(created).toEqual(["work.engagements"]);
  });

  it("denormalises both requesting_workspace_id and performing_workspace_id directly", () => {
    const start = code.indexOf("create table if not exists work.engagements");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/requesting_workspace_id\s+uuid\s+not null/);
    expect(block).toMatch(/performing_workspace_id\s+uuid\s+not null/);
    expect(block).toMatch(/request_id\s+uuid\s+not null/);
    expect(block).toMatch(/quote_id\s+uuid\s+not null/);
  });

  it("references work.service_records and work.maintenance_obligations, both nullable forward-connections", () => {
    const start = code.indexOf("create table if not exists work.engagements");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/service_record_id\s+uuid\s+null/);
    expect(block).toMatch(/references work\.service_records \(id\)/);
    expect(block).toMatch(/maintenance_obligation_id\s+uuid\s+null/);
    expect(block).toMatch(/references work\.maintenance_obligations \(id\)/);
  });

  it("never creates or references a workspace.memberships row — the scoped grant is not automatic here", () => {
    expect(codeNoComments).not.toMatch(/workspace\.memberships/);
    expect(codeNoComments).not.toMatch(/insert into workspace/);
  });

  it("status is constrained to three values, with completed/cancelled consistency checks", () => {
    const rawStart = codeNoComments.indexOf("create table if not exists work.engagements");
    const rawBlock = codeNoComments.slice(rawStart, codeNoComments.indexOf(");", rawStart) + 2);
    expect(rawBlock).toMatch(/check \(status in \('active', 'completed', 'cancelled'\)\)/);
    expect(rawBlock).toMatch(/check \(status <> 'completed' or completed_at is not null\)/);
    expect(rawBlock).toMatch(
      /check \(status <> 'cancelled' or \(cancelled_at is not null and cancellation_reason is not null\)\)/
    );
  });

  it("guards mutation only once status is terminal, not the table unconditionally", () => {
    expect(codeNoComments).toMatch(/engagements_reject_terminal_mutation/);
    expect(codeNoComments).toMatch(/if old\.status in \('completed', 'cancelled'\) then/);
    expect(codeNoComments).toMatch(/before update on work\.engagements/);
    expect(codeNoComments).not.toMatch(/before update or delete on work\.engagements/);
  });

  it("grants UPDATE but never DELETE, revokes from anon/authenticated/service_role, adds no policy here", () => {
    expect(code).toMatch(/grant update on work\.engagements to klussie_engine_work/i);
    expect(code).not.toMatch(/grant delete on work\.engagements/i);
    expect(code).toMatch(/revoke all on work\.engagements from anon, authenticated, service_role/i);
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
