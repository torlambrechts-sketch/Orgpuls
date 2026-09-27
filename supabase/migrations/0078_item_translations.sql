-- 0078_item_translations.sql — engagement P1.1: the translation registry and the rule for
-- which languages a survey is offered in (engagement-phases.md § P1.1, D-127).
--
-- A respondent may answer in another language only where every question they will meet has
-- a translation somebody approved, and every string on the respondent pages too. Wording is
-- the instrument: a statement translated loosely is a different question, and its answers
-- are not comparable with the Norwegian ones. So:
--
--   * app.item_translations holds one row per item and language. An item is named by a key
--     that says where its Norwegian lives:
--       core:<factor>:<ordinal>        a statement of the core survey (messages factor.*.sN)
--       extra:<key>, extra:<key>:o<n>  a question outside the index and its options
--       module:<uuid>, module:<uuid>:o<n>  a module item (app.module_items) and its options
--     `source` says who translated it: an official version, a professional translator, a
--     machine (the product's own English, written with AI assistance — the document's list has
--     no honest name for it, so this one is added), or a QA fixture. A row counts only once
--     approved; approving a machine translation is the human review of it.
--   * A qa-fixture translation — made up for the QA tenant — can be approved only where the
--     database says it is the QA stack (`app.environment` = 'qa'); anywhere else the approval
--     is refused, so a made-up translation can never reach an employee.
--   * app.ui_translation_approvals records that the respondent pages' strings in a language
--     were approved, by the hash of those strings (lib/i18n/respondent-ui.json). Change one
--     string and the hash changes, and the approval no longer covers it.
--   * public.respond_locales(token) says, for the survey behind a token, which languages have
--     every item approved, which UI hashes are approved, and the approved texts; and the
--     employee's own language (0079). The application adds the flag and the UI hash and
--     decides (lib/i18n/offered.ts). Bokmål is always offered.
--
-- Nothing here is stored with an answer, and nothing makes language a segment (I6).

-- P1.2: the employee's language, from the register and its CSV import. A default for their
-- invitation and survey, never a filter: nothing reads it but the dispatcher and the token's
-- own page.
alter table app.employees
  add column language text check (language in ('no', 'en', 'pl', 'lt'));
comment on column app.employees.language is
  'The language the employee prefers for the survey and its messages; used only where that language is offered (0078). Never stored with an answer.';

create table app.item_translations (
  item_id     text not null check (item_id ~ '^(core:[a-z_]+:[0-9]+|extra:[a-z_]+(:o[0-9]+)?|module:[0-9a-f-]{36}(:o[0-9]+)?)$'),
  locale      text not null check (locale in ('en', 'pl', 'lt')),
  text        text not null check (length(btrim(text)) between 1 and 2000),
  source      text not null check (source in ('official', 'professional', 'machine', 'qa-fixture')),
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  updated_at  timestamptz not null default now(),
  primary key (item_id, locale)
);
create index item_translations_approved_by_idx on app.item_translations (approved_by);

create table app.ui_translation_approvals (
  locale        text not null check (locale in ('en', 'pl', 'lt')),
  messages_hash text not null check (messages_hash ~ '^[0-9a-f]{64}$'),
  approved_by   uuid references auth.users (id) on delete set null,
  approved_at   timestamptz not null default now(),
  primary key (locale, messages_hash)
);
create index ui_translation_approvals_approved_by_idx on app.ui_translation_approvals (approved_by);

-- readable by any signed-in member (wording is not personal); written only by the functions below
alter table app.item_translations enable row level security;
alter table app.ui_translation_approvals enable row level security;
revoke all on app.item_translations, app.ui_translation_approvals from anon, authenticated;
grant select on app.item_translations, app.ui_translation_approvals to authenticated;
create policy item_translations_read on app.item_translations for select to authenticated using (true);
create policy ui_translation_approvals_read on app.ui_translation_approvals for select to authenticated using (true);

