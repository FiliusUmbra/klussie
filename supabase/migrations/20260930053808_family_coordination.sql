-- Family coordination is a separate workspace: joining never shares a personal home.
-- Private tables are deny-by-default. Only the two api delegates are exposed.
create schema if not exists family;
revoke all on schema family from public, anon, authenticated, service_role;
alter table workspace.workspaces drop constraint workspaces_type_check;
alter table workspace.workspaces add constraint workspaces_type_check check (type in ('personal','professional','business','family'));
alter table workspace.role_permissions drop constraint role_permissions_workspace_type_check;
alter table workspace.role_permissions add constraint role_permissions_workspace_type_check check (workspace_type in ('personal','professional','business','family'));
alter table workspace.role_permissions drop constraint role_permissions_permission_key_check;
alter table workspace.role_permissions add constraint role_permissions_permission_key_check check (permission_key in (
 'workspace.rename','workspace.settings.edit','workspace.archive','membership.invite','membership.join.approve',
 'membership.role.edit','membership.scope.edit','membership.revoke','membership.approval.manage','membership.own.view',
 'membership.roster.view','membership.history.view','family.records.view','family.records.edit'));
insert into workspace.role_permissions(workspace_type,role_name,permission_key) values
 ('family','owner','family.records.view'),('family','owner','family.records.edit'),('family','owner','membership.invite'),
 ('family','owner','membership.revoke'),('family','owner','membership.roster.view'),('family','owner','membership.own.view'),
 ('family','member','family.records.view'),('family','member','family.records.edit'),('family','member','membership.roster.view'),
 ('family','member','membership.own.view');
insert into platform.capabilities(capability_key,category,name,description)
 values ('family_coordination','functional','Family coordination','Shared lists, chores and calendars, independent of property access.');

