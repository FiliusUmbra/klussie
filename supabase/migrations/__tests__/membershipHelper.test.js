// Keeps 0031_membership_helper.sql inside ADR-0026's decision, including the correction
// found while building it: the delegate must be PARAMETERLESS, or it cannot achieve the
// once-per-statement evaluation ADR-0024 requires as an acceptance condition rather than a
// preference.
//
// The defect this file exists to catch is specific and easy to reintroduce: a future edit
// adding `api.is_workspace_member(uuid)` — or any client-facing function in this schema
// that takes a workspace id, a location id, or any other row-varying argument — silently
// reproduces the "correlated subquery per row" failure SUPABASE_ARCHITECTURE.md §20 names
// as the platform's most likely catastrophic degradation. STABLE does not prevent it; only
// the parameterless shape does (ADR-0026 "As implemented").
//
// Structural, like every migration test in this repository (docs/engineering/TESTING.md
// §3). Behaviour and grants are proven against staging by VERIFY_MEMBERSHIP_HELPER.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0031_membership_helper.sql";

const rawCode = readFileSync(MIGRATION, "utf8");
const code = rawCode
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n")
  .replace(/'(?:[^']|'')*'/g, "''");

describe("0031_membership_helper migration", () => {
  it("creates the api schema guardedly", () => {
    expect(code).toMatch(/create schema if not exists api/i);
  });

  it("grants USAGE on api to authenticated only", () => {
    expect(code).toMatch(/grant usage on schema api to authenticated/i);
    for (const role of ["anon", "service_role"]) {
      expect(code).not.toMatch(new RegExp(`grant usage on schema api to[^;]*\\b${role}\\b`, "i"));
    }
  });

  it("never defines is_workspace_member as an executable object", () => {
    // The exact shape this package rejected. Checked against the stripped code, not the
    // raw file: this migration's own header explains *why* is_workspace_member was
    // rejected, by name, in prose — the regression guard is that the name never appears
    // in executable DDL, not that it is absent from the file's explanation of itself.
    expect(code).not.toMatch(/is_workspace_member/i);
  });

  it("makes the client-facing delegate parameterless", () => {
    // The whole fix: current_workspace_memberships() with empty parentheses, so it depends
    // on nothing but auth.uid() — constant for one statement — and can be used as an
    // uncorrelated subquery. A version taking an argument would reintroduce the defect.
    expect(code).toMatch(/create or replace function api\.current_workspace_memberships\(\s*\)/i);
  });

  it("makes the delegate SECURITY DEFINER and STABLE, with a locked search_path", () => {
    const delegateStart = code.indexOf("create or replace function api.current_workspace_memberships");
    expect(delegateStart).toBeGreaterThan(-1);
    const delegateBlock = code.slice(delegateStart, code.indexOf("$$;", delegateStart) + 3);

    expect(delegateBlock).toMatch(/\bstable\b/i);
    expect(delegateBlock).toMatch(/\bsecurity definer\b/i);
    expect(delegateBlock).toMatch(/set search_path = ''/);
  });

  it("makes the engine logic NOT SECURITY DEFINER, and grants it to nobody", () => {
    // workspace.current_memberships() is reachable only as a nested call from inside the
    // delegate's SECURITY DEFINER context — it must not be independently callable, or the
    // whole point of keeping engine logic out of a client-reachable schema is defeated.
    const logicStart = code.indexOf("create or replace function workspace.current_memberships");
    expect(logicStart).toBeGreaterThan(-1);
    const logicBlock = code.slice(logicStart, code.indexOf("$$;", logicStart) + 3);

    expect(logicBlock).toMatch(/\bstable\b/i);
    expect(logicBlock).not.toMatch(/\bsecurity definer\b/i);
    expect(logicBlock).toMatch(/set search_path = ''/);

    expect(code).toMatch(
      /revoke all on function workspace\.current_memberships\(\) from public, anon, authenticated, service_role/i
    );
  });

  it("delegates to the engine logic and holds no logic of its own", () => {
    const delegateStart = code.indexOf("create or replace function api.current_workspace_memberships");
    const delegateBlock = code.slice(delegateStart, code.indexOf("$$;", delegateStart) + 3);

    expect(delegateBlock).toMatch(/select \* from workspace\.current_memberships\(\)/i);
    // No filtering, joining or business logic in the delegate itself — the split ADR-0026
    // requires, checked by making sure the delegate's body is exactly the pass-through.
    expect(delegateBlock).not.toMatch(/\bjoin\b/i);
    expect(delegateBlock).not.toMatch(/\bwhere\b/i);
  });

  it("revokes the delegate explicitly, by name, rather than trusting a default", () => {
    // ADR-0026 property 4: verified rather than assumed. Epic 02 found Supabase's default
    // privileges on `public` grant new functions to anon BY NAME, surviving `revoke ...
    // from public`. `api` is not documented to inherit that default, but the explicit
    // revoke is written regardless.
    expect(code).toMatch(
      /revoke all on function api\.current_workspace_memberships\(\) from public, anon, service_role/i
    );
    expect(code).toMatch(
      /grant execute on function api\.current_workspace_memberships\(\) to authenticated/i
    );
  });

  it("touches nothing in public and creates no table", () => {
    expect(code).not.toMatch(/\bpublic\./i);
    expect(code).not.toMatch(/\bcreate table\b/i);
  });

  it("is re-runnable — schema and both functions use the guarded or replaceable form", () => {
    expect(code).toMatch(/create schema if not exists api/i);
    const functionCreations = [...code.matchAll(/create (or replace )?function/gi)];
    const replaceable = [...code.matchAll(/create or replace function/gi)];
    expect(functionCreations).toHaveLength(replaceable.length);
  });
});
