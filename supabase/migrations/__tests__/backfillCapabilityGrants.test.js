// Keeps 0080_backfill_capability_grants.sql idempotent (roadmap §3: "a backfill that can
// only be run once is a backfill that cannot be trusted"), inserting directly rather
// than through the contract function, and backdated to each workspace's own created_at.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0080_backfill_capability_grants.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0080_backfill_capability_grants migration", () => {
  it("maps workspace.type directly to preset_key — no lookup table, no CASE expression", () => {
    expect(codeNoComments).toMatch(/join platform\.capability_preset_grants pg on pg\.preset_key = w\.type/);
    expect(codeNoComments).not.toMatch(/case when/i);
  });

  it("is idempotent via a not-exists guard, not on conflict — capability_grants has no unique constraint to target", () => {
    expect(codeNoComments).toMatch(/where not exists \(/);
    expect(code).not.toMatch(/on conflict/i);
  });

  it("mints every id via platform.uuid_v7_at, never gen_random_uuid", () => {
    expect(codeNoComments).toMatch(/platform\.uuid_v7_at\(tg\.created_at\)/);
    expect(codeNoComments).toMatch(/platform\.uuid_v7_at\(i\.granted_at\)/);
    expect(codeNoComments).not.toMatch(/gen_random_uuid/);
  });

  it("backdates granted_at (and the history row's changed_at) to the workspace's own created_at, not now()", () => {
    const grantsStart = codeNoComments.indexOf("insert into workspace.capability_grants");
    const grantsBlock = codeNoComments.slice(grantsStart, codeNoComments.indexOf("returning", grantsStart));
    expect(grantsBlock).toMatch(/tg\.created_at/);
    expect(grantsBlock).not.toMatch(/\bnow\(\)/);

    const historyStart = codeNoComments.indexOf("insert into workspace.capability_grant_history");
    const historyBlock = codeNoComments.slice(historyStart);
    expect(historyBlock).toMatch(/i\.granted_at, i\.withdrawn_at, i\.granted_at/);
  });

  it("writes both tables in one statement — the grant CTE feeds the history insert via RETURNING", () => {
    expect(codeNoComments).toMatch(/with target_grants as \(/);
    expect(codeNoComments).toMatch(/inserted as \(/);
    expect(codeNoComments).toMatch(/returning id, workspace_id, capability_key, source, granted_at, withdrawn_at/);
    expect(codeNoComments).toMatch(/from inserted i;/);
  });

  it("does not call workspace.grant_capability() — direct insert, per this migration's own header", () => {
    expect(codeNoComments).not.toMatch(/grant_capability\(/);
  });
});
