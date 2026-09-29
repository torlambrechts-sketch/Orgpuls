-- 0114 — a template-based CMS for the public site (X-094)
--
-- The designed pages (the start page, Plattform, Hvorfor, Bruksområder, the landing and industry
-- pages, the articles) stay code and their words stay in messages, edited through the message
-- overrides (0101, 0109): their layout is the design's and is pixel-gated. What this adds are pages
-- the admin makes: a campaign landing page, a splash page for an ad, a comparison, a questions
-- page, an article, a document — each from a template, drawn by the site's own designed components
-- (components/marketing), so a new page looks like the site without anybody designing it.
--
--   cms_templates      the starting points, as data: which layout draws it, and its first words in
--                      bokmål and English, with [placeholders] where only the author has the fact
--   cms_pages          a page: its address (/slug, or /artikler/slug for an article), its template,
--                      its focus keyword, whether search engines may index it
--   cms_page_locales   per language, the draft being written, the live copy readers get, and a
--                      scheduled copy that replaces the live one at its time (no job needed: the
--                      reader takes whichever is due)
--   cms_revisions      every save, publish and restore, append-only: history and rollback
--   cms_redirects      old addresses to new ones, 301 or 302, with a count of who still arrives
--   cms_previews       one-hour links that show a draft, hashed, for the editor's preview frame
--
-- Everything has RLS and no policy: the admin reads and writes through the admin_cms_* functions
-- (super-admin and marketing, with a second factor, logged), and the public site reads only what is
-- live through cms_page, cms_list and cms_redirect.

-- ---------------------------------------------------------------- content: what a page may hold
-- The blocks are the site's own (lib/marketing/blocks.ts): the same kinds, the same shapes.
create function app.cms_block_ok(b jsonb) returns boolean
  language sql immutable set search_path = ''
as $fn$
  select jsonb_typeof(b) = 'object' and case b->>'t'
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
    when 'shot' then coalesce(b->>'id', '') in ('oversikt', 'varmekart', 'resultater', 'kommentarer', 'samtaler', 'tiltak', 'arshjul', 'sporsmal', 'rapport')
    else false
  end
$fn$;

create function app.cms_content_ok(c jsonb) returns boolean
  language sql immutable set search_path = ''
