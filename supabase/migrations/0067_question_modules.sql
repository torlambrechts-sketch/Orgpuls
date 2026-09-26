-- 0067_question_modules.sql — industry question modules: the registry (D-111).
--
-- A module is a versioned bundle of factors and statements that extends the core
-- instrument for one industry, starting with Bygg og anlegg 1.0.0. Its wording lives in
-- modules/<key>/v<major>.json, the single source of truth that both the survey and the
-- public industry pages read; scripts/modules/seed.ts writes that file into the tables
-- below, and nothing else writes them.
--
--   question_modules            one row per (key, version), draft → published → retired
--   module_sources              the research and supervision a factor's rationale cites
--   module_factors              three statements scored as one 0–100 index
--   module_items                a statement (likert5), an organisation-only count question
--                               (count) or an optional background question (segment)
--   module_action_suggestions   workshop, routine and leadership practice per factor, each
--                               with the statement that re-measures it
--
-- **Published is immutable.** A survey that asked a statement must be able to say later
-- exactly what it asked, so once a version is published nothing about its content may
-- change: changing a word means publishing a new version. The trigger compares content,
-- not operations (CLAUDE.md, "Immutability triggers must permit referential maintenance"):
-- a child row may still go when its parent module is being deleted, which only a draft can
-- be — a published or retired module cannot be deleted at all.
--
-- **Who may read and write.** The registry is reference data, like app.factors: a published
-- or retired version is readable by anyone, because a respondent answering through a token
-- has to read the statement they answer and the public pages print them. A draft is
-- readable only by a platform admin. No client writes any of it: the seed script runs as
-- the database owner, and publishing and retiring go through audited super-admin functions.
--
-- **The anonymity floor is in the row.** A module's `anonymity` must say at least five and
-- that it cannot be lowered, which is app.k_min(); a file that says otherwise is refused
-- by the schema in lib/modules/schema.ts and again here.

create type app.module_status       as enum ('draft', 'published', 'retired');
create type app.module_item_kind    as enum ('likert5', 'count', 'segment');
create type app.module_report_scope as enum ('group', 'organisation_only', 'segment_filter');

