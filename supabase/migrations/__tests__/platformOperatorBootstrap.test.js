// Keeps 0144_platform_operator_bootstrap.sql (Platform Activation Programme, the Initial
// Platform Operator bootstrap) inside its own stated rules: a reusable, parameterised
// function with no per-environment data baked in, reachable by no application role, and
// never mutating any prior migration.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0144_platform_operator_bootstrap.sql";

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

describe("0144_platform_operator_bootstrap migration", () => {
  it("hardcodes no personal email anywhere in the file, including comments", () => {
    expect(raw).not.toMatch(/vereecken/i);
    expect(raw).not.toMatch(/@gmail\.com/i);
  });

  it("never redefines 0132's capability grant or workspace rows", () => {
    expect(codeNoComments).not.toMatch(/insert into workspace\.workspaces/);
    expect(codeNoComments).not.toMatch(/insert into workspace\.capability_grants/);
  });

  describe("platform.bootstrap_operator(text)", () => {
    const block = bodyOf("platform.bootstrap_operator", codeNoComments);

    it("takes the email as a runtime parameter, not a literal", () => {
      expect(block).toMatch(/p_email text/);
    });

    it("is SECURITY INVOKER, not SECURITY DEFINER — no elevated, callable-by-anyone path", () => {
      expect(block).toMatch(/security invoker/i);
      expect(block).not.toMatch(/security definer/i);
    });

    it("resolves the person through identity.identities, excluding erased rows", () => {
      expect(block).toMatch(/from identity\.identities i/);
      expect(block).toMatch(/i\.email = p_email/);
      expect(block).toMatch(/i\.erased_at is null/);
    });

    it("finds the Operations Workspace by capability, never by a hardcoded id or name", () => {
      expect(block).toMatch(/capability_key = 'platform_operations'/);
      expect(block).not.toMatch(/where w\.name = 'Klussie Operations'/);
    });

    it("is idempotent — checks for an existing active membership before inserting", () => {
      expect(block).toMatch(
        /select 1 from workspace\.memberships m\s*\n\s*where m\.workspace_id = v_operations_workspace_id/
      );
      expect(block).toMatch(/m\.state = 'active'/);
    });

    it("inserts exactly one membership row, with no paired membership_history insert", () => {
      expect(block).toMatch(
        /insert into workspace\.memberships \(id, workspace_id, person_ref, role, state, created_at, updated_at\)/
      );
      expect(block).not.toMatch(/membership_history/);
    });

    it("mints the membership id via platform.uuid_v7_at(), never a raw uuid literal", () => {
      expect(block).toMatch(/platform\.uuid_v7_at\(now\(\)\)/);
    });
  });

  describe("access", () => {
    it("is granted to no application role — migration-runner only, matching platform.uuid_v7_at()", () => {
      expect(codeNoComments).toMatch(
        /revoke all on function platform\.bootstrap_operator\(text\)\s*from public, anon, authenticated, service_role/
      );
      expect(codeNoComments).not.toMatch(/grant execute on function platform\.bootstrap_operator/);
    });
  });
});
