-- 0084_translation_governance.sql — translation governance in the database (D-132, X-068;
-- multilingual gap analysis, queue item 4).
--
-- 0079's registry knows two states, approved or not, and forgets the text an approval covered
-- the moment it changes. The multilingual guide asks for a process a survey methodologist can
-- audit (TRAPD: translation, review, adjudication, pretest, documentation) and for a survey's
-- wording that cannot move under a round in the field. So:
--
--   * A translation has a status: draft → in_review → adjudicated → pretested → approved →
--     retired. A row moves forward (a step may be skipped), back to draft from before approval,
--     and from approved only to retired. `approved_at` stays, and is set exactly when the status
--     is approved, so every reader of 0079–0082 keeps working unchanged.
--   * What may be approved: a machine translation (the product's own English) at any step —
--     approving it is the human review, as before — and a qa-fixture on the QA stack; an official
--     or professional one only once pretested. app.translation_approvable says so, for every
--     approval path.
--   * Adjudication notes and the TRAPD documents (a reference per step) sit on the row.
--   * A change of wording is a new version: the text or source of a row that had moved past
--     draft changes → the version goes up and the row is a draft again (unless the same statement
--     approves it). Nothing is overwritten unrecorded: every change of wording, status, notes or
--     documents is a row in app.item_translation_log — append-only, with the full text — so every
--     approved version stays as it was approved.
--   * A round's wording is pinned: when a round opens, each approved text of its items is copied
--     to app.round_translations, and an item approved while the round is open is pinned then.
--     A pin never changes. The respondent reads the pin where there is one, so a new version or a
--     retirement reaches the next round and never the one in the field.
--   * Variant keys for a worded module (0083): module:<uuid>:v:barnehage and :v:skole, for an item
--     with that wording. A barnehage round asks for the variant, so a language is offered for it
--     only once the variant is translated; «begge» is the item's own key. The respondent receives
--     the text under the item's own key, so the page does not change.
--   * 0079's approve_item_translations and approve_ui_translation are the super-admin path now,
--     and audited, like 0082's admin_translations_approve. Status, notes and documents are set by
--     public.admin_translation_update, super-admin only and audited.
--
-- Nothing here is stored with an answer, and nothing makes language a segment (I6).

-- ---------------------------------------------------------------- the row
alter table app.item_translations drop constraint item_translations_item_id_check;
alter table app.item_translations add constraint item_translations_item_id_check
  check (item_id ~ '^(core:[a-z_]+:[0-9]+|extra:[a-z_]+(:o[0-9]+)?|module:[0-9a-f-]{36}(:v:(barnehage|skole)|:o[0-9]+)?)$');

/** The TRAPD documents: a reference per step (a link or a document's name), nothing else. */
create function app.trapd_ok(p jsonb) returns boolean
  language sql immutable set search_path = ''
as $fn$
  select jsonb_typeof(p) = 'object'
     and not exists (select 1 from jsonb_each(p) e
                     where e.key not in ('translation', 'review', 'adjudication', 'pretest', 'documentation')
                        or jsonb_typeof(e.value) <> 'string'
                        or length(btrim(e.value #>> '{}')) not between 1 and 500)
$fn$;

alter table app.item_translations
  add column status  text not null default 'draft'
    check (status in ('draft', 'in_review', 'adjudicated', 'pretested', 'approved', 'retired')),
  add column version int not null default 1 check (version >= 1),
  add column notes   text check (notes is null or length(btrim(notes)) between 1 and 4000),
  add column trapd   jsonb not null default '{}'::jsonb check (app.trapd_ok(trapd));

-- the English approved on the hosted project stays approved (0079's guard, replaced below, has
-- nothing to say about a status it does not know)
alter table app.item_translations disable trigger item_translation_guard;
update app.item_translations set status = 'approved' where approved_at is not null;
alter table app.item_translations enable trigger item_translation_guard;

alter table app.item_translations add constraint item_translations_approved_is_status
  check ((status = 'approved') = (approved_at is not null));

comment on column app.item_translations.status is
  'TRAPD workflow (0084): draft → in_review → adjudicated → pretested → approved → retired. approved_at is set exactly when approved.';
comment on column app.item_translations.version is
  'Goes up when the wording or its source changes after the row left draft (0084); every version is in app.item_translation_log.';

/** Whether a row may be approved: machine and qa-fixture rows at any step, the others once pretested. */
create function app.translation_approvable(p_source text, p_status text) returns boolean
  language sql immutable set search_path = ''
as $fn$
  select p_status not in ('approved', 'retired')
     and (p_source in ('machine', 'qa-fixture') or p_status = 'pretested')
$fn$;

-- ---------------------------------------------------------------- the log
create table app.item_translation_log (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  item_id   text not null,
  locale    text not null,
  op        text not null check (op in ('insert', 'update', 'delete')),
  version   int not null,
  status    text not null,
  text      text not null,
  source    text not null,
  notes     text,
  trapd     jsonb not null,
  -- who, copied rather than referenced, so the record outlives the account; null for a seed
  actor_id  uuid
);
create index item_translation_log_item on app.item_translation_log (item_id, locale, id);

comment on table app.item_translation_log is
  'Every change of a translation''s wording, status, notes or documents (0084), with the full row as it became. Append-only; read through the admin functions.';

alter table app.item_translation_log enable row level security;
revoke all on app.item_translation_log from public, anon, authenticated;

create function app.item_translation_log_fixed() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  -- nothing references the log, so no maintenance of the database's own can reach it
  raise exception 'the translation log is append-only' using errcode = 'insufficient_privilege';
end $fn$;
create trigger item_translation_log_fixed before update or delete on app.item_translation_log
  for each row execute function app.item_translation_log_fixed();
create trigger item_translation_log_no_truncate before truncate on app.item_translation_log
  for each statement execute function app.item_translation_log_fixed();

-- the approvals so far are the log's first entries
insert into app.item_translation_log (at, item_id, locale, op, version, status, text, source, notes, trapd, actor_id)
select coalesce(t.approved_at, t.updated_at), t.item_id, t.locale, 'insert', t.version, t.status, t.text, t.source, t.notes, t.trapd, t.approved_by
from app.item_translations t;

-- ---------------------------------------------------------------- the guard, replaced
/**
 * 0079's guard, with the workflow. On a change of wording or source, a row past draft becomes a
 * new version in draft — unless the same statement approves it (a seed, a QA fixture). A status
 * change is checked against the workflow. approved_at follows the status, and the status follows
 * an approved_at a 0079-era writer sets. A qa-fixture is approved only on the QA stack. The
 * approver (approved_by) going when its account is deleted is maintenance, not a change.
 */
create or replace function app.item_translation_guard() returns trigger
  language plpgsql set search_path = ''
as $fn$
declare
  rank constant text[] := array['draft', 'in_review', 'adjudicated', 'pretested', 'approved', 'retired'];
  v_reworded boolean := false;
  v_explicit boolean;
begin
  if tg_op = 'INSERT' then
    if new.approved_at is not null then new.status := 'approved'; end if;
  else
    v_reworded := new.text is distinct from old.text or new.source is distinct from old.source;
    v_explicit := new.status is distinct from old.status or new.approved_at is distinct from old.approved_at;
    -- a 0079-era writer approves by setting approved_at, or withdraws by clearing it
    if new.status is not distinct from old.status and new.approved_at is distinct from old.approved_at then
      new.status := case when new.approved_at is null then 'draft' else 'approved' end;
    end if;
    if v_reworded then
      -- a new wording is a new version, and starts over unless the statement says where it stands
      if old.status <> 'draft' then new.version := old.version + 1; end if;
      if not v_explicit then new.status := 'draft'; end if;
    elsif new.status is distinct from old.status
          and not (array_position(rank, new.status) > array_position(rank, old.status)
                   or (new.status = 'draft' and old.status in ('in_review', 'adjudicated', 'pretested', 'retired'))) then
      raise exception 'a translation cannot go from % to %', old.status, new.status using errcode = 'check_violation';
    end if;
  end if;

  if new.status = 'approved' then
    if tg_op = 'INSERT' or v_reworded or old.status <> 'approved' then
      if new.approved_at is null or (tg_op = 'UPDATE' and new.approved_at is not distinct from old.approved_at) then
        new.approved_at := now();
      end if;
      if tg_op = 'UPDATE' and new.approved_by is not distinct from old.approved_by then
        new.approved_by := auth.uid();
      end if;
    end if;
  else
    new.approved_at := null;
    new.approved_by := null;
  end if;
  if new.source = 'qa-fixture' and new.status = 'approved'
     and coalesce(current_setting('app.environment', true), '') <> 'qa' then
    raise exception 'a qa-fixture translation can only be approved on the QA stack' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' or v_reworded or new.status is distinct from old.status
     or new.notes is distinct from old.notes or new.trapd is distinct from old.trapd then
    new.updated_at := now();
  end if;
  return new;
end $fn$;

create function app.item_translation_logged() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
declare
  r app.item_translations%rowtype;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  if tg_op = 'UPDATE' and new.text is not distinct from old.text and new.source is not distinct from old.source
     and new.status is not distinct from old.status and new.notes is not distinct from old.notes
     and new.trapd is not distinct from old.trapd then
    return null;
  end if;
  insert into app.item_translation_log (item_id, locale, op, version, status, text, source, notes, trapd, actor_id)
  values (r.item_id, r.locale, lower(tg_op), r.version, r.status, r.text, r.source, r.notes, r.trapd, auth.uid());
  return null;
end $fn$;
revoke all on function app.item_translation_logged() from public, anon, authenticated;
create trigger item_translation_logged after insert or update or delete on app.item_translations
  for each row execute function app.item_translation_logged();

-- ---------------------------------------------------------------- variant keys
/** The registry key a round asks an item under: its variant for the round's wording, if it has one. */
create function app.module_item_key(p_item uuid, p_text jsonb, p_wording text) returns text
  language sql immutable set search_path = ''
as $fn$
  select 'module:' || p_item
         || case when p_wording in ('barnehage', 'skole') and p_text ? ('nb.' || p_wording) then ':v:' || p_wording else '' end
$fn$;

-- 0079's, with the module statement keyed by the round's wording
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
$fn$;

-- 0082's, with every variant a published module's items have
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
$fn$;

-- ---------------------------------------------------------------- the round's pins
create table app.round_translations (
  round_id  uuid not null references app.rounds (id) on delete cascade,
  locale    text not null,
  item_id   text not null,
  version   int not null,
  text      text not null,
  pinned_at timestamptz not null default now(),
  primary key (round_id, locale, item_id)
);

comment on table app.round_translations is
  'The approved wording a round asks in each language, fixed when the round opens or when an item is approved while it is open (0084). Never changes; read through respond_locales.';

alter table app.round_translations enable row level security;
revoke all on app.round_translations from public, anon, authenticated;

/** A pin never changes; it goes only with its round (the delete then comes from the cascade). */
create function app.round_translation_fixed() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  if tg_op = 'DELETE' and not exists (select 1 from app.rounds r where r.id = old.round_id) then
    return old;
  end if;
  raise exception 'a round''s pinned wording cannot change' using errcode = 'insufficient_privilege';
end $fn$;
create trigger round_translation_fixed before update or delete on app.round_translations
  for each row execute function app.round_translation_fixed();

/** Pin a round's approved wording: every item it asks that has an approved text and no pin yet. */
create function app.pin_round_translations(p_round uuid) returns void
  language sql volatile security definer set search_path = ''
as $fn$
  insert into app.round_translations (round_id, locale, item_id, version, text)
  select p_round, t.locale, t.item_id, t.version, t.text
  from app.round_item_keys(p_round) k join app.item_translations t on t.item_id = k
  where t.status = 'approved'
  on conflict do nothing
$fn$;
revoke all on function app.pin_round_translations(uuid) from public, anon, authenticated;

create function app.round_pin_on_open() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if new.status = 'apen' and (tg_op = 'INSERT' or old.status is distinct from 'apen') then
    perform app.pin_round_translations(new.id);
  end if;
  return null;
end $fn$;
revoke all on function app.round_pin_on_open() from public, anon, authenticated;
create trigger round_pin_on_open after insert or update of status on app.rounds
  for each row execute function app.round_pin_on_open();

/** An item approved while a round that asks it is open is pinned in that round then. */
create function app.pin_on_approval() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  insert into app.round_translations (round_id, locale, item_id, version, text)
  select r.id, n.locale, n.item_id, n.version, n.text
  from (select distinct nt.locale, nt.item_id, nt.version, nt.text from approved_rows nt where nt.status = 'approved') n
  join app.rounds r on r.status = 'apen'
  where n.item_id in (select app.round_item_keys(r.id))
  on conflict do nothing;
  return null;
end $fn$;
revoke all on function app.pin_on_approval() from public, anon, authenticated;
create trigger pin_on_approval_insert after insert on app.item_translations
  referencing new table as approved_rows for each statement execute function app.pin_on_approval();
create trigger pin_on_approval_update after update on app.item_translations
  referencing new table as approved_rows for each statement execute function app.pin_on_approval();

-- the rounds in the field now keep the wording they have now
do $$ begin perform app.pin_round_translations(r.id) from app.rounds r where r.status = 'apen'; end $$;

-- ---------------------------------------------------------------- the readers
/** A round's wording in a language, by registry key: the pin, else the approved text. */
create function app.round_texts(p_round uuid, p_locale text) returns table (item_id text, text text)
  language sql stable security definer set search_path = ''
as $fn$
  select k, coalesce(p.text, t.text)
  from (select distinct k from app.round_item_keys(p_round) k) keys(k)
  left join app.round_translations p on p.round_id = p_round and p.locale = p_locale and p.item_id = keys.k
  left join app.item_translations t on t.item_id = keys.k and t.locale = p_locale and t.status = 'approved'
  where p.text is not null or t.text is not null
$fn$;
revoke all on function app.round_texts(uuid, text) from public, anon, authenticated;

-- 0079's, counting the pins
create or replace function app.round_locale_state(p_round uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select coalesce(jsonb_object_agg(l.locale, jsonb_build_object(
    'missing', (select count(*) from (select distinct k from app.round_item_keys(p_round) k) keys(k)
                where keys.k not in (select x.item_id from app.round_texts(p_round, l.locale) x)),
    'ui', (select coalesce(jsonb_agg(a.messages_hash order by a.approved_at), '[]'::jsonb)
           from app.ui_translation_approvals a where a.locale = l.locale))), '{}'::jsonb)
  from (values ('en'), ('pl'), ('lt')) as l(locale)
$fn$;

-- 0081's, reading the round's wording and handing a variant back under the item's own key
create or replace function public.respond_locales(p_token text) returns jsonb
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
           select coalesce(jsonb_object_agg(regexp_replace(x.item_id, ':v:(barnehage|skole)$', ''), x.text), '{}'::jsonb)
           from app.round_texts(v_round.id, l.locale) x)), '{}'::jsonb)
  into v_texts
  from jsonb_each(v_state) as l(locale, s)
  where (l.s ->> 'missing')::int = 0;

  return jsonb_build_object(
    'employee_lang', (select e.language from app.employees e where e.id = v_inv.employee_id),
    'org_lang', (select o.default_lang from app.organizations o where o.id = v_round.org_id),
    'locales', v_state,
    'texts', v_texts);
end $fn$;
revoke all on function public.respond_locales(text) from public;
grant execute on function public.respond_locales(text) to anon, authenticated;

-- ---------------------------------------------------------------- the approval paths
-- 0082's digest, over what may be approved
create or replace function app.translation_digest(p_locale text) returns text
  language sql stable security definer set search_path = ''
as $fn$
  select encode(extensions.digest(convert_to(coalesce(string_agg(t.item_id || E'\t' || t.text, E'\n' order by t.item_id collate "C"), ''), 'UTF8'), 'sha256'), 'hex')
  from app.item_translations t
  where t.locale = p_locale and app.translation_approvable(t.source, t.status)
    and (t.source <> 'qa-fixture' or coalesce(current_setting('app.environment', true), '') = 'qa')
$fn$;

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
                                  where t.item_id = k and t.locale = p_locale and t.approved_at is not null)),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('item', t.item_id, 'text', t.text, 'source', t.source,
                                          'approved', t.approved_at is not null, 'at', t.approved_at,
                                          'status', t.status, 'version', t.version,
                                          'approvable', app.translation_approvable(t.source, t.status)) order by t.item_id)
      from app.item_translations t where t.locale = p_locale), '[]'::jsonb),
    'ui', coalesce((
      select jsonb_agg(jsonb_build_object('hash', a.messages_hash, 'at', a.approved_at) order by a.approved_at)
      from app.ui_translation_approvals a where a.locale = p_locale), '[]'::jsonb));
