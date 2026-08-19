// Keeps 0142_maintenance_write_delegate.sql (Platform Activation Slice 1, WP 1.7) inside
// its own stated rules: work.create_manual_maintenance_obligation() is a NEW function
// with a real authorization check (workspace membership plus asset/location
// stewardship), never a modification to the shared, internally-trusted
// work.create_maintenance_obligation() (0074) that 'schedule'/'compliance'/'prediction'
// still call directly and unchanged; source and schedule_id are hardcoded, never
// caller-controlled; and every function is reachable only through its own delegate.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0142_maintenance_write_delegate.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName, code) {
  const start = code.indexOf(`create or replace function ${functionName}`);
  const end = code.indexOf("$$;", start);
  return code.slice(start, end);
}

describe("0142_maintenance_write_delegate migration", () => {
  it("never redefines work.create_maintenance_obligation() itself — that function is untouched", () => {
    expect(codeNoComments).not.toMatch(/create or replace function work\.create_maintenance_obligation\(/);
  });

  describe("work.create_manual_maintenance_obligation()", () => {
    const block = bodyOf("work.create_manual_maintenance_obligation", codeNoComments);

    it("is not SECURITY DEFINER — it inherits the delegate's context", () => {
      expect(block).not.toMatch(/security definer/i);
    });

    it("checks the caller's real membership in the target workspace", () => {
      expect(block).toMatch(
        /select 1 from workspace\.current_memberships\(\) m where m\.workspace_id = p_workspace_id/
      );
    });

    it("verifies a given asset is actually stewarded by the target workspace, not merely that it exists", () => {
      expect(block).toMatch(/p_asset_id is not null and not exists/);
      expect(block).toMatch(/p\.steward_workspace_id = p_workspace_id/);
    });

    it("verifies a given location is actually stewarded by the target workspace", () => {
      expect(block).toMatch(/p_location_id is not null and not exists/);
    });

    it("raises 'insufficient_privilege' for every one of the three checks, never a distinguishing message", () => {
      const matches = block.match(/errcode = 'insufficient_privilege'/g) || [];
      expect(matches.length).toBe(3);
    });

    it("hardcodes source to 'manual' and schedule_id to null — never caller-controlled", () => {
      expect(block).toMatch(
        /perform work\.create_maintenance_obligation\(\s*\n\s*p_obligation_id, p_workspace_id, p_asset_id, p_location_id, null,\s*\n\s*p_title, p_description, 'manual', p_due_on,/
      );
      const signatureEnd = block.indexOf(")\nreturns void");
      const signature = block.slice(0, signatureEnd);
      expect(signature).not.toMatch(/p_source/);
      expect(signature).not.toMatch(/p_schedule_id/);
    });
  });

  describe("api.create_maintenance_obligation()", () => {
    it("is a thin SECURITY DEFINER pass-through calling work.create_manual_maintenance_obligation(), never the raw internal function", () => {
      const block = bodyOf("api.create_maintenance_obligation", codeNoComments);
      expect(block).toMatch(/security definer/i);
      expect(block).toMatch(/select work\.create_manual_maintenance_obligation\(/);
      expect(block).not.toMatch(/work\.create_maintenance_obligation\(/);
    });
  });

  describe("access", () => {
    it("revokes work.create_manual_maintenance_obligation() from every role, including authenticated — reachable only as a nested call", () => {
      expect(codeNoComments).toMatch(
        /revoke all on function work\.create_manual_maintenance_obligation\(uuid, uuid, uuid, uuid, text, text, date, uuid, uuid, platform\.actor_type, text\)\s*from public, anon, authenticated, service_role/
      );
    });

    it("grants api.create_maintenance_obligation() to authenticated only, after an explicit revoke from public/anon/service_role", () => {
      expect(codeNoComments).toMatch(
        /revoke all on function api\.create_maintenance_obligation\(uuid, uuid, uuid, uuid, text, text, date, uuid, uuid, platform\.actor_type, text\)\s*from public, anon, service_role/
      );
      expect(codeNoComments).toMatch(
        /grant execute on function api\.create_maintenance_obligation\(uuid, uuid, uuid, uuid, text, text, date, uuid, uuid, platform\.actor_type, text\)\s*to authenticated/
      );
    });

    it("does not touch work.create_maintenance_obligation()'s own grant to klussie_engine_work — 0074's own grant stands, untouched", () => {
      expect(codeNoComments).not.toMatch(/klussie_engine_work/);
    });

    it("does not re-grant USAGE on schema api — already granted in 0031", () => {
      expect(codeNoComments).not.toMatch(/grant usage on schema api/i);
    });
  });
});
