-- 0089_module_variants.sql — a module asked in two variants: kunnskap og kontor (D-137, X-073).
--
-- Tor, 2026-09-27: "start på kunnskap og kontor". The handoff's module (bransje-kunnskap-og-
-- kontor.md, innstillinger-og-forside.md § 2) comes in two variants of one module:
--
--   * utvidet (KK-U): fifteen factors, 62 statements, three to five per factor; the
--     organisation picks at least eight factors, «Rettferdighet og karriere» off by default;
--   * forenklet (KK-F): eight factors of exactly three statements, all of them the 24 core
--     statements (`core_indicator`), which the extended set asks too whatever factors are
--     chosen, so the simplified index can always be computed and compared.
--
-- **How it is stored.** Every statement keeps one home factor, its extended one (module_items.
-- factor_id), so a module asked one way reads exactly as before. What is new is membership:
-- app.module_factor_items says which statements a factor is scored from. For a module without
-- variants it is the home factor's own statements (backfilled here); for kunnskap og kontor the
-- simplified factors F1–F8 are rows of their own whose members are core statements of several
-- extended factors. Every reader that scores or groups a factor now goes through membership.
--
--   question_modules.validation_status   provisional or validated, from the file (null: not said)
--   module_variants                      the two variants' rules: minimum factors, default off,
--                                        locked statements, count questions, minutes
--   module_factors.variant_key …         which variant a factor belongs to (null: asked one way),
--                                        its code, optional, extended only, evidence
--   module_factor_items                  a factor's statements
--   module_items.core_indicator …        the core flag, a help line under the statement, the
--                                        method record, and which variants ask a count question
--   org_modules.variant_key, factor_keys the organisation's choice of variant and factors
--   round_modules.variant_key, factor_keys  what a round asks; item_ids follow from them
--
-- **What the database guarantees.** A round's statements for a module in variants are derived,
-- never chosen: app.round_module_fill_variant computes item_ids from the variant and factors,
-- the core statements always among them, and refuses fewer extended factors than the minimum.
-- A client cannot write those columns. A factor's index is reported only where every one of its
-- statements was asked (a grunnlinje), so an extended factor switched off is not scored from its
-- one core statement. A count question's fourth answer («Jobber ikke fast hjemmefra») is kept out
-- of the share. Nothing here adds a column to an answer table or a read on one.

-- ---------------------------------------------------------------- the registry
alter table app.question_modules
  add column validation_status text check (validation_status in ('provisional', 'validated'));
comment on column app.question_modules.validation_status is
  'provisional: the risk bands are shown as «Foreløpig» until the module is validated (0089); null where the file does not say';

-- the one module already seeded whose file gives a status (barnehage og skole 1.0.0, published on
-- the hosted project): its content hash covers the status and is unchanged, so the seed script
-- leaves the row as it is. Set here, before module_frozen below counts the column as content.
update app.question_modules set validation_status = 'provisional'
where key = 'barnehage-og-skole' and version = '1.0.0'
  and content_hash = '7c3bfaf54c38ba8b14a035015b6963997388ed4c67fbc368d290161eafbfa815';

create table app.module_variants (
  module_id         uuid not null references app.question_modules (id) on delete cascade,
  key               text not null check (key in ('forenklet', 'utvidet')),
  code              text not null check (length(btrim(code)) > 0),
  version           text not null,
  name              text not null,
  estimated_minutes int  not null check (estimated_minutes between 1 and 30),
  factor_toggles    boolean not null default false,
  min_factors       int check (min_factors is null or min_factors >= 1),
  recommended       int[] check (recommended is null or cardinality(recommended) = 2),
  default_off       text[] not null default '{}',
  locked_items      text[] not null default '{}',
  count_items       text[] not null default '{}',
  segments          text[] not null default '{}',
  sort              int not null,
  primary key (module_id, key),
  check (key <> 'utvidet' or min_factors is not null)
);

alter table app.module_factors
  add column variant_key       text check (variant_key in ('forenklet', 'utvidet')),
  add column code              text,
  add column optional          boolean not null default false,
  add column extended_only     boolean not null default false,
  add column evidence_strength text,
  add column built_from        text[] not null default '{}';

alter table app.module_items
  add column help             jsonb check (help is null or (jsonb_typeof(help) = 'object' and length(btrim(help->>'nb')) > 0)),
  add column core_indicator   boolean not null default false,
  add column construct        text,
  add column source           text,
  add column improvement_note text,
  add column variant_keys     text[] check (variant_keys is null or variant_keys <@ array['forenklet', 'utvidet']);

