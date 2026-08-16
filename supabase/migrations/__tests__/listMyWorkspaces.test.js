// Keeps 0038_list_my_workspaces.sql inside ADR-0026's split and away from the one thing it
// must never become: a second isolation predicate. The defects this file exists to catch:
//
//   · workspace.list_my_workspaces() or its delegate ending up referenced by an RLS policy
//     — the object this migration builds is for display, and 0031's isolation predicate
//     (api.current_workspace_memberships()) must stay the only thing any policy calls.
//   · The delegate losing its SECURITY DEFINER/STABLE/locked-search_path shape, the same
//     three properties every prior migration in this pattern (0028, 0031, 0036) required.
//
// Structural, like every migration test in this repository (docs/engineering/TESTING.md
// §3). Behaviour is proven against staging by VERIFY_LIST_MY_WORKSPACES.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0038_list_my_workspaces.sql";

const rawCode = readFileSync(MIGRATION, "utf8");
const code = rawCode
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n")
  .replace(/'(?:[^']|'')*'/g, "''");

describe("0038_list_my_workspaces migration", () => {
  it("returns type and name alongside the membership columns", () => {
    const logicStart = code.indexOf("create or replace function workspace.list_my_workspaces");
    expect(logicStart).toBeGreaterThan(-1);
    const logicBlock = code.slice(logicStart, code.indexOf("$$;", logicStart) + 3);

    expect(logicBlock).toMatch(/membership_id\s+uuid/i);
    expect(logicBlock).toMatch(/workspace_id\s+uuid/i);
    expect(logicBlock).toMatch(/workspace_type\s+text/i);
    expect(logicBlock).toMatch(/workspace_name\s+text/i);
  });

  it("excludes archived workspaces", () => {
    const logicStart = code.indexOf("create or replace function workspace.list_my_workspaces");
    const logicBlock = code.slice(logicStart, code.indexOf("$$;", logicStart) + 3);
    expect(logicBlock).toMatch(/archived_at is null/i);
  });

  it("reuses workspace.current_memberships() rather than re-querying memberships directly", () => {
    const logicStart = code.indexOf("create or replace function workspace.list_my_workspaces");
    const logicBlock = code.slice(logicStart, code.indexOf("$$;", logicStart) + 3);
    expect(logicBlock).toMatch(/from workspace\.current_memberships\(\) m/i);
    expect(logicBlock).not.toMatch(/from workspace\.memberships\b/i);
  });

  it("makes the delegate SECURITY DEFINER and STABLE, with a locked search_path", () => {
    const delegateStart = code.indexOf("create or replace function api.list_my_workspaces");
    expect(delegateStart).toBeGreaterThan(-1);
    const delegateBlock = code.slice(delegateStart, code.indexOf("$$;", delegateStart) + 3);

    expect(delegateBlock).toMatch(/\bstable\b/i);
    expect(delegateBlock).toMatch(/\bsecurity definer\b/i);
    expect(delegateBlock).toMatch(/set search_path = ''/);
  });

  it("makes the logic function NOT SECURITY DEFINER, and grants it to nobody", () => {
    const logicStart = code.indexOf("create or replace function workspace.list_my_workspaces");
    const logicBlock = code.slice(logicStart, code.indexOf("$$;", logicStart) + 3);
    expect(logicBlock).not.toMatch(/\bsecurity definer\b/i);

    expect(code).toMatch(
      /revoke all on function workspace\.list_my_workspaces\(\) from public, anon, authenticated, service_role/i
    );
  });

  it("revokes the delegate from anon and service_role, grants only authenticated", () => {
    expect(code).toMatch(/revoke all on function api\.list_my_workspaces\(\) from public, anon, service_role/i);
    expect(code).toMatch(/grant execute on function api\.list_my_workspaces\(\) to authenticated/i);
  });

  it("delegates to the engine logic and holds no logic of its own", () => {
    const delegateStart = code.indexOf("create or replace function api.list_my_workspaces");
    const delegateBlock = code.slice(delegateStart, code.indexOf("$$;", delegateStart) + 3);
    expect(delegateBlock).toMatch(/select \* from workspace\.list_my_workspaces\(\)/i);
  });

  it("is never referenced by an RLS policy — it is not the isolation predicate", () => {
    // The one regression this migration must never become. 0031's api.current_workspace_
    // memberships() stays the only object any "create policy" clause anywhere references.
    expect(code).not.toMatch(/create policy/i);
  });
});
