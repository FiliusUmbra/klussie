// Keeps 0111_knowledge_contract.sql inside its own stated rules: event_type minted
// correctly from the start (the lesson Epic 15 named), conflict detection happens once
// at declaration rather than on every read, supersession never edits in place, and
// promote_fact() writes the audit record §6/§33 requires before emitting anything.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0111_knowledge_contract.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0111_knowledge_contract migration", () => {
  it("defines exactly eight functions, all in knowledge, none in api", () => {
    const created = [...codeNoComments.matchAll(/create or replace function (knowledge\.\w+|api\.\w+)\(/g)].map((m) => m[1]);
    expect(created.sort()).toEqual([
      "knowledge.assert_edge",
      "knowledge.declare_rule",
      "knowledge.promote_fact",
      "knowledge.retire_rule",
      "knowledge.retract_edge",
      "knowledge.rules_in_force",
      "knowledge.supersede_rule",
      "knowledge.workspace_edges_for",
    ]);
  });

  it("every event_type is already dotted <engine>.<aggregate>.<past-participle>, never bare PascalCase", () => {
    const literals = [...codeNoComments.matchAll(/p_event_type\s*=>\s*'([^']+)'/g)].map((m) => m[1]);
    expect(literals.length).toBeGreaterThan(0);
    for (const value of literals) {
      expect(value, `${value} is not dotted lowercase`).toMatch(/^[a-z_]+\.[a-z_]+\.[a-z_]+$/);
    }
  });

  it("declare_rule emits knowledge.rule.declared always, and knowledge.rule.conflict_detected only when a tie exists", () => {
    const start = codeNoComments.indexOf("create or replace function knowledge.declare_rule(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/'knowledge\.rule\.declared'/);
    const conflictIdx = block.indexOf("if v_tied_count > 0 then");
    expect(conflictIdx).toBeGreaterThan(-1);
    expect(block.slice(conflictIdx)).toMatch(/'knowledge\.rule\.conflict_detected'/);
    expect(block).toMatch(/p_conflict_event_id\s+uuid,/);
  });

  it("declare_rule detects a tie as another active rule at the identical workspace/category/scope", () => {
    const start = codeNoComments.indexOf("create or replace function knowledge.declare_rule(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/r\.workspace_id = p_workspace_id/);
    expect(block).toMatch(/r\.category = p_category/);
    expect(block).toMatch(/r\.scope_type = p_scope_type/);
    expect(block).toMatch(/r\.scope_id is not distinct from p_scope_id/);
    expect(block).toMatch(/r\.status = 'active'/);
  });

  it("supersede_rule inherits workspace/category/scope from the old rule, never accepts them as new parameters", () => {
    const sigStart = codeNoComments.indexOf("create or replace function knowledge.supersede_rule(");
    const sigEnd = codeNoComments.indexOf(")", codeNoComments.indexOf("p_actor_ref", sigStart));
    const signature = codeNoComments.slice(sigStart, sigEnd);
    expect(signature).not.toMatch(/p_workspace_id/);
    expect(signature).not.toMatch(/p_category/);
    expect(signature).not.toMatch(/p_scope_type/);
    const block = codeNoComments.slice(sigStart, codeNoComments.indexOf("$$;", sigStart));
    expect(block).toMatch(/select workspace_id, category, scope_type, scope_id\s*\n\s*into v_workspace_id, v_category, v_scope_type, v_scope_id/);
    expect(block).toMatch(/insert into knowledge\.rules/);
    expect(block).toMatch(/update knowledge\.rules\s*\n\s*set status = 'superseded', superseded_by = p_new_rule_id/);
    expect(block).toMatch(/'knowledge\.rule\.superseded'/);
  });

  it("retire_rule is a one-way transition guarded by status = 'active' in its own WHERE clause", () => {
    const start = codeNoComments.indexOf("create or replace function knowledge.retire_rule(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/where id = p_rule_id and status = 'active'/);
    expect(block).toMatch(/'knowledge\.rule\.retired'/);
  });

  it("rules_in_force resolves workspace, property and location scope, and deliberately not asset_class", () => {
    const start = codeNoComments.indexOf("create or replace function knowledge.rules_in_force(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/r\.scope_type = 'workspace'/);
    expect(block).toMatch(/r\.scope_type = 'property' and r\.scope_id = p_property_id/);
    expect(block).toMatch(/property\.location_within\(p_location_id, r\.scope_id\)/);
    expect(block).not.toMatch(/asset_class/);
  });

  it("rules_in_force and declare_rule's own tie-check both exclude unconfirmed proposals — a real bug caught before Epic 17", () => {
    const forceStart = codeNoComments.indexOf("create or replace function knowledge.rules_in_force(");
    const forceBlock = codeNoComments.slice(forceStart, codeNoComments.indexOf("$$;", forceStart));
    expect(forceBlock).toMatch(/r\.status = 'active'\s*\n\s*and r\.confirmed_at is not null/);

    const declareStart = codeNoComments.indexOf("create or replace function knowledge.declare_rule(");
    const declareBlock = codeNoComments.slice(declareStart, codeNoComments.indexOf("$$;", declareStart));
    expect(declareBlock).toMatch(/r\.status = 'active'\s*\n\s*and r\.confirmed_at is not null/);
  });

  it("rules_in_force returns every row tied at the winning specificity, not a single picked winner", () => {
    const start = codeNoComments.indexOf("create or replace function knowledge.rules_in_force(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/specificity = \(select max\(specificity\) from candidates\)/);
    expect(block).toMatch(/\(select count\(\*\) from top\) > 1 as is_conflict/);
  });

  it("assert_edge and retract_edge both use subject_type = 'workspace_edge'", () => {
    const assertStart = codeNoComments.indexOf("create or replace function knowledge.assert_edge(");
    const assertBlock = codeNoComments.slice(assertStart, codeNoComments.indexOf("$$;", assertStart));
    expect(assertBlock).toMatch(/p_subject_type\s*=>\s*'workspace_edge'/);
    expect(assertBlock).toMatch(/'knowledge\.workspace_edge\.asserted'/);

    const retractStart = codeNoComments.indexOf("create or replace function knowledge.retract_edge(");
    const retractBlock = codeNoComments.slice(retractStart, codeNoComments.indexOf("$$;", retractStart));
    expect(retractBlock).toMatch(/p_subject_type\s*=>\s*'workspace_edge'/);
    expect(retractBlock).toMatch(/'knowledge\.workspace_edge\.retracted'/);
    expect(retractBlock).toMatch(/where id = p_edge_id and retracted_at is null/);
  });

  it("workspace_edges_for matches a node in either direction and excludes retracted edges", () => {
    const start = codeNoComments.indexOf("create or replace function knowledge.workspace_edges_for(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/e\.retracted_at is null/);
    expect(block).toMatch(/e\.from_type = p_node_type and e\.from_id = p_node_id/);
    expect(block).toMatch(/e\.to_type = p_node_type and e\.to_id = p_node_id/);
  });

  it("promote_fact refuses a blank population and refuses a non-existent origin edge", () => {
    const start = codeNoComments.indexOf("create or replace function knowledge.promote_fact(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/if v_origin_workspace_id is null then\s*\n\s*raise exception/);
    expect(block).toMatch(/if p_population is null or btrim\(p_population\) = '' then\s*\n\s*raise exception/);
  });

  it("promote_fact upserts both world nodes idempotently by id before inserting the edge", () => {
    const start = codeNoComments.indexOf("create or replace function knowledge.promote_fact(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    const firstNodeIdx = block.indexOf("insert into knowledge.world_nodes");
    const secondNodeIdx = block.indexOf("insert into knowledge.world_nodes", firstNodeIdx + 1);
    const edgeIdx = block.indexOf("insert into knowledge.world_edges");
    expect(firstNodeIdx).toBeGreaterThan(-1);
    expect(secondNodeIdx).toBeGreaterThan(firstNodeIdx);
    expect(edgeIdx).toBeGreaterThan(secondNodeIdx);
    expect((block.match(/on conflict \(id\) do nothing/g) || []).length).toBe(2);
  });

  it("promote_fact writes the audit record before emitting knowledge.promotion.executed, never a caller-supplied workspace column on the world rows", () => {
    const start = codeNoComments.indexOf("create or replace function knowledge.promote_fact(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    const auditIdx = block.indexOf("perform platform.write_audit_record(");
    const eventIdx = block.indexOf("perform platform.emit_event(");
    expect(auditIdx).toBeGreaterThan(-1);
    expect(eventIdx).toBeGreaterThan(auditIdx);
    expect(block).toMatch(/p_action\s*=>\s*'knowledge\.fact_promoted'/);
    expect(block).toMatch(/'knowledge\.promotion\.executed'/);
    // The two node inserts and the edge insert never reference a workspace column.
    const nodeAndEdgeBlock = block.slice(block.indexOf("insert into knowledge.world_nodes"), auditIdx);
    expect(nodeAndEdgeBlock).not.toMatch(/workspace_id/);
  });

  it("every function sets search_path to empty", () => {
    const fns = [...codeNoComments.matchAll(/create or replace function ([\w.]+)\([^)]*\)[\s\S]*?set search_path = (\S+)/gi)];
    expect(fns.length).toBe(8);
    for (const [, name, path] of fns) {
      expect(path, `${name} does not use an empty search_path`).toBe("''");
    }
  });

  it("grants every function to klussie_engine_knowledge only — no api delegate, no client grant", () => {
    expect(code).not.toMatch(/create or replace function api\./);
    expect(code).not.toMatch(/grant execute .* to authenticated/i);
    expect(code).toMatch(/to klussie_engine_knowledge/);
  });

  it("grants the exact cross-schema access this migration needs on property, named and narrow", () => {
    expect(code).toMatch(/grant usage on schema property to klussie_engine_knowledge/i);
    expect(code).toMatch(/grant select on property\.locations to klussie_engine_knowledge/i);
    expect(code).toMatch(/grant execute on function property\.location_within\(uuid, uuid\) to klussie_engine_knowledge/i);
  });
});
