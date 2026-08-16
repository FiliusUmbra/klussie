-- Epic 03 WP06 — backfill workspace on existing rows. The most error-prone package in the
-- epic (roadmap §14), and the reason: every rule applied here was already stated and cited
-- in WP 03.05's migration (0032) when the column was added. This package's only job is to
-- apply those rules exactly, so a discrepancy here is a discrepancy between what was
-- promised and what was done — precisely what WP 03.07's reconciliation checks for.
--
-- Step 2 of the six-step migration pattern (roadmap §3) for the thirteen tables 0032
-- touched. Still unread: no RLS policy references workspace_id (WP 03.10), no request
-- context resolves it (WP 03.09).
--
-- ORDER MATTERS FOR THE DERIVED GROUP
--
-- service_request_photos, conversations and messages take their workspace from a parent
-- row rather than resolving it independently — service_requests must be updated before
-- conversations reads it, and conversations before messages does. The statements below are
-- ordered accordingly; reordering them silently breaks the backfill without any error,
-- because a NULL parent workspace just produces a NULL child workspace that passes every
-- `is null` guard on the next run instead of failing loudly.
--
-- IDEMPOTENCY
--
-- Every statement is `set workspace_id = ... where workspace_id is null`. A second run
-- updates zero rows: the column is no longer null anywhere the first run reached. No
-- `not exists` needed — the fact being changed is the presence of a value, not the
-- presence of a row (roadmap §3's rule applies the same way; it just looks different on an
-- UPDATE than on an INSERT).
--
-- ONE KNOWN SIDE EFFECT, DELIBERATELY ACCEPTED
--
-- `public.service_requests` carries a `before update` trigger (`service_requests_set_updated_at`,
-- migration 0001) that bumps `updated_at` on any UPDATE, including this one. Checked before
-- writing this migration: `updated_at` is fetched by `src/lib/requests.js` but rendered or
-- sorted by nowhere in the current UI — grep confirms no consumer. The side effect is real
-- and is not suppressed, because suppressing it would mean bypassing a trigger the rest of
-- the application relies on firing correctly, for a column nothing currently displays.
-- Recorded here so it is a documented, considered decision rather than a surprise for
-- whoever notices `updated_at` moved on every request during this migration's run.

-- =========================================================================
-- PROFESSIONAL WORKSPACE GROUP

update public.pro_profiles pp
set workspace_id = w.id
from identity.identities i
join workspace.memberships m on m.person_ref = i.person_ref
join workspace.workspaces w on w.id = m.workspace_id and w.type = 'professional' and m.role = 'owner'
where i.auth_user_id = pp.profile_id
  and pp.workspace_id is null;

update public.pro_stats ps
set workspace_id = w.id
from public.pro_profiles pp
join identity.identities i on i.auth_user_id = pp.profile_id
join workspace.memberships m on m.person_ref = i.person_ref
join workspace.workspaces w on w.id = m.workspace_id and w.type = 'professional' and m.role = 'owner'
where ps.pro_id = pp.profile_id
  and ps.workspace_id is null;

update public.pro_services psv
set workspace_id = w.id
from public.pro_profiles pp
join identity.identities i on i.auth_user_id = pp.profile_id
join workspace.memberships m on m.person_ref = i.person_ref
join workspace.workspaces w on w.id = m.workspace_id and w.type = 'professional' and m.role = 'owner'
where psv.pro_id = pp.profile_id
  and psv.workspace_id is null;

update public.portfolio_items pi
set workspace_id = w.id
from public.pro_profiles pp
join identity.identities i on i.auth_user_id = pp.profile_id
join workspace.memberships m on m.person_ref = i.person_ref
join workspace.workspaces w on w.id = m.workspace_id and w.type = 'professional' and m.role = 'owner'
where pi.pro_id = pp.profile_id
  and pi.workspace_id is null;

update public.testimonials t
set workspace_id = w.id
from public.pro_profiles pp
join identity.identities i on i.auth_user_id = pp.profile_id
join workspace.memberships m on m.person_ref = i.person_ref
join workspace.workspaces w on w.id = m.workspace_id and w.type = 'professional' and m.role = 'owner'
where t.pro_id = pp.profile_id
  and t.workspace_id is null;

-- =========================================================================
-- OFFERING WORKSPACE GROUP — must run before nothing else in this file; quotes is a leaf.

update public.quotes q
set workspace_id = w.id
from identity.identities i
join workspace.memberships m on m.person_ref = i.person_ref
join workspace.workspaces w on w.id = m.workspace_id and w.type = 'professional' and m.role = 'owner'
where i.auth_user_id = q.pro_id
  and q.workspace_id is null;

-- =========================================================================
-- REQUESTING WORKSPACE GROUP — order matters within this group
--
-- The requesting workspace is always the customer's Personal Workspace, never whichever
-- workspace they might otherwise be acting from — PLATFORM_DOMAIN_MODEL.md §14.3's own
-- stated trade-off: "a person booking a plumber must implicitly be acting within their
-- Personal Workspace." There is no active-workspace selection yet (WP 03.09, WP 03.11), so
-- this is not a simplification of a richer rule — it is the rule, stated in the frozen
-- document this backfill is applying.

update public.service_requests sr
set workspace_id = w.id
from identity.identities i
join workspace.memberships m on m.person_ref = i.person_ref
join workspace.workspaces w on w.id = m.workspace_id and w.type = 'personal' and m.role = 'owner'
where i.auth_user_id = sr.customer_id
  and sr.workspace_id is null;

-- Depends on service_requests already being updated, above.
update public.service_request_photos srp
set workspace_id = sr.workspace_id
from public.service_requests sr
where srp.request_id = sr.id
  and srp.workspace_id is null
  and sr.workspace_id is not null;

-- Depends on service_requests. Home partition per the Crossing Registry
-- (DATABASE_ARCHITECTURE.md §6): "Conversation | The engagement or subject it is bound to."
update public.conversations c
set workspace_id = sr.workspace_id
from public.service_requests sr
where c.request_id = sr.id
  and c.workspace_id is null
  and sr.workspace_id is not null;

-- Depends on conversations, immediately above.
update public.messages msg
set workspace_id = c.workspace_id
from public.conversations c
where msg.conversation_id = c.id
  and msg.workspace_id is null
  and c.workspace_id is not null;

-- Independent of the request chain: reviews and reports resolve from their own author,
-- per WP 03.05's stated interpretation (not a frozen-document citation — see 0032's header).
update public.reviews r
set workspace_id = w.id
from identity.identities i
join workspace.memberships m on m.person_ref = i.person_ref
join workspace.workspaces w on w.id = m.workspace_id and w.type = 'personal' and m.role = 'owner'
where i.auth_user_id = r.customer_id
  and r.workspace_id is null;

update public.reports rp
set workspace_id = w.id
from identity.identities i
join workspace.memberships m on m.person_ref = i.person_ref
join workspace.workspaces w on w.id = m.workspace_id and w.type = 'personal' and m.role = 'owner'
where i.auth_user_id = rp.reporter_id
  and rp.workspace_id is null;

-- =========================================================================
-- OWNER'S PERSONAL WORKSPACE GROUP

update public.household_items hi
set workspace_id = w.id
from identity.identities i
join workspace.memberships m on m.person_ref = i.person_ref
join workspace.workspaces w on w.id = m.workspace_id and w.type = 'personal' and m.role = 'owner'
where i.auth_user_id = hi.owner_id
  and hi.workspace_id is null;
