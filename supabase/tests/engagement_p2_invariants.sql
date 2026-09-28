-- engagement_p2_invariants.sql — engagement phase 2 (0105, D-156), proved against the live schema.
--
--   * the step log: RLS on, no policy, no client privilege; a step change is logged, an edit that
--     keeps the step is not (1)
--   * «Siden sist» on a first survey says so, and nothing else (2)
--   * after a grunnlinje: at most three items, finished first; the count is of finished measures;
--     a department's measure, a decided one, an individual one and one finished before the last
--     grunnlinje are never listed; people's names are masked (3)
--   * the survey's reply carries the lists and the publish date, and still no round, invitation,
--     group or employee; nothing in it names the respondent's department (4)
--   * a pulse gives, per factor it asks, the organisation's measures being worked on and the day
--     each started; a grunnlinje gives none (5)
--   * the publish date defaults to the close + 7 days, follows a moved close while it is the
--     default, and stays where the daglig leder put it (6)
--   * the employees' results notice waits for the publish date at 09:00; the leaders' does not (7)
--   * the round's page opens on the publish date, not at close (8)
--   * set_round_send: the daglig leder only; the intro only while planned, ≤ 600; the date within
--     close … close + 60; a held notice follows the date (9)
--   * round_send_preview: members only, anon never; the round's own intro, else the greeting (10)
--   * nothing written here survives (11)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/engagement_p2_invariants.sql

create unlogged table if not exists public._ep2(seq int, name text, expected text, actual text, pass bool);
truncate public._ep2;

do $$
declare
  v_org    uuid := '00000000-0000-4000-8000-00000000e201';
  v_dl     uuid := '00000000-0000-4000-8000-0000000e2011';
  v_al     uuid := '00000000-0000-4000-8000-0000000e2012';
  v_vo     uuid := '00000000-0000-4000-8000-0000000e2013';
  v_x      uuid := '00000000-0000-4000-8000-0000000e2014';
  v_grp    uuid;
  v_emp    uuid;
  v_base   uuid;
  v_puls   uuid;
  v_plan   uuid;
  v_gl     uuid;
  v_r1     uuid;
  v_r2     uuid;
  v_r3     uuid;
  v_m      uuid;
  v_mo     uuid;
  v_wheel  uuid;
  v_slug   text;
  v_tok    text := 'ep2-probe-token-' || gen_random_uuid();
  v_json   jsonb;
  v_txt    text;
  v_txt2   text;
  v_n      int;
  v_rows   jsonb := '[]';
  v_cnt    int;
