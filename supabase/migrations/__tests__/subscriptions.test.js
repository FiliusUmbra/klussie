// Keeps 0128_subscriptions.sql inside DATABASE_ARCHITECTURE.md §10's own rule: mutable in
// place, one row per workspace structurally, trial_ends_at paired with status, payer a
// polymorphic reference rather than a typed workspace_id column.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0128_subscriptions.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0128_subscriptions migration", () => {
  it("creates exactly one table, in commerce", () => {
    const created = [...code.matchAll(/create table if not exists (commerce\.\w+)/gi)].map((m) => m[1]);
    expect(created).toEqual(["commerce.subscriptions"]);
  });

  it("enforces one subscription per workspace structurally", () => {
    const start = codeNoComments.indexOf("create table if not exists commerce.subscriptions");
    const block = codeNoComments.slice(start, codeNoComments.indexOf(");", start) + 2);
    expect(block).toMatch(/subscriptions_one_per_workspace unique \(workspace_id\)/);
  });

  it("references platform.plans, not a bare text column with no catalogue check", () => {
    const start = codeNoComments.indexOf("create table if not exists commerce.subscriptions");
    const block = codeNoComments.slice(start, codeNoComments.indexOf(");", start) + 2);
    expect(block).toMatch(/plan_key\s+text\s+not null\s*\n\s*references platform\.plans \(plan_key\)/);
  });

  it("requires trial_ends_at if and only if status is trialing", () => {
    const start = codeNoComments.indexOf("create table if not exists commerce.subscriptions");
    const block = codeNoComments.slice(start, codeNoComments.indexOf(");", start) + 2);
    expect(block).toMatch(/\(status = 'trialing'\) = \(trial_ends_at is not null\)/);
  });

  it("payer is jsonb, not a typed workspace_id column", () => {
    const start = codeNoComments.indexOf("create table if not exists commerce.subscriptions");
    const block = codeNoComments.slice(start, codeNoComments.indexOf(");", start) + 2);
    expect(block).toMatch(/payer\s+jsonb\s+not null/);
  });

  it("carries no guard trigger — mutable in place, the second such aggregate this session has built", () => {
    expect(codeNoComments).not.toMatch(/create trigger/i);
    expect(codeNoComments).not.toMatch(/before update or delete/i);
  });

  it("grants select/insert/update to klussie_engine_commerce, never delete", () => {
    expect(code).toMatch(/grant select, insert, update on commerce\.subscriptions to klussie_engine_commerce/i);
    expect(code).not.toMatch(/grant delete/i);
    expect(code).toMatch(/revoke all on commerce\.subscriptions from anon, authenticated, service_role/i);
  });

  it("enables row level security", () => {
    expect(codeNoComments).toMatch(/alter table commerce\.subscriptions enable row level security/);
  });
});
