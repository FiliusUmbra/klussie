// Keeps 0036_workspace_permission_vocabulary.sql inside ADR-0027 and the split ADR-0026
// established: logic in `workspace`, reachable by nothing client-facing; thin SECURITY
// DEFINER delegates in `api`. The defect this file exists to catch is the same class as
// membershipHelper.test.js's: a delegate that leaks the underlying logic's reach, or a
// permission_key that silently drifts from ADR-0027's stated twelve.
//
// Structural. Behaviour is proven against staging by
// supabase/diagnostics/VERIFY_WORKSPACE_PERMISSION_VOCABULARY.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0036_workspace_permission_vocabulary.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

const TWELVE_PERMISSIONS = [
  "workspace.rename", "workspace.settings.edit", "workspace.archive",
  "membership.invite", "membership.join.approve", "membership.role.edit",
  "membership.scope.edit", "membership.revoke", "membership.approval.manage",
  "membership.own.view", "membership.roster.view", "membership.history.view",
];

describe("0036_workspace_permission_vocabulary migration", () => {
  it("constrains permission_key to exactly ADR-0027's twelve keys", () => {
    const constraintStart = codeNoComments.indexOf("check (permission_key in (");
    const constraintEnd = codeNoComments.indexOf("))", constraintStart);
    const constraintBody = codeNoComments.slice(constraintStart, constraintEnd);
    const keys = [...constraintBody.matchAll(/'([a-z.]+)'/g)].map((m) => m[1]);
    expect(keys.sort()).toEqual([...TWELVE_PERMISSIONS].sort());
  });

  it("leaves role_name unconstrained, matching workspace.memberships.role", () => {
    // migration 0030's own reasoning: custom roles are a stated future direction (§7),
    // and a closed list here would have to be revisited the day one is created.
    const tableStart = codeNoComments.indexOf("create table if not exists workspace.role_permissions");
    const tableEnd = codeNoComments.indexOf(");", tableStart);
    const tableBody = codeNoComments.slice(tableStart, tableEnd);
    expect(tableBody).not.toMatch(/role_name[^,]*check/i);
  });

  it("keys the table naturally, with no surrogate id", () => {
    // Configuration, not an aggregate — nothing references a row by identity.
    const tableStart = codeNoComments.indexOf("create table if not exists workspace.role_permissions");
    const tableEnd = codeNoComments.indexOf(");", tableStart);
    const tableBody = codeNoComments.slice(tableStart, tableEnd);
    expect(tableBody).not.toMatch(/^\s*id\s+uuid/im);
    expect(tableBody).toMatch(/primary key \(workspace_type, role_name, permission_key\)/);
  });

  it("seeds Owner and Administrator with all twelve permissions, in every preset that has one", () => {
    for (const [type, roleName] of [
      ["personal", "Owner"], ["professional", "Owner"], ["business", "Administrator"],
    ]) {
      const rows = [...codeNoComments.matchAll(
        new RegExp(`\\('${type}', '${roleName}', '([a-z.]+)'\\)`, "g")
      )].map((m) => m[1]);
      expect(rows.sort(), `${type}/${roleName} does not hold all twelve`).toEqual(
        [...TWELVE_PERMISSIONS].sort()
      );
    }
  });

  it("seeds every role named in ADR-0027, and no others", () => {
    const seedStart = codeNoComments.indexOf("insert into workspace.role_permissions");
    const seedEnd = codeNoComments.indexOf("on conflict", seedStart);
    const seedBody = codeNoComments.slice(seedStart, seedEnd);
    const roles = new Set(
      [...seedBody.matchAll(/\('(personal|professional|business)', '([^']+)',/g)].map(
        (m) => `${m[1]}/${m[2]}`
      )
    );
    expect([...roles].sort()).toEqual(
      [
        "personal/Owner", "personal/Household member", "personal/Guest",
        "professional/Owner", "professional/Manager", "professional/Employee", "professional/Contractor",
        "business/Administrator", "business/Manager", "business/Team member",
        "business/Auditor / Viewer", "business/External provider",
      ].sort()
    );
  });

  it("seeds idempotently", () => {
    expect(code).toMatch(/on conflict \(workspace_type, role_name, permission_key\) do nothing/);
  });

  it("makes the engine logic NOT SECURITY DEFINER, and grants it to nobody", () => {
    for (const fn of ["workspace.resolve_context", "workspace.decide_permission"]) {
      const start = codeNoComments.indexOf(`create or replace function ${fn}`);
      expect(start, `${fn} not found`).toBeGreaterThan(-1);
      const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start) + 3);
      expect(block).toMatch(/\bstable\b/i);
      expect(block).not.toMatch(/\bsecurity definer\b/i);
      expect(block).toMatch(/set search_path = ''/);
    }
    expect(code).toMatch(
      /revoke all on function workspace\.resolve_context\(uuid\) from public, anon, authenticated, service_role/i
    );
    expect(code).toMatch(
      /revoke all on function workspace\.decide_permission\(uuid, text\) from public, anon, authenticated, service_role/i
    );
  });

  it("makes both delegates SECURITY DEFINER, granted to authenticated only", () => {
    for (const fn of ["api.resolve_workspace_context", "api.decide_permission"]) {
      const start = codeNoComments.indexOf(`create or replace function ${fn}`);
      expect(start, `${fn} not found`).toBeGreaterThan(-1);
      const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start) + 3);
      expect(block).toMatch(/\bstable\b/i);
      expect(block).toMatch(/\bsecurity definer\b/i);
      expect(block).toMatch(/set search_path = ''/);
    }
    expect(code).toMatch(
      /revoke all on function api\.resolve_workspace_context\(uuid\) from public, anon, service_role/i
    );
    expect(code).toMatch(
      /revoke all on function api\.decide_permission\(uuid, text\) from public, anon, service_role/i
    );
    expect(code).toMatch(/grant execute on function api\.resolve_workspace_context\(uuid\) to authenticated/i);
    expect(code).toMatch(/grant execute on function api\.decide_permission\(uuid, text\) to authenticated/i);
  });

  it("decide_permission joins with LEFT JOIN throughout, so it always returns exactly one row", () => {
    // Deny-by-default as data: a caller with no membership still gets one row back
    // (granted = false), not zero rows they would have to interpret.
    const start = codeNoComments.indexOf("create or replace function workspace.decide_permission");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start) + 3);
    expect(block).not.toMatch(/\bjoin\b(?!\s|.*left)/i);
    const joins = [...block.matchAll(/\b(left join|join)\b/gi)].map((m) => m[1].toLowerCase());
    expect(joins.every((j) => j === "left join"), "decide_permission uses a non-LEFT join").toBe(true);
  });

  it("enables RLS on role_permissions with no policy, and grants the client-facing roles nothing", () => {
    expect(code).toMatch(/alter table workspace\.role_permissions enable row level security/i);
    expect(code).not.toMatch(/create policy/i);
    expect(code).toMatch(/revoke all on workspace\.role_permissions from anon, authenticated, service_role/i);
  });

  it("touches nothing in public and creates no other table", () => {
    expect(code).not.toMatch(/\bpublic\./i);
    const tables = [...codeNoComments.matchAll(/create table/gi)];
    expect(tables).toHaveLength(1);
  });

  it("is re-runnable — table guarded, functions replaceable, seed idempotent", () => {
    expect(code).toMatch(/create table if not exists workspace\.role_permissions/i);
    const functionCreations = [...code.matchAll(/create (or replace )?function/gi)];
    const replaceable = [...code.matchAll(/create or replace function/gi)];
    expect(functionCreations).toHaveLength(replaceable.length);
  });
});
