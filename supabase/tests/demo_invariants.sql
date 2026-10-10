-- demo_invariants.sql — a demo of one's own, copied from the template (0094, D-143).
--
--   * the demo tables, the network's daily key among them (demo_salts, 0206): RLS on, no policy,
--     no client privilege (1)
--   * the copy plan names every table that holds an organisation's data (2)
--   * a request: a bad or throwaway address is refused; one address gets three links a day,
--     and the network is kept only as the day's hash (3)
--   * a request says who is asking: without a name or a company, or with a role outside the
--     set the platform's contact takes, it is refused; with them, all three are stored (15, 0146)
--   * the first login makes a copy with the template's data, its rounds in their states (4)
--   * the copy has no org.nr, no billing row, mail and SMS off, one daglig leder, a member
--     lock, and no token the template holds (5)
--   * two visitors never see each other's copy, nor the template; answers stay closed (6)
--   * nothing leaves a demo: name and switches locked, no QR code, DPA or invitation, and the
--     outbox drops its rows (7)
--   * within a day the same copy; after it, or on «Tilbakestill», a new one (8, 9)
--   * the proved address goes to the platform once, as a demo.requested event with no organisation
--     and consent exactly as the box was ticked (10), carrying the request's name, company, role
--     and language and nothing else (16, 0206)
--   * the platform is told of no demo organisation: nothing a copy does is an event (11)
--   * somebody with a real organisation is sent there, not into a demo (12)
--   * leaving, or 14 idle days, takes the copy and the login; the lead already sent stays (13, 14)
--   * nothing written here survives (17)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/demo_invariants.sql

create unlogged table if not exists public._demo(seq int, name text, expected text, actual text, pass bool);
truncate public._demo;

do $$
declare
  v_tmpl   uuid;
  v_a      uuid := '00000000-0000-4000-8000-0000000de0a1';
  v_b      uuid := '00000000-0000-4000-8000-0000000de0b1';
  v_real   uuid := '00000000-0000-4000-8000-0000000de0c1';
  v_c      uuid := '00000000-0000-4000-8000-0000000de0d1';
  v_fix    uuid := '00000000-0000-4000-8000-000000000001';
  v_org_a  uuid;
  v_org_b  uuid;
  v_org2   uuid;
  v_rows   jsonb := '[]';
  v_json   jsonb;
  v_txt    text;
  v_n      int;
  v_ev0    bigint;
  v_alive  text;
  claims   constant text := '{"sub":"%s","role":"authenticated"}';
