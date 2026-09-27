-- 0082_legal_review.sql — the legal review in the admin app (D-130, X-065).
--
-- Tor, 2026-09-27: "create a legal review part under admin and put all legal text there with an
-- approved checkbox". Every text the product or the site states law in (lib/legal/registry.ts
-- lists them from their own sources) is shown on /admin/legal with a «Godkjent» box.
--
--   * An approval names the text it approved: the SHA-256 of the text as the registry renders
--     it. A text edited afterwards shows as changed until it is approved again; nothing has to
--     remember to clear it, because the application compares the hash it computes now with the
--     one stored here.
--   * One row per text, the current approval. Every approval and every withdrawal is also an
--     entry in the admin audit (app.admin_log), which is the history.
--   * Only a super-admin approves (a legal sign-off is the owner's). The table has RLS on, no
--     policy and no grant: every read and write is one of the functions below.
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
    delete from app.legal_approvals a where a.key = p_key;
    perform app.admin_log('legal.withdraw', null, 'legal_text', p_key, null, jsonb_build_object('hash', lower(p_hash)));
  end if;
  return jsonb_build_object('ok', true);
end $fn$;

-- ---------------------------------------------------------------- the survey's translations
create function public.admin_translations(p_locale text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true,
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
 * left alone, since it may only be approved on the QA stack (0079's guard). Audited.
 */
create function public.admin_translations_approve(p_locale text, p_ui_hash text) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_items int;
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_locale not in ('en', 'pl', 'lt') or p_ui_hash is null or lower(p_ui_hash) !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
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
revoke all on function public.admin_legal_set(text, text, boolean) from public, anon;
revoke all on function public.admin_translations(text) from public, anon;
revoke all on function public.admin_translations_approve(text, text) from public, anon;
grant execute on function public.admin_legal_approvals() to authenticated;
grant execute on function public.admin_legal_set(text, text, boolean) to authenticated;
grant execute on function public.admin_translations(text) to authenticated;
grant execute on function public.admin_translations_approve(text, text) to authenticated;
