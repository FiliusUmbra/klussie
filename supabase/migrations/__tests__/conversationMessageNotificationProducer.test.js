// Keeps 0169_conversation_message_notification_producer.sql inside its own stated
// rules: a sixth consumer role holding no privilege on platform.notifications directly,
// a SECURITY DEFINER delegate that is the only thing that can write there, one
// raise_notification() call per recipient (not per message), and a positional
// (not type-filtered) cursor — following workspace.consume_engagement_access_grants()'s
// own reference shape (0162) exactly.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/0169_conversation_message_notification_producer.sql";

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

describe("0169_conversation_message_notification_producer migration", () => {
  it("creates klussie_consumer_notification guardedly, NOLOGIN, and grants postgres SET on it", () => {
    expect(codeNoComments).toMatch(/create role klussie_consumer_notification nologin/);
    expect(codeNoComments).toMatch(/grant klussie_consumer_notification to postgres with set true/);
  });

  it("gives the consumer role the identical cursor/quarantine grant shape every other consumer role has", () => {
    expect(codeNoComments).toMatch(/grant select, insert, update on platform\.consumer_cursors to klussie_consumer_notification/i);
    expect(codeNoComments).toMatch(/grant select, insert, update on platform\.consumer_quarantine to klussie_consumer_notification/i);
    expect(codeNoComments).toMatch(/grant select on platform\.events to klussie_consumer_notification/i);
  });

  it("extends events_engine_read to a fourth role rather than adding a second policy", () => {
    expect(codeNoComments).toMatch(/drop policy if exists events_engine_read on platform\.events/);
    expect(codeNoComments).toMatch(
      /create policy events_engine_read on platform\.events\s*\n\s*for select\s*\n\s*to klussie_consumer_delivery, klussie_engine_property, klussie_consumer_workspace, klussie_consumer_notification\s*\n\s*using \(true\)/
    );
  });

  it("extends both consumer-access policies to a sixth role, dropped before recreated", () => {
    for (const [policy, table] of [
      ["consumer_cursors_consumer_access", "consumer_cursors"],
      ["consumer_quarantine_consumer_access", "consumer_quarantine"],
    ]) {
      expect(codeNoComments, `${policy} not dropped first`).toMatch(
        new RegExp(`drop policy if exists ${policy} on platform\\.${table}`)
      );
    }
    expect(codeNoComments).toMatch(
      /create policy consumer_cursors_consumer_access on platform\.consumer_cursors\s*\n\s*for all\s*\n\s*to klussie_consumer_projection, klussie_consumer_delivery, klussie_consumer_search,\s*\n\s*klussie_consumer_analytics, klussie_consumer_workspace, klussie_consumer_notification\s*\n\s*using \(true\)\s*\n\s*with check \(true\)/
    );
    expect(codeNoComments).toMatch(
      /create policy consumer_quarantine_consumer_access on platform\.consumer_quarantine\s*\n\s*for all\s*\n\s*to klussie_consumer_projection, klussie_consumer_delivery, klussie_consumer_search,\s*\n\s*klussie_consumer_analytics, klussie_consumer_workspace, klussie_consumer_notification\s*\n\s*using \(true\)\s*\n\s*with check \(true\)/
    );
  });

  it("does not touch the operator_read policies — unrelated to which consumer roles exist", () => {
    expect(codeNoComments).not.toMatch(/consumer_cursors_operator_read/);
    expect(codeNoComments).not.toMatch(/consumer_quarantine_operator_read/);
  });

  describe("platform.raise_conversation_message_notification() — the SECURITY DEFINER delegate", () => {
    const FN = "platform.raise_conversation_message_notification";

    it("is SECURITY DEFINER, granted to klussie_consumer_notification only, no api.* delegate", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/security definer/i);
      expect(codeNoComments).toMatch(
        /revoke all on function platform\.raise_conversation_message_notification\([^)]*\) from public, anon, authenticated, service_role/
      );
      expect(codeNoComments).toMatch(
        /grant execute on function platform\.raise_conversation_message_notification\([^)]*\) to klussie_consumer_notification/
      );
      expect(codeNoComments).not.toMatch(/create or replace function api\.raise_conversation_message_notification/);
    });

    it("resolves the sender from work.messages, raising if the message doesn't exist", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/from work\.messages\s*\n\s*where id = p_message_id/);
      expect(block).toMatch(/if v_sender_person_ref is null then\s*\n\s*raise exception/);
    });

    it("resolves the sender's display name via identity.identities -> public.profiles, coalescing to a fallback", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/join public\.profiles p on p\.id = i\.auth_user_id/);
      expect(block).toMatch(/coalesce\(v_sender_name, 'a Klussie user'\)/);
    });

    it("iterates every OTHER live participant, excluding the sender and anyone who left", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/from work\.conversation_participants\s*\n\s*where conversation_id = p_conversation_id\s*\n\s*and person_ref <> v_sender_person_ref\s*\n\s*and left_at is null/);
    });

    it("is idempotent per (source_event_id, recipient workspace), not merely per event", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/where source_event_id = p_message_sent_event_id\s*\n\s*and workspace_id = v_recipient\.workspace_id/);
      expect(block).toMatch(/continue;/);
    });

    it("mints notification_id/delivery_id/event_id internally — never takes them as parameters", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/v_notification_id := platform\.uuid_v7_at\(now\(\)\)/);
      expect(block).toMatch(/v_delivery_id := platform\.uuid_v7_at\(now\(\)\)/);
      expect(block).toMatch(/v_event_id := platform\.uuid_v7_at\(now\(\)\)/);
      expect(codeNoComments.slice(0, codeNoComments.indexOf("returns void"))).not.toMatch(/p_notification_id|p_delivery_id/);
    });

    it("calls raise_notification once per recipient, scoped to that recipient's own workspace_id — not the sender's", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/perform platform\.raise_notification\(/);
      expect(block).toMatch(/p_workspace_id\s*=>\s*v_recipient\.workspace_id/);
      // Inside the loop body, not before it — the call must be nested under "for v_recipient in".
      expect(block.indexOf("for v_recipient in")).toBeLessThan(block.indexOf("perform platform.raise_notification("));
    });

    it("passes exactly one recipient per call — a single-element jsonb array keyed to this loop's own v_recipient", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/jsonb_build_array\(\s*\n\s*jsonb_build_object\('personRef', v_recipient\.person_ref, 'deliveryId', v_delivery_id, 'channel', 'in_app'\)\s*\n\s*\)/);
    });

    it("category is 'conversation.message', channel is 'in_app', subject_type/subject_id point at the conversation", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/p_category\s*=>\s*'conversation\.message'/);
      expect(block).toMatch(/p_subject_type\s*=>\s*'conversation'/);
      expect(block).toMatch(/p_subject_id\s*=>\s*p_conversation_id/);
      expect(block).toMatch(/p_source_event_id\s*=>\s*p_message_sent_event_id/);
    });

    it("emits as actor_type 'system', a named producer actor_ref, correlation propagated", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/p_actor_type\s*=>\s*'system'/);
      expect(block).toMatch(/p_actor_ref\s*=>\s*'conversation_message_notification_producer'/);
      expect(block).toMatch(/p_correlation_id\s*=>\s*p_correlation_id/);
    });
  });

  describe("platform.consume_conversation_message_notifications() — the cursor loop", () => {
    const FN = "platform.consume_conversation_message_notifications";

    it("is not SECURITY DEFINER — runs as its caller, klussie_consumer_notification", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).not.toMatch(/security definer/i);
      expect(codeNoComments).toMatch(
        /grant execute on function platform\.consume_conversation_message_notifications\(integer\) to klussie_consumer_notification/
      );
    });

    it("iterates all eight hash partitions, matching ADR-0020's modulus", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/for v_partition in 0\.\.7 loop/);
    });

    it("queries the parent platform.events table, never a partition table directly, selecting payload for messageId extraction", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/select event_id, event_type, workspace_id, subject_type, subject_id, correlation_id, occurred_at, payload/);
      expect(block).toMatch(/from platform\.events\s*\n\s*where satisfies_hash_partition/);
      expect(block).not.toMatch(/platform\.%I/);
    });

    it("reads positionally — no event_type filter in the WHERE clause, dispatch happens after the fetch", () => {
      const block = bodyOf(FN, codeNoComments);
      const whereStart = block.indexOf("where satisfies_hash_partition");
      const whereEnd = block.indexOf("order by", whereStart);
      const whereClause = block.slice(whereStart, whereEnd);
      expect(whereClause).not.toMatch(/event_type/);
      expect(block).toMatch(/if v_row\.event_type = 'conversation\.message\.sent' then/);
    });

    it("extracts messageId from the event's own payload, not a parameter it doesn't have", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/p_message_id\s*=>\s*\(v_row\.payload ->> 'messageId'\)::uuid/);
    });

    it("quarantines per-event on exception rather than failing the whole partition", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/exception when others then/);
      expect(block).toMatch(/insert into platform\.consumer_quarantine/);
      expect(block).toMatch(/on conflict \(consumer_name, event_id\) do update/);
    });

    it("only upserts the cursor when at least one event was actually read", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/if v_events_read > 0 then/);
      expect(block).toMatch(/on conflict \(consumer_name, partition_index\) do update/);
    });

    it("uses its own consumer_name, distinct from every other consumer", () => {
      const block = bodyOf(FN, codeNoComments);
      expect(block).toMatch(/v_consumer_name\s+constant text := 'platform_conversation_message'/);
    });
  });

  it("schedules every minute via pg_cron, using set role rather than cron.schedule_in_database's username", () => {
    expect(codeNoComments).toMatch(/select cron\.schedule\(\s*\n\s*'conversation-message-notifications',\s*\n\s*'\* \* \* \* \*',/);
    expect(codeNoComments).toMatch(/set role klussie_consumer_notification; select platform\.consume_conversation_message_notifications\(\); reset role;/);
    expect(codeNoComments).not.toMatch(/cron\.schedule_in_database/);
  });

  it("does not filter recipients by notification_preferences — a named, deliberate gap, not built here", () => {
    expect(codeNoComments).not.toMatch(/notification_preferences_for_membership/);
    expect(codeNoComments).not.toMatch(/set_notification_preference/);
  });

  it("grants the client-facing roles nothing at all", () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      expect(codeNoComments).not.toMatch(new RegExp(`\\bgrant\\b[^;]*\\bto\\s+[^;]*\\b${role}\\b`, "is"));
    }
  });
});
