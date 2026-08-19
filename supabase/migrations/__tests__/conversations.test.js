// Keeps 0091_conversations.sql inside §15's own exact five-subject list, and the
// one-exception-column immutability guard shape established since work.service_records.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0091_conversations.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0091_conversations migration", () => {
  it("creates exactly one table, in work", () => {
    const created = [...code.matchAll(/create table if not exists (work\.\w+)/gi)].map((m) => m[1]);
    expect(created).toEqual(["work.conversations"]);
  });

  it("has exactly five nullable subject columns, exactly one required", () => {
    const start = code.indexOf("create table if not exists work.conversations");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    for (const col of ["engagement_id", "asset_id", "maintenance_obligation_id", "property_id", "workspace_id"]) {
      expect(block, `missing ${col}`).toMatch(new RegExp(`${col}\\s+uuid\\s+null`));
    }
    expect(block).toMatch(
      /check \(num_nonnulls\(engagement_id, asset_id, maintenance_obligation_id, property_id, workspace_id\) = 1\)/
    );
  });

  it("engagement_id references work.engagements, the corrected binding", () => {
    const start = code.indexOf("create table if not exists work.conversations");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/references work\.engagements \(id\)/);
    expect(block).not.toMatch(/references work\.requests/);
  });

  it("carries a bookkeeping-only legacy_conversation_id", () => {
    const start = code.indexOf("create table if not exists work.conversations");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/legacy_conversation_id\s+uuid\s+null/);
  });

  it("the guard trigger freezes every column except closed_at, one-way only", () => {
    expect(codeNoComments).toMatch(/conversations_guard_mutation/);
    const guardStart = codeNoComments.indexOf("if tg_op = 'UPDATE' then");
    const guardBlock = codeNoComments.slice(guardStart, codeNoComments.indexOf("if old.closed_at", guardStart));
    for (const col of ["id", "engagement_id", "asset_id", "maintenance_obligation_id", "property_id", "workspace_id", "created_at"]) {
      expect(guardBlock, `guard does not check ${col}`).toMatch(new RegExp(`new\\.${col} is distinct from old\\.${col}`));
    }
    expect(guardBlock).not.toMatch(/new\.closed_at is distinct from old\.closed_at/);
    expect(codeNoComments).toMatch(
      /if old\.closed_at is not null and new\.closed_at is null then\s*\n\s*raise exception/
    );
  });

  it("rejects delete unconditionally", () => {
    expect(codeNoComments).toMatch(/if tg_op = 'DELETE' then\s*\n\s*raise exception/);
    expect(codeNoComments).toMatch(/before update or delete on work\.conversations/);
  });

  it("grants UPDATE, never DELETE, revokes from anon/authenticated/service_role, adds no policy here", () => {
    expect(code).toMatch(/grant update on work\.conversations to klussie_engine_work/i);
    expect(code).not.toMatch(/grant delete on work\.conversations/i);
    expect(code).toMatch(/revoke all on work\.conversations from anon, authenticated, service_role/i);
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
