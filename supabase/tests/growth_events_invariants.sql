-- growth_events_invariants.sql — the event catalogue and the org-level event stream (0141, D-182),
-- proved against the live schema.
--
--   * the catalogue and the stream: RLS on, no policy, no client grant, no public function (1)
--   * the stream refuses a prop the catalogue does not allow, a count (a JSON number, a numeric
--     string, a band value outside its vocabulary), an id, a person on an org-level event, an
--     organisation on a contact event and an event not in the catalogue (2)
--   * the catalogue refuses a prop that could carry a respondent or an exact count; a band is
--     allowed (3)
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
--     only; the catalogue with 7-day counts, the health score's parts (NPS marked as having no
--     source, the reachable 90, and never a customer's shortfall), customers lowest first (no
--     demo), the firewall's seven rules (11)
--   * the other paths emit too: a registry fetch, a planned round, the customer's and Sentral's
--     trial extensions, a trial that runs out with and without a plan, a tier change, a
--     cancellation, a demo request and a sales question — a hand-raise without key or exact time (12)
--   * every catalogue event has an emitter: each was emitted by this suite, and each is named by a
--     trigger or the tick (13)
--   * nothing written here survives (14)
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
  v_trial uuid := '00000000-0000-4000-8000-0000000e1a04';
  v_conf  uuid := '00000000-0000-4000-8000-0000000e1a05';
  v_late  uuid := '00000000-0000-4000-8000-0000000e1a06';
  v_meas2 uuid;
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
    -- a count as a string: in a band prop, outside its vocabulary, and in any other prop
    begin
      insert into app.growth_events (name, occurred_at, org_id, props, source) values ('survey.sent', now(), v_org, '{"recipient_count_band":"3"}', 'trigger');
      v_txt := v_txt || ',accepted';
    exception when check_violation then v_txt := v_txt || ',refused'; end;
    begin
      insert into app.growth_events (name, occurred_at, org_id, props, source) values ('survey.threshold_reached', now(), v_org, '{"response_rate_band":"under_5"}', 'trigger');
      v_txt := v_txt || ',accepted';
    exception when check_violation then v_txt := v_txt || ',refused'; end;
    begin
      insert into app.growth_events (name, occurred_at, org_id, props, source) values ('survey.created', now(), v_org, '{"measurement_kind":"42"}', 'trigger');
      v_txt := v_txt || ',accepted';
    exception when check_violation then v_txt := v_txt || ',refused'; end;
    -- and the same shapes where they belong: a count band, a rate band, a keyword
    insert into app.growth_events (name, occurred_at, org_id, props, source) values
      ('survey.sent', now(), v_org, '{"recipient_count_band":"25_49"}', 'trigger'),
      ('survey.threshold_reached', now(), v_org, '{"response_rate_band":"25_49"}', 'trigger'),
      ('survey.created', now(), v_org, '{"measurement_kind":"puls"}', 'trigger');
    delete from app.growth_events where org_id = v_org and name in ('survey.sent', 'survey.threshold_reached', 'survey.created');
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'the stream refuses a prop not in the catalogue, a count (number, numeric string, a band outside its vocabulary), an id, a person, an organisation on a contact event, an unknown event',
      'expected', 'refused,refused,refused,refused,refused,refused,refused,refused,refused', 'actual', v_txt,
      'pass', v_txt = 'refused,refused,refused,refused,refused,refused,refused,refused,refused');

    -- 3 -------------------------------------------------------------- the catalogue refuses a respondent prop
    v_txt := '';
    for v_i in 1..7 loop
      begin
        update app.event_catalogue set allowed_props = allowed_props ||
          (array['respondent_id', 'invitation_token', 'employee_email', 'response_id', 'answer', 'full_name', 'recipient_count'])[v_i]
        where name = 'survey.sent';
        v_txt := v_txt || 'a';
      exception when check_violation then v_txt := v_txt || 'r'; end;
    end loop;
    begin
      update app.event_catalogue set allowed_props = allowed_props || 'response_count_band'::text where name = 'survey.sent';
      v_txt := v_txt || '|band allowed';
    exception when check_violation then v_txt := v_txt || '|band refused'; end;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'the catalogue refuses a prop that could carry a respondent or an exact count; a band is an aggregate',
      'expected', 'rrrrrrr|band allowed', 'actual', v_txt, 'pass', v_txt = 'rrrrrrr|band allowed');

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
      (select count(*) from app.admin_audit where admin_id = v_mkt and action = 'growth.events_view'),
      -- NPS: marked as having no source, the reachable maximum 90, and no customer's shortfall
      (select string_agg(p->>'key', ',') from jsonb_array_elements(v_json->'parts') p where (p->>'no_source')::boolean),
      v_json->>'reachable',
      not exists (select 1 from jsonb_array_elements(v_json->'health') h where h->'missing' ? 'nps'),
      (select bool_and(jsonb_typeof(f->'evidence') = 'object') from jsonb_array_elements(v_json->'firewall') f));
    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'the page''s read: marketing with a second factor, not support or aal1 or anon; catalogue, parts, customers lowest first without demos, seven rules with structured evidence, audited; NPS has no source, 90 is reachable, and NPS is no one''s shortfall',
      'expected', 'not_allowed|not_allowed|true|t|100|t|t|t|t|7|f|1|nps|90|t|t', 'actual', v_txt,
      'pass', v_txt = 'not_allowed|not_allowed|true|t|100|t|t|t|t|7|f|1|nps|90|t|t');

    -- 12 ------------------------------------------------------------- every other path
    insert into app.organizations (id, name, org_number, employee_count) values
      (v_trial, 'Prøve AS', '999001414', 12), (v_conf, 'Kunde AS', '999001415', 12), (v_late, 'Sein AS', '999001416', 12);
    update app.organizations set registry_fetched_at = now() where id = v_trial;
    insert into app.measurements (org_id, kind, year, label) values (v_trial, 'grunnlinje', 2026, 'Plan') returning id into v_meas2;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_trial, v_meas2, 'planlagt', now() + interval '20 days', now() + interval '34 days');
    -- the customer's own extension (0048), then Sentral's (0049, which leaves trial_extended_at alone)
    insert into app.memberships (org_id, user_id, role) values (v_trial, v_dl, 'daglig_leder');
    perform set_config('request.jwt.claims', format(claims, v_dl, 'aal2'), true);
    v_txt := public.extend_trial(v_trial)->>'ok';
    perform set_config('request.jwt.claims', format(claims, v_sup, 'aal2'), true);
    v_txt := v_txt || '|' || (public.admin_extend_trial(v_trial, 7, 'Asked for another week')->>'ok');
    perform set_config('request.jwt.claims', '', true);
    -- the trial runs out: with no plan (v_trial), with one confirmed after it ended (v_late), with one
    -- confirmed long before (v_conf, which then changes tier and cancels)
    update app.billing set trial_started_at = now() - interval '30 days', trial_ends_at = now() - interval '1 day'
    where org_id in (v_trial, v_conf, v_late);
    update app.billing set confirmed_at = now() - interval '10 days', plan = 'small', invoice_email = 'faktura@gev-probe.no' where org_id = v_conf;
    update app.billing set confirmed_at = now(), plan = 'small', invoice_email = 'faktura@gev-probe.no' where org_id = v_late;
    perform app.growth_tick();
    update app.billing set plan = 'usual' where org_id = v_conf;
    update app.billing set cancelled_at = now(), cancel_source = 'customer', cancel_effective_at = now() + interval '1 month',
                           deletion_due_at = now() + interval '1 month 30 days'
    where org_id = v_conf;
    -- the hand-raises: a demo request, and a sales question from the contact form
    insert into app.demo_requests (email, domain, network, consent, lang) values ('lead@gev-probe.no', 'gev-probe.no', md5('gev-probe'), false, 'no');
    insert into app.tickets (category, queue, channel, subject, requester_email) values ('sales', 'sales', 'contact_form', 'Probe', 'buyer@gev-probe.no');
    select v_txt || '|' || string_agg(x.who || ' ' || x.names, '; ' order by x.who) into v_txt
    from (select case g.org_id when v_trial then 'trial' when v_conf then 'conf' else 'late' end as who,
                 string_agg(g.name || coalesce('=' || (select string_agg(p.value, ',' order by p.key) from jsonb_each_text(g.props) p), ''), ',' order by g.name, g.props::text) as names
          from app.growth_events g where g.org_id in (v_trial, v_conf, v_late) group by g.org_id) x;
    select v_txt || '|' || string_agg((g.props->>'channel') || ':' || coalesce(g.dedupe_key, '-') || ':' || (g.occurred_at = date_trunc('hour', g.occurred_at)),
                                      ',' order by g.props->>'channel')
      into v_txt
    from app.growth_events g where g.name = 'lead.hand_raised' and g.created_at = now();
    v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'a registry fetch, a planned round, both trial extensions, trials that run out (without a plan, with one after, not with one before), a tier change, a cancellation, a demo request and a sales question each emit; a hand-raise carries no key and no exact time',
      'expected', 'true|true|conf org.created,subscription.cancelled=customer,subscription.started=small,subscription.tier_changed=usual; '
                  'late org.created,subscription.started=small,trial.expired,trial.expiring; '
                  'trial org.brreg_verified,org.created,survey.created=grunnlinje,survey.scheduled=grunnlinje,trial.expired,trial.expiring,trial.extended,trial.extended'
                  '|contact_form:-:true,demo:-:true',
      'actual', v_txt,
      'pass', v_txt = 'true|true|conf org.created,subscription.cancelled=customer,subscription.started=small,subscription.tier_changed=usual; '
                      'late org.created,subscription.started=small,trial.expired,trial.expiring; '
                      'trial org.brreg_verified,org.created,survey.created=grunnlinje,survey.scheduled=grunnlinje,trial.expired,trial.expiring,trial.extended,trial.extended'
                      '|contact_form:-:true,demo:-:true');

    -- 13 ------------------------------------------------------------- every catalogue event has an emitter
    -- the consent events: a contact who consents, then withdraws (the ledger's deferred triggers)
    insert into app.crm_contacts (email, source, basis, status, consent_at, consent_source)
    values ('samtykke@gev-probe.no', 'manual', 'consent', 'active', now(), 'Probe form at a fair');
    set constraints all immediate; set constraints all deferred;
    update app.crm_contacts set status = 'unsubscribed' where email = 'samtykke@gev-probe.no';
    set constraints all immediate; set constraints all deferred;
    select concat_ws('|',
      (select coalesce(string_agg(e.name, ',' order by e.sort), 'none') from app.event_catalogue e
       where not exists (select 1 from app.growth_events g where g.name = e.name and g.created_at = now())),
      (select coalesce(string_agg(e.name, ',' order by e.sort), 'none') from app.event_catalogue e
       where not exists (select 1 from pg_proc p
                         where p.pronamespace = 'app'::regnamespace and p.proname ~ '^(growth_on_[a-z_]+|growth_tick|consent_event)$'
                           and p.prosrc like '%''' || e.name || '''%')))
      into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 13, 'name', 'every catalogue event was emitted by this suite, and each is named by a product trigger, the tick or the ledger''s event trigger',
      'expected', 'none|none', 'actual', v_txt, 'pass', v_txt = 'none|none');

    raise exception 'rollback';
  exception when others then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 14 --------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id::text from auth.users where email like '%@gev-probe.no'
    union all select id::text from app.organizations where id in (v_org, v_gone, v_demo, v_trial, v_conf, v_late)
    union all select id::text from app.growth_events where org_id in (v_org, v_gone, v_demo, v_trial, v_conf, v_late)
    union all select id::text from app.crm_contacts where email like '%@gev-probe.no'
    union all select id::text from app.demo_requests where email like '%@gev-probe.no'
    union all select name from app.event_catalogue where 'response_count_band' = any (allowed_props)) x;
  v_rows := v_rows || jsonb_build_object('seq', 14, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._gev
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._gev order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._gev;
  if v_failed is not null then raise exception 'growth events invariants failed: %', v_failed; end if;
  if v_count <> 14 then raise exception 'growth events invariants: expected 14 rows, got %', v_count; end if;
end $$;
