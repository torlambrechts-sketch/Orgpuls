-- 0194 — the CRM's record history: changelog, events and the standard columns (WP-0.2; D-209)
--
-- docs/crm-enrichment/INSTRUCTIONS.md A6, PIP-04, SF-02: every change to a CRM record leaves a changelog entry
-- (field, old value, new value, who, when, source) and an event, written in the same transaction as the change;
-- a record carries created_by, updated_by and a version that guards against lost updates.
--
-- Written by triggers, so every path is covered — the admin's forms, imports, the account sync, the
-- dispatcher's own updates — not only the RPCs that remember to:
--   app.crm_changes      one row per changed field. Append-only: nobody changes a line, and a line is removed
--                        only once its record is gone (an erased contact takes its history with it, SEC-11)
--   app.crm_event_types  the CRM's event catalogue, object.past_tense as the growth catalogue names them
--   app.crm_events       the outbox the dispatcher (WP-0.6) delivers from: name, record, actor, source and the
--                        names of the fields that changed — never their values
-- Why not app.growth_events: that table is analytics by design — its guard refuses any UUID in an event's
-- props (0141), and its catalogue is the Growth › Event catalogue view. CRM events must name their record for
-- workflows and webhooks, so they keep their own catalogue and outbox; the growth guard is untouched.
--
-- Source of a change: app.change_source when a function sets it; otherwise the import and the account sync
-- are recognised by the consent ledger's own marker (0141's app.consent_via); otherwise a signed-in admin is
-- 'user' and anything without a session (pg_cron, the dispatcher) is 'automation'.
-- Not tracked (bookkeeping, not content): id, product_id, created_at, updated_at, version, created_by,
-- updated_by, stage_changed_at, last_activity_at, last_engaged_at, manager_seen_at, optin_hash (a token's hash,
-- never logged), optin_sent_at, admin_email. The version moves only when a tracked field changes, so an
-- engagement or a sync stamp never makes an open form stale.

-- ------------------------------------------------------------------------------------------ standard columns
alter table app.crm_companies
  add column version int not null default 1 check (version >= 1),
  add column created_by uuid references auth.users (id) on delete set null,
  add column updated_by uuid references auth.users (id) on delete set null;
alter table app.crm_contacts
  add column version int not null default 1 check (version >= 1),
  add column created_by uuid references auth.users (id) on delete set null,
  add column updated_by uuid references auth.users (id) on delete set null;
alter table app.crm_activities
  add column product_id text not null default 'orgpuls',
  add column version int not null default 1 check (version >= 1),
  add column updated_by uuid references auth.users (id) on delete set null;
create index crm_companies_created_by_idx on app.crm_companies (created_by);
create index crm_companies_updated_by_idx on app.crm_companies (updated_by);
create index crm_contacts_created_by_idx on app.crm_contacts (created_by);
create index crm_contacts_updated_by_idx on app.crm_contacts (updated_by);
create index crm_activities_updated_by_idx on app.crm_activities (updated_by);

-- ------------------------------------------------------------------------------------------ catalogue and outbox
create table app.crm_event_types (
  name        text primary key check (name ~ '^[a-z_]+\.[a-z_]+$' and char_length(name) <= 60),
  entity      text not null check (entity in ('company', 'contact', 'activity')),
  description text not null check (char_length(description) between 3 and 300),
  created_at  timestamptz not null default now()
);
alter table app.crm_event_types enable row level security;
revoke all on app.crm_event_types from public, anon, authenticated;
insert into app.crm_event_types (name, entity, description) values
  ('company.added',      'company',  'A company was created: by hand, import, the register or the account sync'),
  ('company.updated',    'company',  'A tracked field of a company changed; the event names the fields'),
  ('company.stage_changed', 'company', 'A company moved to another stage'),
  ('company.deleted',    'company',  'A company was removed'),
  ('contact.added',      'contact',  'A contact was created'),
  ('contact.updated',    'contact',  'A tracked field of a contact changed; the event names the fields'),
  ('contact.deleted',    'contact',  'A contact was erased'),
  ('activity.added',     'activity', 'An activity or task was logged'),
  ('activity.updated',   'activity', 'A tracked field of an activity changed'),
  ('activity.completed', 'activity', 'A task was marked done'),
  ('activity.deleted',   'activity', 'An activity was removed');

