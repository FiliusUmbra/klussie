// Keeps RECONCILE_IDENTITY.sql honest.
//
// This file is a gate — IMPLEMENTATION_ROADMAP.md §8: "a read-switch without a passing
// reconciliation is not permitted" — and a gate has a specific failure mode that ordinary
// code does not: **it can break by passing.** A reconciliation that silently compares
// nothing, or that compares with a null-unsafe operator, reports success and clears the
// one package in this epic that can regress the product.
//
// So these assertions are about the ways it could pass while proving nothing, not about
// the ways it could error.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const RECONCILIATION = "supabase/diagnostics/RECONCILE_IDENTITY.sql";

const raw = readFileSync(RECONCILIATION, "utf8");
const code = raw
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n")
  .replace(/'(?:[^']|'')*'/g, "''");

describe("RECONCILE_IDENTITY", () => {
  it("refuses to pass when there is nothing to compare", () => {
    // The failure that matters most. An empty database yields zero discrepancies, and zero
    // discrepancies reads exactly like success — so without this the gate is cleared by
    // running it somewhere with no data.
    expect(code).toMatch(/count\(\*\) into v_profiles from public\.profiles/);
    expect(raw).toMatch(/NOT A GATE/);

    // And it has to come first: a later check that happened to fail would mask it, and a
    // later check that passed would print reassuring notices before the refusal.
    expect(raw.indexOf("NOT A GATE")).toBeLessThan(raw.indexOf("every profile has an identity"));
  });

  it("compares attributes with a null-safe operator", () => {
    // `p.full_name <> i.full_name` is null-unsafe: if one side is null the comparison is
    // unknown, the row is not selected, and a genuine disagreement passes silently. This is
    // the classic way a reconciliation lies, and the data here is full of nullable columns.
    const comparison = code.slice(code.indexOf("with drift as"), code.indexOf("select count(*), string_agg"));
    expect(comparison).toMatch(/is distinct from/);
    expect(comparison, "a null-unsafe comparison would pass over real disagreements").not.toMatch(/<>/);
  });

  it("compares every attribute the read switch will read", () => {
    // WP 02.06 moves these six onto the identity row. One left out of the comparison is one
    // that can silently differ on the day reads move.
    const comparison = code.slice(code.indexOf("with drift as"), code.indexOf("select count(*), string_agg"));
    for (const field of ["full_name", "avatar_url", "city", "locale", "email", "phone"]) {
      expect(comparison, `${field} is not reconciled`).toContain(field);
    }
  });

  it("excludes erased identities from attribute comparison", () => {
    // An erased identity holds no personal data by law and by constraint. Comparing it to a
    // profile that still has a name would report lawful erasure as drift, and a gate that
    // cries wolf gets waved through.
    expect(code).toMatch(/erased_at is null/);
  });

  it("treats an identity with no profile as informational, not a failure", () => {
    // §11.4: "losing authentication is not losing identity." `profiles` cascade-deletes
    // with `auth.users` and `identities` deliberately does not, so this state is the design
    // working. Failing on it would block the read switch for a correct database.
    const orphanCheck = raw.slice(raw.indexOf("6 · Informational"));
    expect(orphanCheck).toMatch(/raise notice/);
    expect(orphanCheck.slice(0, orphanCheck.indexOf("RECONCILE_IDENTITY: PASSED"))).not.toMatch(
      /raise exception/
    );
  });

  it("writes nothing", () => {
    // Step 4 of the migration pattern is read-only. A reconciliation that repairs what it
    // finds cannot also be evidence that nothing needed repairing.
    expect(code).not.toMatch(/\b(insert into|update\s+\w|delete from|create table|alter table|drop)\b/i);
  });

  it("fails the run rather than only reporting", () => {
    // psql exits non-zero only if something raises. A reconciliation that printed its
    // findings and exited 0 would be a report, and this has to be a gate.
    expect(code).toMatch(/raise exception/);
    expect(raw).toMatch(/ON_ERROR_STOP/);
  });
});
