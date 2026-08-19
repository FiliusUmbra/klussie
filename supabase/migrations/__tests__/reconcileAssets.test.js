// Keeps RECONCILE_ASSETS.sql honest, mirroring reconcileWorkspace.test.js's concern: a
// reconciliation is a gate, and a gate has a failure mode ordinary code does not — it can
// break by passing. These assertions are about the ways it could report success while
// proving nothing, not about the ways it could error.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const RECONCILIATION = "supabase/diagnostics/RECONCILE_ASSETS.sql";

const raw = readFileSync(RECONCILIATION, "utf8");
const codeNoComments = raw
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");
const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("RECONCILE_ASSETS", () => {
  it("writes nothing", () => {
    expect(code).not.toMatch(/\b(insert into|update\s+\w|delete from|create table|alter table|drop)\b/i);
  });

  it("fails the run rather than only reporting", () => {
    expect(code).toMatch(/raise exception/);
    expect(raw).toMatch(/ON_ERROR_STOP/);
  });

  it("uses a null-safe comparison throughout, never a null-unsafe one", () => {
    expect(code).toMatch(/is distinct from/);
    expect(code).not.toMatch(/where a\.\w+\s*<>\s*hi\./);
    expect(code).not.toMatch(/where a\.\w+\s*<>\s*property\./);
  });

  function section(raw, startMarker, endMarker) {
    const start = raw.indexOf(startMarker);
    const end = endMarker ? raw.indexOf(endMarker) : raw.length;
    return raw
      .slice(start, end)
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
  }

  it("separates 'no mirror exists' from 'no property resolves' — the same restraint 0052's backfill and 0053's insert trigger take", () => {
    // A household_items row whose owner resolves to no property must never be counted as
    // a missing-mirror discrepancy — that would make this gate impossible to pass on any
    // environment with even one such row, exactly the failure mode 0052's own header warns
    // against ("reconciled against, not defended against").
    const check1 = section(raw, "1 · Every live household_items row", "2 · household_items rows whose owner");
    expect(check1).toMatch(/resolve_property_for_owner\(hi\.owner_id\) is not null/);

    const check2 = section(raw, "2 · household_items rows whose owner", "3 · Every mirrored asset");
    expect(check2).not.toMatch(/raise exception/);
  });

  it("compares every field 0053's mirror maps, not a subset", () => {
    const block = section(raw, "3 · Every mirrored asset", "4 · Every mirrored asset's property_id");
    for (const col of [
      "a.name is distinct from hi.name",
      "a.type is distinct from hi.category",
      "a.make is distinct from hi.brand",
      "a.model is distinct from hi.model",
      "a.room_label is distinct from hi.room",
      "a.photo_path is distinct from hi.photo_path",
      "a.acquired_on is distinct from hi.purchased_on",
      "a.notes is distinct from hi.notes",
      "a.source is distinct from hi.source",
      "a.ai_suggestion is distinct from hi.ai_suggestion",
    ]) {
      expect(block, `missing comparison: ${col}`).toContain(col);
    }
  });

  it("reconciles property_id against a fresh resolution, not the stored value trusting itself", () => {
    expect(codeNoComments).toMatch(
      /a\.property_id is distinct from property\.resolve_property_for_owner\(hi\.owner_id\)/
    );
  });

  it("checks that a disposed asset's source item is genuinely gone, not merely marked", () => {
    expect(codeNoComments).toMatch(/lifecycle_state = 'disposed'/);
    expect(codeNoComments).toMatch(/household_items_id is not null/);
  });

  it("reports real row counts as informational, matching RECONCILE_WORKSPACE.sql's own restraint", () => {
    expect(raw).toMatch(/real row counts/i);
    expect(codeNoComments).toMatch(/if v_total < 10 then/);
  });

  it("reuses the shared resolver from 0053 rather than re-deriving the join inline", () => {
    // The whole point of factoring property.resolve_property_for_owner() in 0053 was so
    // this diagnostic and the insert trigger share one definition. A reconciliation that
    // re-implemented the five-way join here would not actually prove the mirror agrees with
    // the rule — it would only prove two copies of the rule agree with each other.
    expect(code).not.toMatch(/join workspace\.memberships/i);
    expect(code).not.toMatch(/join workspace\.workspaces/i);
    expect(codeNoComments.match(/property\.resolve_property_for_owner/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