-- statement codes run to five in an extended factor, and a count question may carry a fourth
-- answer that says it does not apply (0067's checks, widened)
do $do$
declare
  c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'app.module_items'::regclass and contype = 'c'
             and (pg_get_constraintdef(oid) like '%[1-3]$%' or pg_get_constraintdef(oid) like '%jsonb_array_length(options) = 3%')
  loop
    execute format('alter table app.module_items drop constraint %I', c.conname);
  end loop;
end $do$;
alter table app.module_items
  add constraint module_items_likert_shape check (kind <> 'likert5' or (code ~ '^[A-Z]{2}-[A-Z]{2}-[1-5]$' and report_scope = 'group' and options is null)),
  add constraint module_items_count_shape check (kind <> 'count' or (code ~ '^[A-Z]{2}-T-[0-9]+$' and report_scope = 'organisation_only'
                                                                     and jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 3 and 4)),
  add constraint module_items_core_likert check (not core_indicator or kind = 'likert5'),
  add constraint module_items_variants_count check (variant_keys is null or kind = 'count');

-- a factor's statements: its own for a module asked one way, the core statements of several
-- extended factors for a simplified one
create table app.module_factor_items (
  module_id uuid not null,
  factor_id uuid not null,
  item_id   uuid not null,
  sort      int  not null,
  primary key (factor_id, item_id),
  foreign key (module_id, factor_id) references app.module_factors (module_id, id) on delete cascade,
  foreign key (module_id, item_id) references app.module_items (module_id, id) on delete cascade
);
create index module_factor_items_item_idx on app.module_factor_items (item_id);
create index module_factor_items_module_idx on app.module_factor_items (module_id);

-- every module already seeded, published ones included, before the freeze below applies
insert into app.module_factor_items (module_id, factor_id, item_id, sort)
select i.module_id, i.factor_id, i.id, i.sort from app.module_items i where i.kind = 'likert5';

/** only statements are members of a factor */
create function app.module_factor_item_ok() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  if not exists (select 1 from app.module_items i where i.id = new.item_id and i.kind = 'likert5') then
    raise exception 'a factor is scored from statements only' using errcode = 'check_violation';
  end if;
  return new;
end $fn$;
revoke all on function app.module_factor_item_ok() from public, anon, authenticated;
create trigger module_factor_item_ok before insert or update on app.module_factor_items
  for each row execute function app.module_factor_item_ok();

create trigger module_variants_frozen before insert or update or delete on app.module_variants
  for each row execute function app.module_child_frozen();
create trigger module_factor_items_frozen before insert or update or delete on app.module_factor_items
  for each row execute function app.module_child_frozen();

alter table app.module_variants     enable row level security;
alter table app.module_factor_items enable row level security;
create policy module_variant_read on app.module_variants
  for select to anon, authenticated using (app.module_visible(module_id));
create policy module_factor_item_read on app.module_factor_items
  for select to anon, authenticated using (app.module_visible(module_id));
revoke all on app.module_variants, app.module_factor_items from anon, authenticated;
grant select on app.module_variants, app.module_factor_items to anon, authenticated;

-- the status is part of what a published version says, as its content (module_frozen, 0083)
create or replace function app.module_frozen() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'published module is immutable; create a new version' using errcode = 'restrict_violation';
    end if;
    return old;
  end if;
  if old.status = 'draft' then
    return new;
  end if;
  if (new.key, new.version, new.name, new.description, new.industry_key, new.estimated_minutes,
      new.scale, new.scoring, new.anonymity, new.relation_to_core, new.content_hash, new.published_at, new.created_at, new.i18n,
      new.wording, new.validation_status)
     is distinct from
     (old.key, old.version, old.name, old.description, old.industry_key, old.estimated_minutes,
      old.scale, old.scoring, old.anonymity, old.relation_to_core, old.content_hash, old.published_at, old.created_at, old.i18n,
      old.wording, old.validation_status)
     or (old.status = 'retired' and new.status is distinct from old.status)
     or (old.status = 'published' and new.status = 'draft') then
    raise exception 'published module is immutable; create a new version' using errcode = 'restrict_violation';
  end if;
  return new;
end $fn$;

-- a suggestion's re-measure statement, and a measure's, is one its factor is scored from (0067, 0071)
create or replace function app.module_action_item_ok() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  if not exists (select 1 from app.module_factor_items mi
                 where mi.item_id = new.remeasure_item_id and mi.factor_id = new.factor_id) then
    raise exception 're-measure item % is not a statement of factor %', new.remeasure_item_id, new.factor_id
      using errcode = 'check_violation';
  end if;
  return new;
end $fn$;

create or replace function app.measure_module_ok() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  if new.module_factor_id is not null and (tg_op = 'INSERT'
     or new.module_factor_id is distinct from old.module_factor_id
     or new.remeasure_item_id is distinct from old.remeasure_item_id) then
    if not exists (select 1 from app.module_factor_items mi
                   where mi.item_id = new.remeasure_item_id and mi.factor_id = new.module_factor_id) then
      raise exception 'the re-measure statement must be one of the module factor''s' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $fn$;

-- ---------------------------------------------------------------- count questions
-- «Jobber ikke fast hjemmefra»: said, and kept out of the share
alter table app.org_count_answers drop constraint org_count_answers_answer_check;
alter table app.org_count_answers add constraint org_count_answers_answer_check
  check (answer in ('ja', 'nei', 'vet_ikke', 'ikke_aktuelt'));

-- ---------------------------------------------------------------- the choice
alter table app.org_modules
  add column variant_key text check (variant_key in ('forenklet', 'utvidet')),
  add column factor_keys text[];
alter table app.round_modules
  add column variant_key text check (variant_key in ('forenklet', 'utvidet')),
  add column factor_keys text[];
comment on column app.round_modules.variant_key is
  'The variant a round asks a module in (0089); null for a module asked one way, and for a puls, which asks re-measure statements.';

/**
 * The statements a variant asks (0089): the simplified set is the core statements; the extended
 * set is the core statements and every statement of the chosen extended factors. For a module
 * asked one way, every statement.
 */
create function app.variant_item_ids(p_module uuid, p_variant text, p_factors text[]) returns uuid[]
  language sql stable security definer set search_path = ''
as $fn$
  select coalesce(array_agg(i.id order by i.sort), '{}')
  from app.module_items i
  where i.module_id = p_module and i.kind = 'likert5'
    and case p_variant
          when 'forenklet' then i.core_indicator
          when 'utvidet' then i.core_indicator
                              or exists (select 1 from app.module_factors f where f.id = i.factor_id and f.key = any (p_factors))
          else true
        end
$fn$;
revoke all on function app.variant_item_ids(uuid, text, text[]) from public, anon, authenticated;

/** The extended factors asked when none are chosen: all but the file's default off. */
create function app.default_extended_factors(p_module uuid) returns text[]
  language sql stable security definer set search_path = ''
as $fn$
  select coalesce(array_agg(f.key order by f.sort), '{}')
  from app.module_factors f
  join app.module_variants v on v.module_id = f.module_id and v.key = 'utvidet'
  where f.module_id = p_module and f.variant_key = 'utvidet' and not f.key = any (v.default_off)
$fn$;
revoke all on function app.default_extended_factors(uuid) from public, anon, authenticated;

/**
 * A round's module in variants takes the organisation's choice as it is put on the round, and its
 * statements follow from it while the round is planned. A puls asks the re-measure statements
 * it was given and no variant. Runs before round_module_ok, which judges the row as stored.
 */
create function app.round_module_fill_variant() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_key  text;
  v_om   app.org_modules%rowtype;
  v_min  int;
  v_puls boolean;
  v_open boolean;
begin
  if not exists (select 1 from app.module_variants v where v.module_id = new.module_id) then
    new.variant_key := null;
    new.factor_keys := null;
    return new;
  end if;
  select ms.kind = 'puls', r.status <> 'planlagt' into v_puls, v_open
  from app.rounds r join app.measurements ms on ms.id = r.measurement_id where r.id = new.round_id;
  if v_puls then
    new.variant_key := null;
    new.factor_keys := null;
    return new;
  end if;
  -- an opened round keeps what it asked (round_module_ok refuses any change there)
  if tg_op = 'UPDATE' and v_open then
    return new;
  end if;

  select m.key into v_key from app.question_modules m where m.id = new.module_id;
  select * into v_om from app.org_modules om where om.org_id = new.org_id and om.module_key = v_key;
  new.variant_key := coalesce(new.variant_key, v_om.variant_key, 'forenklet');
  if new.variant_key = 'utvidet' then
    new.factor_keys := array(
      select f.key from app.module_factors f
      where f.module_id = new.module_id and f.variant_key = 'utvidet'
        and f.key = any (coalesce(new.factor_keys, v_om.factor_keys, app.default_extended_factors(new.module_id)))
      order by f.sort);
    select v.min_factors into v_min from app.module_variants v where v.module_id = new.module_id and v.key = 'utvidet';
    if cardinality(new.factor_keys) < v_min then
      raise exception 'the extended set asks at least % factors', v_min using errcode = 'check_violation';
    end if;
  else
    new.factor_keys := null;
  end if;
  new.item_ids := app.variant_item_ids(new.module_id, new.variant_key, new.factor_keys);
  return new;
end $fn$;
revoke all on function app.round_module_fill_variant() from public, anon, authenticated;

create trigger round_module_fill_variant before insert or update on app.round_modules
  for each row execute function app.round_module_fill_variant();

/**
 * The organisation's variant and, for the extended set, its factors (null: the default). Daglig
 * leder, as for the module itself. Applied at once to the planned grunnlinjer that ask the
 * module; an open or closed round keeps what it asked.
 */
create function public.set_org_module_variant(p_org uuid, p_key text, p_variant text, p_factors text[] default null)
  returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_module uuid;
  v_min    int;
  v_n      int;
begin
  if p_org is null or not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('error', 'not_allowed');
  end if;
  if p_variant is null or p_variant not in ('forenklet', 'utvidet') then
    return jsonb_build_object('error', 'invalid');
  end if;
  v_module := app.latest_usable_module(p_key, p_org);
  if v_module is null or not exists (select 1 from app.module_variants v where v.module_id = v_module) then
    return jsonb_build_object('error', 'not_available');
  end if;
  if p_variant = 'utvidet' and p_factors is not null then
    if exists (select 1 from unnest(p_factors) k
               where not exists (select 1 from app.module_factors f
                                 where f.module_id = v_module and f.variant_key = 'utvidet' and f.key = k)) then
      return jsonb_build_object('error', 'invalid');
    end if;
    select v.min_factors into v_min from app.module_variants v where v.module_id = v_module and v.key = 'utvidet';
    if (select count(distinct k) from unnest(p_factors) k) < v_min then
      return jsonb_build_object('error', 'too_few', 'min', v_min);
    end if;
  end if;

  insert into app.org_modules (org_id, module_key, enabled, variant_key, factor_keys, updated_at, updated_by)
  values (p_org, p_key, false, p_variant, case when p_variant = 'utvidet' then p_factors end, now(), auth.uid())
  on conflict (org_id, module_key) do update
    set variant_key = excluded.variant_key, factor_keys = excluded.factor_keys,
        updated_at = excluded.updated_at, updated_by = excluded.updated_by;

  -- the planned grunnlinjer follow; the fill trigger derives their statements
  update app.round_modules rm
  set variant_key = p_variant,
      factor_keys = case when p_variant = 'utvidet' then coalesce(p_factors, app.default_extended_factors(rm.module_id)) end
  from app.rounds r, app.measurements ms, app.question_modules m
  where r.id = rm.round_id and ms.id = r.measurement_id and m.id = rm.module_id
    and rm.org_id = p_org and r.status = 'planlagt' and ms.kind = 'grunnlinje' and m.key = p_key
    and app.module_usable(rm.module_id, p_org);
  get diagnostics v_n = row_count;

  return jsonb_build_object('ok', true, 'variant', p_variant,
                            'factors', case when p_variant = 'utvidet' then to_jsonb(coalesce(p_factors, app.default_extended_factors(v_module))) end,
                            'planned_rounds', v_n);
end $fn$;
revoke all on function public.set_org_module_variant(uuid, text, text, text[]) from public, anon;
grant execute on function public.set_org_module_variant(uuid, text, text, text[]) to authenticated;

-- ---------------------------------------------------------------- seeding
-- as 0083, and: the status, each factor's statements in module_factor_items, the method record
-- and help line per statement, and a module in variants — its extended factors as `factors`,
-- the simplified ones from `variants[0]`, the rules of both in module_variants
create or replace function app.module_seed(p jsonb, p_hash text) returns text
  language plpgsql set search_path = ''
as $fn$
declare
  v_id     uuid;
  v_status app.module_status;
  v_hash   text;
  v_prefix text;
  tr       jsonb := p->'translations'->'en';
  v_var    boolean := p ? 'variants';
  v_tf     jsonb;
  f        jsonb;
  it       jsonb;
  a        jsonb;
  v        jsonb;
  v_code   text;
  v_fid    uuid;
  fi       int := 0;
  ii       int;
  ai       int;
begin
  select m.id, m.status, m.content_hash into v_id, v_status, v_hash
  from app.question_modules m where m.key = p->>'module_id' and m.version = p->>'version';

  if found and v_status <> 'draft' then
    if v_hash <> p_hash then
      raise exception '%@% is % with different content; publish a new version', p->>'module_id', p->>'version', v_status;
    end if;
    return 'unchanged';
  end if;
  if found and v_hash = p_hash then
    return 'unchanged';
  end if;
  if found then
    delete from app.question_modules where id = v_id;
  end if;

  insert into app.question_modules (key, version, name, description, industry_key, estimated_minutes,
                                    scale, scoring, anonymity, relation_to_core, content_hash, i18n, wording,
                                    validation_status)
  values (p->>'module_id', p->>'version', p->>'name', p->>'description', p->>'module_id',
          (p->>'estimated_minutes')::int, p->'scale', p->'scoring', p->'anonymity',
          coalesce(p->'relation_to_core', '{}'), p_hash,
          case when tr is null then '{}'::jsonb else jsonb_build_object('en', jsonb_strip_nulls(jsonb_build_object(
            'name', tr->'name', 'description', tr->'description', 'scale_labels', tr->'scale_labels',
            'covered_by_core_factors', tr->'covered_by_core_factors'))) end,
          case when p ? 'wording' then jsonb_build_object('default', p->'wording'->'default',
                                                          'auto_from_nace', p->'wording'->'auto_from_nace') end,
          p->>'validation_status')
  returning id into v_id;

  insert into app.module_sources (module_id, key, title, url, sort)
  select v_id, s->>'key', s->>'title', s->>'url', o::int
  from jsonb_array_elements(p->'sources') with ordinality as x(s, o);

  for f in select value from jsonb_array_elements(p->'factors') loop
    fi := fi + 1;
    v_tf := tr->'factors'->(f->>'id');
    insert into app.module_factors (module_id, key, name, summary, rationale, rationale_sources, legal_basis, sort, i18n,
                                    variant_key, code, optional, extended_only, evidence_strength)
    values (v_id, f->>'id', f->>'name', f->>'summary', f->>'rationale',
            array(select jsonb_array_elements_text(f->'rationale_sources')),
            array(select jsonb_array_elements_text(f->'legal_basis')), fi,
            (case when v_tf is null then '{}'::jsonb else jsonb_build_object('en', jsonb_build_object(
              'name', v_tf->'name', 'summary', v_tf->'summary', 'rationale', v_tf->'rationale', 'legal_basis', v_tf->'legal_basis')) end)
            -- a worded module's factor name, where it names the children (0083)
            || case when f ? 'name_variants' then jsonb_build_object(
                 'nb.barnehage', jsonb_build_object('name', f->'name_variants'->>'barnehage'),
                 'nb.skole', jsonb_build_object('name', f->'name_variants'->>'skole')) else '{}'::jsonb end,
            -- a module in variants: `factors` is the extended set
            case when v_var then 'utvidet' end, f->>'code',
            coalesce((f->>'optional')::boolean, false), coalesce((f->>'extended_only')::boolean, false),
            f->>'evidence_strength')
    returning id into v_fid;

    ii := 0;
    for it in select value from jsonb_array_elements(f->'items') loop
      ii := ii + 1;
      insert into app.module_items (module_id, factor_id, code, kind, text, reverse, pulse_eligible, report_scope, sort,
                                    help, core_indicator, construct, source, improvement_note)
      values (v_id, v_fid, it->>'id', 'likert5',
              jsonb_strip_nulls(jsonb_build_object('nb', it->>'text', 'en', v_tf->'items'->>(it->>'id'),
                                                   'nb.barnehage', it->'text_variants'->>'barnehage',
                                                   'nb.skole', it->'text_variants'->>'skole')),
              (it->>'reverse')::boolean, (it->>'pulse_eligible')::boolean, 'group', fi * 10 + ii,
              case when it ? 'help' then jsonb_build_object('nb', it->>'help') end,
              coalesce((it->>'core_indicator')::boolean, false), it->>'construct', it->>'source', it->>'improvement_note');
    end loop;

    insert into app.module_factor_items (module_id, factor_id, item_id, sort)
    select v_id, v_fid, i.id, i.sort from app.module_items i where i.factor_id = v_fid;

    ai := 0;
    for a in select value from jsonb_array_elements(f->'action_suggestions') loop
      ai := ai + 1;
      insert into app.module_action_suggestions (module_id, factor_id, type, title, description, remeasure_item_id, sort, i18n)
      select v_id, v_fid, a->>'type', a->>'title', a->>'description', i.id, ai,
             case when v_tf->'action_suggestions'->(ai - 1) is null then '{}'::jsonb
                  else jsonb_build_object('en', v_tf->'action_suggestions'->(ai - 1)) end
      from app.module_items i where i.module_id = v_id and i.code = a->>'remeasure_item';
      if not found then
        raise exception 'unknown re-measure item %', a->>'remeasure_item';
      end if;
    end loop;
  end loop;

  if v_var then
    -- the simplified factors: their own rows, scored from core statements of the extended ones
    for f in select value from jsonb_array_elements(p->'variants'->0->'factors') loop
      fi := fi + 1;
      insert into app.module_factors (module_id, key, name, summary, rationale, rationale_sources, legal_basis, sort,
                                      variant_key, code, built_from)
      values (v_id, f->>'id', f->>'name', f->>'summary', '', '{}', '{}', 100 + fi, 'forenklet', f->>'code',
              array(select jsonb_array_elements_text(f->'built_from')))
      returning id into v_fid;

      ii := 0;
      for v_code in select jsonb_array_elements_text(f->'items') loop
        ii := ii + 1;
        insert into app.module_factor_items (module_id, factor_id, item_id, sort)
        select v_id, v_fid, i.id, ii from app.module_items i
        where i.module_id = v_id and i.code = v_code and i.kind = 'likert5' and i.core_indicator;
        if not found then
          raise exception 'simplified factor % names % which is not a core statement', f->>'id', v_code;
        end if;
      end loop;

      ai := 0;
      for a in select value from jsonb_array_elements(f->'action_suggestions') loop
        ai := ai + 1;
        insert into app.module_action_suggestions (module_id, factor_id, type, title, description, remeasure_item_id, sort)
        select v_id, v_fid, a->>'type', a->>'title', a->>'description', i.id, ai
        from app.module_items i where i.module_id = v_id and i.code = a->>'remeasure_item';
        if not found then
          raise exception 'unknown re-measure item %', a->>'remeasure_item';
        end if;
      end loop;
    end loop;

    for v in select value from jsonb_array_elements(p->'variants') loop
      insert into app.module_variants (module_id, key, code, version, name, estimated_minutes, factor_toggles,
                                       min_factors, recommended, default_off, locked_items, count_items, segments, sort)
      values (v_id, v->>'key', v->>'code', v->>'version', v->>'name', (v->>'estimated_minutes')::int,
              coalesce((v->>'factor_toggles')::boolean, false), (v->>'min_factors')::int,
              case when v ? 'recommended_factors' then array(select jsonb_array_elements_text(v->'recommended_factors')::int) end,
              coalesce(array(select jsonb_array_elements_text(v->'default_off')), '{}'),
              coalesce(array(select jsonb_array_elements_text(v->'locked_items')), '{}'),
              coalesce(array(select jsonb_array_elements_text(v->'count_items')), '{}'),
              coalesce(array(select jsonb_array_elements_text(v->'segments')), '{}'),
              case v->>'key' when 'forenklet' then 1 else 2 end);
    end loop;
  end if;

  v_prefix := left(p->'factors'->0->'items'->0->>'id', 2);

  insert into app.module_items (module_id, code, kind, text, options, report_scope, sort, variant_keys)
  select v_id, c->>'id', 'count',
         jsonb_strip_nulls(jsonb_build_object('nb', c->>'text', 'en', tr->'count_items'->(c->>'id')->>'text',
                                              'nb.barnehage', c->'text_variants'->>'barnehage',
                                              'nb.skole', c->'text_variants'->>'skole')),
         (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('nb', o, 'en', tr->'count_items'->(c->>'id')->'options'->>(n::int - 1))) order by n)
          from jsonb_array_elements_text(c->'options') with ordinality as y(o, n)),
         'organisation_only', 1000 + o::int,
         case when c ? 'variants' then array(select jsonb_array_elements_text(c->'variants')) end
  from jsonb_array_elements(p->'count_items') with ordinality as x(c, o);

  insert into app.module_items (module_id, code, kind, text, options, report_scope, sort)
  select v_id, v_prefix || '-S-' || (s->>'id'), 'segment',
         jsonb_strip_nulls(jsonb_build_object('nb', s->>'text', 'en', tr->'segments'->(s->>'id')->>'text')),
         (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('nb', o, 'en', tr->'segments'->(s->>'id')->'options'->>(n::int - 1))) order by n)
          from jsonb_array_elements_text(s->'options') with ordinality as y(o, n)),
         'segment_filter', 2000 + o::int
  from jsonb_array_elements(p->'segments') with ordinality as x(s, o);

  return 'seeded';