create table family.people (
 id uuid primary key, workspace_id uuid not null references workspace.workspaces(id),
 membership_id uuid unique references workspace.memberships(id),
 name text not null check (length(btrim(name)) between 1 and 80),
 kind text not null check (kind in ('adult','child')), archived_at timestamptz,
 unique(id,workspace_id), check (kind <> 'child' or membership_id is null)
);
create table family.lists (
 id uuid primary key, workspace_id uuid not null references workspace.workspaces(id),
 name text not null check (length(btrim(name)) between 1 and 120), archived_at timestamptz,
 unique(id,workspace_id)
);
create table family.tasks (
 id uuid primary key, workspace_id uuid not null references workspace.workspaces(id),
 list_id uuid, assignee_id uuid, title text not null check (length(btrim(title)) between 1 and 240),
 due_on date, repeat_days integer not null default 0 check (repeat_days in (0,1,7,14,30)),
 completed_at timestamptz, archived_at timestamptz, version integer not null default 1,
 foreign key(list_id,workspace_id) references family.lists(id,workspace_id),
 foreign key(assignee_id,workspace_id) references family.people(id,workspace_id),
 check (repeat_days=0 or (list_id is null and due_on is not null))
);
create table family.events (
 id uuid primary key, workspace_id uuid not null references workspace.workspaces(id),
 title text not null check (length(btrim(title)) between 1 and 240),
 starts_on date not null, ends_on date not null, kind text not null check (kind in ('event','holiday')),
 notes text not null default '' check (length(notes)<=2000), archived_at timestamptz,
 version integer not null default 1, check (ends_on>=starts_on)
);
create table family.invitations (
 id uuid primary key, workspace_id uuid not null references workspace.workspaces(id),
 token_hash text not null unique, expires_at timestamptz not null default now()+interval '7 days',
 used_at timestamptz, revoked_at timestamptz
);
create table family.commands (
 id uuid primary key, person_ref uuid not null, workspace_id uuid not null references workspace.workspaces(id),
 action text not null, result jsonb not null, created_at timestamptz not null default now()
);
create table family.completions (
 id uuid primary key, task_id uuid not null references family.tasks(id),
 workspace_id uuid not null references workspace.workspaces(id), person_ref uuid not null,
 completed_at timestamptz not null default now(), previous_due_on date, next_due_on date
);
create index family_people_workspace on family.people(workspace_id);
create index family_lists_workspace on family.lists(workspace_id);
create index family_tasks_workspace on family.tasks(workspace_id,due_on) where archived_at is null;
create index family_tasks_list on family.tasks(list_id,workspace_id);
create index family_tasks_assignee on family.tasks(assignee_id,workspace_id);
create index family_events_workspace on family.events(workspace_id,starts_on) where archived_at is null;
create index family_invitations_workspace on family.invitations(workspace_id);
create index family_commands_workspace on family.commands(workspace_id);
create index family_completions_task on family.completions(task_id);
create index family_completions_workspace on family.completions(workspace_id,completed_at);
do $$ declare t text; begin
 foreach t in array array['people','lists','tasks','events','invitations','commands','completions'] loop
  execute format('alter table family.%I enable row level security',t);
  execute format('revoke all on family.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;

create function family.require_access(w uuid, permission text) returns uuid
language plpgsql set search_path='' as $$
declare person uuid;
begin
 select person_ref into person from identity.identities where auth_user_id=auth.uid() and erased_at is null;
 if person is null or not workspace.workspace_has_capability(w,'family_coordination')
 or not exists(select 1 from workspace.workspaces where id=w and archived_at is null)
 or not coalesce((select bool_or(granted) from workspace.decide_permission(w,permission)),false) then
  raise exception 'family_access_denied' using errcode='42501';
 end if;
 return person;
end $$;

create function family.snapshot(w uuid) returns jsonb
language plpgsql stable set search_path='' as $$
declare person uuid; groups jsonb;
begin
 if auth.uid() is null then raise exception 'family_access_denied' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',g.workspace_id,'name',g.workspace_name,'role',g.role)),'[]') into groups
 from workspace.list_my_workspaces() g where workspace.workspace_has_capability(g.workspace_id,'family_coordination');
 if w is null then return jsonb_build_object('groups',groups); end if;
 person:=family.require_access(w,'family.records.view');
 return jsonb_build_object('groups',groups,'workspaceId',w,
 'canManage',coalesce((select bool_or(granted) from workspace.decide_permission(w,'membership.invite')),false),
 'people',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'kind',p.kind,
   'role',m.role,'isMe',m.person_ref=person,'hasLogin',p.membership_id is not null) order by p.name),'[]')
   from family.people p left join workspace.memberships m on m.id=p.membership_id where p.workspace_id=w and p.archived_at is null),
 'lists',(select coalesce(jsonb_agg(l order by l.name),'[]') from family.lists l where workspace_id=w and archived_at is null),
 'tasks',(select coalesce(jsonb_agg(t order by t.due_on nulls last,t.id),'[]') from family.tasks t where workspace_id=w and archived_at is null
   and (list_id is null or exists(select 1 from family.lists l where l.id=t.list_id and l.archived_at is null))),
 'events',(select coalesce(jsonb_agg(e order by e.starts_on,e.id),'[]') from family.events e where workspace_id=w and archived_at is null),
 'invitations',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'expires_at',i.expires_at)),'[]') from family.invitations i
   where i.workspace_id=w and i.used_at is null and i.revoked_at is null and i.expires_at>now()
   and coalesce((select bool_or(granted) from workspace.decide_permission(w,'membership.invite')),false)));
end $$;

-- IDs are minted by the client; command ID doubles as the audit event ID.
-- Row locks + versions prevent two devices advancing the same recurring chore twice.
create function family.command(cmd uuid,w uuid,action text,p jsonb,ids uuid[]) returns jsonb
language plpgsql set search_path='' as $$
declare person uuid; result jsonb; target uuid; inv family.invitations; task family.tasks;
 member workspace.memberships; next_date date; existing family.commands;
