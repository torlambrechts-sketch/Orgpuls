-- content_invariants.sql — Content as the Sentral design draws it (0123, X-095 phase 7), proved
-- against the live schema.
--
--   * anon may read the public notice and nothing else of it (1)
--   * while the notice is off the public read returns nothing, in either language (2)
--   * a notice switched on must say something in bokmål; a text over 300 characters is refused (3)
--   * switched on, the reader gets it in their language, bokmål where English is empty (4)
--   * a read-only Content role sees it and may not change it; a signed-in non-admin sees nothing (5)
--   * switching it on and off is in the audit log (6)
--   * the Pages list names the last reviser, else whoever made the page (7)
--   * nothing written here survives (8)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/content_invariants.sql

create unlogged table if not exists public._cnt(seq int, name text, expected text, actual text, pass bool);
truncate public._cnt;

do $$
declare
  v_mkt uuid := '00000000-0000-4000-8000-0000000c1301';
  v_sup uuid := '00000000-0000-4000-8000-0000000c1302';
  v_user uuid := '00000000-0000-4000-8000-0000000c1303';
  v_page uuid;
  v_txt text;
  v_rows jsonb := '[]';
  v_audit bigint;
begin
  begin
    -- 1 -------------------------------------------------------------- who may call what
    v_txt := concat_ws(',',
      has_function_privilege('anon', 'public.site_notice(text)', 'execute'),
      has_function_privilege('anon', 'public.admin_site_notice()', 'execute'),
      has_function_privilege('anon', 'public.admin_site_notice_set(boolean, text, text)', 'execute'),
      has_table_privilege('anon', 'app.platform_settings', 'select'),
      has_table_privilege('authenticated', 'app.platform_settings', 'select'));
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'anon reads the public notice only; nobody reads the settings row directly',
      'expected', 't,f,f,f,f', 'actual', v_txt, 'pass', v_txt = 't,f,f,f,f');

    insert into auth.users (id, email) values (v_mkt, 'marketing@cnt-test.example'), (v_sup, 'support@cnt-test.example'), (v_user, 'someone@cnt-test.example');
    insert into app.platform_admins (user_id, role) values (v_mkt, 'marketing'), (v_sup, 'support');
    select coalesce(max(id), 0) into v_audit from app.admin_audit;

    -- 2 -------------------------------------------------------------- off: nothing
    update app.platform_settings set notice_on = false, notice_no = 'Gammel melding', notice_en = 'Old notice' where id;
    v_txt := coalesce(public.site_notice('no'), 'null') || ',' || coalesce(public.site_notice('en'), 'null');
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'while it is off, the public read returns nothing',
      'expected', 'null,null', 'actual', v_txt, 'pass', v_txt = 'null,null');

    -- 3 -------------------------------------------------------------- a notice says something
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated","aal":"aal2"}', v_mkt), true);
    v_txt := concat_ws(',',
      public.admin_site_notice_set(true, '  ', 'Only English')->>'error',
      public.admin_site_notice_set(true, repeat('x', 301), null)->>'error',
      public.admin_site_notice_set(null, 'Tekst', null)->>'error');
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'on needs bokmål; over 300 characters or no state is refused',
      'expected', 'text_required,invalid,invalid', 'actual', v_txt, 'pass', v_txt = 'text_required,invalid,invalid');

    -- 4 -------------------------------------------------------------- on: in the reader's language
    v_txt := public.admin_site_notice_set(true, ' Vi oppgraderer i kveld. ', 'We upgrade tonight.')->>'ok';
    v_txt := v_txt || '|' || public.site_notice('no') || '|' || public.site_notice('en') || '|' || public.site_notice('pl');
    perform public.admin_site_notice_set(true, 'Vi oppgraderer i kveld.', '   ');
    v_txt := v_txt || '|' || public.site_notice('en');
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'on: bokmål, English, bokmål for other languages and where English is empty',
      'expected', 'true|Vi oppgraderer i kveld.|We upgrade tonight.|Vi oppgraderer i kveld.|Vi oppgraderer i kveld.', 'actual', v_txt,
      'pass', v_txt = 'true|Vi oppgraderer i kveld.|We upgrade tonight.|Vi oppgraderer i kveld.|Vi oppgraderer i kveld.');

    -- 5 -------------------------------------------------------------- read-only roles
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated","aal":"aal2"}', v_sup), true);
    v_txt := concat_ws(',',
      (public.admin_site_notice()->>'on'),
      (public.admin_site_notice()->>'by'),
      public.admin_site_notice_set(false, null, null)->>'error');
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated","aal":"aal2"}', v_user), true);
    v_txt := v_txt || ',' || (public.admin_site_notice()->>'error') || ',' || (public.admin_site_notice_set(false, null, null)->>'error');
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'support sees it and may not change it; a non-admin sees nothing',
      'expected', 'true,marketing@cnt-test.example,not_allowed,not_allowed,not_allowed', 'actual', v_txt,
      'pass', v_txt = 'true,marketing@cnt-test.example,not_allowed,not_allowed,not_allowed');

    -- 6 -------------------------------------------------------------- audited
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated","aal":"aal2"}', v_mkt), true);
    perform public.admin_site_notice_set(false, 'Vi oppgraderer i kveld.', null);
    select string_agg(a.action || ':' || a.admin_email, ',' order by a.id) into v_txt
      from app.admin_audit a where a.id > v_audit and a.action like 'site.notice%';
    v_txt := v_txt || ',' || coalesce(public.site_notice('no'), 'null');
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'on and off are audited with who did it, and off hides it again',
      'expected', 'site.notice_on:marketing@cnt-test.example,site.notice_on:marketing@cnt-test.example,site.notice_off:marketing@cnt-test.example,null',
      'actual', v_txt,
      'pass', v_txt = 'site.notice_on:marketing@cnt-test.example,site.notice_on:marketing@cnt-test.example,site.notice_off:marketing@cnt-test.example,null');

    -- 7 -------------------------------------------------------------- the author on the Pages list
    insert into app.cms_pages (kind, slug, template, created_by)
      values ('page', 'cnt-author-probe', (select key from app.cms_templates order by sort limit 1), v_sup) returning id into v_page;
    v_txt := (select r->>'author' from jsonb_array_elements(public.admin_cms_pages()->'rows') r where r->>'id' = v_page::text);
    insert into app.cms_revisions (page_id, locale, action, content, by)
      values (v_page, 'no', 'save', (select content_no from app.cms_templates order by sort limit 1), v_mkt);
    v_txt := v_txt || ',' || (select r->>'author' from jsonb_array_elements(public.admin_cms_pages()->'rows') r where r->>'id' = v_page::text);
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'the author is whoever made the page, then whoever last saved it',
      'expected', 'support@cnt-test.example,marketing@cnt-test.example', 'actual', v_txt,
      'pass', v_txt = 'support@cnt-test.example,marketing@cnt-test.example');

    raise exception 'rollback';
  exception when others then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 8 ---------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id::text from app.cms_pages where slug = 'cnt-author-probe'
    union all select id::text from auth.users where email like '%@cnt-test.example'
    union all select id::text from app.admin_audit where admin_email like '%@cnt-test.example') x;
  v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._cnt
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._cnt order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._cnt;
  if v_failed is not null then raise exception 'content invariants failed: %', v_failed; end if;
  if v_count <> 8 then raise exception 'content invariants: expected 8 rows, got %', v_count; end if;
end $$;
