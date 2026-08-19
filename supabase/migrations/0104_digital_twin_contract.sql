-- Epic 15 WP03 — property.assemble_twin(): the narrow summary composition
-- DATABASE_ARCHITECTURE.md §28 names as the only thing about the Digital Twin that may ever
-- be materialised.
--
-- THE TWIN ITSELF IS NOT BUILT HERE, AND THAT IS THE POINT
--
-- §28: "The Digital Twin is not materialised. It is the name for the composition of
-- aggregates and projections that already exist. Nothing is stored *as* a twin." The full
-- twin — every location, every asset, every document, nested — is what a client already
-- assembles today by calling property.my_assets()/property.my_documents()/etc. independently;
-- nothing about that composition belongs inside this engine, and duplicating it here would be
-- exactly the "second copy that must be kept in sync" §28 calls "a direct violation of
-- Principle 1 and Principle 9."
--
-- What §28 DOES permit: "small summary projections where a composition is expensive and
-- frequently read — a property's current condition summary, an asset count by type, an
-- outstanding-obligation roll-up." Five counts, each a real live aggregate over a real table,
-- named here almost verbatim from that sentence. Nothing nested, nothing nam ing a source it
-- does not immediately requery — nothing this function returns is itself a second copy of any
-- row; every field is either the property's own or a `count(*)`.
--
-- CURRENT STATE, NOT A STEWARDSHIP-WINDOW SEGMENT — THE DELIBERATE DIFFERENCE FROM TIMELINE
--
-- §28 describes the twin as "the platform's evolving representation of a real property" —
-- present tense, one current view, not a historical record split by who stewarded what when.
-- WP 15.02's timeline_segment() is deliberately the one that carries stewardship-window
-- scoping; this function instead uses the exact same live-membership join
-- property.resolve_property() (0041) already uses — only the CURRENT steward's members may
-- resolve a twin, matching "evolving representation" being inherently a present-tense concept
-- a past steward has no ongoing claim to (their own claim is to their timeline segment, which
-- WP 15.02 already serves them).
--
-- FIVE COUNTS, FIVE SOURCES, EACH NAMED
--
-- property.locations / property.assets — this engine's own schema, no grant needed.
-- property.document_attachments — this engine's own schema; counting attachment ROWS the
--   current steward already has full legitimate access to (no third-party visibility
--   decision is being made — see 0102's own document_attachments caveat, which is about a
--   different concern entirely: granting access to someone who does not have it).
-- work.maintenance_obligations (0102's grant) — open ones only, resolved through
--   property.assets/property.locations, the identical join WP 15.02 uses for the same purpose.
-- work.service_records (0102's grant) — every record homed to this property, direct.
--
-- NO api.* DELEGATE — THE TENTH TIME THIS SESSION
--
-- Pure addition, same posture as every epic since 09.

create or replace function property.assemble_twin(p_property_id uuid)
returns table (
  property_id                         uuid,
  name                                 text,
  jurisdiction                         text,
  steward_workspace_id                 uuid,
  steward_since                        timestamptz,
  location_count                       bigint,
  asset_count                          bigint,
  document_count                       bigint,
  open_maintenance_obligation_count    bigint,
  service_record_count                 bigint
)
language sql
stable
set search_path = ''
as $$
  select
    p.id,
    p.name,
    p.jurisdiction,
    p.steward_workspace_id,
    p.steward_since,
    (select count(*) from property.locations l where l.property_id = p.id),
    (select count(*) from property.assets a where a.property_id = p.id),
    (select count(*) from property.document_attachments da
       where da.property_id = p.id
          or da.location_id in (select id from property.locations where property_id = p.id)
          or da.asset_id in (select id from property.assets where property_id = p.id)),
    (select count(*) from work.maintenance_obligations mo
       where mo.status = 'open'
         and (
           mo.asset_id in (select id from property.assets where property_id = p.id)
           or mo.location_id in (select id from property.locations where property_id = p.id)
         )),
    (select count(*) from work.service_records sr where sr.property_id = p.id)
  from property.properties p
  join workspace.current_memberships() m on m.workspace_id = p.steward_workspace_id
  where p.id = p_property_id;
$$;

comment on function property.assemble_twin(uuid) is
  'The narrow summary composition §28 permits to be materialised — five live counts, nothing nested, nothing duplicated. The twin itself stays unmaterialised (§28); this is not it, only the roll-up a client would otherwise assemble from five separate calls. Current-steward view only, not stewardship-window-scoped (deliberate — see this migration''s own header for why that differs from timeline_segment()). Not SECURITY DEFINER, no api.* delegate yet — reachable only by klussie_engine_property.';

revoke all on function property.assemble_twin(uuid) from public, anon, authenticated, service_role;
grant execute on function property.assemble_twin(uuid) to klussie_engine_property;
