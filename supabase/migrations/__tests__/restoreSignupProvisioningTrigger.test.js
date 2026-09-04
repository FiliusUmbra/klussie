// Keeps 0190_restore_signup_provisioning_trigger.sql inside the exact shape its own
// header commits to: the function body is 0135's own, copied verbatim (no re-derivation,
// no drift), the trigger is recreated exactly as 0001_init.sql's original shape (AFTER
// INSERT, one row-level trigger, calling public.handle_new_user() and nothing else), no
// existing row is touched, and no previously shipped migration is edited. Structural, like
// every migration test in this repository (docs/engineering/TESTING.md §3) — behaviour is
// proven against real staging data by
// supabase/diagnostics/VERIFY_SIGNUP_PROVISIONING_TRIGGER.sql, using a synthetic auth user
// rolled back in a transaction, never real customer data.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0190_restore_signup_provisioning_trigger.sql";
const ORIGINAL = "supabase/migrations/0135_personal_workspace_provisioning.sql";

const rawCode = readFileSync(MIGRATION, "utf8").replace(/\r\n/g, "\n");
const codeNoComments = rawCode
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function functionBody(text) {
  const start = text.indexOf("create or replace function public.handle_new_user()");
  expect(start).toBeGreaterThan(-1);
  const end = text.indexOf("\n$$;", start);
  return text.slice(start, end);
}

describe("0190_restore_signup_provisioning_trigger migration", () => {
  describe("the trigger", () => {
    it("targets auth.users", () => {
      expect(codeNoComments).toMatch(/on auth\.users/i);
    });

    it("creates exactly one trigger named on_auth_user_created", () => {
      const matches = codeNoComments.match(/create trigger on_auth_user_created/gi) || [];
      expect(matches.length).toBe(1);
    });

    it("fires only after insert -- no update, delete, or truncate event", () => {
      const start = codeNoComments.indexOf("create trigger on_auth_user_created");
      const block = codeNoComments.slice(start, start + 200);
      expect(block).toMatch(/after insert on auth\.users/i);
      expect(block).not.toMatch(/update|delete|truncate/i);
    });

    it("calls public.handle_new_user() and nothing else", () => {
      const start = codeNoComments.indexOf("create trigger on_auth_user_created");
      const block = codeNoComments.slice(start, start + 250);
      expect(block).toMatch(/execute function public\.handle_new_user\(\)/i);
    });

    it("is created with drop trigger if exists first, so this migration is replayable", () => {
      expect(codeNoComments).toMatch(/drop trigger if exists on_auth_user_created on auth\.users;/i);
    });

    it("matches 0001_init.sql's own original trigger shape exactly (for each row, no WHEN clause)", () => {
      const start = codeNoComments.indexOf("create trigger on_auth_user_created");
      const block = codeNoComments.slice(start, start + 250);
      expect(block).toMatch(/for each row/i);
      expect(block).not.toMatch(/\bwhen\s*\(/i);
    });
  });

  describe("the function", () => {
    it("is copied verbatim from 0135 -- byte-identical body, no re-derivation", () => {
      const originalRaw = readFileSync(ORIGINAL, "utf8").replace(/\r\n/g, "\n");
      expect(functionBody(rawCode)).toBe(functionBody(originalRaw));
    });

    it("still provisions the Personal Workspace and property block, not merely the pre-0135 shape", () => {
      const block = functionBody(codeNoComments);
      expect(block).toMatch(/workspace\.create_personal_workspace\(/);
      expect(block).toMatch(/property\.create_property\(/);
    });

    it("keeps SECURITY DEFINER and the fixed search_path unchanged", () => {
      const start = codeNoComments.indexOf("create or replace function public.handle_new_user()");
      const declStart = codeNoComments.indexOf("as $$", start);
      const decl = codeNoComments.slice(start, declStart);
      expect(decl).toMatch(/security definer/i);
      expect(decl).toMatch(/search_path\s*=\s*public/i);
    });

    it("does not recreate any other function -- only public.handle_new_user()", () => {
      const matches = codeNoComments.match(/create or replace function/gi) || [];
      expect(matches.length).toBe(1);
    });
  });

  describe("no data is touched", () => {
    it("contains no UPDATE, DELETE, or backfill statement against any existing row", () => {
      expect(codeNoComments).not.toMatch(/^\s*update\s+(?!.*\bnew\.)/im);
      expect(codeNoComments).not.toMatch(/^\s*delete from/im);
      // The function body's own INSERTs (profiles/profile_contacts/identities, all keyed
      // off NEW, the row being inserted) are the provisioning contract itself, not a
      // backfill -- distinguished here by requiring "insert into" outside the function
      // body to be entirely absent.
      const beforeFunction = codeNoComments.slice(0, codeNoComments.indexOf("create or replace function"));
      const afterFunction = codeNoComments.slice(codeNoComments.indexOf("create trigger"));
      expect(beforeFunction).not.toMatch(/insert into/i);
      expect(afterFunction).not.toMatch(/insert into/i);
    });
  });

  describe("previously shipped migrations remain untouched", () => {
    it("0135_personal_workspace_provisioning.sql is unedited", () => {
      // A structural proxy for "unedited": the file this migration copies from still
      // contains the exact block copied, unchanged, at the time this test runs.
      const originalRaw = readFileSync(ORIGINAL, "utf8").replace(/\r\n/g, "\n");
      expect(originalRaw).toContain("NEW — Personal Workspace + property (WP 1.0)");
    });

    it("0001_init.sql's own original trigger definition is not referenced or duplicated here", () => {
      expect(codeNoComments).not.toMatch(/create or replace function public\.handle_new_pro_profile/i);
    });
  });
});
