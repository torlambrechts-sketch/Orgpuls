-- seo_invariants.sql — search data in the admin (0061, D-106).
--
--   * both tables have RLS on, no policy and no client privilege (1)
--   * only the sync may write; the page is for admins (2)
--   * Search Console rows are checked on the way in and upserted, not duplicated (3)
--   * the page: not a customer, not without aal2; marketing may, and the read is audited (4)
--   * content performance from the site's own sessions, joined with Search Console by path (5)
--   * a page that lost 30 % of its entries is decaying (6)
--   * a query answered by two of our pages is flagged; top queries are listed (7)
--   * visits from AI assistants are counted by source (8)
--   * the status line shows the last sync and IndexNow runs (9)
--   * nothing written here survives (10)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/seo_invariants.sql

create unlogged table if not exists public._seo(seq int, name text, expected text, actual text, pass bool);
truncate public._seo;

do $$
declare
  v_admin   uuid := '00000000-0000-4000-8000-0000005e0ad1';
  v_dl      uuid;
  v_rows    jsonb := '[]';
  v_json    jsonb;
  v_cnt     int;
  v_ok      boolean;
  v_txt     text;
  v_day     date := (now() at time zone 'Europe/Oslo')::date;
  claims    constant text := '{"sub":"%s","role":"authenticated","aal":"%s"}';
