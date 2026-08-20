// Keeps 0069_workflow_contract.sql inside ADR-0022 (application-generated identifiers,
// nothing minted server-side), ADR-0026's split posture applied to a function with no
// real client caller yet (property.reparent_location's own precedent, not property.my_
// documents'), and Conflict 3's own distinguishing test: an impossible transition is
// refused, never guessed.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0069_workflow_contract.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0069_workflow_contract migration", () => {
  it("defines exactly five functions, all in work, none in api", () => {
    const created = [...codeNoComments.matchAll(/create or replace function (work\.\w+|api\.\w+)\(/g)].map((m) => m[1]);
    expect(created.sort()).toEqual([
      "work.my_workflow_instances",
      "work.resolve_workflow_instance",
      "work.start_workflow_instance",
      "work.transition_workflow_instance",
      "work.workflow_instance_history",
    ]);
  });

  it("start_workflow_instance takes every identifier as a required parameter, none defaulted", () => {
    const start = codeNoComments.indexOf("create or replace function work.start_workflow_instance(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("returns void", start));
    for (const param of ["p_instance_id", "p_transition_id", "p_event_id", "p_correlation_id"]) {
      expect(block).toMatch(new RegExp(`${param}\\s+uuid,`));
      expect(block).not.toMatch(new RegExp(`${param}\\s+uuid\\s+default`));
    }
    expect(block).toMatch(/p_payload\s+jsonb default '\{\}'::jsonb/);
  });

  it("start_workflow_instance resolves the latest published, non-deprecated version and raises if none exists", () => {
    const start = codeNoComments.indexOf("create or replace function work.start_workflow_instance(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/where definition_key = p_definition_key\s*\n\s*and deprecated_at is null/);
    expect(block).toMatch(/order by version desc/);
    expect(block).toMatch(/if v_definition_id is null then\s*\n\s*raise exception/);
  });

  it("start_workflow_instance raises when the definition has no from_stage-null start rule", () => {
    const start = codeNoComments.indexOf("create or replace function work.start_workflow_instance(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/where definition_id = v_definition_id\s*\n\s*and from_stage is null/);
    expect(block).toMatch(/if v_to_stage is null then\s*\n\s*raise exception/);
  });

  it("start_workflow_instance writes the instance, the opening transition and emits workflow.workflow_instance.started, in that order", () => {
    const start = codeNoComments.indexOf("create or replace function work.start_workflow_instance(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    const instanceIdx = block.indexOf("insert into work.workflow_instances");
    const transitionIdx = block.indexOf("insert into work.workflow_transitions");
    const eventIdx = block.indexOf("perform platform.emit_event");
    expect(instanceIdx).toBeGreaterThan(-1);
    expect(transitionIdx).toBeGreaterThan(instanceIdx);
    expect(eventIdx).toBeGreaterThan(transitionIdx);
    expect(block).toMatch(/'workflow\.workflow_instance\.started'/);
    expect(block).toMatch(/from_stage, to_stage, event_key.*\n.*values\s*\n\s*\(p_transition_id, p_instance_id, v_definition_id, null, v_to_stage, v_event_key/);
  });

  it("transition_workflow_instance locks the instance row for update before reading its stage", () => {
    const start = codeNoComments.indexOf("create or replace function work.transition_workflow_instance(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/from work\.workflow_instances\s*\n\s*where id = p_instance_id\s*\n\s*for update/);
  });

  it("transition_workflow_instance refuses to transition an already-ended instance", () => {
    const start = codeNoComments.indexOf("create or replace function work.transition_workflow_instance(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/if v_ended_at is not null then\s*\n\s*raise exception/);
  });

  it("transition_workflow_instance looks up the rule by (definition_id, current_stage, event_key) and raises when none matches — the impossible-transition refusal", () => {
    const start = codeNoComments.indexOf("create or replace function work.transition_workflow_instance(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/where definition_id = v_definition_id\s*\n\s*and from_stage = v_current_stage\s*\n\s*and event_key = p_event_key/);
    expect(block).toMatch(/if v_to_stage is null then\s*\n\s*raise exception/);
    expect(block).toMatch(/not permitted by definition/);
  });

  it("transition_workflow_instance sets ended_at only when the target stage is terminal", () => {
    const start = codeNoComments.indexOf("create or replace function work.transition_workflow_instance(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/select is_terminal into v_is_terminal/);
    expect(block).toMatch(/ended_at = case when v_is_terminal then now\(\) else null end/);
  });

  it("workflow_instance_history orders oldest first, occurred_at then id", () => {
    const start = codeNoComments.indexOf("create or replace function work.workflow_instance_history(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/order by t\.occurred_at, t\.id/);
  });

  it("every function sets search_path to empty", () => {
    const fns = [...codeNoComments.matchAll(/create or replace function ([\w.]+)\([^)]*\)[\s\S]*?set search_path = (\S+)/gi)];
    expect(fns.length).toBe(5);
    for (const [, name, path] of fns) {
      expect(path, `${name} does not use an empty search_path`).toBe("''");
    }
  });

  it("grants every function to klussie_engine_work only — no api delegate, no authenticated/anon grant", () => {
    const grants = [...code.matchAll(/grant execute on function (work\.\w+)\([^)]*\)\s*\n\s*to (\w+)/g)];
    expect(grants.length).toBe(5);
    for (const [, , role] of grants) {
      expect(role).toBe("klussie_engine_work");
    }
    expect(code).not.toMatch(/create or replace function api\./);
    expect(code).not.toMatch(/grant execute .* to authenticated/i);
  });

  it("revokes all five functions from public, anon, authenticated and service_role before granting", () => {
    const revokes = [...code.matchAll(/revoke all on function (work\.\w+)\([^)]*\)\s*\n\s*from public, anon, authenticated, service_role/g)];
    expect(revokes.length).toBe(5);
  });
});