create table app.crm_events (
  id          bigint generated always as identity primary key,
  product_id  text not null default 'orgpuls',
  name        text not null references app.crm_event_types (name) on delete restrict,
  entity      text not null check (entity in ('company', 'contact', 'activity')),
  record_id   uuid not null,
  actor       uuid,
  source      text not null check (source in ('user', 'automation', 'api', 'import', 'sync', 'connector', 'meeting')),
  fields      text[] not null default '{}',
  occurred_at timestamptz not null default now()
);
create index crm_events_record_idx on app.crm_events (entity, record_id, id desc);
create index crm_events_name_idx on app.crm_events (name, id);
alter table app.crm_events enable row level security;
revoke all on app.crm_events from public, anon, authenticated;

create table app.crm_changes (
  id         bigint generated always as identity primary key,
  product_id text not null default 'orgpuls',
  entity     text not null check (entity in ('company', 'contact', 'activity')),
  record_id  uuid not null,
  field      text not null check (field ~ '^[a-z_]{1,60}$'),
  old_value  jsonb,
  new_value  jsonb,
  actor      uuid,
  source     text not null check (source in ('user', 'automation', 'api', 'import', 'sync', 'connector', 'meeting')),
  at         timestamptz not null default now()
);
create index crm_changes_record_idx on app.crm_changes (entity, record_id, id desc);
alter table app.crm_changes enable row level security;
revoke all on app.crm_changes from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------ the rules
-- what a change is not: bookkeeping columns
create function app.crm_untracked() returns text[] language sql immutable set search_path = '' as $$
  select array['id', 'product_id', 'created_at', 'updated_at', 'version', 'created_by', 'updated_by', 'stage_changed_at',
               'last_activity_at', 'last_engaged_at', 'manager_seen_at', 'optin_hash', 'optin_sent_at', 'admin_email']
$$;

create function app.crm_change_source() returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    nullif(current_setting('app.change_source', true), ''),
    case nullif(current_setting('app.consent_via', true), '') when 'import' then 'import' when 'account_sync' then 'sync' end,
    case when auth.uid() is not null then 'user' else 'automation' end)
$$;

-- the version moves, and who changed it is stamped, only when a tracked field changes
create function app.crm_stamp() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if tg_table_name <> 'crm_activities' then
      new.created_by := coalesce(new.created_by, auth.uid());
    end if;
    return new;
  end if;
  if exists (select 1 from jsonb_each(to_jsonb(new)) n
             where not (n.key = any (app.crm_untracked())) and n.value is distinct from to_jsonb(old) -> n.key) then
    new.version := old.version + 1;
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;

create function app.crm_track() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_entity text := case tg_table_name when 'crm_companies' then 'company' when 'crm_contacts' then 'contact' else 'activity' end;
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_id uuid := coalesce(v_new ->> 'id', v_old ->> 'id')::uuid;
  v_source text := app.crm_change_source();
  v_actor uuid := auth.uid();
  v_fields text[];
begin
  if tg_op = 'INSERT' then
    insert into app.crm_events (name, entity, record_id, actor, source) values (v_entity || '.added', v_entity, v_id, v_actor, v_source);
  elsif tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into v_fields from jsonb_each(v_new) n
    where not (n.key = any (app.crm_untracked())) and n.value is distinct from v_old -> n.key;
    if v_fields is null then
      return null;
    end if;
    insert into app.crm_changes (entity, record_id, field, old_value, new_value, actor, source)
    select v_entity, v_id, f, v_old -> f, v_new -> f, v_actor, v_source from unnest(v_fields) f;
    insert into app.crm_events (name, entity, record_id, actor, source, fields) values (v_entity || '.updated', v_entity, v_id, v_actor, v_source, v_fields);
    if v_entity = 'company' and 'stage' = any (v_fields) then
      insert into app.crm_events (name, entity, record_id, actor, source, fields) values ('company.stage_changed', v_entity, v_id, v_actor, v_source, array['stage']);
    end if;
    if v_entity = 'activity' and 'done_at' = any (v_fields) and v_old ->> 'done_at' is null then
      insert into app.crm_events (name, entity, record_id, actor, source, fields) values ('activity.completed', v_entity, v_id, v_actor, v_source, array['done_at']);
    end if;
  else
    -- the record is gone: its history goes with it (an erased contact leaves no old values behind); the
    -- event names only the record and the kind of change
    delete from app.crm_changes where entity = v_entity and record_id = v_id;
    insert into app.crm_events (name, entity, record_id, actor, source) values (v_entity || '.deleted', v_entity, v_id, v_actor, v_source);
  end if;
  return null;
