-- 0101_translations_admin.sql — bokmål and English in admin › Translations, and auto-approve for
-- development (D-152, X-082).
--
-- Tor, 2026-09-28: "extend the language translations so we also have the norwegian text and
-- english in the admin ui — separate questionnaire and the page translations — and add JSON
-- export / import so I can give a package to a translator. Make an auto approve in the admin GUI
-- that I can turn on for everything during development."
--
-- 1. app.message_overrides: a bokmål or English text from messages/ replaced from the admin, by
--    an import. The files stay the source; an approved override is laid over them where the
--    application loads its messages (lib/i18n/request.ts) and where the dispatcher renders a mail.
--    RLS on, no policy, no grant: written by the functions below, read whole by a super-admin, and
--    read by anyone only as the approved texts (public.message_overrides), which are page text.
-- 2. app.platform_settings.auto_approve: one switch for the platform. While it is on, every
--    translation and override is approved as it is written (the zauto triggers), everything
--    waiting is approved when it is turned on, a respondent page and a mail treat the page strings
--    of this build as approved (round_locale_state's «auto»), and the admin records the legal
--    texts and page strings it shows as approved. Every approval made so is marked as automatic,
--    so the record never passes one off as a person's reading. A qa-fixture text is still approved
--    only on the QA stack.

-- ---------------------------------------------------------------- the switch
create table app.platform_settings (
  id              boolean primary key default true check (id),
  auto_approve    boolean not null default false,
  auto_approve_by uuid references auth.users (id) on delete set null,
  auto_approve_at timestamptz
);
create index platform_settings_auto_approve_by_idx on app.platform_settings (auto_approve_by);
insert into app.platform_settings default values;
alter table app.platform_settings enable row level security;
revoke all on app.platform_settings from public, anon, authenticated;
comment on table app.platform_settings is
  'The platform''s own settings (0101): one row. auto_approve approves every translation, override, legal text and page string as it arrives, marked as automatic.';

create function app.auto_approve_on() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.auto_approve from app.platform_settings s where s.id), false)
$$;
revoke all on function app.auto_approve_on() from public, anon, authenticated;

-- ---------------------------------------------------------------- the registry, approved as written
alter table app.item_translations add column approved_auto boolean not null default false;
comment on column app.item_translations.approved_auto is 'Approved by the auto-approve switch (0101), not by a person.';

-- after item_translation_guard (triggers run in name order): the guard decides the step, this one
-- approves it while the switch is on, and says whether a person or the switch approved
create function app.item_translation_zauto() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status not in ('approved', 'retired') and app.auto_approve_on()
     and (new.source <> 'qa-fixture' or coalesce(current_setting('app.environment', true), '') = 'qa') then
    new.status := 'approved';
    new.approved_at := now();
    new.approved_by := coalesce(auth.uid(), (select s.auto_approve_by from app.platform_settings s where s.id));
    new.approved_auto := true;
  elsif new.status <> 'approved' then
    new.approved_auto := false;
  elsif tg_op = 'UPDATE' and old.status <> 'approved' and new.approved_auto is not distinct from old.approved_auto then
    -- approved now, and not by this trigger: a person did
    new.approved_auto := false;
  end if;
  return new;
end $$;
create trigger item_translation_zauto before insert or update on app.item_translations
  for each row execute function app.item_translation_zauto();

-- ---------------------------------------------------------------- bokmål and English overrides
create table app.message_overrides (
  locale        text not null check (locale in ('no', 'en')),
  key           text not null check (char_length(key) <= 300 and key ~ '^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$'),
  text          text not null check (char_length(btrim(text)) between 1 and 8000),
  status        text not null default 'draft' check (status in ('draft', 'in_review', 'adjudicated', 'pretested', 'approved')),
  source        text not null default 'professional' check (source in ('official', 'professional', 'machine')),
  notes         text check (notes is null or char_length(btrim(notes)) between 1 and 4000),
  source_hash   text check (source_hash is null or source_hash ~ '^[0-9a-f]{64}$'),
  approved_by   uuid references auth.users (id) on delete set null,
  approved_at   timestamptz,
  approved_auto boolean not null default false,
  updated_at    timestamptz not null default now(),
  primary key (locale, key),
  constraint message_overrides_approved_is_status check ((status = 'approved') = (approved_at is not null))
);
create index message_overrides_approved_by_idx on app.message_overrides (approved_by);
alter table app.message_overrides enable row level security;
revoke all on app.message_overrides from public, anon, authenticated;
comment on table app.message_overrides is
  'A bokmål or English message replaced from admin › Translations (0101, D-152). Laid over messages/ once approved.';