begin
  -- 1a --------------------------------------------------------------- the table itself
  select concat_ws('|',
    (select c.relrowsecurity::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'app' and c.relname = 'measure_steps'),
    (select count(*) from pg_policies where schemaname = 'app' and tablename = 'measure_steps'),
    (select count(*) from information_schema.role_table_grants where table_schema = 'app'
      and table_name = 'measure_steps' and grantee in ('anon', 'authenticated', 'PUBLIC')))
    into v_txt;

  begin
    insert into app.organizations (id, name, org_number, employee_count, mail_enabled, invite_greeting, invite_greeting_by)
    values (v_org, 'Siden Sist AS', '999000931', 20, true, 'Takk for at du svarer.', null);
    insert into auth.users (id, email) values
      (v_dl, 'dl@ep2-probe.no'), (v_al, 'al@ep2-probe.no'), (v_vo, 'vo@ep2-probe.no'), (v_x, 'x@ep2-probe.no');
    insert into app.profiles (id, full_name) values (v_dl, 'Dina Leder'), (v_al, 'Arne'), (v_vo, 'Vera'), (v_x, 'Xavier');
    update app.organizations set invite_greeting_by = v_dl where id = v_org;
    insert into app.groups (org_id, name) values (v_org, 'Verkstedet') returning id into v_grp;
    insert into app.memberships (org_id, user_id, role) values (v_org, v_dl, 'daglig_leder'), (v_org, v_vo, 'verneombud');
    insert into app.memberships (org_id, user_id, role, group_id) values (v_org, v_al, 'avdelingsleder', v_grp);
    insert into app.employees (org_id, group_id, full_name, email)
    values (v_org, v_grp, 'Øyvind Hansen', 'oyvind@ep2-probe.no') returning id into v_emp;

    -- 1b ------------------------------------------------------------- the log
    insert into app.measures (org_id, factor_key, title, step) values (v_org, 'kontakt', 'Logg-probe', 'foreslatt')
    returning id into v_m;
    update app.measures set title = 'Logg-probe 2' where id = v_m;
    update app.measures set step = 'pagar' where id = v_m;
    select string_agg(step::text, ',' order by at, step) into v_txt2 from app.measure_steps where measure_id = v_m;
    v_txt := v_txt || '|' || coalesce(v_txt2, 'none');
    delete from app.measures where id = v_m;
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'measure_steps: RLS on, no policy, no client privilege; a step change is logged, a title edit is not',
      'expected', 'true|0|0|foreslatt,pagar', 'actual', v_txt, 'pass', v_txt = 'true|0|0|foreslatt,pagar');

    -- 2 --------------------------------------------------------------- a first survey
    insert into app.measurements (org_id, kind, year, label) values (v_org, 'grunnlinje', 2026, 'Probe G') returning id into v_gl;
    insert into app.measurements (org_id, kind, year, label) values (v_org, 'puls', 2026, 'Probe P') returning id into v_puls;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_puls, 'apen', now() - interval '1 day', now() + interval '6 days') returning id into v_r2;
    v_txt := app.since_last(v_r2)::text;
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'before any grunnlinje has closed, «Siden sist» says it is the first',
      'expected', '{"first": true}', 'actual', v_txt, 'pass', v_txt = '{"first": true}');

    -- 3 --------------------------------------------------------------- after a grunnlinje
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at, frozen_at)
    values (v_org, v_gl, 'lukket', now() - interval '40 days', now() - interval '30 days', now() - interval '30 days')
    returning id, share_slug into v_r1, v_slug;
    -- one finished before the grunnlinje closed: its log says so
    insert into app.measures (org_id, factor_key, title, step) values (v_org, 'kontakt', 'Gammelt tiltak', 'effekt_malt') returning id into v_m;
    update app.measure_steps set at = now() - interval '35 days' where measure_id = v_m;
    insert into app.measures (org_id, factor_key, title, step) values
      (v_org, 'kontakt', 'Faste møter med Øyvind Hansen', 'gjennomfort'),
      (v_org, 'kontakt', 'Ny turnusplan', 'effekt_malt'),
      (v_org, 'kontakt', 'Rydde lageret', 'lukket'),
      (v_org, 'kontakt', 'Opplæring i verktøy', 'pagar'),
      (v_org, 'kontakt', 'Besluttet, ikke startet', 'besluttet'),
      (v_org, 'kontakt', 'Bare for én', 'gjennomfort');
    update app.measures set kind = 'individuelt' where org_id = v_org and title = 'Bare for én';
    insert into app.measures (org_id, factor_key, title, step) values (v_org, 'kontakt', 'Verkstedets eget', 'gjennomfort')
    returning id into v_mo;
    insert into app.measure_groups (measure_id, group_id) values (v_mo, v_grp);
    v_json := app.since_last(v_r2);
    select concat_ws('|',
      v_json->>'first',
      jsonb_array_length(v_json->'items'),
      v_json->>'done',
      (select string_agg(i->>'status', ',' order by n) from jsonb_array_elements(v_json->'items') with ordinality x(i, n)),
      (v_json::text like '%⟦n⟧%')::text,
      (v_json::text ~ '(Øyvind|Gammelt|Besluttet|Bare for|Verkstedet)')::text)
      into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', '≤ 3 items, finished first; 3 finished; names masked; department, decided, individual and earlier ones absent',
      'expected', 'false|3|3|gjennomfort,gjennomfort,gjennomfort|true|false', 'actual', v_txt,
      'pass', v_txt = 'false|3|3|gjennomfort,gjennomfort,gjennomfort|true|false');

    -- 4 --------------------------------------------------------------- the survey's reply
    insert into app.round_factors (org_id, round_id, factor_key) values (v_org, v_r2, 'kontakt');
    insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at)
    values (v_org, v_r2, v_emp, extensions.digest(v_tok, 'sha256'), now() + interval '6 days');
    insert into app.year_wheels (org_id) values (v_org) returning id into v_wheel;
    insert into app.wheel_notifications (wheel_id, audience, lead_days, sort_order) values (v_wheel, 'alle_ansatte', 1, 5);
    set local role anon;
    v_json := public.respond_form(v_tok);
    reset role;
    select concat_ws('|',
      (v_json ? 'since' and v_json ? 'reasons' and v_json ? 'publish_on')::text,
      (select count(*) from jsonb_object_keys(v_json) k
        where k ~ '(round|invitation|group|employee|person|token|owner)')::text,
      (v_json::text ~ ('(Verkstedet|Øyvind|oyvind|' || v_r2::text || '|' || v_emp::text || '|' || v_grp::text || ')'))::text,
      (v_json->>'publish_on' = ((now() + interval '6 days') at time zone 'Europe/Oslo')::date::text
         or v_json->>'publish_on' = (((now() + interval '6 days') at time zone 'Europe/Oslo')::date + 7)::text)::text)
      into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'respond_form carries since, reasons and publish_on; no round, group or person key; no name or id in it',
      'expected', 'true|0|false|true', 'actual', v_txt, 'pass', v_txt = 'true|0|false|true');

    -- 5 --------------------------------------------------------------- why a pulse asks again
    v_json := v_json->'reasons';
    select concat_ws('|',
      (select string_agg(k, ',' order by k) from jsonb_object_keys(v_json) k),
      jsonb_array_length(v_json->'kontakt'),
      (select string_agg(i->>'title', ',' order by i->>'title') from jsonb_array_elements(v_json->'kontakt') i),
      ((v_json->'kontakt'->0->>'started') ~ '^\d{4}-\d{2}-\d{2}$')::text,
      app.pulse_reasons(v_r1)::text)
      into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'a pulse: per factor, the organisation''s decided/ongoing/finished measures with a start day; a grunnlinje: none',
      'expected', 'kontakt|3|Besluttet, ikke startet,Faste møter med ⟦n⟧ ⟦n⟧,Opplæring i verktøy|true|{}', 'actual', v_txt,
      'pass', v_txt = 'kontakt|3|Besluttet, ikke startet,Faste møter med ⟦n⟧ ⟦n⟧,Opplæring i verktøy|true|{}');

    -- 6 --------------------------------------------------------------- the publish date
    insert into app.measurements (org_id, kind, year, label) values (v_org, 'grunnlinje', 2027, 'Probe plan') returning id into v_plan;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_plan, 'planlagt', '2027-09-01 08:00+02', '2027-09-15 20:00+02') returning id into v_r3;
    v_txt := (select results_publish_on::text from app.rounds where id = v_r3);
    update app.rounds set closes_at = '2027-09-20 20:00+02' where id = v_r3;
    v_txt := v_txt || '|' || (select results_publish_on::text from app.rounds where id = v_r3);
    update app.rounds set results_publish_on = '2027-10-10' where id = v_r3;
    update app.rounds set closes_at = '2027-09-22 20:00+02' where id = v_r3;
    v_txt := v_txt || '|' || (select results_publish_on::text from app.rounds where id = v_r3);
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'close + 7 by default; follows a moved close while default; a chosen date stays',
      'expected', '2027-09-22|2027-09-27|2027-10-10', 'actual', v_txt, 'pass', v_txt = '2027-09-22|2027-09-27|2027-10-10');

    -- 7 --------------------------------------------------------------- the notices
    update app.rounds set results_publish_on = (now() at time zone 'Europe/Oslo')::date + 3 where id = v_r1;
    insert into app.outbox (org_id, round_id, kind, audience, due_at) values
      (v_org, v_r1, 'resultat', 'alle_ansatte', now()),
      (v_org, v_r1, 'resultat', 'daglig_leder', now());
    select concat_ws('|',
      (select (due_at = (((now() at time zone 'Europe/Oslo')::date + 3) + time '09:00') at time zone 'Europe/Oslo')::text
         from app.outbox where round_id = v_r1 and audience = 'alle_ansatte'),
      (select (due_at <= now())::text from app.outbox where round_id = v_r1 and audience = 'daglig_leder'))
      into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'the employees'' results notice waits for 09:00 on the publish date; the leaders'' goes at once',
      'expected', 'true|true', 'actual', v_txt, 'pass', v_txt = 'true|true');

    -- 8 --------------------------------------------------------------- the page
    update app.rounds set results_page = true where id = v_r1;
    set local role anon;
    v_txt := coalesce(public.round_page(v_slug)->>'error', 'shown');
    reset role;
    update app.rounds set results_publish_on = (now() at time zone 'Europe/Oslo')::date where id = v_r1;
    set local role anon;
    v_txt := v_txt || '|' || coalesce(public.round_page(v_slug)->>'error', 'shown');
    reset role;
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'the round''s page is not available before its publish date, and is on it',
      'expected', 'not_available|shown', 'actual', v_txt, 'pass', v_txt = 'not_available|shown');

    -- 9 --------------------------------------------------------------- set_round_send
    v_txt := '';
    foreach v_m in array array[v_al, v_vo, v_x] loop
      perform set_config('request.jwt.claims', json_build_object('sub', v_m, 'role', 'authenticated')::text, true);
      set local role authenticated;
      begin
        perform public.set_round_send(v_r3, 'Hei', null);
        v_txt := v_txt || 'ok,';
      exception when insufficient_privilege then
        v_txt := v_txt || 'denied,';
      end;
      reset role;
    end loop;
    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_txt := v_txt || concat_ws(',',
      public.set_round_send(v_r3, repeat('x', 601), null)->>'error',
      public.set_round_send(v_r3, 'Hei', '2027-09-21')->>'error',
      public.set_round_send(v_r3, 'Hei', '2027-11-22')->>'error',
      public.set_round_send(v_r3, '  Velkommen til årets kartlegging.  ', '2027-10-01')->>'ok',
      public.set_round_send(v_r2, 'Endret etter utsending', null)->>'error',
      public.set_round_send(v_r2, null, (now() at time zone 'Europe/Oslo')::date + 20)->>'ok',
      public.set_round_send(v_r1, null, null)->>'error');
    reset role;
    v_txt := v_txt || '|' || (select concat_ws(',', intro_message, (intro_by = v_dl)::text, results_publish_on::text) from app.rounds where id = v_r3);
    -- a held notice follows the date
    insert into app.outbox (org_id, round_id, kind, audience, due_at) values (v_org, v_r3, 'resultat', 'alle_ansatte', '2027-09-22 20:00+02');
    set local role authenticated;
    perform public.set_round_send(v_r3, 'Velkommen til årets kartlegging.', '2027-10-05');
    reset role;
    v_txt := v_txt || '|' || (select (due_at = timestamptz '2027-10-05 09:00+02')::text from app.outbox where round_id = v_r3);
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'set_round_send: daglig leder only; too long, out of range, opened and closed refused; trimmed and signed; a held notice follows',
      'expected', 'denied,denied,denied,too_long,publish_range,publish_range,true,opened,true,closed|Velkommen til årets kartlegging.,true,2027-10-01|true',
      'actual', v_txt,
      'pass', v_txt = 'denied,denied,denied,too_long,publish_range,publish_range,true,opened,true,closed|Velkommen til årets kartlegging.,true,2027-10-01|true');

    -- 10 -------------------------------------------------------------- the preview's reader
    set local role authenticated;
    v_json := public.round_send_preview(v_r3);
    v_txt := concat_ws(',', v_json->>'intro', v_json->>'intro_by', v_json->'org_greeting'->>'text',
                       v_json->>'publish_on', v_json->>'close_on', v_json->>'results_shared', v_json->'since'->>'first');
    v_json := public.round_send_preview(v_r2);
    v_txt := v_txt || '|' || coalesce(v_json->>'intro', 'null') || ',' || (v_json->'org_greeting'->>'by');
    perform set_config('request.jwt.claims', json_build_object('sub', v_x, 'role', 'authenticated')::text, true);
    begin
      perform public.round_send_preview(v_r3);
      v_txt := v_txt || '|stranger reads';
    exception when insufficient_privilege then
      v_txt := v_txt || '|denied';
    end;
    reset role;
    v_txt := v_txt || '|' || has_function_privilege('anon', 'public.round_send_preview(uuid)', 'execute')::text
                   || ',' || has_function_privilege('anon', 'public.set_round_send(uuid, text, date)', 'execute')::text;
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'round_send_preview: the round''s intro and its writer, else the greeting; strangers and anon refused',
      'expected', 'Velkommen til årets kartlegging.,Dina Leder,Takk for at du svarer.,2027-10-05,2027-09-22,true,false|null,Dina Leder|denied|false,false',
      'actual', v_txt,
      'pass', v_txt = 'Velkommen til årets kartlegging.,Dina Leder,Takk for at du svarer.,2027-10-05,2027-09-22,true,false|null,Dina Leder|denied|false,false');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 11 ---------------------------------------------------------------- nothing survives
  select count(*) into v_cnt from (
    select id::text from app.organizations where id = v_org
    union all select id::text from auth.users where id in (v_dl, v_al, v_vo, v_x)) x;
  v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'every probe row was rolled back',
    'expected', '0', 'actual', v_cnt::text, 'pass', v_cnt = 0);

  insert into public._ep2
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._ep2 order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._ep2;
  if v_failed is not null then raise exception 'engagement p2 invariants failed: %', v_failed; end if;
  if v_count <> 11 then raise exception 'engagement p2 invariants: expected 11 rows, got %', v_count; end if;
end $$;

drop table public._ep2;
