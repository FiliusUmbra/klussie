// Keeps 0157_conversation_read_shape.sql (Platform Activation Slice 2, WP 2.6, client
// cutover) inside its own stated rules: my_conversations() is dropped by its exact prior
// (8-column) signature before being recreated with three additive columns, and the new
// counterpart resolver is gated by real, active co-participation — never a caller-supplied
// person_ref, never a loosened version of 0151's own professional-only restriction.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0157_conversation_read_shape.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName, code) {
  const start = code.indexOf(`create or replace function ${functionName}`);
  const end = code.indexOf("$$;", start);
  return code.slice(start, end);
}

describe("0157_conversation_read_shape migration", () => {
  it("drops the prior 8-column my_conversations signatures before recreating them", () => {
    expect(codeNoComments).toMatch(/drop function if exists work\.my_conversations\(uuid\)/);
    expect(codeNoComments).toMatch(/drop function if exists work\.my_conversations_for_caller\(\)/);
    expect(codeNoComments).toMatch(/drop function if exists api\.my_conversations\(\)/);
  });

  describe("work.my_conversations()", () => {
    const block = bodyOf("work.my_conversations", codeNoComments);

    it("keeps the original four subject columns and closed_at/created_at unchanged", () => {
      for (const col of ["c.id", "c.engagement_id", "c.asset_id", "c.maintenance_obligation_id", "c.property_id", "c.workspace_id", "c.closed_at", "c.created_at"]) {
        expect(block, `missing column: ${col}`).toContain(col);
      }
    });

    it("resolves service_id/request_id through engagement_id, not a caller-supplied value", () => {
      expect(block).toMatch(/left join work\.engagements e on e\.id = c\.engagement_id/);
      expect(block).toMatch(/left join work\.requests r on r\.id = e\.request_id/);
      expect(block).toContain("r.service_id");
      expect(block).toContain("e.request_id");
    });

    it("resolves counterpart_workspace_id from a real, active co-participant, excluding the caller's own row", () => {
      expect(block).toMatch(/cp_other\.conversation_id = c\.id/);
      expect(block).toMatch(/cp_other\.person_ref <> p_person_ref/);
      expect(block).toMatch(/cp_other\.left_at is null/);
    });

    it("carries last_read_at from the same participants join already performed, not a new one", () => {
      expect(block).toMatch(/join work\.conversation_participants cp on cp\.conversation_id = c\.id/);
      expect(block).toContain("cp.last_read_at");
      // Exactly one join to conversation_participants for the caller's own row — the
      // counterpart is resolved via the correlated subquery above, not a second top-level join.
      expect((block.match(/join work\.conversation_participants/g) || []).length).toBe(1);
    });
  });

  it("work.my_conversations_for_caller() resolves person_ref internally and returns nothing for no identity", () => {
    const block = bodyOf("work.my_conversations_for_caller", codeNoComments);
    expect(block).toMatch(/select person_ref into v_person_ref from public\.current_identity\(\)/);
    expect(block).toMatch(/if v_person_ref is null then\s*\n\s*return;/);
    expect(block).toMatch(/select \* from work\.my_conversations\(v_person_ref\)/);
  });

  it("api.my_conversations() is a thin SECURITY DEFINER pass-through", () => {
    const block = bodyOf("api.my_conversations", codeNoComments);
    expect(block).toMatch(/security definer/i);
    expect(block).toMatch(/select \* from work\.my_conversations_for_caller\(\)/);
  });

  describe("work.resolve_conversation_counterpart_auth_ids()", () => {
    const block = bodyOf("work.resolve_conversation_counterpart_auth_ids", codeNoComments);

    it("resolves the caller's own identity internally, never a caller-supplied person_ref", () => {
      expect(block).toMatch(/select person_ref into v_person_ref from public\.current_identity\(\)/);
      expect(block).not.toMatch(/p_person_ref/);
    });

    it("gates on real, active co-participation in a shared conversation — the caller's own row and the target's", () => {
      expect(block).toMatch(/join work\.conversation_participants cp_other\s*\n\s*on cp_other\.conversation_id = cp_mine\.conversation_id/);
      expect(block).toMatch(/cp_other\.workspace_id = any\(p_workspace_ids\)/);
      expect(block).toMatch(/cp_other\.left_at is null/);
      expect(block).toMatch(/cp_mine\.person_ref = v_person_ref/);
      expect(block).toMatch(/cp_mine\.left_at is null/);
    });

    it("excludes an erased identity, matching every other real-name resolver in this codebase", () => {
      expect(block).toMatch(/i\.erased_at is null/);
    });
  });

  it("api.resolve_conversation_counterpart_auth_ids() is a thin SECURITY DEFINER pass-through", () => {
    const block = bodyOf("api.resolve_conversation_counterpart_auth_ids", codeNoComments);
    expect(block).toMatch(/security definer/i);
    expect(block).toMatch(/select \* from work\.resolve_conversation_counterpart_auth_ids\(p_workspace_ids\)/);
  });

  it("grants both api delegates to authenticated only, after an explicit revoke", () => {
    expect(codeNoComments).toMatch(/revoke all on function api\.my_conversations\(\) from public, anon, service_role/);
    expect(codeNoComments).toMatch(/grant execute on function api\.my_conversations\(\) to authenticated/);
    expect(codeNoComments).toMatch(
      /revoke all on function api\.resolve_conversation_counterpart_auth_ids\(uuid\[\]\) from public, anon, service_role/
    );
    expect(codeNoComments).toMatch(
      /grant execute on function api\.resolve_conversation_counterpart_auth_ids\(uuid\[\]\) to authenticated/
    );
  });

  it("keeps every work-layer function unreachable by any application role", () => {
    expect(codeNoComments).toMatch(
      /revoke all on function work\.my_conversations\(uuid\) from public, anon, authenticated, service_role/
    );
    expect(codeNoComments).toMatch(
      /revoke all on function work\.my_conversations_for_caller\(\) from public, anon, authenticated, service_role/
    );
    expect(codeNoComments).toMatch(
      /revoke all on function work\.resolve_conversation_counterpart_auth_ids\(uuid\[\]\) from public, anon, authenticated, service_role/
    );
    expect(codeNoComments).toMatch(
      /revoke all on function work\.conversation_messages\(uuid\) from public, anon, authenticated, service_role/
    );
    expect(codeNoComments).toMatch(
      /revoke all on function work\.conversation_messages_for_caller\(uuid\) from public, anon, authenticated, service_role/
    );
  });

  it("drops the prior 9-column conversation_messages signatures before recreating them", () => {
    expect(codeNoComments).toMatch(/drop function if exists work\.conversation_messages\(uuid\)/);
    expect(codeNoComments).toMatch(/drop function if exists work\.conversation_messages_for_caller\(uuid\)/);
    expect(codeNoComments).toMatch(/drop function if exists api\.conversation_messages\(uuid\)/);
  });

  describe("work.conversation_messages() / work.conversation_messages_for_caller()", () => {
    it("resolves sender_auth_user_id via a plain join to identity.identities, erasure-safe", () => {
      for (const fn of ["work.conversation_messages", "work.conversation_messages_for_caller"]) {
        const block = bodyOf(fn, codeNoComments);
        expect(block, `${fn} missing join`).toMatch(
          /left join identity\.identities i on i\.person_ref = m\.sender_person_ref and i\.erased_at is null/
        );
        expect(block, `${fn} missing column`).toContain("i.auth_user_id");
      }
    });

    it("conversation_messages_for_caller() keeps 0094's own membership predicate unchanged", () => {
      const block = bodyOf("work.conversation_messages_for_caller", codeNoComments);
      expect(block).toMatch(
        /cp\.person_ref in \(select person_ref from public\.current_identity\(\)\)\s*\n\s*and cp\.left_at is null/
      );
    });
  });

  it("api.conversation_messages() is a thin SECURITY DEFINER pass-through", () => {
    const block = bodyOf("api.conversation_messages", codeNoComments);
    expect(block).toMatch(/security definer/i);
    expect(block).toMatch(/select \* from work\.conversation_messages_for_caller\(p_conversation_id\)/);
  });

  it("grants api.conversation_messages() to authenticated only, after an explicit revoke", () => {
    expect(codeNoComments).toMatch(/revoke all on function api\.conversation_messages\(uuid\) from public, anon, service_role/);
    expect(codeNoComments).toMatch(/grant execute on function api\.conversation_messages\(uuid\) to authenticated/);
  });
});
