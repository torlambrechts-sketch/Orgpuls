-- 0124 — Content › Media (X-095, phase 9; D-169)
--
-- The design's media library: files a page can show, each with its size, the words a reader who
-- cannot see it is given, and the pages it is used on. Kept here, not in Storage, as the
-- organisation logo is (0104): served from the site's own origin at /media/<key>.<ext>, so the
-- public pages' CSP keeps img-src 'self', and the row lives under RLS like everything else.
--
--   what         images only — PNG, JPEG or WebP, the type read from the first bytes, never from
--                what the browser said. No SVG (a document that can carry script, served from our
--                own origin), no video, no PDF. The browser makes the web version before it sends
--                it (at most 2000 px wide, WebP), so a row is small by rule: 2 MB.
--   the address  32 hex characters of the SHA-256 of the bytes: the same file uploaded twice is one
--                row, and a new file is a new address, cached for a year.
--   in use       a page uses an image when its words, in either language, draft, pending or live,
--                name the address in an image block. Counted, never stored; an image in use is
--                not deleted.
--   who          Content's writers (super-admin, marketing) add, describe and delete; its readers
--                list. Every change is audited. Anyone may fetch an image by its exact address:
--                it is on a public page, or about to be.

create table app.cms_media (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique check (key ~ '^[0-9a-f]{32}$'),
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  mime        text not null check (mime in ('image/png', 'image/jpeg', 'image/webp')),
  content     bytea not null check (octet_length(content) between 1 and 2097152),
  width       int not null check (width between 1 and 4000),
  height      int not null check (height between 1 and 4000),
  alt_no      text not null default '' check (char_length(alt_no) <= 300),
  alt_en      text not null default '' check (char_length(alt_en) <= 300),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index cms_media_created_by_idx on app.cms_media (created_by);
alter table app.cms_media enable row level security;
revoke all on app.cms_media from public, anon, authenticated;
comment on table app.cms_media is
  'Content › Media (0124): images a CMS page shows, served at /media/<key>. RLS and no policy: read and written through admin_media* and cms_media_file only.';

-- ---------------------------------------------------------------- where an image is used
create function app.cms_media_pages(p_key text) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind, 'slug', p.slug, 'archived', p.archived_at is not null,
                                               'title', coalesce(nullif((select l.draft->>'h1' from app.cms_page_locales l
                                                                         where l.page_id = p.id order by l.locale = 'no' desc limit 1), ''), p.slug))
                            order by p.updated_at desc), '[]')
  from app.cms_pages p
  where exists (select 1 from app.cms_page_locales l
                where l.page_id = p.id
                  and position(p_key in l.draft::text || coalesce(l.live::text, '') || coalesce(l.pending::text, '')) > 0)
$fn$;
revoke all on function app.cms_media_pages(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- the library
create function public.admin_media() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not app.cms_can_read() then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  return jsonb_build_object('ok', true, 'rows',
    (select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'key', m.key, 'name', m.name, 'mime', m.mime, 'bytes', octet_length(m.content),
        'width', m.width, 'height', m.height, 'alt_no', m.alt_no, 'alt_en', m.alt_en, 'created_at', m.created_at,
        'by', (select u.email from auth.users u where u.id = m.created_by),
        'pages', app.cms_media_pages(m.key))
      order by m.created_at desc), '[]') from app.cms_media m));
end $fn$;

create function public.admin_media_add(p_name text, p_data text, p_width int, p_height int, p_alt_no text, p_alt_en text) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_bytes bytea;
  v_mime  text;
  v_key   text;
  v_id    uuid;
  v_name  text := btrim(coalesce(p_name, ''));
