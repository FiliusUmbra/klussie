// Keeps 0196_directed_auto_accept_bypasses_disclosure.sql inside the exact shape its own
// header commits to: a new, internal-only helper that auto-approves location disclosure
// for a directed booking's auto-accept cascade, wired into work.submit_quote_for_caller()
// with no signature change to either function. Structural, like every migration test in
// this repository (docs/engineering/TESTING.md §3) -- behaviour is proven against real
// staging data (a real directed request reaching 'booked' with no live customer approval
// call) and captured in the PR description, not re-derived here.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0196_directed_auto_accept_bypasses_disclosure.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName) {
  const start = codeNoComments.indexOf(`create or replace function ${functionName}`);
  expect(start).toBeGreaterThan(-1);
  const end = codeNoComments.indexOf("\n$$;", start);
  return codeNoComments.slice(start, end);
}

describe("0196_directed_auto_accept_bypasses_disclosure migration", () => {
  describe("work.auto_approve_location_disclosure_for_directed_booking()", () => {
    it("takes no caller-supplied disclosure id -- exactly engagement, event, correlation", () => {
      expect(codeNoComments).toMatch(
        /create or replace function work\.auto_approve_location_disclosure_for_directed_booking\(\s*\n\s*p_engagement_id uuid,\s*\n\s*p_engagement_event_id uuid,\s*\n\s*p_correlation_id uuid\s*\n\)/
      );
    });

    it("generates its own disclosure row id via gen_random_uuid(), never a parameter", () => {
      const block = bodyOf("work.auto_approve_location_disclosure_for_directed_booking");
      expect(block).toMatch(/insert into work\.location_disclosures \(/);
      expect(block).toMatch(/gen_random_uuid\(\), v_request_id, v_quote_id, v_requesting_ws, v_performing_ws, v_approver/);
    });

    it("resolves approved_by from the requesting workspace's own active owner, never auth.uid()", () => {
      const block = bodyOf("work.auto_approve_location_disclosure_for_directed_booking");
      expect(block).toMatch(/from workspace\.memberships m\s*\n\s*where m\.workspace_id = v_requesting_ws and m\.role = 'owner' and m\.state = 'active'/);
      expect(block).not.toMatch(/auth\.uid\(\)/);
    });

    it("fails closed with object_not_in_prerequisite_state when no active owner resolves", () => {
      const block = bodyOf("work.auto_approve_location_disclosure_for_directed_booking");
      expect(block).toMatch(/if v_approver is null then/);
      expect(block).toMatch(/object_not_in_prerequisite_state/);
    });

    it("transitions the engagement to active and the request to booked", () => {
      const block = bodyOf("work.auto_approve_location_disclosure_for_directed_booking");
      expect(block).toMatch(/update work\.engagements set status = 'active' where id = p_engagement_id;/);
      expect(block).toMatch(/update work\.requests set status = 'booked'/);
    });

    it("emits marketplace.engagement.created, the same event approve_location_disclosure() emits", () => {
      const block = bodyOf("work.auto_approve_location_disclosure_for_directed_booking");
      expect(block).toMatch(/p_event_type\s+=> 'marketplace\.engagement\.created'/);
      expect(block).toMatch(/p_actor_type\s+=> 'system'/);
      expect(block).toMatch(/p_actor_ref\s+=> 'directed_booking_auto_accept'/);
    });

    it("is granted to nobody -- revoked from public, anon, authenticated, and service_role", () => {
      expect(codeNoComments).toMatch(
        /revoke all on function work\.auto_approve_location_disclosure_for_directed_booking\(uuid, uuid, uuid\)\s*\n\s*from public, anon, authenticated, service_role;/
      );
    });
  });

  describe("work.submit_quote_for_caller() -- unchanged signature", () => {
    it("keeps the exact same 19-parameter signature as before", () => {
      expect(codeNoComments).toMatch(
        /create or replace function work\.submit_quote_for_caller\(p_quote_id uuid, p_request_id uuid, p_offering_workspace_id uuid, p_price numeric, p_message text, p_legacy_quote_id uuid, p_event_id uuid, p_correlation_id uuid, p_auto_accept_engagement_id uuid, p_auto_accept_event_id uuid, p_auto_accept_engagement_event_id uuid, p_auto_accept_conversation_id uuid, p_auto_accept_customer_participant_id uuid, p_auto_accept_pro_participant_id uuid, p_auto_accept_conversation_event_id uuid, p_auto_accept_customer_participant_event_id uuid, p_auto_accept_pro_participant_event_id uuid, p_actor_type platform\.actor_type, p_actor_ref text\)/
      );
    });

    it("calls the new auto-approval helper between accept_quote() and open_conversation_for_engagement()", () => {
      const block = bodyOf("work.submit_quote_for_caller");
      const acceptIdx = block.indexOf("work.accept_quote(");
      const autoApproveIdx = block.indexOf("work.auto_approve_location_disclosure_for_directed_booking(");
      const conversationIdx = block.indexOf("work.open_conversation_for_engagement(");
      expect(acceptIdx).toBeGreaterThan(-1);
      expect(autoApproveIdx).toBeGreaterThan(acceptIdx);
      expect(conversationIdx).toBeGreaterThan(autoApproveIdx);
    });

    it("reuses p_auto_accept_engagement_event_id for the new call -- no new parameter threaded through", () => {
      const block = bodyOf("work.submit_quote_for_caller");
      const start = block.indexOf("work.auto_approve_location_disclosure_for_directed_booking(");
      const callBlock = block.slice(start, block.indexOf(");", start));
      expect(callBlock).toMatch(/p_engagement_id\s+=> p_auto_accept_engagement_id/);
      expect(callBlock).toMatch(/p_engagement_event_id\s+=> p_auto_accept_engagement_event_id/);
      expect(callBlock).toMatch(/p_correlation_id\s+=> p_correlation_id/);
    });

    it("keeps the auto-accept condition (directed workspace, window, price ceiling) unchanged", () => {
      const block = bodyOf("work.submit_quote_for_caller");
      expect(block).toMatch(/v_directed_ws is not null/);
      expect(block).toMatch(/v_directed_ws = p_offering_workspace_id/);
      expect(block).toMatch(/v_directed_until > now\(\)/);
      expect(block).toMatch(/p_price <= v_auto_accept_max/);
    });
  });

  it("touches no other function, grant, or table structure", () => {
    const defineCount = (codeNoComments.match(/create or replace function/g) || []).length;
    expect(defineCount).toBe(2);
    expect(codeNoComments).not.toMatch(/\bcreate\s+table\b|\bdrop\s+table\b|\balter\s+table\b/i);
    expect(codeNoComments).not.toMatch(/\bcreate policy\b|\bdrop policy\b/i);
  });
});
