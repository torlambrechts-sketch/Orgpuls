-- trial_end_invariants.sql — what happens when a trial ends unconfirmed (0052, D-94).
--
--   * the trial is 15 days and the grace 14, both functions no row can change (1)
--   * access runs trial → grace → read_only, and a confirmed plan is active (2)
--   * read-only: starting a pulse and planning a first round are refused (3, 4)
--   * read-only: the scheduler opens no planned round and holds it back, but a round already
--     open still closes on its date (5, 6)
--   * confirming lifts it: the held round opens on the next tick with its full length (7)
--   * the banner's state is for the organisation's members only (8)
--   * the unguarded originals cannot be called by a client (9)
--   * nothing written here survives (10)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/trial_end_invariants.sql

create unlogged table if not exists public._tei(seq int, name text, expected text, actual text, pass bool);
truncate public._tei;

do $$
declare
  v_org     uuid := '00000000-0000-4000-8000-000000000001';
  v_dl      uuid;
  v_rows    jsonb := '[]';
  v_json    jsonb;
  v_txt     text;
  v_ok      boolean;
  v_planned uuid;
  v_open    uuid;
  v_before  text;
  v_round   app.rounds;
  claims    constant text := '{"sub":"%s","role":"authenticated","aal":"aal1"}';
begin
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'a 15-day trial and 14 days of grace',
    'expected', '15,14', 'actual', app.trial_days() || ',' || app.grace_days(),
    'pass', app.trial_days() = 15 and app.grace_days() = 14);

  select m.user_id into v_dl from app.memberships m where m.org_id = v_org and m.role = 'daglig_leder' and m.active limit 1;
  v_before := (select to_jsonb(b)::text from app.billing b where b.org_id = v_org);

  begin
    -- 2 ---------------------------------------------------------------- the ladder
    update app.billing set confirmed_at = null, trial_started_at = now() - interval '5 days', trial_ends_at = now() + interval '10 days' where org_id = v_org;
    v_txt := app.org_access(v_org);
    update app.billing set trial_started_at = now() - interval '20 days', trial_ends_at = now() - interval '5 days' where org_id = v_org;
    v_txt := v_txt || ',' || app.org_access(v_org);
    update app.billing set trial_started_at = now() - interval '40 days', trial_ends_at = now() - interval '15 days' where org_id = v_org;
    v_txt := v_txt || ',' || app.org_access(v_org);
    update app.billing set plan = 'small', invoice_email = 'faktura@probe.example', confirmed_at = now() where org_id = v_org;
    v_txt := v_txt || ',' || app.org_access(v_org);
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'access runs trial, grace, read_only; a confirmed plan is active',
      'expected', 'trial,grace,read_only,active', 'actual', v_txt, 'pass', v_txt = 'trial,grace,read_only,active');

    -- read-only from here
    update app.billing set confirmed_at = null where org_id = v_org;

    -- 3, 4 ------------------------------------------------------------- nothing new starts
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_json := public.start_next_pulse(v_org);
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'read-only: starting a pulse is refused', 'expected', 'read_only',
      'actual', coalesce(v_json->>'error', 'ok'), 'pass', v_json->>'error' = 'read_only');
    v_json := public.plan_first_round(v_org, (current_date + 14));
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'read-only: planning a first round is refused', 'expected', 'read_only',
      'actual', coalesce(v_json->>'error', 'ok'), 'pass', v_json->>'error' = 'read_only');
    perform set_config('request.jwt.claims', '', true);

    -- 5, 6 ------------------------------------------------------------- the scheduler
    select r.id into v_planned from app.rounds r where r.org_id = v_org and r.status = 'planlagt' order by r.opens_at limit 1;
    select r.id into v_open from app.rounds r where r.org_id = v_org and r.status = 'apen' limit 1;
    update app.rounds set opens_at = now() - interval '1 hour' where id = v_planned;
    update app.rounds set closes_at = now() - interval '1 minute' where id = v_open;
    perform app.wheel_tick();
    select * into v_round from app.rounds where id = v_planned;
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'read-only: a due round is not opened, and waits', 'expected', 'planlagt, later',
      'actual', v_round.status || ', ' || case when v_round.opens_at > now() then 'later' else 'due' end,
      'pass', v_round.status = 'planlagt' and v_round.opens_at > now()
        and not exists (select 1 from app.outbox x where x.round_id = v_planned and x.kind in ('invitasjon', 'forvarsel')));
    v_txt := (select status from app.rounds where id = v_open);
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'read-only: an open round still closes on its date', 'expected', 'lukket',
      'actual', coalesce(v_txt, 'none'), 'pass', v_txt = 'lukket');

    -- 7 ---------------------------------------------------------------- confirming lifts it
    update app.billing set confirmed_at = now() where org_id = v_org;
    update app.rounds set opens_at = now() - interval '1 minute' where id = v_planned;
    perform app.wheel_tick();
    select * into v_round from app.rounds where id = v_planned;
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'confirmed: the held round opens with its full length', 'expected', 'apen, closes later',
      'actual', v_round.status || ', ' || case when v_round.closes_at > now() + interval '1 day' then 'closes later' else 'closes now' end,
      'pass', v_round.status = 'apen' and v_round.closes_at > now() + interval '1 day');

    -- 8 ---------------------------------------------------------------- the banner's state
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_txt := coalesce(public.org_access_state(v_org)->>'access', 'null');
    perform set_config('request.jwt.claims', format(claims, '00000000-0000-4000-8000-00000000e0ff'), true);
    v_txt := v_txt || ',' || coalesce(public.org_access_state(v_org)->>'access', 'null');
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'the access state is for members only', 'expected', 'active,null',
      'actual', v_txt, 'pass', v_txt = 'active,null');

    perform set_config('request.jwt.claims', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  v_ok := not has_function_privilege('authenticated', 'app.start_next_pulse_unchecked(uuid)', 'execute')
      and not has_function_privilege('authenticated', 'app.plan_first_round_unchecked(uuid,date)', 'execute')
      and not has_function_privilege('anon', 'public.org_access_state(uuid)', 'execute');
  v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'the unguarded originals are not callable by a client', 'expected', 'true',
    'actual', v_ok::text, 'pass', v_ok);

  v_txt := (select to_jsonb(b)::text from app.billing b where b.org_id = v_org);
  v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'every probe change was rolled back', 'expected', 'unchanged',
    'actual', case when v_txt is not distinct from v_before then 'unchanged' else 'changed' end, 'pass', v_txt is not distinct from v_before);

  insert into public._tei
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._tei order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._tei;
  if v_failed is not null then raise exception 'trial-end invariants failed: %', v_failed; end if;
  if v_count <> 10 then raise exception 'trial-end invariants: expected 10 rows, got %', v_count; end if;
end $$;

drop table public._tei;
