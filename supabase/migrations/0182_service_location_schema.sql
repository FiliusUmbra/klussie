-- Founder decision: every request requires a confirmed service location before submission,
-- and exact-address disclosure to a contractor requires the customer's own explicit,
-- visible approval -- never implicit on quote acceptance. Cutover-adjacent, not part of
-- the original 0018-0180 sequence; written and validated against the local rehearsal
-- (docs/operations/PRODUCTION_CUTOVER_0018_0180.md §15, if/when saved). Not applied
-- anywhere yet.
--
-- WHY THE ADDRESS LIVES ON property.properties AND access_instructions DOES NOT
--
-- Checked directly: property.properties' own existing RLS already reads
-- "steward_workspace_id in (my workspaces) or id in (api.current_property_scope())" --
-- exactly the two-tier boundary (owner, or a scoped contractor) this decision needs, with
-- zero new policy required for the address fields. access_instructions is deliberately
-- NOT here: it needs per-engagement lifecycle (set at appointment confirmation, cleared
-- after the engagement ends) that a permanent property column cannot give it without also
-- erasing the customer's own record of their own home -- see work.engagement_access_notes
-- below instead.
--
-- WHY THE ENGAGEMENT-CREATION GUARD IS A TRIGGER, NOT ONLY THE CALLING FUNCTION'S OWN CHECK
--
-- Per the founder's own instruction: no frontend-only security assumptions, and enforce
-- server-side/database. work.location_disclosures' own existence is both the audit record
-- (who approved, when -- no address column, so the address is never copied into an audit
-- trail) and the fact this trigger checks before any engagement may reach status = 'active'.

-- =========================================================================
-- 1 · PROPERTY ADDRESS + PRIVATE GEOCODING + QUOTE-PREP METADATA

alter table property.properties add column if not exists street text;
alter table property.properties add column if not exists house_number text;
alter table property.properties add column if not exists postcode text;
alter table property.properties add column if not exists municipality text;
alter table property.properties add column if not exists country text not null default 'BE';
-- Never selected by any pro-facing function -- exists only for server-side distance
-- banding (api.matching_requests_for_pro, next migration).
alter table property.properties add column if not exists latitude numeric(9,6);
alter table property.properties add column if not exists longitude numeric(9,6);
alter table property.properties add column if not exists property_type text;
alter table property.properties drop constraint if exists properties_property_type_check;
alter table property.properties add constraint properties_property_type_check
  check (property_type is null or property_type in ('apartment', 'house', 'commercial', 'other'));
-- Non-identifying, quote-prep-only. Distinct field from access_instructions -- this one is
-- safe for a quoting (not yet approved) professional to see; access_instructions never is.
alter table property.properties add column if not exists quote_prep_notes text;

-- =========================================================================
-- 2 · REQUEST-LEVEL BOOKKEEPING + THE NEW INTERMEDIATE STATUS

alter table work.requests add column if not exists location_selection_type text;
alter table work.requests drop constraint if exists requests_location_selection_type_check;
alter table work.requests add constraint requests_location_selection_type_check
  check (location_selection_type is null or location_selection_type in ('home', 'saved_property', 'one_time_address'));

alter table work.requests add column if not exists status_before_location_confirmation text;

alter table work.requests drop constraint requests_status_check;
alter table work.requests add constraint requests_status_check check (
  status = any (array[
    'collecting', 'quotes_ready', 'accepted_pending_location_approval',
    'booked', 'completed', 'reviewed', 'cancelled', 'location_confirmation_required'
  ])
);

-- work.accept_quote_for_caller() already opens the customer<->pro conversation
-- immediately at quote acceptance (checked directly: work.open_conversation_for_engagement()
-- only reads requesting_workspace_id/performing_workspace_id off the engagement row, not
-- its status) -- so the engagement row itself still needs to exist at acceptance time.
-- What changes is its status: an engagement is created 'pending_disclosure', not 'active',
-- and only the disclosure-approval step (next migration) flips it to 'active'. This is
-- the literal reading of the founder's own wording -- "the engagement cannot become
-- active" describes a real not-yet-active engagement, not a nonexistent one.
alter table work.engagements drop constraint engagements_status_check;
alter table work.engagements add constraint engagements_status_check check (
  status = any (array['pending_disclosure', 'active', 'completed', 'cancelled'])
);

-- =========================================================================
-- 3 · DISCLOSURE CONSENT — THE AUDIT RECORD AND THE ENFORCEMENT GATE, ONE TABLE
--
-- No address column here, ever -- this table IS the "audited without copying the address"
-- requirement. Its existence is what the engagement-activation trigger below checks.

create table if not exists work.location_disclosures (
  id uuid primary key,
  request_id uuid not null references work.requests (id),
  quote_id uuid not null references work.quotes (id),
  disclosing_workspace_id uuid not null references workspace.workspaces (id),
  receiving_workspace_id uuid not null references workspace.workspaces (id),
  approved_by uuid not null,
  approved_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (request_id, quote_id)
);

