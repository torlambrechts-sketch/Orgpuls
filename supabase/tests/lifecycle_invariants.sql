-- lifecycle_invariants.sql — the trial's mail and the account health score (0060, D-105).
--
--   * both tables have RLS on, no policy and no client privilege (1)
--   * only the dispatcher may claim and finish; a client may not plan (2)
--   * an organisation from before the sequence started gets nothing (3)
--   * a new organisation gets its welcome, once, and nothing that is not yet true (4, 5)
--   * setup help after 48 hours without employees; skipped at claim once employees exist (6)
--   * the trial's end: queued three days before, skipped at claim once a plan is confirmed (7)
--   * a claim returns the row's facts and marks it sending; done marks it sent (8)
--   * an organisation with mail switched off, or a reserved address, gets nothing (9)
--   * the health score is for admins only, scores with reasons, and marks a qualified trial (10, 11)
--   * nothing written here survives (12)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/lifecycle_invariants.sql

create unlogged table if not exists public._lci(seq int, name text, expected text, actual text, pass bool);
truncate public._lci;

do $$
declare
  v_uid     uuid := '00000000-0000-4000-8000-0000011fec01';
  v_admin   uuid := '00000000-0000-4000-8000-0000011fecad';
  v_old     uuid := '00000000-0000-4000-8000-000000000001';
  v_org     uuid;
  v_rows    jsonb := '[]';
  v_json    jsonb;
  v_cnt     int;
  v_ok      boolean;
  v_txt     text;
  v_id      uuid;
  claims    constant text := '{"sub":"%s","role":"authenticated","aal":"%s"}';