end $fn$;

-- ---------------------------------------------------------------- the respondent
-- 0083's form, with a module in variants: the factor a statement is read under, its help line,
-- the count questions of the round's variant, and the minutes from what is asked
create or replace function public.respond_form(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_inv    app.invitations%rowtype;
  v_org    app.organizations%rowtype;
  v_round  app.rounds%rowtype;
  v_qs     jsonb;
  v_extra  jsonb;
  v_module jsonb;
begin
  if p_token is null or length(p_token) < 16 then
    return jsonb_build_object('error', 'invalid_token');
  end if;

  select * into v_inv from app.invitations i
  where i.token_hash = extensions.digest(p_token, 'sha256');

  if not found then
    return jsonb_build_object('error', 'invalid_token');
  end if;
  if v_inv.responded_at is not null then
    return jsonb_build_object('error', 'already_responded');
  end if;
  if v_inv.expires_at <= now() then
    return jsonb_build_object('error', 'expired');
  end if;

  select * into v_round from app.rounds r where r.id = v_inv.round_id;
  if v_round.status <> 'apen' then
    return jsonb_build_object('error', 'round_closed');
  end if;

  select * into v_org from app.organizations o where o.id = v_inv.org_id;

  -- shuffled per token, stable on reload
  select jsonb_agg(jsonb_build_object('factor', q.factor_key, 'ordinal', q.ordinal)
                   order by q.seed)
  into v_qs
  from (
    select rf.factor_key, s.ordinal,
           extensions.digest(p_token || rf.factor_key || s.ordinal::text, 'sha256') as seed
    from app.round_factors rf
    join app.statements s on s.factor_key = rf.factor_key
    where rf.round_id = v_round.id
  ) q;

  select jsonb_agg(jsonb_build_object(
           'key', x.extra_key, 'kind', q.kind,
           'options', (select count(*) from app.extra_options o where o.extra_key = x.extra_key))
         order by q.sort_order)
  into v_extra
  from app.round_extra_questions x
  join app.extra_questions q on q.key = x.extra_key
  where x.round_id = v_round.id;

  -- one module per round in practice; an array so a second would need no new shape
  select jsonb_agg(jsonb_build_object(
           'name', m.name,
           -- 0089: a module in variants takes about eight seconds a statement, as asked
           'minutes', case when rm.variant_key is null then m.estimated_minutes
                           else greatest(1, round(cardinality(rm.item_ids) * 8 / 60.0))::int end,
           'statements', (
             select coalesce(jsonb_agg(jsonb_build_object('item', i.id, 'factor', coalesce(f.i18n->('nb.' || rm.wording)->>'name', f.name),
                                                  'text', coalesce(i.text->>('nb.' || rm.wording), i.text->>'nb'),
                                                  'factor_en', f.i18n->'en'->>'name', 'text_en', i.text->>'en',
                                                  'help', i.help->>'nb', 'help_en', i.help->>'en')
                                       order by extensions.digest(p_token || i.id::text, 'sha256')), '[]'::jsonb)
             from app.module_items i
             -- 0089: the factor the respondent reads it under: the simplified one in the simplified
             -- set, its own in the extended set; in a puls, simplified for a core statement
             join lateral (
               select ff.name, ff.i18n from app.module_factor_items mi join app.module_factors ff on ff.id = mi.factor_id
               where mi.item_id = i.id
                 and (ff.variant_key is null
                      or ff.variant_key = coalesce(rm.variant_key, case when i.core_indicator then 'forenklet' else 'utvidet' end))
               order by ff.sort limit 1
             ) f on true
             where i.id = any (rm.item_ids)),
           'count', case when rm.include_count_items then (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'item', i.id, 'text', coalesce(i.text->>('nb.' || rm.wording), i.text->>'nb'),
                      'options', (select jsonb_agg(o->>'nb' order by n) from jsonb_array_elements(i.options) with ordinality as y(o, n)),
                      'text_en', i.text->>'en',
                      'options_en', (select jsonb_agg(o->>'en' order by n) from jsonb_array_elements(i.options) with ordinality as y(o, n)))
                    order by i.sort), '[]'::jsonb)
             from app.module_items i where i.module_id = m.id and i.kind = 'count'
               -- 0089: the count questions of the round's variant
               and (i.variant_keys is null or rm.variant_key is null or rm.variant_key = any (i.variant_keys))) else '[]'::jsonb end,
           'segments', case when rm.include_segments then (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'item', i.id, 'text', i.text->>'nb',
                      'options', (select jsonb_agg(o->>'nb' order by n) from jsonb_array_elements(i.options) with ordinality as y(o, n)),
                      'text_en', i.text->>'en',
                      'options_en', (select jsonb_agg(o->>'en' order by n) from jsonb_array_elements(i.options) with ordinality as y(o, n)))
                    order by i.sort), '[]'::jsonb)
             from app.module_items i where i.module_id = m.id and i.kind = 'segment') else '[]'::jsonb end)
         order by m.key)
  into v_module
  from app.round_modules rm join app.question_modules m on m.id = rm.module_id
  where rm.round_id = v_round.id;

  return jsonb_build_object(
    'org', v_org.name,
    'threshold', app.k_threshold(v_inv.org_id),
    'questions', coalesce(v_qs, '[]'::jsonb),
    'extra', coalesce(v_extra, '[]'::jsonb),
    'modules', coalesce(v_module, '[]'::jsonb)
  );
