-- report_invariants.sql — the last three sections of the statutory report.
--
-- Migration 0023 supplied the three facts sections 6, 7 and 8 had been waiting on. The
-- assertions that matter here are about the screening counts, because that RPC reads the
-- most sensitive rows in the database: whether somebody has experienced harassment or
-- violence at work.
--
-- The rule the design states for those two questions is stricter than k elsewhere —
-- **counts only, for the whole undertaking, never per group** — and assertion 8 is the one
-- that keeps it: it searches the entire JSON output for any spelling of a group, exactly
-- as `conversation_invariants.sql` does for a comment. A later version that added a
-- breakdown "for convenience" fails here rather than in review.
--
--   psql "$DATABASE_URL" -f supabase/tests/report_invariants.sql

create unlogged table if not exists public._rp(seq int, name text, expected text, actual text, pass bool);
truncate public._rp;

do $$
declare
  v_org uuid; v_user uuid; v_round uuid; v_meas uuid; v_small uuid;
  v_json jsonb; v_n int; v_msg text; v_m uuid;
begin
  select id into v_org from app.organizations order by id limit 1;
  select user_id into v_user from app.memberships where org_id = v_org and active limit 1;
  select r.id into v_round from app.rounds r where r.org_id = v_org and r.status = 'lukket'
    order by r.closes_at desc limit 1;

  -- 1..3 -------------------------------------------- the effect link's own rules
  select id into v_m from app.measures where org_id = v_org and effect_round_id is not null limit 1;

  begin
    update app.measures set effect_round_id = round_id where id = v_m;
    insert into public._rp values (1, 'a measure cannot be evaluated by its own round', 'rejected', 'ACCEPTED', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into public._rp values (1, 'a measure cannot be evaluated by its own round', 'rejected', left(v_msg,70), true);
  end;

  insert into app.organizations (id, name, org_number, employee_count, threshold)
  values ('00000000-0000-4000-8000-0000000000ff', 'Testvirksomhet AS', '999999999', 1, 5)
  on conflict (id) do nothing;
  insert into app.measurements (org_id, kind, year, label)
  values ('00000000-0000-4000-8000-0000000000ff', 'puls', 2099, 'Annen') returning id into v_meas;
  insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
  values ('00000000-0000-4000-8000-0000000000ff', v_meas, 'planlagt', now(), now() + interval '7 days')
  returning id into v_small;

  begin
    update app.measures set effect_round_id = v_small where id = v_m;
    insert into public._rp values (2, 'nor by a round in another organisation', 'rejected', 'ACCEPTED', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into public._rp values (2, 'nor by a round in another organisation', 'rejected', left(v_msg,70), true);
  end;

  insert into public._rp
  select 3, 'the effect link survives the round being deleted', 'set null',
         confdeltype::text, confdeltype = 'n'
  from pg_constraint
  where conrelid = 'app.measures'::regclass and contype = 'f'
    and conkey = array[(select attnum from pg_attribute
                        where attrelid = 'app.measures'::regclass and attname = 'effect_round_id')];

  -- 4..9 ------------------------------------------------------- the screening RPC
  insert into public._rp
  select 4, 'no client role may execute the screening reader', '0', count(*)::text, count(*) = 0
  from information_schema.role_routine_grants
  where routine_schema = 'public' and routine_name = 'screening_counts'
    and grantee in ('anon', 'public');

  perform set_config('request.jwt.claims',
    json_build_object('sub','00000000-0000-4000-8000-00000000dead','role','authenticated')::text, true);
  v_json := public.screening_counts(v_round);
  insert into public._rp values (5, 'a caller with no membership gets nothing', 'not_available',
    coalesce(v_json->>'error','RETURNED'), v_json->>'error' = 'not_available');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role','authenticated')::text, true);
  v_json := public.screening_counts(v_round);

  insert into public._rp values (6, 'a member gets the counts', 'ok',
    coalesce(v_json->>'status','none'), v_json->>'status' = 'ok');

  insert into public._rp
  select 7, 'the design''s figure: three of 28 said yes to krenkende', '3|28',
         coalesce((
           select ((q->'options'->1->>'n')::int + (q->'options'->2->>'n')::int)::text
                  || '|' || (q->>'answered')
           from jsonb_array_elements(v_json->'questions') q where q->>'key' = 'krenkende'
         ), 'none'),
         (select (q->'options'->1->>'n')::int + (q->'options'->2->>'n')::int = 3
                 and (q->>'answered')::int = 28
          from jsonb_array_elements(v_json->'questions') q where q->>'key' = 'krenkende');

  /*
   * The assertion the whole section rests on. Anything that could name a group is a
   * breakdown, and a breakdown of this question is the one thing it may never have.
   */
  insert into public._rp
  select 8, 'no group, group_id or group_name anywhere in the output', 'true',
         (v_json::text !~* '(group_id|group_name|"group"|gruppe)')::text,
         v_json::text !~* '(group_id|group_name|"group"|gruppe)';

  insert into public._rp
  select 9, 'nor a response id', 'true',
         (v_json::text not like '%response%')::text,
         v_json::text not like '%response%';

  -- 10 ------------------------------------- a round under k yields no counts at all
  insert into app.measurements (org_id, kind, year, label)
  values (v_org, 'puls', 2094, 'Terskeltest') returning id into v_meas;
  insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
  values (v_org, v_meas, 'lukket', now() - interval '2 days', now() - interval '1 day')
  returning id into v_small;
  insert into app.responses (org_id, round_id, group_id, submitted_hour)
  select v_org, v_small, (select id from app.groups where org_id = v_org limit 1),
         date_trunc('hour', now())
  from generate_series(1, 3);

  v_json := public.screening_counts(v_small);
  insert into public._rp values (10, 'a round under the threshold yields no counts',
    'insufficient_data', coalesce(v_json->>'status', v_json->>'error'),
    v_json->>'status' = 'insufficient_data');

  perform set_config('request.jwt.claims', '', true);

  -- 11..15 -------------------------------------------- information and training
  insert into public._rp
  select 11, 'RLS on both section 8 tables', '2', count(*)::text, count(*) = 2
  from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'app'
  where c.relname in ('round_information', 'trainings') and c.relrowsecurity;

  insert into public._rp
  select 12, 'no grants to anon on either', '0', count(*)::text, count(*) = 0
  from information_schema.role_table_grants
  where table_schema = 'app' and grantee = 'anon'
    and table_name in ('round_information', 'trainings');

  insert into public._rp
  select 13, 'neither table holds a column that could name a respondent', '0', count(*)::text, count(*) = 0
  from pg_attribute
  where attrelid in ('app.round_information'::regclass, 'app.trainings'::regclass)
    and attnum > 0 and not attisdropped
    and attname ~* '(response|employee|answer|person)';

  begin
    insert into app.round_information (org_id, round_id, audience, channel, held_on)
    values ('00000000-0000-4000-8000-0000000000ff', v_round, 'alle_ansatte', 'allmote', current_date);
    insert into public._rp values (14, 'an information record from another org is refused', 'rejected', 'ACCEPTED', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into public._rp values (14, 'an information record from another org is refused', 'rejected', left(v_msg,70), true);
  end;

  begin
    insert into app.trainings (org_id, title, audience, held_on, next_due)
    values (v_org, 'Bakover i tid', 'ledere', current_date, current_date - 1);
    insert into public._rp values (15, 'training due before it was held is refused', 'rejected', 'ACCEPTED', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into public._rp values (15, 'training due before it was held is refused', 'rejected', left(v_msg,70), true);
  end;

  -- 16 ----------------------------------------------------------------- cleanup
  delete from app.measurements where id = v_meas;
  delete from app.organizations where id = '00000000-0000-4000-8000-0000000000ff';
  -- back to the round the fixture chose: the grunnlinje that measured the effect, which
  -- is never the round the measure was raised from
  update app.measures set effect_round_id = v_round where id = v_m;
  select count(*) into v_n from app.organizations where id = '00000000-0000-4000-8000-0000000000ff';
  insert into public._rp values (16, 'test rows removed', '0', v_n::text, v_n = 0);
end $$;

select seq, name, expected, actual, pass from public._rp order by seq;

do $$
declare v_failed text;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) into v_failed
  from public._rp where not pass;
  if v_failed is not null then
    raise exception 'report invariants failed: %', v_failed;
  end if;
end $$;

drop table public._rp;
