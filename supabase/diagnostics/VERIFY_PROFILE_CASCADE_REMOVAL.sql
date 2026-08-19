-- Verifies 0131_remove_profile_cascade_deletes.sql: deleting a profile with dependent data
-- is refused, not cascaded — proven against the exact "both sides of a conversation" case
-- the audit named, not just structurally.
--
--   psql -w -h <pooler-host> -p 5432 -U postgres.<project-ref> -d postgres \
--        -v ON_ERROR_STOP=1 -f supabase/diagnostics/VERIFY_PROFILE_CASCADE_REMOVAL.sql

\set ON_ERROR_STOP on

-- =========================================================================
-- 1 · Every one of the nine constraints has no ON DELETE CASCADE left

do $$
declare
  problems text[] := '{}';
  rec record;
begin
  for rec in
    select tc.table_name, tc.constraint_name, rc.delete_rule
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
    join information_schema.referential_constraints rc
      on rc.constraint_name = tc.constraint_name and rc.constraint_schema = tc.table_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
      and ccu.table_name = 'profiles'
  loop
    if rec.delete_rule = 'CASCADE' then
      problems := problems || format('%s (%s) still cascades', rec.table_name, rec.constraint_name);
    end if;
  end loop;

  if array_length(problems, 1) is not null then
    raise exception 'Still cascading: %', array_to_string(problems, '; ');
  end if;

  raise notice '1 · no foreign key into public.profiles cascades on delete';
end;
$$;

-- =========================================================================
-- 2 · The exact scenario the audit named: deleting one party of a conversation must not
-- destroy the other party's messages — proven by attempting it, not just checked
-- structurally

begin;

do $$
declare
  v_customer_auth  uuid := gen_random_uuid();
  v_pro_auth       uuid := gen_random_uuid();
  v_category_id    text := 'diagnostic-' || gen_random_uuid()::text;
  v_service_id     uuid := gen_random_uuid();
  v_request_id     uuid := gen_random_uuid();
  v_conversation_id uuid := gen_random_uuid();
  v_message_id     uuid := gen_random_uuid();
  v_deleted        boolean := false;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_customer_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'cascade-removal-customer@example.test', jsonb_build_object('full_name', 'Cascade Customer'), now(), now());
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_pro_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'cascade-removal-pro@example.test', jsonb_build_object('full_name', 'Cascade Pro'), now(), now());

  insert into public.pro_profiles (profile_id, pro_type) values (v_pro_auth, 'flexi');
  insert into public.categories (id, icon) values (v_category_id, 'wrench');
  insert into public.services (id, category_id, mode, base_price, certified_only)
    values (v_service_id, v_category_id, 'quote', 50.00, false);
  insert into public.service_requests (id, customer_id, service_id, category_id, details, when_pref, status, directed_until)
    values (v_request_id, v_customer_auth, v_service_id, v_category_id, 'Cascade removal probe', 'flexible', 'booked', null);
  insert into public.conversations (id, request_id, customer_id, pro_id)
    values (v_conversation_id, v_request_id, v_customer_auth, v_pro_auth);
  insert into public.messages (id, conversation_id, sender_id, body)
    values (v_message_id, v_conversation_id, v_pro_auth, 'The pro''s own message');

  -- The customer tries to delete their own account. Before 0131, this cascaded through
  -- service_requests -> conversations -> messages, destroying the PRO's own message too.
  begin
    delete from public.profiles where id = v_customer_auth;
    v_deleted := true;
  exception when foreign_key_violation then
    null;
  end;

  if v_deleted then
    raise exception '2a · deleting the customer''s profile succeeded — it should have been refused';
  end if;

  if not exists (select 1 from public.profiles where id = v_customer_auth) then
    raise exception '2b · the customer''s own profile row vanished anyway';
  end if;
  if not exists (select 1 from public.conversations where id = v_conversation_id) then
    raise exception '2c · the conversation vanished — the other party''s side of it would have been destroyed';
  end if;
  if not exists (select 1 from public.messages where id = v_message_id and sender_id = v_pro_auth) then
    raise exception '2d · the pro''s own message vanished — exactly the leak this migration closes';
  end if;

  raise notice '2 · deleting one party''s account is refused, leaving the other party''s messages intact';
end;
$$;

rollback;

do $$
begin
  raise notice 'VERIFY_PROFILE_CASCADE_REMOVAL: all checks passed';
end;
$$;
