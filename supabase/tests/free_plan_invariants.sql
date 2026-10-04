-- free_plan_invariants.sql — the free plan the trial lands on, and yearly billing (0201, D-217),
-- proved on a probe organisation of its own, rolled back.
--
--   1 past the trial and its grace, unconfirmed, access is free; members read it with its date
--   2 free: starting a puls is refused (free_plan)
--   3 free: adding a month to the wheel is refused; skipping one is not
--   4 free: a new grunnlinje does not take the enabled modules; in the trial the same insert does
--   5 free: turning a module on is refused; turning it off is not
--   6 free: a measurement of another kind is refused at the table; a grunnlinje is not
--   7 free: a round's module row written directly is refused
--   8 free: an own question is refused (add_round_question)
--   9 free: the wheel holds a due puls back and sends nothing for it, plans no new one, and opens a
--     due grunnlinje without its module and own-question rows
--  10 save_billing stores the interval: year, the default month, and refuses another
--  11 a yearly plan cancelled runs to the end of its paid year; a monthly one to the end of month
--  12 a year is ten months' price; MRR counts a twelfth of it
--  13 in the trial nothing of this applies: a puls is not refused as free_plan
--  14 the unguarded originals and the helpers are not callable by a client
--  15 nothing written here survives
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/free_plan_invariants.sql

create unlogged table if not exists public._fpi(seq int, name text, expected text, actual text, pass bool);
truncate public._fpi;

do $$
declare
  v_org    uuid := '00000000-0000-4000-8000-00000000f199';
  v_dl     uuid := '00000000-0000-4000-8000-00000000f19a';
  v_tz     text := 'Europe/Oslo';
  v_y      int := extract(year from now())::int + 1;
  v_mod    uuid;
  v_meas   uuid;
  v_gmeas  uuid;
  v_round  uuid;
  v_puls   uuid;
  v_grunn  uuid;
  v_q      uuid;
  v_json   jsonb;
  v_txt    text;
  v_n      int;
  v_copied text;
  v_ok     boolean;
  v_r      app.rounds;
  v_rows   jsonb := '[]';
  claims   constant text := '{"sub":"%s","role":"authenticated","aal":"aal1"}';
