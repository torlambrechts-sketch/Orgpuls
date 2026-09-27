-- 0086_survey_languages.sql — the survey in Polish, Ukrainian, Lithuanian, Swedish and Danish
-- (D-133, X-070).
--
-- Tor, 2026-09-27: "Go with Polish and Ukrainian first, then Lithuanian; Swedish and Danish from
-- the official Nordic versions … I want the recommended JSON translation files … so I can see,
-- export and import languages translation … under admin". The platform stays bokmål and English,
-- and the admin English.
--
--   * Ukrainian, Swedish and Danish join Polish and Lithuanian in every language list the database
--     keeps (tests/unit/locales.test.ts holds them to lib/i18n/locales.ts).
--   * Everything a respondent reads in one of these languages is in the translation registry, so
--     it can be imported and approved in the admin without a deploy. Besides the questions:
--       ui:<path>                 the survey pages' strings (lib/i18n/respondent-strings.ts)
--       mail:<path>               the invitation, the reminders, the link asked for, and the SMS
--       mfactor:<uuid>[:v:<w>]    a module factor's name, printed above its statements
--     Bokmål and English keep theirs in messages/, as the platform's languages.
--   * source_hash: the SHA-256 of the bokmål text a translation was made from. A page or mail text
--     whose source has changed since is stale, and the application does not use it.
--   * What may be approved depends on the language now: the product's own English may be approved
--     from any step (D-127, D-132); an official version (the Nordic QPS for Swedish and Danish) too;
--     anything else — a professional translation, or a machine draft in any other language — only
--     once pretested. The multilingual guide never lets machine text be the final wording in a new
--     language.
--   * public.admin_translations_import writes a file's rows (lib/i18n/translation-package.ts
--     parses it): as drafts or at the step the file says, never approved; super-admin, audited.
--   * public.respond_locales returns the approved page strings, and a module statement's factor
--     name under `module:<item>:factor`; public.dispatch_language_texts gives the dispatcher the
--     approved mail and SMS texts.
--
-- Nothing here is stored with an answer, and nothing makes language a segment (I6).

-- ---------------------------------------------------------------- the lists
alter table app.employees drop constraint employees_language_check;
alter table app.employees add constraint employees_language_check
  check (language in ('no', 'en', 'pl', 'uk', 'lt', 'sv', 'da'));

alter table app.item_translations drop constraint item_translations_locale_check;
alter table app.item_translations add constraint item_translations_locale_check
  check (locale in ('en', 'pl', 'uk', 'lt', 'sv', 'da'));

alter table app.ui_translation_approvals drop constraint ui_translation_approvals_locale_check;
alter table app.ui_translation_approvals add constraint ui_translation_approvals_locale_check
  check (locale in ('en', 'pl', 'uk', 'lt', 'sv', 'da'));

alter table app.locale_pilots drop constraint locale_pilots_locale_check;
alter table app.locale_pilots add constraint locale_pilots_locale_check
  check (locale in ('en', 'pl', 'uk', 'lt', 'sv', 'da'));

-- ---------------------------------------------------------------- the keys and the source
alter table app.item_translations drop constraint item_translations_item_id_check;
alter table app.item_translations add constraint item_translations_item_id_check
  check (item_id ~ '^(core:[a-z_]+:[0-9]+|extra:[a-z_]+(:o[0-9]+)?|module:[0-9a-f-]{36}(:v:(barnehage|skole)|:o[0-9]+)?|mfactor:[0-9a-f-]{36}(:v:(barnehage|skole))?|(ui|mail):[a-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)*)$');

alter table app.item_translations
  add column source_hash text check (source_hash is null or source_hash ~ '^[0-9a-f]{64}$');
alter table app.item_translation_log add column source_hash text;

comment on column app.item_translations.source_hash is
  'SHA-256 of the bokmål text this translation was made from (0086). A page or mail text whose source has changed since is stale and not used.';

