-- 0123 — Content as the Sentral design draws it (X-095, phase 7)
--
--   author        the Pages list names who a page is by: whoever last saved or published it, else
--                 whoever made it (cms_revisions.by, cms_pages.created_by). Read for the list only.
--   site notice   the design's «Splash page», as decided in the plan (decision 8): a notice on the
--                 public site's pages, in bokmål and English, switched on and off in Content ›
--                 Landing & front pages. It never replaces a page, never reaches the product or a
--                 survey, and never touches indexing. Turning it on or off is audited; while it is
--                 off, the public read returns nothing.

-- ---------------------------------------------------------------- the pages, with their author
create or replace function public.admin_cms_pages() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not app.cms_can_read() then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  return jsonb_build_object('ok', true, 'rows',
    (select coalesce(jsonb_agg(app.cms_page_json(p) || jsonb_build_object('author', coalesce(
        (select u.email from app.cms_revisions r join auth.users u on u.id = r.by
         where r.page_id = p.id order by r.at desc, r.id desc limit 1),
        (select u.email from auth.users u where u.id = p.created_by)))
      order by p.updated_at desc), '[]') from app.cms_pages p));
end $fn$;

-- ---------------------------------------------------------------- the site notice
alter table app.platform_settings
  add column notice_on boolean not null default false,
  add column notice_no text check (char_length(notice_no) <= 300),
  add column notice_en text check (char_length(notice_en) <= 300),
  add column notice_by uuid references auth.users (id) on delete set null,
  add column notice_at timestamptz;
create index platform_settings_notice_by_idx on app.platform_settings (notice_by);

create function public.admin_site_notice() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not app.cms_can_read() then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  return (select jsonb_build_object('ok', true, 'on', s.notice_on, 'no', s.notice_no, 'en', s.notice_en, 'at', s.notice_at,
                                    'by', (select u.email from auth.users u where u.id = s.notice_by))
          from app.platform_settings s where s.id);
end $fn$;
revoke all on function public.admin_site_notice() from public, anon;
grant execute on function public.admin_site_notice() to authenticated;

create function public.admin_site_notice_set(p_on boolean, p_no text, p_en text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_no text := nullif(btrim(coalesce(p_no, '')), '');
  v_en text := nullif(btrim(coalesce(p_en, '')), '');
begin
  if not app.cms_can_write() then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  if p_on is null or char_length(coalesce(v_no, '')) > 300 or char_length(coalesce(v_en, '')) > 300 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  -- a notice switched on says something, at least in bokmål
  if p_on and v_no is null then return jsonb_build_object('ok', false, 'error', 'text_required'); end if;
  update app.platform_settings set notice_on = p_on, notice_no = v_no, notice_en = v_en, notice_by = auth.uid(), notice_at = now()
    where id;
  perform app.admin_log(case when p_on then 'site.notice_on' else 'site.notice_off' end, null, 'site', 'notice', null,
                        jsonb_build_object('no', v_no, 'en', v_en));
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.admin_site_notice_set(boolean, text, text) from public, anon;
grant execute on function public.admin_site_notice_set(boolean, text, text) to authenticated;

-- what the public site shows: the notice in the reader's language (bokmål where English is empty),
-- and nothing at all while it is off
create function public.site_notice(p_locale text) returns text
  language sql stable security definer set search_path = ''
as $fn$
  select case when s.notice_on then case when p_locale = 'en' then coalesce(s.notice_en, s.notice_no) else s.notice_no end end
  from app.platform_settings s where s.id
$fn$;
revoke all on function public.site_notice(text) from public;
grant execute on function public.site_notice(text) to anon, authenticated;
