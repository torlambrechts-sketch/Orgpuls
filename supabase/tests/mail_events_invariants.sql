-- mail_events_invariants.sql — delivery events after the provider accepted a mail (0053, D-97).
--
--   * the new tables have RLS on, no policy and no client privilege; only the service role may
--     record an event (1, 2)
--   * mail_events has no column for an address, a subject or a link (3)
--   * an event finds its outbox row and sets its state; the same event twice is one row (4, 5)
--   * a hard bounce flags the employee's address, with any address in the reason masked (6)
--   * an older event arriving late does not overwrite a newer state (7)
--   * the daglig leder sees the flagged address; another role does not (8)
--   * correcting the address clears the flag (9)
--   * an event for an unknown message is kept, unlinked (10)
--   * the admin's log counts it, and reading it is audited (11)
--   * nothing written here survives (12)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/mail_events_invariants.sql

create unlogged table if not exists public._mei(seq int, name text, expected text, actual text, pass bool);
truncate public._mei;

do $$
declare
  v_org     uuid := '00000000-0000-4000-8000-000000000001';
  v_super   uuid := '00000000-0000-4000-8000-0000000ad301';
  v_dl      uuid;
  v_other   uuid;
  v_rows    jsonb := '[]';
  v_json    jsonb;
  v_txt     text;
  v_ok      boolean;
  v_cnt     int;
  v_box     app.outbox;
  claims    constant text := '{"sub":"%s","role":"authenticated","aal":"%s"}';
