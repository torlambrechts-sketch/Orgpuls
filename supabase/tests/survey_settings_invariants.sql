-- survey_settings_invariants.sql — Målinger › Innstillinger, the QR way in, the second
-- reminder and quiet hours (0075, 0076, D-126).
--
--   * the three new tables: RLS on, no write policy, no insert grant (1)
--   * with no standard, a new grunnlinje the wheel plans asks the screening (2)
--   * only a daglig leder sets the standard; leaving out violence or offensive behaviour
--     takes a reason; every change is logged (3)
--   * a new planned grunnlinje and puls take the standard; a puls asks no extras (4)
--   * saving again moves the planned rounds that followed, not a field changed for one (5)
--   * a section goes back on the standard; per-round extras need the reason too (6)
--   * a round's settings, questions and audience are fixed once it opens, for a client (7);
--     a group deleted from the register still takes its audience rows along (8)
--   * the entry code: daglig leder only, stable, replaceable (9)
--   * the public page learns the name, whether a survey is open and the channels (10)
--   * request_link answers the same whatever is typed (11), and queues one link on the
--     channel typed, without reading who has answered (12, 0077)
--   * the claim sends that link at once, drops it for a person who has answered, and holds a
--     reminder in quiet hours (13)
--   * the second reminder is queued the day before closing, for those who have not answered (14)
--   * nothing written here survives (15)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/survey_settings_invariants.sql

create unlogged table if not exists public._ssi(seq int, name text, expected text, actual text, pass bool);
truncate public._ssi;

do $$
declare
  v_org     uuid := '00000000-0000-4000-8000-000000000001';
  v_dl      uuid;
  v_vo      uuid := '00000000-0000-4000-8000-00000000b601';
  v_meas    uuid;
  v_pmeas   uuid;
  v_omeas   uuid;
  v_plain   uuid;
  v_std     uuid;
  v_changed uuid;
  v_puls    uuid;
  v_open    uuid;
  v_emp     uuid;
  v_emp2    uuid;
  v_inv     uuid;
  v_inv2    uuid;
  v_group   uuid;
  v_code    text;
  v_code2   text;
  v_rows    jsonb := '[]';
  v_txt     text;
  v_json    jsonb;
  v_off     int;
  claims    constant text := '{"sub":"%s","role":"authenticated","aal":"aal1"}';
  good      constant jsonb := '{"close_days_grunnlinje": 14, "close_days_puls": 5, "reminder_day": 4,
    "final_reminder": true, "quiet_hours": true, "comment_policy": "slutt", "allow_dialogue": false,
    "extras": ["anbefaling", "krenkende", "apent_felt"]}';
