-- Epic 03 WP08 — the workspace engine contract: resolve context, decide permission,
-- explain a decision (roadmap §14).
--
-- ADR-0027 (accepted) is the vocabulary this migration implements: twelve permissions,
-- scoped to what the Workspace engine itself owns — workspace lifecycle and membership
-- management — and nothing else. Every other engine's business-action permissions stay
-- unbuilt until that engine's own epic, per the ADR's own scoping argument.
--
-- FOUR OBJECTS, THE SAME SPLIT ADR-0026 ESTABLISHED
--
-- Logic in `workspace`, reachable by nothing client-facing. Thin SECURITY DEFINER delegates
-- in `api`, which is what `authenticated` actually calls. Not a new pattern — the fourth
-- time this migration set has used it (current_workspace_memberships, and now these two).
--
--   workspace.resolve_context(workspace_id)      — "resolve context": the caller's own
--                                                    membership in one specific workspace.
--   workspace.decide_permission(workspace_id, permission_key)
--                                                  — "decide permission" and "explain a
--                                                    decision" in one return value: granted
--                                                    or not, and the membership/role that
--                                                    decided it.
--   api.resolve_workspace_context(workspace_id)  — delegate.
--   api.decide_permission(workspace_id, permission_key)
--                                                  — delegate.
--
-- WHY decide_permission TAKING ARGUMENTS DOES NOT REPEAT WP 03.02's DEFECT
--
-- ADR-0026's "As implemented" section found that a function taking the *scanned row's own
-- column* as an argument cannot achieve once-per-statement RLS evaluation, however it is
-- marked. That finding is about a specific usage pattern — a function called once per row
-- inside a policy's WHERE clause — not about functions taking arguments in general.
-- `decide_permission()` is never called that way: it is a point query, invoked once by a
-- caller asking "may I do this one thing", the same shape as any ordinary RPC. It has no
-- role in any RLS policy and should never be given one — a permission decision belongs in
-- application logic (a button rendered or not, a request accepted or refused), not in a
-- row-visibility predicate, which is exactly the isolation `api.current_workspace_memberships()`
-- already handles.
--
-- ROLE_PERMISSIONS IS CONFIGURATION, NOT AN AGGREGATE
--
-- Unlike identity, workspace or membership, nothing references a role_permissions row by
-- id from elsewhere — it exists to be looked up by (workspace_type, role_name,
-- permission_key), not pointed at. A natural composite primary key is therefore correct
-- here where a UUIDv7 surrogate was correct for workspace.workspaces and
-- workspace.memberships (SUPABASE_ARCHITECTURE.md §3 governs aggregate identifiers; this
-- is catalogue data, the same class as public.categories or public.services).
--
-- permission_key IS CONSTRAINED; role_name IS NOT — DELIBERATELY DIFFERENT RULES
--
-- workspace.memberships.role (migration 0030) has no check constraint: §7 names custom
-- roles composing permissions as a stated future direction, and a closed list would have
-- to be revisited the day a workspace defines its own. permission_key is different: these
-- twelve are ADR-0027's own stated, accepted vocabulary for what THIS migration builds, and
-- an unrecognised key should be refused at the table rather than silently granting nothing
-- while looking like a typo went unnoticed. Widened, explicitly, by whichever future epic
-- adds Property/Work/Knowledge/Commerce's own permissions to this same table — matching how
-- identity.identities.locale is widened when a new locale is added, not left open now to
-- avoid a future edit.

-- =========================================================================
-- THE VOCABULARY, AS CONFIGURATION

create table if not exists workspace.role_permissions (
  workspace_type  text not null check (workspace_type in ('personal','professional','business')),
  role_name       text not null,
  permission_key  text not null check (permission_key in (
    'workspace.rename', 'workspace.settings.edit', 'workspace.archive',
    'membership.invite', 'membership.join.approve', 'membership.role.edit',
    'membership.scope.edit', 'membership.revoke', 'membership.approval.manage',
    'membership.own.view', 'membership.roster.view', 'membership.history.view'
  )),
  created_at      timestamptz not null default now(),

  constraint role_permissions_pkey primary key (workspace_type, role_name, permission_key)
);

comment on table workspace.role_permissions is
  'The role -> permission bundles ADR-0027 defines. Configuration, not an aggregate: nothing references a row by identity, only by (workspace_type, role_name, permission_key). Extended by future engines'' own permission keys as they are built, per the ADR''s own scoping.';
