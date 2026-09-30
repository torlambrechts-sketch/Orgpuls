-- notices_invariants.sql — the invitation's own words, overdue measures, a lagging department
-- (0098, 0099, D-149), proved against the live schema.
--
--   * a round-less outbox row is a measure's notice and nothing else (1)
--   * the round's own introduction reaches the claimed invitation before the organisation's greeting (10)
--   * the greeting: the daglig leder writes and clears it; a verneombud and anon cannot; over 600
--     characters is refused (2)
--   * an invitation's length: 37 items is «fire minutter», as the design says (3)
--   * overdue: past its date and still decided or under way, or undated and still for 30 days;
--     done measures are not (4)
--   * the weekly queue: one mail per owner, a copy to the verneombud, nothing again within six
--     days, and no copy where the wheel says not to (5)
--   * the claim: the owner's mail lists their measures only, the verneombud's all of them; the
--     invitation carries its minutes, the results promise and the greeting (6)
--   * a notice whose measures were done before it went is dropped as resolved (7)
--   * a department 10 points or more behind, once half the time has gone: the daglig leder is told
--     once, and the claim carries no department and no figure (8)
--   * nothing written here survives (9)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/notices_invariants.sql

create unlogged table if not exists public._noi(seq int, name text, expected text, actual text, pass bool);
truncate public._noi;

do $$
declare
  v_org    uuid := '00000000-0000-4000-8000-00000000af01';
  v_org2   uuid := '00000000-0000-4000-8000-00000000af02';
  v_dl     uuid := '00000000-0000-4000-8000-0000000af011';
  v_vo     uuid := '00000000-0000-4000-8000-0000000af012';
  v_ga     uuid;
  v_gb     uuid;
  v_meas   uuid;
  v_round  uuid;
  v_base   uuid;
  v_e1     uuid;
  v_e2     uuid;
  v_m1     uuid;
  v_txt    text;
  v_json   jsonb;
  v_claim  jsonb;
  v_rows   jsonb := '[]';
  v_cnt    int;
  v_msg    text;
