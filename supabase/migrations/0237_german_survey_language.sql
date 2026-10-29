-- 0237_german_survey_language.sql — German is a survey language (DE-A2, D-292; X-115).
--
-- German has been a platform language since 0235 (D-289). This makes it a survey language too: the
-- respondent texts (the core statements, the questions outside the index, the survey pages, the
-- invitation, reminder and SMS texts and the published modules) are drafted into the translation
-- registry under locale `de` (docs/translations/de.orgpuls-translations.json, origin «machine»), and
-- the database's lists of survey languages take `de` so the import, the approval, a pilot, a round's
-- language state, the dispatcher's texts, the employee register and the Entra sync all know it.
--
-- Every function here is the latest definition the repository holds (0086, 0101, 0165) under the
-- name 0206 gave it, with `de` added to its list and nothing else changed. tests/unit/locales.test.ts
-- holds each list to lib/i18n/locales.ts. Nothing is approved here: a German text reaches a
-- respondent only once a person has approved it (0086 app.translation_approvable), as for every
-- other survey language. Nothing here touches an answer table (I6).

-- ---------------------------------------------------------------- the lists
alter table app.employees drop constraint employees_language_check;
alter table app.employees add constraint employees_language_check
  check (language in ('no', 'en', 'pl', 'uk', 'lt', 'sv', 'da', 'de'));

alter table app.item_translations drop constraint item_translations_locale_check;
alter table app.item_translations add constraint item_translations_locale_check
  check (locale in ('en', 'pl', 'uk', 'lt', 'sv', 'da', 'de'));

alter table app.ui_translation_approvals drop constraint ui_translation_approvals_locale_check;
alter table app.ui_translation_approvals add constraint ui_translation_approvals_locale_check
  check (locale in ('en', 'pl', 'uk', 'lt', 'sv', 'da', 'de'));

alter table app.locale_pilots drop constraint locale_pilots_locale_check;
alter table app.locale_pilots add constraint locale_pilots_locale_check
  check (locale in ('en', 'pl', 'uk', 'lt', 'sv', 'da', 'de'));

-- ---------------------------------------------------------------- a round's language state (0101's, with de)
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
  from (values ('en'), ('pl'), ('uk'), ('lt'), ('sv'), ('da'), ('de')) as l(locale)
$$;

-- ---------------------------------------------------------------- the dispatcher's texts (0086's, with de)
create or replace function public.dispatch_language_texts() returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object(
    'mail', coalesce((select jsonb_object_agg(l, app.approved_texts(l, 'mail:')) from unnest(array['pl', 'uk', 'lt', 'sv', 'da', 'de']) l), '{}'::jsonb),
    'ui', coalesce((select jsonb_object_agg(l, app.approved_texts(l, 'ui:')) from unnest(array['pl', 'uk', 'lt', 'sv', 'da', 'de']) l), '{}'::jsonb))
$fn$;
revoke all on function public.dispatch_language_texts() from public, anon, authenticated;
grant execute on function public.dispatch_language_texts() to service_role;

-- ---------------------------------------------------------------- the platform's operations (0086's and 0101's bodies, under 0206's names, with de)
-- `create or replace` keeps what 0206 set: owner, and no execute for public, anon, authenticated or
-- service_role, so platform_command stays the only way in.
create or replace function app.op_translations_import(p_locale text, p_rows jsonb) returns jsonb
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
  if coalesce(p_locale, '') not in ('pl', 'uk', 'lt', 'sv', 'da', 'de', 'en') or jsonb_typeof(p_rows) <> 'array'
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

create or replace function app.op_translations_approve(p_locale text, p_ui_hash text, p_digest text) returns jsonb
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
  if coalesce(p_locale, '') not in ('en', 'pl', 'uk', 'lt', 'sv', 'da', 'de')
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

create or replace function app.op_locale_pilot(p_locale text, p_org uuid, p_on boolean, p_reason text) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  if coalesce(p_locale, '') not in ('en', 'pl', 'uk', 'lt', 'sv', 'da', 'de') or p_on is null then
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

create or replace function app.op_auto_record(p_legal jsonb, p_ui jsonb) returns jsonb
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
  where (i ->> 'locale') in ('en', 'pl', 'uk', 'lt', 'sv', 'da', 'de') and lower(i ->> 'hash') ~ '^[0-9a-f]{64}$'
  on conflict do nothing;
  get diagnostics v_ui = row_count;
  if v_legal + v_ui > 0 then
    perform app.admin_log('legal.auto_approve', null, 'platform', 'auto_approve', null, jsonb_build_object('legal', v_legal, 'ui', v_ui));
  end if;
  return jsonb_build_object('ok', true, 'legal', v_legal, 'ui', v_ui);
