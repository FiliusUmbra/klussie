-- Platform Activation Slice 2, WP 2.6 (client cutover) — fixes a genuine, pre-existing bug
-- in 0094_conversation_isolation_policies.sql: "participants can view
-- conversation_participants" queries work.conversation_participants FROM WITHIN ITS OWN
-- USING clause, on the very table it protects. PostgreSQL re-applies a table's own RLS
-- policy to every read of that table, including a read performed by another row's policy
-- check — so evaluating this policy for one row requires evaluating it again for the
-- subquery's rows, forever: `ERROR: infinite recursion detected in policy for relation
-- "conversation_participants"`. work.conversations' and work.messages' own policies both
-- query conversation_participants too, so they inherit the identical failure the moment
-- conversation_participants' own RLS is actually exercised — every read of any of these
-- three tables under RLS was broken from the moment 0094 shipped.
--
-- WHY THIS WAS INVISIBLE TO EVERY SQL DIAGNOSTIC THIS PROGRAMME HAS EVER RUN
--
-- Every VERIFY_*.sql/RECONCILE_*.sql diagnostic in this programme calls work.*/api.*
-- functions directly — SECURITY DEFINER, owned by postgres, which is exempt from RLS on
-- every table it owns by PostgreSQL's own default (superusers and table owners bypass row
-- security unless FORCE ROW LEVEL SECURITY is set, which none of these tables have). RLS
-- on these three tables was never actually EVALUATED by any diagnostic this programme has
-- run — only by a real `authenticated`-role SELECT, which nothing reached until WP 2.6's
-- own client cutover needed `authenticated` to hold real grants on work.* tables at all
-- (0158/0159, this same slice) for Realtime's postgres_changes to work. The first genuine
-- RLS-governed read of these three tables, ever, in this programme's history, is what
-- found this — not a SQL diagnostic, driving the real app.
--
-- THE FIX — THE SAME SHAPE workspace.current_memberships()/api.current_workspace_
-- memberships() ALREADY ESTABLISHED FOR THE IDENTICAL CLASS OF PROBLEM
--
-- A SECURITY DEFINER function, owned by postgres, reads work.conversation_participants
-- directly — as the table's own owner, which PostgreSQL exempts from that table's RLS by
-- default, the same exemption every engine's own contract function already relies on.
-- No recursion is possible: the function never triggers conversation_participants' own
-- policy at all. All three policies now reference this resolver instead of re-deriving the
-- self-referencing subquery — matching 0088_marketplace_isolation_policies.sql's own
-- established precedent of a work-schema policy referencing an api.* resolver directly.

-- =========================================================================
-- 1 · work.my_active_conversation_ids() / api.my_active_conversation_ids()

create or replace function work.my_active_conversation_ids(p_person_ref uuid)
returns table (conversation_id uuid)
language sql
stable
set search_path = ''
as $$
  select cp.conversation_id
  from work.conversation_participants cp
  where cp.person_ref = p_person_ref
    and cp.left_at is null;
$$;

comment on function work.my_active_conversation_ids(uuid) is
  'Every conversation one real person actively participates in — reads work.conversation_participants directly. Reachable only from api.my_active_conversation_ids(), which runs it under the owning postgres role, exempt from conversation_participants'' own RLS by PostgreSQL''s own default table-owner exemption. This is what breaks the recursion 0094''s own self-referencing policy hit — see this migration''s own header.';

create or replace function api.my_active_conversation_ids()
returns table (conversation_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_person_ref uuid;
begin
  select person_ref into v_person_ref from public.current_identity();
  if v_person_ref is null then
    return;
  end if;
  return query select * from work.my_active_conversation_ids(v_person_ref);
end;
$$;

comment on function api.my_active_conversation_ids() is
  'The Conversation engine''s own isolation-predicate resolver (WP 2.6) — the same shape api.current_workspace_memberships() (0031) already established for workspace.current_memberships(): logic in the owning engine schema, a thin SECURITY DEFINER delegate here, referenced directly from RLS policies on work.conversations/work.conversation_participants/work.messages (0160, this migration) in place of the self-referencing subquery 0094 originally wrote. Resolves the caller''s own person_ref internally via public.current_identity() — never caller-supplied.';

revoke all on function work.my_active_conversation_ids(uuid) from public, anon, authenticated, service_role;
revoke all on function api.my_active_conversation_ids() from public, anon, service_role;
grant execute on function api.my_active_conversation_ids() to authenticated;

-- =========================================================================
-- 2 · The three policies, redefined to use it — identical predicate shape, no self-join

drop policy if exists "participants can view conversations" on work.conversations;
create policy "participants can view conversations"
  on work.conversations for select
  to authenticated
  using (id in (select conversation_id from api.my_active_conversation_ids()));

drop policy if exists "participants can view conversation_participants" on work.conversation_participants;
create policy "participants can view conversation_participants"
  on work.conversation_participants for select
  to authenticated
  using (conversation_id in (select conversation_id from api.my_active_conversation_ids()));

comment on policy "participants can view conversation_participants" on work.conversation_participants is
  'A participant sees the full roster of their own conversation (0094''s own reasoning, unchanged). Rewritten (0160) to resolve via api.my_active_conversation_ids() instead of a self-referencing subquery against this same table, which caused infinite recursion the moment RLS on this table was ever actually evaluated.';

drop policy if exists "participants can view messages" on work.messages;
create policy "participants can view messages"
  on work.messages for select
  to authenticated
  using (conversation_id in (select conversation_id from api.my_active_conversation_ids()));
