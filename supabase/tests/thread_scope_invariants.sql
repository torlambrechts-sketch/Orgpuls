-- thread_scope_invariants.sql — replying to and closing a conversation take the scope of reading
-- it (0128, D-82), proved against the live schema.
--
--   * the daglig leder replies to and closes a thread in a group that cleared k (1)
--   * an avdelingsleder replies in their own group; in another group they are denied (2)
--   * nobody replies to or closes a thread whose group is under the threshold (3)
--   * a verneombud is denied, as `conversations` shows them no single comment (4)
--   * a denied call writes nothing and moves nothing (5)
--   * nothing written here survives (6)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/thread_scope_invariants.sql

create unlogged table if not exists public._tsc(seq int, name text, expected text, actual text, pass bool);
truncate public._tsc;

do $$
declare
  v_org   uuid := '00000000-0000-4000-8000-00000000f281';
  v_dl    uuid := '00000000-0000-4000-8000-0000000f2811';
  v_al    uuid := '00000000-0000-4000-8000-0000000f2812';
  v_vo    uuid := '00000000-0000-4000-8000-0000000f2813';
  v_a     uuid;
  v_b     uuid;
  v_small uuid;
  v_meas  uuid;
  v_round uuid;
  v_ta    uuid;
  v_tb    uuid;
  v_ts    uuid;
  v_resp  uuid;
  v_txt   text;
  v_rows  jsonb := '[]';
  claims constant text := '{"sub":"%s","role":"authenticated"}';

  -- a thread on one response of the group, the group given n responses in the round
  function_thread uuid;
begin
  begin
    insert into app.organizations (id, name, org_number, employee_count) values (v_org, 'Trådsted AS', '999000281', 20);
    insert into auth.users (id, email) values (v_dl, 'dl@tsc-probe.no'), (v_al, 'al@tsc-probe.no'), (v_vo, 'vo@tsc-probe.no');
    insert into app.profiles (id, full_name) values (v_dl, 'Dag'), (v_al, 'Anne'), (v_vo, 'Vidar');
    insert into app.groups (org_id, name) values (v_org, 'A') returning id into v_a;
    insert into app.groups (org_id, name) values (v_org, 'B') returning id into v_b;
    insert into app.groups (org_id, name) values (v_org, 'Liten') returning id into v_small;
    insert into app.memberships (org_id, user_id, role) values (v_org, v_dl, 'daglig_leder'), (v_org, v_vo, 'verneombud');
    insert into app.memberships (org_id, user_id, role, group_id) values (v_org, v_al, 'avdelingsleder', v_a);
    insert into app.measurements (org_id, kind, year, label) values (v_org, 'grunnlinje', 2026, 'Probe') returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'lukket', now() - interval '20 days', now() - interval '6 days') returning id into v_round;
    -- A and B clear k (five each); Liten has three
    insert into app.responses (org_id, round_id, group_id, submitted_hour)
    select v_org, v_round, g, date_trunc('hour', now() - interval '10 days')
    from (select v_a as g from generate_series(1, 5) union all select v_b from generate_series(1, 5)
          union all select v_small from generate_series(1, 3)) x;
    foreach function_thread in array array[v_a, v_b, v_small] loop
      select r.id into v_resp from app.responses r where r.round_id = v_round and r.group_id = function_thread limit 1;
      insert into app.response_comments (response_id, factor_key, ordinal, body) values (v_resp, 'ytring', 1, 'Probe.');
      insert into app.comment_threads (org_id, response_id, factor_key, ordinal, key_hash, opened_hour)
      values (v_org, v_resp, 'ytring', 1, extensions.digest(encode(extensions.gen_random_bytes(32), 'hex'), 'sha256'),
              date_trunc('hour', now()))
      returning id into v_ts;
      if function_thread = v_a then v_ta := v_ts; elsif function_thread = v_b then v_tb := v_ts; end if;
    end loop;

    -- 1 -------------------------------------------------------------- the daglig leder
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_txt := concat_ws(',', public.reply_to_thread(v_tb, 'Takk.')->>'ok', public.set_thread(v_tb, 'lukket', null)->>'ok');
    -- a statement does not see what the functions it called wrote: read the state in the next one
    v_txt := v_txt || ',' || (select state::text from app.comment_threads where id = v_tb);
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'the daglig leder replies to and closes a thread that cleared k',
      'expected', 'true,true,lukket', 'actual', v_txt, 'pass', v_txt = 'true,true,lukket');

    -- 2 -------------------------------------------------------------- the avdelingsleder's own group only
    perform set_config('request.jwt.claims', format(claims, v_al), true);
    v_txt := concat_ws(',', public.reply_to_thread(v_ta, 'Vi ser på det.')->>'ok',
      public.reply_to_thread(v_tb, 'Ikke min gruppe.')->>'error', public.set_thread(v_tb, 'venter', true)->>'error');
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'an avdelingsleder replies in their own group and is denied in another',
      'expected', 'true,denied,denied', 'actual', v_txt, 'pass', v_txt = 'true,denied,denied');

    -- 3 -------------------------------------------------------------- under the threshold
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_txt := concat_ws(',', public.reply_to_thread(v_ts, 'Liten gruppe.')->>'error', public.set_thread(v_ts, 'lukket', null)->>'error');
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'nobody replies to or closes a thread under the threshold',
      'expected', 'denied,denied', 'actual', v_txt, 'pass', v_txt = 'denied,denied');

    -- 4 -------------------------------------------------------------- the verneombud
    perform set_config('request.jwt.claims', format(claims, v_vo), true);
    v_txt := concat_ws(',', public.reply_to_thread(v_ta, 'Verneombudet.')->>'error', public.set_thread(v_ta, 'lukket', null)->>'error');
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'a verneombud is denied, as conversations shows them no single comment',
      'expected', 'denied,denied', 'actual', v_txt, 'pass', v_txt = 'denied,denied');

    -- 5 -------------------------------------------------------------- nothing moved by a refusal
    v_txt := concat_ws(',',
      (select count(*) from app.thread_messages where thread_id = v_tb),
      (select state::text || ':' || flagged_varsel::text from app.comment_threads where id = v_tb),
      (select count(*) from app.thread_messages where thread_id = v_ts),
      (select state::text from app.comment_threads where id = v_ts),
      (select count(*) from app.thread_messages where thread_id = v_ta));
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'a denied call writes nothing and moves nothing',
      'expected', '1,lukket:false,0,venter,1', 'actual', v_txt, 'pass', v_txt = '1,lukket:false,0,venter,1');

    raise exception 'rollback';
  exception when others then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 6 ---------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id::text from auth.users where email like '%@tsc-probe.no'
    union all select id::text from app.organizations where id = v_org) x;
  v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._tsc
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._tsc order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._tsc;
  if v_failed is not null then raise exception 'thread scope invariants failed: %', v_failed; end if;
  if v_count <> 6 then raise exception 'thread scope invariants: expected 6 rows, got %', v_count; end if;
end $$;
