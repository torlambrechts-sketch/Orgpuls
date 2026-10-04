-- 0197 — CRM custom fields: the field registry, custom values, quality rules, hidden and read-only fields,
-- formula fields (WP-0.5; D-212)
--
-- docs/crm-enrichment/INSTRUCTIONS.md CUS-01, CUS-02, CUS-03, CUS-04, SF-38: an admin adds fields to companies and
-- contacts without a deploy, and forms, filters and import read them from the registry.
--
-- The registry is rows: app.crm_field_groups and app.crm_fields (a field's key is fixed when it is made; its label,
-- description, options, rules and access may change, and every change is a new version in app.crm_field_versions).
-- Values live in one jsonb column per record, custom, keyed by the field's key; app.crm_field_value checks and
-- normalises a value for its field's type, so nothing that is not a valid value of a live field is ever stored.
--
-- Sixteen types (CUS-01): text, large text, single option, multiple options, autocomplete, number, monetary (NOK
-- until currencies arrive with CUS-06), user, organization, person, phone, time, time range, date, date range and
-- address. A reference (user, organization, person) is stored as the record's id; a form or an import may name it
-- by e-mail, org number or exact name, and an organization the caller cannot see cannot be named.
--
-- Quality rules (CUS-02): important (a nudge on the page) or required, optionally only from a given stage on.
-- Required blocks a manual save and a stage move by hand; an import reports it and imports the row anyway.
--
-- Hidden and read-only (CUS-03), per permission set (0196): a field hidden from the caller's set is absent from
-- every reader (the record, the lists, the history, the filters and the field registry itself) and refused by
-- every writer as unknown; a read-only field is shown and refused as read-only. The Admin set and the system's own
-- jobs see and write every field.
--
-- Formula fields (CUS-04): a number or monetary field may be calculated from the record's other numeric fields —
-- custom number and monetary fields and, on companies, value_nok and employees — with + - * / and parentheses. A
-- formula is compiled once into postfix form when it is saved (no dynamic SQL ever runs it), may not reference
-- itself or close a cycle, and is recomputed by a trigger on every write, so the stored value always equals the
-- formula's result; nobody writes a formula field directly.
--
-- Filters: one GIN index per table serves the registry's equality conditions; creating an index per field from an
-- admin call would be a schema change outside the migrations (CLAUDE.md invariant 8).

-- ------------------------------------------------------------------------------------------ the registry
create table app.crm_field_groups (
  id          uuid primary key default gen_random_uuid(),
  product_id  text not null default 'orgpuls',
  entity      text not null check (entity in ('company', 'contact')),
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  sort        int not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (entity, name)
);
alter table app.crm_field_groups enable row level security;
revoke all on app.crm_field_groups from public, anon, authenticated;

create table app.crm_fields (
  id                  uuid primary key default gen_random_uuid(),
  product_id          text not null default 'orgpuls',
  entity              text not null check (entity in ('company', 'contact')),
  key                 text not null check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  label               text not null check (char_length(btrim(label)) between 1 and 80),
  description         text check (description is null or char_length(description) <= 500),
  type                text not null check (type in ('text', 'large_text', 'single_option', 'multiple_options', 'autocomplete',
                        'number', 'monetary', 'user', 'organization', 'person', 'phone', 'time', 'time_range', 'date',
                        'date_range', 'address')),
  group_id            uuid references app.crm_field_groups (id) on delete set null,
  sort                int not null default 0,
  -- the choices of an option field, in order: [{"key": "vest", "label": "Vestlandet"}, …]
  options             jsonb not null default '[]' check (jsonb_typeof(options) = 'array'),
  importance          text not null default 'none' check (importance in ('none', 'important', 'required')),
  required_from_stage text references app.crm_stages (key) on update cascade on delete set null,
  in_add_form         boolean not null default false,
  in_detail           boolean not null default true,
  formula             text check (formula is null or char_length(formula) <= 500),
  formula_rpn         jsonb,
  hidden_sets         uuid[] not null default '{}',
  read_only_sets      uuid[] not null default '{}',
  version             int not null default 1 check (version >= 1),
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users (id) on delete set null,
  unique (entity, key),
  check (formula is null or type in ('number', 'monetary')),
  check ((formula is null) = (formula_rpn is null)),
  check (required_from_stage is null or entity = 'company')
);
create index crm_fields_group_idx on app.crm_fields (group_id);
create index crm_fields_stage_idx on app.crm_fields (required_from_stage);
create index crm_fields_updated_by_idx on app.crm_fields (updated_by);
alter table app.crm_fields enable row level security;
revoke all on app.crm_fields from public, anon, authenticated;

-- SF-38: every saved definition, whole, by version
create table app.crm_field_versions (
  field_id   uuid not null references app.crm_fields (id) on delete cascade,
  version    int not null,
  definition jsonb not null,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now(),
  primary key (field_id, version)
);
create index crm_field_versions_changed_by_idx on app.crm_field_versions (changed_by);
alter table app.crm_field_versions enable row level security;
revoke all on app.crm_field_versions from public, anon, authenticated;

-- nobody changes a version's content; the database may still clear who made it when that account goes, and a
-- version goes only with its field (CLAUDE.md: immutability triggers permit referential maintenance)
create function app.crm_field_versions_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if (new.field_id, new.version, new.definition, new.changed_at) is distinct from (old.field_id, old.version, old.definition, old.changed_at)
       or (new.changed_by is distinct from old.changed_by
           and (new.changed_by is not null or exists (select 1 from auth.users u where u.id = old.changed_by))) then
      raise exception 'crm_field_versions is a record: a version is not changed' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if exists (select 1 from app.crm_fields f where f.id = old.field_id) then
    raise exception 'crm_field_versions is a record: a version goes only with its field' using errcode = 'check_violation';
  end if;
  return old;
end $$;
create trigger crm_field_versions_guard before update or delete on app.crm_field_versions
  for each row execute function app.crm_field_versions_guard();

-- ------------------------------------------------------------------------------------------ the values
alter table app.crm_companies add column custom jsonb not null default '{}' check (jsonb_typeof(custom) = 'object');
alter table app.crm_contacts add column custom jsonb not null default '{}' check (jsonb_typeof(custom) = 'object');
create index crm_companies_custom_idx on app.crm_companies using gin (custom jsonb_path_ops);
create index crm_contacts_custom_idx on app.crm_contacts using gin (custom jsonb_path_ops);

-- a custom value's history line is named custom.<key>
alter table app.crm_changes drop constraint crm_changes_field_check,
  add constraint crm_changes_field_check check (field ~ '^[a-z_]{1,60}$' or field ~ '^custom\.[a-z][a-z0-9_]{1,40}$');

-- ------------------------------------------------------------------------------------------ the rules
insert into app.crm_setting_defs (key, area, kind, options, default_value, applies_to, sort) values
  ('limit_custom_fields', 'limits', 'limit', null, 'null', array['CUS-01'], 170),
  ('limit_field_options', 'limits', 'limit', null, 'null', array['CUS-01'], 180);

-- ------------------------------------------------------------------------------------------ helpers
-- what the signed-in staff member may do with a field: write it, only read it, or not know it exists
create function app.crm_field_access(f app.crm_fields) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when auth.uid() is null then 'write'                    -- the system's own jobs
    when s.id is null then 'hidden'                         -- no permission set: no CRM
    when s.kind = 'admin' then 'write'
    when s.id = any (f.hidden_sets) then 'hidden'
    when s.id = any (f.read_only_sets) then 'read'
    else 'write' end
  from app.crm_set_of(auth.uid()) s
$$;