-- the log keeps the source it was translated from, and counts a new one as a change
create or replace function app.item_translation_logged() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
declare
  r app.item_translations%rowtype;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  if tg_op = 'UPDATE' and new.text is not distinct from old.text and new.source is not distinct from old.source
     and new.status is not distinct from old.status and new.notes is not distinct from old.notes
     and new.trapd is not distinct from old.trapd and new.source_hash is not distinct from old.source_hash then
    return null;
  end if;
  insert into app.item_translation_log (item_id, locale, op, version, status, text, source, notes, trapd, actor_id, source_hash)
  values (r.item_id, r.locale, lower(tg_op), r.version, r.status, r.text, r.source, r.notes, r.trapd, auth.uid(), r.source_hash);
  return null;
end $fn$;

-- ---------------------------------------------------------------- what may be approved
/** Machine: English only (the product's reviewed English). Official: at any step. Otherwise pretested. */
create function app.translation_approvable(p_source text, p_status text, p_locale text) returns boolean
  language sql immutable set search_path = ''
as $fn$
  select p_status not in ('approved', 'retired')
     and (p_source in ('qa-fixture', 'official')
          or (p_source = 'machine' and p_locale = 'en')
          or p_status = 'pretested')
$fn$;

create or replace function app.translation_digest(p_locale text) returns text
  language sql stable security definer set search_path = ''
as $fn$
  select encode(extensions.digest(convert_to(coalesce(string_agg(t.item_id || E'\t' || t.text, E'\n' order by t.item_id collate "C"), ''), 'UTF8'), 'sha256'), 'hex')
  from app.item_translations t
  where t.locale = p_locale and app.translation_approvable(t.source, t.status, t.locale)
    and (t.source <> 'qa-fixture' or coalesce(current_setting('app.environment', true), '') = 'qa')
$fn$;

-- ---------------------------------------------------------------- module factor names
/** The registry key a round asks a module factor's name under: its variant for the round's wording, if it has one. */
create function app.module_factor_key(p_factor uuid, p_i18n jsonb, p_wording text) returns text
  language sql immutable set search_path = ''
as $fn$
  select 'mfactor:' || p_factor
         || case when p_wording in ('barnehage', 'skole') and p_i18n ? ('nb.' || p_wording) then ':v:' || p_wording else '' end
$fn$;

-- 0084's, with the names of the factors whose statements the round asks
create or replace function app.round_item_keys(p_round uuid) returns setof text
  language sql stable security definer set search_path = ''
as $fn$
  select 'core:' || rf.factor_key || ':' || s.ordinal
  from app.round_factors rf join app.statements s on s.factor_key = rf.factor_key
  where rf.round_id = p_round
  union all
  select 'extra:' || x.extra_key from app.round_extra_questions x where x.round_id = p_round
  union all
  select 'extra:' || o.extra_key || ':o' || o.ordinal
  from app.round_extra_questions x join app.extra_options o on o.extra_key = x.extra_key
  where x.round_id = p_round
  union all
  select app.module_item_key(i.id, i.text, rm.wording)
  from app.round_modules rm join app.module_items i
    on i.module_id = rm.module_id
   and (i.id = any (rm.item_ids)
        or (i.kind = 'count' and rm.include_count_items)
        or (i.kind = 'segment' and rm.include_segments))
  where rm.round_id = p_round
  union all
  select 'module:' || i.id || ':o' || n
  from app.round_modules rm join app.module_items i
    on i.module_id = rm.module_id
   and ((i.kind = 'count' and rm.include_count_items) or (i.kind = 'segment' and rm.include_segments))
  cross join lateral jsonb_array_elements(i.options) with ordinality as y(o, n)
  where rm.round_id = p_round
  union
  select app.module_factor_key(f.id, f.i18n, rm.wording)
  from app.round_modules rm join app.module_items i on i.module_id = rm.module_id and i.id = any (rm.item_ids)
  join app.module_factors f on f.id = i.factor_id
  where rm.round_id = p_round
$fn$;