begin
  if not app.cms_can_write() then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  begin
    v_bytes := decode(coalesce(p_data, ''), 'base64');
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'unreadable');
  end;
  if octet_length(v_bytes) = 0 then return jsonb_build_object('ok', false, 'error', 'unreadable'); end if;
  if octet_length(v_bytes) > 2097152 then return jsonb_build_object('ok', false, 'error', 'too_large'); end if;
  v_mime := case
    when substring(v_bytes from 1 for 8) = '\x89504e470d0a1a0a'::bytea then 'image/png'
    when substring(v_bytes from 1 for 3) = '\xffd8ff'::bytea then 'image/jpeg'
    when substring(v_bytes from 1 for 4) = '\x52494646'::bytea
         and substring(v_bytes from 9 for 4) = '\x57454250'::bytea then 'image/webp'
  end;
  if v_mime is null then return jsonb_build_object('ok', false, 'error', 'type'); end if;
  if char_length(v_name) not between 1 and 120 or p_width is null or p_height is null
     or p_width not between 1 and 4000 or p_height not between 1 and 4000
     or char_length(coalesce(p_alt_no, '')) > 300 or char_length(coalesce(p_alt_en, '')) > 300 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  v_key := left(encode(extensions.digest(v_bytes, 'sha256'), 'hex'), 32);
  -- the same bytes twice are one image: the first one's name and words stay
  select id into v_id from app.cms_media where key = v_key;
  if v_id is not null then return jsonb_build_object('ok', true, 'id', v_id, 'key', v_key, 'existing', true); end if;
  insert into app.cms_media (key, name, mime, content, width, height, alt_no, alt_en, created_by)
  values (v_key, v_name, v_mime, v_bytes, p_width, p_height, btrim(coalesce(p_alt_no, '')), btrim(coalesce(p_alt_en, '')), auth.uid())
  returning id into v_id;
  perform app.admin_log('media.add', null, 'media', v_id::text, null,
                        jsonb_build_object('name', v_name, 'bytes', octet_length(v_bytes), 'mime', v_mime));
  return jsonb_build_object('ok', true, 'id', v_id, 'key', v_key, 'existing', false);
end $fn$;

create function public.admin_media_describe(p_id uuid, p_name text, p_alt_no text, p_alt_en text) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare v_name text := btrim(coalesce(p_name, ''));
begin
  if not app.cms_can_write() then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  if char_length(v_name) not between 1 and 120 or char_length(coalesce(p_alt_no, '')) > 300 or char_length(coalesce(p_alt_en, '')) > 300 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  update app.cms_media set name = v_name, alt_no = btrim(coalesce(p_alt_no, '')), alt_en = btrim(coalesce(p_alt_en, ''))
  where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  perform app.admin_log('media.describe', null, 'media', p_id::text, null, jsonb_build_object('name', v_name));
  return jsonb_build_object('ok', true);
end $fn$;

create function public.admin_media_delete(p_id uuid) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare v_key text; v_name text;
begin
  if not app.cms_can_write() then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  select key, name into v_key, v_name from app.cms_media where id = p_id;
  if v_key is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  -- a page that shows it, archived or not, would lose it: an archived page can be brought back
  if jsonb_array_length(app.cms_media_pages(v_key)) > 0 then return jsonb_build_object('ok', false, 'error', 'in_use'); end if;
  delete from app.cms_media where id = p_id;
  perform app.admin_log('media.delete', null, 'media', p_id::text, null, jsonb_build_object('name', v_name));
  return jsonb_build_object('ok', true);
end $fn$;

