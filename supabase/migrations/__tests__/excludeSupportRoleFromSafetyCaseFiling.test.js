// Fix: safety.file_case_for_caller() (0171) checked the reporter's relationship by
// person_ref and state but not role. Continuing the write-path role audit begun in
// 0173/0174/0175.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0176_exclude_support_role_from_safety_case_filing.sql";
const PREVIOUS = "supabase/migrations/0171_trust_safety_contract.sql";

function stripComments(raw) {
  return raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

function bodyOf(functionName, code) {
  const start = code.indexOf(`create or replace function ${functionName}`);
  const end = code.indexOf("\n$$;", start);
  return code.slice(start, end);
}

const codeNoComments = stripComments(readFileSync(MIGRATION, "utf8"));

describe("0176_exclude_support_role_from_safety_case_filing migration", () => {
  it("file_case_for_caller excludes role = 'support' from its own relationship check", () => {
    const block = bodyOf("safety.file_case_for_caller", codeNoComments);
    expect(block).toMatch(/and m\.state = 'active'\s*\n\s*and m\.role <> 'support'/);
  });

  it("changes no grants — the function's own access posture is untouched", () => {
    expect(codeNoComments).not.toMatch(/^grant\b/m);
    expect(codeNoComments).not.toMatch(/^revoke\b/m);
  });

  it("body is otherwise byte-for-byte identical to its last shipped version", () => {
    const previous = bodyOf("safety.file_case_for_caller", stripComments(readFileSync(PREVIOUS, "utf8")));
    const current = bodyOf("safety.file_case_for_caller", codeNoComments);
    const normalize = (s) => s.replace(/\s*and m\.role <> 'support'/, "");
    expect(normalize(current)).toBe(previous);
  });
});