as $fn$
  select jsonb_typeof(c) = 'object'
    and not exists (select 1 from jsonb_object_keys(c) k
                    where k not in ('title', 'description', 'crumb', 'kicker', 'h1', 'lead', 'signupLabel', 'blocks', 'faq',
                                    'finalTitle', 'finalBody', 'sources'))
    and not exists (select 1 from jsonb_each(c) e
                    where e.key not in ('blocks', 'faq', 'sources') and (jsonb_typeof(e.value) <> 'string' or char_length(e.value #>> '{}') > 600))
    and char_length(coalesce(c->>'title', '')) <= 90
    and char_length(coalesce(c->>'description', '')) <= 220
    and char_length(coalesce(c->>'crumb', '')) <= 60
    and char_length(coalesce(c->>'kicker', '')) <= 80
    and char_length(coalesce(c->>'h1', '')) <= 150
    and jsonb_typeof(coalesce(c->'blocks', '[]')) = 'array' and jsonb_array_length(coalesce(c->'blocks', '[]')) <= 60
    and not exists (select 1 from jsonb_array_elements(coalesce(c->'blocks', '[]')) b where not app.cms_block_ok(b))
    and jsonb_typeof(coalesce(c->'faq', '[]')) = 'array' and jsonb_array_length(coalesce(c->'faq', '[]')) <= 30
    and not exists (select 1 from jsonb_array_elements(coalesce(c->'faq', '[]')) f
                    where jsonb_typeof(f->'q') <> 'string' or jsonb_typeof(f->'a') <> 'string'
                       or char_length(f->>'q') > 300 or char_length(f->>'a') > 2000)
    and jsonb_typeof(coalesce(c->'sources', '[]')) = 'array' and jsonb_array_length(coalesce(c->'sources', '[]')) <= 20
    and not exists (select 1 from jsonb_array_elements(coalesce(c->'sources', '[]')) s
                    where jsonb_typeof(s->'label') <> 'string' or coalesce(s->>'url', '') !~ '^https://[^\s<>"]{3,}$')
$fn$;

-- A [placeholder] the author has still to fill in: square brackets once every [label](link) is
-- read as its label, so a link inside a placeholder does not hide it
create function app.cms_placeholder_left(c jsonb) returns boolean
  language sql immutable set search_path = ''
as $fn$
  select exists (
    select 1 from jsonb_path_query(c, 'strict $.**') v
    where jsonb_typeof(v) = 'string'
      and regexp_replace(v #>> '{}', '\[([^][\n]*)\]\([^)\s]*\)', '\1', 'g') ~ '\[[^][\n]{1,80}\]'
  )
$fn$;

-- What a page needs before it is shown: the words a search result and the hero are made of, a
-- body, and nothing still in [brackets]
create function app.cms_content_ready(c jsonb) returns text
  language sql immutable set search_path = ''
as $fn$
  select case
    when char_length(btrim(coalesce(c->>'title', ''))) = 0 then 'no_title'
    when char_length(btrim(coalesce(c->>'description', ''))) = 0 then 'no_description'
    when char_length(btrim(coalesce(c->>'h1', ''))) = 0 then 'no_h1'
    when char_length(btrim(coalesce(c->>'lead', ''))) = 0 then 'no_lead'
    when jsonb_array_length(coalesce(c->'blocks', '[]')) = 0 then 'no_blocks'
    when app.cms_placeholder_left(c) then 'placeholder_left'
  end
$fn$;

-- ---------------------------------------------------------------- addresses the code already owns
-- A page at /slug is served by the site's [bransje] route, which the site's own routes and the
-- industries win over; an article at /artikler/slug by the article route, where the articles in
-- code win. A slug that would never be shown is refused. tests/unit/cms-reserved.test.ts holds this
-- list to the routes on disk, so a new route cannot silently hide a page.
create function app.cms_reserved(p_kind text, p_slug text) returns boolean
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
      'admin', 'api', 'auth', 'inn', 'logo', 'primitives', 'r', 's', 'sitemap', 'robots',
      -- addresses next.config.ts redirects
      'resultat', 'samtaler', 'arshjulet', 'om-oss'])
    when 'article' then p_slug = any (array[
      'nye-regler-psykososialt-arbeidsmiljo-2026', 'krav-til-kartlegging-av-psykososialt-arbeidsmiljo', 'medarbeiderundersokelse-sporsmal',
      'hvor-ofte-bor-dere-male-arbeidsmiljoet', 'anonym-medarbeiderundersokelse', 'verneombudets-rolle-i-kartleggingen'])
    else true
  end
$fn$;

create function app.cms_can_write() returns boolean
  language sql stable security definer set search_path = ''
as $fn$ select app.is_platform_admin(array['super_admin', 'marketing']::app.platform_role[]) $fn$;
create function app.cms_can_read() returns boolean
  language sql stable security definer set search_path = ''
as $fn$ select app.is_platform_admin(array['super_admin', 'marketing', 'analyst', 'support']::app.platform_role[]) $fn$;

-- ---------------------------------------------------------------- tables
create table app.cms_templates (
  key text primary key check (key ~ '^[a-z][a-z0-9-]{1,39}$'),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text not null check (char_length(description) <= 400),
  kind text not null check (kind in ('page', 'article')),
  layout text not null check (layout in ('landing', 'splash', 'document', 'article')),
  shot text check (shot is null or shot in ('oversikt', 'varmekart', 'resultater', 'kommentarer', 'samtaler', 'tiltak', 'arshjul', 'sporsmal', 'rapport')),
  content_no jsonb not null check (app.cms_content_ok(content_no)),
  content_en jsonb not null check (app.cms_content_ok(content_en)),
  sort int not null default 0
);

create table app.cms_pages (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('page', 'article')),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 80),
  template text not null references app.cms_templates (key),
  focus_keyword text not null default '' check (char_length(focus_keyword) <= 80),
  noindex boolean not null default false,
  shot text check (shot is null or shot in ('oversikt', 'varmekart', 'resultater', 'kommentarer', 'samtaler', 'tiltak', 'arshjul', 'sporsmal', 'rapport')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (kind, slug),
  check (not app.cms_reserved(kind, slug))
);

create table app.cms_page_locales (
  page_id uuid not null references app.cms_pages (id) on delete cascade,
  locale text not null check (locale in ('no', 'en')),
  draft jsonb not null check (app.cms_content_ok(draft)),
  live jsonb check (live is null or app.cms_content_ok(live)),
  live_at timestamptz,
  pending jsonb check (pending is null or app.cms_content_ok(pending)),
  pending_at timestamptz,
  -- how the words came to be: written here, copied from the other language to translate, or checked
  translation text not null default 'source' check (translation in ('source', 'draft', 'reviewed')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (page_id, locale),
  check ((pending is null) = (pending_at is null)),
  check ((live is null) = (live_at is null))
);

create table app.cms_revisions (
  id bigint generated always as identity primary key,
  page_id uuid not null references app.cms_pages (id) on delete cascade,
  locale text not null check (locale in ('no', 'en')),
  action text not null check (action in ('save', 'publish', 'schedule', 'unpublish', 'restore')),
  content jsonb not null check (app.cms_content_ok(content)),
  at timestamptz not null default now(),
  by uuid references auth.users (id) on delete set null
);
create index cms_revisions_page on app.cms_revisions (page_id, locale, at desc);

-- nobody may change a revision's content; its author may be forgotten, and it goes with its page
create function app.cms_revisions_frozen() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from app.cms_pages p where p.id = old.page_id) then
      return old;
    end if;
    raise exception 'a revision is kept for good' using errcode = 'restrict_violation';
  end if;
  if (new.page_id, new.locale, new.action, new.content, new.at) is distinct from (old.page_id, old.locale, old.action, old.content, old.at) then
    raise exception 'a revision is kept for good' using errcode = 'restrict_violation';
  end if;
  return new;
end $fn$;
create trigger cms_revisions_frozen before update or delete on app.cms_revisions
  for each row execute function app.cms_revisions_frozen();

create table app.cms_redirects (
  from_path text primary key check (from_path ~ '^/[a-z0-9_-]+(/[a-z0-9_-]+)*$' and char_length(from_path) <= 200),
  to_path text not null check (to_path ~ '^(/[a-z0-9/_#?=&.-]*|https://[^\s<>"]{3,})$' and char_length(to_path) <= 500),
  permanent boolean not null default true,
  hits int not null default 0,
  last_hit_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (from_path <> to_path)
);

create table app.cms_previews (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  page_id uuid not null references app.cms_pages (id) on delete cascade,
  expires_at timestamptz not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['cms_templates', 'cms_pages', 'cms_page_locales', 'cms_revisions', 'cms_redirects', 'cms_previews'] loop
    execute format('alter table app.%I enable row level security', t);
    execute format('revoke all on app.%I from public, anon, authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- what a reader gets
-- the copy that is due: a scheduled one whose time has come, else the live one
create function app.cms_current(l app.cms_page_locales) returns jsonb
  language sql stable set search_path = ''
as $fn$ select case when l.pending_at is not null and l.pending_at <= now() then l.pending else l.live end $fn$;

create function app.cms_current_at(l app.cms_page_locales) returns timestamptz
  language sql stable set search_path = ''
as $fn$ select case when l.pending_at is not null and l.pending_at <= now() then l.pending_at else l.live_at end $fn$;

create function public.cms_page(p_kind text, p_slug text, p_locale text) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object('id', p.id, 'kind', p.kind, 'slug', p.slug, 'template', p.template, 'layout', t.layout,
           'noindex', p.noindex, 'shot', coalesce(p.shot, t.shot), 'content', app.cms_current(l),
           'published_at', (select min(r.at) from app.cms_revisions r where r.page_id = p.id and r.locale = l.locale and r.action in ('publish', 'schedule')),
           'updated_at', app.cms_current_at(l),
           'twin', exists (select 1 from app.cms_page_locales o where o.page_id = p.id and o.locale <> l.locale and app.cms_current(o) is not null))
  from app.cms_pages p
  join app.cms_templates t on t.key = p.template
  join app.cms_page_locales l on l.page_id = p.id and l.locale = p_locale
  where p.kind = p_kind and p.slug = p_slug and p.archived_at is null and app.cms_current(l) is not null
$fn$;
revoke all on function public.cms_page(text, text, text) from public;
grant execute on function public.cms_page(text, text, text) to anon, authenticated;

-- every live page in a language: the sitemap, the article index
create function public.cms_list(p_kind text, p_locale text) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select coalesce(jsonb_agg(jsonb_build_object('slug', p.slug, 'title', app.cms_current(l)->>'title',
           'description', app.cms_current(l)->>'description', 'h1', app.cms_current(l)->>'h1', 'noindex', p.noindex,
           'updated_at', app.cms_current_at(l),
           'twin', exists (select 1 from app.cms_page_locales o where o.page_id = p.id and o.locale <> l.locale and app.cms_current(o) is not null))
         order by app.cms_current_at(l) desc), '[]')
  from app.cms_pages p
  join app.cms_page_locales l on l.page_id = p.id and l.locale = p_locale
  where p.kind = p_kind and p.archived_at is null and app.cms_current(l) is not null
$fn$;
revoke all on function public.cms_list(text, text) from public;
grant execute on function public.cms_list(text, text) to anon, authenticated;

-- an old address: where it goes now, counted
create function public.cms_redirect(p_path text) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare v app.cms_redirects;
begin
  if coalesce(p_path, '') !~ '^/[a-z0-9_-]+(/[a-z0-9_-]+)*$' then
    return null;
  end if;
  update app.cms_redirects set hits = hits + 1, last_hit_at = now() where from_path = p_path returning * into v;
  if v.from_path is null then
    return null;
  end if;
  return jsonb_build_object('to', v.to_path, 'permanent', v.permanent);
end $fn$;
revoke all on function public.cms_redirect(text) from public;
grant execute on function public.cms_redirect(text) to anon, authenticated;

-- a draft through a preview link: never indexed, expires in an hour
create function public.cms_preview(p_token text, p_locale text) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object('id', p.id, 'kind', p.kind, 'slug', p.slug, 'template', p.template, 'layout', t.layout, 'noindex', true,
           'shot', coalesce(p.shot, t.shot), 'content', l.draft, 'published_at', null, 'updated_at', l.updated_at, 'twin', false, 'preview', true)
  from app.cms_previews v
  join app.cms_pages p on p.id = v.page_id
  join app.cms_templates t on t.key = p.template
  join app.cms_page_locales l on l.page_id = p.id and l.locale = p_locale
  where coalesce(p_token, '') ~ '^[0-9a-f]{64}$'
    and v.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and v.expires_at > now()
$fn$;
revoke all on function public.cms_preview(text, text) from public;
grant execute on function public.cms_preview(text, text) to anon, authenticated;

-- ---------------------------------------------------------------- the admin
create function app.cms_page_json(p app.cms_pages) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object('id', p.id, 'kind', p.kind, 'slug', p.slug, 'template', p.template,
    'layout', (select t.layout from app.cms_templates t where t.key = p.template),
    'focus_keyword', p.focus_keyword, 'noindex', p.noindex, 'shot', p.shot, 'created_at', p.created_at, 'updated_at', p.updated_at,
    'archived', p.archived_at is not null,
    'locales', (select coalesce(jsonb_agg(jsonb_build_object('locale', l.locale, 'draft', l.draft, 'live', l.live, 'live_at', l.live_at,
                  'pending', l.pending, 'pending_at', l.pending_at, 'translation', l.translation, 'updated_at', l.updated_at,
                  'current', app.cms_current(l), 'changed', l.draft is distinct from coalesce(l.pending, l.live))
                order by l.locale), '[]') from app.cms_page_locales l where l.page_id = p.id))
$fn$;

create function public.admin_cms_templates() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not app.cms_can_read() then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  return jsonb_build_object('ok', true, 'rows', (select coalesce(jsonb_agg(to_jsonb(t) order by t.sort, t.key), '[]') from app.cms_templates t));
end $fn$;

create function public.admin_cms_pages() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not app.cms_can_read() then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  return jsonb_build_object('ok', true, 'rows',
    (select coalesce(jsonb_agg(app.cms_page_json(p) order by p.updated_at desc), '[]') from app.cms_pages p));
end $fn$;

create function public.admin_cms_page(p_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare v app.cms_pages;
begin
  if not app.cms_can_read() then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  select * into v from app.cms_pages where id = p_id;
  if v.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'page', app.cms_page_json(v),
    'revisions', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'locale', r.locale, 'action', r.action, 'at', r.at,
                    'by', (select u.email from auth.users u where u.id = r.by), 'title', r.content->>'title') order by r.at desc, r.id desc), '[]')
                  from (select * from app.cms_revisions r where r.page_id = p_id order by r.at desc, r.id desc limit 60) r));
