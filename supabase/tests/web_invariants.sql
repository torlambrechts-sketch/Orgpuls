-- web_invariants.sql — the public site's analytics and signup attribution (0050, D-91, X-059).
--
--   * the three tables have RLS on and no client privilege; anon may send a beacon and
--     nothing else here (1, 2)
--   * web_events has no column that could hold an address, a user agent or an account (3)
--   * bots are dropped; the respondent's link, invitations, auth and admin are never recorded (4, 5)
--   * a path is normalised, Orgpuls's own host is not a referrer, a tag is capped (6)
--   * the visitor hash is the same for one device on one day, and differs between devices (7)
--   * only today's salt exists after a beacon (8)
--   * a visitor is capped at 300 events a day (9)
--   * sources are classified as the specification names them (10)
--   * a new organisation's daglig leder records its source once; an old one cannot (11, 12)
--   * the site's numbers are for admins only, and reading them is audited (13, 14)
--   * the funnel's median hours to first send is never negative (15)
--   * nothing written here survives (16)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/web_invariants.sql

create unlogged table if not exists public._wbi(seq int, name text, expected text, actual text, pass bool);
truncate public._wbi;

do $$
declare
  v_org     uuid := '00000000-0000-4000-8000-000000000001';
  v_analyst uuid := '00000000-0000-4000-8000-0000000ad104';
  v_finance uuid := '00000000-0000-4000-8000-0000000ad103';
  v_dl      uuid;
  v_rows    jsonb := '[]';
  v_json    jsonb;
  v_cnt     int;
  v_ok      boolean;
  v_txt     text;
  v_a       text;
  v_b       text;
  v_ua      constant text := 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
  v_day     date := (now() at time zone 'Europe/Oslo')::date;
  claims    constant text := '{"sub":"%s","role":"authenticated","aal":"%s"}';
