// Fix: work.accept_quote_for_caller()/work.submit_quote_for_caller() both authorized on
// "does the caller hold ANY live membership in this workspace" — no role check — the
// real risk SUPPORT_ACCESS_DESIGN.md §1.3 named. A support-access grant (migration 0172)
// must never be sufficient to accept or submit a quote on someone else's behalf.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0173_exclude_support_role_from_marketplace_writes.sql";
const PREVIOUS_ACCEPT_QUOTE = "supabase/migrations/0148_engagement_conversation_cascade.sql";
const PREVIOUS_SUBMIT_QUOTE = "supabase/migrations/0150_marketplace_dual_write.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName, code) {
  const start = code.indexOf(`create or replace function ${functionName}`);
  const end = code.indexOf("\n$$;", start);
  return code.slice(start, end);
}

function stripComments(raw) {
  return raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("0173_exclude_support_role_from_marketplace_writes migration", () => {
  it("accept_quote_for_caller now excludes role = 'support' from its own membership check", () => {
    const block = bodyOf("work.accept_quote_for_caller", codeNoComments);
    expect(block).toMatch(/where m\.workspace_id = v_requesting_ws and m\.role <> 'support'/);
  });

  it("submit_quote_for_caller now excludes role = 'support' from its own membership check", () => {
    const block = bodyOf("work.submit_quote_for_caller", codeNoComments);
    expect(block).toMatch(/where m\.workspace_id = p_offering_workspace_id and m\.role <> 'support'/);
  });

  it("neither function's own signature changed — a real CREATE OR REPLACE in place, not a drop/recreate", () => {
    expect(codeNoComments).not.toMatch(/drop function/);
  });

  it("changes no grants — both functions' own access posture (api.accept_quote()/api.submit_quote()) is untouched", () => {
    expect(codeNoComments).not.toMatch(/^grant\b/m);
    expect(codeNoComments).not.toMatch(/^revoke\b/m);
  });

  describe("bodies are otherwise byte-for-byte identical to their last shipped version — a surgical fix, not a restructure", () => {
    it("accept_quote_for_caller's own cascade to work.accept_quote() / work.open_conversation_for_engagement() is unchanged", () => {
      const previous = bodyOf("work.accept_quote_for_caller", stripComments(readFileSync(PREVIOUS_ACCEPT_QUOTE, "utf8")));
      const current = bodyOf("work.accept_quote_for_caller", codeNoComments);
      // Strip the one line that legitimately differs (the added AND clause) before
      // comparing the rest of the body verbatim.
      const normalize = (s) => s.replace(/ and m\.role <> 'support'/, "");
      expect(normalize(current)).toBe(previous);
    });

    it("submit_quote_for_caller's own auto-accept cascade and dual-write bridge are unchanged", () => {
      const previous = bodyOf("work.submit_quote_for_caller", stripComments(readFileSync(PREVIOUS_SUBMIT_QUOTE, "utf8")));
      const current = bodyOf("work.submit_quote_for_caller", codeNoComments);
      const normalize = (s) => s.replace(/ and m\.role <> 'support'/, "");
      expect(normalize(current)).toBe(previous);
    });
  });
});
