-- wheel_month_invariants.sql — the Målinger write paths D-74 left out (0133), proved against the
-- live schema on a probe organisation of its own.
--
--   * no anon entry point; both new tables take no client write and are read under RLS (1, 2, 3)
--   * only a daglig leder changes a month, closes a round or sends a reminder (4)
--   * never the current month or one before it, never beyond the rail's next year (5)
--   * «Hopp over denne»: the planned puls goes, its measurement with it, and the skip is recorded (6)
--   * the wheel does not plan a skipped month again, and leaves the others as they were (7)
--   * «Ta pulsen tilbake»: the skip goes and the wheel plans the month (8)
--   * the refusals: skipped, not skipped, occupied, not planned (9)
--   * «＋ Legg til puls»: a puls at the wheel's hour, with the open measures' factors, marked «lagt til» (10)
--   * the wheel plans an added month whose round went missing (11)
--   * «Fjern pulsen»: the added puls goes and the month is empty, not skipped (12)
--   * with no open measure there is nothing to ask about (13)
--   * a month with an open or closed round is not the rail's to change (14)
--   * «Lukk runden»: closed now as the wheel closes, with the ladder's result notice; never extended (15)
--   * a closed round cannot be closed again, nor reminded (16)
--   * the tick closes a due round through the same close (17)
--   * «Send påminnelse»: the ladder's reminder to those who have not answered, and nobody else (18)
--   * never a third reminder (19)
--   * the ladder counts against the two, and stops at two; so does the day-before reminder (20, 21)
--   * N is the whole round's outstanding count, withheld under k; all answered sends nothing (22)
--   * nothing written here survives (23)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/wheel_month_invariants.sql

create unlogged table if not exists public._wmi(seq int, name text, expected text, actual text, pass bool);
truncate public._wmi;

do $$
declare
  v_org    uuid := '00000000-0000-4000-8000-00000000f331';
  v_other  uuid := '00000000-0000-4000-8000-00000000f332';
  v_dl     uuid := '00000000-0000-4000-8000-0000000f3311';
  v_vo     uuid := '00000000-0000-4000-8000-0000000f3312';
  v_out    uuid := '00000000-0000-4000-8000-0000000f3313';
  v_wheel  uuid;
  v_group  uuid;
  v_meas   uuid;
  v_mr     uuid;   -- the measurement the open rounds below hang on
  v_r1     uuid;
  v_r2     uuid;
  v_r3     uuid;
  v_r4     uuid;
  v_r5     uuid;
  v_tz     text := 'Europe/Oslo';
  v_now_y  int;
  v_now_m  int;
  v_y1 int; v_m1 int;   -- the first puls the cadence names (baseline + 3)
  v_y2 int; v_m2 int;   -- a month the cadence does not name
  v_y3 int; v_m3 int;   -- another, for an occupied month
  v_rest   text;
  v_json   jsonb;
  v_txt    text;
  v_n      int;
  v_rows   jsonb := '[]';
  claims constant text := '{"sub":"%s","role":"authenticated"}';
