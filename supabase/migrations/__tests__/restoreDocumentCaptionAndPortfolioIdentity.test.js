// Keeps 0218_restore_document_caption_and_portfolio_identity.sql restoring exactly what
// 0149_document_request_attachment.sql silently regressed from 0064_document_caption.sql's
// own fix, while preserving 0161_scoped_membership_authorization.sql's own AND/OR
// parenthesisation security fix byte-for-byte, and adds portfolio_item_id for the first
// time so the client half of this fix (src/lib/portfolio.js) has a real, mutable identity
// to act on.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0218_restore_document_caption_and_portfolio_identity.sql";
const PRIOR_SECURITY_FIX = "supabase/migrations/0161_scoped_membership_authorization.sql";

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

describe("0218_restore_document_caption_and_portfolio_identity migration", () => {
  it("drops both prior 5-argument signatures before redefining them — a changed return shape needs it", () => {
    expect(codeNoComments).toMatch(/drop function if exists property\.my_documents\(uuid, uuid, uuid, uuid, uuid\);/);
    expect(codeNoComments).toMatch(/drop function if exists api\.my_documents\(uuid, uuid, uuid, uuid, uuid\);/);
  });

  it("restores caption and adds portfolio_item_id to both functions' return shape", () => {
    for (const fn of ["property.my_documents", "api.my_documents"]) {
      const body = bodyOf(fn, codeNoComments);
      const returnsStart = body.indexOf("returns table");
      const returnsClause = body.slice(returnsStart, body.indexOf(")", body.indexOf("(", returnsStart)) + 1);
      expect(returnsClause, `${fn} is missing caption`).toMatch(/caption\s+text/);
      expect(returnsClause, `${fn} is missing portfolio_item_id`).toMatch(/portfolio_item_id\s+uuid/);
    }
  });

  it("selects d.caption and d.portfolio_item_id, not just carrying them in the signature", () => {
    const body = bodyOf("property.my_documents", codeNoComments);
    expect(body).toMatch(/select d\.id,[\s\S]*?d\.caption,\s*d\.portfolio_item_id/);
  });

  it("preserves 0161's own AND/OR parenthesisation fix byte-for-byte — the subject clauses stay grouped separately from the visibility clauses", () => {
    const priorBody = readFileSync(PRIOR_SECURITY_FIX, "utf8").replace(/\r\n/g, "\n");
    const priorStart = priorBody.indexOf("return query", priorBody.indexOf("create or replace function property.my_documents"));
    const priorEnd = priorBody.indexOf("\n$$;", priorStart);
    const priorWhereClause = priorBody
      .slice(priorStart, priorEnd)
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n")
      .trim();

    const newBody = bodyOf("property.my_documents", codeNoComments);
    const newStart = newBody.indexOf("return query");
    const newWhereClause = newBody.slice(newStart).trim();

    // The select list legitimately differs (caption, portfolio_item_id added) — compare
    // everything from the `from property.documents d` join onward, where the actual
    // security-relevant grouping lives.
    const isolate = (text) => text.slice(text.indexOf("from property.documents d"));
    expect(isolate(newWhereClause)).toBe(isolate(priorWhereClause));
  });

  it("still refuses a caller giving zero or more than one subject", () => {
    const body = bodyOf("property.my_documents", codeNoComments);
    expect(body).toMatch(/num_nonnulls\(p_property_id, p_location_id, p_asset_id, p_workspace_id, p_request_id\) <> 1/);
    expect(body).toMatch(/exactly one subject must be given/);
  });

  it("does not add service_request_photo_id — nothing reads request photos through this path today", () => {
    expect(codeNoComments).not.toMatch(/service_request_photo_id/);
  });

  it("property.my_documents is plain plpgsql, not SECURITY DEFINER; the api delegate is", () => {
    const propertyBody = codeNoComments.slice(
      codeNoComments.indexOf("create or replace function property.my_documents"),
      codeNoComments.indexOf("create or replace function api.my_documents")
    );
    expect(propertyBody).not.toMatch(/security definer/);
    const apiBody = codeNoComments.slice(codeNoComments.indexOf("create or replace function api.my_documents"));
    expect(apiBody).toMatch(/security definer/);
  });

  it("restates the same grants 0149 already established, unchanged", () => {
    expect(codeNoComments).toMatch(
      /revoke all on function property\.my_documents\(uuid, uuid, uuid, uuid, uuid\) from public, anon, authenticated, service_role;/
    );
    expect(codeNoComments).toMatch(
      /revoke all on function api\.my_documents\(uuid, uuid, uuid, uuid, uuid\) from public, anon, service_role;/
    );
    expect(codeNoComments).toMatch(
      /grant execute on function api\.my_documents\(uuid, uuid, uuid, uuid, uuid\) to authenticated;/
    );
  });
});
