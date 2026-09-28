-- round_page_invariants.sql — «Dette sa dere, dette gjør vi», the page per closed round (0100,
-- D-151), proved against the live schema.
--
--   * every round has a link of its own, 16 characters of base64url, and a new round gets one (1)
--   * anyone may read a page; only the daglig leder turns one off — not a department's leader,
--     not a stranger, not anon (2)
--   * a malformed, unknown or still open round's link answers the same «not_available» (3)
--   * fewer than k answered: the counts, and no index and no factor (4)
--   * k or more: the whole organisation's index, and a factor only where every statement of it
--     has k answers; nothing per department, and exactly the fields the page shows (5)
--   * measures: collective and decided only; a person's name in a title masked, the department
--     kept; no owner (6)
--   * turned off, the page is gone, and on again it is back at the same link (7)
--   * the results notice carries the round's link, the next invitation the last shared round's,
--     and a round turned off is linked from neither (8)
--   * nothing written here survives (9)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/round_page_invariants.sql

create unlogged table if not exists public._rpi(seq int, name text, expected text, actual text, pass bool);
truncate public._rpi;

do $$
declare
  v_org    uuid := '00000000-0000-4000-8000-00000000b001';
  v_dl     uuid := '00000000-0000-4000-8000-0000000b0011';
  v_al     uuid := '00000000-0000-4000-8000-0000000b0012';
  v_x      uuid := '00000000-0000-4000-8000-0000000b0013';
  v_ga     uuid;
  v_gb     uuid;
  v_meas   uuid;
  v_a      uuid;
  v_b      uuid;
  v_c      uuid;
  v_sa     text;
  v_sb     text;
  v_sc     text;
  v_inv    uuid;
  v_emp    uuid;
  v_json   jsonb;
  v_claim  jsonb;
  v_txt    text;
  v_rows   jsonb := '[]';
  v_cnt    int;
