-- Epic 07 WP02 — the facet system: how one engine serves a dishwasher and a production
-- line.
--
-- DATABASE_ARCHITECTURE.md §14, rule 6: "A facet's attributes are declared, not
-- free-form... held as platform-scoped configuration." SYSTEM_ARCHITECTURE.md §7.3: "One
-- engine serves a dishwasher and a production line — the platform's clearest test of One
-- Engine."
--
-- TWO TABLES, THE SAME SHAPE ADR-0027's ROLE_PERMISSIONS ALREADY ESTABLISHED
--
-- property.facet_types is configuration, not an aggregate — the same class as
-- workspace.role_permissions (migration 0036): nothing references a row by identity, only
-- by its own key, and a natural primary key is correct for exactly the reason that
-- migration's own header gives. property.asset_facets is a real aggregate — SYSTEM_
-- ARCHITECTURE.md §7.3 names FacetAdded and FacetUpdated as real events, so a facet
-- instance gets a genuine UUIDv7 identity like every other aggregate in this schema, not a
-- composite key.
--
-- NO SEEDED FACET TYPES — DELIBERATELY
--
-- Nothing in the current product needs a vehicle facet, an HVAC facet, or a compliance
-- facet — no such asset exists yet. Seeding one now, with no real requirement behind it,
-- would be exactly the speculative structure ADR-0010 rules out. The catalog exists,
-- empty, the same "add without populating" shape every table in this platform starts with.
--
-- VALIDATION IS A TRIGGER, NOT A CHECK CONSTRAINT
--
-- A `jsonb` column's keys cannot be validated against another table's row inside a `CHECK`
-- constraint — `CHECK` expressions cannot reference other tables. A `BEFORE INSERT OR
-- UPDATE` trigger is the only mechanism available, and it checks *keys* only: rule 6 asks
-- for declared attributes, and a first pass that refuses an unknown key already delivers
-- the property that matters most — nothing can smuggle an attribute the platform cannot
-- search, aggregate or reason over (§14's own justification for the rule). Validating
-- declared *value types* as well is a real refinement with no real facet type yet to prove
-- it against; left to whichever epic adds the first one.
--
-- jsonb's `?` (key-exists) operator is core PostgreSQL, not an extension — unlike ltree
-- (migration 0046's own finding), it needs no schema qualification to resolve under
-- `set search_path = ''`, because it lives in `pg_catalog`, always implicitly searched.

-- =========================================================================
-- FACET TYPES — the declared catalog

create table if not exists property.facet_types (
  -- A short, stable code (e.g. 'vehicle', 'hvac') — matched by application code, so it is
  -- the key, not a surrogate id, the same posture workspace.role_permissions holds.
  facet_type_key       text        not null,

  -- Attribute name -> declared type name (e.g. {"registration": "text", "odometer":
  -- "integer"}) — a schema DESCRIPTION, not the data itself. Value TYPES are declared but
  -- not yet enforced (see this migration's header); the key set is what the trigger below
  -- checks.
  declared_attributes  jsonb       not null default '{}'::jsonb,

  created_at           timestamptz not null default now(),

  constraint facet_types_pkey primary key (facet_type_key)
);

comment on table property.facet_types is
  'The declared facet-type catalog (DATABASE_ARCHITECTURE.md §14 rule 6) — platform-scoped configuration, not an aggregate, the same class as workspace.role_permissions. Empty: no facet type is seeded, deliberately (this migration''s own header).';
comment on column property.facet_types.declared_attributes is
  'Attribute name -> declared type name. Describes the shape property.asset_facets.attributes must have for this facet type; enforced for key presence by a trigger (property.asset_facets_validate_attributes), not yet for value types.';

alter table property.facet_types enable row level security;

-- =========================================================================
-- ASSET FACETS — one row per asset per facet type it carries

create table if not exists property.asset_facets (
  id              uuid        not null,

  asset_id        uuid        not null
                  references property.assets (id),

  facet_type_key  text        not null
                  references property.facet_types (facet_type_key),

  attributes      jsonb       not null default '{}'::jsonb,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint asset_facets_pkey primary key (id),
  -- Rule 1 (§14): "A facet extends an asset. It never replaces or shadows one" — and an
  -- asset carries at most one instance of a given facet type, not several competing ones.
  constraint asset_facets_unique_per_type unique (asset_id, facet_type_key)
);

create index if not exists asset_facets_asset_id_idx on property.asset_facets (asset_id);

comment on table property.asset_facets is
  'A facet extends an asset with typed, declared attributes (DATABASE_ARCHITECTURE.md §14) — never replaces the core. Attribute keys are validated against property.facet_types.declared_attributes on write.';

alter table property.asset_facets enable row level security;

-- =========================================================================
-- VALIDATION — declared keys only, enforced on every write

create or replace function property.asset_facets_validate_attributes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_declared     jsonb;
  v_unknown_keys text[];
begin
  select declared_attributes into v_declared
  from property.facet_types
  where facet_type_key = new.facet_type_key;

  if v_declared is null then
    raise exception 'facet type % is not declared in property.facet_types', new.facet_type_key;
  end if;

  select pg_catalog.array_agg(k) into v_unknown_keys
  from pg_catalog.jsonb_object_keys(new.attributes) as k
  where not (v_declared ? k);

  if v_unknown_keys is not null then
    raise exception
      'asset_facets row for asset % carries undeclared attribute(s) % for facet type % — declare them in property.facet_types first',
      new.asset_id, pg_catalog.array_to_string(v_unknown_keys, ', '), new.facet_type_key;
  end if;

  return new;
end;
$$;

comment on function property.asset_facets_validate_attributes() is
  'Refuses an attribute key not declared for the row''s facet type (DATABASE_ARCHITECTURE.md §14 rule 6). Checks key presence only, not declared value types — see this migration''s header.';

drop trigger if exists asset_facets_validate on property.asset_facets;
create trigger asset_facets_validate
  before insert or update on property.asset_facets
  for each row execute function property.asset_facets_validate_attributes();

-- =========================================================================
-- ACCESS

grant update on property.asset_facets to klussie_engine_property;
-- facet_types is configuration written by nobody yet — the default SELECT+INSERT is
-- already more than anything needs until a real facet type is added, which is a decision
-- for whichever epic adds one, not a standing write path.

revoke all on property.facet_types from anon, authenticated, service_role;
revoke all on property.asset_facets from anon, authenticated, service_role;
