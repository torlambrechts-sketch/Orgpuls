-- account_owner_invariants.sql — an organisation's account owner (0118, X-095), proved against the
-- live schema.
--
--   * no client reads or writes app.account_owners; anon may call neither function (1)
--   * support sets an owner; the list and the owner reader show it; the audit log has it (2)
--   * an analyst or finance may not set one; the owner must be an active platform admin (3)
--   * clearing the owner leaves the list without one (4)
--   * the list says when an organisation is cancelled, and names its daglig leder (5)
--   * nothing written here survives (6)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/account_owner_invariants.sql

create unlogged table if not exists public._own(seq int, name text, expected text, actual text, pass bool);
truncate public._own;

do $$
declare
  v_sup  uuid := '00000000-0000-4000-8000-0000000a7201';
  v_fin  uuid := '00000000-0000-4000-8000-0000000a7202';
  v_ana  uuid := '00000000-0000-4000-8000-0000000a7203';
  v_gone uuid := '00000000-0000-4000-8000-0000000a7204';
  v_dl   uuid := '00000000-0000-4000-8000-0000000a7205';
  v_org  uuid := '00000000-0000-4000-8000-0000000a7211';
  v_json jsonb;
  v_txt  text;
  v_ok   boolean;
  v_own  text;
  v_rows jsonb := '[]';
  claims constant text := '{"sub":"%s","role":"authenticated","aal":"aal2"}';
begin
  -- 1 ---------------------------------------------------------------- no client reaches it
  select c.relrowsecurity
         and not exists (select 1 from pg_policies p where p.schemaname = 'app' and p.tablename = 'account_owners')
         and not exists (select 1 from information_schema.role_table_grants g
                         where g.table_schema = 'app' and g.table_name = 'account_owners' and g.grantee in ('anon', 'authenticated'))
         and not has_function_privilege('anon', 'public.admin_set_account_owner(uuid,uuid)', 'execute')
         and not has_function_privilege('anon', 'public.admin_org_owner(uuid)', 'execute')
    into v_ok from pg_class c where c.oid = 'app.account_owners'::regclass;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'RLS on, no policy, no client privilege; anon calls neither function',
    'expected', 'true', 'actual', v_ok::text, 'pass', v_ok);

  begin
    insert into auth.users (id, email) values (v_sup, 'support@own-test.example'), (v_fin, 'finance@own-test.example'),
      (v_ana, 'analyst@own-test.example'), (v_gone, 'gone@own-test.example'), (v_dl, 'dl@own-test.example');
    insert into app.platform_admins (user_id, role) values (v_sup, 'support'), (v_fin, 'finance'), (v_ana, 'analyst');
    insert into app.platform_admins (user_id, role, active) values (v_gone, 'support', false);
    insert into app.organizations (id, name, org_number, employee_count) values (v_org, 'Eier Test AS', '999072101', 12);
    insert into app.profiles (id, full_name) values (v_dl, 'Dina Leder');
    insert into app.memberships (org_id, user_id, role) values (v_org, v_dl, 'daglig_leder');

    -- 2 -------------------------------------------------------------- support sets it
    perform set_config('request.jwt.claims', format(claims, v_sup), true);
    v_txt := coalesce(public.admin_set_account_owner(v_org, v_sup)->>'error', 'ok');
    select x->>'owner_email' into strict v_own from jsonb_array_elements(public.admin_org_list('Eier Test', null)->'rows') x;
    v_txt := v_txt || ',' || coalesce(v_own, 'none') || ',' || coalesce(public.admin_org_owner(v_org)#>>'{owner,email}', 'none')
          || ',' || (select count(*) from app.admin_audit a where a.action = 'org.owner' and a.org_id = v_org and a.detail->>'owner' = 'support@own-test.example');
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'support sets the owner; the list and the reader show it; it is audited',
      'expected', 'ok,support@own-test.example,support@own-test.example,1', 'actual', v_txt,
      'pass', v_txt = 'ok,support@own-test.example,support@own-test.example,1');

    -- 3 -------------------------------------------------------------- who and whom
    v_txt := coalesce(public.admin_set_account_owner(v_org, v_gone)->>'error', 'ok') || ','
          || coalesce(public.admin_set_account_owner(v_org, v_dl)->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_fin), true);
    v_txt := v_txt || ',' || coalesce(public.admin_set_account_owner(v_org, v_fin)->>'error', 'ok')
          || ',' || (public.admin_org_owner(v_org)->>'can_set') || ',' || jsonb_array_length(public.admin_org_owner(v_org)->'candidates');
    perform set_config('request.jwt.claims', format(claims, v_ana), true);
    v_txt := v_txt || ',' || coalesce(public.admin_set_account_owner(v_org, v_ana)->>'error', 'ok')
          || ',' || coalesce(public.admin_org_owner(v_org)->>'error', 'ok');
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'an inactive admin or a customer cannot own; finance and analyst cannot set',
      'expected', 'not_admin,not_admin,not_allowed,false,0,not_allowed,not_allowed', 'actual', v_txt,
      'pass', v_txt = 'not_admin,not_admin,not_allowed,false,0,not_allowed,not_allowed');

    -- 4 -------------------------------------------------------------- cleared
    perform set_config('request.jwt.claims', format(claims, v_sup), true);
    v_txt := coalesce(public.admin_set_account_owner(v_org, null)->>'error', 'ok') || ','
          || coalesce((select x->>'owner_email' from jsonb_array_elements(public.admin_org_list('Eier Test', null)->'rows') x), 'none');
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'clearing the owner leaves the list without one',
      'expected', 'ok,none', 'actual', v_txt, 'pass', v_txt = 'ok,none');

    -- 5 -------------------------------------------------------------- cancellation and contact
    update app.billing set cancelled_at = now(), cancel_effective_at = now() + interval '10 days',
      deletion_due_at = now() + interval '30 days' where org_id = v_org;
    select (x->>'cancelled_at' is not null)::text || ',' || (x->>'cancel_effective_at' is not null)::text || ',' || coalesce(x->>'contact_name', 'none')
      into v_txt from jsonb_array_elements(public.admin_org_list('Eier Test', null)->'rows') x;
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'the list carries the cancellation and the daglig leder''s name',
      'expected', 'true,true,Dina Leder', 'actual', v_txt, 'pass', v_txt = 'true,true,Dina Leder');

    raise exception 'rollback';
  exception when others then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 6 ---------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select org_id as id from app.account_owners where org_id = v_org
    union all select id from app.organizations where id = v_org
    union all select id from auth.users where email like '%@own-test.example') x;
  v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._own
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._own order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._own;
  if v_failed is not null then raise exception 'account owner invariants failed: %', v_failed; end if;
  if v_count <> 6 then raise exception 'account owner invariants: expected 6 rows, got %', v_count; end if;
end $$;
