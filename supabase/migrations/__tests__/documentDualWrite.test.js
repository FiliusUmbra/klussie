// Keeps 0061_document_dual_write.sql inside the six-step pattern (roadmap §3, step 3):
// both source tables stay authoritative, the mirror never deletes an evidence-class
// document (neither type here is evidence, but the guard trigger from 0055 still governs
// it), and the FK fix that makes deleting a document safe again is actually present.
//
// Structural. Trigger behaviour is proven against staging by VERIFY_DOCUMENT_DUAL_WRITE.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0061_document_dual_write.sql";

const raw = readFileSync(MIGRATION, "utf8");
const codeNoComments = raw
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");
const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0061_document_dual_write migration", () => {
  it("fixes both document_id foreign keys to ON DELETE CASCADE, never SET NULL", () => {
    expect(code).toMatch(/on delete cascade/gi);
    expect(code).not.toMatch(/on delete set null/i);
    // Appears in the two `alter table ... add constraint` statements themselves, plus
    // the two column comments documenting why — 4 mentions total is correct, not 2.
    expect((codeNoComments.match(/on delete cascade/gi) || []).length).toBe(4);
  });

  it("discovers both constraint names rather than assuming them", () => {
    expect((codeNoComments.match(/select conname into v_constraint_name/g) || []).length).toBe(2);
    expect(codeNoComments).toMatch(/conrelid = 'property\.document_attachments'::regclass/);
    expect(codeNoComments).toMatch(/conrelid = 'property\.document_shares'::regclass/);
  });

  it("adds exactly four triggers — insert and delete on each source table, no update trigger on either", () => {
    const triggers = [...codeNoComments.matchAll(/create trigger (\w+)\s*\n\s*(before|after) (insert|update|delete) on (public\.\w+)/gi)];
    expect(triggers).toHaveLength(4);
    expect(triggers.map((m) => m[4]).sort()).toEqual([
      "public.portfolio_items", "public.portfolio_items",
      "public.service_request_photos", "public.service_request_photos",
    ]);
    expect(triggers.map((m) => `${m[2]} ${m[3]}`.toLowerCase()).sort()).toEqual([
      "after insert", "after insert", "before delete", "before delete",
    ]);
    expect(codeNoComments).not.toMatch(/after update on public\.(portfolio_items|service_request_photos)/i);
  });

  it("mints every id via platform.uuid_v7_at(now()), never gen_random_uuid or a bare uuid_v7()", () => {
    expect(code).toMatch(/platform\.uuid_v7_at\(now\(\)\)/);
    expect(code).not.toMatch(/gen_random_uuid/i);
    expect(code).not.toMatch(/(?<!_)uuid_v7\(\)/);
  });

  it("both insert mirrors are idempotent on their bookkeeping column", () => {
    expect(codeNoComments).toMatch(/on conflict \(portfolio_item_id\) where portfolio_item_id is not null do nothing/);
    expect(codeNoComments).toMatch(/on conflict \(service_request_photo_id\) where service_request_photo_id is not null do nothing/);
  });

  it("silently mirrors nothing when no workspace resolves — no exception raised in either insert mirror", () => {
    const portfolioStart = codeNoComments.indexOf("function public.portfolio_items_mirror_insert");
    const portfolioBlock = codeNoComments.slice(portfolioStart, codeNoComments.indexOf("$$;", portfolioStart));
    expect(portfolioBlock).toMatch(/if v_workspace_id is null then\s*\n\s*return new;/);
    expect(portfolioBlock).not.toMatch(/raise exception/i);

    const requestStart = codeNoComments.indexOf("function public.service_request_photos_mirror_insert");
    const requestBlock = codeNoComments.slice(requestStart, codeNoComments.indexOf("$$;", requestStart));
    expect(requestBlock).toMatch(/if v_workspace_id is null then\s*\n\s*return new;/);
    expect(requestBlock).not.toMatch(/raise exception/i);
  });

  it("both delete mirrors run BEFORE the row is gone and issue a real delete, not a disposal", () => {
    const start = codeNoComments.indexOf("create trigger portfolio_items_mirror_delete");
    const block = codeNoComments.slice(start, start + 200);
    expect(block).toMatch(/before delete on public\.portfolio_items/i);

    const start2 = codeNoComments.indexOf("create trigger service_request_photos_mirror_delete");
    const block2 = codeNoComments.slice(start2, start2 + 220);
    expect(block2).toMatch(/before delete on public\.service_request_photos/i);

    expect(codeNoComments).toMatch(/delete from property\.documents where portfolio_item_id = old\.id/);
    expect(codeNoComments).toMatch(/delete from property\.documents where service_request_photo_id = old\.id/);
    expect(codeNoComments).not.toMatch(/lifecycle_state/i);
  });

  it("portfolio photos attach to the pro's own workspace; request photos are left unattached, matching 0060", () => {
    const start = codeNoComments.indexOf("function public.portfolio_items_mirror_insert");
    const end = codeNoComments.indexOf("function public.portfolio_items_mirror_delete");
    const portfolioBlock = codeNoComments.slice(start, end);
    expect(portfolioBlock).toMatch(/insert into property\.document_attachments/);

    const requestStart = codeNoComments.indexOf("function public.service_request_photos_mirror_insert");
    const requestEnd = codeNoComments.indexOf("function public.service_request_photos_mirror_delete");
    const requestBlock = codeNoComments.slice(requestStart, requestEnd);
    expect(requestBlock).not.toMatch(/insert into property\.document_attachments/);
    expect(requestBlock).toMatch(/insert into property\.document_shares/);
  });

  it("reproduces pro_matches_request()'s exact predicate for the live share, matching 0060's snapshot", () => {
    const start = codeNoComments.indexOf("function public.service_request_photos_mirror_insert");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/not pp\.paused/);
    expect(block).toMatch(/sv\.certified_only = false or coalesce\(st\.is_certified, false\)/);
    expect(block).toMatch(/sr\.city is null or prof\.city is null or lower\(sr\.city\) = lower\(prof\.city\)/);
  });

  it("every SECURITY DEFINER function sets search_path to empty, not public", () => {
    const definerFns = [...codeNoComments.matchAll(/create or replace function ([\w.]+)\([^)]*\)[\s\S]*?security definer[\s\S]*?set search_path = (\S+)/gi)];
    expect(definerFns.length).toBe(4);
    for (const [, name, path] of definerFns) {
      expect(path, `${name} does not use an empty search_path`).toBe("''");
    }
  });

  it("no application role is granted UPDATE, INSERT or DELETE on property.documents directly", () => {
    expect(code).not.toMatch(/grant (update|insert|delete) on property\.documents to (anon|authenticated)/i);
  });
});
