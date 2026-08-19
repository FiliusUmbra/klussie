// Keeps 0079_capability_contract.sql inside ADR-0022 (no server-side id minting for
// ongoing runtime rows — grant_capability() never auto-cascades, exactly one grant per
// call, every identifier supplied by the caller) and §6.2's mirror rules for grant and
// withdraw.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0079_capability_contract.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0079_capability_contract migration", () => {
  it("defines exactly four functions, all in workspace, none in api", () => {
    const created = [...codeNoComments.matchAll(/create or replace function (workspace\.\w+|api\.\w+)\(/g)].map((m) => m[1]);
    expect(created.sort()).toEqual([
      "workspace.grant_capability",
      "workspace.withdraw_capability",
      "workspace.workspace_capabilities",
      "workspace.workspace_has_capability",
    ]);
  });

  it("never calls gen_random_uuid or uuid_v7_at — every identifier is a required parameter", () => {
    expect(codeNoComments).not.toMatch(/gen_random_uuid/);
    expect(codeNoComments).not.toMatch(/uuid_v7_at/);
    const start = codeNoComments.indexOf("create or replace function workspace.grant_capability(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("returns void", start));
    expect(block).toMatch(/p_grant_id\s+uuid,/);
    expect(block).toMatch(/p_history_id\s+uuid,/);
    expect(block).not.toMatch(/uuid\s+default/);
  });

  it("grant_capability refuses if already held, before touching the dependency check", () => {
    const start = codeNoComments.indexOf("create or replace function workspace.grant_capability(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    const alreadyHeldIdx = block.indexOf("already holds");
    const dependencyIdx = block.indexOf("requires_capability_key into v_missing_dependency");
    expect(alreadyHeldIdx).toBeGreaterThan(-1);
    expect(dependencyIdx).toBeGreaterThan(alreadyHeldIdx);
  });

  it("grant_capability refuses a missing dependency rather than auto-granting it", () => {
    const start = codeNoComments.indexOf("create or replace function workspace.grant_capability(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/from platform\.capability_dependencies cd/);
    expect(block).toMatch(/if v_missing_dependency is not null then\s*\n\s*raise exception/);
    // Never inserts more than one row into capability_grants per call.
    const insertCount = (block.match(/insert into workspace\.capability_grants/g) || []).length;
    expect(insertCount).toBe(1);
  });

  it("grant_capability inserts the grant then its history row, then emits exactly one capability.capability_grant.granted", () => {
    const start = codeNoComments.indexOf("create or replace function workspace.grant_capability(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    const grantIdx = block.indexOf("insert into workspace.capability_grants");
    const historyIdx = block.indexOf("insert into workspace.capability_grant_history");
    const eventIdx = block.indexOf("perform platform.emit_event");
    expect(historyIdx).toBeGreaterThan(grantIdx);
    expect(eventIdx).toBeGreaterThan(historyIdx);
    expect((block.match(/perform platform\.emit_event\(/g) || []).length).toBe(1);
    expect(block).toMatch(/'capability\.capability_grant\.granted'/);
  });

  it("withdraw_capability refuses if not currently held, and checks for a blocking dependent before mutating anything", () => {
    const start = codeNoComments.indexOf("create or replace function workspace.withdraw_capability(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/does not currently hold/);
    expect(block).toMatch(/requires_capability_key = p_capability_key/);
    const blockingCheckIdx = block.indexOf("v_blocking_key is not null");
    const updateIdx = block.indexOf("update workspace.capability_grants");
    expect(blockingCheckIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(blockingCheckIdx);
  });

  it("withdraw_capability sets withdrawn_at, records history, and emits exactly one capability.capability_grant.withdrawn", () => {
    const start = codeNoComments.indexOf("create or replace function workspace.withdraw_capability(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/set withdrawn_at = now\(\)/);
    expect((block.match(/perform platform\.emit_event\(/g) || []).length).toBe(1);
    expect(block).toMatch(/'capability\.capability_grant\.withdrawn'/);
  });

  it("workspace_capabilities and workspace_has_capability both filter on withdrawn_at is null", () => {
    for (const fn of ["workspace_capabilities", "workspace_has_capability"]) {
      const start = codeNoComments.indexOf(`create or replace function workspace.${fn}(`);
      const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
      expect(block).toMatch(/withdrawn_at is null/);
    }
  });

  it("every function sets search_path to empty", () => {
    const fns = [...codeNoComments.matchAll(/create or replace function ([\w.]+)\([^)]*\)[\s\S]*?set search_path = (\S+)/gi)];
    expect(fns.length).toBe(4);
    for (const [, name, path] of fns) {
      expect(path, `${name} does not use an empty search_path`).toBe("''");
    }
  });

  it("grants every function to klussie_engine_workspace only — no api delegate, no authenticated/anon grant", () => {
    const grants = [...code.matchAll(/grant execute on function (workspace\.\w+)\([^)]*\)\s*\n\s*to (\w+)/g)];
    expect(grants.length).toBe(4);
    for (const [, , role] of grants) {
      expect(role).toBe("klussie_engine_workspace");
    }
    expect(code).not.toMatch(/create or replace function api\./);
    expect(code).not.toMatch(/grant execute .* to authenticated/i);
  });

  it("revokes all four functions from public, anon, authenticated and service_role before granting", () => {
    const revokes = [...code.matchAll(/revoke all on function (workspace\.\w+)\([^)]*\)\s*\n\s*from public, anon, authenticated, service_role/g)];
    expect(revokes.length).toBe(4);
  });
});