comment on column workspace.role_permissions.role_name is
  'Matches workspace.memberships.role in meaning, not by foreign key — that column is deliberately unconstrained (migration 0030) to leave room for custom roles (PLATFORM_DOMAIN_MODEL.md §7). A custom role''s bundle is a later epic''s problem; every role in this table today is one of the eleven named in ADR-0027''s three preset tables.';

alter table workspace.role_permissions enable row level security;
revoke all on workspace.role_permissions from anon, authenticated, service_role;

-- =========================================================================
-- THE SEED — ADR-0027's three tables, verbatim

insert into workspace.role_permissions (workspace_type, role_name, permission_key) values
  -- Personal · Owner — all twelve
  ('personal', 'Owner', 'workspace.rename'), ('personal', 'Owner', 'workspace.settings.edit'),
  ('personal', 'Owner', 'workspace.archive'), ('personal', 'Owner', 'membership.invite'),
  ('personal', 'Owner', 'membership.join.approve'), ('personal', 'Owner', 'membership.role.edit'),
  ('personal', 'Owner', 'membership.scope.edit'), ('personal', 'Owner', 'membership.revoke'),
  ('personal', 'Owner', 'membership.approval.manage'), ('personal', 'Owner', 'membership.own.view'),
  ('personal', 'Owner', 'membership.roster.view'), ('personal', 'Owner', 'membership.history.view'),
  -- Personal · Household member
  ('personal', 'Household member', 'workspace.rename'),
  ('personal', 'Household member', 'membership.own.view'),
  ('personal', 'Household member', 'membership.roster.view'),
  -- Personal · Guest
  ('personal', 'Guest', 'membership.own.view'),

  -- Professional · Owner — all twelve
  ('professional', 'Owner', 'workspace.rename'), ('professional', 'Owner', 'workspace.settings.edit'),
  ('professional', 'Owner', 'workspace.archive'), ('professional', 'Owner', 'membership.invite'),
  ('professional', 'Owner', 'membership.join.approve'), ('professional', 'Owner', 'membership.role.edit'),
  ('professional', 'Owner', 'membership.scope.edit'), ('professional', 'Owner', 'membership.revoke'),
  ('professional', 'Owner', 'membership.approval.manage'), ('professional', 'Owner', 'membership.own.view'),
  ('professional', 'Owner', 'membership.roster.view'), ('professional', 'Owner', 'membership.history.view'),
  -- Professional · Manager
  ('professional', 'Manager', 'workspace.rename'),
  ('professional', 'Manager', 'membership.own.view'),
  ('professional', 'Manager', 'membership.roster.view'),
  -- Professional · Employee
  ('professional', 'Employee', 'membership.own.view'),
  -- Professional · Contractor
  ('professional', 'Contractor', 'membership.own.view'),

  -- Business · Administrator — all twelve
  ('business', 'Administrator', 'workspace.rename'), ('business', 'Administrator', 'workspace.settings.edit'),
  ('business', 'Administrator', 'workspace.archive'), ('business', 'Administrator', 'membership.invite'),
  ('business', 'Administrator', 'membership.join.approve'), ('business', 'Administrator', 'membership.role.edit'),
  ('business', 'Administrator', 'membership.scope.edit'), ('business', 'Administrator', 'membership.revoke'),
  ('business', 'Administrator', 'membership.approval.manage'), ('business', 'Administrator', 'membership.own.view'),
  ('business', 'Administrator', 'membership.roster.view'), ('business', 'Administrator', 'membership.history.view'),
  -- Business · Manager
  ('business', 'Manager', 'workspace.rename'),
  ('business', 'Manager', 'membership.own.view'),
  ('business', 'Manager', 'membership.roster.view'),
  -- Business · Team member
  ('business', 'Team member', 'membership.own.view'),
  -- Business · Auditor / Viewer
  ('business', 'Auditor / Viewer', 'membership.own.view'),
  ('business', 'Auditor / Viewer', 'membership.roster.view'),
  ('business', 'Auditor / Viewer', 'membership.history.view'),
  -- Business · External provider
  ('business', 'External provider', 'membership.own.view')
on conflict (workspace_type, role_name, permission_key) do nothing;

