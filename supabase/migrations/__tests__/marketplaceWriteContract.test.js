// Keeps 0146_marketplace_write_contract.sql (Platform Activation Slice 2, WP 2.2 + WP
// 2.3) inside its own stated rules: eight new *_for_caller() wrappers, each with a real
// membership check, each delegating entirely to its unmodified work.* counterpart; no
// column default on directed_until (the legacy bug this migration's own header found and
// deliberately does not reproduce); the auto-accept cascade calls work.accept_quote()
// directly, attributed to actor_type = 'system'.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0146_marketplace_write_contract.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName, code) {
  const start = code.indexOf(`create or replace function ${functionName}`);
  const end = code.indexOf("$$;", start);
  return code.slice(start, end);
}

describe("0146_marketplace_write_contract migration", () => {
  describe("schema — directed booking columns", () => {
    it("adds directed_workspace_id, directed_until, auto_accept_max to work.requests", () => {
      expect(codeNoComments).toMatch(/add column if not exists directed_workspace_id uuid/);
      expect(codeNoComments).toMatch(/add column if not exists directed_until timestamptz/);
      expect(codeNoComments).toMatch(/add column if not exists auto_accept_max numeric\(10, 2\)/);
    });

    it("directed_until carries no column default — the legacy bug this migration's own header found", () => {
      expect(codeNoComments).not.toMatch(/directed_until timestamptz\s+default/);
      expect(codeNoComments).not.toMatch(/alter column directed_until set default/);
    });

    it("the three directed columns travel together, and auto_accept_max must be positive", () => {
      expect(codeNoComments).toMatch(
        /\(directed_workspace_id is null and directed_until is null and auto_accept_max is null\)/
      );
      expect(codeNoComments).toMatch(
        /\(directed_workspace_id is not null and directed_until is not null and auto_accept_max is not null\)/
      );
      expect(codeNoComments).toMatch(/check \(auto_accept_max is null or auto_accept_max > 0\)/);
    });
  });

  describe("work.create_request_for_caller()", () => {
    const block = bodyOf("work.create_request_for_caller", codeNoComments);

    it("checks the caller's real membership in the requesting workspace", () => {
      expect(block).toMatch(
        /select 1 from workspace\.current_memberships\(\) m where m\.workspace_id = p_requesting_workspace_id/
      );
    });

    it("delegates the base insert to the unmodified work.create_request()", () => {
      expect(block).toMatch(/perform work\.create_request\(/);
    });

    it("computes directed_until itself, only when directed_workspace_id is given — never trusts a caller-supplied deadline", () => {
      expect(block).toMatch(/directed_until = now\(\) \+ interval '24 hours'/);
      expect(block).not.toMatch(/p_directed_until/);
    });

    it("requires a positive auto_accept_max for a directed request", () => {
      expect(block).toMatch(/p_auto_accept_max is null or p_auto_accept_max <= 0/);
    });
  });

  describe("work.submit_quote_for_caller() — the auto-accept cascade", () => {
    const block = bodyOf("work.submit_quote_for_caller", codeNoComments);

    it("checks the caller's real membership in the offering workspace", () => {
      expect(block).toMatch(
        /select 1 from workspace\.current_memberships\(\) m where m\.workspace_id = p_offering_workspace_id/
      );
    });

    it("delegates the base quote insert to the unmodified work.submit_quote()", () => {
      expect(block).toMatch(/perform work\.submit_quote\(/);
    });

    it("mirrors all three legacy auto-accept conditions: same workspace, inside window, at or under ceiling", () => {
      expect(block).toMatch(/v_directed_ws = p_offering_workspace_id/);
      expect(block).toMatch(/v_directed_until > now\(\)/);
      expect(block).toMatch(/p_price <= v_auto_accept_max/);
    });

    it("cascades via a direct call to the unmodified work.accept_quote(), attributed to actor_type = 'system'", () => {
      expect(block).toMatch(/perform work\.accept_quote\(/);
      expect(block).toMatch(/p_actor_type => 'system'/);
    });
  });

  describe("resolve-before-check discipline — never trust a caller-supplied id for authorization", () => {
    const cases = [
      ["work.withdraw_request_for_caller", "select r.requesting_workspace_id into v_requesting_ws from work.requests r where r.id = p_request_id"],
      ["work.decline_quote_for_caller", "select q.offering_workspace_id into v_offering_ws from work.quotes q where q.id = p_quote_id"],
      ["work.accept_quote_for_caller", "from work.quotes q join work.requests r on r.id = q.request_id"],
      ["work.complete_engagement_for_caller", "select e.requesting_workspace_id into v_requesting_ws from work.engagements e where e.id = p_engagement_id"],
      ["work.mark_request_reviewed_for_caller", "select r.requesting_workspace_id into v_requesting_ws from work.requests r where r.id = p_request_id"],
    ];
    for (const [fn, snippet] of cases) {
      it(`${fn}() resolves its real target from the row before checking membership`, () => {
        const block = bodyOf(fn, codeNoComments);
        expect(block).toContain(snippet);
        expect(block).toMatch(/errcode = 'insufficient_privilege'/);
      });
    }
  });

  describe("work.cancel_engagement_for_caller() — deliberately two-sided", () => {
    const block = bodyOf("work.cancel_engagement_for_caller", codeNoComments);

    it("checks real membership in either the requesting or the performing workspace", () => {
      expect(block).toMatch(/m\.workspace_id in \(v_requesting_ws, v_performing_ws\)/);
    });
  });

  describe("delegation — every *_for_caller() function is not SECURITY DEFINER; every api.* is", () => {
    const workFns = [
      "create_request_for_caller", "withdraw_request_for_caller", "submit_quote_for_caller",
      "decline_quote_for_caller", "accept_quote_for_caller", "complete_engagement_for_caller",
      "cancel_engagement_for_caller", "mark_request_reviewed_for_caller",
    ];
    for (const fn of workFns) {
      it(`work.${fn}() is not SECURITY DEFINER — it inherits the delegate's context`, () => {
        const block = bodyOf(`work.${fn}`, codeNoComments);
        expect(block).not.toMatch(/security definer/i);
      });
    }

    const apiFns = [
      "create_request", "withdraw_request", "submit_quote", "decline_quote",
      "accept_quote", "complete_engagement", "cancel_engagement", "mark_request_reviewed",
    ];
    for (const fn of apiFns) {
      it(`api.${fn}() is a thin SECURITY DEFINER pass-through calling work.${fn}_for_caller(), never the raw work.${fn}()`, () => {
        const block = bodyOf(`api.${fn}`, codeNoComments);
        expect(block).toMatch(/security definer/i);
        expect(block).toMatch(new RegExp(`work\\.${fn}_for_caller\\(`));
      });
    }
  });

  describe("access", () => {
    it("revokes every *_for_caller() function from every role, including authenticated — reachable only as a nested call", () => {
      for (const fn of [
        "create_request_for_caller\\(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, uuid, numeric, uuid, uuid, platform\\.actor_type, text\\)",
        "withdraw_request_for_caller\\(uuid, uuid, uuid, platform\\.actor_type, text\\)",
        "submit_quote_for_caller\\(uuid, uuid, uuid, numeric, text, uuid, uuid, uuid, uuid, uuid, platform\\.actor_type, text\\)",
        "decline_quote_for_caller\\(uuid, uuid, uuid, platform\\.actor_type, text\\)",
        "accept_quote_for_caller\\(uuid, uuid, uuid, uuid, uuid, uuid, platform\\.actor_type, text\\)",
        "complete_engagement_for_caller\\(uuid, uuid, uuid, platform\\.actor_type, text\\)",
        "cancel_engagement_for_caller\\(uuid, text, uuid, uuid, platform\\.actor_type, text\\)",
        "mark_request_reviewed_for_caller\\(uuid, uuid, uuid, platform\\.actor_type, text\\)",
      ]) {
        expect(codeNoComments).toMatch(new RegExp(`revoke all on function work\\.${fn} from public, anon, authenticated, service_role`));
      }
    });

    it("grants every api.* delegate to authenticated only, after an explicit revoke from public/anon/service_role", () => {
      expect((codeNoComments.match(/grant execute on function api\./g) || []).length).toBe(8);
      expect((codeNoComments.match(/revoke all on function api\./g) || []).length).toBe(8);
    });

    it("does not touch the raw work.* functions' own grants from 0090", () => {
      expect(codeNoComments).not.toMatch(/revoke all on function work\.create_request\(/);
      expect(codeNoComments).not.toMatch(/revoke all on function work\.accept_quote\(/);
    });
  });
});
