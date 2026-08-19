// Keeps 0067_workflow_instances.sql inside ADR-0028's shape (a fourth time) and inside
// §18's own rule: the transition log is the truth, current_stage a maintained
// convenience, and no foreign key exists from a workflow instance to its subject (see
// the migration's own header for why that mirrors platform.emit_event's precedent).
//
// Structural. Behaviour is proven against staging by VERIFY_WORKFLOW_INSTANCES.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0067_workflow_instances.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0067_workflow_instances migration", () => {
  it("creates exactly two tables, both in work", () => {
    const created = [...code.matchAll(/create table if not exists (work\.\w+)/gi)].map((m) => m[1]);
    expect(created.sort()).toEqual(["work.workflow_instances", "work.workflow_transitions"]);
  });

  it("workflow_instances holds subject_type/subject_id with no foreign key, current_stage FK'd to the definition's stages", () => {
    const start = code.indexOf("create table if not exists work.workflow_instances");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/subject_type\s+text\s+not null/);
    expect(block).toMatch(/subject_id\s+text\s+not null|subject_id\s+uuid\s+not null/);
    expect(block).not.toMatch(/references\s+\w+\.\w*subjects?/i);
    expect(block).toMatch(
      /foreign key \(definition_id, current_stage\)\s*\n\s*references work\.workflow_stages \(definition_id, stage_key\)/
    );
    expect(block).toMatch(/ended_at\s+timestamptz\s+null/);
    expect(block).toMatch(/check \(ended_at is null or ended_at >= started_at\)/);
  });

  it("workflow_transitions denormalises definition_id and both stage columns are composite FKs against it", () => {
    const start = code.indexOf("create table if not exists work.workflow_transitions");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/instance_id\s+uuid\s+not null/);
    expect(block).toMatch(/definition_id\s+uuid\s+not null/);
    expect(block).toMatch(/from_stage\s+text\s+null/);
    expect(block).toMatch(/to_stage\s+text\s+not null/);
    expect(block).toMatch(/event_key\s+text\s+not null/);
    expect(block).toMatch(/actor_type\s+platform\.actor_type\s+not null/);
    expect(block).toMatch(
      /foreign key \(definition_id, from_stage\)\s*\n\s*references work\.workflow_stages \(definition_id, stage_key\)/
    );
    expect(block).toMatch(
      /foreign key \(definition_id, to_stage\)\s*\n\s*references work\.workflow_stages \(definition_id, stage_key\)/
    );
  });

  it("has no dedicated per-instance sequence column — ordering relies on UUIDv7 and occurred_at", () => {
    expect(codeNoComments).not.toMatch(/subject_sequence/);
    expect(code).toMatch(/create index if not exists workflow_transitions_instance_idx\s*\n\s*on work\.workflow_transitions \(instance_id, occurred_at\)/);
  });

  it("workflow_transitions is unconditionally append-only", () => {
    expect(codeNoComments).toMatch(/workflow_transitions_reject_mutation/);
    expect(codeNoComments).toMatch(/before update or delete on work\.workflow_transitions/);
  });

  it("grants UPDATE on workflow_instances to klussie_engine_work but no DELETE on either table", () => {
    expect(code).toMatch(/grant update on work\.workflow_instances to klussie_engine_work/i);
    expect(code).not.toMatch(/grant delete on work\.workflow_instances/i);
    expect(code).not.toMatch(/grant delete on work\.workflow_transitions/i);
  });

  it("every function sets search_path to empty", () => {
    const fns = [...codeNoComments.matchAll(/create or replace function ([\w.]+)\([^)]*\)[\s\S]*?set search_path = (\S+)/gi)];
    expect(fns.length).toBeGreaterThan(0);
    for (const [, name, path] of fns) {
      expect(path, `${name} does not use an empty search_path`).toBe("''");
    }
  });

  it("revokes both tables from anon, authenticated and service_role, adds no policy here", () => {
    expect(code).toMatch(/revoke all on work\.workflow_instances from anon, authenticated, service_role/i);
    expect(code).toMatch(/revoke all on work\.workflow_transitions from anon, authenticated, service_role/i);
    expect(code).not.toMatch(/create policy/i);
  });
});
