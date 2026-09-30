-- ticket_holidays_invariants.sql — Norwegian public holidays in the business-hours calendar (0132,
-- D-92, D-174), proved against the live schema.
--
--   * app.no_public_holiday is immutable and no client's to call (1)
--   * the holidays of 2026 and of 2027 are exactly the twelve and the eleven the calendar has
--     (2027's 2. pinsedag falls on 17 May) (2, 3)
--   * the computus finds Easter Sunday for years with known dates, 1818 to 2285 (4)
--   * a deadline over Easter, Kristi himmelfart, 17 May, Christmas and 1 May moves past them (5)
--   * a normal week is counted as before: 0051's own cases and a whole week (6)
--   * a ticket filed before Easter gets its first-response and resolution deadlines past it (7)
--   * nothing written here survives (8)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/ticket_holidays_invariants.sql

create unlogged table if not exists public._thi(seq int, name text, expected text, actual text, pass bool);
truncate public._thi;

do $$
declare
  v_txt  text;
  v_exp  text;
  v_rows jsonb := '[]';
  v_row  app.tickets;
  oslo   constant text := 'Europe/Oslo';
begin
  -- 1 ---------------------------------------------------------------- the function and its grants
  select concat_ws('|',
    (select p.provolatile from pg_proc p where p.oid = 'app.no_public_holiday(date)'::regprocedure),
    has_function_privilege('anon', 'app.no_public_holiday(date)', 'execute'),
    has_function_privilege('authenticated', 'app.no_public_holiday(date)', 'execute'),
    (select pg_get_function_result(p.oid) from pg_proc p where p.oid = 'app.add_business_hours(timestamptz, numeric)'::regprocedure))
  into v_txt;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'no_public_holiday is immutable and no client''s; add_business_hours keeps its signature',
    'expected', 'i|f|f|timestamp with time zone', 'actual', v_txt, 'pass', v_txt = 'i|f|f|timestamp with time zone');

  -- 2, 3 ------------------------------------------------------------ the holidays of a year, exactly
  select string_agg(to_char(d, 'MM-DD'), ',' order by d) into v_txt
  from generate_series(date '2026-01-01', date '2026-12-31', interval '1 day') d where app.no_public_holiday(d::date);
  v_exp := '01-01,04-02,04-03,04-05,04-06,05-01,05-14,05-17,05-24,05-25,12-25,12-26';
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', '2026: Easter 5 April; twelve holidays and no other day',
    'expected', v_exp, 'actual', v_txt, 'pass', v_txt = v_exp);

  select string_agg(to_char(d, 'MM-DD'), ',' order by d) into v_txt
  from generate_series(date '2027-01-01', date '2027-12-31', interval '1 day') d where app.no_public_holiday(d::date);
  v_exp := '01-01,03-25,03-26,03-28,03-29,05-01,05-06,05-16,05-17,12-25,12-26';
  v_rows := v_rows || jsonb_build_object('seq', 3, 'name', '2027: Easter 28 March; 2. pinsedag is 17 May, eleven days',
    'expected', v_exp, 'actual', v_txt, 'pass', v_txt = v_exp);

  -- 4 ---------------------------------------------------------------- Easter Sunday across the computus' range
  -- the first Sunday in March–April that is a holiday is 1. påskedag
  select string_agg(y || ':' || to_char((
      select min(d) from generate_series(make_date(y, 3, 1), make_date(y, 4, 30), interval '1 day') d
      where extract(isodow from d) = 7 and app.no_public_holiday(d::date)), 'MM-DD'), ',' order by y)
  into v_txt
  from unnest(array[1818, 1943, 2008, 2019, 2024, 2025, 2038, 2285]) y;
  v_exp := '1818:03-22,1943:04-25,2008:03-23,2019:04-21,2024:03-31,2025:04-20,2038:04-25,2285:03-22';
  v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'the computus finds Easter Sunday, earliest and latest dates included',
    'expected', v_exp, 'actual', v_txt, 'pass', v_txt = v_exp);

  -- 5 ---------------------------------------------------------------- deadlines move past holidays
  v_txt := concat_ws(',',
    -- Wednesday before Easter, 8h: 2h, then Skjærtorsdag to 2. påskedag off
    to_char(app.add_business_hours('2026-04-01 14:00+02', 8) at time zone oslo, 'YYYY-MM-DD Dy HH24:MI'),
    -- the day before Kristi himmelfart, 8h
    to_char(app.add_business_hours('2026-05-13 12:00+02', 8) at time zone oslo, 'YYYY-MM-DD Dy HH24:MI'),
    -- Friday before 17 May 2027 (a Monday, also 2. pinsedag), 4h
    to_char(app.add_business_hours('2027-05-14 15:00+02', 4) at time zone oslo, 'YYYY-MM-DD Dy HH24:MI'),
    -- Christmas Eve is a working day; 25 December 2026 is a Friday
    to_char(app.add_business_hours('2026-12-24 15:00+01', 2) at time zone oslo, 'YYYY-MM-DD Dy HH24:MI'),
    -- filed on 1 May itself
    to_char(app.add_business_hours('2026-05-01 10:00+02', 1) at time zone oslo, 'YYYY-MM-DD Dy HH24:MI'));
  v_exp := '2026-04-07 Tue 14:00,2026-05-15 Fri 12:00,2027-05-18 Tue 11:00,2026-12-28 Mon 09:00,2026-05-04 Mon 09:00';
  v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'a deadline over Easter, Kristi himmelfart, 17 May, Christmas and 1 May moves past them',
    'expected', v_exp, 'actual', v_txt, 'pass', v_txt = v_exp);

  -- 6 ---------------------------------------------------------------- a normal week is unchanged
  v_txt := concat_ws(',',
    to_char(app.add_business_hours('2026-09-25 15:00+02', 4) at time zone oslo, 'Dy HH24:MI'),
    to_char(app.add_business_hours('2026-09-26 10:00+02', 8) at time zone oslo, 'Dy HH24:MI'),
    to_char(app.add_business_hours('2026-09-24 06:00+02', 16) at time zone oslo, 'Dy HH24:MI'),
    to_char(app.add_business_hours('2026-09-21 09:00+02', 40) at time zone oslo, 'YYYY-MM-DD Dy HH24:MI'),
    to_char(app.add_business_hours('2026-09-23 17:30+02', 0) at time zone oslo, 'YYYY-MM-DD Dy HH24:MI'));
  v_exp := 'Mon 11:00,Mon 16:00,Fri 16:00,2026-09-28 Mon 09:00,2026-09-24 Thu 08:00';
  v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'a week without holidays counts Monday–Friday 08–16 as before',
    'expected', v_exp, 'actual', v_txt, 'pass', v_txt = v_exp);

  -- 7 ---------------------------------------------------------------- a ticket's own deadlines
  begin
    insert into app.tickets (category, queue, subject, channel, requester_email, created_at)
    values ('getting_started', 'support', 'Probe', 'admin', 'probe@holiday-probe.example', '2026-04-01 14:00+02')
    returning * into v_row;
    v_txt := v_row.priority || ' ' || to_char(v_row.first_response_due at time zone oslo, 'YYYY-MM-DD HH24:MI')
      || ' ' || to_char(v_row.resolve_due at time zone oslo, 'YYYY-MM-DD HH24:MI');
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'a ticket filed the Wednesday before Easter is due after it (16h and 80h)',
      'expected', 'normal 2026-04-08 14:00 2026-04-20 14:00', 'actual', v_txt,
      'pass', v_txt = 'normal 2026-04-08 14:00 2026-04-20 14:00');
    raise exception 'rollback';
  exception when others then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 8 ---------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from app.tickets where requester_email ilike '%@holiday-probe.example';
  v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._thi
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._thi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._thi;
  if v_failed is not null then raise exception 'ticket holiday invariants failed: %', v_failed; end if;
  if v_count <> 8 then raise exception 'ticket holiday invariants: expected 8 rows, got %', v_count; end if;
end $$;

drop table public._thi;
