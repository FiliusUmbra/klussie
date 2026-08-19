-- Platform Activation Slice 1, WP 1.1a — Workspace lookup, the read-only half.
--
-- Per PLATFORM_ACTIVATION_PROGRAMME.md's own Slice 1 entry: "Workspace lookup's
-- read-only half ships alongside this slice... its access-request half waits for
-- Slice 0 to be fully proven in production first." This is that half:
-- platform.search_workspaces() / api.search_workspaces(), a name/owner/property/id
-- search returning a workspace's own profile — capabilities held, membership count,
-- property count, most recent audit activity.
--
-- SAME TWO-LAYER SHAPE, SAME GATE, AS 0133's list_audit_records() — SEE ITS OWN HEADER
--
-- Plain SECURITY INVOKER logic in `platform` (owned by klussie_engine_platform, the
-- same role Audit and Administration are both named under, ROLES.md §2.1); a thin
-- SECURITY DEFINER delegate in `api` is what `authenticated` actually calls.
-- "An operator" is the identical composed check 0133/0134 already established — a real,
-- active membership (workspace.current_memberships()) in a workspace holding
-- platform_operations (workspace.workspace_has_capability()) — an EXISTS predicate in
-- the WHERE clause, never a raised exception, so a non-operator caller gets zero rows,
-- the same as every other read switch in this codebase. This is that composed check's
-- SECOND real caller, per WP 1.1a's own note in SLICE_1_PROPERTY_ASSET_ACTIVATION.md.
--
-- JOINING identity.identities NEEDS NO NEW GRANT — workspace.current_memberships()
-- (0031) ALREADY DOES THIS, IN PRODUCTION, SINCE EPIC 03
--
-- The identity -> membership join below (resolving an owner's name and email) is the
-- exact chain workspace.current_memberships() and workspace.resolve_public_professional_
-- workspace() (0065) already perform from plain functions owned by an engine role, with
-- no explicit `grant select on identity.identities` to that role anywhere in this
-- codebase. Reached only via a SECURITY DEFINER api.* delegate, the executing privilege
-- for the whole call — including every nested plain-SQL call inside it — is the
-- delegate's own owner (the migration runner), not the schema-owning engine role; 0065's
-- own comment history already established this is sufficient, and this migration adds
-- no grant for the identical reason.
--
-- TWO WORDS IN THE PROGRAMME'S OWN SPEC DO NOT MAP TO A REAL COLUMN — NAMED HONESTLY,
-- NOT INVENTED
--
-- "Property-address" and "tier": property.properties (0039) has no address column at
-- all -- name (free text, "My Home") and jurisdiction are the only two facts about a
-- property this schema records, so the search below matches a property's *name*, not an
-- address that does not exist. "Tier" names no real column or concept anywhere in the
-- Capability engine (0075/0077) -- capabilities are granular grants, not bundled
-- packages with a tier label. What ships here is capability_keys, a real array of every
-- capability_key currently granted and not withdrawn -- the literal fact the schema
-- holds, not a summary word invented to match the Programme's own draft language.
--
-- SEARCH TERM MATCHED AS TEXT, NEVER CAST TO uuid
--
-- w.id::text = p_query, not p_query::uuid = w.id -- an operator typing a name, not an
-- id, must not raise "invalid input syntax for type uuid" and abort the whole query.
-- Casting the column to text is the only direction that tolerates arbitrary input.
--
-- LAST ACTIVITY READS platform.audit_records DIRECTLY, GATED BY THE SAME EXISTS
-- PREDICATE THIS FUNCTION ALREADY APPLIES TO ITSELF -- NO NEW EXPOSURE
--
-- Identical table, identical caller population (an already-proven operator) as
-- platform.list_audit_records() (0133) reads in full; this reads only max(occurred_at)
-- per workspace, a strict narrowing, not a widening, of what an operator can already see.
--
-- AN EMPTY OR NULL QUERY RETURNS THE MOST RECENTLY CREATED WORKSPACES, NOT ZERO ROWS
--
-- Matching AuditLog's own "no filters given" behaviour (0133) -- a browse view, not
-- only a search box, since an operator arriving with no specific lead still needs
-- somewhere to start.

-- =========================================================================
-- THE LOGIC

create or replace function platform.search_workspaces(
  p_query   text    default null,
  p_limit   integer default 20,
  p_offset  integer default 0
)
returns table (
  workspace_id      uuid,
  workspace_name    text,
  workspace_type    text,
  created_at        timestamptz,
  archived_at       timestamptz,
  owner_name        text,
  owner_email       text,
  property_count    bigint,
  membership_count  bigint,
  capability_keys   text[],
  last_activity_at  timestamptz
)
language sql
stable
set search_path = ''
as $$
  select
    w.id,
    w.name,
    w.type,
    w.created_at,
    w.archived_at,
    owner.full_name,
    owner.email,
    (select count(*) from property.properties p where p.steward_workspace_id = w.id),
    (select count(*) from workspace.memberships m2
       where m2.workspace_id = w.id and m2.state = 'active'
         and (m2.expires_at is null or m2.expires_at > now())),
    (select coalesce(array_agg(g.capability_key order by g.capability_key), '{}')
       from workspace.capability_grants g
       where g.workspace_id = w.id and g.withdrawn_at is null),
    (select max(r.occurred_at) from platform.audit_records r where r.workspace_id = w.id)
  from workspace.workspaces w
  left join lateral (
    select i.full_name, i.email
    from workspace.memberships m
    join identity.identities i on i.person_ref = m.person_ref
    where m.workspace_id = w.id
      and m.role = 'owner'
      and m.state = 'active'
      and (m.expires_at is null or m.expires_at > now())
      and i.erased_at is null
    order by m.created_at asc
    limit 1
  ) owner on true
  where exists (
    select 1
    from workspace.current_memberships() cm
    where workspace.workspace_has_capability(cm.workspace_id, 'platform_operations')
  )
  and (
    p_query is null or p_query = ''
    or w.id::text = p_query
    or w.name ilike '%' || p_query || '%'
    or owner.full_name ilike '%' || p_query || '%'
    or owner.email ilike '%' || p_query || '%'
    or exists (
      select 1 from property.properties p
      where p.steward_workspace_id = w.id and p.name ilike '%' || p_query || '%'
    )
  )
  order by w.created_at desc
  limit greatest(coalesce(p_limit, 20), 0)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

comment on function platform.search_workspaces(text, integer, integer) is
  'Workspace lookup''s read-only half (WP 1.1a, Programme §Slice 1). Name/owner/property-name/id search over every workspace, restricted to callers holding platform_operations -- the same composed EXISTS check 0133''s list_audit_records() established, this is its second caller. capability_keys and last_activity_at report the schema''s real facts (granular capability grants, platform.audit_records) rather than the Programme draft''s own "tier" wording, which names no real column. No SECURITY DEFINER of its own; reached only through api.search_workspaces().';

-- =========================================================================
-- THE DELEGATE

create or replace function api.search_workspaces(
  p_query   text    default null,
  p_limit   integer default 20,
  p_offset  integer default 0
)
returns table (
  workspace_id      uuid,
  workspace_name    text,
  workspace_type    text,
  created_at        timestamptz,
  archived_at       timestamptz,
  owner_name        text,
  owner_email       text,
  property_count    bigint,
  membership_count  bigint,
  capability_keys   text[],
  last_activity_at  timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from platform.search_workspaces(p_query, p_limit, p_offset);
$$;

comment on function api.search_workspaces(text, integer, integer) is
  'The Administration engine''s isolation contract for Workspace lookup (WP 1.1a). Delegates to platform.search_workspaces(), which holds all the logic; this function holds none.';

-- =========================================================================
-- ACCESS — explicit revokes, verified rather than assumed (ADR-0026 property 4), the
-- same discipline every prior api.* delegate in this codebase follows.

revoke all on function api.search_workspaces(text, integer, integer) from public, anon, service_role;
grant execute on function api.search_workspaces(text, integer, integer) to authenticated;

-- platform.search_workspaces() is granted to nobody at all -- reachable only as a
-- nested call inside the SECURITY DEFINER delegate above, the identical posture
-- platform.list_audit_records() (0133) and workspace.my_workspace_has_capability()
-- (0134) already hold.
revoke all on function platform.search_workspaces(text, integer, integer) from public, anon, authenticated, service_role;
