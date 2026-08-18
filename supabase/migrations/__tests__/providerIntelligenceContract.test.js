// Keeps 0120_provider_intelligence_contract.sql inside its own stated rules: event_type
// minted correctly from the start, select_provider() verifying against what was actually
// recommended while override_recommendation() deliberately does not, and a required,
// non-blank override reason.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0120_provider_intelligence_contract.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0120_provider_intelligence_contract migration", () => {
  it("defines exactly four functions, all in work, none in api", () => {
    const created = [...codeNoComments.matchAll(/create or replace function (work\.\w+|api\.\w+)\(/g)].map((m) => m[1]);
    expect(created.sort()).toEqual([
      "work.override_recommendation",
      "work.produce_recommendation",
      "work.provider_decisions_for",
      "work.select_provider",
    ]);
  });

  it("every event_type is already dotted <engine>.<aggregate>.<past-participle>, never bare PascalCase", () => {
    const literals = [...codeNoComments.matchAll(/p_event_type\s*=>\s*'([^']+)'/g)].map((m) => m[1]);
    expect(literals.length).toBeGreaterThan(0);
    for (const value of literals) {
      expect(value, `${value} is not dotted lowercase`).toMatch(/^[a-z_]+\.[a-z_]+\.[a-z_]+$/);
    }
  });

  it("produce_recommendation inserts then emits provider_intelligence.recommendation.produced", () => {
    const start = codeNoComments.indexOf("create or replace function work.produce_recommendation(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/insert into work\.provider_decisions/);
    expect(block).toMatch(/'provider_intelligence\.recommendation\.produced'/);
  });

  it("select_provider verifies the chosen provider actually appears in recommended_providers", () => {
    const start = codeNoComments.indexOf("create or replace function work.select_provider(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/exists \(\s*\n\s*select 1 from jsonb_array_elements\(recommended_providers\) r/);
    expect(block).toMatch(/if not v_was_recommended then/);
    expect(block).toMatch(/'provider_intelligence\.recommendation\.provider_selected'/);
  });

  it("select_provider and override_recommendation both refuse a decision that already has an outcome", () => {
    for (const fn of ["select_provider", "override_recommendation"]) {
      const start = codeNoComments.indexOf(`create or replace function work.${fn}(`);
      const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
      expect(block, `${fn} missing precondition`).toMatch(/where id = p_decision_id and decided_at is null and overridden_at is null/);
    }
  });

  it("override_recommendation requires a non-blank reason and never checks recommended_providers", () => {
    const start = codeNoComments.indexOf("create or replace function work.override_recommendation(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/if p_reason is null or btrim\(p_reason\) = '' then/);
    expect(block).not.toMatch(/jsonb_array_elements/);
    expect(block).toMatch(/'provider_intelligence\.recommendation\.overridden'/);
  });

  it("provider_decisions_for orders newest first", () => {
    const start = codeNoComments.indexOf("create or replace function work.provider_decisions_for(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/order by d\.recommended_at desc/);
  });

  it("grants no new cross-schema access — klussie_engine_work already reaches everything this contract needs", () => {
    expect(code).not.toMatch(/grant usage on schema/i);
    expect(code).not.toMatch(/grant select on \w+\.\w+ to klussie_engine_work/i);
  });

  it("every function sets search_path to empty", () => {
    const fns = [...codeNoComments.matchAll(/create or replace function ([\w.]+)\([^)]*\)[\s\S]*?set search_path = (\S+)/gi)];
    expect(fns.length).toBe(4);
    for (const [, name, path] of fns) {
      expect(path, `${name} does not use an empty search_path`).toBe("''");
    }
  });

  it("grants every function to klussie_engine_work only — no api delegate, no client grant", () => {
    expect(code).not.toMatch(/create or replace function api\./);
    expect(code).not.toMatch(/grant execute .* to authenticated/i);
    expect(code).toMatch(/to klussie_engine_work/);
  });
});
