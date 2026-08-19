// Keeps 0052_backfill_assets.sql inside roadmap §3's rules for a real-data backfill, and
// inside its own deliberate departure from migration 0033's erased-identity exclusion —
// see the migration's own header for why this backfill does not repeat that filter.
//
// Structural. The mapping itself is proven against a real and synthetic population by
// supabase/diagnostics/VERIFY_BACKFILL_ASSETS.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0052_backfill_assets.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0052_backfill_assets migration", () => {
  it("reads household_items but never writes to it", () => {
    expect(code).toMatch(/from public\.household_items hi/i);
    expect(code).not.toMatch(/\b(insert into|update|delete from)\s+public\.household_items/i);
  });

  it("walks the full ownership chain: household_items -> identity -> membership -> workspace -> property", () => {
    expect(code).toMatch(/join identity\.identities i on i\.auth_user_id = hi\.owner_id/i);
    expect(code).toMatch(/join workspace\.memberships m/i);
    expect(codeNoComments).toMatch(/m\.role = 'owner'/i);
    expect(codeNoComments).toMatch(/m\.state = 'active'/i);
    expect(code).toMatch(/join workspace\.workspaces w on w\.id = m\.workspace_id/i);
    expect(codeNoComments).toMatch(/w\.type = 'personal'/i);
    expect(code).toMatch(/join property\.properties p on p\.steward_workspace_id = w\.id/i);
  });

  it("does NOT exclude erased identities — a deliberate departure from migration 0033", () => {
    expect(code).not.toMatch(/erased_at is null/i);
  });

  it("checks membership expiry, not just active state", () => {
    expect(code).toMatch(/m\.expires_at is null or m\.expires_at > now\(\)/i);
  });

  it("is idempotent via household_items_id, not a generic 'already ran' flag", () => {
    expect(code).toMatch(/not exists \(\s*select 1 from property\.assets a where a\.household_items_id = hi\.id\s*\)/i);
    expect(code).not.toMatch(/on conflict/i);
  });

  it("adds household_items_id as a nullable, referencing, uniquely-indexed bookkeeping column", () => {
    // The column declaration specifically — not the unique index's own partial-index
    // WHERE clause a few lines below, which legitimately reads "... is not null" and would
    // false-positive a looser check.
    const alterStart = code.indexOf("alter table property.assets");
    const alterEnd = code.indexOf(";", alterStart);
    const alterBlock = code.slice(alterStart, alterEnd);
    expect(alterBlock).toMatch(/add column if not exists household_items_id uuid\s*\n\s*references public\.household_items \(id\)/i);
    expect(alterBlock).not.toMatch(/not null/i);
    expect(code).toMatch(/create unique index if not exists assets_household_items_id_uidx/i);
  });

  it("mints the asset id from the household item's own creation time, not now()", () => {
    const mints = [...code.matchAll(/platform\.uuid_v7_at\(([^)]+)\)/g)].map((m) => m[1]);
    expect(mints.length).toBe(1);
    expect(mints[0]).toMatch(/hi\.created_at/);
    expect(code).not.toMatch(/uuid_v7_at\(now\(\)\)/);
  });

  it("maps category to type and room to room_label verbatim, with no translation table", () => {
    const insertBlock = codeNoComments.slice(codeNoComments.indexOf("insert into property.assets"));
    expect(insertBlock).toMatch(/name, type, make, model, room_label, photo_path/i);
    const selectBlock = insertBlock.slice(insertBlock.indexOf("select"));
    expect(selectBlock).toMatch(/name, category, brand, model, room, photo_path/i);
  });

  it("leaves location_id and placed_since unset — every backfilled asset starts unplaced", () => {
    const insertBlock = codeNoComments.slice(codeNoComments.indexOf("insert into property.assets"));
    expect(insertBlock).not.toMatch(/location_id|placed_since/i);
  });

  it("carries source and ai_suggestion across unchanged", () => {
    const insertBlock = codeNoComments.slice(codeNoComments.indexOf("insert into property.assets"));
    expect(insertBlock).toMatch(/source, ai_suggestion/i);
  });

  it("is a single statement — one CTE chain, not separate transactions", () => {
    const withOccurrences = [...code.matchAll(/^with candidates as \(/gim)];
    expect(withOccurrences).toHaveLength(1);
  });
});
