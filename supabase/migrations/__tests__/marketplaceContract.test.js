// Keeps 0090_marketplace_contract.sql inside ADR-0022 (no server-side id minting, not
// even for the consolidated QuoteDeclined side effect), matches the five legacy
// triggers' exact decisions, and stays out of workspace.memberships entirely — the real
// cross-schema privilege boundary caught before shipping.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0090_marketplace_contract.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0090_marketplace_contract migration", () => {
  it("defines exactly thirteen functions, all in work, none in api", () => {
    const created = [...codeNoComments.matchAll(/create or replace function (work\.\w+|api\.\w+)\(/g)].map((m) => m[1]);
    expect(created.sort()).toEqual([
      "work.accept_quote",
      "work.cancel_engagement",
      "work.complete_engagement",
      "work.create_request",
      "work.decline_quote",
      "work.mark_request_reviewed",
      "work.my_engagements",
      "work.my_quotes",
      "work.my_requests",
      "work.quotes_for_request",
      "work.resolve_request",
      "work.submit_quote",
      "work.withdraw_request",
    ]);
  });

  it("never writes to workspace.memberships anywhere — the real cross-schema privilege boundary", () => {
    // Prose explaining the exclusion (a comment-on-function string) is expected and
    // fine; what must never appear is an executable statement touching the table.
    expect(codeNoComments).not.toMatch(/insert into workspace\.memberships/);
    expect(codeNoComments).not.toMatch(/update workspace\.memberships/);
    expect(codeNoComments).not.toMatch(/from workspace\.memberships/);
    expect(codeNoComments).not.toMatch(/create or replace function work\.grant_engagement_access/);
  });

  it("never calls gen_random_uuid or uuid_v7_at — every identifier is a required parameter", () => {
    const insideFunctions = codeNoComments.slice(codeNoComments.indexOf("create or replace function"));
    expect(insideFunctions).not.toMatch(/gen_random_uuid\(\)/);
    expect(insideFunctions).not.toMatch(/uuid_v7_at/);
  });

  it("submit_quote mirrors handle_quote_sent's own guard — only from status = collecting", () => {
    const start = codeNoComments.indexOf("create or replace function work.submit_quote(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/where id = p_request_id and status = 'collecting'/);
  });

  it("accept_quote declines every other open quote in one statement, then emits exactly one consolidated marketplace.quote.declined using a required parameter", () => {
    const start = codeNoComments.indexOf("create or replace function work.accept_quote(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/p_declined_event_id\s+uuid,/);
    expect(block).toMatch(
      /where request_id = v_request_id and id <> p_quote_id and status = 'sent'/
    );
    expect(block).toMatch(/if v_declined_ids is not null then/);
    const declinedEmitCount = (block.match(/'marketplace\.quote\.declined'/g) || []).length;
    expect(declinedEmitCount).toBe(1);
    expect(block).toMatch(/'declinedQuoteIds', to_jsonb\(v_declined_ids\)/);
  });

  it("accept_quote emits marketplace.quote.accepted and marketplace.engagement.created, and creates exactly one engagement row", () => {
    const start = codeNoComments.indexOf("create or replace function work.accept_quote(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/'marketplace\.quote\.accepted'/);
    expect(block).toMatch(/'marketplace\.engagement\.created'/);
    expect((block.match(/insert into work\.engagements/g) || []).length).toBe(1);
  });

  it("complete_engagement moves the linked request to completed, mirroring markComplete()", () => {
    const start = codeNoComments.indexOf("create or replace function work.complete_engagement(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/where id = p_engagement_id and status = 'active'/);
    expect(block).toMatch(/set status = 'completed', updated_at = now\(\)\s*\n\s*where id = v_request_id/);
  });

  it("cancel_engagement requires a non-blank reason before touching the table", () => {
    const start = codeNoComments.indexOf("create or replace function work.cancel_engagement(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/if p_reason is null or btrim\(p_reason\) = '' then/);
  });

  it("mark_request_reviewed only transitions from status = completed", () => {
    const start = codeNoComments.indexOf("create or replace function work.mark_request_reviewed(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/where id = p_request_id and status = 'completed'/);
  });

  it("quotes_for_request orders by sent_at, oldest first", () => {
    const start = codeNoComments.indexOf("create or replace function work.quotes_for_request(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/order by q\.sent_at/);
  });

  it("my_engagements matches either party, requesting or performing", () => {
    const start = codeNoComments.indexOf("create or replace function work.my_engagements(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/e\.requesting_workspace_id = p_workspace_id or e\.performing_workspace_id = p_workspace_id/);
  });

  it("every function sets search_path to empty", () => {
    const fns = [...codeNoComments.matchAll(/create or replace function ([\w.]+)\([^)]*\)[\s\S]*?set search_path = (\S+)/gi)];
    expect(fns.length).toBe(13);
    for (const [, name, path] of fns) {
      expect(path, `${name} does not use an empty search_path`).toBe("''");
    }
  });

  it("grants every function to klussie_engine_work only — no api delegate, no authenticated/anon grant", () => {
    const grants = [...code.matchAll(/grant execute on function (work\.\w+)\([^)]*\)\s*\n\s*to (\w+)/g)];
    expect(grants.length).toBe(13);
    for (const [, , role] of grants) {
      expect(role).toBe("klussie_engine_work");
    }
    expect(code).not.toMatch(/create or replace function api\./);
    expect(code).not.toMatch(/grant execute .* to authenticated/i);
  });

  it("revokes all thirteen functions from public, anon, authenticated and service_role before granting", () => {
    const revokes = [...code.matchAll(/revoke all on function (work\.\w+)\([^)]*\)\s*\n\s*from public, anon, authenticated, service_role/g)];
    expect(revokes.length).toBe(13);
  });
});