end $function$;
-- 0083's totals: the round's variant's questions, and the share without «ikke aktuelt»
create or replace function public.get_count_item_totals(p_round_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
  v_k   int;
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round_id and r.status = 'lukket';
  -- organisation-level results: the house's readers only, as results_summary's whole scope
  if v_org is null or not exists (
       select 1 from app.memberships m
       where m.user_id = auth.uid() and m.active and m.org_id = v_org
         and m.role in ('daglig_leder', 'verneombud')) then
    return jsonb_build_object('error', 'not_available');
  end if;
  v_k := app.k_threshold(v_org);

  return jsonb_build_object('threshold', v_k, 'items', coalesce((
    select jsonb_agg(jsonb_build_object(
             'code', it.code, 'text', coalesce(it.text->>('nb.' || rm.wording), it.text->>'nb'),
             'options', (select jsonb_agg(o->>'nb' order by n) from jsonb_array_elements(it.options) with ordinality as y(o, n)),
             'text_en', it.text->>'en',
             'options_en', (select jsonb_agg(o->>'en' order by n) from jsonb_array_elements(it.options) with ordinality as y(o, n)),
             'n_total', case when t.n_total >= v_k then t.n_total end,
             'n_ja', case when t.n_total >= v_k then t.n_ja end,
             'n_nei', case when t.n_total >= v_k then t.n_nei end,
             'n_vet_ikke', case when t.n_total >= v_k then t.n_vet_ikke end,
             'suppressed', t.n_total < v_k)
           order by it.sort)
    from app.round_modules rm
    join app.module_items it on it.module_id = rm.module_id and it.kind = 'count'
    join lateral (
      -- 0089: a fourth answer («Jobber ikke fast hjemmefra») is kept out of the share
      select count(*) filter (where c.answer <> 'ikke_aktuelt')::int as n_total,
             count(*) filter (where c.answer = 'ja')::int as n_ja,
             count(*) filter (where c.answer = 'nei')::int as n_nei,
             count(*) filter (where c.answer = 'vet_ikke')::int as n_vet_ikke
      from app.org_count_answers c where c.round_id = p_round_id and c.item_id = it.id
    ) t on true
    where rm.round_id = p_round_id and rm.include_count_items
      and (it.variant_keys is null or rm.variant_key is null or rm.variant_key = any (it.variant_keys))), '[]'::jsonb));
end $function$;
-- 0087's one write path, taking a count question's fourth answer where the question offers one
create or replace function public.submit_response(p_token text, p_answers jsonb, p_extra jsonb, p_module jsonb default '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_inv     app.invitations%rowtype;
  v_group   uuid;
  v_resp    uuid;
  v_written int;
  v_bad     int;
  v_hour    timestamptz := date_trunc('hour', now());
  v_keys    jsonb := '[]'::jsonb;
  v_key     text;
  v_a       jsonb;
  v_mod     jsonb := coalesce(p_module, '{}'::jsonb);
begin
  if p_token is null or length(p_token) < 16 then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  -- looked up BY hash: the plaintext token is never stored and never compared
  select * into v_inv
  from app.invitations i
  where i.token_hash = extensions.digest(p_token, 'sha256');

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;
  if v_inv.responded_at is not null then
    -- replay: refused, and refused without revealing anything about the first answer
    return jsonb_build_object('ok', false, 'error', 'already_responded');
  end if;
  if v_inv.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  perform 1 from app.rounds r where r.id = v_inv.round_id and r.status = 'apen';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'round_closed');
  end if;

  select count(*) into v_bad
  from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) a
  where not exists (
    select 1 from app.round_factors rf
    where rf.round_id = v_inv.round_id and rf.factor_key = (a->>'factor')
  );
  if v_bad > 0 then
    return jsonb_build_object('ok', false, 'error', 'factor_not_in_round');
  end if;
  -- 0087: «ikke relevant» stands in place of a value, never beside one
  select count(*) into v_bad
  from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) a
  where a ? 'na' and (a->'na' <> 'true'::jsonb or nullif(a->>'value', '') is not null);
  if v_bad > 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_answer');
  end if;

  select count(*) into v_bad
  from jsonb_array_elements(coalesce(p_extra, '[]'::jsonb)) x
  where not exists (
    select 1 from app.round_extra_questions rx
    where rx.round_id = v_inv.round_id and rx.extra_key = (x->>'key')
  );
  if v_bad > 0 then
    return jsonb_build_object('ok', false, 'error', 'question_not_in_round');
  end if;

  -- 0069: every module answer must be one the round asks, in the shape its kind takes;
  -- 0087: a statement's answer is a value 1–5 or `na: true`
  if jsonb_typeof(v_mod) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'question_not_in_round');
  end if;
  select count(*) into v_bad
  from jsonb_array_elements(coalesce(v_mod->'answers', '[]'::jsonb)) x
  where not exists (select 1 from app.round_modules rm
                    where rm.round_id = v_inv.round_id and (x->>'item') = any (rm.item_ids::text[]))
     or not (   (coalesce(x->>'value', '') ~ '^[1-5]$' and not x ? 'na')
             or (x->'na' = 'true'::jsonb and nullif(x->>'value', '') is null));
  if v_bad > 0 then
    return jsonb_build_object('ok', false, 'error', 'question_not_in_round');
  end if;
  select count(*) into v_bad
  from jsonb_array_elements(coalesce(v_mod->'count', '[]'::jsonb)) x
  where not exists (select 1 from app.round_modules rm join app.module_items i on i.module_id = rm.module_id
                    where rm.round_id = v_inv.round_id and rm.include_count_items
                      and i.kind = 'count' and i.id::text = (x->>'item')
                      -- 0089: a question of the round's variant; «ikke aktuelt» where it is offered
                      and (i.variant_keys is null or rm.variant_key is null or rm.variant_key = any (i.variant_keys))
                      and (coalesce(x->>'answer', '') in ('ja', 'nei', 'vet_ikke')
                           or (x->>'answer' = 'ikke_aktuelt' and jsonb_array_length(i.options) = 4)));
  if v_bad > 0 then
    return jsonb_build_object('ok', false, 'error', 'question_not_in_round');
  end if;
  select count(*) into v_bad
  from jsonb_array_elements(coalesce(v_mod->'segments', '[]'::jsonb)) x
  where not exists (select 1 from app.round_modules rm join app.module_items i on i.module_id = rm.module_id
                    where rm.round_id = v_inv.round_id and rm.include_segments
                      and i.kind = 'segment' and i.id::text = (x->>'item')
                      and coalesce(x->>'option', '') ~ '^[1-9]$'
                      and (x->>'option')::int <= jsonb_array_length(i.options));
  if v_bad > 0 then
    return jsonb_build_object('ok', false, 'error', 'question_not_in_round');
  end if;

  -- the group is the one thing carried across, because per-group results are the
  -- product. k-anonymity is what makes that safe, and it is applied on read.
  select e.group_id into v_group from app.employees e where e.id = v_inv.employee_id;

  update app.invitations set responded_at = now() where id = v_inv.id;

  insert into app.responses (org_id, round_id, group_id, submitted_hour)
  values (v_inv.org_id, v_inv.round_id, v_group, v_hour)
  returning id into v_resp;

  insert into app.answers (response_id, factor_key, ordinal, value)
  select v_resp, (a->>'factor')::text, (a->>'ordinal')::int, (a->>'value')::int
  from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) a
  where nullif(a->>'value', '') is not null;
  get diagnostics v_written = row_count;

  -- 0087: «ikke relevant», on its own table, where no index reads it
  insert into app.not_relevant_answers (response_id, factor_key, ordinal)
  select distinct v_resp, (a->>'factor')::text, (a->>'ordinal')::int
  from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) a
  where a->'na' = 'true'::jsonb;

  /*
   * A comment is kept whether or not the question it hangs on was scored, and each one
   * opens a thread whose key goes back to the respondent and nowhere else (0018, 0042).
   * The key is 32 random bytes, returned once and stored only as a digest.
   */
  for v_a in select x from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) x loop
    if nullif(btrim(coalesce(v_a->>'comment', '')), '') is not null then
      insert into app.response_comments (response_id, factor_key, ordinal, body)
      values (v_resp, (v_a->>'factor')::text, (v_a->>'ordinal')::int, btrim(v_a->>'comment'));

      v_key := encode(extensions.gen_random_bytes(32), 'hex');
      insert into app.comment_threads (org_id, response_id, factor_key, ordinal, key_hash, opened_hour)
      values (v_inv.org_id, v_resp, (v_a->>'factor')::text, (v_a->>'ordinal')::int,
              extensions.digest(v_key, 'sha256'), v_hour);
      v_keys := v_keys || to_jsonb(v_key);
    end if;
  end loop;

  -- a skipped question sends nothing, so an absent key is a skip and an empty string
  -- is not an answer either
  insert into app.extra_answers (response_id, extra_key, option_ordinal, free_text)
  select v_resp, (x->>'key')::text,
         nullif(x->>'option', '')::int,
         nullif(btrim(coalesce(x->>'text', '')), '')
  from jsonb_array_elements(coalesce(p_extra, '[]'::jsonb)) x
  where nullif(x->>'option', '') is not null
     or nullif(btrim(coalesce(x->>'text', '')), '') is not null;

  -- 0069: the module's statements and background questions, on the same unlinked row
  insert into app.module_answers (response_id, item_id, value)
  select distinct on ((x->>'item')::uuid) v_resp, (x->>'item')::uuid, (x->>'value')::int
  from jsonb_array_elements(coalesce(v_mod->'answers', '[]'::jsonb)) x
  where nullif(x->>'value', '') is not null;
  get diagnostics v_bad = row_count;
  v_written := v_written + v_bad;

  insert into app.module_not_relevant_answers (response_id, item_id)
  select distinct v_resp, (x->>'item')::uuid
  from jsonb_array_elements(coalesce(v_mod->'answers', '[]'::jsonb)) x
  where x->'na' = 'true'::jsonb;

  insert into app.module_segment_answers (response_id, item_id, option_ordinal)
  select distinct on ((x->>'item')::uuid) v_resp, (x->>'item')::uuid, (x->>'option')::int
  from jsonb_array_elements(coalesce(v_mod->'segments', '[]'::jsonb)) x;

  -- 0069: count questions, with nothing that leads back to this response or its group
  insert into app.org_count_answers (round_id, item_id, answer)
  select distinct on ((x->>'item')::uuid) v_inv.round_id, (x->>'item')::uuid, x->>'answer'
  from jsonb_array_elements(coalesce(v_mod->'count', '[]'::jsonb)) x;

  -- v_resp is deliberately NOT returned: the caller must not be able to correlate
  -- their submission with a row.
  return jsonb_build_object('ok', true, 'answers', v_written, 'threads', v_keys);
