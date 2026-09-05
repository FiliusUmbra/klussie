// Keeps 0199_asset_document_attachment.sql inside the exact shape its own header
// commits to: property.create_document()/api.create_document() now accept either a
// property or an asset as the document's subject (exactly one), the asset path resolves
// through the asset's own property before applying the identical membership check the
// property path already used, the old 12-parameter overload is dropped rather than left
// alongside the new one, and the ai_usage_log endpoint catalog grows by exactly one
// value. Structural, like every migration test in this repository
// (docs/engineering/TESTING.md §3) -- behaviour is proven against real staging data by
// VERIFY_ASSET_DOCUMENT_ATTACHMENT.sql, not re-derived here.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0199_asset_document_attachment.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName) {
  const start = codeNoComments.indexOf(`create or replace function ${functionName}`);
  expect(start).toBeGreaterThan(-1);
  const end = codeNoComments.indexOf("\n$$;", start);
  return codeNoComments.slice(start, end);
}

describe("0199_asset_document_attachment migration", () => {
  describe("property.create_document()", () => {
    const NEW_SIGNATURE =
      "property.create_document(\n  p_document_id     uuid,\n  p_attachment_id   uuid,\n  p_type_key        text,\n  p_storage_path    text,\n  p_issuer          text,\n  p_valid_from      date,\n  p_valid_until     date,\n  p_event_id        uuid,\n  p_correlation_id  uuid,\n  p_actor_type      platform.actor_type,\n  p_actor_ref       text,\n  p_property_id     uuid default null,\n  p_asset_id        uuid default null\n)";

    it("makes p_property_id and p_asset_id both optional, trailing", () => {
      const block = bodyOf(NEW_SIGNATURE);
      expect(block).toMatch(/p_property_id\s+uuid default null/);
      expect(block).toMatch(/p_asset_id\s+uuid default null/);
    });

    it("requires exactly one of property or asset", () => {
      const block = bodyOf(NEW_SIGNATURE);
      expect(block).toMatch(/num_nonnulls\(p_property_id, p_asset_id\) <> 1/);
      expect(block).toMatch(/invalid_parameter_value/);
    });

    it("resolves an asset's own property before checking membership", () => {
      const block = bodyOf(NEW_SIGNATURE);
      expect(block).toMatch(/select a\.property_id into v_property_id\s*\n\s*from property\.assets a/);
    });

    it("checks caller membership against the resolved property's steward workspace", () => {
      const block = bodyOf(NEW_SIGNATURE);
      expect(block).toMatch(/join workspace\.current_memberships\(\) m on m\.workspace_id = p\.steward_workspace_id/);
      expect(block).toMatch(/insufficient_privilege/);
    });

    it("attaches to the asset when given, to the property otherwise -- never both", () => {
      const block = bodyOf(NEW_SIGNATURE);
      expect(block).toMatch(/insert into property\.document_attachments \(id, document_id, asset_id\)/);
      expect(block).toMatch(/insert into property\.document_attachments \(id, document_id, property_id\)/);
    });

    it("still enforces the storage_path workspace-rooting check, unchanged", () => {
      const block = bodyOf(NEW_SIGNATURE);
      expect(block).toMatch(/pg_catalog\.starts_with\(p_storage_path, v_steward_workspace_id::text \|\| '\/'\)/);
    });

    it("still emits property.document.created, now carrying assetId in the payload", () => {
      expect(codeNoComments).toMatch(/p_event_type\s+=> 'property\.document\.created'/);
      expect(codeNoComments).toMatch(/'assetId', p_asset_id/);
    });
  });

  describe("api.create_document()", () => {
    it("delegates with the same new parameter list, including p_asset_id", () => {
      const start = codeNoComments.indexOf("create or replace function api.create_document");
      expect(start).toBeGreaterThan(-1);
      const end = codeNoComments.indexOf("\n$$;", start);
      const block = codeNoComments.slice(start, end);
      expect(block).toMatch(/p_asset_id\s+uuid default null/);
      expect(block).toMatch(/select property\.create_document\(/);
    });
  });

  describe("old signature cleanup", () => {
    it("drops the original 12-parameter overload of both property.create_document() and api.create_document()", () => {
      expect(codeNoComments).toMatch(
        /drop function if exists property\.create_document\(uuid, uuid, uuid, text, text, text, date, date, uuid, uuid, platform\.actor_type, text\);/
      );
      expect(codeNoComments).toMatch(
        /drop function if exists api\.create_document\(uuid, uuid, uuid, text, text, text, date, date, uuid, uuid, platform\.actor_type, text\);/
      );
    });
  });

  describe("access grants", () => {
    it("revokes the new signature from every role, then grants api.create_document() to authenticated only", () => {
      expect(codeNoComments).toMatch(
        /revoke all on function property\.create_document\(uuid, uuid, text, text, text, date, date, uuid, uuid, platform\.actor_type, text, uuid, uuid\)\s*\n\s*from public, anon, authenticated, service_role;/
      );
      expect(codeNoComments).toMatch(
        /revoke all on function api\.create_document\(uuid, uuid, text, text, text, date, date, uuid, uuid, platform\.actor_type, text, uuid, uuid\)\s*\n\s*from public, anon, service_role;/
      );
      expect(codeNoComments).toMatch(
        /grant execute on function api\.create_document\(uuid, uuid, text, text, text, date, date, uuid, uuid, platform\.actor_type, text, uuid, uuid\)\s*\n\s*to authenticated;/
      );
    });
  });

  describe("ai_usage_log endpoint catalog", () => {
    it("resolves the existing check constraint's name dynamically before dropping it", () => {
      expect(codeNoComments).toMatch(/select conname into v_constraint_name/);
      expect(codeNoComments).toMatch(/conrelid = 'public\.ai_usage_log'::regclass/);
      expect(codeNoComments).toMatch(/execute format\('alter table public\.ai_usage_log drop constraint %I', v_constraint_name\)/);
    });

    it("adds ask-about-item alongside the two existing endpoints, not replacing them", () => {
      expect(codeNoComments).toMatch(
        /check \(endpoint in \('ai-intake', 'translate-message', 'ask-about-item'\)\)/
      );
    });
  });
});
