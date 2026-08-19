// Keeps 0141_document_write_contract.sql (Platform Activation Slice 1, WP 1.6) inside its
// own stated rules: the 'documents' Storage bucket and its workspace-membership-based
// policies (via api.current_workspace_memberships(), never api.list_my_workspaces()),
// four new customer-facing document_types, and property.create_document()'s own
// authorization/storage-path/one-exception shape, reachable only through its api.*
// delegate.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0141_document_write_contract.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName, code) {
  const start = code.indexOf(`create or replace function ${functionName}`);
  const end = code.indexOf("$$;", start);
  return code.slice(start, end);
}

describe("0141_document_write_contract migration", () => {
  describe("Storage bucket and policies", () => {
    it("creates a private 'documents' bucket", () => {
      expect(codeNoComments).toMatch(/insert into storage\.buckets \(id, name, public\)/);
      expect(codeNoComments).toMatch(/values \('documents', 'documents', false\)/);
    });

    it("gates the insert and select policies on workspace membership via api.current_workspace_memberships(), not auth.uid()", () => {
      expect(codeNoComments).toMatch(/create policy "workspace members can upload own documents"\s*\non storage\.objects for insert/);
      expect(codeNoComments).toMatch(/create policy "workspace members can view own documents"\s*\non storage\.objects for select/);
      const policyCount = (codeNoComments.match(/select workspace_id::text from api\.current_workspace_memberships\(\)/g) || []).length;
      expect(policyCount).toBe(2);
      expect(codeNoComments).not.toMatch(/auth\.uid\(\)/);
    });

    it("never uses api.list_my_workspaces() as an isolation predicate — that function's own comment forbids it", () => {
      expect(codeNoComments).not.toMatch(/list_my_workspaces/);
    });

    it("compares the folder segment as text, never casting it to uuid", () => {
      expect(codeNoComments).toMatch(/\(storage\.foldername\(name\)\)\[1\] in \(/);
      expect(codeNoComments).not.toMatch(/\(storage\.foldername\(name\)\)\[1\]\)::uuid/);
    });

    it("defines no update or delete policy on storage.objects for the documents bucket", () => {
      expect(codeNoComments).not.toMatch(/on storage\.objects for update/);
      expect(codeNoComments).not.toMatch(/on storage\.objects for delete/);
    });
  });

  describe("document_types seed", () => {
    it("seeds four new customer-facing types, all convenience, guarded against re-running", () => {
      expect(codeNoComments).toMatch(
        /insert into property\.document_types \(type_key, retention_class\) values\s*\n\s*\('warranty', 'convenience'\),\s*\n\s*\('certificate', 'convenience'\),\s*\n\s*\('manual', 'convenience'\),\s*\n\s*\('other', 'convenience'\)\s*\n\s*on conflict \(type_key\) do nothing/
      );
    });
  });

  describe("property.create_document()", () => {
    const block = bodyOf("property.create_document", codeNoComments);

    it("is not SECURITY DEFINER — it inherits the delegate's context", () => {
      expect(block).not.toMatch(/security definer/i);
    });

    it("checks the caller's real membership via the property's own steward workspace", () => {
      expect(block).toMatch(
        /join workspace\.current_memberships\(\) m on m\.workspace_id = p\.steward_workspace_id/
      );
    });

    it("raises one generic exception for an unauthorized or nonexistent property", () => {
      expect(block).toMatch(/if v_steward_workspace_id is null then/);
      expect(block).toMatch(/errcode = 'insufficient_privilege'/);
      expect(block).not.toMatch(/no such property/i);
    });

    it("validates storage_path is rooted under the caller's own resolved workspace folder", () => {
      expect(block).toMatch(/pg_catalog\.starts_with\(p_storage_path, v_steward_workspace_id::text \|\| '\/'\)/);
      expect(block).toMatch(/errcode = 'invalid_parameter_value'/);
    });

    it("always writes storage_bucket as the literal 'documents' — never a parameter", () => {
      expect(block).toMatch(/'documents', p_storage_path/);
      expect(block).not.toMatch(/p_storage_bucket/);
    });

    it("inserts both the document row and its property attachment", () => {
      expect(block).toMatch(/insert into property\.documents/);
      expect(block).toMatch(/insert into property\.document_attachments \(id, document_id, property_id\)/);
      expect(block).toMatch(/values \(p_attachment_id, p_document_id, p_property_id\)/);
    });

    it("emits property.document.created", () => {
      expect(block).toMatch(/p_event_type\s+=> 'property\.document\.created'/);
      expect(block).toMatch(/p_subject_type\s+=> 'document'/);
    });
  });

  describe("api.create_document()", () => {
    it("is a thin SECURITY DEFINER pass-through calling property.create_document() and nothing else", () => {
      const block = bodyOf("api.create_document", codeNoComments);
      expect(block).toMatch(/security definer/i);
      expect(block).toMatch(/select property\.create_document\(/);
    });
  });

  describe("access", () => {
    it("revokes property.create_document() from every role, including authenticated — reachable only as a nested call", () => {
      expect(codeNoComments).toMatch(
        /revoke all on function property\.create_document\(uuid, uuid, uuid, text, text, text, date, date, uuid, uuid, platform\.actor_type, text\)\s*from public, anon, authenticated, service_role/
      );
    });

    it("grants api.create_document() to authenticated only, after an explicit revoke from public/anon/service_role", () => {
      expect(codeNoComments).toMatch(
        /revoke all on function api\.create_document\(uuid, uuid, uuid, text, text, text, date, date, uuid, uuid, platform\.actor_type, text\)\s*from public, anon, service_role/
      );
      expect(codeNoComments).toMatch(
        /grant execute on function api\.create_document\(uuid, uuid, uuid, text, text, text, date, date, uuid, uuid, platform\.actor_type, text\)\s*to authenticated/
      );
    });

    it("does not re-grant USAGE on schema api — already granted in 0031", () => {
      expect(codeNoComments).not.toMatch(/grant usage on schema api/i);
    });

    it("does not build update_document() or delete_document() — named as deferred, not silently omitted", () => {
      expect(codeNoComments).not.toMatch(/create or replace function (property|api)\.update_document/);
      expect(codeNoComments).not.toMatch(/create or replace function (property|api)\.delete_document/);
    });

    it("accepts only p_property_id as the attachment target — not p_location_id/p_asset_id/a caller-supplied workspace subject", () => {
      const block = bodyOf("property.create_document", codeNoComments);
      const signature = block.slice(0, block.indexOf(")\nreturns void"));
      expect(signature).not.toMatch(/p_location_id/);
      expect(signature).not.toMatch(/p_asset_id/);
      expect(signature).not.toMatch(/p_workspace_id/);
    });
  });
});