end $function$;

revoke all on function public.submit_response(text, jsonb, jsonb, jsonb) from public;
grant execute on function public.submit_response(text, jsonb, jsonb, jsonb) to anon, authenticated;

-- 0088's statement choice: not for a module in variants
create or replace function public.set_org_module_item(p_org uuid, p_key text, p_code text, p_asked boolean, p_reason text default null)
  returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_module uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_left   int;
  v_round  record;
  v_item   uuid;
  v_n      int := 0;
begin
  if p_org is null or not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('error', 'not_allowed');
  end if;
  if p_asked is null or (v_reason is not null and char_length(v_reason) > 500) then
    return jsonb_build_object('error', 'invalid');
  end if;
  v_module := app.latest_usable_module(p_key, p_org);
  -- 0089: a module in variants is chosen by variant and factor; its core statements are locked
  if exists (select 1 from app.module_variants v where v.module_id = v_module) then
    return jsonb_build_object('error', 'not_available');
  end if;
  if v_module is null or not exists (select 1 from app.module_items i
                                     where i.module_id = v_module and i.kind = 'likert5' and i.code = p_code) then
    return jsonb_build_object('error', 'not_available');
  end if;

  if p_asked then
    delete from app.org_module_items_off o where o.org_id = p_org and o.module_key = p_key and o.item_code = p_code;
  else
    -- at least one statement stays; none at all is the module switched off
    select count(*) into v_left from app.module_items i
    where i.module_id = v_module and i.kind = 'likert5' and i.code <> p_code
      and not exists (select 1 from app.org_module_items_off o
                      where o.org_id = p_org and o.module_key = p_key and o.item_code = i.code);
    if v_left = 0 then
      return jsonb_build_object('error', 'last_statement');
    end if;
    insert into app.org_module_items_off (org_id, module_key, item_code, reason, off_at, off_by)
    values (p_org, p_key, p_code, v_reason, now(), auth.uid())
    on conflict (org_id, module_key, item_code) do update
      set reason = excluded.reason, off_at = excluded.off_at, off_by = excluded.off_by;
  end if;

  insert into app.org_module_items_log (org_id, module_key, item_code, asked, reason, changed_by)
  values (p_org, p_key, p_code, p_asked, v_reason, auth.uid());

  -- the planned grunnlinjer that ask this module, whatever its version: the statement with this code
  for v_round in
    select rm.round_id, rm.module_id, rm.item_ids from app.round_modules rm
    join app.rounds r on r.id = rm.round_id
    join app.measurements ms on ms.id = r.measurement_id
    join app.question_modules m on m.id = rm.module_id
    where r.org_id = p_org and r.status = 'planlagt' and ms.kind = 'grunnlinje' and m.key = p_key
  loop
    select i.id into v_item from app.module_items i
    where i.module_id = v_round.module_id and i.kind = 'likert5' and i.code = p_code;
    continue when v_item is null;
    if p_asked and not v_item = any (v_round.item_ids) then
      update app.round_modules set item_ids = item_ids || v_item
      where round_id = v_round.round_id and module_id = v_round.module_id;
      v_n := v_n + 1;
    elsif not p_asked and v_item = any (v_round.item_ids) and cardinality(v_round.item_ids) > 1 then
      update app.round_modules set item_ids = array_remove(item_ids, v_item)
      where round_id = v_round.round_id and module_id = v_round.module_id;
      v_n := v_n + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'asked', p_asked, 'planned_rounds', v_n);