begin
  select org_id into v_tmpl from app.demo_orgs where kind = 'template';
  -- the platform events this run writes are those after this one
  select coalesce(max(id), 0) into v_ev0 from app.platform_events;

  -- 1 ---------------------------------------------------------------- the tables
  select string_agg(format('%s:%s/%s/%s', c.relname, c.relrowsecurity,
           (select count(*) from pg_policies p where p.schemaname = 'app' and p.tablename = c.relname),
           (select count(*) from information_schema.role_table_grants g
            where g.table_schema = 'app' and g.table_name = c.relname and g.grantee in ('anon', 'authenticated'))), ' ' order by c.relname)
    into v_txt
  from pg_class c where c.relnamespace = 'app'::regnamespace and c.relname like 'demo\_%' and c.relkind = 'r';
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'the demo tables: RLS on, no policy, no client privilege',
    'expected', 'demo_copy_plan:t/0/0 demo_id_map:t/0/0 demo_orgs:t/0/0 demo_requests:t/0/0 demo_salts:t/0/0 demo_sandboxes:t/0/0 demo_settings:t/0/0',
    'actual', v_txt,
    'pass', v_txt = 'demo_copy_plan:t/0/0 demo_id_map:t/0/0 demo_orgs:t/0/0 demo_requests:t/0/0 demo_salts:t/0/0 demo_sandboxes:t/0/0 demo_settings:t/0/0');

  -- 2 ---------------------------------------------------------------- the plan is complete
  -- every table with an org_id, or a key to a table the copy takes, has said what a copy does
  select coalesce(string_agg(distinct c.relname, ',' order by c.relname), 'none') into v_txt
  from pg_class c
  where c.relnamespace = 'app'::regnamespace and c.relkind = 'r'
    and not exists (select 1 from app.demo_copy_plan p where p.table_name = c.relname)
    and (exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'org_id' and not a.attisdropped)
         or exists (select 1 from pg_constraint k join pg_class f on f.oid = k.confrelid
                    join app.demo_copy_plan p on p.table_name = f.relname and p.mode = 'copy'
                    where k.conrelid = c.oid and k.contype = 'f'));
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'the copy plan names every table that holds an organisation''s data',
    'expected', 'none', 'actual', v_txt, 'pass', v_txt = 'none');

  begin
    if v_tmpl is null then
      raise exception 'demo invariants: no template organisation (run scripts/seed/demo-org.mjs first)';
    end if;
    insert into auth.users (id, email, created_at) values
      (v_a, 'visitor.a@demo-test.example', now()), (v_b, 'visitor.b@gmail.com', now()), (v_real, 'real@demo-test.example', now());
    insert into app.profiles (id, full_name) values (v_real, 'Real Leder');
    insert into app.memberships (org_id, user_id, role, active) values (v_fix, v_real, 'daglig_leder', true);

    -- 3 -------------------------------------------------------------- requests
    execute 'set local role anon';
    v_txt := concat_ws(',',
      public.demo_request('not an address', 'Ada Visitor', 'Visitor AS', 'daglig_leder', '203.0.113.9', false, 'no')->>'error',
      public.demo_request('someone@mailinator.com', 'Ada Visitor', 'Visitor AS', 'daglig_leder', '203.0.113.9', false, 'no')->>'error',
      public.demo_request('Visitor.A@demo-test.example', 'Ada  Visitor ', ' Visitor AS', 'daglig_leder', '203.0.113.9', true, 'no')->>'ok',
      public.demo_request('visitor.a@demo-test.example', 'Ada Visitor', 'Visitor AS', 'daglig_leder', '203.0.113.10', true, 'no')->>'ok',
      public.demo_request('visitor.a@demo-test.example', 'Ada Visitor', 'Visitor AS', 'daglig_leder', '203.0.113.11', true, 'no')->>'ok',
      public.demo_request('visitor.a@demo-test.example', 'Ada Visitor', 'Visitor AS', 'daglig_leder', '203.0.113.12', true, 'no')->>'error');
    execute 'reset role';
    v_txt := v_txt || '|' || (select count(*) from app.demo_requests where email = 'visitor.a@demo-test.example')
                   || '|' || (select count(*) from app.demo_requests where network !~ '^[0-9a-f]{32}$' or network like '%203.0%');
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'a bad or throwaway address is refused; three links a day; only a hash of the network',
      'expected', 'invalid,invalid,true,true,true,limited|3|0', 'actual', v_txt,
      'pass', v_txt = 'invalid,invalid,true,true,true,limited|3|0');
    insert into app.demo_requests (email, domain, network, consent, lang)
    values ('visitor.b@gmail.com', 'gmail.com', repeat('b', 32), false, 'no');

    -- 15 ------------------------------------------------------------- who is asking (0146)
    execute 'set local role anon';
    v_txt := concat_ws(',',
      public.demo_request('visitor.c@demo-test.example', '', 'Demo Firma AS', 'hr', '203.0.113.20', false, 'no')->>'error',
      public.demo_request('visitor.c@demo-test.example', '   ', 'Demo Firma AS', 'hr', '203.0.113.20', false, 'no')->>'error',
      public.demo_request('visitor.c@demo-test.example', null, 'Demo Firma AS', 'hr', '203.0.113.20', false, 'no')->>'error',
      public.demo_request('visitor.c@demo-test.example', 'Kari Demo', '', 'hr', '203.0.113.20', false, 'no')->>'error',
      public.demo_request('visitor.c@demo-test.example', repeat('n', 121), 'Demo Firma AS', 'hr', '203.0.113.20', false, 'no')->>'error',
      public.demo_request('visitor.c@demo-test.example', 'Kari Demo', repeat('c', 201), 'hr', '203.0.113.20', false, 'no')->>'error',
      public.demo_request('visitor.c@demo-test.example', 'Kari Demo', 'Demo Firma AS', 'sjef', '203.0.113.20', false, 'no')->>'error',
      public.demo_request('visitor.c@demo-test.example', 'Kari Demo', 'Demo Firma AS', null, '203.0.113.20', false, 'no')->>'error',
      public.demo_request('visitor.c@demo-test.example', 'Kari Demo', 'Demo Firma AS', 'hr', '203.0.113.20', false, 'en')->>'ok');
    execute 'reset role';
    v_txt := v_txt || '|' || (select string_agg(format('%s/%s/%s', name, company, role), ',' order by at, id)
                              from app.demo_requests where email = 'visitor.c@demo-test.example')
                   || '|' || (select string_agg(distinct format('%s/%s/%s', name, company, role), ',')
                              from app.demo_requests where email = 'visitor.a@demo-test.example');
    v_rows := v_rows || jsonb_build_object('seq', 15, 'name', 'a request without a name or a company, or with another role, is refused; with them all three are stored',
      'expected', 'invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,true|Kari Demo/Demo Firma AS/hr|Ada Visitor/Visitor AS/daglig_leder',
      'actual', v_txt,
      'pass', v_txt = 'invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,true|Kari Demo/Demo Firma AS/hr|Ada Visitor/Visitor AS/daglig_leder');

    -- 4 -------------------------------------------------------------- the first login
    perform set_config('request.jwt.claims', format(claims, v_a), true);
    execute 'set local role authenticated';
    v_txt := public.demo_pending()::text || ',' || (public.demo_enter()->>'state');
    execute 'reset role';
    select org_id into v_org_a from app.demo_sandboxes where user_id = v_a;
    select v_txt || '|' || string_agg(format('%s=%s', t,
             (xpath('/row/n/text()', query_to_xml(format(
               'select (select count(*) from app.%1$I where org_id = %2$L) = (select count(*) from app.%1$I where org_id = %3$L) as n',
               t, v_tmpl, v_org_a), false, true, '')))[1]::text), ',' order by t)
      into v_txt
    from unnest(array['groups', 'employees', 'rounds', 'responses', 'invitations', 'comment_threads', 'measures', 'risk_assessments']) t;
    v_txt := v_txt || '|' || ((select count(*) from app.answers a join app.responses r on r.id = a.response_id where r.org_id = v_org_a)
                            = (select count(*) from app.answers a join app.responses r on r.id = a.response_id where r.org_id = v_tmpl))::text
                   || '|' || ((select string_agg(status::text, ',' order by status::text) from app.rounds where org_id = v_org_a)
                            = (select string_agg(status::text, ',' order by status::text) from app.rounds where org_id = v_tmpl))::text;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'the first login makes a copy with the template''s data, rounds in their states',
      'expected', 'true,created|comment_threads=true,employees=true,groups=true,invitations=true,measures=true,responses=true,risk_assessments=true,rounds=true|true|true',
      'actual', v_txt,
      'pass', v_txt = 'true,created|comment_threads=true,employees=true,groups=true,invitations=true,measures=true,responses=true,risk_assessments=true,rounds=true|true|true');

    -- 5 -------------------------------------------------------------- what the copy is not
    select concat_ws('|', coalesce(o.org_number, 'null'), o.mail_enabled, o.sms_enabled,
             (select count(*) from app.billing b where b.org_id = o.id),
             (select string_agg(m.role::text, ',') from app.memberships m where m.org_id = o.id),
             (select count(*) from app.member_locks l where l.org_id = o.id),
             (select count(*) from app.invitations i join app.invitations t on t.token_hash = i.token_hash
              where i.org_id = o.id and t.org_id = v_tmpl))
      into v_txt from app.organizations o where o.id = v_org_a;
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'no org.nr, mail and SMS off, no billing row, one daglig leder, locked, no shared token',
      'expected', 'null|f|f|0|daglig_leder|1|0', 'actual', v_txt, 'pass', v_txt = 'null|f|f|0|daglig_leder|1|0');

    -- 6 -------------------------------------------------------------- two visitors
    perform set_config('request.jwt.claims', format(claims, v_b), true);
    execute 'set local role authenticated';
    perform public.demo_enter();
    select string_agg(o.id::text, ',') into v_txt from app.organizations o;
    begin
      perform 1 from app.responses limit 1;
      v_txt := v_txt || ',answers-open';
    exception when insufficient_privilege then
      v_txt := v_txt || ',answers-closed';
    end;
    execute 'reset role';
    select org_id into v_org_b from app.demo_sandboxes where user_id = v_b;
    v_txt := replace(v_txt, v_org_b::text, 'own') || ',' || (v_org_a <> v_org_b)::text;
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'a visitor sees their own copy only, not the template; answers stay closed',
      'expected', 'own,answers-closed,true', 'actual', v_txt, 'pass', v_txt = 'own,answers-closed,true');

    -- 7 -------------------------------------------------------------- nothing leaves
    perform set_config('request.jwt.claims', format(claims, v_a), true);
    execute 'set local role authenticated';
    v_txt := '';
    begin
      update app.organizations set name = 'Ekte Bedrift AS' where id = v_org_a;
      v_txt := 'renamed';
    exception when insufficient_privilege then v_txt := 'name-locked';
    end;
    begin
      update app.organizations set mail_enabled = true where id = v_org_a;
      v_txt := v_txt || ',mail-on';
    exception when insufficient_privilege then v_txt := v_txt || ',mail-locked';
    end;
    begin
      perform public.entry_code(v_org_a, true);
      v_txt := v_txt || ',qr';
    exception when insufficient_privilege then v_txt := v_txt || ',no-qr';
    end;
    begin
      -- the version in force as sign_dpa picks it: two can share a day since 0151 (2026-10-02, 2026-10-02.2),
      -- and each market's agreement has its own (0226): the demo is Norwegian
      perform public.sign_dpa(v_org_a, (select version from app.dpa_versions where market = 'no' order by published_on desc, version desc limit 1), 'Ola Demo', 'Daglig leder');
      v_txt := v_txt || ',' || coalesce((select 'signed' from app.dpa_signatures where org_id = v_org_a limit 1), 'not-signed');
    exception when insufficient_privilege then v_txt := v_txt || ',no-dpa';
    end;
    execute 'reset role';
    insert into app.outbox (org_id, round_id, kind, due_at)
    select v_org_a, r.id, 'invitasjon', now() from app.rounds r where r.org_id = v_org_a and r.status = 'apen' limit 1;
    v_txt := v_txt || ',' || (select count(*) from app.outbox where org_id = v_org_a);
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'name and mail locked, no QR code, no DPA, and the outbox drops a demo''s rows',
      'expected', 'name-locked,mail-locked,no-qr,no-dpa,0', 'actual', v_txt, 'pass', v_txt = 'name-locked,mail-locked,no-qr,no-dpa,0');

    -- 8 -------------------------------------------------------------- within a day, the same
    perform set_config('request.jwt.claims', format(claims, v_a), true);
    execute 'set local role authenticated';
    v_txt := public.demo_enter()->>'state';
    execute 'reset role';
    v_txt := v_txt || ',' || ((select org_id from app.demo_sandboxes where user_id = v_a) = v_org_a)::text;
    update app.demo_sandboxes set reset_at = now() - interval '25 hours' where user_id = v_a;
    execute 'set local role authenticated';
    v_txt := v_txt || ',' || (public.demo_enter()->>'state');
    execute 'reset role';
    select org_id into v_org2 from app.demo_sandboxes where user_id = v_a;
    v_txt := v_txt || ',' || (v_org2 <> v_org_a)::text || ',' || (select count(*) from app.organizations where id = v_org_a);
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'the same copy within a day; after 24 hours a new one, and the old is gone',
      'expected', 'continued,true,reset,true,0', 'actual', v_txt, 'pass', v_txt = 'continued,true,reset,true,0');

    -- 9 -------------------------------------------------------------- «Tilbakestill»
    execute 'set local role authenticated';
    v_txt := (public.demo_reset()->>'ok') || ',' || (public.demo_state()->>'demo');
    execute 'reset role';
    v_txt := v_txt || ',' || ((select org_id from app.demo_sandboxes where user_id = v_a) <> v_org2)::text
                   || ',' || (select resets from app.demo_sandboxes where user_id = v_a);
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', '«Tilbakestill» makes a new copy at once, and the banner knows it is a demo',
      'expected', 'true,true,true,2', 'actual', v_txt, 'pass', v_txt = 'true,true,true,2');

    -- 10 ------------------------------------------------------------- the lead (0206)
    -- one event per proved address, at the first login only: no organisation, the box as ticked,
    -- and no key outside the six the kind registers
    select string_agg(format('%s:%s:%s', e.payload->>'email', e.payload->>'consent', coalesce(e.org_id::text, 'null')), ','
                      order by e.payload->>'email') into v_txt
    from app.platform_events e
    where e.id > v_ev0 and e.kind = 'demo.requested' and e.payload->>'email' in ('visitor.a@demo-test.example', 'visitor.b@gmail.com');
    v_txt := v_txt || '|' || (select count(*) from app.platform_events e, jsonb_object_keys(e.payload) k
                              where e.id > v_ev0 and e.kind = 'demo.requested'
                                and k <> all (array['email', 'name', 'company', 'role', 'consent', 'lang']));
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'the proved address is one demo.requested event: no organisation, consent as ticked, nothing else',
      'expected', 'visitor.a@demo-test.example:true:null,visitor.b@gmail.com:false:null|0', 'actual', v_txt,
      'pass', v_txt = 'visitor.a@demo-test.example:true:null,visitor.b@gmail.com:false:null|0');

    -- 16 ------------------------------------------------------------- who the lead is (0146, 0206)
    -- the event takes the latest request's name, company, role and language; a request from before
    -- 0146 has none and the event leaves them out rather than sending them empty
    insert into auth.users (id, email, created_at) values (v_c, 'visitor.c@demo-test.example', now());
    perform app.demo_lead(v_c);
    select string_agg(format('%s=%s/%s/%s/%s', e.payload->>'email', coalesce(e.payload->>'name', '-'), coalesce(e.payload->>'company', '-'),
                             coalesce(e.payload->>'role', '-'), coalesce(e.payload->>'lang', '-')), ',' order by e.payload->>'email') into v_txt
    from app.platform_events e
    where e.id > v_ev0 and e.kind = 'demo.requested';
    v_txt := v_txt || '|' || (select string_agg(k, ',' order by k) from app.platform_events e, jsonb_object_keys(e.payload) k
                              where e.id > v_ev0 and e.kind = 'demo.requested' and e.payload->>'email' = 'visitor.b@gmail.com');
    v_rows := v_rows || jsonb_build_object('seq', 16, 'name', 'the lead carries the request''s name, company, role and language, and leaves out what it lacks',
      'expected', 'visitor.a@demo-test.example=Ada Visitor/Visitor AS/daglig_leder/no,visitor.b@gmail.com=-/-/-/no,visitor.c@demo-test.example=Kari Demo/Demo Firma AS/hr/en|consent,email,lang',
      'actual', v_txt,
      'pass', v_txt = 'visitor.a@demo-test.example=Ada Visitor/Visitor AS/daglig_leder/no,visitor.b@gmail.com=-/-/-/no,visitor.c@demo-test.example=Kari Demo/Demo Firma AS/hr/en|consent,email,lang');

    -- 11, first half: while two copies are alive and two have been replaced (completed below)
    perform app.platform_emit('org.attribution', v_org_b, jsonb_build_object('heard', 'search'));
    select coalesce(string_agg(format('%s:%s', kind, n), ',' order by kind), 'none') into v_alive
    from (select e.kind, count(*) n from app.platform_events e
          where e.id > v_ev0 and e.org_id is not null and e.org_id <> v_fix group by e.kind) x;

    -- 12 ------------------------------------------------------------- a real member
    perform set_config('request.jwt.claims', format(claims, v_real), true);
    execute 'set local role authenticated';
    v_txt := public.demo_pending()::text || ',' || (public.demo_enter()->>'state');
    execute 'reset role';
    v_txt := v_txt || ',' || (select count(*) from app.demo_sandboxes where user_id = v_real);
    v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'somebody with a real organisation is sent there, not into a demo',
      'expected', 'false,member,0', 'actual', v_txt, 'pass', v_txt = 'false,member,0');

    -- 13 ------------------------------------------------------------- leaving
    select org_id into v_org2 from app.demo_sandboxes where user_id = v_a;
    perform set_config('request.jwt.claims', format(claims, v_a), true);
    execute 'set local role authenticated';
    v_txt := public.demo_leave()->>'ok';
    execute 'reset role';
    v_txt := v_txt || ',' || (select count(*) from app.organizations where id = v_org2)
                   || ',' || (select count(*) from auth.users where id = v_a)
                   || ',' || (select count(*) from app.platform_events
                              where id > v_ev0 and kind = 'demo.requested' and payload->>'email' = 'visitor.a@demo-test.example');
    v_rows := v_rows || jsonb_build_object('seq', 13, 'name', 'leaving takes the copy and the login; the lead already sent stays',
      'expected', 'true,0,0,1', 'actual', v_txt, 'pass', v_txt = 'true,0,0,1');

    -- 14 ------------------------------------------------------------- idle
    update app.demo_sandboxes set last_seen_at = now() - interval '15 days' where user_id = v_b;
    v_json := app.demo_expire();
    v_txt := concat_ws(',', (v_json->>'sandboxes')::int >= 1,
      (select count(*) from app.organizations where id = v_org_b), (select count(*) from auth.users where id = v_b));
    v_rows := v_rows || jsonb_build_object('seq', 14, 'name', 'fourteen idle days take the copy and the login',
      'expected', 't,0,0', 'actual', v_txt, 'pass', v_txt = 't,0,0');

    -- 11 ------------------------------------------------------------- nobody counts a demo (0206)
    -- while copies are alive (above), and after every copy made, reset, left and expired: the only
    -- events naming an organisation are for the real one; an event emitted for a live copy is dropped
    select v_alive || '|' || coalesce(string_agg(format('%s:%s', kind, n), ',' order by kind), 'none') into v_txt
    from (select e.kind, count(*) n from app.platform_events e
          where e.id > v_ev0 and e.org_id is not null and e.org_id <> v_fix group by e.kind) x;
    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'the platform is told of no demo organisation: no event names a copy, alive or gone',
      'expected', 'none|none', 'actual', v_txt, 'pass', v_txt = 'none|none');

    raise exception 'rollback' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 17 --------------------------------------------------------------- nothing left
  select count(*) into v_n from (
    select id::text from auth.users where id in (v_a, v_b, v_real, v_c)
    union all select user_id::text from app.demo_sandboxes where user_id in (v_a, v_b, v_real, v_c)
    union all select email from app.demo_requests where email like '%demo-test.example' or email = 'visitor.b@gmail.com'
    union all select payload->>'email' from app.platform_events
              where id > v_ev0 and (payload->>'email' like '%demo-test.example' or payload->>'email' = 'visitor.b@gmail.com')
    union all select org_id::text from app.demo_orgs where kind = 'sandbox'
  ) left_over;
  v_rows := v_rows || jsonb_build_object('seq', 17, 'name', 'every probe row was rolled back',
    'expected', '0', 'actual', v_n::text, 'pass', v_n = 0);

  insert into public._demo
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._demo order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._demo;
  if v_failed is not null then raise exception 'demo invariants failed: %', v_failed; end if;
  if v_count <> 17 then raise exception 'demo invariants: expected 17 rows, got %', v_count; end if;
end $$;

drop table public._demo;
