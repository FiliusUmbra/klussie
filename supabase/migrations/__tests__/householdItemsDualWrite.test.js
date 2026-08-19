// Keeps 0053_household_items_dual_write.sql inside the six-step pattern (roadmap §3, step 3)
// and inside ADR-0022/0048: household_items stays authoritative, the mirror never deletes an
// asset, and the FK fix that makes deleteHouseholdItem() safe again is actually present.
//
// Structural. Trigger behaviour is proven against staging by VERIFY_ASSET_DUAL_WRITE.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0053_household_items_dual_write.sql";

const raw = readFileSync(MIGRATION, "utf8");
const codeNoComments = raw
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");
const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0053_household_items_dual_write migration", () => {
  it("fixes the household_items_id foreign key to ON DELETE SET NULL, never CASCADE", () => {
    expect(code).toMatch(/on delete set null/i);
    expect(code).not.toMatch(/on delete cascade/i);
    expect(codeNoComments).toMatch(/drop constraint/i);
  });

  it("discovers the constraint name rather than assuming it", () => {
    expect(code).toMatch(/select conname into v_constraint_name/i);
    expect(code).toMatch(/from pg_constraint/i);
  });

  it("adds exactly three triggers on public.household_items, none on any other table", () => {
    const triggers = [...codeNoComments.matchAll(/create trigger (\w+)\s*\n\s*(before|after) (insert|update|delete) on (public\.\w+)/gi)];
    expect(triggers).toHaveLength(3);
    for (const [, , , , table] of triggers) {
      expect(table).toBe("public.household_items");
    }
    expect(triggers.map((m) => `${m[2]} ${m[3]}`.toLowerCase()).sort()).toEqual([
      "after insert", "after update", "before delete",
    ]);
  });

  it("the delete trigger runs BEFORE the row is gone, so household_items_id still matches", () => {
    const start = codeNoComments.indexOf("create trigger household_items_mirror_delete");
    const block = codeNoComments.slice(start, start + 200);
    expect(block).toMatch(/before delete on public\.household_items/i);
  });

  it("never deletes property.assets — disposes instead (0048's withheld-DELETE rule)", () => {
    expect(code).not.toMatch(/delete from property\.assets/i);
    expect(codeNoComments).toMatch(/lifecycle_state = 'disposed'/i);
  });

  it("mints the asset id via platform.uuid_v7_at(now()), never gen_random_uuid or a bare uuid_v7()", () => {
    const start = codeNoComments.indexOf("function public.household_items_mirror_insert");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/platform\.uuid_v7_at\(now\(\)\)/);
    expect(block).not.toMatch(/gen_random_uuid/i);
    expect(block).not.toMatch(/(?<!_)uuid_v7\(\)/);
  });

  it("the insert mirror is idempotent on household_items_id", () => {
    const start = codeNoComments.indexOf("function public.household_items_mirror_insert");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/on conflict \(household_items_id\)[\s\S]*do nothing/i);
  });

  it("silently mirrors nothing when no property resolves — no exception raised", () => {
    const start = codeNoComments.indexOf("function public.household_items_mirror_insert");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/if v_property_id is null then\s*\n\s*return new;/i);
    expect(block).not.toMatch(/raise exception/i);
  });

  it("the update mirror guards on every column it mirrors, via a WHEN clause", () => {
    const start = codeNoComments.indexOf("create trigger household_items_mirror_update");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("execute function", start));
    for (const col of [
      "name", "category", "brand", "model", "room", "photo_path",
      "purchased_on", "notes", "source", "ai_suggestion",
    ]) {
      expect(block, `WHEN clause missing old.${col} is distinct from new.${col}`).toMatch(
        new RegExp(`old\\.${col} is distinct from new\\.${col}`)
      );
    }
  });

  it("the update mirror does not self-heal by inserting", () => {
    const start = codeNoComments.indexOf("function public.household_items_mirror_update");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/update property\.assets/i);
    expect(block).not.toMatch(/insert into property\.assets/i);
  });

  it("shares one resolver function between the insert trigger and callers outside this file", () => {
    expect(code).toMatch(/create or replace function property\.resolve_property_for_owner/i);
    expect(codeNoComments.match(/from identity\.identities/gi)?.length).toBe(1);
    expect(code).toMatch(/v_property_id := property\.resolve_property_for_owner\(new\.owner_id\)/i);
  });

  it("the resolver does not exclude erased identities, matching 0052's own reasoning", () => {
    const start = code.indexOf("function property.resolve_property_for_owner");
    const block = code.slice(start, code.indexOf("$$;", start));
    expect(block).not.toMatch(/erased_at/i);
  });

  it("every SECURITY DEFINER function sets search_path to empty, not public", () => {
    const definerFns = [...codeNoComments.matchAll(/create or replace function ([\w.]+)\([^)]*\)[\s\S]*?security definer[\s\S]*?set search_path = (\S+)/gi)];
    expect(definerFns.length).toBeGreaterThan(0);
    for (const [, name, path] of definerFns) {
      expect(path, `${name} does not use an empty search_path`).toBe("''");
    }
  });

  it("the resolver function is granted to nobody", () => {
    expect(code).toMatch(
      /revoke all on function property\.resolve_property_for_owner\(uuid\) from public, anon, authenticated, service_role/i
    );
  });

  it("no application role is granted UPDATE, INSERT or DELETE on property.assets directly", () => {
    expect(code).not.toMatch(/grant (update|insert|delete) on property\.assets to (anon|authenticated)/i);
  });
});