end $fn$;

-- 0082's one-click approval, over what may be approved
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
  if coalesce(p_locale, '') not in ('en', 'pl', 'lt') or p_ui_hash is null or lower(p_ui_hash) !~ '^[0-9a-f]{64}$'
     or p_digest is null or lower(p_digest) !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select coalesce(array_agg(s.item_id), '{}'),
         encode(extensions.digest(convert_to(coalesce(string_agg(s.item_id || E'\t' || s.text, E'\n' order by s.item_id collate "C"), ''), 'UTF8'), 'sha256'), 'hex')
    into v_ids, v_digest
  from (select t.item_id, t.text from app.item_translations t
        where t.locale = p_locale and app.translation_approvable(t.source, t.status)
          and (t.source <> 'qa-fixture' or coalesce(current_setting('app.environment', true), '') = 'qa')
        for update) s;
  if v_digest <> lower(p_digest) then
    return jsonb_build_object('ok', false, 'error', 'stale');
  end if;

  update app.item_translations t set status = 'approved', approved_by = auth.uid()
  where t.locale = p_locale and t.item_id = any(v_ids) and app.translation_approvable(t.source, t.status);
  get diagnostics v_items = row_count;

  insert into app.ui_translation_approvals (locale, messages_hash, approved_by)
  values (p_locale, lower(p_ui_hash), auth.uid()) on conflict do nothing;

  perform app.admin_log('translations.approve', null, 'locale', p_locale, null,
                        jsonb_build_object('items', v_items, 'ui_hash', lower(p_ui_hash)));
  return jsonb_build_object('ok', true, 'approved', v_items);
