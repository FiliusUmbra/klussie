// Keeps 0143_property_write_contract_for_caller.sql (Platform Activation Slice 1, WP
// 1.10) inside its own stated rules: property.create_property_for_caller() is a NEW
// function with a real membership check, never a modification to the shared,
// internally-trusted property.create_property() (0135) that handle_new_user()'s Option A
// trigger still calls directly and unchanged; no "already has one" guard (0135's own
// reasoning, unchanged); and every function is reachable only through its own delegate.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0143_property_write_contract_for_caller.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName, code) {
  const start = code.indexOf(`create or replace function ${functionName}`);
  const end = code.indexOf("$$;", start);
  return code.slice(start, end);
}

describe("0143_property_write_contract_for_caller migration", () => {
  it("never redefines property.create_property() itself — that function is untouched", () => {
    expect(codeNoComments).not.toMatch(/create or replace function property\.create_property\(/);
  });

  describe("property.create_property_for_caller()", () => {
    const block = bodyOf("property.create_property_for_caller", codeNoComments);

    it("is not SECURITY DEFINER — it inherits the delegate's context", () => {
      expect(block).not.toMatch(/security definer/i);
    });

    it("checks the caller's real membership in the target steward workspace", () => {
      expect(block).toMatch(
        /select 1 from workspace\.current_memberships\(\) m where m\.workspace_id = p_steward_workspace_id/
      );
    });

    it("raises 'insufficient_privilege', not a distinguishing message", () => {
      expect(block).toMatch(/errcode = 'insufficient_privilege'/);
    });

    it("delegates to the real, unchanged property.create_property() and nothing else", () => {
      expect(block).toMatch(/perform property\.create_property\(/);
    });

    it("carries no 'already has one' guard — §9.1 permits many properties, matching 0135's own reasoning", () => {
      expect(block).not.toMatch(/raise exception[\s\S]*already has/i);
      expect(block).not.toMatch(/select 1 from property\.properties/);
    });
  });

  describe("api.create_property()", () => {
    it("is a thin SECURITY DEFINER pass-through calling property.create_property_for_caller(), never the raw internal function", () => {
      const block = bodyOf("api.create_property", codeNoComments);
      expect(block).toMatch(/security definer/i);
      expect(block).toMatch(/select property\.create_property_for_caller\(/);
      expect(block).not.toMatch(/select property\.create_property\(/);
    });
  });

  describe("access", () => {
    it("revokes property.create_property_for_caller() from every role, including authenticated — reachable only as a nested call", () => {
      expect(codeNoComments).toMatch(
        /revoke all on function property\.create_property_for_caller\(uuid, uuid, text, uuid, uuid, platform\.actor_type, text\)\s*from public, anon, authenticated, service_role/
      );
    });

    it("grants api.create_property() to authenticated only, after an explicit revoke from public/anon/service_role", () => {
      expect(codeNoComments).toMatch(
        /revoke all on function api\.create_property\(uuid, uuid, text, uuid, uuid, platform\.actor_type, text\)\s*from public, anon, service_role/
      );
      expect(codeNoComments).toMatch(
        /grant execute on function api\.create_property\(uuid, uuid, text, uuid, uuid, platform\.actor_type, text\)\s*to authenticated/
      );
    });

    it("does not touch property.create_property()'s own grants — reachable only from handle_new_user()'s own trigger context, unchanged", () => {
      expect(codeNoComments).not.toMatch(
        /revoke all on function property\.create_property\(uuid, uuid, text, uuid, uuid, platform\.actor_type, text\)/
      );
    });

    it("does not re-grant USAGE on schema api — already granted in 0031", () => {
      expect(codeNoComments).not.toMatch(/grant usage on schema api/i);
    });
  });
});
