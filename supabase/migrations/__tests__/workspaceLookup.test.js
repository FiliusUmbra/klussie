// Keeps 0138_workspace_lookup.sql (Platform Activation Slice 1, WP 1.1a) inside its own
// stated rules: the same two-layer read-switch shape and the same composed
// platform_operations gate as 0133's list_audit_records() (its own header explains why
// this needs no new grant on identity.identities), a search term matched as text never
// cast to uuid, and platform.search_workspaces() reachable by nobody directly.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0138_workspace_lookup.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("0138_workspace_lookup migration", () => {
  it("defines platform.search_workspaces() without SECURITY DEFINER — it inherits the delegate's context, matching platform.list_audit_records()", () => {
    const start = codeNoComments.indexOf("create or replace function platform.search_workspaces");
    const end = codeNoComments.indexOf("$$;", start);
    const block = codeNoComments.slice(start, end);
    expect(block).not.toMatch(/security definer/i);
  });

  it("defines api.search_workspaces() as a thin SECURITY DEFINER delegate that does nothing but call the real function", () => {
    const start = codeNoComments.indexOf("create or replace function api.search_workspaces");
    const end = codeNoComments.indexOf(";", codeNoComments.indexOf("$$;", start));
    const block = codeNoComments.slice(start, end);
    expect(block).toMatch(/security definer/i);
    expect(block).toMatch(/select \* from platform\.search_workspaces\(/);
  });

  it("authorizes via workspace.current_memberships() + workspace.workspace_has_capability('platform_operations') — composed, not reinvented", () => {
    expect(codeNoComments).toMatch(/from workspace\.current_memberships\(\) cm/);
    expect(codeNoComments).toMatch(/workspace\.workspace_has_capability\(cm\.workspace_id, 'platform_operations'\)/);
  });

  it("gates access with an EXISTS predicate in the WHERE clause, never a raised exception", () => {
    expect(codeNoComments).toMatch(/where exists \(/);
    expect(codeNoComments).not.toMatch(/raise exception/i);
  });

  it("matches the search term as text, never casting it to uuid — arbitrary input must not raise", () => {
    expect(codeNoComments).toMatch(/w\.id::text = p_query/);
    expect(codeNoComments).not.toMatch(/p_query::uuid/);
  });

  it("matches a property's name, not an invented address column that does not exist", () => {
    expect(codeNoComments).toMatch(/p\.name ilike '%' \|\| p_query \|\| '%'/);
    expect(codeNoComments).not.toMatch(/address/i);
  });

  it("reports capability_keys as a real array of granted, non-withdrawn capabilities — never a 'tier' column that does not exist", () => {
    const start = codeNoComments.indexOf("create or replace function platform.search_workspaces");
    const end = codeNoComments.indexOf("$$;", start);
    const block = codeNoComments.slice(start, end);
    expect(block).toMatch(/where g\.workspace_id = w\.id and g\.withdrawn_at is null/);
    // The SQL query body itself must never reference a "tier" column — the function's own
    // COMMENT ON string (checked separately, outside this slice) is where that word is
    // allowed to appear, explaining the omission rather than inventing the column.
    expect(block).not.toMatch(/\btier\b/i);
  });

  it("guards limit/offset against negative input", () => {
    expect(codeNoComments).toMatch(/greatest\(coalesce\(p_limit, 20\), 0\)/);
    expect(codeNoComments).toMatch(/greatest\(coalesce\(p_offset, 0\), 0\)/);
  });

  it("revokes platform.search_workspaces() from every role, including authenticated — reachable only as a nested call", () => {
    expect(codeNoComments).toMatch(
      /revoke all on function platform\.search_workspaces\(text, integer, integer\) from public, anon, authenticated, service_role/
    );
  });

  it("grants api.search_workspaces() to authenticated only, after an explicit revoke from public/anon/service_role", () => {
    expect(codeNoComments).toMatch(
      /revoke all on function api\.search_workspaces\(text, integer, integer\) from public, anon, service_role/
    );
    expect(codeNoComments).toMatch(
      /grant execute on function api\.search_workspaces\(text, integer, integer\) to authenticated/
    );
  });

  it("does not re-grant USAGE on schema api — already granted in 0031", () => {
    expect(codeNoComments).not.toMatch(/grant usage on schema api/i);
  });

  it("grants no new privilege on identity.identities — the join relies on the same definer-context precedent workspace.current_memberships() already established", () => {
    expect(codeNoComments).not.toMatch(/grant.*identity\.identities/i);
  });
});
