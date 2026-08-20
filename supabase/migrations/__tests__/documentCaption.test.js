// Keeps 0064_document_caption.sql inside §5.6's own finding: caption is a real
// client-mutable field on portfolio_items with no equivalent on property.documents until
// this migration, and it must never be mirrored for request_photo, which has no such
// field to mirror.
//
// Structural. Behaviour is proven against staging by VERIFY_DOCUMENT_CAPTION.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0064_document_caption.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0064_document_caption migration", () => {
  it("adds a nullable caption column and backfills it onto already-mirrored rows", () => {
    expect(codeNoComments).toMatch(/alter table property\.documents add column if not exists caption text/);
    expect(codeNoComments).toMatch(
      /update property\.documents d\s*\n\s*set caption = pi\.caption\s*\n\s*from public\.portfolio_items pi\s*\n\s*where d\.portfolio_item_id = pi\.id/
    );
  });

  it("every contract function's return shape gains caption", () => {
    const returnBlocks = [...codeNoComments.matchAll(/returns table \(([\s\S]*?)\)\nlanguage/g)];
    expect(returnBlocks.length).toBe(6); // 3 engine functions + 3 api delegates
    for (const [, block] of returnBlocks) {
      expect(block).toMatch(/caption\s+text/);
    }
  });

  it("documents_for_service_request never sets caption — request_photo has nothing to mirror", () => {
    const start = codeNoComments.indexOf("create or replace function property.documents_for_service_request");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    // caption appears only in the select list (as d.caption), never assigned a value
    expect(block).toMatch(/d\.caption/);
    expect(block).not.toMatch(/caption = /);
  });

  it("the insert mirror carries caption from the start", () => {
    const start = codeNoComments.indexOf("create or replace function public.portfolio_items_mirror_insert");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/storage_bucket, storage_path, caption, portfolio_item_id/);
    expect(block).toMatch(/new\.storage_path, new\.caption, new\.id/);
  });

  it("adds a genuinely new UPDATE trigger on portfolio_items, guarded on caption actually changing", () => {
    expect(codeNoComments).toMatch(/create trigger portfolio_items_mirror_update/);
    expect(codeNoComments).toMatch(/after update on public\.portfolio_items/);
    expect(codeNoComments).toMatch(/when \(old\.caption is distinct from new\.caption\)/);
  });

  it("the update mirror only ever touches caption, never any other column", () => {
    const start = codeNoComments.indexOf("function public.portfolio_items_mirror_update");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/set caption = new\.caption, updated_at = now\(\)/);
    expect(block).not.toMatch(/storage_path|storage_bucket|type_key/);
  });

  it("every function keeps search_path empty", () => {
    const fns = [...codeNoComments.matchAll(/create or replace function ([\w.]+)\([^)]*\)[\s\S]*?set search_path = (\S+)/gi)];
    expect(fns.length).toBeGreaterThan(0);
    for (const [, name, path] of fns) {
      expect(path, `${name} does not use an empty search_path`).toBe("''");
    }
  });

  it("re-grants execute on all three api delegates, to anon or authenticated matching their own established grant", () => {
    expect(code).toMatch(/grant execute on function api\.my_documents\(uuid, uuid, uuid, uuid\) to anon, authenticated/i);
    expect(code).toMatch(/grant execute on function api\.resolve_document\(uuid\) to anon, authenticated/i);
    expect(code).toMatch(/grant execute on function api\.documents_for_service_request\(uuid\) to authenticated/i);
    expect(code).not.toMatch(/grant execute on function api\.documents_for_service_request\(uuid\) to anon/i);
  });
});
