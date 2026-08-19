// Keeps 0119_provider_decisions_isolation_policy.sql inside the ADR-0025 backstop shape
// every workspace-scoped table has held since — ordinary direct membership, no combined-OR.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0119_provider_decisions_isolation_policy.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("0119_provider_decisions_isolation_policy migration", () => {
  it("creates exactly one policy, for work.provider_decisions", () => {
    const created = [...codeNoComments.matchAll(/create policy "([\w\s]+)"\s*\n\s*on (work\.\w+)/g)];
    expect(created.length).toBe(1);
    expect(created[0][2]).toBe("work.provider_decisions");
  });

  it("is an ordinary direct workspace_id membership check, no combined-OR", () => {
    expect(codeNoComments).toMatch(
      /workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/
    );
    expect(codeNoComments).toMatch(/to authenticated/);
    expect(codeNoComments).not.toMatch(/ or /);
  });
});
