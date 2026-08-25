-- Fix: safety.file_case_for_caller() (0171, this session's own Slice 5 work) checks the
-- reporter's relationship via workspace.memberships filtered by person_ref and state —
-- but not by role. Continuing the write-path role audit begun in 0173/0174/0175: a
-- support-access grant (0172) sits in workspace.memberships exactly like a real member's
-- own row, and a support grant's person_ref is the operator's own identity, not the
-- customer's — so this specific check was never reachable via a support grant in the
-- first place (the grant would need the OPERATOR to already have a real prior
-- engagement with the reported workspace under their own person_ref, which support
-- grants don't create). It is fixed anyway, on the same principle as 0173/0174/0175:
-- role should never silently satisfy a check that was never designed to consider it,
-- and a future change to how relationships are resolved here should not have to
-- rediscover this. The body is otherwise byte-for-byte identical to 0171's own version.

create or replace function safety.file_case_for_caller(
  p_case_id                uuid,
  p_reported_workspace_id  uuid,
  p_category               text,
  p_details                text,
  p_subject_type           text,
  p_subject_id             uuid,
  p_event_id               uuid,
  p_correlation_id         uuid,
  p_actor_type             platform.actor_type,
  p_actor_ref              text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_reporter_person_ref  uuid;
  v_has_relationship     boolean;
begin
  select i.person_ref into v_reporter_person_ref
  from identity.identities i
  where i.auth_user_id = auth.uid() and i.erased_at is null;

  if v_reporter_person_ref is null then
    raise exception
      'safety.file_case_for_caller: caller has no resolvable identity'
      using errcode = 'insufficient_privilege';
  end if;

  -- Real relationship required — not an anonymous, unrelated report. Matches
  -- ROADMAP_C §5.1's own journey title ("a customer reports a professional"): the
  -- reporter's own workspace must have a real engagement with the reported one, as the
  -- requesting side. role <> 'support' (0176): a support-access grant must never count
  -- as the reporter's own relationship to the workspace it was granted on.
  select exists (
    select 1
    from work.engagements e
    join workspace.memberships m on m.workspace_id = e.requesting_workspace_id
    where m.person_ref = v_reporter_person_ref
      and m.state = 'active'
      and m.role <> 'support'
      and e.performing_workspace_id = p_reported_workspace_id
  ) into v_has_relationship;

  if not v_has_relationship then
    raise exception
      'safety.file_case_for_caller: caller has no real engagement with workspace %', p_reported_workspace_id
      using errcode = 'insufficient_privilege';
  end if;

  insert into safety.cases (
    id, reporter_person_ref, reported_workspace_id, category, details,
    subject_type, subject_id, status, created_at, updated_at
  ) values (
    p_case_id, v_reporter_person_ref, p_reported_workspace_id, p_category, p_details,
    p_subject_type, p_subject_id, 'open', now(), now()
  );

  perform platform.emit_event(
    p_event_id       => p_event_id,
    p_event_type     => 'safety.case.filed',
    p_workspace_id   => p_reported_workspace_id,
    p_actor_type     => p_actor_type,
    p_actor_ref      => p_actor_ref,
    p_subject_type   => 'case',
    p_subject_id     => p_case_id,
    p_correlation_id => p_correlation_id,
    p_payload        => jsonb_build_object('category', p_category)
  );
end;
$$;

comment on function safety.file_case_for_caller(uuid, uuid, text, text, text, uuid, uuid, uuid, platform.actor_type, text) is
  'Files a Trust & Safety case for a caller with a real, active, non-support relationship (an engagement as the requesting side) with the reported workspace (0176), resolving the reporter''s identity from auth.uid() — never caller-supplied.';

-- No grant/revoke changes — this function's own access posture (reachable only through
-- its existing api.file_case() delegate) is untouched.
