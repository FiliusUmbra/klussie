// Platform Activation Slice 3, WP 3.3 — the one genuinely-required new capability the
// editor's own design note (WP_3_3_SERVICE_RECORD_EDITOR_DESIGN.md §4) found before any
// UI was built: evidence photos need a real write path from the PERFORMING side, which
// property.create_document_for_request() (0149) cannot serve — it is single-sided to
// the requesting workspace by design.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0165_service_record_evidence_documents.sql";

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

describe("0165_service_record_evidence_documents migration", () => {
  it("seeds service_evidence as retention_class evidence (never deletable), not public", () => {
    expect(codeNoComments).toMatch(
      /insert into property\.document_types \(type_key, retention_class, is_public\)\s*\n\s*values \('service_evidence', 'evidence', false\)/
    );
  });

  it("checks the caller against the PERFORMING workspace, resolved from work.engagements, not trusted from the caller", () => {
    const block = bodyOf("property.create_document_for_service_record", codeNoComments);
    expect(block).toMatch(/e\.performing_workspace_id in \(select workspace_id from workspace\.current_memberships\(\)\)/);
    expect(block).toContain("where e.service_record_id = p_service_record_id");
  });

  it("hardcodes type_key to service_evidence — not a caller-supplied parameter", () => {
    const block = bodyOf("property.create_document_for_service_record", codeNoComments);
    const paramList = block.slice(0, block.indexOf(")\nreturns"));
    expect(paramList).not.toMatch(/p_type_key/);
    expect(block).toContain("'service_evidence'");
  });

  it("owns the document under the performing workspace, roots the storage path under it", () => {
    const block = bodyOf("property.create_document_for_service_record", codeNoComments);
    expect(block).toMatch(/values\s*\n\s*\(p_document_id, v_performing_ws, 'service_evidence'/);
    expect(block).toMatch(/pg_catalog\.starts_with\(p_storage_path, v_performing_ws::text \|\| '\/'\)/);
  });

  it("shares the document with the requesting workspace — the customer's own visibility, not a widened my_documents() predicate", () => {
    const block = bodyOf("property.create_document_for_service_record", codeNoComments);
    expect(block).toMatch(/insert into property\.document_shares \(id, document_id, shared_with_workspace_id\)/);
    expect(block).toMatch(/values \(gen_random_uuid\(\), p_document_id, v_requesting_ws\)/);
  });

  it("attaches under the record's own originating request_id, the same subject request_photo already uses", () => {
    const block = bodyOf("property.create_document_for_service_record", codeNoComments);
    expect(block).toMatch(/insert into property\.document_attachments \(id, document_id, request_id\)/);
    expect(block).toMatch(/values \(p_attachment_id, p_document_id, v_request_id\)/);
  });

  it("is not SECURITY DEFINER — reachable only through its api.* delegate", () => {
    const block = bodyOf("property.create_document_for_service_record", codeNoComments);
    expect(block).not.toMatch(/security definer/);
  });

  it("api.create_document_for_service_record is SECURITY DEFINER and delegates entirely to the property.* function", () => {
    const block = bodyOf("api.create_document_for_service_record", codeNoComments);
    expect(block).toMatch(/security definer/);
    expect(block).toContain("property.create_document_for_service_record");
  });

  it("revokes the property.* function from every role, grants only authenticated on the api.* delegate", () => {
    expect(codeNoComments).toMatch(
      /revoke all on function property\.create_document_for_service_record\([^)]*\)\s*\n\s*from public, anon, authenticated, service_role/
    );
    expect(codeNoComments).toMatch(
      /revoke all on function api\.create_document_for_service_record\([^)]*\)\s*\n\s*from public, anon, service_role/
    );
    expect(codeNoComments).toMatch(
      /grant execute on function api\.create_document_for_service_record\([^)]*\)\s*\n\s*to authenticated/
    );
  });
});
