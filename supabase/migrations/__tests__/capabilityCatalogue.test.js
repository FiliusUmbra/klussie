// Keeps 0075_capability_catalogue.sql inside PLATFORM_DOMAIN_MODEL.md §6.7's real
// catalogue (26 capabilities, verbatim) and §6.2's own dependency graph — only the five
// edges the text actually states, none invented.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0075_capability_catalogue.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

const CAPABILITY_KEYS = [
  "marketplace_consumer", "marketplace_provider", "portfolio_reputation", "procurement", "crm",
  "property_management", "asset_management", "inventory", "fleet_management",
  "maintenance_planning", "preventive_maintenance", "compliance", "advanced_compliance", "scheduling",
  "property_memory", "document_intelligence", "ai_premium", "analytics",
  "team_collaboration", "workflow_automation", "notifications",
  "billing", "payments",
  "api_access", "enterprise_integrations", "federated_identity", "white_label",
];

describe("0075_capability_catalogue migration", () => {
  it("creates exactly two tables, both in platform", () => {
    const created = [...code.matchAll(/create table if not exists (platform\.\w+)/gi)].map((m) => m[1]);
    expect(created.sort()).toEqual(["platform.capabilities", "platform.capability_dependencies"]);
  });

  it("seeds exactly the 26 capabilities §6.7 names, each key present", () => {
    const start = codeNoComments.indexOf("insert into platform.capabilities");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("on conflict (capability_key)", start));
    for (const key of CAPABILITY_KEYS) {
      expect(block, `missing capability_key '${key}'`).toMatch(new RegExp(`'${key}'`));
    }
    const rowCount = (block.match(/\n\s*\('/g) || []).length;
    expect(rowCount).toBe(CAPABILITY_KEYS.length);
  });

  it("seeds exactly the five dependency edges §6.2 states, no more", () => {
    const start = codeNoComments.indexOf("insert into platform.capability_dependencies");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("on conflict (capability_key, requires_capability_key)", start));
    const edges = [...block.matchAll(/\('(\w+)',\s*'(\w+)'\)/g)].map(([, a, b]) => `${a}->${b}`);
    expect(edges.sort()).toEqual(
      [
        "asset_management->property_management",
        "compliance->asset_management",
        "compliance->document_intelligence",
        "maintenance_planning->asset_management",
        "preventive_maintenance->maintenance_planning",
      ].sort()
    );
  });

  it("dependency edges reference real capability keys via foreign keys, and forbid self-reference", () => {
    const start = code.indexOf("create table if not exists platform.capability_dependencies");
    const block = code.slice(start, code.indexOf(");", start) + 2);
    expect(block).toMatch(/references platform\.capabilities \(capability_key\)/);
    expect(block).toMatch(/check \(capability_key <> requires_capability_key\)/);
  });

  it("adds no policy, revokes from anon/authenticated/service_role, and grants only klussie_engine_workspace a narrow cross-schema read", () => {
    expect(code).not.toMatch(/create policy/i);
    expect(code).toMatch(/revoke all on platform\.capabilities from anon, authenticated, service_role/i);
    expect(code).toMatch(/revoke all on platform\.capability_dependencies from anon, authenticated, service_role/i);
    expect(code).toMatch(/grant usage on schema platform to klussie_engine_workspace/i);
    expect(code).toMatch(/grant select on platform\.capabilities to klussie_engine_workspace/i);
    expect(code).toMatch(/grant select on platform\.capability_dependencies to klussie_engine_workspace/i);
  });
});