end $fn$;

-- traffic by address from the site's own cookieless analytics (0050, 0059): views, visitors,
-- clicks on a call to action, and organisations whose first page it was
create function public.admin_cms_traffic(p_days int default 30) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
begin
  if not app.cms_can_read() then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  return jsonb_build_object('ok', true, 'days', v_days, 'rows', (
    select coalesce(jsonb_agg(jsonb_build_object('path', x.path, 'views', x.views, 'visitors', x.visitors, 'cta', x.cta, 'signups', x.signups)
                              order by x.views desc, x.path), '[]')
    from (
      select e.path,
             count(*) filter (where e.kind = 'view') as views,
             count(distinct e.visitor) filter (where e.kind = 'view') as visitors,
             count(*) filter (where e.kind = 'cta') as cta,
             (select count(*) from app.org_attribution a join app.organizations o on o.id = a.org_id
               where a.first_landing = e.path and o.created_at >= now() - make_interval(days => v_days)) as signups
      from app.web_events e
      where e.day >= (now() at time zone 'Europe/Oslo')::date - v_days
      group by e.path) x));
end $fn$;

create function public.admin_cms_create(p jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_t app.cms_templates;
  v_slug text := lower(btrim(coalesce(p->>'slug', '')));
  v_id uuid;
  v_locales text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'locales', '["no"]')) x), array['no']);