-- a new wording is a draft again; then the switch, as for the registry
create function app.message_override_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.text is distinct from old.text or new.source is distinct from old.source)
     and new.status is not distinct from old.status then
    new.status := 'draft';
  end if;
  if new.status <> 'approved' and app.auto_approve_on() then
    new.status := 'approved';
    new.approved_auto := true;
    new.approved_at := now();
    new.approved_by := coalesce(auth.uid(), (select s.auto_approve_by from app.platform_settings s where s.id));
  elsif new.status <> 'approved' then
    new.approved_at := null;
    new.approved_by := null;
    new.approved_auto := false;
  elsif tg_op = 'INSERT' or old.status <> 'approved' then
    new.approved_at := coalesce(new.approved_at, now());
    new.approved_by := coalesce(new.approved_by, auth.uid());
  end if;
  if tg_op = 'INSERT' or new.text is distinct from old.text or new.status is distinct from old.status
     or new.notes is distinct from old.notes then
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger message_override_guard before insert or update on app.message_overrides
  for each row execute function app.message_override_guard();

-- the approved texts, for anyone: page text, laid over the files by the application
create function public.message_overrides(p_locale text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(o.key, o.text), '{}'::jsonb)
  from app.message_overrides o
  where o.locale = p_locale and o.status = 'approved'
$$;
revoke all on function public.message_overrides(text) from public;
grant execute on function public.message_overrides(text) to anon, authenticated, service_role;

create function public.admin_message_overrides(p_locale text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if coalesce(p_locale, '') not in ('no', 'en') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  return jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object('key', o.key, 'text', o.text, 'status', o.status, 'source', o.source,
             'notes', o.notes, 'source_hash', o.source_hash, 'approved_at', o.approved_at, 'auto', o.approved_auto,
             'by', (select u.email::text from auth.users u where u.id = o.approved_by), 'updated_at', o.updated_at)
           order by o.key collate "C")
    from app.message_overrides o where o.locale = p_locale), '[]'::jsonb));
end $$;
revoke all on function public.admin_message_overrides(text) from public, anon;
grant execute on function public.admin_message_overrides(text) to authenticated;

