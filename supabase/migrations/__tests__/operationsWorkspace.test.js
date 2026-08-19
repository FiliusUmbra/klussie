// Keeps 0132_operations_workspace.sql (Platform Activation Slice 0, WP 0.3; ADR-0030)
// inside its own stated rules: one internal-only capability, one workspace created
// idempotently, granted directly rather than through the contract function, with no
// founding membership row and no event emission — matching the precedent
// 0080_backfill_capability_grants.sql and 0033_backfill_personal_workspace.sql already
// set for migration-time seeding.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0132_operations_workspace.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0132_operations_workspace migration", () => {
  it("seeds exactly one capability, platform_operations, in a new 'internal' category — not one of §6.7's seven customer-facing groups", () => {
    const start = codeNoComments.indexOf("insert into platform.capabilities");
    const block = codeNoComments.slice(start, codeNoComments.indexOf(";", start) + 1);
    expect(block).toMatch(/'platform_operations'/);
    expect(block).toMatch(/'internal'/);
    // Every category §6.7 actually names, none of which this capability belongs to.
    for (const custFacing of [
      "demand_and_supply", "physical_world", "care_over_time",
      "knowledge_and_intelligence", "working_together", "commercial", "extension",
    ]) {
      expect(block).not.toMatch(new RegExp(`'${custFacing}'`));
    }
  });

  it("adds no dependency row for platform_operations — it requires no other capability", () => {
    expect(codeNoComments).not.toMatch(/capability_dependencies/);
  });

  it("creates the workspace as type='business', name='Klussie Operations' — not a new check-constraint value", () => {
    const start = codeNoComments.indexOf("insert into workspace.workspaces");
    const block = codeNoComments.slice(start, codeNoComments.indexOf(";", start) + 1);
    expect(block).toMatch(/'business'/);
    expect(block).toMatch(/'Klussie Operations'/);
  });

  it("is idempotent via not-exists guards throughout, never on conflict", () => {
    expect(codeNoComments).toMatch(/where not exists \(/);
    expect(code).not.toMatch(/on conflict/i);
  });

  it("mints every id via platform.uuid_v7_at(now()) — a fresh row, never gen_random_uuid or a hardcoded literal", () => {
    expect(codeNoComments).toMatch(/platform\.uuid_v7_at\(now\(\)\)/);
    expect(codeNoComments).not.toMatch(/gen_random_uuid/);
  });

  it("grants the capability by direct insert, never through workspace.grant_capability()", () => {
    expect(codeNoComments).toMatch(/insert into workspace\.capability_grants/);
    expect(codeNoComments).not.toMatch(/grant_capability\(/);
  });

  it("writes both the grant and its history row in one statement, via RETURNING", () => {
    expect(codeNoComments).toMatch(/with target_workspace as \(/);
    expect(codeNoComments).toMatch(/inserted as \(/);
    expect(codeNoComments).toMatch(/returning id, workspace_id, capability_key, source, granted_at, withdrawn_at/);
    expect(codeNoComments).toMatch(/from inserted i;/);
  });

  it("seeds no membership row — founding operator identity is deliberately kept out of the numbered migration sequence", () => {
    expect(codeNoComments).not.toMatch(/insert into workspace\.memberships/);
  });

  it("emits no domain event — matches the backfill precedent, not the live write path", () => {
    expect(codeNoComments).not.toMatch(/emit_event/);
  });
});