end $fn$;

-- 0079's two, now the super-admin path and audited
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
  where t.locale = p_locale and t.item_id = any (p_item_ids) and app.translation_approvable(t.source, t.status);
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
  if coalesce(p_locale, '') not in ('en', 'pl', 'lt') or p_hash is null or lower(p_hash) !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('error', 'invalid');
  end if;
  insert into app.ui_translation_approvals (locale, messages_hash, approved_by)
  values (p_locale, lower(p_hash), auth.uid()) on conflict do nothing;
  perform app.admin_log('translations.approve_ui', null, 'locale', p_locale, null, jsonb_build_object('ui_hash', lower(p_hash)));
  return jsonb_build_object('ok', true);
end $fn$;

/**
 * The workflow's write path: move a translation's status (not to approved — that is the approval
 * paths above, which show the text), and set its adjudication notes and TRAPD documents. A null
 * leaves that field as it is; an empty string or object clears it. Super-admin only, audited.
 */
create function public.admin_translation_update(p_locale text, p_item_id text, p_status text, p_notes text, p_trapd jsonb)
  returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_row app.item_translations%rowtype;
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_status is not null and p_status not in ('draft', 'in_review', 'adjudicated', 'pretested', 'retired') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if p_trapd is not null and not app.trapd_ok(p_trapd) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if p_notes is not null and length(p_notes) > 4000 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  begin
    update app.item_translations t
       set status = coalesce(p_status, t.status),
           notes  = case when p_notes is null then t.notes else nullif(btrim(p_notes), '') end,
           trapd  = coalesce(p_trapd, t.trapd)
     where t.locale = p_locale and t.item_id = p_item_id
    returning * into v_row;
  exception when check_violation then
    return jsonb_build_object('ok', false, 'error', 'transition');
  end;
  if v_row.item_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform app.admin_log('translations.update', null, 'translation', p_locale || ':' || p_item_id, null,
                        jsonb_build_object('status', v_row.status, 'version', v_row.version,
                                           'notes', p_notes is not null, 'trapd', p_trapd is not null));
  return jsonb_build_object('ok', true, 'status', v_row.status, 'version', v_row.version);
end $fn$;
revoke all on function public.admin_translation_update(text, text, text, text, jsonb) from public, anon;
grant execute on function public.admin_translation_update(text, text, text, text, jsonb) to authenticated;

/** One translation's history, from the log. Super-admin only. */
create function public.admin_translation_history(p_locale text, p_item_id text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true, 'entries', coalesce((
    select jsonb_agg(jsonb_build_object('at', l.at, 'op', l.op, 'version', l.version, 'status', l.status,
                                        'text', l.text, 'source', l.source, 'notes', l.notes, 'trapd', l.trapd,
                                        'by', (select u.email::text from auth.users u where u.id = l.actor_id))
                     order by l.id)
    from app.item_translation_log l where l.locale = p_locale and l.item_id = p_item_id), '[]'::jsonb));
end $fn$;
revoke all on function public.admin_translation_history(text, text) from public, anon;
grant execute on function public.admin_translation_history(text, text) to authenticated;