-- 0084's, with every published module factor's name and its variants
create or replace function app.all_item_keys() returns setof text
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
  select 'module:' || i.id || ':v:' || w
  from app.module_items i join app.question_modules m on m.id = i.module_id
  cross join unnest(array['barnehage', 'skole']) w
  where m.status = 'published' and i.text ? ('nb.' || w)
  union all
  select 'module:' || i.id || ':o' || n
  from app.module_items i join app.question_modules m on m.id = i.module_id
  cross join lateral jsonb_array_elements(i.options) with ordinality as y(o, n)
  where m.status = 'published' and i.kind in ('count', 'segment')
  union all
  select 'mfactor:' || f.id from app.module_factors f join app.question_modules m on m.id = f.module_id where m.status = 'published'
  union all
  select 'mfactor:' || f.id || ':v:' || w
  from app.module_factors f join app.question_modules m on m.id = f.module_id
  cross join unnest(array['barnehage', 'skole']) w
  where m.status = 'published' and f.i18n ? ('nb.' || w)
$fn$;

-- 0085's, over every survey language. English is exempt from the factor names: they are the
-- module's own (module_factors.i18n.en), published and reviewed with it, and the page reads them
-- from there; every other language translates them.
create or replace function app.round_locale_state(p_round uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select coalesce(jsonb_object_agg(l.locale, jsonb_build_object(
    'missing', (select count(*) from (select distinct k from app.round_item_keys(p_round) k) keys(k)
                where keys.k not in (select x.item_id from app.round_texts(p_round, l.locale) x)
                  and not (l.locale = 'en' and keys.k like 'mfactor:%')),
    'ui', (select coalesce(jsonb_agg(a.messages_hash order by a.approved_at), '[]'::jsonb)
           from app.ui_translation_approvals a where a.locale = l.locale),
    'pilot', exists (select 1 from app.locale_pilots p join app.rounds r on r.org_id = p.org_id
                     where r.id = p_round and p.locale = l.locale))), '{}'::jsonb)
  from (values ('en'), ('pl'), ('uk'), ('lt'), ('sv'), ('da')) as l(locale)
$fn$;

/** A language's approved page strings (ui:) or mail texts (mail:), path → {t: text, h: source hash} */
create function app.approved_texts(p_locale text, p_prefix text) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select coalesce(jsonb_object_agg(substr(t.item_id, length(p_prefix) + 1), jsonb_build_object('t', t.text, 'h', t.source_hash)), '{}'::jsonb)
  from app.item_translations t
  where t.locale = p_locale and t.status = 'approved' and t.item_id like p_prefix || '%'
$fn$;
revoke all on function app.approved_texts(text, text) from public, anon, authenticated;

-- 0084's, with the page strings and each module statement's factor name
create or replace function public.respond_locales(p_token text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_inv   app.invitations%rowtype;
  v_round app.rounds%rowtype;
  v_state jsonb;
  v_texts jsonb;
  v_ui    jsonb;
begin
  if p_token is null or length(p_token) < 16 then
    return jsonb_build_object('error', 'invalid_token');
  end if;
  select * into v_inv from app.invitations i where i.token_hash = extensions.digest(p_token, 'sha256');
  if not found or v_inv.responded_at is not null or v_inv.expires_at <= now() then
    return jsonb_build_object('error', 'invalid_token');
  end if;
  select * into v_round from app.rounds r where r.id = v_inv.round_id;
  if v_round.status <> 'apen' then
    return jsonb_build_object('error', 'invalid_token');
  end if;

  v_state := app.round_locale_state(v_round.id);

  -- the wording, only for the languages that have all of it; a variant under the item's own key,
  -- and a module factor's name under each of its statements
  select coalesce(jsonb_object_agg(l.locale, (
           select coalesce(jsonb_object_agg(k.key, k.text), '{}'::jsonb)
           from (
             select regexp_replace(x.item_id, ':v:(barnehage|skole)$', '') as key, x.text
             from app.round_texts(v_round.id, l.locale) x where x.item_id not like 'mfactor:%'
             union all
             select 'module:' || i.id || ':factor', x.text
             from app.round_texts(v_round.id, l.locale) x
             join app.round_modules rm on rm.round_id = v_round.id
             join app.module_items i on i.module_id = rm.module_id and i.id = any (rm.item_ids)
             join app.module_factors f on f.id = i.factor_id
             where x.item_id = app.module_factor_key(f.id, f.i18n, rm.wording)
           ) k)), '{}'::jsonb)
  into v_texts
  from jsonb_each(v_state) as l(locale, s)
  where (l.s ->> 'missing')::int = 0;

  -- the page strings of every language that has any; the application checks them against its own
  select coalesce(jsonb_object_agg(l.locale, app.approved_texts(l.locale, 'ui:')), '{}'::jsonb)
  into v_ui
  from jsonb_each(v_state) as l(locale, s)
  where exists (select 1 from app.item_translations t where t.locale = l.locale and t.item_id like 'ui:%' and t.status = 'approved');

  return jsonb_build_object(
    'employee_lang', (select e.language from app.employees e where e.id = v_inv.employee_id),
    'org_lang', (select o.default_lang from app.organizations o where o.id = v_round.org_id),
    'locales', v_state,
    'texts', v_texts,
    'ui', v_ui);
end $fn$;
revoke all on function public.respond_locales(text) from public;
grant execute on function public.respond_locales(text) to anon, authenticated;

/** The dispatcher's: every survey language's approved mail texts and page-string hashes. */
create function public.dispatch_language_texts() returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object(
    'mail', coalesce((select jsonb_object_agg(l, app.approved_texts(l, 'mail:')) from unnest(array['pl', 'uk', 'lt', 'sv', 'da']) l), '{}'::jsonb),
    'ui', coalesce((select jsonb_object_agg(l, app.approved_texts(l, 'ui:')) from unnest(array['pl', 'uk', 'lt', 'sv', 'da']) l), '{}'::jsonb))
$fn$;
revoke all on function public.dispatch_language_texts() from public, anon, authenticated;
grant execute on function public.dispatch_language_texts() to service_role;

-- ---------------------------------------------------------------- the admin
create or replace function public.admin_translations(p_locale text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true,
    'digest', app.translation_digest(p_locale),
    'missing', (select count(*) from app.all_item_keys() k
                where not exists (select 1 from app.item_translations t
                                  where t.item_id = k and t.locale = p_locale and t.approved_at is not null)
                  and not (p_locale = 'en' and k like 'mfactor:%')),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('item', t.item_id, 'text', t.text, 'source', t.source,
                                          'approved', t.approved_at is not null, 'at', t.approved_at,
                                          'status', t.status, 'version', t.version, 'notes', t.notes,
                                          'source_hash', t.source_hash,
                                          'approvable', app.translation_approvable(t.source, t.status, t.locale)) order by t.item_id)
      from app.item_translations t where t.locale = p_locale), '[]'::jsonb),
    'ui', coalesce((
      select jsonb_agg(jsonb_build_object('hash', a.messages_hash, 'at', a.approved_at) order by a.approved_at)
      from app.ui_translation_approvals a where a.locale = p_locale), '[]'::jsonb));