begin
 select person_ref into person from identity.identities where auth_user_id=auth.uid() and erased_at is null;
 if person is null then raise exception 'family_access_denied' using errcode='42501'; end if;
 if cmd is null or array_length(ids,1)<8 then raise exception 'family_invalid_input'; end if;
 perform pg_advisory_xact_lock(hashtextextended(cmd::text,0));
 select * into existing from family.commands where id=cmd;
 if found then
  if existing.person_ref<>person or existing.action<>action then raise exception 'family_access_denied' using errcode='42501'; end if;
  perform family.require_access(existing.workspace_id,'family.records.view');
  return existing.result;
 end if;
 target:=coalesce(nullif(p->>'id','')::uuid,ids[1]);
 if action='create' then
  w:=ids[1];
  insert into workspace.workspaces(id,type,name) values(w,'family',btrim(p->>'name'));
  if p->>'name' is null or length(btrim(p->>'name')) not between 1 and 80 then raise exception 'family_invalid_input'; end if;
  insert into workspace.memberships(id,workspace_id,person_ref,role) values(ids[2],w,person,'owner');
  insert into workspace.membership_history(id,membership_id,workspace_id,person_ref,role,state) values(ids[3],ids[2],w,person,'owner','active');
  insert into family.people(id,workspace_id,membership_id,name,kind) values(ids[4],w,ids[2],btrim(p->>'displayName'),'adult');
  perform workspace.grant_capability(ids[5],ids[6],w,'family_coordination','preset',ids[7],cmd,'person',person::text);
 elsif action='join' then
  select * into inv from family.invitations where token_hash=encode(extensions.digest(p->>'token','sha256'),'hex') for update;
  if not found or inv.used_at is not null or inv.revoked_at is not null or inv.expires_at<=now() then raise exception 'family_invalid_invite'; end if;
  w:=inv.workspace_id;
  perform 1 from workspace.workspaces where id=w for update;
  if not workspace.workspace_has_capability(w,'family_coordination') or not exists(select 1 from workspace.workspaces where id=w and archived_at is null) then raise exception 'family_invalid_invite'; end if;
  if exists(select 1 from workspace.current_memberships() where workspace_id=w) then raise exception 'family_already_member'; end if;
  insert into workspace.memberships(id,workspace_id,person_ref,role) values(ids[2],w,person,'member');
  insert into workspace.membership_history(id,membership_id,workspace_id,person_ref,role,state) values(ids[3],ids[2],w,person,'member','active');
  insert into family.people(id,workspace_id,membership_id,name,kind) values(ids[4],w,ids[2],btrim(p->>'displayName'),'adult');
  update family.invitations set used_at=now() where id=inv.id;
 else
  perform family.require_access(w,case when action in ('invite','revoke_invite','person','remove_person') then 'membership.invite' else 'family.records.edit' end);
  if action='invite' then
   if p->>'token' is null or p->>'token' !~ '^[a-f0-9]{64}$' then raise exception 'family_invalid_input'; end if;
   insert into family.invitations(id,workspace_id,token_hash) values(target,w,encode(extensions.digest(p->>'token','sha256'),'hex'));
  elsif action='revoke_invite' then
   update family.invitations set revoked_at=now() where id=target and workspace_id=w;
   if not found then raise exception 'family_not_found'; end if;
  elsif action='person' then
   insert into family.people(id,workspace_id,name,kind) values(target,w,btrim(p->>'name'),p->>'kind');
  elsif action='remove_person' then
   select m.* into member from workspace.memberships m join family.people f on f.membership_id=m.id where f.id=target and f.workspace_id=w for update of m;
   if member.role='owner' then raise exception 'family_owner_required'; end if;
   if member.id is not null then
    update workspace.memberships set state='ended',updated_at=now() where id=member.id;
    insert into workspace.membership_history(id,membership_id,workspace_id,person_ref,role,state) values(ids[2],member.id,w,member.person_ref,member.role,'ended');
   end if;
   update family.people set archived_at=now() where id=target and workspace_id=w;
   if not found then raise exception 'family_not_found'; end if;
   update family.tasks set assignee_id=null,version=version+1 where workspace_id=w and assignee_id=target;
  elsif action='list' then
   if p->>'id' is null then insert into family.lists(id,workspace_id,name) values(target,w,btrim(p->>'name'));
   else
    update family.lists set name=btrim(p->>'name') where id=target and workspace_id=w and archived_at is null;
    if not found then raise exception 'family_not_found'; end if;
   end if;
  elsif action='task' then
   if nullif(p->>'assigneeId','') is not null and not exists(select 1 from family.people where id=(p->>'assigneeId')::uuid and workspace_id=w and archived_at is null) then raise exception 'family_invalid_input'; end if;
   if nullif(p->>'listId','') is not null and not exists(select 1 from family.lists where id=(p->>'listId')::uuid and workspace_id=w and archived_at is null) then raise exception 'family_invalid_input'; end if;
   if p->>'id' is null then
    insert into family.tasks(id,workspace_id,list_id,title,assignee_id,due_on,repeat_days) values(target,w,nullif(p->>'listId','')::uuid,btrim(p->>'title'),nullif(p->>'assigneeId','')::uuid,nullif(p->>'dueOn','')::date,coalesce((p->>'repeatDays')::int,0));
   else
    update family.tasks set title=btrim(p->>'title'),assignee_id=nullif(p->>'assigneeId','')::uuid,due_on=nullif(p->>'dueOn','')::date,repeat_days=coalesce((p->>'repeatDays')::int,0),version=version+1
     where id=target and workspace_id=w and version=(p->>'version')::int and archived_at is null;
    if not found then raise exception 'family_conflict'; end if;
   end if;
  elsif action='complete' then
   select * into task from family.tasks where id=target and workspace_id=w and archived_at is null for update;
   if not found or task.version is distinct from (p->>'version')::int then raise exception 'family_conflict'; end if;
   if task.list_id is not null and not exists(select 1 from family.lists where id=task.list_id and archived_at is null) then raise exception 'family_not_found'; end if;
   if task.repeat_days>0 then
    if nullif(p->>'today','') is null then raise exception 'family_invalid_input'; end if;
    next_date:=greatest(task.due_on,(p->>'today')::date)+task.repeat_days;
    update family.tasks set due_on=next_date,version=version+1 where id=target;
   else
    update family.tasks set completed_at=case when task.completed_at is null then now() else null end,version=version+1 where id=target;
   end if;
   if task.completed_at is null then insert into family.completions(id,task_id,workspace_id,person_ref,previous_due_on,next_due_on) values(ids[2],target,w,person,task.due_on,next_date); end if;
  elsif action='event' then
   if p->>'id' is null then
    insert into family.events(id,workspace_id,title,starts_on,ends_on,kind,notes) values(target,w,btrim(p->>'title'),(p->>'startsOn')::date,(p->>'endsOn')::date,p->>'kind',coalesce(p->>'notes',''));
   else
    update family.events set title=btrim(p->>'title'),starts_on=(p->>'startsOn')::date,ends_on=(p->>'endsOn')::date,kind=p->>'kind',notes=coalesce(p->>'notes',''),version=version+1
     where id=target and workspace_id=w and version=(p->>'version')::int and archived_at is null;
    if not found then raise exception 'family_conflict'; end if;
   end if;
  elsif action='archive' then
   if p->>'kind'='task' then
    update family.tasks set archived_at=now(),version=version+1 where id=target and workspace_id=w and version=(p->>'version')::int and archived_at is null;
   elsif p->>'kind'='event' then
    update family.events set archived_at=now(),version=version+1 where id=target and workspace_id=w and version=(p->>'version')::int and archived_at is null;
   elsif p->>'kind'='list' then update family.lists set archived_at=now() where id=target and workspace_id=w and archived_at is null;
   else raise exception 'family_invalid_input'; end if;
   if not found then raise exception 'family_conflict'; end if;
  else raise exception 'family_invalid_action'; end if;
 end if;
 result:=jsonb_build_object('workspaceId',w,'id',target);
 insert into family.commands(id,person_ref,workspace_id,action,result) values(cmd,person,w,action,result);
 perform platform.emit_event(p_event_id=>cmd,p_event_type=>'family.coordination.changed',p_workspace_id=>w,
  p_actor_type=>'person',p_actor_ref=>person::text,p_subject_type=>'family',p_subject_id=>target,p_correlation_id=>cmd,
  p_payload=>jsonb_build_object('action',action));
 return result;
end $$;

-- Match the existing api -> private-engine delegation pattern (ADR-0026).
create function api.family_snapshot(p_workspace_id uuid default null) returns jsonb
 language sql stable security definer set search_path='' as $$ select family.snapshot(p_workspace_id); $$;
create function api.family_command(p_command_id uuid,p_workspace_id uuid,p_action text,p_payload jsonb,p_ids uuid[]) returns jsonb
 language sql security definer set search_path='' as $$ select family.command(p_command_id,p_workspace_id,p_action,p_payload,p_ids); $$;
revoke all on all functions in schema family from public,anon,authenticated,service_role;
revoke all on function api.family_snapshot(uuid) from public,anon,service_role;
revoke all on function api.family_command(uuid,uuid,text,jsonb,uuid[]) from public,anon,service_role;
grant execute on function api.family_snapshot(uuid) to authenticated;
grant execute on function api.family_command(uuid,uuid,text,jsonb,uuid[]) to authenticated;
notify pgrst, 'reload schema';
