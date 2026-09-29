-- media_invariants.sql — Content › Media (0124, X-095 phase 9, D-169), proved against the live schema.
--
--   * anon may fetch a file by its address and nothing else; nobody reads the table directly (1)
--   * a PNG is added; the same bytes again are the same image, not a second row (2)
--   * the type is read from the bytes: GIF, unreadable base64 and over 2 MB are refused (3)
--   * the file comes back by its exact address; a malformed address is not looked up (4)
--   * a read-only Content role lists and may not change; a signed-in non-admin sees nothing (5)
--   * an image block is valid only with a real address and its size (6)
--   * a page's draft that names it makes it used, and a used image is not deleted (7)
--   * its words are edited, an unused one is deleted, and every change is audited (8)
--   * /media is reserved: no CMS page may take the address (9)
--   * nothing written here survives (10)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/media_invariants.sql

create unlogged table if not exists public._med(seq int, name text, expected text, actual text, pass bool);
truncate public._med;

do $$
declare
  v_mkt uuid := '00000000-0000-4000-8000-0000000c2401';
  v_sup uuid := '00000000-0000-4000-8000-0000000c2402';
  v_user uuid := '00000000-0000-4000-8000-0000000c2403';
  -- a 1×1 PNG
  v_png text := 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  v_r jsonb;
  v_id uuid;
  v_key text;
  v_page uuid;
  v_audit bigint;
  v_txt text;
  v_rows jsonb := '[]';
