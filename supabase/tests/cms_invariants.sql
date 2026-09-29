-- cms_invariants.sql — the template-based CMS (0114, X-094), proved against the live schema.
--
--   * every CMS table has RLS and no policy, and no client role may read one; the public reads only
--     what is live through cms_page, cms_list, cms_redirect and cms_preview (1)
--   * a page is made from a template; an address the site's code owns, or one taken, is refused;
--     an analyst reads and cannot write (2)
--   * a template's [placeholders] stop publishing; filled in, a language goes live and only that
--     language is served; content outside the site's block shapes is refused (3)
--   * a translation starts from the other language and is not published until checked; then both
--     languages are twins (4)
--   * a scheduled copy is not served before its time and is at it, with no job (5)
--   * revisions are append-only; restoring puts an old version in the draft and leaves the live
--     page alone (6)
--   * renaming a live page keeps its old address as a counted 301 (7)
--   * a preview link shows the draft, never indexed; a wrong or expired link shows nothing (8)
--   * archiving takes a page off the site and out of the list; deleting a page takes its history
--     with it (9)
--   * nothing written here survives (10)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/cms_invariants.sql

create unlogged table if not exists public._cms(seq int, name text, expected text, actual text, pass bool);
truncate public._cms;

do $$
declare
  v_mkt   uuid := '00000000-0000-4000-8000-0000000c7401';
  v_ana   uuid := '00000000-0000-4000-8000-0000000c7402';
  v_id    uuid;
  v_json  jsonb;
  v_txt   text;
  v_tok   text;
  v_rev   bigint;
  v_n     int;
  v_rows  jsonb := '[]';
  a       text[];
  filled  constant jsonb := '{"title":"Kartlegging av arbeidsmiljøet på en time | Orgpuls","description":"Slik kartlegger dere det psykososiale arbeidsmiljøet anonymt, med rapport og tiltak klare for Arbeidstilsynet.","crumb":"Kartlegging","kicker":"For daglige ledere","h1":"Kartlegg arbeidsmiljøet på en time","lead":"Loven krever kartlegging. Orgpuls gjør den for dere.","blocks":[{"t":"h2","text":"Slik fungerer det"},{"t":"p","text":"Les om [lovkravet](/lovkrav)."}],"faq":[{"q":"Er det anonymt?","a":"Ja, ingen grupper under fem vises."}]}';
  claims  constant text := '{"sub":"%s","role":"authenticated","aal":"aal2"}';
