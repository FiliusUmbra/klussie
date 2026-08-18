// Keeps 0123_search_contract.sql inside its own stated rules: event_type minted correctly
// from the start, scope and text match in the same where clause, IndexRebuilt canonical
// vs IndexLagDetected derived, and global-domain rebuild tracking refused rather than
// silently accepted.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0123_search_contract.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0123_search_contract migration", () => {
  it("defines exactly five functions, all in derived, none in api", () => {
    const created = [...codeNoComments.matchAll(/create or replace function (derived\.\w+|api\.\w+)\(/g)].map((m) => m[1]);
    expect(created.sort()).toEqual([
      "derived.mark_index_lag_detected",
      "derived.mark_index_rebuilt",
      "derived.reindex_item",
      "derived.remove_from_index",
      "derived.search",
    ]);
  });

  it("every event_type is already dotted <engine>.<aggregate>.<past-participle>, never bare PascalCase", () => {
    const literals = [...codeNoComments.matchAll(/p_event_type\s*=>\s*'([^']+)'/g)].map((m) => m[1]);
    expect(literals.length).toBeGreaterThan(0);
    for (const value of literals) {
      expect(value, `${value} is not dotted lowercase`).toMatch(/^[a-z_]+\.[a-z_]+\.[a-z_]+$/);
    }
  });

  it("reindex_item upserts keyed on (domain, source_type, source_id) and emits no event", () => {
    const start = codeNoComments.indexOf("create or replace function derived.reindex_item(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/on conflict \(domain, source_type, source_id\) do update/);
    expect(block).not.toMatch(/emit_event/);
  });

  it("remove_from_index performs a real hard delete", () => {
    const start = codeNoComments.indexOf("create or replace function derived.remove_from_index(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/delete from derived\.search_index/);
  });

  it("search applies scope and the text match in the same where clause", () => {
    const start = codeNoComments.indexOf("create or replace function derived.search(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    const whereStart = block.indexOf("where");
    const whereBlock = block.slice(whereStart);
    expect(whereBlock).toMatch(/i\.workspace_id = p_workspace_id/);
    expect(whereBlock).toMatch(/i\.is_published = true/);
    expect(whereBlock).toMatch(/i\.search_vector @@ websearch_to_tsquery/);
    // one where clause, not two statements — this file defines derived.search exactly once
    expect([...codeNoComments.matchAll(/create or replace function derived\.search\(/g)].length).toBe(1);
  });

  it("mark_index_rebuilt refuses a null workspace and stays canonical (is_derived not set)", () => {
    const start = codeNoComments.indexOf("create or replace function derived.mark_index_rebuilt(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/if p_workspace_id is null then/);
    expect(block).toMatch(/'search\.index\.rebuilt'/);
    expect(block).not.toMatch(/p_is_derived/);
  });

  it("mark_index_lag_detected refuses a null workspace and marks itself derived", () => {
    const start = codeNoComments.indexOf("create or replace function derived.mark_index_lag_detected(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/if p_workspace_id is null then/);
    expect(block).toMatch(/'search\.index\.lag_detected'/);
    expect(block).toMatch(/p_is_derived\s*=>\s*true/);
  });

  it("grants klussie_consumer_search usage on schema platform and execute on emit_event", () => {
    expect(codeNoComments).toMatch(/grant usage on schema platform to klussie_consumer_search/i);
    expect(codeNoComments).toMatch(/grant execute on function platform\.emit_event/i);
  });

  it("every function sets search_path to empty", () => {
    const fns = [...codeNoComments.matchAll(/create or replace function ([\w.]+)\([^)]*\)[\s\S]*?set search_path = (\S+)/gi)];
    expect(fns.length).toBe(5);
    for (const [, name, path] of fns) {
      expect(path, `${name} does not use an empty search_path`).toBe("''");
    }
  });

  it("grants every function to klussie_consumer_search only — no api delegate, no client grant", () => {
    expect(code).not.toMatch(/create or replace function api\./);
    expect(code).not.toMatch(/grant execute .* to authenticated/i);
    expect(code).toMatch(/to klussie_consumer_search/);
  });
});
