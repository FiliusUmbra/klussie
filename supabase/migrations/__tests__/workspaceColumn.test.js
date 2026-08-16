// Keeps 0032_workspace_column.sql inside the two rules it exists to satisfy:
// DATABASE_ARCHITECTURE.md §5's tenancy rule (every workspace-scoped table carries its
// workspace directly), and roadmap §3 step 1 (additive, nullable, unread — the application
// is entirely unaffected).
//
// The defect this file exists to catch is a table added to the wrong list: one that should
// stay untouched (identity- or platform-scoped) gaining a column it does not need, or a
// workspace-scoped table being silently left out, which would surface months later as a
// row nothing can be workspace-scoped to.
//
// Structural, like every migration test in this repository (docs/engineering/TESTING.md
// §3). Behaviour is proven against staging by VERIFY_WORKSPACE_COLUMN.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0032_workspace_column.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

// String literals stripped too, for checks that only need structure — this migration's
// comment on column bodies discuss "identity-scoped", "platform-scoped" and reference
// tables by name in prose, which would produce false positives against a raw-text search.
const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

const TOUCHED_TABLES = [
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

const UNTOUCHED_TABLES = [
  "profiles",
  "profile_contacts",
  "categories",
  "category_translations",
  "services",
  "service_translations",
  "feature_flags",
  "audit_log",
  "domain_events",
  "ai_usage_log",
];

describe("0032_workspace_column migration", () => {
  it("adds workspace_id to exactly the thirteen workspace-scoped tables", () => {
    const altered = [
      ...codeNoComments.matchAll(
        /alter table public\.(\w+)\s+add column if not exists workspace_id/gi
      ),
    ].map((m) => m[1]);

    expect(altered.sort()).toEqual([...TOUCHED_TABLES].sort());
  });

  it("touches none of the identity-scoped, platform-scoped or legacy tables", () => {
    for (const table of UNTOUCHED_TABLES) {
      expect(
        codeNoComments,
        `0032 should not reference public.${table} — it is identity-scoped, platform-scoped, or legacy infrastructure superseded by Epic 01`
      ).not.toMatch(new RegExp(`public\\.${table}\\b`, "i"));
    }
  });

  it("makes every workspace_id column nullable", () => {
    // Roadmap §3 step 1: "Nullable, unpopulated, unread." A NOT NULL here would break
    // every existing row immediately, since nothing populates the column until WP 03.06.
    const columns = [
      ...codeNoComments.matchAll(/add column if not exists workspace_id uuid([^;]*);/gi),
    ];
    expect(columns.length).toBe(TOUCHED_TABLES.length);
    for (const m of columns) {
      expect(m[1], `a workspace_id column is declared NOT NULL: ${m[0]}`).not.toMatch(
        /not null/i
      );
    }
  });

  it("references workspace.workspaces with no cascading delete", () => {
    const columns = [
      ...codeNoComments.matchAll(/add column if not exists workspace_id uuid([^;]*);/gi),
    ];
    for (const m of columns) {
      expect(m[1]).toMatch(/references workspace\.workspaces \(id\)/i);
      expect(m[1]).not.toMatch(/on delete/i);
    }
  });

  it("creates exactly one guarded index per touched table", () => {
    const indexes = [
      ...codeNoComments.matchAll(
        /create index if not exists (\w+)_workspace_id_idx\s+on public\.(\w+) \(workspace_id\)/gi
      ),
    ];
    expect(indexes.length).toBe(TOUCHED_TABLES.length);
    const indexedTables = indexes.map((m) => m[2]).sort();
    expect(indexedTables).toEqual([...TOUCHED_TABLES].sort());

    const allIndexCreations = [...codeNoComments.matchAll(/create index/gi)];
    expect(allIndexCreations).toHaveLength(indexes.length);
  });

  it("creates no policy, grants nothing, and revokes nothing", () => {
    // This package is purely structural: WP 03.10 owns policies, and no grant changes are
    // needed because column-level access follows the table's existing grants.
    expect(code).not.toMatch(/create policy/i);
    expect(code).not.toMatch(/\bgrant\b/i);
    expect(code).not.toMatch(/\brevoke\b/i);
  });

  it("creates no table and defines no function", () => {
    expect(code).not.toMatch(/create table/i);
    expect(code).not.toMatch(/create (or replace )?function/i);
  });

  it("is re-runnable — every alteration and index uses the guarded form", () => {
    const allAlterations = [...codeNoComments.matchAll(/alter table public\.\w+ add column/gi)];
    const guardedAlterations = [
      ...codeNoComments.matchAll(/alter table public\.\w+ add column if not exists/gi),
    ];
    expect(allAlterations).toHaveLength(guardedAlterations.length);
  });
});
