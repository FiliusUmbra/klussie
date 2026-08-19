// Keeps 0131_remove_profile_cascade_deletes.sql inside its own stated rules: every foreign
// key into public.profiles(id) has ON DELETE CASCADE removed, and nothing else about the
// column or the reference changes.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0131_remove_profile_cascade_deletes.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const NINE = [
  ["profile_contacts", "profile_id", "profile_contacts_profile_id_fkey"],
  ["pro_profiles", "profile_id", "pro_profiles_profile_id_fkey"],
  ["service_requests", "customer_id", "service_requests_customer_id_fkey"],
  ["reviews", "customer_id", "reviews_customer_id_fkey"],
  ["conversations", "customer_id", "conversations_customer_id_fkey"],
  ["messages", "sender_id", "messages_sender_id_fkey"],
  ["reports", "reporter_id", "reports_reporter_id_fkey"],
  ["ai_usage_log", "user_id", "ai_usage_log_user_id_fkey"],
  ["household_items", "owner_id", "household_items_owner_id_fkey"],
];

describe("0131_remove_profile_cascade_deletes migration", () => {
  it("drops and re-adds exactly the nine constraints the audit named, none more, none fewer", () => {
    const dropped = [...codeNoComments.matchAll(/drop constraint (\w+);/g)].map((m) => m[1]);
    expect(dropped.sort()).toEqual(NINE.map((n) => n[2]).sort());
  });

  it("every re-added constraint references public.profiles (id) with no ON DELETE clause at all", () => {
    for (const [, column, constraint] of NINE) {
      const addStart = codeNoComments.indexOf(`add constraint ${constraint}`);
      expect(addStart, `${constraint} was not re-added`).toBeGreaterThan(-1);
      const block = codeNoComments.slice(addStart, codeNoComments.indexOf(";", addStart) + 1);
      expect(block, `${constraint} does not reference the right column`).toMatch(
        new RegExp(`foreign key \\(${column}\\) references public\\.profiles \\(id\\)`)
      );
      expect(block, `${constraint} still has an ON DELETE clause`).not.toMatch(/on delete/i);
    }
  });

  it("touches only the nine known tables — no unrelated schema change smuggled in", () => {
    const alteredTables = [...codeNoComments.matchAll(/alter table public\.(\w+)/g)].map((m) => m[1]);
    const uniqueTables = [...new Set(alteredTables)];
    expect(uniqueTables.sort()).toEqual(NINE.map((n) => n[0]).sort());
  });

  it("every constraint gets an explanatory comment naming this migration", () => {
    for (const [, , constraint] of NINE) {
      expect(codeNoComments).toMatch(new RegExp(`comment on constraint ${constraint} on public\\.\\w+ is`));
    }
    const commentBlocks = [...codeNoComments.matchAll(/comment on constraint \w+ on public\.\w+ is\s*\n?\s*'([^']*(?:''[^']*)*)'/g)];
    expect(commentBlocks.length).toBe(NINE.length);
    for (const [, text] of commentBlocks) {
      expect(text).toMatch(/0131/);
    }
  });
});
