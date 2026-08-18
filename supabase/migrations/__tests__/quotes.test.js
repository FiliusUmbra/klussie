// Keeps 0086_quotes.sql inside DATABASE_ARCHITECTURE.md §19's own shape — an offer
// owned by the offering workspace, matching public.quotes' own structure with only the
// owner changed.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0086_quotes.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0086_quotes migration", () => {
  it("creates exactly one table, in work", () => {
    const created = [...code.matchAll(/create table if not exists (work\.\w+)/gi)].map((m) => m[1]);
    expect(created).toEqual(["work.quotes"]);
  });

  it("is owned by offering_workspace_id, references work.requests, and is unique per (request, offeror)", () => {
    const start = code.indexOf("create table if not exists work.quotes");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/request_id\s+uuid\s+not null/);
    expect(block).toMatch(/references work\.requests \(id\)/);
    expect(block).toMatch(/offering_workspace_id\s+uuid\s+not null/);
    expect(block).toMatch(/references workspace\.workspaces \(id\)/);
    expect(block).toMatch(/constraint quotes_one_per_request_per_offeror unique \(request_id, offering_workspace_id\)/);
  });

  it("matches public.quotes' own status values exactly, and responded_at consistency", () => {
    const rawStart = codeNoComments.indexOf("create table if not exists work.quotes");
    const rawBlock = codeNoComments.slice(rawStart, codeNoComments.indexOf(");", rawStart) + 2);
    expect(rawBlock).toMatch(/check \(status in \('sent', 'accepted', 'declined'\)\)/);
    expect(rawBlock).toMatch(/check \(status = 'sent' or responded_at is not null\)/);
  });

  it("carries a bookkeeping-only legacy_quote_id, disambiguated from the new row's own id", () => {
    const start = code.indexOf("create table if not exists work.quotes");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/legacy_quote_id\s+uuid\s+null/);
    expect(block).not.toMatch(/references public\.quotes/); // bookkeeping only, no FK
  });

  it("grants UPDATE, never DELETE, revokes from anon/authenticated/service_role, adds no policy here", () => {
    expect(code).toMatch(/grant update on work\.quotes to klussie_engine_work/i);
    expect(code).not.toMatch(/grant delete on work\.quotes/i);
    expect(code).toMatch(/revoke all on work\.quotes from anon, authenticated, service_role/i);
    expect(code).not.toMatch(/create policy/i);
  });
});
