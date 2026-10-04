-- downgrade_invariants.sql — a paying customer moves to the free plan (0202, D-226), proved on a probe
-- organisation of its own, rolled back.
--
--   1 a verneombud may not choose it; without the confirmation, or in the trial, it is refused
--   2 a monthly plan: the free plan begins the day after the month ends; access stays active until then
--   3 chosen twice: refused; taken back: free_from cleared
--   4 a yearly plan: the free plan begins the day after its paid year
--   5 the day has come: access is free at once, and the tick clears the confirmation (MRR, paying)
--   6 confirming a plan again: active, a new confirmation, free_from cleared
--   7 chosen before the trial ended: nothing invoiced, the free plan begins when the trial ends
--   8 the admin's organisation detail names the interval and free_from; admin_kpis counts free_plan
--   9 the helpers are closed to clients; the two RPCs are open to authenticated
--  10 nothing written here survives
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/downgrade_invariants.sql

create unlogged table if not exists public._dgi(seq int, name text, expected text, actual text, pass bool);
truncate public._dgi;

do $$
declare
  v_org   uuid := '00000000-0000-4000-8000-00000000f202';
  v_dl    uuid := '00000000-0000-4000-8000-00000000f20a';
  v_vo    uuid := '00000000-0000-4000-8000-00000000f20b';
  v_tz    text := 'Europe/Oslo';
  v_today date := (now() at time zone 'Europe/Oslo')::date;
  v_json  jsonb;
  v_txt   text;
  v_ok    boolean;
  b       app.billing;
  v_rows  jsonb := '[]';
  claims  constant text := '{"sub":"%s","role":"authenticated","aal":"aal1"}';
