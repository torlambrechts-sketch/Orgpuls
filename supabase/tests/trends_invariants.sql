-- trends_invariants.sql — the dashboard over time, and cost per customer (0062, D-107).
--
--   * both tables have RLS on, no policy and no client privilege (1)
--   * the capture is not a client's to call; the admin functions are not anon's (2)
--   * a capture writes the day's row with admin_kpis' own figures, once per day (3)
--   * trends: not a customer, not without aal2; the weekly series counts real signups (4)
--   * spend: analyst may not write, marketing may; the month is its first day; nonsense is refused (5)
--   * acquisition joins spend with first-touch signups and paid customers per month and channel (6)
--   * spend can be deleted, once, and every write is audited (7)
--   * nothing written here survives (8)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/trends_invariants.sql

create unlogged table if not exists public._tri(seq int, name text, expected text, actual text, pass bool);
truncate public._tri;

do $$
declare
  v_org     uuid := '00000000-0000-4000-8000-000000000001';
  v_mkt     uuid := '00000000-0000-4000-8000-0000007e0d01';
  v_ana     uuid := '00000000-0000-4000-8000-0000007e0d02';
  v_dl      uuid;
  v_rows    jsonb := '[]';
  v_json    jsonb;
  v_kpis    jsonb;
  v_cnt     int;
  v_ok      boolean;
  v_txt     text;
  v_id      uuid;
  v_month   date := date_trunc('month', now() at time zone 'Europe/Oslo')::date;
  v_day     date := (now() at time zone 'Europe/Oslo')::date;
  claims    constant text := '{"sub":"%s","role":"authenticated","aal":"%s"}';