-- a made-up translation is approved only on the QA stack; a changed text needs approving again
create function app.item_translation_guard() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  if tg_op = 'UPDATE' and new.text is distinct from old.text and new.approved_at is not distinct from old.approved_at then
    new.approved_at := null;
    new.approved_by := null;
  end if;
  if new.source = 'qa-fixture' and new.approved_at is not null
     and coalesce(current_setting('app.environment', true), '') <> 'qa' then
    raise exception 'a qa-fixture translation can only be approved on the QA stack' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end $fn$;

create trigger item_translation_guard before insert or update on app.item_translations
  for each row execute function app.item_translation_guard();

-- the items a round asks, by registry key
create function app.round_item_keys(p_round uuid) returns setof text
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
  select 'module:' || i.id
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
$fn$;
revoke all on function app.round_item_keys(uuid) from public, anon, authenticated;

-- per language: how many of the round's items lack an approved translation, and the UI hashes approved
create function app.round_locale_state(p_round uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select coalesce(jsonb_object_agg(l.locale, jsonb_build_object(
    'missing', (select count(*) from app.round_item_keys(p_round) k
                where not exists (select 1 from app.item_translations t
                                  where t.item_id = k and t.locale = l.locale and t.approved_at is not null)),
    'ui', (select coalesce(jsonb_agg(a.messages_hash order by a.approved_at), '[]'::jsonb)
           from app.ui_translation_approvals a where a.locale = l.locale))), '{}'::jsonb)
  from (values ('en'), ('pl'), ('lt')) as l(locale)
$fn$;
revoke all on function app.round_locale_state(uuid) from public, anon, authenticated;

/*
 * For the respondent page: which languages this survey could be answered in, and the approved
 * wording for those it could. The same token checks as respond_form, so an invalid, answered or
 * expired token learns nothing more here than there.
 */
create function public.respond_locales(p_token text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_inv   app.invitations%rowtype;
  v_round app.rounds%rowtype;
  v_state jsonb;
  v_texts jsonb;
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

  -- the wording, only for the languages that have all of it
  select coalesce(jsonb_object_agg(l.locale, (
           select coalesce(jsonb_object_agg(t.item_id, t.text), '{}'::jsonb)
           from app.item_translations t
           where t.locale = l.locale and t.approved_at is not null
             and t.item_id in (select app.round_item_keys(v_round.id)))), '{}'::jsonb)
  into v_texts
  from jsonb_each(v_state) as l(locale, s)
  where (l.s ->> 'missing')::int = 0;

  return jsonb_build_object(
    'employee_lang', (select e.language from app.employees e where e.id = v_inv.employee_id),
    'locales', v_state,
    'texts', v_texts);
end $fn$;
revoke all on function public.respond_locales(text) from public;
grant execute on function public.respond_locales(text) to anon, authenticated;

-- approval, by the platform's own people (0049): items one language at a time, and the UI strings by hash
create function public.approve_item_translations(p_locale text, p_item_ids text[]) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_n int;
begin
  if not app.is_platform_admin(array['super_admin', 'support']::app.platform_role[]) then
    return jsonb_build_object('error', 'not_allowed');
  end if;
  update app.item_translations t set approved_at = now(), approved_by = auth.uid()
  where t.locale = p_locale and t.item_id = any (p_item_ids) and t.approved_at is null;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'approved', v_n);
end $fn$;
revoke all on function public.approve_item_translations(text, text[]) from public, anon;
grant execute on function public.approve_item_translations(text, text[]) to authenticated;

create function public.approve_ui_translation(p_locale text, p_hash text) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin', 'support']::app.platform_role[]) then
    return jsonb_build_object('error', 'not_allowed');
  end if;
  insert into app.ui_translation_approvals (locale, messages_hash, approved_by)
  values (p_locale, lower(p_hash), auth.uid()) on conflict do nothing;
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.approve_ui_translation(text, text) from public, anon;
grant execute on function public.approve_ui_translation(text, text) to authenticated;
