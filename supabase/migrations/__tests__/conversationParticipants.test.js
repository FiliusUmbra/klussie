// Keeps 0092_conversation_participants.sql inside DESIGN_REVIEW.md's own correction:
// participation is explicit and person-keyed, not derived from workspace membership,
// and read state lives here, per participant, not on the message.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0092_conversation_participants.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0092_conversation_participants migration", () => {
  it("creates exactly one table, in work", () => {
    const created = [...code.matchAll(/create table if not exists (work\.\w+)/gi)].map((m) => m[1]);
    expect(created).toEqual(["work.conversation_participants"]);
  });

  it("person_ref has no foreign key, matching the durable-reference pattern", () => {
    const start = code.indexOf("create table if not exists work.conversation_participants");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/person_ref\s+uuid\s+not null/);
    expect(block).not.toMatch(/person_ref[^,]*references/);
    expect(block).toMatch(/workspace_id\s+uuid\s+not null/);
    expect(block).toMatch(/references workspace\.workspaces \(id\)/);
  });

  it("carries last_read_at itself, per participant, not deferring to the message table", () => {
    const start = code.indexOf("create table if not exists work.conversation_participants");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/last_read_at\s+timestamptz\s+null/);
    expect(block).toMatch(/left_at\s+timestamptz\s+null/);
  });

  it("is unique per (conversation_id, person_ref) — a rejoin updates the same row", () => {
    const start = code.indexOf("create table if not exists work.conversation_participants");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/constraint conversation_participants_unique unique \(conversation_id, person_ref\)/);
  });

  it("grants UPDATE but never DELETE, revokes from anon/authenticated/service_role, adds no policy here", () => {
    expect(code).toMatch(/grant update on work\.conversation_participants to klussie_engine_work/i);
    expect(code).not.toMatch(/grant delete on work\.conversation_participants/i);
    expect(code).toMatch(/revoke all on work\.conversation_participants from anon, authenticated, service_role/i);
    expect(code).not.toMatch(/create policy/i);
  });
});
