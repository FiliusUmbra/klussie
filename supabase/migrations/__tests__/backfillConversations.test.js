// Keeps 0095_backfill_conversations.sql idempotent (roadmap §3), binding every legacy
// conversation to its real engagement rather than a request, and reusing the identity
// chain every prior backfill already established.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0095_backfill_conversations.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function section(startMarker, endMarker) {
  const raw = readFileSync(MIGRATION, "utf8");
  const start = raw.indexOf(startMarker);
  const end = endMarker ? raw.indexOf(endMarker, start) : raw.length;
  return raw
    .slice(start, end === -1 ? raw.length : end)
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("0095_backfill_conversations migration", () => {
  it("conversations backfill joins through work.requests/engagements, never binds to a request directly", () => {
    const block = section("1 · CONVERSATIONS", "2 · PARTICIPANTS");
    expect(block).toMatch(/join work\.requests wr on wr\.service_request_id = sr\.id/);
    expect(block).toMatch(/join work\.engagements e on e\.request_id = wr\.id/);
    expect(block).toMatch(/not exists \(\s*\n\s*select 1 from work\.conversations wc where wc\.legacy_conversation_id = c\.id/);
  });

  it("participants are resolved via identity.identities, the same chain every prior backfill uses", () => {
    const block = section("2 · PARTICIPANTS", "3 · MESSAGES");
    expect(block).toMatch(/join identity\.identities i on i\.auth_user_id = c\.customer_id/);
    expect(block).toMatch(/join identity\.identities i on i\.auth_user_id = c\.pro_id/);
    expect(block).toMatch(/e\.requesting_workspace_id/);
    expect(block).toMatch(/e\.performing_workspace_id/);
  });

  it("participants backfill is idempotent per (conversation, person)", () => {
    const block = section("2 · PARTICIPANTS", "3 · MESSAGES");
    const guards = [...block.matchAll(/where wcp\.conversation_id = wc\.id and wcp\.person_ref = i\.person_ref/g)];
    expect(guards.length).toBe(2);
  });

  it("messages backfill resolves sender_workspace_id by comparing against the legacy conversation's own customer_id/pro_id", () => {
    const block = section("3 · MESSAGES", null);
    expect(block).toMatch(/case when m\.sender_id = c\.customer_id then e\.requesting_workspace_id else e\.performing_workspace_id end/);
    expect(block).toMatch(/coalesce\(m\.translations, '\{\}'::jsonb\)/);
    expect(block).toMatch(/not exists \(\s*\n\s*select 1 from work\.messages wm where wm\.legacy_message_id = m\.id/);
  });

  it("mints every id via platform.uuid_v7_at, never gen_random_uuid", () => {
    expect(codeNoComments).toMatch(/platform\.uuid_v7_at\(c\.created_at\)/);
    expect(codeNoComments).toMatch(/platform\.uuid_v7_at\(m\.created_at\)/);
    expect(codeNoComments).not.toMatch(/gen_random_uuid/);
  });
});
