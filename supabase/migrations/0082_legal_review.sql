-- 0082_legal_review.sql — the legal review in the admin app (D-130, X-065).
--
-- Tor, 2026-09-27: "create a legal review part under admin and put all legal text there with an
-- approved checkbox". Every text the product or the site states law in (lib/legal/registry.ts
-- lists them from their own sources) is shown on /admin/legal with an «Approved» box.
--
--   * An approval names the text it approved: the SHA-256 of the text as the registry renders
--     it. A text edited afterwards shows as changed until it is approved again; nothing has to
--     remember to clear it, because the application compares the hash it computes now with the
--     one stored here.
--   * One row per text, the current approval. Every approval and every withdrawal is also an
--     entry in the admin audit (app.admin_log), which is the history.
--   * Only a super-admin approves (a legal sign-off is the owner's). The table has RLS on, no
--     policy and no grant: every read and write is one of the functions below.
--   * The legal texts that live in the database are read for the review by their own function
--     (the CRM's templates and lists), so opening the review is not audited as a CRM read.
--   * The English survey translations (0079) are approved on the same page: one call approves
--     every unapproved English item and the respondent pages' strings as this build has them,
--     audited, where approve_item_translations and approve_ui_translation are not.

create table app.legal_approvals (
  key         text primary key
              check (char_length(key) between 3 and 200 and key ~ '^[A-Za-z0-9][A-Za-z0-9:._/@\[\]-]*$'),
  text_hash   text not null check (text_hash ~ '^[0-9a-f]{64}$'),
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz not null default now()
);
create index legal_approvals_approved_by_idx on app.legal_approvals (approved_by);

comment on table app.legal_approvals is
  'The legal review (0082, D-130): the current approval of each legal text, by the hash of the text approved. Written only by public.admin_legal_set; the history is app.admin_audit.';

alter table app.legal_approvals enable row level security;
revoke all on app.legal_approvals from public, anon, authenticated;

-- ---------------------------------------------------------------- read
create function public.admin_legal_approvals() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true, 'approvals', coalesce((
    select jsonb_agg(jsonb_build_object('key', a.key, 'hash', a.text_hash, 'at', a.approved_at,
                                        'by', (select u.email::text from auth.users u where u.id = a.approved_by))
                     order by a.key)
    from app.legal_approvals a), '[]'::jsonb));
end $fn$;

-- ---------------------------------------------------------------- approve or withdraw
create function public.admin_legal_set(p_key text, p_hash text, p_approved boolean) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_hash text;
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_key is null or char_length(p_key) not between 3 and 200 or p_key !~ '^[A-Za-z0-9][A-Za-z0-9:._/@\[\]-]*$'
     or p_hash is null or lower(p_hash) !~ '^[0-9a-f]{64}$' or p_approved is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  if p_approved then
    insert into app.legal_approvals (key, text_hash, approved_by, approved_at)
    values (p_key, lower(p_hash), auth.uid(), now())
    on conflict (key) do update set text_hash = excluded.text_hash, approved_by = excluded.approved_by, approved_at = excluded.approved_at;
    perform app.admin_log('legal.approve', null, 'legal_text', p_key, null, jsonb_build_object('hash', lower(p_hash)));
  else
    -- only the approval of the text that was on the screen: one given to another version since
    -- the page was loaded is not withdrawn by a click on an older page
    delete from app.legal_approvals a where a.key = p_key and a.text_hash = lower(p_hash)
    returning a.text_hash into v_hash;
    if v_hash is null then
      return jsonb_build_object('ok', false, 'error', 'stale');
    end if;
    perform app.admin_log('legal.withdraw', null, 'legal_text', p_key, null, jsonb_build_object('hash', v_hash));
  end if;
  return jsonb_build_object('ok', true);
end $fn$;

-- ---------------------------------------------------------------- the database's legal texts
/**
 * The CRM's platform-wide e-mail templates and the consent lists' names and descriptions (0056),
 * as the review shows them: the text alone, without the lists' member counts, and not written to
 * the audit as a CRM read, since opening the review is not opening the CRM.
 */
create function public.admin_legal_sources() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true,
    'templates', coalesce((
      select jsonb_agg(jsonb_build_object('key', t.key, 'name', t.name, 'subject', t.subject, 'preheader', t.preheader,
                                          'blocks', t.blocks) order by t.sort, t.key)
      from app.crm_templates t), '[]'::jsonb),
    'lists', coalesce((
      select jsonb_agg(jsonb_build_object('key', l.key, 'name_no', l.name_no, 'name_en', l.name_en,
                                          'description_no', l.description_no, 'description_en', l.description_en,
                                          'public', l.public, 'archived', l.archived_at is not null) order by l.sort, l.key)
      from app.crm_lists l where l.product_id = 'orgpuls'), '[]'::jsonb));
end $fn$;

