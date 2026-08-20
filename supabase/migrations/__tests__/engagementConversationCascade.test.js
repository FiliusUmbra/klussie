// Keeps 0148_engagement_conversation_cascade.sql (Platform Activation Slice 2, WP 2.6)
// inside its own stated rules: both engagement-creation paths (manual accept and the
// auto-accept cascade) open a conversation via the same shared helper; every
// signature-changed function is dropped before being recreated, so no zombie overload of
// 0146's own shorter signatures survives; every dropped function's grants are restated.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0148_engagement_conversation_cascade.sql";

const raw = readFileSync(MIGRATION, "utf8");
const codeNoComments = raw
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName, code) {
  const start = code.indexOf(`create or replace function ${functionName}`);
  const end = code.indexOf("$$;", start);
  return code.slice(start, end);
}

describe("0148_engagement_conversation_cascade migration", () => {
  describe("workspace.resolve_owner_person_ref()", () => {
    const block = bodyOf("workspace.resolve_owner_person_ref", codeNoComments);

    it("resolves the workspace's real owner membership, active only", () => {
      expect(block).toMatch(/m\.role = 'owner'/);
      expect(block).toMatch(/m\.state = 'active'/);
    });

    it("is granted to no application role", () => {
      expect(codeNoComments).toMatch(
        /revoke all on function workspace\.resolve_owner_person_ref\(uuid\) from public, anon, authenticated, service_role/
      );
    });
  });

  describe("work.open_conversation_for_engagement()", () => {
    const block = bodyOf("work.open_conversation_for_engagement", codeNoComments);

    it("resolves both real parties from the engagement row, not caller-supplied ids", () => {
      expect(block).toMatch(
        /select requesting_workspace_id, performing_workspace_id\s*\n\s*into v_requesting_ws, v_performing_ws\s*\n\s*from work\.engagements where id = p_engagement_id/
      );
    });

    it("resolves person_ref via workspace.resolve_owner_person_ref() for both sides", () => {
      expect(block).toMatch(/v_customer_person_ref := workspace\.resolve_owner_person_ref\(v_requesting_ws\)/);
      expect(block).toMatch(/v_pro_person_ref := workspace\.resolve_owner_person_ref\(v_performing_ws\)/);
    });

    it("opens the conversation bound to the engagement, and delegates to the unmodified work.open_conversation()/work.add_participant()", () => {
      expect(block).toMatch(/perform work\.open_conversation\(/);
      expect(block).toMatch(/p_engagement_id => p_engagement_id/);
      expect((block.match(/perform work\.add_participant\(/g) || []).length).toBe(2);
    });
  });

  it("drops 0146's own shorter-signature functions before recreating them — no zombie overload survives", () => {
    expect(codeNoComments).toMatch(
      /drop function if exists work\.accept_quote_for_caller\(uuid, uuid, uuid, uuid, uuid, uuid, platform\.actor_type, text\)/
    );
    expect(codeNoComments).toMatch(
      /drop function if exists work\.submit_quote_for_caller\(uuid, uuid, uuid, numeric, text, uuid, uuid, uuid, uuid, uuid, platform\.actor_type, text\)/
    );
    expect(codeNoComments).toMatch(
      /drop function if exists api\.accept_quote\(uuid, uuid, uuid, uuid, uuid, uuid, platform\.actor_type, text\)/
    );
    expect(codeNoComments).toMatch(
      /drop function if exists api\.submit_quote\(uuid, uuid, uuid, numeric, text, uuid, uuid, uuid, uuid, uuid, platform\.actor_type, text\)/
    );
  });

  describe("work.accept_quote_for_caller() — redefined", () => {
    const block = bodyOf("work.accept_quote_for_caller", codeNoComments);

    it("keeps its own real membership check from 0146, unchanged", () => {
      expect(block).toMatch(
        /select 1 from workspace\.current_memberships\(\) m where m\.workspace_id = v_requesting_ws/
      );
    });

    it("delegates the accept itself to the unmodified work.accept_quote(), then opens the conversation", () => {
      const acceptIdx = block.indexOf("perform work.accept_quote(");
      const cascadeIdx = block.indexOf("perform work.open_conversation_for_engagement(");
      expect(acceptIdx).toBeGreaterThan(-1);
      expect(cascadeIdx).toBeGreaterThan(acceptIdx);
    });
  });

  describe("work.submit_quote_for_caller() — redefined, price stays numeric", () => {
    const block = bodyOf("work.submit_quote_for_caller", codeNoComments);

    it("still declares p_price as numeric, not uuid", () => {
      const sigStart = codeNoComments.indexOf("create or replace function work.submit_quote_for_caller(");
      const sigEnd = codeNoComments.indexOf(")\nreturns void", sigStart);
      const signature = codeNoComments.slice(sigStart, sigEnd);
      expect(signature).toMatch(/p_price\s+numeric/);
    });

    it("the auto-accept branch calls open_conversation_for_engagement() after work.accept_quote(), inside the same if", () => {
      const ifIdx = block.indexOf("if v_directed_ws is not null");
      const acceptIdx = block.indexOf("perform work.accept_quote(");
      const cascadeIdx = block.indexOf("perform work.open_conversation_for_engagement(");
      expect(acceptIdx).toBeGreaterThan(ifIdx);
      expect(cascadeIdx).toBeGreaterThan(acceptIdx);
    });

    it("attributes the cascade's conversation-opening to actor_type = 'system', matching the accept it follows", () => {
      const cascadeBlock = block.slice(block.indexOf("perform work.open_conversation_for_engagement("));
      expect(cascadeBlock).toMatch(/p_actor_type => 'system'/);
    });
  });

  describe("api delegates and grants restated after the drop", () => {
    it("api.accept_quote()/api.submit_quote() both pass through to the *_for_caller() functions, still SECURITY DEFINER", () => {
      const accept = bodyOf("api.accept_quote", codeNoComments);
      expect(accept).toMatch(/security definer/i);
      expect(accept).toMatch(/work\.accept_quote_for_caller\(/);

      const submit = bodyOf("api.submit_quote", codeNoComments);
      expect(submit).toMatch(/security definer/i);
      expect(submit).toMatch(/work\.submit_quote_for_caller\(/);
    });

    it("re-grants both api.* delegates to authenticated after the drop", () => {
      expect(codeNoComments).toMatch(/grant execute on function api\.accept_quote\([^)]+\) to authenticated/);
      expect(codeNoComments).toMatch(/grant execute on function api\.submit_quote\([^)]+\) to authenticated/);
    });

    it("keeps both *_for_caller() work functions unreachable by any application role", () => {
      expect(codeNoComments).toMatch(
        /revoke all on function work\.accept_quote_for_caller\([^)]+\) from public, anon, authenticated, service_role/
      );
      expect(codeNoComments).toMatch(
        /revoke all on function work\.submit_quote_for_caller\([^)]+\) from public, anon, authenticated, service_role/
      );
    });
  });
});