end $fn$;

-- ---------------------------------------------------------------- results
/**
 * 0070's release, with a factor's cells over its members (module_factor_items) rather than its
 * home statements: a simplified factor is released for a group only where each of its three
 * statements is, whichever extended factors they come from.
 */
create or replace function app.module_cell_release(p_round uuid)
  returns table (item_id uuid, factor_id uuid, group_id uuid, n int, status text)
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_org   uuid;
  v_k     int;
  v_rel_g uuid[];
  v_rel_s text[];
  c       record;
  v_cells jsonb := '[]';
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round and r.status = 'lukket';
  if v_org is null then
    return;
  end if;
  v_k := app.k_threshold(v_org);

  select array_agg(gr.group_id), array_agg(gr.status) into v_rel_g, v_rel_s
  from app.group_release(p_round) gr;
  if v_rel_g is null then
    return;
  end if;

  -- the people who answered each asked statement, per group, smallest first, as 0045 counts
  for c in
    select it.id, it.factor_id,
           array_agg(x.group_id order by x.n, x.group_id::text) filter (where x.n is not null) as g,
           array_agg(x.n        order by x.n, x.group_id::text) filter (where x.n is not null) as n
    from app.round_modules rm
    join app.module_items it on it.id = any (rm.item_ids)
    left join (
      select ma.item_id, resp.group_id, count(distinct ma.response_id)::int as n
      from app.module_answers ma join app.responses resp on resp.id = ma.response_id
      where resp.round_id = p_round
      group by ma.item_id, resp.group_id
    ) x on x.item_id = it.id
    where rm.round_id = p_round
    group by it.id, it.factor_id
  loop
    v_cells := v_cells || coalesce((
      select jsonb_agg(jsonb_build_object('item_id', c.id, 'factor_id', c.factor_id,
                                          'group_id', rc.group_id, 'n', rc.n, 'status', rc.status))
      from app.release_cells(v_k, v_rel_g, v_rel_s, c.g, c.n) rc), '[]'::jsonb);
  end loop;

  return query
  with s as (
    select * from jsonb_to_recordset(v_cells)
      as x(item_id uuid, factor_id uuid, group_id uuid, n int, status text)
  ), asked as (
    select mi.factor_id, it.id
    from app.round_modules rm
    join app.module_items it on it.id = any (rm.item_ids)
    join app.module_factor_items mi on mi.item_id = it.id
    where rm.round_id = p_round
  )
  select s.item_id, s.factor_id, s.group_id, s.n, s.status from s
  union all
  -- a factor, per group: released only where every asked statement of it is
  select null::uuid, a.factor_id, gg.gid, min(coalesce(s.n, 0))::int,
         case
           when min(gg.rs) <> 'ok' then min(gg.rs)
           when bool_or(s.status is null or s.status = 'insufficient_data') then 'insufficient_data'
           when bool_and(s.status = 'ok') then 'ok'
           else 'protected'
         end
  from unnest(v_rel_g, v_rel_s) as gg(gid, rs)
  cross join asked a
  left join s on s.item_id = a.id and s.group_id is not distinct from gg.gid
  group by a.factor_id, gg.gid;
