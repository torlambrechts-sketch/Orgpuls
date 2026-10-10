-- responded_at_invariants.sql — an invitation says whether its employee answered, never when (0229, D-274).
--
--   1 submit_response no longer stamps the invitation with the moment of the answer
--   2 an answer through the one write path stamps it with the round's opening, as the respondent role
--   3 no answered invitation of a round with an opening carries any other time
--   4 nothing written here survives
--
-- Reads the design fixture's open round. Every row must read pass = true.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/responded_at_invariants.sql

create unlogged table if not exists public._rai(seq int, name text, expected text, actual text, pass bool);
truncate public._rai;

do $$
declare
  v_round   uuid;
  v_opens   timestamptz;
  v_emp     uuid;
  v_tok     text;
  v_answers jsonb;
  v_res     jsonb;
  v_def     text := pg_get_functiondef('public.submit_response(text,jsonb,jsonb,jsonb,jsonb,boolean)'::regprocedure);
  v_rows    jsonb := '[]';
  v_stamp   timestamptz;
  v_cnt     int;
begin
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'submit_response does not stamp the moment of the answer',
    'expected', 'no now() on responded_at',
    'actual', case when v_def ~* 'responded_at\s*=\s*now\(\)' then 'stamps now()' else 'no now() on responded_at' end,
    'pass', v_def !~* 'responded_at\s*=\s*now\(\)');

  select r.id, r.opens_at into v_round, v_opens from app.rounds r
  where r.status = 'apen' and r.org_id = '00000000-0000-4000-8000-000000000001'
  order by r.opens_at desc limit 1;
  if v_round is null then
    raise exception 'no open round: re-run scripts/seed/design-fixture.mjs';
  end if;
  select e.id into v_emp from app.invitations i join app.employees e on e.id = i.employee_id
  where i.round_id = v_round and i.responded_at is null and i.expires_at > now() order by e.full_name desc limit 1;
  v_tok := 'fixture.' || v_round::text || '.' || v_emp::text;
  select jsonb_agg(jsonb_build_object('factor', rf.factor_key, 'ordinal', s.ordinal, 'value', 3)) into v_answers
  from app.round_factors rf join app.statements s on s.factor_key = rf.factor_key where rf.round_id = v_round;

  begin
    set local role anon;
    v_res := public.submit_response(v_tok, v_answers, '[]'::jsonb);
    reset role;
    select i.responded_at into v_stamp from app.invitations i where i.round_id = v_round and i.employee_id = v_emp;
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'an answer stamps the invitation with the round''s opening',
      'expected', 'ok, ' || v_opens::text, 'actual', coalesce(v_res->>'ok', v_res->>'error') || ', ' || coalesce(v_stamp::text, 'none'),
      'pass', (v_res->>'ok')::boolean and v_stamp = v_opens);
    raise exception 'rollback-probe';
  exception when others then
    reset role;
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  select count(*) into v_cnt from app.invitations i join app.rounds r on r.id = i.round_id
  where i.responded_at is not null and r.opens_at is not null and i.responded_at <> r.opens_at;
  v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'no answered invitation carries a time other than its round''s opening',
    'expected', '0', 'actual', v_cnt::text, 'pass', v_cnt = 0);

  select count(*) into v_cnt from app.invitations i where i.round_id = v_round and i.employee_id = v_emp and i.responded_at is not null;
  v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'the probe answer was rolled back', 'expected', '0',
    'actual', v_cnt::text, 'pass', v_cnt = 0);

  insert into public._rai
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean
  from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._rai order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._rai;
  if v_failed is not null then
    raise exception 'responded_at invariants failed: %', v_failed;
  end if;
  if v_count <> 4 then
    raise exception 'responded_at invariants: expected 4 rows, got %', v_count;
  end if;
end $$;

drop table public._rai;
