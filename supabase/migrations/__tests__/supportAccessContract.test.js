// Support access, WP S.0 — the grant/end/read contract. See SUPPORT_ACCESS_DESIGN.md for
// the product reasoning this migration implements: ROADMAP_C_PLATFORM_OPERATIONS.md
// §3.2's own second half of Phase C2, never actually built despite Phase C2 being marked
// Complete for its read-only search half alone.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0172_support_access_contract.sql";

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

describe("0172_support_access_contract migration", () => {
  describe("workspace.support_access_grants table", () => {
    it("is keyed 1:1 by membership_id, a real FK to workspace.memberships — no separate id, no duplicated state", () => {
      const start = codeNoComments.indexOf("create table if not exists workspace.support_access_grants");
      const end = codeNoComments.indexOf(");", start);
      const block = codeNoComments.slice(start, end);
      expect(block).toMatch(/membership_id\s+uuid\s+not null\s*\n\s*references workspace\.memberships \(id\)/);
      expect(block).toMatch(/purpose\s+text\s+not null/);
      expect(block).toMatch(/constraint support_access_grants_pkey primary key \(membership_id\)/);
      expect(block).not.toMatch(/state|expires_at/);
    });

    it("has RLS enabled with no policy, and is revoked from every client-facing role", () => {
      expect(codeNoComments).toMatch(/alter table workspace\.support_access_grants enable row level security;/);
      expect(codeNoComments).not.toMatch(/create policy.*on workspace\.support_access_grants/);
      expect(codeNoComments).toMatch(/revoke all on workspace\.support_access_grants from anon, authenticated, service_role;/);
    });
  });

  describe("workspace.grant_support_access_for_caller() — the write path an operator reaches", () => {
    const FN = "workspace.grant_support_access_for_caller";

    it("resolves the operator's own identity from auth.uid(), refusing if unresolvable", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/i\.auth_user_id = auth\.uid\(\) and i\.erased_at is null/);
      expect(block).toMatch(/if v_operator_person_ref is null then\s*\n\s*raise exception/);
    });

    it("checks the caller's own active workspace holds platform_operations, the same composed EXISTS shape as Trust & Safety", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/from workspace\.current_memberships\(\) m\s*\n\s*where workspace\.workspace_has_capability\(m\.workspace_id, 'platform_operations'\)/);
    });

    it("requires a real, non-blank purpose", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/if p_purpose is null or btrim\(p_purpose\) = '' then\s*\n\s*raise exception/);
    });

    it("bounds duration to between 1 and 72 hours", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/if p_duration_hours is null or p_duration_hours <= 0 or p_duration_hours > 72 then/);
      expect(block).toMatch(/make_interval\(hours => p_duration_hours\)/);
    });

    it("refuses a workspace that does not exist", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/if not exists \(select 1 from workspace\.workspaces where id = p_workspace_id\) then/);
    });

    it("inserts the membership as role='support', scope=null (unscoped within the one workspace)", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/p_membership_id, p_workspace_id, v_operator_person_ref, 'support', null, 'active', v_expires_at, now\(\), now\(\)/);
    });

    it("writes the purpose to support_access_grants, keyed by the same membership_id", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/insert into workspace\.support_access_grants \(membership_id, purpose, created_at\)/);
      expect(block).toMatch(/values \(p_membership_id, p_purpose, now\(\)\)/);
    });

    it("writes a real audit record — platform.audit_records' first genuinely real caller", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/perform platform\.write_audit_record\(/);
      expect(block).toMatch(/p_action\s*=>\s*'workspace\.support_access_granted'/);
      expect(block).toMatch(/p_outcome\s*=>\s*'permitted'/);
      expect(block).toMatch(/p_authority\s*=>\s*'platform_operations'/);
      expect(block).toMatch(/p_subject_type\s*=>\s*'membership'/);
    });

    it("also emits a real event, distinct from the audit record", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/perform platform\.emit_event\(/);
      expect(block).toMatch(/p_event_type\s*=>\s*'workspace\.support_access\.granted'/);
    });

    it("is not SECURITY DEFINER and is revoked from every application role", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).not.toMatch(/security definer/i);
      expect(codeNoComments).toMatch(
        /revoke all on function workspace\.grant_support_access_for_caller\([^)]*\) from public, anon, authenticated, service_role;/
      );
    });
  });

  describe("workspace.end_support_access_for_caller() — ending a grant early", () => {
    const FN = "workspace.end_support_access_for_caller";

    it("checks the caller holds platform_operations — any operator, not only the one who granted it", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/from workspace\.current_memberships\(\) m\s*\n\s*where workspace\.workspace_has_capability\(m\.workspace_id, 'platform_operations'\)/);
    });

    it("only ends a membership that is currently an active role='support' row", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/where id = p_membership_id and role = 'support' and state = 'active'/);
      expect(block).toMatch(/if v_workspace_id is null then\s*\n\s*raise exception/);
    });

    it("sets state to 'ended', not a delete", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/set state = 'ended', updated_at = now\(\)/);
    });

    it("writes both an audit record and an event, same shape as the grant", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/p_action\s*=>\s*'workspace\.support_access_ended'/);
      expect(block).toMatch(/p_event_type\s*=>\s*'workspace\.support_access\.ended'/);
    });

    it("is not SECURITY DEFINER and is revoked from every application role", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).not.toMatch(/security definer/i);
      expect(codeNoComments).toMatch(
        /revoke all on function workspace\.end_support_access_for_caller\([^)]*\) from public, anon, authenticated, service_role;/
      );
    });
  });

  describe("workspace.support_access_grants_for_caller() — the read path", () => {
    const FN = "workspace.support_access_grants_for_caller";

    it("checks platform_operations directly — NOT via a join against the caller's own membership in the target workspace", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/exists \(\s*\n\s*select 1 from workspace\.current_memberships\(\) cm\s*\n\s*where workspace\.workspace_has_capability\(cm\.workspace_id, 'platform_operations'\)\s*\n\s*\)/);
      // The real finding this migration's own header names: this read must never trust
      // "does the caller merely hold a membership in p_workspace_id" the way an ordinary
      // caller-scoped read would (that would be the support membership's own role riding
      // an authorization shape built for members, not support sessions).
      expect(block).not.toMatch(/m\.workspace_id = p_workspace_id\s*\n\s*and exists \(\s*\n\s*select 1 from workspace\.current_memberships\(\) m\b/);
    });

    it("shows every grant for the workspace — active, expired and ended alike, most recent first", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/where m\.role = 'support'/);
      expect(block).toMatch(/order by m\.created_at desc/);
      expect(block).not.toMatch(/state = 'active'/);
    });

    it("computes status from state and expires_at, not a stored column", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/when m\.state = 'ended' then 'ended'/);
      expect(block).toMatch(/when m\.expires_at is not null and m\.expires_at <= now\(\) then 'expired'/);
      expect(block).toMatch(/else 'active'/);
    });

    it("is not SECURITY DEFINER and is revoked from every application role", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).not.toMatch(/security definer/i);
      expect(codeNoComments).toMatch(
        /revoke all on function workspace\.support_access_grants_for_caller\([^)]*\) from public, anon, authenticated, service_role;/
      );
    });
  });

  describe("api.* delegates", () => {
    const delegates = ["grant_support_access", "end_support_access", "support_access_grants"];

    it("all three are granted to authenticated, and revoked from anon/service_role", () => {
      for (const name of delegates) {
        expect(codeNoComments, `api.${name} not granted to authenticated`).toMatch(
          new RegExp(`grant execute on function api\\.${name}\\([^)]*\\) to authenticated;`)
        );
        expect(codeNoComments, `api.${name} not revoked from anon`).toMatch(
          new RegExp(`revoke all on function api\\.${name}\\([^)]*\\) from public, anon, service_role;`)
        );
      }
    });

    it("all three are SECURITY DEFINER", () => {
      for (const name of delegates) {
        const block = bodyOf(`api.${name}`, codeNoComments);
        expect(block, `api.${name} should be SECURITY DEFINER`).toMatch(/security definer/);
      }
    });

    it("each delegate calls its own workspace.*_for_caller function by name", () => {
      expect(bodyOf("api.grant_support_access", codeNoComments)).toContain("workspace.grant_support_access_for_caller");
      expect(bodyOf("api.end_support_access", codeNoComments)).toContain("workspace.end_support_access_for_caller");
      expect(bodyOf("api.support_access_grants", codeNoComments)).toContain("workspace.support_access_grants_for_caller");
    });
  });

  it("grants no client-facing role anything on the raw workspace.* functions directly", () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      expect(codeNoComments).not.toMatch(
        new RegExp(`grant execute on function workspace\\.(grant_support_access_for_caller|end_support_access_for_caller|support_access_grants_for_caller)\\([^)]*\\) to ${role}`)
      );
    }
  });
});
