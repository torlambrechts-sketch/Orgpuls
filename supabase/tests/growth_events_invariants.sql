-- growth_events_invariants.sql — the event catalogue and the org-level event stream (0141, D-182),
-- proved against the live schema.
--
--   * the catalogue and the stream: RLS on, no policy, no client grant, no public function (1)
--   * the stream refuses a prop the catalogue does not allow, a count, an id, a person on an
--     org-level event, an organisation on a contact event and an event not in the catalogue (2)
--   * the catalogue refuses a prop that could carry a respondent; a band is allowed (3)
--   * the product's own writes emit their events, each with its catalogue's props (4)
--   * survey.sent carries a band, never how many below five, and no event anywhere carries a bare
--     number (5)
--   * survey.threshold_reached comes from the hourly tick's counts once the threshold is met, with
--     the hour truncated, once (6)
--   * nothing is attached to responses, answers, extra_answers or response_comments (7)
--   * no event row references a respondent, an invitation or an employee (8)
--   * a demo emits nothing, and takes back what it emitted before it was marked (9)
--   * an organisation's events go with it; an event is never edited (10)
--   * the Event catalogue page's read: for super_admin, analyst and marketing with a second factor
--     only; the catalogue with 7-day counts, the health score's parts, customers lowest first
--     (no demo), the firewall's seven rules (11)
--   * nothing written here survives (12)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/growth_events_invariants.sql

create unlogged table if not exists public._gev(seq int, name text, expected text, actual text, pass bool);
truncate public._gev;

do $$
declare
  v_org   uuid := '00000000-0000-4000-8000-0000000e1a01';
  v_gone  uuid := '00000000-0000-4000-8000-0000000e1a02';
  v_demo  uuid := '00000000-0000-4000-8000-0000000e1a03';
  v_dl    uuid := '00000000-0000-4000-8000-0000000e1b01';
  v_mkt   uuid := '00000000-0000-4000-8000-0000000e1b02';
  v_sup   uuid := '00000000-0000-4000-8000-0000000e1b03';
  v_json  jsonb;
  claims  constant text := '{"sub":"%s","role":"authenticated","aal":"%s"}';
  v_meas  uuid;
  v_small uuid;
  v_big   uuid;
  v_emp   uuid;
  v_inv   uuid;
  v_txt   text;
  v_i     int;
  v_rows  jsonb := '[]';
  v_bands constant text[] := array['under_5', '5_9', '10_24', '25_49', '50_99', '100_249', '250_plus'];
