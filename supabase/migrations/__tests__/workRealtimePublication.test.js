// Keeps 0159_work_realtime_publication.sql narrow: exactly the six work.* tables
// src/lib/requests.js's and src/lib/messages.js's own subscribe*() helpers listen to,
// added to the one existing publication legacy's own realtime already uses — nothing
// else touched. See this migration's own header for why no SQL diagnostic in this
// programme could ever have caught its absence.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0159_work_realtime_publication.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n")
  .trim();

describe("0159_work_realtime_publication migration", () => {
  it("adds exactly the six work.* tables every subscribe*() helper listens to", () => {
    expect(codeNoComments).toMatch(/alter publication supabase_realtime add table/);
    for (const table of [
      "work.requests", "work.quotes", "work.engagements",
      "work.conversations", "work.conversation_participants", "work.messages",
    ]) {
      expect(codeNoComments, `missing table: ${table}`).toContain(table);
    }
  });

  it("touches no RLS policy — publication membership and the base grant are the whole change", () => {
    expect(codeNoComments).not.toMatch(/create policy|alter table.*enable row level security/i);
  });

  it("is a single ALTER PUBLICATION statement, not one per table", () => {
    // ADD TABLE accepts a comma-separated list — one statement, matching the reasoning
    // this migration's own header gives for why these six travel together.
    expect((codeNoComments.match(/alter publication/gi) || []).length).toBe(1);
  });

  it("grants authenticated USAGE on schema work — required to even resolve a schema-qualified table reference", () => {
    expect(codeNoComments).toMatch(/grant usage on schema work to authenticated/);
  });

  it("grants authenticated SELECT only on the same six tables — never INSERT/UPDATE/DELETE (writes stay behind api.* delegates)", () => {
    const start = codeNoComments.indexOf("grant select on");
    const block = codeNoComments.slice(start, codeNoComments.indexOf(";", start) + 1);
    for (const table of [
      "work.requests", "work.quotes", "work.engagements",
      "work.conversations", "work.conversation_participants", "work.messages",
    ]) {
      expect(block, `missing SELECT grant on ${table}`).toContain(table);
    }
    expect(codeNoComments).not.toMatch(/grant (insert|update|delete|all)/i);
  });
});