begin
  select bool_and(c.relrowsecurity) into v_ok from pg_class c where c.oid in ('app.mail_events'::regclass, 'app.address_problems'::regclass);
  v_ok := v_ok and not exists (select 1 from information_schema.role_table_grants g where g.table_schema = 'app'
      and g.table_name in ('mail_events', 'address_problems') and g.grantee in ('anon', 'authenticated'))
    and not exists (select 1 from pg_policies p where p.schemaname = 'app' and p.tablename in ('mail_events', 'address_problems'));
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'mail tables have RLS on, no policy and no client privilege', 'expected', 'true',
    'actual', v_ok::text, 'pass', v_ok);

  v_txt := concat_ws(',',
    has_function_privilege('anon', 'public.record_mail_event(text,text,timestamptz,text)', 'execute'),
    has_function_privilege('authenticated', 'public.record_mail_event(text,text,timestamptz,text)', 'execute'),
    has_function_privilege('service_role', 'public.record_mail_event(text,text,timestamptz,text)', 'execute'),
    has_function_privilege('anon', 'public.address_problems(uuid)', 'execute'));
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'only the service role records an event', 'expected', 'f,f,t,f',
    'actual', v_txt, 'pass', v_txt = 'f,f,t,f');

  select string_agg(column_name, ',' order by ordinal_position) into v_txt
  from information_schema.columns where table_schema = 'app' and table_name = 'mail_events';
  v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'mail_events has no column for an address, subject or link',
    'expected', 'id,received_at,at,event,message_id,outbox_id,ticket_mail_id,org_id,reason', 'actual', v_txt,
    'pass', v_txt = 'id,received_at,at,event,message_id,outbox_id,ticket_mail_id,org_id,reason');

  select m.user_id into v_dl from app.memberships m where m.org_id = v_org and m.role = 'daglig_leder' and m.active limit 1;
  select m.user_id into v_other from app.memberships m where m.org_id = v_org and m.role <> 'daglig_leder' and m.active limit 1;

  begin
    -- a mail to one employee, as the dispatcher would have left it
    select * into v_box from app.outbox where org_id = v_org and employee_id is not null limit 1;
    if v_box.id is null then
      insert into app.outbox (org_id, round_id, kind, employee_id, due_at)
      select v_org, r.id, 'paminnelse', e.id, now() from app.rounds r, app.employees e
      where r.org_id = v_org and e.org_id = v_org and e.active limit 1
      returning * into v_box;
    end if;
    update app.outbox set provider_id = '<probe-mail-1@relay.example>', sent_at = now(), delivery = null, delivery_at = null where id = v_box.id;
    delete from app.address_problems where employee_id = v_box.employee_id;

    -- 4, 5 ------------------------------------------------------------ delivered, once
    v_json := public.record_mail_event('delivered', 'probe-mail-1@relay.example', now() - interval '10 minutes', null);
    perform public.record_mail_event('delivered', '<probe-mail-1@relay.example>', now() - interval '10 minutes', null);
    select count(*) into v_cnt from app.mail_events where message_id = 'probe-mail-1@relay.example';
    v_txt := (select delivery::text from app.outbox where id = v_box.id);
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'an event finds its outbox row and sets its state', 'expected', 'matched, delivered',
      'actual', coalesce(v_json->>'matched', '?') || ', ' || coalesce(v_txt, 'none'), 'pass', v_json->>'matched' = 'true' and v_txt = 'delivered');
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'the same event twice is one row', 'expected', '1',
      'actual', v_cnt::text, 'pass', v_cnt = 1);

    -- 6 ---------------------------------------------------------------- a hard bounce
    perform public.record_mail_event('hard_bounce', 'probe-mail-1@relay.example', now() - interval '5 minutes', '550 kari.nordmann@firma.no does not exist');
    select reason into v_txt from app.mail_events where message_id = 'probe-mail-1@relay.example' and event = 'hard_bounce';
    v_ok := exists (select 1 from app.address_problems where employee_id = v_box.employee_id and problem = 'hard_bounce');
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'a hard bounce flags the address, with the address masked in the reason',
      'expected', 'flagged: 550 [address] does not exist', 'actual', case when v_ok then 'flagged' else 'not flagged' end || ': ' || coalesce(v_txt, ''),
      'pass', v_ok and v_txt = '550 [address] does not exist');

    -- 7 ---------------------------------------------------------------- late and older
    perform public.record_mail_event('deferred', 'probe-mail-1@relay.example', now() - interval '20 minutes', null);
    v_txt := (select delivery::text from app.outbox where id = v_box.id);
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'an older event arriving late does not overwrite a newer state', 'expected', 'hard_bounce',
      'actual', v_txt, 'pass', v_txt = 'hard_bounce');

    -- 8 ---------------------------------------------------------------- who sees it
    perform set_config('request.jwt.claims', format(claims, v_dl, 'aal1'), true);
    v_json := public.address_problems(v_org);
    v_txt := coalesce(jsonb_array_length(v_json)::text, 'null');
    if v_other is not null then
      perform set_config('request.jwt.claims', format(claims, v_other, 'aal1'), true);
      v_txt := v_txt || ',' || coalesce(jsonb_array_length(public.address_problems(v_org))::text, 'null');
    else
      v_txt := v_txt || ',null';
    end if;
    perform set_config('request.jwt.claims', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'the daglig leder sees the flagged address; another role does not', 'expected', '1,null',
      'actual', v_txt, 'pass', v_txt = '1,null');

    -- 9 ---------------------------------------------------------------- corrected
    update app.employees set email = 'kari.rettet@probe.example' where id = v_box.employee_id;
    v_ok := not exists (select 1 from app.address_problems where employee_id = v_box.employee_id and channel = 'email');
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'correcting the address clears the flag', 'expected', 'cleared',
      'actual', case when v_ok then 'cleared' else 'still flagged' end, 'pass', v_ok);

    -- 10 --------------------------------------------------------------- unknown
    v_json := public.record_mail_event('blocked', 'probe-unknown@relay.example', now(), null);
    v_ok := exists (select 1 from app.mail_events where message_id = 'probe-unknown@relay.example' and outbox_id is null and ticket_mail_id is null);
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'an event for an unknown message is kept, unlinked', 'expected', 'kept, unmatched',
      'actual', case when v_ok then 'kept' else 'lost' end || ', ' || case when v_json->>'matched' = 'false' then 'unmatched' else 'matched' end,
      'pass', v_ok and v_json->>'matched' = 'false');

    -- 11 --------------------------------------------------------------- the admin
    insert into auth.users (id, email) values (v_super, 'super@mail-test.example');
    insert into app.platform_admins (user_id, role) values (v_super, 'super_admin');
    perform set_config('request.jwt.claims', format(claims, v_super, 'aal2'), true);
    v_json := public.admin_email_log(v_org);
    select coalesce(sum((r->>'bounced')::int), 0) into v_cnt from jsonb_array_elements(v_json->'rows') r;
    v_json := public.admin_deliverability(30);
    v_ok := v_cnt >= 1 and (v_json->'totals'->>'blocked')::int >= 1
      and exists (select 1 from app.admin_audit a where a.admin_id = v_super and a.action = 'deliverability.view');
    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'the admin''s log counts bounces, and reading it is audited', 'expected', 'true',
      'actual', v_ok::text, 'pass', v_ok);

    perform set_config('request.jwt.claims', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  select count(*) into v_cnt from app.mail_events where message_id like 'probe-%@relay.example';
  v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'every probe row was rolled back', 'expected', '0',
    'actual', v_cnt::text, 'pass', v_cnt = 0 and not exists (select 1 from auth.users where email like '%@mail-test.example'));

  insert into public._mei
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._mei order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._mei;
  if v_failed is not null then raise exception 'mail event invariants failed: %', v_failed; end if;
  if v_count <> 12 then raise exception 'mail event invariants: expected 12 rows, got %', v_count; end if;
end $$;

drop table public._mei;
