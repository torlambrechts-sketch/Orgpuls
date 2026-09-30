-- growth_firewall_invariants.sql — the anonymity firewall (0141, D-182; plan § 3), proved against the
-- live schema: every rule of app.growth_firewall() passes, and each one turns false when the thing it
-- guards is broken, in a probe that is rolled back.
--
--   * every rule passes now, with its evidence as counts (1)
--   * a foreign key from a CRM table to invitations, or to a respondent's comment thread, fails
--     no_link_to_respondents, and each is named (2)
--   * a catalogue prop that could carry a respondent fails catalogue_has_no_respondent_props (3)
--   * a grant on an answer table to the service role fails no_role_reads_answers (4)
--   * so does a grant on some of an answer table's columns — the service role bypasses RLS (5)
--   * a contact who is an employee and no account fails no_employee_is_a_contact; the same address
--     held by a member passes (6)
--   * an event keyed by an invitation fails no_event_names_a_respondent (7)
--   * a growth trigger on responses fails nothing_attached_to_answers (8)
--   * so does a trigger that reaches the stream through a function with an innocent name (9)
--   * a client grant on the stream fails growth_tables_closed (10)
--   * so does a client grant on some of the stream's columns (11)
--   * the firewall is not a client's to call, and holds no hard-coded answer: it reads the catalog (12)
--   * nothing written here survives: every rule passes again, no probe object is left (13)
--   * a foreign key the other way, from an answer table to the stream, fails no_link_to_respondents (14)
--   * a rewrite rule on responses that writes to the stream fails nothing_attached_to_answers (15)
--   * so does a CHECK constraint on answers that calls a function reaching the stream (16)
--   * so do a trigger on invitations (submit_response stamps responded_at in the respondent's own
--     transaction) and a column default on invitations that calls a function (17)
--   * so do a policy and an index expression on an answer table (18)
--   * a role of any name holding select on answers fails no_role_reads_answers, and so does a role
--     that holds it only through membership of that one (19)
--   * a contact who shares an address with an employee who is no longer active fails
--     no_employee_is_a_contact (20)
--   * an event keyed by an invitation's token hash fails no_event_names_a_respondent (21)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/growth_firewall_invariants.sql

create unlogged table if not exists public._gfw(seq int, name text, expected text, actual text, pass bool);
truncate public._gfw;

do $$
declare
  v_org   uuid := '00000000-0000-4000-8000-0000000f1a01';
  v_user  uuid := '00000000-0000-4000-8000-0000000f1b01';
  v_meas  uuid;
  v_round uuid;
  v_inv   uuid;
  v_txt   text;
  v_all   constant text := 'no_link_to_respondents:t,catalogue_has_no_respondent_props:t,no_role_reads_answers:t,no_employee_is_a_contact:t,no_event_names_a_respondent:t,nothing_attached_to_answers:t,growth_tables_closed:t';
  -- each rule's evidence: its counts, and the names of what fails (empty while it passes)
  v_keys  constant text := 'no_link_to_respondents=links,names,tables catalogue_has_no_respondent_props=events,flagged,names,props '
                           'no_role_reads_answers=held,names,roles,tables no_employee_is_a_contact=contacts '
                           'no_event_names_a_respondent=events,flagged nothing_attached_to_answers=guards,names,other,tables '
                           'growth_tables_closed=names,open,tables';
  v_rows  jsonb := '[]';
  v_resp  uuid;