begin
  select bool_and(c.relrowsecurity) into v_ok from pg_class c where c.oid in ('app.kpi_daily'::regclass, 'app.marketing_spend'::regclass);
  v_ok := v_ok and not exists (
    select 1 from information_schema.role_table_grants g
    where g.table_schema = 'app' and g.table_name in ('kpi_daily', 'marketing_spend') and g.grantee in ('anon', 'authenticated'))
    and not exists (select 1 from pg_policies p where p.schemaname = 'app' and p.tablename in ('kpi_daily', 'marketing_spend'));
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'trend tables have RLS on, no policy and no client privilege',
    'expected', 'true', 'actual', v_ok::text, 'pass', v_ok);

  v_txt := concat_ws(',',
    has_function_privilege('authenticated', 'app.kpi_capture(date)', 'execute'),
    has_function_privilege('anon', 'public.admin_trends(int)', 'execute'),
    has_function_privilege('anon', 'public.admin_spend_add(date,text,text,int,text)', 'execute'),
    has_function_privilege('anon', 'public.admin_acquisition(int)', 'execute'));
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'capture is not a client''s; admin functions are not anon''s',
    'expected', 'f,f,f,f', 'actual', v_txt, 'pass', v_txt = 'f,f,f,f');

  select m.user_id into v_dl from app.memberships m where m.org_id = v_org and m.role = 'daglig_leder' and m.active limit 1;

  begin
    delete from app.kpi_daily;
    delete from app.marketing_spend;
    insert into auth.users (id, email) values (v_mkt, 'mkt@trends-test.example'), (v_ana, 'ana@trends-test.example');
    insert into app.platform_admins (user_id, role) values (v_mkt, 'marketing'), (v_ana, 'analyst');

    -- 3 ------------------------------------------------------------------ capture
    perform app.kpi_capture();
    perform app.kpi_capture();
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal2'), true);
    v_kpis := public.admin_kpis();
    select concat_ws('|', count(*), bool_and(k.mrr = (v_kpis->>'mrr')::int and k.paying = (v_kpis->>'paying')::int)) into v_txt
    from app.kpi_daily k where k.day = v_day;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'a capture writes the day with admin_kpis'' figures, once',
      'expected', '1|t', 'actual', v_txt, 'pass', v_txt = '1|t');

    -- 4 ------------------------------------------------------------------ trends
    perform set_config('request.jwt.claims', format(claims, v_dl, 'aal2'), true);
    v_txt := coalesce(public.admin_trends(8)->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal1'), true);
    v_txt := v_txt || ',' || coalesce(public.admin_trends(8)->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal2'), true);
    v_json := public.admin_trends(8);
    select count(*) into v_cnt from jsonb_array_elements(v_json->'weekly') w;
    v_txt := v_txt || ',' || coalesce(v_json->>'error', 'ok') || ',' || v_cnt || ',' || jsonb_array_length(v_json->'daily')
      || ',' || ((select sum((w->>'signups')::int) from jsonb_array_elements(v_json->'weekly') w)
                 = (select count(*) from app.organizations o
                    where o.created_at at time zone 'Europe/Oslo' >= date_trunc('week', now() at time zone 'Europe/Oslo') - interval '7 weeks'))::text;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'trends: not a customer, not without aal2; weekly signups are real',
      'expected', 'not_allowed,not_allowed,ok,8,1,true', 'actual', v_txt, 'pass', v_txt = 'not_allowed,not_allowed,ok,8,1,true');

    -- 5 ------------------------------------------------------------------ spend
    perform set_config('request.jwt.claims', format(claims, v_ana, 'aal2'), true);
    v_txt := coalesce(public.admin_spend_add(v_day, 'paid', null, 1000, null)->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_mkt, 'aal2'), true);
    v_txt := v_txt || ',' || coalesce(public.admin_spend_add(v_day, 'tv', null, 1000, null)->>'error', 'ok');
    v_txt := v_txt || ',' || coalesce(public.admin_spend_add(v_day, 'paid', null, -5, null)->>'error', 'ok');
    v_json := public.admin_spend_add(v_day, 'paid', 'LinkedIn høst', 12000, 'LinkedIn ads');
    v_id := (v_json->>'id')::uuid;
    v_txt := v_txt || ',' || coalesce(v_json->>'error', 'ok') || ',' || (select month::text from app.marketing_spend where id = v_id);
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'spend: analyst no, marketing yes, month normalised, nonsense refused',
      'expected', 'not_allowed,invalid,invalid,ok,' || v_month, 'actual', v_txt, 'pass', v_txt = 'not_allowed,invalid,invalid,ok,' || v_month);

    -- 6 ------------------------------------------------------------------ acquisition
    update app.organizations set created_at = now() where id = v_org;
    insert into app.org_attribution (org_id, channel) values (v_org, 'paid')
      on conflict (org_id) do update set channel = 'paid';
    update app.billing set plan = 'small', invoice_email = 'faktura@trends-test.example', confirmed_at = now() where org_id = v_org;
    v_json := public.admin_acquisition(3);
    select concat_ws('|', r->>'spend', (r->>'signups')::int >= 1, (r->>'paid')::int >= 1) into v_txt
    from jsonb_array_elements(v_json->'rows') r where r->>'month' = v_month::text and r->>'channel' = 'paid';
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'acquisition: spend with first-touch signups and paid, by month and channel',
      'expected', '12000|t|t', 'actual', coalesce(v_txt, 'none'), 'pass', v_txt = '12000|t|t');

    -- 7 ------------------------------------------------------------------ delete, audit
    -- each call its own statement: a statement's subqueries do not see its own calls' writes
    v_txt := coalesce(public.admin_spend_delete(v_id)->>'error', 'ok');
    v_txt := v_txt || ',' || coalesce(public.admin_spend_delete(v_id)->>'error', 'ok');
    v_txt := v_txt || ',' || (select count(*) from app.admin_audit where admin_id = v_mkt and action in ('spend.add', 'spend.delete'));
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'spend is deleted once; writes are audited',
      'expected', 'ok,not_found,2', 'actual', v_txt, 'pass', v_txt = 'ok,not_found,2');

    perform set_config('request.jwt.claims', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'every probe row was rolled back', 'expected', '0',
    'actual', (select count(*) from auth.users where email like '%@trends-test.example')::text,
    'pass', not exists (select 1 from auth.users where email like '%@trends-test.example')
      and not exists (select 1 from app.marketing_spend where campaign = 'LinkedIn høst'));

  insert into public._tri
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._tri order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._tri;
  if v_failed is not null then raise exception 'trends invariants failed: %', v_failed; end if;
  if v_count <> 8 then raise exception 'trends invariants: expected 8 rows, got %', v_count; end if;
end $$;

drop table public._tri;