begin
  begin
    insert into app.organizations (id, name, org_number, employee_count, mail_enabled)
    values (v_org, 'Rundeside Test AS', '999000901', 12, true);
    insert into app.survey_defaults (org_id, quiet_hours) values (v_org, false);
    insert into app.groups (org_id, name) values (v_org, 'Lager') returning id into v_ga;
    insert into app.groups (org_id, name) values (v_org, 'Kontor') returning id into v_gb;
    insert into auth.users (id, email) values
      (v_dl, 'dl@rundeside-probe.no'), (v_al, 'al@rundeside-probe.no'), (v_x, 'x@rundeside-probe.no');
    insert into app.profiles (id, full_name) values (v_dl, 'Dina Leder'), (v_al, 'Arne Avdeling'), (v_x, 'Xavier Fremmed');
    insert into app.memberships (org_id, user_id, role) values (v_org, v_dl, 'daglig_leder'), (v_org, v_al, 'avdelingsleder');
    insert into app.employees (org_id, group_id, full_name, email)
    select v_org, case when n <= 5 then v_ga else v_gb end,
           case when n = 1 then 'Kari Nordmann' else 'Ansatt ' || n end, 'r' || n || '@rundeside-probe.no'
    from generate_series(1, 10) n;
    insert into app.measurements (id, org_id, kind, year, label)
    values (gen_random_uuid(), v_org, 'puls', 2026, 'Probe') returning id into v_meas;

    -- B closed first, A last, C open now
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'apen', now() - interval '60 days', now() - interval '50 days') returning id, share_slug into v_b, v_sb;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'apen', now() - interval '20 days', now() - interval '10 days') returning id, share_slug into v_a, v_sa;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'apen', now() - interval '1 day', now() + interval '6 days') returning id, share_slug into v_c, v_sc;

    -- 1 ---------------------------------------------------------------- a link each
    select concat_ws('|', count(*) filter (where share_slug !~ '^[A-Za-z0-9_-]{16}$'),
                     count(*) - count(distinct share_slug), bool_and(results_page))
      into v_txt from app.rounds;
    v_txt := v_txt || '|' || (v_sa <> v_sb and v_sb <> v_sc)::text;
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'every round has its own 16-character link and its page on; a new one too',
      'expected', '0|0|t|true', 'actual', v_txt, 'pass', v_txt = '0|0|t|true');

    -- answers: A has 6 of 8 asked, every statement of «ytring» and only the first of «mengde»;
    -- B has 3
    insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at, responded_at)
    select v_org, v_a, e.id, extensions.digest('a' || e.id::text, 'sha256'), now() - interval '10 days',
           case when row_number() over (order by e.full_name) <= 6 then now() - interval '12 days' end
    from app.employees e where e.org_id = v_org and e.full_name <> 'Ansatt 10' and e.full_name <> 'Ansatt 9';
    insert into app.responses (org_id, round_id, group_id, submitted_hour)
    select v_org, v_a, case when n <= 3 then v_ga else v_gb end, date_trunc('hour', now()) - interval '12 days'
    from generate_series(1, 6) n;
    insert into app.answers (response_id, factor_key, ordinal, value)
    select r.id, st.factor_key, st.ordinal, 4
    from app.responses r cross join app.statements st
    where r.round_id = v_a and (st.factor_key = 'ytring' or (st.factor_key = 'mengde' and st.ordinal = 1));
    insert into app.responses (org_id, round_id, group_id, submitted_hour)
    select v_org, v_b, v_ga, date_trunc('hour', now()) - interval '52 days' from generate_series(1, 3);
    update app.rounds set status = 'lukket', frozen_at = now() where id in (v_a, v_b);

    -- measures from A: one decided with a name and a department in it, one proposed, one individual
    insert into app.measures (org_id, round_id, factor_key, title, step, kind, owner_employee_id, due_date)
    select v_org, v_a, 'ytring', 'Ukentlig møte med Kari Nordmann på Lager', 'pagar', 'kollektivt', e.id, '2026-12-01'
    from app.employees e where e.org_id = v_org and e.full_name = 'Ansatt 2';
    insert into app.measures (org_id, round_id, factor_key, title, step, kind)
    values (v_org, v_a, 'mengde', 'Bare foreslått', 'foreslatt', 'kollektivt'),
           (v_org, v_a, 'ytring', 'Samtale med én person', 'besluttet', 'individuelt');

    -- 2 ---------------------------------------------------------------- who may do what
    v_txt := concat_ws('|',
      has_function_privilege('anon', 'public.round_page(text)', 'execute'),
      has_function_privilege('anon', 'public.set_results_page(uuid, boolean)', 'execute'));
    perform set_config('request.jwt.claims', json_build_object('sub', v_al, 'role', 'authenticated')::text, true);
    begin
      perform public.set_results_page(v_a, false);
      v_txt := v_txt || '|allowed';
    exception when insufficient_privilege then v_txt := v_txt || '|refused';
    end;
    perform set_config('request.jwt.claims', json_build_object('sub', v_x, 'role', 'authenticated')::text, true);
    begin
      perform public.set_results_page(v_a, false);
      v_txt := v_txt || '|allowed';
    exception when insufficient_privilege then v_txt := v_txt || '|refused';
    end;
    perform set_config('request.jwt.claims', '', true);
    v_txt := v_txt || '|' || (select results_page::text from app.rounds where id = v_a);
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'anon reads a page and cannot switch one; a department''s leader and a stranger are refused',
      'expected', 't|f|refused|refused|true', 'actual', v_txt, 'pass', v_txt = 't|f|refused|refused|true');

    -- 3 ---------------------------------------------------------------- one answer for nothing
    v_txt := concat_ws('|', public.round_page(null)::text, public.round_page('kort')::text,
                       public.round_page('AAAAAAAAAAAAAAAA')::text, public.round_page(v_sc)::text);
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'malformed, unknown and open: the same not_available',
      'expected', repeat('{"error": "not_available"}|', 3) || '{"error": "not_available"}', 'actual', v_txt,
      'pass', v_txt = repeat('{"error": "not_available"}|', 3) || '{"error": "not_available"}');

    -- 4 ---------------------------------------------------------------- below k
    v_json := public.round_page(v_sb);
    v_txt := concat_ws('|', v_json->>'status', v_json->>'answered', coalesce(v_json->>'index', 'none'),
                       jsonb_array_length(v_json->'factors'));
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'three answered: the counts, no index, no factor',
      'expected', 'insufficient_data|0|none|0', 'actual', v_txt, 'pass', v_txt = 'insufficient_data|0|none|0');

    -- 5 ---------------------------------------------------------------- at k
    v_json := public.round_page(v_sa);
    v_txt := concat_ws('|', v_json->>'status', v_json->>'org', v_json->>'asked', v_json->>'answered',
                       v_json->>'index', v_json->>'band',
                       (select string_agg(f->>'key', ',') from jsonb_array_elements(v_json->'factors') f),
                       (select string_agg(k, ',' order by k) from jsonb_object_keys(v_json) k),
                       (select string_agg(k, ',' order by k) from jsonb_object_keys(v_json->'factors'->0) k));
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'six answered: the whole house''s index, «mengde» left out for its unanswered statements, nothing per group',
      'expected', 'ok|Rundeside Test AS|8|6|75|lav|ytring|answered,asked,band,factors,index,measures,org,round,status,threshold|band,index,key,sort_order',
      'actual', v_txt,
      'pass', v_txt = 'ok|Rundeside Test AS|8|6|75|lav|ytring|answered,asked,band,factors,index,measures,org,round,status,threshold|band,index,key,sort_order');

    -- 6 ---------------------------------------------------------------- the measures
    v_txt := concat_ws('|', jsonb_array_length(v_json->'measures'), v_json->'measures'->0->>'title',
                       v_json->'measures'->0->>'step', v_json->'measures'->0->>'factor',
                       (select string_agg(k, ',' order by k) from jsonb_object_keys(v_json->'measures'->0) k));
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'one measure: collective and decided, the name masked, the department kept, no owner',
      'expected', '1|Ukentlig møte med ⟦n⟧ ⟦n⟧ på Lager|pagar|ytring|done,due,factor,step,title', 'actual', v_txt,
      'pass', v_txt = '1|Ukentlig møte med ⟦n⟧ ⟦n⟧ på Lager|pagar|ytring|done,due,factor,step,title');

    -- 7 ---------------------------------------------------------------- off and on
    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    perform public.set_results_page(v_a, false);
    v_txt := coalesce(public.round_page(v_sa)->>'error', 'shown');
    perform public.set_results_page(v_a, true);
    v_txt := v_txt || '|' || coalesce(public.round_page(v_sa)->>'error', 'shown')
      || '|' || ((select share_slug from app.rounds where id = v_a) = v_sa)::text;
    perform set_config('request.jwt.claims', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'the daglig leder turns it off and on; the link stays the same',
      'expected', 'not_available|shown|true', 'actual', v_txt, 'pass', v_txt = 'not_available|shown|true');

    -- 8 ---------------------------------------------------------------- the link in the mail
    select e.id into v_emp from app.employees e where e.org_id = v_org and e.full_name = 'Ansatt 3';
    insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at)
    values (v_org, v_c, v_emp, extensions.digest('c' || v_emp::text, 'sha256'), now() + interval '6 days') returning id into v_inv;
    insert into app.outbox (org_id, round_id, kind, audience, due_at) values (v_org, v_a, 'resultat', 'alle_ansatte', now() - interval '1 minute');
    insert into app.outbox (org_id, round_id, kind, employee_id, invitation_id, due_at)
    values (v_org, v_c, 'invitasjon', v_emp, v_inv, now() - interval '1 minute');
    update app.outbox set sent_at = now() where sent_at is null and org_id <> v_org;
    v_claim := public.dispatch_claim(100);
    v_txt := concat_ws('|',
      (select (j->>'results_page') = v_sa from jsonb_array_elements(v_claim) j where j->>'kind' = 'resultat'),
      (select (j->>'results_page') = v_sa from jsonb_array_elements(v_claim) j where j->>'kind' = 'invitasjon'));
    update app.rounds set results_page = false where id = v_a;
    update app.outbox set claimed_at = null where org_id = v_org;
    v_claim := public.dispatch_claim(100);
    v_txt := v_txt || '|' || concat_ws('|',
      (select coalesce(j->>'results_page', 'none') from jsonb_array_elements(v_claim) j where j->>'kind' = 'resultat'),
      (select (j->>'results_page') = v_sb from jsonb_array_elements(v_claim) j where j->>'kind' = 'invitasjon'));
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'the results notice links its round, the invitation the last one shared; turned off, neither does',
      'expected', 't|t|none|t', 'actual', coalesce(v_txt, 'missing'), 'pass', v_txt = 't|t|none|t');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 9 ------------------------------------------------------------------ nothing left
  select count(*) into v_cnt from (
    select id::text from app.organizations where id = v_org
    union all select id::text from auth.users where id in (v_dl, v_al, v_x)) x;
  v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'every probe row was rolled back',
    'expected', '0', 'actual', v_cnt::text, 'pass', v_cnt = 0);

  insert into public._rpi
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._rpi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._rpi;
  if v_failed is not null then raise exception 'round page invariants failed: %', v_failed; end if;
  if v_count <> 9 then raise exception 'round page invariants: expected 9 rows, got %', v_count; end if;
end $$;

drop table public._rpi;