end $$;

create trigger crm_companies_stamp before insert or update on app.crm_companies for each row execute function app.crm_stamp();
create trigger crm_contacts_stamp before insert or update on app.crm_contacts for each row execute function app.crm_stamp();
create trigger crm_activities_stamp before update on app.crm_activities for each row execute function app.crm_stamp();
create trigger crm_companies_track after insert or update or delete on app.crm_companies for each row execute function app.crm_track();
create trigger crm_contacts_track after insert or update or delete on app.crm_contacts for each row execute function app.crm_track();
create trigger crm_activities_track after insert or update or delete on app.crm_activities for each row execute function app.crm_track();

-- nobody changes a line of history; a line goes only when its record is gone (CLAUDE.md: immutability
-- triggers permit referential maintenance — here the record's own removal)
create function app.crm_changes_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'crm_changes is a record: lines are not changed' using errcode = 'check_violation';
  end if;
  if (old.entity = 'company' and exists (select 1 from app.crm_companies x where x.id = old.record_id))
     or (old.entity = 'contact' and exists (select 1 from app.crm_contacts x where x.id = old.record_id))
     or (old.entity = 'activity' and exists (select 1 from app.crm_activities x where x.id = old.record_id)) then
    raise exception 'crm_changes is a record: a line goes only with its record' using errcode = 'check_violation';
  end if;
  return old;
end $$;
create trigger crm_changes_guard before update or delete on app.crm_changes for each row execute function app.crm_changes_guard();

create function app.crm_events_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'crm_events is a record: events are not changed' using errcode = 'check_violation';
end $$;
create trigger crm_events_guard before update on app.crm_events for each row execute function app.crm_events_guard();

revoke all on function app.crm_untracked(), app.crm_change_source(), app.crm_stamp(), app.crm_track(), app.crm_changes_guard(),
  app.crm_events_guard() from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------ the reader
-- History on a company or contact page: the changelog (newest first, a page at a time), the record's events,
-- and who created and last changed it. Audited; volatile because it writes the audit row.
create function public.admin_crm_history(p_entity text, p_record uuid, p_before bigint default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_page int := 50;
  v_rows jsonb;
  v_more boolean;
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_entity not in ('company', 'contact', 'activity') or p_record is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  perform app.admin_log('crm.history', null, 'crm_' || p_entity, p_record::text);
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'field', x.field, 'old', x.old_value, 'new', x.new_value,
                                               'by', u.email, 'source', x.source, 'at', x.at) order by x.id desc), '[]')
    into v_rows
  from (select * from app.crm_changes c where c.entity = p_entity and c.record_id = p_record and (p_before is null or c.id < p_before)
        order by c.id desc limit v_page) x
  left join auth.users u on u.id = x.actor;
  select exists (select 1 from app.crm_changes c where c.entity = p_entity and c.record_id = p_record
                 and c.id < coalesce((select min((r->>'id')::bigint) from jsonb_array_elements(v_rows) r), 0))
    into v_more;
  return jsonb_build_object('ok', true, 'changes', v_rows, 'more', v_more,
    'events', (select coalesce(jsonb_agg(jsonb_build_object('name', e.name, 'at', e.occurred_at, 'source', e.source, 'by', u.email,
                                                            'fields', to_jsonb(e.fields)) order by e.id desc), '[]')
               from (select * from app.crm_events e where e.entity = p_entity and e.record_id = p_record
                     and e.name not like '%.updated' order by e.id desc limit v_page) e
               left join auth.users u on u.id = e.actor),
    'created_by', (select u.email from auth.users u where u.id = case p_entity
                     when 'company' then (select x.created_by from app.crm_companies x where x.id = p_record)
                     when 'contact' then (select x.created_by from app.crm_contacts x where x.id = p_record) end),
    'updated_by', (select u.email from auth.users u where u.id = case p_entity
                     when 'company' then (select x.updated_by from app.crm_companies x where x.id = p_record)
                     when 'contact' then (select x.updated_by from app.crm_contacts x where x.id = p_record)
                     else (select x.updated_by from app.crm_activities x where x.id = p_record) end));