begin
  -- 1 -------------------------------------------------------------- no anon entry point
  select string_agg(f || '=' || has_function_privilege('anon', f, 'execute') || '/' || has_function_privilege('authenticated', f, 'execute'), ',' order by f)
  into v_txt
  from unnest(array['public.wheel_month_change(uuid,integer,integer,text)', 'public.close_round_now(uuid)',
                    'public.send_round_reminder(uuid)', 'public.reminder_status(uuid)']) f;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'anon may call none of the four; a signed-in user may',
    'expected', 'all false/true', 'actual', v_txt, 'pass', v_txt !~ 'true/' and v_txt !~ '/false');

  -- 2 -------------------------------------------------------------- the tables: RLS, a read policy, no client write
  select string_agg(t || ':' || (select relrowsecurity from pg_class where oid = t::regclass)
                      || ',' || (select count(*) || string_agg(cmd, '') from pg_policies where schemaname || '.' || tablename = t)
                      || ',' || has_table_privilege('authenticated', t, 'insert,update,delete'), ' ' order by t)
  into v_txt
  from unnest(array['app.round_reminders', 'app.wheel_month_marks']) t;
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'both tables: RLS on, one select policy, no client insert/update/delete',
    'expected', 'app.round_reminders:true,1SELECT,false app.wheel_month_marks:true,1SELECT,false',
    'actual', v_txt, 'pass', v_txt = 'app.round_reminders:true,1SELECT,false app.wheel_month_marks:true,1SELECT,false');

  v_now_y := extract(year from now() at time zone v_tz)::int;
  v_now_m := extract(month from now() at time zone v_tz)::int;
  v_y1 := v_now_y + (v_now_m - 1 + 2) / 12; v_m1 := (v_now_m - 1 + 2) % 12 + 1;
  v_y2 := v_now_y + (v_now_m - 1 + 3) / 12; v_m2 := (v_now_m - 1 + 3) % 12 + 1;
  v_y3 := v_now_y + (v_now_m - 1 + 4) / 12; v_m3 := (v_now_m - 1 + 4) % 12 + 1;

  begin
    insert into app.organizations (id, name, org_number, employee_count, mail_enabled, timezone)
    values (v_org, 'Hjulprøve AS', '999000331', 9, true, v_tz), (v_other, 'Utenfor AS', '999000332', 9, true, v_tz);
    insert into auth.users (id, email) values (v_dl, 'dl@wmi-probe.no'), (v_vo, 'vo@wmi-probe.no'), (v_out, 'ut@wmi-probe.no');
    insert into app.profiles (id, full_name) values (v_dl, 'Dina'), (v_vo, 'Vera'), (v_out, 'Ulf');
    insert into app.memberships (org_id, user_id, role) values
      (v_org, v_dl, 'daglig_leder'), (v_org, v_vo, 'verneombud'), (v_other, v_out, 'daglig_leder');

    -- a quarterly wheel whose first puls is two months from now; no summer pause, so the months hold
    insert into app.year_wheels (org_id, cadence, baseline_month, active, skip_fellesferie, extend_if_low)
    values (v_org, 'kvartalspuls', (v_m1 + 8) % 12 + 1, true, false, true)
    on conflict (org_id) do update set cadence = excluded.cadence, baseline_month = excluded.baseline_month,
      active = true, skip_fellesferie = false, extend_if_low = true
    returning id into v_wheel;
    delete from app.wheel_notifications where wheel_id = v_wheel;
    insert into app.wheel_notifications (wheel_id, audience, lead_days, sort_order) values
      (v_wheel, 'verneombud', 14, 1), (v_wheel, 'daglig_leder', 7, 2), (v_wheel, 'alle_ansatte', 1, 3);
    insert into app.measures (org_id, title, factor_key, step) values (v_org, 'Probe', 'emosjon', 'pagar');
    insert into app.groups (org_id, name) values (v_org, 'Drift') returning id into v_group;
    insert into app.employees (org_id, group_id, full_name, email, active)
    select v_org, v_group, 'Ansatt ' || g, 'a' || g || '@wmi-probe.no', true from generate_series(1, 6) g;

    perform app.wheel_plan(v_wheel);
    select string_agg(to_char(ro.opens_at at time zone v_tz, 'YYYY-MM'), ',' order by ro.opens_at) into v_rest
    from app.rounds ro where ro.org_id = v_org and to_char(ro.opens_at at time zone v_tz, 'YYYY-MM') <> format('%s-%s', v_y1, lpad(v_m1::text, 2, '0'));

    -- 3 ------------------------------------------------------------ read under RLS
    insert into app.wheel_month_marks (org_id, year, month, mark) values (v_other, v_y2, v_m2, 'lagt_til');
    insert into app.round_reminders (org_id, round_id, source)
    select v_org, ro.id, 'stige' from app.rounds ro where ro.org_id = v_org limit 1;
    perform set_config('request.jwt.claims', format(claims, v_vo), true);
    set local role authenticated;
    v_txt := (select count(*) from app.wheel_month_marks)::text || ',' || (select count(*) from app.round_reminders);
    begin
      insert into app.wheel_month_marks (org_id, year, month, mark) values (v_org, v_y3, v_m3, 'lagt_til');
      v_txt := v_txt || ',WRITTEN';
    exception when insufficient_privilege then
      v_txt := v_txt || ',denied';
    end;
    perform set_config('request.jwt.claims', format(claims, v_out), true);
    v_txt := v_txt || '|' || (select count(*) from app.wheel_month_marks) || ',' || (select count(*) from app.round_reminders);
    reset role;
    delete from app.wheel_month_marks where org_id = v_other;
    delete from app.round_reminders where org_id = v_org;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'a member reads their own organisation''s rows, never another''s, and writes none',
      'expected', '0,1,denied|1,0', 'actual', v_txt, 'pass', v_txt = '0,1,denied|1,0');

    -- 4 ------------------------------------------------------------ the verneombud is refused
    insert into app.measurements (org_id, kind, year) values (v_org, 'puls', v_now_y) returning id into v_mr;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_mr, 'apen', now() - interval '2 days', now() + interval '5 days') returning id into v_r1;
    insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at, responded_at)
    select v_org, v_r1, e.id, extensions.digest(e.id::text || 'r1', 'sha256'), now() + interval '5 days',
           case when row_number() over (order by e.id) <= 2 then now() end
    from app.employees e where e.org_id = v_org;

    perform set_config('request.jwt.claims', format(claims, v_vo), true);
    v_txt := concat_ws(',', public.wheel_month_change(v_org, v_y1, v_m1, 'hopp_over')->>'error',
      public.close_round_now(v_r1)->>'error', public.send_round_reminder(v_r1)->>'error');
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'a verneombud may not skip a month, close a round or send a reminder',
      'expected', 'not_available,not_available,not_available', 'actual', v_txt, 'pass', v_txt = 'not_available,not_available,not_available');

    -- 5 ------------------------------------------------------------ never now or before, never beyond the rail
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_txt := concat_ws(',', public.wheel_month_change(v_org, v_now_y, v_now_m, 'legg_til')->>'error',
      public.wheel_month_change(v_org, v_now_y - 1, 12, 'legg_til')->>'error',
      public.wheel_month_change(v_org, v_now_y + 2, 1, 'legg_til')->>'error',
      public.wheel_month_change(v_org, v_y2, v_m2, 'flytt')->>'error',
      public.wheel_month_change(v_org, v_y2, 13, 'legg_til')->>'error');
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'the current month, last year and the year after next are refused; so is an unknown action',
      'expected', 'past,past,past,invalid,invalid', 'actual', v_txt, 'pass', v_txt = 'past,past,past,invalid,invalid');

    -- 6 ------------------------------------------------------------ «Hopp over denne»
    select ro.measurement_id into v_meas from app.rounds ro
    where ro.org_id = v_org and ro.status = 'planlagt'
      and to_char(ro.opens_at at time zone v_tz, 'YYYY-MM') = format('%s-%s', v_y1, lpad(v_m1::text, 2, '0'));
    v_json := public.wheel_month_change(v_org, v_y1, v_m1, 'hopp_over');
    v_txt := concat_ws(',', v_json->>'mark', v_meas is not null,
      (select count(*) from app.rounds ro where ro.org_id = v_org and to_char(ro.opens_at at time zone v_tz, 'YYYY-MM') = format('%s-%s', v_y1, lpad(v_m1::text, 2, '0'))),
      (select count(*) from app.measurements where id = v_meas),
      (select mark || '/' || (created_by = v_dl) from app.wheel_month_marks where org_id = v_org and year = v_y1 and month = v_m1));
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'the planned puls and its measurement are gone; the skip is recorded with who',
      'expected', 'hoppet_over,t,0,0,hoppet_over/true', 'actual', v_txt, 'pass', v_txt = 'hoppet_over,t,0,0,hoppet_over/true');

    -- 7 ------------------------------------------------------------ the wheel does not plan it again
    perform app.wheel_plan(v_wheel);
    v_txt := concat_ws(',',
      (select count(*) from app.rounds ro where ro.org_id = v_org and to_char(ro.opens_at at time zone v_tz, 'YYYY-MM') = format('%s-%s', v_y1, lpad(v_m1::text, 2, '0'))),
      (select string_agg(to_char(ro.opens_at at time zone v_tz, 'YYYY-MM'), ',' order by ro.opens_at) from app.rounds ro
       where ro.org_id = v_org and ro.status = 'planlagt') = v_rest);
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'the wheel leaves the skipped month empty and the other months as they were',
      'expected', '0,t', 'actual', v_txt, 'pass', v_txt = '0,t');

    -- 8 ------------------------------------------------------------ «Ta pulsen tilbake»
    v_txt := public.wheel_month_change(v_org, v_y1, v_m1, 'legg_til')->>'error';
    v_json := public.wheel_month_change(v_org, v_y1, v_m1, 'ta_tilbake');
    v_txt := concat_ws(',', v_txt, v_json->>'planned',
      (select count(*) from app.wheel_month_marks where org_id = v_org),
      (select count(*) from app.rounds ro join app.measurements ms on ms.id = ro.measurement_id
       where ro.org_id = v_org and ms.kind = 'puls' and ro.status = 'planlagt'
         and ro.opens_at = app.first_tuesday(v_y1, v_m1, v_tz)));
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'a skipped month cannot be added to; taken back, the wheel plans its puls at once',
      'expected', 'skipped,true,0,1', 'actual', v_txt, 'pass', v_txt = 'skipped,true,0,1');

    -- 9 ------------------------------------------------------------ the refusals
    v_txt := concat_ws(',',
      public.wheel_month_change(v_org, v_y1, v_m1, 'ta_tilbake')->>'error',
      public.wheel_month_change(v_org, v_y1, v_m1, 'legg_til')->>'error',
      public.wheel_month_change(v_org, v_y2, v_m2, 'hopp_over')->>'error');
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'nothing to take back; a planned month cannot be added to; an empty month has nothing to skip',
      'expected', 'not_skipped,occupied,not_planned', 'actual', v_txt, 'pass', v_txt = 'not_skipped,occupied,not_planned');

    -- 10 ----------------------------------------------------------- «＋ Legg til puls»
    v_json := public.wheel_month_change(v_org, v_y2, v_m2, 'legg_til');
    select concat_ws(',', v_json->>'mark', ro.status, ms.kind, ro.opens_at = app.first_tuesday(v_y2, v_m2, v_tz),
             to_char(ro.opens_at at time zone v_tz, 'HH24:MI'),
             (select string_agg(rf.factor_key, '+') from app.round_factors rf where rf.round_id = ro.id),
             (select mark from app.wheel_month_marks where org_id = v_org and year = v_y2 and month = v_m2))
    into v_txt
    from app.rounds ro join app.measurements ms on ms.id = ro.measurement_id
    where ro.org_id = v_org and to_char(ro.opens_at at time zone v_tz, 'YYYY-MM') = format('%s-%s', v_y2, lpad(v_m2::text, 2, '0'));
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'an added puls goes out on the first Tuesday at 09:00, about the open measures, marked «lagt til»',
      'expected', 'lagt_til,planlagt,puls,t,09:00,emosjon,lagt_til', 'actual', v_txt,
      'pass', v_txt = 'lagt_til,planlagt,puls,t,09:00,emosjon,lagt_til');

    -- 11 ----------------------------------------------------------- the wheel keeps an added month
    delete from app.rounds ro where ro.org_id = v_org and ro.opens_at = app.first_tuesday(v_y2, v_m2, v_tz);
    v_n := app.wheel_plan(v_wheel);
    v_txt := v_n || ',' || (select count(*) from app.rounds ro where ro.org_id = v_org and ro.opens_at = app.first_tuesday(v_y2, v_m2, v_tz));
    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'an added month whose round went missing is planned again by the wheel',
      'expected', '1,1', 'actual', v_txt, 'pass', v_txt = '1,1');

    -- 12 ----------------------------------------------------------- «Fjern pulsen»
    v_json := public.wheel_month_change(v_org, v_y2, v_m2, 'hopp_over');
    perform app.wheel_plan(v_wheel);
    v_txt := concat_ws(',', v_json->>'ok', coalesce(v_json->>'mark', 'none'),
      (select count(*) from app.wheel_month_marks where org_id = v_org and year = v_y2 and month = v_m2),
      (select count(*) from app.rounds ro where ro.org_id = v_org and to_char(ro.opens_at at time zone v_tz, 'YYYY-MM') = format('%s-%s', v_y2, lpad(v_m2::text, 2, '0'))));
    v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'an added puls removed leaves an empty month, not a skipped one, and stays removed',
      'expected', 'true,none,0,0', 'actual', v_txt, 'pass', v_txt = 'true,none,0,0');

    -- 13 ----------------------------------------------------------- nothing to ask about
    delete from app.measures where org_id = v_org;
    v_txt := public.wheel_month_change(v_org, v_y2, v_m2, 'legg_til')->>'error';
    v_txt := v_txt || ',' || (select count(*) from app.wheel_month_marks where org_id = v_org);
    insert into app.measures (org_id, title, factor_key, step) values (v_org, 'Probe', 'emosjon', 'pagar');
    v_rows := v_rows || jsonb_build_object('seq', 13, 'name', 'with no open measure no puls is added, and nothing is recorded',
      'expected', 'no_factors,0', 'actual', v_txt, 'pass', v_txt = 'no_factors,0');

    -- 14 ----------------------------------------------------------- a month that has gone out
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    select v_org, ms.id, 'lukket', app.first_tuesday(v_y3, v_m3, v_tz), app.first_tuesday(v_y3, v_m3, v_tz) + interval '7 days'
    from app.measurements ms where ms.org_id = v_org and ms.kind = 'puls' limit 1;
    v_txt := concat_ws(',',
      public.wheel_month_change(v_org, v_y3, v_m3, 'legg_til')->>'error',
      public.wheel_month_change(v_org, v_y3, v_m3, 'hopp_over')->>'error',
      public.wheel_month_change(v_org, v_y3, v_m3, 'ta_tilbake')->>'error');
    delete from app.rounds ro where ro.org_id = v_org and ro.status = 'lukket';
    v_rows := v_rows || jsonb_build_object('seq', 14, 'name', 'a month with a closed round is refused whatever the action',
      'expected', 'occupied,occupied,occupied', 'actual', v_txt, 'pass', v_txt = 'occupied,occupied,occupied');

    -- 15 ----------------------------------------------------------- «Lukk runden»
    -- two of six answered: under half, and the wheel extends — but a leader's close is a close
    v_json := public.close_round_now(v_r1);
    select concat_ws(',', v_json->>'ok', ro.status, ro.frozen_at is not null,
             ro.closes_at <= now() and ro.closes_at > now() - interval '1 minute', ro.extended_at is null,
             ro.results_publish_on = (ro.closes_at at time zone v_tz)::date + 7,
             (select string_agg(o.audience::text, '+' order by o.audience::text) from app.outbox o where o.round_id = ro.id and o.kind = 'resultat'))
    into v_txt from app.rounds ro where ro.id = v_r1;
    v_rows := v_rows || jsonb_build_object('seq', 15, 'name', 'closed now, frozen, the publish date follows, the ladder told, not extended',
      'expected', 'true,lukket,t,t,t,t,alle_ansatte+daglig_leder+verneombud', 'actual', v_txt,
      'pass', v_txt = 'true,lukket,t,t,t,t,alle_ansatte+daglig_leder+verneombud');

    -- 16 ----------------------------------------------------------- closed is closed
    v_txt := concat_ws(',', public.close_round_now(v_r1)->>'error', public.send_round_reminder(v_r1)->>'error',
      (select count(*) from app.outbox where round_id = v_r1 and kind = 'paminnelse'));
    v_rows := v_rows || jsonb_build_object('seq', 16, 'name', 'a closed round is neither closed again nor reminded',
      'expected', 'not_open,not_open,0', 'actual', v_txt, 'pass', v_txt = 'not_open,not_open,0');

    -- 17 ----------------------------------------------------------- the tick closes through the same close
    update app.year_wheels set extend_if_low = false where id = v_wheel;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_mr, 'apen', now() - interval '8 days', now() - interval '1 hour') returning id into v_r2;
    perform app.wheel_tick();
    select concat_ws(',', ro.status, ro.frozen_at is not null,
             (select string_agg(o.audience::text, '+' order by o.audience::text) from app.outbox o where o.round_id = ro.id and o.kind = 'resultat'))
    into v_txt from app.rounds ro where ro.id = v_r2;
    update app.year_wheels set extend_if_low = true where id = v_wheel;
    v_rows := v_rows || jsonb_build_object('seq', 17, 'name', 'the wheel closes a due round the same way: closed, frozen, the ladder told',
      'expected', 'lukket,t,alle_ansatte+daglig_leder+verneombud', 'actual', coalesce(v_txt, 'missing'),
      'pass', v_txt = 'lukket,t,alle_ansatte+daglig_leder+verneombud');

    -- 18 ----------------------------------------------------------- «Send påminnelse til de N»
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_mr, 'apen', now() - interval '3 days', now() + interval '4 days') returning id into v_r3;
    insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at, responded_at)
    select v_org, v_r3, e.id, extensions.digest(e.id::text || 'r3', 'sha256'), now() + interval '4 days',
           case when row_number() over (order by e.id) <= 2 then now() end
    from app.employees e where e.org_id = v_org;
    v_txt := (public.reminder_status(v_r3)->>'sent') || '/' || (public.reminder_status(v_r3)->>'outstanding');
    v_json := public.send_round_reminder(v_r3);
    v_txt := concat_ws(',', v_txt, v_json->>'sent',
      (select count(*) from app.outbox o where o.round_id = v_r3 and o.kind = 'paminnelse' and o.due_at <= now() and o.sent_at is null),
      (select count(*) from app.outbox o join app.invitations i on i.id = o.invitation_id
       where o.round_id = v_r3 and o.kind = 'paminnelse' and i.responded_at is not null),
      (select source || '/' || (sent_by = v_dl) from app.round_reminders where round_id = v_r3));
    v_rows := v_rows || jsonb_build_object('seq', 18, 'name', 'N is the four who have not answered; the reminder goes to them, not to the two who have, recorded with who',
      'expected', '0/4,1,4,0,manuell/true', 'actual', v_txt, 'pass', v_txt = '0/4,1,4,0,manuell/true');

    -- 19 ----------------------------------------------------------- never a third
    update app.outbox set sent_at = now() where round_id = v_r3 and kind = 'paminnelse';
    update app.invitations set responded_at = now()
    where id = (select i.id from app.invitations i where i.round_id = v_r3 and i.responded_at is null order by i.id limit 1);
    v_json := public.send_round_reminder(v_r3);
    v_txt := concat_ws(',', v_json->>'sent',
      (select count(*) from app.outbox o where o.round_id = v_r3 and o.kind = 'paminnelse' and o.sent_at is null),
      public.send_round_reminder(v_r3)->>'error',
      public.reminder_status(v_r3)->>'sent', public.reminder_status(v_r3)->>'outstanding',
      (public.reminder_status(v_r3)->>'last_at') is not null,
      (select count(*) from app.round_reminders where round_id = v_r3));
    v_rows := v_rows || jsonb_build_object('seq', 19, 'name', 'the second goes to the three still outstanding; the third is refused',
      'expected', '2,3,max_reached,2,3,t,2', 'actual', v_txt, 'pass', v_txt = '2,3,max_reached,2,3,t,2');

    -- 20 ----------------------------------------------------------- the ladder counts, and stops at two
    -- r3 has had its two: a reminder day that has come sends nothing more, nor does the day before
    update app.outbox set sent_at = now() where round_id = v_r3 and kind = 'paminnelse';
    update app.rounds set reminder_day = 1, final_reminder = true, closes_at = now() + interval '20 hours' where id = v_r3;
    update app.invitations set expires_at = now() + interval '20 hours' where round_id = v_r3;
    -- r4: nothing sent yet; its reminder day has come
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at, reminder_day)
    values (v_org, v_mr, 'apen', now() - interval '2 days', now() + interval '5 days', 1) returning id into v_r4;
    insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at, responded_at)
    select v_org, v_r4, e.id, extensions.digest(e.id::text || 'r4', 'sha256'), now() + interval '5 days',
           case when row_number() over (order by e.id) <= 1 then now() end
    from app.employees e where e.org_id = v_org;
    perform app.wheel_tick();
    perform app.queue_final_reminders();
    v_txt := concat_ws(',',
      (select count(*) from app.outbox o where o.round_id = v_r3 and o.kind in ('paminnelse', 'siste_paminnelse') and o.sent_at is null),
      (select count(*) from app.round_reminders where round_id = v_r3),
      (select count(*) from app.outbox o where o.round_id = v_r4 and o.kind = 'paminnelse' and o.sent_at is null),
      (select string_agg(source::text, '+') from app.round_reminders where round_id = v_r4));
    v_json := public.send_round_reminder(v_r4);
    v_txt := concat_ws(',', v_txt, v_json->>'sent', public.send_round_reminder(v_r4)->>'error');
    perform app.wheel_tick();
    v_txt := v_txt || ',' || (select count(*) from app.round_reminders where round_id = v_r4);
    v_rows := v_rows || jsonb_build_object('seq', 20, 'name', 'after two, the ladder and the day-before reminder send nothing; the ladder''s own counts as one of the two, once',
      'expected', '0,2,5,stige,2,max_reached,2', 'actual', v_txt, 'pass', v_txt = '0,2,5,stige,2,max_reached,2');

    -- 21 ----------------------------------------------------------- the day-before reminder is one of the two
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at, final_reminder)
    values (v_org, v_mr, 'apen', now() - interval '4 days', now() + interval '20 hours', true) returning id into v_r5;
    insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at)
    select v_org, v_r5, e.id, extensions.digest(e.id::text || 'r5', 'sha256'), now() + interval '20 hours'
    from app.employees e where e.org_id = v_org;
    v_txt := (public.send_round_reminder(v_r5)->>'sent');
    perform app.queue_final_reminders();
    perform app.queue_final_reminders();
    v_txt := concat_ws(',', v_txt,
      (select count(*) from app.outbox o where o.round_id = v_r5 and o.kind = 'siste_paminnelse'),
      (select string_agg(source::text, '+' order by source) from app.round_reminders where round_id = v_r5),
      public.send_round_reminder(v_r5)->>'error');
    v_rows := v_rows || jsonb_build_object('seq', 21, 'name', 'one by hand, then the day-before reminder to all six, recorded once: the two are spent',
      'expected', '1,6,siste+manuell,max_reached', 'actual', v_txt, 'pass', v_txt = '1,6,siste+manuell,max_reached');

    -- 22 ----------------------------------------------------------- N and k
    -- r5: three of its six leave the register's round — fewer than k asked in the whole round
    update app.invitations set responded_at = now() where round_id = v_r4;
    delete from app.invitations where id in (select i.id from app.invitations i where i.round_id = v_r5 order by i.id limit 3);
    delete from app.round_reminders where round_id = v_r5;
    v_txt := concat_ws(',',
      coalesce(public.reminder_status(v_r5)->>'outstanding', 'withheld'),
      public.reminder_status(v_r4)->>'outstanding',
      public.send_round_reminder(v_r4)->>'error');
    delete from app.round_reminders where round_id = v_r4;
    v_txt := v_txt || ',' || (public.send_round_reminder(v_r4)->>'error');
    perform set_config('request.jwt.claims', format(claims, v_out), true);
    v_txt := v_txt || ',' || (public.reminder_status(v_r3)->>'error');
    v_rows := v_rows || jsonb_build_object('seq', 22, 'name', 'N is withheld when fewer than k were asked; all answered: N is 0 and nothing is sent; another organisation learns nothing',
      'expected', 'withheld,0,max_reached,none_outstanding,not_available', 'actual', v_txt,
      'pass', v_txt = 'withheld,0,max_reached,none_outstanding,not_available');

    raise exception 'rollback';
  exception when others then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 23 ---------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id::text from auth.users where email like '%@wmi-probe.no'
    union all select id::text from app.organizations where id in (v_org, v_other)
    union all select org_id::text from app.wheel_month_marks where org_id in (v_org, v_other)
    union all select id::text from app.round_reminders where org_id in (v_org, v_other)) x;
  v_rows := v_rows || jsonb_build_object('seq', 23, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._wmi
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._wmi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._wmi;
  if v_failed is not null then raise exception 'wheel month invariants failed: %', v_failed; end if;
  if v_count <> 23 then raise exception 'wheel month invariants: expected 23 rows, got %', v_count; end if;
end $$;
