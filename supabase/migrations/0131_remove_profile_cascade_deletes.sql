-- Closes MASTER_CONTEXT.md §12's own standing P1 debt row: "Deleting an `auth.users` row
-- cascades into nine tables" — a real, pre-session bug, violating SUPABASE_ARCHITECTURE.md
-- §5 ("no cascading deletes anywhere") and §11.4. Found and named in this session's own
-- pre-launch audit (implementation/AUDIT_PRE_LAUNCH_2026-08-19.md §2.2): deleting one
-- account destroys the OTHER party's data too — both sides of every conversation,
-- including messages the other person sent, plus every review, request and quote either
-- party was part of.
--
-- WHY THIS IS SAFE TO FIX NOW, WITHOUT WAITING FOR profiles TO RETIRE
--
-- MASTER_CONTEXT.md §12's own "Recommended Fix" said "drop the cascades when the epic that
-- retires `profiles` runs" — deferred, not because the fix itself is unsafe, but because
-- nothing had actually needed it yet. It is safe today, independently of that later work:
-- dropping ON DELETE CASCADE and falling back to Postgres's own default (NO ACTION/RESTRICT)
-- does not touch any row, any read path, or any write path that exists today — it only
-- changes what happens on a DELETE that nothing in this codebase currently issues (erasure,
-- WP 02.07, redacts identity.identities and never deletes auth.users or profiles at all).
--
-- WHY BLOCKING ONLY THESE NINE IS SUFFICIENT — PROVEN, NOT ASSUMED
--
-- profiles.id is referenced by many more tables than these nine once every second-order
-- cascade is counted (pro_profiles' own cascades to quotes/reviews/conversations/
-- portfolio_items/pro_services/pro_stats/reports/testimonials; service_requests' own
-- cascades to quotes/reviews/conversations/service_request_photos; conversations' own
-- cascade to messages). None of those need their own fix: Postgres evaluates a DELETE's
-- full cascade tree as one atomic operation, so a single blocked constraint anywhere in
-- the tree — restoring the default at the SHALLOWEST layer, directly against profiles —
-- fails the entire statement and rolls back every cascade that had already fired elsewhere
-- in the same operation. Confirmed directly against staging before writing this migration:
-- removing the cascade on just pro_profiles.profile_id, with a pro_profiles row present,
-- correctly refused a `delete from public.profiles` and left both rows untouched.
--
-- THE NINE, EXACTLY MATCHING THE AUDIT'S OWN COUNT
--
-- profile_contacts.profile_id, pro_profiles.profile_id, service_requests.customer_id,
-- reviews.customer_id, conversations.customer_id, messages.sender_id,
-- reports.reporter_id, ai_usage_log.user_id, household_items.owner_id — every foreign key
-- in the schema that references public.profiles(id) with ON DELETE CASCADE, confirmed by
-- querying information_schema.referential_constraints directly rather than assumed from
-- the migration history.
--
-- WHAT THIS DOES NOT CHANGE
--
-- Erasure (WP 02.07) never issues a DELETE against these tables — it UPDATEs
-- identity.identities to redact personal fields, matching this session's own repeated
-- "erasure routes around it by never deleting" framing. No application code path exists
-- that deletes a profiles row today, so this migration has zero observable effect on the
-- live product; it only forecloses a destructive action nothing currently takes, the same
-- "make the mistake unrepresentable" discipline this session has used throughout for new
-- work, applied here to a pre-existing gap instead.

alter table public.profile_contacts drop constraint profile_contacts_profile_id_fkey;
alter table public.profile_contacts add constraint profile_contacts_profile_id_fkey
  foreign key (profile_id) references public.profiles (id);

alter table public.pro_profiles drop constraint pro_profiles_profile_id_fkey;
alter table public.pro_profiles add constraint pro_profiles_profile_id_fkey
  foreign key (profile_id) references public.profiles (id);

alter table public.service_requests drop constraint service_requests_customer_id_fkey;
alter table public.service_requests add constraint service_requests_customer_id_fkey
  foreign key (customer_id) references public.profiles (id);

alter table public.reviews drop constraint reviews_customer_id_fkey;
alter table public.reviews add constraint reviews_customer_id_fkey
  foreign key (customer_id) references public.profiles (id);

alter table public.conversations drop constraint conversations_customer_id_fkey;
alter table public.conversations add constraint conversations_customer_id_fkey
  foreign key (customer_id) references public.profiles (id);

alter table public.messages drop constraint messages_sender_id_fkey;
alter table public.messages add constraint messages_sender_id_fkey
  foreign key (sender_id) references public.profiles (id);

alter table public.reports drop constraint reports_reporter_id_fkey;
alter table public.reports add constraint reports_reporter_id_fkey
  foreign key (reporter_id) references public.profiles (id);

alter table public.ai_usage_log drop constraint ai_usage_log_user_id_fkey;
alter table public.ai_usage_log add constraint ai_usage_log_user_id_fkey
  foreign key (user_id) references public.profiles (id);

alter table public.household_items drop constraint household_items_owner_id_fkey;
alter table public.household_items add constraint household_items_owner_id_fkey
  foreign key (owner_id) references public.profiles (id);

comment on constraint profile_contacts_profile_id_fkey on public.profile_contacts is
  'No ON DELETE CASCADE, deliberately (0131) — deleting a profile with contact data must fail loudly, not silently destroy it. Erasure redacts; nothing deletes.';
comment on constraint pro_profiles_profile_id_fkey on public.pro_profiles is
  'No ON DELETE CASCADE, deliberately (0131) — deleting a pro''s profile must fail loudly rather than cascading into every quote, review and conversation their business ever had.';
comment on constraint service_requests_customer_id_fkey on public.service_requests is
  'No ON DELETE CASCADE, deliberately (0131) — a customer''s request history, and everything a pro built on top of it (quotes, reviews), must not vanish because the customer''s account is deleted.';
comment on constraint reviews_customer_id_fkey on public.reviews is
  'No ON DELETE CASCADE, deliberately (0131) — a review is evidence about a pro''s work; it does not become false because the reviewer''s account was later deleted.';
comment on constraint conversations_customer_id_fkey on public.conversations is
  'No ON DELETE CASCADE, deliberately (0131) — this is the "both sides of every message" case: a conversation cascading away destroys the OTHER party''s messages too, which they never asked to delete.';
comment on constraint messages_sender_id_fkey on public.messages is
  'No ON DELETE CASCADE, deliberately (0131) — one party deleting their account must never delete a message the other party is relying on to still be there.';
comment on constraint reports_reporter_id_fkey on public.reports is
  'No ON DELETE CASCADE, deliberately (0131) — a trust-and-safety report must survive the reporter''s own account being deleted; that is precisely the scenario a report exists to be resilient to.';
comment on constraint ai_usage_log_user_id_fkey on public.ai_usage_log is
  'No ON DELETE CASCADE, deliberately (0131) — rate-limiting and governance history should not silently disappear alongside the account it was recorded against.';
comment on constraint household_items_owner_id_fkey on public.household_items is
  'No ON DELETE CASCADE, deliberately (0131) — matches property.assets'' own posture (0052''s backfill and 0053''s dual-write both preserve an item after its owner''s identity is erased); the legacy table should not behave differently from the engine that is replacing it.';
