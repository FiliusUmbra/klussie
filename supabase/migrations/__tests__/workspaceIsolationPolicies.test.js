// Keeps 0037_workspace_isolation_policies.sql inside ADR-0025's decision: WP 03.10 adds a
// workspace isolation predicate to every table WP 03.05 gave a workspace_id column, and
// removes no existing policy. The two failure modes this file exists to catch:
//
//   · A future edit "simplifying" one of the named exceptions — deleting or narrowing a
//     policy ADR-0025 requires to survive until Epic 12 replaces it.
//   · A new policy reintroducing api.is_workspace_member(uuid) or any other row-varying
//     argument, the correlated-subquery defect 0031's own regression guard already exists
//     to catch — checked again here because this is the first migration that actually
//     *uses* the isolation predicate in a policy, which is where the mistake would surface.
//
// Structural, like every migration test in this repository (docs/engineering/TESTING.md
// §3). Behaviour is proven against staging by VERIFY_WORKSPACE_ISOLATION_POLICIES.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0037_workspace_isolation_policies.sql";

const rawCode = readFileSync(MIGRATION, "utf8");
const code = rawCode
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const TABLES = [
  "pro_profiles",
  "pro_stats",
  "pro_services",
  "portfolio_items",
  "testimonials",
  "service_requests",
  "service_request_photos",
  "conversations",
  "messages",
  "reviews",
  "reports",
  "quotes",
  "household_items",
];

// Every named policy that existed before this migration and must survive it untouched —
// ADR-0025's named exceptions, plus every ordinary business-action policy on the thirteen
// tables. Not exhaustive of the whole 58; exhaustive of the ones a "simplify RLS" edit is
// most likely to reach for.
const POLICIES_THAT_MUST_SURVIVE = [
  "pros can view matching requests",
  "pros can send quotes on matching requests",
  "pro profiles are publicly viewable",
  "pro stats are publicly viewable",
  "pro services are publicly viewable",
  "portfolio items are publicly viewable",
  "testimonials are publicly viewable",
  "reviews are publicly viewable",
  "customers manage own requests",
  "pros manage own service list",
  "owners manage own items",
  "participants can view own conversations",
  "participants can view messages",
];

describe("0037_workspace_isolation_policies migration", () => {
  it("adds exactly one new SELECT policy per workspace-scoped table", () => {
    for (const table of TABLES) {
      const pattern = new RegExp(
        `create policy "workspace members can view ${table}"\\s+on public\\.${table} for select`,
        "i"
      );
      expect(code, `expected an isolation SELECT policy for ${table}`).toMatch(pattern);
    }
  });

  it("touches no table beyond the thirteen WP 03.05 gave a workspace_id column", () => {
    const matches = [...code.matchAll(/create policy "workspace members can view (\w+)"/gi)];
    const namedTables = matches.map((m) => m[1]);
    expect(namedTables.sort()).toEqual([...TABLES].sort());
  });

  it("every new policy uses the uncorrelated-subquery shape, never a per-row argument", () => {
    // The exact regression 0031's own test guards against, checked again at the first real
    // point of use: api.current_workspace_memberships(), not api.is_workspace_member(...).
    expect(code).not.toMatch(/is_workspace_member/i);
    const newPolicyBlocks = [...code.matchAll(/create policy "workspace members can view \w+"[\s\S]*?;/gi)];
    expect(newPolicyBlocks.length).toBe(TABLES.length);
    for (const [block] of newPolicyBlocks) {
      expect(block).toMatch(/workspace_id in \(select workspace_id from api\.current_workspace_memberships\(\)\)/i);
    }
  });

  it("adds SELECT policies only — no INSERT, UPDATE, DELETE or ALL among the new ones", () => {
    const newPolicyBlocks = [...code.matchAll(/create policy "workspace members can view \w+"[\s\S]*?;/gi)];
    for (const [block] of newPolicyBlocks) {
      expect(block).toMatch(/for select/i);
      expect(block).not.toMatch(/for (insert|update|delete|all)/i);
      expect(block).not.toMatch(/with check/i);
    }
  });

  it("drops nothing except its own policies, guardedly, before recreating them", () => {
    const drops = [...code.matchAll(/drop policy if exists "([^"]+)"/gi)].map((m) => m[1]);
    for (const name of drops) {
      expect(name.startsWith("workspace members can view ")).toBe(true);
    }
    // Every drop is guarded (if exists) and every dropped name is immediately recreated —
    // the re-runnability property migrations 0016 and 0022 already established.
    for (const name of drops) {
      expect(code).toMatch(new RegExp(`create policy "${name}"`, "i"));
    }
  });

  it("never drops a pre-existing named policy", () => {
    for (const name of POLICIES_THAT_MUST_SURVIVE) {
      expect(code).not.toMatch(new RegExp(`drop policy[^;]*"${name}"`, "i"));
    }
  });

  it("creates no restrictive policy", () => {
    // ADR-0025 rules this out explicitly: a restrictive policy AND-combines and could
    // silently narrow an existing permissive grant, the one mistake this decision is most
    // likely to be implemented as.
    expect(code).not.toMatch(/\bas restrictive\b/i);
  });
});
