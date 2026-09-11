// Keeps 0215_backfill_pro_services_workspace_id.sql applying the exact same rule
// 0035_backfill_workspace_ids.sql already stated and applied once for `pro_services` —
// this migration exists only because that one-time backfill was never repeated, and the
// live write path (src/lib/pros.js's updateProServices()) never set workspace_id on
// insert, so every row created since has needed exactly this repair again.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0215_backfill_pro_services_workspace_id.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("0215_backfill_pro_services_workspace_id migration", () => {
  const updateStart = codeNoComments.indexOf("update public.pro_services ");
  const statementEnd = codeNoComments.indexOf(";", updateStart);
  const statement = codeNoComments.slice(updateStart, statementEnd);

  it("updates public.pro_services, and only that table", () => {
    expect(updateStart, "no UPDATE found for public.pro_services").toBeGreaterThan(-1);
    // 0035's own block for this table is a comment now, not live SQL — the only real
    // "update public." statement in this file must be the one above.
    expect(codeNoComments.match(/update public\./g)?.length).toBe(1);
  });

  it("guards with workspace_id is null, the same idempotency 0035 established", () => {
    expect(statement).toMatch(/psv\.workspace_id is null/);
  });

  it("resolves the Professional Workspace through identity, type professional, role owner — 0035's own rule, unchanged", () => {
    expect(statement).toMatch(/i\.auth_user_id = pp\.profile_id/);
    expect(statement).toMatch(/m\.person_ref = i\.person_ref/);
    expect(statement).toMatch(/w\.type = 'professional' and m\.role = 'owner'/);
  });

  it("joins pro_services to pro_profiles by pro_id = profile_id, not by workspace_id (which may itself be null)", () => {
    expect(statement).toMatch(/psv\.pro_id = pp\.profile_id/);
  });
});
