// Keeps 0112_memory_versions.sql inside §26's own rules: an aggregate (not a
// projection), no workspace_id (Property Memory follows the property, live), and
// insert-only, matching the world graph's own precedent.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0112_memory_versions.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0112_memory_versions migration", () => {
  it("creates exactly one table, in knowledge", () => {
    const created = [...code.matchAll(/create table if not exists (knowledge\.\w+)/gi)].map((m) => m[1]);
    expect(created).toEqual(["knowledge.memory_versions"]);
  });

  it("carries property_id but no workspace_id column", () => {
    const start = code.indexOf("create table if not exists knowledge.memory_versions");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/property_id\s+uuid\s+not null/);
    expect(block).not.toMatch(/workspace_id/);
  });

  it("requires a non-empty basis — supporting facts must be reachable", () => {
    const start = code.indexOf("create table if not exists knowledge.memory_versions");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/basis\s+jsonb\s+not null/);
    expect(block).toMatch(/check \(jsonb_array_length\(basis\) > 0\)/);
  });

  it("content is open-ended jsonb, not a closed shape", () => {
    const start = code.indexOf("create table if not exists knowledge.memory_versions");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/content\s+jsonb\s+not null/);
  });

  it("records who published it, including whether it was machine-originated", () => {
    const start = code.indexOf("create table if not exists knowledge.memory_versions");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/published_by_actor_type\s+platform\.actor_type\s+not null/);
    expect(block).toMatch(/published_by_actor_ref\s+text\s+not null/);
  });

  it("UPDATE and DELETE are withheld from the engine — insert-only", () => {
    expect(code).toMatch(/revoke update, delete on knowledge\.memory_versions from klussie_engine_knowledge/i);
  });

  it("revokes client roles and adds no policy here", () => {
    expect(code).toMatch(/revoke all on knowledge\.memory_versions from anon, authenticated, service_role/i);
    expect(code).not.toMatch(/create policy/i);
  });

  it("has no guard-mutation trigger — grants alone withhold UPDATE/DELETE, matching the world graph's own precedent", () => {
    expect(codeNoComments).not.toMatch(/create or replace function/);
    expect(codeNoComments).not.toMatch(/create trigger/);
  });
});
