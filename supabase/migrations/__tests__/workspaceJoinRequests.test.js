// The write contract behind ADR-0027's own membership.join.approve (0036) — named at
// Epic 03 WP08 with nothing to approve until this migration. Structural only; real
// behaviour (a request, its approval creating a real membership, a denied decider)
// is exercised live in this migration's own PR description, matching this codebase's
// established practice for a write contract's first real caller.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0220_workspace_join_requests.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName, code) {
  const start = code.indexOf(`create or replace function ${functionName}`);
  const end = code.indexOf("\n$$;", start);
  return code.slice(start, end);
}

describe("0220_workspace_join_requests migration", () => {
  it("creates exactly one new table, workspace.join_requests", () => {
    const tables = [...codeNoComments.matchAll(/create table if not exists (workspace\.\w+)/g)].map((m) => m[1]);
    expect(tables).toEqual(["workspace.join_requests"]);
  });

  it("constrains status to pending/approved/declined, defaulting to pending", () => {
    const table = codeNoComments.slice(codeNoComments.indexOf("create table if not exists workspace.join_requests"));
    expect(table).toMatch(/status\s+text\s+not null default 'pending'/);
    expect(table).toMatch(/check \(status in \('pending', 'approved', 'declined'\)\)/);
  });

  it("keeps decided_at/decided_by consistent with status via a real check constraint", () => {
    const table = codeNoComments.slice(codeNoComments.indexOf("create table if not exists workspace.join_requests"));
    expect(table).toMatch(/constraint join_requests_decided_fields_consistent check/);
  });

  it("allows at most one pending request per (workspace, person), but not a permanent block after a decision", () => {
    expect(codeNoComments).toMatch(
      /create unique index if not exists join_requests_one_pending_per_person_idx\s*\n\s*on workspace\.join_requests \(workspace_id, person_ref\)\s*\n\s*where status = 'pending';/
    );
  });

  it("has RLS enabled with every direct grant revoked — reachable only through the write contract", () => {
    expect(codeNoComments).toMatch(/alter table workspace\.join_requests enable row level security;/);
    expect(codeNoComments).toMatch(/revoke all on workspace\.join_requests from anon, authenticated, service_role;/);
  });

  it("defines exactly the four expected engine functions plus their four api delegates", () => {
    const created = [...codeNoComments.matchAll(/create or replace function (workspace\.\w+|api\.\w+)\(/g)].map((m) => m[1]);
    expect(created.sort()).toEqual([
      "api.decide_join_request",
      "api.list_join_requests",
      "api.request_to_join",
      "api.search_professional_workspaces",
      "workspace.decide_join_request_for_caller",
      "workspace.list_join_requests_for_caller",
      "workspace.request_to_join_for_caller",
      "workspace.search_professional_workspaces_for_caller",
    ].sort());
  });

  it("search excludes any workspace the caller already belongs to, and is capped", () => {
    const body = bodyOf("workspace.search_professional_workspaces_for_caller", codeNoComments);
    expect(body).toMatch(/not exists \(\s*\n\s*select 1\s*\n\s*from workspace\.current_memberships\(\) m/);
    expect(body).toMatch(/limit 10/);
  });

  it("request_to_join resolves person_ref from auth.uid() itself, never a parameter", () => {
    const body = bodyOf("workspace.request_to_join_for_caller", codeNoComments);
    expect(body).toMatch(/where i\.auth_user_id = auth\.uid\(\)/);
    expect(body).not.toMatch(/p_person_ref/);
  });

  it("request_to_join refuses a caller already an active member, and a non-professional workspace", () => {
    const body = bodyOf("workspace.request_to_join_for_caller", codeNoComments);
    expect(body).toMatch(/is not a real professional workspace/);
    expect(body).toMatch(/is already a member of/);
  });

  it("request_to_join emits workspace.join.requested", () => {
    const body = bodyOf("workspace.request_to_join_for_caller", codeNoComments);
    expect(body).toMatch(/p_event_type\s*=>\s*'workspace\.join\.requested'/);
  });

  it("list_join_requests refuses a caller without membership.join.approve on that workspace", () => {
    const body = bodyOf("workspace.list_join_requests_for_caller", codeNoComments);
    expect(body).toMatch(/workspace\.decide_permission\(p_workspace_id, 'membership\.join\.approve'\)/);
    expect(body).toMatch(/raise exception 'workspace\.list_join_requests_for_caller: caller may not view join requests/);
  });

  it("list_join_requests resolves a real display name/avatar, never a bare person_ref", () => {
    const body = bodyOf("workspace.list_join_requests_for_caller", codeNoComments);
    expect(body).toMatch(/left join identity\.identities i on i\.person_ref = jr\.person_ref/);
  });

  it("decide_join_request refuses a caller without membership.join.approve on the request's own workspace", () => {
    const body = bodyOf("workspace.decide_join_request_for_caller", codeNoComments);
    expect(body).toMatch(/workspace\.decide_permission\(v_request\.workspace_id, 'membership\.join\.approve'\)/);
    expect(body).toMatch(/raise exception 'workspace\.decide_join_request_for_caller: caller may not decide requests/);
  });

  it("decide_join_request refuses a request that is not pending, or not a real request id", () => {
    const body = bodyOf("workspace.decide_join_request_for_caller", codeNoComments);
    expect(body).toMatch(/is not a real request/);
    expect(body).toMatch(/was already decided/);
  });

  it("decide_join_request locks the row before deciding, guarding against a concurrent double-decision", () => {
    const body = bodyOf("workspace.decide_join_request_for_caller", codeNoComments);
    expect(body).toMatch(/where id = p_request_id for update/);
  });

  it("approval creates a real 'employee' membership and emits workspace.membership.joined, only on approval", () => {
    const body = bodyOf("workspace.decide_join_request_for_caller", codeNoComments);
    expect(body).toMatch(/if p_decision = 'approved' then/);
    expect(body).toMatch(/values \(p_membership_id, v_request\.workspace_id, v_request\.person_ref, 'employee', 'active', now\(\), now\(\)\)/);
    expect(body).toMatch(/p_event_type\s*=>\s*'workspace\.membership\.joined'/);
  });

  it("emits workspace.join.approved or workspace.join.declined depending on the real decision, not a fixed string", () => {
    const body = bodyOf("workspace.decide_join_request_for_caller", codeNoComments);
    expect(body).toMatch(/case p_decision when 'approved' then 'workspace\.join\.approved' else 'workspace\.join\.declined' end/);
  });

  it("every workspace.* engine function is plain SQL/plpgsql, not SECURITY DEFINER; every api.* delegate is", () => {
    for (const fn of [
      "workspace.search_professional_workspaces_for_caller",
      "workspace.request_to_join_for_caller",
      "workspace.list_join_requests_for_caller",
      "workspace.decide_join_request_for_caller",
    ]) {
      expect(bodyOf(fn, codeNoComments)).not.toMatch(/security definer/);
    }
    for (const fn of [
      "api.search_professional_workspaces",
      "api.request_to_join",
      "api.list_join_requests",
      "api.decide_join_request",
    ]) {
      const start = codeNoComments.indexOf(`create or replace function ${fn}`);
      const nextFn = codeNoComments.indexOf("create or replace function", start + 1);
      const end = nextFn === -1 ? codeNoComments.indexOf("\nrevoke all on function api.search", start) : nextFn;
      expect(codeNoComments.slice(start, end === -1 ? undefined : end)).toMatch(/security definer/);
    }
  });

  it("every workspace.* engine function is granted to nobody, reachable only via its delegate", () => {
    for (const fn of [
      "workspace\\.search_professional_workspaces_for_caller\\(text\\)",
      "workspace\\.request_to_join_for_caller\\([^)]*\\)",
      "workspace\\.list_join_requests_for_caller\\(uuid\\)",
      "workspace\\.decide_join_request_for_caller\\([^)]*\\)",
    ]) {
      expect(codeNoComments).toMatch(new RegExp(`revoke all on function ${fn}\\s*\\n?\\s*from public, anon, authenticated, service_role;`));
    }
  });

  it("every api.* delegate is revoked from anon/service_role and granted only to authenticated", () => {
    for (const fn of [
      "api\\.search_professional_workspaces\\(text\\)",
      "api\\.request_to_join\\([^)]*\\)",
      "api\\.list_join_requests\\(uuid\\)",
      "api\\.decide_join_request\\([^)]*\\)",
    ]) {
      expect(codeNoComments).toMatch(new RegExp(`revoke all on function ${fn} from public, anon, service_role;`));
      expect(codeNoComments).toMatch(new RegExp(`grant execute on function ${fn} to authenticated;`));
    }
  });

  it("does not provision a new 'business' workspace type — joins an existing professional workspace only", () => {
    expect(codeNoComments).not.toMatch(/'business'/);
  });

  it("does not build a notification producer, email, or push delivery — events only, named for a future consumer", () => {
    expect(codeNoComments.toLowerCase()).not.toMatch(/resend|sendgrid|twilio|smtp|push_token/);
  });
});
