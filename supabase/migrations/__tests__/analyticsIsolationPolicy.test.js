// Keeps 0125_analytics_isolation_policy.sql inside the ADR-0025 backstop shape every
// workspace-scoped table this session has used — and confirms it touches analytics_ws
// only, never analytics_pf.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0125_analytics_isolation_policy.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("0125_analytics_isolation_policy migration", () => {
  it("creates exactly one policy, on analytics_ws.workspace_metrics", () => {
    const created = [...codeNoComments.matchAll(/create policy "([^"]+)"\s*\n\s*on (analytics_ws\.\w+|analytics_pf\.\w+)/g)];
    expect(created.length).toBe(1);
    expect(created[0][2]).toBe("analytics_ws.workspace_metrics");
  });

  it("is an ordinary direct workspace_id membership check", () => {
    expect(codeNoComments).toMatch(
      /workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/
    );
    expect(codeNoComments).toMatch(/to authenticated/);
  });

  it("never touches analytics_pf — that store has no workspace to scope a policy by", () => {
    expect(codeNoComments).not.toMatch(/analytics_pf/);
  });
});
