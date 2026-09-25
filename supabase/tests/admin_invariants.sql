-- admin_invariants.sql — the platform admin (0049, D-90, X-058), proved against the live schema.
--
--   * its tables have RLS on and no client privilege; anon may call no admin function (1, 2)
--   * no admin function reads a response-level table (3)
--   * a customer user is not an admin; an admin needs a second factor (aal2) (4, 5)
--   * admin and customer accounts stay apart, in both directions (6, 7)
--   * an organisation's detail names no respondent, and every read is audited (8, 9)
--   * the audit log cannot be changed, deleted or truncated (10)
--   * roles: support extends a trial with a reason; finance cannot; analyst sees the business
--     but no organisation; support reads one organisation's trail, not all of it (11..14)
--   * provider errors lose their e-mail addresses before an admin sees them (15)
--   * a super-admin grants a role to an admin account and refuses a customer account (16)
--   * a leader's results view is counted once a day (17)
--   * nothing written here survives (18)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/admin_invariants.sql

create unlogged table if not exists public._adi(seq int, name text, expected text, actual text, pass bool);
truncate public._adi;

do $$
declare
  v_org     uuid := '00000000-0000-4000-8000-000000000001';
  v_super   uuid := '00000000-0000-4000-8000-0000000ad001';
  v_support uuid := '00000000-0000-4000-8000-0000000ad002';
  v_finance uuid := '00000000-0000-4000-8000-0000000ad003';
  v_analyst uuid := '00000000-0000-4000-8000-0000000ad004';
  v_new     uuid := '00000000-0000-4000-8000-0000000ad005';
  v_dl      uuid;
  v_rows    jsonb := '[]';
  v_json    jsonb;
  v_cnt     int;
  v_before  int;
  v_ok      boolean;
  v_txt     text;
  v_round   uuid;
  claims    constant text := '{"sub":"%s","role":"authenticated","aal":"%s"}';