begin
  begin
    insert into app.organizations (id, name, org_number, employee_count, mail_enabled) values
      (v_org, 'Varsel Test AS', '999000888', 20, true), (v_org2, 'Varsel To AS', '999000889', 5, true);
    insert into app.groups (org_id, name) values (v_org, 'Lager') returning id into v_ga;
    insert into app.groups (org_id, name) values (v_org, 'Kontor') returning id into v_gb;
    insert into auth.users (id, email) values (v_dl, 'dl@orgpuls-probe.no'), (v_vo, 'vo@orgpuls-probe.no');
    insert into app.profiles (id, full_name) values (v_dl, 'Dina Leder'), (v_vo, 'Vidar Ombud');
    insert into app.memberships (org_id, user_id, role) values (v_org, v_dl, 'daglig_leder'), (v_org, v_vo, 'verneombud');
    insert into app.employees (org_id, group_id, full_name, email)
    select v_org, case when n <= 6 then v_ga else v_gb end, 'Ansatt ' || n, 'a' || n || '@orgpuls-probe.no'
    from generate_series(1, 12) n;
    select id into v_e1 from app.employees where org_id = v_org and full_name = 'Ansatt 1';
    select id into v_e2 from app.employees where org_id = v_org and full_name = 'Ansatt 2';
    insert into app.employees (org_id, full_name, email) values (v_org2, 'Eier To', 'eier@orgpuls-probe.no');

    -- 1 ---------------------------------------------------------------- the outbox rule
    begin
      insert into app.outbox (org_id, round_id, kind, audience, due_at) values (v_org, null, 'resultat', 'daglig_leder', now());
      v_txt := 'accepted';
    exception when check_violation then v_txt := 'refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'an outbox row without a round is a measure''s notice, nothing else',
      'expected', 'refused', 'actual', v_txt, 'pass', v_txt = 'refused');

    -- 2 ---------------------------------------------------------------- the greeting
    v_txt := has_function_privilege('anon', 'public.set_invite_greeting(uuid,text)', 'execute')::text;
    perform set_config('request.jwt.claims', json_build_object('sub', v_vo, 'role', 'authenticated')::text, true);
    v_txt := v_txt || ',' || coalesce(public.set_invite_greeting(v_org, 'Hei')->>'error', 'ok');
    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    v_txt := v_txt || ',' || coalesce(public.set_invite_greeting(v_org, repeat('x', 601))->>'error', 'ok');
    v_txt := v_txt || ',' || coalesce(public.set_invite_greeting(v_org, '  Vi vil vite hvordan dere har det.  ')->>'error', 'ok');
    v_txt := v_txt || ',' || (select invite_greeting || '/' || (invite_greeting_by = v_dl)::text from app.organizations where id = v_org);
    perform public.set_invite_greeting(v_org, '   ');
    v_txt := v_txt || ',' || coalesce((select invite_greeting from app.organizations where id = v_org), 'none');
    perform public.set_invite_greeting(v_org, 'Vi vil vite hvordan dere har det.');
    perform set_config('request.jwt.claims', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'greeting: no anon; verneombud refused; over 600 refused; trimmed and signed; blank clears',
      'expected', 'false,not_allowed,too_long,ok,Vi vil vite hvordan dere har det./true,none', 'actual', v_txt,
      'pass', v_txt = 'false,not_allowed,too_long,ok,Vi vil vite hvordan dere har det./true,none');

    -- 3 ---------------------------------------------------------------- minutes
    insert into app.measurements (org_id, kind, year) values (v_org, 'grunnlinje', 2026) returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'lukket', now() - interval '60 days', now() - interval '50 days') returning id into v_base;
    insert into app.round_factors (org_id, round_id, factor_key) select v_org, v_base, f.key from app.factors f;
    insert into app.round_extra_questions (org_id, round_id, extra_key) select v_org, v_base, x from unnest(app.builtin_extras()) x;
    v_txt := (select count(*) from app.statements s join app.round_factors rf on rf.factor_key = s.factor_key where rf.round_id = v_base)::text
      || '+4 → ' || app.round_minutes(v_base);
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'the core survey and its four extras take about four minutes',
      'expected', '33+4 → 4', 'actual', v_txt, 'pass', v_txt = '33+4 → 4');

    -- 4 ---------------------------------------------------------------- overdue
    insert into app.measures (org_id, round_id, factor_key, owner_employee_id, title, due_date, step, kind)
    values (v_org, v_base, 'kontakt', v_e1, 'Forfalt', current_date - 3, 'pagar', 'kollektivt') returning id into v_m1;
    insert into app.measures (org_id, round_id, factor_key, owner_employee_id, title, due_date, step, kind) values
      (v_org, v_base, 'kontakt', v_e1, 'Ferdig', current_date - 3, 'gjennomfort', 'kollektivt'),
      (v_org, v_base, 'kontakt', v_e2, 'I rute', current_date + 10, 'besluttet', 'kollektivt'),
      (v_org, v_base, 'kontakt', v_e2, 'Står stille', null, 'besluttet', 'kollektivt');
    -- the touch trigger stamps an update with now(), so it is switched off for this one row's age
    alter table app.measures disable trigger user;
    update app.measures set updated_at = now() - interval '40 days' where org_id = v_org and title = 'Står stille';
    alter table app.measures enable trigger user;
    insert into app.measures (org_id, factor_key, owner_employee_id, title, due_date, step, kind)
    select v_org2, 'kontakt', e.id, 'Annen virksomhet', current_date - 1, 'pagar', 'kollektivt' from app.employees e where e.org_id = v_org2;
    select string_agg(title, ',' order by title) into v_txt from app.overdue_measures(v_org);
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'overdue: past date and not done, or undated and still for 30 days',
      'expected', 'Forfalt,Står stille', 'actual', coalesce(v_txt, '-'), 'pass', v_txt = 'Forfalt,Står stille');

    -- 5 ---------------------------------------------------------------- the weekly queue
    insert into app.year_wheels (org_id, active, notify_vo_on_overdue) values (v_org2, false, false);
    perform app.queue_measure_notices();
    select concat_ws('|',
      (select count(*) from app.outbox where org_id = v_org and kind = 'tiltak_forfalt' and employee_id is not null),
      (select count(*) from app.outbox where org_id = v_org and kind = 'tiltak_forfalt' and audience = 'verneombud'),
      (select count(*) from app.outbox where org_id = v_org2 and kind = 'tiltak_forfalt' and employee_id is not null),
      (select count(*) from app.outbox where org_id = v_org2 and kind = 'tiltak_forfalt' and audience = 'verneombud'))
      into v_txt;
    perform app.queue_measure_notices();
    v_txt := v_txt || ' then ' || (select count(*) from app.outbox where org_id in (v_org, v_org2) and kind = 'tiltak_forfalt');
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'one per owner and a copy to the verneombud, none where the wheel says not; nothing again within the week',
      'expected', '2|1|1|0 then 4', 'actual', v_txt, 'pass', v_txt = '2|1|1|0 then 4');

    -- 6 ---------------------------------------------------------------- the claim
    insert into app.year_wheels (org_id, active) values (v_org, false);
    insert into app.wheel_notifications (wheel_id, audience, lead_days, sort_order)
    select id, 'alle_ansatte', 1, 5 from app.year_wheels where org_id = v_org;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'apen', now() - interval '5 days', now() + interval '5 days') returning id into v_round;
    insert into app.round_factors (org_id, round_id, factor_key) select v_org, v_round, f.key from app.factors f;
    insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at)
    select v_org, v_round, e.id, extensions.digest('noi' || e.id::text, 'sha256'), now() + interval '5 days'
    from app.employees e where e.org_id = v_org;
    insert into app.outbox (org_id, round_id, kind, employee_id, invitation_id, due_at)
    select v_org, v_round, 'invitasjon', i.employee_id, i.id, '2000-01-01'
    from app.invitations i where i.round_id = v_round and i.employee_id = v_e1;
    update app.outbox set due_at = '2000-01-01' where org_id in (v_org, v_org2) and kind = 'tiltak_forfalt';
    -- quiet hours (0076) hold invitations between 21 and 07 where the organisation is; this check
    -- is about what the invitation carries, so it must not depend on the clock (as dispatch_invariants)
    insert into app.survey_defaults (org_id, quiet_hours) values (v_org, false)
    on conflict (org_id) do update set quiet_hours = false;
    v_claim := public.dispatch_claim(100);
    select concat_ws('|',
      (select string_agg(m->>'title', ',' order by m->>'title') from jsonb_array_elements(v_claim) j, jsonb_array_elements(j->'measures') m
        where j->>'kind' = 'tiltak_forfalt' and j->>'org' = 'Varsel Test AS' and j->'audience' = 'null'::jsonb
          and j->'recipients'->0->>'email' = 'a1@orgpuls-probe.no'),
      (select string_agg(m->>'title', ',' order by m->>'title') from jsonb_array_elements(v_claim) j, jsonb_array_elements(j->'measures') m
        where j->>'kind' = 'tiltak_forfalt' and j->>'audience' = 'verneombud' and j->>'org' = 'Varsel Test AS'),
      (select concat_ws('/', j->>'minutes', j->>'results_shared', j->'greeting'->>'text', j->'greeting'->>'by')
         from jsonb_array_elements(v_claim) j where j->>'kind' = 'invitasjon' and j->>'org' = 'Varsel Test AS'))
      into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'owner gets their own, the verneombud all; the invitation carries minutes, promise and greeting',
      'expected', 'Forfalt|Forfalt,Står stille|4/true/Vi vil vite hvordan dere har det./Dina Leder', 'actual', coalesce(v_txt, '-'),
      'pass', v_txt = 'Forfalt|Forfalt,Står stille|4/true/Vi vil vite hvordan dere har det./Dina Leder');

    -- 7 ---------------------------------------------------------------- resolved before it went
    update app.measures set step = 'gjennomfort' where org_id = v_org2;
    update app.outbox set claimed_at = null, due_at = '2000-01-01' where org_id = v_org2 and kind = 'tiltak_forfalt';
    perform public.dispatch_claim(100);
    v_txt := (select string_agg(coalesce(last_error, 'none'), ',') from app.outbox where org_id = v_org2 and kind = 'tiltak_forfalt');
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'a notice whose measures were done before it went is dropped as resolved',
      'expected', 'resolved', 'actual', coalesce(v_txt, '-'), 'pass', v_txt = 'resolved');

    -- 8 ---------------------------------------------------------------- a department behind
    -- Lager: 5 of 6 answered; Kontor: 1 of 6. The whole round: 6 of 12 = 50 %; Kontor 17 %
    insert into app.responses (org_id, round_id, group_id, submitted_hour)
    select v_org, v_round, case when n <= 5 then v_ga else v_gb end, date_trunc('hour', now()) - interval '1 day'
    from generate_series(1, 6) n;
    perform app.queue_participation_alerts();
    perform app.queue_participation_alerts();
    v_txt := (select count(*) from app.outbox where round_id = v_round and kind = 'svarprosent' and audience = 'daglig_leder')::text
      || '|' || (select string_agg(g.name, ',') from app.lagging_groups(v_round) l join app.groups g on g.id = l.group_id);
    update app.outbox set due_at = now() - interval '1 hour', claimed_at = null where round_id = v_round and kind = 'svarprosent';
    update app.outbox set sent_at = now() where kind <> 'svarprosent' and sent_at is null and org_id <> v_org;
    v_claim := public.dispatch_claim(100);
    v_txt := v_txt || '|' || coalesce((select (j ? 'groups')::text || '/' || (j::text like '%Kontor%')::text
                                        from jsonb_array_elements(v_claim) j where j->>'kind' = 'svarprosent' and j->>'org' = 'Varsel Test AS'), '-');
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'a department 10 points behind: the daglig leder told once; the claim names no department',
      'expected', '1|Kontor|false/false', 'actual', v_txt, 'pass', v_txt = '1|Kontor|false/false');

    -- 10 --------------------------------------------------------------- the round's own introduction
    -- audit AUD-25: rounds.intro_message reaches the invitation the dispatcher claims, before the
    -- organisation's greeting, signed by whoever wrote it
    update app.rounds set intro_message = 'Denne runden handler om arbeidsmengde.', intro_by = v_dl where id = v_round;
    update app.outbox set claimed_at = null, due_at = '2000-01-01', sent_at = null
     where round_id = v_round and kind = 'invitasjon';
    v_claim := public.dispatch_claim(100);
    v_txt := coalesce((select concat_ws('/', j->'greeting'->>'text', j->'greeting'->>'by')
                        from jsonb_array_elements(v_claim) j where j->>'kind' = 'invitasjon' and j->>'org' = 'Varsel Test AS'), '-');
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'the round''s own introduction reaches the invitation, before the organisation''s greeting',
      'expected', 'Denne runden handler om arbeidsmengde./Dina Leder', 'actual', v_txt,
      'pass', v_txt = 'Denne runden handler om arbeidsmengde./Dina Leder');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 9 ------------------------------------------------------------------ nothing left
  select count(*) into v_cnt from (
    select id::text from app.organizations where id in (v_org, v_org2)
    union all select id::text from auth.users where id in (v_dl, v_vo)) x;
  v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'every probe row was rolled back',
    'expected', '0', 'actual', v_cnt::text, 'pass', v_cnt = 0);

  insert into public._noi
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._noi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._noi;
  if v_failed is not null then raise exception 'notice invariants failed: %', v_failed; end if;
  if v_count <> 10 then raise exception 'notice invariants: expected 10 rows, got %', v_count; end if;
end $$;

drop table public._noi;
