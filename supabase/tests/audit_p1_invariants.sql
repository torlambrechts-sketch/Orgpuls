-- audit_p1_invariants.sql — P1s of the 2026-09-28 deep audit that live in the database (0107).
--
--   * AUD-05: choosing the lead moves the three rungs even when the stored number is the same;
--     the daglig leder only (1)
--   * AUD-12: an evaluation cannot be recorded in the future; today is accepted (2)
--   * AUD-11: a measure inserted with a past created_at is logged at that day, inferred; an
--     inferred step gives no «startet» and counts in «Siden sist» only when made since (3, 4)
--   * nothing written here survives (5)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/audit_p1_invariants.sql

create unlogged table if not exists public._ap1(seq int, name text, expected text, actual text, pass bool);
truncate public._ap1;

do $$
declare
  v_org    uuid := '00000000-0000-4000-8000-00000000a911';
  v_dl     uuid := '00000000-0000-4000-8000-0000000a9111';
  v_vo     uuid := '00000000-0000-4000-8000-0000000a9112';
  v_wheel  uuid;
  v_meas   uuid;
  v_gl     uuid;
  v_pl     uuid;
  v_m      uuid;
  v_json   jsonb;
  v_txt    text;
  v_rows   jsonb := '[]';
  v_cnt    int;
begin
  begin
    insert into app.organizations (id, name, org_number, employee_count) values (v_org, 'Revisjon To AS', '999000951', 8);
    insert into auth.users (id, email) values (v_dl, 'dl@ap1-probe.no'), (v_vo, 'vo@ap1-probe.no');
    insert into app.profiles (id, full_name) values (v_dl, 'Dina'), (v_vo, 'Vera');
    insert into app.memberships (org_id, user_id, role) values (v_org, v_dl, 'daglig_leder'), (v_org, v_vo, 'verneombud');

    -- 1 -------------------------------------------------------------- the chip at the stored value
    -- a Veiviser ladder: rungs at 2 under the column's default of 14
    insert into app.year_wheels (org_id, notify_lead_days) values (v_org, 14) returning id into v_wheel;
    insert into app.wheel_notifications (wheel_id, audience, lead_days, sort_order) values
      (v_wheel, 'verneombud', 2, 1), (v_wheel, 'tillitsvalgte', 2, 2), (v_wheel, 'daglig_leder', 1, 3),
      (v_wheel, 'avdelingsledere', 1, 4), (v_wheel, 'alle_ansatte', 1, 5);
    perform set_config('request.jwt.claims', json_build_object('sub', v_vo, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      perform public.set_wheel_lead(v_org, 14);
      v_txt := 'verneombud may';
    exception when insufficient_privilege then
      v_txt := 'denied';
    end;
    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    v_txt := v_txt || '|' || (public.set_wheel_lead(v_org, 14)->>'ok') || '|' || (public.set_wheel_lead(v_org, 0)->>'error');
    reset role;
    v_txt := v_txt || '|' || (select string_agg(audience::text || '=' || lead_days, ',' order by audience::text)
                               from app.wheel_notifications where wheel_id = v_wheel);
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'choosing 14 over a stored 14 moves the three rungs; verneombud refused; 0 out of range',
      'expected', 'denied|true|range|alle_ansatte=1,avdelingsledere=1,daglig_leder=14,tillitsvalgte=14,verneombud=14', 'actual', v_txt,
      'pass', v_txt = 'denied|true|range|alle_ansatte=1,avdelingsledere=1,daglig_leder=14,tillitsvalgte=14,verneombud=14');

    -- 2 -------------------------------------------------------------- no evaluation in the future
    begin
      insert into app.evaluations (org_id, held_on) values (v_org, (now() at time zone 'Europe/Oslo')::date + 1);
      v_txt := 'future accepted';
    exception when check_violation then
      v_txt := 'future refused';
    end;
    insert into app.evaluations (org_id, held_on) values (v_org, (now() at time zone 'Europe/Oslo')::date);
    v_txt := v_txt || '|' || (select count(*) from app.evaluations where org_id = v_org);
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'an evaluation dated tomorrow is refused; today is recorded',
      'expected', 'future refused|1', 'actual', v_txt, 'pass', v_txt = 'future refused|1');

    -- 3 -------------------------------------------------------------- a measure from the past
    insert into app.measures (org_id, factor_key, title, step, created_at)
    values (v_org, 'kontakt', 'Importert tiltak', 'pagar', now() - interval '90 days') returning id into v_m;
    select concat_ws('|', count(*), bool_and(inferred)::text, (min(at) < now() - interval '89 days')::text)
      into v_txt from app.measure_steps where measure_id = v_m;
    insert into app.measures (org_id, factor_key, title, step) values (v_org, 'kontakt', 'Nytt tiltak', 'pagar') returning id into v_m;
    v_txt := v_txt || '|' || (select bool_and(not inferred)::text from app.measure_steps where measure_id = v_m);
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'a measure made 90 days ago is logged then, inferred; one made now is logged now, recorded',
      'expected', '1|true|true|true', 'actual', v_txt, 'pass', v_txt = '1|true|true|true');

    -- 4 -------------------------------------------------------------- what the survey prints
    insert into app.measurements (org_id, kind, year, label) values (v_org, 'grunnlinje', 2026, 'G') returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at, frozen_at)
    values (v_org, v_meas, 'lukket', now() - interval '60 days', now() - interval '50 days', now() - interval '50 days') returning id into v_gl;
    insert into app.measurements (org_id, kind, year, label) values (v_org, 'puls', 2026, 'P') returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'apen', now() - interval '1 day', now() + interval '6 days') returning id into v_pl;
    insert into app.round_factors (org_id, round_id, factor_key) values (v_org, v_pl, 'kontakt');
    v_json := app.pulse_reasons(v_pl);
    select concat_ws('|',
      (select string_agg(i->>'title' || ':' || coalesce(i->>'started', 'none'), ',' order by i->>'title')
         from jsonb_array_elements(v_json->'kontakt') i),
      (select string_agg(i->>'title', ',' order by i->>'title') from jsonb_array_elements(app.since_last(v_pl)->'items') i))
      into v_txt;
    -- «Importert» has no recorded start and was made before the grunnlinje: no date, not «since»
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'an inferred step prints no start and is not «since» when made before the grunnlinje',
      'expected', 'Importert tiltak:none,Nytt tiltak:' || (now() at time zone 'Europe/Oslo')::date || '|Nytt tiltak', 'actual', v_txt,
      'pass', v_txt = 'Importert tiltak:none,Nytt tiltak:' || (now() at time zone 'Europe/Oslo')::date || '|Nytt tiltak');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 5 ----------------------------------------------------------------- nothing survives
  select count(*) into v_cnt from (
    select id::text from app.organizations where id = v_org
    union all select id::text from auth.users where id in (v_dl, v_vo)) x;
  v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'every probe row was rolled back',
    'expected', '0', 'actual', v_cnt::text, 'pass', v_cnt = 0);

  insert into public._ap1
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._ap1 order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._ap1;
  if v_failed is not null then raise exception 'audit p1 invariants failed: %', v_failed; end if;
  if v_count <> 5 then raise exception 'audit p1 invariants: expected 5 rows, got %', v_count; end if;
end $$;

drop table public._ap1;