create table app.question_modules (
  id                uuid primary key default gen_random_uuid(),
  key               text not null check (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  version           text not null check (version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'),
  name              text not null check (length(btrim(name)) > 0),
  description       text not null,
  industry_key      text,
  status            app.module_status not null default 'draft',
  estimated_minutes int not null check (estimated_minutes between 1 and 30),
  scale             jsonb not null,
  scoring           jsonb not null,
  anonymity         jsonb not null check (
                      (anonymity->>'min_responses')::int >= 5
                      and anonymity->'can_lower' = 'false'::jsonb),
  relation_to_core  jsonb not null default '{}',
  content_hash      text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  published_at      timestamptz,
  retired_at        timestamptz,
  created_at        timestamptz not null default now(),
  unique (key, version),
  constraint module_status_dates check (
    (status = 'draft'     and published_at is null     and retired_at is null) or
    (status = 'published' and published_at is not null and retired_at is null) or
    (status = 'retired'   and published_at is not null and retired_at is not null))
);

create table app.module_sources (
  module_id uuid not null references app.question_modules (id) on delete cascade,
  key       text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  title     text not null,
  url       text not null check (url ~ '^https://'),
  sort      int  not null,
  primary key (module_id, key)
);

create table app.module_factors (
  id                uuid primary key default gen_random_uuid(),
  module_id         uuid not null references app.question_modules (id) on delete cascade,
  key               text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  name              text not null,
  summary           text not null,
  rationale         text not null,
  rationale_sources text[] not null default '{}',
  legal_basis       text[] not null default '{}',
  sort              int  not null,
  unique (module_id, key),
  unique (module_id, id)
);

create table app.module_items (
  id             uuid primary key default gen_random_uuid(),
  module_id      uuid not null references app.question_modules (id) on delete cascade,
  factor_id      uuid,
  code           text not null,
  kind           app.module_item_kind not null,
  -- a locale map, {"nb": "..."}; only nb is filled until more languages are decided
  text           jsonb not null check (jsonb_typeof(text) = 'object' and length(btrim(text->>'nb')) > 0),
  -- count and segment: the options, in order, as a locale map per option
  options        jsonb,
  reverse        boolean not null default false,
  pulse_eligible boolean not null default false,
  report_scope   app.module_report_scope not null,
  sort           int not null,
  unique (module_id, code),
  unique (module_id, id),
  -- a statement belongs to a factor of the same module; nothing else belongs to one
  foreign key (module_id, factor_id) references app.module_factors (module_id, id) on delete cascade,
  check ((kind = 'likert5') = (factor_id is not null)),
  check (kind <> 'likert5' or (code ~ '^[A-Z]{2}-[A-Z]{2}-[1-3]$' and report_scope = 'group' and options is null)),
  -- a count question is reported for the whole organisation, never per group or segment
  check (kind <> 'count'   or (code ~ '^[A-Z]{2}-T-[0-9]+$' and report_scope = 'organisation_only'
                               and jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 3)),
  check (kind <> 'segment' or (code ~ '^[A-Z]{2}-S-[a-z][a-z0-9_]*$' and report_scope = 'segment_filter'
                               and jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 9))
);

create table app.module_action_suggestions (
  id                uuid primary key default gen_random_uuid(),
  module_id         uuid not null,
  factor_id         uuid not null,
  type              text not null check (type in ('workshop', 'rutine', 'lederpraksis')),
  title             text not null,
  description       text not null,
  remeasure_item_id uuid not null,
  sort              int  not null,
  foreign key (module_id, factor_id) references app.module_factors (module_id, id) on delete cascade,
  foreign key (module_id, remeasure_item_id) references app.module_items (module_id, id) on delete cascade
);

create index module_items_factor_idx on app.module_items (factor_id);
create index module_actions_factor_idx on app.module_action_suggestions (module_id, factor_id);
create index module_actions_item_idx on app.module_action_suggestions (module_id, remeasure_item_id);

/**
 * The statement that re-measures a suggestion is one of the suggestion's own factor's: a
 * routine for "Stopp og meld" is not measured by a statement about overtime.
 */
create function app.module_action_item_ok() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  if not exists (select 1 from app.module_items i
                 where i.id = new.remeasure_item_id and i.factor_id = new.factor_id) then
    raise exception 're-measure item % is not a statement of factor %', new.remeasure_item_id, new.factor_id
      using errcode = 'check_violation';
  end if;
  return new;
end $fn$;

create trigger module_action_item_ok before insert or update on app.module_action_suggestions
  for each row execute function app.module_action_item_ok();

-- ---------------------------------------------------------------- immutability
/**
 * A published or retired module's content cannot change. Written as "nobody may change
 * this content": an insert, an update or a delete under a published parent is refused,
 * except a delete whose parent row is already gone, which is the database's own cascade.
 * Since a published module cannot itself be deleted (below), that cascade only ever
 * happens to a draft.
 */
create function app.module_child_frozen() returns trigger
  language plpgsql set search_path = ''
as $fn$
declare
  v_module uuid := case when tg_op = 'DELETE' then old.module_id else new.module_id end;
  v_status app.module_status;
begin
  select m.status into v_status from app.question_modules m where m.id = v_module;
  if tg_op = 'DELETE' and not found then
    return old;
  end if;
  if tg_op = 'UPDATE' and old.module_id is distinct from new.module_id then
    raise exception 'a module row cannot move to another module' using errcode = 'restrict_violation';
  end if;
  if v_status <> 'draft' then
    raise exception 'published module is immutable; create a new version' using errcode = 'restrict_violation';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $fn$;

create trigger module_sources_frozen before insert or update or delete on app.module_sources
  for each row execute function app.module_child_frozen();
create trigger module_factors_frozen before insert or update or delete on app.module_factors
  for each row execute function app.module_child_frozen();
create trigger module_items_frozen before insert or update or delete on app.module_items
  for each row execute function app.module_child_frozen();
create trigger module_actions_frozen before insert or update or delete on app.module_action_suggestions
  for each row execute function app.module_child_frozen();

/**
 * The module row itself: a draft may change freely; once published, only its status may
 * move, and only forward — published to retired, never back — with its dates set by that
 * move. A published or retired module cannot be deleted: surveys refer to it.
 */
create function app.module_frozen() returns trigger
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
      new.scale, new.scoring, new.anonymity, new.relation_to_core, new.content_hash, new.published_at, new.created_at)
     is distinct from
     (old.key, old.version, old.name, old.description, old.industry_key, old.estimated_minutes,
      old.scale, old.scoring, old.anonymity, old.relation_to_core, old.content_hash, old.published_at, old.created_at)
     or (old.status = 'retired' and new.status is distinct from old.status)
     or (old.status = 'published' and new.status = 'draft') then
    raise exception 'published module is immutable; create a new version' using errcode = 'restrict_violation';
  end if;
  return new;
end $fn$;

create trigger question_modules_frozen before update or delete on app.question_modules
  for each row execute function app.module_frozen();

-- ---------------------------------------------------------------- RLS
alter table app.question_modules          enable row level security;
alter table app.module_sources            enable row level security;
alter table app.module_factors            enable row level security;
alter table app.module_items              enable row level security;
alter table app.module_action_suggestions enable row level security;

create function app.module_visible(p_module uuid) returns boolean
  language sql stable security definer set search_path = ''
as $fn$
  select exists (select 1 from app.question_modules m where m.id = p_module and m.status <> 'draft')
      or app.is_platform_admin(array['super_admin', 'support', 'finance', 'analyst', 'marketing']::app.platform_role[])
$fn$;
revoke all on function app.module_visible(uuid) from public;
grant execute on function app.module_visible(uuid) to anon, authenticated;

create policy question_module_read on app.question_modules
  for select to anon, authenticated using (app.module_visible(id));
create policy module_source_read on app.module_sources
  for select to anon, authenticated using (app.module_visible(module_id));
create policy module_factor_read on app.module_factors
  for select to anon, authenticated using (app.module_visible(module_id));
create policy module_item_read on app.module_items
  for select to anon, authenticated using (app.module_visible(module_id));
create policy module_action_read on app.module_action_suggestions
  for select to anon, authenticated using (app.module_visible(module_id));

-- read only: there is no write policy and no write grant for any client role
revoke all on app.question_modules, app.module_sources, app.module_factors, app.module_items,
              app.module_action_suggestions from anon, authenticated;
grant select on app.question_modules, app.module_sources, app.module_factors, app.module_items,
               app.module_action_suggestions to anon, authenticated;

revoke all on function app.module_action_item_ok() from public, anon, authenticated;
revoke all on function app.module_child_frozen() from public, anon, authenticated;
revoke all on function app.module_frozen() from public, anon, authenticated;

-- ---------------------------------------------------------------- seeding
/**
 * Writes one module file into the registry as a draft; scripts/modules/seed.ts validates the
 * file, hashes its canonical JSON and calls this with both. Idempotent:
 *
 *   * the same (key, version) already published or retired: the same hash is a no-op, a
 *     different one is refused — a published version is never rewritten;
 *   * the same draft with the same hash: a no-op; with a different hash: replaced whole.
 *
 * Owner only: no client role may execute it.
 */
create function app.module_seed(p jsonb, p_hash text) returns text
  language plpgsql set search_path = ''
as $fn$
declare
  v_id     uuid;
  v_status app.module_status;
  v_hash   text;
  v_prefix text;
  f        jsonb;
  it       jsonb;
  a        jsonb;
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
                                    scale, scoring, anonymity, relation_to_core, content_hash)
  values (p->>'module_id', p->>'version', p->>'name', p->>'description', p->>'module_id',
          (p->>'estimated_minutes')::int, p->'scale', p->'scoring', p->'anonymity',
          coalesce(p->'relation_to_core', '{}'), p_hash)
  returning id into v_id;

  insert into app.module_sources (module_id, key, title, url, sort)
  select v_id, s->>'key', s->>'title', s->>'url', o::int
  from jsonb_array_elements(p->'sources') with ordinality as x(s, o);

  for f in select value from jsonb_array_elements(p->'factors') loop
    fi := fi + 1;
    insert into app.module_factors (module_id, key, name, summary, rationale, rationale_sources, legal_basis, sort)
    values (v_id, f->>'id', f->>'name', f->>'summary', f->>'rationale',
            array(select jsonb_array_elements_text(f->'rationale_sources')),
            array(select jsonb_array_elements_text(f->'legal_basis')), fi)
    returning id into v_fid;

    ii := 0;
    for it in select value from jsonb_array_elements(f->'items') loop
      ii := ii + 1;
      insert into app.module_items (module_id, factor_id, code, kind, text, reverse, pulse_eligible, report_scope, sort)
      values (v_id, v_fid, it->>'id', 'likert5', jsonb_build_object('nb', it->>'text'),
              (it->>'reverse')::boolean, (it->>'pulse_eligible')::boolean, 'group', fi * 10 + ii);
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

  v_prefix := left(p->'factors'->0->'items'->0->>'id', 2);

  insert into app.module_items (module_id, code, kind, text, options, report_scope, sort)
  select v_id, c->>'id', 'count', jsonb_build_object('nb', c->>'text'),
         (select jsonb_agg(jsonb_build_object('nb', o) order by n) from jsonb_array_elements_text(c->'options') with ordinality as y(o, n)),
         'organisation_only', 1000 + o::int
  from jsonb_array_elements(p->'count_items') with ordinality as x(c, o);

  insert into app.module_items (module_id, code, kind, text, options, report_scope, sort)
  select v_id, v_prefix || '-S-' || (s->>'id'), 'segment', jsonb_build_object('nb', s->>'text'),
         (select jsonb_agg(jsonb_build_object('nb', o) order by n) from jsonb_array_elements_text(s->'options') with ordinality as y(o, n)),
         'segment_filter', 2000 + o::int
  from jsonb_array_elements(p->'segments') with ordinality as x(s, o);

  return 'seeded';
