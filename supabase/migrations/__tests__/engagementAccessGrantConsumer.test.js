// Keeps 0162_engagement_access_grant_consumer.sql inside its own stated rules: a fifth
// consumer role holding no privilege on workspace.memberships, a SECURITY DEFINER delegate
// that is the only thing that can write there, a positional (not type-filtered) cursor, and
// a 90-day expiry that is documented as a safety net rather than the business rule.
//
// Structural. Behaviour is proven by supabase/diagnostics/VERIFY_ENGAGEMENT_ACCESS_GRANT_CONSUMER.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0162_engagement_access_grant_consumer.sql";

const codeNoComments = readFileSync(MIGRATION, "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function bodyOf(functionName, code) {
  const start = code.indexOf(`create or replace function ${functionName}`);
  const end = code.indexOf("\n$$;", start);
  return code.slice(start, end);
}

describe("0162_engagement_access_grant_consumer migration", () => {
  it("creates klussie_consumer_workspace guardedly, NOLOGIN, and grants postgres SET on it", () => {
    expect(codeNoComments).toMatch(/create role klussie_consumer_workspace nologin/);
    expect(codeNoComments).toMatch(/grant klussie_consumer_workspace to postgres with set true/);
  });

  it("gives the consumer role the identical cursor/quarantine grant shape 0024 gives the other four", () => {
    expect(codeNoComments).toMatch(/grant select, insert, update on platform\.consumer_cursors to klussie_consumer_workspace/i);
    expect(codeNoComments).toMatch(/grant select, insert, update on platform\.consumer_quarantine to klussie_consumer_workspace/i);
    expect(codeNoComments).toMatch(/grant select on platform\.events to klussie_consumer_workspace/i);
  });

  it("extends 0102's events_engine_read policy rather than adding a second one", () => {
    expect(codeNoComments).toMatch(/drop policy if exists events_engine_read on platform\.events/);
    expect(codeNoComments).toMatch(
      /create policy events_engine_read on platform\.events\s*\n\s*for select\s*\n\s*to klussie_consumer_delivery, klussie_engine_property, klussie_consumer_workspace\s*\n\s*using \(true\)/
    );
  });

  it("grants the consumer role USAGE on workspace, but never a direct privilege on workspace.memberships", () => {
    expect(codeNoComments).toMatch(/grant usage on schema workspace to klussie_consumer_workspace/);
    expect(codeNoComments).not.toMatch(/grant[^;]*\bworkspace\.memberships\b[^;]*to klussie_consumer_workspace/is);
  });

  it("adds the RLS policy platform.consumer_cursors/consumer_quarantine never had — 0024's own dead grant, for all five consumer roles plus the operator, dropped before recreated", () => {
    for (const [policy, table] of [
      ["consumer_cursors_consumer_access", "consumer_cursors"],
      ["consumer_cursors_operator_read", "consumer_cursors"],
      ["consumer_quarantine_consumer_access", "consumer_quarantine"],
      ["consumer_quarantine_operator_read", "consumer_quarantine"],
    ]) {
      expect(codeNoComments, `${policy} not dropped first`).toMatch(
        new RegExp(`drop policy if exists ${policy} on platform\\.${table}`)
      );
    }
    expect(codeNoComments).toMatch(
      /create policy consumer_cursors_consumer_access on platform\.consumer_cursors\s*\n\s*for all\s*\n\s*to klussie_consumer_projection, klussie_consumer_delivery, klussie_consumer_search,\s*\n\s*klussie_consumer_analytics, klussie_consumer_workspace\s*\n\s*using \(true\)\s*\n\s*with check \(true\)/
    );
    expect(codeNoComments).toMatch(
      /create policy consumer_cursors_operator_read on platform\.consumer_cursors\s*\n\s*for select\s*\n\s*to klussie_operator\s*\n\s*using \(true\)/
    );
    expect(codeNoComments).toMatch(
      /create policy consumer_quarantine_consumer_access on platform\.consumer_quarantine\s*\n\s*for all\s*\n\s*to klussie_consumer_projection, klussie_consumer_delivery, klussie_consumer_search,\s*\n\s*klussie_consumer_analytics, klussie_consumer_workspace\s*\n\s*using \(true\)\s*\n\s*with check \(true\)/
    );
    expect(codeNoComments).toMatch(
      /create policy consumer_quarantine_operator_read on platform\.consumer_quarantine\s*\n\s*for select\s*\n\s*to klussie_operator\s*\n\s*using \(true\)/
    );
  });

  it("adds granting_engagement_id as a nullable, referenced, partially-unique column", () => {
    expect(codeNoComments).toMatch(
      /add column if not exists granting_engagement_id uuid references work\.engagements \(id\)/
    );
    expect(codeNoComments).toMatch(
      /create unique index if not exists memberships_granting_engagement_unique\s*\n\s*on workspace\.memberships \(granting_engagement_id\)\s*\n\s*where granting_engagement_id is not null/
    );
  });

  describe("workspace.grant_engagement_access() — the SECURITY DEFINER delegate", () => {
    const FN = "workspace.grant_engagement_access";

    it("drops the orphaned 6-param overload before recreating with 4 params", () => {
      expect(codeNoComments).toMatch(
        /drop function if exists workspace\.grant_engagement_access\(uuid, uuid, uuid, uuid, uuid, timestamptz\);\s*\n\s*\ncreate or replace function workspace\.grant_engagement_access/
      );
    });

    it("mints its own membership_id/event_id internally — never takes them as parameters", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/v_membership_id := platform\.uuid_v7_at\(now\(\)\)/);
      expect(block).toMatch(/v_event_id := platform\.uuid_v7_at\(now\(\)\)/);
      expect(codeNoComments).not.toMatch(/p_membership_id\s+uuid/);
      expect(codeNoComments).not.toMatch(/p_event_id\s+uuid/);
    });

    it("is SECURITY DEFINER, granted to klussie_consumer_workspace only, no api.* delegate", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/security definer/i);
      expect(codeNoComments).toMatch(
        /revoke all on function workspace\.grant_engagement_access\([^)]*\) from public, anon, authenticated, service_role/
      );
      expect(codeNoComments).toMatch(
        /grant execute on function workspace\.grant_engagement_access\([^)]*\) to klussie_consumer_workspace/
      );
      expect(codeNoComments).not.toMatch(/create or replace function api\.grant_engagement_access/);
    });

    it("is idempotent per engagement before doing anything else", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/where granting_engagement_id = p_engagement_id/);
      expect(block.indexOf("where granting_engagement_id = p_engagement_id")).toBeLessThan(
        block.indexOf("insert into workspace.memberships")
      );
    });

    it("skips without raising when the request has no property/asset/location subject", () => {
      const block = bodyOf(FN, codeNoComments);
      const skipIdx = block.indexOf("if v_property_id is null then");
      const nextLines = block.slice(skipIdx, block.indexOf("end if;", skipIdx));
      expect(nextLines).toMatch(/raise notice/);
      expect(nextLines).not.toMatch(/raise exception/);
      expect(nextLines).toMatch(/return;/);
    });

    it("resolves property_id from the request, or its asset, or its location — matching the coalesce shape used elsewhere", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/r\.property_id/);
      expect(block).toMatch(/from property\.assets a where a\.id = r\.asset_id/);
      expect(block).toMatch(/from property\.locations l where l\.id = r\.location_id/);
    });

    it("computes expires_at from the triggering event's own occurred_at, not now()", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/v_expires_at\s*:=\s*p_occurred_at \+ interval '90 days'/);
    });

    it("inserts role = 'contractor' with scope keyed by propertyId", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/'contractor'/);
      expect(block).toMatch(/jsonb_build_object\('propertyId', v_property_id\)/);
    });

    it("emits workspace.membership.joined with correlation propagated and causation set to the triggering event", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/p_event_type\s*=>\s*'workspace\.membership\.joined'/);
      expect(block).toMatch(/p_correlation_id\s*=>\s*p_correlation_id/);
      expect(block).toMatch(/p_causation_id\s*=>\s*p_causation_id/);
      expect(block).toMatch(/p_actor_type\s*=>\s*'system'/);
    });

    it("never writes workspace.membership_history — matching every other insert into workspace.memberships in this codebase", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).not.toMatch(/membership_history/);
    });
  });

  describe("workspace.consume_engagement_access_grants() — the cursor loop", () => {
    const FN = "workspace.consume_engagement_access_grants";

    it("drops before recreating — its own OUT-parameter row type changed once already", () => {
      expect(codeNoComments).toMatch(
        /drop function if exists workspace\.consume_engagement_access_grants\(integer\);\s*\n\s*\ncreate or replace function workspace\.consume_engagement_access_grants/
      );
    });

    it("is not SECURITY DEFINER — runs as its caller, klussie_consumer_workspace", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).not.toMatch(/security definer/i);
      expect(codeNoComments).toMatch(
        /grant execute on function workspace\.consume_engagement_access_grants\(integer\) to klussie_consumer_workspace/
      );
    });

    it("iterates all eight hash partitions, matching ADR-0020's modulus", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/for v_partition in 0\.\.7 loop/);
    });

    it("queries the parent platform.events table, never a partition table directly", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/from platform\.events\s*\n\s*where satisfies_hash_partition/);
      expect(block).not.toMatch(/platform\.%I/);
      expect(block).not.toMatch(/'events_w' \|\| v_partition/);
    });

    it("prunes to one partition via satisfies_hash_partition, matching ADR-0020's modulus", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(
        /satisfies_hash_partition\('platform\.events'::regclass, 8, v_partition, workspace_id\)/
      );
    });

    it("reads positionally — no event_type filter in the WHERE clause, dispatch happens after the fetch", () => {
      const block = bodyOf(FN, codeNoComments);
      const whereStart = block.indexOf("where satisfies_hash_partition");
      const whereEnd = block.indexOf("order by", whereStart);
      const whereClause = block.slice(whereStart, whereEnd);
      expect(whereClause).not.toMatch(/event_type/);
      expect(whereClause).toMatch(/\(occurred_at, event_id\) > \(v_last_occurred_at, v_last_event_id\)/);
      expect(block).toMatch(/if v_row\.event_type = 'marketplace\.engagement\.created' then/);
    });

    it("treats a null cursor position and a missing cursor row identically — both read from the beginning", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/coalesce\(v_last_occurred_at, '-infinity'::timestamptz\)/);
      expect(block).toMatch(
        /coalesce\(v_last_event_id, '00000000-0000-0000-0000-000000000000'::uuid\)/
      );
    });

    it("quarantines per-event on exception rather than failing the whole partition", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/exception when others then/);
      expect(block).toMatch(/insert into platform\.consumer_quarantine/);
      expect(block).toMatch(/on conflict \(consumer_name, event_id\) do update/);
    });

    it("advances the cursor unconditionally past a quarantined event — the read loop continues either way", () => {
      const block = bodyOf(FN, codeNoComments);
      const exceptionIdx = block.indexOf("exception when others then");
      const endBlockIdx = block.indexOf("end;", exceptionIdx);
      const afterExceptionBlock = block.slice(endBlockIdx, endBlockIdx + 400);
      expect(afterExceptionBlock).toMatch(/v_last_occurred_at := v_row\.occurred_at/);
      expect(afterExceptionBlock).toMatch(/v_last_event_id := v_row\.event_id/);
    });

    it("only upserts the cursor when at least one event was actually read", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/if v_events_read > 0 then/);
      expect(block).toMatch(/on conflict \(consumer_name, partition_index\) do update/);
    });

    it("returns one row per partition for observability, with out_-prefixed columns to avoid colliding with platform.consumer_cursors.partition_index", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/return next;/);
      expect(codeNoComments).toMatch(
        /returns table \(\s*\n\s*out_partition_index\s+smallint,\s*\n\s*out_events_read\s+integer,\s*\n\s*out_events_processed\s+integer,\s*\n\s*out_events_skipped\s+integer,\s*\n\s*out_events_quarantined\s+integer\s*\n\s*\)/
      );
    });
  });

  it("schedules every minute via pg_cron, downgrading from postgres with set role rather than cron.schedule_in_database's username", () => {
    expect(codeNoComments).toMatch(/select cron\.schedule\(\s*\n\s*'workspace-engagement-access-grants',\s*\n\s*'\* \* \* \* \*',/);
    expect(codeNoComments).toMatch(/set role klussie_consumer_workspace; select workspace\.consume_engagement_access_grants\(\); reset role;/);
    expect(codeNoComments).not.toMatch(/cron\.schedule_in_database/);
  });

  it("does not build engagement completion/cancellation revocation — a named, deliberate gap", () => {
    expect(codeNoComments).not.toMatch(/marketplace\.engagement\.completed/);
    expect(codeNoComments).not.toMatch(/marketplace\.engagement\.cancelled/);
    expect(codeNoComments).not.toMatch(/state = 'ended'/);
  });

  it("grants the client-facing roles nothing", () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      expect(codeNoComments).not.toMatch(new RegExp(`\\bgrant\\b[^;]*\\bto\\s+[^;]*\\b${role}\\b`, "is"));
    }
  });
});
