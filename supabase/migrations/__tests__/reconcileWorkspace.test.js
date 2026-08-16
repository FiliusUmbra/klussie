// Keeps RECONCILE_WORKSPACE.sql honest, mirroring reconcileIdentity.test.js's concern: a
// reconciliation is a gate, and a gate has a failure mode ordinary code does not — it can
// break by passing. These assertions are about the ways it could report success while
// proving nothing, not about the ways it could error.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const RECONCILIATION = "supabase/diagnostics/RECONCILE_WORKSPACE.sql";

const raw = readFileSync(RECONCILIATION, "utf8");
const codeNoComments = raw
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

// String literals additionally stripped, for checks that only need structure. Checks that
// need to read an actual literal value ('professional', 'personal', 'owner', or the
// `workspace_id is null` text inside a format() string) use codeNoComments instead.
const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

const TABLES = [
  "pro_profiles", "pro_stats", "pro_services", "portfolio_items", "testimonials",
  "service_requests", "service_request_photos", "conversations", "messages",
  "reviews", "reports", "quotes", "household_items",
];

describe("RECONCILE_WORKSPACE", () => {
  it("compares every one of the thirteen tables", () => {
    for (const table of TABLES) {
      expect(code, `public.${table} is not reconciled`).toMatch(
        new RegExp(`from public\\.${table}\\b`)
      );
    }
  });

  it("uses a null-safe comparison throughout, never a null-unsafe one", () => {
    // `workspace_id <> expected` is null-unsafe: if either side is null the comparison is
    // unknown, the row is not selected, and a genuine disagreement passes silently.
    expect(code).toMatch(/is distinct from/);
    const comparisons = [...code.matchAll(/where \w+\.workspace_id[^;]*/g)].map((m) => m[0]);
    expect(comparisons.length).toBeGreaterThan(0);
    for (const c of comparisons) {
      expect(c, `a null-unsafe comparison would pass over real disagreements: ${c}`).not.toMatch(
        /workspace_id\s*<>/
      );
    }
  });

  it("checks for unresolved (still-null) workspace_id separately from value mismatches", () => {
    // A row whose owner never resolved to any workspace at all would not be caught by any
    // expected-value comparison — there is no expected value to compare against. This is
    // the check built specifically for that gap.
    expect(raw).toMatch(/10 · No row in any of the thirteen tables was left with a null/);
    expect(codeNoComments).toMatch(/workspace_id is null/);
  });

  it("reports real row counts as informational, not as a hard gate on emptiness", () => {
    // Deliberately different from RECONCILE_IDENTITY.sql: staging's sparse marketplace data
    // is an already-documented, expected condition (WP 03.06 finding), not a broken
    // environment. A hard gate here would make this reconciliation permanently unrunnable
    // rather than honestly reporting thin coverage.
    expect(raw).toMatch(/real row counts/);
    expect(raw).not.toMatch(/NOT A GATE/);
  });

  it("writes nothing", () => {
    expect(code).not.toMatch(/\b(insert into|update\s+\w|delete from|create table|alter table|drop)\b/i);
  });

  it("fails the run rather than only reporting", () => {
    expect(code).toMatch(/raise exception/);
    expect(raw).toMatch(/ON_ERROR_STOP/);
  });

  it("resolves the Professional Workspace group through the same rule 0035 applies", () => {
    // type = 'professional' and role = 'owner' — the exact filter the backfill used. A
    // reconciliation that used a looser filter (any membership, any role) would pass even
    // if the backfill had picked the wrong workspace.
    expect(codeNoComments).toMatch(/w\.type = 'professional' and m\.role = 'owner'/);
    expect(codeNoComments).toMatch(/w\.type = 'personal' and m\.role = 'owner'/);
  });
});
