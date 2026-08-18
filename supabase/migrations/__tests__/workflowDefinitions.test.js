// Keeps 0066_workflow_definitions.sql inside DATABASE_ARCHITECTURE.md §18's rules:
// definitions immutable once published except deprecated_at, never deleted, and no
// isolation policy until a real read path exists to serve it through.
//
// Structural. Behaviour is proven against staging by VERIFY_WORKFLOW_DEFINITIONS.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0066_workflow_definitions.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0066_workflow_definitions migration", () => {
  it("creates exactly three tables, all in work, none new schemas", () => {
    const created = [...code.matchAll(/create table if not exists (work\.\w+)/gi)].map((m) => m[1]);
    expect(created.sort()).toEqual([
      "work.workflow_definitions", "work.workflow_stages", "work.workflow_transition_rules",
    ]);
  });

  it("workflow_definitions is versioned per key, workspace_id nullable for platform-scoped rows", () => {
    const start = code.indexOf("create table if not exists work.workflow_definitions");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/definition_key\s+text\s+not null/);
    expect(block).toMatch(/version\s+integer\s+not null/);
    expect(block).toMatch(/check \(version >= 1\)/);
    expect(block).toMatch(/workspace_id\s+uuid\s+null/);
    expect(block).toMatch(/references workspace\.workspaces \(id\)/);
    expect(block).toMatch(/unique \(definition_key, version\)/);
  });

  it("published_at defaults now(), no draft-state column — every row inserted already published", () => {
    const start = code.indexOf("create table if not exists work.workflow_definitions");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/published_at\s+timestamptz\s+not null default now\(\)/);
    expect(block).toMatch(/deprecated_at\s+timestamptz\s+null/);
    expect(block).not.toMatch(/status\s+text/);
    expect(block).not.toMatch(/is_draft/);
  });

  it("workflow_stages carries a composite unique (definition_id, stage_key) for the transition rules' composite FK to target", () => {
    const start = code.indexOf("create table if not exists work.workflow_stages");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/unique \(definition_id, stage_key\)/);
    expect(block).toMatch(/is_terminal\s+boolean\s+not null default false/);
  });

  it("workflow_transition_rules' from_stage is nullable — the null row is the instance-start rule", () => {
    const start = code.indexOf("create table if not exists work.workflow_transition_rules");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/from_stage\s+text\s+null/);
    expect(block).toMatch(/to_stage\s+text\s+not null/);
    expect(block).toMatch(/event_key\s+text\s+not null/);
    expect(block).toMatch(/actor_role\s+text\s+null/);
    expect(block).toMatch(/unique \(definition_id, from_stage, event_key\)/);
  });

  it("both from_stage and to_stage are composite foreign keys into workflow_stages, scoped per definition", () => {
    const start = code.indexOf("create table if not exists work.workflow_transition_rules");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(
      /foreign key \(definition_id, from_stage\)\s*\n\s*references work\.workflow_stages \(definition_id, stage_key\)/
    );
    expect(block).toMatch(
      /foreign key \(definition_id, to_stage\)\s*\n\s*references work\.workflow_stages \(definition_id, stage_key\)/
    );
  });

  it("seeds nothing here — the real booking-lifecycle definition is WP 09.05's own migration", () => {
    expect(codeNoComments).not.toMatch(/insert into work\.workflow_definitions/i);
    expect(codeNoComments).not.toMatch(/insert into work\.workflow_stages/i);
    expect(codeNoComments).not.toMatch(/insert into work\.workflow_transition_rules/i);
  });

  it("workflow_definitions is immutable except deprecated_at, and never deletable", () => {
    expect(codeNoComments).toMatch(/workflow_definitions_reject_mutation/);
    expect(codeNoComments).toMatch(/before update or delete on work\.workflow_definitions/);
    expect(codeNoComments).toMatch(/rows are never deleted/);
    // deprecated_at must be absent from the list of columns that trip the guard
    const guardStart = codeNoComments.indexOf("if tg_op = 'UPDATE' then");
    const guardBlock = codeNoComments.slice(guardStart, codeNoComments.indexOf("end if;", guardStart));
    expect(guardBlock).not.toMatch(/new\.deprecated_at is distinct from old\.deprecated_at/);
  });

  it("workflow_stages and workflow_transition_rules are unconditionally append-only", () => {
    expect(codeNoComments).toMatch(/workflow_definition_children_reject_mutation/);
    expect(codeNoComments).toMatch(/before update or delete on work\.workflow_stages/);
    expect(codeNoComments).toMatch(/before update or delete on work\.workflow_transition_rules/);
  });

  it("every function sets search_path to empty", () => {
    const fns = [...codeNoComments.matchAll(/create or replace function ([\w.]+)\([^)]*\)[\s\S]*?set search_path = (\S+)/gi)];
    expect(fns.length).toBeGreaterThan(0);
    for (const [, name, path] of fns) {
      expect(path, `${name} does not use an empty search_path`).toBe("''");
    }
  });

  it("revokes all three tables from anon, authenticated and service_role, and adds no policy", () => {
    expect(code).toMatch(/revoke all on work\.workflow_definitions from anon, authenticated, service_role/i);
    expect(code).toMatch(/revoke all on work\.workflow_stages from anon, authenticated, service_role/i);
    expect(code).toMatch(/revoke all on work\.workflow_transition_rules from anon, authenticated, service_role/i);
    expect(code).not.toMatch(/create policy/i);
  });
});
