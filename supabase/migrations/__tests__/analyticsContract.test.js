// Keeps 0126_analytics_contract.sql inside its own stated rules: functions split across
// analytics_ws/analytics_pf rather than a nonexistent `analytics` schema, event_type
// minted correctly, and promote_platform_metric() structurally unable to accept or emit a
// workspace.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0126_analytics_contract.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0126_analytics_contract migration", () => {
  it("defines exactly four functions, split across analytics_ws/analytics_pf, none in a plain analytics schema, none in api", () => {
    const created = [...codeNoComments.matchAll(/create or replace function ((?:analytics_ws|analytics_pf|analytics|api)\.\w+)\(/g)].map((m) => m[1]);
    expect(created.sort()).toEqual([
      "analytics_pf.platform_metrics_for",
      "analytics_pf.promote_platform_metric",
      "analytics_ws.record_workspace_metric",
      "analytics_ws.workspace_metrics_for",
    ]);
  });

  it("every event_type is already dotted <engine>.<aggregate>.<past-participle>, never bare PascalCase", () => {
    const literals = [...codeNoComments.matchAll(/p_event_type\s*=>\s*'([^']+)'/g)].map((m) => m[1]);
    expect(literals.length).toBeGreaterThan(0);
    for (const value of literals) {
      expect(value, `${value} is not dotted lowercase`).toMatch(/^[a-z_]+\.[a-z_]+\.[a-z_]+$/);
    }
  });

  it("record_workspace_metric upserts and emits analytics.metric.refreshed with the real workspace", () => {
    const start = codeNoComments.indexOf("create or replace function analytics_ws.record_workspace_metric(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/on conflict \(domain, workspace_id, metric_key, period_start, period_end\) do update/);
    expect(block).toMatch(/'analytics\.metric\.refreshed'/);
    expect(block).toMatch(/p_workspace_id\s*=>\s*p_workspace_id/);
  });

  it("promote_platform_metric has no p_workspace_id parameter and never calls emit_event", () => {
    const start = codeNoComments.indexOf("create or replace function analytics_pf.promote_platform_metric(");
    const signatureEnd = codeNoComments.indexOf(")\nreturns void", start);
    const signature = codeNoComments.slice(start, signatureEnd);
    expect(signature).not.toMatch(/p_workspace_id/);

    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).not.toMatch(/emit_event/);
  });

  it("promote_platform_metric writes an audit record with a null workspace, per ADR-0021", () => {
    const start = codeNoComments.indexOf("create or replace function analytics_pf.promote_platform_metric(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/write_audit_record/);
    expect(block).toMatch(/p_workspace_id\s*=>\s*null/);
    expect(block).toMatch(/p_action\s*=>\s*'analytics\.metric_promoted'/);
  });

  it("workspace_metrics_for and platform_metrics_for order most recent period first", () => {
    for (const fn of ["analytics_ws.workspace_metrics_for", "analytics_pf.platform_metrics_for"]) {
      const start = codeNoComments.indexOf(`create or replace function ${fn}(`);
      const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
      expect(block, `${fn} does not order by period_start desc`).toMatch(/order by m\.period_start desc/);
    }
  });

  it("platform_metrics_for takes no workspace parameter", () => {
    const start = codeNoComments.indexOf("create or replace function analytics_pf.platform_metrics_for(");
    const signatureEnd = codeNoComments.indexOf(")\nreturns table", start);
    const signature = codeNoComments.slice(start, signatureEnd);
    expect(signature).not.toMatch(/workspace_id/);
  });

  it("grants klussie_consumer_analytics both emit_event and write_audit_record — the first role granted both", () => {
    expect(codeNoComments).toMatch(/grant execute on function platform\.emit_event/i);
    expect(codeNoComments).toMatch(/grant execute on function platform\.write_audit_record/i);
    expect(codeNoComments).toMatch(/grant usage on schema platform to klussie_consumer_analytics/i);
  });

  it("every function sets search_path to empty", () => {
    const fns = [...codeNoComments.matchAll(/create or replace function ([\w.]+)\([^)]*\)[\s\S]*?set search_path = (\S+)/gi)];
    expect(fns.length).toBe(4);
    for (const [, name, path] of fns) {
      expect(path, `${name} does not use an empty search_path`).toBe("''");
    }
  });

  it("grants every function to klussie_consumer_analytics only — no api delegate, no client grant", () => {
    expect(code).not.toMatch(/create or replace function api\./);
    expect(code).not.toMatch(/grant execute .* to authenticated/i);
    expect(code).toMatch(/to klussie_consumer_analytics/);
  });
});
