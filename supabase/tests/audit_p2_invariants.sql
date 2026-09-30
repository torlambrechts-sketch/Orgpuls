-- audit_p2_invariants.sql — the deep audit's P2 and P3 findings fixed in 0129, proved against the
-- live schema. (The employees' page, AUD-22, is proved in round_page_invariants rows 4 and 6.)
--
--   * a publish date needs a close (AUD-26) (1)
--   * once the round is open the date may come earlier, never later than the one people were told
--     (AUD-23) (2)
--   * a close moved earlier pulls the date back within close + 60 (AUD-26) (3)
--   * the evaluation reminder is queued only where the organisation's e-mail is on (P3) (4)
--   * org_logos.updated_by and rounds.intro_by have their indexes (P3) (5)
--   * nothing written here survives (6)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/audit_p2_invariants.sql

create unlogged table if not exists public._ap2(seq int, name text, expected text, actual text, pass bool);
truncate public._ap2;

do $$
declare
  v_org   uuid := '00000000-0000-4000-8000-00000000f291';
  v_off   uuid := '00000000-0000-4000-8000-00000000f292';
  v_dl    uuid := '00000000-0000-4000-8000-0000000f2911';
  v_meas  uuid;
  v_moff  uuid;
  v_plan  uuid;
  v_open  uuid;
  v_close date;
  v_told  date;
  v_txt   text;
  v_rows  jsonb := '[]';
  claims constant text := '{"sub":"%s","role":"authenticated"}';
begin
  begin
    insert into app.organizations (id, name, org_number, employee_count, mail_enabled)
    values (v_org, 'Revisjon AS', '999000291', 9, true), (v_off, 'Uten post AS', '999000292', 9, false);
    insert into auth.users (id, email) values (v_dl, 'dl@ap2-probe.no');
    insert into app.profiles (id, full_name) values (v_dl, 'Dina');
    insert into app.memberships (org_id, user_id, role) values (v_org, v_dl, 'daglig_leder');
    insert into app.measurements (org_id, kind, year, label, evaluation_cadence)
    values (v_org, 'grunnlinje', 2026, 'Probe', 'arlig') returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'planlagt', null, null) returning id into v_plan;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'apen', now() - interval '2 days', now() + interval '12 days') returning id into v_open;
    v_close := ((select closes_at from app.rounds where id = v_open) at time zone 'Europe/Oslo')::date;
    v_told := (select results_publish_on from app.rounds where id = v_open);

    -- 1 -------------------------------------------------------------- no close, no date
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_txt := public.set_round_send(v_plan, '', current_date + 30)->>'error';
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'a publish date needs a close',
      'expected', 'publish_range', 'actual', v_txt, 'pass', v_txt = 'publish_range');

    -- 2 -------------------------------------------------------------- open: sooner, never later
    v_txt := concat_ws(',',
      (v_told = v_close + 7)::text,
      public.set_round_send(v_open, '', v_told + 1)->>'error',
      public.set_round_send(v_open, '', v_close + 2)->>'ok');
    v_txt := v_txt || ',' || ((select results_publish_on from app.rounds where id = v_open) - v_close);
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'an open round''s date may come sooner, not later than the one people were told',
      'expected', 'true,publish_later,true,2', 'actual', v_txt, 'pass', v_txt = 'true,publish_later,true,2');

    -- 3 -------------------------------------------------------------- a close moved earlier
    update app.rounds set results_publish_on = v_close + 60 where id = v_open;
    update app.rounds set closes_at = closes_at - interval '10 days' where id = v_open;
    v_txt := ((select results_publish_on from app.rounds where id = v_open)
              - ((select closes_at from app.rounds where id = v_open) at time zone 'Europe/Oslo')::date)::text;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'a close moved earlier pulls the date back within close + 60',
      'expected', '60', 'actual', v_txt, 'pass', v_txt = '60');

    -- 4 -------------------------------------------------------------- the evaluation reminder, mail on only
    perform set_config('request.jwt.claims', '', true);
    insert into app.measurements (org_id, kind, year, label, evaluation_cadence)
    values (v_off, 'grunnlinje', 2025, 'Probe', 'arlig') returning id into v_moff;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_off, v_moff, 'lukket', now() - interval '420 days', now() - interval '400 days');
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'lukket', now() - interval '420 days', now() - interval '400 days');
    perform app.queue_evaluation_notices();
    v_txt := concat_ws(',',
      (select count(*) from app.outbox where org_id = v_org and kind = 'evaluering'),
      (select count(*) from app.outbox where org_id = v_off and kind = 'evaluering'));
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'the evaluation reminder is queued where e-mail is on, not where it is off',
      'expected', '1,0', 'actual', v_txt, 'pass', v_txt = '1,0');

    raise exception 'rollback';
  exception when others then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 5 ---------------------------------------------------------------- indexes
  select concat_ws(',',
    exists (select 1 from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
            where i.indrelid = 'app.org_logos'::regclass and a.attname = 'updated_by'),
    exists (select 1 from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
            where i.indrelid = 'app.rounds'::regclass and a.attname = 'intro_by'))
  into v_txt;
  v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'org_logos.updated_by and rounds.intro_by are indexed',
    'expected', 't,t', 'actual', v_txt, 'pass', v_txt = 't,t');

  -- 6 ---------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id::text from auth.users where email like '%@ap2-probe.no'
    union all select id::text from app.organizations where id in (v_org, v_off)) x;
  v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._ap2
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._ap2 order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._ap2;
  if v_failed is not null then raise exception 'audit p2 invariants failed: %', v_failed; end if;
  if v_count <> 6 then raise exception 'audit p2 invariants: expected 6 rows, got %', v_count; end if;
end $$;