-- rows: [{key, text, source, status, notes, source_hash}] to write, or [{key, remove: true}] to go
-- back to the file's own text. The application has checked every key against messages/ and every
-- text against its source's placeholders; this checks the shape and writes.
create function public.admin_message_overrides_import(p_locale text, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r         jsonb;
  v_key     text;
  v_text    text;
  v_status  text;
  v_source  text;
  v_old     app.message_overrides%rowtype;
  v_new     int := 0;
  v_changed int := 0;
  v_removed int := 0;
  v_same    int := 0;
  v_refused jsonb := '[]'::jsonb;
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if coalesce(p_locale, '') not in ('no', 'en') or jsonb_typeof(p_rows) <> 'array'
     or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 10000 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_key := r ->> 'key';
    begin
      if coalesce((r ->> 'remove')::boolean, false) then
        delete from app.message_overrides o where o.locale = p_locale and o.key = v_key;
        if found then v_removed := v_removed + 1; else v_same := v_same + 1; end if;
        continue;
      end if;
      v_text := btrim(coalesce(r ->> 'text', ''));
      v_status := coalesce(r ->> 'status', 'draft');
      v_source := coalesce(r ->> 'source', 'professional');
      if v_status not in ('draft', 'in_review', 'adjudicated', 'pretested') then
        raise exception 'status' using errcode = 'check_violation';
      end if;
      select * into v_old from app.message_overrides o where o.locale = p_locale and o.key = v_key;
      if not found then
        insert into app.message_overrides (locale, key, text, status, source, notes, source_hash)
        values (p_locale, v_key, v_text, v_status, v_source, nullif(btrim(coalesce(r ->> 'notes', '')), ''),
                nullif(lower(coalesce(r ->> 'source_hash', '')), ''));
        v_new := v_new + 1;
      elsif v_old.text is distinct from v_text or v_old.source is distinct from v_source then
        update app.message_overrides o
           set text = v_text, source = v_source, status = v_status,
               notes = coalesce(nullif(btrim(coalesce(r ->> 'notes', '')), ''), o.notes),
               source_hash = coalesce(nullif(lower(coalesce(r ->> 'source_hash', '')), ''), o.source_hash)
         where o.locale = p_locale and o.key = v_key;
        v_changed := v_changed + 1;
      else
        v_same := v_same + 1;
      end if;
    exception when check_violation or not_null_violation or string_data_right_truncation or invalid_text_representation then
      if jsonb_array_length(v_refused) < 50 then
        v_refused := v_refused || jsonb_build_object('key', v_key, 'error', sqlerrm);
      end if;
    end;
  end loop;
  perform app.admin_log('translations.override_import', null, 'locale', p_locale, null,
    jsonb_build_object('new', v_new, 'changed', v_changed, 'removed', v_removed, 'same', v_same,
                       'refused', jsonb_array_length(v_refused), 'auto', app.auto_approve_on()));
  return jsonb_build_object('ok', true, 'new', v_new, 'changed', v_changed, 'removed', v_removed,
                            'same', v_same, 'refused', v_refused);
end $$;
revoke all on function public.admin_message_overrides_import(text, jsonb) from public, anon;
grant execute on function public.admin_message_overrides_import(text, jsonb) to authenticated;

-- approve what the page showed: each key with the SHA-256 of the text on the screen
create function public.admin_message_overrides_approve(p_locale text, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if coalesce(p_locale, '') not in ('no', 'en') or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 10000 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  update app.message_overrides o set status = 'approved', approved_by = auth.uid(), approved_at = now(), approved_auto = false
  from jsonb_array_elements(p_items) i
  where o.locale = p_locale and o.key = i ->> 'key' and o.status <> 'approved'
    and encode(extensions.digest(convert_to(o.text, 'UTF8'), 'sha256'), 'hex') = lower(i ->> 'hash');
  get diagnostics v_n = row_count;
  perform app.admin_log('translations.override_approve', null, 'locale', p_locale, null, jsonb_build_object('approved', v_n));
  return jsonb_build_object('ok', true, 'approved', v_n);
end $$;
revoke all on function public.admin_message_overrides_approve(text, jsonb) from public, anon;
grant execute on function public.admin_message_overrides_approve(text, jsonb) to authenticated;

-- ---------------------------------------------------------------- the legal texts, marked
alter table app.legal_approvals add column auto boolean not null default false;
comment on column app.legal_approvals.auto is 'Approved by the auto-approve switch (0101), not read by a person.';

create or replace function public.admin_legal_set(p_key text, p_hash text, p_approved boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
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
    insert into app.legal_approvals (key, text_hash, approved_by, approved_at, auto)
    values (p_key, lower(p_hash), auth.uid(), now(), false)
    on conflict (key) do update set text_hash = excluded.text_hash, approved_by = excluded.approved_by, approved_at = excluded.approved_at, auto = false;
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

create or replace function public.admin_legal_approvals() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true, 'approvals', coalesce((
    select jsonb_agg(jsonb_build_object('key', a.key, 'hash', a.text_hash, 'at', a.approved_at, 'auto', a.auto,
                                        'by', (select u.email::text from auth.users u where u.id = a.approved_by))
                     order by a.key)
    from app.legal_approvals a), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- the switch, from the admin
create function public.admin_auto_approve() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_platform_admin(array['super_admin', 'support']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return (select jsonb_build_object('ok', true, 'on', s.auto_approve, 'at', s.auto_approve_at,
                                    'by', (select u.email::text from auth.users u where u.id = s.auto_approve_by))
          from app.platform_settings s where s.id);
end $$;
revoke all on function public.admin_auto_approve() from public, anon;
grant execute on function public.admin_auto_approve() to authenticated;

create function public.admin_auto_approve_set(p_on boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_items int := 0;
  v_overrides int := 0;
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_on is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  update app.platform_settings s set auto_approve = p_on, auto_approve_by = auth.uid(), auto_approve_at = now() where s.id;
  if p_on then
    -- everything waiting, now: the triggers approve each row they touch
    update app.item_translations t set updated_at = t.updated_at
    where t.status not in ('approved', 'retired')
      and (t.source <> 'qa-fixture' or coalesce(current_setting('app.environment', true), '') = 'qa');
    get diagnostics v_items = row_count;
    update app.message_overrides o set updated_at = o.updated_at where o.status <> 'approved';
    get diagnostics v_overrides = row_count;
  end if;
  perform app.admin_log('settings.auto_approve', null, 'platform', 'auto_approve', null,
                        jsonb_build_object('on', p_on, 'items', v_items, 'overrides', v_overrides));
  return jsonb_build_object('ok', true, 'on', p_on, 'items', v_items, 'overrides', v_overrides);
end $$;
revoke all on function public.admin_auto_approve_set(boolean) from public, anon;
grant execute on function public.admin_auto_approve_set(boolean) to authenticated;

-- what the admin shows and the switch approves: the legal texts [{key, hash}] and this build's
-- page strings [{locale, hash}], recorded as automatic. Nothing while the switch is off.
create function public.admin_auto_record(p_legal jsonb, p_ui jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_legal int := 0;
  v_ui int := 0;
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not app.auto_approve_on() then
    return jsonb_build_object('ok', true, 'legal', 0, 'ui', 0);
  end if;
  if jsonb_typeof(coalesce(p_legal, '[]')) <> 'array' or jsonb_typeof(coalesce(p_ui, '[]')) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  insert into app.legal_approvals (key, text_hash, approved_by, approved_at, auto)
  select i ->> 'key', lower(i ->> 'hash'), auth.uid(), now(), true
  from jsonb_array_elements(coalesce(p_legal, '[]')) i
  where char_length(i ->> 'key') between 3 and 200 and (i ->> 'key') ~ '^[A-Za-z0-9][A-Za-z0-9:._/@\[\]-]*$'
    and lower(i ->> 'hash') ~ '^[0-9a-f]{64}$'
  on conflict (key) do update set text_hash = excluded.text_hash, approved_by = excluded.approved_by,
                                   approved_at = excluded.approved_at, auto = true
  where app.legal_approvals.text_hash <> excluded.text_hash;
  get diagnostics v_legal = row_count;
  insert into app.ui_translation_approvals (locale, messages_hash, approved_by)
  select i ->> 'locale', lower(i ->> 'hash'), auth.uid()
  from jsonb_array_elements(coalesce(p_ui, '[]')) i
  where (i ->> 'locale') in ('en', 'pl', 'uk', 'lt', 'sv', 'da') and lower(i ->> 'hash') ~ '^[0-9a-f]{64}$'
  on conflict do nothing;
  get diagnostics v_ui = row_count;
  if v_legal + v_ui > 0 then
    perform app.admin_log('legal.auto_approve', null, 'platform', 'auto_approve', null, jsonb_build_object('legal', v_legal, 'ui', v_ui));
  end if;
  return jsonb_build_object('ok', true, 'legal', v_legal, 'ui', v_ui);
end $$;
revoke all on function public.admin_auto_record(jsonb, jsonb) from public, anon;
grant execute on function public.admin_auto_record(jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------- a respondent page and a mail
create or replace function app.round_locale_state(p_round uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(l.locale, jsonb_build_object(
    'missing', (select count(*) from (select distinct k from app.round_item_keys(p_round) k) keys(k)
                where keys.k not in (select x.item_id from app.round_texts(p_round, l.locale) x)
                  and not (l.locale = 'en' and keys.k like 'mfactor:%')),
    'ui', (select coalesce(jsonb_agg(a.messages_hash order by a.approved_at), '[]'::jsonb)
           from app.ui_translation_approvals a where a.locale = l.locale),
    'pilot', exists (select 1 from app.locale_pilots p join app.rounds r on r.org_id = p.org_id
                     where r.id = p_round and p.locale = l.locale),
    -- 0101: while the switch is on, this build's page strings count as approved
    'auto', app.auto_approve_on())), '{}'::jsonb)
  from (values ('en'), ('pl'), ('uk'), ('lt'), ('sv'), ('da')) as l(locale)
$$;

-- ---------------------------------------------------------------- the registry's rows, marked
create or replace function public.admin_translations(p_locale text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $fn$
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
                                          'approvable', app.translation_approvable(t.source, t.status, t.locale),
                                          -- 0101: approved by the switch rather than a person
                                          'auto', t.approved_auto) order by t.item_id)
      from app.item_translations t where t.locale = p_locale), '[]'::jsonb),
    'ui', coalesce((
      select jsonb_agg(jsonb_build_object('hash', a.messages_hash, 'at', a.approved_at) order by a.approved_at)
      from app.ui_translation_approvals a where a.locale = p_locale), '[]'::jsonb));
end $fn$;