end $fn$;

/** Every module item and factor a survey could ask, with its bokmål, for the admin's source list. */
create function public.admin_translation_sources() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true, 'modules', coalesce((
    select jsonb_agg(jsonb_build_object(
             'key', m.key, 'version', m.version, 'name', m.name,
             'factors', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'i18n', f.i18n) order by f.sort), '[]'::jsonb)
                         from app.module_factors f where f.module_id = m.id),
             'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'code', i.code, 'kind', i.kind, 'factor', i.factor_id,
                                                                  'text', i.text, 'options', i.options) order by i.sort), '[]'::jsonb)
                       from app.module_items i where i.module_id = m.id))
           order by m.key)
    from app.question_modules m where m.status = 'published'), '[]'::jsonb));
end $fn$;
revoke all on function public.admin_translation_sources() from public, anon;
grant execute on function public.admin_translation_sources() to authenticated;

-- 0084's one-click approval: any survey language, and the page strings' hash only where there is one
create or replace function public.admin_translations_approve(p_locale text, p_ui_hash text, p_digest text) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_items  int;
  v_ids    text[];
  v_digest text;
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if coalesce(p_locale, '') not in ('en', 'pl', 'uk', 'lt', 'sv', 'da')
     or (p_ui_hash is not null and lower(p_ui_hash) !~ '^[0-9a-f]{64}$')
     or p_digest is null or lower(p_digest) !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select coalesce(array_agg(s.item_id), '{}'),
         encode(extensions.digest(convert_to(coalesce(string_agg(s.item_id || E'\t' || s.text, E'\n' order by s.item_id collate "C"), ''), 'UTF8'), 'sha256'), 'hex')
    into v_ids, v_digest
  from (select t.item_id, t.text from app.item_translations t
        where t.locale = p_locale and app.translation_approvable(t.source, t.status, t.locale)
          and (t.source <> 'qa-fixture' or coalesce(current_setting('app.environment', true), '') = 'qa')
        for update) s;
  if v_digest <> lower(p_digest) then
    return jsonb_build_object('ok', false, 'error', 'stale');
  end if;

  update app.item_translations t set status = 'approved', approved_by = auth.uid()
  where t.locale = p_locale and t.item_id = any(v_ids) and app.translation_approvable(t.source, t.status, t.locale);
  get diagnostics v_items = row_count;

  if p_ui_hash is not null then
    insert into app.ui_translation_approvals (locale, messages_hash, approved_by)
    values (p_locale, lower(p_ui_hash), auth.uid()) on conflict do nothing;
  end if;

  perform app.admin_log('translations.approve', null, 'locale', p_locale, null,
                        jsonb_build_object('items', v_items, 'ui_hash', lower(p_ui_hash)));
  return jsonb_build_object('ok', true, 'approved', v_items);
