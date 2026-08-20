// Keeps 0154_request_structured_intake_fields.sql (Platform Activation Slice 2, WP 2.6)
// inside its own stated rules: work.requests gains details_json/ai_analysis/city;
// create_request_for_caller() patches them via a follow-up UPDATE (work.create_request()
// itself untouched); my_requests()/resolve_request() are dropped by their exact prior
// signature and recreated with the extra columns.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0154_request_structured_intake_fields.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName, code) {
  const start = code.indexOf(`create or replace function ${functionName}`);
  const end = code.indexOf("$$;", start);
  return code.slice(start, end);
}

describe("0154_request_structured_intake_fields migration", () => {
  it("adds details_json, ai_analysis, city to work.requests", () => {
    expect(codeNoComments).toMatch(/add column if not exists details_json jsonb/);
    expect(codeNoComments).toMatch(/add column if not exists ai_analysis jsonb/);
    expect(codeNoComments).toMatch(/add column if not exists city text/);
  });

  it("drops every changed function by its exact prior signature before recreating it", () => {
    expect(codeNoComments).toMatch(
      /drop function if exists work\.create_request_for_caller\(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, numeric, uuid, uuid, numeric, uuid, uuid, platform\.actor_type, text\)/
    );
    expect(codeNoComments).toMatch(/drop function if exists work\.my_requests\(uuid\)/);
    expect(codeNoComments).toMatch(/drop function if exists work\.resolve_request\(uuid\)/);
  });

  describe("work.create_request_for_caller()", () => {
    const block = bodyOf("work.create_request_for_caller", codeNoComments);

    it("never passes the three new fields into the unmodified work.create_request()", () => {
      const insertCallStart = block.indexOf("perform work.create_request(");
      const insertCallEnd = block.indexOf(");", insertCallStart);
      const insertCall = block.slice(insertCallStart, insertCallEnd);
      expect(insertCall).not.toMatch(/p_details_json/);
      expect(insertCall).not.toMatch(/p_ai_analysis/);
      expect(insertCall).not.toMatch(/p_city/);
    });

    it("patches details_json/ai_analysis/city in unconditionally, via a follow-up UPDATE", () => {
      expect(block).toMatch(/set details_json = p_details_json,\s*\n\s*ai_analysis = p_ai_analysis,\s*\n\s*city = p_city/);
    });

    it("keeps the directed-booking and service_request_id follow-up updates unchanged", () => {
      expect(block).toMatch(/if p_directed_workspace_id is not null then/);
      expect(block).toMatch(/if p_service_request_id is not null then/);
    });
  });

  describe("work.my_requests() and work.resolve_request()", () => {
    it("both return details_json, ai_analysis and city", () => {
      for (const fn of ["work.my_requests", "work.resolve_request"]) {
        const block = bodyOf(fn, codeNoComments);
        expect(block, `${fn} missing details_json`).toContain("r.details_json");
        expect(block, `${fn} missing ai_analysis`).toContain("r.ai_analysis");
        expect(block, `${fn} missing city`).toContain("r.city");
      }
    });

    it("resolve_request() keeps its own two-sided check unchanged", () => {
      const block = bodyOf("work.resolve_request", codeNoComments);
      expect(block).toMatch(
        /r\.requesting_workspace_id in \(select workspace_id from workspace\.current_memberships\(\)\)/
      );
      expect(block).toMatch(/select q\.request_id from work\.quotes q/);
    });

    it("my_requests() keeps its own single-sided check unchanged", () => {
      const block = bodyOf("work.my_requests", codeNoComments);
      expect(block).toMatch(/join workspace\.current_memberships\(\) m on m\.workspace_id = p_workspace_id/);
    });
  });

  describe("delegates and access", () => {
    it("every api.* function is a thin SECURITY DEFINER pass-through", () => {
      for (const fn of ["api.create_request", "api.my_requests", "api.resolve_request"]) {
        const block = bodyOf(fn, codeNoComments);
        expect(block, `${fn} not SECURITY DEFINER`).toMatch(/security definer/i);
      }
    });

    it("grants every api.* function to authenticated only", () => {
      for (const fn of ["api.create_request", "api.my_requests", "api.resolve_request"]) {
        expect(codeNoComments).toMatch(new RegExp(`grant execute on function ${fn.replace(".", "\\.")}\\([^)]*\\) to authenticated`));
      }
    });
  });
});