begin
  begin
    insert into app.organizations (id, name, org_number, employee_count, mail_enabled, timezone)
    values (v_org, 'Gratisplan AS', '999000201', 9, true, v_tz);
    insert into auth.users (id, email) values (v_dl, 'dl@gratis-test.example');
    insert into app.profiles (id, full_name) values (v_dl, 'DL') on conflict (id) do nothing;
    insert into app.memberships (org_id, user_id, role, active) values (v_org, v_dl, 'daglig_leder', true);

    perform app.module_seed(jsonb_build_object(
      'module_id', 'probe-gratis', 'version', '0.0.1', 'name', 'Probe', 'description', 'Probe', 'estimated_minutes', 1,
      'scale', '{}'::jsonb, 'scoring', '{}'::jsonb, 'anonymity', '{"min_responses": 5, "can_lower": false}'::jsonb,
      'sources', '[]'::jsonb,
      'factors', jsonb_build_array(jsonb_build_object('id', 'f', 'name', 'F', 'summary', 'S', 'rationale', 'R',
        'rationale_sources', '[]'::jsonb, 'legal_basis', '[]'::jsonb,
        'items', '[{"id":"PG-FF-1","text":"a","reverse":false,"pulse_eligible":true},{"id":"PG-FF-2","text":"b","reverse":false,"pulse_eligible":true},{"id":"PG-FF-3","text":"c","reverse":false,"pulse_eligible":true}]'::jsonb,
        'action_suggestions', '[]'::jsonb)),
      'count_items', '[]'::jsonb, 'segments', '[]'::jsonb), repeat('e', 64));
    perform app.module_set_status('probe-gratis', '0.0.1', 'published');
    select m.id into v_mod from app.question_modules m where m.key = 'probe-gratis';

    -- set up in the trial what the trial may do: a module on, a wheel, an open measure, a planned
    -- puls and grunnlinje that fall due, the grunnlinje with a module row and an own question
    insert into app.org_modules (org_id, module_key, enabled) values (v_org, 'probe-gratis', true);
    insert into app.year_wheels (org_id, cadence, active, extend_if_low) values (v_org, 'manedspuls', true, false);
    insert into app.measures (org_id, title, factor_key) values (v_org, 'Probe', (select f.key from app.factors f order by f.key limit 1));
    insert into app.measurements (org_id, kind, year) values (v_org, 'puls', v_y - 1) returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'planlagt', now() + interval '2 days', now() + interval '9 days') returning id into v_puls;
    insert into app.measurements (org_id, kind, year) values (v_org, 'grunnlinje', v_y - 1) returning id into v_gmeas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_gmeas, 'planlagt', now() + interval '2 days', now() + interval '9 days') returning id into v_grunn;
    insert into app.org_questions (org_id, body) values (v_org, 'Probe?') returning id into v_q;
    insert into app.round_org_questions (round_id, question_id) values (v_grunn, v_q);
    set constraints all immediate;
    set constraints all deferred;

    -- the trial's control for 4: a grunnlinje inserted now takes the module
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_gmeas, 'planlagt', make_timestamptz(v_y, 3, 2, 9, 0, 0, v_tz), make_timestamptz(v_y, 3, 9, 9, 0, 0, v_tz))
    returning id into v_round;
    v_copied := (select count(*) from app.round_modules where round_id = v_round)::text;

    -- 13 ----------------------------------------------------------- the trial is not free
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_json := public.start_next_pulse(v_org);
    v_rows := v_rows || jsonb_build_object('seq', 13, 'name', 'in the trial a puls is not refused as free_plan',
      'expected', 'not free_plan', 'actual', coalesce(v_json->>'error', 'ok'), 'pass', coalesce(v_json->>'error', 'ok') <> 'free_plan');
    perform set_config('request.jwt.claims', '', true);
    -- start_next_pulse may have opened a puls in the trial; keep the probe's own rounds the only ones
    delete from app.rounds where org_id = v_org and id not in (v_puls, v_grunn, v_round) and status = 'planlagt';

    -- from here on the free plan
    update app.billing set trial_started_at = now() - interval '45 days', trial_ends_at = now() - interval '30 days'
    where org_id = v_org;

    -- 1 ------------------------------------------------------------ the state
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_json := public.org_access_state(v_org);
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'past trial and grace, unconfirmed: free, with its date',
      'expected', 'free,true', 'actual', app.org_access(v_org) || ',' || (v_json ? 'free_from')::text,
      'pass', app.org_access(v_org) = 'free' and v_json->>'access' = 'free' and v_json ? 'free_from');

    -- 2 ------------------------------------------------------------ a puls
    v_json := public.start_next_pulse(v_org);
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'free: starting a puls is refused',
      'expected', 'free_plan', 'actual', coalesce(v_json->>'error', 'ok'), 'pass', v_json->>'error' = 'free_plan');

    -- 3 ------------------------------------------------------------ the wheel's months
    v_txt := coalesce(public.wheel_month_change(v_org, v_y, 5, 'legg_til')->>'error', 'ok') || ','
          || coalesce(public.wheel_month_change(v_org, v_y, 6, 'hopp_over')->>'error', 'ok');
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'free: adding a month is refused, skipping one is not',
      'expected', 'free_plan,not free_plan', 'actual', v_txt,
      'pass', split_part(v_txt, ',', 1) = 'free_plan' and split_part(v_txt, ',', 2) <> 'free_plan');
    perform set_config('request.jwt.claims', '', true);

    -- 4 ------------------------------------------------------------ the module copy
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_gmeas, 'planlagt', make_timestamptz(v_y, 4, 6, 9, 0, 0, v_tz), make_timestamptz(v_y, 4, 13, 9, 0, 0, v_tz))
    returning id into v_round;
    v_txt := v_copied || ',' || (select count(*) from app.round_modules where round_id = v_round)::text;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'a new grunnlinje takes the module in the trial and not on the free plan',
      'expected', '1,0', 'actual', v_txt, 'pass', v_txt = '1,0');
    delete from app.rounds where id = v_round;

    -- 7 ------------------------------------------------------------ a module row written directly
    begin
      insert into app.round_modules (org_id, round_id, module_id, item_ids)
      values (v_org, v_grunn, v_mod, array[]::uuid[]);
      v_txt := 'written';
    exception when others then v_txt := case when sqlerrm like 'free_plan%' then 'free_plan' else sqlerrm end;
    end;
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'free: a round''s module row written directly is refused',
      'expected', 'free_plan', 'actual', v_txt, 'pass', v_txt = 'free_plan');

    -- 5 ------------------------------------------------------------ the module switch
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_txt := coalesce(public.set_org_module(v_org, 'probe-gratis', true)->>'error', 'ok') || ','
          || coalesce(public.set_org_module(v_org, 'probe-gratis', false)->>'error', 'ok');
    perform set_config('request.jwt.claims', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'free: turning a module on is refused, off is not',
      'expected', 'free_plan,ok', 'actual', v_txt, 'pass', v_txt = 'free_plan,ok');

    -- 6 ------------------------------------------------------------ the measurement's kind
    begin
      insert into app.measurements (org_id, kind, year) values (v_org, 'puls', v_y);
      v_txt := 'written';
    exception when others then v_txt := case when sqlerrm like 'free_plan%' then 'free_plan' else sqlerrm end;
    end;
    begin
      update app.measurements set kind = 'oppfolging' where id = v_gmeas;
      v_txt := v_txt || ',written';
    exception when others then v_txt := v_txt || ',' || case when sqlerrm like 'free_plan%' then 'free_plan' else sqlerrm end;
    end;
    begin
      insert into app.measurements (org_id, kind, year) values (v_org, 'grunnlinje', v_y);
      v_txt := v_txt || ',written';
    exception when others then v_txt := v_txt || ',' || sqlerrm;
    end;
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'free: another kind is refused at the table, a grunnlinje is not',
      'expected', 'free_plan,free_plan,written', 'actual', v_txt, 'pass', v_txt = 'free_plan,free_plan,written');

    -- 8 ------------------------------------------------------------ an own question
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    set local role authenticated;
    begin
      perform public.add_round_question(v_grunn, 'Enda en?', 'skala');
      v_txt := 'written';
    exception when others then v_txt := case when sqlerrm like 'free_plan%' then 'free_plan' else sqlerrm end;
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'free: an own question is refused',
      'expected', 'free_plan', 'actual', v_txt, 'pass', v_txt = 'free_plan');

    -- 9 ------------------------------------------------------------ the wheel
    update app.rounds set opens_at = now() - interval '1 hour', closes_at = now() + interval '6 days' where id in (v_puls, v_grunn);
    select count(*) into v_n from app.rounds r join app.measurements ms on ms.id = r.measurement_id
    where r.org_id = v_org and ms.kind <> 'grunnlinje';
    perform app.wheel_tick();
    select * into v_r from app.rounds where id = v_puls;
    v_ok := v_r.status = 'planlagt' and v_r.opens_at > now()
      and not exists (select 1 from app.outbox x where x.round_id = v_puls)
      and v_n = (select count(*) from app.rounds r join app.measurements ms on ms.id = r.measurement_id
                 where r.org_id = v_org and ms.kind <> 'grunnlinje');
    v_txt := v_r.status || ',' || case when v_r.opens_at > now() then 'later' else 'due' end;
    select * into v_r from app.rounds where id = v_grunn;
    v_txt := v_txt || ',' || v_r.status || ',' || (select count(*) from app.round_modules where round_id = v_grunn)
          || ',' || (select count(*) from app.round_org_questions where round_id = v_grunn);
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'free: the wheel holds a puls, plans none, opens a bare grunnlinje',
      'expected', 'planlagt,later,apen,0,0', 'actual', v_txt, 'pass', v_ok and v_txt = 'planlagt,later,apen,0,0');

    -- 10 ----------------------------------------------------------- the interval
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_json := public.save_billing(v_org, 'small', 'faktura@gratis.example', null, false, false, 'year');
    v_txt := coalesce(v_json->>'error', 'ok') || ',' || (select billing_interval from app.billing where org_id = v_org);
    v_json := public.save_billing(v_org, 'small', 'faktura@gratis.example', null, false, false);
    v_txt := v_txt || ',' || (select billing_interval from app.billing where org_id = v_org);
    v_json := public.save_billing(v_org, 'small', 'faktura@gratis.example', null, false, false, 'week');
    v_txt := v_txt || ',' || coalesce(v_json->>'error', 'ok');
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'save_billing stores year, defaults to month, refuses another',
      'expected', 'ok,year,month,invalid_interval', 'actual', v_txt, 'pass', v_txt = 'ok,year,month,invalid_interval');

    -- 11 ----------------------------------------------------------- cancelling
    -- a yearly plan that started 400 days ago runs to the day before its second anniversary
    update app.billing set billing_interval = 'year', confirmed_at = now() - interval '400 days',
                           trial_started_at = now() - interval '430 days', trial_ends_at = now() - interval '415 days'
    where org_id = v_org;
    v_json := public.cancel_subscription(v_org, 'price', true);
    v_txt := (v_json->>'last_day') || '=' || ((((now() - interval '400 days') at time zone v_tz)::date + interval '2 years' - interval '1 day')::date)::text;
    update app.billing set cancelled_at = null, cancel_effective_at = null, deletion_due_at = null, billing_interval = 'month'
    where org_id = v_org;
    v_json := public.cancel_subscription(v_org, 'price', true);
    v_txt := v_txt || ',' || (v_json->>'last_day') || '='
          || ((date_trunc('month', (now() at time zone v_tz)::date) + interval '1 month - 1 day')::date)::text;
    perform set_config('request.jwt.claims', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'a year runs to the end of its paid year, a month to its end',
      'expected', 'equal,equal', 'actual', v_txt,
      'pass', split_part(split_part(v_txt, ',', 1), '=', 1) = split_part(split_part(v_txt, ',', 1), '=', 2)
          and split_part(split_part(v_txt, ',', 2), '=', 1) = split_part(split_part(v_txt, ',', 2), '=', 2));

    raise exception 'rollback';
  exception when others then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 12 ------------------------------------------------------------- the money
  v_txt := app.annual_months() || ',' || app.plan_mrr_nok('small', 'year') || ',' || app.plan_mrr_nok('usual', 'year')
        || ',' || app.plan_mrr_nok('usual', 'month') || ',' || coalesce(app.plan_mrr_nok('group', 'year')::text, 'null');
  v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'a year is ten months'' price; MRR is a twelfth of it',
    'expected', '10,221,471,565,null', 'actual', v_txt, 'pass', v_txt = '10,221,471,565,null');

  -- 14 ------------------------------------------------------------- closed to clients
  v_ok := not has_function_privilege('authenticated', 'app.wheel_month_change_unchecked(uuid,int,int,text)', 'execute')
      and not has_function_privilege('authenticated', 'app.set_org_module_unchecked(uuid,text,boolean)', 'execute')
      and not has_function_privilege('authenticated', 'app.org_free(uuid)', 'execute')
      and not has_function_privilege('authenticated', 'app.plan_mrr_nok(text,text)', 'execute')
      and not has_function_privilege('anon', 'public.save_billing(uuid,text,text,text,boolean,boolean,text)', 'execute')
      and has_function_privilege('authenticated', 'public.wheel_month_change(uuid,int,int,text)', 'execute')
      and has_function_privilege('authenticated', 'public.set_org_module(uuid,text,boolean)', 'execute');
  v_rows := v_rows || jsonb_build_object('seq', 14, 'name', 'the originals and helpers are closed; the guarded names are open',
    'expected', 'true', 'actual', v_ok::text, 'pass', v_ok);

  -- 15 ------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from app.organizations where id = v_org;
  v_txt := v_txt || ',' || (select count(*) from app.question_modules where key = 'probe-gratis');
  v_rows := v_rows || jsonb_build_object('seq', 15, 'name', 'every probe row was rolled back', 'expected', '0,0', 'actual', v_txt, 'pass', v_txt = '0,0');

  insert into public._fpi
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._fpi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._fpi;
  if v_failed is not null then raise exception 'free plan invariants failed: %', v_failed; end if;
  if v_count <> 15 then raise exception 'free plan invariants: expected 15 rows, got %', v_count; end if;
end $$;