begin
  select bool_and(c.relrowsecurity) into v_ok from pg_class c
  where c.oid in ('app.web_events'::regclass, 'app.web_salts'::regclass, 'app.org_attribution'::regclass);
  v_ok := v_ok and not exists (
    select 1 from information_schema.role_table_grants g
    where g.table_schema = 'app' and g.table_name in ('web_events', 'web_salts', 'org_attribution')
      and g.grantee in ('anon', 'authenticated'))
    and not exists (select 1 from pg_policies p where p.schemaname = 'app' and p.tablename in ('web_events', 'web_salts', 'org_attribution'));
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'web tables have RLS on, no policy and no client privilege', 'expected', 'true',
    'actual', v_ok::text, 'pass', v_ok);

  v_txt := concat_ws(',',
    has_function_privilege('anon', 'public.track_web_event(text,text,text,text,text,jsonb,text)', 'execute'),
    has_function_privilege('anon', 'public.record_signup_source(jsonb,jsonb)', 'execute'),
    has_function_privilege('anon', 'public.admin_web(int)', 'execute'),
    has_function_privilege('anon', 'public.admin_org_attribution(uuid)', 'execute'),
    has_function_privilege('authenticated', 'app.web_visitor(text,text)', 'execute'));
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'anon may send a beacon and nothing else here', 'expected', 't,f,f,f,f',
    'actual', v_txt, 'pass', v_txt = 't,f,f,f,f');

  select string_agg(column_name, ',' order by ordinal_position) into v_txt
  from information_schema.columns where table_schema = 'app' and table_name = 'web_events';
  v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'web_events has no column for an address, user agent or account',
    'expected', 'id,product_id,at,day,visitor,kind,path,referrer_host,utm_source,utm_medium,utm_campaign,label',
    'actual', v_txt, 'pass', v_txt = 'id,product_id,at,day,visitor,kind,path,referrer_host,utm_source,utm_medium,utm_campaign,label');

  select m.user_id into v_dl from app.memberships m where m.org_id = v_org and m.role = 'daglig_leder' and m.active limit 1;

  begin
    delete from app.web_events where path like '/web-probe%';

    -- 4, 5 ----------------------------------------------------------- what is never recorded
    perform public.track_web_event('192.0.2.10', 'Googlebot/2.1 (+http://www.google.com/bot.html)', 'view', '/web-probe', null, '{}', null);
    perform public.track_web_event('192.0.2.10', 'curl/8.4.0 something long', 'view', '/web-probe', null, '{}', null);
    select count(*) into v_cnt from app.web_events where path = '/web-probe';
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'bots and scripts are dropped', 'expected', '0',
      'actual', v_cnt::text, 'pass', v_cnt = 0);

    select count(*) into v_cnt from app.web_events;
    perform public.track_web_event('192.0.2.10', v_ua, 'view', '/s/abcdefabcdef', null, '{}', null);
    perform public.track_web_event('192.0.2.10', v_ua, 'view', '/s', null, '{}', null);
    perform public.track_web_event('192.0.2.10', v_ua, 'view', '/bli-med/token', null, '{}', null);
    perform public.track_web_event('192.0.2.10', v_ua, 'view', '/admin/orgs', null, '{}', null);
    perform public.track_web_event('192.0.2.10', v_ua, 'view', '/auth/confirm', null, '{}', null);
    perform public.track_web_event('192.0.2.10', v_ua, 'view', '/web-probe/æøå', null, '{}', null);
    perform public.track_web_event('192.0.2.10', v_ua, 'hover', '/web-probe', null, '{}', null);
    v_cnt := (select count(*) from app.web_events) - v_cnt;
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'the respondent link, invitations, auth, admin and odd input are never recorded',
      'expected', '0', 'actual', v_cnt::text, 'pass', v_cnt = 0);

    -- 6 ---------------------------------------------------------------- normalised
    perform public.track_web_event('192.0.2.10', v_ua, 'view', '/Web-Probe/?orgnr=123456789#x', 'www.orgpuls.com',
      jsonb_build_object('utm_source', repeat('s', 200), 'utm_medium', 'cpc', 'utm_campaign', 'høst', 'email', 'x@y.no'), null);
    perform public.track_web_event('192.0.2.10', v_ua, 'view', '/web-probe/b', 'WWW.Google.no', '{}', null);
    select string_agg(concat_ws('|', path, coalesce(referrer_host, '-'), coalesce(char_length(utm_source)::text, '-'), coalesce(utm_campaign, '-')), ';' order by id)
      into v_txt from app.web_events where path like '/web-probe%';
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'paths normalised, own host dropped as referrer, tags capped',
      'expected', '/web-probe|-|80|høst;/web-probe/b|www.google.no|-|-', 'actual', v_txt,
      'pass', v_txt = '/web-probe|-|80|høst;/web-probe/b|www.google.no|-|-');

    -- 7, 8 ------------------------------------------------------------- the visitor hash
    v_a := app.web_visitor('192.0.2.10', v_ua);
    v_b := app.web_visitor('192.0.2.11', v_ua);
    select count(distinct visitor) into v_cnt from app.web_events where path like '/web-probe%';
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'one device on one day is one visitor; another device is another',
      'expected', 'same, different', 'actual',
      (case when v_cnt = 1 and (select min(visitor) from app.web_events where path like '/web-probe%') = v_a then 'same' else 'not same' end)
      || ', ' || (case when v_a <> v_b then 'different' else 'same' end),
      'pass', v_cnt = 1 and (select min(visitor) from app.web_events where path like '/web-probe%') = v_a and v_a <> v_b);

    insert into app.web_salts (day, salt) values (v_day - 1, 'yesterday') on conflict (day) do nothing;
    perform app.web_visitor('192.0.2.10', v_ua);
    select string_agg(day::text, ',') into v_txt from app.web_salts;
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'only today''s salt exists', 'expected', v_day::text,
      'actual', v_txt, 'pass', v_txt = v_day::text);

    -- 9 ---------------------------------------------------------------- the cap
    for i in 1..310 loop
      perform public.track_web_event('192.0.2.12', v_ua, 'view', '/web-probe/cap', null, '{}', null);
    end loop;
    select count(*) into v_cnt from app.web_events where path = '/web-probe/cap';
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'a visitor is capped at 300 events a day', 'expected', '300',
      'actual', v_cnt::text, 'pass', v_cnt = 300);

    -- 10 --------------------------------------------------------------- channels
    v_txt := concat_ws(',',
      app.web_channel(null, 'google', 'cpc'), app.web_channel(null, 'brevo', 'email'), app.web_channel('www.linkedin.com', null, null),
      app.web_channel('www.google.no', null, null), app.web_channel('www.arbeidstilsynet.no', null, null),
      app.web_channel(null, 'partner', 'referral'), app.web_channel(null, null, null));
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'sources are classified by the specification''s names',
      'expected', 'paid,email,social,organic,referral,campaign,direct', 'actual', v_txt,
      'pass', v_txt = 'paid,email,social,organic,referral,campaign,direct');

    -- 11, 12 ----------------------------------------------------------- attribution
    delete from app.org_attribution where org_id = v_org;
    update app.organizations set created_at = now() - interval '2 hours' where id = v_org;
    perform set_config('request.jwt.claims', format(claims, v_dl, 'aal1'), true);
    v_json := public.record_signup_source('{"landing":"/lovkrav","referrer":"www.google.no"}', '{"utm_source":"x"}');
    v_txt := coalesce(v_json->>'error', 'ok');
    update app.organizations set created_at = now() - interval '5 minutes' where id = v_org;
    v_json := public.record_signup_source('{"landing":"/Lovkrav/","referrer":"www.google.no","utm_campaign":"vår"}', '{"utm_source":"nyhetsbrev","utm_medium":"email"}');
    perform public.record_signup_source('{"landing":"/priser"}', '{}');
    select concat_ws('|', first_landing, first_referrer, first_campaign, last_source, channel) into v_a from app.org_attribution where org_id = v_org;
    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'a new organisation records its source once',
      'expected', 'ok: /lovkrav|www.google.no|vår|nyhetsbrev|organic', 'actual', coalesce(v_json->>'error', 'ok') || ': ' || coalesce(v_a, 'none'),
      'pass', v_json->>'ok' = 'true' and v_a = '/lovkrav|www.google.no|vår|nyhetsbrev|organic');
    v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'an organisation older than an hour cannot', 'expected', 'not_allowed',
      'actual', v_txt, 'pass', v_txt = 'not_allowed');

    -- 13, 14 ----------------------------------------------------------- admin reads
    insert into auth.users (id, email) values (v_analyst, 'analyst@web-test.example'), (v_finance, 'finance@web-test.example');
    insert into app.platform_admins (user_id, role) values (v_analyst, 'analyst'), (v_finance, 'finance');

    perform set_config('request.jwt.claims', format(claims, v_dl, 'aal2'), true);
    v_txt := coalesce(public.admin_web(30)->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_analyst, 'aal1'), true);
    v_txt := v_txt || ',' || coalesce(public.admin_web(30)->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_analyst, 'aal2'), true);
    select count(*) into v_cnt from app.admin_audit where admin_id = v_analyst and action = 'web.view';
    v_json := public.admin_web(30);
    v_txt := v_txt || ',' || coalesce(v_json->>'error', 'ok');
    v_ok := (v_json->'totals'->>'views')::int >= 302 and (v_json->'funnel'->>'sessions')::int >= 1
      and (select count(*) from app.admin_audit where admin_id = v_analyst and action = 'web.view') = v_cnt + 1;
    v_rows := v_rows || jsonb_build_object('seq', 13, 'name', 'site numbers: not a customer, not without aal2; an admin''s read is audited',
      'expected', 'not_allowed,not_allowed,ok audited', 'actual', v_txt || (case when v_ok then ' audited' else ' not audited' end),
      'pass', v_txt = 'not_allowed,not_allowed,ok' and v_ok);

    v_txt := coalesce(public.admin_org_attribution(v_org)->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_finance, 'aal2'), true);
    v_json := public.admin_org_attribution(v_org);
    v_rows := v_rows || jsonb_build_object('seq', 14, 'name', 'one organisation''s source: finance yes, analyst no', 'expected', 'not_allowed, organic',
      'actual', v_txt || ', ' || coalesce(v_json->'row'->>'channel', v_json->>'error'),
      'pass', v_txt = 'not_allowed' and v_json->'row'->>'channel' = 'organic');

    -- 15 --------------------------------------------------------------- funnel
    v_json := public.admin_funnel(24);
    select count(*) into v_cnt from jsonb_array_elements(v_json->'rows') r where (r->>'median_hours_to_first_send')::numeric < 0;
    v_rows := v_rows || jsonb_build_object('seq', 15, 'name', 'the median hours to first send is never negative', 'expected', '0',
      'actual', v_cnt::text, 'pass', v_json->>'ok' = 'true' and v_cnt = 0);

    perform set_config('request.jwt.claims', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  select count(*) into v_cnt from app.web_events where path like '/web-probe%';
  v_rows := v_rows || jsonb_build_object('seq', 16, 'name', 'every probe row was rolled back', 'expected', '0',
    'actual', v_cnt::text,
    'pass', v_cnt = 0 and not exists (select 1 from auth.users where email like '%@web-test.example'));

  insert into public._wbi
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._wbi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._wbi;
  if v_failed is not null then raise exception 'web invariants failed: %', v_failed; end if;
  if v_count <> 16 then raise exception 'web invariants: expected 16 rows, got %', v_count; end if;
end $$;

drop table public._wbi;
