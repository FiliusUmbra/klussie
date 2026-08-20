// Keeps 0150_marketplace_dual_write.sql (Platform Activation Slice 2, WP 2.6) inside its
// own stated rules: create_request_for_caller()/submit_quote_for_caller() gain one new
// optional legacy-correlation parameter each, patched in via a follow-up UPDATE rather
// than passed into the unmodified work.create_request()/work.submit_quote(); every
// signature-changed function is dropped by its exact prior signature first, and its
// grants restated.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0150_marketplace_dual_write.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName, code) {
  const start = code.indexOf(`create or replace function ${functionName}`);
  const end = code.indexOf("$$;", start);
  return code.slice(start, end);
}

describe("0150_marketplace_dual_write migration", () => {
  describe("work.request_lifecycle_statuses()", () => {
    const block = bodyOf("work.request_lifecycle_statuses", codeNoComments);

    it("takes a batch of legacy ids and returns each correlated work.requests row's status", () => {
      expect(block).toMatch(/p_service_request_ids uuid\[\]/);
      expect(block).toMatch(/r\.service_request_id = any\(p_service_request_ids\)/);
    });

    it("is granted to no application role", () => {
      expect(codeNoComments).toMatch(
        /revoke all on function work\.request_lifecycle_statuses\(uuid\[\]\) from public, anon, authenticated, service_role/
      );
    });
  });

  it("drops the pre-0150 signatures before recreating them — 0148's own discipline, applied again", () => {
    expect(codeNoComments).toMatch(
      /drop function if exists work\.create_request_for_caller\(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, uuid, numeric, uuid, uuid, platform\.actor_type, text\)/
    );
    expect(codeNoComments).toMatch(
      /drop function if exists api\.create_request\(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, uuid, numeric, uuid, uuid, platform\.actor_type, text\)/
    );
    expect(codeNoComments).toMatch(
      /drop function if exists work\.submit_quote_for_caller\(uuid, uuid, uuid, numeric, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, platform\.actor_type, text\)/
    );
    expect(codeNoComments).toMatch(
      /drop function if exists api\.submit_quote\(uuid, uuid, uuid, numeric, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, platform\.actor_type, text\)/
    );
  });

  describe("work.create_request_for_caller() — gains p_service_request_id", () => {
    const block = bodyOf("work.create_request_for_caller", codeNoComments);

    it("keeps its own real membership check unchanged", () => {
      expect(block).toMatch(
        /select 1 from workspace\.current_memberships\(\) m where m\.workspace_id = p_requesting_workspace_id/
      );
    });

    it("never passes the legacy id into the unmodified work.create_request()", () => {
      const insertCallStart = block.indexOf("perform work.create_request(");
      const insertCallEnd = block.indexOf(");", insertCallStart);
      const insertCall = block.slice(insertCallStart, insertCallEnd);
      expect(insertCall).not.toMatch(/p_service_request_id/);
    });

    it("patches service_request_id in via a follow-up UPDATE, only when given", () => {
      expect(block).toMatch(/if p_service_request_id is not null then/);
      expect(block).toMatch(/set service_request_id = p_service_request_id/);
    });
  });

  describe("work.submit_quote_for_caller() — gains p_legacy_quote_id", () => {
    const block = bodyOf("work.submit_quote_for_caller", codeNoComments);

    it("never passes the legacy id into the unmodified work.submit_quote()", () => {
      const insertCallStart = block.indexOf("perform work.submit_quote(");
      const insertCallEnd = block.indexOf(");", insertCallStart);
      const insertCall = block.slice(insertCallStart, insertCallEnd);
      expect(insertCall).not.toMatch(/p_legacy_quote_id/);
    });

    it("patches legacy_quote_id in via a follow-up UPDATE, only when given, before the auto-accept branch", () => {
      const patchIdx = block.indexOf("if p_legacy_quote_id is not null then");
      const autoAcceptIdx = block.indexOf("if v_directed_ws is not null");
      expect(patchIdx).toBeGreaterThan(-1);
      expect(autoAcceptIdx).toBeGreaterThan(patchIdx);
      expect(block).toMatch(/set legacy_quote_id = p_legacy_quote_id/);
    });

    it("still runs the auto-accept cascade with the conversation-opening call, unchanged from 0148", () => {
      expect(block).toMatch(/perform work\.accept_quote\(/);
      expect(block).toMatch(/perform work\.open_conversation_for_engagement\(/);
    });
  });

  describe("delegates and access", () => {
    it("api.create_request()/api.submit_quote() both pass p_service_request_id/p_legacy_quote_id straight through", () => {
      const createBlock = bodyOf("api.create_request", codeNoComments);
      expect(createBlock).toMatch(/security definer/i);
      expect(createBlock).toMatch(/work\.create_request_for_caller\(/);

      const submitBlock = bodyOf("api.submit_quote", codeNoComments);
      expect(submitBlock).toMatch(/security definer/i);
      expect(submitBlock).toMatch(/work\.submit_quote_for_caller\(/);
    });

    it("re-grants both api.* delegates to authenticated after the drop", () => {
      expect(codeNoComments).toMatch(/grant execute on function api\.create_request\([^)]+\) to authenticated/);
      expect(codeNoComments).toMatch(/grant execute on function api\.submit_quote\([^)]+\) to authenticated/);
    });

    it("keeps both *_for_caller() work functions unreachable by any application role", () => {
      expect(codeNoComments).toMatch(
        /revoke all on function work\.create_request_for_caller\([^)]+\) from public, anon, authenticated, service_role/
      );
      expect(codeNoComments).toMatch(
        /revoke all on function work\.submit_quote_for_caller\([^)]+\) from public, anon, authenticated, service_role/
      );
    });

    it("never touches work.create_request()/work.submit_quote() themselves", () => {
      expect(codeNoComments).not.toMatch(/create or replace function work\.create_request\(/);
      expect(codeNoComments).not.toMatch(/create or replace function work\.submit_quote\(/);
    });
  });
});