begin
  begin
    -- 1 -------------------------------------------------------------- who may call what
    v_txt := concat_ws(',',
      has_function_privilege('anon', 'public.cms_media_file(text)', 'execute'),
      has_function_privilege('anon', 'public.admin_media()', 'execute'),
      has_function_privilege('anon', 'public.admin_media_add(text,text,int,int,text,text)', 'execute'),
      has_function_privilege('anon', 'public.admin_media_delete(uuid)', 'execute'),
      has_table_privilege('anon', 'app.cms_media', 'select'),
      has_table_privilege('authenticated', 'app.cms_media', 'select'),
      (select relrowsecurity from pg_class where oid = 'app.cms_media'::regclass),
      (select count(*) from pg_policies where schemaname = 'app' and tablename = 'cms_media'));
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'anon fetches a file only; the table has RLS, no policy and no grant',
      'expected', 't,f,f,f,f,f,t,0', 'actual', v_txt, 'pass', v_txt = 't,f,f,f,f,f,t,0');

    insert into auth.users (id, email) values (v_mkt, 'marketing@med-test.example'), (v_sup, 'support@med-test.example'), (v_user, 'someone@med-test.example');
    insert into app.platform_admins (user_id, role) values (v_mkt, 'marketing'), (v_sup, 'support');
    select coalesce(max(id), 0) into v_audit from app.admin_audit;

    -- 2 -------------------------------------------------------------- added once
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated","aal":"aal2"}', v_mkt), true);
    v_r := public.admin_media_add('dot.png', v_png, 1, 1, 'En prikk', 'A dot');
    v_id := (v_r->>'id')::uuid;
    v_key := v_r->>'key';
    v_txt := concat_ws(',', v_r->>'ok', v_r->>'existing',
      (public.admin_media_add('another-name.png', v_png, 1, 1, '', '')->>'existing'),
      (select count(*) from app.cms_media where key = v_key),
      (select mime from app.cms_media where id = v_id),
      v_key = left(encode(extensions.digest(decode(v_png, 'base64'), 'sha256'), 'hex'), 32));
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'a PNG is added; the same bytes again are the same image',
      'expected', 'true,false,true,1,image/png,t', 'actual', v_txt, 'pass', v_txt = 'true,false,true,1,image/png,t');

    -- 3 -------------------------------------------------------------- the bytes decide
    v_txt := concat_ws(',',
      public.admin_media_add('a.gif', encode('\x474946383961'::bytea, 'base64'), 1, 1, '', '')->>'error',
      public.admin_media_add('a.png', '###', 1, 1, '', '')->>'error',
      public.admin_media_add('a.png', encode('\x89504e470d0a1a0a'::bytea || convert_to(repeat('a', 2097152), 'UTF8'), 'base64'), 1, 1, '', '')->>'error',
      public.admin_media_add('a.png', v_png, 0, 1, '', '')->>'error');
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'GIF, unreadable, over 2 MB and a nonsense size are refused',
      'expected', 'type,unreadable,too_large,invalid', 'actual', v_txt, 'pass', v_txt = 'type,unreadable,too_large,invalid');

    -- 4 -------------------------------------------------------------- the file by its address
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    v_txt := concat_ws(',',
      public.cms_media_file(v_key)->>'mime',
      replace(public.cms_media_file(v_key)->>'data', E'\n', '') = v_png,
      coalesce(public.cms_media_file(upper(v_key))::text, 'null'),
      coalesce(public.cms_media_file(repeat('0', 32))::text, 'null'));
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'the file comes back by its exact address, nothing for another',
      'expected', 'image/png,t,null,null', 'actual', v_txt, 'pass', v_txt = 'image/png,t,null,null');

    -- 5 -------------------------------------------------------------- read-only roles
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated","aal":"aal2"}', v_sup), true);
    v_txt := concat_ws(',',
      jsonb_array_length(public.admin_media()->'rows') >= 1,
      public.admin_media_add('b.png', v_png, 1, 1, '', '')->>'error',
      public.admin_media_describe(v_id, 'x.png', '', '')->>'error',
      public.admin_media_delete(v_id)->>'error');
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated","aal":"aal2"}', v_user), true);
    v_txt := v_txt || ',' || (public.admin_media()->>'error');
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'support lists and may not change; a non-admin sees nothing',
      'expected', 't,not_allowed,not_allowed,not_allowed,not_allowed', 'actual', v_txt,
      'pass', v_txt = 't,not_allowed,not_allowed,not_allowed,not_allowed');

    -- 6 -------------------------------------------------------------- the image block
    v_txt := concat_ws(',',
      app.cms_block_ok(jsonb_build_object('t', 'image', 'key', v_key, 'alt', 'En prikk', 'w', 1, 'h', 1)),
      app.cms_block_ok(jsonb_build_object('t', 'image', 'key', v_key, 'alt', '', 'caption', 'Bildetekst', 'w', 1200, 'h', 800)),
      app.cms_block_ok(jsonb_build_object('t', 'image', 'key', '../etc', 'alt', '', 'w', 1, 'h', 1)),
      app.cms_block_ok(jsonb_build_object('t', 'image', 'key', v_key, 'alt', '', 'w', 0, 'h', 1)),
      app.cms_block_ok(jsonb_build_object('t', 'image', 'key', v_key, 'w', 1, 'h', 1)));
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'an image block needs a real address, its words and its size',
      'expected', 't,t,f,f,f', 'actual', v_txt, 'pass', v_txt = 't,t,f,f,f');

    -- 7 -------------------------------------------------------------- used, and so kept
    insert into app.cms_pages (kind, slug, template, created_by)
      values ('page', 'med-probe', (select key from app.cms_templates order by sort limit 1), v_mkt) returning id into v_page;
    insert into app.cms_page_locales (page_id, locale, draft)
      values (v_page, 'no', jsonb_build_object('title', 'Med', 'h1', 'Med probe', 'blocks', jsonb_build_array(
        jsonb_build_object('t', 'image', 'key', v_key, 'alt', 'En prikk', 'w', 1, 'h', 1))));
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated","aal":"aal2"}', v_mkt), true);
    v_txt := concat_ws(',',
      (select r->'pages'->0->>'title' from jsonb_array_elements(public.admin_media()->'rows') r where r->>'id' = v_id::text),
      public.admin_media_delete(v_id)->>'error');
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'a draft that shows it makes it used, and a used image is not deleted',
      'expected', 'Med probe,in_use', 'actual', v_txt, 'pass', v_txt = 'Med probe,in_use');

    -- 8 -------------------------------------------------------------- described, deleted, audited
    delete from app.cms_page_locales where page_id = v_page;
    -- one statement each: a statement does not see what the functions it calls wrote
    v_txt := public.admin_media_describe(v_id, 'prikk.png', 'En gul prikk', 'A yellow dot')->>'ok';
    v_txt := v_txt || ',' || (select alt_en from app.cms_media where id = v_id);
    v_txt := v_txt || ',' || (public.admin_media_delete(v_id)->>'ok');
    v_txt := v_txt || ',' || (select count(*) from app.cms_media where id = v_id);
    v_txt := v_txt || ',' || (select string_agg(a.action, '+' order by a.id) from app.admin_audit a where a.id > v_audit and a.action like 'media.%');
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'its words are edited, an unused one deleted, each change audited',
      'expected', 'true,A yellow dot,true,0,media.add+media.describe+media.delete', 'actual', v_txt,
      'pass', v_txt = 'true,A yellow dot,true,0,media.add+media.describe+media.delete');

    -- 9 -------------------------------------------------------------- the address is the files'
    v_txt := app.cms_reserved('page', 'media')::text;
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', '/media is reserved from CMS pages', 'expected', 'true', 'actual', v_txt, 'pass', v_txt = 'true');

    raise exception 'rollback';
  exception when others then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 10 --------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id::text from app.cms_media where name in ('dot.png', 'prikk.png')
    union all select id::text from app.cms_pages where slug = 'med-probe'
    union all select id::text from auth.users where email like '%@med-test.example') x;
  v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._med
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._med order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._med;
  if v_failed is not null then raise exception 'media invariants failed: %', v_failed; end if;
  if v_count <> 10 then raise exception 'media invariants: expected 10 rows, got %', v_count; end if;
end $$;