end $fn$;

/** Owner only, for scripts/modules/publish.ts; the admin's own path is audited below. */
create function app.module_set_status(p_key text, p_version text, p_status app.module_status) returns text
  language plpgsql set search_path = ''
as $fn$
declare v_status app.module_status;
begin
  select m.status into v_status from app.question_modules m where m.key = p_key and m.version = p_version for update;
  if not found then
    raise exception 'no module %@%', p_key, p_version;
  end if;
  if v_status = p_status then
    return 'unchanged';
  end if;
  if not ((v_status = 'draft' and p_status = 'published') or (v_status = 'published' and p_status = 'retired')) then
    raise exception 'a module moves draft → published → retired, not % → %', v_status, p_status;
  end if;
  update app.question_modules set status = p_status,
    published_at = case when p_status = 'published' then now() else published_at end,
    retired_at   = case when p_status = 'retired'   then now() else retired_at end
  where key = p_key and version = p_version;
  return p_status::text;
end $fn$;

revoke all on function app.module_seed(jsonb, text) from public, anon, authenticated;
revoke all on function app.module_set_status(text, text, app.module_status) from public, anon, authenticated;

-- ---------------------------------------------------------------- a module on a round
-- The spec's "survey_modules": in this schema a survey is a round (app.rounds). Which items a
-- round asks is fixed when it is set up, like app.round_factors: a grunnlinje asks every
-- statement of the factors switched on; a puls asks only the statements that re-measure an
-- open measure. Once a round has left `planlagt`, its selection cannot change (below).
create table app.round_modules (
  org_id              uuid not null,
  round_id            uuid not null,
  module_id           uuid not null references app.question_modules (id),
  -- the likert statements this round asks
  item_ids            uuid[] not null check (cardinality(item_ids) > 0),
  include_count_items boolean not null default true,
  include_segments    boolean not null default false,
  created_at          timestamptz not null default now(),
  primary key (round_id, module_id),
  foreign key (org_id, round_id) references app.rounds (org_id, id) on delete cascade
);
create index round_modules_module_idx on app.round_modules (module_id);

