// Keeps 0085_requests.sql inside DATABASE_ARCHITECTURE.md §19's own scope, and this
// epic's own stated boundary: pure addition, legacy taxonomy reused rather than
// migrated, one-tap booking's directed-quote window deliberately not modelled,
// workflow_instance_id present but unpopulated.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0085_requests.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0085_requests migration", () => {
  it("creates exactly one table, in work", () => {
    const created = [...code.matchAll(/create table if not exists (work\.\w+)/gi)].map((m) => m[1]);
    expect(created).toEqual(["work.requests"]);
  });

  it("references public.categories/services directly, category_id staying text", () => {
    const start = code.indexOf("create table if not exists work.requests");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/category_id\s+text\s+null/);
    expect(block).toMatch(/references public\.categories \(id\)/);
    expect(block).toMatch(/service_id\s+uuid\s+null/);
    expect(block).toMatch(/references public\.services \(id\)/);
  });

  it("allows at most one of asset_id/location_id, both optional alongside property_id", () => {
    const start = code.indexOf("create table if not exists work.requests");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/property_id\s+uuid\s+null/);
    expect(block).toMatch(/asset_id\s+uuid\s+null/);
    expect(block).toMatch(/location_id\s+uuid\s+null/);
    expect(block).toMatch(/check \(num_nonnulls\(asset_id, location_id\) <= 1\)/);
  });

  it("has no directed_pro_id/directed_until/auto_accept_max — one-tap booking's window is deliberately not modelled", () => {
    expect(codeNoComments).not.toMatch(/directed_pro_id/);
    expect(codeNoComments).not.toMatch(/directed_until/);
    expect(codeNoComments).not.toMatch(/auto_accept_max/);
  });

  it("has a workflow_instance_id column, nullable, referencing work.workflow_instances", () => {
    const start = code.indexOf("create table if not exists work.requests");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/workflow_instance_id\s+uuid\s+null/);
    expect(block).toMatch(/references work\.workflow_instances \(id\)/);
  });

  it("status matches public.service_requests' own six values exactly", () => {
    const rawStart = codeNoComments.indexOf("create table if not exists work.requests");
    const rawBlock = codeNoComments.slice(rawStart, codeNoComments.indexOf(");", rawStart) + 2);
    expect(rawBlock).toMatch(
      /check \(status in \('collecting', 'quotes_ready', 'booked', 'completed', 'reviewed', 'cancelled'\)\)/
    );
  });

  it("carries a bookkeeping-only service_request_id, matching Epic 08's own idiom", () => {
    const start = code.indexOf("create table if not exists work.requests");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/service_request_id\s+uuid\s+null/);
    expect(block).not.toMatch(/references public\.service_requests/); // bookkeeping only, no FK
  });

  it("grants UPDATE, never DELETE, revokes from anon/authenticated/service_role, adds no policy here", () => {
    expect(code).toMatch(/grant update on work\.requests to klussie_engine_work/i);
    expect(code).not.toMatch(/grant delete on work\.requests/i);
    expect(code).toMatch(/revoke all on work\.requests from anon, authenticated, service_role/i);
    expect(code).not.toMatch(/create policy/i);
  });
});
