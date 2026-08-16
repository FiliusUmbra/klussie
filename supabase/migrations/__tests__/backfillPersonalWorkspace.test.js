// Keeps 0033_backfill_personal_workspace.sql inside ADR-0022 and roadmap §3.
//
// Structural. The mapping itself is proven against a real and synthetic population by
// supabase/diagnostics/VERIFY_BACKFILL_PERSONAL_WORKSPACE.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0033_backfill_personal_workspace.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

// String literals additionally stripped, for checks that only need structure. Checks that
// need to read an actual literal value ('personal', 'owner', 'active') use codeNoComments
// instead — stripping string literals would destroy exactly the value being inspected.
const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0033_backfill_personal_workspace migration", () => {
  it("processes only identities with no personal owner membership yet", () => {
    // What makes re-running a no-op. `not exists` rather than `on conflict do nothing`,
    // for the same reason as 0026's identity backfill: the latter would also swallow a
    // unique violation from an unrelated cause.
    expect(code).toMatch(
      /where i\.erased_at is null\s+and not exists \(/
    );
    expect(code).not.toMatch(/on conflict/i);
  });

  it("mints both the workspace id and the membership id from the row's own creation time", () => {
    // ADR-0022's substantive half: created_at, not now(), so a backfilled identifier sorts
    // where it would have sorted had it been minted when the identity was created.
    const mints = [...code.matchAll(/platform\.uuid_v7_at\(([^)]+)\)/g)].map((m) => m[1]);
    expect(mints.length).toBe(2); // workspace id, membership id
    for (const arg of mints) {
      expect(arg, `uuid_v7_at called with ${arg}, expected a created_at reference`).toMatch(
        /created_at/
      );
    }
    expect(code).not.toMatch(/uuid_v7_at\(now\(\)\)/);
  });

  it("mints the workspace id once and reuses it for both the workspace and the membership", () => {
    // Not two independent calls that could disagree — one CTE column, referenced twice.
    const insertedWorkspacesBlock = codeNoComments.slice(
      codeNoComments.indexOf("inserted_workspaces as"),
      codeNoComments.indexOf("insert into workspace.memberships")
    );
    expect(insertedWorkspacesBlock).toMatch(/select workspace_id, 'personal',/);
    const membershipInsert = codeNoComments.slice(
      codeNoComments.indexOf("insert into workspace.memberships")
    );
    expect(membershipInsert).toMatch(/c\.workspace_id/);
  });

  it("excludes erased identities", () => {
    // §11.4: an erased identity resolves to nothing. Manufacturing a workspace nobody can
    // ever authenticate into would be structure with no path to it.
    expect(code).toMatch(/i\.erased_at is null/);
  });

  it("creates the workspace as type personal, and the membership as role owner, state active", () => {
    expect(codeNoComments).toMatch(/'personal'/);
    expect(codeNoComments).toMatch(/'owner'/);
    expect(codeNoComments).toMatch(/'active'/);
  });

  it("checks for an existing membership joined to a personal workspace, not any workspace", () => {
    // The idempotency check must be specific to type = 'personal' — otherwise a person who
    // already has a Professional Workspace (WP 03.04, a later package) would be skipped
    // here by mistake.
    const existsBlock = codeNoComments.slice(
      codeNoComments.indexOf("not exists ("),
      codeNoComments.indexOf(")\n),")
    );
    expect(existsBlock).toMatch(/w\.type = 'personal'/);
    expect(existsBlock).toMatch(/m\.role = 'owner'/);
  });

  it("writes nothing to public or identity", () => {
    // Step 2 of §3: the new structure is populated; every existing table is untouched.
    expect(code).not.toMatch(/\b(insert into|update|delete from)\s+public\./i);
    expect(code).not.toMatch(/\b(insert into|update|delete from)\s+identity\./i);
  });

  it("is a single statement — one CTE chain, not separate transactions", () => {
    // A workspace with no owner membership is unreachable; minting them apart risks a
    // window where one exists without the other. One `with` clause, ending in one insert.
    const withOccurrences = [...code.matchAll(/^with candidates as \(/gim)];
    expect(withOccurrences).toHaveLength(1);
  });
});
