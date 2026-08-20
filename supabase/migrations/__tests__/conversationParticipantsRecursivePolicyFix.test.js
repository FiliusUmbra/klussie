// Keeps 0160_conversation_participants_recursive_policy_fix.sql inside its own stated
// rules: the new resolver never touches conversation_participants except through
// work.my_active_conversation_ids() (owner-exempt from that table's own RLS), and all
// three affected policies reference it instead of the self-referencing subquery 0094
// originally wrote.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0160_conversation_participants_recursive_policy_fix.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName, code) {
  const start = code.indexOf(`create or replace function ${functionName}`);
  const end = code.indexOf("$$;", start);
  return code.slice(start, end);
}

describe("0160_conversation_participants_recursive_policy_fix migration", () => {
  describe("work.my_active_conversation_ids()", () => {
    const block = bodyOf("work.my_active_conversation_ids", codeNoComments);

    it("takes a resolved person_ref, not a caller-supplied identity claim beyond that", () => {
      expect(block).toMatch(/p_person_ref uuid/);
      expect(block).toMatch(/cp\.person_ref = p_person_ref/);
    });

    it("excludes a left participant, matching 0094's own posture", () => {
      expect(block).toMatch(/cp\.left_at is null/);
    });

    it("is unreachable by any application role — only api.my_active_conversation_ids() may call it", () => {
      expect(codeNoComments).toMatch(
        /revoke all on function work\.my_active_conversation_ids\(uuid\) from public, anon, authenticated, service_role/
      );
    });
  });

  it("api.my_active_conversation_ids() resolves identity internally, never a caller-supplied person_ref", () => {
    const block = bodyOf("api.my_active_conversation_ids", codeNoComments);
    expect(block).toMatch(/security definer/i);
    expect(block).toMatch(/select person_ref into v_person_ref from public\.current_identity\(\)/);
    expect(block).not.toMatch(/p_person_ref/);
  });

  it("grants api.my_active_conversation_ids() to authenticated only, after an explicit revoke", () => {
    expect(codeNoComments).toMatch(
      /revoke all on function api\.my_active_conversation_ids\(\) from public, anon, service_role/
    );
    expect(codeNoComments).toMatch(/grant execute on function api\.my_active_conversation_ids\(\) to authenticated/);
  });

  it("all three policies reference the resolver, not a self-referencing subquery against conversation_participants", () => {
    for (const table of ["conversations", "conversation_participants", "messages"]) {
      const start = codeNoComments.indexOf(`on work.${table} for select`);
      const end = codeNoComments.indexOf(";", start);
      const policyBlock = codeNoComments.slice(start, end);
      expect(policyBlock, `${table}'s policy missing the resolver call`).toMatch(
        /in \(select conversation_id from api\.my_active_conversation_ids\(\)\)/
      );
      expect(policyBlock, `${table}'s policy still self-joins conversation_participants`).not.toMatch(
        /from work\.conversation_participants cp/
      );
    }
  });

  it("drops each policy before recreating it, matching 0094's own convention", () => {
    for (const table of ["conversations", "conversation_participants", "messages"]) {
      expect(codeNoComments).toMatch(new RegExp(`drop policy if exists "participants can view ${table === "conversation_participants" ? "conversation_participants" : table}" on work\\.${table}`));
    }
  });
});
