// Keeps 0093_messages.sql inside §20's own rule: immutable except translations, a real
// original_locale, and a structured-moment reference reusing platform.emit_event()'s own
// polymorphic-subject shape.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0093_messages.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0093_messages migration", () => {
  it("creates exactly one table, in work", () => {
    const created = [...code.matchAll(/create table if not exists (work\.\w+)/gi)].map((m) => m[1]);
    expect(created).toEqual(["work.messages"]);
  });

  it("sender_person_ref has no foreign key; sender_workspace_id is denormalised with one", () => {
    const start = code.indexOf("create table if not exists work.messages");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/sender_person_ref\s+uuid\s+not null/);
    expect(block).not.toMatch(/sender_person_ref[^,]*references/);
    expect(block).toMatch(/sender_workspace_id\s+uuid\s+not null/);
    expect(block).toMatch(/references workspace\.workspaces \(id\)/);
  });

  it("has no read_at column — read state moved to conversation_participants", () => {
    expect(codeNoComments).not.toMatch(/read_at/);
  });

  it("carries original_locale and a translations jsonb default", () => {
    const start = code.indexOf("create table if not exists work.messages");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/original_locale\s+text\s+null/);
    expect(block).toMatch(/translations\s+jsonb\s+not null default/);
  });

  it("reference_type/reference_id are both-or-neither, no foreign key on either", () => {
    const start = code.indexOf("create table if not exists work.messages");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/reference_type\s+text\s+null/);
    expect(block).toMatch(/reference_id\s+uuid\s+null/);
    expect(block).toMatch(/check \(\(reference_type is null\) = \(reference_id is null\)\)/);
    expect(block).not.toMatch(/reference_id[^,]*references/);
  });

  it("the guard trigger freezes every column except translations", () => {
    expect(codeNoComments).toMatch(/messages_guard_mutation/);
    for (const col of ["id", "conversation_id", "sender_person_ref", "sender_workspace_id", "body", "original_locale", "reference_type", "reference_id", "created_at"]) {
      expect(codeNoComments, `guard does not check ${col}`).toMatch(new RegExp(`new\\.${col} is distinct from old\\.${col}`));
    }
    expect(codeNoComments).not.toMatch(/new\.translations is distinct from old\.translations/);
  });

  it("rejects delete unconditionally", () => {
    expect(codeNoComments).toMatch(/if tg_op = 'DELETE' then\s*\n\s*raise exception/);
    expect(codeNoComments).toMatch(/before update or delete on work\.messages/);
  });

  it("grants UPDATE, never DELETE, revokes from anon/authenticated/service_role, adds no policy here", () => {
    expect(code).toMatch(/grant update on work\.messages to klussie_engine_work/i);
    expect(code).not.toMatch(/grant delete on work\.messages/i);
    expect(code).toMatch(/revoke all on work\.messages from anon, authenticated, service_role/i);
    expect(code).not.toMatch(/create policy/i);
  });
});