-- ---------------------------------------------------------------- module answers
-- Statements and background questions hang off app.responses exactly as app.answers does,
-- and for the same reason: that row carries a group and an hour and nothing that links it
-- to a person. RLS on, NO policy, grants revoked: no client can read a row. Reads go through
-- SECURITY DEFINER aggregates that apply k per cell.
create table app.module_answers (
  response_id uuid not null references app.responses (id) on delete cascade,
  item_id     uuid not null references app.module_items (id),
  value       int  not null check (value between 1 and 5),
  primary key (response_id, item_id)
);
create index module_answers_item_idx on app.module_answers (item_id);

create table app.module_segment_answers (
  response_id    uuid not null references app.responses (id) on delete cascade,
  item_id        uuid not null references app.module_items (id),
  option_ordinal int  not null check (option_ordinal between 1 and 9),
  primary key (response_id, item_id)
);
create index module_segment_answers_item_idx on app.module_segment_answers (item_id);

-- Count-only answers. Deliberately no response, no group, no segment and no time finer than
-- a day: a count question ("har du sett en nestenulykke som ikke ble meldt?") may only ever be
-- reported for the whole organisation, and a row that cannot be joined to a group cannot be
-- reported per group by any query, careless or not. That is the anonymity-by-absence of
-- app.responses (0003), one step further.
create table app.org_count_answers (
  id          uuid primary key default gen_random_uuid(),
  round_id    uuid not null references app.rounds (id) on delete cascade,
  item_id     uuid not null references app.module_items (id),
  answer      text not null check (answer in ('ja', 'nei', 'vet_ikke')),
  answered_on date not null default ((now() at time zone 'Europe/Oslo')::date)
);
create index org_count_answers_round_idx on app.org_count_answers (round_id, item_id);

