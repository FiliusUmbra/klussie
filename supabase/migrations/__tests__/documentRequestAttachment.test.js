// Keeps 0149_document_request_attachment.sql (Platform Activation Slice 2, WP 2.6)
// inside its own stated rules: request becomes the Document Engine's fifth real subject,
// my_documents()/api.my_documents() are dropped and recreated (not merely "or replace")
// with the new parameter, and create_document_for_request() is a genuinely new function
// with its own request-based authorization check, never a branch inside create_document().
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0149_document_request_attachment.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName, code) {
  const start = code.indexOf(`create or replace function ${functionName}`);
  const end = code.indexOf("$$;", start);
  return code.slice(start, end);
}

describe("0149_document_request_attachment migration", () => {
  it("adds request_id to property.document_attachments and extends the exactly-one-subject constraint to five columns", () => {
    expect(codeNoComments).toMatch(/add column if not exists request_id uuid references work\.requests \(id\)/);
    expect(codeNoComments).toMatch(
      /check \(num_nonnulls\(property_id, location_id, asset_id, workspace_id, request_id\) = 1\)/
    );
  });

  it("drops the old four-parameter my_documents() signatures before recreating them — 0148's own finding, applied again", () => {
    expect(codeNoComments).toMatch(/drop function if exists property\.my_documents\(uuid, uuid, uuid, uuid\)/);
    expect(codeNoComments).toMatch(/drop function if exists api\.my_documents\(uuid, uuid, uuid, uuid\)/);
  });

  describe("property.my_documents() — extended to five subjects", () => {
    const block = bodyOf("property.my_documents", codeNoComments);

    it("requires exactly one of five subjects, not four", () => {
      expect(block).toMatch(
        /num_nonnulls\(p_property_id, p_location_id, p_asset_id, p_workspace_id, p_request_id\) <> 1/
      );
    });

    it("joins the request subject the same way as the other four, through document_attachments", () => {
      expect(block).toMatch(/p_request_id is not null and da\.request_id = p_request_id/);
    });

    it("keeps the exact same visibility rule (owning workspace or an explicit share) for every subject, including request", () => {
      expect(block).toMatch(
        /d\.owning_workspace_id in \(select workspace_id from workspace\.current_memberships\(\)\)/
      );
      expect(block).toMatch(/property\.document_shares ds/);
    });
  });

  describe("property.create_document_for_request() — a new function, not a branch inside create_document()", () => {
    const block = bodyOf("property.create_document_for_request", codeNoComments);

    it("checks real membership in the request's own requesting workspace, resolved from the row", () => {
      expect(block).toMatch(
        /select r\.requesting_workspace_id into v_requesting_ws\s*\n\s*from work\.requests r\s*\n\s*join workspace\.current_memberships\(\) m on m\.workspace_id = r\.requesting_workspace_id/
      );
    });

    it("validates storage_path is rooted under the requesting workspace's own folder, the same rule create_document() holds for a property's steward", () => {
      expect(block).toMatch(/starts_with\(p_storage_path, v_requesting_ws::text \|\| '\/'\)/);
    });

    it("inserts into document_attachments with request_id, no other subject column", () => {
      expect(block).toMatch(/insert into property\.document_attachments \(id, document_id, request_id\)/);
    });

    it("does not touch property.create_document() itself", () => {
      expect(codeNoComments).not.toMatch(/create or replace function property\.create_document\(/);
    });
  });

  describe("delegates", () => {
    it("api.my_documents() is a thin SECURITY DEFINER pass-through with the same five parameters", () => {
      const block = bodyOf("api.my_documents", codeNoComments);
      expect(block).toMatch(/security definer/i);
      expect(block).toMatch(
        /select \* from property\.my_documents\(p_property_id, p_location_id, p_asset_id, p_workspace_id, p_request_id\)/
      );
    });

    it("api.create_document_for_request() is a thin SECURITY DEFINER pass-through", () => {
      const block = bodyOf("api.create_document_for_request", codeNoComments);
      expect(block).toMatch(/security definer/i);
      expect(block).toMatch(/property\.create_document_for_request\(/);
    });
  });

  describe("access", () => {
    it("grants api.my_documents() and api.create_document_for_request() to authenticated only", () => {
      expect(codeNoComments).toMatch(
        /grant execute on function api\.my_documents\(uuid, uuid, uuid, uuid, uuid\) to authenticated/
      );
      expect(codeNoComments).toMatch(
        /grant execute on function api\.create_document_for_request\([^)]+\)\s*to authenticated/
      );
    });

    it("keeps both property.* functions unreachable by any application role", () => {
      expect(codeNoComments).toMatch(
        /revoke all on function property\.my_documents\(uuid, uuid, uuid, uuid, uuid\) from public, anon, authenticated, service_role/
      );
      expect(codeNoComments).toMatch(
        /revoke all on function property\.create_document_for_request\([^)]+\)\s*from public, anon, authenticated, service_role/
      );
    });
  });
});
