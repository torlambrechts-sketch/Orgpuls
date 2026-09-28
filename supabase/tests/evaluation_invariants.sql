-- evaluation_invariants.sql — two settings that now have an effect (0103, audit A-01 and A-02,
-- D-153), proved against the live schema.
--
--   A-01 Årshjulet's «N dager før»
--   * changing year_wheels.notify_lead_days moves the verneombud's, the tillitsvalgtes' and the
--     daglig leder's rows of the ladder, and leaves avdelingsledere and alle ansatte (1)
--   * saving the wheel with the same value leaves a ladder the Veiviser wrote alone (2)
--
--   A-02 «Evaluering av ordningen» (aml. § 9-2 tredje ledd)
--   * nothing is due before a round has closed (3)
--   * årlig: a year after the first close; hver 6. måned: six months; etter hver runde: nothing
--     until another round closes, then that day (4)
--   * a recorded evaluation moves the next due date on from it (5)
--   * the daglig leder or the verneombud records one; an avdelingsleder may not; a member reads
--     them, a stranger reads none (6)
--   * evaluation_status answers a member and refuses anyone else (7)
--   * once due, one reminder to the daglig leder, not a second within four weeks (8)
--   * the reminder is claimed with its facts; with an evaluation recorded since, it is dropped as
--     resolved (9)
--   * nothing written here survives (10)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/evaluation_invariants.sql

create unlogged table if not exists public._evi(seq int, name text, expected text, actual text, pass bool);
truncate public._evi;

do $$
declare
  v_org    uuid := '00000000-0000-4000-8000-00000000e001';
  v_dl     uuid := '00000000-0000-4000-8000-0000000e0011';
  v_al     uuid := '00000000-0000-4000-8000-0000000e0012';
  v_vo     uuid := '00000000-0000-4000-8000-0000000e0013';
  v_x      uuid := '00000000-0000-4000-8000-0000000e0014';
  v_wheel  uuid;
  v_meas   uuid;
  v_r1     uuid;
  v_r2     uuid;
  v_close  date;
  v_today  date := (now() at time zone 'Europe/Oslo')::date;
  v_d      record;
  v_txt    text;
  v_n      int;
  v_claim  jsonb;
  v_job    jsonb;
  v_rows   jsonb := '[]';
  v_cnt    int;