/**
 * Append-only, written as "nobody may change this content" (CLAUDE.md): a delete is allowed
 * only when the parent is already gone — a response deleted with its round, or the round.
 */
create function app.forbid_module_answer_change() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  if tg_op = 'DELETE' then
    if tg_table_name = 'org_count_answers' then
      if exists (select 1 from app.rounds r where r.id = old.round_id) then
        raise exception 'count answers are append-only' using errcode = 'restrict_violation';
      end if;
    elsif exists (select 1 from app.responses r where r.id = old.response_id) then
      raise exception 'answers are append-only: % cannot be deleted', old.response_id using errcode = 'restrict_violation';
    end if;
    return old;
  end if;
  if to_jsonb(new) is distinct from to_jsonb(old) then
    raise exception 'answers are immutable once submitted' using errcode = 'restrict_violation';
  end if;
  return new;
end $fn$;

create trigger module_answers_immutable before update or delete on app.module_answers
  for each row execute function app.forbid_module_answer_change();
create trigger module_segment_answers_immutable before update or delete on app.module_segment_answers
  for each row execute function app.forbid_module_answer_change();
create trigger org_count_answers_immutable before update or delete on app.org_count_answers
  for each row execute function app.forbid_module_answer_change();

/**
 * A round's module selection is the round's question set: it is chosen while the round is
 * planned and fixed from the moment it opens, as the answers depend on it. It names only a
 * published module's statements. Deleting with the round is the cascade and is allowed.
 */
create function app.round_module_ok() returns trigger
  language plpgsql set search_path = ''
as $fn$
declare v_status app.round_status;
begin
  select r.status into v_status from app.rounds r
  where r.id = case when tg_op = 'DELETE' then old.round_id else new.round_id end;
  if tg_op = 'DELETE' then
    if found and v_status <> 'planlagt' then
      raise exception 'a round''s modules are fixed once it has opened' using errcode = 'restrict_violation';
    end if;
    return old;
  end if;
  if v_status <> 'planlagt' and (tg_op = 'INSERT' or to_jsonb(new) is distinct from to_jsonb(old)) then
    raise exception 'a round''s modules are fixed once it has opened' using errcode = 'restrict_violation';
  end if;
  if not exists (select 1 from app.question_modules m where m.id = new.module_id and m.status = 'published') then
    raise exception 'module % is not published', new.module_id using errcode = 'check_violation';
  end if;
  if exists (select 1 from unnest(new.item_ids) x
             where not exists (select 1 from app.module_items i
                               where i.id = x and i.module_id = new.module_id and i.kind = 'likert5')) then
    raise exception 'a round asks only statements of its module' using errcode = 'check_violation';
  end if;
  return new;
end $fn$;

create trigger round_module_ok before insert or update or delete on app.round_modules
  for each row execute function app.round_module_ok();

