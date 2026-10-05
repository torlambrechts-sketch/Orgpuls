-- reply_notice_invariants.sql — a person who wrote a comment can ask to be told when management
-- answers (0204, X-103, D-229), proved on a probe organisation of its own, rolled back.
--
--   1 the two tables are closed: RLS, no policy, no grant to any client role or service_role
--   2 the link reaches no person by a key: no foreign key from either table but to comment_threads
--   3 the setting is on by default, saved with the standard, followed by a planned round, fixed once open
--   4 respond_form asks only where the round asks, dialogue is allowed and the person can be reached
--   5 without a yes nothing is written; with a yes, one sealed row per conversation, and the return
--     says so without an id
--   6 the seal opens to the person and their conversation's key, and to nothing without Vault's key
--   7 a leader's answer queues one notice, late enough not to line up; a second answer keeps it;
--     a request to talk outranks it; a conversation nobody asked about queues nothing
--   8 the dispatcher's claim returns where it goes and the link's key, once; done marks it sent
--   9 the person turns it off with their key; any other key changes nothing
--  10 closing the conversation forgets the link
--  11 who may call what
--  12 the anonymity firewall still passes every rule
--  13 nothing written here survives
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/reply_notice_invariants.sql

create unlogged table if not exists public._rni(seq int, name text, expected text, actual text, pass bool);
truncate public._rni;

do $$
declare
  v_org   uuid := '00000000-0000-4000-8000-00000000f204';
  v_dl    uuid := '00000000-0000-4000-8000-00000000f20c';
  v_grp   uuid;
  v_meas  uuid := gen_random_uuid();
  v_open  uuid;
  v_plan  uuid;
  v_emp   uuid[] := array[]::uuid[];
  v_tok   text[] := array[]::text[];
  v_inv   uuid[] := array[]::uuid[];
  v_json  jsonb;
  v_txt   text;
  v_n     int;
  v_ok    boolean;
  v_keys  jsonb;
  v_key   text;
  v_thr   uuid;
  v_other uuid;
  v_s     jsonb;
  i       int;
  v_rows  jsonb := '[]';
  claims  constant text := '{"sub":"%s","role":"authenticated","aal":"aal1"}';
  answer  constant jsonb := '[{"factor":"kontakt","ordinal":1,"value":4,"comment":"Probe one"},
                              {"factor":"kontakt","ordinal":2,"value":3,"comment":"Probe two"}]';
