-- signup_invariants.sql — the only door into the product, proved against the live schema.
--
-- `public.create_organisation` is the first thing a stranger can reach that writes. It is
-- SECURITY DEFINER, so it runs with the definer's rights and every refusal in it is the
-- only refusal there is: RLS is not behind it, it *is* the check. That makes its guards
-- worth asserting one at a time rather than trusting the branch order in 0024.
--
-- Three of them carry the product's promises rather than its correctness:
--
--   * **The threshold is not a parameter.** Assertion 10 reads the signature and fails if
--     one is ever added; 11 reads the row the function actually wrote. k is the central
--     claim, and a sign-up form is the one place a person is least equipped to weigh it
--     and most likely to be asked.
--   * **One organisation per account.** Assertion 6 refuses an existing member, and 15
--     refuses the same caller a second time after they have succeeded. `app.is_org_member`
--     resolves the caller's membership without qualifying by organisation in several
--     places; a second membership would quietly change what those calls mean.
--   * **A new organisation invents nothing.** Assertion 14 asserts the absence of groups,
--     rounds, employees and measurements. An organisation that arrived carrying sample
--     data would put figures on a screen that nobody in that undertaking answered.
--
-- The suite creates one throwaway account to exercise the happy path, because the function
-- reads auth.uid() and the profile it writes has a foreign key to auth.users. That row is
-- inserted **with no password and no identity**, so it is a uuid and an address and
-- nothing that can be signed in as, and assertion 18 proves it and everything it created
-- are gone again. That is why this suite is safe to run wherever the others are — unlike
-- local_account.sql, which is not, and says so.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/signup_invariants.sql

create unlogged table if not exists public._su(seq int, name text, expected text, actual text, pass bool);
truncate public._su;

do $$
declare
  v_uid   uuid := '00000000-0000-4000-8000-00005160a000';
  v_no    text := '999999998';   -- a shape the registry never issues, so it collides with nothing
  v_taken text;
  v_org   uuid;
  v_json  jsonb;
  v_n     int;
  v_msg   text;
  v_member uuid;