begin
  select bool_and(c.relrowsecurity) into v_ok from pg_class c
  where c.oid in ('app.platform_admins'::regclass, 'app.admin_audit'::regclass, 'app.admin_org_notes'::regclass, 'app.product_events'::regclass);
  v_ok := v_ok and not exists (
    select 1 from information_schema.role_table_grants g
    where g.table_schema = 'app' and g.table_name in ('platform_admins', 'admin_audit', 'admin_org_notes', 'product_events')
      and g.grantee in ('anon', 'authenticated'));
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'admin tables have RLS on and no client privilege', 'expected', 'true',
    'actual', v_ok::text, 'pass', v_ok);

  select count(*) into v_cnt from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'admin\_%' and has_function_privilege('anon', p.oid, 'execute');
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'anon may call no admin function', 'expected', '0',
    'actual', v_cnt::text, 'pass', v_cnt = 0);

  select string_agg(p.proname, ', ') into v_txt from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'admin\_%'
    and p.prosrc ~* 'app\.(responses|answers|extra_answers|response_comments)\M';
  v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'no admin function reads a response-level table', 'expected', 'none',
    'actual', coalesce(v_txt, 'none'), 'pass', v_txt is null);

  select m.user_id into v_dl from app.memberships m where m.org_id = v_org and m.role = 'daglig_leder' and m.active limit 1;

  begin
    insert into auth.users (id, email) values
      (v_super, 'super@admin-test.example'), (v_support, 'support@admin-test.example'),
      (v_finance, 'finance@admin-test.example'), (v_analyst, 'analyst@admin-test.example'), (v_new, 'new@admin-test.example');
    insert into app.platform_admins (user_id, role) values
      (v_super, 'super_admin'), (v_support, 'support'), (v_finance, 'finance'), (v_analyst, 'analyst');

    -- 4, 5 --------------------------------------------------------- who is an admin
    perform set_config('request.jwt.claims', format(claims, v_dl, 'aal2'), true);
    v_json := public.admin_org_list(null, null);
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'a customer daglig leder is not an admin', 'expected', 'not_allowed',
      'actual', v_json->>'error', 'pass', v_json->>'error' = 'not_allowed');

    perform set_config('request.jwt.claims', format(claims, v_support, 'aal1'), true);
    v_json := public.admin_org_list(null, null);
    v_txt := v_json->>'error';
    perform set_config('request.jwt.claims', format(claims, v_support, 'aal2'), true);
    v_json := public.admin_org_list(null, null);
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'an admin needs a second factor', 'expected', 'aal1 not_allowed, aal2 ok',
      'actual', 'aal1 ' || coalesce(v_txt, 'ok') || ', aal2 ' || coalesce(v_json->>'error', 'ok'),
      'pass', v_txt = 'not_allowed' and (v_json->>'ok')::boolean);

    -- 6, 7 --------------------------------------------------------- separate accounts
    begin
      insert into app.platform_admins (user_id, role) values (v_dl, 'support');
      v_ok := false;
    exception when others then v_ok := sqlerrm like '%customer user cannot be a platform admin%';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'a customer account cannot be made an admin', 'expected', 'refused',
      'actual', case when v_ok then 'refused' else 'allowed' end, 'pass', v_ok);

    begin
      insert into app.memberships (org_id, user_id, role) values (v_org, v_support, 'verneombud');
      v_ok := false;
    exception when others then v_ok := sqlerrm like '%platform admin cannot be a member%';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'an admin account cannot join a customer organisation', 'expected', 'refused',
      'actual', case when v_ok then 'refused' else 'allowed' end, 'pass', v_ok);

    -- 8, 9 --------------------------------------------------------- detail and audit
    select count(*) into v_before from app.admin_audit;
    v_json := public.admin_org_detail(v_org);
    select count(*) into v_cnt from app.employees e
    where e.org_id = v_org and (position(e.full_name in v_json::text) > 0 or (e.email is not null and position(e.email in v_json::text) > 0))
      -- a leader who signs in is a user, and users are listed; the check is for everyone else
      and not exists (select 1 from app.memberships m join app.profiles p on p.id = m.user_id
                      where m.org_id = v_org and p.full_name = e.full_name);
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'an organisation''s detail names no employee who is not a user', 'expected', 'ok, 0 names',
      'actual', coalesce(v_json->>'error', 'ok') || ', ' || v_cnt || ' names',
      'pass', (v_json->>'ok')::boolean and v_cnt = 0);

    perform public.admin_org_list('nordvik', null);
    perform public.admin_whoami();
    select count(*) - v_before into v_cnt from app.admin_audit;
    select string_agg(action, ',' order by id) into v_txt from app.admin_audit where id > (select max(id) - 2 from app.admin_audit);
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'every customer-scoped read is audited, with who and what', 'expected', '2 rows: org.view,orgs.list',
      'actual', v_cnt || ' rows: ' || v_txt,
      'pass', v_cnt = 2 and v_txt = 'org.view,orgs.list'
              and exists (select 1 from app.admin_audit where action = 'org.view' and org_id = v_org
                          and admin_email = 'support@admin-test.example' and admin_role = 'support' and org_name is not null));

    -- 10 ------------------------------------------------------------ append-only
    v_ok := true;
    begin update app.admin_audit set reason = 'x'; v_ok := false; exception when others then null; end;
    begin delete from app.admin_audit; v_ok := false; exception when others then null; end;
    begin truncate app.admin_audit; v_ok := false; exception when others then null; end;
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'the audit log cannot be changed, deleted or truncated', 'expected', 'refused',
      'actual', case when v_ok then 'refused' else 'allowed' end, 'pass', v_ok);

    -- 11..14 -------------------------------------------------------- roles
    update app.billing set confirmed_at = null, confirmed_by = null where org_id = v_org;
    v_json := public.admin_extend_trial(v_org, 7, '');
    v_txt := v_json->>'error';
    v_json := public.admin_extend_trial(v_org, 7, 'Customer asked for time to involve the verneombud');
    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'support extends a trial only with a reason, and it is logged', 'expected', 'reason_required, then ok + audit',
      'actual', v_txt || ', then ' || coalesce(v_json->>'error', 'ok'),
      'pass', v_txt = 'reason_required' and (v_json->>'ok')::boolean
              and exists (select 1 from app.admin_audit where action = 'trial.extend' and org_id = v_org and reason like 'Customer asked%'));

    perform set_config('request.jwt.claims', format(claims, v_finance, 'aal2'), true);
    v_json := public.admin_extend_trial(v_org, 7, 'Finance should not be able to do this');
    v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'finance cannot extend a trial', 'expected', 'not_allowed',
      'actual', v_json->>'error', 'pass', v_json->>'error' = 'not_allowed');

    perform set_config('request.jwt.claims', format(claims, v_analyst, 'aal2'), true);
    v_txt := public.admin_org_list(null, null)->>'error';
    v_ok := (public.admin_kpis()->>'ok')::boolean and (public.admin_funnel(12)->>'ok')::boolean;
    v_rows := v_rows || jsonb_build_object('seq', 13, 'name', 'an analyst sees the business, not an organisation', 'expected', 'orgs not_allowed, kpis and funnel ok',
      'actual', 'orgs ' || coalesce(v_txt, 'ok') || ', kpis and funnel ' || case when v_ok then 'ok' else 'refused' end,
      'pass', v_txt = 'not_allowed' and v_ok);

    perform set_config('request.jwt.claims', format(claims, v_support, 'aal2'), true);
    v_txt := public.admin_audit_list(null, 50)->>'error';
    v_json := public.admin_audit_list(v_org, 50);
    v_rows := v_rows || jsonb_build_object('seq', 14, 'name', 'support reads one organisation''s trail, not the whole trail', 'expected', 'all not_allowed, one ok',
      'actual', 'all ' || coalesce(v_txt, 'ok') || ', one ' || coalesce(v_json->>'error', 'ok'),
      'pass', v_txt = 'not_allowed' and (v_json->>'ok')::boolean);

    -- 15 ------------------------------------------------------------ masked errors
    select r.id into v_round from app.rounds r where r.org_id = v_org limit 1;
    insert into app.outbox (org_id, round_id, kind, audience, due_at, attempts, failed_at, last_error)
    values (v_org, v_round, 'resultat', 'verneombud', now() - interval '1 hour', 3, now(), 'rejected: kari.nordmann@example.no is blocked');
    v_txt := (public.admin_ops())::text;
    v_rows := v_rows || jsonb_build_object('seq', 15, 'name', 'provider errors lose their e-mail addresses', 'expected', 'masked',
      'actual', case when v_txt like '%kari.nordmann@example.no%' then 'address shown' when v_txt like '%[address] is blocked%' then 'masked' else 'missing' end,
      'pass', v_txt not like '%kari.nordmann@example.no%' and v_txt like '%[address] is blocked%');

    -- 16 ------------------------------------------------------------ admin accounts
    perform set_config('request.jwt.claims', format(claims, v_super, 'aal2'), true);
    v_json := public.admin_set_admin('new@admin-test.example', 'support', true, 'New support colleague');
    v_txt := public.admin_set_admin((select email from auth.users where id = v_dl), 'support', true, 'Should be refused')->>'error';
    v_rows := v_rows || jsonb_build_object('seq', 16, 'name', 'a super-admin grants a role to an admin account, not a customer one', 'expected', 'ok, customer_account',
      'actual', coalesce(v_json->>'error', 'ok') || ', ' || coalesce(v_txt, 'ok'),
      'pass', (v_json->>'ok')::boolean and v_txt = 'customer_account'
              and exists (select 1 from app.platform_admins where user_id = v_new and role = 'support'));

    -- 17 ------------------------------------------------------------ product events
    perform set_config('request.jwt.claims', format(claims, v_dl, 'aal1'), true);
    perform public.track_product_event('results_viewed');
    perform public.track_product_event('results_viewed');
    perform public.track_product_event('not_an_event');
    select count(*) into v_cnt from app.product_events where user_id = v_dl and day = (now() at time zone 'Europe/Oslo')::date;
    v_rows := v_rows || jsonb_build_object('seq', 17, 'name', 'a leader''s results view is counted once a day', 'expected', '1',
      'actual', v_cnt::text, 'pass', v_cnt = 1);

    perform set_config('request.jwt.claims', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  select count(*) into v_cnt from auth.users where email like '%@admin-test.example';
  v_rows := v_rows || jsonb_build_object('seq', 18, 'name', 'every probe row was rolled back', 'expected', '0',
    'actual', v_cnt::text, 'pass', v_cnt = 0 and not exists (select 1 from app.platform_admins where user_id in (v_super, v_support, v_finance, v_analyst, v_new)));

  insert into public._adi
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._adi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._adi;
  if v_failed is not null then raise exception 'admin invariants failed: %', v_failed; end if;
  if v_count <> 18 then raise exception 'admin invariants: expected 18 rows, got %', v_count; end if;
end $$;

drop table public._adi;
