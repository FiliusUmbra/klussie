// Keeps 0147_conversation_contract.sql (Platform Activation Slice 2, WP 2.6 —
// Conversations) inside its own stated rules: five caller-checked wrappers, each
// delegating entirely to its unmodified 0096 counterpart; identity is always resolved
// from public.current_identity(), never taken as a caller-supplied parameter;
// open_conversation()/add_participant()/remove_participant()/close_conversation()/
// conversation_roster() get no wrapper at all.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0147_conversation_contract.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName, code) {
  const start = code.indexOf(`create or replace function ${functionName}`);
  const end = code.indexOf("$$;", start);
  return code.slice(start, end);
}

describe("0147_conversation_contract migration", () => {
  it("never redefines any of 0096's own eleven functions", () => {
    for (const fn of [
      "open_conversation", "add_participant", "remove_participant", "close_conversation", "conversation_roster",
    ]) {
      expect(codeNoComments).not.toMatch(new RegExp(`create or replace function work\\.${fn}\\(`));
    }
  });

  it("builds no api.* delegate for open_conversation/add_participant/remove_participant/close_conversation/conversation_roster", () => {
    for (const fn of ["open_conversation", "add_participant", "remove_participant", "close_conversation", "conversation_roster"]) {
      expect(codeNoComments).not.toMatch(new RegExp(`create or replace function api\\.${fn}\\(`));
    }
  });

  describe("work.send_message_for_caller()", () => {
    const block = bodyOf("work.send_message_for_caller", codeNoComments);

    it("resolves the sender from public.current_identity(), never a caller-supplied person_ref", () => {
      expect(block).toMatch(/select person_ref into v_sender_person_ref from public\.current_identity\(\)/);
      const sigStart = codeNoComments.indexOf("create or replace function work.send_message_for_caller(");
      const sigEnd = codeNoComments.indexOf(")\nreturns void", sigStart);
      const signature = codeNoComments.slice(sigStart, sigEnd + 1);
      expect(signature).not.toMatch(/p_sender_person_ref/);
    });

    it("checks real, active participation before sending", () => {
      expect(block).toMatch(/cp\.person_ref = v_sender_person_ref/);
      expect(block).toMatch(/cp\.left_at is null/);
      expect(block).toMatch(/errcode = 'insufficient_privilege'/);
    });

    it("delegates entirely to the unmodified work.send_message()", () => {
      expect(block).toMatch(/perform work\.send_message\(/);
    });
  });

  describe("work.save_message_translation_for_caller()", () => {
    const block = bodyOf("work.save_message_translation_for_caller", codeNoComments);

    it("resolves the message's own conversation before checking participation", () => {
      expect(block).toMatch(/select conversation_id into v_conversation_id from work\.messages where id = p_message_id/);
    });

    it("delegates entirely to the unmodified work.save_message_translation()", () => {
      expect(block).toMatch(/perform work\.save_message_translation\(/);
    });
  });

  describe("work.mark_conversation_read_for_caller() and work.my_conversations_for_caller()", () => {
    it("mark_conversation_read_for_caller() takes no p_person_ref parameter at all", () => {
      const sigStart = codeNoComments.indexOf("create or replace function work.mark_conversation_read_for_caller(");
      const sigEnd = codeNoComments.indexOf(")", sigStart);
      const signature = codeNoComments.slice(sigStart, sigEnd + 1);
      expect(signature).not.toMatch(/p_person_ref/);
    });

    it("my_conversations_for_caller() takes no parameters at all", () => {
      expect(codeNoComments).toMatch(/create or replace function work\.my_conversations_for_caller\(\)/);
    });

    it("both resolve identity from public.current_identity()", () => {
      expect(bodyOf("work.mark_conversation_read_for_caller", codeNoComments)).toMatch(/from public\.current_identity\(\)/);
      expect(bodyOf("work.my_conversations_for_caller", codeNoComments)).toMatch(/from public\.current_identity\(\)/);
    });

    it("my_conversations_for_caller() returns empty, not an error, when the caller has no real identity", () => {
      const block = bodyOf("work.my_conversations_for_caller", codeNoComments);
      expect(block).toMatch(/if v_person_ref is null then\s*\n\s*return;/);
    });
  });

  describe("work.conversation_messages_for_caller() — ports 0094's own isolation predicate", () => {
    const block = bodyOf("work.conversation_messages_for_caller", codeNoComments);

    it("checks real, active participation the same way 0094's RLS policy does", () => {
      expect(block).toMatch(
        /m\.conversation_id in \(\s*\n\s*select cp\.conversation_id from work\.conversation_participants cp/
      );
      expect(block).toMatch(/cp\.person_ref in \(select person_ref from public\.current_identity\(\)\)/);
      expect(block).toMatch(/cp\.left_at is null/);
    });
  });

  describe("delegation shape", () => {
    const workFns = [
      "send_message_for_caller", "save_message_translation_for_caller", "mark_conversation_read_for_caller",
      "my_conversations_for_caller", "conversation_messages_for_caller",
    ];
    for (const fn of workFns) {
      it(`work.${fn}() is not SECURITY DEFINER`, () => {
        expect(bodyOf(`work.${fn}`, codeNoComments)).not.toMatch(/security definer/i);
      });
    }

    const apiFns = ["send_message", "save_message_translation", "mark_conversation_read", "my_conversations", "conversation_messages"];
    for (const fn of apiFns) {
      it(`api.${fn}() is a thin SECURITY DEFINER pass-through calling work.${fn}_for_caller()`, () => {
        const block = bodyOf(`api.${fn}`, codeNoComments);
        expect(block).toMatch(/security definer/i);
        expect(block).toMatch(new RegExp(`work\\.${fn}_for_caller\\(`));
      });
    }
  });

  describe("access", () => {
    it("grants every api.* delegate to authenticated only, after an explicit revoke", () => {
      expect((codeNoComments.match(/grant execute on function api\./g) || []).length).toBe(5);
      expect((codeNoComments.match(/revoke all on function api\./g) || []).length).toBe(5);
    });

    it("revokes every *_for_caller() function from every role, including authenticated", () => {
      expect((codeNoComments.match(/revoke all on function work\.\w+_for_caller/g) || []).length).toBe(5);
    });

    it("does not touch 0096's own grants to klussie_engine_work", () => {
      expect(codeNoComments).not.toMatch(/grant execute on function work\.send_message\(/);
      expect(codeNoComments).not.toMatch(/revoke all on function work\.send_message\(/);
    });
  });
});
