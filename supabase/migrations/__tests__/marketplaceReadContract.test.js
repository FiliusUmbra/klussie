// Keeps 0145_marketplace_read_contract.sql (Platform Activation Slice 2, WP 2.1) inside
// its own stated rules: the five work.* reads (0090) gain a real caller-membership check
// in place — never redefined with a trusted caller to protect, since none exists — and
// every api.* delegate is a thin SECURITY DEFINER pass-through carrying no logic of its
// own, the same shape as api.locations_for_property() (0136).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0145_marketplace_read_contract.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName, code) {
  const start = code.indexOf(`create or replace function ${functionName}`);
  const end = code.indexOf("$$;", start);
  return code.slice(start, end);
}

describe("0145_marketplace_read_contract migration", () => {
  describe("single-sided checks — my_requests/my_quotes/my_engagements", () => {
    it("work.my_requests() checks real membership in p_workspace_id", () => {
      const block = bodyOf("work.my_requests", codeNoComments);
      expect(block).toMatch(/join workspace\.current_memberships\(\) m on m\.workspace_id = p_workspace_id/);
      expect(block).toMatch(/where r\.requesting_workspace_id = p_workspace_id/);
    });

    it("work.my_quotes() checks real membership in p_workspace_id", () => {
      const block = bodyOf("work.my_quotes", codeNoComments);
      expect(block).toMatch(/join workspace\.current_memberships\(\) m on m\.workspace_id = p_workspace_id/);
      expect(block).toMatch(/where q\.offering_workspace_id = p_workspace_id/);
    });

    it("work.my_engagements() checks real membership in p_workspace_id, row filter stays both-sided", () => {
      const block = bodyOf("work.my_engagements", codeNoComments);
      expect(block).toMatch(/join workspace\.current_memberships\(\) m on m\.workspace_id = p_workspace_id/);
      expect(block).toMatch(
        /where e\.requesting_workspace_id = p_workspace_id or e\.performing_workspace_id = p_workspace_id/
      );
    });
  });

  describe("two-sided checks — resolve_request/quotes_for_request", () => {
    it("work.resolve_request() checks the requesting workspace or any offering workspace that quoted", () => {
      const block = bodyOf("work.resolve_request", codeNoComments);
      expect(block).toMatch(
        /r\.requesting_workspace_id in \(select workspace_id from workspace\.current_memberships\(\)\)/
      );
      expect(block).toMatch(/select q\.request_id from work\.quotes q/);
      expect(block).toMatch(
        /q\.offering_workspace_id in \(select workspace_id from workspace\.current_memberships\(\)\)/
      );
    });

    it("work.quotes_for_request() ports 0088's own two-sided predicate", () => {
      const block = bodyOf("work.quotes_for_request", codeNoComments);
      expect(block).toMatch(
        /q\.offering_workspace_id in \(select workspace_id from workspace\.current_memberships\(\)\)/
      );
      expect(block).toMatch(/select r\.id from work\.requests r/);
      expect(block).toMatch(
        /r\.requesting_workspace_id in \(select workspace_id from workspace\.current_memberships\(\)\)/
      );
    });

    it("quotes_for_request still orders by sent_at, oldest first — unchanged from 0090", () => {
      const block = bodyOf("work.quotes_for_request", codeNoComments);
      expect(block).toMatch(/order by q\.sent_at/);
    });
  });

  describe("api.* delegates", () => {
    const names = ["my_requests", "resolve_request", "quotes_for_request", "my_quotes", "my_engagements"];
    const workArg = { my_requests: "uuid", resolve_request: "uuid", quotes_for_request: "uuid", my_quotes: "uuid", my_engagements: "uuid" };

    for (const name of names) {
      it(`api.${name}() is a thin SECURITY DEFINER pass-through calling work.${name}(), nothing else`, () => {
        const block = bodyOf(`api.${name}`, codeNoComments);
        expect(block).toMatch(/security definer/i);
        expect(block).toMatch(new RegExp(`select \\* from work\\.${name}\\(`));
      });
    }
    void workArg;
  });

  describe("access", () => {
    it("grants every api.* delegate to authenticated, after an explicit revoke from public/anon/service_role", () => {
      for (const name of ["my_requests", "resolve_request", "quotes_for_request", "my_quotes", "my_engagements"]) {
        expect(codeNoComments).toMatch(
          new RegExp(`revoke all on function api\\.${name}\\(uuid\\) from public, anon, service_role`)
        );
        expect(codeNoComments).toMatch(
          new RegExp(`grant execute on function api\\.${name}\\(uuid\\) to authenticated`)
        );
      }
    });

    it("does not touch the work.* functions' own grants — 0090's klussie_engine_work grant survives create or replace", () => {
      expect(codeNoComments).not.toMatch(/revoke all on function work\./);
      expect(codeNoComments).not.toMatch(/grant execute on function work\./);
    });

    it("does not re-grant USAGE on schema api — already granted in 0031", () => {
      expect(codeNoComments).not.toMatch(/grant usage on schema api/i);
    });
  });

  it("every function sets search_path to empty", () => {
    const fns = [...codeNoComments.matchAll(/create or replace function ([\w.]+)\([^)]*\)[\s\S]*?set search_path = (\S+)/gi)];
    expect(fns.length).toBe(10);
    for (const [, name, path] of fns) {
      expect(path, `${name} does not use an empty search_path`).toBe("''");
    }
  });
});
