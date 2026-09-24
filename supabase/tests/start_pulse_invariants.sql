-- start_pulse_invariants.sql — "Start neste puls nå" (0038), proved against the live schema.
--
--   * anon may not call it; the audit table takes no client write (1, 2)
--   * an avdelingsleder and a verneombud are refused (3, 4)
--   * an open round refuses it (5)
--   * a round closed within 14 days refuses it (6)
--   * otherwise: one open puls with the next planned puls's factors, an invitation and a
--     notice per active employee, the ladder's forvarsel, and an audit row naming who (7..10)
--   * the planned rounds are left as they were (11)
--   * a second press while it runs is refused (12)
--   * with no factor to ask about, nothing is written (13)
--   * nothing written here survives (14)
--
-- Reads the design fixture's organisation. Every row must read pass = true.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/start_pulse_invariants.sql

create unlogged table if not exists public._spi(seq int, name text, expected text, actual text, pass bool);
truncate public._spi;

do $$
declare
  v_org     uuid := '00000000-0000-4000-8000-000000000001';
  v_al      uuid := '00000000-0000-4000-8000-0000000c3101';
  v_vo      uuid := '00000000-0000-4000-8000-0000000c3102';
  v_dl      uuid;
  v_rows    jsonb := '[]';
  v_json    jsonb;
  v_round   uuid;
  v_src     uuid;
  v_n       int;
  v_m       int;
  v_txt     text;
  v_planned text;
  v_want    text;