begin
  select bool_and(c.relrowsecurity) into v_ok from pg_class c where c.oid in ('app.seo_search'::regclass, 'app.seo_runs'::regclass);
  v_ok := v_ok and not exists (
    select 1 from information_schema.role_table_grants g
    where g.table_schema = 'app' and g.table_name in ('seo_search', 'seo_runs') and g.grantee in ('anon', 'authenticated'))
    and not exists (select 1 from pg_policies p where p.schemaname = 'app' and p.tablename in ('seo_search', 'seo_runs'));
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'seo tables have RLS on, no policy and no client privilege',
    'expected', 'true', 'actual', v_ok::text, 'pass', v_ok);

  v_txt := concat_ws(',',
    has_function_privilege('authenticated', 'public.seo_search_upsert(jsonb)', 'execute'),
    has_function_privilege('authenticated', 'public.seo_run_record(text,boolean,int,text)', 'execute'),
    has_function_privilege('anon', 'public.admin_seo(int)', 'execute'),
    has_function_privilege('service_role', 'public.seo_search_upsert(jsonb)', 'execute'));
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'only the sync writes; the page is not for anon',
    'expected', 'f,f,f,t', 'actual', v_txt, 'pass', v_txt = 'f,f,f,t');

  select m.user_id into v_dl from app.memberships m where m.role = 'daglig_leder' and m.active limit 1;

  begin
    delete from app.seo_search;
    delete from app.seo_runs;

    -- 3 ------------------------------------------------------------------ the way in
    v_cnt := public.seo_search_upsert(jsonb_build_array(
      jsonb_build_object('day', v_day - 3, 'page', '/seo-probe/a', 'query', 'kartlegging arbeidsmiljø', 'country', 'NOR', 'device', 'mobile', 'clicks', 4, 'impressions', 50, 'position', 6.2),
      jsonb_build_object('day', v_day - 3, 'page', '/seo-probe/b', 'query', 'kartlegging arbeidsmiljø', 'country', 'nor', 'device', 'DESKTOP', 'clicks', 1, 'impressions', 30, 'position', 11),
      jsonb_build_object('day', v_day - 3, 'page', 'no slash', 'query', 'x', 'country', 'nor', 'device', 'DESKTOP', 'clicks', 1, 'impressions', 1, 'position', 1),
      jsonb_build_object('day', v_day - 3, 'page', '/seo-probe/a', 'query', 'x', 'country', 'nor', 'device', 'FRIDGE', 'clicks', 1, 'impressions', 1, 'position', 1)));
    perform public.seo_search_upsert(jsonb_build_array(
      jsonb_build_object('day', v_day - 3, 'page', '/seo-probe/a', 'query', 'kartlegging arbeidsmiljø', 'country', 'nor', 'device', 'MOBILE', 'clicks', 5, 'impressions', 55, 'position', 6)));
    select v_cnt || '|' || count(*) || '|' || sum(clicks) into v_txt from app.seo_search;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'rows are checked on the way in and upserted',
      'expected', '2|2|6', 'actual', v_txt, 'pass', v_txt = '2|2|6');

    -- sessions: /seo-probe/a twelve in the previous period, two now; /seo-probe/c from ChatGPT now
    insert into app.web_events (visitor, day, at, kind, path, referrer_host)
    select md5('prev' || g), v_day - 40, now() - interval '40 days', 'view', '/seo-probe/a', 'www.google.no' from generate_series(1, 12) g;
    insert into app.web_events (visitor, day, at, kind, path, referrer_host)
    select md5('now' || g), v_day - 2, now() - interval '2 days', 'view', '/seo-probe/a', 'www.google.no' from generate_series(1, 2) g;
    insert into app.web_events (visitor, day, at, kind, path, referrer_host)
    values (md5('ai1'), v_day - 1, now() - interval '1 day', 'view', '/seo-probe/c', 'chatgpt.com');

    -- 4 ------------------------------------------------------------------ who may read it
    insert into auth.users (id, email) values (v_admin, 'mkt@seo-test.example');
    insert into app.platform_admins (user_id, role) values (v_admin, 'marketing');
    perform set_config('request.jwt.claims', format(claims, v_dl, 'aal2'), true);
    v_txt := coalesce(public.admin_seo(28)->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_admin, 'aal1'), true);
    v_txt := v_txt || ',' || coalesce(public.admin_seo(28)->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_admin, 'aal2'), true);
    perform public.seo_run_record('gsc', false, 0, 'not_configured');
    perform public.seo_run_record('indexnow', true, 17, null);
    v_json := public.admin_seo(28);
    v_txt := v_txt || ',' || coalesce(v_json->>'error', 'ok')
      || (case when exists (select 1 from app.admin_audit where admin_id = v_admin and action = 'seo.view') then ' audited' else '' end);
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'the page: not a customer, not without aal2; marketing may, audited',
      'expected', 'not_allowed,not_allowed,ok audited', 'actual', v_txt, 'pass', v_txt = 'not_allowed,not_allowed,ok audited');

    -- 5 ------------------------------------------------------------------ pages
    select concat_ws('|', p->>'entries', p->>'entries_prev', p->>'organic', p->>'clicks', p->>'impressions', p->>'position') into v_txt
    from jsonb_array_elements(v_json->'pages') p where p->>'page' = '/seo-probe/a';
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'content performance: own sessions and Search Console by path',
      'expected', '2|12|2|5|55|6.0', 'actual', coalesce(v_txt, 'none'), 'pass', v_txt = '2|12|2|5|55|6.0');

    -- 6 ------------------------------------------------------------------ decay
    select string_agg(d->>'page', ',') into v_txt from jsonb_array_elements(v_json->'decaying') d where d->>'page' like '/seo-probe/%';
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'a page that lost 30 % of its entries is decaying',
      'expected', '/seo-probe/a', 'actual', coalesce(v_txt, 'none'), 'pass', v_txt = '/seo-probe/a');

    -- 7 ------------------------------------------------------------------ queries
    select concat_ws('|', q->>'query', q->>'clicks', q->>'pages', q->>'top_page') into v_txt from jsonb_array_elements(v_json->'queries') q limit 1;
    v_txt := v_txt || ';' || coalesce((select string_agg(c->>'query' || ':' || jsonb_array_length(c->'pages'), ',') from jsonb_array_elements(v_json->'cannibal') c), 'none');
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'top queries; a query answered by two pages is flagged',
      'expected', 'kartlegging arbeidsmiljø|6|2|/seo-probe/a;kartlegging arbeidsmiljø:2', 'actual', v_txt,
      'pass', v_txt = 'kartlegging arbeidsmiljø|6|2|/seo-probe/a;kartlegging arbeidsmiljø:2');

    -- 8 ------------------------------------------------------------------ AI assistants
    select string_agg((a->>'source') || ':' || (a->>'sessions'), ',') into v_txt from jsonb_array_elements(v_json->'ai') a;
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'visits from AI assistants are counted by source',
      'expected', 'chatgpt.com:1', 'actual', coalesce(v_txt, 'none'), 'pass', v_txt = 'chatgpt.com:1');

    -- 9 ------------------------------------------------------------------ status
    v_txt := concat_ws('|', v_json->'status'->'gsc'->>'error', v_json->'status'->'indexnow'->>'count', v_json->'status'->>'rows');
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'the status line shows the last runs',
      'expected', 'not_configured|17|2', 'actual', v_txt, 'pass', v_txt = 'not_configured|17|2');

    perform set_config('request.jwt.claims', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'every probe row was rolled back', 'expected', '0',
    'actual', ((select count(*) from app.web_events where path like '/seo-probe%') + (select count(*) from app.seo_search where page like '/seo-probe%'))::text,
    'pass', not exists (select 1 from app.web_events where path like '/seo-probe%')
      and not exists (select 1 from app.seo_search where page like '/seo-probe%')
      and not exists (select 1 from auth.users where email like '%@seo-test.example'));

  insert into public._seo
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._seo order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._seo;
  if v_failed is not null then raise exception 'seo invariants failed: %', v_failed; end if;
  if v_count <> 10 then raise exception 'seo invariants: expected 10 rows, got %', v_count; end if;
end $$;

drop table public._seo;
