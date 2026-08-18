// Keeps 0106_platform_schema_access_backfill.sql narrow and correct: exactly the two
// engine roles whose already-shipped emit_event() call sites were missing USAGE on
// schema platform, nothing else touched, no rebase of the six affected branches implied.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0106_platform_schema_access_backfill.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n")
  .trim();

describe("0106_platform_schema_access_backfill migration", () => {
  it("grants USAGE on schema platform to exactly klussie_engine_work and klussie_engine_commerce", () => {
    const grants = [...codeNoComments.matchAll(/grant usage on schema platform to (\w+);/g)].map((m) => m[1]);
    expect(grants.sort()).toEqual(["klussie_engine_commerce", "klussie_engine_work"]);
  });

  it("touches nothing else — no table, function, or policy statement", () => {
    expect(codeNoComments).not.toMatch(/create (table|function|policy|trigger|type)/i);
    expect(codeNoComments).not.toMatch(/alter table/i);
  });

  it("does not grant to identity — no identity-schema function calls emit_event", () => {
    expect(codeNoComments).not.toMatch(/klussie_engine_identity/);
  });
});