begin
  if not app.cms_can_write() then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  select * into v_t from app.cms_templates where key = p->>'template';
  if v_t.key is null then return jsonb_build_object('ok', false, 'error', 'invalid_template'); end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) not between 2 and 80 then
    return jsonb_build_object('ok', false, 'error', 'invalid_slug');
  end if;
  if app.cms_reserved(v_t.kind, v_slug) then return jsonb_build_object('ok', false, 'error', 'slug_reserved'); end if;
  if exists (select 1 from app.cms_pages where kind = v_t.kind and slug = v_slug) then
    return jsonb_build_object('ok', false, 'error', 'slug_taken');
  end if;
  if not v_locales <@ array['no', 'en'] or cardinality(v_locales) = 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_locale');
  end if;
  insert into app.cms_pages (kind, slug, template, focus_keyword, shot, created_by)
  values (v_t.kind, v_slug, v_t.key, left(btrim(coalesce(p->>'focus_keyword', '')), 80), v_t.shot, auth.uid())
  returning id into v_id;
  insert into app.cms_page_locales (page_id, locale, draft, updated_by)
  select v_id, l, case l when 'en' then v_t.content_en else v_t.content_no end, auth.uid() from unnest(v_locales) l;
  insert into app.cms_revisions (page_id, locale, action, content, by)
  select v_id, l.locale, 'save', l.draft, auth.uid() from app.cms_page_locales l where l.page_id = v_id;
  perform app.admin_log('cms.create', null, 'cms_page', v_id::text, null, jsonb_build_object('slug', v_slug, 'template', v_t.key));
  return jsonb_build_object('ok', true, 'id', v_id);
end $fn$;