end $fn$;

create or replace function public.approve_item_translations(p_locale text, p_item_ids text[]) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_n int;
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('error', 'not_allowed');
  end if;
  update app.item_translations t set status = 'approved', approved_by = auth.uid()
  where t.locale = p_locale and t.item_id = any (p_item_ids) and app.translation_approvable(t.source, t.status, t.locale);
  get diagnostics v_n = row_count;
  perform app.admin_log('translations.approve_items', null, 'locale', p_locale, null,
                        jsonb_build_object('items', v_n, 'asked', coalesce(cardinality(p_item_ids), 0)));
  return jsonb_build_object('ok', true, 'approved', v_n);
end $fn$;

create or replace function public.approve_ui_translation(p_locale text, p_hash text) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('error', 'not_allowed');
  end if;
  if coalesce(p_locale, '') not in ('en', 'pl', 'uk', 'lt', 'sv', 'da') or p_hash is null or lower(p_hash) !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('error', 'invalid');
  end if;
  insert into app.ui_translation_approvals (locale, messages_hash, approved_by)
  values (p_locale, lower(p_hash), auth.uid()) on conflict do nothing;
  perform app.admin_log('translations.approve_ui', null, 'locale', p_locale, null, jsonb_build_object('ui_hash', lower(p_hash)));
  return jsonb_build_object('ok', true);
end $fn$;

drop function app.translation_approvable(text, text);

-- 0085's, over every survey language
create or replace function public.admin_locale_pilot(p_locale text, p_org uuid, p_on boolean, p_reason text) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  if coalesce(p_locale, '') not in ('en', 'pl', 'uk', 'lt', 'sv', 'da') or p_on is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if not exists (select 1 from app.organizations o where o.id = p_org) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_on then
    insert into app.locale_pilots (locale, org_id, added_by) values (p_locale, p_org, auth.uid()) on conflict do nothing;
  else
    delete from app.locale_pilots where locale = p_locale and org_id = p_org;
  end if;
  perform app.admin_log('locale.' || case when p_on then 'pilot_add' else 'pilot_remove' end,
                        p_org, 'locale', p_locale, btrim(p_reason), null);
  return jsonb_build_object('ok', true);
end $fn$;

