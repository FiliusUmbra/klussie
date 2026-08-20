// Keeps 0158_authenticated_platform_schema_usage.sql narrow: exactly one grant, to
// exactly `authenticated`, USAGE only — nothing else touched. See this migration's own
// header for why this specific gap was invisible to every SQL-level diagnostic in the
// programme and could only be found by driving a real browser client against staging.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0158_authenticated_platform_schema_usage.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n")
  .trim();

describe("0158_authenticated_platform_schema_usage migration", () => {
  it("grants USAGE on schema platform to exactly authenticated", () => {
    const grants = [...codeNoComments.matchAll(/grant usage on schema platform to (\w+);/g)].map((m) => m[1]);
    expect(grants).toEqual(["authenticated"]);
  });

  it("does not grant to anon or service_role — only the role a real client session runs as", () => {
    expect(codeNoComments).not.toMatch(/to anon/);
    expect(codeNoComments).not.toMatch(/to service_role/);
  });

  it("touches nothing else — no table, function, policy, or revoke statement", () => {
    expect(codeNoComments).not.toMatch(/create (table|function|policy|trigger|type)/i);
    expect(codeNoComments).not.toMatch(/alter table/i);
    expect(codeNoComments).not.toMatch(/revoke/i);
  });

  it("is USAGE only — grants no table, function, or sequence privilege in the same statement", () => {
    expect(codeNoComments).not.toMatch(/grant (select|insert|update|delete|execute|all)/i);
  });
});