begin
  -- 1 ---------------------------------------------------------------- closed
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'app' and c.relname in ('thread_recipients', 'reply_notices') and c.relrowsecurity;
  v_txt := v_n::text;
  select count(*) into v_n from pg_policies where schemaname = 'app' and tablename in ('thread_recipients', 'reply_notices');
  v_txt := v_txt || ',' || v_n;
  select count(*) into v_n from information_schema.role_table_grants
  where table_schema = 'app' and table_name in ('thread_recipients', 'reply_notices')
    and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC');
  v_txt := v_txt || ',' || v_n;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'RLS on both, no policy, no grant to a client role or service_role',
    'expected', '2,0,0', 'actual', v_txt, 'pass', v_txt = '2,0,0');

  -- 2 ---------------------------------------------------------------- no key to a person
  select coalesce(string_agg(distinct confrelid::regclass::text, ',' order by confrelid::regclass::text), 'none') into v_txt
  from pg_constraint where conrelid in ('app.thread_recipients'::regclass, 'app.reply_notices'::regclass) and contype = 'f';
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'the only foreign key is to comment_threads; the person is sealed',
    'expected', 'app.comment_threads', 'actual', v_txt, 'pass', v_txt = 'app.comment_threads');

  begin
    insert into app.organizations (id, name, org_number, employee_count, mail_enabled, sms_enabled)
    values (v_org, 'Svarvarsel AS', '999000204', 9, true, true);
    insert into app.groups (org_id, name) values (v_org, 'Alle') returning id into v_grp;
    insert into auth.users (id, email) values (v_dl, 'dl@svar-test.example');
    insert into app.profiles (id, full_name) values (v_dl, 'DL') on conflict (id) do nothing;
    insert into app.memberships (org_id, user_id, role, active) values (v_org, v_dl, 'daglig_leder', true);
    for i in 1..6 loop
      v_emp := v_emp || gen_random_uuid();
      insert into app.employees (id, org_id, group_id, full_name, email, phone, active)
      values (v_emp[i], v_org, v_grp, 'Person ' || i,
              case when i = 6 then null else 'p' || i || '@svar-test.example' end, null, true);
    end loop;
    insert into app.measurements (id, org_id, kind, year, label) values (v_meas, v_org, 'grunnlinje', 2026, 'Probe');
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'apen', now() - interval '1 day', now() + interval '7 days') returning id into v_open;
    insert into app.round_factors (org_id, round_id, factor_key) values (v_org, v_open, 'kontakt');
    for i in 1..6 loop
      v_tok := v_tok || encode(extensions.gen_random_bytes(18), 'hex');
      v_inv := v_inv || gen_random_uuid();
      insert into app.invitations (id, org_id, round_id, employee_id, token_hash, expires_at)
      values (v_inv[i], v_org, v_open, v_emp[i], extensions.digest(v_tok[i], 'sha256'), now() + interval '7 days');
    end loop;

    -- 3 -------------------------------------------------------------- the setting
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_txt := (app.survey_defaults_of(v_org)).reply_notice::text;
    insert into app.rounds (org_id, measurement_id, status) values (v_org, v_meas, 'planlagt') returning id into v_plan;
    v_json := public.save_survey_defaults(v_org, jsonb_build_object('close_days_grunnlinje', 14, 'close_days_puls', 7,
      'reminder_day', 2, 'final_reminder', true, 'quiet_hours', true, 'comment_policy', 'lave', 'allow_dialogue', true,
      'reply_notice', true, 'extras', to_jsonb(app.builtin_extras())));
    v_json := public.save_survey_defaults(v_org, jsonb_build_object('close_days_grunnlinje', 14, 'close_days_puls', 7,
      'reminder_day', 2, 'final_reminder', true, 'quiet_hours', true, 'comment_policy', 'lave', 'allow_dialogue', true,
      'reply_notice', false, 'extras', to_jsonb(app.builtin_extras())));
    v_txt := v_txt || ',' || coalesce(v_json->>'error', 'ok') || ','
          || (select reply_notice::text from app.survey_defaults where org_id = v_org) || ','
          || (select reply_notice::text from app.rounds where id = v_plan);
    -- an open round's setting is fixed for a client
    begin
      set local role authenticated;
      update app.rounds set reply_notice = false where id = v_open;
      v_txt := v_txt || ',changed';
    exception when restrict_violation then
      v_txt := v_txt || ',fixed';
    end;
    reset role;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'on by default; saved; a planned round follows; fixed once open',
      'expected', 'true,ok,false,false,fixed', 'actual', v_txt, 'pass', v_txt = 'true,ok,false,false,fixed');
    perform set_config('request.jwt.claims', '', true);

    -- 4 -------------------------------------------------------------- when respond_form asks
    v_txt := (public.respond_form(v_tok[1])->>'reply_notice') || ',' || (public.respond_form(v_tok[6])->>'reply_notice');
    update app.rounds set reply_notice = false where id = v_open;
    v_txt := v_txt || ',' || (public.respond_form(v_tok[1])->>'reply_notice');
    update app.rounds set reply_notice = true, allow_dialogue = false where id = v_open;
    v_txt := v_txt || ',' || (public.respond_form(v_tok[1])->>'reply_notice');
    update app.rounds set allow_dialogue = true where id = v_open;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'asked when on and reachable; not with no address, the setting off, or no dialogue',
      'expected', 'true,false,false,false', 'actual', v_txt, 'pass', v_txt = 'true,false,false,false');

    -- 5 -------------------------------------------------------------- a yes, and a no
    v_json := public.submit_response(v_tok[2], answer, '[]'::jsonb);
    v_txt := (v_json->>'notice') || ',' || (select count(*) from app.thread_recipients tr join app.comment_threads ct on ct.id = tr.thread_id where ct.org_id = v_org);
    v_json := public.submit_response(v_tok[1], answer, '[]'::jsonb, '{}'::jsonb, '[]'::jsonb, true);
    v_keys := v_json->'threads';
    v_txt := v_txt || ',' || (v_json->>'notice') || ',' || (select count(*) from app.thread_recipients tr join app.comment_threads ct on ct.id = tr.thread_id where ct.org_id = v_org)
          || ',' || (not exists (select 1 from jsonb_object_keys(v_json) k where k like '%id%'))::text;
    -- a yes from somebody who cannot be reached writes nothing
    v_json := public.submit_response(v_tok[6], answer, '[]'::jsonb, '{}'::jsonb, '[]'::jsonb, true);
    v_txt := v_txt || ',' || (v_json->>'notice') || ',' || (select count(*) from app.thread_recipients tr join app.comment_threads ct on ct.id = tr.thread_id where ct.org_id = v_org);
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'no: nothing; yes: one sealed row per conversation, no id returned; unreachable: nothing',
      'expected', 'false,0,true,2,true,false,2', 'actual', v_txt, 'pass', v_txt = 'false,0,true,2,true,false,2');

    -- 6 -------------------------------------------------------------- the seal
    v_key := v_keys->>0;
    select ct.id into v_thr from app.comment_threads ct where ct.key_hash = extensions.digest(v_key, 'sha256');
    select app.reply_notice_open(tr.sealed) into v_s from app.thread_recipients tr where tr.thread_id = v_thr;
    v_ok := (v_s->>'e')::uuid = v_emp[1] and v_s->>'k' = v_key;
    select position(v_key in encode(tr.sealed, 'escape')) = 0 and position(v_emp[1]::text in encode(tr.sealed, 'escape')) = 0
      into v_ok from app.thread_recipients tr where tr.thread_id = v_thr and v_ok;
    begin
      perform extensions.pgp_sym_decrypt(tr.sealed, 'not the key') from app.thread_recipients tr where tr.thread_id = v_thr;
      v_ok := false;
    exception when others then
      null;
    end;
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'the seal opens to the person and the key, holds neither in clear, and refuses another key',
      'expected', 'true', 'actual', coalesce(v_ok, false)::text, 'pass', coalesce(v_ok, false));

    -- 7 -------------------------------------------------------------- queued
    for i in 3..5 loop
      perform public.submit_response(v_tok[i], answer, '[]'::jsonb);
    end loop;
    select ct.id into v_other from app.comment_threads ct join app.responses r on r.id = ct.response_id
    where ct.org_id = v_org and not exists (select 1 from app.thread_recipients tr where tr.thread_id = ct.id) limit 1;
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_txt := coalesce(public.reply_to_thread(v_thr, 'Takk, vi ser på det.')->>'error', 'ok');
    v_txt := v_txt || ',' || (select count(*) || ':' || min(reason) || ':' || (min(due_at) >= now() + interval '19 minutes')::text
                              from app.reply_notices where thread_id = v_thr and sent_at is null);
    perform public.reply_to_thread(v_thr, 'En ting til.');
    v_txt := v_txt || ',' || (select count(*) from app.reply_notices where thread_id = v_thr and sent_at is null);
    perform public.request_contact(v_thr);
    v_txt := v_txt || ',' || (select reason from app.reply_notices where thread_id = v_thr and sent_at is null);
    perform public.reply_to_thread(v_other, 'Takk.');
    v_txt := v_txt || ',' || (select count(*) from app.reply_notices where thread_id = v_other);
    perform set_config('request.jwt.claims', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'an answer queues one late notice; a second keeps it; contact outranks; nobody asked, nothing',
      'expected', 'ok,1:svar:true,1,kontakt,0', 'actual', v_txt, 'pass', v_txt = 'ok,1:svar:true,1,kontakt,0');

    -- 8 -------------------------------------------------------------- the dispatcher
    update app.reply_notices set due_at = now() - interval '1 minute' where thread_id = v_thr;
    v_json := public.reply_notice_claim(10);
    select x into v_s from jsonb_array_elements(v_json) x where x->>'key' = v_key;
    v_txt := coalesce(v_s->>'channel', '-') || ',' || coalesce(v_s->>'email', '-') || ',' || coalesce(v_s->>'reason', '-') || ','
          || (select count(*) from jsonb_array_elements(public.reply_notice_claim(10)) x where x->>'key' = v_key);
    perform public.reply_notice_done((v_s->>'id')::uuid, true);
    v_txt := v_txt || ',' || (select (sent_at is not null)::text from app.reply_notices where id = (v_s->>'id')::uuid);
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'claimed once, to the person''s address with the link''s key; done marks it sent',
      'expected', 'email,p1@svar-test.example,kontakt,0,true', 'actual', v_txt, 'pass', v_txt = 'email,p1@svar-test.example,kontakt,0,true');

    -- 9 -------------------------------------------------------------- turned off
    -- one call per statement: within one expression the order of evaluation is not fixed
    v_txt := public.stop_reply_notice(repeat('ab', 32))->>'ok';
    v_txt := v_txt || ',' || (select count(*) from app.thread_recipients tr join app.comment_threads ct on ct.id = tr.thread_id where ct.org_id = v_org);
    v_txt := v_txt || ',' || (public.stop_reply_notice(v_key)->>'ok');
    v_txt := v_txt || ',' || (select count(*) from app.thread_recipients where thread_id = v_thr);
    v_txt := v_txt || ',' || (public.thread_by_key(v_key)->>'notify') || ',' || (public.thread_by_key(v_keys->>1)->>'notify');
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'another key changes nothing; the person''s own key turns it off',
      'expected', 'true,2,true,0,false,true', 'actual', v_txt, 'pass', v_txt = 'true,2,true,0,false,true');

    -- 10 ------------------------------------------------------------- closed
    select ct.id into v_thr from app.comment_threads ct where ct.key_hash = extensions.digest(v_keys->>1, 'sha256');
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    perform public.reply_to_thread(v_thr, 'Vi lukker denne.');
    v_txt := (select count(*) from app.reply_notices where thread_id = v_thr and sent_at is null)::text;
    perform public.set_thread(v_thr, 'lukket', null);
    perform set_config('request.jwt.claims', '', true);
    v_txt := v_txt || ',' || (select count(*) from app.thread_recipients where thread_id = v_thr)
          || ',' || (select count(*) from app.reply_notices where thread_id = v_thr and sent_at is null);
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'closing the conversation forgets the link and what was queued',
      'expected', '1,0,0', 'actual', v_txt, 'pass', v_txt = '1,0,0');

    raise exception 'rollback';
  exception when others then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 11 --------------------------------------------------------------- grants
  v_ok := has_function_privilege('anon', 'public.submit_response(text,jsonb,jsonb,jsonb,jsonb,boolean)', 'execute')
      and has_function_privilege('anon', 'public.stop_reply_notice(text)', 'execute')
      and not has_function_privilege('anon', 'public.reply_notice_claim(integer)', 'execute')
      and not has_function_privilege('authenticated', 'public.reply_notice_claim(integer)', 'execute')
      and not has_function_privilege('authenticated', 'public.reply_notice_done(uuid,boolean,text,boolean)', 'execute')
      and not has_function_privilege('authenticated', 'app.reply_notice_open(bytea)', 'execute')
      and not has_function_privilege('authenticated', 'app.reply_notice_seal(uuid,text)', 'execute')
      and not has_function_privilege('authenticated', 'app.reply_notice_key()', 'execute')
      and not has_table_privilege('authenticated', 'app.thread_recipients', 'select')
      and not has_table_privilege('service_role', 'app.thread_recipients', 'select')
      and (select count(*) from pg_proc where proname = 'submit_response') = 1;
  v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'respondents may submit and stop; only the dispatcher claims; nobody reads the seal',
    'expected', 'true', 'actual', v_ok::text, 'pass', v_ok);

  -- 12 --------------------------------------------------------------- the firewall
  select string_agg(f.rule, ',') filter (where not f.pass) into v_txt from app.growth_firewall() f;
  v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'the anonymity firewall passes every rule',
    'expected', 'none', 'actual', coalesce(v_txt, 'none'), 'pass', v_txt is null);

  -- 13 --------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from app.organizations where id = v_org;
  v_rows := v_rows || jsonb_build_object('seq', 13, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._rni
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._rni order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._rni;
  if v_failed is not null then raise exception 'reply notice invariants failed: %', v_failed; end if;
  if v_count <> 13 then raise exception 'reply notice invariants: expected 13 rows, got %', v_count; end if;
end $$;
