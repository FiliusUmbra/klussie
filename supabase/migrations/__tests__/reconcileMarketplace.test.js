// Keeps RECONCILE_MARKETPLACE.sql honest, mirroring reconcileAssets.test.js's own
// concern: a reconciliation is a gate, and a gate has a failure mode ordinary code does
// not — it can break by passing. These assertions are about the ways it could report
// success while proving nothing, not about the ways it could error.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const RECONCILIATION = "supabase/diagnostics/RECONCILE_MARKETPLACE.sql";

const raw = readFileSync(RECONCILIATION, "utf8");
const codeNoComments = raw
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");
const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

function section(raw, startMarker, endMarker) {
  const start = raw.indexOf(startMarker);
  const end = endMarker ? raw.indexOf(endMarker) : raw.length;
  return raw
    .slice(start, end)
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("RECONCILE_MARKETPLACE", () => {
  it("writes nothing", () => {
    expect(code).not.toMatch(/\b(insert into|update\s+\w|delete from|create table|alter table|drop)\b/i);
  });

  it("fails the run rather than only reporting", () => {
    expect(code).toMatch(/raise exception/);
    expect(raw).toMatch(/ON_ERROR_STOP/);
  });

  it("uses a null-safe comparison throughout, never a null-unsafe one", () => {
    expect(code).toMatch(/is distinct from/);
    expect(code).not.toMatch(/where wr\.\w+\s*<>\s*sr\./);
    expect(code).not.toMatch(/where wq\.\w+\s*<>\s*q\./);
  });

  it("scopes eligibility exactly like 0089's own backfill rule — workspace_id not null, not merely 'exists'", () => {
    const check1 = section(raw, "1 · Every legacy request", "2 · service_requests rows");
    expect(check1).toMatch(/sr\.workspace_id is not null/);

    const check2 = section(raw, "2 · service_requests rows", "3 · Every mirrored request");
    expect(check2).not.toMatch(/raise exception/);
  });

  it("maps legacy's 'awaiting_pro' status onto work.requests' 'collecting', not a literal string match", () => {
    const block = section(raw, "3 · Every mirrored request", "4 · Every legacy quote");
    expect(block).toMatch(/case when sr\.status = 'awaiting_pro' then 'collecting' else sr\.status end/);
  });

  it("compares every field the backfill (0089) actually maps for requests, not a subset", () => {
    const block = section(raw, "3 · Every mirrored request", "4 · Every legacy quote");
    for (const col of [
      "wr.category_id is distinct from sr.category_id",
      "wr.service_id is distinct from sr.service_id",
      "wr.details is distinct from sr.details",
      "wr.when_pref is distinct from sr.when_pref",
      "wr.budget is distinct from sr.budget",
    ]) {
      expect(block, `missing comparison: ${col}`).toContain(col);
    }
  });

  it("reconciles quotes via legacy_quote_id, the backfill's own linking column", () => {
    const block = section(raw, "4 · Every legacy quote", "5 · Every legacy booking");
    expect(block).toMatch(/wq\.legacy_quote_id = q\.id/);
    for (const col of ["wq.price is distinct from q.price", "wq.message is distinct from q.message", "wq.status is distinct from q.status"]) {
      expect(block, `missing comparison: ${col}`).toContain(col);
    }
  });

  it("scopes engagement eligibility exactly like 0089's own rule — status in booked/completed/reviewed, a real booked_pro_id", () => {
    const block = section(raw, "5 · Every legacy booking", null);
    expect(block).toMatch(/sr\.status in \('booked', 'completed', 'reviewed'\)/);
    expect(block).toMatch(/sr\.booked_pro_id is not null/);
  });

  it("reports real row counts as informational, matching RECONCILE_ASSETS.sql's own restraint", () => {
    expect(raw).toMatch(/real row counts/i);
    expect(codeNoComments).toMatch(/if v_requests < 10 then/);
  });

  it("is documented as a real, deliberate rescoping of WP 2.5's originally-listed client files, not a silent scope cut", () => {
    expect(raw).toMatch(/RESCOPING/);
    expect(raw).toMatch(/RequestsList\.jsx/);
    expect(raw).toMatch(/WP 2\.6/);
  });
});
