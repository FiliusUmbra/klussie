-- Pro Workspace remarks, 2026-09-12 (Theme E): "Diensten die je aanbiedt zou wederom een
-- dialog venster moeten zijn met drop down, deze selectie zou veel uitgebreider moeten
-- worden mits Klussie niet is gebonden aan een paar categorieën, mocht de categorie niet
-- bestaan, dan kan deze worden aangemaakt en door de Klussie AI herkend/gecategoriseerd."
-- ("...should the service not exist, it can be created and recognized/categorized by the
-- Klussie AI.") The write contract behind that: a pro describes a service in their own
-- words; the AI either matches an existing public.services row (handled entirely
-- client-side, no schema needed) or proposes a genuinely new one, which lands here for a
-- real operator to approve before it is ever a real, searchable catalog entry.
--
-- SCOPE, DELIBERATELY: A NEW public.services ROW UNDER AN EXISTING public.categories ROW
-- — NEVER A NEW TOP-LEVEL CATEGORY
--
-- The remark's own Dutch reads "categorie" but the actual friction it names is a pro
-- wanting to offer something not in the current, short services list — the same list
-- public.pro_services rows attach to (0001). A genuinely new top-level category (a new
-- icon, a new grouping in Ontdekken/Home's own intent chips) is a materially bigger,
-- rarer, more human-judgment-heavy decision than "this one service didn't exist yet" —
-- left for an operator to do by hand via its own migration if it ever really comes up,
-- not automated in this first slice.
--
-- OPERATOR APPROVAL REQUIRED — SAME REASONING PROVIDER SOURCING (0216) ALREADY ESTABLISHED
--
-- A pro's own free-text description, run through an AI classifier, becoming an
-- instantly-live, customer-searchable catalog entry with zero human review is exactly
-- the kind of platform-wide, hard-to-undo state change this codebase does not default
-- to automating (PLATFORM_DOMAIN_MODEL.md §14.4's own "automation beyond ordinary
-- matching requires the customer's own explicit opt-in, never a silent platform
-- default" — the same principle 0216's own header already applied to sourcing).
--
-- MATCHES NEVER CREATE A ROW HERE
--
-- api/suggest-service.js's own AI call, given the existing catalog, either returns a
-- matchedServiceId (handled by the client exactly like any other pro_services write,
-- src/lib/pros.js's own existing updateProServices() — no new schema, no approval, no
-- suggestion) or proposes something new. A suggestion row therefore only ever represents
-- a genuinely new service, never an already-existing one waiting on a decision that was
-- never really in question.
--
-- TRANSLATIONS ARE GENERATED ONCE, AT SUGGESTION TIME, NOT LAZILY PER VIEWER
--
-- Message translation (translate-message.js, 0009) is lazy and per-viewer, the right
-- shape for a live conversation. A catalog entry's own name/blurb is shared, static
-- content every customer in every locale reads the same way the moment it exists —
-- api/suggest-service.js's own second AI step (this migration's own header on the
-- serverless side) produces all ten locales up front, stored as translations jsonb here,
-- so the operator reviews (and approves) the exact copy that goes live, in every
-- language, in one decision — never nine separate, uncoordinated ones.

create schema if not exists catalog;

create table catalog.service_suggestions (
  id                 uuid        not null,

  -- Same durability argument as workspace.memberships.person_ref (0030) and workspace.
  -- join_requests.person_ref (0220) — survives the suggesting person's own erasure.
  suggested_by       uuid        not null,
  workspace_id       uuid        not null
                     references workspace.workspaces (id),

  raw_description    text        not null,
  -- The locale the pro was actually using when they typed raw_description — the source
  -- of truth proposed_name/proposed_blurb are written in; the other nine locales live in
  -- `translations` below. Same eight-then-widened-to-ten set 0017 already established
  -- for category_translations/service_translations, so a suggestion can only ever
  -- target a locale the catalog itself can actually hold once approved.
  locale             text        not null
                     check (locale in ('nl','fr','de','en','es','ar','fa','tr','ru','zh')),

  category_id        text        not null
                     references public.categories (id),
  proposed_name      text        not null,
  proposed_blurb     text        not null,
  proposed_mode      text        not null check (proposed_mode in ('book','quote')),
  proposed_base_price numeric(10,2) not null,
  ai_confidence      numeric,

  -- {"<locale>": {"name": "...", "blurb": "..."}, ...} for every locale except `locale`
  -- itself (that one already has its own proposed_name/proposed_blurb columns, the
  -- pro's own original words — never round-tripped back through translation).
  translations       jsonb       not null default '{}'::jsonb,

  status             text        not null default 'pending'
                     check (status in ('pending', 'approved', 'rejected')),
  decided_at         timestamptz,
  decided_by         uuid,
  decision_note      text,
  -- Set only on approval, to the public.services row this suggestion became — never
  -- reused across two approvals, never set on a rejection.
  resulting_service_id uuid      references public.services (id),

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint service_suggestions_pkey primary key (id),
  constraint service_suggestions_decided_fields_consistent check (
    (status = 'pending' and decided_at is null and decided_by is null and resulting_service_id is null)
    or (status = 'rejected' and decided_at is not null and decided_by is not null and resulting_service_id is null)
    or (status = 'approved' and decided_at is not null and decided_by is not null and resulting_service_id is not null)
  )
);

create index if not exists service_suggestions_status_idx
  on catalog.service_suggestions (status, created_at);

comment on table catalog.service_suggestions is
  'A pro''s free-text description of a service the current catalog has no match for, the AI''s own proposed name/category/price/translations, and a real operator''s eventual decision (Pro Workspace remarks, 2026-09-12, Theme E). Never created for a description the AI matched to an existing public.services row -- see this migration''s own header. Rows are never deleted or mutated after a decision (the decided_fields_consistent check).';
comment on column catalog.service_suggestions.translations is
  'Locale -> {name, blurb} for every one of the ten locales except `locale` itself (the pro''s own original words, held in proposed_name/proposed_blurb). Generated once, at suggestion time, by api/suggest-service.js''s own second AI step -- never lazily per viewer, since a catalog entry is shared, static content every customer reads the same way.';

alter table catalog.service_suggestions enable row level security;
revoke all on catalog.service_suggestions from anon, authenticated, service_role;

-- =========================================================================
-- 1 · catalog.suggest_service_for_caller() — a pro submits a genuinely new proposal

create or replace function catalog.suggest_service_for_caller(
  p_suggestion_id      uuid,
  p_workspace_id       uuid,
  p_raw_description    text,
  p_locale             text,
  p_category_id        text,
  p_proposed_name      text,
  p_proposed_blurb     text,
  p_proposed_mode      text,
  p_proposed_base_price numeric,
  p_ai_confidence      numeric,
  p_translations       jsonb,
  p_event_id           uuid,
  p_correlation_id     uuid,
  p_actor_type         platform.actor_type,
  p_actor_ref          text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_person_ref uuid;
begin
  select i.person_ref into v_person_ref
  from identity.identities i
  where i.auth_user_id = auth.uid()
    and i.erased_at is null;

  if v_person_ref is null then
    raise exception
      'catalog.suggest_service_for_caller: no real identity for the caller'
      using errcode = 'insufficient_privilege';
  end if;

  -- The caller must be a real, active member of the workspace they're suggesting a
  -- service for -- the same "who am I acting as" check every other real write in this
  -- codebase already makes, never trusting p_workspace_id alone.
  if not exists (
    select 1 from workspace.current_memberships() m where m.workspace_id = p_workspace_id
  ) then
    raise exception 'catalog.suggest_service_for_caller: caller is not a member of %', p_workspace_id
      using errcode = 'insufficient_privilege';
  end if;

  insert into catalog.service_suggestions (
    id, suggested_by, workspace_id, raw_description, locale, category_id,
    proposed_name, proposed_blurb, proposed_mode, proposed_base_price, ai_confidence, translations
  )
  values (
    p_suggestion_id, v_person_ref, p_workspace_id, p_raw_description, p_locale, p_category_id,
    p_proposed_name, p_proposed_blurb, p_proposed_mode, p_proposed_base_price, p_ai_confidence, p_translations
  );

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'catalog.service.suggested',
    p_workspace_id   => p_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'service_suggestion',
    p_subject_id     => p_suggestion_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('categoryId', p_category_id, 'proposedName', p_proposed_name)
  );
end;
$$;

comment on function catalog.suggest_service_for_caller(uuid, uuid, text, text, text, text, text, text, numeric, numeric, jsonb, uuid, uuid, platform.actor_type, text) is
  'Records a pro''s own proposed new service, pending operator review. Resolves person_ref from auth.uid() itself, never a parameter; refuses a caller who is not a real member of p_workspace_id. Emits catalog.service.suggested. Not SECURITY DEFINER, granted to nobody, reachable only from api.suggest_service().';

revoke all on function catalog.suggest_service_for_caller(uuid, uuid, text, text, text, text, text, text, numeric, numeric, jsonb, uuid, uuid, platform.actor_type, text)
  from public, anon, authenticated, service_role;

-- =========================================================================
-- 2 · catalog.list_service_suggestions_for_caller() — the operator's own queue
--
-- SAME TWO-LAYER SHAPE AS 0180's OWN activation_ratios_for_caller()/api.activation_ratios(),
-- AND 0216's OWN provider.record_sourced_leads_for_caller() FOR THE PERMISSION CHECK
--
-- Plain logic in the engine schema, checking the same "real, active membership in a
-- workspace holding platform_operations" predicate every operator-only path in this
-- codebase already uses, excluding support-only grants (0179's own write-path role audit)
-- because deciding a suggestion is a write even though listing them, here, is read-only —
-- the same restraint applied consistently rather than only where a write literally occurs
-- in this one function.

create or replace function catalog.list_service_suggestions_for_caller()
returns table (
  suggestion_id     uuid,
  workspace_id      uuid,
  workspace_name    text,
  raw_description   text,
  locale            text,
  category_id       text,
  proposed_name     text,
  proposed_blurb    text,
  proposed_mode     text,
  proposed_base_price numeric,
  ai_confidence     numeric,
  translations      jsonb,
  created_at        timestamptz
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from workspace.current_memberships() m
    where workspace.workspace_has_capability(m.workspace_id, 'platform_operations')
      and m.role <> 'support'
  ) then
    raise exception 'catalog.list_service_suggestions_for_caller: caller lacks platform_operations'
      using errcode = 'insufficient_privilege';
  end if;

  return query
    select s.id, s.workspace_id, w.name, s.raw_description, s.locale, s.category_id,
           s.proposed_name, s.proposed_blurb, s.proposed_mode, s.proposed_base_price,
           s.ai_confidence, s.translations, s.created_at
    from catalog.service_suggestions s
    join workspace.workspaces w on w.id = s.workspace_id
    where s.status = 'pending'
    order by s.created_at asc;
end;
$$;

comment on function catalog.list_service_suggestions_for_caller() is
  'The pending service suggestions for a real operator to review, oldest first. Restricted to a real, active membership in a workspace holding platform_operations, excluding support-only grants. Not SECURITY DEFINER, granted to nobody, reachable only from api.list_service_suggestions().';

revoke all on function catalog.list_service_suggestions_for_caller()
  from public, anon, authenticated, service_role;

-- =========================================================================
-- 3 · catalog.decide_service_suggestion_for_caller() — approve or reject
--
-- APPROVAL DOES THREE REAL WRITES IN ONE TRANSACTION, NEVER LEAVING A HALF-CREATED SERVICE
--
-- public.services (the new row itself) + public.service_translations (all ten locales:
-- the pro's own original plus the nine generated ones) + public.pro_services (the
-- suggesting pro's own workspace immediately offers what they asked to offer -- the
-- entire reason they suggested it in the first place, not a service that exists but
-- nobody yet provides).

create or replace function catalog.decide_service_suggestion_for_caller(
  p_suggestion_id  uuid,
  p_decision       text,
  p_decision_note  text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_decider_person_ref uuid;
  v_suggestion         catalog.service_suggestions;
  v_locale             text;
  v_translation        jsonb;
  v_new_service_id     uuid;
  -- pro_profiles.profile_id (and so public.pro_services.pro_id, 0001) is keyed by
  -- auth.users.id, NOT identity.identities.person_ref -- the two identifiers this
  -- codebase has held apart since Epic 02 introduced person_ref as its own, separate
  -- concept (SYSTEM_ARCHITECTURE.md §6.1). v_suggestion.suggested_by is a person_ref
  -- (matching workspace.memberships.person_ref/workspace.join_requests.person_ref's own
  -- durability argument); resolved back to the one real auth_user_id it belongs to
  -- before it can ever be written into a pro_id column.
  v_suggesting_auth_user_id uuid;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'catalog.decide_service_suggestion_for_caller: % is not a real decision', p_decision
      using errcode = 'invalid_parameter_value';
  end if;

  select i.person_ref into v_decider_person_ref
  from identity.identities i
  where i.auth_user_id = auth.uid()
    and i.erased_at is null;

  if v_decider_person_ref is null then
    raise exception
      'catalog.decide_service_suggestion_for_caller: no real identity for the caller'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1
    from workspace.current_memberships() m
    where workspace.workspace_has_capability(m.workspace_id, 'platform_operations')
      and m.role <> 'support'
  ) then
    raise exception 'catalog.decide_service_suggestion_for_caller: caller lacks platform_operations'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_suggestion from catalog.service_suggestions where id = p_suggestion_id for update;

  if v_suggestion is null then
    raise exception 'catalog.decide_service_suggestion_for_caller: % is not a real suggestion', p_suggestion_id
      using errcode = 'invalid_parameter_value';
  end if;

  if v_suggestion.status <> 'pending' then
    raise exception 'catalog.decide_service_suggestion_for_caller: % was already decided', p_suggestion_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if p_decision = 'approved' then
    select i.auth_user_id into v_suggesting_auth_user_id
    from identity.identities i
    where i.person_ref = v_suggestion.suggested_by
      and i.erased_at is null;

    if v_suggesting_auth_user_id is null then
      raise exception 'catalog.decide_service_suggestion_for_caller: suggesting person % has no live identity to attach pro_services to', v_suggestion.suggested_by
        using errcode = 'object_not_in_prerequisite_state';
    end if;

    -- public.services.id keeps its own pre-ADR-0022 default (gen_random_uuid(), 0001) --
    -- this table has never taken a client-supplied id, and there is no reason to make it
    -- the first to.
    insert into public.services (category_id, mode, base_price, certified_only, active)
    values (v_suggestion.category_id, v_suggestion.proposed_mode, v_suggestion.proposed_base_price, false, true)
    returning id into v_new_service_id;

    insert into public.service_translations (service_id, locale, name, blurb)
    values (v_new_service_id, v_suggestion.locale, v_suggestion.proposed_name, v_suggestion.proposed_blurb);

    for v_locale, v_translation in select * from jsonb_each(v_suggestion.translations)
    loop
      insert into public.service_translations (service_id, locale, name, blurb)
      values (v_new_service_id, v_locale, v_translation->>'name', v_translation->>'blurb');
    end loop;

    insert into public.pro_services (pro_id, service_id, workspace_id)
    values (v_suggesting_auth_user_id, v_new_service_id, v_suggestion.workspace_id);

    update catalog.service_suggestions
    set status = 'approved', decided_at = now(), decided_by = v_decider_person_ref,
        decision_note = p_decision_note, resulting_service_id = v_new_service_id, updated_at = now()
    where id = p_suggestion_id;
  else
    update catalog.service_suggestions
    set status = 'rejected', decided_at = now(), decided_by = v_decider_person_ref,
        decision_note = p_decision_note, updated_at = now()
    where id = p_suggestion_id;
  end if;
end;
$$;

comment on function catalog.decide_service_suggestion_for_caller(uuid, text, text) is
  'Approves or rejects a pending service suggestion. Refuses a caller without platform_operations, excluding support-only grants, or a suggestion already decided. On approval, resolves the suggesting person''s own real auth_user_id (person_ref and pro_services.pro_id are different identifier spaces, see this function''s own declare block), creates the real public.services row (its own pre-ADR-0022 gen_random_uuid() default, never a client-supplied id), all ten locales of public.service_translations (the pro''s own original plus the nine AI-generated ones), and links the suggesting pro''s own workspace via public.pro_services -- three writes, one transaction, never a half-created service. Not SECURITY DEFINER, granted to nobody, reachable only from api.decide_service_suggestion().';

revoke all on function catalog.decide_service_suggestion_for_caller(uuid, text, text)
  from public, anon, authenticated, service_role;

-- =========================================================================
-- 4 · api.* delegates

create or replace function api.suggest_service(
  p_suggestion_id      uuid,
  p_workspace_id       uuid,
  p_raw_description    text,
  p_locale             text,
  p_category_id        text,
  p_proposed_name      text,
  p_proposed_blurb     text,
  p_proposed_mode      text,
  p_proposed_base_price numeric,
  p_ai_confidence      numeric,
  p_translations       jsonb,
  p_event_id           uuid,
  p_correlation_id     uuid,
  p_actor_type         platform.actor_type,
  p_actor_ref          text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select catalog.suggest_service_for_caller(
    p_suggestion_id, p_workspace_id, p_raw_description, p_locale, p_category_id,
    p_proposed_name, p_proposed_blurb, p_proposed_mode, p_proposed_base_price,
    p_ai_confidence, p_translations, p_event_id, p_correlation_id, p_actor_type, p_actor_ref
  );
$$;

comment on function api.suggest_service(uuid, uuid, text, text, text, text, text, text, numeric, numeric, jsonb, uuid, uuid, platform.actor_type, text) is
  'Delegate for catalog.suggest_service_for_caller() (ADR-0026''s split).';

create or replace function api.list_service_suggestions()
returns table (
  suggestion_id     uuid,
  workspace_id      uuid,
  workspace_name    text,
  raw_description   text,
  locale            text,
  category_id       text,
  proposed_name     text,
  proposed_blurb    text,
  proposed_mode     text,
  proposed_base_price numeric,
  ai_confidence     numeric,
  translations      jsonb,
  created_at        timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from catalog.list_service_suggestions_for_caller();
$$;

comment on function api.list_service_suggestions() is
  'Delegate for catalog.list_service_suggestions_for_caller() (ADR-0026''s split).';

create or replace function api.decide_service_suggestion(
  p_suggestion_id  uuid,
  p_decision       text,
  p_decision_note  text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select catalog.decide_service_suggestion_for_caller(p_suggestion_id, p_decision, p_decision_note);
$$;

comment on function api.decide_service_suggestion(uuid, text, text) is
  'Delegate for catalog.decide_service_suggestion_for_caller() (ADR-0026''s split).';

revoke all on function api.suggest_service(uuid, uuid, text, text, text, text, text, text, numeric, numeric, jsonb, uuid, uuid, platform.actor_type, text) from public, anon, service_role;
revoke all on function api.list_service_suggestions() from public, anon, service_role;
revoke all on function api.decide_service_suggestion(uuid, text, text) from public, anon, service_role;

grant execute on function api.suggest_service(uuid, uuid, text, text, text, text, text, text, numeric, numeric, jsonb, uuid, uuid, platform.actor_type, text) to authenticated;
grant execute on function api.list_service_suggestions() to authenticated;
grant execute on function api.decide_service_suggestion(uuid, text, text) to authenticated;
