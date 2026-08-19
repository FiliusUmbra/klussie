// Keeps 0129_subscriptions_isolation_policy.sql inside the ADR-0025 backstop shape every
// workspace-scoped table this session has used.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0129_subscriptions_isolation_policy.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("0129_subscriptions_isolation_policy migration", () => {
  it("creates exactly one policy, for commerce.subscriptions", () => {
    const created = [...codeNoComments.matchAll(/create policy "([^"]+)"\s*\n\s*on (commerce\.\w+)/g)];
    expect(created.length).toBe(1);
    expect(created[0][2]).toBe("commerce.subscriptions");
  });

  it("is an ordinary direct workspace_id membership check", () => {
    expect(codeNoComments).toMatch(
      /workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/
    );
    expect(codeNoComments).toMatch(/to authenticated/);
  });
});