-- =========================================================================
-- THE LOGIC — workspace.resolve_context()
--
-- "Resolve context": the caller's own membership in one specific workspace. Built on
-- workspace.current_memberships() (migration 0031) rather than querying
-- workspace.memberships directly — one place resolves "who is the caller", reused rather
-- than re-implemented.

create or replace function workspace.resolve_context(p_workspace_id uuid)
returns table (
  membership_id  uuid,
  workspace_id   uuid,
  role           text,
  scope          jsonb
)
language sql
stable
set search_path = ''
as $$
  select m.membership_id, m.workspace_id, m.role, m.scope
  from workspace.current_memberships() m
  where m.workspace_id = p_workspace_id;
$$;

comment on function workspace.resolve_context(uuid) is
  'The caller''s own membership in one workspace — "resolve context" (roadmap WP 03.08). Built on workspace.current_memberships(); not SECURITY DEFINER, granted to nobody, reachable only from api.resolve_workspace_context().';

-- =========================================================================
-- THE LOGIC — workspace.decide_permission()
--
-- "Decide permission" and "explain a decision" together: one row, always — even when the
-- caller has no membership in the workspace at all, which is deny-by-default (§7 property
-- 1) rather than an absent row a caller would have to interpret. membership_id and role are
-- the explanation §7 property 3 requires: for any decision, the platform can say which
-- membership, which role, produced it.
--
-- An unrecognised permission_key simply matches nothing in role_permissions and returns
-- granted = false — the same deny-by-default behaviour as a missing membership, with no
-- special-case handling needed.

create or replace function workspace.decide_permission(p_workspace_id uuid, p_permission_key text)
returns table (
  granted         boolean,
  membership_id   uuid,
  role            text,
  permission_key  text,
  workspace_id    uuid
)
language sql
stable
set search_path = ''
as $$
  select
    rp.permission_key is not null as granted,
    ctx.membership_id,
    ctx.role,
    p_permission_key as permission_key,
    p_workspace_id as workspace_id
  from (select 1) as one
  left join workspace.resolve_context(p_workspace_id) ctx on true
  left join workspace.workspaces w on w.id = p_workspace_id
  left join workspace.role_permissions rp
    on rp.workspace_type = w.type
    and rp.role_name = ctx.role
    and rp.permission_key = p_permission_key;
$$;

comment on function workspace.decide_permission(uuid, text) is
  'Decides one permission and explains the decision (ADR-0027): granted/denied, plus the membership and role that produced it. Always returns exactly one row, including when the caller has no membership — deny-by-default as data, not an absent row. Not SECURITY DEFINER, granted to nobody, reachable only from api.decide_permission().';

-- =========================================================================
-- THE DELEGATES

create or replace function api.resolve_workspace_context(p_workspace_id uuid)
returns table (
  membership_id  uuid,
  workspace_id   uuid,
  role           text,
  scope          jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from workspace.resolve_context(p_workspace_id);
$$;

comment on function api.resolve_workspace_context(uuid) is
  'Delegate for workspace.resolve_context() (ADR-0026''s split). The caller''s own membership in one workspace, or no row if they are not a member.';

create or replace function api.decide_permission(p_workspace_id uuid, p_permission_key text)
returns table (
  granted         boolean,
  membership_id   uuid,
  role            text,
  permission_key  text,
  workspace_id    uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from workspace.decide_permission(p_workspace_id, p_permission_key);
$$;

comment on function api.decide_permission(uuid, text) is
  'Delegate for workspace.decide_permission() (ADR-0026''s split). A point query for one permission decision — never call this from inside an RLS policy''s per-row predicate; see this migration''s header for why that would repeat WP 03.02''s finding.';

-- =========================================================================
-- ACCESS
--
-- Explicit, verified rather than assumed (ADR-0026 property 4) — the same discipline every
-- function in this schema has followed since Epic 02.

revoke all on function workspace.resolve_context(uuid) from public, anon, authenticated, service_role;
revoke all on function workspace.decide_permission(uuid, text) from public, anon, authenticated, service_role;

revoke all on function api.resolve_workspace_context(uuid) from public, anon, service_role;
revoke all on function api.decide_permission(uuid, text) from public, anon, service_role;

grant execute on function api.resolve_workspace_context(uuid) to authenticated;
grant execute on function api.decide_permission(uuid, text) to authenticated;