begin
  -- 1 ---------------------------------------------------------------- closed to clients
  select string_agg(format('%s:%s/%s/%s', c.relname, c.relrowsecurity,
           (select count(*) from pg_policies p where p.schemaname = 'app' and p.tablename = c.relname),
           (has_table_privilege('authenticated', c.oid, 'select') or has_table_privilege('anon', c.oid, 'select'))), ' ' order by c.relname)
    || '|' || (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname ~ '^(growth|consent|health)')
    into v_txt
  from pg_class c where c.relnamespace = 'app'::regnamespace and c.relname in ('event_catalogue', 'growth_events');
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'the catalogue and the stream: RLS on, no policy, no client grant, no public function',
    'expected', 'event_catalogue:t/0/f growth_events:t/0/f|0', 'actual', v_txt,
    'pass', v_txt = 'event_catalogue:t/0/f growth_events:t/0/f|0');

  begin
    insert into app.organizations (id, name, org_number, employee_count)
    values (v_org, 'Hendelser AS', '999001411', 12);

    -- 2 -------------------------------------------------------------- the stream refuses
    v_txt := '';
    begin
      insert into app.growth_events (name, occurred_at, org_id, props, source) values ('org.created', now(), v_org, '{"channel":"x"}', 'trigger');
      v_txt := v_txt || 'accepted';
    exception when check_violation then v_txt := v_txt || 'refused'; end;
    begin
      insert into app.growth_events (name, occurred_at, org_id, props, source) values ('employees.imported', now(), v_org, '{"employee_count_band":3}', 'trigger');
      v_txt := v_txt || ',accepted';
    exception when check_violation then v_txt := v_txt || ',refused'; end;
    begin
      insert into app.growth_events (name, occurred_at, org_id, props, source)
      values ('stakeholder.invited', now(), v_org, jsonb_build_object('role', gen_random_uuid()::text), 'trigger');
      v_txt := v_txt || ',accepted';
    exception when check_violation then v_txt := v_txt || ',refused'; end;
    insert into auth.users (id, email) values (v_dl, 'dl@gev-probe.no');
    begin
      insert into app.growth_events (name, occurred_at, org_id, user_id, props, source) values ('org.created', now(), v_org, v_dl, '{}', 'trigger');
      v_txt := v_txt || ',accepted';
    exception when check_violation then v_txt := v_txt || ',refused'; end;
    begin
      insert into app.growth_events (name, occurred_at, org_id, props, source) values ('lead.hand_raised', now(), v_org, '{"channel":"demo"}', 'trigger');
      v_txt := v_txt || ',accepted';
    exception when check_violation then v_txt := v_txt || ',refused'; end;
    begin
      insert into app.growth_events (name, occurred_at, props, source) values ('response.submitted', now(), '{}', 'trigger');
      v_txt := v_txt || ',accepted';
    exception when check_violation or foreign_key_violation then v_txt := v_txt || ',refused'; end;
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'the stream refuses a prop not in the catalogue, a count, an id, a person, an organisation on a contact event, an unknown event',
      'expected', 'refused,refused,refused,refused,refused,refused', 'actual', v_txt, 'pass', v_txt = 'refused,refused,refused,refused,refused,refused');

    -- 3 -------------------------------------------------------------- the catalogue refuses a respondent prop
    v_txt := '';
    for v_i in 1..6 loop
      begin
        update app.event_catalogue set allowed_props = allowed_props ||
          (array['respondent_id', 'invitation_token', 'employee_email', 'response_id', 'answer', 'full_name'])[v_i]
        where name = 'survey.sent';
        v_txt := v_txt || 'a';
      exception when check_violation then v_txt := v_txt || 'r'; end;
    end loop;
    begin
      update app.event_catalogue set allowed_props = allowed_props || 'response_count_band'::text where name = 'survey.sent';
      v_txt := v_txt || '|band allowed';
    exception when check_violation then v_txt := v_txt || '|band refused'; end;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'the catalogue refuses a prop that could carry a respondent; a band is an aggregate',
      'expected', 'rrrrrr|band allowed', 'actual', v_txt, 'pass', v_txt = 'rrrrrr|band allowed');

    -- 4 -------------------------------------------------------------- the product's writes emit
    insert into app.profiles (id, full_name) values (v_dl, 'Dina');
    insert into app.memberships (org_id, user_id, role) values (v_org, v_dl, 'daglig_leder');
    insert into app.member_invites (org_id, email, role, token_hash, expires_at)
    values (v_org, 'vo@gev-probe.no', 'verneombud', extensions.digest('gev-invite', 'sha256'), now() + interval '1 day');
    insert into app.measurements (org_id, kind, year, label) values (v_org, 'grunnlinje', 2026, 'Probe') returning id into v_meas;
    insert into app.measures (org_id, factor_key, title) values (v_org, 'kontakt', 'Probe-tiltak');
    insert into app.tickets (category, queue, channel, subject, requester_email, org_id, user_id)
    values ('bug', 'support', 'in_app', 'Probe', 'dl@gev-probe.no', v_org, v_dl);
    insert into app.tickets (category, queue, channel, subject, requester_email)
    values ('results_anonymity', 'support', 'contact_form', 'Probe', 'someone@gev-probe.no');
    insert into app.product_events (org_id, user_id, role, name) values (v_org, v_dl, 'daglig_leder', 'results_viewed');
    update app.billing set trial_extended_at = now(), trial_ends_at = trial_ends_at + interval '7 days' where org_id = v_org;
    update app.billing set confirmed_at = now(), plan = 'small', invoice_email = 'faktura@gev-probe.no' where org_id = v_org;
    insert into app.employees (org_id, full_name, email) select v_org, 'Ansatt ' || g, 'a' || g || '@gev-probe.no' from generate_series(1, 3) g;
    insert into app.employees (org_id, full_name, email) select v_org, 'Ansatt ' || g, 'a' || g || '@gev-probe.no' from generate_series(4, 15) g;
    select string_agg(name || coalesce(' ' || (select string_agg(k || '=' || (props->>k), ',' order by k) from jsonb_object_keys(props) k), '')
                      || case when user_id is not null then ' +user' else '' end, '; ' order by name, props::text)
      into v_txt
    from app.growth_events where org_id = v_org;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'the product''s writes emit their events, with the catalogue''s props (a contact-form question from someone without an account emits none)',
      'expected', 'action_item.created measure_kind=kollektivt; employees.imported employee_count_band=10_24; employees.imported employee_count_band=under_5; org.created; results.viewed role=daglig_leder,view=results +user; stakeholder.invited role=verneombud; subscription.started plan=small; survey.created measurement_kind=grunnlinje; ticket.created category=bug,channel=in_app,priority=normal; trial.extended; user.signed_up role=daglig_leder +user',
      'actual', v_txt,
      'pass', v_txt = 'action_item.created measure_kind=kollektivt; employees.imported employee_count_band=10_24; employees.imported employee_count_band=under_5; org.created; results.viewed role=daglig_leder,view=results +user; stakeholder.invited role=verneombud; subscription.started plan=small; survey.created measurement_kind=grunnlinje; ticket.created category=bug,channel=in_app,priority=normal; trial.extended; user.signed_up role=daglig_leder +user');

    -- 5 -------------------------------------------------------------- survey.sent: a band
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'apen', now() - interval '1 day', now() + interval '10 days') returning id into v_small;
    insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at)
    select v_org, v_small, e.id, extensions.digest('gev-s' || e.id::text, 'sha256'), now() + interval '10 days'
    from app.employees e where e.org_id = v_org order by e.full_name limit 3;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'apen', now() - interval '2 days', now() + interval '10 days') returning id into v_big;
    insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at)
    select v_org, v_big, e.id, extensions.digest('gev-b' || e.id::text, 'sha256'), now() + interval '10 days'
    from app.employees e where e.org_id = v_org;
    perform app.growth_tick();
    select concat_ws('|',
      (select props->>'recipient_count_band' from app.growth_events where name = 'survey.sent' and dedupe_key = v_small::text),
      (select props->>'recipient_count_band' from app.growth_events where name = 'survey.sent' and dedupe_key = v_big::text),
      (select count(*) from app.growth_events where name = 'survey.sent'
         and not (coalesce(props->>'recipient_count_band', '') = any (v_bands))),
      (select count(*) from app.growth_events g, jsonb_each_text(g.props) p where p.value ~ '^[0-9]+$'))
      into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'survey.sent carries a band (3 recipients: under_5, 15: 10_24); no survey.sent without one; no bare number anywhere',
      'expected', 'under_5|10_24|0|0', 'actual', v_txt, 'pass', v_txt = 'under_5|10_24|0|0');

    -- 6 -------------------------------------------------------------- the threshold, from counts, hourly
    for v_i in 1..4 loop
      insert into app.responses (org_id, round_id, group_id, submitted_hour) values (v_org, v_big, null, date_trunc('hour', now()));
    end loop;
    perform app.growth_tick();
    v_txt := (select count(*) from app.growth_events where name = 'survey.threshold_reached' and dedupe_key = v_big::text)::text;
    insert into app.responses (org_id, round_id, group_id, submitted_hour) values (v_org, v_big, null, date_trunc('hour', now()));
    perform app.growth_tick();
    perform app.growth_tick();
    select v_txt || '|' || count(*) || '|' || min(props->>'response_rate_band') || '|' || bool_and(occurred_at = date_trunc('hour', occurred_at))
           || '|' || min(source)
      into v_txt
    from app.growth_events where name = 'survey.threshold_reached' and dedupe_key = v_big::text;
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'survey.threshold_reached: none at 4 of 15, one at 5 (25_49), from the tick, the hour truncated, once',
      'expected', '0|1|25_49|true|tick', 'actual', v_txt, 'pass', v_txt = '0|1|25_49|true|tick');

    -- 7 -------------------------------------------------------------- nothing on the answer tables
    select count(*)::text || '|' || (select pass::text from app.growth_firewall() where rule = 'nothing_attached_to_answers')
      into v_txt
    from pg_trigger t join pg_proc p on p.oid = t.tgfoid
    where not t.tgisinternal
      and t.tgrelid in ('app.responses'::regclass, 'app.answers'::regclass, 'app.extra_answers'::regclass, 'app.response_comments'::regclass)
      and (p.proname ~ '(growth|consent)' or p.prosrc ~ '(growth_|consent_)');
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'no trigger on responses, answers, extra_answers or response_comments reaches the stream',
      'expected', '0|true', 'actual', v_txt, 'pass', v_txt = '0|true');

    -- 8 -------------------------------------------------------------- no event names a respondent
    select id into v_emp from app.employees where org_id = v_org order by full_name limit 1;
    select id into v_inv from app.invitations where round_id = v_big limit 1;
    select concat_ws('|',
      (select count(*) from app.growth_events g where g.dedupe_key like '%' || v_emp::text || '%' or g.dedupe_key like '%' || v_inv::text || '%'
         or g.props::text like '%gev-probe.no%'),
      (select count(*) from app.growth_events g where exists (select 1 from app.responses r where g.dedupe_key like '%' || r.id::text || '%')),
      (select pass::text from app.growth_firewall() where rule = 'no_event_names_a_respondent'))
      into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'no event row references a respondent, an invitation or an employee (and the firewall agrees)',
      'expected', '0|0|true', 'actual', v_txt, 'pass', v_txt = '0|0|true');

    -- 9 -------------------------------------------------------------- a demo emits nothing
    insert into app.organizations (id, name, org_number, employee_count) values (v_demo, 'Demo AS', '999001413', 12);
    v_txt := (select count(*) from app.growth_events where org_id = v_demo)::text;
    insert into app.demo_orgs (org_id, kind) values (v_demo, 'sandbox');
    insert into app.measurements (org_id, kind, year, label) values (v_demo, 'grunnlinje', 2026, 'Demo');
    v_txt := v_txt || '|' || (select count(*) from app.growth_events where org_id = v_demo);
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'a demo takes back its org.created when marked, and emits nothing after',
      'expected', '1|0', 'actual', v_txt, 'pass', v_txt = '1|0');

    -- 10 ------------------------------------------------------------- events go with their organisation; never edited
    insert into app.organizations (id, name, org_number, employee_count) values (v_gone, 'Borte AS', '999001412', 5);
    v_txt := (select count(*) from app.growth_events where org_id = v_gone)::text;
    begin
      update app.growth_events set props = '{}' where org_id = v_org and name = 'stakeholder.invited';
      v_txt := v_txt || '|edited';
    exception when check_violation then v_txt := v_txt || '|refused'; end;
    delete from app.organizations where id = v_gone;
    v_txt := v_txt || '|' || (select count(*) from app.growth_events where dedupe_key = v_gone::text);
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'an event is never edited; an organisation''s events go with it',
      'expected', '1|refused|0', 'actual', v_txt, 'pass', v_txt = '1|refused|0');

    -- 11 ------------------------------------------------------------- the page's read
    insert into auth.users (id, email) values (v_mkt, 'mkt@gev-probe.no'), (v_sup, 'sup@gev-probe.no');
    insert into app.platform_admins (user_id, role) values (v_mkt, 'marketing'), (v_sup, 'support');
    perform set_config('request.jwt.claims', format(claims, v_sup, 'aal2'), true);
    v_txt := public.admin_growth_events()->>'error';
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal1'), true);
    v_txt := v_txt || '|' || (public.admin_growth_events()->>'error');
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal2'), true);
    v_json := public.admin_growth_events();
    perform set_config('request.jwt.claims', '', true);
    v_txt := concat_ws('|', v_txt, v_json->>'ok',
      jsonb_array_length(v_json->'events') = (select count(*) from app.event_catalogue),
      (select sum((p->>'max')::int) from jsonb_array_elements(v_json->'parts') p),
      (select (e->>'n7')::int >= 1 from jsonb_array_elements(v_json->'events') e where e->>'name' = 'stakeholder.invited'),
      exists (select 1 from jsonb_array_elements(v_json->'health') h where (h->>'org_id')::uuid = v_org),
      not exists (select 1 from jsonb_array_elements(v_json->'health') h where app.is_demo((h->>'org_id')::uuid)),
      (select bool_and((a->>'total')::int <= (b->>'total')::int) from jsonb_array_elements(v_json->'health') with ordinality x(a, i)
         join jsonb_array_elements(v_json->'health') with ordinality y(b, j) on j = i + 1),
      jsonb_array_length(v_json->'firewall'),
      has_function_privilege('anon', 'public.admin_growth_events()', 'execute'),
      (select count(*) from app.admin_audit where admin_id = v_mkt and action = 'growth.events_view'));
    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'the page''s read: marketing with a second factor, not support or aal1 or anon; catalogue, parts, customers lowest first without demos, seven rules, audited',
      'expected', 'not_allowed|not_allowed|true|t|100|t|t|t|t|7|f|1', 'actual', v_txt,
      'pass', v_txt = 'not_allowed|not_allowed|true|t|100|t|t|t|t|7|f|1');

    raise exception 'rollback';
  exception when others then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 12 --------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id::text from auth.users where email like '%@gev-probe.no'
    union all select id::text from app.organizations where id in (v_org, v_gone, v_demo)
    union all select id::text from app.growth_events where org_id in (v_org, v_gone, v_demo)
    union all select name from app.event_catalogue where 'response_count_band' = any (allowed_props)) x;
  v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._gev
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._gev order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._gev;
  if v_failed is not null then raise exception 'growth events invariants failed: %', v_failed; end if;
  if v_count <> 12 then raise exception 'growth events invariants: expected 12 rows, got %', v_count; end if;
end $$;
