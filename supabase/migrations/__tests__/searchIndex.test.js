// Keeps 0121_search_index.sql inside DATABASE_ARCHITECTURE.md §3/§30's own rules: one
// polymorphic projection table, hard-delete permitted, global has no workspace, and
// is_published can never be true outside the two public domains.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0121_search_index.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0121_search_index migration", () => {
  it("creates exactly one table, in derived", () => {
    const created = [...code.matchAll(/create table if not exists (derived\.\w+)/gi)].map((m) => m[1]);
    expect(created).toEqual(["derived.search_index"]);
  });

  it("constrains domain to the eight frozen values", () => {
    const start = codeNoComments.indexOf("create table if not exists derived.search_index");
    const block = codeNoComments.slice(start, codeNoComments.indexOf(");", start) + 2);
    expect(block).toMatch(
      /domain in \('workspace', 'property', 'asset', 'conversation', 'document', 'knowledge', 'provider', 'global'\)/
    );
  });

  it("requires workspace_id to be null if and only if domain is global", () => {
    const start = codeNoComments.indexOf("create table if not exists derived.search_index");
    const block = codeNoComments.slice(start, codeNoComments.indexOf(");", start) + 2);
    expect(block).toMatch(/\(domain = 'global'\) = \(workspace_id is null\)/);
  });

  it("workspace_id references workspace.workspaces, matching notifications' and provider_decisions' own posture", () => {
    const start = codeNoComments.indexOf("create table if not exists derived.search_index");
    const block = codeNoComments.slice(start, codeNoComments.indexOf(");", start) + 2);
    expect(block).toMatch(/workspace_id\s+uuid\s*\n\s*references workspace\.workspaces \(id\)/);
  });

  it("forbids is_published from being true outside provider/global", () => {
    const start = codeNoComments.indexOf("create table if not exists derived.search_index");
    const block = codeNoComments.slice(start, codeNoComments.indexOf(");", start) + 2);
    expect(block).toMatch(/domain in \('provider', 'global'\) or is_published = false/);
  });

  it("one row per source item per domain", () => {
    const start = codeNoComments.indexOf("create table if not exists derived.search_index");
    const block = codeNoComments.slice(start, codeNoComments.indexOf(");", start) + 2);
    expect(block).toMatch(/unique \(domain, source_type, source_id\)/);
  });

  it("search_vector is a generated, stored tsvector using the simple configuration", () => {
    expect(codeNoComments).toMatch(/search_vector\s+tsvector generated always as/);
    expect(codeNoComments).toMatch(/to_tsvector\('simple', coalesce\(title, ''\)\)/);
    expect(codeNoComments).toMatch(/to_tsvector\('simple', coalesce\(body, ''\)\)/);
    expect(codeNoComments).toMatch(/\) stored,/);
  });

  it("carries no guard trigger — hard-delete permitted, unlike every other table this session has built", () => {
    expect(codeNoComments).not.toMatch(/create trigger/i);
    expect(codeNoComments).not.toMatch(/before update or delete/i);
  });

  it("indexes the search_vector with gin and location_path with gist", () => {
    expect(codeNoComments).toMatch(/using gin \(search_vector\)/);
    expect(codeNoComments).toMatch(/using gist \(location_path extensions\.gist_ltree_ops\)/);
  });

  it("grants full CRUD to klussie_consumer_search only, and revokes from every client role", () => {
    expect(code).toMatch(/grant select, insert, update, delete on derived\.search_index to klussie_consumer_search/i);
    expect(code).toMatch(/revoke all on derived\.search_index from anon, authenticated, service_role/i);
  });

  it("enables row level security", () => {
    expect(codeNoComments).toMatch(/alter table derived\.search_index enable row level security/);
  });
});
