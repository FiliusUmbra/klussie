// Keeps 0117_notification_contract.sql inside its own stated rules: event_type minted
// correctly from the start, raise_notification() never minting a recipient id itself,
// and my_inbox() composed at read time through live membership, never materialised.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0117_notification_contract.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const code = codeNoComments.replace(/'(?:[^']|'')*'/g, "''");

describe("0117_notification_contract migration", () => {
  it("defines exactly eight functions, all in platform, none in api", () => {
    const created = [...codeNoComments.matchAll(/create or replace function (platform\.\w+|api\.\w+)\(/g)].map((m) => m[1]);
    expect(created.sort()).toEqual([
      "platform.escalate_notification",
      "platform.mark_notification_acted",
      "platform.mark_notification_delivered",
      "platform.mark_notification_seen",
      "platform.my_inbox",
      "platform.notification_preferences_for_membership",
      "platform.raise_notification",
      "platform.set_notification_preference",
    ]);
  });

  it("every event_type is already dotted <engine>.<aggregate>.<past-participle>, never bare PascalCase", () => {
    const literals = [...codeNoComments.matchAll(/p_event_type\s*=>\s*'([^']+)'/g)].map((m) => m[1]);
    expect(literals.length).toBeGreaterThan(0);
    for (const value of literals) {
      expect(value, `${value} is not dotted lowercase`).toMatch(/^[a-z_]+\.[a-z_]+\.[a-z_]+$/);
    }
  });

  it("raise_notification never mints a recipient id — one bulk insert from the caller-supplied array", () => {
    const start = codeNoComments.indexOf("create or replace function platform.raise_notification(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/from jsonb_array_elements\(p_recipients\) as r/);
    expect(block).toMatch(/\(r ->> 'deliveryId'\)::uuid/);
    expect(block).not.toMatch(/gen_random_uuid|uuid_v7_at/);
    expect(block).toMatch(/'platform\.notification\.raised'/);
  });

  it("mark_notification_delivered/seen/acted each guard on their own null precondition and resolve workspace_id through the join", () => {
    for (const [fn, col, eventType] of [
      ["mark_notification_delivered", "delivered_at", "platform.notification.delivered"],
      ["mark_notification_seen", "seen_at", "platform.notification.seen"],
      ["mark_notification_acted", "acted_at", "platform.notification.acted_on"],
    ]) {
      const start = codeNoComments.indexOf(`create or replace function platform.${fn}(`);
      const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
      expect(block, `${fn} missing precondition`).toMatch(new RegExp(`and d\\.${col} is null`));
      expect(block, `${fn} missing returning workspace_id`).toMatch(/returning n\.workspace_id into v_workspace_id/);
      expect(block, `${fn} missing its event`).toMatch(new RegExp(`'${eventType.replace(/\./g, "\\.")}'`));
    }
  });

  it("escalate_notification refuses an item already acted on, emits no dedicated table write", () => {
    const start = codeNoComments.indexOf("create or replace function platform.escalate_notification(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/where d\.id = p_delivery_id and d\.acted_at is null/);
    expect(block).not.toMatch(/insert into|update platform\.notification/);
    expect(block).toMatch(/'platform\.notification\.escalated'/);
  });

  it("set_notification_preference verifies the membership is real, then upserts on membership_id", () => {
    const start = codeNoComments.indexOf("create or replace function platform.set_notification_preference(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/if not exists \(select 1 from workspace\.memberships where id = p_membership_id\) then/);
    expect(block).toMatch(/on conflict \(membership_id\) do update/);
    expect(block).not.toMatch(/perform platform\.emit_event/);
  });

  it("my_inbox joins deliveries to notifications to the caller's own live memberships, filtered by identity, never materialised", () => {
    const start = codeNoComments.indexOf("create or replace function platform.my_inbox(");
    const block = codeNoComments.slice(start, codeNoComments.indexOf("$$;", start));
    expect(block).toMatch(/from platform\.notification_deliveries d/);
    expect(block).toMatch(/join platform\.notifications n on n\.id = d\.notification_id/);
    expect(block).toMatch(/join identity\.identities i on i\.person_ref = d\.person_ref/);
    expect(block).toMatch(/join workspace\.current_memberships\(\) m on m\.workspace_id = n\.workspace_id/);
    expect(block).toMatch(/where i\.auth_user_id = auth\.uid\(\)/);
    expect(block).toMatch(/and i\.erased_at is null/);
  });

  it("every function sets search_path to empty", () => {
    const fns = [...codeNoComments.matchAll(/create or replace function ([\w.]+)\([^)]*\)[\s\S]*?set search_path = (\S+)/gi)];
    expect(fns.length).toBe(8);
    for (const [, name, path] of fns) {
      expect(path, `${name} does not use an empty search_path`).toBe("''");
    }
  });

  it("grants every function to klussie_engine_platform only — no api delegate, no client grant", () => {
    expect(code).not.toMatch(/create or replace function api\./);
    expect(code).not.toMatch(/grant execute .* to authenticated/i);
    expect(code).toMatch(/to klussie_engine_platform/);
  });

  it("grants exactly the cross-schema access this migration needs, named and narrow", () => {
    expect(code).toMatch(/grant usage on schema workspace to klussie_engine_platform/i);
    expect(code).toMatch(/grant select on workspace\.memberships to klussie_engine_platform/i);
    expect(code).toMatch(/grant execute on function workspace\.current_memberships\(\) to klussie_engine_platform/i);
    expect(code).toMatch(/grant usage on schema identity to klussie_engine_platform/i);
    expect(code).toMatch(/grant select on identity\.identities to klussie_engine_platform/i);
  });
});