begin
  -- the standard is applied when the creating transaction commits; here, at each statement
  set constraints all immediate;
  select m.user_id into v_dl from app.memberships m where m.org_id = v_org and m.role = 'daglig_leder' and m.active limit 1;

  -- 1 -------------------------------------------------------------- the grant surface
  select string_agg(
           (select relrowsecurity from pg_class where oid = ('app.' || t)::regclass)::text || '/'
           || (select count(*) from pg_policies where schemaname = 'app' and tablename = t and cmd <> 'SELECT')::text || '/'
           || has_table_privilege('authenticated', 'app.' || t, 'insert')::text, ',' order by t)
    into v_txt
  from unnest(array['entry_codes', 'survey_defaults', 'survey_defaults_log']) t;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'RLS on, no write policy, no insert grant',
    'expected', 'true/0/false,true/0/false,true/0/false', 'actual', v_txt, 'pass', v_txt = 'true/0/false,true/0/false,true/0/false');

  begin
    insert into auth.users (id, email) values (v_vo, 'vo@ssi-test.example');
    insert into app.profiles (id, full_name) values (v_vo, 'VO') on conflict (id) do nothing;
    insert into app.memberships (org_id, user_id, role, active) values (v_org, v_vo, 'verneombud', true);
    insert into app.measurements (org_id, kind, year) values (v_org, 'grunnlinje', 2096) returning id into v_meas;
    insert into app.measurements (org_id, kind, year) values (v_org, 'puls', 2096) returning id into v_pmeas;

    -- 2 ------------------------------------------------------------ no standard
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'planlagt', '2096-02-01', '2096-02-08') returning id into v_plain;
    select array_to_string(app.round_extras(v_plain), ' ') || ',' || coalesce(r.reminder_day::text, 'none') || ',' || r.close_after_days::text
      into v_txt from app.rounds r where r.id = v_plain;
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'no standard: a new grunnlinje asks the four extras; nothing else moves',
      'expected', 'anbefaling apent_felt krenkende vold,none,7', 'actual', v_txt,
      'pass', v_txt = 'anbefaling apent_felt krenkende vold,none,7');

    -- 3 ------------------------------------------------------------ who, and the reason
    perform set_config('request.jwt.claims', format(claims, v_vo), true);
    set local role authenticated;
    v_txt := public.save_survey_defaults(v_org, good || '{"extras_off_reason": "Vi måler dette separat hver vår."}')->>'error';
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_txt := v_txt || ',' || (public.save_survey_defaults(v_org, good)->>'error');
    v_txt := v_txt || ',' || (public.save_survey_defaults(v_org, good || '{"extras_off_reason": "kort"}')->>'error');
    v_txt := v_txt || ',' || coalesce(public.save_survey_defaults(v_org, good || '{"extras_off_reason": "Vi måler dette separat hver vår."}')->>'error', 'ok');
    begin
      insert into app.survey_defaults (org_id) values (v_org);
      v_txt := v_txt || ',written';
    exception when insufficient_privilege then v_txt := v_txt || ',refused';
    end;
    v_txt := v_txt || ',' || (select count(*) from app.survey_defaults_log l where l.org_id = v_org)::text;
    reset role;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'verneombud refused; no reason, a short reason refused; with one saved; no direct write; logged',
      'expected', 'not_allowed,reason_required,reason_required,ok,refused,1', 'actual', v_txt,
      'pass', v_txt = 'not_allowed,reason_required,reason_required,ok,refused,1');

    -- 4 ------------------------------------------------------------ new rounds take it
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'planlagt', '2096-03-01', '2096-03-08') returning id into v_std;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_pmeas, 'planlagt', '2096-04-01', '2096-04-08') returning id into v_puls;
    select concat_ws(',', r.close_after_days, (r.closes_at - r.opens_at)::text, r.reminder_day, r.final_reminder,
                     r.comment_policy, r.allow_dialogue, array_to_string(app.round_extras(r.id), ' '), r.extras_off_reason is not null)
      into v_txt from app.rounds r where r.id = v_std;
    select v_txt || ' | ' || concat_ws(',', r.close_after_days, r.reminder_day, cardinality(app.round_extras(r.id)))
      into v_txt from app.rounds r where r.id = v_puls;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'a new grunnlinje and puls take the standard; the puls asks no extras',
      'expected', '14,14 days,4,t,slutt,f,anbefaling apent_felt krenkende,t | 5,4,0', 'actual', v_txt,
      'pass', v_txt = '14,14 days,4,t,slutt,f,anbefaling apent_felt krenkende,t | 5,4,0');

    -- 5 ------------------------------------------------------------ saving again
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'planlagt', '2096-05-01', '2096-05-08') returning id into v_changed;
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    set local role authenticated;
    update app.rounds set reminder_day = 2 where id = v_changed;
    v_json := public.save_survey_defaults(v_org, good || '{"reminder_day": 3, "close_days_grunnlinje": 10, "extras": ["anbefaling", "krenkende", "vold", "apent_felt"]}');
    reset role;
    select string_agg(concat_ws('/', r.reminder_day, r.close_after_days, cardinality(app.round_extras(r.id)), r.extras_off_reason is null),
                      ',' order by r.opens_at)
      into v_txt from app.rounds r where r.id in (v_std, v_changed);
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'a following round moves; a field changed for one round stays',
      'expected', '3/10/4/t,2/10/4/t', 'actual', v_txt, 'pass', v_txt = '3/10/4/t,2/10/4/t');

    -- 6, 7 --------------------------------------------------------- reset, per-round extras
    perform set_config('request.jwt.claims', format(claims, v_vo), true);
    set local role authenticated;
    v_txt := (public.reset_round_settings(v_changed, 'rytme')->>'ok');
    v_txt := v_txt || ',' || (select r.reminder_day::text from app.rounds r where r.id = v_changed);
    v_txt := v_txt || ',' || (public.set_round_extras(v_changed, array['anbefaling'], null)->>'error');
    v_txt := v_txt || ',' || (public.set_round_extras(v_changed, array['anbefaling'], 'Egen screening i HMS-runden i mars.')->>'ok');
    v_txt := v_txt || ',' || (select string_agg(x.extra_key, ' ' order by x.extra_key) from app.round_extra_questions x where x.round_id = v_changed);
    v_txt := v_txt || ',' || (public.reset_round_settings(v_changed, 'tillegg')->>'ok');
    v_txt := v_txt || ',' || (select count(*) from app.round_extra_questions x where x.round_id = v_changed)::text
             || ',' || (select (r.extras_off_reason is null)::text from app.rounds r where r.id = v_changed);
    reset role;
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'a section back on the standard; leaving out the screening for one round takes a reason',
      'expected', 'true,3,reason_required,true,anbefaling,true,4,true', 'actual', v_txt,
      'pass', v_txt = 'true,3,reason_required,true,anbefaling,true,4,true');

    -- an open round, with two employees on its list
    insert into app.measurements (org_id, kind, year) values (v_org, 'oppfolging', 2096) returning id into v_omeas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at, final_reminder)
    values (v_org, v_omeas, 'apen', now() - interval '5 days', now() + interval '20 hours', true) returning id into v_open;
    insert into app.employees (org_id, full_name, email, phone, active)
    values (v_org, 'Probe En', 'ssi-en@orgpuls.com', '+4790000601', true) returning id into v_emp;
    insert into app.employees (org_id, full_name, email, active)
    values (v_org, 'Probe To', 'ssi-to@orgpuls.com', true) returning id into v_emp2;
    insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at)
    values (v_org, v_open, v_emp, extensions.digest('ssi-probe-1-' || gen_random_uuid(), 'sha256'), now() + interval '20 hours')
    returning id into v_inv;
    insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at, responded_at)
    values (v_org, v_open, v_emp2, extensions.digest('ssi-probe-2-' || gen_random_uuid(), 'sha256'), now() + interval '20 hours', now())
    returning id into v_inv2;
    insert into app.groups (org_id, name, sort_order) values (v_org, 'SSI probe', 9601) returning id into v_group;
    insert into app.round_groups (round_id, group_id) values (v_open, v_group);

    -- 8, 9 --------------------------------------------------------- fixed once open
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    set local role authenticated;
    v_txt := (public.set_round_extras(v_open, array['anbefaling', 'krenkende', 'vold'], null)->>'error');
    begin
      update app.rounds set reminder_day = 1 where id = v_open;
      v_txt := v_txt || ',updated';
    exception when restrict_violation then v_txt := v_txt || ',refused';
    end;
    begin
      insert into app.round_factors (org_id, round_id, factor_key) values (v_org, v_open, 'ytring');
      v_txt := v_txt || ',inserted';
    exception when restrict_violation then v_txt := v_txt || ',refused';
    end;
    begin
      update app.rounds set reminder_day = 1 where id = v_changed;
      v_txt := v_txt || ',planned-ok';
    exception when restrict_violation then v_txt := v_txt || ',planned-refused';
    end;
    reset role;
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'an open round: extras, settings and factors refused; a planned one still changes',
      'expected', 'locked,refused,refused,planned-ok', 'actual', v_txt, 'pass', v_txt = 'locked,refused,refused,planned-ok');

    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    set local role authenticated;
    begin
      delete from app.groups where id = v_group;
      v_txt := 'deleted';
    exception when restrict_violation then v_txt := 'refused';
    end;
    reset role;
    v_txt := v_txt || ',' || (select count(*) from app.round_groups where group_id = v_group)::text;
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'a group deleted from the register takes an open round''s audience row along',
      'expected', 'deleted,0', 'actual', v_txt, 'pass', v_txt = 'deleted,0');

    -- 10 ------------------------------------------------------------ the entry code
    perform set_config('request.jwt.claims', format(claims, v_vo), true);
    set local role authenticated;
    v_txt := public.entry_code(v_org)->>'error';
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_code := public.entry_code(v_org)->>'code';
    v_code2 := public.entry_code(v_org)->>'code';
    v_txt := v_txt || ',' || (v_code ~ '^[a-hjkmnp-z2-9]{8}$')::text || ',' || (v_code = v_code2)::text;
    v_code2 := public.entry_code(v_org, true)->>'code';
    v_txt := v_txt || ',' || (v_code <> v_code2)::text;
    perform set_config('request.jwt.claims', format(claims, v_vo), true);
    v_txt := v_txt || ',' || (select c.code = v_code2 from app.entry_codes c where c.org_id = v_org)::text;
    reset role;
    v_code := v_code2;
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'entry code: daglig leder only, eight safe characters, stable, replaceable; members read it',
      'expected', 'not_allowed,true,true,true,true', 'actual', v_txt, 'pass', v_txt = 'not_allowed,true,true,true,true');

    -- 11 ------------------------------------------------------------ the public page
    perform set_config('request.jwt.claims', '', true);
    set local role anon;
    v_json := public.entry_info(v_code);
    v_txt := (public.entry_info('zzzzzzzz')->>'error') || ',' || (v_json->>'org') || ',' || (v_json->>'open')
             || ',' || (select string_agg(k, ' ' order by k) from jsonb_object_keys(v_json) k);
    reset role;
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'the public page: unknown code, or name, open and channels only',
      'expected', 'unknown,Nordvik Anlegg AS,true,email lang open org sms', 'actual', v_txt,
      'pass', v_txt = 'unknown,Nordvik Anlegg AS,true,email lang open org sms');

    -- 12, 13 --------------------------------------------------------- request_link
    update app.organizations set mail_enabled = true, sms_enabled = true where id = v_org;
    set local role anon;
    v_txt := string_agg(x, '|') from (select public.request_link(v_code, c)::text as x
      from unnest(array['SSI-EN@orgpuls.com ', 'ssi-to@orgpuls.com', 'nobody@orgpuls.com', '+4790000602']) c) q;
    v_txt := v_txt || ',' || (public.request_link(v_code, 'not an address')->>'error');
    reset role;
    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'the same answer for a match, an answered person, a stranger and an unknown number',
      'expected', '{"ok": true}|{"ok": true}|{"ok": true}|{"ok": true},invalid', 'actual', v_txt,
      'pass', v_txt = '{"ok": true}|{"ok": true}|{"ok": true}|{"ok": true},invalid');

    set local role anon;
    perform public.request_link(v_code, 'ssi-en@orgpuls.com');
    reset role;
    select string_agg(concat_ws('/', o.employee_id = v_emp, o.channel, o.invitation_id = v_inv), ',') into v_txt
    from app.outbox o where o.round_id = v_open and o.kind = 'lenke' and o.employee_id = v_emp;
    update app.outbox set sent_at = now() - interval '11 minutes' where round_id = v_open and kind = 'lenke' and employee_id = v_emp;
    set local role anon;
    perform public.request_link(v_code, 'ssi-en@orgpuls.com');
    reset role;
    v_txt := v_txt || ',' || (select count(*) || '/' || bool_and(o.sent_at is null) from app.outbox o
                              where o.round_id = v_open and o.kind = 'lenke' and o.employee_id = v_emp);
    v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'one link on the channel typed; again after ten minutes, not duplicated',
      'expected', 't/email/t,1/true', 'actual', v_txt, 'pass', v_txt = 't/email/t,1/true');

    -- 14 ------------------------------------------------------------ the claim
    -- only this organisation is claimed from, and its clock reads 23:00
    update app.organizations set mail_enabled = false where id <> v_org;
    v_off := 23 - extract(hour from now() at time zone 'UTC')::int;
    if v_off > 14 then v_off := v_off - 24; end if;
    update app.organizations
    set mail_enabled = true,
        timezone = case when v_off >= 0 then 'Etc/GMT-' || v_off else 'Etc/GMT+' || (-v_off) end
    where id = v_org;
    update app.outbox set sent_at = coalesce(sent_at, now()) where org_id = v_org and not (round_id = v_open and kind = 'lenke');
    insert into app.outbox (org_id, round_id, kind, employee_id, invitation_id, due_at)
    values (v_org, v_open, 'paminnelse', v_emp, v_inv, now() - interval '1 minute');
    v_json := public.dispatch_claim(100);
    select string_agg(concat_ws('/', j->>'kind', j->>'channel', length(j->>'token')), ',') into v_txt from jsonb_array_elements(v_json) j;
    v_txt := coalesce(v_txt, 'none') || ',' || (select (i.token_hash <> extensions.digest('x', 'sha256'))::text from app.invitations i where i.id = v_inv)
             || ',' || (select string_agg(o.last_error, ',') from app.outbox o where o.round_id = v_open and o.kind = 'lenke' and o.employee_id = v_emp2);
    v_rows := v_rows || jsonb_build_object('seq', 13, 'name', 'at 23:00 the asked-for link goes, the reminder waits; the answered person''s link is dropped by the claim',
      'expected', 'lenke/email/64,true,answered_or_expired', 'actual', v_txt, 'pass', v_txt = 'lenke/email/64,true,answered_or_expired');

    -- 15 ------------------------------------------------------------ the second reminder
    delete from app.outbox where round_id = v_open and kind = 'siste_paminnelse';
    perform app.queue_final_reminders();
    select count(*) filter (where o.employee_id = v_emp)::text || ',' || count(*) filter (where o.employee_id = v_emp2)::text
      into v_txt from app.outbox o where o.round_id = v_open and o.kind = 'siste_paminnelse';
    v_rows := v_rows || jsonb_build_object('seq', 14, 'name', 'the day before closing: a second reminder for the one who has not answered',
      'expected', '1,0', 'actual', v_txt, 'pass', v_txt = '1,0');

    perform set_config('request.jwt.claims', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  v_txt := (not exists (select 1 from app.survey_defaults where org_id = v_org)
            and not exists (select 1 from app.entry_codes where org_id = v_org)
            and not exists (select 1 from app.employees where email like 'ssi-%@orgpuls.com'))::text;
  v_rows := v_rows || jsonb_build_object('seq', 15, 'name', 'every probe change was rolled back', 'expected', 'true',
    'actual', v_txt, 'pass', v_txt = 'true');

  insert into public._ssi
  select (x->>'seq')::int, x->>'name', x->>'expected', x->>'actual', (x->>'pass')::boolean from jsonb_array_elements(v_rows) x;
end $$;

select seq, name, expected, actual, pass from public._ssi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._ssi;
  if v_failed is not null then raise exception 'survey settings invariants failed: %', v_failed; end if;
  if v_count <> 15 then raise exception 'survey settings invariants: expected 15 rows, got %', v_count; end if;
end $$;

drop table public._ssi;