-- the page's own settings, and one language's draft
create function public.admin_cms_save(p_id uuid, p_locale text, p_content jsonb, p_meta jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v app.cms_pages;
  v_slug text := lower(btrim(coalesce(p_meta->>'slug', '')));
begin
  if not app.cms_can_write() then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  select * into v from app.cms_pages where id = p_id for update;
  if v.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v.archived_at is not null then return jsonb_build_object('ok', false, 'error', 'archived'); end if;
  if p_content is not null and not app.cms_content_ok(p_content) then return jsonb_build_object('ok', false, 'error', 'invalid_content'); end if;
  if p_meta ? 'slug' and v_slug <> v.slug then
    if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) not between 2 and 80 then
      return jsonb_build_object('ok', false, 'error', 'invalid_slug');
    end if;
    if app.cms_reserved(v.kind, v_slug) then return jsonb_build_object('ok', false, 'error', 'slug_reserved'); end if;
    if exists (select 1 from app.cms_pages where kind = v.kind and slug = v_slug) then return jsonb_build_object('ok', false, 'error', 'slug_taken'); end if;
    -- a page that has been live keeps its old address working
    if exists (select 1 from app.cms_page_locales l where l.page_id = v.id and l.live is not null) then
      insert into app.cms_redirects (from_path, to_path, permanent, created_by)
      values (case v.kind when 'article' then '/artikler/' else '/' end || v.slug, case v.kind when 'article' then '/artikler/' else '/' end || v_slug, true, auth.uid())
      on conflict (from_path) do update set to_path = excluded.to_path, permanent = true;
    end if;
  end if;
  if p_meta ? 'shot' and nullif(p_meta->>'shot', '') is not null
     and (p_meta->>'shot') not in ('oversikt', 'varmekart', 'resultater', 'kommentarer', 'samtaler', 'tiltak', 'arshjul', 'sporsmal', 'rapport') then
    return jsonb_build_object('ok', false, 'error', 'invalid_shot');
  end if;
  update app.cms_pages set
    slug = case when p_meta ? 'slug' then v_slug else slug end,
    focus_keyword = case when p_meta ? 'focus_keyword' then left(btrim(p_meta->>'focus_keyword'), 80) else focus_keyword end,
    noindex = coalesce((p_meta->>'noindex')::boolean, noindex),
    shot = case when p_meta ? 'shot' then nullif(p_meta->>'shot', '') else shot end,
    updated_at = now()
  where id = p_id;
  if p_content is not null then
    if p_locale not in ('no', 'en') then return jsonb_build_object('ok', false, 'error', 'invalid_locale'); end if;
    insert into app.cms_page_locales (page_id, locale, draft, translation, updated_by)
    values (p_id, p_locale, p_content, coalesce(nullif(p_meta->>'translation', ''), 'source'), auth.uid())
    on conflict (page_id, locale) do update set draft = excluded.draft, updated_at = now(), updated_by = auth.uid(),
      translation = case when p_meta ? 'translation' and p_meta->>'translation' in ('source', 'draft', 'reviewed') then p_meta->>'translation'
                         else app.cms_page_locales.translation end;
    insert into app.cms_revisions (page_id, locale, action, content, by) values (p_id, p_locale, 'save', p_content, auth.uid());
  end if;
  perform app.admin_log('cms.save', null, 'cms_page', p_id::text, null, jsonb_build_object('locale', p_locale));
  return jsonb_build_object('ok', true);
end $fn$;