begin
  begin
    insert into app.organizations (id, name, org_number, employee_count, mail_enabled)
    values (v_org, 'Evaluering Test AS', '999000911', 12, true);
    insert into auth.users (id, email) values
      (v_dl, 'dl@evaluering-probe.no'), (v_al, 'al@evaluering-probe.no'),
      (v_vo, 'vo@evaluering-probe.no'), (v_x, 'x@evaluering-probe.no');
    insert into app.profiles (id, full_name) values
      (v_dl, 'Dina Leder'), (v_al, 'Arne Avdeling'), (v_vo, 'Vera Vern'), (v_x, 'Xavier Fremmed');
    insert into app.memberships (org_id, user_id, role)
    values (v_org, v_dl, 'daglig_leder'), (v_org, v_al, 'avdelingsleder'), (v_org, v_vo, 'verneombud');

    -- 1, 2 ---------------------------------------------------------- the chip moves the ladder
    insert into app.year_wheels (org_id, notify_lead_days) values (v_org, 14) returning id into v_wheel;
    insert into app.wheel_notifications (wheel_id, audience, lead_days, sort_order) values
      (v_wheel, 'verneombud', 2, 1), (v_wheel, 'tillitsvalgte', 2, 2), (v_wheel, 'daglig_leder', 1, 3),
      (v_wheel, 'avdelingsledere', 1, 4), (v_wheel, 'alle_ansatte', 1, 5);

    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    set local role authenticated;
    update app.year_wheels set notify_lead_days = 14 where id = v_wheel;
    reset role;
    select string_agg(audience || '=' || lead_days, ',' order by sort_order) into v_txt
    from app.wheel_notifications where wheel_id = v_wheel;
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'the same value saved again leaves the Veiviser''s ladder alone',
      'expected', 'verneombud=2,tillitsvalgte=2,daglig_leder=1,avdelingsledere=1,alle_ansatte=1', 'actual', v_txt,
      'pass', v_txt = 'verneombud=2,tillitsvalgte=2,daglig_leder=1,avdelingsledere=1,alle_ansatte=1');

    set local role authenticated;
    update app.year_wheels set notify_lead_days = 21 where id = v_wheel;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    select string_agg(audience || '=' || lead_days, ',' order by sort_order) into v_txt
    from app.wheel_notifications where wheel_id = v_wheel;
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', '«21 dager før» moves verneombud, tillitsvalgte and daglig leder, and no one else',
      'expected', 'verneombud=21,tillitsvalgte=21,daglig_leder=21,avdelingsledere=1,alle_ansatte=1', 'actual', v_txt,
      'pass', v_txt = 'verneombud=21,tillitsvalgte=21,daglig_leder=21,avdelingsledere=1,alle_ansatte=1');

    -- 3 ---------------------------------------------------------------- nothing closed, nothing due
    insert into app.measurements (org_id, kind, year, label, evaluation_cadence)
    values (v_org, 'grunnlinje', 2026, 'Probe', 'arlig') returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'apen', now() - interval '400 days', now() - interval '390 days') returning id into v_r1;
    select * into v_d from app.evaluation_due(v_org);
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'no round closed: the cadence, and nothing due',
      'expected', 'arlig|null', 'actual', concat_ws('|', v_d.cadence, coalesce(v_d.due_on::text, 'null')),
      'pass', v_d.cadence = 'arlig' and v_d.due_on is null);

    -- 4 ---------------------------------------------------------------- by the cadence
    update app.rounds set status = 'lukket' where id = v_r1;
    v_close := ((select closes_at from app.rounds where id = v_r1) at time zone 'Europe/Oslo')::date;
    v_txt := (select due_on::text from app.evaluation_due(v_org));
    update app.measurements set evaluation_cadence = 'hver_6_mnd' where id = v_meas;
    v_txt := v_txt || '|' || (select due_on::text from app.evaluation_due(v_org));
    update app.measurements set evaluation_cadence = 'etter_hver_runde' where id = v_meas;
    v_txt := v_txt || '|' || coalesce((select due_on::text from app.evaluation_due(v_org)), 'null');
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'apen', now() - interval '40 days', now() - interval '30 days') returning id into v_r2;
    update app.rounds set status = 'lukket' where id = v_r2;
    -- none recorded: still due from the first close
    v_txt := v_txt || '|' || coalesce((select due_on::text from app.evaluation_due(v_org)), 'null');
    -- one recorded between the two: due at the second close
    insert into app.evaluations (org_id, held_on) values (v_org, v_close + 1);
    v_txt := v_txt || '|' || coalesce((select due_on::text from app.evaluation_due(v_org)), 'null');
    delete from app.evaluations where org_id = v_org;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'årlig a year on, hver 6. måned six months, etter hver runde at the first close, and after one is held the next close',
      'expected', concat_ws('|', (v_close + interval '1 year')::date, (v_close + interval '6 months')::date, v_close, v_close,
                            ((now() - interval '30 days') at time zone 'Europe/Oslo')::date),
      'actual', v_txt,
      'pass', v_txt = concat_ws('|', (v_close + interval '1 year')::date, (v_close + interval '6 months')::date, v_close, v_close,
                                ((now() - interval '30 days') at time zone 'Europe/Oslo')::date));

    -- 6 ---------------------------------------------------------------- who records, who reads
    update app.measurements set evaluation_cadence = 'arlig' where id = v_meas;
    v_txt := '';
    perform set_config('request.jwt.claims', json_build_object('sub', v_al, 'role', 'authenticated')::text, true);
    begin
      set local role authenticated;
      insert into app.evaluations (org_id, held_on) values (v_org, v_today - 5);
      reset role;
      v_txt := 'avdelingsleder:written';
    exception when insufficient_privilege then
      reset role;
      v_txt := 'avdelingsleder:refused';
    end;
    perform set_config('request.jwt.claims', json_build_object('sub', v_vo, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into app.evaluations (org_id, held_on, counterpart) values (v_org, v_today - 400, 'tillitsvalgte');
    select count(*) into v_n from app.evaluations where org_id = v_org;
    reset role;
    v_txt := v_txt || '|verneombud:' || v_n;
    perform set_config('request.jwt.claims', json_build_object('sub', v_x, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into v_n from app.evaluations where org_id = v_org;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    v_txt := v_txt || '|stranger:' || v_n;
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'the verneombud records and reads; an avdelingsleder may not record; a stranger reads none',
      'expected', 'avdelingsleder:refused|verneombud:1|stranger:0', 'actual', v_txt,
      'pass', v_txt = 'avdelingsleder:refused|verneombud:1|stranger:0');

    -- 5 ---------------------------------------------------------------- from the last evaluation
    select * into v_d from app.evaluation_due(v_org);
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'a recorded evaluation: due a year after it',
      'expected', concat_ws('|', v_today - 400, (v_today - 400 + interval '1 year')::date),
      'actual', concat_ws('|', v_d.last_on, v_d.due_on),
      'pass', v_d.last_on = v_today - 400 and v_d.due_on = (v_today - 400 + interval '1 year')::date);

    -- 7 ---------------------------------------------------------------- the screens' reader
    perform set_config('request.jwt.claims', json_build_object('sub', v_al, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_txt := public.evaluation_status(v_org)->>'due_on';
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', v_x, 'role', 'authenticated')::text, true);
    begin
      set local role authenticated;
      perform public.evaluation_status(v_org);
      reset role;
      v_txt := v_txt || '|stranger:answered';
    exception when insufficient_privilege then
      reset role;
      v_txt := v_txt || '|stranger:refused';
    end;
    perform set_config('request.jwt.claims', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'evaluation_status answers a member, refuses a stranger',
      'expected', (v_today - 400 + interval '1 year')::date || '|stranger:refused', 'actual', v_txt,
      'pass', v_txt = (v_today - 400 + interval '1 year')::date || '|stranger:refused');

    -- 8 ---------------------------------------------------------------- the reminder, once
    perform app.queue_evaluation_notices();
    perform app.queue_evaluation_notices();
    select count(*), string_agg(distinct audience::text, ',') into v_n, v_txt
    from app.outbox where org_id = v_org and kind = 'evaluering';
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'due: one reminder to the daglig leder, not a second within four weeks',
      'expected', '1|daglig_leder', 'actual', v_n || '|' || coalesce(v_txt, ''), 'pass', v_n = 1 and v_txt = 'daglig_leder');

    -- 9 ---------------------------------------------------------------- claimed with its facts, then resolved
    update app.outbox set due_at = now() - interval '1 minute' where org_id = v_org and kind = 'evaluering';
    update app.outbox set due_at = now() + interval '1 day'
      where org_id <> v_org and sent_at is null and failed_at is null and due_at <= now();
    v_claim := public.dispatch_claim(100);
    select j into v_job from jsonb_array_elements(v_claim) j where j->>'kind' = 'evaluering';
    v_txt := concat_ws('|', v_job->'evaluation'->>'cadence', v_job->'evaluation'->>'last_on',
                       v_job->'recipients'->0->>'email', (v_job ? 'logo')::text);
    -- a second reminder, and an evaluation recorded before it goes
    update app.outbox set sent_at = now() where org_id = v_org and kind = 'evaluering';
    insert into app.outbox (org_id, round_id, kind, audience, due_at)
    values (v_org, null, 'evaluering', 'daglig_leder', now() - interval '1 minute');
    insert into app.evaluations (org_id, held_on) values (v_org, v_today);
    perform public.dispatch_claim(100);
    select last_error into v_d from app.outbox where org_id = v_org and kind = 'evaluering' and sent_at is null;
    v_txt := v_txt || '|' || coalesce(v_d.last_error, 'null');
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'claimed with cadence, last evaluation and the daglig leder; resolved once one is recorded',
      'expected', concat_ws('|', 'arlig', v_today - 400, 'dl@evaluering-probe.no', 'true', 'resolved'), 'actual', v_txt,
      'pass', v_txt = concat_ws('|', 'arlig', v_today - 400, 'dl@evaluering-probe.no', 'true', 'resolved'));

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 10 ----------------------------------------------------------------- nothing survives
  select count(*) into v_cnt from (
    select id::text from app.organizations where id = v_org
    union all select id::text from app.evaluations where org_id = v_org
    union all select id::text from auth.users where id in (v_dl, v_al, v_vo, v_x)) x;
  v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'every probe row was rolled back',
    'expected', '0', 'actual', v_cnt::text, 'pass', v_cnt = 0);

  insert into public._evi
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._evi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._evi;
  if v_failed is not null then raise exception 'evaluation invariants failed: %', v_failed; end if;
  if v_count <> 10 then raise exception 'evaluation invariants: expected 10 rows, got %', v_count; end if;
end $$;

drop table public._evi;