begin
  select org_number into v_taken from app.organizations order by id limit 1;
  select user_id into v_member from app.memberships where active order by id limit 1;

  -- 1..4 -------------------------------------------------------------- the grant surface
  insert into public._su
  select 1, 'only a signed-in caller may execute create_organisation', 'authenticated',
         coalesce(string_agg(grantee, ',' order by grantee), 'none'),
         coalesce(string_agg(grantee, ',' order by grantee), '') = 'authenticated'
  from information_schema.role_routine_grants
  where routine_schema = 'public' and routine_name = 'create_organisation'
    and grantee in ('anon', 'authenticated', 'public');

  insert into public._su
  select 2, 'it is security definer with no search path to hijack', 'definer|search_path=""',
         case when p.prosecdef then 'definer' else 'invoker' end || '|' ||
         coalesce(array_to_string(p.proconfig, ','), 'none'),
         p.prosecdef and 'search_path=""' = any(coalesce(p.proconfig, array['none']))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_organisation';

  insert into public._su
  select 3, 'an organisation number identifies one undertaking only', '1', count(*)::text, count(*) = 1
  from pg_index i
  where i.indrelid = 'app.organizations'::regclass and i.indisunique
    and pg_get_indexdef(i.indexrelid) like '%(org_number)%';

  insert into public._su
  select 4, 'no client role may insert an organisation directly', '0', count(*)::text, count(*) = 0
  from information_schema.role_table_grants
  where table_schema = 'app' and table_name = 'organizations'
    and grantee in ('anon', 'authenticated') and privilege_type = 'INSERT';

  -- 5..9 ------------------------------------------------------------------ the refusals
  perform set_config('request.jwt.claims', '', true);
  v_json := public.create_organisation('Ingen AS', v_no, 10, 'Ingen');
  insert into public._su values (5, 'a caller with no session creates nothing', 'not_signed_in',
    coalesce(v_json->>'error', 'CREATED'), v_json->>'error' = 'not_signed_in');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
  v_json := public.create_organisation('Andre AS', v_no, 10, 'Allerede Medlem');
  insert into public._su values (6, 'nobody acquires a second organisation', 'already_a_member',
    coalesce(v_json->>'error', 'CREATED'), v_json->>'error' = 'already_a_member');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  v_json := public.create_organisation('   ', v_no, 10, 'Tom Navn');
  insert into public._su values (7, 'an undertaking without a name is refused', 'invalid_name',
    coalesce(v_json->>'error', 'CREATED'), v_json->>'error' = 'invalid_name');

  v_json := public.create_organisation('Feil Nummer AS', '12345', 10, 'Feil Nummer');
  insert into public._su values (8, 'and one whose number is not nine digits', 'invalid_org_number',
    coalesce(v_json->>'error', 'CREATED'), v_json->>'error' = 'invalid_org_number');

  v_json := public.create_organisation('Dublett AS', v_taken, 10, 'Dublett');
  insert into public._su values (9, 'a number already registered is refused, not merged into',
    'already_registered', coalesce(v_json->>'error', 'CREATED'),
    v_json->>'error' = 'already_registered');

  -- 10 ------------------------------------------------- what the form cannot be asked for
  insert into public._su
  select 10, 'the signature offers no way to set the threshold', 'absent',
         case when pg_get_function_arguments(p.oid) ~* '(threshold|k_min|anonym)' then 'OFFERED'
              else 'absent' end,
         pg_get_function_arguments(p.oid) !~* '(threshold|k_min|anonym)'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_organisation';

  -- 11..15 ------------------------------------------------------------- the happy path
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'signup.invariant@orgpuls.invalid', now(), now(), '{}'::jsonb, '{}'::jsonb);

  v_json := public.create_organisation('Invariant Anlegg AS', v_no, 12, 'Kari Invariant');
  insert into public._su values (11, 'a signed-in stranger with a free number succeeds', 'true',
    coalesce(v_json->>'ok', 'none'), coalesce((v_json->>'ok')::bool, false));

  select id into v_org from app.organizations where org_number = v_no;

  insert into public._su
  select 12, 'the new organisation starts at the floor, not below it',
         app.k_min()::text, threshold::text, threshold = app.k_min()
  from app.organizations where id = v_org;

  insert into public._su
  select 13, 'it has exactly one member, and they can administer it', '1|daglig_leder|true',
         count(*)::text || '|' || coalesce(max(role::text), 'none') || '|' ||
         coalesce(bool_and(active)::text, 'f'),
         count(*) = 1 and max(role::text) = 'daglig_leder' and bool_and(active)
  from app.memberships where org_id = v_org;

  insert into public._su
  select 14, 'the wheel exists and is switched off', '1|false',
         count(*)::text || '|' || coalesce(bool_or(active)::text, 'none'),
         count(*) = 1 and not bool_or(active)
  from app.year_wheels where org_id = v_org;

  select (select count(*) from app.groups where org_id = v_org)
       + (select count(*) from app.rounds where org_id = v_org)
       + (select count(*) from app.employees where org_id = v_org)
       + (select count(*) from app.measurements where org_id = v_org)
    into v_n;
  insert into public._su values (15, 'and it arrived with no figures nobody answered',
    '0', v_n::text, v_n = 0);

  v_json := public.create_organisation('Enda En AS', '999999997', 9, 'Kari Invariant');
  insert into public._su values (16, 'the same caller is now refused a second one',
    'already_a_member', coalesce(v_json->>'error', 'CREATED'),
    v_json->>'error' = 'already_a_member');

  -- 17 ------------------------------------------------ the index, not only the branch
  begin
    insert into app.organizations (name, org_number, employee_count, threshold)
    values ('Dublett Direkte AS', v_no, 4, app.k_min());
    insert into public._su values (17, 'the database refuses a duplicate number on its own',
      'rejected', 'ACCEPTED', false);
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
    insert into public._su values (17, 'the database refuses a duplicate number on its own',
      'rejected', left(v_msg, 50), true);
  end;

  -- 18 --------------------------------------------------------------------- cleanup
  perform set_config('request.jwt.claims', '', true);
  delete from app.organizations where id = v_org;
  delete from auth.users where id = v_uid;

  select (select count(*) from app.organizations where org_number in (v_no, '999999997'))
       + (select count(*) from auth.users where id = v_uid)
       + (select count(*) from app.profiles where id = v_uid)
       + (select count(*) from app.memberships where user_id = v_uid)
    into v_n;
  insert into public._su values (18, 'the throwaway account and its organisation are gone',
    '0', v_n::text, v_n = 0);
end $$;

select seq, name, expected, actual, pass from public._su order by seq;

do $$
declare v_failed text;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) into v_failed
  from public._su where not pass;
  if v_failed is not null then
    raise exception 'signup invariants failed: %', v_failed;
  end if;
end $$;

drop table public._su;
