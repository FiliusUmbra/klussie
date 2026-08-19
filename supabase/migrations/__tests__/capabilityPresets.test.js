// Keeps 0076_capability_presets.sql inside §6.8's own table, transcribed exactly for
// the three presets this epic seeds, and checks dependency-consistency against 0075's
// own five edges rather than assuming it by construction.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0076_capability_presets.sql";
const CATALOGUE_MIGRATION = "supabase/migrations/0075_capability_catalogue.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

const catalogueNoComments = readFileSync(CATALOGUE_MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const grantsStart = codeNoComments.indexOf("insert into platform.capability_preset_grants");
const grantsBlock = codeNoComments.slice(
  grantsStart,
  codeNoComments.indexOf("on conflict (preset_key, capability_key)", grantsStart)
);

function presetGrants(presetKey) {
  const rows = [...grantsBlock.matchAll(/\('(\w+)', '(\w+)'\)/g)];
  return rows.filter(([, p]) => p === presetKey).map(([, , cap]) => cap);
}

const EXPECTED = {
  personal: ["property_management", "asset_management", "property_memory", "marketplace_consumer", "notifications"],
  professional: [
    "property_management", "asset_management", "property_memory", "marketplace_consumer", "notifications",
    "maintenance_planning", "marketplace_provider", "portfolio_reputation", "scheduling", "billing",
    "payments", "fleet_management", "crm", "team_collaboration",
  ],
  business: [
    "property_management", "asset_management", "property_memory", "marketplace_consumer", "notifications",
    "maintenance_planning", "scheduling", "billing", "payments", "fleet_management", "team_collaboration",
    "preventive_maintenance", "compliance", "procurement", "analytics", "inventory", "document_intelligence",
  ],
};

describe("0076_capability_presets migration", () => {
  it("creates exactly two tables, both in platform", () => {
    const created = [...code.matchAll(/create table if not exists (platform\.\w+)/gi)].map((m) => m[1]);
    expect(created.sort()).toEqual(["platform.capability_preset_grants", "platform.capability_presets"]);
  });

  it("seeds exactly three presets: personal, professional, business — no enterprise", () => {
    const start = codeNoComments.indexOf("insert into platform.capability_presets");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("on conflict (preset_key)", start));
    expect(block).toMatch(/'personal', 'Personal'/);
    expect(block).toMatch(/'professional', 'Professional'/);
    expect(block).toMatch(/'business', 'Business'/);
    expect(codeNoComments).not.toMatch(/'enterprise'/);
  });

  for (const preset of Object.keys(EXPECTED)) {
    it(`${preset} preset grants exactly the capabilities §6.8's table shows for it`, () => {
      expect(presetGrants(preset).sort()).toEqual([...EXPECTED[preset]].sort());
    });
  }

  it("every preset grant references a real capability_key that exists in 0075's own catalogue", () => {
    const seededKeys = [...catalogueNoComments.matchAll(/^\s*\('(\w+)',/gm)].map((m) => m[1]);
    const grantedKeys = [...new Set([...grantsBlock.matchAll(/\('(\w+)', '(\w+)'\)/g)].map((m) => m[2]))];
    expect(grantedKeys.length).toBeGreaterThan(0);
    for (const key of grantedKeys) {
      expect(seededKeys, `preset grant references unknown capability_key '${key}'`).toContain(key);
    }
  });

  it("business preset is dependency-consistent: every dependency of a granted capability is also granted", () => {
    const depStart = catalogueNoComments.indexOf("insert into platform.capability_dependencies");
    const depBlock = catalogueNoComments.slice(depStart, catalogueNoComments.indexOf("on conflict (capability_key, requires_capability_key)", depStart));
    const edges = [...depBlock.matchAll(/\('(\w+)',\s*'(\w+)'\)/g)].map(([, a, b]) => [a, b]);
    expect(edges.length).toBeGreaterThan(0);

    const granted = new Set(EXPECTED.business);
    for (const [cap, requires] of edges) {
      if (granted.has(cap)) {
        expect(granted.has(requires), `business grants '${cap}' but not its dependency '${requires}'`).toBe(true);
      }
    }
  });

  it("adds no policy, revokes from anon/authenticated/service_role, grants only klussie_engine_workspace", () => {
    expect(code).not.toMatch(/create policy/i);
    expect(code).toMatch(/revoke all on platform\.capability_presets from anon, authenticated, service_role/i);
    expect(code).toMatch(/revoke all on platform\.capability_preset_grants from anon, authenticated, service_role/i);
    expect(code).toMatch(/grant select on platform\.capability_presets to klussie_engine_workspace/i);
    expect(code).toMatch(/grant select on platform\.capability_preset_grants to klussie_engine_workspace/i);
  });
});
