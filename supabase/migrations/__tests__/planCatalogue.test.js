// Keeps 0127_plan_catalogue.sql inside PLATFORM_DOMAIN_MODEL.md §24's own rules: platform
// is the right schema (mirroring platform.capabilities), five real plans seeded, White
// Label deliberately not among them, and every seeded bundle respects the real 5-edge
// capability dependency table (0075).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0127_plan_catalogue.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

const DEPENDENCIES = [
  ["asset_management", "property_management"],
  ["maintenance_planning", "asset_management"],
  ["preventive_maintenance", "maintenance_planning"],
  ["compliance", "asset_management"],
  ["compliance", "document_intelligence"],
];

function extractBundles(sql) {
  const bundles = {};
  const insertStart = sql.indexOf("insert into platform.plans");
  const insertBlock = sql.slice(insertStart, sql.indexOf(";", insertStart));
  const rowRe = /\('([\w_]+)', '[^']*', '[^']*', jsonb_build_array\(([^)]*)\)\)/g;
  let m;
  while ((m = rowRe.exec(insertBlock))) {
    const [, planKey, arrayBody] = m;
    bundles[planKey] = [...arrayBody.matchAll(/'([\w_]+)'/g)].map((x) => x[1]);
  }
  return bundles;
}

describe("0127_plan_catalogue migration", () => {
  it("creates exactly one table, in platform — mirroring platform.capabilities' own placement", () => {
    const created = [...code.matchAll(/create table if not exists (platform\.\w+)/gi)].map((m) => m[1]);
    expect(created).toEqual(["platform.plans"]);
  });

  it("requires a non-empty capability_keys array", () => {
    const start = code.indexOf("create table if not exists platform.plans");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/check \(jsonb_array_length\(capability_keys\) > 0\)/);
  });

  it("seeds exactly five plans — White Label is deliberately not among them", () => {
    const bundles = extractBundles(codeNoComments);
    expect(Object.keys(bundles).sort()).toEqual(
      ["business", "enterprise", "personal", "premium_home", "professional"].sort()
    );
    expect(codeNoComments).not.toMatch(/'white_label'/);
  });

  it("every seeded bundle respects the real capability dependency table (0075) — a dependency always appears earlier in the array", () => {
    const bundles = extractBundles(codeNoComments);
    for (const [planKey, keys] of Object.entries(bundles)) {
      for (const [dependent, dependency] of DEPENDENCIES) {
        const dependentIdx = keys.indexOf(dependent);
        const dependencyIdx = keys.indexOf(dependency);
        if (dependentIdx === -1) continue; // this plan doesn't include the dependent capability at all
        expect(
          dependencyIdx,
          `${planKey}: ${dependent} is present but its dependency ${dependency} is missing`
        ).toBeGreaterThanOrEqual(0);
        expect(
          dependencyIdx,
          `${planKey}: ${dependency} must come before ${dependent} in capability_keys`
        ).toBeLessThan(dependentIdx);
      }
    }
  });

  it("every plan bundles at least property_management, the foundation everything else depends on", () => {
    const bundles = extractBundles(codeNoComments);
    for (const [planKey, keys] of Object.entries(bundles)) {
      expect(keys, `${planKey} does not bundle property_management`).toContain("property_management");
    }
  });

  it("grants select to klussie_engine_commerce only, revokes from every client role, no policy yet", () => {
    expect(code).toMatch(/grant select on platform\.plans to klussie_engine_commerce/i);
    expect(code).toMatch(/revoke all on platform\.plans from anon, authenticated, service_role/i);
    expect(code).not.toMatch(/create policy/i);
    expect(codeNoComments).toMatch(/alter table platform\.plans enable row level security/);
  });
});