-- ---------------------------------------------------------------- the survey's translations
/**
 * What an approval of a language would approve: the SHA-256 of its unapproved rows, one line each
 * ("item_id <tab> text", in byte order), a qa-fixture row only on the QA stack. The admin page
 * shows those rows and posts this digest back; approving refuses if it has changed since.
 */
create function app.translation_digest(p_locale text) returns text
  language sql stable security definer set search_path = ''
as $fn$
  select encode(extensions.digest(convert_to(coalesce(string_agg(t.item_id || E'\t' || t.text, E'\n' order by t.item_id collate "C"), ''), 'UTF8'), 'sha256'), 'hex')
  from app.item_translations t
  where t.locale = p_locale and t.approved_at is null
    and (t.source <> 'qa-fixture' or coalesce(current_setting('app.environment', true), '') = 'qa')
$fn$;
revoke all on function app.translation_digest(text) from public, anon, authenticated;

/** Every item any survey could ask (0079's round_item_keys, over the whole instrument and every published module) */
create function app.all_item_keys() returns setof text
  language sql stable security definer set search_path = ''
as $fn$
  select 'core:' || s.factor_key || ':' || s.ordinal from app.statements s
  union all
  select 'extra:' || q.key from app.extra_questions q
  union all
  select 'extra:' || o.extra_key || ':o' || o.ordinal from app.extra_options o
  union all
  select 'module:' || i.id from app.module_items i join app.question_modules m on m.id = i.module_id where m.status = 'published'
  union all
  select 'module:' || i.id || ':o' || n
  from app.module_items i join app.question_modules m on m.id = i.module_id
  cross join lateral jsonb_array_elements(i.options) with ordinality as y(o, n)
  where m.status = 'published' and i.kind in ('count', 'segment')
$fn$;
revoke all on function app.all_item_keys() from public, anon, authenticated;

create function public.admin_translations(p_locale text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true,
    'digest', app.translation_digest(p_locale),
    -- items a survey could ask with no approved translation: what the offered rule counts (0079)
    'missing', (select count(*) from app.all_item_keys() k
                where not exists (select 1 from app.item_translations t
                                  where t.item_id = k and t.locale = p_locale and t.approved_at is not null)),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('item', t.item_id, 'text', t.text, 'source', t.source,
                                          'approved', t.approved_at is not null, 'at', t.approved_at) order by t.item_id)
      from app.item_translations t where t.locale = p_locale), '[]'::jsonb),
    'ui', coalesce((
      select jsonb_agg(jsonb_build_object('hash', a.messages_hash, 'at', a.approved_at) order by a.approved_at)
      from app.ui_translation_approvals a where a.locale = p_locale), '[]'::jsonb));
end $fn$;

/**
 * Approve a language's survey: every unapproved item translation, and the respondent pages'
 * strings by the hash this build has (lib/i18n/respondent-ui.json). A qa-fixture translation is
 * left alone, since it may only be approved on the QA stack (0079's guard). `p_digest` is what
 * the page showed (app.translation_digest): if a row was added or changed since, nothing is
 * approved and the answer is 'stale'. Audited.
 */
create function public.admin_translations_approve(p_locale text, p_ui_hash text, p_digest text) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_items int;
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if coalesce(p_locale, '') not in ('en', 'pl', 'lt') or p_ui_hash is null or lower(p_ui_hash) !~ '^[0-9a-f]{64}$'
     or p_digest is null or lower(p_digest) !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  -- what is approved is what was shown: the rows are held while they are compared
  perform 1 from app.item_translations t where t.locale = p_locale and t.approved_at is null for update;
  if app.translation_digest(p_locale) <> lower(p_digest) then
    return jsonb_build_object('ok', false, 'error', 'stale');
  end if;

  update app.item_translations t set approved_at = now(), approved_by = auth.uid()
  where t.locale = p_locale and t.approved_at is null
    and (t.source <> 'qa-fixture' or coalesce(current_setting('app.environment', true), '') = 'qa');
  get diagnostics v_items = row_count;

  insert into app.ui_translation_approvals (locale, messages_hash, approved_by)
  values (p_locale, lower(p_ui_hash), auth.uid()) on conflict do nothing;

  perform app.admin_log('translations.approve', null, 'locale', p_locale, null,
                        jsonb_build_object('items', v_items, 'ui_hash', lower(p_ui_hash)));
  return jsonb_build_object('ok', true, 'approved', v_items);
end $fn$;

revoke all on function public.admin_legal_approvals() from public, anon;
revoke all on function public.admin_legal_sources() from public, anon;
revoke all on function public.admin_legal_set(text, text, boolean) from public, anon;
revoke all on function public.admin_translations(text) from public, anon;
revoke all on function public.admin_translations_approve(text, text, text) from public, anon;
grant execute on function public.admin_legal_approvals() to authenticated;
grant execute on function public.admin_legal_sources() to authenticated;
grant execute on function public.admin_legal_set(text, text, boolean) to authenticated;
grant execute on function public.admin_translations(text) to authenticated;
grant execute on function public.admin_translations_approve(text, text, text) to authenticated;
