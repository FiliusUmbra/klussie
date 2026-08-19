// Keeps RECONCILE_DOCUMENTS.sql honest, mirroring reconcileAssets.test.js's concern: a
// reconciliation is a gate, and a gate has a failure mode ordinary code does not — it can
// break by passing. These assertions are about the ways it could report success while
// proving nothing, not about the ways it could error.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const RECONCILIATION = "supabase/diagnostics/RECONCILE_DOCUMENTS.sql";

const raw = readFileSync(RECONCILIATION, "utf8");
const codeNoComments = raw
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");
const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

function section(startMarker, endMarker) {
  const start = raw.indexOf(startMarker);
  const end = endMarker ? raw.indexOf(endMarker) : raw.length;
  return raw
    .slice(start, end)
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("RECONCILE_DOCUMENTS", () => {
  it("writes nothing", () => {
    expect(code).not.toMatch(/\b(insert into|update\s+\w|delete from|create table|alter table|drop)\b/i);
  });

  it("fails the run rather than only reporting", () => {
    expect(code).toMatch(/raise exception/);
    expect(raw).toMatch(/ON_ERROR_STOP/);
  });

  it("uses a null-safe comparison throughout, never a null-unsafe one", () => {
    expect(code).toMatch(/is distinct from/);
    expect(code).not.toMatch(/where d\.\w+\s*<>\s*(pi|srp|w)\./);
  });

  it("separates 'no mirror exists' from 'no workspace resolves', for both source tables", () => {
    const check1 = section("1 · Every live portfolio_items row", "2 · Every live service_request_photos row");
    expect(check1).toMatch(/where exists \(/);
    expect(check1).toMatch(/and not exists \(select 1 from property\.documents d where d\.portfolio_item_id = pi\.id\)/);

    const check2 = section("2 · Every live service_request_photos row", "3 · Every mirrored document agrees");
    expect(check2).toMatch(/and not exists \(select 1 from property\.documents d where d\.service_request_photo_id = srp\.id\)/);
  });

  it("compares every mapped field, not a subset, for both source types", () => {
    const portfolioBlock = section("3 · Every mirrored document agrees", "4 ·");
    expect(portfolioBlock).toContain("d.owning_workspace_id is distinct from w.id");
    expect(portfolioBlock).toContain("d.storage_path is distinct from pi.storage_path");
    expect(portfolioBlock).toContain("d.type_key is distinct from 'portfolio_photo'");

    const requestBlock = section("join public.service_request_photos srp on srp.id = d.service_request_photo_id", "5 · No mirrored document");
    expect(requestBlock).toContain("d.owning_workspace_id is distinct from w.id");
    expect(requestBlock).toContain("d.storage_path is distinct from srp.storage_path");
    expect(requestBlock).toContain("d.type_key is distinct from 'request_photo'");
  });

  it("checks the attachment shape matches the stated rule for each source type", () => {
    const block = section("5 · No mirrored document", null);
    expect(block).toMatch(/portfolio_item_id is not null[\s\S]*?da\.workspace_id = d\.owning_workspace_id/);
    expect(block).toMatch(/service_request_photo_id is not null[\s\S]*?exists \(select 1 from property\.document_attachments da where da\.document_id = d\.id\)/);
  });

  it("reports real row counts as informational, matching RECONCILE_ASSETS.sql's own restraint", () => {
    expect(raw).toMatch(/real row counts/i);
    expect(codeNoComments).toMatch(/if v_total < 10 then/);
  });
});
