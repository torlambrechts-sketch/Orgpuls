-- journey_p1_invariants.sql — P1s the deep audit's journeys found (0108).
--
--   * AUD-29: a rung reaches the people the register records in that duty — tillitsvalgte, and a
--     verneombud without a login — as well as the members in that role (1)
--   * AUD-30: «Start nå» opens the planned puls itself, with its own question, intro and groups,
--     and opens no second round; its ladder is claimed, before the invitations, not dropped (2, 3)
--   * AUD-31: only the daglig leder writes a survey's setup — the verneombud and avdelingsleder
--     are refused on every setup table and by the two definer functions (4)
--   * nothing written here survives (5)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/journey_p1_invariants.sql

create unlogged table if not exists public._jp1(seq int, name text, expected text, actual text, pass bool);
truncate public._jp1;

do $$
declare
  v_org    uuid := '00000000-0000-4000-8000-00000000a912';
  v_dl     uuid := '00000000-0000-4000-8000-0000000a9121';
  v_vo     uuid := '00000000-0000-4000-8000-0000000a9122';
  v_al     uuid := '00000000-0000-4000-8000-0000000a9123';
  v_ga     uuid;
  v_gb     uuid;
  v_wheel  uuid;
  v_meas   uuid;
  v_plan   uuid;
  v_q      uuid;
  v_ob     uuid;
  v_json   jsonb;
  v_claim  jsonb;
  v_txt    text;
  v_i      int;
  v_rows   jsonb := '[]';
  v_cnt    int;