begin
  begin
    insert into app.organizations (id, name, org_number, employee_count, mail_enabled, timezone)
    values (v_org, 'Nedgradering AS', '999000202', 9, true, v_tz);
    insert into auth.users (id, email) values (v_dl, 'dl@ned-test.example'), (v_vo, 'vo@ned-test.example');
    insert into app.profiles (id, full_name) values (v_dl, 'DL'), (v_vo, 'VO') on conflict (id) do nothing;
    insert into app.memberships (org_id, user_id, role, active) values (v_org, v_dl, 'daglig_leder', true), (v_org, v_vo, 'verneombud', true);

    -- 1 ------------------------------------------------------------- who, and when
    perform set_config('request.jwt.claims', format(claims, v_vo), true);
    v_txt := coalesce(public.downgrade_to_free(v_org, true)->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_txt := v_txt || ',' || coalesce(public.downgrade_to_free(v_org, false)->>'error', 'ok')
          || ',' || coalesce(public.downgrade_to_free(v_org, true)->>'error', 'ok');
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'not a verneombud, not unconfirmed, not in the trial',
      'expected', 'not_allowed,confirm_required,not_subscribed', 'actual', v_txt, 'pass', v_txt = 'not_allowed,confirm_required,not_subscribed');

    -- a monthly subscription that started 40 days ago
    update app.billing set trial_started_at = now() - interval '55 days', trial_ends_at = now() - interval '40 days',
                           plan = 'small', invoice_email = 'f@ned.example', confirmed_at = now() - interval '40 days',
                           billing_interval = 'month'
    where org_id = v_org;

    -- 2 ------------------------------------------------------------- monthly
    v_json := public.downgrade_to_free(v_org, true);
    select * into b from app.billing where org_id = v_org;
    v_txt := (v_json->>'last_day') || ',' || ((b.free_from at time zone v_tz)::date)::text || ',' || app.org_access(v_org);
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'monthly: free from the day after the month; active until then',
      'expected', ((date_trunc('month', v_today) + interval '1 month - 1 day')::date)::text || ','
               || ((date_trunc('month', v_today) + interval '1 month')::date)::text || ',active',
      'actual', v_txt,
      'pass', v_txt = ((date_trunc('month', v_today) + interval '1 month - 1 day')::date)::text || ','
               || ((date_trunc('month', v_today) + interval '1 month')::date)::text || ',active');

    -- 3 ------------------------------------------------------------- twice, and taken back
    -- one call per statement: within one expression the order of evaluation is not fixed
    v_txt := coalesce(public.downgrade_to_free(v_org, true)->>'error', 'ok');
    v_txt := v_txt || ',' || coalesce(public.withdraw_downgrade(v_org)->>'error', 'ok');
    v_txt := v_txt || ',' || coalesce((select free_from::text from app.billing where org_id = v_org), 'null');
    v_txt := v_txt || ',' || coalesce(public.withdraw_downgrade(v_org)->>'error', 'ok');
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'chosen twice is refused; taken back clears it',
      'expected', 'already_chosen,ok,null,not_chosen', 'actual', v_txt, 'pass', v_txt = 'already_chosen,ok,null,not_chosen');

    -- 4 ------------------------------------------------------------- yearly, started 400 days ago
    update app.billing set billing_interval = 'year', confirmed_at = now() - interval '400 days',
                           trial_started_at = now() - interval '430 days', trial_ends_at = now() - interval '415 days'
    where org_id = v_org;
    v_json := public.downgrade_to_free(v_org, true);
    v_txt := v_json->>'last_day';
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'yearly: free from the day after the paid year',
      'expected', ((((now() - interval '400 days') at time zone v_tz)::date + interval '2 years' - interval '1 day')::date)::text,
      'actual', v_txt,
      'pass', v_txt = ((((now() - interval '400 days') at time zone v_tz)::date + interval '2 years' - interval '1 day')::date)::text);

    -- 5 ------------------------------------------------------------- the day comes
    update app.billing set free_from = now() - interval '1 hour' where org_id = v_org;
    v_txt := app.org_access(v_org) || ',' || coalesce((select confirmed_at::text from app.billing where org_id = v_org), 'null');
    perform app.billing_downgrade_tick();
    v_txt := v_txt || ',' || app.org_access(v_org) || ',' || coalesce((select confirmed_at::text from app.billing where org_id = v_org), 'null');
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'on the day: free at once, the tick clears the confirmation',
      'expected', 'free,(confirmed),free,null', 'actual', regexp_replace(v_txt, '^free,[^,]+,', 'free,(confirmed),'),
      'pass', v_txt ~ '^free,[0-9]' and v_txt ~ ',free,null$');

    -- 6 ------------------------------------------------------------- confirming again
    v_json := public.save_billing(v_org, 'small', 'f@ned.example', null, false, true, 'month');
    select * into b from app.billing where org_id = v_org;
    v_txt := coalesce(v_json->>'error', 'ok') || ',' || app.org_access(v_org) || ','
          || (b.confirmed_at > now() - interval '1 minute')::text || ',' || coalesce(b.free_from::text, 'null');
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'confirming again: active, a new confirmation, free_from cleared',
      'expected', 'ok,active,true,null', 'actual', v_txt, 'pass', v_txt = 'ok,active,true,null');

    -- 7 ------------------------------------------------------------- confirmed in the trial, chosen before it ends
    update app.billing set trial_started_at = now() - interval '5 days', trial_ends_at = now() + interval '40 days',
                           confirmed_at = now() - interval '1 day', billing_interval = 'month', free_from = null
    where org_id = v_org;
    v_json := public.downgrade_to_free(v_org, true);
    v_txt := v_json->>'last_day';
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'chosen in the trial: free when the trial ends, nothing invoiced',
      'expected', ((((now() + interval '40 days') at time zone v_tz)::date) - 1)::text, 'actual', v_txt,
      'pass', v_txt = ((((now() + interval '40 days') at time zone v_tz)::date) - 1)::text);
    perform set_config('request.jwt.claims', '', true);

    -- 8 ------------------------------------------------------------- the admin
    v_txt := (pg_get_functiondef('public.admin_org_detail(uuid)'::regprocedure) like '%''billing_interval'', b.billing_interval%')::text || ','
          || (pg_get_functiondef('public.admin_org_detail(uuid)'::regprocedure) like '%app.plan_mrr_nok(b.plan, b.billing_interval)%')::text || ','
          || (pg_get_functiondef('public.admin_kpis()'::regprocedure) like '%''free_plan''%')::text;
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'admin detail names the interval and its MRR; admin_kpis counts free_plan',
      'expected', 'true,true,true', 'actual', v_txt, 'pass', v_txt = 'true,true,true');

    raise exception 'rollback';
  exception when others then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 9 --------------------------------------------------------------- grants
  v_ok := not has_function_privilege('authenticated', 'app.paid_last_day(uuid)', 'execute')
      and not has_function_privilege('authenticated', 'app.billing_downgrade_tick()', 'execute')
      and not has_function_privilege('anon', 'public.downgrade_to_free(uuid,boolean)', 'execute')
      and has_function_privilege('authenticated', 'public.downgrade_to_free(uuid,boolean)', 'execute')
      and has_function_privilege('authenticated', 'public.withdraw_downgrade(uuid)', 'execute');
  v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'helpers closed; the two RPCs open to authenticated only',
    'expected', 'true', 'actual', v_ok::text, 'pass', v_ok);

  -- 10 -------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from app.organizations where id = v_org;
  v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._dgi
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._dgi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._dgi;
  if v_failed is not null then raise exception 'downgrade invariants failed: %', v_failed; end if;
  if v_count <> 10 then raise exception 'downgrade invariants: expected 10 rows, got %', v_count; end if;
end $$;
