// Keeps 0124_analytics_metrics.sql inside DATABASE_ARCHITECTURE.md §31's own rules: two
// physically separate stores, platform_metrics carries no workspace_id at all, and both
// are Projection class — hard-delete permitted, no guard trigger.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0124_analytics_metrics.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0124_analytics_metrics migration", () => {
  it("creates exactly two tables, one in analytics_ws, one in analytics_pf", () => {
    const created = [...code.matchAll(/create table if not exists ((?:analytics_ws|analytics_pf)\.\w+)/gi)].map((m) => m[1]);
    expect(created.sort()).toEqual(["analytics_pf.platform_metrics", "analytics_ws.workspace_metrics"]);
  });

  it("workspace_metrics constrains domain to the three workspace-scoped domains", () => {
    const start = codeNoComments.indexOf("create table if not exists analytics_ws.workspace_metrics");
    const block = codeNoComments.slice(start, codeNoComments.indexOf(");", start) + 2);
    expect(block).toMatch(/domain in \('business', 'property', 'enterprise'\)/);
    expect(block).toMatch(/workspace_id\s+uuid\s+not null\s*\n\s*references workspace\.workspaces \(id\)/);
  });

  it("platform_metrics constrains domain to the four platform-scoped domains and has no workspace_id column at all", () => {
    const start = codeNoComments.indexOf("create table if not exists analytics_pf.platform_metrics");
    const block = codeNoComments.slice(start, codeNoComments.indexOf(");", start) + 2);
    expect(block).toMatch(/domain in \('operational', 'marketplace', 'ai', 'platform'\)/);
    expect(block).not.toMatch(/workspace_id/);
  });

  it("both tables are one row per period, keyed on their own domain shape", () => {
    expect(codeNoComments).toMatch(/workspace_metrics_one_row_per_period unique \(domain, workspace_id, metric_key, period_start, period_end\)/);
    expect(codeNoComments).toMatch(/platform_metrics_one_row_per_period unique \(domain, metric_key, period_start, period_end\)/);
  });

  it("both tables require a real period (end after start)", () => {
    const periodChecks = [...codeNoComments.matchAll(/period_valid check \(period_end > period_start\)/g)];
    expect(periodChecks.length).toBe(2);
  });

  it("neither table carries a guard trigger — Projection class, hard-delete permitted", () => {
    expect(codeNoComments).not.toMatch(/create trigger/i);
    expect(codeNoComments).not.toMatch(/before update or delete/i);
  });

  it("grants full CRUD to klussie_consumer_analytics only, on both tables", () => {
    expect(code).toMatch(/grant select, insert, update, delete on analytics_ws\.workspace_metrics to klussie_consumer_analytics/i);
    expect(code).toMatch(/grant select, insert, update, delete on analytics_pf\.platform_metrics to klussie_consumer_analytics/i);
    expect(code).toMatch(/revoke all on analytics_ws\.workspace_metrics from anon, authenticated, service_role/i);
    expect(code).toMatch(/revoke all on analytics_pf\.platform_metrics from anon, authenticated, service_role/i);
  });

  it("enables row level security on both tables", () => {
    expect(codeNoComments).toMatch(/alter table analytics_ws\.workspace_metrics enable row level security/);
    expect(codeNoComments).toMatch(/alter table analytics_pf\.platform_metrics enable row level security/);
  });

  it("creates no policy in this migration — that is WP 21.02's own job", () => {
    expect(codeNoComments).not.toMatch(/create policy/i);
  });
});
