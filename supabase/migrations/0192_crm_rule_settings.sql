-- 0192 — the CRM rule settings registry (CUS-07, SF-34; D-208)
--
-- docs/crm-enrichment/INSTRUCTIONS.md R5 and A9: every limit, gate and compliance rule that can stop a
-- CRM action is a setting, and each default leaves the feature fully working. Tor's decisions DEC-04 and
-- DEC-07 (docs/crm-enrichment/DECISIONS.md, 2026-10-03): the brief's defaults, and the restrictions built
-- into today's code removed, each kept as a setting that switches it back on under Admin › Settings.
--
-- One registry, configuration as data:
--   app.crm_setting_defs    what can be set: key, kind (choice or limit), options, default, what it applies to
--   app.crm_setting_values  the value where it differs from nothing set; who changed it and when
--   app.crm_setting_log     every change, append-only, with the reason when one is given
-- All three: RLS on, no policy, no grant. Readers go through app.crm_rule(key) / app.crm_limit(key) inside
-- SECURITY DEFINER functions; the screen goes through public.admin_crm_rules / admin_crm_rule_set.
-- A setting is registered by the package that builds what it governs, so every row here has a consumer
-- (scripts/audit/wiring.mjs W3 fails a key no function reads through crm_rule/crm_limit).
--
-- What moves behind a setting, with the default each now has:
--   contact_rule               none           a contact may be added without a consent source (it then has
--                                              basis 'none' and is never mailable: campaigns keep their own
--                                              consent model, app.crm_mailable). source_and_basis is today's
--                                              rule; opt_in_only refuses manual and imported contacts
--   import_consent_source      off            an imported row needs no consent source (same basis rule)
--   typed_reason               off            unsubscribe-on-behalf, erase, leaving a list and the customer
--                                              exception no longer require a typed reason; the audit row is
--                                              always written, with the reason when one is given
--   limit_contact_import_rows  unlimited      was 5,000 rows per import
--   limit_register_import_rows unlimited      was 2,000 rows (200 in the form)
--   limit_bulk_move            unlimited      was 500 companies per move
--   limit_company_read         unlimited      was 500 companies per list
--   limit_contact_read         unlimited      was 1,000 contacts per list (300 asked by the page)
--   limit_campaign_blocks      unlimited      was 30 blocks per campaign
--   limit_sequence_mails       unlimited      was 7 mails in a follow-up chain; the chain walkers' loop guard
--                                              rises from 20 to 1,000 steps so an unlimited chain is walked whole
--   limit_test_sends_per_hour  unlimited      was 10 test sends an hour
-- The per-block rules in app.crm_blocks_ok (three stat tiles, four features, five steps, field lengths) are
-- what the mail template can render, not limits on the business, and stay. The block-count cap leaves
-- crm_blocks_ok, which a CHECK constraint on crm_templates uses and so must stay immutable; the limit is
-- applied where a campaign is saved.
-- A refusal by a setting says which: {ok:false, error:<code>, setting:<key>}.