do $$
declare f text;
begin
  foreach f in array array['public.admin_media()', 'public.admin_media_add(text,text,int,int,text,text)',
                           'public.admin_media_describe(uuid,text,text,text)', 'public.admin_media_delete(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------- the file, for /media
-- By its exact address only; anonymous, as the page that shows it is. A malformed key is not looked up.
create function public.cms_media_file(p_key text) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select case when p_key ~ '^[0-9a-f]{32}$' then (
    select jsonb_build_object('mime', m.mime, 'data', encode(m.content, 'base64'))
    from app.cms_media m where m.key = p_key) end
$fn$;
revoke all on function public.cms_media_file(text) from public;
grant execute on function public.cms_media_file(text) to anon, authenticated;

-- ---------------------------------------------------------------- pages may show one
create or replace function app.cms_block_ok(b jsonb) returns boolean
  language sql immutable set search_path = ''
as $fn$
  -- coalesce: a block missing a field made this null before, and a null passes a check; now it is refused
  select coalesce(jsonb_typeof(b) = 'object' and case b->>'t'
    when 'h2' then jsonb_typeof(b->'text') = 'string' and char_length(b->>'text') <= 200
    when 'h3' then jsonb_typeof(b->'text') = 'string' and char_length(b->>'text') <= 200
    when 'p' then jsonb_typeof(b->'text') = 'string' and char_length(b->>'text') <= 4000
    when 'ul' then jsonb_typeof(b->'items') = 'array' and jsonb_array_length(b->'items') between 1 and 30
      and not exists (select 1 from jsonb_array_elements(b->'items') i where jsonb_typeof(i) <> 'string' or char_length(i #>> '{}') > 600)
    when 'ol' then jsonb_typeof(b->'items') = 'array' and jsonb_array_length(b->'items') between 1 and 30
      and not exists (select 1 from jsonb_array_elements(b->'items') i where jsonb_typeof(i) <> 'string' or char_length(i #>> '{}') > 600)
    when 'quote' then jsonb_typeof(b->'text') = 'string' and jsonb_typeof(b->'cite') = 'string'
      and char_length(b->>'text') <= 1200 and char_length(b->>'cite') <= 200
    when 'law' then jsonb_typeof(b->'items') = 'array' and jsonb_array_length(b->'items') between 1 and 20
      and not exists (select 1 from jsonb_array_elements(b->'items') i
                      where jsonb_typeof(i->'ref') <> 'string' or jsonb_typeof(i->'text') <> 'string' or char_length(i->>'text') > 1200)
    when 'box' then jsonb_typeof(b->'title') = 'string' and jsonb_typeof(b->'text') = 'string'
      and char_length(b->>'title') <= 200 and char_length(b->>'text') <= 1500
    when 'cards' then jsonb_typeof(b->'items') = 'array' and jsonb_array_length(b->'items') between 1 and 9
      and not exists (select 1 from jsonb_array_elements(b->'items') i
                      where jsonb_typeof(i->'title') <> 'string' or jsonb_typeof(i->'text') <> 'string' or char_length(i->>'text') > 600)
    when 'table' then jsonb_typeof(b->'head') = 'array' and jsonb_array_length(b->'head') between 2 and 6
      and jsonb_typeof(b->'rows') = 'array' and jsonb_array_length(b->'rows') between 1 and 40
      and not exists (select 1 from jsonb_array_elements(b->'rows') r where jsonb_typeof(r) <> 'array')
    when 'links' then jsonb_typeof(b->'items') = 'array' and jsonb_array_length(b->'items') between 1 and 9
      and not exists (select 1 from jsonb_array_elements(b->'items') i
                      where jsonb_typeof(i->'title') <> 'string' or jsonb_typeof(i->'text') <> 'string'
                         or coalesce(i->>'href', '') !~ '^/[a-z0-9/#-]*$')
    when 'plans' then true
    -- an image from Content › Media (0124): its address, the words for a reader who cannot see it,
    -- an optional caption, and its size so the page keeps its place while it loads
    when 'image' then coalesce(b->>'key', '') ~ '^[0-9a-f]{32}$'
      and jsonb_typeof(b->'alt') = 'string' and char_length(b->>'alt') <= 300
      and jsonb_typeof(coalesce(b->'caption', '""')) = 'string' and char_length(coalesce(b->>'caption', '')) <= 300
      and jsonb_typeof(b->'w') = 'number' and jsonb_typeof(b->'h') = 'number'
      and (b->>'w')::numeric between 1 and 4000 and (b->>'h')::numeric between 1 and 4000
    when 'shot' then coalesce(b->>'id', '') in ('oversikt', 'varmekart', 'resultater', 'kommentarer', 'samtaler', 'tiltak', 'arshjul', 'sporsmal', 'rapport')
    else false
  end, false)
$fn$;

-- /media is the files' address now, so no page may take it
create or replace function app.cms_reserved(p_kind text, p_slug text) returns boolean
  language sql immutable set search_path = ''
as $fn$
  select case p_kind
    when 'page' then p_slug = any (array[
      -- app/(marketing)
      'artikler', 'avmeld', 'bli-med', 'bransjer', 'bruksomrader', 'demo', 'hvorfor', 'kontakt', 'logg-inn', 'lovkrav', 'nyhetsbrev',
      'nytt-passord', 'personvernerklaering', 'plattform', 'priser', 'registrer', 'sikkerhet', 'smaa-bedrifter', 'verneombud',
      -- the industries (content/industries)
      'bygg-og-anlegg', 'helse-og-omsorg', 'barnehage-og-skole', 'kunnskap-og-kontor', 'handel',
      -- app/(app), the admin, and the app's other roots
      'forhandsvis', 'hjelp', 'innsikt', 'integrasjoner', 'kommentarer', 'maleoppsett', 'malinger', 'oppsett', 'rapport', 'resultater', 'tiltak',
      'admin', 'api', 'auth', 'inn', 'logo', 'media', 'primitives', 'r', 's', 'sitemap', 'robots',
      -- addresses next.config.ts redirects
      'resultat', 'samtaler', 'arshjulet', 'om-oss'])
    when 'article' then p_slug = any (array[
      'nye-regler-psykososialt-arbeidsmiljo-2026', 'krav-til-kartlegging-av-psykososialt-arbeidsmiljo', 'medarbeiderundersokelse-sporsmal',
      'hvor-ofte-bor-dere-male-arbeidsmiljoet', 'anonym-medarbeiderundersokelse', 'verneombudets-rolle-i-kartleggingen'])
    else true
  end
$fn$;