end $$;

-- ---------------------------------------------------------------- the Entra sync's apply step (0165's, with de)
-- A person whose directory language is German keeps it in the employee register, as a Swede keeps Swedish.
create or replace function public.entra_sync_apply(p_org uuid, p_run uuid, p_plan jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  s app.entra_sync;
  x jsonb;
  k text;
  v_guid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_oid text;
  v_name text;
  v_email text;
  v_lang text;
  v_phone text;
  v_emp app.employees;
  v_n int;
  v_place text;
  v_gid uuid;
  c_added int := 0; c_linked int := 0; c_updated int := 0; c_deactivated int := 0;
  c_moved int := 0; c_deferred int := 0; c_renamed int := 0; c_rename_conflicts int := 0;
  v_skipped jsonb := '{}';
  v_counts jsonb;
  v_new jsonb := '[]';
  v_touch text[] := '{}';
begin
  select * into s from app.entra_sync x0 where x0.org_id = p_org for update;
  if not found or s.run_id is distinct from p_run or s.run_status is distinct from 'running' then
    return jsonb_build_object('ok', false, 'error', 'not_running');
  end if;
  if jsonb_typeof(p_plan) <> 'object'
     or jsonb_array_length(coalesce(p_plan->'people', '[]')) > 20000
     or jsonb_array_length(coalesce(p_plan->'members'->'add', '[]')) > 50000 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  -- no round of this organisation can open while the plan is applied (rule 2)
  perform 1 from app.rounds r where r.org_id = p_org for share;

  -- ---- the groups: renames (through app.groups' own trigger, rule 6), nesting
  for x in select value from jsonb_array_elements(coalesce(p_plan->'groups', '[]')) loop
    continue when coalesce(x->>'id', '') !~ v_guid;
    if jsonb_typeof(x->'nested') = 'boolean' then
      update app.entra_group_map set nested = (x->>'nested')::boolean where org_id = p_org and entra_group_id = x->>'id';
    end if;
    v_name := left(btrim(regexp_replace(coalesce(x->>'name', ''), '\s+', ' ', 'g')), 60);
    v_name := btrim(v_name);
    if v_name <> '' then
      select m.group_id into v_gid from app.entra_group_map m where m.org_id = p_org and m.entra_group_id = x->>'id';
      if v_gid is not null then
        update app.entra_group_map set entra_name = left(btrim(x->>'name'), 256) where org_id = p_org and entra_group_id = x->>'id';
        if exists (select 1 from app.groups g where g.org_id = p_org and lower(g.name) = lower(v_name) and g.id <> v_gid) then
          c_rename_conflicts := c_rename_conflicts + 1;
        else
          update app.groups set name = v_name where id = v_gid and name is distinct from v_name;
          if found then c_renamed := c_renamed + 1; end if;
        end if;
      end if;
    end if;
  end loop;

  -- ---- the membership mirror: whole groups replaced, delta changes, removed users
  for k in select jsonb_object_keys(coalesce(p_plan->'members'->'replace', '{}')) loop
    continue when not exists (select 1 from app.entra_group_map m where m.org_id = p_org and m.entra_group_id = k);
    delete from app.entra_members em where em.org_id = p_org and em.entra_group_id = k;
    insert into app.entra_members (org_id, entra_group_id, object_id)
    select distinct p_org, k, o from jsonb_array_elements_text(p_plan->'members'->'replace'->k) o where o ~ v_guid
    on conflict do nothing;
  end loop;
  delete from app.entra_members em
  using jsonb_array_elements(coalesce(p_plan->'members'->'remove', '[]')) r
  where em.org_id = p_org and em.entra_group_id = r->>0 and em.object_id = r->>1;
  insert into app.entra_members (org_id, entra_group_id, object_id)
  select distinct p_org, a->>0, a->>1 from jsonb_array_elements(coalesce(p_plan->'members'->'add', '[]')) a
  where a->>1 ~ v_guid and exists (select 1 from app.entra_group_map m where m.org_id = p_org and m.entra_group_id = a->>0)
  on conflict do nothing;
  delete from app.entra_members em
  where em.org_id = p_org and em.object_id in (select jsonb_array_elements_text(coalesce(p_plan->'removedUsers', '[]')));

  -- ---- people: added, linked (the first time, by e-mail), updated
  for x in select value from jsonb_array_elements(coalesce(p_plan->'people', '[]')) loop
    v_oid := x->>'objectId';
    continue when coalesce(v_oid, '') !~ v_guid or x->>'op' not in ('add', 'link', 'update');
    -- in none of the selected groups: nobody is added or brought back for that
    continue when not exists (select 1 from app.entra_members em where em.org_id = p_org and em.object_id = v_oid);
    v_name := nullif(left(btrim(regexp_replace(coalesce(x->>'fullName', ''), '\s+', ' ', 'g')), 120), '');
    v_email := nullif(btrim(coalesce(x->>'email', '')), '');
    if v_email is not null and (v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or char_length(v_email) > 254) then
      v_email := null;
    end if;
    v_lang := case when x->>'language' in ('no', 'en', 'pl', 'uk', 'lt', 'sv', 'da', 'de') then x->>'language' end;
    v_phone := case when s.include_phone and x->>'phone' ~ '^\+[1-9][0-9]{7,14}$' then x->>'phone' end;

    select * into v_emp from app.employees e where e.org_id = p_org and e.entra_object_id = v_oid for update;
    if not found and x->>'op' = 'link' then
      select * into v_emp from app.employees e
      where e.org_id = p_org and e.id::text = x->>'employeeId' and e.entra_object_id is null
        and v_email is not null and lower(e.email) = lower(v_email)
      for update;
      if found then
        -- linked, never duplicated; and only if no other person in the register has the address (rule 5)
        if exists (select 1 from app.employees e where e.org_id = p_org and e.id <> v_emp.id and lower(e.email) = lower(v_email)) then
          v_skipped := jsonb_set(v_skipped, '{email_ambiguous}', to_jsonb(coalesce((v_skipped->>'email_ambiguous')::int, 0) + 1));
          insert into app.entra_skips (org_id, object_id, reason) values (p_org, v_oid, 'email_ambiguous')
          on conflict (org_id, object_id) do update set reason = excluded.reason;
          continue;
        end if;
        update app.employees
        set entra_object_id = v_oid, source = 'entra', entra_group_pinned = false,
            full_name = coalesce(v_name, full_name), email = v_email,
            language = coalesce(v_lang, language), phone = coalesce(v_phone, phone),
            active = active or coalesce((x->>'activate')::boolean, false)
        where id = v_emp.id;
        c_linked := c_linked + 1;
        v_touch := v_touch || v_oid;
      else
        v_skipped := jsonb_set(v_skipped, '{email_taken}', to_jsonb(coalesce((v_skipped->>'email_taken')::int, 0) + 1));
        insert into app.entra_skips (org_id, object_id, reason) values (p_org, v_oid, 'email_taken')
        on conflict (org_id, object_id) do update set reason = excluded.reason;
      end if;
      continue;
    end if;

    if not found then
      -- a new person: needs a name and an address nobody in the register has (rule 5)
      continue when x->>'op' <> 'add' or v_name is null or v_email is null;
      select count(*) into v_n from app.employees e where e.org_id = p_org and lower(e.email) = lower(v_email);
      if v_n > 0 or exists (select 1 from jsonb_array_elements(v_new) y where lower(y->>'email') = lower(v_email) or y->>'oid' = v_oid) then
        v_skipped := jsonb_set(v_skipped, '{email_taken}', to_jsonb(coalesce((v_skipped->>'email_taken')::int, 0) + 1));
        insert into app.entra_skips (org_id, object_id, reason) values (p_org, v_oid, 'email_taken')
        on conflict (org_id, object_id) do update set reason = excluded.reason;
        continue;
      end if;
      v_new := v_new || jsonb_build_object('oid', v_oid, 'name', v_name, 'email', v_email, 'lang', v_lang, 'phone', v_phone);
      continue;
    end if;

    -- an update of a linked person: what the directory says now
    if v_email is not null and lower(v_email) is distinct from lower(v_emp.email)
       and (exists (select 1 from app.employees e where e.org_id = p_org and e.id <> v_emp.id and lower(e.email) = lower(v_email))
            or exists (select 1 from jsonb_array_elements(v_new) y where lower(y->>'email') = lower(v_email))) then
      v_skipped := jsonb_set(v_skipped, '{email_taken}', to_jsonb(coalesce((v_skipped->>'email_taken')::int, 0) + 1));
      v_email := null;
    end if;
    update app.employees
    set full_name = coalesce(v_name, full_name), email = coalesce(v_email, email),
        language = coalesce(v_lang, language), phone = coalesce(v_phone, phone),
        active = active or coalesce((x->>'activate')::boolean, false)
    where id = v_emp.id
      and (full_name is distinct from coalesce(v_name, full_name) or email is distinct from coalesce(v_email, email)
           or language is distinct from coalesce(v_lang, language) or phone is distinct from coalesce(v_phone, phone)
           or (not active and coalesce((x->>'activate')::boolean, false)));
    if found then c_updated := c_updated + 1; end if;
  end loop;
  -- the new people in one statement: one «employees.imported» event per run, as one CSV paste makes
  insert into app.employees (org_id, full_name, email, language, phone, group_id, source, entra_object_id, active)
  select p_org, r.name, r.email, r.lang, r.phone, app.entra_desired_group(p_org, r.oid), 'entra', r.oid, true
  from jsonb_to_recordset(v_new) as r(oid text, name text, email text, lang text, phone text);
  get diagnostics c_added = row_count;

  -- ---- deactivations at once (rule 3): only active = false, nothing else about the person
  for x in select value from jsonb_array_elements(coalesce(p_plan->'deactivate', '[]')) loop
    continue when coalesce(x->>'objectId', '') !~ v_guid;
    update app.employees set active = false where org_id = p_org and entra_object_id = x->>'objectId' and active;
    if found then c_deactivated := c_deactivated + 1; end if;
  end loop;
  -- and whoever is in none of the selected groups any more, whatever the plan said (rule 1)
  with gone as (
    update app.employees e set active = false
    where e.org_id = p_org and e.source = 'entra' and e.active
      and not exists (select 1 from app.entra_members em where em.org_id = p_org and em.object_id = e.entra_object_id)
    returning 1)
  select c_deactivated + count(*) into c_deactivated from gone;

  -- ---- groups: re-derived from the mirror; held back while a round is open (rule 2)
  for v_oid in select distinct o from (select jsonb_array_elements_text(coalesce(p_plan->'place', '[]')) o
                                      union select unnest(v_touch)) z loop
    continue when v_oid !~ v_guid;
    v_place := app.entra_place(p_org, v_oid);
    if v_place = 'moved' then c_moved := c_moved + 1; elsif v_place = 'deferred' then c_deferred := c_deferred + 1; end if;
  end loop;
  c_moved := c_moved + app.entra_apply_deferred(p_org);

  -- ---- who is not imported, and why: kept for people still in a selected group
  delete from app.entra_skips sk
  where sk.org_id = p_org and sk.object_id in (select jsonb_array_elements_text(coalesce(p_plan->'skips'->'clear', '[]')));
  insert into app.entra_skips as sk (org_id, object_id, reason)
  select p_org, r->>'objectId', r->>'reason' from jsonb_array_elements(coalesce(p_plan->'skips'->'set', '[]')) r
  where r->>'objectId' ~ v_guid
    and r->>'reason' in ('guest', 'disabled', 'no_mailbox', 'no_name', 'email_taken', 'email_ambiguous', 'no_data')
  on conflict (org_id, object_id) do update set reason = excluded.reason;
  delete from app.entra_skips sk
  where sk.org_id = p_org
    and (not exists (select 1 from app.entra_members em where em.org_id = p_org and em.object_id = sk.object_id)
         or exists (select 1 from app.employees e where e.org_id = p_org and e.entra_object_id = sk.object_id));

  -- ---- the run's end: links saved only now, with everything they describe
  for k, x in select key, value from jsonb_each(coalesce(p_plan->'predicted'->'skipped', '{}')) loop
    if k in ('guest', 'disabled', 'no_mailbox', 'no_name', 'email_taken', 'email_ambiguous', 'no_data') and jsonb_typeof(x) = 'number' then
      v_skipped := jsonb_set(v_skipped, array[k], to_jsonb(coalesce((v_skipped->>k)::int, 0) + (x::text)::int));
    end if;
  end loop;
  v_counts := jsonb_build_object(
    'added', c_added, 'linked', c_linked, 'updated', c_updated, 'deactivated', c_deactivated,
    'moved', c_moved, 'deferred', c_deferred, 'renamed', c_renamed, 'rename_conflicts', c_rename_conflicts,
    'conflicts', jsonb_array_length(coalesce(p_plan->'conflicts', '[]')),
    'applied_deferred', coalesce((s.run_counts->>'applied_deferred')::int, 0),
    'skipped', v_skipped,
    'full', coalesce((p_plan->'links'->>'full')::boolean, false));
  update app.entra_sync
  set users_delta_link = case when p_plan->'links'->>'users' like 'https://graph.microsoft.com/v1.0/%' then p_plan->'links'->>'users' else users_delta_link end,
      group_delta_links = coalesce((select array_agg(l) from jsonb_array_elements_text(coalesce(p_plan->'links'->'groups', '[]')) l
                                    where l like 'https://graph.microsoft.com/v1.0/%'), '{}'),
      links_at = now(), full_needed = false,
      run_status = 'done', run_finished_at = now(), run_error = null, run_counts = v_counts
  where org_id = p_org;
  return jsonb_build_object('ok', true, 'counts', v_counts - 'skipped' - 'full');
end $fn$;
revoke all on function public.entra_sync_apply(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.entra_sync_apply(uuid, uuid, jsonb) to service_role;