begin
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'anon may not execute it', 'expected', 'false',
    'actual', has_function_privilege('anon', 'public.start_next_pulse(uuid)', 'execute')::text,
    'pass', not has_function_privilege('anon', 'public.start_next_pulse(uuid)', 'execute'));
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'the audit table: RLS on, a read policy only, no client write',
    'expected', 'rls, 1 policy (select), no insert/update/delete',
    'actual', (select relrowsecurity::text from pg_class where oid = 'app.round_starts'::regclass) || ', '
      || (select count(*) || ' policy (' || string_agg(cmd, ',') || ')' from pg_policies where schemaname = 'app' and tablename = 'round_starts') || ', '
      || case when has_table_privilege('authenticated', 'app.round_starts', 'insert,update,delete') then 'WRITABLE' else 'no insert/update/delete' end,
    'pass', (select relrowsecurity from pg_class where oid = 'app.round_starts'::regclass)
      and (select count(*) = 1 and bool_and(cmd = 'SELECT') from pg_policies where schemaname = 'app' and tablename = 'round_starts')
      and not has_table_privilege('authenticated', 'app.round_starts', 'insert,update,delete'));

  select m.user_id into v_dl from app.memberships m
  where m.org_id = v_org and m.active and m.role = 'daglig_leder' order by m.id limit 1;

  begin
    insert into auth.users (id, email) values (v_al, 'al@sp-test.example'), (v_vo, 'vo@sp-test.example');
    insert into app.profiles (id, full_name) values (v_al, 'AL'), (v_vo, 'VO');
    insert into app.memberships (org_id, user_id, role, group_id) values
      (v_org, v_al, 'avdelingsleder', (select id from app.groups where org_id = v_org and name = 'Verksted')),
      (v_org, v_vo, 'verneombud', null);

    -- 3, 4 ------------------------------------------------------------------ roles
    perform set_config('request.jwt.claims', json_build_object('sub', v_al, 'role', 'authenticated')::text, true);
    v_json := public.start_next_pulse(v_org);
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'an avdelingsleder is refused', 'expected', 'not_available',
      'actual', coalesce(v_json->>'error', 'ok'), 'pass', v_json->>'error' = 'not_available');
    perform set_config('request.jwt.claims', json_build_object('sub', v_vo, 'role', 'authenticated')::text, true);
    v_json := public.start_next_pulse(v_org);
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'a verneombud is refused', 'expected', 'not_available',
      'actual', coalesce(v_json->>'error', 'ok'), 'pass', v_json->>'error' = 'not_available');

    -- 5 ----------------------------------------------------------------- an open round
    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    update app.rounds set status = 'apen', closes_at = now() + interval '3 days', opens_at = now() - interval '1 day'
    where id = (select r.id from app.rounds r where r.org_id = v_org and r.status = 'lukket' order by r.closes_at desc limit 1)
      and not exists (select 1 from app.rounds r where r.org_id = v_org and r.status = 'apen');
    v_json := public.start_next_pulse(v_org);
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'an open round refuses it', 'expected', 'round_open',
      'actual', coalesce(v_json->>'error', 'ok'), 'pass', v_json->>'error' = 'round_open');

    -- 6 --------------------------------------------------------- closed within 14 days
    update app.rounds set status = 'lukket', closes_at = now() - interval '3 days', opens_at = now() - interval '10 days'
    where org_id = v_org and status = 'apen';
    v_json := public.start_next_pulse(v_org);
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'a round closed three days ago refuses it', 'expected', 'too_soon',
      'actual', coalesce(v_json->>'error', 'ok'), 'pass', v_json->>'error' = 'too_soon' and v_json ? 'available_from');

    -- 7..11 ---------------------------------------------------------------- it starts
    update app.rounds set closes_at = closes_at - interval '30 days', opens_at = opens_at - interval '30 days'
    where org_id = v_org and status = 'lukket' and closes_at > now() - interval '14 days';
    select r.id into v_src from app.rounds r join app.measurements m on m.id = r.measurement_id
    where r.org_id = v_org and r.status = 'planlagt' and m.kind = 'puls' order by r.opens_at nulls last, r.id limit 1;
    select string_agg(r.id || ':' || r.opens_at, ',' order by r.id) into v_planned
    from app.rounds r where r.org_id = v_org and r.status = 'planlagt';

    -- what the new puls should ask: the next planned puls's factors, or with none planned,
    -- the factors with an open measure (the wheel's own rule)
    select coalesce(
      (select string_agg(factor_key, ',' order by factor_key) from app.round_factors where round_id = v_src),
      (select string_agg(distinct factor_key, ',' order by factor_key) from app.measures where org_id = v_org and step <> 'lukket'))
    into v_want;

    v_json := public.start_next_pulse(v_org);
    v_round := (v_json->>'round_id')::uuid;
    select string_agg(factor_key, ',' order by factor_key) into v_txt from app.round_factors where round_id = v_round;
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'one open puls, with the next planned puls''s factors',
      'expected', 'ok, apen, ' || v_want,
      'actual', coalesce(v_json->>'error', 'ok') || ', ' || coalesce((select status::text from app.rounds where id = v_round), '-') || ', ' || coalesce(v_txt, ''),
      'pass', (v_json->>'ok')::boolean and (select status from app.rounds where id = v_round) = 'apen'
              and v_txt = v_want
              and (select count(*) from app.rounds where org_id = v_org and status = 'apen') = 1);

    select count(*) into v_n from app.invitations where round_id = v_round;
    select count(*) into v_m from app.employees where org_id = v_org and active;
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'an invitation per active employee, none redeemable yet',
      'expected', v_m || ' invitations, 0 sent', 'actual', v_n || ' invitations, ' || (select count(*) from app.invitations where round_id = v_round and sent_at is not null) || ' sent',
      'pass', v_n = v_m and v_n > 0 and not exists (select 1 from app.invitations where round_id = v_round and sent_at is not null));

    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'a notice per invitation, and the ladder''s forvarsel',
      'expected', v_n || ' invitasjon, ' || (select count(*) from app.wheel_notifications n join app.year_wheels w on w.id = n.wheel_id where w.org_id = v_org) || ' forvarsel',
      'actual', (select count(*) from app.outbox where round_id = v_round and kind = 'invitasjon') || ' invitasjon, '
        || (select count(*) from app.outbox where round_id = v_round and kind = 'forvarsel') || ' forvarsel',
      'pass', (select count(*) from app.outbox where round_id = v_round and kind = 'invitasjon') = v_n
        and (select count(*) from app.outbox where round_id = v_round and kind = 'forvarsel')
          = (select count(*) from app.wheel_notifications n join app.year_wheels w on w.id = n.wheel_id where w.org_id = v_org));

    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'the start is recorded, with who pressed it',
      'expected', '1 row, the daglig leder', 'actual', (select count(*) || ' row, ' || case when bool_and(started_by = v_dl) then 'the daglig leder' else 'SOMEONE ELSE' end from app.round_starts where round_id = v_round),
      'pass', (select count(*) = 1 and bool_and(started_by = v_dl) from app.round_starts where round_id = v_round));

    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'the planned rounds are left as they were', 'expected', 'unchanged',
      'actual', case when v_planned is not distinct from (select string_agg(r.id || ':' || r.opens_at, ',' order by r.id) from app.rounds r where r.org_id = v_org and r.status = 'planlagt') then 'unchanged' else 'CHANGED' end,
      'pass', v_planned is not distinct from (select string_agg(r.id || ':' || r.opens_at, ',' order by r.id) from app.rounds r where r.org_id = v_org and r.status = 'planlagt'));

    -- 12 -------------------------------------------------------------- a second press
    v_json := public.start_next_pulse(v_org);
    v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'a second press is refused: the first is open', 'expected', 'round_open',
      'actual', coalesce(v_json->>'error', 'ok'), 'pass', v_json->>'error' = 'round_open');

    -- 13 --------------------------------------------------------- nothing to ask about
    delete from app.rounds where id = v_round;
    delete from app.rounds r using app.measurements m
    where m.id = r.measurement_id and r.org_id = v_org and r.status = 'planlagt' and m.kind = 'puls';
    delete from app.measures where org_id = v_org;
    select count(*) into v_n from app.rounds where org_id = v_org;
    v_json := public.start_next_pulse(v_org);
    v_rows := v_rows || jsonb_build_object('seq', 13, 'name', 'no factor to ask about: refused, and nothing written',
      'expected', 'no_factors, ' || v_n || ' rounds', 'actual', coalesce(v_json->>'error', 'ok') || ', ' || (select count(*) from app.rounds where org_id = v_org) || ' rounds',
      'pass', v_json->>'error' = 'no_factors' and (select count(*) from app.rounds where org_id = v_org) = v_n);

    perform set_config('request.jwt.claims', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  v_rows := v_rows || jsonb_build_object('seq', 14, 'name', 'every probe row was rolled back', 'expected', '0 users, 0 starts',
    'actual', (select count(*) from auth.users where id in (v_al, v_vo)) || ' users, ' || (select count(*) from app.round_starts where org_id = v_org) || ' starts',
    'pass', not exists (select 1 from auth.users where id in (v_al, v_vo)) and not exists (select 1 from app.round_starts where org_id = v_org));

  insert into public._spi
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean
  from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._spi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._spi;
  if v_failed is not null then
    raise exception 'start pulse invariants failed: %', v_failed;
  end if;
  if v_count <> 14 then
    raise exception 'start pulse invariants: expected 14 rows, got %', v_count;
  end if;
end $$;

drop table public._spi;
