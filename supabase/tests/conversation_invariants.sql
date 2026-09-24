-- conversation_invariants.sql — anonymous two-way, proved against the live schema.
--
-- Samtaler is the screen where the product's central promise is easiest to break. A
-- leader reads what somebody wrote and answers them; the person receives the answer; and
-- the organisation must still be unable to tell who wrote it. Migration 0018 does that
-- with a capability the respondent holds and the database cannot compute. What has to
-- hold, and is asserted here:
--
--   * Neither table is readable by any client role. Not "readable through a policy" —
--     no policy exists, and no grant, so the SECURITY DEFINER functions are the only way
--     anything leaves. Same shape as app.responses and app.answers.
--   * A thread references nothing that reaches a person. Asserted on the foreign keys,
--     so a column added later that points at employees, invitations, profiles or
--     auth.users fails here rather than in review.
--   * k is applied per thread, exactly as it is per result cell: a comment from a group
--     that did not clear the threshold is ABSENT, not masked. Masking would still say
--     "somebody in Administrasjon wrote something", which in a group of three is most of
--     the way to a name.
--   * The group never travels with the comment even when it is released, under any key
--     name. Asserted by searching the whole JSON output.
--   * The capability is stored as a digest; the plaintext exists once, in the caller's
--     hands, and is not in any column.
--
--   psql "$DATABASE_URL" -f supabase/tests/conversation_invariants.sql
--
-- Through the Supabase MCP instead, run it as separate statements: the three DO blocks,
-- then the final select and its verdict.
--
-- NOTE ON ASSERTION 20. It began as "a verneombud cannot reply", and SKIPPED, because no
-- verneombud is seeded — a skipped assertion proves nothing. It now calls as a signed-in
-- user holding no membership at all, which exercises the same `app.has_role` gate and
-- actually runs.

create unlogged table if not exists public._ci(seq int, name text, expected text, actual text, pass bool);
truncate public._ci;

-- ---------------------------------------------------------------- structure and the k gate
do $$
declare
  v_org uuid; v_user uuid; v_meas uuid; v_round uuid;
  v_gbig uuid; v_gsmall uuid; v_resp uuid; v_thread_big uuid; v_thread_small uuid;
  v_key text := encode(extensions.gen_random_bytes(32), 'hex');
  v_msg text; v_n int; v_json jsonb; i int;
