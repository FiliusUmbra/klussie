// Keeps 0096_conversation_contract.sql inside ADR-0022 (no server-side id minting) and,
// critically, ensures every emitted event carries a REAL workspace_id — platform.events.
// workspace_id is not null and is the table's own partition key, so resolving it wrong
// (e.g. from an asset or property id) is not a style issue, it is either a hard runtime
// failure or a corrupted event stream, both caught before shipping.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0096_conversation_contract.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0096_conversation_contract migration", () => {
  it("defines exactly eleven functions, all in work, none in api", () => {
    const created = [...codeNoComments.matchAll(/create or replace function (work\.\w+|api\.\w+)\(/g)].map((m) => m[1]);
    expect(created.sort()).toEqual([
      "work.add_participant",
      "work.close_conversation",
      "work.conversation_messages",
      "work.conversation_roster",
      "work.mark_conversation_read",
      "work.my_conversations",
      "work.open_conversation",
      "work.remove_participant",
      "work.resolve_conversation_home_workspace",
      "work.save_message_translation",
      "work.send_message",
    ]);
  });

  it("resolve_conversation_home_workspace is defined before open_conversation, which depends on it", () => {
    const resolverIdx = codeNoComments.indexOf("create or replace function work.resolve_conversation_home_workspace(");
    const openIdx = codeNoComments.indexOf("create or replace function work.open_conversation(");
    expect(resolverIdx).toBeGreaterThan(-1);
    expect(openIdx).toBeGreaterThan(resolverIdx);
  });

  it("resolve_conversation_home_workspace never returns a non-workspace id — every branch resolves through a real workspace column", () => {
    const start = codeNoComments.indexOf("create or replace function work.resolve_conversation_home_workspace(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/e\.requesting_workspace_id/);
    expect(block).toMatch(/pa_prop\.steward_workspace_id/);
    expect(block).toMatch(/mo\.workspace_id/);
    expect(block).toMatch(/p_prop\.steward_workspace_id/);
    expect(block).toMatch(/c\.workspace_id/);
    // Never coalesces in a bare asset/property/obligation id itself.
    expect(block).not.toMatch(/coalesce\(\s*\n\s*e\.requesting_workspace_id,\s*\n\s*c\.asset_id/);
  });

  it("open_conversation never passes a subject id as the event's workspace_id — it resolves a real one", () => {
    const start = codeNoComments.indexOf("create or replace function work.open_conversation(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/v_home_workspace := work\.resolve_conversation_home_workspace\(p_conversation_id\)/);
    expect(block).toMatch(/p_workspace_id\s*=> v_home_workspace/);
    expect(block).not.toMatch(/p_workspace_id\s*=> coalesce\(p_workspace_id, v_subject_id\)/);
  });

  it("close_conversation never passes a literal null as the event's workspace_id — platform.events.workspace_id is not null", () => {
    const start = codeNoComments.indexOf("create or replace function work.close_conversation(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/v_workspace_id := work\.resolve_conversation_home_workspace\(p_conversation_id\)/);
    expect(block).toMatch(/p_workspace_id\s*=> v_workspace_id/);
    expect(block).not.toMatch(/p_workspace_id\s*=> null/);
  });

  it("close_conversation refuses if already closed, not idempotent", () => {
    const start = codeNoComments.indexOf("create or replace function work.close_conversation(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/if v_already_closed then\s*\n\s*raise exception/);
  });

  it("add_participant upserts on the unique constraint, clearing left_at, never a second row", () => {
    const start = codeNoComments.indexOf("create or replace function work.add_participant(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/on conflict \(conversation_id, person_ref\) do update/);
    expect(block).toMatch(/set left_at = null/);
  });

  it("remove_participant refuses if not currently an active participant", () => {
    const start = codeNoComments.indexOf("create or replace function work.remove_participant(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/where conversation_id = p_conversation_id and person_ref = p_person_ref and left_at is null/);
  });

  it("save_message_translation merges into the jsonb column via ||, never overwrites the whole object", () => {
    const start = codeNoComments.indexOf("create or replace function work.save_message_translation(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/set translations = translations \|\| jsonb_build_object\(p_locale, p_text\)/);
  });

  it("mark_conversation_read emits no event", () => {
    const start = codeNoComments.indexOf("create or replace function work.mark_conversation_read(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).not.toMatch(/emit_event/);
  });

  it("my_conversations filters to active participation only", () => {
    const start = codeNoComments.indexOf("create or replace function work.my_conversations(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/cp\.person_ref = p_person_ref and cp\.left_at is null/);
  });

  it("conversation_messages orders oldest first, created_at then id", () => {
    const start = codeNoComments.indexOf("create or replace function work.conversation_messages(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/order by m\.created_at, m\.id/);
  });

  it("every function sets search_path to empty", () => {
    const fns = [...codeNoComments.matchAll(/create or replace function ([\w.]+)\([^)]*\)[\s\S]*?set search_path = (\S+)/gi)];
    expect(fns.length).toBe(11);
    for (const [, name, path] of fns) {
      expect(path, `${name} does not use an empty search_path`).toBe("''");
    }
  });

  it("grants every function to klussie_engine_work only — no api delegate, no authenticated/anon grant", () => {
    const grants = [...code.matchAll(/grant execute on function (work\.\w+)\([^)]*\)\s*\n\s*to (\w+)/g)];
    expect(grants.length).toBe(11);
    for (const [, , role] of grants) {
      expect(role).toBe("klussie_engine_work");
    }
    expect(code).not.toMatch(/create or replace function api\./);
    expect(code).not.toMatch(/grant execute .* to authenticated/i);
  });

  it("revokes all eleven functions from public, anon, authenticated and service_role before granting", () => {
    const revokes = [...code.matchAll(/revoke all on function (work\.\w+)\([^)]*\)\s*\n\s*from public, anon, authenticated, service_role/g)];
    expect(revokes.length).toBe(11);
  });
});