begin
  begin
    insert into app.organizations (id, name, org_number, employee_count, mail_enabled)
    values (v_org, 'Reise Test AS', '999000952', 8, true);
    insert into auth.users (id, email) values (v_dl, 'dl@jp1-probe.no'), (v_vo, 'vo@jp1-probe.no'), (v_al, 'al@jp1-probe.no');
    insert into app.profiles (id, full_name) values (v_dl, 'Dina'), (v_vo, 'Vera'), (v_al, 'Alf');
    insert into app.memberships (org_id, user_id, role) values
      (v_org, v_dl, 'daglig_leder'), (v_org, v_vo, 'verneombud'), (v_org, v_al, 'avdelingsleder');
    insert into app.survey_defaults (org_id, quiet_hours) values (v_org, false);
    insert into app.groups (org_id, name) values (v_org, 'Lager') returning id into v_ga;
    insert into app.groups (org_id, name) values (v_org, 'Kontor') returning id into v_gb;
    insert into app.employees (org_id, full_name, email, group_id)
    select v_org, 'Ansatt ' || g, 'a' || g || '@jp1-probe.no', case when g <= 4 then v_ga else v_gb end
    from generate_series(1, 7) g;
    -- the register's duties: a tillitsvalgt, and a verneombud who has no login
    insert into app.employees (org_id, full_name, email, group_id, duty_role) values
      (v_org, 'Tore Tillitsvalgt', 'tt@jp1-probe.no', v_ga, 'tillitsvalgt'),
      (v_org, 'Kari Verneombud', 'kv@jp1-probe.no', v_gb, 'verneombud');

    insert into app.year_wheels (org_id, active) values (v_org, true) returning id into v_wheel;
    insert into app.wheel_notifications (wheel_id, audience, lead_days, sort_order) values
      (v_wheel, 'verneombud', 14, 1), (v_wheel, 'tillitsvalgte', 14, 2), (v_wheel, 'daglig_leder', 14, 3),
      (v_wheel, 'alle_ansatte', 1, 5);

    -- 1 -------------------------------------------------------------- every rung has an address
    insert into app.measurements (org_id, kind, year, label) values (v_org, 'puls', 2026, 'P') returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, close_after_days)
    values (v_org, v_meas, 'planlagt', now() + interval '30 days', 7) returning id into v_plan;
    insert into app.outbox (org_id, round_id, kind, audience, due_at)
    values (v_org, v_plan, 'forvarsel', 'tillitsvalgte', now()) returning id into v_ob;
    select string_agg(d.email, ',' order by d.email) into v_txt from app.dispatch_recipients(v_ob) d;
    insert into app.outbox (org_id, round_id, kind, audience, due_at)
    values (v_org, v_plan, 'forvarsel', 'verneombud', now()) returning id into v_ob;
    v_txt := v_txt || '|' || (select string_agg(d.email || ':' || d.member::text, ',' order by d.email)
                                from app.dispatch_recipients(v_ob) d);
    delete from app.outbox where round_id = v_plan;
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'tillitsvalgte are reached from the register; the verneombud as member and as recorded employee',
      'expected', 'tt@jp1-probe.no|kv@jp1-probe.no:false,vo@jp1-probe.no:true', 'actual', coalesce(v_txt, 'null'),
      'pass', v_txt = 'tt@jp1-probe.no|kv@jp1-probe.no:false,vo@jp1-probe.no:true');

    -- 2 -------------------------------------------------------------- «Start nå» opens the planned puls
    insert into app.round_factors (org_id, round_id, factor_key) values (v_org, v_plan, 'kontakt');
    insert into app.round_groups (round_id, group_id) values (v_plan, v_ga);
    insert into app.org_questions (org_id, body) values (v_org, 'Har du det du trenger for å gjøre jobben?') returning id into v_q;
    insert into app.round_org_questions (round_id, question_id) values (v_plan, v_q);
    update app.rounds set intro_message = 'Takk for at dere svarer.' where id = v_plan;
    select count(*) into v_i from app.rounds where org_id = v_org;

    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_json := public.start_next_pulse(v_org);
    reset role;

    select concat_ws('|',
      ((v_json->>'round_id') = v_plan::text)::text,
      (select status::text from app.rounds where id = v_plan),
      ((select count(*) from app.rounds where org_id = v_org) = v_i)::text,
      (select count(*) from app.round_org_questions where round_id = v_plan),
      (select (intro_message is not null)::text from app.rounds where id = v_plan),
      (select count(*) from app.invitations where round_id = v_plan))
      into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'the planned round opens itself: own question, intro, its group''s 5 invitations; no second round',
      'expected', 'true|apen|true|1|true|5', 'actual', coalesce(v_txt, 'null'), 'pass', v_txt = 'true|apen|true|1|true|5');

    -- 3 -------------------------------------------------------------- its ladder is sent, first
    update app.outbox set sent_at = now() where round_id <> v_plan and sent_at is null and failed_at is null;
    v_claim := public.dispatch_claim(100);
    select concat_ws('|',
      (select string_agg(distinct j->>'audience', ',' order by j->>'audience')
         from jsonb_array_elements(v_claim) j where j->>'org' = 'Reise Test AS' and j->>'kind' = 'forvarsel'),
      ((select max(n) from jsonb_array_elements(v_claim) with ordinality x(j, n)
         where j->>'org' = 'Reise Test AS' and j->>'kind' = 'forvarsel')
        < (select min(n) from jsonb_array_elements(v_claim) with ordinality x(j, n)
         where j->>'org' = 'Reise Test AS' and j->>'kind' = 'invitasjon'))::text,
      (select count(*) from app.outbox where round_id = v_plan and kind = 'forvarsel' and failed_at is not null))
      into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'the started round''s ladder is claimed, every rung, before the invitations; none dropped',
      'expected', 'alle_ansatte,daglig_leder,tillitsvalgte,verneombud|true|0', 'actual', coalesce(v_txt, 'null'),
      'pass', v_txt = 'alle_ansatte,daglig_leder,tillitsvalgte,verneombud|true|0');

    -- 4 -------------------------------------------------------------- setup is the daglig leder's
    insert into app.measurements (org_id, kind, year, label) values (v_org, 'puls', 2026, 'Q') returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, close_after_days)
    values (v_org, v_meas, 'planlagt', now() + interval '60 days', 7) returning id into v_plan;
    v_txt := '';

    -- the verneombud: rounds, factors, extras, modules, measurements, and the two functions
    perform set_config('request.jwt.claims', json_build_object('sub', v_vo, 'role', 'authenticated')::text, true);
    set local role authenticated;
    update app.rounds set comment_policy = 'av' where id = v_plan;
    get diagnostics v_i = row_count;
    v_txt := v_txt || 'vo.rounds=' || v_i;
    begin
      insert into app.round_factors (org_id, round_id, factor_key) values (v_org, v_plan, 'mengde');
      v_txt := v_txt || ',vo.factors=written';
    exception when insufficient_privilege then v_txt := v_txt || ',vo.factors=denied';
    end;
    begin
      insert into app.round_extra_questions (org_id, round_id, extra_key) values (v_org, v_plan, 'vold');
      v_txt := v_txt || ',vo.extras=written';
    exception when insufficient_privilege then v_txt := v_txt || ',vo.extras=denied';
    end;
    begin
      insert into app.measurements (org_id, kind, year, label) values (v_org, 'puls', 2026, 'V');
      v_txt := v_txt || ',vo.measurement=written';
    exception when insufficient_privilege then v_txt := v_txt || ',vo.measurement=denied';
    end;
    v_txt := v_txt || ',vo.set_extras=' || coalesce(public.set_round_extras(v_plan, array['krenkende', 'vold'], null)->>'error', 'ok');
    v_txt := v_txt || ',vo.reset=' || coalesce(public.reset_round_settings(v_plan, 'kommentarer')->>'error', 'ok');

    -- the avdelingsleder: the invited groups and the round's own questions
    perform set_config('request.jwt.claims', json_build_object('sub', v_al, 'role', 'authenticated')::text, true);
    begin
      insert into app.round_groups (round_id, group_id) values (v_plan, v_gb);
      v_txt := v_txt || ',al.groups=written';
    exception when insufficient_privilege then v_txt := v_txt || ',al.groups=denied';
    end;
    begin
      insert into app.round_org_questions (round_id, question_id) values (v_plan, v_q);
      v_txt := v_txt || ',al.questions=written';
    exception when insufficient_privilege then v_txt := v_txt || ',al.questions=denied';
    end;
    begin
      insert into app.org_questions (org_id, body) values (v_org, 'Et spørsmål fra avdelingen');
      v_txt := v_txt || ',al.bank=written';
    exception when insufficient_privilege then v_txt := v_txt || ',al.bank=denied';
    end;

    -- the daglig leder may do all of it
    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    update app.rounds set comment_policy = 'av' where id = v_plan;
    get diagnostics v_i = row_count;
    v_txt := v_txt || ',dl.rounds=' || v_i;
    insert into app.round_groups (round_id, group_id) values (v_plan, v_gb);
    insert into app.round_org_questions (round_id, question_id) values (v_plan, v_q);
    v_txt := v_txt || ',dl.set_extras=' || coalesce(public.set_round_extras(v_plan, array['krenkende', 'vold'], null)->>'error', 'ok');
    reset role;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'setup writes: verneombud and avdelingsleder refused everywhere; the daglig leder allowed',
      'expected', 'vo.rounds=0,vo.factors=denied,vo.extras=denied,vo.measurement=denied,vo.set_extras=not_allowed,vo.reset=not_allowed,al.groups=denied,al.questions=denied,al.bank=denied,dl.rounds=1,dl.set_extras=ok',
      'actual', v_txt,
      'pass', v_txt = 'vo.rounds=0,vo.factors=denied,vo.extras=denied,vo.measurement=denied,vo.set_extras=not_allowed,vo.reset=not_allowed,al.groups=denied,al.questions=denied,al.bank=denied,dl.rounds=1,dl.set_extras=ok');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 5 ----------------------------------------------------------------- nothing survives
  select count(*) into v_cnt from (
    select id::text from app.organizations where id = v_org
    union all select id::text from auth.users where id in (v_dl, v_vo, v_al)) x;
  v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'every probe row was rolled back',
    'expected', '0', 'actual', v_cnt::text, 'pass', v_cnt = 0);

  insert into public._jp1
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._jp1 order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._jp1;
  if v_failed is not null then raise exception 'journey p1 invariants failed: %', v_failed; end if;
  if v_count <> 5 then raise exception 'journey p1 invariants: expected 5 rows, got %', v_count; end if;
end $$;

drop table public._jp1;