end $$;
revoke all on function public.admin_crm_history(text, uuid, bigint) from public, anon;
grant execute on function public.admin_crm_history(text, uuid, bigint) to authenticated;

-- ------------------------------------------------------------------------------------------ lost updates

CREATE OR REPLACE FUNCTION public.admin_crm_company_save(p_id uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid := p_id;
  v_old app.crm_companies;
  v_tags text[];
  v_orgnr text := nullif(regexp_replace(coalesce(p->>'org_number', ''), '\s', '', 'g'), '');
  v_stage text := nullif(p->>'stage', '');
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p ? 'name' and char_length(btrim(coalesce(p->>'name', ''))) not between 1 and 200 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  if v_orgnr is not null and v_orgnr !~ '^[0-9]{9}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_org_number');
  end if;
  -- 0093: any configured stage a person may set: not one that follows the plan, not an archived one
  if v_stage is not null and not exists (select 1 from app.crm_stages s where s.key = v_stage and not s.managed and s.archived_at is null) then
    return jsonb_build_object('ok', false, 'error', 'invalid_stage');
  end if;
  if p ? 'tags' then
    if jsonb_typeof(p->'tags') <> 'array' or jsonb_array_length(p->'tags') > 20
       or exists (select 1 from jsonb_array_elements_text(p->'tags') t where t !~ '^[a-z0-9æøå_-]{1,40}$') then
      return jsonb_build_object('ok', false, 'error', 'invalid_tags');
    end if;
    v_tags := array(select distinct jsonb_array_elements_text(p->'tags'));
  end if;
  if nullif(p->>'owner_id', '') is not null and not exists (
      select 1 from app.platform_admins a where a.user_id = (p->>'owner_id')::uuid and a.active) then
    return jsonb_build_object('ok', false, 'error', 'invalid_owner');
  end if;
  -- 0119: the deal's yearly value in whole kroner, or empty for none
  if p ? 'value_nok' and nullif(p->>'value_nok', '') is not null and (p->>'value_nok' !~ '^[0-9]{1,9}$' or (p->>'value_nok')::bigint > 100000000) then
    return jsonb_build_object('ok', false, 'error', 'invalid_value');
  end if;
  begin
    perform nullif(p->>'next_step_at', '')::date;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'invalid_date');
  end;

  if v_id is null then
    if not p ? 'name' then
      return jsonb_build_object('ok', false, 'error', 'invalid_name');
    end if;
    if v_orgnr is not null and exists (select 1 from app.crm_companies c where c.product_id = 'orgpuls' and c.org_number = v_orgnr) then
      return jsonb_build_object('ok', false, 'error', 'exists');
    end if;
    insert into app.crm_companies (org_number, name, nace_code, employees, municipality, website, phone, source, stage, owner_id,
                                   next_step, next_step_at, tags, value_nok)
    values (v_orgnr, btrim(p->>'name'), case when p->>'nace_code' ~ '^[0-9]{2}(\.[0-9]{1,3})?$' then p->>'nace_code' end,
            case when p->>'employees' ~ '^[0-9]{1,7}$' then (p->>'employees')::int end, nullif(left(btrim(coalesce(p->>'municipality', '')), 80), ''),
            nullif(left(btrim(coalesce(p->>'website', '')), 300), ''), nullif(left(btrim(coalesce(p->>'phone', '')), 40), ''),
            'manual', coalesce(v_stage, 'new'), nullif(p->>'owner_id', '')::uuid,
            nullif(left(btrim(coalesce(p->>'next_step', '')), 300), ''), nullif(p->>'next_step_at', '')::date, coalesce(v_tags, '{}'),
            nullif(p->>'value_nok', '')::int)
    returning id into v_id;
    perform app.crm_log(v_id, null, 'stage', 'Opprettet: ' || coalesce(v_stage, 'new'));
    perform app.admin_log('crm.company_create', null, 'crm_company', v_id::text);
    return jsonb_build_object('ok', true, 'id', v_id);
  end if;

  select * into v_old from app.crm_companies where id = v_id;
  if v_old.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  -- 0194: a form sends the version it was opened at; a newer one means someone else saved meanwhile
  if nullif(p->>'version', '') is not null and (p->>'version' !~ '^[0-9]{1,9}$' or (p->>'version')::int <> v_old.version) then
    return jsonb_build_object('ok', false, 'error', 'stale', 'version', v_old.version);
  end if;
  if v_stage is not null and v_old.org_id is not null then
    return jsonb_build_object('ok', false, 'error', 'stage_follows_plan');
  end if;
  update app.crm_companies c set
    name = case when p ? 'name' then btrim(p->>'name') else c.name end,
    website = case when p ? 'website' then nullif(left(btrim(coalesce(p->>'website', '')), 300), '') else c.website end,
    phone = case when p ? 'phone' then nullif(left(btrim(coalesce(p->>'phone', '')), 40), '') else c.phone end,
    owner_id = case when p ? 'owner_id' then nullif(p->>'owner_id', '')::uuid else c.owner_id end,
    next_step = case when p ? 'next_step' then nullif(left(btrim(coalesce(p->>'next_step', '')), 300), '') else c.next_step end,
    next_step_at = case when p ? 'next_step_at' then nullif(p->>'next_step_at', '')::date else c.next_step_at end,
    lost_reason = case when p ? 'lost_reason' then nullif(left(btrim(coalesce(p->>'lost_reason', '')), 300), '') else c.lost_reason end,
    value_nok = case when p ? 'value_nok' then nullif(p->>'value_nok', '')::int else c.value_nok end,
    tags = coalesce(v_tags, c.tags),
    stage = coalesce(v_stage, c.stage),
    stage_changed_at = case when v_stage is not null and v_stage <> c.stage then now() else c.stage_changed_at end,
    updated_at = now()
  where c.id = v_id;
  if v_stage is not null and v_stage <> v_old.stage then
    perform app.crm_log(v_id, null, 'stage', v_old.stage || ' → ' || v_stage
      || case when (select s.kind from app.crm_stages s where s.key = v_stage) = 'lost' and nullif(p->>'lost_reason', '') is not null
              then ': ' || left(p->>'lost_reason', 300) else '' end);
  end if;
  perform app.admin_log('crm.company_update', v_old.org_id, 'crm_company', v_id::text);
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_save_contact(p_id uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid := p_id;
  v_email text := lower(btrim(coalesce(p->>'email', '')));
  v_tags text[];
  v_consent_at timestamptz;
  v_rule text := app.crm_choice('contact_rule');
  v_source text := nullif(left(btrim(coalesce(p->>'consent_source', '')), 200), '');
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p ? 'tags' then
    if jsonb_typeof(p->'tags') <> 'array' or jsonb_array_length(p->'tags') > 20
       or exists (select 1 from jsonb_array_elements_text(p->'tags') t where t !~ '^[a-z0-9æøå_-]{1,40}$') then
      return jsonb_build_object('ok', false, 'error', 'invalid_tags');
    end if;
    v_tags := array(select distinct jsonb_array_elements_text(p->'tags'));
  end if;
  if coalesce(p->>'role', '') <> '' and p->>'role' not in ('daglig_leder', 'hr', 'leder', 'verneombud', 'annet') then
    return jsonb_build_object('ok', false, 'error', 'invalid_role');
  end if;
  if nullif(p->>'company_id', '') is not null and not exists (select 1 from app.crm_companies co where co.id = (p->>'company_id')::uuid) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if coalesce(p->>'org_number', '') <> '' and regexp_replace(p->>'org_number', '\s', '', 'g') !~ '^[0-9]{9}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_org_number');
  end if;

  if v_id is null then
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
      return jsonb_build_object('ok', false, 'error', 'invalid_email');
    end if;
    -- 0192: the contact rule decides (default none: a consent source is optional)
    if v_rule = 'opt_in_only' then
      return jsonb_build_object('ok', false, 'error', 'blocked_by_setting', 'setting', 'contact_rule');
    end if;
    if char_length(coalesce(v_source, '')) < 3 then
      if v_rule = 'source_and_basis' then
        return jsonb_build_object('ok', false, 'error', 'consent_required', 'setting', 'contact_rule');
      end if;
      v_source := null;
    end if;
    if v_source is not null then
      begin
        v_consent_at := coalesce(nullif(p->>'consent_at', '')::timestamptz, now());
      exception when others then
        return jsonb_build_object('ok', false, 'error', 'invalid_consent_at');
      end;
      if v_consent_at > now() + interval '1 day' then
        return jsonb_build_object('ok', false, 'error', 'invalid_consent_at');
      end if;
    end if;
    if exists (select 1 from app.crm_contacts c where c.product_id = 'orgpuls' and c.email = v_email) then
      return jsonb_build_object('ok', false, 'error', 'exists');
    end if;
    insert into app.crm_contacts (email, name, company, org_number, role, source, basis, status, consent_at, consent_source, tags, lang, company_id)
    values (v_email, nullif(left(btrim(coalesce(p->>'name', '')), 120), ''), nullif(left(btrim(coalesce(p->>'company', '')), 200), ''),
            nullif(regexp_replace(coalesce(p->>'org_number', ''), '\s', '', 'g'), ''), nullif(p->>'role', ''),
            case when p->>'source' = 'event' then 'event' else 'manual' end,
            -- without a consent source the contact has no basis, so no campaign mails it (app.crm_mailable)
            case when v_source is not null then 'consent' else 'none' end, 'active', v_consent_at,
            v_source, coalesce(v_tags, '{}'), case when p->>'lang' = 'en' then 'en' else 'no' end,
            nullif(p->>'company_id', '')::uuid)
    returning id into v_id;
    perform app.admin_log('crm.contact_create', null, 'crm_contact', v_id::text, null, jsonb_build_object('consent_source', v_source));
  else
    -- 0194: a form sends the version it was opened at; a newer one means someone else saved meanwhile
    if nullif(p->>'version', '') is not null and (p->>'version' !~ '^[0-9]{1,9}$'
        or not exists (select 1 from app.crm_contacts c where c.id = v_id and c.version = (p->>'version')::int)) then
      return jsonb_build_object('ok', false, 'error', case when exists (select 1 from app.crm_contacts c where c.id = v_id) then 'stale' else 'not_found' end);
    end if;
    update app.crm_contacts c set
      name = case when p ? 'name' then nullif(left(btrim(coalesce(p->>'name', '')), 120), '') else c.name end,
      company = case when p ? 'company' then nullif(left(btrim(coalesce(p->>'company', '')), 200), '') else c.company end,
      org_number = case when p ? 'org_number' then nullif(regexp_replace(coalesce(p->>'org_number', ''), '\s', '', 'g'), '') else c.org_number end,
      role = case when p ? 'role' then nullif(p->>'role', '') else c.role end,
      tags = coalesce(v_tags, c.tags),
      lang = case when p->>'lang' in ('no', 'en') then p->>'lang' else c.lang end,
      company_id = case when p ? 'company_id' then nullif(p->>'company_id', '')::uuid else c.company_id end,
      updated_at = now()
    where c.id = v_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    perform app.admin_log('crm.contact_update', null, 'crm_contact', v_id::text, null, p - 'email' - 'consent_source' - 'consent_at');
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$;

CREATE OR REPLACE FUNCTION app.crm_contact_json(c app.crm_contacts)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'id', c.id, 'email', c.email, 'name', c.name, 'company', coalesce(co.name, c.company, o.name), 'org_number', coalesce(c.org_number, co.org_number, o.org_number),
    'org_id', c.org_id, 'org_name', o.name, 'company_id', c.company_id, 'role', c.role, 'source', c.source, 'basis', c.basis, 'status', c.status,
    'type', app.crm_type(c.user_id, c.org_id, c.source), 'mailable', app.crm_mailable(c), 'suppressed', app.crm_suppressed(c.email),
    'consent_at', c.consent_at, 'consent_source', c.consent_source, 'tags', to_jsonb(c.tags), 'lang', c.lang,
    'last_engaged_at', c.last_engaged_at, 'created_at', c.created_at, 'version', c.version,
    'lists', (select coalesce(jsonb_agg(l.key order by l.sort), '[]') from app.crm_list_members m join app.crm_lists l on l.id = m.list_id
              where m.contact_id = c.id and m.status = 'subscribed'))
  from (select 1) one
  left join app.organizations o on o.id = c.org_id
  left join app.crm_companies co on co.id = c.company_id
$function$;
