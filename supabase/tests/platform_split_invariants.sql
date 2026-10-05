-- platform_split_invariants.sql — admin, CRM, CMS, growth, tickets and site analytics left Orgpuls (0206, X-104,
-- D-230), proved against the live schema.
--
--   * none of it remains: no admin, CRM, CMS, growth, ticket, prospect, consent or analytics table, no admin_*
--     function but the two the operations call, no client entry point of the CRM, the CMS or the beacon (1)
--   * no function left names a table or function that went: PostgreSQL does not track a function's body (2)
--   * every platform command names a function in the unexposed schema that no client role may execute, and the
--     admin role answers for a verified platform command only (3, 4)
--   * the contact form hands its message to the platform as contact.submitted, with only its own fields; a bot's
--     message is dropped, a malformed address refused, and one address limited to three an hour (5)
--   * Hjelp sends support.requested for a member's organisation, and refuses anybody who is not a member (6)
--   * «hvordan hørte du om oss» sends org.attribution with the answer alone, for the organisation just made (7)
--   * the removed jobs are unscheduled, and the wheel's tick runs alone (8)
--   * what a person wrote waits for the platform past 30 days until delivered; anything else is dropped (9)
--   * nothing written here survives (10)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/platform_split_invariants.sql

create unlogged table if not exists public._psi(seq int, name text, expected text, actual text, pass bool);
truncate public._psi;

do $$
declare
  claims  constant text := '{"sub":"%s","role":"authenticated","aal":"aal1"}';
  removed constant text := '\m(app\.)?(platform_admins|admin_audit|admin_org_notes|account_owners|partners|canned_replies|'
                           || 'tickets|ticket_[a-z_]+|csat_misses|cms_[a-z_]+|consent_purposes|consent_records|mail_templates|'
                           || 'mail_auth_[a-z_]+|mail_streams|marketing_spend|brreg_[a-z_]+|event_catalogue|product_events|kpi_daily|'
                           || 'org_attribution|web_events|web_salts|seo_runs|seo_search|growth_[a-z_]+|crm_[a-z_]+|web_visitor|'
                           || 'track_web_event|track_product_event|record_crm_event|health_score|lead_score)\M';
  v_org   uuid := gen_random_uuid();
  v_dl    uuid := gen_random_uuid();
  v_out   uuid := gen_random_uuid();
  v_rows  jsonb := '[]'::jsonb;
  v_txt   text;
  v_json  jsonb;
  v_n     int;
