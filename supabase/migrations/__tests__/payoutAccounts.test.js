// Payments Slice 1 (WP 1) — commerce.payout_accounts, the first real client caller of
// the Billing engine (0101's own header: "No client caller exists yet"). Same
// static-source-text discipline propertyAddressWritePath.test.js/
// propertyKindAndMultiProperty.test.js already established for this repository's own
// migrations.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0226_payout_accounts.sql";

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

describe("0226_payout_accounts migration", () => {
  it("stores only the immutable link — no mutable status columns at all", () => {
    const createTable = codeNoComments.slice(
      codeNoComments.indexOf("create table if not exists commerce.payout_accounts"),
      codeNoComments.indexOf(");", codeNoComments.indexOf("create table if not exists commerce.payout_accounts"))
    );
    expect(createTable).toMatch(/provider_account_id\s+text\s+not null/);
    // The whole point (this migration's own header, and its own comment strings, which
    // explain the omission in prose — this checks the table's real column list, not
    // whether the words appear anywhere in the file at all): never a client-writable
    // payouts_enabled/charges_enabled/details_submitted column to forge.
    expect(createTable).not.toMatch(/payouts_enabled|charges_enabled|details_submitted/);
  });

  it("allows exactly one row per workspace and provider", () => {
    expect(codeNoComments).toMatch(/constraint payout_accounts_one_per_workspace_provider unique \(workspace_id, provider\)/);
  });

  it("is revoked from every client-facing role at the table level — reachable only through the api.* functions", () => {
    expect(codeNoComments).toMatch(
      /revoke all on commerce\.payout_accounts from public, anon, authenticated, service_role;/
    );
    expect(codeNoComments).toMatch(/grant select, insert on commerce\.payout_accounts to klussie_engine_commerce;/);
  });

  describe("commerce.create_payout_account_for_caller() — the write path", () => {
    const FN = "commerce.create_payout_account_for_caller";

    it("checks the caller holds a real membership in the target workspace", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/from workspace\.current_memberships\(\) m where m\.workspace_id = p_workspace_id/);
      expect(block).toMatch(/insufficient_privilege/);
    });

    it("emits a real, minimal event-name extension, not a frozen-list name that doesn't exist", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/p_event_type\s*=> 'billing\.payout_account\.connected'/);
    });
  });

  describe("commerce.my_payout_account() — the read path", () => {
    it("authorizes via a real join against current_memberships(), not a bare WHERE trusting the parameter", () => {
      const block = bodyOf("commerce.my_payout_account", codeNoComments);
      expect(block).toMatch(/join workspace\.current_memberships\(\) m on m\.workspace_id = pa\.workspace_id/);
    });
  });

  describe("api.* delegates — grant/revoke shape", () => {
    it("api.create_payout_account() is a thin, non-DEFINER-bypassing delegate", () => {
      const block = bodyOf("api.create_payout_account", codeNoComments);
      expect(block).toMatch(/security definer/);
      expect(block).toMatch(/select commerce\.create_payout_account_for_caller\(/);
    });

    it("api.my_payout_account() is a thin delegate", () => {
      const block = bodyOf("api.my_payout_account", codeNoComments);
      expect(block).toMatch(/security definer/);
      expect(block).toMatch(/select \* from commerce\.my_payout_account\(p_workspace_id\);/);
    });

    it("grant/revoke shape matches every other *_for_caller() write contract in this codebase", () => {
      expect(codeNoComments).toMatch(
        /revoke all on function commerce\.create_payout_account_for_caller\([^)]*\)\s*\n\s*from public, anon, authenticated, service_role;/
      );
      expect(codeNoComments).toMatch(
        /revoke all on function api\.create_payout_account\([^)]*\)\s*\n\s*from public, anon, service_role;/
      );
      expect(codeNoComments).toMatch(
        /grant execute on function api\.create_payout_account\([^)]*\)\s*\n\s*to authenticated;/
      );
      expect(codeNoComments).toMatch(
        /grant execute on function api\.my_payout_account\(uuid\)\s*\n\s*to authenticated;/
      );
    });
  });
});
