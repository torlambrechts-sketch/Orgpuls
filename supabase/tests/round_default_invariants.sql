-- round_default_invariants.sql — a round the year wheel plans sends its reminder (0147, D-192),
-- proved on a probe organisation of its own, rolled back.
--
--   1 a round planned by the wheel in an organisation without a standard has reminder day 2
--   2 a round inserted with an explicit «Ingen påminnelse» (null) keeps it
--   3 an organisation's standard still decides: its reminder day, not the column's default
--   4 nothing written here survives
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/round_default_invariants.sql

create unlogged table if not exists public._rdi(seq int, name text, expected text, actual text, pass bool);
truncate public._rdi;

do $$
declare
  v_org   uuid := '00000000-0000-4000-8000-00000000f471';
  v_std   uuid := '00000000-0000-4000-8000-00000000f472';
  v_tz    text := 'Europe/Oslo';
  v_y     int := extract(year from now())::int + 1;
  v_round uuid;
  v_meas  uuid;
  v_txt   text;
  v_rows  jsonb := '[]';
begin
  begin
    insert into app.organizations (id, name, org_number, employee_count, mail_enabled, timezone)
    values (v_org, 'Påminnelse uten standard AS', '999000471', 9, true, v_tz),
           (v_std, 'Påminnelse med standard AS', '999000472', 9, true, v_tz);
    insert into app.survey_defaults (org_id, reminder_day) values (v_std, 5);

    -- round_apply_defaults is a constraint trigger, deferred to commit; this block never commits,
    -- so it runs the deferred triggers before each read, as a commit would
    -- 1 ----------------------------------------------------------- the wheel, no standard
    v_round := app.plan_round(v_org, 'puls', v_y, 3, v_tz);
    set constraints all immediate;
    set constraints all deferred;
    select coalesce(r.reminder_day::text, 'null') into v_txt from app.rounds r where r.id = v_round;
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'a round the wheel plans without a standard has reminder day 2',
      'expected', '2', 'actual', v_txt, 'pass', v_txt = '2');

    -- 2 ----------------------------------------------------------- a person's «Ingen påminnelse»
    insert into app.measurements (org_id, kind, year) values (v_org, 'puls', v_y) returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at, reminder_day)
    values (v_org, v_meas, 'planlagt', make_timestamptz(v_y, 6, 2, 9, 0, 0, v_tz),
            make_timestamptz(v_y, 6, 9, 9, 0, 0, v_tz), null)
    returning id into v_round;
    set constraints all immediate;
    set constraints all deferred;
    select coalesce(r.reminder_day::text, 'null') into v_txt from app.rounds r where r.id = v_round;
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'a round inserted with no reminder named as null keeps it',
      'expected', 'null', 'actual', v_txt, 'pass', v_txt = 'null');

    -- 3 ----------------------------------------------------------- the standard decides
    v_round := app.plan_round(v_std, 'puls', v_y, 3, v_tz);
    set constraints all immediate;
    set constraints all deferred;
    select coalesce(r.reminder_day::text, 'null') into v_txt from app.rounds r where r.id = v_round;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'with a standard, the round takes the standard''s reminder day',
      'expected', '5', 'actual', v_txt, 'pass', v_txt = '5');

    raise exception 'rollback';
  exception when others then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 4 ------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from app.organizations where id in (v_org, v_std);
  v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._rdi
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._rdi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._rdi;
  if v_failed is not null then raise exception 'round default invariants failed: %', v_failed; end if;
  if v_count <> 4 then raise exception 'round default invariants: expected 4 rows, got %', v_count; end if;
end $$;
