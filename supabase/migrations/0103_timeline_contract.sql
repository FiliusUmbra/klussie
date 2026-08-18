-- Epic 15 WP02 — property.timeline_segment(): the chronological record of what has
-- happened to a property, scoped to the caller's own stewardship windows (roadmap §15,
-- DATABASE_ARCHITECTURE.md §25).
--
-- "A workspace may read the segment of a property's timeline that falls within its own
-- stewardship period" — §25's own sentence, taken literally. Two kinds of window, unioned:
-- the CURRENT one, if the caller is a live member of property.properties.steward_workspace_id
-- right now (open-ended, from steward_since); and any number of CLOSED ones, from
-- property.stewardship_periods, for periods the caller's own workspace held in the past. A
-- caller who has never stewarded this property resolves zero windows, which makes the
-- `exists` predicate below always false and the function return nothing — the same "no row,
-- full stop" shape property.resolve_property() (0041) already established for an
-- unauthorized id, reached the same way: by construction, not by a second check bolted on.
--
-- WHAT "BELONGS TO THIS PROPERTY" MEANS — SIX SUBJECT BRANCHES, EACH TRACED TO A REAL COLUMN
--
-- platform.events.subject_id is polymorphic by design (0021's own header: "points into eight
-- different engines' aggregates"). Resolving which subjects are this property's is six plain
-- joins, not one general mechanism, matching the reasoning 0102 already gives in full:
--   'property'      — p_property_id itself, directly (the property's own future events)
--   'asset'         — property.assets.property_id = p_property_id
--   'location'      — property.locations.property_id = p_property_id
--   'service_record'— work.service_records.property_id = p_property_id
--   'conversation'  — work.conversations bound (directly or through one hop) to this property:
--                      property_id direct, asset_id/maintenance_obligation_id resolving through
--                      property.assets/locations, or engagement_id resolving through
--                      work.engagements.request_id -> work.requests' own property_id/asset_id/
--                      location_id. workspace_id-bound conversations are not property-scoped
--                      at all and are correctly excluded by omission.
--   'message'       — work.messages.conversation_id in the resolved conversation set above
--
-- Document resolution is deliberately absent — see 0102's own header for both reasons (no
-- write contract exists yet to emit a document event, and the visibility-join warning on
-- property.document_attachments). Nothing here needs restating that reasoning a second time.
--
-- ORDERING — occurred_at, event_id, THE SAME PAIR THE PLATFORM'S OWN CURSOR INDEX USES
--
-- 0021's own comment: "occurred_at NOT an ordering field... Ordering is subject_sequence" —
-- true within one subject, but a timeline spans many subjects at once and there is no single
-- subject_sequence across them. events_cursor_idx (0021) already solves the cross-subject
-- case the same way a consumer reads forward: (occurred_at, event_id), the UUIDv7 supplying
-- the tiebreak for two events sharing a timestamp. Reused here, not invented.
--
-- NO PARTITION-PRUNING FILTER ON e.workspace_id, AND WHY THAT IS CORRECT, NOT AN OVERSIGHT
--
-- platform.events is hash-partitioned by workspace_id (0021 §12/§19). Adding `and
-- e.workspace_id = any(...)` restricted to the caller's own steward workspace(s) would prune
-- partitions and read less — but it would also be wrong: the workspace_id on an event is
-- whoever performed the action (e.g. a service record's performing workspace), not
-- necessarily the property's steward at that moment, and §25 scopes the timeline by *when*
-- something happened, not *who* did it. Filtering on it would silently drop real history. Left
-- unfiltered, matching §28's own accepted trade-off for the twin: "an assembly rather than a
-- fetch." A future narrow, materialised summary (§28's own permitted exception) is the correct
-- place to buy back performance if this ever needs it — not a correctness-losing shortcut here.
--
-- NO api.* DELEGATE — THE NINTH TIME THIS SESSION
--
-- Pure addition, same posture as every epic since 09: no client caller exists yet. Reachable
-- by nothing outside klussie_engine_property.

create or replace function property.timeline_segment(p_property_id uuid)
returns table (
  event_id      uuid,
  event_type    text,
  subject_type  text,
  subject_id    uuid,
  occurred_at   timestamptz,
  actor_type    platform.actor_type,
  actor_ref     text,
  payload       jsonb,
  correlation_id uuid
)
language sql
stable
set search_path = ''
as $$
  with my_windows as (
    select p.steward_workspace_id as workspace_id, p.steward_since as began_at, null::timestamptz as ended_at
    from property.properties p
    join workspace.current_memberships() m on m.workspace_id = p.steward_workspace_id
    where p.id = p_property_id

    union all

    select sp.workspace_id, sp.began_at, sp.ended_at
    from property.stewardship_periods sp
    join workspace.current_memberships() m on m.workspace_id = sp.workspace_id
    where sp.property_id = p_property_id
  ),
  property_assets as (
    select id from property.assets where property_id = p_property_id
  ),
  property_locations as (
    select id from property.locations where property_id = p_property_id
  ),
  property_obligations as (
    select id from work.maintenance_obligations
    where asset_id in (select id from property_assets)
       or location_id in (select id from property_locations)
  ),
  property_service_records as (
    select id from work.service_records where property_id = p_property_id
  ),
  property_conversations as (
    select c.id
    from work.conversations c
    left join work.engagements e on e.id = c.engagement_id
    left join work.requests r on r.id = e.request_id
    where c.property_id = p_property_id
       or c.asset_id in (select id from property_assets)
       or c.maintenance_obligation_id in (select id from property_obligations)
       or (
         c.engagement_id is not null
         and (
           r.property_id = p_property_id
           or r.asset_id in (select id from property_assets)
           or r.location_id in (select id from property_locations)
         )
       )
  ),
  property_messages as (
    select m.id from work.messages m where m.conversation_id in (select id from property_conversations)
  ),
  property_subjects as (
    select 'property'::text as subject_type, p_property_id as subject_id
    union all select 'asset', id from property_assets
    union all select 'location', id from property_locations
    union all select 'service_record', id from property_service_records
    union all select 'conversation', id from property_conversations
    union all select 'message', id from property_messages
  )
  select e.event_id, e.event_type, e.subject_type, e.subject_id, e.occurred_at,
         e.actor_type, e.actor_ref, e.payload, e.correlation_id
  from platform.events e
  join property_subjects ps
    on ps.subject_type = e.subject_type and ps.subject_id = e.subject_id
  where exists (
    select 1 from my_windows w
    where e.occurred_at >= w.began_at
      and (w.ended_at is null or e.occurred_at < w.ended_at)
  )
  order by e.occurred_at asc, e.event_id asc;
$$;

comment on function property.timeline_segment(uuid) is
  'The chronological record of what has happened to a property (DATABASE_ARCHITECTURE.md §25), scoped to the caller''s own current-or-past stewardship windows. Not SECURITY DEFINER, no api.* delegate yet — reachable only by klussie_engine_property. Reads platform.events directly per 0102''s own reasoning; never maintained separately.';

revoke all on function property.timeline_segment(uuid) from public, anon, authenticated, service_role;
grant execute on function property.timeline_segment(uuid) to klussie_engine_property;
