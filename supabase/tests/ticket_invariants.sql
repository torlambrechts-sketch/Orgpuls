-- ticket_invariants.sql — ticketing (0051, D-92, X-060), proved against the live schema.
--
--   * every ticket table has RLS on, no policy and no client privilege (1)
--   * anon may use the contact form and nothing else here; the mail queue is the service
--     role's alone (2)
--   * no ticket function references a response-level table (3)
--   * the contact form: a ticket with its first message, marked unverified; a honeypot writes
--     nothing; the fourth message from one address in an hour is refused (4, 5, 6)
--   * the in-app form: a member's ticket carries the organisation, role and page, and never
--     the page's query string; a stranger cannot file one (7, 8)
--   * priority is derived from impact × blocking, deadlines in business hours; personvern has
--     the 30-day clock (9, 10, 11)
--   * ticket content is for support and super-admins with a second factor, not finance or a
--     customer (12)
--   * a reply is queued as e-mail and counts as the first response; a note is not queued (13, 14)
--   * resolving a problem notes and reopens its incidents; only a problem can be linked (15, 16)
--   * messages and events cannot be changed or deleted, but go with their ticket (17)
--   * nothing written here survives (18)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/ticket_invariants.sql

create unlogged table if not exists public._tki(seq int, name text, expected text, actual text, pass bool);
truncate public._tki;

do $$
declare
  v_org     uuid := '00000000-0000-4000-8000-000000000001';
  v_support uuid := '00000000-0000-4000-8000-0000000ad201';
  v_finance uuid := '00000000-0000-4000-8000-0000000ad202';
  v_dl      uuid;
  v_rows    jsonb := '[]';
  v_json    jsonb;
  v_cnt     int;
  v_ok      boolean;
  v_txt     text;
  v_t       uuid;
  v_p       uuid;
  v_i       uuid;
  v_row     app.tickets;
  claims    constant text := '{"sub":"%s","role":"authenticated","aal":"%s"}';
