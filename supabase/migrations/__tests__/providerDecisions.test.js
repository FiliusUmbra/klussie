// Keeps 0118_provider_decisions.sql inside §29/§36 finding 2's own rules: an aggregate
// (not a projection, which stays unbuilt), explainability captured with the
// recommendation, and selected/overridden as mutually exclusive one-way outcomes.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0118_provider_decisions.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0118_provider_decisions migration", () => {
  it("creates exactly one table, in work", () => {
    const created = [...code.matchAll(/create table if not exists (work\.\w+)/gi)].map((m) => m[1]);
    expect(created).toEqual(["work.provider_decisions"]);
  });

  it("requires non-empty recommended_providers", () => {
    const start = code.indexOf("create table if not exists work.provider_decisions");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/recommended_providers\s+jsonb\s+not null/);
    expect(block).toMatch(/check \(jsonb_array_length\(recommended_providers\) > 0\)/);
  });

  it("selected_provider and decided_at are paired, both null or both set", () => {
    const start = code.indexOf("create table if not exists work.provider_decisions");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/check \(\(selected_provider is null\) = \(decided_at is null\)\)/);
  });

  it("overridden_provider, override_reason and overridden_at are all paired together", () => {
    const start = code.indexOf("create table if not exists work.provider_decisions");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/\(overridden_provider is null\) = \(overridden_at is null\)/);
    expect(block).toMatch(/\(override_reason is null\) = \(overridden_at is null\)/);
  });

  it("selected and overridden are mutually exclusive — never both set", () => {
    const start = code.indexOf("create table if not exists work.provider_decisions");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/check \(not \(decided_at is not null and overridden_at is not null\)\)/);
  });

  it("subject_type/subject_id carry no foreign key — polymorphic, matching platform.events' own posture", () => {
    const start = code.indexOf("create table if not exists work.provider_decisions");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/subject_type\s+text\s+not null/);
    expect(block).toMatch(/subject_id\s+uuid\s+not null/);
    expect(block).not.toMatch(/subject_id.*references/);
  });

  it("the guard trigger freezes every column except the two outcome pairs, each one-way", () => {
    expect(codeNoComments).toMatch(/provider_decisions_guard_mutation/);
    const guardStart = codeNoComments.indexOf("if tg_op = 'UPDATE' then");
    const guardBlock = codeNoComments.slice(guardStart, codeNoComments.indexOf("return coalesce", guardStart));
    for (const col of ["id", "workspace_id", "subject_type", "subject_id", "recommended_providers", "recommended_at", "actor_type", "actor_ref"]) {
      expect(guardBlock, `guard does not check ${col}`).toMatch(new RegExp(`new\\.${col} is distinct from old\\.${col}`));
    }
    expect(guardBlock).toMatch(/old\.decided_at is not null and new\.decided_at is distinct from old\.decided_at/);
    expect(guardBlock).toMatch(/old\.overridden_at is not null and new\.overridden_at is distinct from old\.overridden_at/);
  });

  it("rejects delete unconditionally", () => {
    expect(codeNoComments).toMatch(/if tg_op = 'DELETE' then\s*\n\s*raise exception/);
    expect(codeNoComments).toMatch(/before update or delete on work\.provider_decisions/);
  });

  it("grants UPDATE, never DELETE, revokes client roles, adds no policy here", () => {
    expect(code).toMatch(/grant update on work\.provider_decisions to klussie_engine_work/i);
    expect(code).not.toMatch(/grant delete/i);
    expect(code).toMatch(/revoke all on work\.provider_decisions from anon, authenticated, service_role/i);
    expect(code).not.toMatch(/create policy/i);
  });
});