-- ------------------------------------------------------------------------------------------ registry
create table app.crm_setting_defs (
  key           text primary key check (key ~ '^[a-z][a-z0-9_]{2,60}$'),
  product_id    text not null default 'orgpuls',
  area          text not null check (area in ('contacts', 'audit', 'limits')),
  kind          text not null check (kind in ('choice', 'limit')),
  options       text[],
  default_value jsonb not null,
  applies_to    text[] not null default '{}',
  sort          int not null default 0,
  created_at    timestamptz not null default now(),
  check (kind <> 'choice' or (options is not null and cardinality(options) >= 2 and jsonb_typeof(default_value) = 'string'
                              and (default_value #>> '{}') = any (options))),
  check (kind <> 'limit' or (options is null and (default_value = 'null'::jsonb
                              or (jsonb_typeof(default_value) = 'number' and (default_value #>> '{}')::numeric >= 1))))
);
alter table app.crm_setting_defs enable row level security;
revoke all on app.crm_setting_defs from public, anon, authenticated;

create table app.crm_setting_values (
  key        text primary key references app.crm_setting_defs (key) on delete cascade,
  value      jsonb not null,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
);
create index crm_setting_values_changed_by_idx on app.crm_setting_values (changed_by);
alter table app.crm_setting_values enable row level security;
revoke all on app.crm_setting_values from public, anon, authenticated;

-- no foreign key: the history of a setting outlives the setting
create table app.crm_setting_log (
  id         bigint generated always as identity primary key,
  key        text not null,
  old_value  jsonb,
  new_value  jsonb not null,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  reason     text check (char_length(reason) <= 500)
);
create index crm_setting_log_key_idx on app.crm_setting_log (key, changed_at desc);
alter table app.crm_setting_log enable row level security;
revoke all on app.crm_setting_log from public, anon, authenticated;

-- the log is history: nobody changes or removes a line of it (it has no parent whose delete could cascade)
create function app.crm_setting_log_immutable() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'crm_setting_log is append-only';
end $$;
create trigger crm_setting_log_immutable before update or delete on app.crm_setting_log
  for each row execute function app.crm_setting_log_immutable();
create trigger crm_setting_log_no_truncate before truncate on app.crm_setting_log
  for each statement execute function app.crm_setting_log_immutable();

insert into app.crm_setting_defs (key, area, kind, options, default_value, applies_to, sort) values
  ('contact_rule',               'contacts', 'choice', array['none', 'source_and_basis', 'opt_in_only'], '"none"', array['CRM-01', 'CRM-04', 'LGN-04', 'PRO-05', 'PRO-07', 'WEB-04', 'AIA-07', 'MTG-05', 'MOB-01'], 10),
  ('import_consent_source',      'contacts', 'choice', array['off', 'required'], '"off"', array['CRM-09'], 20),
  ('typed_reason',               'audit',    'choice', array['off', 'on'], '"off"', array['CRM writes'], 30),
  ('limit_contact_import_rows',  'limits',   'limit',  null, 'null', array['CRM-09'], 40),
  ('limit_register_import_rows', 'limits',   'limit',  null, 'null', array['CRM-09', 'LGN-04'], 50),
  ('limit_bulk_move',            'limits',   'limit',  null, 'null', array['PIP-10'], 60),
  ('limit_company_read',         'limits',   'limit',  null, 'null', array['PIP-01', 'PIP-10'], 70),
  ('limit_contact_read',         'limits',   'limit',  null, 'null', array['CRM-01'], 80),
  ('limit_campaign_blocks',      'limits',   'limit',  null, 'null', array['CMP-01'], 90),
  ('limit_sequence_mails',       'limits',   'limit',  null, 'null', array['AUT-12'], 100),
  ('limit_test_sends_per_hour',  'limits',   'limit',  null, 'null', array['CMP-01', 'COM-05'], 110);

-- ------------------------------------------------------------------------------------------ readers
-- the value in force: what was set, else the default. An unknown key is a programming error, loudly.
create function app.crm_rule(p_key text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v jsonb;
begin
  select coalesce(v2.value, d.default_value) into v
  from app.crm_setting_defs d left join app.crm_setting_values v2 on v2.key = d.key
  where d.key = p_key;
  if not found then
    raise exception 'unknown CRM setting %', p_key;
  end if;
  return v;
end $$;

-- a limit: null is unlimited
create function app.crm_limit(p_key text) returns int language sql stable security definer set search_path = '' as $$
  select case when jsonb_typeof(app.crm_rule(p_key)) = 'number' then (app.crm_rule(p_key) #>> '{}')::int end
$$;

-- a choice's value as text
create function app.crm_choice(p_key text) returns text language sql stable security definer set search_path = '' as $$
  select app.crm_rule(p_key) #>> '{}'
$$;

-- a typed reason is asked for only while that setting is on
create function app.crm_reason_ok(p_reason text) returns boolean language sql stable security definer set search_path = '' as $$
  select app.crm_choice('typed_reason') = 'off' or char_length(btrim(coalesce(p_reason, ''))) >= 5
$$;

revoke all on function app.crm_rule(text), app.crm_limit(text), app.crm_choice(text), app.crm_reason_ok(text),
  app.crm_setting_log_immutable() from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------ the screen
-- Admin › Settings › CRM rules: every setting, its value, its default and the last change. The CRM's
-- readers may see the rules that govern them; only a super-admin changes one.
-- volatile, not stable: it writes the audit row, and PostgREST runs a stable function read-only
create function public.admin_crm_rules() returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not (app.crm_can_read() or app.is_platform_admin(array['super_admin']::app.platform_role[])) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('crm.rules');
  return jsonb_build_object('ok', true,
    'may_change', app.is_platform_admin(array['super_admin']::app.platform_role[]),
    'reason_required', app.crm_choice('typed_reason') = 'on',
    'rules', (select coalesce(jsonb_agg(jsonb_build_object(
        'key', d.key, 'area', d.area, 'kind', d.kind, 'options', to_jsonb(d.options),
        'default', d.default_value, 'value', coalesce(v.value, d.default_value),
        'is_default', v.key is null or v.value = d.default_value,
        'applies_to', to_jsonb(d.applies_to),
        'changed_at', v.changed_at, 'changed_by', u.email) order by d.sort, d.key), '[]')
      from app.crm_setting_defs d
      left join app.crm_setting_values v on v.key = d.key
      left join auth.users u on u.id = v.changed_by));
end $$;

-- p_value: a choice's option as a JSON string, a limit as a JSON number ≥ 1, or JSON null for unlimited
create function public.admin_crm_rule_set(p_key text, p_value jsonb, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d app.crm_setting_defs;
  v_old jsonb;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
  -- PostgREST passes a JSON null as SQL NULL: for a limit that means unlimited; a choice refuses it below
  v_value jsonb := coalesce(p_value, 'null'::jsonb);
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select * into d from app.crm_setting_defs where key = p_key;
  if d.key is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if (d.kind = 'choice' and (jsonb_typeof(v_value) <> 'string' or not ((v_value #>> '{}') = any (d.options))))
     or (d.kind = 'limit' and not (v_value = 'null'::jsonb
         or (jsonb_typeof(v_value) = 'number' and (v_value #>> '{}') ~ '^[0-9]{1,9}$' and (v_value #>> '{}')::int >= 1))) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if not app.crm_reason_ok(v_reason) then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'setting', 'typed_reason');
  end if;
  v_old := app.crm_rule(p_key);
  if v_old = v_value then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;
  insert into app.crm_setting_values (key, value, changed_by, changed_at) values (p_key, v_value, auth.uid(), now())
  on conflict (key) do update set value = excluded.value, changed_by = excluded.changed_by, changed_at = excluded.changed_at;
  insert into app.crm_setting_log (key, old_value, new_value, changed_by, reason) values (p_key, v_old, v_value, auth.uid(), v_reason);
  perform app.admin_log('crm.rule_set', null, 'crm_setting', p_key, v_reason, jsonb_build_object('from', v_old, 'to', v_value));
  return jsonb_build_object('ok', true, 'changed', true);
end $$;

revoke all on function public.admin_crm_rules(), public.admin_crm_rule_set(text, jsonb, text) from public, anon;
grant execute on function public.admin_crm_rules(), public.admin_crm_rule_set(text, jsonb, text) to authenticated;

-- ------------------------------------------------------------------------------------------ the consumers

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

CREATE OR REPLACE FUNCTION public.admin_crm_import(p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r jsonb;
  i int := 0;
  v_email text;
  v_at timestamptz;
  v_tags text[];
  v_inserted int := 0;
  v_updated int := 0;
  v_suppressed int := 0;
  v_rejected jsonb := '[]';
  v_rule text := app.crm_choice('contact_rule');
  v_need_source boolean := app.crm_choice('import_consent_source') = 'required' or app.crm_choice('contact_rule') = 'source_and_basis';
  v_max int := app.crm_limit('limit_contact_import_rows');
  v_source text;
begin
  perform set_config('app.consent_via', 'import', true);  -- 0141: the ledger records the method
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  -- 0192: limits and the contact rule are settings, unlimited and off by default
  if v_max is not null and jsonb_array_length(p_rows) > v_max then
    return jsonb_build_object('ok', false, 'error', 'too_many', 'setting', 'limit_contact_import_rows', 'limit', v_max);
  end if;
  if v_rule = 'opt_in_only' then
    return jsonb_build_object('ok', false, 'error', 'blocked_by_setting', 'setting', 'contact_rule');
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    v_email := lower(btrim(coalesce(r->>'email', '')));
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
      v_rejected := v_rejected || jsonb_build_object('row', i, 'reason', 'invalid_email'); continue;
    end if;
    v_source := nullif(left(btrim(coalesce(r->>'consent_source', '')), 200), '');
    if char_length(coalesce(v_source, '')) < 3 then
      if v_need_source then
        v_rejected := v_rejected || jsonb_build_object('row', i, 'reason', 'consent_required'); continue;
      end if;
      v_source := null;
    end if;
    v_at := null;
    if v_source is not null then
      begin
        v_at := coalesce(nullif(btrim(coalesce(r->>'consent_at', '')), '')::timestamptz, now());
      exception when others then
        v_rejected := v_rejected || jsonb_build_object('row', i, 'reason', 'invalid_consent_at'); continue;
      end;
      if v_at > now() + interval '1 day' then
        v_rejected := v_rejected || jsonb_build_object('row', i, 'reason', 'invalid_consent_at'); continue;
      end if;
    end if;
    if coalesce(r->>'role', '') <> '' and r->>'role' not in ('daglig_leder', 'hr', 'leder', 'verneombud', 'annet') then
      v_rejected := v_rejected || jsonb_build_object('row', i, 'reason', 'invalid_role'); continue;
    end if;
    v_tags := array(select distinct t from unnest(string_to_array(lower(coalesce(r->>'tags', '')), ';')) t
                    where btrim(t) ~ '^[a-z0-9æøå_-]{1,40}$');
    if app.crm_suppressed(v_email) then v_suppressed := v_suppressed + 1; end if;
    insert into app.crm_contacts (email, name, company, org_number, role, source, basis, status, consent_at, consent_source, tags, lang)
    values (v_email, nullif(left(btrim(coalesce(r->>'name', '')), 120), ''), nullif(left(btrim(coalesce(r->>'company', '')), 200), ''),
            case when regexp_replace(coalesce(r->>'org_number', ''), '\s', '', 'g') ~ '^[0-9]{9}$' then regexp_replace(r->>'org_number', '\s', '', 'g') end,
            nullif(r->>'role', ''), 'import', case when v_source is not null then 'consent' else 'none' end, 'active', v_at, v_source,
            coalesce(v_tags, '{}'), case when r->>'lang' = 'en' then 'en' else 'no' end)
    on conflict (product_id, email) do nothing;
    if found then
      v_inserted := v_inserted + 1;
    else
      update app.crm_contacts c set
        name = coalesce(c.name, nullif(left(btrim(coalesce(r->>'name', '')), 120), '')),
        company = coalesce(c.company, nullif(left(btrim(coalesce(r->>'company', '')), 200), '')),
        role = coalesce(c.role, nullif(r->>'role', '')),
        tags = array(select distinct t from unnest(c.tags || coalesce(v_tags, '{}')) t),
        updated_at = now()
      where c.product_id = 'orgpuls' and c.email = v_email;
      v_updated := v_updated + 1;
    end if;
  end loop;
  perform app.admin_log('crm.import', null, null, null, null,
    jsonb_build_object('rows', i, 'inserted', v_inserted, 'updated', v_updated, 'rejected', jsonb_array_length(v_rejected)));
  return jsonb_build_object('ok', true, 'inserted', v_inserted, 'updated', v_updated, 'suppressed', v_suppressed, 'rejected', v_rejected);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_contact_action(p_id uuid, p_action text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_c app.crm_contacts;
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  -- 0192: a typed reason is a setting, off by default; the audit row is written either way
  if not app.crm_reason_ok(p_reason) then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'setting', 'typed_reason');
  end if;
  select * into v_c from app.crm_contacts where id = p_id;
  if v_c.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_action = 'unsubscribe' then
    update app.crm_contacts set status = 'unsubscribed', updated_at = now() where id = p_id;
    insert into app.crm_suppression (email_hash, reason) values (app.crm_hash(v_c.email), 'manual') on conflict (email_hash) do nothing;
  elsif p_action = 'erase' then
    insert into app.crm_suppression (email_hash, reason) values (app.crm_hash(v_c.email), 'erased')
    on conflict (email_hash) do update set reason = 'erased', at = now();
    delete from app.crm_sends where contact_id = p_id and status in ('pending', 'sending');
    delete from app.crm_contacts where id = p_id;
  else
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  perform app.admin_log('crm.contact_' || p_action, v_c.org_id, 'crm_contact', p_id::text, nullif(btrim(coalesce(p_reason, '')), ''));
  return jsonb_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_list_remove(p_list uuid, p_contact uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  -- 0192: a typed reason is a setting, off by default; the audit row is written either way
  if not app.crm_reason_ok(p_reason) then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'setting', 'typed_reason');
  end if;
  update app.crm_list_members set status = 'unsubscribed', unsubscribed_at = now()
  where list_id = p_list and contact_id = p_contact and status <> 'unsubscribed';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform app.admin_log('crm.list_remove', null, 'crm_contact', p_contact::text, nullif(btrim(coalesce(p_reason, '')), ''), jsonb_build_object('list', p_list));
  return jsonb_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_settings(p_customer_exception boolean, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  -- 0192: a typed reason is a setting, off by default; the audit row is written either way
  if not app.crm_reason_ok(p_reason) then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'setting', 'typed_reason');
  end if;
  update app.crm_settings set customer_exception = coalesce(p_customer_exception, false), changed_by = auth.uid(), changed_at = now() where id;
  perform app.admin_log('crm.settings', null, null, null, nullif(btrim(coalesce(p_reason, '')), ''), jsonb_build_object('customer_exception', coalesce(p_customer_exception, false)));
  return jsonb_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_stage_move(p_ids uuid[], p_to text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_co app.crm_companies;
  v_to text;
  v_moved int := 0;
  v_skipped int := 0;
  v_max int := app.crm_limit('limit_bulk_move');
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_ids is null or cardinality(p_ids) < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if v_max is not null and cardinality(p_ids) > v_max then
    return jsonb_build_object('ok', false, 'error', 'too_many', 'setting', 'limit_bulk_move', 'limit', v_max);
  end if;
  if p_to is not null and not exists (select 1 from app.crm_stages s where s.key = p_to and not s.managed and s.archived_at is null) then
    return jsonb_build_object('ok', false, 'error', 'invalid_stage');
  end if;
  foreach v_id in array p_ids loop
    select * into v_co from app.crm_companies where id = v_id for update;
    if v_co.id is null or v_co.org_id is not null then
      v_skipped := v_skipped + 1; continue;
    end if;
    v_to := coalesce(p_to, (
      select n.key from app.crm_stages cur, app.crm_stages n
      where cur.key = v_co.stage and cur.kind = 'open' and n.kind = 'open' and not n.managed and n.archived_at is null and n.sort > cur.sort
      order by n.sort limit 1));
    if v_to is null or v_to = v_co.stage then
      v_skipped := v_skipped + 1; continue;
    end if;
    update app.crm_companies set stage = v_to, stage_changed_at = now(), updated_at = now() where id = v_id;
    perform app.crm_log(v_id, null, 'stage', v_co.stage || ' → ' || v_to);
    v_moved := v_moved + 1;
  end loop;
  perform app.admin_log('crm.stage_move', null, 'crm_company', null, null,
    jsonb_build_object('to', coalesce(p_to, 'next'), 'moved', v_moved, 'skipped', v_skipped));
  return jsonb_build_object('ok', true, 'moved', v_moved, 'skipped', v_skipped);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_company_import(p_rows jsonb, p_source text DEFAULT 'brreg'::text, p_tag text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r jsonb;
  v_orgnr text;
  v_id uuid;
  v_email text;
  v_basis text;
  v_manager text;
  v_role text;
  v_old text;
  v_tag text := nullif(lower(btrim(coalesce(p_tag, ''))), '');
  v_tags text[];
  v_added int := 0;
  v_known int := 0;
  v_business int := 0;
  v_managers int := 0;
  v_skipped int := 0;
  v_max int := app.crm_limit('limit_register_import_rows');
begin
  perform set_config('app.consent_via', 'import', true);  -- 0141: the ledger records the method
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 1
     or (v_tag is not null and v_tag !~ '^[a-z0-9æøå_-]{1,40}$') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if v_max is not null and jsonb_array_length(p_rows) > v_max then
    return jsonb_build_object('ok', false, 'error', 'too_many', 'setting', 'limit_register_import_rows', 'limit', v_max);
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_orgnr := regexp_replace(coalesce(r->>'org_number', ''), '\s', '', 'g');
    if v_orgnr !~ '^[0-9]{9}$' or char_length(btrim(coalesce(r->>'name', ''))) = 0 then
      v_skipped := v_skipped + 1; continue;
    end if;
    v_role := case when r->>'manager_role' in ('DAGL', 'INNH') then r->>'manager_role' end;
    v_manager := case when v_role is not null and char_length(btrim(coalesce(r->>'manager_name', ''))) between 2 and 120
                      then btrim(r->>'manager_name') end;
    if v_manager is null then v_role := null; end if;
    v_tags := coalesce(array(select distinct t from unnest(string_to_array(lower(coalesce(r->>'tags', '')), ';') || v_tag) t
                             where t ~ '^[a-z0-9æøå_-]{1,40}$'), '{}');

    select id into v_id from app.crm_companies where product_id = 'orgpuls' and org_number = v_orgnr;
    if v_id is not null then
      v_known := v_known + 1;
      select manager_name into v_old from app.crm_companies where id = v_id;
      -- the register's address greets whoever the register names now, unless a person renamed it
      if v_manager is not null and v_manager is distinct from v_old then
        update app.crm_contacts c set name = v_manager, role = 'daglig_leder'
         where c.company_id = v_id and c.source = 'brreg' and (c.name is null or c.name = v_old);
      end if;
      update app.crm_companies c
         set manager_name = coalesce(v_manager, c.manager_name),
             manager_role = case when v_manager is not null then v_role else c.manager_role end,
             manager_seen_at = case when v_manager is not null then now() else c.manager_seen_at end,
             tags = array(select distinct t from unnest(c.tags || v_tags) t)
       where c.id = v_id;
    else
      insert into app.crm_companies (org_number, name, form_code, nace_code, nace_label, employees, municipality, municipality_no, website, phone,
                                     source, tags, manager_name, manager_role, manager_seen_at)
      values (v_orgnr, left(btrim(r->>'name'), 200), left(r->>'form_code', 10),
              case when r->>'nace_code' ~ '^[0-9]{2}(\.[0-9]{1,3})?$' then r->>'nace_code' end, left(r->>'nace_label', 200),
              case when r->>'employees' ~ '^[0-9]{1,7}$' then (r->>'employees')::int end, left(r->>'municipality', 80),
              case when r->>'municipality_no' ~ '^[0-9]{4}$' then r->>'municipality_no' end,
              nullif(left(btrim(coalesce(r->>'website', '')), 300), ''), nullif(left(btrim(coalesce(r->>'phone', '')), 40), ''),
              case when p_source = 'import' then 'import' else 'brreg' end, v_tags,
              v_manager, v_role, case when v_manager is not null then now() end)
      returning id into v_id;
      v_added := v_added + 1;
      perform app.crm_log(v_id, null, 'stage', 'Lagt til fra ' || case when p_source = 'import' then 'import' else 'Brønnøysundregistrene' end);
    end if;
    if v_manager is not null then v_managers := v_managers + 1; end if;

    v_email := lower(btrim(coalesce(r->>'email', '')));
    if v_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(v_email) <= 254 then
      v_basis := case when app.crm_role_address(v_email) and coalesce(r->>'form_code', '') <> 'ENK' then 'business' else 'none' end;
      insert into app.crm_contacts (email, name, company, org_number, company_id, role, source, basis, status, consent_source, tags)
      values (v_email, v_manager, left(btrim(r->>'name'), 200), v_orgnr, v_id,
              case when v_manager is not null then 'daglig_leder' end, 'brreg', v_basis, 'active',
              case when v_basis = 'business' then 'role address in Enhetsregisteret' end, v_tags)
      on conflict (product_id, email) do update
        set company_id = coalesce(app.crm_contacts.company_id, excluded.company_id),
            -- the register's manager greets the company address, unless a person has named it otherwise
            name = case when app.crm_contacts.source = 'brreg' then coalesce(excluded.name, app.crm_contacts.name) else app.crm_contacts.name end,
            role = case when app.crm_contacts.source = 'brreg' then coalesce(excluded.role, app.crm_contacts.role) else app.crm_contacts.role end,
            tags = array(select distinct t from unnest(app.crm_contacts.tags || excluded.tags) t);
      if v_basis = 'business' then v_business := v_business + 1; end if;
    end if;
  end loop;
  perform app.admin_log('crm.company_import', null, null, null, v_tag,
    jsonb_build_object('added', v_added, 'known', v_known, 'business', v_business, 'managers', v_managers, 'skipped', v_skipped));
  return jsonb_build_object('ok', true, 'added', v_added, 'known', v_known, 'business', v_business, 'managers', v_managers, 'skipped', v_skipped);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_companies(p_q text DEFAULT NULL::text, p_stage text DEFAULT NULL::text, p_owner uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_q text := nullif(lower(btrim(coalesce(p_q, ''))), '');
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.crm_sync();
  perform app.admin_log('crm.companies');
  return jsonb_build_object('ok', true,
    'stages', (select coalesce(jsonb_object_agg(x.stage, x.n), '{}') from (select stage, count(*) n from app.crm_companies group by stage) x),
    'tasks_due', (select count(*) from app.crm_activities a where a.kind = 'task' and a.done_at is null and a.due_at <= current_date),
    'rows', (select coalesce(jsonb_agg(app.crm_company_json(co) order by co.next_step_at nulls last, co.updated_at desc), '[]') from (
        select co.* from app.crm_companies co
        where (v_q is null or lower(co.name) like '%' || v_q || '%' or co.org_number = v_q or v_q = any (co.tags))
          and (p_stage is null or co.stage = p_stage)
          and (p_owner is null or co.owner_id = p_owner)
        order by co.next_step_at nulls last, co.updated_at desc limit app.crm_limit('limit_company_read')) co),
    -- 0192: the list's cap is a setting (null: every company); the page says when it is reached
    'limit', app.crm_limit('limit_company_read'));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_contacts(p_q text DEFAULT NULL::text, p_type text DEFAULT NULL::text, p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_q text := nullif(lower(btrim(coalesce(p_q, ''))), '');
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.crm_sync();
  perform app.admin_log('crm.contacts', null, null, null, null, jsonb_build_object('q', v_q is not null, 'type', p_type));
  return jsonb_build_object('ok', true,
    'counts', (select jsonb_build_object(
        'total', count(*),
        'prospect', count(*) filter (where t = 'prospect'), 'trial', count(*) filter (where t = 'trial'),
        'customer', count(*) filter (where t = 'customer'), 'former', count(*) filter (where t = 'former'),
        'mailable', count(*) filter (where m), 'pending', count(*) filter (where st = 'pending'),
        'unsubscribed', count(*) filter (where st = 'unsubscribed'))
      from (select app.crm_type(c.user_id, c.org_id, c.source) t, app.crm_mailable(c) m, c.status st from app.crm_contacts c) x),
    'suppressed', (select count(*) from app.crm_suppression),
    'customer_exception', (select s.customer_exception from app.crm_settings s),
    'waiting', (select count(*) from app.crm_sends s where s.status in ('pending', 'sending')),
    'rows', (select coalesce(jsonb_agg(app.crm_contact_json(c) order by c.created_at desc), '[]') from (
        select c.* from app.crm_contacts c left join app.organizations o on o.id = c.org_id
        where (v_q is null or c.email like '%' || v_q || '%' or lower(coalesce(c.name, '')) like '%' || v_q || '%'
               or lower(coalesce(c.company, o.name, '')) like '%' || v_q || '%' or v_q = any (c.tags))
          and (p_type is null or app.crm_type(c.user_id, c.org_id, c.source) = p_type)
        -- 0192: no cap unless the setting sets one; a caller's own p_limit narrows it further
        order by c.created_at desc
        -- (greatest() skips a null, so a missing p_limit is spelled out rather than greatest(null, 1) = 1)
        limit nullif(least(case when p_limit is null then 2147483647 else greatest(p_limit, 1) end,
                           coalesce(app.crm_limit('limit_contact_read'), 2147483647)), 2147483647)) c),
    'limit', app.crm_limit('limit_contact_read'));
end $function$;

-- 0192: no block-count cap here (a CHECK on crm_templates uses this function); see admin_crm_campaign_save
CREATE OR REPLACE FUNCTION app.crm_blocks_ok(b jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select jsonb_typeof(b) = 'array' and jsonb_array_length(b) >= 1
    and not exists (
      select 1 from jsonb_array_elements(b) x
      where jsonb_typeof(x) <> 'object'
         or (select count(*) from jsonb_object_keys(x) k where k not in ('type', 'text', 'url', 'title', 'label', 'alt', 'href', 'image')) > 0
         or coalesce(x->>'type', '') not in ('heading', 'text', 'button', 'article', 'bullets', 'image', 'divider', 'quote', 'event', 'ps',
                                             'hero', 'features', 'steps', 'stats', 'cta')
         or char_length(coalesce(x->>'text', '')) > 3000
         or char_length(coalesce(x->>'title', '')) > 150
         or char_length(coalesce(x->>'label', '')) > 60
         or char_length(coalesce(x->>'alt', '')) > 150
         or (x ? 'url' and (char_length(x->>'url') > 500 or (x->>'url') !~ '^https://[^\s<>"]{3,}$'))
         or (x ? 'href' and (char_length(x->>'href') > 500 or (x->>'href') !~ '^https://[^\s<>"]{3,}$'))
         or (x ? 'image' and (char_length(x->>'image') > 500 or (x->>'image') !~ '^https://[^\s<>"]{3,}$'))
         -- a picture always says what it shows
         or (x ? 'image' and char_length(btrim(coalesce(x->>'alt', ''))) = 0)
         or (x ? 'image' and (x->>'type') not in ('hero', 'article'))
         -- what each kind needs
         or ((x->>'type') in ('heading', 'text', 'bullets', 'quote', 'ps', 'features', 'steps', 'stats') and char_length(btrim(coalesce(x->>'text', ''))) = 0)
         or ((x->>'type') = 'heading' and char_length(x->>'text') > 150)
         or ((x->>'type') = 'button' and (char_length(btrim(coalesce(x->>'text', ''))) not between 1 and 60 or not x ? 'url'))
         or ((x->>'type') = 'article' and (char_length(btrim(coalesce(x->>'title', ''))) = 0 or not x ? 'url'))
         or ((x->>'type') in ('event', 'hero', 'cta') and char_length(btrim(coalesce(x->>'title', ''))) = 0)
         or ((x->>'type') = 'cta' and not x ? 'url')
         or ((x->>'type') = 'image' and (not x ? 'url' or char_length(btrim(coalesce(x->>'alt', ''))) = 0))
         -- stats: at most three tiles; features at most four; steps at most five
         or ((x->>'type') = 'stats' and (select count(*) from regexp_split_to_table(btrim(x->>'text'), '\n') l where btrim(l) <> '') > 3)
         or ((x->>'type') = 'features' and (select count(*) from regexp_split_to_table(btrim(x->>'text'), '\n') l where btrim(l) <> '') > 4)
         or ((x->>'type') = 'steps' and (select count(*) from regexp_split_to_table(btrim(x->>'text'), '\n') l where btrim(l) <> '') > 5))
$function$;

CREATE OR REPLACE FUNCTION public.admin_crm_campaign_save(p_id uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid := p_id;
  v_status text;
  v_utm text := lower(btrim(coalesce(p->>'utm_campaign', '')));
  v_slug text := nullif(lower(btrim(coalesce(p->>'slug', ''))), '');
  v_t app.crm_templates;
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p->>'name', ''))) not between 1 and 120 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  if nullif(p->>'template_key', '') is not null then
    select * into v_t from app.crm_templates t where t.key = p->>'template_key';
    if v_t.key is null then
      return jsonb_build_object('ok', false, 'error', 'invalid_template');
    end if;
  end if;
  if coalesce(p->>'kind', v_t.kind, 'newsletter') not in ('newsletter', 'campaign', 'promotion', 'announcement') then
    return jsonb_build_object('ok', false, 'error', 'invalid_kind');
  end if;
  if v_utm = '' then
    v_utm := left(trim(both '-' from regexp_replace(translate(replace(lower(p->>'name'), 'æ', 'ae'), 'øå', 'oa'), '[^a-z0-9]+', '-', 'g')), 60);
  end if;
  if v_utm !~ '^[a-z0-9_-]{1,60}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_utm');
  end if;
  if char_length(coalesce(p->>'subject', '')) > 150 or char_length(coalesce(p->>'subject_b', '')) > 150
     or char_length(coalesce(p->>'preheader', '')) > 200 or char_length(coalesce(p->>'web_description', '')) > 200
     or char_length(coalesce(p->>'signature', '')) > 200 then
    return jsonb_build_object('ok', false, 'error', 'too_long');
  end if;
  if p ? 'blocks' and jsonb_array_length(coalesce(p->'blocks', '[]')) > 0 and not app.crm_blocks_ok(p->'blocks') then
    return jsonb_build_object('ok', false, 'error', 'invalid_blocks');
  end if;
  -- 0192: the number of blocks is a setting, unlimited by default
  if p ? 'blocks' and app.crm_limit('limit_campaign_blocks') is not null
     and jsonb_typeof(p->'blocks') = 'array' and jsonb_array_length(p->'blocks') > app.crm_limit('limit_campaign_blocks') then
    return jsonb_build_object('ok', false, 'error', 'too_many', 'setting', 'limit_campaign_blocks', 'limit', app.crm_limit('limit_campaign_blocks'));
  end if;
  if nullif(p->>'segment_id', '') is not null and not exists (select 1 from app.crm_segments g where g.id = (p->>'segment_id')::uuid) then
    return jsonb_build_object('ok', false, 'error', 'invalid_segment');
  end if;
  if nullif(p->>'list_id', '') is not null and not exists (select 1 from app.crm_lists l where l.id = (p->>'list_id')::uuid and l.archived_at is null) then
    return jsonb_build_object('ok', false, 'error', 'invalid_list');
  end if;
  if coalesce(p->>'style', 'branded') not in ('branded', 'letter') or coalesce(p->>'ab_metric', 'click') not in ('open', 'click')
     or coalesce(p->>'ab_percent', '20') !~ '^[0-9]{2}$' or (coalesce(p->>'ab_percent', '20'))::int not between 10 and 50
     or coalesce(p->>'ab_wait_hours', '4') !~ '^[0-9]{1,2}$' or (coalesce(p->>'ab_wait_hours', '4'))::int not between 1 and 48 then
    return jsonb_build_object('ok', false, 'error', 'invalid_ab');
  end if;
  if v_slug is not null and (v_slug !~ '^[a-z0-9-]{3,80}$'
      or exists (select 1 from app.crm_campaigns c where c.product_id = 'orgpuls' and c.slug = v_slug and c.id is distinct from p_id)) then
    return jsonb_build_object('ok', false, 'error', 'invalid_slug');
  end if;

  if v_id is null then
    insert into app.crm_campaigns (name, kind, lang, subject, preheader, blocks, segment_id, list_id, utm_campaign, template_key, style, signature,
                                   subject_b, ab_percent, ab_metric, ab_wait_hours, publish_web, slug, web_description, created_by)
    values (btrim(p->>'name'), coalesce(p->>'kind', v_t.kind, 'newsletter'), case when p->>'lang' = 'en' then 'en' else 'no' end,
            coalesce(p->>'subject', v_t.subject, ''), coalesce(p->>'preheader', v_t.preheader, ''), coalesce(p->'blocks', v_t.blocks, '[]'),
            nullif(p->>'segment_id', '')::uuid, nullif(p->>'list_id', '')::uuid, v_utm, v_t.key, coalesce(p->>'style', v_t.style, 'branded'),
            coalesce(p->>'signature', ''), coalesce(p->>'subject_b', ''), coalesce((p->>'ab_percent')::int, 20),
            coalesce(p->>'ab_metric', 'click'), coalesce((p->>'ab_wait_hours')::int, 4), coalesce((p->>'publish_web')::boolean, false),
            v_slug, coalesce(p->>'web_description', ''), auth.uid())
    returning id into v_id;
  else
    select status into v_status from app.crm_campaigns where id = v_id;
    if v_status is null then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    if v_status <> 'draft' then
      return jsonb_build_object('ok', false, 'error', 'not_draft');
    end if;
    update app.crm_campaigns set name = btrim(p->>'name'), kind = coalesce(p->>'kind', kind),
      lang = case when p->>'lang' in ('no', 'en') then p->>'lang' else lang end,
      subject = coalesce(p->>'subject', subject), preheader = coalesce(p->>'preheader', preheader),
      blocks = coalesce(p->'blocks', blocks), segment_id = case when p ? 'segment_id' then nullif(p->>'segment_id', '')::uuid else segment_id end,
      list_id = case when p ? 'list_id' then nullif(p->>'list_id', '')::uuid else list_id end,
      utm_campaign = v_utm, style = coalesce(p->>'style', style), signature = coalesce(p->>'signature', signature),
      subject_b = coalesce(p->>'subject_b', subject_b), ab_percent = coalesce((p->>'ab_percent')::int, ab_percent),
      ab_metric = coalesce(p->>'ab_metric', ab_metric), ab_wait_hours = coalesce((p->>'ab_wait_hours')::int, ab_wait_hours),
      publish_web = coalesce((p->>'publish_web')::boolean, publish_web),
      slug = case when p ? 'slug' then v_slug else slug end, web_description = coalesce(p->>'web_description', web_description),
      updated_at = now()
    where id = v_id;
  end if;
  perform app.admin_log('crm.campaign_save', null, 'crm_campaign', v_id::text);
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$;

-- ------------------------------------------------------------------------------------------ sequences and tests

CREATE OR REPLACE FUNCTION public.admin_crm_step_save(p_id uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_c app.crm_campaigns;
  v_parent app.crm_campaigns;
  v_kind text := p->>'step_kind';
  v_title text := btrim(coalesce(p->>'title', ''));
  v_name text := btrim(coalesce(p->>'name', ''));
  v_days int;
  v_id uuid;
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if v_kind not in ('call', 'linkedin') then
    return jsonb_build_object('ok', false, 'error', 'invalid_step');
  end if;
  if char_length(v_title) not between 1 and 150 then
    return jsonb_build_object('ok', false, 'error', 'no_subject');
  end if;
  if char_length(v_name) not between 1 and 120 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  if coalesce(p->>'follow_days', '') !~ '^[0-9]{1,2}$' or (p->>'follow_days')::int not between 1 and 60 then
    return jsonb_build_object('ok', false, 'error', 'invalid_follow');
  end if;
  v_days := (p->>'follow_days')::int;

  if p_id is null then
    select * into v_parent from app.crm_campaigns where id = nullif(p->>'follows_id', '')::uuid;
    if v_parent.id is null or v_parent.status = 'cancelled' then
      return jsonb_build_object('ok', false, 'error', 'invalid_follow');
    end if;
    if app.crm_chain_depth(v_parent.id) >= coalesce(app.crm_limit('limit_sequence_mails'), 2147483647) then
      return jsonb_build_object('ok', false, 'error', 'too_many_steps', 'setting', 'limit_sequence_mails');
    end if;
    insert into app.crm_campaigns (name, kind, lang, subject, blocks, list_id, utm_campaign, follows_id, follow_days, follow_when,
                                   follow_auto, step_kind, created_by)
    values (v_name, v_parent.kind, v_parent.lang, v_title, '[]', v_parent.list_id,
            left(v_parent.utm_campaign, 50) || '-' || v_kind, v_parent.id, v_days, 'no_reply', true, v_kind, auth.uid())
    returning id into v_id;
    perform app.admin_log('crm.step_create', null, 'crm_campaign', v_id::text, null, jsonb_build_object('follows', v_parent.id, 'kind', v_kind));
    return jsonb_build_object('ok', true, 'id', v_id);
  end if;

  select * into v_c from app.crm_campaigns where id = p_id for update;
  if v_c.id is null or v_c.step_kind = 'mail' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_c.status <> 'draft' then
    return jsonb_build_object('ok', false, 'error', 'not_draft');
  end if;
  update app.crm_campaigns set name = v_name, subject = v_title, step_kind = v_kind, follow_days = v_days, updated_at = now()
  where id = p_id;
  perform app.admin_log('crm.step_save', null, 'crm_campaign', p_id::text);
  return jsonb_build_object('ok', true, 'id', p_id);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_campaign_resend(p_id uuid, p_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_p app.crm_campaigns;
  v_id uuid;
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select * into v_p from app.crm_campaigns where id = p_id;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_p.step_kind <> 'mail' then
    return jsonb_build_object('ok', false, 'error', 'invalid_step');
  end if;
  if coalesce(p_days, 0) not between 1 and 60 then
    return jsonb_build_object('ok', false, 'error', 'invalid_follow');
  end if;
  if app.crm_chain_depth(v_p.id) >= coalesce(app.crm_limit('limit_sequence_mails'), 2147483647) then
    return jsonb_build_object('ok', false, 'error', 'too_many_steps', 'setting', 'limit_sequence_mails');
  end if;
  insert into app.crm_campaigns (name, kind, lang, subject, preheader, blocks, segment_id, list_id, utm_campaign, template_key, style,
                                 signature, sender_id, stage_target, follows_id, follow_days, follow_when, follow_auto, created_by)
  values (left(v_p.name || ' · resend', 120), v_p.kind, v_p.lang, v_p.subject, v_p.preheader, v_p.blocks, null, v_p.list_id,
          left(v_p.utm_campaign || '-resend', 60), v_p.template_key, v_p.style, v_p.signature, v_p.sender_id, null,
          v_p.id, p_days, 'no_click', true, auth.uid())
  returning id into v_id;
  perform app.admin_log('crm.campaign_resend', null, 'crm_campaign', v_id::text, null, jsonb_build_object('follows', p_id, 'days', p_days));
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_campaign_pipeline(p_id uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_c app.crm_campaigns;
  v_parent app.crm_campaigns;
  v_target text := nullif(p->>'stage_target', '');
  v_on_send text := nullif(p->>'stage_on_send', '');
  v_when text := coalesce(nullif(p->>'follow_when', ''), 'no_reply');
  v_auto boolean;
  v_sender uuid;
  v_follows uuid;
  v_days int;
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select * into v_c from app.crm_campaigns where id = p_id;
  if v_c.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_c.status <> 'draft' then
    return jsonb_build_object('ok', false, 'error', 'not_draft');
  end if;
  if v_target is not null and not exists (select 1 from app.crm_stages s where s.key = v_target and s.archived_at is null) then
    return jsonb_build_object('ok', false, 'error', 'invalid_stage');
  end if;
  if v_on_send is not null and not exists (select 1 from app.crm_stages s where s.key = v_on_send and not s.managed and s.archived_at is null) then
    return jsonb_build_object('ok', false, 'error', 'invalid_stage');
  end if;
  if v_when not in ('no_reply', 'no_click', 'no_open') then
    return jsonb_build_object('ok', false, 'error', 'invalid_follow');
  end if;
  begin
    v_sender := nullif(p->>'sender_id', '')::uuid;
    v_follows := nullif(p->>'follows_id', '')::uuid;
    v_days := nullif(p->>'follow_days', '')::int;
    v_auto := coalesce((p->>'follow_auto')::boolean, false);
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end;
  if v_sender is not null and not exists (select 1 from app.crm_senders s where s.id = v_sender and s.archived_at is null) then
    return jsonb_build_object('ok', false, 'error', 'invalid_sender');
  end if;
  if v_follows is not null then
    select * into v_parent from app.crm_campaigns where id = v_follows;
    if v_parent.id is null or v_parent.id = p_id or v_days is null or v_days not between 1 and 60 then
      return jsonb_build_object('ok', false, 'error', 'invalid_follow');
    end if;
    -- no loops, and at most seven mails in a chain
    if exists (with recursive up as (select v_parent.id as id, v_parent.follows_id as f, 1 as n
                                     union all select c.id, c.follows_id, up.n + 1 from app.crm_campaigns c join up on c.id = up.f where up.n < 1000)
               select 1 from up where up.id = p_id) then
      return jsonb_build_object('ok', false, 'error', 'invalid_follow');
    end if;
    if app.crm_chain_depth(v_parent.id) >= coalesce(app.crm_limit('limit_sequence_mails'), 2147483647) then
      return jsonb_build_object('ok', false, 'error', 'too_many_steps', 'setting', 'limit_sequence_mails');
    end if;
  end if;
  if v_follows is null then v_auto := false; end if;
  update app.crm_campaigns set stage_target = v_target, stage_on_send = v_on_send, sender_id = v_sender,
    follows_id = v_follows, follow_days = case when v_follows is not null then v_days end,
    follow_when = case when v_follows is not null then v_when else 'no_reply' end,
    follow_auto = v_auto,
    list_id = case when v_follows is not null then v_parent.list_id else list_id end,
    lang = case when v_follows is not null then v_parent.lang else lang end,
    updated_at = now()
  where id = p_id;
  perform app.admin_log('crm.campaign_pipeline', null, 'crm_campaign', p_id::text);
  return jsonb_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_campaign_test(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_c app.crm_campaigns;
  v_why text;
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select * into v_c from app.crm_campaigns where id = p_id;
  if v_c.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_why := case when char_length(btrim(v_c.subject)) = 0 then 'no_subject' when not app.crm_blocks_ok(v_c.blocks) then 'invalid_blocks' end;
  if v_why is not null then
    return jsonb_build_object('ok', false, 'error', v_why);
  end if;
  -- 0192: test sends per hour are a setting, unlimited by default
  if app.crm_limit('limit_test_sends_per_hour') is not null
     and (select count(*) from app.crm_sends s where s.kind = 'test' and s.created_at > now() - interval '1 hour') >= app.crm_limit('limit_test_sends_per_hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited', 'setting', 'limit_test_sends_per_hour', 'limit', app.crm_limit('limit_test_sends_per_hour'));
  end if;
  insert into app.crm_sends (kind, campaign_id, to_email)
  select 'test', p_id, lower(u.email) from auth.users u where u.id = auth.uid();
  perform app.admin_log('crm.campaign_test', null, 'crm_campaign', p_id::text);
  return jsonb_build_object('ok', true, 'to', (select lower(u.email) from auth.users u where u.id = auth.uid()));
end $function$;

CREATE OR REPLACE FUNCTION app.crm_chain_depth(p_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with recursive up as (
    select c.id, c.follows_id, 1 as n from app.crm_campaigns c where c.id = p_id
    union all
    select c.id, c.follows_id, up.n + 1 from app.crm_campaigns c join up on c.id = up.follows_id where up.n < 1000
  )
  select coalesce(max(n), 0) from up
$function$;

CREATE OR REPLACE FUNCTION app.crm_chain_root(p_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with recursive up as (
    select c.id, c.follows_id, 1 as n from app.crm_campaigns c where c.id = p_id
    union all
    select c.id, c.follows_id, up.n + 1 from app.crm_campaigns c join up on c.id = up.follows_id where up.n < 1000
  )
  select id from up order by n desc limit 1
$function$;

CREATE OR REPLACE FUNCTION public.admin_crm_journeys()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true, 'rows', (
    with recursive roots as (
      select r.* from app.crm_campaigns r
      where r.follows_id is null
        and (r.stage_target is not null or exists (select 1 from app.crm_campaigns f where f.follows_id = r.id))
    ), chain as (
      select r.id as root, r.id, 1 as step from roots r
      union all
      select chain.root, c.id, chain.step + 1 from app.crm_campaigns c join chain on c.follows_id = chain.id where chain.step < 1000
    ), steps as (
      select ch.root, ch.step, c.* from chain ch join app.crm_campaigns c on c.id = ch.id
    ), per as (
      select r.id, r.number, r.name, r.status as first_status, r.stage_target, r.stage_on_send, r.created_at,
        (select count(*) from steps s where s.root = r.id and s.step_kind = 'mail') as mails,
        (select count(*) from steps s where s.root = r.id and s.step_kind <> 'mail') as tasks,
        (select bool_or(s.status in ('scheduled', 'sending')) from steps s where s.root = r.id) as running,
        (select bool_and(s.status in ('sent', 'cancelled')) from steps s where s.root = r.id) as finished,
        (select s.id from steps s where s.root = r.id order by s.step desc limit 1) as last_id,
        (select s.step_kind from steps s where s.root = r.id order by s.step desc limit 1) as last_kind,
        (select min(x.sent_at) from app.crm_sends x where x.campaign_id = r.id and x.kind = 'campaign' and x.status = 'sent') as first_sent
      from roots r
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'number', p.number, 'name', p.name,
      'status', case when p.first_status = 'cancelled' then 'cancelled'
                     when p.running then 'active'
                     when p.first_status = 'draft' then 'draft'
                     when p.finished then 'done' else 'active' end,
      'stage_target', p.stage_target, 'stage_on_send', p.stage_on_send, 'mails', p.mails, 'tasks', p.tasks,
      'reached', (select count(distinct x.contact_id) from app.crm_sends x where x.campaign_id = p.id and x.kind = 'campaign' and x.status = 'sent'),
      -- who an automatic step still waits to reach, and (0137) whose call or LinkedIn task is still open
      'in_journey', (select coalesce(sum((select count(*) from app.crm_follow_audience(s2) a
                                           where not exists (select 1 from app.crm_sends x where x.campaign_id = s2.id and x.contact_id = a.contact_id)
                                             and not exists (select 1 from app.crm_activities t where t.campaign_id = s2.id and t.contact_id = a.contact_id))), 0)
                     from app.crm_campaigns s2 join steps s on s.id = s2.id
                     where s.root = p.id and s2.follow_auto and s2.status in ('scheduled', 'sending'))
                  + (select count(*) from app.crm_activities t join steps s on s.id = t.campaign_id
                     where s.root = p.id and t.kind = 'task' and t.done_at is null),
      'completed', case when p.last_kind = 'mail'
                     then (select count(distinct x.contact_id) from app.crm_sends x where x.campaign_id = p.last_id and x.kind = 'campaign' and x.status = 'sent')
                     else (select count(distinct t.contact_id) from app.crm_activities t where t.campaign_id = p.last_id and t.kind = 'task' and t.done_at is not null) end,
      'moved', (select count(distinct co.id) from app.crm_sends x
                join app.crm_contacts c on c.id = x.contact_id join app.crm_companies co on co.id = c.company_id
                join app.crm_stages now_s on now_s.key = co.stage
                join app.crm_stages from_s on from_s.key = coalesce(p.stage_on_send, p.stage_target)
                where x.campaign_id = p.id and x.kind = 'campaign' and x.status = 'sent'
                  and now_s.kind in ('open', 'won') and now_s.sort > from_s.sort),
      'replied', (select count(distinct co.id) from app.crm_sends x
                  join app.crm_contacts c on c.id = x.contact_id join app.crm_companies co on co.id = c.company_id
                  where x.campaign_id = p.id and x.kind = 'campaign' and x.status = 'sent'
                    and exists (select 1 from app.crm_activities a where a.company_id = co.id and a.kind = 'reply' and a.created_at >= x.sent_at)),
      'first_sent', p.first_sent, 'created_at', p.created_at
    ) order by p.created_at desc), '[]') from per p));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_sequence(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_root uuid;
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not exists (select 1 from app.crm_campaigns where id = p_id) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_root := app.crm_chain_root(p_id);
  return jsonb_build_object('ok', true, 'steps', (
    with recursive down as (
      select c.*, 1 as step from app.crm_campaigns c where c.id = v_root
      union all select c.*, down.step + 1 from app.crm_campaigns c join down on c.follows_id = down.id where down.step < 1000
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', d.id, 'number', d.number, 'name', d.name, 'status', d.status, 'step', d.step, 'subject', d.subject,
      'step_kind', d.step_kind,
      'follow_days', d.follow_days, 'follow_when', d.follow_when, 'follow_auto', d.follow_auto,
      'scheduled_at', d.scheduled_at, 'finished_at', d.finished_at,
      'stats', app.crm_campaign_stats(d.id),
      -- 0137: a call or LinkedIn step's tasks, by state
      'tasks', case when d.step_kind <> 'mail' then (
                 select jsonb_build_object('made', count(*), 'open', count(*) filter (where a.done_at is null),
                                           'done', count(*) filter (where a.done_at is not null and not a.skipped),
                                           'skipped', count(*) filter (where a.skipped))
                 from app.crm_activities a where a.campaign_id = d.id and a.kind = 'task') end,
      -- answers logged on the recipients' companies after this step's mail reached them
      'replied', (select count(distinct co.id) from app.crm_sends s join app.crm_contacts c on c.id = s.contact_id
                  join app.crm_companies co on co.id = c.company_id
                  where s.campaign_id = d.id and s.kind = 'campaign' and s.status = 'sent'
                    and exists (select 1 from app.crm_activities a where a.company_id = co.id and a.kind = 'reply' and a.created_at >= s.sent_at)),
      'waiting', case when d.follow_auto and d.status in ('scheduled', 'sending')
                   then (select count(*) from app.crm_follow_audience((select c from app.crm_campaigns c where c.id = d.id)) x
                         where not exists (select 1 from app.crm_sends s where s.campaign_id = d.id and s.contact_id = x.contact_id)
                           and not exists (select 1 from app.crm_activities a where a.campaign_id = d.id and a.contact_id = x.contact_id)) end
      ) order by d.step, d.created_at), '[]') from down d));
end $function$;
