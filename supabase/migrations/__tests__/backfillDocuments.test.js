// Keeps 0060_backfill_documents.sql inside its own stated rules: idempotent via
// bookkeeping columns that learn from 0052/0053's own FK-delete history (ON DELETE SET
// NULL from the start this time), avatar_url deliberately excluded, and request photos
// left genuinely unattached rather than forced onto a subject that doesn't fit.
//
// Structural. Behaviour is proven against staging by VERIFY_BACKFILL_DOCUMENTS.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0060_backfill_documents.sql";

const raw = readFileSync(MIGRATION, "utf8").replace(/\r\n/g, "\n");

const codeNoComments = raw
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

// Section markers ("-- 1 · PORTFOLIO PHOTOS") are themselves `--` comments, so they
// don't exist in codeNoComments — boundaries are found in `raw`, then the slice is
// comment-stripped the same way codeNoComments is built globally.
function section(startMarker, endMarker) {
  const start = raw.indexOf(startMarker);
  const end = endMarker ? raw.indexOf(endMarker) : raw.length;
  return raw
    .slice(start, end)
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("0060_backfill_documents migration", () => {
  it("adds both bookkeeping columns with ON DELETE SET NULL from the start", () => {
    const start = codeNoComments.indexOf("alter table property.documents\n  add column if not exists portfolio_item_id");
    const block = codeNoComments.slice(start, codeNoComments.indexOf(";", start) + 1);
    expect(block).toMatch(/references public\.portfolio_items \(id\) on delete set null/);

    const start2 = codeNoComments.indexOf("alter table property.documents\n  add column if not exists service_request_photo_id");
    const block2 = codeNoComments.slice(start2, codeNoComments.indexOf(";", start2) + 1);
    expect(block2).toMatch(/references public\.service_request_photos \(id\) on delete set null/);
  });

  it("adds a unique partial index on each bookkeeping column, for idempotency", () => {
    expect(codeNoComments).toMatch(
      /create unique index if not exists documents_portfolio_item_id_uidx\s*\n\s*on property\.documents \(portfolio_item_id\)\s*\n\s*where portfolio_item_id is not null/
    );
    expect(codeNoComments).toMatch(
      /create unique index if not exists documents_service_request_photo_id_uidx\s*\n\s*on property\.documents \(service_request_photo_id\)\s*\n\s*where service_request_photo_id is not null/
    );
  });

  it("never writes to public.portfolio_items or public.service_request_photos — read-only against both", () => {
    expect(code).not.toMatch(/(insert into|update|delete from) public\.portfolio_items/i);
    expect(code).not.toMatch(/(insert into|update|delete from) public\.service_request_photos/i);
  });

  it("never touches avatar_url — the Platform Discovery this migration honours", () => {
    // public.profiles itself IS legitimately joined (for city, reproducing
    // pro_matches_request()'s own predicate) — avatar_url specifically is what's excluded.
    expect(codeNoComments).not.toMatch(/avatar_url/i);
  });

  it("mints every id via platform.uuid_v7_at, never gen_random_uuid", () => {
    expect(code).toMatch(/platform\.uuid_v7_at\(pi\.created_at\)/);
    expect(code).toMatch(/platform\.uuid_v7_at\(srp\.created_at\)/);
    expect(code).toMatch(/platform\.uuid_v7_at\(now\(\)\)/);
    expect(code).not.toMatch(/gen_random_uuid/i);
  });

  it("resolves the portfolio owner's Professional Workspace through the established identity-to-workspace chain", () => {
    const block = section("-- 1 · PORTFOLIO PHOTOS", "-- 2 · REQUEST PHOTOS");
    expect(block).toMatch(/join identity\.identities i on i\.auth_user_id = pi\.pro_id/);
    expect(block).toMatch(/m\.role = 'owner'/);
    expect(block).toMatch(/m\.state = 'active'/);
    expect(block).toMatch(/w\.type = 'professional'/);
  });

  it("attaches portfolio photos to the pro's own workspace, request photos to nothing", () => {
    const portfolioBlock = section("-- 1 · PORTFOLIO PHOTOS", "-- 2 · REQUEST PHOTOS");
    expect(portfolioBlock).toMatch(/insert into property\.document_attachments \(id, document_id, workspace_id\)/);

    const requestBlock = section("-- 2 · REQUEST PHOTOS", null);
    expect(requestBlock).not.toMatch(/insert into property\.document_attachments/);
  });

  it("shares request photos by reproducing pro_matches_request()'s exact predicate, snapshotted", () => {
    const block = section("-- 2 · REQUEST PHOTOS", null);
    expect(block).toMatch(/not pp\.paused/);
    expect(block).toMatch(/sv\.certified_only = false or coalesce\(st\.is_certified, false\)/);
    expect(block).toMatch(/sr\.city is null or prof\.city is null or lower\(sr\.city\) = lower\(prof\.city\)/);
    expect(block).toMatch(/on conflict \(document_id, shared_with_workspace_id\) do nothing/);
  });

  it("backfills both types with their correct storage_bucket, matching each source's real existing bucket", () => {
    expect(codeNoComments).toMatch(/'portfolio_photo', 'portfolio', storage_path/);
    expect(codeNoComments).toMatch(/'request_photo', 'request-photos', storage_path/);
  });

  it("is idempotent — every insert is guarded by a not-exists check against its own bookkeeping column", () => {
    expect(codeNoComments).toMatch(/where not exists \(\s*\n\s*select 1 from property\.documents d where d\.portfolio_item_id = pi\.id/);
    expect(codeNoComments).toMatch(/where not exists \(\s*\n\s*select 1 from property\.documents d where d\.service_request_photo_id = srp\.id/);
  });
});
