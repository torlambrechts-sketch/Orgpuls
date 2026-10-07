-- innsikt_visit_invariants.sql — «Du var sist inne» (0210, D-244), proved against the live schema.
--
--   1 a first visit has no earlier day
--   2 a visit on a later day returns the day before it, and moves it along
--   3 a second visit the same day returns the same earlier day
--   4 a person who is not a member of the organisation gets nothing and changes nothing
--   5 anon may not call it; no client role may write the columns directly
--   6 nothing written here survives
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/innsikt_visit_invariants.sql

create unlogged table if not exists public._ivi(seq int, name text, expected text, actual text, pass bool);
truncate public._ivi;

do $$
declare
  v_rows jsonb := '[]'::jsonb;
  v_org  uuid;
  v_user uuid;
  v_ms   uuid;
  v_d    date;
  v_txt  text;
  v_today date := (now() at time zone 'Europe/Oslo')::date;
  v_outsider uuid := '00000000-0000-4000-8000-0000000e2101';
  v_orig text;
begin
  select m.org_id, m.user_id, m.id into v_org, v_user, v_ms from app.memberships m
    where m.active order by m.created_at, m.id limit 1;
  select coalesce(m.seen_on::text, 'null') || ' ' || coalesce(m.previous_seen_on::text, 'null') into v_orig
    from app.memberships m where m.id = v_ms;
  begin
    update app.memberships set seen_on = null, previous_seen_on = null where id = v_ms;
    perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    set local role authenticated;

    -- 1 ---------------------------------------------------------------- first visit
    v_d := public.innsikt_visit(v_org);
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'a first visit has no earlier day',
      'expected', 'null', 'actual', coalesce(v_d::text, 'null'), 'pass', v_d is null);

    -- 2 ---------------------------------------------------------------- a later day
    reset role;
    update app.memberships set seen_on = v_today - 11 where id = v_ms;
    set local role authenticated;
    v_d := public.innsikt_visit(v_org);
    reset role;
    select m.previous_seen_on::text || ' ' || m.seen_on::text into v_txt from app.memberships m where m.id = v_ms;
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'a later day returns the day before, and moves it along',
      'expected', (v_today - 11)::text || ' | ' || (v_today - 11)::text || ' ' || v_today::text,
      'actual', coalesce(v_d::text, 'null') || ' | ' || coalesce(v_txt, 'null'),
      'pass', v_d = v_today - 11 and v_txt = (v_today - 11)::text || ' ' || v_today::text);

    -- 3 ---------------------------------------------------------------- the same day again
    set local role authenticated;
    v_d := public.innsikt_visit(v_org);
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'a second visit the same day returns the same earlier day',
      'expected', (v_today - 11)::text, 'actual', coalesce(v_d::text, 'null'), 'pass', v_d = v_today - 11);

    -- 4 ---------------------------------------------------------------- not a member
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_d := public.innsikt_visit(v_org);
    reset role;
    select count(*)::text into v_txt from app.memberships m where m.user_id = v_outsider;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'a non-member gets nothing and changes nothing',
      'expected', 'null 0', 'actual', coalesce(v_d::text, 'null') || ' ' || v_txt, 'pass', v_d is null and v_txt = '0');

    -- 5 ---------------------------------------------------------------- privileges
    v_txt := has_function_privilege('anon', 'public.innsikt_visit(uuid)', 'execute')::text || ','
          || has_function_privilege('authenticated', 'public.innsikt_visit(uuid)', 'execute')::text || ','
          || has_column_privilege('authenticated', 'app.memberships', 'seen_on', 'update')::text || ','
          || has_column_privilege('authenticated', 'app.memberships', 'previous_seen_on', 'update')::text;
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'only a signed-in member calls it; nobody writes the columns directly',
      'expected', 'false,true,false,false', 'actual', v_txt, 'pass', v_txt = 'false,true,false,false');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 6 ------------------------------------------------------------------ nothing survives
  reset role;
  select coalesce(m.seen_on::text, 'null') || ' ' || coalesce(m.previous_seen_on::text, 'null') into v_txt
    from app.memberships m where m.id = v_ms;
  v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'the probe visits were rolled back',
    'expected', v_orig, 'actual', v_txt, 'pass', v_txt = v_orig);

  insert into public._ivi
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._ivi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._ivi;
  if v_count <> 6 then raise exception 'innsikt_visit_invariants: expected 6 assertions, found %', v_count; end if;
  if v_failed is not null then raise exception 'innsikt_visit_invariants FAILED: %', v_failed; end if;
  raise notice 'innsikt_visit_invariants: all 6 pass';
end $$;

drop table public._ivi;