/**
 * Import a translation file's rows for one language (lib/i18n/translation-package.ts has parsed and
 * checked it). Each row: {key, text, source, status, notes, source_hash}. A row whose text is new
 * is written at the step the file names (draft if none), never approved; a row with the same text
 * may move forward a step or gain notes; a step the workflow forbids is refused for that row
 * alone. Super-admin only; one audit entry with the counts.
 */
create function public.admin_translations_import(p_locale text, p_rows jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  r         jsonb;
  v_old     app.item_translations%rowtype;
  v_key     text;
  v_text    text;
  v_source  text;
  v_status  text;
  v_notes   text;
  v_hash    text;
  v_new     int := 0;
  v_changed int := 0;
  v_same    int := 0;
  v_refused jsonb := '[]'::jsonb;
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if coalesce(p_locale, '') not in ('pl', 'uk', 'lt', 'sv', 'da', 'en') or jsonb_typeof(p_rows) <> 'array'
     or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 5000 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_key := r ->> 'key';
    v_text := btrim(coalesce(r ->> 'text', ''));
    v_source := coalesce(r ->> 'source', 'professional');
    v_status := coalesce(r ->> 'status', 'draft');
    v_notes := nullif(btrim(coalesce(r ->> 'notes', '')), '');
    v_hash := nullif(lower(coalesce(r ->> 'source_hash', '')), '');
    begin
      if v_source not in ('official', 'professional', 'machine') then
        raise exception 'source' using errcode = 'check_violation';
      end if;
      if v_status not in ('draft', 'in_review', 'adjudicated', 'pretested') then
        raise exception 'status' using errcode = 'check_violation';
      end if;
      select * into v_old from app.item_translations t where t.item_id = v_key and t.locale = p_locale;
      if not found then
        insert into app.item_translations (item_id, locale, text, source, status, notes, source_hash)
        values (v_key, p_locale, v_text, v_source, v_status, v_notes, v_hash);
        v_new := v_new + 1;
      elsif v_old.text is distinct from v_text or v_old.source is distinct from v_source then
        -- a new wording is the next version, a draft (the guard); then the step the file names
        update app.item_translations t
           set text = v_text, source = v_source, notes = coalesce(v_notes, t.notes), source_hash = v_hash
         where t.item_id = v_key and t.locale = p_locale;
        if v_status <> 'draft' then
          update app.item_translations t set status = v_status where t.item_id = v_key and t.locale = p_locale;
        end if;
        v_changed := v_changed + 1;
      elsif v_old.status <> v_status and v_old.status <> 'approved'
            and array_position(array['draft', 'in_review', 'adjudicated', 'pretested'], v_status)
                > array_position(array['draft', 'in_review', 'adjudicated', 'pretested', 'approved', 'retired'], v_old.status)
         or v_notes is distinct from v_old.notes and v_notes is not null
         or v_hash is distinct from v_old.source_hash and v_hash is not null then
        update app.item_translations t
           set status = case when array_position(array['draft', 'in_review', 'adjudicated', 'pretested'], v_status)
                                  > array_position(array['draft', 'in_review', 'adjudicated', 'pretested', 'approved', 'retired'], t.status)
                             then v_status else t.status end,
               notes = coalesce(v_notes, t.notes),
               source_hash = coalesce(v_hash, t.source_hash)
         where t.item_id = v_key and t.locale = p_locale;
        v_changed := v_changed + 1;
      else
        v_same := v_same + 1;
      end if;
    exception when check_violation or not_null_violation or string_data_right_truncation then
      if jsonb_array_length(v_refused) < 50 then
        v_refused := v_refused || jsonb_build_object('key', v_key, 'error', sqlerrm);
      end if;
    end;
  end loop;

  perform app.admin_log('translations.import', null, 'locale', p_locale, null,
                        jsonb_build_object('new', v_new, 'changed', v_changed, 'same', v_same, 'refused', jsonb_array_length(v_refused)));
  return jsonb_build_object('ok', true, 'new', v_new, 'changed', v_changed, 'same', v_same, 'refused', v_refused);
end $fn$;
revoke all on function public.admin_translations_import(text, jsonb) from public, anon;
grant execute on function public.admin_translations_import(text, jsonb) to authenticated;