end $fn$;

/**
 * 0083's results, reading a factor through its members, and for a module in variants:
 *   - a grunnlinje reports its variant's factors, each only where every statement of it was
 *     asked; the extended set reports the simplified factors alongside, marked `comparable`
 *     («Sammenlignbar indeks»), since its core statements are always asked;
 *   - a puls reports, for each statement it re-measures, the simplified factor of a core
 *     statement and the extended factor of any other, over what was asked;
 *   - the module says its status (provisional: «Foreløpig») and the round's variant.
 * A module asked one way reads as before: its factors, over the statements the round asked.
 */
create or replace function public.module_results(p_round uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org     uuid;
  v_k       int;
  v_whole   boolean;
  v_visible uuid[];
  v_out     jsonb;
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round and r.status = 'lukket';
  if v_org is null or not app.is_org_member(v_org) then
    return jsonb_build_object('error', 'not_available');
  end if;
  v_k := app.k_threshold(v_org);
  select exists (select 1 from app.memberships m
                 where m.user_id = auth.uid() and m.active and m.org_id = v_org
                   and m.role in ('daglig_leder', 'verneombud')) into v_whole;
  select coalesce(array_agg(vg.group_id), '{}') into v_visible from app.visible_groups(v_org) vg;

  with cells as materialized (select * from app.module_cell_release(p_round)),
  asked as (
    select rm.module_id, it.id, it.code, coalesce(it.text->>('nb.' || rm.wording), it.text->>'nb') as text,
           it.text->>'en' as text_en, it.sort, it.core_indicator
    from app.round_modules rm join app.module_items it on it.id = any (rm.item_ids)
    where rm.round_id = p_round
  ),
  -- the factors this round reports (0089)
  fset as (
    select f.id as factor_id, (rm.variant_key = 'utvidet' and f.variant_key = 'forenklet') as comparable
    from app.round_modules rm join app.module_factors f on f.module_id = rm.module_id
    where rm.round_id = p_round
      and exists (select 1 from app.module_factor_items mi join asked a on a.id = mi.item_id where mi.factor_id = f.id)
      and case
            when f.variant_key is null then true
            when rm.variant_key is not null then
              (f.variant_key = rm.variant_key or (rm.variant_key = 'utvidet' and f.variant_key = 'forenklet'))
              and not exists (select 1 from app.module_factor_items mi
                              where mi.factor_id = f.id and not exists (select 1 from asked a where a.id = mi.item_id))
            else f.variant_key = 'forenklet'
                 or exists (select 1 from app.module_factor_items mi join asked a on a.id = mi.item_id
                            where mi.factor_id = f.id and not a.core_indicator)
          end
  ),
  members as (
    select fs.factor_id, a.id as item_id
    from fset fs join app.module_factor_items mi on mi.factor_id = fs.factor_id join asked a on a.id = mi.item_id
  ),
  -- the house: an item, and a factor, only where every asked statement has k answers
  item_n as (
    select a.id, count(distinct ma.response_id)::int as n, round(avg(app.to_index(ma.value))) as idx
    from asked a
    left join app.module_answers ma on ma.item_id = a.id
     and ma.response_id in (select r.id from app.responses r where r.round_id = p_round)
    group by a.id
  ),
  factor_org as (
    select mm.factor_id, min(i.n) as n,
           case when min(i.n) >= v_k then (
             select round(avg(app.to_index(ma.value)))
             from app.module_answers ma join app.responses r on r.id = ma.response_id
             where r.round_id = p_round and ma.item_id in (select m2.item_id from members m2 where m2.factor_id = mm.factor_id))
           end as idx
    from members mm join item_n i on i.id = mm.item_id
    group by mm.factor_id
  ),
  groups as (
    select rel.group_id, rel.n, rel.status, coalesce(g.name, 'Uten gruppe') as name
    from app.group_release(p_round) rel left join app.groups g on g.id = rel.group_id
    where v_whole or rel.group_id = any (v_visible)
  )
  select jsonb_agg(jsonb_build_object(
           'key', m.key, 'version', m.version, 'name', m.name, 'name_en', m.i18n->'en'->>'name',
           'validation_status', m.validation_status,
           'variant', (select jsonb_build_object('key', v.key, 'code', v.code, 'version', v.version, 'name', v.name)
                       from app.round_modules rm join app.module_variants v on v.module_id = rm.module_id and v.key = rm.variant_key
                       where rm.round_id = p_round and rm.module_id = m.id),
           'factors', (
             select jsonb_agg(jsonb_build_object(
                      'key', f.key, 'code', f.code, 'variant', f.variant_key, 'comparable', fs.comparable,
                      'name', coalesce(f.i18n->('nb.' || (select rm.wording from app.round_modules rm
                                                          where rm.round_id = p_round and rm.module_id = m.id))->>'name', f.name),
                      'summary', f.summary, 'rationale', f.rationale, 'en', f.i18n->'en',
                      'rationale_sources', to_jsonb(f.rationale_sources), 'legal_basis', to_jsonb(f.legal_basis),
                      'index', case when v_whole then fo.idx end,
                      'band', case when v_whole and fo.idx is not null then app.risk_band(fo.idx) end,
                      'items', (
                        select jsonb_agg(jsonb_build_object('code', a.code, 'text', a.text, 'text_en', a.text_en,
                                 'index', case when v_whole and i.n >= v_k then i.idx end) order by a.sort)
                        from members mm join asked a on a.id = mm.item_id join item_n i on i.id = a.id
                        where mm.factor_id = f.id))
                    order by f.sort)
             from app.module_factors f join fset fs on fs.factor_id = f.id join factor_org fo on fo.factor_id = f.id
             where f.module_id = m.id),
           'groups', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'group_name', gr.name, 'n', case when app.participation_shown(p_round, gr.group_id) then gr.n end, 'status', gr.status,
                      'factors', case when gr.status = 'ok' then (
                        select jsonb_agg(jsonb_build_object('key', f.key, 'index', gi.idx, 'band', app.risk_band(gi.idx)) order by f.sort)
                        from app.module_factors f
                        join fset fs on fs.factor_id = f.id
                        join lateral (
                          select round(avg(app.to_index(ma.value))) as idx
                          from app.module_answers ma join app.responses r on r.id = ma.response_id
                          where r.round_id = p_round and r.group_id is not distinct from gr.group_id
                            and ma.item_id in (select mm.item_id from members mm where mm.factor_id = f.id)
                        ) gi on true
                        where f.module_id = m.id
                          and exists (select 1 from cells c where c.item_id is null and c.factor_id = f.id
                                        and c.group_id is not distinct from gr.group_id and c.status = 'ok')) end)
                    order by gr.name), '[]'::jsonb)
             from groups gr))
         order by m.key)
  into v_out
  from app.question_modules m
  where m.id in (select rm.module_id from app.round_modules rm where rm.round_id = p_round);

  return jsonb_build_object('threshold', v_k, 'scope', case when v_whole then 'org' else 'groups' end,
                            'modules', coalesce(v_out, '[]'::jsonb));
end $function$;
