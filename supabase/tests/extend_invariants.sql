-- extend_invariants.sql — «Forleng tre dager hvis svarprosenten er under 50» (0096, D-146), proved
-- against the live schema.
--
--   * a round whose closing time has come with fewer than half answered stays open three days
--     more: closes_at and the unanswered invitations' expires_at move, extended_at is set (1)
--   * everyone who has not answered gets a reminder now; nobody who answered does (2)
--   * a tick before the new closing time changes nothing (3)
--   * once per round: at the new closing time it closes, however few answered (4)
--   * half or more answered: it closes on time (5)
--   * the wheel's switch off: it closes on time, however few answered (6)
--   * nothing written here survives (7)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/extend_invariants.sql

create unlogged table if not exists public._exi(seq int, name text, expected text, actual text, pass bool);
truncate public._exi;

do $$
declare
  v_org    uuid := '00000000-0000-4000-8000-00000000ad01';
  v_meas   uuid := '00000000-0000-4000-8000-00000000ad02';
  v_wheel  uuid;
  v_grp    uuid;
  v_low    uuid;
  v_half   uuid;
  v_off    uuid;
  v_close  timestamptz := date_trunc('minute', now()) - interval '1 minute';
  v_r      app.rounds;
  v_txt    text;
  v_rows   jsonb := '[]';
  v_cnt    int;
begin
  begin
    insert into app.organizations (id, name, org_number, employee_count)
    values (v_org, 'Forleng Test AS', '999000666', 8);
    insert into app.groups (org_id, name) values (v_org, 'Alle') returning id into v_grp;
    insert into app.employees (org_id, group_id, full_name, email)
    select v_org, v_grp, 'Ansatt ' || n, 'a' || n || '@extend-test.example' from generate_series(1, 4) n;
    insert into app.year_wheels (org_id, active, extend_if_low) values (v_org, true, true) returning id into v_wheel;
    insert into app.measurements (id, org_id, kind, year, label) values (v_meas, v_org, 'puls', 2026, 'Probe');

    -- three open rounds past their closing time: one in four answered, two in four, one in four
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'apen', v_close - interval '7 days', v_close) returning id into v_low;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'apen', v_close - interval '7 days', v_close) returning id into v_half;
    insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at, responded_at)
    select v_org, x.rid, e.id, extensions.digest(x.rid::text || e.id::text, 'sha256'), v_close,
           case when row_number() over (partition by x.rid order by e.full_name) <= x.answered then now() - interval '1 day' end
    from app.employees e
    cross join (values (v_low, 1), (v_half, 2)) as x(rid, answered)
    where e.org_id = v_org;
    -- the responses the rate is counted from: one and two
    insert into app.responses (org_id, round_id, group_id, submitted_hour)
    select v_org, x.rid, v_grp, date_trunc('hour', now()) - interval '1 day'
    from (values (v_low), (v_half), (v_half)) as x(rid);

    perform app.wheel_tick();

    -- 1 ---------------------------------------------------------------- extended
    select * into v_r from app.rounds where id = v_low;
    v_txt := concat_ws('|', v_r.status, (v_r.closes_at = v_close + interval '3 days')::text, (v_r.extended_at is not null)::text,
      (select count(*) from app.invitations i where i.round_id = v_low and i.responded_at is null and i.expires_at = v_close + interval '3 days'),
      (select count(*) from app.invitations i where i.round_id = v_low and i.responded_at is not null and i.expires_at = v_close));
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'one in four answered: open three days more, the unanswered links with it, marked extended',
      'expected', 'apen|true|true|3|1', 'actual', v_txt, 'pass', v_txt = 'apen|true|true|3|1');

    -- 2 ---------------------------------------------------------------- a reminder to the rest
    v_txt := concat_ws('|',
      (select count(*) from app.outbox o where o.round_id = v_low and o.kind = 'paminnelse' and o.due_at <= now() and o.sent_at is null),
      (select count(*) from app.outbox o join app.invitations i on i.id = o.invitation_id
        where o.round_id = v_low and o.kind = 'paminnelse' and i.responded_at is not null));
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'a reminder now to the three who have not answered, none to the one who has',
      'expected', '3|0', 'actual', v_txt, 'pass', v_txt = '3|0');

    -- 5 ---------------------------------------------------------------- half answered
    v_txt := (select status::text || '|' || (extended_at is null)::text from app.rounds where id = v_half);
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'two in four answered: closes on time',
      'expected', 'lukket|true', 'actual', v_txt, 'pass', v_txt = 'lukket|true');

    -- 3 ---------------------------------------------------------------- nothing before its time
    perform app.wheel_tick();
    select * into v_r from app.rounds where id = v_low;
    v_txt := v_r.status || '|' || (v_r.closes_at = v_close + interval '3 days')::text;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'a tick before the new closing time changes nothing',
      'expected', 'apen|true', 'actual', v_txt, 'pass', v_txt = 'apen|true');

    -- 4 ---------------------------------------------------------------- once per round
    update app.rounds set closes_at = now() - interval '1 minute' where id = v_low;
    perform app.wheel_tick();
    v_txt := (select status::text from app.rounds where id = v_low);
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'once per round: at its new closing time it closes, however few answered',
      'expected', 'lukket', 'actual', v_txt, 'pass', v_txt = 'lukket');

    -- 6 ---------------------------------------------------------------- the switch off
    update app.year_wheels set extend_if_low = false where id = v_wheel;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'apen', v_close - interval '7 days', v_close) returning id into v_off;
    insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at)
    select v_org, v_off, e.id, extensions.digest('off' || e.id::text, 'sha256'), v_close
    from app.employees e where e.org_id = v_org;
    perform app.wheel_tick();
    v_txt := (select status::text || '|' || (extended_at is null)::text from app.rounds where id = v_off);
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'the wheel''s switch off: nobody answered, and it closes on time',
      'expected', 'lukket|true', 'actual', v_txt, 'pass', v_txt = 'lukket|true');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 7 ------------------------------------------------------------------ nothing left
  select count(*) into v_cnt from app.organizations where id = v_org;
  v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'every probe row was rolled back',
    'expected', '0', 'actual', v_cnt::text, 'pass', v_cnt = 0);

  insert into public._exi
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._exi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._exi;
  if v_failed is not null then raise exception 'extend invariants failed: %', v_failed; end if;
  if v_count <> 7 then raise exception 'extend invariants: expected 7 rows, got %', v_count; end if;
end $$;

drop table public._exi;
