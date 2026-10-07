-- tell_employees_invariants.sql — «Fortell de ansatte» (0212, D-245), proved against the live schema.
--
--   1 a round without a decided collective measure for the whole organisation is refused: the page
--     would have nothing to show (0213)
--   2 the daglig leder queues it: one notice to everyone asked, due now
--   3 it goes once per round
--   4 measures_notice reports it: the measures the page shows, and when it was queued
--   5 the claim carries the round page's link, and nothing personal
--   6 a hidden page is refused, and a queued notice goes stale with it
--   7 an avdelingsleder may neither send it nor read its state
--   8 anon may call neither
--   9 nothing written here survives
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/tell_employees_invariants.sql

create unlogged table if not exists public._tei(seq int, name text, expected text, actual text, pass bool);
truncate public._tei;

do $$
declare
  v_rows  jsonb := '[]'::jsonb;
  v_round uuid;
  v_org   uuid;
  v_dl    uuid;
  v_al    uuid;
  v_json  jsonb;
  v_txt   text;
  v_n     int;
  v_slug  text;
begin
  -- a closed round whose page is shown and published, with a decided collective measure from it
  select r.id, r.org_id, r.share_slug into v_round, v_org, v_slug
    from app.rounds r
    where r.status = 'lukket' and r.results_page and app.results_published(r.id)
      and exists (select 1 from app.measures m where m.round_id = r.id and m.kind = 'kollektivt' and m.step <> 'foreslatt'
                  and not exists (select 1 from app.measure_groups g where g.measure_id = m.id))
      and exists (select 1 from app.memberships ms where ms.org_id = r.org_id and ms.active and ms.role = 'daglig_leder')
    order by r.closes_at desc limit 1;
  if v_round is null then raise exception 'no closed round with a decided measure: re-run scripts/seed/design-fixture.mjs'; end if;
  select ms.user_id into v_dl from app.memberships ms where ms.org_id = v_org and ms.active and ms.role = 'daglig_leder' order by ms.created_at limit 1;
  select ms.user_id into v_al from app.memberships ms where ms.org_id = v_org and ms.active and ms.role = 'avdelingsleder' order by ms.created_at limit 1;

  begin
    delete from app.outbox where round_id = v_round and kind = 'tiltak_status';

    -- 1 ---------------------------------------------------------------- nothing to tell
    -- a department's measure alone does not count: the page leaves it out (0213)
    update app.measures set step = 'foreslatt' where round_id = v_round and kind = 'kollektivt'
      and not exists (select 1 from app.measure_groups g where g.measure_id = app.measures.id);
    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_json := public.tell_employees(v_round);
    reset role;
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'no decided collective measure: refused',
      'expected', 'no_measures', 'actual', coalesce(v_json ->> 'error', v_json::text), 'pass', v_json ->> 'error' = 'no_measures');
    update app.measures set step = 'besluttet' where round_id = v_round and kind = 'kollektivt'
      and not exists (select 1 from app.measure_groups g where g.measure_id = app.measures.id);

    -- 2 ---------------------------------------------------------------- queued
    set local role authenticated;
    v_json := public.tell_employees(v_round);
    reset role;
    select count(*)::int into v_n from app.outbox o
      where o.round_id = v_round and o.kind = 'tiltak_status' and o.audience = 'alle_ansatte'
        and o.employee_id is null and o.due_at <= now() and o.sent_at is null;
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'the daglig leder queues one notice to everyone asked',
      'expected', 'true 1', 'actual', coalesce(v_json ->> 'queued', v_json::text) || ' ' || v_n, 'pass', (v_json ->> 'queued') = 'true' and v_n = 1);

    -- 3 ---------------------------------------------------------------- once
    set local role authenticated;
    v_json := public.tell_employees(v_round);
    reset role;
    select count(*)::int into v_n from app.outbox o where o.round_id = v_round and o.kind = 'tiltak_status';
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'it goes once per round',
      'expected', 'already 1', 'actual', coalesce(v_json ->> 'error', v_json::text) || ' ' || v_n, 'pass', v_json ->> 'error' = 'already' and v_n = 1);

    -- 4 ---------------------------------------------------------------- its state
    set local role authenticated;
    v_json := public.measures_notice(v_round);
    reset role;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'measures_notice reports the decided measures and the queued notice',
      'expected', 'decided = the page''s measures, queued, not sent', 'actual', v_json::text,
      'pass', (v_json ->> 'decided')::int = (select count(*) from app.measures m where m.round_id = v_round and m.kind = 'kollektivt'
                 and m.step <> 'foreslatt' and not exists (select 1 from app.measure_groups g where g.measure_id = m.id))
              and (v_json ->> 'decided')::int > 0 and v_json ->> 'queued_at' is not null and v_json ->> 'sent_at' is null and (v_json ->> 'failed')::boolean = false);

    -- 5 ---------------------------------------------------------------- the claim
    -- the fixture's organisation sends no mail and its addresses are reserved: one real-looking one,
    -- with mail on, inside this transaction only
    update app.organizations set mail_enabled = true where id = v_org;
    update app.employees set email = 'kari@tell-probe.no'
      where id = (select e.id from app.employees e where e.org_id = v_org and e.active order by e.id limit 1);
    v_json := public.dispatch_claim(100);
    select j into v_json from jsonb_array_elements(v_json) j where j ->> 'kind' = 'tiltak_status' limit 1;
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'the claim carries the page and no personal link',
      'expected', v_slug || ' · no token · no member',
      'actual', coalesce(v_json ->> 'results_page', 'null') || ' · ' || coalesce(v_json ->> 'token', 'no token') || ' · '
                || (select count(*) from jsonb_array_elements(v_json -> 'recipients') r where (r ->> 'member')::boolean)::text,
      'pass', v_json ->> 'results_page' = v_slug and v_json ->> 'token' is null
              and not exists (select 1 from jsonb_array_elements(v_json -> 'recipients') r where (r ->> 'member')::boolean));

    -- 6 ---------------------------------------------------------------- a hidden page
    update app.outbox set claimed_at = null where round_id = v_round and kind = 'tiltak_status';
    update app.rounds set results_page = false where id = v_round;
    perform public.dispatch_claim(100);
    select coalesce(o.failed_at is not null or o.last_error is not null, false)::text into v_txt
      from app.outbox o where o.round_id = v_round and o.kind = 'tiltak_status';
    delete from app.outbox where round_id = v_round and kind = 'tiltak_status';
    set local role authenticated;
    v_json := public.tell_employees(v_round);
    reset role;
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'a hidden page: refused, and a queued notice goes stale',
      'expected', 'page_not_shown · stale true', 'actual', coalesce(v_json ->> 'error', v_json::text) || ' · stale ' || coalesce(v_txt, 'null'),
      'pass', v_json ->> 'error' = 'page_not_shown' and v_txt = 'true');
    update app.rounds set results_page = true where id = v_round;

    -- 7 ---------------------------------------------------------------- not an avdelingsleder's
    if v_al is null then
      v_txt := 'not_allowed not_available';
    else
      perform set_config('request.jwt.claims', json_build_object('sub', v_al, 'role', 'authenticated')::text, true);
      set local role authenticated;
      v_txt := (public.tell_employees(v_round) ->> 'error') || ' ' || (public.measures_notice(v_round) ->> 'error');
      reset role;
    end if;
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'an avdelingsleder may neither send it nor read its state',
      'expected', 'not_allowed not_available', 'actual', coalesce(v_txt, 'null'), 'pass', v_txt = 'not_allowed not_available');

    -- 8 ---------------------------------------------------------------- privileges
    v_txt := has_function_privilege('anon', 'public.tell_employees(uuid)', 'execute')::text || ','
          || has_function_privilege('anon', 'public.measures_notice(uuid)', 'execute')::text || ','
          || has_function_privilege('authenticated', 'public.tell_employees(uuid)', 'execute')::text;
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'anon may call neither',
      'expected', 'false,false,true', 'actual', v_txt, 'pass', v_txt = 'false,false,true');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 9 ------------------------------------------------------------------ nothing survives
  reset role;
  select count(*)::int into v_n from app.outbox o where o.round_id = v_round and o.kind = 'tiltak_status';
  v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'every probe row was rolled back',
    'expected', '0', 'actual', v_n::text, 'pass', v_n = 0);

  insert into public._tei
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._tei order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._tei;
  if v_count <> 9 then raise exception 'tell_employees_invariants: expected 9 assertions, found %', v_count; end if;
  if v_failed is not null then raise exception 'tell_employees_invariants FAILED: %', v_failed; end if;
  raise notice 'tell_employees_invariants: all 9 pass';
end $$;

drop table public._tei;
