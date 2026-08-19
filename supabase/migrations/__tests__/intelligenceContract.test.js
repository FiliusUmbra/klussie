// Keeps 0114_intelligence_contract.sql inside its own stated rules: event_type minted
// correctly from the start, propose/confirm/reject completing the lifecycle Epic 16
// deliberately left open, reject_proposed_rule() composing retire_rule() rather than
// duplicating it, and publish_memory_version() resolving its event's workspace_id live.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0114_intelligence_contract.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0114_intelligence_contract migration", () => {
  it("defines exactly nine functions, all in knowledge, none in api", () => {
    const created = [...codeNoComments.matchAll(/create or replace function (knowledge\.\w+|api\.\w+)\(/g)].map((m) => m[1]);
    expect(created.sort()).toEqual([
      "knowledge.confirm_proposed_rule",
      "knowledge.current_property_memory",
      "knowledge.generate_summary",
      "knowledge.propose_asset",
      "knowledge.propose_prediction",
      "knowledge.propose_rule",
      "knowledge.publish_memory_version",
      "knowledge.record_recommendation",
      "knowledge.reject_proposed_rule",
    ]);
  });

  it("every event_type is already dotted <engine>.<aggregate>.<past-participle>, never bare PascalCase", () => {
    const literals = [...codeNoComments.matchAll(/p_event_type\s*=>\s*'([^']+)'/g)].map((m) => m[1]);
    expect(literals.length).toBeGreaterThan(0);
    for (const value of literals) {
      expect(value, `${value} is not dotted lowercase`).toMatch(/^[a-z_]+\.[a-z_]+\.[a-z_]+$/);
    }
  });

  it("propose_rule inserts with origin = 'proposed' and confirmed_at null, and emits knowledge.rule.proposed", () => {
    const start = codeNoComments.indexOf("create or replace function knowledge.propose_rule(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/'proposed', null/);
    expect(block).toMatch(/'knowledge\.rule\.proposed'/);
  });

  it("confirm_proposed_rule refuses a non-proposal and an already-confirmed rule, then emits knowledge.rule.declared", () => {
    const start = codeNoComments.indexOf("create or replace function knowledge.confirm_proposed_rule(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/if v_origin <> 'proposed' then/);
    expect(block).toMatch(/where id = p_rule_id and confirmed_at is null/);
    expect(block).toMatch(/if not v_updated then/);
    expect(block).toMatch(/'knowledge\.rule\.declared'/);
  });

  it("reject_proposed_rule verifies an unconfirmed proposal, then composes retire_rule() rather than duplicating it", () => {
    const start = codeNoComments.indexOf("create or replace function knowledge.reject_proposed_rule(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/if v_origin <> 'proposed' or v_confirmed_at is not null then/);
    expect(block).toMatch(/perform knowledge\.retire_rule\(p_rule_id, p_event_id, p_correlation_id, p_actor_type, p_actor_ref\)/);
    expect(block).not.toMatch(/update knowledge\.rules/);
    expect(block).not.toMatch(/perform platform\.emit_event/);
  });

  it("publish_memory_version resolves the event's workspace_id from the property's current steward, never a caller-supplied value", () => {
    const sigStart = codeNoComments.indexOf("create or replace function knowledge.publish_memory_version(");
    const sigEnd = codeNoComments.indexOf(")", codeNoComments.indexOf("p_actor_ref", sigStart));
    const signature = codeNoComments.slice(sigStart, sigEnd);
    expect(signature).not.toMatch(/p_workspace_id/);
    const start = sigStart;
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/select steward_workspace_id into v_workspace_id\s*\n\s*from property\.properties/);
    expect(block).toMatch(/p_workspace_id\s*=>\s*v_workspace_id/);
    expect(block).toMatch(/p_subject_type\s*=>\s*'property'/);
    expect(block).toMatch(/'knowledge\.memory\.version_published'/);
  });

  it("current_property_memory returns only the latest version, self-enforced through live stewardship", () => {
    const start = codeNoComments.indexOf("create or replace function knowledge.current_property_memory(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/join workspace\.current_memberships\(\) m on m\.workspace_id = p\.steward_workspace_id/);
    expect(block).toMatch(/order by mv\.published_at desc\s*\n\s*limit 1/);
  });

  it("propose_asset's subject is the property, never a not-yet-real asset", () => {
    const start = codeNoComments.indexOf("create or replace function knowledge.propose_asset(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/p_subject_type\s*=>\s*'property'/);
    expect(block).toMatch(/p_subject_id\s*=>\s*p_property_id/);
    expect(block).toMatch(/'knowledge\.asset\.proposed'/);
  });

  it("record_recommendation, propose_prediction and generate_summary carry no dedicated table — pure event emission", () => {
    for (const [fn, eventType] of [
      ["record_recommendation", "knowledge.recommendation.made"],
      ["propose_prediction", "knowledge.prediction.proposed"],
      ["generate_summary", "knowledge.summary.generated"],
    ]) {
      const start = codeNoComments.indexOf(`create or replace function knowledge.${fn}(`);
      const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
      expect(block).not.toMatch(/insert into/);
      expect(block).toMatch(new RegExp(`'${eventType.replace(/\./g, "\\.")}'`));
    }
  });

  it("every function sets search_path to empty", () => {
    const fns = [...codeNoComments.matchAll(/create or replace function ([\w.]+)\([^)]*\)[\s\S]*?set search_path = (\S+)/gi)];
    expect(fns.length).toBe(9);
    for (const [, name, path] of fns) {
      expect(path, `${name} does not use an empty search_path`).toBe("''");
    }
  });

  it("grants every function to klussie_engine_knowledge only — no api delegate, no client grant", () => {
    expect(code).not.toMatch(/create or replace function api\./);
    expect(code).not.toMatch(/grant execute .* to authenticated/i);
    expect(code).toMatch(/to klussie_engine_knowledge/);
  });

  it("grants exactly the one new cross-schema read this migration needs — SELECT on property.properties", () => {
    expect(code).toMatch(/grant select on property\.properties to klussie_engine_knowledge/i);
  });
});