-- a record's custom values as the signed-in staff member may see them: live fields they are not hidden from
create function app.crm_custom_out(p_entity text, p_custom jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when p_custom is null or p_custom = '{}'::jsonb then '{}'::jsonb else (
    select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(p_custom) e
    join app.crm_fields f on f.entity = p_entity and f.key = e.key and f.archived_at is null
    where app.crm_field_access(f) <> 'hidden') end
$$;

-- the names behind the references among those values (staff, organizations the viewer may see, contacts), for
-- the page; an organization the viewer may not see is not named
create function app.crm_custom_refs(p_entity text, p_custom jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(x.id, x.label), '{}'::jsonb) from (
    select v.id, case f.type
        when 'user' then (select u.email::text from auth.users u where u.id = v.id::uuid)
        when 'organization' then (select co.name from app.crm_companies co
                                  where co.id = v.id::uuid and co.deleted_at is null and app.crm_visible(co.owner_id, co.visibility))
        when 'person' then (select coalesce(nullif(btrim(c.name), ''), c.email) from app.crm_contacts c where c.id = v.id::uuid and c.deleted_at is null)
      end as label
    from jsonb_each(app.crm_custom_out(p_entity, p_custom)) e
    join app.crm_fields f on f.entity = p_entity and f.key = e.key and f.type in ('user', 'organization', 'person')
    cross join lateral (select e.value #>> '{}' as id) v
    where v.id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') x
  where x.label is not null
$$;

-- a number out of a stored value: a number, or a monetary value's amount
create function app.crm_num(v jsonb) returns numeric
language sql immutable set search_path = '' as $$
  select case jsonb_typeof(v)
    when 'number' then (v #>> '{}')::numeric
    when 'object' then case when jsonb_typeof(v -> 'amount') = 'number' then (v ->> 'amount')::numeric end end
$$;

-- a date out of a text: ISO or Norwegian day.month.year; null when it is not one
create function app.crm_date_text(p text) returns date
language plpgsql immutable set search_path = '' as $$
declare
  m text[];
begin
  -- make_date, not a cast: a cast reads the session's DateStyle, which would make this function only stable
  if p ~ '^\d{4}-\d{2}-\d{2}$' then
    return make_date(substr(p, 1, 4)::int, substr(p, 6, 2)::int, substr(p, 9, 2)::int);
  end if;
  m := regexp_match(btrim(p), '^(\d{1,2})\.(\d{1,2})\.(\d{4})$');
  if m is not null then
    return make_date(m[3]::int, m[2]::int, m[1]::int);
  end if;
  return null;
exception when others then
  return null;
end $$;

-- CUS-01: one value checked and normalised for its field: {"ok": true, "value": …} (a null value removes it) or
-- {"ok": false}. References may be named by e-mail, org number or exact name and are stored as ids.
create function app.crm_field_value(f app.crm_fields, v jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  t text := jsonb_typeof(v);
  s text := case when jsonb_typeof(v) in ('string', 'number') then btrim(v #>> '{}') end;
  a jsonb;
  n numeric;
  d1 date;
  d2 date;
  r uuid;
  k text;
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  time_re constant text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
  bad constant jsonb := '{"ok": false}';
begin
  if v is null or t = 'null' or (t = 'string' and s = '') or (t = 'array' and jsonb_array_length(v) = 0) then
    return jsonb_build_object('ok', true, 'value', null);
  end if;
  case f.type
  when 'text', 'autocomplete' then
    if s is null or char_length(s) > (case f.type when 'text' then 500 else 200 end) then return bad; end if;
    return jsonb_build_object('ok', true, 'value', s);
  when 'large_text' then
    if t <> 'string' or char_length(v #>> '{}') > 10000 then return bad; end if;
    return jsonb_build_object('ok', true, 'value', btrim(v #>> '{}'));
  when 'phone' then
    if s is null or s !~ '^\+?[0-9 ()-]{3,40}$' then return bad; end if;
    return jsonb_build_object('ok', true, 'value', s);
  when 'single_option' then
    if t <> 'string' or not exists (select 1 from jsonb_array_elements(f.options) o where o ->> 'key' = s) then return bad; end if;
    return jsonb_build_object('ok', true, 'value', s);
  when 'multiple_options' then
    if t <> 'array' or exists (select 1 from jsonb_array_elements(v) x where jsonb_typeof(x) <> 'string'
         or not exists (select 1 from jsonb_array_elements(f.options) o where o ->> 'key' = x #>> '{}')) then
      return bad;
    end if;
    -- in the options' own order, each once
    select coalesce(jsonb_agg(o.value -> 'key' order by o.ord), '[]'::jsonb) into a
    from jsonb_array_elements(f.options) with ordinality o(value, ord)
    where exists (select 1 from jsonb_array_elements_text(v) x where x = o.value ->> 'key');
    return jsonb_build_object('ok', true, 'value', a);
  when 'number' then
    if t <> 'number' then return bad; end if;
    n := (v #>> '{}')::numeric;
    if abs(n) >= 1e15 then return bad; end if;
    return jsonb_build_object('ok', true, 'value', trim_scale(n));
  when 'monetary' then
    n := case t when 'number' then (v #>> '{}')::numeric
                when 'object' then case when jsonb_typeof(v -> 'amount') = 'number' then (v ->> 'amount')::numeric end end;
    if n is null or abs(n) >= 1e13 or (t = 'object' and coalesce(v ->> 'currency', 'NOK') <> 'NOK') then return bad; end if;
    return jsonb_build_object('ok', true, 'value', jsonb_build_object('amount', trim_scale(round(n, 2)), 'currency', 'NOK'));
  when 'user' then
    if s is null then return bad; end if;
    select pa.user_id into r from app.platform_admins pa join auth.users u on u.id = pa.user_id
    where (s ~ uuid_re and pa.user_id = s::uuid) or lower(u.email) = lower(s) limit 1;
    if r is null then return bad; end if;
    return jsonb_build_object('ok', true, 'value', r::text);
  when 'organization' then
    if s is null then return bad; end if;
    select co.id into r from app.crm_companies co
    where co.deleted_at is null and app.crm_visible(co.owner_id, co.visibility)
      and ((s ~ uuid_re and co.id = s::uuid) or (regexp_replace(s, '\s', '', 'g') ~ '^[0-9]{9}$' and co.org_number = regexp_replace(s, '\s', '', 'g')))
    limit 1;
    if r is null and (select count(*) from app.crm_companies co where co.deleted_at is null and app.crm_visible(co.owner_id, co.visibility)
                      and lower(co.name) = lower(s)) = 1 then
      select co.id into r from app.crm_companies co where co.deleted_at is null and app.crm_visible(co.owner_id, co.visibility) and lower(co.name) = lower(s);
    end if;
    if r is null then return bad; end if;
    return jsonb_build_object('ok', true, 'value', r::text);
  when 'person' then
    if s is null then return bad; end if;
    select c.id into r from app.crm_contacts c
    where c.deleted_at is null and ((s ~ uuid_re and c.id = s::uuid) or c.email = lower(s)) limit 1;
    if r is null then return bad; end if;
    return jsonb_build_object('ok', true, 'value', r::text);
  when 'time' then
    if s is null or s !~ time_re then return bad; end if;
    return jsonb_build_object('ok', true, 'value', s);
  when 'time_range' then
    if t <> 'object' or coalesce(v ->> 'from', '') !~ time_re or coalesce(v ->> 'to', '') !~ time_re or v ->> 'from' > v ->> 'to' then return bad; end if;
    return jsonb_build_object('ok', true, 'value', jsonb_build_object('from', v ->> 'from', 'to', v ->> 'to'));
  when 'date' then
    d1 := app.crm_date_text(s);
    if d1 is null then return bad; end if;
    return jsonb_build_object('ok', true, 'value', to_char(d1, 'YYYY-MM-DD'));
  when 'date_range' then
    if t <> 'object' then return bad; end if;
    d1 := app.crm_date_text(v ->> 'from');
    d2 := app.crm_date_text(v ->> 'to');
    if d1 is null or d2 is null or d1 > d2 then return bad; end if;
    return jsonb_build_object('ok', true, 'value', jsonb_build_object('from', to_char(d1, 'YYYY-MM-DD'), 'to', to_char(d2, 'YYYY-MM-DD')));
  when 'address' then
    if t <> 'object' or exists (select 1 from jsonb_each(v) x where x.key not in ('street', 'postcode', 'city', 'country')
         or jsonb_typeof(x.value) not in ('string', 'null')) then
      return bad;
    end if;
    a := '{}'::jsonb;
    foreach k in array array['street', 'postcode', 'city', 'country'] loop
      s := nullif(btrim(coalesce(v ->> k, '')), '');
      if s is not null then
        if char_length(s) > (case k when 'street' then 200 when 'postcode' then 12 when 'city' then 100 else 60 end)
           or (k = 'postcode' and s !~ '^[0-9A-Za-z -]{2,12}$') then
          return bad;
        end if;
        a := a || jsonb_build_object(k, s);
      end if;
    end loop;
    return jsonb_build_object('ok', true, 'value', case when a = '{}'::jsonb then null else a end);
  else
    return bad;
  end case;
end $$;

-- a value written as text, as an import or a form's text box carries it, made into the field's own form; the
-- result is then checked by app.crm_field_value
create function app.crm_field_text(f app.crm_fields, p text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s text := btrim(coalesce(p, ''));
  m text[];
  n text;
begin
  if s = '' then
    return 'null'::jsonb;
  end if;
  case f.type
  when 'number', 'monetary' then
    n := replace(regexp_replace(s, '[\s ]|kr|NOK', '', 'gi'), ',', '.');
    if n !~ '^-?[0-9]+(\.[0-9]+)?$' then return to_jsonb(s); end if;
    return to_jsonb(n::numeric);
  when 'single_option' then
    return to_jsonb(coalesce((select o ->> 'key' from jsonb_array_elements(f.options) o
                              where o ->> 'key' = s or lower(o ->> 'label') = lower(s) limit 1), s));
  when 'multiple_options' then
    return coalesce((select jsonb_agg(coalesce((select o ->> 'key' from jsonb_array_elements(f.options) o
                                                where o ->> 'key' = btrim(x) or lower(o ->> 'label') = lower(btrim(x)) limit 1), btrim(x)))
                     from unnest(string_to_array(s, ';')) x where btrim(x) <> ''), '[]'::jsonb);
  when 'time_range' then
    m := regexp_match(s, '^(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})$');
    return case when m is null then to_jsonb(s) else jsonb_build_object('from', m[1], 'to', m[2]) end;
  when 'date_range' then
    m := regexp_match(s, '^(\S+)\s*[–]\s*(\S+)$');
    if m is null then m := regexp_match(s, '^(\S+)\s+-\s+(\S+)$'); end if;
    return case when m is null then to_jsonb(s) else jsonb_build_object('from', m[1], 'to', m[2]) end;
  when 'address' then
    -- «street, postcode city»
    m := regexp_match(s, '^(.*?),\s*([0-9]{4})\s+(.+)$');
    return case when m is null then jsonb_build_object('street', s) else jsonb_build_object('street', m[1], 'postcode', m[2], 'city', m[3]) end;
  else
    return to_jsonb(s);
  end case;
end $$;

-- CUS-01/CUS-03: a record's custom values with the caller's changes merged in, every one checked:
-- {"ok": true, "custom": …} or {"ok": false, "error": …, "field": key}. A hidden field is unknown to the caller; a
-- read-only or formula field may be sent back unchanged but not changed. p_text: the values are text (an import).
create function app.crm_custom_in(p_entity text, p_old jsonb, p_patch jsonb, p_text boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  e record;
  f app.crm_fields;
  r jsonb;
  v_access text;
  v_out jsonb := coalesce(p_old, '{}'::jsonb);
begin
  if p_patch is null then
    return jsonb_build_object('ok', true, 'custom', v_out);
  end if;
  if jsonb_typeof(p_patch) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid_field');
  end if;
  for e in select * from jsonb_each(p_patch) loop
    select * into f from app.crm_fields x where x.entity = p_entity and x.key = e.key and x.archived_at is null;
    v_access := case when f.id is null then 'hidden' else app.crm_field_access(f) end;
    if v_access = 'hidden' then
      return jsonb_build_object('ok', false, 'error', 'unknown_field', 'field', e.key);
    end if;
    r := app.crm_field_value(f, case when p_text and jsonb_typeof(e.value) = 'string' then app.crm_field_text(f, e.value #>> '{}') else e.value end);
    if not (r ->> 'ok')::boolean then
      return jsonb_build_object('ok', false, 'error', 'invalid_field', 'field', e.key);
    end if;
    if (r -> 'value') is not distinct from coalesce(p_old -> e.key, 'null'::jsonb) then
      continue;   -- unchanged
    end if;
    if v_access = 'read' then
      return jsonb_build_object('ok', false, 'error', 'read_only_field', 'field', e.key);
    end if;
    if f.formula_rpn is not null then
      return jsonb_build_object('ok', false, 'error', 'formula_field', 'field', e.key);
    end if;
    v_out := case when (r -> 'value') = 'null'::jsonb then v_out - e.key else jsonb_set(v_out, array[e.key], r -> 'value') end;
  end loop;
  return jsonb_build_object('ok', true, 'custom', v_out);
end $$;

-- CUS-02: the required fields the caller could fill that are empty, for a company at p_stage (from that stage on,
-- among open and won stages) or a contact (no stage)
create function app.crm_custom_missing(p_entity text, p_custom jsonb, p_stage text) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(f.key order by f.sort, f.key), '{}') from app.crm_fields f
  where f.entity = p_entity and f.archived_at is null and f.importance = 'required' and f.formula_rpn is null
    and app.crm_field_access(f) = 'write'
    and (f.required_from_stage is null or exists (
          select 1 from app.crm_stages s, app.crm_stages r
          where s.key = p_stage and r.key = f.required_from_stage and s.kind in ('open', 'won') and s.sort >= r.sort))
    and coalesce(p_custom -> f.key, 'null'::jsonb) = 'null'::jsonb
$$;

-- an import's columns that name a custom field, by key or label: {"custom": …, "unknown": [columns], "invalid": [keys]}.
-- A column naming no live field the caller may write is unknown; a value that does not fit is left out and named.
create function app.crm_custom_import(p_entity text, p_texts jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  e record;
  f app.crm_fields;
  r jsonb;
  v_custom jsonb := '{}'::jsonb;
  v_unknown text[] := '{}';
  v_invalid text[] := '{}';
begin
  if p_texts is null or jsonb_typeof(p_texts) <> 'object' then
    return jsonb_build_object('custom', v_custom, 'unknown', '[]'::jsonb, 'invalid', '[]'::jsonb);
  end if;
  for e in select * from jsonb_each_text(p_texts) loop
    select * into f from app.crm_fields x
    where x.entity = p_entity and x.archived_at is null and (x.key = lower(btrim(e.key)) or lower(x.label) = lower(btrim(e.key)))
    order by (x.key = lower(btrim(e.key))) desc limit 1;
    if f.id is null or app.crm_field_access(f) <> 'write' or f.formula_rpn is not null then
      v_unknown := v_unknown || left(e.key, 80);
      continue;
    end if;
    r := app.crm_field_value(f, app.crm_field_text(f, e.value));
    if not (r ->> 'ok')::boolean then
      v_invalid := v_invalid || f.key;
    elsif (r -> 'value') <> 'null'::jsonb then
      v_custom := jsonb_set(v_custom, array[f.key], r -> 'value');
    end if;
  end loop;
  return jsonb_build_object('custom', v_custom, 'unknown', to_jsonb(v_unknown), 'invalid', to_jsonb(v_invalid));
end $$;

-- whether a custom field's history may be shown to the caller: a live field they are not hidden from
create function app.crm_custom_key_visible(p_entity text, p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select app.crm_field_access(f) <> 'hidden' from app.crm_fields f
                   where f.entity = p_entity and f.key = p_key and f.archived_at is null), false)
$$;

-- ------------------------------------------------------------------------------------------ filters
-- a condition list ({key, op, value}, at most 20) that names live fields of the entity with an operator their type has
create function app.crm_conditions_ok(p_entity text, c jsonb) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  x jsonb;
  f app.crm_fields;
begin
  if c is null then return true; end if;
  if jsonb_typeof(c) <> 'array' or jsonb_array_length(c) > 20 then return false; end if;
  for x in select * from jsonb_array_elements(c) loop
    if jsonb_typeof(x) <> 'object' or exists (select 1 from jsonb_object_keys(x) k where k not in ('key', 'op', 'value')) then
      return false;
    end if;
    select * into f from app.crm_fields y where y.entity = p_entity and y.key = x ->> 'key' and y.archived_at is null;
    if f.id is null then return false; end if;
    if x ->> 'op' in ('empty', 'not_empty') then
      continue;
    end if;
    if not (case
      when f.type in ('text', 'large_text', 'autocomplete', 'phone') then x ->> 'op' in ('contains', 'eq') and jsonb_typeof(x -> 'value') = 'string' and char_length(x ->> 'value') <= 200
      when f.type = 'single_option' then x ->> 'op' = 'in' and jsonb_typeof(x -> 'value') = 'array' and jsonb_array_length(x -> 'value') between 1 and 1000
      when f.type = 'multiple_options' then x ->> 'op' = 'any' and jsonb_typeof(x -> 'value') = 'array' and jsonb_array_length(x -> 'value') between 1 and 1000
      when f.type in ('number', 'monetary') then x ->> 'op' in ('eq', 'gte', 'lte') and jsonb_typeof(x -> 'value') = 'number'
      when f.type = 'date' then x ->> 'op' in ('eq', 'gte', 'lte') and app.crm_date_text(x ->> 'value') is not null
      when f.type in ('user', 'organization', 'person') then x ->> 'op' = 'eq' and coalesce(x ->> 'value', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      else false end) then
      return false;
    end if;
  end loop;
  return true;
end $$;

-- whether none of the conditions names a field hidden from the caller
create function app.crm_conditions_visible(p_entity text, c jsonb) returns boolean
language sql stable security definer set search_path = '' as $$
  select c is null or not exists (
    select 1 from jsonb_array_elements(c) x
    left join app.crm_fields f on f.entity = p_entity and f.key = x ->> 'key' and f.archived_at is null
    where f.id is null or app.crm_field_access(f) = 'hidden')
$$;

-- whether a record's values meet every condition (checked by app.crm_conditions_ok first)
create function app.crm_custom_match(p_entity text, p_custom jsonb, c jsonb) returns boolean
language sql stable security definer set search_path = '' as $$
  select c is null or coalesce(bool_and(coalesce(case
      when x ->> 'op' = 'empty' then coalesce(p_custom -> (x ->> 'key'), 'null'::jsonb) = 'null'::jsonb
      when x ->> 'op' = 'not_empty' then coalesce(p_custom -> (x ->> 'key'), 'null'::jsonb) <> 'null'::jsonb
      when x ->> 'op' = 'contains' then position(lower(x ->> 'value') in lower(coalesce(p_custom ->> (x ->> 'key'), ''))) > 0
      when x ->> 'op' = 'eq' and f.type in ('number', 'monetary') then app.crm_num(p_custom -> (x ->> 'key')) = (x ->> 'value')::numeric
      when x ->> 'op' = 'eq' and f.type = 'date' then p_custom ->> (x ->> 'key') = to_char(app.crm_date_text(x ->> 'value'), 'YYYY-MM-DD')
      when x ->> 'op' = 'eq' then lower(coalesce(p_custom ->> (x ->> 'key'), '')) = lower(x ->> 'value')
      when x ->> 'op' = 'gte' and f.type = 'date' then p_custom ->> (x ->> 'key') >= to_char(app.crm_date_text(x ->> 'value'), 'YYYY-MM-DD')
      when x ->> 'op' = 'lte' and f.type = 'date' then p_custom ->> (x ->> 'key') <= to_char(app.crm_date_text(x ->> 'value'), 'YYYY-MM-DD')
      when x ->> 'op' = 'gte' then app.crm_num(p_custom -> (x ->> 'key')) >= (x ->> 'value')::numeric
      when x ->> 'op' = 'lte' then app.crm_num(p_custom -> (x ->> 'key')) <= (x ->> 'value')::numeric
      when x ->> 'op' = 'in' then (p_custom ->> (x ->> 'key')) in (select jsonb_array_elements_text(x -> 'value'))
      when x ->> 'op' = 'any' then coalesce(p_custom -> (x ->> 'key'), '[]'::jsonb) ?| array(select jsonb_array_elements_text(x -> 'value'))
      else false end, false)), true)
  from jsonb_array_elements(c) x
  left join app.crm_fields f on f.entity = p_entity and f.key = x ->> 'key'
$$;

-- a segment's filter as the caller may see it: without the conditions on fields hidden from them
create function app.crm_filter_out(f jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when f is null or not f ? 'custom' then f else (
    select case when jsonb_array_length(v.c) = 0 then f - 'custom' else jsonb_set(f, '{custom}', v.c) end
    from (select coalesce(jsonb_agg(x), '[]'::jsonb) as c from jsonb_array_elements(f -> 'custom') x
          where app.crm_conditions_visible('contact', jsonb_build_array(x))) v) end
$$;

-- ------------------------------------------------------------------------------------------ formulas
-- the numeric columns a formula may read, besides the entity's number and monetary fields
create function app.crm_formula_columns(p_entity text) returns text[]
language sql immutable set search_path = '' as $$
  select case p_entity when 'company' then array['value_nok', 'employees'] else array[]::text[] end
$$;

-- CUS-04: a formula compiled into postfix form ({"n": 2}, {"c": "value_nok"}, {"f": "key"}, {"op": "+"}, {"op": "neg"}):
-- {"ok": true, "rpn": […], "refs": […]} or {"ok": false, "error": invalid_formula | formula_ref | formula_self | formula_cycle}
create function app.crm_formula_compile(p_entity text, p_key text, p_formula text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_src text := btrim(coalesce(p_formula, ''));
  v_pos int := 1;
  v_len int := char_length(btrim(coalesce(p_formula, '')));
  v_rest text;
  v_ch text;
  v_m text[];
  v_out jsonb := '[]'::jsonb;
  v_ops text[] := '{}';
  v_prev text := 'start';
  v_op text;
  v_prec int;
  v_depth int := 0;
  v_tokens int := 0;
  v_refs text[] := '{}';
  v_ref text;
  v_rpn jsonb := '[]'::jsonb;
  t jsonb;
  bad constant jsonb := '{"ok": false, "error": "invalid_formula"}';
begin
  if v_len = 0 or v_len > 500 then return bad; end if;
  while v_pos <= v_len loop
    v_rest := substr(v_src, v_pos);
    v_ch := substr(v_src, v_pos, 1);
    if v_ch ~ '\s' then v_pos := v_pos + 1; continue; end if;
    v_tokens := v_tokens + 1;
    if v_tokens > 200 then return bad; end if;
    v_m := regexp_match(v_rest, '^([0-9]+(\.[0-9]+)?)');
    if v_m is not null then
      if v_prev in ('value', 'close') then return bad; end if;
      v_out := v_out || jsonb_build_array(jsonb_build_object('n', v_m[1]::numeric));
      v_pos := v_pos + char_length(v_m[1]); v_prev := 'value'; continue;
    end if;
    v_m := regexp_match(v_rest, '^\{([a-z][a-z0-9_]{1,40})\}');
    if v_m is not null then
      if v_prev in ('value', 'close') then return bad; end if;
      v_out := v_out || jsonb_build_array(jsonb_build_object('f', v_m[1]));
      v_refs := v_refs || v_m[1];
      v_pos := v_pos + char_length(v_m[1]) + 2; v_prev := 'value'; continue;
    end if;
    if v_ch = '(' then
      if v_prev in ('value', 'close') then return bad; end if;
      v_ops := v_ops || '('::text; v_depth := v_depth + 1; v_prev := 'open';
    elsif v_ch = ')' then
      if v_prev not in ('value', 'close') or v_depth = 0 then return bad; end if;
      while v_ops[cardinality(v_ops)] <> '(' loop
        v_out := v_out || jsonb_build_array(jsonb_build_object('op', v_ops[cardinality(v_ops)]));
        v_ops := v_ops[1:cardinality(v_ops) - 1];
      end loop;
      v_ops := v_ops[1:cardinality(v_ops) - 1]; v_depth := v_depth - 1; v_prev := 'close';
    elsif v_ch in ('+', '-', '*', '/') then
      if v_prev in ('start', 'op', 'open') then
        -- a sign, not an operator: minus negates, plus is nothing
        if v_ch = '+' then v_pos := v_pos + 1; continue; end if;
        if v_ch <> '-' then return bad; end if;
        v_op := 'neg';
      else
        v_op := v_ch;
      end if;
      v_prec := case v_op when 'neg' then 3 when '*' then 2 when '/' then 2 else 1 end;
      if v_op <> 'neg' then
        while cardinality(v_ops) > 0 and v_ops[cardinality(v_ops)] <> '('
              and (case v_ops[cardinality(v_ops)] when 'neg' then 3 when '*' then 2 when '/' then 2 else 1 end) >= v_prec loop
          v_out := v_out || jsonb_build_array(jsonb_build_object('op', v_ops[cardinality(v_ops)]));
          v_ops := v_ops[1:cardinality(v_ops) - 1];
        end loop;
      end if;
      v_ops := v_ops || v_op; v_prev := 'op';
    else
      return bad;
    end if;
    v_pos := v_pos + 1;
  end loop;
  if v_prev not in ('value', 'close') or v_depth <> 0 then return bad; end if;
  while cardinality(v_ops) > 0 loop
    v_out := v_out || jsonb_build_array(jsonb_build_object('op', v_ops[cardinality(v_ops)]));
    v_ops := v_ops[1:cardinality(v_ops) - 1];
  end loop;
  -- what each reference names: a numeric column, or a live number or monetary field of the entity — never itself
  foreach v_ref in array v_refs loop
    if v_ref = p_key then
      return '{"ok": false, "error": "formula_self"}'::jsonb;
    end if;
    if not (v_ref = any (app.crm_formula_columns(p_entity)) or exists (
        select 1 from app.crm_fields f where f.entity = p_entity and f.key = v_ref and f.archived_at is null and f.type in ('number', 'monetary'))) then
      return jsonb_build_object('ok', false, 'error', 'formula_ref', 'field', v_ref);
    end if;
  end loop;
  for t in select * from jsonb_array_elements(v_out) loop
    v_rpn := v_rpn || jsonb_build_array(case when t ? 'f' and (t ->> 'f') = any (app.crm_formula_columns(p_entity))
                                             then jsonb_build_object('c', t ->> 'f') else t end);
  end loop;
  -- no cycle through other formulas: nothing this formula reads may, through formulas, read it
  if exists (
      with recursive reach(key) as (
        select distinct r from unnest(v_refs) r
        union
        select x ->> 'f' from reach
        join app.crm_fields f on f.entity = p_entity and f.key = reach.key and f.formula_rpn is not null and f.archived_at is null
        cross join lateral jsonb_array_elements(f.formula_rpn) x
        where x ? 'f')
      select 1 from reach where key = p_key) then
    return '{"ok": false, "error": "formula_cycle"}'::jsonb;
  end if;
  return jsonb_build_object('ok', true, 'rpn', v_rpn, 'refs', to_jsonb(array(select distinct r from unnest(v_refs) r order by 1)));
end $$;

-- a compiled formula evaluated over a record (its columns and its custom values): null when an input is empty or a
-- division is by zero
create function app.crm_formula_eval(p_rpn jsonb, p_row jsonb) returns numeric
language plpgsql immutable set search_path = '' as $$
declare
  v_stack numeric[] := '{}';
  t jsonb;
  a numeric;
  b numeric;
  n int;
begin
  for t in select * from jsonb_array_elements(p_rpn) loop
    if t ? 'n' then
      v_stack := v_stack || (t ->> 'n')::numeric;
    elsif t ? 'c' then
      v_stack := v_stack || app.crm_num(p_row -> (t ->> 'c'));
    elsif t ? 'f' then
      v_stack := v_stack || app.crm_num(p_row -> 'custom' -> (t ->> 'f'));
    else
      n := cardinality(v_stack);
      if t ->> 'op' = 'neg' then
        v_stack[n] := - v_stack[n];
      else
        a := v_stack[n - 1];
        b := v_stack[n];
        v_stack := v_stack[1:n - 2];
        v_stack := v_stack || case t ->> 'op' when '+' then a + b when '-' then a - b when '*' then a * b
                                              when '/' then case when b = 0 then null else a / b end end;
      end if;
    end if;
  end loop;
  return v_stack[1];
end $$;

-- every formula field of the record recomputed before it is written, in as many passes as formulas feed formulas
create function app.crm_custom_formulas() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_entity text := case tg_table_name when 'crm_companies' then 'company' else 'contact' end;
  v_custom jsonb := coalesce(new.custom, '{}'::jsonb);
  v_row jsonb;
  f record;
  v numeric;
  v_val jsonb;
  v_changed boolean;
  v_pass int := 0;
begin
  if not exists (select 1 from app.crm_fields x where x.entity = v_entity and x.formula_rpn is not null and x.archived_at is null) then
    return new;
  end if;
  loop
    v_pass := v_pass + 1;
    v_changed := false;
    for f in select x.key, x.type, x.formula_rpn from app.crm_fields x
             where x.entity = v_entity and x.formula_rpn is not null and x.archived_at is null order by x.key loop
      v_row := to_jsonb(new) || jsonb_build_object('custom', v_custom);
      v := app.crm_formula_eval(f.formula_rpn, v_row);
      v_val := case when v is null or abs(v) >= 1e15 then null
                    when f.type = 'monetary' then jsonb_build_object('amount', trim_scale(round(v, 2)), 'currency', 'NOK')
                    else to_jsonb(trim_scale(round(v, 6))) end;
      if (v_custom -> f.key) is distinct from v_val then
        v_custom := case when v_val is null then v_custom - f.key else jsonb_set(v_custom, array[f.key], v_val) end;
        v_changed := true;
      end if;
    end loop;
    exit when not v_changed or v_pass > 20;
  end loop;
  new.custom := v_custom;
  return new;
end $$;
-- before crm_*_stamp (triggers of one kind fire by name), so the version and the history see the computed values
create trigger crm_companies_custom before insert or update on app.crm_companies for each row execute function app.crm_custom_formulas();
create trigger crm_contacts_custom before insert or update on app.crm_contacts for each row execute function app.crm_custom_formulas();

-- whether any record, the restore list included, holds a value for the field (a type may change only while none does)
create function app.crm_field_in_use(p_entity text, p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_entity
    when 'company' then exists (select 1 from app.crm_companies c where c.custom ? p_key)
    else exists (select 1 from app.crm_contacts c where c.custom ? p_key) end
$$;

-- whether any record holds one of these option keys for the field (an option in use is not removed)
create function app.crm_options_in_use(p_entity text, p_key text, p_options text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(cardinality(p_options), 0) > 0 and case p_entity
    when 'company' then exists (select 1 from app.crm_companies c where c.custom ->> p_key = any (p_options) or coalesce(c.custom -> p_key, '[]'::jsonb) ?| p_options)
    else exists (select 1 from app.crm_contacts c where c.custom ->> p_key = any (p_options) or coalesce(c.custom -> p_key, '[]'::jsonb) ?| p_options) end
$$;

-- every record of the entity written again, so its formulas follow a changed definition (the trigger computes)
create function app.crm_formulas_recompute(p_entity text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.change_source', 'automation', true);
  if p_entity = 'company' then
    update app.crm_companies set custom = custom where product_id = 'orgpuls';
  else
    update app.crm_contacts set custom = custom where product_id = 'orgpuls';
  end if;
end $$;

revoke all on function app.crm_field_versions_guard(), app.crm_field_access(app.crm_fields), app.crm_custom_out(text, jsonb),
  app.crm_custom_refs(text, jsonb), app.crm_num(jsonb), app.crm_date_text(text), app.crm_field_value(app.crm_fields, jsonb),
  app.crm_field_text(app.crm_fields, text), app.crm_custom_in(text, jsonb, jsonb, boolean), app.crm_custom_missing(text, jsonb, text),
  app.crm_conditions_ok(text, jsonb), app.crm_conditions_visible(text, jsonb), app.crm_custom_match(text, jsonb, jsonb),
  app.crm_formula_columns(text), app.crm_formula_compile(text, text, text), app.crm_formula_eval(jsonb, jsonb), app.crm_custom_formulas(),
  app.crm_field_in_use(text, text), app.crm_options_in_use(text, text, text[]), app.crm_formulas_recompute(text),
  app.crm_custom_import(text, jsonb), app.crm_custom_key_visible(text, text), app.crm_filter_out(jsonb)
  from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------ the admin's calls
-- The registry for a screen: the groups and the fields the caller may see, each with what they may do with it; a
-- staff member whose set holds the CRM settings sees every field, archived ones and access lists included.
create function public.admin_crm_fields(p_entity text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_manage boolean;
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_entity is not null and p_entity not in ('company', 'contact') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  perform app.admin_log('crm.fields', null, null, null, null, jsonb_build_object('entity', p_entity));
  v_manage := app.crm_can('global.settings');
  return jsonb_build_object('ok', true, 'manage', v_manage,
    'groups', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'entity', g.entity, 'name', g.name, 'sort', g.sort,
                 'archived', g.archived_at is not null) order by g.entity, g.sort, g.name), '[]')
               from app.crm_field_groups g where (p_entity is null or g.entity = p_entity) and (v_manage or g.archived_at is null)),
    'fields', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'entity', f.entity, 'key', f.key, 'label', f.label,
                 'description', f.description, 'type', f.type, 'group_id', f.group_id, 'sort', f.sort, 'options', f.options,
                 'importance', f.importance, 'required_from_stage', f.required_from_stage, 'in_add_form', f.in_add_form,
                 'in_detail', f.in_detail, 'computed', f.formula is not null, 'access', app.crm_field_access(f))
                 || case when v_manage then jsonb_build_object('formula', f.formula, 'hidden_sets', to_jsonb(f.hidden_sets),
                      'read_only_sets', to_jsonb(f.read_only_sets), 'version', f.version, 'archived', f.archived_at is not null)
                    else '{}'::jsonb end
                 order by f.entity, f.sort, f.label), '[]')
               from app.crm_fields f
               where (p_entity is null or f.entity = p_entity)
                 and (v_manage or (f.archived_at is null and app.crm_field_access(f) <> 'hidden'))),
    'sets', case when v_manage then (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'kind', s.kind)
                 order by s.builtin desc, s.name), '[]') from app.crm_permission_sets s) else '[]'::jsonb end,
    'limits', jsonb_build_object('fields', app.crm_limit('limit_custom_fields'), 'options', app.crm_limit('limit_field_options')));
end $$;

-- Add a field (no id) or change one. The entity and key are fixed when it is made; the type may change only while
-- no record holds a value; an option a record holds is not removed; every save is a new version.
create function public.admin_crm_field_save(p_id uuid, p jsonb, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_old app.crm_fields;
  v_f app.crm_fields;
  v_entity text;
  v_key text;
  v_type text;
  v_label text;
  v_desc text;
  v_options jsonb := '[]'::jsonb;
  v_formula text;
  v_comp jsonb;
  v_rpn jsonb;
  v_max int;
  v_hidden uuid[];
  v_ro uuid[];
  v_group uuid;
  v_stage text;
  v_importance text;
  v_recompute boolean := false;
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if not app.crm_can('global.settings') then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not app.crm_reason_ok(p_reason) then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'setting', 'typed_reason');
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if p_id is not null then
    select * into v_old from app.crm_fields where id = p_id for update;
    if v_old.id is null then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    if nullif(p ->> 'version', '') is not null and (p ->> 'version' !~ '^[0-9]{1,9}$' or (p ->> 'version')::int <> v_old.version) then
      return jsonb_build_object('ok', false, 'error', 'stale', 'version', v_old.version);
    end if;
    v_entity := v_old.entity;
    v_key := v_old.key;
    v_type := coalesce(nullif(p ->> 'type', ''), v_old.type);
  else
    v_entity := p ->> 'entity';
    v_key := lower(btrim(coalesce(p ->> 'key', '')));
    v_type := p ->> 'type';
    if coalesce(v_entity, '') not in ('company', 'contact') then
      return jsonb_build_object('ok', false, 'error', 'invalid');
    end if;
    if v_key !~ '^[a-z][a-z0-9_]{1,40}$' then
      return jsonb_build_object('ok', false, 'error', 'invalid_key');
    end if;
    -- a key never shadows one of the record's own columns
    if exists (select 1 from pg_attribute a where a.attrelid = case v_entity when 'company' then 'app.crm_companies'::regclass else 'app.crm_contacts'::regclass end
               and a.attnum > 0 and not a.attisdropped and a.attname = v_key) then
      return jsonb_build_object('ok', false, 'error', 'reserved_key');
    end if;
    if exists (select 1 from app.crm_fields x where x.entity = v_entity and x.key = v_key) then
      return jsonb_build_object('ok', false, 'error', 'exists');
    end if;
    v_max := app.crm_limit('limit_custom_fields');
    if v_max is not null and (select count(*) from app.crm_fields x where x.archived_at is null) >= v_max then
      return jsonb_build_object('ok', false, 'error', 'too_many', 'setting', 'limit_custom_fields', 'limit', v_max);
    end if;
  end if;
  -- a change names what it changes; everything else keeps its value
  v_label := btrim(coalesce(case when p_id is null or p ? 'label' then p ->> 'label' else v_old.label end, ''));
  v_desc := nullif(btrim(coalesce(case when p_id is null or p ? 'description' then p ->> 'description' else v_old.description end, '')), '');
  v_formula := nullif(btrim(coalesce(case when p_id is null or p ? 'formula' then p ->> 'formula' else v_old.formula end, '')), '');
  v_stage := nullif(case when p_id is null or p ? 'required_from_stage' then p ->> 'required_from_stage' else v_old.required_from_stage end, '');
  v_importance := coalesce(nullif(case when p_id is null or p ? 'importance' then p ->> 'importance' else v_old.importance end, ''), 'none');
  v_group := case when p_id is not null and not p ? 'group_id' then v_old.group_id end;
  if coalesce(v_type, '') not in ('text', 'large_text', 'single_option', 'multiple_options', 'autocomplete', 'number', 'monetary',
                                  'user', 'organization', 'person', 'phone', 'time', 'time_range', 'date', 'date_range', 'address') then
    return jsonb_build_object('ok', false, 'error', 'invalid_type');
  end if;
  if char_length(v_label) not between 1 and 80 then
    return jsonb_build_object('ok', false, 'error', 'invalid_label');
  end if;
  if char_length(coalesce(v_desc, '')) > 500 or coalesce(p ->> 'sort', '0') !~ '^-?[0-9]{1,6}$'
     or (p ? 'in_add_form' and jsonb_typeof(p -> 'in_add_form') <> 'boolean') or (p ? 'in_detail' and jsonb_typeof(p -> 'in_detail') <> 'boolean') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if p_id is not null and v_type <> v_old.type and app.crm_field_in_use(v_entity, v_key) then
    return jsonb_build_object('ok', false, 'error', 'type_in_use');
  end if;

  -- the choices: unique keys and labels of reasonable length, as many as the rule allows
  if v_type in ('single_option', 'multiple_options', 'autocomplete') then
    v_options := coalesce(p -> 'options', case when p_id is not null then v_old.options end, '[]'::jsonb);
    if jsonb_typeof(v_options) <> 'array' or exists (
        select 1 from jsonb_array_elements(v_options) o
        where jsonb_typeof(o) <> 'object' or coalesce(o ->> 'key', '') !~ '^[a-z0-9_-]{1,40}$'
          or char_length(btrim(coalesce(o ->> 'label', ''))) not between 1 and 200
          or exists (select 1 from jsonb_object_keys(o) k where k not in ('key', 'label')))
       or (select count(distinct o ->> 'key') from jsonb_array_elements(v_options) o) <> jsonb_array_length(v_options) then
      return jsonb_build_object('ok', false, 'error', 'invalid_options');
    end if;
    if v_type <> 'autocomplete' and jsonb_array_length(v_options) = 0 then
      return jsonb_build_object('ok', false, 'error', 'invalid_options');
    end if;
    v_max := app.crm_limit('limit_field_options');
    if v_max is not null and jsonb_array_length(v_options) > v_max then
      return jsonb_build_object('ok', false, 'error', 'too_many', 'setting', 'limit_field_options', 'limit', v_max);
    end if;
    v_options := coalesce((select jsonb_agg(jsonb_build_object('key', o ->> 'key', 'label', btrim(o ->> 'label')) order by ord)
                           from jsonb_array_elements(v_options) with ordinality x(o, ord)), '[]'::jsonb);
    if p_id is not null and v_old.type in ('single_option', 'multiple_options') and app.crm_options_in_use(v_entity, v_key,
         array(select o ->> 'key' from jsonb_array_elements(v_old.options) o
               where not exists (select 1 from jsonb_array_elements(v_options) n where n ->> 'key' = o ->> 'key'))) then
      return jsonb_build_object('ok', false, 'error', 'option_in_use');
    end if;
  end if;

  -- the formula, compiled once; a formula field is computed, never typed in
  if v_formula is not null then
    if v_type not in ('number', 'monetary') then
      return jsonb_build_object('ok', false, 'error', 'formula_type');
    end if;
    v_comp := app.crm_formula_compile(v_entity, v_key, v_formula);
    if not (v_comp ->> 'ok')::boolean then
      return v_comp;
    end if;
    v_rpn := v_comp -> 'rpn';
  end if;
  -- a field another formula reads stays numeric
  if p_id is not null and v_type not in ('number', 'monetary') and exists (
      select 1 from app.crm_fields x, jsonb_array_elements(x.formula_rpn) t
      where x.entity = v_entity and x.archived_at is null and x.id <> p_id and t ->> 'f' = v_key) then
    return jsonb_build_object('ok', false, 'error', 'used_by_formula');
  end if;

  if v_importance not in ('none', 'important', 'required') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if v_stage is not null and (v_entity <> 'company' or not exists (select 1 from app.crm_stages s where s.key = v_stage)) then
    return jsonb_build_object('ok', false, 'error', 'invalid_stage');
  end if;
  if nullif(p ->> 'group_id', '') is not null then
    if p ->> 'group_id' !~ uuid_re or not exists (select 1 from app.crm_field_groups g where g.id = (p ->> 'group_id')::uuid
                                                  and g.entity = v_entity and g.archived_at is null) then
      return jsonb_build_object('ok', false, 'error', 'invalid_group');
    end if;
    v_group := (p ->> 'group_id')::uuid;
  end if;
  -- who may not see, or not change, the field: permission sets
  if (p ? 'hidden_sets' and jsonb_typeof(p -> 'hidden_sets') <> 'array') or (p ? 'read_only_sets' and jsonb_typeof(p -> 'read_only_sets') <> 'array')
     or exists (select 1 from jsonb_array_elements_text(coalesce(p -> 'hidden_sets', '[]') || coalesce(p -> 'read_only_sets', '[]')) x
                where x !~ uuid_re or not exists (select 1 from app.crm_permission_sets s where s.id = x::uuid)) then
    return jsonb_build_object('ok', false, 'error', 'invalid_sets');
  end if;
  v_hidden := case when p ? 'hidden_sets' then array(select distinct x::uuid from jsonb_array_elements_text(p -> 'hidden_sets') x)
                   else coalesce(v_old.hidden_sets, '{}') end;
  v_ro := case when p ? 'read_only_sets' then array(select distinct x::uuid from jsonb_array_elements_text(p -> 'read_only_sets') x
                                                    where not (x::uuid = any (v_hidden)))
               else coalesce(v_old.read_only_sets, '{}') end;

  if p_id is null then
    insert into app.crm_fields (entity, key, label, description, type, group_id, sort, options, importance, required_from_stage,
                                in_add_form, in_detail, formula, formula_rpn, hidden_sets, read_only_sets, updated_by)
    values (v_entity, v_key, v_label, v_desc, v_type, v_group, coalesce(nullif(p ->> 'sort', '')::int, 0), v_options, v_importance, v_stage,
            coalesce((p ->> 'in_add_form')::boolean, false), coalesce((p ->> 'in_detail')::boolean, true), v_formula, v_rpn,
            v_hidden, v_ro, auth.uid())
    returning * into v_f;
    v_recompute := v_formula is not null;
  else
    update app.crm_fields set label = v_label, description = v_desc, type = v_type, group_id = v_group,
      sort = coalesce(nullif(p ->> 'sort', '')::int, sort), options = v_options, importance = v_importance, required_from_stage = v_stage,
      in_add_form = coalesce((p ->> 'in_add_form')::boolean, in_add_form), in_detail = coalesce((p ->> 'in_detail')::boolean, in_detail),
      formula = v_formula, formula_rpn = v_rpn, hidden_sets = v_hidden, read_only_sets = v_ro,
      version = version + 1, updated_at = now(), updated_by = auth.uid()
    where id = p_id returning * into v_f;
    v_recompute := v_f.formula is distinct from v_old.formula and v_f.archived_at is null;
  end if;
  insert into app.crm_field_versions (field_id, version, definition, changed_by)
  values (v_f.id, v_f.version, to_jsonb(v_f) - 'formula_rpn' - 'product_id', auth.uid());
  if v_recompute then
    perform app.crm_formulas_recompute(v_entity);
  end if;
  perform app.admin_log('crm.field_save', null, 'crm_field', v_f.id::text, nullif(btrim(coalesce(p_reason, '')), ''),
    jsonb_build_object('entity', v_entity, 'key', v_key, 'type', v_type, 'version', v_f.version));
  return jsonb_build_object('ok', true, 'id', v_f.id, 'version', v_f.version);
end $$;

-- Archive a field (its values stay, out of sight) or bring it back. A field a live formula reads is not archived.
create function public.admin_crm_field_archive(p_id uuid, p_archived boolean, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_f app.crm_fields;
  v_max int := app.crm_limit('limit_custom_fields');
begin
  if not app.crm_can('global.settings') then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not app.crm_reason_ok(p_reason) then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'setting', 'typed_reason');
  end if;
  select * into v_f from app.crm_fields where id = p_id for update;
  if v_f.id is null or p_archived is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_archived = (v_f.archived_at is not null) then
    return jsonb_build_object('ok', true, 'id', v_f.id, 'version', v_f.version);
  end if;
  if p_archived and exists (select 1 from app.crm_fields x, jsonb_array_elements(x.formula_rpn) t
                            where x.entity = v_f.entity and x.archived_at is null and x.id <> v_f.id and t ->> 'f' = v_f.key) then
    return jsonb_build_object('ok', false, 'error', 'used_by_formula');
  end if;
  if not p_archived then
    if v_max is not null and (select count(*) from app.crm_fields x where x.archived_at is null) >= v_max then
      return jsonb_build_object('ok', false, 'error', 'too_many', 'setting', 'limit_custom_fields', 'limit', v_max);
    end if;
    -- a formula comes back only while what it reads is still there
    if v_f.formula is not null and not (app.crm_formula_compile(v_f.entity, v_f.key, v_f.formula) ->> 'ok')::boolean then
      return jsonb_build_object('ok', false, 'error', 'formula_ref');
    end if;
  end if;
  update app.crm_fields set archived_at = case when p_archived then now() end, version = version + 1, updated_at = now(), updated_by = auth.uid()
  where id = p_id returning * into v_f;
  insert into app.crm_field_versions (field_id, version, definition, changed_by)
  values (v_f.id, v_f.version, to_jsonb(v_f) - 'formula_rpn' - 'product_id', auth.uid());
  if v_f.formula is not null and not p_archived then
    perform app.crm_formulas_recompute(v_f.entity);
  end if;
  perform app.admin_log(case when p_archived then 'crm.field_archive' else 'crm.field_unarchive' end, null, 'crm_field', v_f.id::text,
    nullif(btrim(coalesce(p_reason, '')), ''), jsonb_build_object('entity', v_f.entity, 'key', v_f.key, 'version', v_f.version));
  return jsonb_build_object('ok', true, 'id', v_f.id, 'version', v_f.version);
end $$;

-- Add a group of fields (no id), or rename and re-sort one
create function public.admin_crm_field_group_save(p_id uuid, p_entity text, p_name text, p_sort int default 0, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid := p_id;
  v_entity text := p_entity;
begin
  if not app.crm_can('global.settings') then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not app.crm_reason_ok(p_reason) then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'setting', 'typed_reason');
  end if;
  if char_length(v_name) not between 1 and 80 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  if p_id is not null then
    select g.entity into v_entity from app.crm_field_groups g where g.id = p_id;
    if v_entity is null then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
  elsif coalesce(v_entity, '') not in ('company', 'contact') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if exists (select 1 from app.crm_field_groups g where g.entity = v_entity and lower(g.name) = lower(v_name) and g.id is distinct from p_id) then
    return jsonb_build_object('ok', false, 'error', 'exists');
  end if;
  if p_id is null then
    insert into app.crm_field_groups (entity, name, sort) values (v_entity, v_name, coalesce(p_sort, 0)) returning id into v_id;
  else
    update app.crm_field_groups set name = v_name, sort = coalesce(p_sort, sort) where id = p_id;
  end if;
  perform app.admin_log('crm.field_group_save', null, 'crm_field_group', v_id::text, nullif(btrim(coalesce(p_reason, '')), ''),
    jsonb_build_object('entity', v_entity, 'name', v_name));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Archive a group no live field sits in, or bring it back
create function public.admin_crm_field_group_archive(p_id uuid, p_archived boolean, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
begin
  if not app.crm_can('global.settings') then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not app.crm_reason_ok(p_reason) then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'setting', 'typed_reason');
  end if;
  select g.name into v_name from app.crm_field_groups g where g.id = p_id;
  if v_name is null or p_archived is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_archived and exists (select 1 from app.crm_fields f where f.group_id = p_id and f.archived_at is null) then
    return jsonb_build_object('ok', false, 'error', 'group_in_use');
  end if;
  update app.crm_field_groups set archived_at = case when p_archived then now() end where id = p_id;
  perform app.admin_log(case when p_archived then 'crm.field_group_archive' else 'crm.field_group_unarchive' end, null, 'crm_field_group',
    p_id::text, nullif(btrim(coalesce(p_reason, '')), ''), jsonb_build_object('name', v_name));
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.admin_crm_fields(text), public.admin_crm_field_save(uuid, jsonb, text), public.admin_crm_field_archive(uuid, boolean, text),
  public.admin_crm_field_group_save(uuid, text, text, int, text), public.admin_crm_field_group_archive(uuid, boolean, text) from public, anon;
grant execute on function public.admin_crm_fields(text), public.admin_crm_field_save(uuid, jsonb, text), public.admin_crm_field_archive(uuid, boolean, text),
  public.admin_crm_field_group_save(uuid, text, text, int, text), public.admin_crm_field_group_archive(uuid, boolean, text) to authenticated;

-- The companies list, now also by custom field conditions (CUS-01: a new field is a filter without a deploy). The
-- added argument has a default, so a caller that sends the first three is answered as before.
drop function public.admin_crm_companies(text, text, uuid);
create function public.admin_crm_companies(p_q text default null, p_stage text default null, p_owner uuid default null, p_custom jsonb default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_q text := nullif(lower(btrim(coalesce(p_q, ''))), '');
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  -- 0197: conditions name live fields the caller may see, with an operator their type has
  if p_custom is not null and (not app.crm_conditions_ok('company', p_custom) or not app.crm_conditions_visible('company', p_custom)) then
    return jsonb_build_object('ok', false, 'error', 'invalid_filter');
  end if;
  perform app.crm_sync();
  perform app.admin_log('crm.companies', null, null, null, null, case when p_custom is not null then jsonb_build_object('conditions', jsonb_array_length(p_custom)) end);
  return jsonb_build_object('ok', true,
    -- 0196: what the set allows, for the screen
    'may', app.crm_may('deals'),
    'stages', (select coalesce(jsonb_object_agg(x.stage, x.n), '{}') from (select stage, count(*) n from app.crm_companies where deleted_at is null and app.crm_visible(owner_id, visibility) group by stage) x),
    'tasks_due', (select count(*) from app.crm_activities a where a.deleted_at is null and app.crm_visible_company(a.company_id) and a.kind = 'task' and a.done_at is null and a.due_at <= current_date),
    'rows', (select coalesce(jsonb_agg(app.crm_company_json(co) order by co.next_step_at nulls last, co.updated_at desc), '[]') from (
        select co.* from app.crm_companies co
        -- 0195: a deleted company is in the restore list, not here
        where co.deleted_at is null and app.crm_visible(co.owner_id, co.visibility) and (v_q is null or lower(co.name) like '%' || v_q || '%' or co.org_number = v_q or v_q = any (co.tags))
          and (p_stage is null or co.stage = p_stage)
          and (p_owner is null or co.owner_id = p_owner)
          and (p_custom is null or app.crm_custom_match('company', co.custom, p_custom))
        order by co.next_step_at nulls last, co.updated_at desc limit app.crm_limit('limit_company_read')) co),
    -- 0192: the list's cap is a setting (null: every company); the page says when it is reached
    'limit', app.crm_limit('limit_company_read'));
end $$;
revoke all on function public.admin_crm_companies(text, text, uuid, jsonb) from public, anon;
grant execute on function public.admin_crm_companies(text, text, uuid, jsonb) to authenticated;

-- ------------------------------------------------------------------------------------------ the existing calls
-- Each function below now reads or writes custom values through the registry
CREATE OR REPLACE FUNCTION app.crm_track()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    -- 0195: into and out of the restore list
    if v_old ->> 'deleted_at' is null and v_new ->> 'deleted_at' is not null then
      insert into app.crm_events (name, entity, record_id, actor, source) values (v_entity || '.deleted', v_entity, v_id, v_actor, v_source);
    elsif v_old ->> 'deleted_at' is not null and v_new ->> 'deleted_at' is null then
      insert into app.crm_events (name, entity, record_id, actor, source) values (v_entity || '.restored', v_entity, v_id, v_actor, v_source);
    end if;
    select array_agg(n.key order by n.key) into v_fields from jsonb_each(v_new) n
    where not (n.key = any (app.crm_untracked())) and n.value is distinct from v_old -> n.key;
    -- 0197: each custom value is a field of its own in the history and the event (custom.<key>)
    if 'custom' = any (v_fields) then
      v_fields := array_remove(v_fields, 'custom') || coalesce((
        select array_agg('custom.' || k order by k) from (
          select jsonb_object_keys(coalesce(v_old -> 'custom', '{}'::jsonb)) as k
          union select jsonb_object_keys(coalesce(v_new -> 'custom', '{}'::jsonb))) keys
        where (v_old -> 'custom' -> k) is distinct from (v_new -> 'custom' -> k)), '{}');
      if cardinality(v_fields) = 0 then
        v_fields := null;
      end if;
    end if;
    if v_fields is null then
      return null;
    end if;
    insert into app.crm_changes (entity, record_id, field, old_value, new_value, actor, source)
    select v_entity, v_id, f,
           case when f like 'custom.%' then v_old -> 'custom' -> substr(f, 8) else v_old -> f end,
           case when f like 'custom.%' then v_new -> 'custom' -> substr(f, 8) else v_new -> f end,
           v_actor, v_source from unnest(v_fields) f;
    insert into app.crm_events (name, entity, record_id, actor, source, fields) values (v_entity || '.updated', v_entity, v_id, v_actor, v_source, v_fields);
    if v_entity = 'company' and 'stage' = any (v_fields) then
      insert into app.crm_events (name, entity, record_id, actor, source, fields) values ('company.stage_changed', v_entity, v_id, v_actor, v_source, array['stage']);
    end if;
    if v_entity = 'activity' and 'done_at' = any (v_fields) and v_old ->> 'done_at' is null then
      insert into app.crm_events (name, entity, record_id, actor, source, fields) values ('activity.completed', v_entity, v_id, v_actor, v_source, array['done_at']);
    end if;
  else
    -- the record is gone for good: its history goes with it (an erased contact leaves no old values behind);
    -- the event names only the record and the kind of change. 0195: a delete is a move to the restore list
    -- (an update, above), so the row leaving the table is the purge
    delete from app.crm_changes where entity = v_entity and record_id = v_id;
    insert into app.crm_events (name, entity, record_id, actor, source) values (v_entity || '.purged', v_entity, v_id, v_actor, v_source);
  end if;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION app.crm_company_json(co app.crm_companies)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select to_jsonb(co) - 'product_id' || jsonb_build_object(
    -- 0197: the custom values the viewer may see, and the names behind their references
    'custom', app.crm_custom_out('company', co.custom), 'custom_refs', app.crm_custom_refs('company', co.custom),
    'owner_email', (select u.email::text from auth.users u where u.id = co.owner_id),
    'contacts', (select count(*) from app.crm_contacts c where c.company_id = co.id and c.deleted_at is null),
    'open_tasks', (select count(*) from app.crm_activities a where a.company_id = co.id and a.deleted_at is null and a.kind = 'task' and a.done_at is null),
    'contact_name', coalesce(
      (select coalesce(nullif(btrim(c.name), ''), c.email) from app.crm_contacts c where c.company_id = co.id and c.deleted_at is null order by c.created_at limit 1),
      co.manager_name))
$function$;

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
    -- 0197: the custom values the viewer may see, and the names behind their references
    'custom', app.crm_custom_out('contact', c.custom), 'custom_refs', app.crm_custom_refs('contact', c.custom),
    'lists', (select coalesce(jsonb_agg(l.key order by l.sort), '[]') from app.crm_list_members m join app.crm_lists l on l.id = m.list_id
              where m.contact_id = c.id and m.status = 'subscribed'))
  from (select 1) one
  left join app.organizations o on o.id = c.org_id
  -- 0195: a deleted company is not named
  left join app.crm_companies co on co.id = c.company_id and co.deleted_at is null and app.crm_visible(co.owner_id, co.visibility)
$function$;

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
  v_custom jsonb;
  v_missing text[];
begin
  if not (app.crm_can(case when p_id is null then 'deals.create' else 'deals.edit' end)) then
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

  -- 0196: who sees the company (SEC-08), changed only where the set allows it
  if p ? 'visibility' then
    if coalesce(p->>'visibility', '') not in ('owner', 'group', 'group_tree', 'everyone') then
      return jsonb_build_object('ok', false, 'error', 'invalid');
    end if;
    if not app.crm_can('deals.visibility') then
      return jsonb_build_object('ok', false, 'error', 'not_allowed');
    end if;
  end if;

  if v_id is null then
    if not p ? 'name' then
      return jsonb_build_object('ok', false, 'error', 'invalid_name');
    end if;
    if v_orgnr is not null and exists (select 1 from app.crm_companies c where c.product_id = 'orgpuls' and c.org_number = v_orgnr) then
      -- 0195: a deleted company keeps its organisation number; the form points to the restore list
      return jsonb_build_object('ok', false, 'error', case when exists (select 1 from app.crm_companies c where c.product_id = 'orgpuls'
        and c.org_number = v_orgnr and c.deleted_at is not null) then 'exists_deleted' else 'exists' end);
    end if;
    -- 0197: custom values through the registry; required fields from the stage it starts at (CUS-02)
    v_custom := app.crm_custom_in('company', '{}'::jsonb, p -> 'custom');
    if not (v_custom ->> 'ok')::boolean then
      return v_custom;
    end if;
    v_missing := app.crm_custom_missing('company', v_custom -> 'custom', coalesce(v_stage, 'new'));
    if cardinality(v_missing) > 0 then
      return jsonb_build_object('ok', false, 'error', 'required_fields', 'fields', to_jsonb(v_missing));
    end if;
    insert into app.crm_companies (org_number, name, nace_code, employees, municipality, website, phone, source, stage, owner_id,
                                   next_step, next_step_at, tags, value_nok, visibility, custom)
    values (v_orgnr, btrim(p->>'name'), case when p->>'nace_code' ~ '^[0-9]{2}(\.[0-9]{1,3})?$' then p->>'nace_code' end,
            case when p->>'employees' ~ '^[0-9]{1,7}$' then (p->>'employees')::int end, nullif(left(btrim(coalesce(p->>'municipality', '')), 80), ''),
            nullif(left(btrim(coalesce(p->>'website', '')), 300), ''), nullif(left(btrim(coalesce(p->>'phone', '')), 40), ''),
            'manual', coalesce(v_stage, 'new'), nullif(p->>'owner_id', '')::uuid,
            nullif(left(btrim(coalesce(p->>'next_step', '')), 300), ''), nullif(p->>'next_step_at', '')::date, coalesce(v_tags, '{}'),
            nullif(p->>'value_nok', '')::int, coalesce(nullif(p->>'visibility', ''), app.crm_default_visibility()), v_custom -> 'custom')
    returning id into v_id;
    perform app.crm_log(v_id, null, 'stage', 'Opprettet: ' || coalesce(v_stage, 'new'));
    perform app.admin_log('crm.company_create', null, 'crm_company', v_id::text);
    return jsonb_build_object('ok', true, 'id', v_id);
  end if;

  select * into v_old from app.crm_companies where id = v_id;
  if v_old.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  -- 0196: a company outside the editor's visibility does not exist for them
  if not app.crm_visible(v_old.owner_id, v_old.visibility) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_old.deleted_at is not null then
    return jsonb_build_object('ok', false, 'error', 'deleted');
  end if;
  -- 0194: a form sends the version it was opened at; a newer one means someone else saved meanwhile
  if nullif(p->>'version', '') is not null and (p->>'version' !~ '^[0-9]{1,9}$' or (p->>'version')::int <> v_old.version) then
    return jsonb_build_object('ok', false, 'error', 'stale', 'version', v_old.version);
  end if;
  if v_stage is not null and v_old.org_id is not null then
    return jsonb_build_object('ok', false, 'error', 'stage_follows_plan');
  end if;
  -- 0197: custom values through the registry; required fields at the stage it ends at (CUS-02)
  v_custom := app.crm_custom_in('company', v_old.custom, p -> 'custom');
  if not (v_custom ->> 'ok')::boolean then
    return v_custom;
  end if;
  v_missing := app.crm_custom_missing('company', v_custom -> 'custom', coalesce(v_stage, v_old.stage));
  if cardinality(v_missing) > 0 then
    return jsonb_build_object('ok', false, 'error', 'required_fields', 'fields', to_jsonb(v_missing));
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
    visibility = case when p ? 'visibility' then p->>'visibility' else c.visibility end,
    custom = v_custom -> 'custom',
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
  v_custom jsonb;
  v_missing text[];
begin
  if not (app.crm_can(case when p_id is null then 'contacts.create' else 'contacts.edit' end)) then
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
  if nullif(p->>'company_id', '') is not null and not exists (select 1 from app.crm_companies co where co.id = (p->>'company_id')::uuid and app.crm_visible(co.owner_id, co.visibility)) then
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
      -- 0195: a deleted contact keeps its address; the form points to the restore list
      return jsonb_build_object('ok', false, 'error', case when exists (select 1 from app.crm_contacts c where c.product_id = 'orgpuls'
        and c.email = v_email and c.deleted_at is not null) then 'exists_deleted' else 'exists' end);
    end if;
    -- 0197: custom values through the registry; required fields (CUS-02)
    v_custom := app.crm_custom_in('contact', '{}'::jsonb, p -> 'custom');
    if not (v_custom ->> 'ok')::boolean then
      return v_custom;
    end if;
    v_missing := app.crm_custom_missing('contact', v_custom -> 'custom', null);
    if cardinality(v_missing) > 0 then
      return jsonb_build_object('ok', false, 'error', 'required_fields', 'fields', to_jsonb(v_missing));
    end if;
    insert into app.crm_contacts (email, name, company, org_number, role, source, basis, status, consent_at, consent_source, tags, lang, company_id, custom)
    values (v_email, nullif(left(btrim(coalesce(p->>'name', '')), 120), ''), nullif(left(btrim(coalesce(p->>'company', '')), 200), ''),
            nullif(regexp_replace(coalesce(p->>'org_number', ''), '\s', '', 'g'), ''), nullif(p->>'role', ''),
            case when p->>'source' = 'event' then 'event' else 'manual' end,
            -- without a consent source the contact has no basis, so no campaign mails it (app.crm_mailable)
            case when v_source is not null then 'consent' else 'none' end, 'active', v_consent_at,
            v_source, coalesce(v_tags, '{}'), case when p->>'lang' = 'en' then 'en' else 'no' end,
            nullif(p->>'company_id', '')::uuid, v_custom -> 'custom')
    returning id into v_id;
    perform app.admin_log('crm.contact_create', null, 'crm_contact', v_id::text, null, jsonb_build_object('consent_source', v_source));
  else
    if exists (select 1 from app.crm_contacts c where c.id = v_id and c.deleted_at is not null) then
      return jsonb_build_object('ok', false, 'error', 'deleted');
    end if;
    -- 0194: a form sends the version it was opened at; a newer one means someone else saved meanwhile
    if nullif(p->>'version', '') is not null and (p->>'version' !~ '^[0-9]{1,9}$'
        or not exists (select 1 from app.crm_contacts c where c.id = v_id and c.version = (p->>'version')::int)) then
      return jsonb_build_object('ok', false, 'error', case when exists (select 1 from app.crm_contacts c where c.id = v_id) then 'stale' else 'not_found' end);
    end if;
    -- 0197: custom values through the registry; required fields (CUS-02)
    v_custom := app.crm_custom_in('contact', (select c.custom from app.crm_contacts c where c.id = v_id), p -> 'custom');
    if not (v_custom ->> 'ok')::boolean then
      return v_custom;
    end if;
    v_missing := app.crm_custom_missing('contact', v_custom -> 'custom', null);
    if cardinality(v_missing) > 0 then
      return jsonb_build_object('ok', false, 'error', 'required_fields', 'fields', to_jsonb(v_missing));
    end if;
    update app.crm_contacts c set
      custom = v_custom -> 'custom',
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
    perform app.admin_log('crm.contact_update', null, 'crm_contact', v_id::text, null, (p - 'email' - 'consent_source' - 'consent_at' - 'custom')
      || case when jsonb_typeof(p -> 'custom') = 'object' then jsonb_build_object('custom', (select coalesce(jsonb_agg(k order by k), '[]'::jsonb)
                                                                                             from jsonb_object_keys(p -> 'custom') k)) else '{}'::jsonb end);
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
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
  v_blocked int := 0;
  v_max int := app.crm_limit('limit_bulk_move');
begin
  if not (app.crm_can('deals.edit') and (coalesce(cardinality(p_ids), 0) <= 1 or app.crm_can('deals.bulk_edit'))) then
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
    if v_co.id is null or v_co.org_id is not null or v_co.deleted_at is not null or not app.crm_visible(v_co.owner_id, v_co.visibility) then
      v_skipped := v_skipped + 1; continue;
    end if;
    v_to := coalesce(p_to, (
      select n.key from app.crm_stages cur, app.crm_stages n
      where cur.key = v_co.stage and cur.kind = 'open' and n.kind = 'open' and not n.managed and n.archived_at is null and n.sort > cur.sort
      order by n.sort limit 1));
    if v_to is null or v_to = v_co.stage then
      v_skipped := v_skipped + 1; continue;
    end if;
    -- 0197: a deal does not move to a stage whose required fields are empty (CUS-02)
    if cardinality(app.crm_custom_missing('company', v_co.custom, v_to)) > 0 then
      v_skipped := v_skipped + 1; v_blocked := v_blocked + 1; continue;
    end if;
    update app.crm_companies set stage = v_to, stage_changed_at = now(), updated_at = now() where id = v_id;
    perform app.crm_log(v_id, null, 'stage', v_co.stage || ' → ' || v_to);
    v_moved := v_moved + 1;
  end loop;
  perform app.admin_log('crm.stage_move', null, 'crm_company', null, null,
    jsonb_build_object('to', coalesce(p_to, 'next'), 'moved', v_moved, 'skipped', v_skipped, 'blocked', v_blocked));
  return jsonb_build_object('ok', true, 'moved', v_moved, 'skipped', v_skipped, 'blocked', v_blocked);
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
  v_ci jsonb;
  v_cur jsonb;
  v_warnings jsonb := '[]';
  v_unknown text[] := '{}';
begin
  perform set_config('app.consent_via', 'import', true);  -- 0141: the ledger records the method
  if not (app.crm_can('contacts.import')) then
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
    -- 0195: an address held by a deleted contact is restored from the restore list, not re-imported
    if exists (select 1 from app.crm_contacts c where c.product_id = 'orgpuls' and c.email = v_email and c.deleted_at is not null) then
      v_rejected := v_rejected || jsonb_build_object('row', i, 'reason', 'deleted'); continue;
    end if;
    if app.crm_suppressed(v_email) then v_suppressed := v_suppressed + 1; end if;
    -- 0197: columns that name a custom field, by key or label; an unknown column is reported once, a value that does
    -- not fit is reported and left out, and a required field left empty is reported, not enforced (CUS-02)
    v_ci := app.crm_custom_import('contact', r -> 'custom');
    v_unknown := array(select distinct x from unnest(v_unknown || array(select jsonb_array_elements_text(v_ci -> 'unknown'))) x order by 1);
    if jsonb_array_length(v_ci -> 'invalid') > 0 then
      v_warnings := v_warnings || jsonb_build_object('row', i, 'reason', 'invalid_field', 'fields', v_ci -> 'invalid');
    end if;
    insert into app.crm_contacts (email, name, company, org_number, role, source, basis, status, consent_at, consent_source, tags, lang, custom)
    values (v_email, nullif(left(btrim(coalesce(r->>'name', '')), 120), ''), nullif(left(btrim(coalesce(r->>'company', '')), 200), ''),
            case when regexp_replace(coalesce(r->>'org_number', ''), '\s', '', 'g') ~ '^[0-9]{9}$' then regexp_replace(r->>'org_number', '\s', '', 'g') end,
            nullif(r->>'role', ''), 'import', case when v_source is not null then 'consent' else 'none' end, 'active', v_at, v_source,
            coalesce(v_tags, '{}'), case when r->>'lang' = 'en' then 'en' else 'no' end, v_ci -> 'custom')
    on conflict (product_id, email) do nothing;
    if found then
      v_inserted := v_inserted + 1;
    else
      update app.crm_contacts c set
        name = coalesce(c.name, nullif(left(btrim(coalesce(r->>'name', '')), 120), '')),
        company = coalesce(c.company, nullif(left(btrim(coalesce(r->>'company', '')), 200), '')),
        role = coalesce(c.role, nullif(r->>'role', '')),
        tags = array(select distinct t from unnest(c.tags || coalesce(v_tags, '{}')) t),
        -- 0197: a value the contact already holds stays, as its name does
        custom = (v_ci -> 'custom') || c.custom,
        updated_at = now()
      where c.product_id = 'orgpuls' and c.email = v_email;
      v_updated := v_updated + 1;
    end if;
    select c.custom into v_cur from app.crm_contacts c where c.product_id = 'orgpuls' and c.email = v_email;
    if cardinality(app.crm_custom_missing('contact', v_cur, null)) > 0 then
      v_warnings := v_warnings || jsonb_build_object('row', i, 'reason', 'required_fields', 'fields', to_jsonb(app.crm_custom_missing('contact', v_cur, null)));
    end if;
  end loop;
  perform app.admin_log('crm.import', null, null, null, null,
    jsonb_build_object('rows', i, 'inserted', v_inserted, 'updated', v_updated, 'rejected', jsonb_array_length(v_rejected),
                       'warnings', jsonb_array_length(v_warnings)));
  return jsonb_build_object('ok', true, 'inserted', v_inserted, 'updated', v_updated, 'suppressed', v_suppressed, 'rejected', v_rejected,
    'warnings', v_warnings, 'unknown_columns', to_jsonb(v_unknown));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_history(p_entity text, p_record uuid, p_before bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- 0196: a record outside the viewer's visibility has no history for them
  if (p_entity = 'company' and not app.crm_visible_company(p_record))
     or (p_entity = 'activity' and not app.crm_visible_company((select a.company_id from app.crm_activities a where a.id = p_record))) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform app.admin_log('crm.history', null, 'crm_' || p_entity, p_record::text);
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'field', x.field, 'old', x.old_value, 'new', x.new_value,
                                               'by', u.email, 'source', x.source, 'at', x.at) order by x.id desc), '[]')
    into v_rows
  from (select * from app.crm_changes c where c.entity = p_entity and c.record_id = p_record and (p_before is null or c.id < p_before)
          -- 0197: a custom field the viewer may not see leaves no line for them
          and (c.field not like 'custom.%' or app.crm_custom_key_visible(p_entity, substr(c.field, 8)))
        order by c.id desc limit v_page) x
  left join auth.users u on u.id = x.actor;
  select exists (select 1 from app.crm_changes c where c.entity = p_entity and c.record_id = p_record and (c.field not like 'custom.%' or app.crm_custom_key_visible(p_entity, substr(c.field, 8)))
                 and c.id < coalesce((select min((r->>'id')::bigint) from jsonb_array_elements(v_rows) r), 0))
    into v_more;
  return jsonb_build_object('ok', true, 'changes', v_rows, 'more', v_more,
    -- 0197: the names behind the references on this page's custom lines, as the record's page names them (an
    -- organization the viewer cannot see, or a record that is gone, has none)
    'refs', (select coalesce(jsonb_object_agg(r.key, r.value), '{}'::jsonb)
             from jsonb_array_elements(v_rows) x
             cross join lateral (values (x -> 'old'), (x -> 'new')) t(val)
             cross join lateral jsonb_each(app.crm_custom_refs(p_entity, jsonb_build_object(substr(x ->> 'field', 8), t.val))) r
             where x ->> 'field' like 'custom.%' and jsonb_typeof(t.val) = 'string'),
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
end $function$;

CREATE OR REPLACE FUNCTION app.crm_filter_ok(f jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare k text;
begin
  if f is null or jsonb_typeof(f) <> 'object' then return false; end if;
  for k in select jsonb_object_keys(f) loop
    if k not in ('types', 'roles', 'sources', 'tags', 'lang', 'min_employees', 'max_employees', 'nace', 'no_survey_days',
                 'mailable_only', 'stages', 'lists', 'bases', 'custom') then
      return false;
    end if;
  end loop;
  if f ? 'types' and (jsonb_typeof(f->'types') <> 'array' or exists (select 1 from jsonb_array_elements_text(f->'types') v
      where v not in ('prospect', 'trial', 'customer', 'former'))) then return false; end if;
  if f ? 'roles' and (jsonb_typeof(f->'roles') <> 'array' or exists (select 1 from jsonb_array_elements_text(f->'roles') v
      where v not in ('daglig_leder', 'hr', 'leder', 'verneombud', 'annet'))) then return false; end if;
  if f ? 'sources' and (jsonb_typeof(f->'sources') <> 'array' or exists (select 1 from jsonb_array_elements_text(f->'sources') v
      where v not in ('user', 'newsletter', 'contact_form', 'import', 'manual', 'event', 'brreg'))) then return false; end if;
  -- 0093: a stage is one of the configured ones
  if f ? 'stages' and (jsonb_typeof(f->'stages') <> 'array' or exists (select 1 from jsonb_array_elements_text(f->'stages') v
      where v not in (select s.key from app.crm_stages s))) then return false; end if;
  if f ? 'bases' and (jsonb_typeof(f->'bases') <> 'array' or exists (select 1 from jsonb_array_elements_text(f->'bases') v
      where v not in ('consent', 'customer', 'business', 'none'))) then return false; end if;
  if f ? 'lists' and (jsonb_typeof(f->'lists') <> 'array' or exists (select 1 from jsonb_array_elements_text(f->'lists') v
      where v !~ '^[a-z0-9-]{2,40}$')) then return false; end if;
  if f ? 'tags' and (jsonb_typeof(f->'tags') <> 'array' or jsonb_array_length(f->'tags') > 20 or exists (
      select 1 from jsonb_array_elements_text(f->'tags') v where v !~ '^[a-z0-9æøå_-]{1,40}$')) then return false; end if;
  if f ? 'lang' and (f->>'lang') not in ('no', 'en') then return false; end if;
  if f ? 'nace' and (f->>'nace') !~ '^[0-9]{2}(\.[0-9]{1,3})?$' then return false; end if;
  if f ? 'min_employees' and (jsonb_typeof(f->'min_employees') <> 'number' or (f->>'min_employees')::numeric not between 0 and 100000) then return false; end if;
  if f ? 'max_employees' and (jsonb_typeof(f->'max_employees') <> 'number' or (f->>'max_employees')::numeric not between 0 and 100000) then return false; end if;
  if f ? 'no_survey_days' and (jsonb_typeof(f->'no_survey_days') <> 'number' or (f->>'no_survey_days')::numeric not between 1 and 3650) then return false; end if;
  if f ? 'mailable_only' and jsonb_typeof(f->'mailable_only') <> 'boolean' then return false; end if;
  -- 0197: conditions on the contacts' custom fields
  if f ? 'custom' and not app.crm_conditions_ok('contact', f->'custom') then return false; end if;
  return true;
end $function$;

CREATE OR REPLACE FUNCTION app.crm_segment_contacts(f jsonb)
 RETURNS SETOF app.crm_contacts
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select c.* from app.crm_contacts c
  left join app.organizations o on o.id = c.org_id
  left join app.crm_companies co on co.id = c.company_id and co.deleted_at is null
  -- 0195: a deleted contact is in no segment
  where c.deleted_at is null and app.crm_filter_ok(f)
    and (not f ? 'types' or app.crm_type(c.user_id, c.org_id, c.source) in (select jsonb_array_elements_text(f->'types')))
    and (not f ? 'roles' or c.role in (select jsonb_array_elements_text(f->'roles')))
    and (not f ? 'sources' or c.source in (select jsonb_array_elements_text(f->'sources')))
    and (not f ? 'bases' or c.basis in (select jsonb_array_elements_text(f->'bases')))
    and (not f ? 'stages' or co.stage in (select jsonb_array_elements_text(f->'stages')))
    and (not f ? 'lists' or exists (select 1 from app.crm_list_members m join app.crm_lists l on l.id = m.list_id
                                    where m.contact_id = c.id and m.status = 'subscribed'
                                      and l.key in (select jsonb_array_elements_text(f->'lists'))))
    and (not f ? 'tags' or c.tags && array(select jsonb_array_elements_text(f->'tags')))
    and (not f ? 'lang' or c.lang = f->>'lang')
    and (not f ? 'min_employees' or coalesce(o.employee_count, co.employees, 0) >= (f->>'min_employees')::numeric)
    and (not f ? 'max_employees' or coalesce(o.employee_count, co.employees, 0) <= (f->>'max_employees')::numeric)
    and (not f ? 'nace' or coalesce(o.registry_nace_code, co.nace_code) like (f->>'nace') || '%')
    and (not f ? 'no_survey_days' or (c.org_id is not null and not exists (
          select 1 from app.rounds r where r.org_id = c.org_id and r.status in ('apen', 'lukket')
            and r.opens_at > now() - make_interval(days => (f->>'no_survey_days')::int))))
    and (not coalesce((f->>'mailable_only')::boolean, false) or app.crm_mailable(c))
    -- 0197: conditions on the contacts' custom fields
    and (not f ? 'custom' or app.crm_custom_match('contact', c.custom, f->'custom'))
$function$;

CREATE OR REPLACE FUNCTION public.admin_crm_segment_save(p_id uuid, p_name text, p_filter jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid := p_id;
begin
  if not (app.crm_can(case when p_id is null then 'campaigns.create' else 'campaigns.edit' end)) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 120 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  if not app.crm_filter_ok(p_filter) then
    return jsonb_build_object('ok', false, 'error', 'invalid_filter');
  end if;
  -- 0197: a condition on a field hidden from the caller is not theirs to set, nor is a segment that holds one
  if not app.crm_conditions_visible('contact', p_filter -> 'custom') or (p_id is not null and not app.crm_conditions_visible('contact',
      (select g.filter -> 'custom' from app.crm_segments g where g.id = p_id))) then
    return jsonb_build_object('ok', false, 'error', 'unknown_field');
  end if;
  if exists (select 1 from app.crm_segments g where g.product_id = 'orgpuls' and g.name = btrim(p_name) and g.id is distinct from p_id) then
    return jsonb_build_object('ok', false, 'error', 'exists');
  end if;
  if v_id is null then
    insert into app.crm_segments (name, filter, created_by) values (btrim(p_name), p_filter, auth.uid()) returning id into v_id;
  else
    update app.crm_segments set name = btrim(p_name), filter = p_filter, updated_at = now() where id = v_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
  end if;
  perform app.admin_log('crm.segment_save', null, 'crm_segment', v_id::text, null, jsonb_build_object('name', btrim(p_name), 'filter', p_filter));
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_segment_preview(p_filter jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('crm.segment_preview');
  if not app.crm_filter_ok(p_filter) then
    return jsonb_build_object('ok', false, 'error', 'invalid_filter');
  end if;
  -- 0197: a condition on a field hidden from the caller is not theirs to set or to try
  if not app.crm_conditions_visible('contact', p_filter -> 'custom') then
    return jsonb_build_object('ok', false, 'error', 'unknown_field');
  end if;
  perform app.crm_sync();
  return jsonb_build_object('ok', true,
    'total', (select count(*) from app.crm_segment_contacts(p_filter)),
    'mailable', (select count(*) from app.crm_segment_contacts(p_filter) c where app.crm_mailable(c)),
    'sample', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'email', c.email, 'name', c.name,
                 'type', app.crm_type(c.user_id, c.org_id, c.source), 'mailable', app.crm_mailable(c))), '[]')
               from (select * from app.crm_segment_contacts(p_filter) limit 20) c));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_segments()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.crm_sync();
  perform app.admin_log('crm.segments');
  return jsonb_build_object('ok', true, 'rows', (
    -- 0197: a condition on a field hidden from the viewer is not shown; the segment says it holds one
    select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'filter', app.crm_filter_out(g.filter),
      'hidden_conditions', not app.crm_conditions_visible('contact', g.filter -> 'custom'), 'updated_at', g.updated_at,
      'total', (select count(*) from app.crm_segment_contacts(g.filter)),
      'mailable', (select count(*) from app.crm_segment_contacts(g.filter) c where app.crm_mailable(c))) order by g.name), '[]')
    from app.crm_segments g));
end $function$;
