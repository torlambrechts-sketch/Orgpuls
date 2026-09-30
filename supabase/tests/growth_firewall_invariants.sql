-- growth_firewall_invariants.sql — the anonymity firewall (0141, D-182; plan § 3), proved against the
-- live schema: every rule of app.growth_firewall() passes, and each one turns false when the thing it
-- guards is broken, in a probe that is rolled back.
--
--   * every rule passes now (1)
--   * a foreign key from a CRM table to invitations fails no_link_to_respondents (2)
--   * a catalogue prop that could carry a respondent fails catalogue_has_no_respondent_props (3)
--   * a grant on an answer table to the service role fails no_role_reads_answers (4)
--   * a contact who is an employee and no account fails no_employee_is_a_contact; the same address
--     held by a member passes (5)
--   * an event keyed by an invitation fails no_event_names_a_respondent (6)
--   * a growth trigger on responses fails nothing_attached_to_answers (7)
--   * a client grant on the stream fails growth_tables_closed (8)
--   * the firewall is not a client's to call, and holds no hard-coded answer: it reads the catalog (9)
--   * nothing written here survives: every rule passes again, no probe object is left (10)
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
  v_rows  jsonb := '[]';
begin
  -- 1 ---------------------------------------------------------------- every rule passes
  select string_agg(rule || ':' || case when pass then 't' else 'f' end, ',' order by seq) into v_txt from app.growth_firewall();
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'every firewall rule passes', 'expected', v_all, 'actual', v_txt, 'pass', v_txt = v_all);

  -- 2 ---------------------------------------------------------------- a link to a respondent table
  begin
    create table app.crm_probe_link (id uuid primary key, invitation_id uuid references app.invitations (id));
    select pass::text || '|' || (evidence like '%crm_probe_link%')::text into v_txt from app.growth_firewall() where rule = 'no_link_to_respondents';
    raise exception 'rollback';
  exception when others then if sqlerrm <> 'rollback' then raise; end if;
  end;
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'a foreign key from a CRM table to invitations turns no_link_to_respondents false, and is named',
    'expected', 'false|true', 'actual', v_txt, 'pass', v_txt = 'false|true');

  -- 3 ---------------------------------------------------------------- a respondent prop in the catalogue
  -- the catalogue's own check refuses it first; the probe removes that check to prove the firewall
  -- would still see it
  begin
    alter table app.event_catalogue drop constraint event_catalogue_props_ok;
    update app.event_catalogue set allowed_props = allowed_props || 'respondent_id'::text where name = 'survey.sent';
    select pass::text || '|' || (evidence like '%survey.sent respondent_id%')::text into v_txt
    from app.growth_firewall() where rule = 'catalogue_has_no_respondent_props';
    raise exception 'rollback';
  exception when others then if sqlerrm <> 'rollback' then raise; end if;
  end;
  v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'a catalogue prop that could carry a respondent turns catalogue_has_no_respondent_props false',
    'expected', 'false|true', 'actual', v_txt, 'pass', v_txt = 'false|true');

  -- 4 ---------------------------------------------------------------- a grant on an answer table
  begin
    grant select on app.answers to service_role;
    select pass::text || '|' || (evidence like '%service_role on answers%')::text into v_txt from app.growth_firewall() where rule = 'no_role_reads_answers';
    raise exception 'rollback';
  exception when others then if sqlerrm <> 'rollback' then raise; end if;
  end;
  v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'a grant on answers to the service role turns no_role_reads_answers false',
    'expected', 'false|true', 'actual', v_txt, 'pass', v_txt = 'false|true');

  -- 5 ---------------------------------------------------------------- an employee as a contact
  begin
    insert into app.organizations (id, name, org_number, employee_count) values (v_org, 'Brannmur AS', '999001421', 8);
    insert into app.employees (org_id, full_name, email) values (v_org, 'Ansatt', 'ansatt@gfw-probe.no');
    insert into app.crm_contacts (email, source, basis, status) values ('ansatt@gfw-probe.no', 'manual', 'none', 'active');
    select pass::text || '|' || evidence into v_txt from app.growth_firewall() where rule = 'no_employee_is_a_contact';
    -- the same person, who is also an account in the organisation: a contact as every account is
    insert into auth.users (id, email) values (v_user, 'ansatt@gfw-probe.no');
    insert into app.profiles (id, full_name) values (v_user, 'Ansatt');
    insert into app.memberships (org_id, user_id, role) values (v_org, v_user, 'verneombud');
    select v_txt || '|' || pass::text into v_txt from app.growth_firewall() where rule = 'no_employee_is_a_contact';
    raise exception 'rollback';
  exception when others then if sqlerrm <> 'rollback' then raise; end if;
  end;
  v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'a contact who is an employee and no account turns no_employee_is_a_contact false (a count, no address); a member''s address passes',
    'expected', 'false|1 contacts share an address with an employee who is not an account|true', 'actual', v_txt,
    'pass', v_txt = 'false|1 contacts share an address with an employee who is not an account|true');

  -- 6 ---------------------------------------------------------------- an event keyed by an invitation
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
  v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'an event keyed by an invitation''s id turns no_event_names_a_respondent false',
    'expected', 'true|false', 'actual', v_txt, 'pass', v_txt = 'true|false');

  -- 7 ---------------------------------------------------------------- a growth trigger on responses
  begin
    create function app.growth_probe_on_response() returns trigger language plpgsql set search_path = ''
      as $f$ begin return null; end $f$;
    create trigger growth_probe after insert on app.responses for each row execute function app.growth_probe_on_response();
    select pass::text || '|' || (evidence like '%growth_probe%')::text into v_txt from app.growth_firewall() where rule = 'nothing_attached_to_answers';
    raise exception 'rollback';
  exception when others then if sqlerrm <> 'rollback' then raise; end if;
  end;
  v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'a growth trigger on responses turns nothing_attached_to_answers false',
    'expected', 'false|true', 'actual', v_txt, 'pass', v_txt = 'false|true');

  -- 8 ---------------------------------------------------------------- a client grant on the stream
  begin
    grant select on app.growth_events to authenticated;
    select pass::text || '|' || (evidence like '%open: growth_events%')::text into v_txt from app.growth_firewall() where rule = 'growth_tables_closed';
    raise exception 'rollback';
  exception when others then if sqlerrm <> 'rollback' then raise; end if;
  end;
  v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'a client grant on growth_events turns growth_tables_closed false',
    'expected', 'false|true', 'actual', v_txt, 'pass', v_txt = 'false|true');

  -- 9 ---------------------------------------------------------------- not a client's, and computed
  select concat_ws('|',
    has_function_privilege('authenticated', 'app.growth_firewall()', 'execute'),
    has_function_privilege('anon', 'app.growth_firewall()', 'execute'),
    (select p.prosrc ~ 'pg_constraint' and p.prosrc ~ 'has_table_privilege' and p.prosrc ~ 'pg_trigger'
     from pg_proc p where p.oid = 'app.growth_firewall()'::regprocedure),
    (select count(*) from app.growth_firewall()))
    into v_txt;
  v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'no client may call the firewall; it reads the catalog; seven rules',
    'expected', 'f|f|t|7', 'actual', v_txt, 'pass', v_txt = 'f|f|t|7');

  -- 10 --------------------------------------------------------------- nothing left
  select concat_ws('|',
    (select string_agg(rule || ':' || case when pass then 't' else 'f' end, ',' order by seq) from app.growth_firewall()) = v_all,
    to_regclass('app.crm_probe_link') is null,
    to_regprocedure('app.growth_probe_on_response()') is null,
    has_table_privilege('service_role', 'app.answers', 'select'),
    (select count(*) from app.organizations where id = v_org) + (select count(*) from auth.users where id = v_user)
      + (select count(*) from app.crm_contacts where email like '%@gfw-probe.no'))
    into v_txt;
  v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'every probe was rolled back: every rule passes, no probe object or row is left',
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
  if v_count <> 10 then raise exception 'growth firewall invariants: expected 10 rows, got %', v_count; end if;
end $$;
