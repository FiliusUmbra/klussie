// Keeps 0044_locations_path_maintenance.sql scoped to INSERT only — the defect this file
// exists to catch is the trigger growing an UPDATE clause that would fire once per updated
// row and silently fail to cascade a path rewrite to descendants, exactly the failure mode
// SUPABASE_ARCHITECTURE.md §11.2 calls "the single easiest place to implement a correct
// architecture incorrectly."
//
// Structural. Behaviour is proven against staging by VERIFY_LOCATIONS_PATH_MAINTENANCE.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0044_locations_path_maintenance.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0044_locations_path_maintenance migration", () => {
  it("fires only before insert, never before update", () => {
    expect(code).toMatch(/before insert on property\.locations/i);
    expect(code).not.toMatch(/before[^;]*update[^;]*on property\.locations/is);
  });

  it("computes the top-level path from the property's own label", () => {
    // Literal values under test — read from codeNoComments, not the string-literal-stripped
    // `code`, which would see both replace() arguments as '' and prove nothing.
    const fnStart = codeNoComments.indexOf("create or replace function property.locations_maintain_path");
    const fnBody = codeNoComments.slice(fnStart, codeNoComments.indexOf("$$;", fnStart) + 3);
    expect(fnBody).toMatch(/new\.parent_id is null/i);
    expect(fnBody).toMatch(/replace\(p\.id::text, '-', '_'\)/i);
    expect(fnBody).toMatch(/replace\(new\.id::text, '-', '_'\)/i);
  });

  it("computes a child's path by extending the parent's own path", () => {
    const fnStart = codeNoComments.indexOf("create or replace function property.locations_maintain_path");
    const fnBody = codeNoComments.slice(fnStart, codeNoComments.indexOf("$$;", fnStart) + 3);
    expect(fnBody).toMatch(/\(v_parent_path \|\| '\.' \|\| v_own_label\)::extensions\.ltree/i);
  });

  it("declares the parent path as text, never as extensions.ltree — sidesteps ltree's own || operator entirely", () => {
    // The fix for the real bug this migration's header now documents: under
    // search_path = '', ltree's own concatenation operator would need
    // OPERATOR(extensions.||) to resolve. Building as text and casting once avoids it.
    const declStart = code.indexOf("declare");
    const declBlock = code.slice(declStart, code.indexOf("begin", declStart));
    expect(declBlock).toMatch(/v_parent_path\s+text;/i);
    expect(declBlock).not.toMatch(/v_parent_path\s+extensions\.ltree/i);
  });

  it("derives property_id from the parent rather than trusting the caller's value", () => {
    // A child cannot straddle two properties — inheriting from the parent keeps path and
    // property_id from ever disagreeing.
    const fnStart = code.indexOf("create or replace function property.locations_maintain_path");
    const fnBody = code.slice(fnStart, code.indexOf("$$;", fnStart) + 3);
    expect(fnBody).toMatch(/select l\.path::text, l\.property_id into v_parent_path, new\.property_id/i);
  });

  it("raises when the referenced property or parent does not exist, rather than writing a broken path", () => {
    const fnStart = codeNoComments.indexOf("create or replace function property.locations_maintain_path");
    const fnBody = codeNoComments.slice(fnStart, codeNoComments.indexOf("$$;", fnStart) + 3);
    expect(fnBody).toMatch(/raise exception 'property % does not exist'/i);
    expect(fnBody).toMatch(/raise exception 'parent location % does not exist'/i);
  });

  it("locks the search_path", () => {
    expect(code).toMatch(/set search_path = ''/);
  });

  it("is re-runnable — dropped guardedly before recreation", () => {
    expect(code).toMatch(/drop trigger if exists locations_maintain_path on property\.locations/i);
    expect(code).toMatch(/create or replace function/i);
  });
});
