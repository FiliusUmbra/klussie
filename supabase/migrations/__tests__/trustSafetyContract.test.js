// Slice 5, WP 5.0 — the Trust & Safety engine's first migration: a new schema (the
// first engine-owning one since the original ten, 0018), safety.cases/safety.decisions,
// and a full read/write contract. See this migration's own header for the design
// decisions these tests pin.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0171_trust_safety_contract.sql";

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

describe("0171_trust_safety_contract migration", () => {
  describe("the engine bootstrap — schema, role, ownership", () => {
    it("creates the safety schema and klussie_engine_safety role guardedly", () => {
      expect(codeNoComments).toMatch(/create schema if not exists safety;/);
      expect(codeNoComments).toMatch(/create role klussie_engine_safety nologin;/);
    });

    it("gives the engine role USAGE plus default privileges, matching every other engine's own bootstrap shape", () => {
      expect(codeNoComments).toMatch(/grant usage on schema safety to klussie_engine_safety;/);
      expect(codeNoComments).toMatch(
        /alter default privileges for role postgres in schema safety grant select, insert on tables to klussie_engine_safety;/
      );
      expect(codeNoComments).toMatch(
        /alter default privileges for role postgres in schema safety grant usage, select on sequences to klussie_engine_safety;/
      );
    });
  });

  describe("safety.cases / safety.decisions tables", () => {
    it("cases references workspace.workspaces by id, not a person — the real fix over legacy's pro_id", () => {
      const start = codeNoComments.indexOf("create table if not exists safety.cases");
      const end = codeNoComments.indexOf(");", start);
      const block = codeNoComments.slice(start, end);
      expect(block).toMatch(/reported_workspace_id\s+uuid\s+not null\s*\n\s*references workspace\.workspaces \(id\)/);
      expect(block).toMatch(/reporter_person_ref\s+uuid\s+not null/);
      expect(block).not.toMatch(/references public\./);
    });

    it("cases has exactly three statuses — no under_review, a deliberate simplification", () => {
      expect(codeNoComments).toMatch(/check \(status in \('open', 'escalated', 'resolved'\)\)/);
    });

    it("cases enforces subject_type/subject_id are both null or both set", () => {
      expect(codeNoComments).toMatch(/constraint cases_subject_pair check \(\(subject_type is null\) = \(subject_id is null\)\)/);
    });

    it("decisions enforces capability_key is set only when action = 'suspend'", () => {
      expect(codeNoComments).toMatch(
        /constraint decisions_capability_key_only_on_suspend check \(\s*\n\s*\(action = 'suspend' and capability_key is not null\) or\s*\n\s*\(action <> 'suspend' and capability_key is null\)\s*\n\s*\)/
      );
    });

    it("decisions allows exactly four actions", () => {
      expect(codeNoComments).toMatch(/check \(action in \('warn', 'suspend', 'escalate', 'close_no_action'\)\)/);
    });

    it("both tables have RLS enabled with no policy, and are revoked from every client-facing role", () => {
      expect(codeNoComments).toMatch(/alter table safety\.cases enable row level security;/);
      expect(codeNoComments).toMatch(/alter table safety\.decisions enable row level security;/);
      expect(codeNoComments).not.toMatch(/create policy.*on safety\./);
      expect(codeNoComments).toMatch(/revoke all on safety\.cases from anon, authenticated, service_role;/);
      expect(codeNoComments).toMatch(/revoke all on safety\.decisions from anon, authenticated, service_role;/);
    });
  });

  describe("safety.file_case_for_caller() — the write path a real customer reaches", () => {
    const FN = "safety.file_case_for_caller";

    it("resolves the reporter's own identity from auth.uid(), refusing if unresolvable", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/i\.auth_user_id = auth\.uid\(\) and i\.erased_at is null/);
      expect(block).toMatch(/if v_reporter_person_ref is null then\s*\n\s*raise exception/);
    });

    it("requires a real engagement between the reporter's own workspace and the reported workspace", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/from work\.engagements e\s*\n\s*join workspace\.memberships m on m\.workspace_id = e\.requesting_workspace_id/);
      expect(block).toMatch(/e\.performing_workspace_id = p_reported_workspace_id/);
      expect(block).toMatch(/if not v_has_relationship then\s*\n\s*raise exception/);
    });

    it("takes every id as a parameter — never mints one internally", () => {
      const paramList = codeNoComments.slice(
        codeNoComments.indexOf(`create or replace function ${FN}`),
        codeNoComments.indexOf(")\nreturns void", codeNoComments.indexOf(`create or replace function ${FN}`))
      );
      expect(paramList).toMatch(/p_case_id\s+uuid/);
      expect(paramList).toMatch(/p_event_id\s+uuid/);
      const block = bodyOf(FN, codeNoComments);
      expect(block).not.toMatch(/uuid_v7_at/);
    });

    it("emits safety.case.filed scoped to the reported workspace", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/p_event_type\s*=>\s*'safety\.case\.filed'/);
      expect(block).toMatch(/p_workspace_id\s*=>\s*p_reported_workspace_id/);
    });

    it("is not SECURITY DEFINER and is revoked from every application role", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).not.toMatch(/security definer/i);
      expect(codeNoComments).toMatch(
        /revoke all on function safety\.file_case_for_caller\([^)]*\) from public, anon, authenticated, service_role;/
      );
    });
  });

  describe("safety.record_decision_for_caller() — the operator's own enforcement action", () => {
    const FN = "safety.record_decision_for_caller";

    it("resolves the operator's own identity from auth.uid(), refusing if unresolvable", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/i\.auth_user_id = auth\.uid\(\) and i\.erased_at is null/);
      expect(block).toMatch(/if v_operator_person_ref is null then\s*\n\s*raise exception/);
    });

    it("checks the caller's own active workspace holds platform_operations, the same composed EXISTS shape as elsewhere", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/from workspace\.current_memberships\(\) m\s*\n\s*where workspace\.workspace_has_capability\(m\.workspace_id, 'platform_operations'\)/);
      expect(block).toMatch(/if not exists \([\s\S]{0,200}then\s*\n\s*raise exception/);
    });

    it("refuses a case that does not exist or is already resolved", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/if v_reported_workspace_id is null then\s*\n\s*raise exception/);
      expect(block).toMatch(/if v_status = 'resolved' then\s*\n\s*raise exception/);
    });

    it("moves status to escalated only for escalate, resolved for every other action", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/status = case when p_action = 'escalate' then 'escalated' else 'resolved' end/);
    });

    it("calls workspace.withdraw_capability() directly, only when action = 'suspend', with no new grant needed", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/if p_action = 'suspend' then\s*\n\s*perform workspace\.withdraw_capability\(/);
      expect(block).toMatch(/p_workspace_id\s*=>\s*v_reported_workspace_id/);
      expect(block).toMatch(/p_capability_key\s*=>\s*p_capability_key/);
    });

    it("never grants klussie_engine_safety execute on workspace.withdraw_capability — the SECURITY DEFINER chain covers it instead", () => {
      expect(codeNoComments).not.toMatch(/grant execute on function workspace\.withdraw_capability[^;]*klussie_engine_safety/);
    });

    it("emits safety.case.decided with the action and capability key in its payload", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/p_event_type\s*=>\s*'safety\.case\.decided'/);
      expect(block).toMatch(/jsonb_build_object\('action', p_action, 'capabilityKey', p_capability_key\)/);
    });

    it("is not SECURITY DEFINER and is revoked from every application role", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).not.toMatch(/security definer/i);
      expect(codeNoComments).toMatch(
        /revoke all on function safety\.record_decision_for_caller\([^)]*\) from public, anon, authenticated, service_role;/
      );
    });
  });

  describe("the two read functions — zero rows for a non-operator, never a raised exception", () => {
    for (const fn of ["safety.trust_safety_queue_for_caller", "safety.case_detail_for_caller"]) {
      it(`${fn} restricts to callers holding platform_operations via an EXISTS predicate, not an exception`, () => {
        const block = bodyOf(fn, codeNoComments);
        expect(block).toMatch(/exists \(\s*\n\s*select 1 from workspace\.current_memberships\(\) m\s*\n\s*where workspace\.workspace_has_capability\(m\.workspace_id, 'platform_operations'\)\s*\n\s*\)/);
        expect(block).not.toMatch(/raise exception/);
      });

      it(`${fn} is not SECURITY DEFINER and is revoked from every application role`, () => {
        const block = bodyOf(fn, codeNoComments);
        expect(block).not.toMatch(/security definer/i);
        expect(codeNoComments).toMatch(
          new RegExp(`revoke all on function ${fn.replace(".", "\\.")}\\([^)]*\\) from public, anon, authenticated, service_role;`)
        );
      });
    }

    it("the queue only ever shows open/escalated cases — resolved cases are reached by id, not listed", () => {
      const block = bodyOf("safety.trust_safety_queue_for_caller", codeNoComments);
      expect(block).toMatch(/c\.status in \('open', 'escalated'\)/);
    });

    it("case_detail bundles the full decision history as one jsonb array, no separate round trip", () => {
      const block = bodyOf("safety.case_detail_for_caller", codeNoComments);
      expect(block).toMatch(/jsonb_agg\(jsonb_build_object\(/);
      expect(block).toMatch(/from safety\.decisions d/);
    });

    it("case_detail exposes subject_type/subject_id but does not itself resolve evidence from work/property", () => {
      const block = bodyOf("safety.case_detail_for_caller", codeNoComments);
      expect(block).toMatch(/c\.subject_type, c\.subject_id/);
      expect(block).not.toMatch(/work\.messages|work\.service_records|property\.document_attachments/);
    });
  });

  describe("api.* delegates", () => {
    const delegates = ["file_case", "record_decision", "trust_safety_queue", "case_detail"];

    it("all four are granted to authenticated, and revoked from anon/service_role", () => {
      for (const name of delegates) {
        expect(codeNoComments, `api.${name} not granted to authenticated`).toMatch(
          new RegExp(`grant execute on function api\\.${name}\\([^)]*\\) to authenticated;`)
        );
        expect(codeNoComments, `api.${name} not revoked from anon`).toMatch(
          new RegExp(`revoke all on function api\\.${name}\\([^)]*\\) from public, anon, service_role;`)
        );
      }
    });

    it("all four are SECURITY DEFINER", () => {
      for (const name of delegates) {
        const block = bodyOf(`api.${name}`, codeNoComments);
        expect(block, `api.${name} should be SECURITY DEFINER`).toMatch(/security definer/);
      }
    });

    it("each write delegate calls its own _for_caller wrapper by name", () => {
      expect(bodyOf("api.file_case", codeNoComments)).toContain("safety.file_case_for_caller");
      expect(bodyOf("api.record_decision", codeNoComments)).toContain("safety.record_decision_for_caller");
    });

    it("each read delegate calls its own safety.*_for_caller read function directly", () => {
      expect(bodyOf("api.trust_safety_queue", codeNoComments)).toContain("safety.trust_safety_queue_for_caller");
      expect(bodyOf("api.case_detail", codeNoComments)).toContain("safety.case_detail_for_caller");
    });
  });

  it("grants no client-facing role anything on the raw safety.* functions directly", () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      expect(codeNoComments).not.toMatch(
        new RegExp(`grant execute on function safety\\.(file_case_for_caller|record_decision_for_caller|trust_safety_queue_for_caller|case_detail_for_caller)\\([^)]*\\) to ${role}`)
      );
    }
  });
});