begin
  -- 1 ---------------------------------------------------------------- every rule passes
  select string_agg(rule || ':' || case when pass then 't' else 'f' end, ',' order by seq) into v_txt from app.growth_firewall();
  -- the evidence is data the page words: numbers, and names only of what fails
  select v_txt || '|' || string_agg(f.rule || '=' || (select string_agg(k, ',' order by k) from jsonb_object_keys(f.evidence) k), ' ' order by f.seq)
         || '|' || bool_and((select bool_and(jsonb_typeof(x.v) = 'number' or (x.k = 'names' and x.v = '[]'::jsonb)) from jsonb_each(f.evidence) x(k, v)))
    into v_txt from app.growth_firewall() f;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'every firewall rule passes; its evidence is counts (names only of what fails)',
    'expected', v_all || '|' || v_keys || '|true', 'actual', v_txt, 'pass', v_txt = v_all || '|' || v_keys || '|true');

  -- 2 ---------------------------------------------------------------- a link to a respondent table
  begin
    create table app.crm_probe_link (id uuid primary key, invitation_id uuid references app.invitations (id));
    create table app.crm_probe_thread (id uuid primary key, thread_id uuid references app.comment_threads (id));
    select concat_ws('|', pass, evidence->>'links', evidence->'names' ? 'crm_probe_link.crm_probe_link_invitation_id_fkey',
                     evidence->'names' ? 'crm_probe_thread.crm_probe_thread_thread_id_fkey')
      into v_txt from app.growth_firewall() where rule = 'no_link_to_respondents';
    raise exception 'rollback';
  exception when others then if sqlerrm <> 'rollback' then raise; end if;
  end;
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'a foreign key from a CRM table to invitations, or to a comment thread, turns no_link_to_respondents false, each named',
    'expected', 'f|2|t|t', 'actual', v_txt, 'pass', v_txt = 'f|2|t|t');

  -- 3 ---------------------------------------------------------------- a respondent prop in the catalogue
  -- the catalogue's own check refuses it first; the probe removes that check to prove the firewall
  -- would still see it
  begin
    alter table app.event_catalogue drop constraint event_catalogue_props_ok;
    update app.event_catalogue set allowed_props = allowed_props || 'respondent_id'::text where name = 'survey.sent';
    select pass::text || '|' || (evidence->'names' ? 'survey.sent respondent_id')::text into v_txt
    from app.growth_firewall() where rule = 'catalogue_has_no_respondent_props';
    raise exception 'rollback';
  exception when others then if sqlerrm <> 'rollback' then raise; end if;
  end;
  v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'a catalogue prop that could carry a respondent turns catalogue_has_no_respondent_props false',
    'expected', 'false|true', 'actual', v_txt, 'pass', v_txt = 'false|true');

  -- 4 ---------------------------------------------------------------- a grant on an answer table
  begin
    grant select on app.answers to service_role;
    select pass::text || '|' || (evidence->'names' ? 'service_role on answers')::text into v_txt from app.growth_firewall() where rule = 'no_role_reads_answers';
    raise exception 'rollback';
  exception when others then if sqlerrm <> 'rollback' then raise; end if;
  end;
  v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'a grant on answers to the service role turns no_role_reads_answers false',
    'expected', 'false|true', 'actual', v_txt, 'pass', v_txt = 'false|true');

  -- 5 ---------------------------------------------------------------- a grant on some columns of an answer table
  begin
    grant select (id, round_id, group_id, submitted_hour) on app.responses to service_role;
    select concat_ws('|', has_table_privilege('service_role', 'app.responses', 'select'), pass, evidence->'names' ? 'service_role on responses')
      into v_txt from app.growth_firewall() where rule = 'no_role_reads_answers';
    raise exception 'rollback';
  exception when others then if sqlerrm <> 'rollback' then raise; end if;
  end;
  v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'a column grant on responses to the service role (no table privilege) turns no_role_reads_answers false',
    'expected', 'f|f|t', 'actual', v_txt, 'pass', v_txt = 'f|f|t');

  -- 6 ---------------------------------------------------------------- an employee as a contact
  begin
    insert into app.organizations (id, name, org_number, employee_count) values (v_org, 'Brannmur AS', '999001421', 8);
    insert into app.employees (org_id, full_name, email) values (v_org, 'Ansatt', 'ansatt@gfw-probe.no');
    insert into app.crm_contacts (email, source, basis, status) values ('ansatt@gfw-probe.no', 'manual', 'none', 'active');
    select pass::text || '|' || (evidence->>'contacts') into v_txt from app.growth_firewall() where rule = 'no_employee_is_a_contact';
    -- the same person, who is also an account in the organisation: a contact as every account is
    insert into auth.users (id, email) values (v_user, 'ansatt@gfw-probe.no');
    insert into app.profiles (id, full_name) values (v_user, 'Ansatt');
    insert into app.memberships (org_id, user_id, role) values (v_org, v_user, 'verneombud');
    select v_txt || '|' || pass::text into v_txt from app.growth_firewall() where rule = 'no_employee_is_a_contact';
    raise exception 'rollback';
  exception when others then if sqlerrm <> 'rollback' then raise; end if;
  end;
  v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'a contact who is an employee and no account turns no_employee_is_a_contact false (a count, no address); a member''s address passes',
    'expected', 'false|1|true', 'actual', v_txt, 'pass', v_txt = 'false|1|true');

  -- 7 ---------------------------------------------------------------- an event keyed by an invitation
  begin
    insert into app.organizations (id, name, org_number, employee_count) values (v_org, 'Brannmur AS', '999001421', 8);
    insert into app.employees (org_id, full_name, email) values (v_org, 'Ansatt', 'ansatt@gfw-probe.no');
    insert into app.measurements (org_id, kind, year, label) values (v_org, 'grunnlinje', 2026, 'Probe') returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'apen', now() - interval '1 day', now() + interval '10 days') returning id into v_round;
    insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at)
    select v_org, v_round, e.id, extensions.digest('gfw' || e.id::text, 'sha256'), now() + interval '10 days'
    from app.employees e where e.org_id = v_org returning id into v_inv;
    select pass::text into v_txt from app.growth_firewall() where rule = 'no_event_names_a_respondent';
    insert into app.growth_events (name, occurred_at, org_id, props, source, dedupe_key)
    values ('survey.created', now(), v_org, '{}', 'trigger', v_inv::text);
    select v_txt || '|' || pass::text into v_txt from app.growth_firewall() where rule = 'no_event_names_a_respondent';
    raise exception 'rollback';
  exception when others then if sqlerrm <> 'rollback' then raise; end if;
  end;
  v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'an event keyed by an invitation''s id turns no_event_names_a_respondent false',
    'expected', 'true|false', 'actual', v_txt, 'pass', v_txt = 'true|false');

  -- 8 ---------------------------------------------------------------- a growth trigger on responses
  begin
    create function app.growth_probe_on_response() returns trigger language plpgsql set search_path = ''
      as $f$ begin return null; end $f$;
    create trigger growth_probe after insert on app.responses for each row execute function app.growth_probe_on_response();
    select pass::text || '|' || (evidence->'names' ? 'app.responses.growth_probe')::text into v_txt
    from app.growth_firewall() where rule = 'nothing_attached_to_answers';
    raise exception 'rollback';
  exception when others then if sqlerrm <> 'rollback' then raise; end if;
  end;
  v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'a growth trigger on responses turns nothing_attached_to_answers false',
    'expected', 'false|true', 'actual', v_txt, 'pass', v_txt = 'false|true');

  -- 9 ---------------------------------------------------------------- the same, one call away
  -- a trigger function named for nothing, which reaches the stream through another: only the answer
  -- tables' own guards may run there, whatever a function is called
  begin
    create function app.probe_track(p text) returns void language plpgsql security definer set search_path = ''
      as $f$ begin perform app.growth_emit('survey.created', now(), null, null, '{}', 'trigger', null); end $f$;
    create function app.probe_on_resp() returns trigger language plpgsql set search_path = ''
      as $f$ begin perform app.probe_track('x'); return null; end $f$;
    create trigger probe_resp_track after insert on app.responses for each row execute function app.probe_on_resp();
    create trigger probe_thread_track after insert on app.thread_messages for each row execute function app.probe_on_resp();
    select concat_ws('|', pass, evidence->>'other', evidence->'names' ? 'app.responses.probe_resp_track',
                     evidence->'names' ? 'app.thread_messages.probe_thread_track')
      into v_txt from app.growth_firewall() where rule = 'nothing_attached_to_answers';
    raise exception 'rollback';
  exception when others then if sqlerrm <> 'rollback' then raise; end if;
  end;
  v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'a trigger on responses, or on a respondent''s thread, that reaches the stream through an innocently named function turns nothing_attached_to_answers false',
    'expected', 'f|2|t|t', 'actual', v_txt, 'pass', v_txt = 'f|2|t|t');

  -- 10 --------------------------------------------------------------- a client grant on the stream
  begin
    grant select on app.growth_events to authenticated;
    select pass::text || '|' || (evidence->'names' ? 'growth_events')::text into v_txt from app.growth_firewall() where rule = 'growth_tables_closed';
    raise exception 'rollback';
  exception when others then if sqlerrm <> 'rollback' then raise; end if;
  end;
  v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'a client grant on growth_events turns growth_tables_closed false',
    'expected', 'false|true', 'actual', v_txt, 'pass', v_txt = 'false|true');

  -- 11 --------------------------------------------------------------- a client grant on some of its columns
  begin
    grant select (id, name, org_id, occurred_at) on app.growth_events to anon;
    select concat_ws('|', has_table_privilege('anon', 'app.growth_events', 'select'), pass, evidence->'names' ? 'growth_events')
      into v_txt from app.growth_firewall() where rule = 'growth_tables_closed';
    raise exception 'rollback';
  exception when others then if sqlerrm <> 'rollback' then raise; end if;
  end;
  v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'a column grant on growth_events to anon (no table privilege) turns growth_tables_closed false',
    'expected', 'f|f|t', 'actual', v_txt, 'pass', v_txt = 'f|f|t');

  -- 12 --------------------------------------------------------------- not a client's, and computed
  select concat_ws('|',
    has_function_privilege('authenticated', 'app.growth_firewall()', 'execute'),
    has_function_privilege('anon', 'app.growth_firewall()', 'execute'),
    (select p.prosrc ~ 'pg_constraint' and p.prosrc ~ 'has_table_privilege' and p.prosrc ~ 'has_any_column_privilege' and p.prosrc ~ 'pg_trigger'
            and p.prosrc ~ 'pg_rewrite' and p.prosrc ~ 'pg_policy' and p.prosrc ~ 'pg_depend' and p.prosrc ~ 'token_hash'
     from pg_proc p where p.oid = 'app.growth_firewall()'::regprocedure),
    (select count(*) from app.growth_firewall()))
    into v_txt;
  v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'no client may call the firewall; it reads the catalog: constraints, table and column grants, triggers, rules, policies, dependencies, token hashes; seven rules',
    'expected', 'f|f|t|7', 'actual', v_txt, 'pass', v_txt = 'f|f|t|7');

  -- 14 --------------------------------------------------------------- a link the other way
  -- an answer that carries an event's id ties the answer to what the event says
  begin
    alter table app.extra_answers add column zz_ev uuid references app.growth_events (id);
    select concat_ws('|', pass, evidence->>'links', evidence->'names' ? 'extra_answers.extra_answers_zz_ev_fkey')
      into v_txt from app.growth_firewall() where rule = 'no_link_to_respondents';
    raise exception 'rollback';
  exception when others then if sqlerrm <> 'rollback' then raise; end if;
  end;
  v_rows := v_rows || jsonb_build_object('seq', 14, 'name', 'a foreign key from an answer table to the stream turns no_link_to_respondents false, named',
    'expected', 'f|1|t', 'actual', v_txt, 'pass', v_txt = 'f|1|t');

  -- 15 --------------------------------------------------------------- a rewrite rule on responses
  begin
    create rule zz_resp_rule as on insert to app.responses do also
      insert into app.growth_events (name, occurred_at, props, source) values ('lead.hand_raised', date_trunc('hour', now()), '{"channel":"demo"}', 'trigger');
    select concat_ws('|', pass, evidence->'names' ? 'app.responses.zz_resp_rule')
      into v_txt from app.growth_firewall() where rule = 'nothing_attached_to_answers';
    raise exception 'rollback';
  exception when others then if sqlerrm <> 'rollback' then raise; end if;
  end;
  v_rows := v_rows || jsonb_build_object('seq', 15, 'name', 'a rewrite rule on responses that writes to the stream turns nothing_attached_to_answers false, named',
    'expected', 'f|t', 'actual', v_txt, 'pass', v_txt = 'f|t');

  -- 16 --------------------------------------------------------------- a CHECK constraint that emits
  begin
    create function app.probe_chk(p int) returns boolean language plpgsql security definer set search_path = ''
      as $f$ begin perform app.growth_emit('survey.created', now(), null, null, '{}', 'trigger', null); return true; end $f$;
    alter table app.answers add constraint zz_chk check (app.probe_chk(1)) not valid;
    select concat_ws('|', pass, evidence->'names' ? 'app.answers.zz_chk')
      into v_txt from app.growth_firewall() where rule = 'nothing_attached_to_answers';
    raise exception 'rollback';
  exception when others then if sqlerrm <> 'rollback' then raise; end if;
  end;
  v_rows := v_rows || jsonb_build_object('seq', 16, 'name', 'a CHECK constraint on answers calling a function that reaches the stream turns nothing_attached_to_answers false, named',
    'expected', 'f|t', 'actual', v_txt, 'pass', v_txt = 'f|t');

  -- 17 --------------------------------------------------------------- invitations: a trigger, a default
  -- submit_response stamps responded_at in the respondent's own transaction: a trigger there would emit
  -- the exact time of each submission
  begin
    create function app.probe_on_inv() returns trigger language plpgsql security definer set search_path = ''
      as $f$ begin perform app.growth_emit('org.created', now(), new.org_id, null, '{}', 'trigger', null); return null; end $f$;
    create trigger zz_inv after update of responded_at on app.invitations for each row execute function app.probe_on_inv();
    create function app.probe_default() returns timestamptz language sql set search_path = '' as $f$ select now() $f$;
    alter table app.invitations alter column sent_at set default app.probe_default();
    select concat_ws('|', pass, evidence->>'other', evidence->'names' ? 'app.invitations.zz_inv', evidence->'names' ? 'app.invitations.sent_at')
      into v_txt from app.growth_firewall() where rule = 'nothing_attached_to_answers';
    raise exception 'rollback';
  exception when others then if sqlerrm <> 'rollback' then raise; end if;
  end;
  v_rows := v_rows || jsonb_build_object('seq', 17, 'name', 'a trigger on invitations, and a column default there calling a function, turn nothing_attached_to_answers false, each named',
    'expected', 'f|2|t|t', 'actual', v_txt, 'pass', v_txt = 'f|2|t|t');

  -- 18 --------------------------------------------------------------- a policy, an index expression
  begin
    create policy zz_pol on app.answers for select to authenticated using (true);
    create function app.probe_imm(p int) returns int language sql immutable set search_path = '' as $f$ select p $f$;
    create index zz_idx on app.answers ((app.probe_imm(1))) where false;
    select concat_ws('|', pass, evidence->'names' ? 'app.answers.zz_pol', evidence->'names' ? 'app.answers.zz_idx')
      into v_txt from app.growth_firewall() where rule = 'nothing_attached_to_answers';
    raise exception 'rollback';
  exception when others then if sqlerrm <> 'rollback' then raise; end if;
  end;
  v_rows := v_rows || jsonb_build_object('seq', 18, 'name', 'a policy on answers, and an index on it calling a function, turn nothing_attached_to_answers false, each named',
    'expected', 'f|t|t', 'actual', v_txt, 'pass', v_txt = 'f|t|t');

  -- 19 --------------------------------------------------------------- a role of any name
  begin
    create role zz_analytics_reader nologin;
    create role zz_dashboard nologin;
    grant select on app.answers to zz_analytics_reader;
    grant zz_analytics_reader to zz_dashboard;
    select concat_ws('|', pass, evidence->'names' ? 'zz_analytics_reader on answers', evidence->'names' ? 'zz_dashboard on answers')
      into v_txt from app.growth_firewall() where rule = 'no_role_reads_answers';
    raise exception 'rollback';
  exception when others then if sqlerrm <> 'rollback' then raise; end if;
  end;
  v_rows := v_rows || jsonb_build_object('seq', 19, 'name', 'a role named for nothing holding select on answers, and a role holding it through membership, turn no_role_reads_answers false, each named',
    'expected', 'f|t|t', 'actual', v_txt, 'pass', v_txt = 'f|t|t');

  -- 20 --------------------------------------------------------------- a former employee as a contact
  begin
    insert into app.organizations (id, name, org_number, employee_count) values (v_org, 'Brannmur AS', '999001421', 8);
    insert into app.employees (org_id, full_name, email, active) values (v_org, 'Sluttet', 'sluttet@gfw-probe.no', false);
    insert into app.crm_contacts (email, source, basis, status) values ('sluttet@gfw-probe.no', 'manual', 'none', 'active');
    select pass::text || '|' || (evidence->>'contacts') into v_txt from app.growth_firewall() where rule = 'no_employee_is_a_contact';
    raise exception 'rollback';
  exception when others then if sqlerrm <> 'rollback' then raise; end if;
  end;
  v_rows := v_rows || jsonb_build_object('seq', 20, 'name', 'a contact who shares an address with an employee no longer active turns no_employee_is_a_contact false',
    'expected', 'false|1', 'actual', v_txt, 'pass', v_txt = 'false|1');

  -- 21 --------------------------------------------------------------- an event keyed by a token hash
  begin
    insert into app.organizations (id, name, org_number, employee_count) values (v_org, 'Brannmur AS', '999001421', 8);
    insert into app.employees (org_id, full_name, email) values (v_org, 'Ansatt', 'ansatt@gfw-probe.no');
    insert into app.measurements (org_id, kind, year, label) values (v_org, 'grunnlinje', 2026, 'Probe') returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'apen', now() - interval '1 day', now() + interval '10 days') returning id into v_round;
    insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at)
    select v_org, v_round, e.id, extensions.digest('gfw-t' || e.id::text, 'sha256'), now() + interval '10 days'
    from app.employees e where e.org_id = v_org;
    select pass::text into v_txt from app.growth_firewall() where rule = 'no_event_names_a_respondent';
    insert into app.growth_events (name, occurred_at, org_id, props, source, dedupe_key)
    select 'survey.created', now(), v_org, '{}', 'trigger', encode(i.token_hash, 'hex') from app.invitations i where i.round_id = v_round;
    select v_txt || '|' || pass::text || '|' || (evidence->>'flagged') into v_txt from app.growth_firewall() where rule = 'no_event_names_a_respondent';
    raise exception 'rollback';
  exception when others then if sqlerrm <> 'rollback' then raise; end if;
  end;
  v_rows := v_rows || jsonb_build_object('seq', 21, 'name', 'an event keyed by an invitation''s token hash turns no_event_names_a_respondent false',
    'expected', 'true|false|1', 'actual', v_txt, 'pass', v_txt = 'true|false|1');

  -- 13 --------------------------------------------------------------- nothing left
  select concat_ws('|',
    (select string_agg(rule || ':' || case when pass then 't' else 'f' end, ',' order by seq) from app.growth_firewall()) = v_all,
    to_regclass('app.crm_probe_link') is null and to_regclass('app.crm_probe_thread') is null,
    to_regprocedure('app.growth_probe_on_response()') is null and to_regprocedure('app.probe_on_resp()') is null
      and to_regprocedure('app.probe_chk(int)') is null and to_regprocedure('app.probe_on_inv()') is null
      and to_regprocedure('app.probe_default()') is null and to_regprocedure('app.probe_imm(int)') is null
      and not exists (select 1 from pg_roles where rolname in ('zz_analytics_reader', 'zz_dashboard'))
      and not exists (select 1 from pg_rewrite where rulename = 'zz_resp_rule')
      and not exists (select 1 from pg_policy where polname = 'zz_pol')
      and not exists (select 1 from pg_attribute where attrelid = 'app.extra_answers'::regclass and attname = 'zz_ev' and not attisdropped),
    has_table_privilege('service_role', 'app.answers', 'select') or has_any_column_privilege('service_role', 'app.responses', 'select')
      or has_any_column_privilege('anon', 'app.growth_events', 'select'),
    (select count(*) from app.organizations where id = v_org) + (select count(*) from auth.users where id = v_user)
      + (select count(*) from app.crm_contacts where email like '%@gfw-probe.no'))
    into v_txt;
  v_rows := v_rows || jsonb_build_object('seq', 13, 'name', 'every probe was rolled back: every rule passes, no probe object, grant or row is left',
    'expected', 't|t|t|f|0', 'actual', v_txt, 'pass', v_txt = 't|t|t|f|0');

  insert into public._gfw
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._gfw order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._gfw;
  if v_failed is not null then raise exception 'growth firewall invariants failed: %', v_failed; end if;
  if v_count <> 21 then raise exception 'growth firewall invariants: expected 21 rows, got %', v_count; end if;
end $$;
