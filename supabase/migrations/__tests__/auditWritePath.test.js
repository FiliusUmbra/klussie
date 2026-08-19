// Keeps 0105_audit_write_path.sql inside its own stated rules: mirrors platform.emit_event()
// exactly (SECURITY DEFINER, application-generated audit_id, revoke-then-grant), uses the
// two-segment action format platform.audit_records' own check constraint requires (not
// event_type's three), and grants exactly the one real caller this epic has.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0105_audit_write_path.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("0105_audit_write_path migration", () => {
  it("defines exactly one function, in platform, not api", () => {
    const created = [...codeNoComments.matchAll(/create or replace function ([\w.]+)\(/g)].map((m) => m[1]);
    expect(created).toEqual(["platform.write_audit_record"]);
  });

  it("is SECURITY DEFINER with an empty search_path, mirroring platform.emit_event()", () => {
    const start = codeNoComments.indexOf("create or replace function platform.write_audit_record(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/security definer/);
    expect(block).toMatch(/set search_path = ''/);
  });

  it("takes audit_id as a required parameter, never minted internally", () => {
    const sigStart = codeNoComments.indexOf("create or replace function platform.write_audit_record(");
    const sigEnd = codeNoComments.indexOf(")", codeNoComments.indexOf("p_occurred_at", sigStart));
    const signature = codeNoComments.slice(sigStart, sigEnd);
    expect(signature).toMatch(/p_audit_id\s+uuid,/);
    expect(codeNoComments).not.toMatch(/gen_random_uuid|uuid_v7_at/);
  });

  it("inserts every column platform.audit_records defines", () => {
    const start = codeNoComments.indexOf("insert into platform.audit_records");
    const block = codeNoComments.slice(start, codeNoComments.indexOf(");", start) + 1);
    for (const col of [
      "audit_id", "occurred_at", "workspace_id", "actor_type", "actor_ref", "action",
      "subject_type", "subject_id", "outcome", "authority", "correlation_id", "detail",
    ]) {
      expect(block, `missing column ${col}`).toMatch(new RegExp(`\\b${col}\\b`));
    }
  });

  it("grants USAGE on schema platform to klussie_engine_knowledge, which never held it", () => {
    expect(codeNoComments).toMatch(/grant usage on schema platform to klussie_engine_knowledge/);
  });

  it("revokes from PUBLIC then grants execute to klussie_engine_knowledge only", () => {
    const revokeIdx = codeNoComments.indexOf("revoke all on function platform.write_audit_record(");
    const grantIdx = codeNoComments.indexOf("grant execute on function platform.write_audit_record(");
    expect(revokeIdx).toBeGreaterThan(-1);
    expect(grantIdx).toBeGreaterThan(revokeIdx);
    expect(codeNoComments).toMatch(/from public;/);
    expect(codeNoComments).toMatch(/to klussie_engine_knowledge;/);
    expect(codeNoComments).not.toMatch(/to authenticated/i);
    expect(codeNoComments).not.toMatch(/create or replace function api\./);
  });
});