begin
  select bool_and(c.relrowsecurity) into v_ok from pg_class c
  where c.oid in ('app.tickets'::regclass, 'app.ticket_messages'::regclass, 'app.ticket_events'::regclass,
                  'app.ticket_links'::regclass, 'app.canned_replies'::regclass, 'app.ticket_mail'::regclass);
  v_ok := v_ok and not exists (
      select 1 from information_schema.role_table_grants g
      where g.table_schema = 'app' and g.table_name in ('tickets', 'ticket_messages', 'ticket_events', 'ticket_links', 'canned_replies', 'ticket_mail')
        and g.grantee in ('anon', 'authenticated'))
    and not exists (select 1 from pg_policies p where p.schemaname = 'app'
                    and p.tablename in ('tickets', 'ticket_messages', 'ticket_events', 'ticket_links', 'canned_replies', 'ticket_mail'));
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'ticket tables have RLS on, no policy and no client privilege', 'expected', 'true',
    'actual', v_ok::text, 'pass', v_ok);

  select string_agg(p.proname, ',' order by p.proname) into v_txt from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and (p.proname like '%ticket%' or p.proname in ('submit_contact', 'submit_help_request'))
    and has_function_privilege('anon', p.oid, 'execute');
  v_ok := v_txt = 'submit_contact'
    and not has_function_privilege('authenticated', 'public.ticket_mail_claim(int)', 'execute')
    and not has_function_privilege('authenticated', 'public.ticket_mail_done(uuid,boolean,text,text,boolean)', 'execute');
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'anon may use the contact form only; the mail queue is the service role''s',
    'expected', 'submit_contact', 'actual', coalesce(v_txt, 'none'), 'pass', v_ok);

  select string_agg(p.proname, ', ') into v_txt from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'app') and (p.proname like '%ticket%' or p.proname in ('submit_contact', 'submit_help_request'))
    and p.prosrc ~* 'app\.(responses|answers|extra_answers|response_comments)\M';
  v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'no ticket function reads a response-level table', 'expected', 'none',
    'actual', coalesce(v_txt, 'none'), 'pass', v_txt is null);

  select m.user_id into v_dl from app.memberships m where m.org_id = v_org and m.role = 'daglig_leder' and m.active limit 1;

  begin
    -- 4, 5, 6 -------------------------------------------------------- the contact form
    perform set_config('request.jwt.claims', '', true);
    v_json := public.submit_contact(1, 'Kari Probe', 'kari@ticket-test.example', 'Probe AS', 'Hva koster det for 300 ansatte?', null);
    select * into v_row from app.tickets where requester_email = 'kari@ticket-test.example';
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'the contact form files a sales ticket with its message, unverified',
      'expected', 'ok sales/sales 1 message unverified',
      'actual', coalesce(v_json->>'error', 'ok') || ' ' || v_row.queue || '/' || v_row.category || ' '
        || (select count(*) from app.ticket_messages m where m.ticket_id = v_row.id) || ' message '
        || case when v_row.context->>'verified' = 'false' then 'unverified' else 'verified' end,
      'pass', v_json->>'ok' = 'true' and v_row.queue = 'sales' and v_row.category = 'sales'
        and (select count(*) from app.ticket_messages m where m.ticket_id = v_row.id) = 1 and v_row.context->>'verified' = 'false');

    select count(*) into v_cnt from app.tickets;
    v_json := public.submit_contact(0, 'Bot', 'bot@ticket-test.example', null, 'spam', 'http://spam.example');
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'a filled honeypot is thanked and writes nothing', 'expected', 'ok, 0',
      'actual', coalesce(v_json->>'error', 'ok') || ', ' || ((select count(*) from app.tickets) - v_cnt),
      'pass', v_json->>'ok' = 'true' and (select count(*) from app.tickets) = v_cnt);

    perform public.submit_contact(0, 'Kari Probe', 'kari@ticket-test.example', null, 'to', null);
    perform public.submit_contact(0, 'Kari Probe', 'KARI@ticket-test.example', null, 'tre', null);
    v_json := public.submit_contact(0, 'Kari Probe', 'kari@ticket-test.example', null, 'fire', null);
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'the fourth message from one address in an hour is refused', 'expected', 'rate_limited',
      'actual', coalesce(v_json->>'error', 'ok'), 'pass', v_json->>'error' = 'rate_limited');

    -- 7, 8 ------------------------------------------------------------ the in-app form
    perform set_config('request.jwt.claims', format(claims, v_dl, 'aal1'), true);
    v_json := public.submit_help_request('survey_delivery', 'Invitasjonen kom ikke', 'Tre ansatte har ikke fått e-post.',
                                         '/malinger?maling=abc#x', 'Mozilla/5.0 probe');
    select * into v_row from app.tickets where user_id = v_dl and channel = 'in_app' order by created_at desc limit 1;
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'an in-app ticket carries organisation, role and page, not the query',
      'expected', 'ok daglig_leder /malinger', 'actual', coalesce(v_json->>'error', 'ok') || ' ' || coalesce(v_row.context->>'role', '-')
        || ' ' || coalesce(v_row.context->>'page', '-'),
      'pass', v_json->>'ok' = 'true' and v_row.org_id = v_org and v_row.context->>'role' = 'daglig_leder' and v_row.context->>'page' = '/malinger');

    perform set_config('request.jwt.claims', format(claims, '00000000-0000-4000-8000-0000000ad2ff', 'aal1'), true);
    v_json := public.submit_help_request('bug', 'x', 'y', '/', 'z');
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'someone with no organisation cannot file an in-app ticket', 'expected', 'not_allowed',
      'actual', coalesce(v_json->>'error', 'ok'), 'pass', v_json->>'error' = 'not_allowed');

    -- 9, 10, 11 -------------------------------------------------------- priority and deadlines
    v_txt := concat_ws(',',
      app.ticket_priority_of('one_user', false, 'getting_started'), app.ticket_priority_of('one_org', false, 'bug'),
      app.ticket_priority_of('one_user', true, 'survey_delivery'), app.ticket_priority_of('one_org', true, 'survey_delivery'),
      app.ticket_priority_of('many_orgs', false, 'bug'), app.ticket_priority_of('one_user', false, 'personvern'),
      app.ticket_priority_of('one_user', false, 'feature_request'));
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'priority follows impact × blocking; personvern at least high',
      'expected', 'normal,normal,high,urgent,high,high,low', 'actual', v_txt, 'pass', v_txt = 'normal,normal,high,urgent,high,high,low');

    v_txt := concat_ws(',',
      to_char(app.add_business_hours('2026-09-25 15:00+02', 4) at time zone 'Europe/Oslo', 'Dy HH24:MI'),
      to_char(app.add_business_hours('2026-09-26 10:00+02', 8) at time zone 'Europe/Oslo', 'Dy HH24:MI'),
      to_char(app.add_business_hours('2026-09-24 06:00+02', 16) at time zone 'Europe/Oslo', 'Dy HH24:MI'));
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'deadlines count Monday–Friday 08–16 in Oslo',
      'expected', 'Mon 11:00,Mon 16:00,Fri 16:00', 'actual', v_txt, 'pass', v_txt = 'Mon 11:00,Mon 16:00,Fri 16:00');

    perform set_config('request.jwt.claims', '', true);
    perform public.submit_contact(3, 'Ola Probe', 'ola@ticket-test.example', null, 'Innsyn, takk.', null);
    select * into v_row from app.tickets where requester_email = 'ola@ticket-test.example';
    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'a personvern request is high and carries the 30-day clock',
      'expected', 'personvern high 30 days', 'actual', v_row.queue || ' ' || v_row.priority || ' '
        || extract(day from v_row.legal_due - v_row.created_at) || ' days',
      'pass', v_row.queue = 'personvern' and v_row.priority = 'high' and v_row.legal_due = v_row.created_at + interval '30 days');

    -- 12 --------------------------------------------------------------- who may read tickets
    insert into auth.users (id, email) values (v_support, 'support@ticket-test.example'), (v_finance, 'finance@ticket-test.example');
    insert into app.platform_admins (user_id, role) values (v_support, 'support'), (v_finance, 'finance');
    select id into v_t from app.tickets where requester_email = 'kari@ticket-test.example' order by number limit 1;
    perform set_config('request.jwt.claims', format(claims, v_dl, 'aal2'), true);
    v_txt := coalesce(public.admin_ticket(v_t)->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_finance, 'aal2'), true);
    v_txt := v_txt || ',' || coalesce(public.admin_ticket(v_t)->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_support, 'aal1'), true);
    v_txt := v_txt || ',' || coalesce(public.admin_tickets(null, 'all', null)->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_support, 'aal2'), true);
    v_json := public.admin_ticket(v_t);
    v_txt := v_txt || ',' || coalesce(v_json->>'error', 'ok');
    v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'ticket content: support with aal2 only; not a customer, finance, or aal1',
      'expected', 'not_allowed,not_allowed,not_allowed,ok', 'actual', v_txt,
      'pass', v_txt = 'not_allowed,not_allowed,not_allowed,ok'
        and exists (select 1 from app.admin_audit a where a.admin_id = v_support and a.action = 'ticket.view'));

    -- 13, 14 ----------------------------------------------------------- replies and notes
    v_json := public.admin_ticket_reply(v_t, 'Hei Kari, prisen for konsern avtales. Kan vi ringe deg?', false, null);
    select * into v_row from app.tickets where id = v_t;
    v_rows := v_rows || jsonb_build_object('seq', 13, 'name', 'a reply is queued as e-mail and is the first response',
      'expected', 'ok waiting_customer responded 1 queued',
      'actual', coalesce(v_json->>'error', 'ok') || ' ' || v_row.status || ' ' || case when v_row.first_responded_at is null then 'unanswered' else 'responded' end
        || ' ' || (select count(*) from app.ticket_mail tm join app.ticket_messages m on m.id = tm.message_id where m.ticket_id = v_t) || ' queued',
      'pass', v_json->>'ok' = 'true' and v_row.status = 'waiting_customer' and v_row.first_responded_at is not null
        and (select count(*) from app.ticket_mail tm join app.ticket_messages m on m.id = tm.message_id where m.ticket_id = v_t) = 1);

    perform public.admin_ticket_reply(v_t, 'Intern: ring etter kl. 12.', true, null);
    select count(*) into v_cnt from app.ticket_mail tm join app.ticket_messages m on m.id = tm.message_id where m.ticket_id = v_t;
    v_rows := v_rows || jsonb_build_object('seq', 14, 'name', 'an internal note is never sent', 'expected', '1',
      'actual', v_cnt::text, 'pass', v_cnt = 1);

    -- 15, 16 ----------------------------------------------------------- problems and incidents
    select id into v_i from app.tickets where user_id = v_dl and channel = 'in_app' order by created_at desc limit 1;
    select id into v_p from app.tickets where requester_email = 'ola@ticket-test.example';
    v_json := public.admin_ticket_update(v_i, jsonb_build_object('problem', v_p));
    v_txt := coalesce(v_json->>'error', 'ok');
    perform public.admin_ticket_update(v_p, '{"type":"problem"}');
    perform public.admin_ticket_update(v_i, jsonb_build_object('problem', v_p));
    perform public.admin_ticket_update(v_p, '{"status":"resolved"}');
    select * into v_row from app.tickets where id = v_i;
    v_rows := v_rows || jsonb_build_object('seq', 15, 'name', 'resolving a problem notes and reopens its incidents',
      'expected', 'waiting_us with a note', 'actual', v_row.status || case when exists (select 1 from app.ticket_messages m
        where m.ticket_id = v_i and m.author_kind = 'system' and m.internal) then ' with a note' else ' without a note' end,
      'pass', v_row.status = 'waiting_us' and exists (select 1 from app.ticket_messages m where m.ticket_id = v_i and m.author_kind = 'system' and m.internal));
    v_rows := v_rows || jsonb_build_object('seq', 16, 'name', 'only a ticket of type problem can be linked as one', 'expected', 'invalid',
      'actual', v_txt, 'pass', v_txt = 'invalid');

    -- 17 --------------------------------------------------------------- history is fixed
    v_txt := '';
    begin
      update app.ticket_messages set body = 'endret' where ticket_id = v_t;
      v_txt := 'changed';
    exception when raise_exception then v_txt := 'refused';
    end;
    begin
      delete from app.ticket_events where ticket_id = v_t;
      v_txt := v_txt || ',deleted';
    exception when raise_exception then v_txt := v_txt || ',refused';
    end;
    delete from app.tickets where id = v_t;
    v_ok := not exists (select 1 from app.ticket_messages where ticket_id = v_t) and not exists (select 1 from app.ticket_events where ticket_id = v_t);
    v_rows := v_rows || jsonb_build_object('seq', 17, 'name', 'history cannot be changed or deleted, but goes with its ticket',
      'expected', 'refused,refused,cascaded', 'actual', v_txt || ',' || case when v_ok then 'cascaded' else 'left behind' end,
      'pass', v_txt = 'refused,refused' and v_ok);

    perform set_config('request.jwt.claims', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  select count(*) into v_cnt from app.tickets where requester_email like '%@ticket-test.example' or context->>'browser' = 'Mozilla/5.0 probe';
  v_rows := v_rows || jsonb_build_object('seq', 18, 'name', 'every probe row was rolled back', 'expected', '0',
    'actual', v_cnt::text, 'pass', v_cnt = 0 and not exists (select 1 from auth.users where email like '%@ticket-test.example'));

  insert into public._tki
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._tki order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._tki;
  if v_failed is not null then raise exception 'ticket invariants failed: %', v_failed; end if;
  if v_count <> 18 then raise exception 'ticket invariants: expected 18 rows, got %', v_count; end if;
end $$;

drop table public._tki;
