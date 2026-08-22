// Platform Activation Slice 3, WP 3.0 — Epic 11 built a complete, real backend (0081-0084)
// that no client code anywhere referenced and no api.* delegate existed for. This migration
// closes that gap: five work.*_for_caller() write wrappers (0084's own ten functions do no
// caller authorization at all — checked directly, not assumed), and ten thin api.* delegates.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0163_service_record_contract.sql";

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

describe("0163_service_record_contract migration", () => {
  describe("work.create_service_record_for_caller() — closes 0087's own named gap", () => {
    const FN = "work.create_service_record_for_caller";

    it("resolves everything from the engagement id, never trusting caller-supplied property/asset/location/workspace", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/from work\.engagements e\s*\n\s*where e\.id = p_engagement_id/);
      // Only the declared PARAMETER LIST is checked here — v_property_id/v_performing_ws
      // legitimately appear later, as the *resolved* values passed on to the raw function.
      const paramList = block.slice(0, block.indexOf(")\nreturns"));
      expect(paramList).not.toMatch(/p_property_id|p_performing_workspace_id|p_asset_id|p_location_id/);
    });

    it("checks caller membership in the resolved performing workspace before doing anything", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/where m\.workspace_id = v_performing_ws/);
      expect(block).toMatch(/insufficient_privilege/);
    });

    it("refuses when the engagement already has a service record — one per engagement", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/v_existing_record is not null/);
    });

    it("resolves property_id via the request, or its asset, or its location — the same coalesce shape as 0162", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/from property\.assets a where a\.id = r\.asset_id/);
      expect(block).toMatch(/from property\.locations l where l\.id = r\.location_id/);
    });

    it("refuses (does not skip) when the request has no property/asset/location — property_id is NOT NULL on work.service_records", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/if v_property_id is null then\s*\n\s*raise exception/);
    });

    it("sets work.engagements.service_record_id in the same transaction as the record's own creation", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/update work\.engagements set service_record_id = p_service_record_id where id = p_engagement_id/);
    });

    it("delegates the actual insert to the unmodified work.create_service_record()", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/perform work\.create_service_record\(/);
    });
  });

  describe("the four remaining write wrappers each add a real membership check 0084 never had", () => {
    it("record_service_record_approval_for_caller checks the property's CURRENT steward", () => {
      const block = bodyOf("work.record_service_record_approval_for_caller", codeNoComments);
      expect(block).toMatch(/p\.steward_workspace_id/);
      expect(block).toMatch(/insufficient_privilege/);
    });

    it("write_performing_annex_for_caller checks performing-workspace membership only", () => {
      const block = bodyOf("work.write_performing_annex_for_caller", codeNoComments);
      expect(block).toMatch(/sr\.performing_workspace_id/);
      expect(block).not.toMatch(/steward_workspace_id/);
    });

    it("write_property_annex_for_caller checks the property's CURRENT steward", () => {
      const block = bodyOf("work.write_property_annex_for_caller", codeNoComments);
      expect(block).toMatch(/p\.steward_workspace_id/);
    });

    it("amend_service_record_for_caller checks BOTH real membership AND that the claimed author matches one of the two visibility paths", () => {
      const block = bodyOf("work.amend_service_record_for_caller", codeNoComments);
      expect(block).toMatch(/where m\.workspace_id = p_authored_by_workspace_id/);
      expect(block).toMatch(/p_authored_by_workspace_id not in \(v_performing_ws, v_steward\)/);
    });
  });

  it("every _for_caller wrapper is revoked from every application role — reachable only through its api.* delegate", () => {
    for (const fn of [
      "work.create_service_record_for_caller",
      "work.record_service_record_approval_for_caller",
      "work.write_performing_annex_for_caller",
      "work.write_property_annex_for_caller",
      "work.amend_service_record_for_caller",
    ]) {
      expect(codeNoComments, `${fn} not revoked`).toMatch(
        new RegExp(`revoke all on function ${fn.replace(".", "\\.")}\\([^)]*\\) from public, anon, authenticated, service_role`)
      );
    }
  });

  it("all ten api.* delegates are granted to authenticated, and revoked from anon/service_role", () => {
    const delegates = [
      "create_service_record", "record_service_record_approval", "write_performing_annex",
      "write_property_annex", "amend_service_record", "resolve_service_record",
      "my_service_records", "my_performing_annex", "my_property_annex", "service_record_history",
    ];
    for (const name of delegates) {
      expect(codeNoComments, `api.${name} not granted to authenticated`).toMatch(
        new RegExp(`grant execute on function api\\.${name}\\([^)]*\\) to authenticated`)
      );
      expect(codeNoComments, `api.${name} not revoked from anon`).toMatch(
        new RegExp(`revoke all on function api\\.${name}\\([^)]*\\) from public, anon, service_role`)
      );
    }
  });

  it("write delegates call their own _for_caller wrapper, never the raw work.* function directly", () => {
    const pairs = [
      ["api.create_service_record", "work.create_service_record_for_caller"],
      ["api.record_service_record_approval", "work.record_service_record_approval_for_caller"],
      ["api.write_performing_annex", "work.write_performing_annex_for_caller"],
      ["api.write_property_annex", "work.write_property_annex_for_caller"],
      ["api.amend_service_record", "work.amend_service_record_for_caller"],
    ];
    for (const [apiFn, forCallerFn] of pairs) {
      const block = bodyOf(apiFn, codeNoComments);
      expect(block, `${apiFn} should call ${forCallerFn}`).toContain(forCallerFn);
    }
  });

  it("read delegates call the raw 0084 function directly — no logic of their own to delegate around", () => {
    const pairs = [
      ["api.resolve_service_record", "work.resolve_service_record"],
      ["api.my_service_records", "work.my_service_records"],
      ["api.my_performing_annex", "work.my_performing_annex"],
      ["api.my_property_annex", "work.my_property_annex"],
      ["api.service_record_history", "work.service_record_history"],
    ];
    for (const [apiFn, rawFn] of pairs) {
      const block = bodyOf(apiFn, codeNoComments);
      expect(block, `${apiFn} should call ${rawFn}`).toContain(rawFn);
    }
  });

  it("all fifteen new functions are SECURITY DEFINER except the five work.*_for_caller wrappers, which are SECURITY INVOKER (the default)", () => {
    const definerFns = [
      "api.create_service_record", "api.record_service_record_approval", "api.write_performing_annex",
      "api.write_property_annex", "api.amend_service_record", "api.resolve_service_record",
      "api.my_service_records", "api.my_performing_annex", "api.my_property_annex", "api.service_record_history",
    ];
    for (const fn of definerFns) {
      const block = bodyOf(fn, codeNoComments);
      expect(block, `${fn} should be SECURITY DEFINER`).toMatch(/security definer/);
    }
    const invokerFns = [
      "work.create_service_record_for_caller", "work.record_service_record_approval_for_caller",
      "work.write_performing_annex_for_caller", "work.write_property_annex_for_caller",
      "work.amend_service_record_for_caller",
    ];
    for (const fn of invokerFns) {
      const block = bodyOf(fn, codeNoComments);
      expect(block, `${fn} should not be SECURITY DEFINER`).not.toMatch(/security definer/);
    }
  });

  it("grants authenticated SELECT on all four service-record tables — the same base-grant gap found a fourth time", () => {
    const start = codeNoComments.indexOf("grant select on\n  work.service_records");
    const block = codeNoComments.slice(start, codeNoComments.indexOf(";", start) + 1);
    for (const table of [
      "work.service_records", "work.service_record_performing_annexes",
      "work.service_record_property_annexes", "work.service_record_amendments",
    ]) {
      expect(block, `missing SELECT grant on ${table}`).toContain(table);
    }
    expect(codeNoComments).not.toMatch(/grant usage on schema work to authenticated/);
  });

  describe("work.engagements_reject_terminal_mutation() — a real bug found live, fixed here", () => {
    const FN = "work.engagements_reject_terminal_mutation";

    it("still refuses every column except service_record_id, unconditionally, once terminal", () => {
      const block = bodyOf(FN, codeNoComments);
      for (const col of [
        "new.id is distinct from old.id", "new.request_id is distinct from old.request_id",
        "new.status is distinct from old.status", "new.completed_at is distinct from old.completed_at",
        "new.agreed_price is distinct from old.agreed_price",
      ]) {
        expect(block, `missing frozen-column check: ${col}`).toContain(col);
      }
      expect(block).not.toMatch(/new\.service_record_id is distinct from old\.service_record_id[\s\S]{0,20}or /);
    });

    it("allows service_record_id to move null -> a real value — no exception raised for that transition alone", () => {
      const block = bodyOf(FN, codeNoComments);
      // The frozen-column check must NOT include service_record_id in its own OR-chain
      // (that would refuse the one transition this migration exists to allow).
      const frozenCheckStart = block.indexOf("if new.id is distinct");
      const frozenCheckEnd = block.indexOf("then", frozenCheckStart);
      expect(block.slice(frozenCheckStart, frozenCheckEnd)).not.toContain("service_record_id");
    });

    it("refuses reassigning an already-set service_record_id — one record per engagement, permanently", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/new\.service_record_id is distinct from old\.service_record_id and old\.service_record_id is not null/);
      expect(block).toMatch(/already set and permanent/);
    });

    it("drops and recreates the trigger, matching the original migration's own idempotent shape", () => {
      expect(codeNoComments).toMatch(/drop trigger if exists engagements_guard_terminal on work\.engagements/);
      expect(codeNoComments).toMatch(/create trigger engagements_guard_terminal\s*\n\s*before update on work\.engagements/);
    });
  });

  it("grants no client-facing role anything on the raw work.* functions directly", () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      expect(codeNoComments).not.toMatch(
        new RegExp(`grant execute on function work\\.(create_service_record|record_service_record_approval|write_performing_annex|write_property_annex|amend_service_record)\\([^)]*\\) to ${role}`)
      );
    }
  });
});
