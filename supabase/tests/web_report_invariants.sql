-- web_report_invariants.sql — the Analytics pages' reader and the beacon's device class (0121, X-095),
-- proved against the live schema.
--
--   * the user agent gives desktop, mobile or tablet, and nothing when there is none (1)
--   * the beacon stores the class and still no user agent or address (2)
--   * per page: views, unique, time to the next view, exits and entries within a visit (3)
--   * the funnel counts /priser and /registrer per visitor and day, and trials without demo sandboxes (4)
--   * a comparison is given only where the events and demo requests are still kept (5)
--   * anon may not ask; a signed-in non-admin is refused (6)
--   * nothing written here survives (7)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/web_report_invariants.sql

create unlogged table if not exists public._wrp(seq int, name text, expected text, actual text, pass bool);
truncate public._wrp;

do $$
declare
  v_mkt uuid := '00000000-0000-4000-8000-0000000a7501';
  v_user uuid := '00000000-0000-4000-8000-0000000a7502';
  v_before jsonb;
  v_after jsonb;
  v_row jsonb;
  v_txt text;
  v_rows jsonb := '[]';
  v_t timestamptz := date_trunc('minute', now()) - interval '2 hours';
  v_day date := (now() at time zone 'Europe/Oslo')::date;
begin
  begin
    -- 1 -------------------------------------------------------------- the class
    v_txt := concat_ws(',',
      app.web_device('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36'),
      app.web_device('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'),
      app.web_device('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36'),
      app.web_device('Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/128 Safari/537.36'),
      app.web_device('Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X)'),
      coalesce(app.web_device(''), 'none'));
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'the user agent gives desktop, mobile or tablet, nothing when empty',
      'expected', 'desktop,mobile,mobile,tablet,tablet,none', 'actual', v_txt, 'pass', v_txt = 'desktop,mobile,mobile,tablet,tablet,none');

    -- 2 -------------------------------------------------------------- the beacon stores the class, not the agent
    perform public.track_web_event('203.0.113.77', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Mobile/15E148',
                                   'view', '/wrt-beacon', null, '{}'::jsonb, null, null);
    v_txt := coalesce((select e.device from app.web_events e where e.path = '/wrt-beacon' order by e.id desc limit 1), 'none')
          || ',' || (select count(*) from information_schema.columns c
                     where c.table_schema = 'app' and c.table_name = 'web_events'
                       and (c.column_name ilike '%agent%' or c.column_name in ('ua', 'ip', 'ip_address')))::text
          || ',' || (select count(*) from app.web_events e where e.path = '/wrt-beacon' and e.network = '203.0.113.77')::text;
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'the beacon keeps the device class and neither the user agent nor the address',
      'expected', 'mobile,0,0', 'actual', v_txt, 'pass', v_txt = 'mobile,0,0');

    insert into auth.users (id, email) values (v_mkt, 'marketing@wrp-test.example'), (v_user, 'someone@wrp-test.example');
    insert into app.platform_admins (user_id, role) values (v_mkt, 'marketing');
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated","aal":"aal2"}', v_mkt), true);
    v_before := public.admin_web_report(14);

    -- visitor A: / → /wrt-b after 60 s → /priser after 120 s more → /registrer after 30 s; visitor B: / only;
    -- visitor A again after an hour's gap: /wrt-b, a visit of its own
    insert into app.web_events (visitor, kind, path, at, day, device) values
      (md5('wrt-a'), 'view', '/wrt-a', v_t, v_day, 'desktop'),
      (md5('wrt-a'), 'view', '/wrt-b', v_t + interval '60 seconds', v_day, 'desktop'),
      (md5('wrt-a'), 'view', '/priser', v_t + interval '180 seconds', v_day, 'desktop'),
      (md5('wrt-a'), 'view', '/registrer', v_t + interval '210 seconds', v_day, 'desktop'),
      (md5('wrt-b'), 'view', '/wrt-a', v_t + interval '5 seconds', v_day, 'mobile'),
      (md5('wrt-a'), 'view', '/wrt-b', v_t + interval '90 minutes', v_day, 'desktop');
    v_after := public.admin_web_report(14);

    -- 3 -------------------------------------------------------------- per page
    select x into v_row from jsonb_array_elements(v_after->'pages') x where x->>'path' = '/wrt-a';
    v_txt := concat_ws(',', v_row->>'views', v_row->>'uniq', v_row->>'seconds', v_row->>'exits', v_row->>'entries');
    select x into v_row from jsonb_array_elements(v_after->'pages') x where x->>'path' = '/wrt-b';
    v_txt := v_txt || '|' || concat_ws(',', v_row->>'views', v_row->>'uniq', v_row->>'seconds', v_row->>'exits', v_row->>'entries');
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'views, unique, seconds to the next view, exits and entries per page',
      'expected', '2,2,60,1,2|2,1,120,1,1', 'actual', v_txt, 'pass', v_txt = '2,2,60,1,2|2,1,120,1,1');

    -- 4 -------------------------------------------------------------- the funnel and the demo sandboxes
    v_txt := concat_ws(',',
      (v_after->'funnel'->>'visitors')::int - (v_before->'funnel'->>'visitors')::int,
      (v_after->'funnel'->>'pricing')::int - (v_before->'funnel'->>'pricing')::int,
      (v_after->'funnel'->>'signup')::int - (v_before->'funnel'->>'signup')::int,
      ((v_after->'funnel'->>'trials')::int = (select count(*) from app.organizations o
          where o.created_at >= ((v_day - 13)::timestamp at time zone 'Europe/Oslo') and not app.is_demo(o.id)))::text,
      ((v_after->'goals'->'trials'->>'n') = (v_after->'funnel'->>'trials'))::text);
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'the funnel counts visitors, /priser and /registrer per visitor and day; trials leave demos out',
      'expected', '2,1,1,true,true', 'actual', v_txt, 'pass', v_txt = '2,1,1,true,true');

    -- 5 -------------------------------------------------------------- comparisons only where the data is kept
    v_txt := concat_ws(',',
      (v_after->'previous' is not null and jsonb_typeof(v_after->'previous') = 'object')::text,
      jsonb_typeof(public.admin_web_report(366)->'previous'),
      jsonb_typeof(v_after->'goals'->'demos'->'prev'),
      jsonb_typeof(public.admin_web_report(30)->'goals'->'demos'->'prev'),
      jsonb_typeof(public.admin_web_report(90)->'goals'->'demos'->'n'));
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'no comparison past the 400 days of events, nor demo figures past their 30 days',
      'expected', 'true,null,number,null,null', 'actual', v_txt, 'pass', v_txt = 'true,null,number,null,null');

    -- 6 -------------------------------------------------------------- who may ask
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated","aal":"aal2"}', v_user), true);
    v_txt := has_function_privilege('anon', 'public.admin_web_report(int)', 'execute')::text
          || ',' || coalesce(public.admin_web_report(14)->>'error', 'ok');
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'anon may not ask; a signed-in non-admin is refused',
      'expected', 'false,not_allowed', 'actual', v_txt, 'pass', v_txt = 'false,not_allowed');

    raise exception 'rollback';
  exception when others then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 7 ---------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id::text from app.web_events where path like '/wrt-%' or visitor in (md5('wrt-a'), md5('wrt-b'))
    union all select id::text from auth.users where email like '%@wrp-test.example') x;
  v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._wrp
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._wrp order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._wrp;
  if v_failed is not null then raise exception 'web report invariants failed: %', v_failed; end if;
  if v_count <> 7 then raise exception 'web report invariants: expected 7 rows, got %', v_count; end if;
end $$;
