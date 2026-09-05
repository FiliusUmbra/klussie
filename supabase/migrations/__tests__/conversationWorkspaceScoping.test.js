// Keeps 0197_conversation_workspace_scoping.sql inside the exact shape its own header
// commits to: every client-facing conversation read/write function now takes an explicit
// active-workspace parameter, checks it against the caller's own real memberships AND a
// genuine (conversation, person, workspace) participant row, resolves person server-side
// (never trusts a caller-supplied one), and RLS on the underlying tables is left
// completely untouched (person-level defense in depth, unchanged). Structural, like every
// migration test in this repository (docs/engineering/TESTING.md §3) -- the live,
// end-to-end proof (the real Cathy/Pierre cross-workspace leak, closed) is run against
// staging and captured in the PR description, not re-derived here.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0197_conversation_workspace_scoping.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName) {
  const start = codeNoComments.indexOf(`create or replace function ${functionName}`);
  const startPlain = codeNoComments.indexOf(`create function ${functionName}`);
  const realStart = start > -1 ? start : startPlain;
  expect(realStart).toBeGreaterThan(-1);
  const end = codeNoComments.indexOf("\n$$;", realStart);
  return codeNoComments.slice(realStart, end);
}

const MEMBERSHIP_CHECK = /exists \(\s*select 1 from workspace\.current_memberships\(\) m where m\.workspace_id/;
const PARTICIPANT_TUPLE_CHECK = "from work.conversation_participants cp";

function containsMembershipCheck(block) {
  return MEMBERSHIP_CHECK.test(block);
}

describe("0197_conversation_workspace_scoping migration", () => {
  describe("work.my_conversations(person, workspace)", () => {
    it("drops the old person-only overload before recreating with the workspace tuple", () => {
      expect(codeNoComments).toMatch(/drop function if exists work\.my_conversations\(uuid\);/);
    });

    it("filters by both person_ref and workspace_id, not person alone", () => {
      const block = bodyOf("work.my_conversations(p_person_ref uuid, p_workspace_id uuid)");
      expect(block).toMatch(/cp\.person_ref = p_person_ref/);
      expect(block).toMatch(/cp\.workspace_id = p_workspace_id/);
    });
  });

  describe("work.my_conversations_for_caller(workspace)", () => {
    it("validates the supplied workspace against the caller's own real memberships", () => {
      const block = bodyOf("work.my_conversations_for_caller(p_workspace_id uuid)");
      expect(containsMembershipCheck(block)).toBe(true);
    });

    it("resolves person_ref server-side via public.current_identity(), never a parameter", () => {
      const block = bodyOf("work.my_conversations_for_caller(p_workspace_id uuid)");
      expect(block).toMatch(/from public\.current_identity\(\)/);
      expect(codeNoComments).not.toMatch(/my_conversations_for_caller\(p_person_ref/);
    });
  });

  describe("api.my_conversations(workspace)", () => {
    it("takes exactly one parameter -- the active workspace -- and delegates to the caller wrapper", () => {
      const block = bodyOf("api.my_conversations(p_workspace_id uuid)");
      expect(block).toMatch(/work\.my_conversations_for_caller\(p_workspace_id\)/);
    });

    it("is re-granted to authenticated only, after the drop that would otherwise lose its grants", () => {
      expect(codeNoComments).toMatch(
        /revoke all on function api\.my_conversations\(uuid\) from public, anon, service_role;/
      );
      expect(codeNoComments).toMatch(/grant execute on function api\.my_conversations\(uuid\) to authenticated;/);
    });
  });

  describe("work.conversation_messages_for_caller(conversation, workspace)", () => {
    it("checks membership, then the exact (conversation, person, workspace) participant tuple", () => {
      const block = bodyOf("work.conversation_messages_for_caller(p_conversation_id uuid, p_workspace_id uuid)");
      expect(containsMembershipCheck(block)).toBe(true);
      expect(block).toContain(PARTICIPANT_TUPLE_CHECK);
      expect(block).toMatch(/cp\.conversation_id = p_conversation_id/);
      expect(block).toMatch(/cp\.workspace_id = p_workspace_id/);
      expect(block).toMatch(/cp\.left_at is null/);
    });

    it("leaves the underlying unauthorized fetch, work.conversation_messages(), completely untouched", () => {
      expect(codeNoComments).not.toMatch(/create (or replace )?function work\.conversation_messages\(p_conversation_id uuid\)\s*\nreturns/);
    });
  });

  describe("work.mark_conversation_read(conversation, person, workspace)", () => {
    it("updates only the row matching all three: conversation, person, and workspace", () => {
      const block = bodyOf("work.mark_conversation_read(p_conversation_id uuid, p_person_ref uuid, p_workspace_id uuid)");
      expect(block).toMatch(/where conversation_id = p_conversation_id/);
      expect(block).toMatch(/and person_ref = p_person_ref/);
      expect(block).toMatch(/and workspace_id = p_workspace_id/);
    });
  });

  describe("work.mark_conversation_read_for_caller(conversation, workspace)", () => {
    it("validates workspace membership before marking read", () => {
      const block = bodyOf("work.mark_conversation_read_for_caller(p_conversation_id uuid, p_workspace_id uuid)");
      expect(containsMembershipCheck(block)).toBe(true);
    });

    it("also checks the exact participant tuple explicitly -- membership alone would let the targeted UPDATE silently no-op instead of raising", () => {
      const block = bodyOf("work.mark_conversation_read_for_caller(p_conversation_id uuid, p_workspace_id uuid)");
      expect(block).toContain(PARTICIPANT_TUPLE_CHECK);
      expect(block).toMatch(/cp\.conversation_id = p_conversation_id/);
      expect(block).toMatch(/cp\.workspace_id = p_workspace_id/);
    });
  });

  describe("work.send_message_for_caller() -- signature unchanged, authorization fixed", () => {
    it("keeps the exact same 11-parameter signature it always had", () => {
      expect(codeNoComments).toMatch(
        /create or replace function work\.send_message_for_caller\(p_message_id uuid, p_conversation_id uuid, p_sender_workspace_id uuid, p_body text, p_original_locale text, p_reference_type text, p_reference_id uuid, p_event_id uuid, p_correlation_id uuid, p_actor_type platform\.actor_type, p_actor_ref text\)/
      );
    });

    it("now validates p_sender_workspace_id against real membership AND a genuine participant tuple", () => {
      const start = codeNoComments.indexOf("create or replace function work.send_message_for_caller");
      const end = codeNoComments.indexOf("\n$$;", start);
      const block = codeNoComments.slice(start, end);
      expect(containsMembershipCheck(block)).toBe(true);
      expect(block).toContain(PARTICIPANT_TUPLE_CHECK);
      expect(block).toMatch(/cp\.workspace_id = p_sender_workspace_id/);
    });

    it("does not touch api.send_message() at all -- its signature already had everything needed", () => {
      expect(codeNoComments).not.toMatch(/create (or replace )?function api\.send_message/);
      expect(codeNoComments).not.toMatch(/drop function if exists api\.send_message/);
    });
  });

  describe("work.save_message_translation_for_caller(..., workspace)", () => {
    it("drops the old 7-arg overload before recreating with the workspace parameter added", () => {
      expect(codeNoComments).toMatch(
        /drop function if exists work\.save_message_translation_for_caller\(uuid, text, text, uuid, uuid, platform\.actor_type, text\);/
      );
    });

    it("checks the same membership-plus-participant-tuple pattern as the other authorized calls", () => {
      const block = bodyOf(
        "work.save_message_translation_for_caller(p_message_id uuid, p_locale text, p_text text, p_workspace_id uuid, p_event_id uuid, p_correlation_id uuid, p_actor_type platform.actor_type, p_actor_ref text)"
      );
      expect(containsMembershipCheck(block)).toBe(true);
      expect(block).toContain(PARTICIPANT_TUPLE_CHECK);
    });
  });

  describe("work.resolve_conversation_counterpart_auth_ids(workspace_ids, my_workspace)", () => {
    it("requires the caller's own side of the shared conversation to match the exact active workspace, not any workspace they hold", () => {
      const block = bodyOf(
        "work.resolve_conversation_counterpart_auth_ids(p_workspace_ids uuid[], p_my_workspace_id uuid)"
      );
      expect(block).toMatch(/cp_mine\.workspace_id = p_my_workspace_id/);
      expect(block).toMatch(/cp_mine\.person_ref = v_person_ref/);
    });
  });

  it("RLS on the underlying tables is completely untouched -- person-level defense in depth, unchanged", () => {
    expect(codeNoComments).not.toMatch(/create policy|drop policy|alter policy/i);
    expect(codeNoComments).not.toMatch(/alter table.*enable row level security/i);
  });

  it("touches no table structure, and never trusts a caller-supplied person_ref anywhere", () => {
    expect(codeNoComments).not.toMatch(/\bcreate table\b|\bdrop table\b|\balter table\b/i);
    // Every _for_caller function resolves person_ref from public.current_identity(); none
    // accepts it as a parameter.
    expect(codeNoComments).not.toMatch(/_for_caller\([^)]*p_person_ref/);
  });

  it("re-grants every signature-changed api.* function to authenticated only, never anon", () => {
    const changedApiFns = [
      "api.my_conversations(uuid)",
      "api.conversation_messages(uuid, uuid)",
      "api.mark_conversation_read(uuid, uuid)",
      "api.save_message_translation(uuid, text, text, uuid, uuid, uuid, platform.actor_type, text)",
      "api.resolve_conversation_counterpart_auth_ids(uuid[], uuid)",
    ];
    for (const sig of changedApiFns) {
      const escaped = sig.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(codeNoComments).toMatch(new RegExp(`revoke all on function ${escaped} from public, anon, service_role;`));
      expect(codeNoComments).toMatch(new RegExp(`grant execute on function ${escaped} to authenticated;`));
    }
  });
});
