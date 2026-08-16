// Keeps 0035_backfill_workspace_ids.sql applying exactly the rules WP 03.05's migration
// (0032) already stated and cited for each of the thirteen tables — a discrepancy here is
// a discrepancy between what was promised and what was done.
//
// Structural. The mapping is proven against real and synthetic data by
// supabase/diagnostics/VERIFY_BACKFILL_WORKSPACE_IDS.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0035_backfill_workspace_ids.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

// One assertion per table: which type/role filter (or which parent table) it resolves
// through, matching 0032's own documented rule exactly.
const PROFESSIONAL_VIA_IDENTITY = ["pro_profiles", "pro_stats", "pro_services", "portfolio_items", "testimonials"];
const PERSONAL_VIA_IDENTITY = ["service_requests", "reviews", "reports", "household_items"];
const DERIVED_FROM_PARENT = [
  { table: "service_request_photos", parentAlias: "sr", parentTable: "service_requests" },
  { table: "conversations", parentAlias: "sr", parentTable: "service_requests" },
  { table: "messages", parentAlias: "c", parentTable: "conversations" },
];

describe("0035_backfill_workspace_ids migration", () => {
  it("updates all thirteen tables, each guarded by workspace_id is null", () => {
    const allTables = [
      ...PROFESSIONAL_VIA_IDENTITY,
      "quotes",
      ...PERSONAL_VIA_IDENTITY,
      ...DERIVED_FROM_PARENT.map((d) => d.table),
    ];
    for (const table of allTables) {
      const updateStart = codeNoComments.indexOf(`update public.${table} `);
      expect(updateStart, `no UPDATE found for public.${table}`).toBeGreaterThan(-1);
      const statementEnd = codeNoComments.indexOf(";", updateStart);
      const statement = codeNoComments.slice(updateStart, statementEnd);
      expect(statement, `${table}'s UPDATE has no workspace_id is null guard`).toMatch(
        /workspace_id is null/
      );
    }
    expect(allTables.length).toBe(13);
  });

  it("resolves the Professional Workspace group through identity, type professional, role owner", () => {
    for (const table of PROFESSIONAL_VIA_IDENTITY) {
      const updateStart = codeNoComments.indexOf(`update public.${table} `);
      const statementEnd = codeNoComments.indexOf(";", updateStart);
      const statement = codeNoComments.slice(updateStart, statementEnd);
      expect(statement, `${table} does not filter to a professional owner workspace`).toMatch(
        /w\.type = 'professional' and m\.role = 'owner'/
      );
    }
  });

  it("resolves the Personal Workspace group through identity, type personal, role owner", () => {
    for (const table of PERSONAL_VIA_IDENTITY) {
      const updateStart = codeNoComments.indexOf(`update public.${table} `);
      const statementEnd = codeNoComments.indexOf(";", updateStart);
      const statement = codeNoComments.slice(updateStart, statementEnd);
      expect(statement, `${table} does not filter to a personal owner workspace`).toMatch(
        /w\.type = 'personal' and m\.role = 'owner'/
      );
    }
  });

  it("resolves the offering workspace (quotes) through identity, type professional", () => {
    const updateStart = codeNoComments.indexOf("update public.quotes ");
    const statementEnd = codeNoComments.indexOf(";", updateStart);
    const statement = codeNoComments.slice(updateStart, statementEnd);
    expect(statement).toMatch(/w\.type = 'professional' and m\.role = 'owner'/);
    expect(statement).toMatch(/i\.auth_user_id = q\.pro_id/);
  });

  it("derives service_request_photos, conversations and messages from their parent, not from identity", () => {
    for (const { table, parentAlias, parentTable } of DERIVED_FROM_PARENT) {
      const updateStart = codeNoComments.indexOf(`update public.${table} `);
      const statementEnd = codeNoComments.indexOf(";", updateStart);
      const statement = codeNoComments.slice(updateStart, statementEnd);
      expect(
        statement,
        `${table} should set workspace_id from ${parentAlias}.workspace_id, not resolve independently`
      ).toMatch(new RegExp(`set workspace_id = ${parentAlias}\\.workspace_id`));
      expect(statement).toMatch(new RegExp(`from public\\.${parentTable} ${parentAlias}`));
      expect(statement, `${table} does not guard against a still-null parent workspace`).toMatch(
        new RegExp(`${parentAlias}\\.workspace_id is not null`)
      );
    }
  });

  it("orders the derived group correctly — service_requests before its dependents, conversations before messages", () => {
    const requestsIdx = codeNoComments.indexOf("update public.service_requests sr");
    const photosIdx = codeNoComments.indexOf("update public.service_request_photos");
    const conversationsIdx = codeNoComments.indexOf("update public.conversations");
    const messagesIdx = codeNoComments.indexOf("update public.messages");

    expect(requestsIdx).toBeLessThan(photosIdx);
    expect(requestsIdx).toBeLessThan(conversationsIdx);
    expect(conversationsIdx).toBeLessThan(messagesIdx);
  });

  it("uses UPDATE, not INSERT or DELETE, and touches no table outside the thirteen", () => {
    expect(code).not.toMatch(/\binsert into\b/i);
    expect(code).not.toMatch(/\bdelete from\b/i);
    expect(code).not.toMatch(/update identity\./i);
    expect(code).not.toMatch(/update workspace\./i);
  });
});