begin
  select id into v_org from app.organizations order by id limit 1;
  select user_id into v_user from app.memberships
    where org_id = v_org and active and role = 'daglig_leder' limit 1;
  select id into v_gbig   from app.groups where org_id = v_org and name = 'Drift';
  select id into v_gsmall from app.groups where org_id = v_org and name = 'Administrasjon';

  insert into public._ci
  select 1, 'RLS on both conversation tables', '2', count(*)::text, count(*) = 2
  from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'app'
  where c.relname in ('comment_threads','thread_messages') and c.relrowsecurity;

  insert into public._ci
  select 2, 'no grants to anon OR authenticated on either table', '0', count(*)::text, count(*) = 0
  from information_schema.role_table_grants
  where table_schema = 'app' and grantee in ('anon','authenticated')
    and table_name in ('comment_threads','thread_messages');

  insert into public._ci
  select 3, 'no select policy exists on either table', '0', count(*)::text, count(*) = 0
  from pg_policies where schemaname = 'app'
    and tablename in ('comment_threads','thread_messages');

  insert into public._ci
  select 4, 'a thread references nothing that reaches a person',
         'organizations,responses,response_comments',
         coalesce(string_agg(distinct confrelid::regclass::text, ',' order by confrelid::regclass::text), 'none'),
         not bool_or(confrelid::regclass::text in
           ('app.employees','app.invitations','app.profiles','auth.users','app.memberships'))
  from pg_constraint where conrelid = 'app.comment_threads'::regclass and contype = 'f';

  insert into public._ci
  select 5, 'the thread key is stored as bytea, never as text', 'bytea', format_type(atttypid, atttypmod),
         format_type(atttypid, atttypmod) = 'bytea'
  from pg_attribute where attrelid = 'app.comment_threads'::regclass and attname = 'key_hash';

  insert into app.measurements (org_id, kind, year, label)
  values (v_org, 'puls', 2098, 'Samtaletest') returning id into v_meas;
  insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
  values (v_org, v_meas, 'apen', now() - interval '1 day', now() + interval '1 day')
  returning id into v_round;
  insert into app.round_factors (org_id, round_id, factor_key) values (v_org, v_round, 'ytring');

  for i in 1..5 loop
    insert into app.responses (org_id, round_id, group_id, submitted_hour)
    values (v_org, v_round, v_gbig, date_trunc('hour', now())) returning id into v_resp;
    insert into app.answers (response_id, factor_key, ordinal, value) values (v_resp, 'ytring', 1, 2);
    if i = 1 then
      insert into app.response_comments (response_id, factor_key, ordinal, body)
      values (v_resp, 'ytring', 1, 'Fra en gruppe som klarer terskelen.');
      insert into app.comment_threads (org_id, response_id, factor_key, ordinal, key_hash, opened_hour)
      values (v_org, v_resp, 'ytring', 1, extensions.digest(v_key, 'sha256'), date_trunc('hour', now()))
      returning id into v_thread_big;
    end if;
  end loop;

  for i in 1..3 loop
    insert into app.responses (org_id, round_id, group_id, submitted_hour)
    values (v_org, v_round, v_gsmall, date_trunc('hour', now())) returning id into v_resp;
    insert into app.answers (response_id, factor_key, ordinal, value) values (v_resp, 'ytring', 1, 1);
    if i = 1 then
      insert into app.response_comments (response_id, factor_key, ordinal, body)
      values (v_resp, 'ytring', 1, 'Fra en gruppe under terskelen.');
      insert into app.comment_threads (org_id, response_id, factor_key, ordinal, key_hash, opened_hour)
      values (v_org, v_resp, 'ytring', 1,
              extensions.digest(encode(extensions.gen_random_bytes(32),'hex'), 'sha256'),
              date_trunc('hour', now()))
      returning id into v_thread_small;
    end if;
  end loop;

  begin
    insert into app.comment_threads (org_id, response_id, factor_key, ordinal, key_hash, opened_hour)
    values (v_org, v_resp, 'ytring', 1, extensions.digest('x','sha256'), now());
    insert into public._ci values (6, 'an un-truncated opened_hour is refused', 'rejected', 'ACCEPTED', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into public._ci values (6, 'an un-truncated opened_hour is refused', 'rejected', left(v_msg,60), true);
  end;

  begin
    insert into app.thread_messages (thread_id, author, body, sent_hour)
    values (v_thread_big, 'leder', 'Til presis tid', now());
    insert into public._ci values (7, 'an un-truncated sent_hour is refused', 'rejected', 'ACCEPTED', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into public._ci values (7, 'an un-truncated sent_hour is refused', 'rejected', left(v_msg,60), true);
  end;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  v_json := public.conversations(v_round);

  insert into public._ci
  select 8, 'the thread from the group that cleared k is returned', 'true',
         (v_json->'threads' @> jsonb_build_array(jsonb_build_object('id', v_thread_big)))::text,
         v_json->'threads' @> jsonb_build_array(jsonb_build_object('id', v_thread_big));

  insert into public._ci
  select 9, 'the thread from the group below k is WITHHELD', 'true',
         (not (v_json->'threads' @> jsonb_build_array(jsonb_build_object('id', v_thread_small))))::text,
         not (v_json->'threads' @> jsonb_build_array(jsonb_build_object('id', v_thread_small)));

  insert into public._ci
  select 10, 'exactly one thread survives the gate', '1',
         jsonb_array_length(v_json->'threads')::text,
         jsonb_array_length(v_json->'threads') = 1;

  insert into public._ci
  select 11, 'no group, group_id or group_name anywhere in the output', 'true',
         (v_json::text !~* '(group_id|group_name|"group")')::text,
         v_json::text !~* '(group_id|group_name|"group")';

  insert into public._ci
  select 12, 'no response_id in the output either', 'true',
         (v_json::text not like '%response_id%')::text,
         v_json::text not like '%response_id%';

  v_json := public.thread_by_key(v_key);
  insert into public._ci
  select 13, 'the minted key opens its own thread', 'Fra en gruppe som klarer terskelen.',
         coalesce(v_json->>'opening','none'),
         v_json->>'opening' = 'Fra en gruppe som klarer terskelen.';

  v_json := public.thread_by_key(encode(extensions.gen_random_bytes(32),'hex'));
  insert into public._ci
  select 14, 'a key nobody was given opens nothing', 'invalid_key',
         coalesce(v_json->>'error','none'), v_json->>'error' = 'invalid_key';

  insert into public._ci
  select 15, 'the plaintext key is nowhere in the table', '0', count(*)::text, count(*) = 0
  from app.comment_threads where key_hash = v_key::bytea;

  delete from app.measurements where id = v_meas;
  select count(*) into v_n from app.comment_threads where id in (v_thread_big, v_thread_small);
  insert into public._ci values (16, 'deleting the round takes its threads with it', '0', v_n::text, v_n = 0);
end $$;

-- ---------------------------------------------------------------- the write path end to end
do $$
declare
  v_org uuid; v_leader uuid; v_meas uuid; v_round uuid; v_grp uuid;
  v_emp uuid; v_tok text := encode(extensions.gen_random_bytes(32),'hex');
  v_json jsonb; v_key text; v_thread uuid; v_n int;
begin
  select id into v_org from app.organizations order by id limit 1;
  select user_id into v_leader from app.memberships
    where org_id = v_org and active and role = 'daglig_leder' limit 1;
  select id into v_grp from app.groups where org_id = v_org and name = 'Drift';

  insert into app.measurements (org_id, kind, year, label)
  values (v_org, 'puls', 2097, 'Nøkkeltest') returning id into v_meas;
  insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
  values (v_org, v_meas, 'apen', now() - interval '1 day', now() + interval '1 day')
  returning id into v_round;
  insert into app.round_factors (org_id, round_id, factor_key) values (v_org, v_round, 'ytring');
  insert into app.employees (org_id, group_id, full_name, email)
  values (v_org, v_grp, 'Nøkkel Testesen', 'nokkel@test.example') returning id into v_emp;
  insert into app.invitations (org_id, round_id, employee_id, token_hash, sent_at, expires_at)
  values (v_org, v_round, v_emp, extensions.digest(v_tok,'sha256'), now(), now() + interval '2 days');

  v_json := public.submit_response(v_tok,
    jsonb_build_array(jsonb_build_object('factor','ytring','ordinal',1,'value',2,
                                         'comment','Skrevet av noen vi aldri får vite hvem er.')),
    '[]'::jsonb);

  insert into public._ci
  select 17, 'submit_response returns one key per comment', '1',
         coalesce(jsonb_array_length(v_json->'threads'),-1)::text,
         jsonb_array_length(v_json->'threads') = 1;

  -- invariant 3 still holds: a capability is not the id of the row that was written
  insert into public._ci
  select 18, 'submit_response still does not return the response id', 'true',
         (v_json::text not like '%response%')::text,
         v_json::text not like '%response%';

  v_key := v_json->'threads'->>0;
  v_json := public.thread_by_key(v_key);
  insert into public._ci
  select 19, 'the key minted at submit opens the thread it made', 'true',
         (v_json->>'opening' = 'Skrevet av noen vi aldri får vite hvem er.')::text,
         v_json->>'opening' = 'Skrevet av noen vi aldri får vite hvem er.';

  select ct.id into v_thread from app.comment_threads ct
  where ct.key_hash = extensions.digest(v_key,'sha256');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_leader, 'role','authenticated')::text, true);

  perform public.reply_to_thread(v_thread, 'Lest. Tar det med til ledergruppa.');
  insert into public._ci
  select 21, 'a leader may reply, and the thread moves to dialog', 'dialog',
         (select ct.state::text from app.comment_threads ct where ct.id = v_thread),
         (select ct.state from app.comment_threads ct where ct.id = v_thread) = 'dialog';

  v_json := public.follow_up(v_key, 'Takk for svaret.');
  insert into public._ci
  select 22, 'the author may follow up with their key', 'true',
         coalesce((v_json->>'ok'),'false'), (v_json->>'ok')::boolean;

  perform public.set_thread(v_thread, 'lukket', null);
  v_json := public.follow_up(v_key, 'En til.');
  insert into public._ci
  select 23, 'a closed thread refuses a follow-up', 'invalid_key',
         coalesce(v_json->>'error','ACCEPTED'), v_json->>'error' = 'invalid_key';

  delete from app.measurements where id = v_meas;
  delete from app.employees where id = v_emp;
  select count(*) into v_n from app.comment_threads where id = v_thread;
  insert into public._ci values (24, 'test rows removed', '0', v_n::text, v_n = 0);