begin
  -- 1 ---------------------------------------------------------------- closed tables
  select string_agg(c.relname || ':' || c.relrowsecurity::text || ':' || (select count(*) from pg_policies p where p.schemaname = 'app' and p.tablename = c.relname)::text
                    || ':' || has_table_privilege('anon', c.oid, 'select')::text || ':' || has_table_privilege('authenticated', c.oid, 'select')::text, ',' order by c.relname)
    into v_txt
  from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'app' and c.relname like 'cms\_%' and c.relkind = 'r';
  v_txt := v_txt || '|' || has_function_privilege('anon', 'public.cms_page(text,text,text)', 'execute')::text
        || ',' || has_function_privilege('anon', 'public.admin_cms_pages()', 'execute')::text
        || ',' || has_function_privilege('anon', 'public.admin_cms_save(uuid,text,jsonb,jsonb)', 'execute')::text;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'six tables with RLS, no policy, no client read; anon reads live pages only',
    'expected', 'cms_page_locales:true:0:false:false,cms_pages:true:0:false:false,cms_previews:true:0:false:false,cms_redirects:true:0:false:false,cms_revisions:true:0:false:false,cms_templates:true:0:false:false|true,false,false',
    'actual', v_txt,
    'pass', v_txt = 'cms_page_locales:true:0:false:false,cms_pages:true:0:false:false,cms_previews:true:0:false:false,cms_redirects:true:0:false:false,cms_revisions:true:0:false:false,cms_templates:true:0:false:false|true,false,false');

  begin
    insert into auth.users (id, email) values (v_mkt, 'marketing@cms-test.example'), (v_ana, 'analyst@cms-test.example');
    insert into app.platform_admins (user_id, role) values (v_mkt, 'marketing'), (v_ana, 'analyst');

    -- 2 -------------------------------------------------------------- making a page
    perform set_config('request.jwt.claims', format(claims, v_mkt), true);
    v_json := public.admin_cms_create('{"template":"landingsside","slug":"probe-kartlegging","locales":["no"]}');
    v_id := (v_json->>'id')::uuid;
    v_txt := concat_ws(',', v_json->>'ok',
      public.admin_cms_create('{"template":"landingsside","slug":"plattform"}')->>'error',
      public.admin_cms_create('{"template":"artikkel","slug":"anonym-medarbeiderundersokelse"}')->>'error',
      public.admin_cms_create('{"template":"landingsside","slug":"probe-kartlegging"}')->>'error',
      public.admin_cms_create('{"template":"landingsside","slug":"Probe Rom"}')->>'error');
    perform set_config('request.jwt.claims', format(claims, v_ana), true);
    v_txt := concat_ws(',', v_txt, (public.admin_cms_pages()->>'ok'), public.admin_cms_create('{"template":"landingsside","slug":"probe-ana"}')->>'error',
                       public.admin_cms_save(v_id, 'no', filled, '{}')->>'error');
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'made from a template; owned, taken or malformed addresses refused; an analyst only reads',
      'expected', 'true,slug_reserved,slug_reserved,slug_taken,invalid_slug,true,not_allowed,not_allowed', 'actual', v_txt,
      'pass', v_txt = 'true,slug_reserved,slug_reserved,slug_taken,invalid_slug,true,not_allowed,not_allowed');

    -- 3 -------------------------------------------------------------- publishing
    -- one call per statement: a stable function reads the snapshot its statement began with
    perform set_config('request.jwt.claims', format(claims, v_mkt), true);
    a := array[]::text[];
    a := a || (public.admin_cms_publish(v_id, 'no')->>'error');
    a := a || coalesce(public.cms_page('page', 'probe-kartlegging', 'no')->>'id', 'none');
    a := a || (public.admin_cms_save(v_id, 'no', '{"title":"x","blocks":[{"t":"script","text":"x"}]}', '{}')->>'error');
    a := a || (public.admin_cms_save(v_id, 'no', '{"title":"x","blocks":[{"t":"links","items":[{"title":"a","text":"b","href":"https://evil.example"}]}]}', '{}')->>'error');
    a := a || (public.admin_cms_save(v_id, 'no', filled, '{"focus_keyword":"kartlegging"}')->>'ok');
    a := a || (public.admin_cms_publish(v_id, 'no')->>'ok');
    a := a || (public.cms_page('page', 'probe-kartlegging', 'no')->'content'->>'h1');
    a := a || coalesce(public.cms_page('page', 'probe-kartlegging', 'en')->>'id', 'none');
    a := a || (public.cms_page('page', 'probe-kartlegging', 'no')->>'twin');
    v_txt := array_to_string(a, ',');
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'placeholders stop publishing; odd blocks refused; filled in, bokmål goes live alone',
      'expected', 'placeholder_left,none,invalid_content,invalid_content,true,true,Kartlegg arbeidsmiljøet på en time,none,false', 'actual', v_txt,
      'pass', v_txt = 'placeholder_left,none,invalid_content,invalid_content,true,true,Kartlegg arbeidsmiljøet på en time,none,false');

    -- 4 -------------------------------------------------------------- translation
    a := array[]::text[];
    a := a || (public.admin_cms_translate(v_id, 'en')->>'ok');
    a := a || (select translation from app.cms_page_locales where page_id = v_id and locale = 'en');
    a := a || (public.admin_cms_publish(v_id, 'en')->>'error');
    a := a || (public.admin_cms_save(v_id, 'en', filled || '{"h1":"Survey your work environment in an hour"}', '{"translation":"reviewed"}')->>'ok');
    a := a || (public.admin_cms_publish(v_id, 'en')->>'ok');
    a := a || (public.cms_page('page', 'probe-kartlegging', 'en')->'content'->>'h1');
    a := a || (public.cms_page('page', 'probe-kartlegging', 'no')->>'twin');
    a := a || (public.admin_cms_translate(v_id, 'en')->>'error');
    v_txt := array_to_string(a, ',');
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'English starts from bokmål, waits until checked, then both are twins',
      'expected', 'true,draft,translation_unchecked,true,true,Survey your work environment in an hour,true,exists', 'actual', v_txt,
      'pass', v_txt = 'true,draft,translation_unchecked,true,true,Survey your work environment in an hour,true,exists');

    -- 5 -------------------------------------------------------------- scheduling
    perform public.admin_cms_save(v_id, 'no', filled || '{"h1":"Ny overskrift fra mandag"}', '{}');
    a := array[]::text[];
    a := a || (public.admin_cms_publish(v_id, 'no', now() + interval '1 hour')->>'ok');
    a := a || (public.cms_page('page', 'probe-kartlegging', 'no')->'content'->>'h1');
    update app.cms_page_locales set pending_at = now() - interval '1 minute' where page_id = v_id and locale = 'no';
    a := a || (public.cms_page('page', 'probe-kartlegging', 'no')->'content'->>'h1');
    v_txt := array_to_string(a, ',');
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'a scheduled copy waits for its time, then is served without a job',
      'expected', 'true,Kartlegg arbeidsmiljøet på en time,Ny overskrift fra mandag', 'actual', v_txt,
      'pass', v_txt = 'true,Kartlegg arbeidsmiljøet på en time,Ny overskrift fra mandag');

    -- 6 -------------------------------------------------------------- revisions
    select min(id) into v_rev from app.cms_revisions where page_id = v_id and locale = 'no';
    a := array[]::text[];
    begin
      update app.cms_revisions set content = '{}' where id = v_rev;
      a := a || 'changed'::text;
    exception when restrict_violation then a := a || 'kept'::text;
    end;
    begin
      delete from app.cms_revisions where id = v_rev;
      a := a || 'deleted'::text;
    exception when restrict_violation then a := a || 'kept'::text;
    end;
    a := a || (public.admin_cms_restore(v_rev)->>'ok');
    a := a || (select app.cms_placeholder_left(draft)::text from app.cms_page_locales where page_id = v_id and locale = 'no');
    a := a || (public.cms_page('page', 'probe-kartlegging', 'no')->'content'->>'h1');
    a := a || (select string_agg(distinct action, '/' order by action) from app.cms_revisions where page_id = v_id);
    v_txt := array_to_string(a, ',');
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'revisions cannot change or go; restoring fills the draft and leaves the live page',
      'expected', 'kept,kept,true,true,Ny overskrift fra mandag,publish/restore/save/schedule', 'actual', v_txt,
      'pass', v_txt = 'kept,kept,true,true,Ny overskrift fra mandag,publish/restore/save/schedule');

    -- 7 -------------------------------------------------------------- renaming keeps the old address
    a := array[]::text[];
    a := a || (public.admin_cms_save(v_id, null, null, '{"slug":"probe-kartlegging-2026"}')->>'ok');
    a := a || (public.cms_redirect('/probe-kartlegging')->>'to');
    a := a || (public.cms_redirect('/probe-kartlegging')->>'permanent');
    a := a || (select hits::text from app.cms_redirects where from_path = '/probe-kartlegging');
    a := a || coalesce(public.cms_redirect('/finnes-ikke')->>'to', 'none');
    a := a || (public.admin_cms_redirect_save('/probe-gammel', '/probe-kartlegging', true)->>'error');
    a := a || (public.admin_cms_redirect_save('/probe-gammel', 'javascript:alert(1)', true)->>'error');
    v_txt := array_to_string(a, ',');
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'a live page renamed leaves a counted 301; no chains, no scripts',
      'expected', 'true,/probe-kartlegging-2026,true,2,none,chain,invalid_to', 'actual', v_txt,
      'pass', v_txt = 'true,/probe-kartlegging-2026,true,2,none,chain,invalid_to');

    -- 8 -------------------------------------------------------------- preview
    v_tok := public.admin_cms_preview_token(v_id)->>'token';
    v_txt := concat_ws(',',
      (public.cms_preview(v_tok, 'no')->>'noindex'),
      (public.cms_preview(v_tok, 'no')->>'preview'),
      coalesce(public.cms_preview(repeat('0', 64), 'no')->>'id', 'none'),
      coalesce(public.cms_preview('drop table', 'no')->>'id', 'none'));
    update app.cms_previews set expires_at = now() - interval '1 second';
    v_txt := concat_ws(',', v_txt, coalesce(public.cms_preview(v_tok, 'no')->>'id', 'none'));
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'a preview link shows the draft, noindex; a wrong or expired one shows nothing',
      'expected', 'true,true,none,none,none', 'actual', v_txt, 'pass', v_txt = 'true,true,none,none,none');

    -- 9 -------------------------------------------------------------- archive and delete
    perform set_config('request.jwt.claims', format(claims, v_mkt), true);
    v_n := (select jsonb_array_length(public.cms_list('page', 'no')));
    a := array[]::text[];
    a := a || (public.admin_cms_archive(v_id, true)->>'ok');
    a := a || coalesce(public.cms_page('page', 'probe-kartlegging-2026', 'no')->>'id', 'none');
    a := a || ((select jsonb_array_length(public.cms_list('page', 'no'))) = v_n - 1)::text;
    a := a || (public.admin_cms_publish(v_id, 'no')->>'error');
    perform set_config('request.jwt.claims', '', true);
    delete from app.cms_pages where id = v_id;
    a := a || (select count(*)::text from app.cms_revisions where page_id = v_id);
    v_txt := array_to_string(a, ',');
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'archived: off the site and the list, not publishable; deleted: its history goes with it',
      'expected', 'true,none,true,archived,0', 'actual', v_txt, 'pass', v_txt = 'true,none,true,archived,0');

    raise exception 'rollback' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 10 --------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id::text from app.cms_pages where slug like 'probe-%'
    union all select from_path from app.cms_redirects where from_path like '/probe-%'
    union all select id::text from auth.users where id in (v_mkt, v_ana)) x;
  v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._cms
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._cms order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._cms;
  if v_failed is not null then raise exception 'cms invariants failed: %', v_failed; end if;
  if v_count <> 10 then raise exception 'cms invariants: expected 10 rows, got %', v_count; end if;
end $$;

drop table public._cms;
