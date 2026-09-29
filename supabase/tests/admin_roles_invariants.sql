-- admin_roles_invariants.sql — the editor role and the indexing switch (0125, 0126; X-095 phase 10,
-- D-170), proved against the live schema.
--
--   * the editor may read and write Content and read SEO (1)
--   * the editor is refused every reader of customers, admins, the trail and the business figures (2)
--   * the roles that could read them still can: no regression for marketing and support (3)
--   * search engines are allowed until a super-admin says otherwise; anon reads the switch only (4)
--   * only a super-admin switches it; it is audited; the settings reader shows it (5)
--   * nothing written here survives (6)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/admin_roles_invariants.sql

create unlogged table if not exists public._arl(seq int, name text, expected text, actual text, pass bool);
truncate public._arl;

do $$
declare
  v_ed uuid := '00000000-0000-4000-8000-0000000c2601';
  v_mkt uuid := '00000000-0000-4000-8000-0000000c2602';
  v_sup uuid := '00000000-0000-4000-8000-0000000c2603';
  v_su uuid := '00000000-0000-4000-8000-0000000c2604';
  v_org uuid;
  v_audit bigint;
  v_txt text;
  v_rows jsonb := '[]';
  claims constant text := '{"sub":"%s","role":"authenticated","aal":"aal2"}';
begin
  begin
    insert into auth.users (id, email) values (v_ed, 'editor@arl-test.example'), (v_mkt, 'marketing@arl-test.example'),
      (v_sup, 'support@arl-test.example'), (v_su, 'owner@arl-test.example');
    insert into app.platform_admins (user_id, role) values (v_ed, 'editor'), (v_mkt, 'marketing'), (v_sup, 'support'), (v_su, 'super_admin');
    select id into v_org from app.organizations order by created_at limit 1;
    select coalesce(max(id), 0) into v_audit from app.admin_audit;

    -- 1 -------------------------------------------------------------- Content and SEO
    perform set_config('request.jwt.claims', format(claims, v_ed), true);
    v_txt := concat_ws(',',
      app.cms_can_read(), app.cms_can_write(),
      public.admin_cms_pages()->>'ok', public.admin_media()->>'ok',
      coalesce(public.admin_seo(28)->>'error', 'ok'));
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'the editor reads and writes Content and reads SEO',
      'expected', 't,t,true,true,ok', 'actual', v_txt, 'pass', v_txt = 't,t,true,true,ok');

    -- 2 -------------------------------------------------------------- and nothing about customers
    v_txt := concat_ws(',',
      public.admin_org_detail(v_org)->>'error', public.admin_org_list(null, null)->>'error',
      public.admin_audit_list(null, 10)->>'error', public.admin_audit_list(v_org, 10)->>'error',
      public.admin_kpis()->>'error', public.admin_funnel(30)->>'error', public.admin_trends(12)->>'error',
      public.admin_web(30)->>'error', public.admin_web_report(14)->>'error', public.admin_attention()->>'error',
      public.admin_list_admins()->>'error', public.admin_account_health()->>'error',
      public.admin_crm_companies(null, null, null)->>'error', public.admin_tickets(null, null, null)->>'error',
      public.admin_translations('pl')->>'error', public.admin_site_settings()->>'error');
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'the editor is refused customers, admins, the trail and the figures',
      'expected', repeat('not_allowed,', 15) || 'not_allowed', 'actual', v_txt, 'pass', v_txt = repeat('not_allowed,', 15) || 'not_allowed');

    -- 3 -------------------------------------------------------------- the others as before
    perform set_config('request.jwt.claims', format(claims, v_mkt), true);
    v_txt := concat_ws(',', coalesce(public.admin_kpis()->>'error', 'ok'), coalesce(public.admin_web_report(14)->>'error', 'ok'), coalesce(public.admin_seo(28)->>'error', 'ok'));
    perform set_config('request.jwt.claims', format(claims, v_sup), true);
    v_txt := v_txt || ',' || coalesce(public.admin_audit_list(v_org, 10)->>'error', 'ok') || ',' || coalesce(public.admin_org_detail(v_org)->>'error', 'ok')
          || ',' || coalesce(public.admin_audit_list(null, 10)->>'error', 'ok');
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'marketing and support read what they read before',
      'expected', 'ok,ok,ok,ok,ok,not_allowed', 'actual', v_txt, 'pass', v_txt = 'ok,ok,ok,ok,ok,not_allowed');

    -- 4 -------------------------------------------------------------- indexing: allowed by default, anon reads it
    update app.platform_settings set allow_indexing = true where id;
    v_txt := concat_ws(',',
      has_function_privilege('anon', 'public.site_indexing()', 'execute'),
      has_function_privilege('anon', 'public.admin_site_indexing_set(boolean)', 'execute'),
      has_function_privilege('anon', 'public.admin_site_settings()', 'execute'),
      public.site_indexing());
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'anon reads the indexing switch only, and it starts on',
      'expected', 't,f,f,t', 'actual', v_txt, 'pass', v_txt = 't,f,f,t');

    -- 5 -------------------------------------------------------------- a super-admin's, audited
    perform set_config('request.jwt.claims', format(claims, v_ed), true);
    v_txt := public.admin_site_indexing_set(false)->>'error';
    perform set_config('request.jwt.claims', format(claims, v_mkt), true);
    v_txt := v_txt || ',' || (public.admin_site_indexing_set(false)->>'error');
    perform set_config('request.jwt.claims', format(claims, v_su), true);
    v_txt := v_txt || ',' || (public.admin_site_indexing_set(false)->>'ok');
    v_txt := v_txt || ',' || public.site_indexing()::text;
    v_txt := v_txt || ',' || (public.admin_site_settings()->>'allow_indexing') || ',' || (public.admin_site_settings()->>'indexing_by');
    v_txt := v_txt || ',' || (select string_agg(a.action || ':' || a.admin_email, '+' order by a.id) from app.admin_audit a where a.id > v_audit and a.action like 'site.indexing%');
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'only a super-admin turns indexing off; it is audited and read back',
      'expected', 'not_allowed,not_allowed,true,false,false,owner@arl-test.example,site.indexing_off:owner@arl-test.example', 'actual', v_txt,
      'pass', v_txt = 'not_allowed,not_allowed,true,false,false,owner@arl-test.example,site.indexing_off:owner@arl-test.example');

    raise exception 'rollback';
  exception when others then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 6 ---------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id::text from auth.users where email like '%@arl-test.example'
    union all select id::text from app.admin_audit where admin_email like '%@arl-test.example'
    union all select 'x' from app.platform_settings where not allow_indexing) x;
  v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'every probe row was rolled back, indexing is on', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._arl
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._arl order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._arl;
  if v_failed is not null then raise exception 'admin roles invariants failed: %', v_failed; end if;
  if v_count <> 6 then raise exception 'admin roles invariants: expected 6 rows, got %', v_count; end if;
end $$;
