// A real bug, found live: 0014's unconditional column DEFAULT on directed_until broke
// every ordinary (non-directed) request insert against service_requests_directed_complete
// (0013) -- see this migration's own header for the full chain. Verifies the fix: the
// default moves from the column to a conditional BEFORE INSERT trigger.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0186_fix_directed_until_default_breaks_ordinary_requests.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("0186_fix_directed_until_default_breaks_ordinary_requests migration", () => {
  it("drops the unconditional column default that broke ordinary requests", () => {
    expect(codeNoComments).toMatch(
      /alter table public\.service_requests alter column directed_until drop default;/
    );
  });

  it("only sets directed_until when directed_pro_id is actually being set", () => {
    const start = codeNoComments.indexOf("create or replace function public.service_requests_default_directed_until");
    const end = codeNoComments.indexOf("\n$$;", start);
    const body = codeNoComments.slice(start, end);
    expect(body).toMatch(/if new\.directed_pro_id is not null and new\.directed_until is null then/);
    expect(body).toMatch(/new\.directed_until := now\(\) \+ interval '24 hours';/);
  });

  it("installs the trigger as BEFORE INSERT, so the row is corrected before the constraint checks it", () => {
    expect(codeNoComments).toMatch(
      /create trigger service_requests_default_directed_until\s*\n\s*before insert on public\.service_requests/
    );
  });
});