end $$;

-- ---------------------------------------------------------------- the role gate, actually run
do $$
declare
  v_org uuid; v_meas uuid; v_round uuid; v_grp uuid; v_resp uuid; v_thread uuid;
  v_json jsonb; v_n int;
begin
  select id into v_org from app.organizations order by id limit 1;
  select id into v_grp from app.groups where org_id = v_org and name = 'Drift';

  insert into app.measurements (org_id, kind, year, label)
  values (v_org, 'puls', 2096, 'Rolletest') returning id into v_meas;
  insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
  values (v_org, v_meas, 'apen', now() - interval '1 day', now() + interval '1 day')
  returning id into v_round;
  insert into app.round_factors (org_id, round_id, factor_key) values (v_org, v_round, 'ytring');
  insert into app.responses (org_id, round_id, group_id, submitted_hour)
  values (v_org, v_round, v_grp, date_trunc('hour', now())) returning id into v_resp;
  insert into app.response_comments (response_id, factor_key, ordinal, body)
  values (v_resp, 'ytring', 1, 'Rolletest.');
  insert into app.comment_threads (org_id, response_id, factor_key, ordinal, key_hash, opened_hour)
  values (v_org, v_resp, 'ytring', 1,
          extensions.digest(encode(extensions.gen_random_bytes(32),'hex'),'sha256'),
          date_trunc('hour', now()))
  returning id into v_thread;

  perform set_config('request.jwt.claims',
    json_build_object('sub','00000000-0000-4000-8000-00000000dead','role','authenticated')::text, true);

  v_json := public.reply_to_thread(v_thread, 'Svar fra en som ikke hører til her');
  insert into public._ci
  select 20, 'a caller without the employer role cannot reply', 'denied',
         coalesce(v_json->>'error','ACCEPTED'), v_json->>'error' = 'denied';

  v_json := public.set_thread(v_thread, 'lukket', true);
  insert into public._ci
  select 25, 'nor close or flag a thread', 'denied',
         coalesce(v_json->>'error','ACCEPTED'), v_json->>'error' = 'denied';

  v_json := public.conversations(v_round);
  insert into public._ci
  select 26, 'nor read any conversation at all', 'not_available',
         coalesce(v_json->>'error','RETURNED'), v_json->>'error' = 'not_available';

  select count(*) into v_n from app.thread_messages where thread_id = v_thread;
  insert into public._ci values (27, 'and nothing was written', '0', v_n::text, v_n = 0);

  delete from app.measurements where id = v_meas;
end $$;

select seq, name, expected, actual, pass from public._ci order by seq;

-- The table above is the report; this is the verdict.
do $$
declare v_failed text;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) into v_failed
  from public._ci where not pass;
  if v_failed is not null then
    raise exception 'conversation invariants failed: %', v_failed;
  end if;
end $$;

drop table public._ci;