begin
  -- 1 ---------------------------------------------------------------- none of it remains
  select count(*) into v_n from pg_class c
  where c.relnamespace = 'app'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')
    and c.relname ~ ('^(' || 'platform_admins|admin_audit|admin_org_notes|account_owners|partners|canned_replies|tickets|ticket_.*|'
                     || 'csat_.*|cms_.*|consent_.*|mail_templates|mail_auth_.*|mail_streams|marketing_spend|brreg_.*|event_catalogue|'
                     || 'product_events|kpi_daily|org_attribution|web_.*|seo_.*|growth_.*|crm_.*' || ')$');
  v_txt := 'tables=' || v_n;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('app', 'public') and p.proname like 'admin\_%' and p.proname not in ('admin_role', 'admin_log');
  v_txt := v_txt || ',admin_fns=' || v_n;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname ~ '^(crm_|cms_|csat_|track_|seo_|brreg_|growth_|record_crm|record_signup_source)';
  v_txt := v_txt || ',entry_points=' || v_n;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'no table, admin function or client entry point of what left remains',
    'expected', 'tables=0,admin_fns=0,entry_points=0', 'actual', v_txt, 'pass', v_txt = 'tables=0,admin_fns=0,entry_points=0');

  -- 2 ---------------------------------------------------------------- nothing left names it
  select coalesce(string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text), 'none') into v_txt
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('app', 'public') and p.prosrc ~ removed;
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'no function body names a removed table or function',
    'expected', 'none', 'actual', v_txt, 'pass', v_txt = 'none');

  -- 3 ---------------------------------------------------------------- the operations
  select count(*) filter (where to_regprocedure(m.fn) is null or m.fn not like 'app.op\_%'),
         count(*) filter (where to_regprocedure(m.fn) is not null and (
                  has_function_privilege('anon', to_regprocedure(m.fn), 'execute')
               or has_function_privilege('authenticated', to_regprocedure(m.fn), 'execute')
               or has_function_privilege('service_role', to_regprocedure(m.fn), 'execute')))
    into v_n, v_json
  from app.platform_command_map m;
  -- v_json carries the second count as a number
  v_txt := 'missing=' || v_n || ',executable=' || v_json::text;
  v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'every command names an app.op_* function no client role may execute',
    'expected', 'missing=0,executable=0', 'actual', v_txt, 'pass', v_txt = 'missing=0,executable=0');

  -- 4 ---------------------------------------------------------------- the admin role
  perform set_config('request.jwt.claims', format(claims, v_dl), true);
  perform set_config('app.platform_actor', '', true);
  v_txt := coalesce(app.admin_role()::text, 'null');
  perform set_config('app.platform_actor', 'test@platform', true);
  v_txt := v_txt || ',' || coalesce(app.admin_role()::text, 'null');
  perform set_config('app.platform_actor', '', true);
  v_txt := v_txt || ',' || coalesce(app.op_auto_approve() ->> 'error', 'ok');
  perform set_config('request.jwt.claims', '', true);
  v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'the admin role is a verified platform command''s only: none without one, and an operation refuses',
    'expected', 'null,super_admin,not_allowed', 'actual', v_txt, 'pass', v_txt = 'null,super_admin,not_allowed');

  begin
    -- 5 -------------------------------------------------------------- the contact form
    set local role anon;
    v_txt := coalesce(public.submit_contact(1, 'Kari', 'Kari@Kontakt-Test.example', 'Firma AS', 'Hei', null) ->> 'error', 'ok');
    v_txt := v_txt || ',' || coalesce(public.submit_contact(0, 'Bot', 'bot@kontakt-test.example', '', 'spam', 'filled') ->> 'error', 'ok');
    v_txt := v_txt || ',' || coalesce(public.submit_contact(0, 'Kari', 'ikke-en-adresse', '', 'Hei', null) ->> 'error', 'ok');
    perform public.submit_contact(0, 'Kari', 'kari@kontakt-test.example', '', 'To', null);
    perform public.submit_contact(0, 'Kari', 'kari@kontakt-test.example', '', 'Tre', null);
    v_txt := v_txt || ',' || coalesce(public.submit_contact(0, 'Kari', 'kari@kontakt-test.example', '', 'Fire', null) ->> 'error', 'ok');
    reset role;
    select e.payload into v_json from app.platform_events e
    where e.kind = 'contact.submitted' and e.payload ->> 'email' = 'kari@kontakt-test.example' order by e.id limit 1;
    v_txt := v_txt || ',' || (select string_agg(k, ' ' order by k) from jsonb_object_keys(v_json) k)
             || ',' || (v_json ->> 'topic') || ',' || (select count(*) from app.platform_events e
                                                       where e.kind = 'contact.submitted' and e.payload ->> 'email' like '%kontakt-test.example')
             || ',' || (select count(*) from app.platform_events e where e.kind = 'contact.submitted' and e.org_id is not null);
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'the contact form sends contact.submitted; a bot is dropped, a bad address refused, three an hour',
      'expected', 'ok,ok,invalid,rate_limited,email message name organisation topic,pricing,3,0', 'actual', v_txt,
      'pass', v_txt = 'ok,ok,invalid,rate_limited,email message name organisation topic,pricing,3,0');

    -- 6 -------------------------------------------------------------- Hjelp
    insert into app.organizations (id, name, org_number, employee_count, mail_enabled, timezone)
    values (v_org, 'Splitt AS', '999000206', 12, true, 'Europe/Oslo');
    insert into auth.users (id, email) values (v_dl, 'dl@splitt-test.example'), (v_out, 'ute@splitt-test.example');
    insert into app.profiles (id, full_name) values (v_dl, 'DL') on conflict (id) do nothing;
    insert into app.memberships (org_id, user_id, role, active) values (v_org, v_dl, 'daglig_leder', true);
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_txt := coalesce(public.submit_help_request('bug', 'Feil', 'Noe virker ikke', '/resultater?x=1', 'Probe') ->> 'error', 'ok');
    v_txt := v_txt || ',' || coalesce(public.submit_help_request('ukjent', '', 'x', '', '') ->> 'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_out), true);
    v_txt := v_txt || ',' || coalesce(public.submit_help_request('bug', '', 'x', '', '') ->> 'error', 'ok');
    perform set_config('request.jwt.claims', '', true);
    select e.payload into v_json from app.platform_events e where e.kind = 'support.requested' and e.org_id = v_org;
    v_txt := v_txt || ',' || (v_json ->> 'page') || ',' || (v_json ->> 'role') || ',' || (v_json ->> 'email')
             || ',' || (select count(*) from app.platform_events e where e.kind = 'support.requested' and e.payload ->> 'user_id' in (v_dl::text, v_out::text));
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'Hjelp sends support.requested for the member''s organisation, path only; a stranger is refused',
      'expected', 'ok,invalid,not_allowed,/resultater,daglig_leder,dl@splitt-test.example,1', 'actual', v_txt,
      'pass', v_txt = 'ok,invalid,not_allowed,/resultater,daglig_leder,dl@splitt-test.example,1');

    -- 7 -------------------------------------------------------------- how they heard
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_txt := coalesce(public.record_signup_heard('linkedin') ->> 'error', 'ok');
    v_txt := v_txt || ',' || coalesce(public.record_signup_heard('reklame') ->> 'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_out), true);
    v_txt := v_txt || ',' || coalesce(public.record_signup_heard('linkedin') ->> 'error', 'ok');
    perform set_config('request.jwt.claims', '', true);
    v_txt := v_txt || ',' || (select string_agg(e.payload::text, ';') from app.platform_events e where e.kind = 'org.attribution' and e.org_id = v_org);
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'the sign-up''s answer goes to the platform as org.attribution, the answer alone',
      'expected', 'ok,invalid,not_allowed,{"heard": "linkedin"}', 'actual', v_txt,
      'pass', v_txt = 'ok,invalid,not_allowed,{"heard": "linkedin"}');

    -- 9 -------------------------------------------------------------- what waits
    insert into app.platform_events (kind, org_id, payload, created_at) values
      ('contact.submitted', null, '{"email": "gammel@kontakt-test.example"}', now() - interval '40 days'),
      ('usage.daily', v_org, '{"employees": 1}', now() - interval '40 days');
    update app.platform_events set delivered_at = now() - interval '39 days'
    where kind = 'contact.submitted' and payload ->> 'email' = 'kari@kontakt-test.example';
    update app.platform_events set created_at = now() - interval '40 days'
    where kind = 'contact.submitted' and payload ->> 'email' = 'kari@kontakt-test.example';
    perform public.platform_events_claim(1);
    v_txt := (select count(*) from app.platform_events e where e.payload ->> 'email' = 'gammel@kontakt-test.example')::text
             || ',' || (select count(*) from app.platform_events e where e.kind = 'usage.daily' and e.org_id = v_org and e.created_at < now() - interval '30 days')
             || ',' || (select count(*) from app.platform_events e where e.payload ->> 'email' = 'kari@kontakt-test.example');
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'an undelivered message waits past 30 days; old counts and delivered messages go',
      'expected', '1,0,0', 'actual', v_txt, 'pass', v_txt = '1,0,0');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 8 ---------------------------------------------------------------- the jobs
  select count(*) into v_n from cron.job
  where jobname in ('orgpuls-brreg-triggers', 'orgpuls-crm-dispatch', 'orgpuls-crm-purge', 'orgpuls-kpi-capture',
                    'orgpuls-lead-route', 'orgpuls-seo', 'orgpuls-web-retention');
  v_txt := v_n || ',' || coalesce((select btrim(command) from cron.job where jobname = 'orgpuls-wheel'), 'none');
  v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'the removed jobs are gone and the wheel ticks alone',
    'expected', '0,select app.wheel_tick()', 'actual', v_txt, 'pass', v_txt = '0,select app.wheel_tick()');

  -- 10 --------------------------------------------------------------- nothing survives
  select count(*) into v_n from (
    select 1 from app.organizations where id = v_org
    union all select 1 from auth.users where email like '%splitt-test.example'
    union all select 1 from app.platform_events where payload ->> 'email' like '%kontakt-test.example') x;
  v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'every probe row was rolled back',
    'expected', '0', 'actual', v_n::text, 'pass', v_n = 0);

  insert into public._psi
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._psi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._psi;
  if v_failed is not null then raise exception 'platform split invariants failed: %', v_failed; end if;
  if v_count <> 10 then raise exception 'platform split invariants: expected 10 rows, got %', v_count; end if;
end $$;

drop table public._psi;