-- a translation starts from the other language's draft, marked as a translation in progress
create function public.admin_cms_translate(p_id uuid, p_locale text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare v_from app.cms_page_locales;
begin
  if not app.cms_can_write() then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  if p_locale not in ('no', 'en') then return jsonb_build_object('ok', false, 'error', 'invalid_locale'); end if;
  if exists (select 1 from app.cms_page_locales where page_id = p_id and locale = p_locale) then
    return jsonb_build_object('ok', false, 'error', 'exists');
  end if;
  select * into v_from from app.cms_page_locales where page_id = p_id and locale <> p_locale;
  if v_from.page_id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  insert into app.cms_page_locales (page_id, locale, draft, translation, updated_by) values (p_id, p_locale, v_from.draft, 'draft', auth.uid());
  insert into app.cms_revisions (page_id, locale, action, content, by) values (p_id, p_locale, 'save', v_from.draft, auth.uid());
  perform app.admin_log('cms.translate', null, 'cms_page', p_id::text, null, jsonb_build_object('locale', p_locale));
  return jsonb_build_object('ok', true);
end $fn$;

-- publish a language now, or at a time; a translation not yet checked is not published
create function public.admin_cms_publish(p_id uuid, p_locale text, p_at timestamptz default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_l app.cms_page_locales;
  v_why text;
begin
  if not app.cms_can_write() then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  select * into v_l from app.cms_page_locales where page_id = p_id and locale = p_locale for update;
  if v_l.page_id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if exists (select 1 from app.cms_pages where id = p_id and archived_at is not null) then return jsonb_build_object('ok', false, 'error', 'archived'); end if;
  v_why := app.cms_content_ready(v_l.draft);
  if v_why is not null then return jsonb_build_object('ok', false, 'error', v_why); end if;
  if v_l.translation = 'draft' then return jsonb_build_object('ok', false, 'error', 'translation_unchecked'); end if;
  if p_at is not null and (p_at > now() + interval '366 days') then return jsonb_build_object('ok', false, 'error', 'invalid_time'); end if;
  if p_at is null or p_at <= now() then
    update app.cms_page_locales set live = draft, live_at = now(), pending = null, pending_at = null where page_id = p_id and locale = p_locale;
    insert into app.cms_revisions (page_id, locale, action, content, by) values (p_id, p_locale, 'publish', v_l.draft, auth.uid());
  else
    update app.cms_page_locales set pending = draft, pending_at = p_at where page_id = p_id and locale = p_locale;
    insert into app.cms_revisions (page_id, locale, action, content, by) values (p_id, p_locale, 'schedule', v_l.draft, auth.uid());
  end if;
  update app.cms_pages set updated_at = now() where id = p_id;
  perform app.admin_log(case when p_at is null or p_at <= now() then 'cms.publish' else 'cms.schedule' end, null, 'cms_page', p_id::text, null,
                        jsonb_build_object('locale', p_locale, 'at', p_at));
  return jsonb_build_object('ok', true);
end $fn$;

create function public.admin_cms_unpublish(p_id uuid, p_locale text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare v_l app.cms_page_locales;
begin
  if not app.cms_can_write() then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  select * into v_l from app.cms_page_locales where page_id = p_id and locale = p_locale for update;
  if v_l.page_id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  -- a scheduled copy whose time has come is live too: fold it in first, so the revision is what readers had
  if app.cms_current(v_l) is not null then
    insert into app.cms_revisions (page_id, locale, action, content, by) values (p_id, p_locale, 'unpublish', app.cms_current(v_l), auth.uid());
  end if;
  update app.cms_page_locales set live = null, live_at = null, pending = null, pending_at = null where page_id = p_id and locale = p_locale;
  perform app.admin_log('cms.unpublish', null, 'cms_page', p_id::text, null, jsonb_build_object('locale', p_locale));
  return jsonb_build_object('ok', true);
end $fn$;

-- an earlier version back into the draft (publishing it is a separate step)
create function public.admin_cms_restore(p_revision bigint) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare v_r app.cms_revisions;
begin
  if not app.cms_can_write() then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  select * into v_r from app.cms_revisions where id = p_revision;
  if v_r.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  update app.cms_page_locales set draft = v_r.content, updated_at = now(), updated_by = auth.uid() where page_id = v_r.page_id and locale = v_r.locale;
  insert into app.cms_revisions (page_id, locale, action, content, by) values (v_r.page_id, v_r.locale, 'restore', v_r.content, auth.uid());
  perform app.admin_log('cms.restore', null, 'cms_page', v_r.page_id::text, null, jsonb_build_object('revision', p_revision));
  return jsonb_build_object('ok', true, 'page', v_r.page_id);
end $fn$;

-- archived: off the site in every language, kept with its history
create function public.admin_cms_archive(p_id uuid, p_archived boolean) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.cms_can_write() then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  if not exists (select 1 from app.cms_pages where id = p_id) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if p_archived then
    insert into app.cms_revisions (page_id, locale, action, content, by)
    select l.page_id, l.locale, 'unpublish', app.cms_current(l), auth.uid() from app.cms_page_locales l
    where l.page_id = p_id and app.cms_current(l) is not null;
    update app.cms_page_locales set live = null, live_at = null, pending = null, pending_at = null where page_id = p_id;
  end if;
  update app.cms_pages set archived_at = case when p_archived then coalesce(archived_at, now()) end, updated_at = now() where id = p_id;
  perform app.admin_log(case when p_archived then 'cms.archive' else 'cms.unarchive' end, null, 'cms_page', p_id::text);
  return jsonb_build_object('ok', true);
end $fn$;

create function public.admin_cms_preview_token(p_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if not app.cms_can_read() then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  if not exists (select 1 from app.cms_pages where id = p_id) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  delete from app.cms_previews where expires_at < now();
  insert into app.cms_previews (token_hash, page_id, expires_at, created_by)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), p_id, now() + interval '1 hour', auth.uid());
  return jsonb_build_object('ok', true, 'token', v_token);
end $fn$;

create function public.admin_cms_redirects() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not app.cms_can_read() then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  return jsonb_build_object('ok', true, 'rows', (select coalesce(jsonb_agg(jsonb_build_object('from', r.from_path, 'to', r.to_path,
    'permanent', r.permanent, 'hits', r.hits, 'last_hit_at', r.last_hit_at, 'created_at', r.created_at) order by r.created_at desc), '[]')
    from app.cms_redirects r));
end $fn$;

create function public.admin_cms_redirect_save(p_from text, p_to text, p_permanent boolean) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_from text := lower(btrim(coalesce(p_from, '')));
  v_to text := btrim(coalesce(p_to, ''));
begin
  if not app.cms_can_write() then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  if v_from !~ '^/[a-z0-9_-]+(/[a-z0-9_-]+)*$' or char_length(v_from) > 200 then return jsonb_build_object('ok', false, 'error', 'invalid_from'); end if;
  if v_to !~ '^(/[a-z0-9/_#?=&.-]*|https://[^\s<>"]{3,})$' or v_to = v_from then return jsonb_build_object('ok', false, 'error', 'invalid_to'); end if;
  -- no chain: an address that is itself redirected cannot be a target
  if exists (select 1 from app.cms_redirects where from_path = v_to) then return jsonb_build_object('ok', false, 'error', 'chain'); end if;
  insert into app.cms_redirects (from_path, to_path, permanent, created_by) values (v_from, v_to, coalesce(p_permanent, true), auth.uid())
  on conflict (from_path) do update set to_path = excluded.to_path, permanent = excluded.permanent;
  -- anything that pointed at the old address now points at the new one
  update app.cms_redirects set to_path = v_to where to_path = v_from;
  perform app.admin_log('cms.redirect', null, 'cms_redirect', v_from, null, jsonb_build_object('to', v_to, 'permanent', coalesce(p_permanent, true)));
  return jsonb_build_object('ok', true);
end $fn$;

create function public.admin_cms_redirect_delete(p_from text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.cms_can_write() then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  delete from app.cms_redirects where from_path = p_from;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  perform app.admin_log('cms.redirect_delete', null, 'cms_redirect', p_from);
  return jsonb_build_object('ok', true);
end $fn$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.admin_cms_templates()', 'public.admin_cms_pages()', 'public.admin_cms_page(uuid)', 'public.admin_cms_traffic(int)',
    'public.admin_cms_create(jsonb)', 'public.admin_cms_save(uuid,text,jsonb,jsonb)', 'public.admin_cms_translate(uuid,text)',
    'public.admin_cms_publish(uuid,text,timestamptz)', 'public.admin_cms_unpublish(uuid,text)', 'public.admin_cms_restore(bigint)',
    'public.admin_cms_archive(uuid,boolean)', 'public.admin_cms_preview_token(uuid)', 'public.admin_cms_redirects()',
    'public.admin_cms_redirect_save(text,text,boolean)', 'public.admin_cms_redirect_delete(text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['app.cms_can_write()', 'app.cms_can_read()', 'app.cms_page_json(app.cms_pages)',
                           'app.cms_current(app.cms_page_locales)', 'app.cms_current_at(app.cms_page_locales)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------- the templates
insert into app.cms_templates (key, name, description, kind, layout, shot, content_no, content_en, sort) values
('landingsside', 'Landing page', 'For a search or a campaign: the answer in the headline, sign-up in the hero, the argument in sections, questions and answers (a rich result in Google), and the closing offer.',
 'page', 'landing', 'resultater',
 '{"title":"[Hovedsøkeordet] – slik gjør dere det | Orgpuls","description":"[Én setning som svarer på søket og sier hva leseren får, 120–160 tegn.]","crumb":"[Kort navn]","kicker":"[Hvem siden er for]","h1":"[Overskriften som svarer på det leseren søkte etter]","lead":"[To setninger: problemet leseren har, og hva Orgpuls gjør med det.]","blocks":[{"t":"h2","text":"[Hvorfor dette er viktig]"},{"t":"p","text":"[Forklar kravet eller problemet med leserens ord.] Les mer om [lovkravet](/lovkrav)."},{"t":"cards","items":[{"title":"[Fordel 1]","text":"[Én setning.]"},{"title":"[Fordel 2]","text":"[Én setning.]"},{"title":"[Fordel 3]","text":"[Én setning.]"}]},{"t":"h2","text":"Slik fungerer det"},{"t":"ol","items":["Legg inn de ansatte","Velg når kartleggingen går ut","Få rapporten, risikovurderingen og tiltakene"]},{"t":"box","title":"Anonymt, alltid","text":"Ingen resultater vises for en gruppe med færre enn fem svar."}],"faq":[{"q":"[Et spørsmål leseren stiller]","a":"[Et kort, konkret svar.]"},{"q":"[Et spørsmål til]","a":"[Svaret.]"}]}',
 '{"title":"[Main keyword] – how to do it | Orgpuls","description":"[One sentence that answers the search and says what the reader gets, 120–160 characters.]","crumb":"[Short name]","kicker":"[Who the page is for]","h1":"[The headline that answers what the reader searched for]","lead":"[Two sentences: the reader''s problem, and what Orgpuls does about it.]","blocks":[{"t":"h2","text":"[Why this matters]"},{"t":"p","text":"[Explain the requirement or the problem in the reader''s words.] Read more about [the requirement](/lovkrav)."},{"t":"cards","items":[{"title":"[Benefit 1]","text":"[One sentence.]"},{"title":"[Benefit 2]","text":"[One sentence.]"},{"title":"[Benefit 3]","text":"[One sentence.]"}]},{"t":"h2","text":"How it works"},{"t":"ol","items":["Add your employees","Choose when the survey goes out","Get the report, the risk assessment and the actions"]},{"t":"box","title":"Anonymous, always","text":"No result is shown for a group with fewer than five answers."}],"faq":[{"q":"[A question the reader asks]","a":"[A short, concrete answer.]"},{"q":"[Another question]","a":"[The answer.]"}]}',
 1),
('kampanjeside', 'Campaign splash page', 'For an ad, a mailing or an event: one message, a picture of the product, sign-up at once, three reasons and the closing offer. Short on purpose; often kept out of search (noindex).',
 'page', 'splash', 'oversikt',
 '{"title":"[Kampanjens budskap] | Orgpuls","description":"[Hva leseren får, og hvorfor nå.]","crumb":"[Kampanje]","kicker":"[Tilbudet eller anledningen]","h1":"[Ett budskap, med leserens gevinst]","lead":"[Én eller to setninger som gjør budskapet konkret.]","signupLabel":"Start med organisasjonsnummeret","blocks":[{"t":"cards","items":[{"title":"[Grunn 1]","text":"[Én setning.]"},{"title":"[Grunn 2]","text":"[Én setning.]"},{"title":"[Grunn 3]","text":"[Én setning.]"}]}],"finalTitle":"[Oppfordringen, én gang til]","finalBody":"[Én setning om hva som skjer når de starter.]"}',
 '{"title":"[The campaign''s message] | Orgpuls","description":"[What the reader gets, and why now.]","crumb":"[Campaign]","kicker":"[The offer or the occasion]","h1":"[One message, with the reader''s gain]","lead":"[One or two sentences that make the message concrete.]","signupLabel":"Start with your organisation number","blocks":[{"t":"cards","items":[{"title":"[Reason 1]","text":"[One sentence.]"},{"title":"[Reason 2]","text":"[One sentence.]"},{"title":"[Reason 3]","text":"[One sentence.]"}]}],"finalTitle":"[The call to action, once more]","finalBody":"[One sentence on what happens when they start.]"}',
 2),
('sammenligning', 'Comparison page', 'For readers weighing options («X or Y», «alternatives to X»): a fair table, what each is best for, and questions and answers. Comparison searches convert well.',
 'page', 'landing', 'rapport',
 '{"title":"[Alternativ A] eller [alternativ B]? Sammenligning | Orgpuls","description":"[Hva som skiller dem, og hvem hver passer for.]","crumb":"Sammenligning","kicker":"Sammenligning","h1":"[Alternativ A] eller [alternativ B]: hva passer for dere?","lead":"[Hva leseren må vite for å velge, i to setninger.]","blocks":[{"t":"h2","text":"Kort fortalt"},{"t":"table","head":["","[Alternativ A]","[Alternativ B]"],"rows":[["[Egenskap]","[Svar]","[Svar]"],["[Egenskap]","[Svar]","[Svar]"],["[Egenskap]","[Svar]","[Svar]"]]},{"t":"h2","text":"Når [alternativ A] passer best"},{"t":"p","text":"[Ærlig og konkret.]"},{"t":"h2","text":"Når [alternativ B] passer best"},{"t":"p","text":"[Ærlig og konkret.]"}],"faq":[{"q":"[Et spørsmål om valget]","a":"[Svaret.]"}]}',
 '{"title":"[Option A] or [option B]? Comparison | Orgpuls","description":"[What sets them apart, and who each suits.]","crumb":"Comparison","kicker":"Comparison","h1":"[Option A] or [option B]: which suits you?","lead":"[What the reader needs to know to choose, in two sentences.]","blocks":[{"t":"h2","text":"In short"},{"t":"table","head":["","[Option A]","[Option B]"],"rows":[["[Feature]","[Answer]","[Answer]"],["[Feature]","[Answer]","[Answer]"],["[Feature]","[Answer]","[Answer]"]]},{"t":"h2","text":"When [option A] fits best"},{"t":"p","text":"[Honest and concrete.]"},{"t":"h2","text":"When [option B] fits best"},{"t":"p","text":"[Honest and concrete.]"}],"faq":[{"q":"[A question about the choice]","a":"[The answer.]"}]}',
 3),
('sporsmal-og-svar', 'Questions and answers', 'A page of the questions people search for, each answered in a few sentences: Google shows them as rich results, and each answer can link on.',
 'page', 'landing', null,
 '{"title":"[Tema]: spørsmål og svar | Orgpuls","description":"[De vanligste spørsmålene om temaet, besvart kort.]","crumb":"Spørsmål og svar","kicker":"Spørsmål og svar","h1":"[Tema]: det dere lurer på","lead":"[Hvem siden er for, og hva den svarer på.]","blocks":[{"t":"p","text":"[En kort innledning.] Finner du ikke svaret, [kontakt oss](/kontakt)."}],"faq":[{"q":"[Spørsmål 1]","a":"[Svar 1]"},{"q":"[Spørsmål 2]","a":"[Svar 2]"},{"q":"[Spørsmål 3]","a":"[Svar 3]"},{"q":"[Spørsmål 4]","a":"[Svar 4]"}]}',
 '{"title":"[Topic]: questions and answers | Orgpuls","description":"[The most common questions about the topic, answered briefly.]","crumb":"Questions and answers","kicker":"Questions and answers","h1":"[Topic]: what you want to know","lead":"[Who the page is for, and what it answers.]","blocks":[{"t":"p","text":"[A short introduction.] If the answer is not here, [contact us](/kontakt)."}],"faq":[{"q":"[Question 1]","a":"[Answer 1]"},{"q":"[Question 2]","a":"[Answer 2]"},{"q":"[Question 3]","a":"[Answer 3]"},{"q":"[Question 4]","a":"[Answer 4]"}]}',
 4),
('artikkel', 'Article', 'For search traffic over time: the answer first, the argument in sections, sources cited, and a way on to the landing page that answers «how do we do that».',
 'article', 'article', null,
 '{"title":"[Spørsmålet artikkelen svarer på] | Orgpuls","description":"[Svaret i én setning, 120–160 tegn.]","crumb":"[Kort tittel]","kicker":"Artikkel","h1":"[Spørsmålet eller påstanden artikkelen svarer på]","lead":"[Svaret først, i to setninger.]","blocks":[{"t":"h2","text":"[Første del av svaret]"},{"t":"p","text":"[Forklar. Sitér kilden der det gjelder loven.]"},{"t":"h2","text":"[Andre del]"},{"t":"p","text":"[Forklar.]"},{"t":"box","title":"Slik gjør Orgpuls det","text":"[Én konkret setning.] Les om [lovkravet](/lovkrav)."}],"sources":[]}',
 '{"title":"[The question the article answers] | Orgpuls","description":"[The answer in one sentence, 120–160 characters.]","crumb":"[Short title]","kicker":"Article","h1":"[The question or claim the article answers]","lead":"[The answer first, in two sentences.]","blocks":[{"t":"h2","text":"[First part of the answer]"},{"t":"p","text":"[Explain. Cite the source where it concerns the law.]"},{"t":"h2","text":"[Second part]"},{"t":"p","text":"[Explain.]"},{"t":"box","title":"How Orgpuls does it","text":"[One concrete sentence.]"}],"sources":[]}',
 5),
('dokument', 'Document page', 'For terms, a policy or an information page: the text in sections, with no sign-up in the hero.',
 'page', 'document', null,
 '{"title":"[Dokumentets navn] | Orgpuls","description":"[Hva dokumentet gjelder.]","crumb":"[Kort navn]","kicker":"[Sist oppdatert: dato]","h1":"[Dokumentets navn]","lead":"[Hva dokumentet gjelder og hvem det gjelder for.]","blocks":[{"t":"h2","text":"[Første del]"},{"t":"p","text":"[Tekst.]"}]}',
 '{"title":"[The document''s name] | Orgpuls","description":"[What the document covers.]","crumb":"[Short name]","kicker":"[Last updated: date]","h1":"[The document''s name]","lead":"[What the document covers and who it applies to.]","blocks":[{"t":"h2","text":"[First part]"},{"t":"p","text":"[Text.]"}]}',
 6);
