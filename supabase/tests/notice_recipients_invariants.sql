-- notice_recipients_invariants.sql — a notice to several people is one provider message per person,
-- each with its own delivery state; a ticket reply's state on the ticket page (0134, D-97).
--
--   * app.outbox_recipients has RLS on, no policy and no client privilege; the dispatcher's two
--     functions are the service role's alone, the admin's two a platform admin's (1, 2)
--   * it has no column for an address, an employee, an invitation, a token or a response (3)
--   * a personal row — an employee's, above all an invitation — never gets a recipient row (4)
--   * two leaders reached: two rows, masked, keyed as the dispatcher keys them; the same person
--     twice is one row, and a sent notice takes no more (5)
--   * an event with one leader's message id sets that leader's state and nobody else's (6)
--   * the other leader's bounce is theirs; the notice counts as bounced; no employee is flagged (7)
--   * an older event arriving late overwrites neither leader's newer state (8)
--   * the admin sees each person masked, never the address; anyone else is refused (9)
--   * the ticket page gets each reply's state with its time and the masked reason (10)
--   * nothing written here survives (11)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/notice_recipients_invariants.sql

create unlogged table if not exists public._nri(seq int, name text, expected text, actual text, pass bool);
truncate public._nri;

do $$
declare
  v_org   uuid := '00000000-0000-4000-8000-00000000f341';
  v_dl    uuid := '00000000-0000-4000-8000-0000000f3411';
  v_super uuid := '00000000-0000-4000-8000-0000000f3412';
  v_meas  uuid;
  v_round uuid;
  v_emp   uuid;
  v_box   uuid;
  v_own   uuid;
  v_tk    uuid;
  v_msg   uuid;
  v_json  jsonb;
  v_txt   text;
  v_ok    boolean;
  v_rows  jsonb := '[]';
  claims  constant text := '{"sub":"%s","role":"authenticated","aal":"%s"}';