comment on table work.location_disclosures is
  'Founder decision: exact-address disclosure requires explicit customer approval, separate from and after quote acceptance. One row per approval -- the audit record (approved_by/approved_at) and the fact work.engagements'' own activation trigger checks for. Never carries address text.';

grant select on work.location_disclosures to authenticated;

alter table work.location_disclosures enable row level security;

drop policy if exists "workspace members can view own location disclosures" on work.location_disclosures;
create policy "workspace members can view own location disclosures"
  on work.location_disclosures for select
  to authenticated
  using (
    disclosing_workspace_id in (select workspace_id from api.current_workspace_memberships())
    or receiving_workspace_id in (select workspace_id from api.current_workspace_memberships())
  );

-- =========================================================================
-- 4 · ENGAGEMENT-SCOPED ACCESS INSTRUCTIONS — SEPARATE FROM THE PROPERTY, SEPARATE
-- FROM DISCLOSURE APPROVAL, OPTIONAL, CLEARED AFTER THE ENGAGEMENT ENDS

create table if not exists work.engagement_access_notes (
  engagement_id uuid primary key references work.engagements (id),
  access_instructions text,
  set_by uuid not null,
  set_at timestamptz not null default now(),
  cleared_at timestamptz
);

comment on table work.engagement_access_notes is
  'Founder decision: access instructions/entry codes require separate customer control from address disclosure itself, set at appointment confirmation, optional, cleared when the engagement ends. One row per engagement, never a property-level field.';

grant select on work.engagement_access_notes to authenticated;

alter table work.engagement_access_notes enable row level security;

drop policy if exists "active contractor can view own engagement's access notes" on work.engagement_access_notes;
create policy "active contractor can view own engagement's access notes"
  on work.engagement_access_notes for select
  to authenticated
  using (
    cleared_at is null
    and exists (
      select 1 from work.engagements e
      where e.id = engagement_access_notes.engagement_id
        and e.status = 'active'
        and e.performing_workspace_id in (select workspace_id from api.current_workspace_memberships())
    )
  );

drop policy if exists "requesting workspace can view own engagement's access notes" on work.engagement_access_notes;
create policy "requesting workspace can view own engagement's access notes"
  on work.engagement_access_notes for select
  to authenticated
  using (
    exists (
      select 1 from work.engagements e
      where e.id = engagement_access_notes.engagement_id
        and e.requesting_workspace_id in (select workspace_id from api.current_workspace_memberships())
    )
  );

-- =========================================================================
-- 5 · DATABASE ENFORCEMENT — NO FRONTEND-ONLY ASSUMPTION
--
-- An engagement may only ever reach status = 'active' when a matching disclosure-approval
-- record already exists. api.approve_location_disclosure() (next migration) creates both
-- in the same transaction, so this never blocks the real flow -- it exists to make any
-- other code path that tried to create an active engagement without approval fail loudly,
-- not silently succeed.

create or replace function work.engagements_guard_disclosure_before_active()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Only the transition INTO 'active' is guarded -- not every subsequent update to a row
  -- that happens to already be active. Without the tg_op/old.status check, this trigger
  -- would also fire on any ordinary update to an already-active engagement (e.g. a legacy
  -- row backfilled by 0089 before this feature existed, which has no disclosure record and
  -- never will) and permanently block it from ever being updated again -- checked directly
  -- against the local rehearsal's own 2 real pre-existing active engagements before this
  -- fix, confirmed to reproduce.
  if new.status = 'active'
     and (tg_op = 'INSERT' or old.status is distinct from 'active')
     and not exists (
       select 1 from work.location_disclosures d
       where d.request_id = new.request_id and d.quote_id = new.quote_id and d.revoked_at is null
     )
  then
    raise exception
      'work.engagements_guard_disclosure_before_active: engagement % (request %) cannot become active without an existing, unrevoked location disclosure', new.id, new.request_id
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists engagements_guard_disclosure_before_active on work.engagements;
create trigger engagements_guard_disclosure_before_active
  before insert or update on work.engagements
  for each row execute function work.engagements_guard_disclosure_before_active();

-- Revocation: cancellation revokes immediately. Completion also revokes immediately in
-- this design -- a grace period was considered and explicitly left open, not decided here
-- (plan §15.9 item 1); changing this later is a one-line condition edit to this function.

create or replace function work.engagements_revoke_access_on_terminal_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('cancelled', 'completed') and old.status = 'active' then
    update workspace.memberships
    set state = 'ended', updated_at = now()
    where granting_engagement_id = new.id and state = 'active';

    update work.engagement_access_notes
    set access_instructions = null, cleared_at = now()
    where engagement_id = new.id and cleared_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists engagements_revoke_access_on_terminal_status on work.engagements;
create trigger engagements_revoke_access_on_terminal_status
  after update on work.engagements
  for each row execute function work.engagements_revoke_access_on_terminal_status();