begin
  select bool_and(c.relrowsecurity) into v_ok from pg_class c
  where c.oid in ('app.lifecycle_mail'::regclass, 'app.lifecycle_settings'::regclass);
  v_ok := v_ok and not exists (
    select 1 from information_schema.role_table_grants g
    where g.table_schema = 'app' and g.table_name in ('lifecycle_mail', 'lifecycle_settings') and g.grantee in ('anon', 'authenticated'))
    and not exists (select 1 from pg_policies p where p.schemaname = 'app' and p.tablename in ('lifecycle_mail', 'lifecycle_settings'));
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'lifecycle tables have RLS on, no policy and no client privilege',
    'expected', 'true', 'actual', v_ok::text, 'pass', v_ok);

  v_txt := concat_ws(',',
    has_function_privilege('authenticated', 'public.lifecycle_mail_claim(int)', 'execute'),
    has_function_privilege('authenticated', 'public.lifecycle_mail_done(uuid,boolean,text,text,boolean)', 'execute'),
    has_function_privilege('authenticated', 'app.lifecycle_plan()', 'execute'),
    has_function_privilege('anon', 'public.admin_account_health()', 'execute'),
    has_function_privilege('service_role', 'public.lifecycle_mail_claim(int)', 'execute'));
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'only the dispatcher claims and finishes; no client plans',
    'expected', 'f,f,f,f,t', 'actual', v_txt, 'pass', v_txt = 'f,f,f,f,t');

  begin
    -- the sequence starts now; the fixture organisation predates it
    update app.lifecycle_settings set started_at = now() - interval '1 minute', enabled = true;
    delete from app.lifecycle_mail;

    -- a new organisation, made the way a signup makes one
    insert into auth.users (id, email) values (v_uid, 'dl@lifecycle-test.no'), (v_admin, 'admin@lifecycle-test.no');
    perform set_config('request.jwt.claims', format(claims, v_uid, 'aal1'), true);
    v_json := public.create_organisation('Livsløp AS', '999999997', 25, 'Lise Livsløp');
    perform set_config('request.jwt.claims', '', true);
    select m.org_id into v_org from app.memberships m where m.user_id = v_uid;

    -- 3, 4 --------------------------------------------------------------- who gets the welcome
    v_cnt := app.lifecycle_plan();
    select string_agg(o.name || ':' || lm.step, ',' order by lm.step) into v_txt
    from app.lifecycle_mail lm join app.organizations o on o.id = lm.org_id;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'an organisation from before the sequence gets nothing',
      'expected', '0', 'actual', (select count(*) from app.lifecycle_mail where org_id = v_old)::text,
      'pass', not exists (select 1 from app.lifecycle_mail where org_id = v_old));
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'a new organisation gets its welcome and nothing not yet true',
      'expected', 'Livsløp AS:welcome', 'actual', coalesce(v_txt, 'none'), 'pass', v_txt = 'Livsløp AS:welcome');

    -- 5 ------------------------------------------------------------------- once
    v_cnt := app.lifecycle_plan();
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'planning again adds nothing', 'expected', '0',
      'actual', v_cnt::text, 'pass', v_cnt = 0);

    -- 8 ------------------------------------------------------------------- claim and done
    v_json := public.lifecycle_mail_claim(10);
    v_id := (v_json->0->>'id')::uuid;
    v_txt := concat_ws('|', jsonb_array_length(v_json), v_json->0->>'step', v_json->0->>'to_email', v_json->0->>'name', v_json->0->>'org',
      (select status from app.lifecycle_mail where id = v_id));
    perform public.lifecycle_mail_done(v_id, true, 'msg-1');
    v_txt := v_txt || '|' || (select status from app.lifecycle_mail where id = v_id);
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'a claim carries the facts and leases; done marks sent',
      'expected', '1|welcome|dl@lifecycle-test.no|Lise|Livsløp AS|sending|sent', 'actual', v_txt,
      'pass', v_txt = '1|welcome|dl@lifecycle-test.no|Lise|Livsløp AS|sending|sent');

    -- 6 ------------------------------------------------------------------- setup help, then skipped
    update app.organizations set created_at = now() - interval '50 hours' where id = v_org;
    update app.lifecycle_settings set started_at = now() - interval '3 days';
    perform app.lifecycle_plan();
    v_txt := coalesce((select status from app.lifecycle_mail where org_id = v_org and step = 'setup_help'), 'none');
    insert into app.employees (org_id, full_name, email)
    values (v_org, 'Ansatt En', 'en@lifecycle-test.no');
    perform public.lifecycle_mail_claim(10);
    v_txt := v_txt || ',' || coalesce((select status from app.lifecycle_mail where org_id = v_org and step = 'setup_help'), 'none');
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'setup help after 48 hours; skipped once employees exist',
      'expected', 'pending,skipped', 'actual', v_txt, 'pass', v_txt = 'pending,skipped');

    -- 7 ------------------------------------------------------------------- the trial's end, then skipped
    update app.billing set trial_ends_at = now() + interval '2 days' where org_id = v_org;
    perform app.lifecycle_plan();
    v_txt := coalesce((select status from app.lifecycle_mail where org_id = v_org and step = 'trial_ending'), 'none');
    update app.billing set plan = 'small', invoice_email = 'faktura@lifecycle-test.no', confirmed_at = now() where org_id = v_org;
    perform public.lifecycle_mail_claim(10);
    v_txt := v_txt || ',' || coalesce((select status from app.lifecycle_mail where org_id = v_org and step = 'trial_ending'), 'none');
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'trial ending: queued three days before; skipped once confirmed',
      'expected', 'pending,skipped', 'actual', v_txt, 'pass', v_txt = 'pending,skipped');

    -- 9 ------------------------------------------------------------------- switched off, reserved
    update app.billing set confirmed_at = null, plan = null, invoice_email = null, trial_ends_at = now() + interval '1 day' where org_id = v_org;
    delete from app.lifecycle_mail where org_id = v_org and step = 'trial_ending';
    update app.organizations set mail_enabled = false where id = v_org;
    perform app.lifecycle_plan();
    v_txt := coalesce((select status from app.lifecycle_mail where org_id = v_org and step = 'trial_ending'), 'none');
    update app.organizations set mail_enabled = true where id = v_org;
    update auth.users set email = 'dl@example.com' where id = v_uid;
    perform app.lifecycle_plan();
    v_txt := v_txt || ',' || coalesce((select status from app.lifecycle_mail where org_id = v_org and step = 'trial_ending'), 'none');
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'mail switched off, or a reserved address: nothing queued',
      'expected', 'none,none', 'actual', v_txt, 'pass', v_txt = 'none,none');

    -- 10, 11 --------------------------------------------------------------- health
    perform set_config('request.jwt.claims', format(claims, v_uid, 'aal2'), true);
    v_txt := coalesce(public.admin_account_health()->>'error', 'ok');
    insert into app.platform_admins (user_id, role) values (v_admin, 'marketing');
    perform set_config('request.jwt.claims', format(claims, v_admin, 'aal1'), true);
    v_txt := v_txt || ',' || coalesce(public.admin_account_health()->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_admin, 'aal2'), true);
    v_json := public.admin_account_health();
    v_txt := v_txt || ',' || coalesce(v_json->>'error', 'ok');
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'health: not a customer, not without aal2; an admin may',
      'expected', 'not_allowed,not_allowed,ok', 'actual', v_txt, 'pass', v_txt = 'not_allowed,not_allowed,ok');

    select concat_ws('|', r->>'score', r->>'activation_points', r->>'size_points', r->>'qualified', r->>'access')
      into v_txt from jsonb_array_elements(v_json->'rows') r where (r->>'id')::uuid = v_org;
    -- employees uploaded only: 10 of activation; 25 stated employees: 10 of size; no sign-in; no round
    v_ok := v_txt = '20|10|10|false|trial';
    select concat_ws('|', r->>'unlocked', r->>'qualified') into v_txt
      from jsonb_array_elements(v_json->'rows') r where (r->>'id')::uuid = v_old;
    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'scored with its parts; a trial with results is qualified, others not',
      'expected', '20|10|10|false|trial; fixture unlocked', 'actual', (case when v_ok then '20|10|10|false|trial' else 'wrong' end) || '; fixture ' || coalesce(v_txt, 'none'),
      'pass', v_ok and v_txt like 'true|%');

    perform set_config('request.jwt.claims', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'every probe row was rolled back', 'expected', '0',
    'actual', (select count(*) from auth.users where email like '%@lifecycle-test.no')::text,
    'pass', not exists (select 1 from auth.users where email like '%@lifecycle-test.no')
      and not exists (select 1 from app.organizations where org_number = '999999997'));

  insert into public._lci
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._lci order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._lci;
  if v_failed is not null then raise exception 'lifecycle invariants failed: %', v_failed; end if;
  if v_count <> 12 then raise exception 'lifecycle invariants: expected 12 rows, got %', v_count; end if;
end $$;

drop table public._lci;
