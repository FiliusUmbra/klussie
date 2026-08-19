// Keeps 0040_backfill_property.sql inside ADR-0022 and roadmap §3.
//
// Structural. The mapping itself is proven against a real and synthetic population by
// supabase/diagnostics/VERIFY_BACKFILL_PROPERTY.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0040_backfill_property.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0040_backfill_property migration", () => {
  it("processes only personal workspaces with no property yet", () => {
    // What makes re-running a no-op. Literal value, so read from codeNoComments — the
    // string-literal-stripped `code` would only ever see ''.
    expect(codeNoComments).toMatch(/where w\.type = 'personal'/);
    expect(code).toMatch(/and w\.archived_at is null/);
    expect(code).toMatch(/not exists \(/);
    expect(code).not.toMatch(/on conflict/i);
  });

  it("checks for an existing property by steward_workspace_id, specific to this workspace", () => {
    const existsBlock = codeNoComments.slice(
      codeNoComments.indexOf("not exists ("),
      codeNoComments.indexOf(")\n)")
    );
    expect(existsBlock).toMatch(/p\.steward_workspace_id = w\.id/);
  });

  it("excludes archived workspaces", () => {
    expect(code).toMatch(/w\.archived_at is null/);
  });

  it("mints the property id from the workspace's own creation time, not now()", () => {
    // ADR-0022: a backfilled identifier sorts where it would have sorted had it been
    // minted when the workspace was created.
    const mints = [...code.matchAll(/platform\.uuid_v7_at\(([^)]+)\)/g)].map((m) => m[1]);
    expect(mints.length).toBe(1);
    expect(mints[0]).toMatch(/created_at/);
    expect(code).not.toMatch(/uuid_v7_at\(now\(\)\)/);
  });

  it("sets steward_since to the workspace's own created_at, not the backfill's own run time", () => {
    // The opening of the stewardship must date from when the workspace actually began, the
    // same reasoning migration 0033 applies to the workspace's own created_at.
    const insertBlock = codeNoComments.slice(codeNoComments.indexOf("insert into property.properties"));
    expect(insertBlock).toMatch(/select property_id, 'My Home', workspace_id, created_at, created_at, now\(\)/);
  });

  it("names the property 'My Home', matching the workspace's own backfilled name", () => {
    expect(codeNoComments).toMatch(/'My Home'/);
  });

  it("leaves stewardship_periods untouched — nothing has ever closed", () => {
    // ADR-0028: the historical log only ever holds CLOSED periods. This backfill only ever
    // opens one, so it writes to property.properties alone.
    expect(code).not.toMatch(/insert into property\.stewardship_periods/i);
  });

  it("writes nothing to public, identity or workspace", () => {
    // Step 2 of §3: the new structure is populated; every existing table is untouched.
    expect(code).not.toMatch(/\b(insert into|update|delete from)\s+public\./i);
    expect(code).not.toMatch(/\b(insert into|update|delete from)\s+identity\./i);
    expect(code).not.toMatch(/\b(insert into|update|delete from)\s+workspace\./i);
  });

  it("is a single statement — one CTE chain, not separate transactions", () => {
    const withOccurrences = [...code.matchAll(/^with candidates as \(/gim)];
    expect(withOccurrences).toHaveLength(1);
  });
});
