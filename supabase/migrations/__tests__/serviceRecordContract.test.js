// Keeps 0084_service_record_contract.sql inside ADR-0022 (no server-side id minting,
// not even for a conditional second event), §17's authorship split (separate functions
// per author, never one generic write path), and the "resolve the current steward
// itself" rule for the property annex.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0084_service_record_contract.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0084_service_record_contract migration", () => {
  it("defines exactly ten functions, all in work, none in api", () => {
    const created = [...codeNoComments.matchAll(/create or replace function (work\.\w+|api\.\w+)\(/g)].map((m) => m[1]);
    expect(created.sort()).toEqual([
      "work.amend_service_record",
      "work.create_service_record",
      "work.my_performing_annex",
      "work.my_property_annex",
      "work.my_service_records",
      "work.record_service_record_approval",
      "work.resolve_service_record",
      "work.service_record_history",
      "work.write_performing_annex",
      "work.write_property_annex",
    ]);
  });

  it("never calls gen_random_uuid or uuid_v7_at — every identifier, including the conditional WarrantyArising event, is a required parameter", () => {
    expect(codeNoComments).not.toMatch(/perform platform\.emit_event\(\s*\n\s*p_event_id\s*=> gen_random_uuid\(\)/);
    const insideFunctions = codeNoComments.slice(codeNoComments.indexOf("create or replace function"));
    expect(insideFunctions).not.toMatch(/gen_random_uuid\(\)/);
    expect(insideFunctions).not.toMatch(/uuid_v7_at/);

    const start = codeNoComments.indexOf("create or replace function work.create_service_record(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("returns void", start));
    expect(block).toMatch(/p_warranty_event_id\s+uuid,/);
    expect(block).not.toMatch(/uuid\s+default/);
  });

  it("create_service_record emits service_record.service_record.warranty_arising with p_warranty_event_id only when warranty_until is set", () => {
    const start = codeNoComments.indexOf("create or replace function work.create_service_record(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/if p_warranty_until is not null then/);
    expect(block).toMatch(/p_event_id\s*=> p_warranty_event_id/);
    expect(block).toMatch(/'service_record\.service_record\.warranty_arising'/);
    // Exactly two emit_event calls: the unconditional service_record.service_record.created
    // and the conditional service_record.service_record.warranty_arising.
    expect((block.match(/perform platform\.emit_event\(/g) || []).length).toBe(2);
  });

  it("record_service_record_approval refuses if the record does not exist or is already approved, before mutating anything", () => {
    const start = codeNoComments.indexOf("create or replace function work.record_service_record_approval(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    const notExistIdx = block.indexOf("does not exist");
    const alreadyIdx = block.indexOf("is already approved");
    const updateIdx = block.indexOf("update work.service_records");
    expect(notExistIdx).toBeGreaterThan(-1);
    expect(alreadyIdx).toBeGreaterThan(notExistIdx);
    expect(updateIdx).toBeGreaterThan(alreadyIdx);
  });

  it("write_property_annex resolves the current steward itself via a live join, never accepts one as a parameter", () => {
    const start = codeNoComments.indexOf("create or replace function work.write_property_annex(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("returns void", start));
    expect(block).not.toMatch(/p_owning_workspace_id/);
    expect(block).not.toMatch(/p_steward/i);

    const bodyStart = codeNoComments.indexOf("create or replace function work.write_property_annex(");
    const bodyBlock = codeNoComments.slice(bodyStart, codeNoComments.indexOf("$$;", bodyStart));
    expect(bodyBlock).toMatch(/select p\.steward_workspace_id into v_current_steward/);
    expect(bodyBlock).toMatch(/join property\.properties p on p\.id = sr\.property_id/);
  });

  it("write_property_annex never touches owning_workspace_id on update — the freeze is permanent", () => {
    const start = codeNoComments.indexOf("create or replace function work.write_property_annex(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    const onConflictIdx = block.indexOf("on conflict (service_record_id) do update");
    const updateSetBlock = block.slice(onConflictIdx, block.indexOf(";", onConflictIdx));
    expect(updateSetBlock).not.toMatch(/owning_workspace_id\s*=/);
  });

  it("both annex-writer functions upsert on the unique (service_record_id) constraint", () => {
    for (const fn of ["write_performing_annex", "write_property_annex"]) {
      const start = codeNoComments.indexOf(`create or replace function work.${fn}(`);
      const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
      expect(block).toMatch(/on conflict \(service_record_id\) do update/);
    }
  });

  it("amend_service_record requires a non-blank reason and never updates work.service_records", () => {
    const start = codeNoComments.indexOf("create or replace function work.amend_service_record(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/if p_reason is null or btrim\(p_reason\) = '' then/);
    expect(block).not.toMatch(/update work\.service_records/);
    expect(block).toMatch(/insert into work\.service_record_amendments/);
  });

  it("my_service_records restates the same combined OR predicate as the RLS policy", () => {
    const start = codeNoComments.indexOf("create or replace function work.my_service_records(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/sr\.performing_workspace_id = p_workspace_id/);
    expect(block).toMatch(/\bor\s+sr\.property_id in \(/);
    expect(block).toMatch(/p\.steward_workspace_id = p_workspace_id/);
  });

  it("resolve_service_record returns only core columns, no annex fields", () => {
    const start = codeNoComments.indexOf("create or replace function work.resolve_service_record(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).not.toMatch(/internal_cost/);
    expect(block).not.toMatch(/annotations/);
  });

  it("service_record_history orders oldest first, amended_at then id", () => {
    const start = codeNoComments.indexOf("create or replace function work.service_record_history(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/order by am\.amended_at, am\.id/);
  });

  it("every function sets search_path to empty", () => {
    const fns = [...codeNoComments.matchAll(/create or replace function ([\w.]+)\([^)]*\)[\s\S]*?set search_path = (\S+)/gi)];
    expect(fns.length).toBe(10);
    for (const [, name, path] of fns) {
      expect(path, `${name} does not use an empty search_path`).toBe("''");
    }
  });

  it("grants every function to klussie_engine_work only — no api delegate, no authenticated/anon grant", () => {
    const grants = [...code.matchAll(/grant execute on function (work\.\w+)\([^)]*\)\s*\n\s*to (\w+)/g)];
    expect(grants.length).toBe(10);
    for (const [, , role] of grants) {
      expect(role).toBe("klussie_engine_work");
    }
    expect(code).not.toMatch(/create or replace function api\./);
    expect(code).not.toMatch(/grant execute .* to authenticated/i);
  });

  it("revokes all ten functions from public, anon, authenticated and service_role before granting", () => {
    const revokes = [...code.matchAll(/revoke all on function (work\.\w+)\([^)]*\)\s*\n\s*from public, anon, authenticated, service_role/g)];
    expect(revokes.length).toBe(10);
  });
});