begin
  -- 1 ---------------------------------------------------------------- the table is closed
  v_ok := (select c.relrowsecurity from pg_class c where c.oid = 'app.outbox_recipients'::regclass)
    and not exists (select 1 from information_schema.role_table_grants g where g.table_schema = 'app'
      and g.table_name = 'outbox_recipients' and g.grantee in ('anon', 'authenticated'))
    and not exists (select 1 from pg_policies p where p.schemaname = 'app' and p.tablename = 'outbox_recipients');
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'outbox_recipients has RLS on, no policy and no client privilege',
    'expected', 'true', 'actual', v_ok::text, 'pass', v_ok);

  -- 2 ---------------------------------------------------------------- who may call what
  v_txt := concat_ws(',',
    has_function_privilege('authenticated', 'public.dispatch_recipient_sent(uuid,text,text)', 'execute'),
    has_function_privilege('anon', 'public.dispatch_recipient_sent(uuid,text,text)', 'execute'),
    has_function_privilege('service_role', 'public.dispatch_recipient_sent(uuid,text,text)', 'execute'),
    has_function_privilege('authenticated', 'public.dispatch_reached(uuid)', 'execute'),
    has_function_privilege('service_role', 'public.dispatch_reached(uuid)', 'execute'),
    has_function_privilege('anon', 'public.admin_notice_recipients(uuid)', 'execute'),
    has_function_privilege('anon', 'public.admin_ticket_mail(uuid)', 'execute'));
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'the dispatcher''s functions are the service role''s; anon calls neither admin read',
    'expected', 'f,f,t,f,t,f,f', 'actual', v_txt, 'pass', v_txt = 'f,f,t,f,t,f,f');

  -- 3 ---------------------------------------------------------------- nothing that links
  select string_agg(column_name, ',' order by ordinal_position) into v_txt
  from information_schema.columns where table_schema = 'app' and table_name = 'outbox_recipients';
  v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'outbox_recipients has no column for an address, employee, invitation, token or response',
    'expected', 'id,outbox_id,address_key,masked,provider_id,sent_at,delivery,delivery_at', 'actual', v_txt,
    'pass', v_txt = 'id,outbox_id,address_key,masked,provider_id,sent_at,delivery,delivery_at');

  begin
    insert into app.organizations (id, name, org_number, employee_count, mail_enabled)
    values (v_org, 'Mottakere AS', '999000341', 9, true);
    insert into auth.users (id, email) values (v_dl, 'dl@nri-probe.no'), (v_super, 'super@nri-probe.no');
    insert into app.profiles (id, full_name) values (v_dl, 'Dina');
    insert into app.memberships (org_id, user_id, role) values (v_org, v_dl, 'daglig_leder');
    insert into app.platform_admins (user_id, role) values (v_super, 'super_admin');
    insert into app.measurements (org_id, kind, year, label) values (v_org, 'grunnlinje', 2026, 'Probe') returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'lukket', now() - interval '20 days', now() - interval '6 days') returning id into v_round;
    insert into app.employees (org_id, full_name, email) values (v_org, 'Ansatt En', 'en@nri-probe.no') returning id into v_emp;
    -- a notice to the daglig leder role, claimed; and a reminder to one employee
    insert into app.outbox (org_id, round_id, kind, audience, due_at, claimed_at, attempts)
    values (v_org, v_round, 'resultat', 'daglig_leder', now(), now(), 1) returning id into v_box;
    insert into app.outbox (org_id, round_id, kind, employee_id, due_at, claimed_at, attempts)
    values (v_org, v_round, 'paminnelse', v_emp, now(), now(), 1) returning id into v_own;

    -- 4 -------------------------------------------------------------- never a personal row
    v_txt := concat_ws(',',
      public.dispatch_recipient_sent(v_own, 'en@nri-probe.no', 'probe-nri-own@relay.example')->>'error',
      (select count(*) from app.outbox_recipients where outbox_id = v_own));
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'a personal row never gets a recipient row',
      'expected', 'not_a_notice,0', 'actual', v_txt, 'pass', v_txt = 'not_a_notice,0');

    -- 5 -------------------------------------------------------------- two leaders reached
    perform public.dispatch_recipient_sent(v_box, ' Kari.Leder@NRI-probe.no', '<probe-nri-a@relay.example>');
    perform public.dispatch_recipient_sent(v_box, 'per@nri-probe.no', 'probe-nri-b@relay.example');
    v_json := public.dispatch_recipient_sent(v_box, 'kari.leder@nri-probe.no', 'probe-nri-a2@relay.example');
    v_ok := (select jsonb_agg(k order by k) from jsonb_array_elements_text(public.dispatch_reached(v_box)) k)
      = (select jsonb_agg(k order by k) from unnest(array[encode(extensions.digest('kari.leder@nri-probe.no', 'sha256'), 'hex'),
                                                          encode(extensions.digest('per@nri-probe.no', 'sha256'), 'hex')]) k);
    v_txt := concat_ws(',',
      (select string_agg(masked || '=' || provider_id, ';' order by id) from app.outbox_recipients where outbox_id = v_box),
      v_json->>'duplicate', v_ok,
      (select count(*) from app.outbox_recipients r where r.outbox_id = v_box and r.masked like '%kari.leder%'));
    update app.outbox set sent_at = now(), claimed_at = null where id = v_box;
    v_txt := v_txt || ',' || (public.dispatch_recipient_sent(v_box, 'ny@nri-probe.no', 'probe-nri-c@relay.example')->>'error');
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'two leaders are two masked rows keyed as the dispatcher keys them; a repeat and a late one are refused',
      'expected', 'ka…@nri-probe.no=probe-nri-a@relay.example;p…@nri-probe.no=probe-nri-b@relay.example,true,t,0,closed',
      'actual', v_txt, 'pass', v_txt = 'ka…@nri-probe.no=probe-nri-a@relay.example;p…@nri-probe.no=probe-nri-b@relay.example,true,t,0,closed');

    -- 6 -------------------------------------------------------------- one leader's event
    v_json := public.record_mail_event('delivered', '<probe-nri-a@relay.example>', now() - interval '10 minutes', null);
    v_txt := concat_ws(',', v_json->>'matched',
      (select string_agg(coalesce(delivery::text, 'none'), ';' order by id) from app.outbox_recipients where outbox_id = v_box),
      (select delivery::text from app.outbox where id = v_box),
      (select count(*) from app.mail_events where message_id = 'probe-nri-a@relay.example' and outbox_id = v_box));
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'an event with one leader''s id sets that leader''s state alone',
      'expected', 'true,delivered;none,delivered,1', 'actual', v_txt, 'pass', v_txt = 'true,delivered;none,delivered,1');

    -- 7 -------------------------------------------------------------- the other's bounce
    perform public.record_mail_event('hard_bounce', 'probe-nri-b@relay.example', now() - interval '5 minutes', '550 per@nri-probe.no unknown');
    v_txt := concat_ws(',',
      (select string_agg(coalesce(delivery::text, 'none'), ';' order by id) from app.outbox_recipients where outbox_id = v_box),
      (select delivery::text from app.outbox where id = v_box),
      (select count(*) from app.address_problems where org_id = v_org));
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'the other leader''s bounce is theirs; the notice counts as bounced; no employee is flagged',
      'expected', 'delivered;hard_bounce,hard_bounce,0', 'actual', v_txt, 'pass', v_txt = 'delivered;hard_bounce,hard_bounce,0');

    -- 8 -------------------------------------------------------------- late and older
    perform public.record_mail_event('deferred', 'probe-nri-a@relay.example', now() - interval '30 minutes', null);
    perform public.record_mail_event('delivered', 'probe-nri-b@relay.example', now() - interval '20 minutes', null);
    v_txt := concat_ws(',',
      (select string_agg(delivery::text || '@' || (delivery_at < now() - interval '9 minutes')::text, ';' order by id) from app.outbox_recipients where outbox_id = v_box),
      (select count(*) from app.mail_events where message_id in ('probe-nri-a@relay.example', 'probe-nri-b@relay.example')));
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'an older event arriving late overwrites neither leader''s newer state (but is kept)',
      'expected', 'delivered@true;hard_bounce@false,4', 'actual', v_txt, 'pass', v_txt = 'delivered@true;hard_bounce@false,4');

    -- 9 -------------------------------------------------------------- the admin's view
    perform set_config('request.jwt.claims', format(claims, v_dl, 'aal1'), true);
    v_txt := public.admin_notice_recipients(v_org)->>'error';
    perform set_config('request.jwt.claims', format(claims, v_super, 'aal2'), true);
    v_json := public.admin_notice_recipients(v_org);
    v_txt := concat_ws(',', v_txt,
      (select string_agg(r->>'masked' || ':' || (r->>'delivery') || ':' || coalesce(r->>'reason', '-'), ';' order by r->>'masked')
       from jsonb_array_elements(v_json->'rows') r),
      v_json::text like '%kari.leder@%' or v_json::text like '%per@nri%');
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'the admin sees each person masked with their state and reason; a customer is refused',
      'expected', 'not_allowed,ka…@nri-probe.no:delivered:-;p…@nri-probe.no:hard_bounce:550 [address] unknown,f',
      'actual', v_txt, 'pass', v_txt = 'not_allowed,ka…@nri-probe.no:delivered:-;p…@nri-probe.no:hard_bounce:550 [address] unknown,f');

    -- 10 ------------------------------------------------------------- a ticket reply
    perform set_config('request.jwt.claims', '', true);
    insert into app.tickets (category, queue, channel, subject, requester_email, org_id)
    values ('bug', 'support', 'admin', 'Probe', 'kunde@nri-probe.no', v_org) returning id into v_tk;
    insert into app.ticket_messages (ticket_id, author_kind, body) values (v_tk, 'admin', 'Svar') returning id into v_msg;
    insert into app.ticket_mail (message_id, to_email, status, provider_id, sent_at)
    values (v_msg, 'kunde@nri-probe.no', 'sent', '<probe-nri-t@relay.example>', now());
    perform public.record_mail_event('deferred', 'probe-nri-t@relay.example', now() - interval '3 minutes', 'mailbox of kunde@nri-probe.no full');
    perform public.record_mail_event('soft_bounce', 'probe-nri-t@relay.example', now() - interval '8 minutes', null);
    perform set_config('request.jwt.claims', format(claims, v_dl, 'aal1'), true);
    v_txt := public.admin_ticket_mail(v_tk)->>'error';
    perform set_config('request.jwt.claims', format(claims, v_super, 'aal2'), true);
    v_json := public.admin_ticket_mail(v_tk);
    v_txt := concat_ws(',', v_txt, jsonb_array_length(v_json->'rows'),
      v_json->'rows'->0->>'message_id' = v_msg::text, v_json->'rows'->0->>'delivery',
      (v_json->'rows'->0->>'delivery_at')::timestamptz < now() - interval '2 minutes', v_json->'rows'->0->>'reason');
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'the ticket page gets the reply''s latest state, its time and the masked reason',
      'expected', 'not_allowed,1,t,deferred,t,mailbox of [address] full',
      'actual', v_txt, 'pass', v_txt = 'not_allowed,1,t,deferred,t,mailbox of [address] full');

    perform set_config('request.jwt.claims', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 11 --------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id::text from auth.users where email like '%@nri-probe.no'
    union all select id::text from app.organizations where id = v_org
    union all select id::text from app.mail_events where message_id like 'probe-nri-%') x;
  v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._nri
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._nri order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._nri;
  if v_failed is not null then raise exception 'notice recipients invariants failed: %', v_failed; end if;
  if v_count <> 11 then raise exception 'notice recipients invariants: expected 11 rows, got %', v_count; end if;
end $$;

drop table public._nri;