alter table app.round_modules          enable row level security;
alter table app.module_answers         enable row level security;
alter table app.module_segment_answers enable row level security;
alter table app.org_count_answers      enable row level security;

-- the same policies as app.round_factors (0026): members read, leaders and verneombud choose,
-- one policy per command
create policy round_module_read on app.round_modules
  for select to authenticated using (app.is_org_member(org_id));
create policy round_module_write_insert on app.round_modules for insert to authenticated
  with check (app.has_role(org_id, array['daglig_leder', 'verneombud']::app.org_role[]));
create policy round_module_write_update on app.round_modules for update to authenticated
  using (app.has_role(org_id, array['daglig_leder', 'verneombud']::app.org_role[]))
  with check (app.has_role(org_id, array['daglig_leder', 'verneombud']::app.org_role[]));
create policy round_module_write_delete on app.round_modules for delete to authenticated
  using (app.has_role(org_id, array['daglig_leder', 'verneombud']::app.org_role[]));

revoke all on app.round_modules from anon, authenticated;
grant select, insert, update, delete on app.round_modules to authenticated;

-- NO POLICIES on the three answer tables, and no grants: every client role is denied.
revoke all on app.module_answers, app.module_segment_answers, app.org_count_answers from anon, authenticated;

revoke all on function app.forbid_module_answer_change() from public, anon, authenticated;
revoke all on function app.round_module_ok() from public, anon, authenticated;

-- ---------------------------------------------------------------- the admin's view
/** Modules for Innhold › Moduler: every version, its status and dates, and how many rounds use it. */
create function public.admin_modules() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin', 'support', 'finance', 'analyst', 'marketing']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true,
    'modules', coalesce((
      select jsonb_agg(jsonb_build_object(
               'key', m.key, 'version', m.version, 'name', m.name, 'status', m.status,
               'published_at', m.published_at, 'retired_at', m.retired_at, 'content_hash', m.content_hash,
               'factors', (select count(*) from app.module_factors f where f.module_id = m.id),
               'items', (select count(*) from app.module_items i where i.module_id = m.id and i.kind = 'likert5'),
               'rounds', (select count(*) from app.round_modules rm where rm.module_id = m.id))
             order by m.key, string_to_array(m.version, '.')::int[] desc)
      from app.question_modules m), '[]'::jsonb),
    -- adoption: of the grunnlinje rounds from the last year, how many asked a module, by the
    -- first two digits of the organisation's industry code
    'adoption', coalesce((
      select jsonb_agg(jsonb_build_object('nace', x.nace, 'rounds', x.rounds, 'with_module', x.with_module) order by x.nace)
      from (
        select coalesce(left(o.registry_nace_code, 2), '–') as nace, count(*) as rounds,
               count(*) filter (where exists (select 1 from app.round_modules rm where rm.round_id = r.id)) as with_module
        from app.rounds r
        join app.measurements me on me.id = r.measurement_id and me.kind = 'grunnlinje'
        join app.organizations o on o.id = r.org_id
        where r.opens_at > now() - interval '1 year'
        group by 1
      ) x), '[]'::jsonb));
end $fn$;

/** Publish a seeded draft or retire a published version: super-admin, with a reason, audited. */
create function public.admin_module_set_status(p_key text, p_version text, p_status text, p_reason text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare v_result text;
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  if p_status not in ('published', 'retired') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status');
  end if;
  if not exists (select 1 from app.question_modules m where m.key = p_key and m.version = p_version) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  begin
    v_result := app.module_set_status(p_key, p_version, p_status::app.module_status);
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'invalid_transition');
  end;
  if v_result <> 'unchanged' then
    perform app.admin_log('module.' || case p_status when 'published' then 'publish' else 'retire' end,
                          null, 'module', p_key || '@' || p_version, btrim(p_reason), null);
  end if;
  return jsonb_build_object('ok', true, 'result', v_result);
end $fn$;

revoke all on function public.admin_modules() from public, anon;
grant execute on function public.admin_modules() to authenticated;
revoke all on function public.admin_module_set_status(text, text, text, text) from public, anon;
grant execute on function public.admin_module_set_status(text, text, text, text) to authenticated;
