-- WP-1.1 (0203_crm_deals, D-227). Paste the whole file into the Supabase SQL editor for project jmhhszsnjfqgclxzhciq and click Run.
-- One transaction: all of it lands or none of it does.
begin;
-- 0203 — CRM pipelines and deals: the data move (WP-1.1; D-227)
--
-- docs/crm-enrichment/07-IMPLEMENTATION-PLAN.md WP-1.1 (PIP-02, PIP-03, SF-35; DEC-02). Until now a company was the
-- deal: it carried the stage, the value and the owner. From here a deal is its own record, in a pipeline, and a
-- company can have any number of them.
--
--   crm_pipelines        new: a name, an order, archived (card fields per pipeline come with WP-1.2's board, which reads them)
--   crm_stages           + pipeline_id, probability (0–100, unset = none), rot_days (unset = never rots); a key stays
--                        unique across pipelines, and (key, pipeline_id) is what a deal points at, so a deal's stage is
--                        always one of its own pipeline's
--   crm_deals            new: title (the only thing a deal needs), company, primary contact, value and currency,
--                        pipeline and stage, owner, expected close, probability, status (from the stage's kind),
--                        lost text, source, custom values, visibility, and the standard columns
--   crm_stage_changes    + deal_id, pipeline_id, left_at (the days a deal spent in a stage); company_id may be empty
--                        for a deal without a company. The history is recorded from the deal, no longer the company
--
-- The data move: every company becomes one deal, its «primary» deal, carrying the stage, value, owner and lost text
-- it carries today; the stage history is re-pointed at it. A trial or customer company's primary deal is its
-- subscription deal, and the product plan keeps driving it (app.crm_sync writes the company, the deal follows).
--
-- Compatibility until WP-3 (journeys and campaigns): a company's stage, value_nok and owner_id mirror its primary
-- deal, in both directions, so everything that reads or writes a company's stage — campaign stage targets, the
-- journeys, the account sync, automatic moves, the companies list — keeps working unchanged. The win rate and the
-- pipeline figures are read from deals; for the migrated history (one deal per company) they are the same numbers.
--
-- Not in this package (logged in D-227): lost reasons as rows, labels, archive and the board (WP-1.2); participants
-- and followers (WP-1.3); a deal in the restore list (its delete comes with WP-1.2's list); currencies other than NOK
-- on a primary deal (WP-1.9, as the company's value is in NOK).

-- ------------------------------------------------------------------------------------------ pipelines
create table app.crm_pipelines (
  id          uuid primary key default gen_random_uuid(),
  product_id  text not null default 'orgpuls',
  key         text not null unique check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  sort        int not null default 0 check (sort between 0 and 9999),
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);
comment on table app.crm_pipelines is 'Sales pipelines (0203). Every stage belongs to one; «sales» holds the stages that existed before.';
create index crm_pipelines_created_by_idx on app.crm_pipelines (created_by);
create index crm_pipelines_updated_by_idx on app.crm_pipelines (updated_by);
alter table app.crm_pipelines enable row level security;
revoke all on app.crm_pipelines from public, anon, authenticated;

insert into app.crm_pipelines (key, name, sort) values ('sales', 'Sales', 10);

create function app.crm_default_pipeline() returns uuid language sql stable security definer set search_path = '' as $$
  select p.id from app.crm_pipelines p where p.key = 'sales'
$$;
revoke all on function app.crm_default_pipeline() from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------ stages
alter table app.crm_stages
  add column pipeline_id uuid references app.crm_pipelines (id) on delete restrict,
  add column probability int check (probability between 0 and 100),
  add column rot_days int check (rot_days between 1 and 365);
update app.crm_stages set pipeline_id = app.crm_default_pipeline();
alter table app.crm_stages
  alter column pipeline_id set not null,
  alter column pipeline_id set default app.crm_default_pipeline(),
  add constraint crm_stages_key_pipeline unique (key, pipeline_id);
create index crm_stages_pipeline_idx on app.crm_stages (pipeline_id, sort);
comment on column app.crm_stages.probability is 'The chance a deal in this stage is won, 0–100; unset: none given (0203). A deal may set its own.';
comment on column app.crm_stages.rot_days is 'Days without progress after which a deal in this stage is rotting; unset: never (0203, read by WP-1.2).';

-- ------------------------------------------------------------------------------------------ deals
create table app.crm_deals (
  id               uuid primary key default gen_random_uuid(),
  product_id       text not null default 'orgpuls',
  title            text not null check (char_length(btrim(title)) between 1 and 200),
  company_id       uuid references app.crm_companies (id) on delete cascade,
  contact_id       uuid references app.crm_contacts (id) on delete set null,
  value            numeric(14, 2) check (value between 0 and 1000000000),
  currency         text not null default 'NOK' check (currency ~ '^[A-Z]{3}$'),
  pipeline_id      uuid not null default app.crm_default_pipeline(),
  stage            text not null,
  stage_changed_at timestamptz not null default now(),
  status           text not null default 'open' check (status in ('open', 'won', 'lost')),
  closed_at        timestamptz,
  owner_id         uuid references auth.users (id) on delete set null,
  expected_close   date,
  probability      int check (probability between 0 and 100),
  lost_text        text check (char_length(lost_text) <= 300),
  source           text not null default 'manual' check (source in ('manual', 'import', 'signup', 'brreg', 'lead', 'api')),
  company_primary  boolean not null default false,
  archived_at      timestamptz,
  custom           jsonb not null default '{}' check (jsonb_typeof(custom) = 'object'),
  visibility       text not null default app.crm_default_visibility() check (visibility in ('owner', 'group', 'group_tree', 'everyone')),
  version          int not null default 1 check (version >= 1),
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users (id) on delete set null,
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users (id) on delete set null,
  deleted_at       timestamptz,
  deleted_by       uuid references auth.users (id) on delete set null,
  constraint crm_deals_stage_fk foreign key (stage, pipeline_id) references app.crm_stages (key, pipeline_id) on update cascade on delete restrict,
  constraint crm_deals_pipeline_fk foreign key (pipeline_id) references app.crm_pipelines (id) on delete restrict,
  -- the company's value is in NOK until currencies exist (WP-1.9), so the deal that mirrors it is too
  constraint crm_deals_primary_nok check (not company_primary or (currency = 'NOK' and company_id is not null)),
  constraint crm_deals_closed check ((status = 'open') = (closed_at is null))
);
comment on table app.crm_deals is
  'Deals (0203). A title is all a deal needs. company_primary marks the deal a company was until 0203: its stage, value and owner mirror the company''s.';
create unique index crm_deals_company_primary on app.crm_deals (company_id) where company_primary;
create index crm_deals_company_idx on app.crm_deals (company_id);
create index crm_deals_contact_idx on app.crm_deals (contact_id);
create index crm_deals_board_idx on app.crm_deals (pipeline_id, stage) where deleted_at is null and archived_at is null;
create index crm_deals_stage_fk_idx on app.crm_deals (stage, pipeline_id);
create index crm_deals_owner_idx on app.crm_deals (owner_id);
create index crm_deals_created_by_idx on app.crm_deals (created_by);
create index crm_deals_updated_by_idx on app.crm_deals (updated_by);
create index crm_deals_deleted_by_idx on app.crm_deals (deleted_by);
create index crm_deals_closed_idx on app.crm_deals (closed_at) where status <> 'open';
alter table app.crm_deals enable row level security;
revoke all on app.crm_deals from public, anon, authenticated;

-- status follows the stage's kind (a parked stage is open); closed_at is when it last closed
create function app.crm_deal_status() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_kind text := (select s.kind from app.crm_stages s where s.key = new.stage);
  v_status text := case v_kind when 'won' then 'won' when 'lost' then 'lost' else 'open' end;
begin
  if tg_op = 'INSERT' or new.status is distinct from v_status or old.stage is distinct from new.stage then
    if tg_op = 'UPDATE' and old.stage is distinct from new.stage then
      new.stage_changed_at := now();
    end if;
    new.closed_at := case when v_status = 'open' then null
                          when tg_op = 'UPDATE' and old.status = v_status then old.closed_at
                          else coalesce(case when tg_op = 'INSERT' then new.closed_at end, new.stage_changed_at) end;
    new.status := v_status;
  end if;
  return new;
end $$;
revoke all on function app.crm_deal_status() from public, anon, authenticated;
create trigger crm_deals_status before insert or update of stage, status on app.crm_deals for each row execute function app.crm_deal_status();

-- the standard columns and the history (0194) take deals as a fourth entity
create trigger crm_deals_stamp before insert or update on app.crm_deals for each row execute function app.crm_stamp();

-- ------------------------------------------------------------------------------------------ the history, from deals
alter table app.crm_stage_changes
  add column deal_id uuid references app.crm_deals (id) on delete cascade,
  add column pipeline_id uuid references app.crm_pipelines (id) on delete cascade,
  add column left_at timestamptz,
  alter column company_id drop not null;
create index crm_stage_changes_deal on app.crm_stage_changes (deal_id, changed_at desc);
create index crm_stage_changes_pipeline on app.crm_stage_changes (pipeline_id);
comment on column app.crm_stage_changes.left_at is 'When the deal left this stage for the next (0203): changed_at to left_at is its time in the stage.';

-- The history is a record. Its content — whose change it was, from where to where and when — never changes. Two
-- things may: left_at, set once when the deal moves on; and the row's removal when its company or deal is already
-- gone (CLAUDE.md: immutability permits referential maintenance).
create or replace function app.crm_stage_changes_guard() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if tg_op = 'UPDATE' then
    if (old.company_id, old.deal_id, old.pipeline_id, old.from_stage, old.from_kind, old.to_stage, old.to_kind, old.changed_at)
         is distinct from (new.company_id, new.deal_id, new.pipeline_id, new.from_stage, new.from_kind, new.to_stage, new.to_kind, new.changed_at)
       or (old.left_at is not null and old.left_at is distinct from new.left_at) then
      raise exception 'crm_stage_changes is a record: rows are not changed';
    end if;
    return new;
  end if;
  if (old.company_id is null or exists (select 1 from app.crm_companies c where c.id = old.company_id))
     and (old.deal_id is null or exists (select 1 from app.crm_deals d where d.id = old.deal_id)) then
    raise exception 'crm_stage_changes is a record: rows go only with their company or deal';
  end if;
  return old;
end $fn$;

-- ------------------------------------------------------------------------------------------ the data move
-- one primary deal per company, carrying what the company carries today
insert into app.crm_deals (title, company_id, value, currency, pipeline_id, stage, stage_changed_at, owner_id, lost_text,
                           source, company_primary, custom, visibility, created_at, created_by, updated_at, deleted_at, deleted_by)
select c.name, c.id, c.value_nok, 'NOK', app.crm_default_pipeline(), c.stage, c.stage_changed_at, c.owner_id, c.lost_reason,
       c.source, true, '{}', c.visibility, c.created_at, c.created_by, c.updated_at, c.deleted_at, c.deleted_by
from app.crm_companies c;

-- the stage history is re-pointed at it; left_at is the next change's time
alter table app.crm_stage_changes disable trigger crm_stage_changes_guard;
update app.crm_stage_changes h set deal_id = d.id, pipeline_id = d.pipeline_id,
  left_at = (select min(n.changed_at) from app.crm_stage_changes n
             where n.company_id = h.company_id and (n.changed_at, n.id) > (h.changed_at, h.id))
from app.crm_deals d where d.company_id = h.company_id and d.company_primary;
alter table app.crm_stage_changes enable trigger crm_stage_changes_guard;

-- the company stops recording; the deal records
drop trigger crm_stage_record on app.crm_companies;
drop function app.crm_stage_record();

create function app.crm_deal_stage_record() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if tg_op = 'INSERT' or old.stage is distinct from new.stage then
    if tg_op = 'UPDATE' then
      update app.crm_stage_changes h set left_at = now() where h.deal_id = new.id and h.left_at is null;
    end if;
    insert into app.crm_stage_changes (company_id, deal_id, pipeline_id, from_stage, from_kind, to_stage, to_kind)
    values (new.company_id, new.id, new.pipeline_id,
            case when tg_op = 'UPDATE' then old.stage end,
            case when tg_op = 'UPDATE' then (select s.kind from app.crm_stages s where s.key = old.stage) end,
            new.stage,
            (select s.kind from app.crm_stages s where s.key = new.stage));
  end if;
  return null;
end $fn$;
revoke all on function app.crm_deal_stage_record() from public, anon, authenticated;
create trigger crm_deals_stage_record after insert or update of stage on app.crm_deals
  for each row execute function app.crm_deal_stage_record();

-- ------------------------------------------------------------------------------------------ the mirror (until WP-3)
-- A company and its primary deal hold the same stage, value and owner. Whichever is written, the other follows, once:
-- app.crm_mirror marks the follow so it does not echo back.
create function app.crm_company_to_deal() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if current_setting('app.crm_mirror', true) = 'on' then
    return null;
  end if;
  perform set_config('app.crm_mirror', 'on', true);
  if tg_op = 'INSERT' then
    insert into app.crm_deals (title, company_id, value, pipeline_id, stage, stage_changed_at, owner_id, lost_text, source,
                               company_primary, visibility, created_at, created_by)
    values (new.name, new.id, new.value_nok, (select s.pipeline_id from app.crm_stages s where s.key = new.stage), new.stage,
            new.stage_changed_at, new.owner_id, new.lost_reason, new.source, true, new.visibility, new.created_at, new.created_by);
  else
    -- a company in the restore list leaves its deals where they are: readers leave out a deleted company's deals
    update app.crm_deals d set stage = new.stage, value = new.value_nok, owner_id = new.owner_id, lost_text = new.lost_reason, updated_at = now()
    where d.company_id = new.id and d.company_primary
      and (d.stage, d.value, d.owner_id, d.lost_text) is distinct from (new.stage, new.value_nok::numeric, new.owner_id, new.lost_reason);
  end if;
  perform set_config('app.crm_mirror', '', true);
  return null;
end $fn$;
revoke all on function app.crm_company_to_deal() from public, anon, authenticated;
create trigger crm_companies_to_deal after insert or update of stage, value_nok, owner_id, lost_reason on app.crm_companies
  for each row execute function app.crm_company_to_deal();

create function app.crm_deal_to_company() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not new.company_primary or current_setting('app.crm_mirror', true) = 'on' then
    return null;
  end if;
  perform set_config('app.crm_mirror', 'on', true);
  update app.crm_companies c set stage = new.stage, stage_changed_at = new.stage_changed_at, value_nok = round(new.value)::int,
                                 owner_id = new.owner_id, lost_reason = new.lost_text, updated_at = now()
  where c.id = new.company_id
    and (c.stage, c.value_nok, c.owner_id, c.lost_reason) is distinct from (new.stage, round(new.value)::int, new.owner_id, new.lost_text);
  perform set_config('app.crm_mirror', '', true);
  return null;
end $fn$;
revoke all on function app.crm_deal_to_company() from public, anon, authenticated;
create trigger crm_deals_to_company after update of stage, value, owner_id, lost_text on app.crm_deals
  for each row execute function app.crm_deal_to_company();

-- ------------------------------------------------------------------------------------------ events and changelog
alter table app.crm_event_types drop constraint crm_event_types_entity_check,
  add constraint crm_event_types_entity_check check (entity in ('company', 'contact', 'activity', 'deal'));
alter table app.crm_events drop constraint crm_events_entity_check,
  add constraint crm_events_entity_check check (entity in ('company', 'contact', 'activity', 'deal'));
alter table app.crm_changes drop constraint crm_changes_entity_check,
  add constraint crm_changes_entity_check check (entity in ('company', 'contact', 'activity', 'deal'));
insert into app.crm_event_types (name, entity, description) values
  ('deal.added',         'deal', 'A deal was created: by hand, import, a lead''s conversion or with its company'),
  ('deal.updated',       'deal', 'A tracked field of a deal changed; the event names the fields'),
  ('deal.stage_changed', 'deal', 'A deal moved to another stage'),
  ('deal.won',           'deal', 'A deal reached a won stage'),
  ('deal.lost',          'deal', 'A deal reached a lost stage'),
  ('deal.deleted',       'deal', 'A deal was removed'),
  ('deal.restored',      'deal', 'A deal came back from the restore list'),
  ('deal.purged',        'deal', 'A deal left the restore list for good');

create or replace function app.crm_track() returns trigger
  language plpgsql security definer set search_path = ''
as $function$
declare
  v_entity text := case tg_table_name when 'crm_companies' then 'company' when 'crm_contacts' then 'contact'
                                      when 'crm_deals' then 'deal' else 'activity' end;
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
    if v_entity in ('company', 'deal') and 'stage' = any (v_fields) then
      insert into app.crm_events (name, entity, record_id, actor, source, fields) values (v_entity || '.stage_changed', v_entity, v_id, v_actor, v_source, array['stage']);
    end if;
    -- 0203: a deal that closes says how
    if v_entity = 'deal' and 'status' = any (v_fields) and v_new ->> 'status' in ('won', 'lost') then
      insert into app.crm_events (name, entity, record_id, actor, source, fields) values ('deal.' || (v_new ->> 'status'), v_entity, v_id, v_actor, v_source, array['status']);
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

-- the deal's stage_changed_at and closed_at are bookkeeping, like the company's
create or replace function app.crm_untracked() returns text[] language sql immutable set search_path = '' as $$
  select array['id', 'product_id', 'created_at', 'updated_at', 'version', 'created_by', 'updated_by', 'stage_changed_at',
               'last_activity_at', 'last_engaged_at', 'manager_seen_at', 'optin_hash', 'optin_sent_at', 'admin_email',
               'deleted_at', 'deleted_by', 'deleted_source', 'deleted_with', 'closed_at']
$$;

create trigger crm_deals_track after insert or update or delete on app.crm_deals for each row execute function app.crm_track();

-- a deal's history lines go only with the deal, as 0194's do with their record
create or replace function app.crm_changes_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'crm_changes is a record: lines are not changed' using errcode = 'check_violation';
  end if;
  if (old.entity = 'company' and exists (select 1 from app.crm_companies x where x.id = old.record_id))
     or (old.entity = 'contact' and exists (select 1 from app.crm_contacts x where x.id = old.record_id))
     or (old.entity = 'activity' and exists (select 1 from app.crm_activities x where x.id = old.record_id))
     or (old.entity = 'deal' and exists (select 1 from app.crm_deals x where x.id = old.record_id)) then
    raise exception 'crm_changes is a record: a line goes only with its record' using errcode = 'check_violation';
  end if;
  return old;
end $$;

-- ------------------------------------------------------------------------------------------ moving a deal
-- One deal to a stage of its own pipeline, as a person or an automatic move asks. Returns why not, or null when it moved.
create function app.crm_deal_set_stage(p_deal uuid, p_to text, p_why text default null) returns text
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_d app.crm_deals;
  v_to app.crm_stages;
begin
  select * into v_d from app.crm_deals where id = p_deal for update;
  select * into v_to from app.crm_stages where key = p_to;
  if v_d.id is null or v_d.deleted_at is not null then
    return 'not_found';
  end if;
  if v_to.key is null or v_to.pipeline_id <> v_d.pipeline_id or v_to.managed or v_to.archived_at is not null then
    return 'invalid_stage';
  end if;
  if v_d.stage = v_to.key then
    return 'same';
  end if;
  update app.crm_deals set stage = v_to.key, updated_at = now() where id = p_deal;
  if v_d.company_id is not null then
    perform app.crm_log(v_d.company_id, null, 'stage', v_d.stage || ' → ' || v_to.key || coalesce(': ' || left(p_why, 300), ''));
  end if;
  return null;
end $fn$;
revoke all on function app.crm_deal_set_stage(uuid, text, text) from public, anon, authenticated;

-- An automatic move (a campaign sent, an answer logged) moves the company's primary deal; the rules are 0093's.
create or replace function app.crm_advance(p_company uuid, p_to text, p_why text) returns boolean
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_co app.crm_companies;
  v_deal uuid;
  v_from app.crm_stages;
  v_to app.crm_stages;
begin
  select * into v_co from app.crm_companies where id = p_company for update;
  select * into v_to from app.crm_stages where key = p_to;
  if v_co.id is null or v_to.key is null or v_co.org_id is not null or v_to.managed or v_to.archived_at is not null then
    return false;
  end if;
  select * into v_from from app.crm_stages where key = v_co.stage;
  if v_from.kind <> 'open' or v_from.managed or v_from.key = v_to.key or (v_to.kind = 'open' and v_to.sort <= v_from.sort) then
    return false;
  end if;
  select d.id into v_deal from app.crm_deals d where d.company_id = p_company and d.company_primary;
  return app.crm_deal_set_stage(v_deal, v_to.key, p_why) is null;
end $fn$;

-- A person moves companies, one or many: each company's primary deal, to a stage, or (p_to null) to the next open
-- stage after its own. 0192's limit, 0195's restore list, 0196's set and visibility and 0197's required fields hold.
create or replace function public.admin_crm_stage_move(p_ids uuid[], p_to text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_id uuid;
  v_co app.crm_companies;
  v_deal uuid;
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
    select d.id into v_deal from app.crm_deals d where d.company_id = v_id and d.company_primary;
    if v_co.id is null or v_deal is null or v_co.org_id is not null or v_co.deleted_at is not null or not app.crm_visible(v_co.owner_id, v_co.visibility) then
      v_skipped := v_skipped + 1; continue;
    end if;
    v_to := coalesce(p_to, (
      select n.key from app.crm_stages cur, app.crm_stages n
      where cur.key = v_co.stage and cur.kind = 'open' and n.kind = 'open' and not n.managed and n.archived_at is null
        and n.pipeline_id = cur.pipeline_id and n.sort > cur.sort
      order by n.sort limit 1));
    if v_to is null or v_to = v_co.stage then
      v_skipped := v_skipped + 1; continue;
    end if;
    -- 0197: a deal does not move to a stage whose required fields are empty (CUS-02)
    if cardinality(app.crm_custom_missing('company', v_co.custom, v_to)) > 0 then
      v_skipped := v_skipped + 1; v_blocked := v_blocked + 1; continue;
    end if;
    if app.crm_deal_set_stage(v_deal, v_to) is null then
      v_moved := v_moved + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;
  perform app.admin_log('crm.stage_move', null, 'crm_company', null, null,
    jsonb_build_object('to', coalesce(p_to, 'next'), 'moved', v_moved, 'skipped', v_skipped, 'blocked', v_blocked));
  return jsonb_build_object('ok', true, 'moved', v_moved, 'skipped', v_skipped, 'blocked', v_blocked);
end $fn$;

-- ------------------------------------------------------------------------------------------ the pipeline in figures
-- 0137's figures, read from deals: a deal counts where its owner and visibility let the reader see it, and not while
-- it or its company is in the restore list or the deal is archived. The win rate is per deal. For the migrated
-- history — one deal per company, with the company's owner and visibility — the figures are 0137's.
drop function public.admin_crm_pipeline_summary(timestamptz);
create function public.admin_crm_pipeline_summary(p_from timestamptz default null, p_pipeline uuid default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_quarter timestamptz := date_trunc('quarter', now() at time zone 'Europe/Oslo') at time zone 'Europe/Oslo';
  v_history timestamptz := (select s.stage_history_since from app.crm_settings s where s.id);
  v_pipeline uuid := coalesce(p_pipeline, app.crm_default_pipeline());
  v_since timestamptz;
begin
  if not app.crm_can('deals.reports') then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not exists (select 1 from app.crm_pipelines p where p.id = v_pipeline) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform app.admin_log('crm.pipeline');
  v_since := greatest(coalesce(p_from, v_quarter), coalesce(v_history, now()));
  return jsonb_build_object('ok', true,
    'pipeline', v_pipeline,
    'stages', (select coalesce(jsonb_agg(jsonb_build_object('key', x.key, 'count', x.n, 'valued', x.valued, 'value', x.value) order by x.sort), '[]')
               from (select s.key, s.sort, count(d.id) as n, count(d.value) as valued, trim_scale(coalesce(sum(d.value), 0)) as value
                     from app.crm_stages s left join app.crm_deals d on d.stage = s.key and app.crm_deal_counts(d)
                     where s.pipeline_id = v_pipeline
                     group by s.key, s.sort) x),
    'open', (select jsonb_build_object('count', count(*), 'valued', count(d.value), 'value', trim_scale(coalesce(sum(d.value), 0)))
             from app.crm_deals d join app.crm_stages s on s.key = d.stage
             where d.pipeline_id = v_pipeline and app.crm_deal_counts(d) and s.kind = 'open' and s.archived_at is null),
    'won_quarter', (select jsonb_build_object('count', count(*), 'valued', count(d.value), 'value', trim_scale(coalesce(sum(d.value), 0)))
                    from app.crm_deals d join app.crm_stages s on s.key = d.stage
                    where d.pipeline_id = v_pipeline and app.crm_deal_counts(d) and s.kind = 'won' and d.stage_changed_at >= v_quarter),
    'closed', (select jsonb_build_object('won', count(*) filter (where x.to_kind = 'won'), 'lost', count(*) filter (where x.to_kind = 'lost'))
               from (select distinct on (h.deal_id) h.deal_id, h.to_kind
                     from app.crm_stage_changes h
                     join app.crm_deals hd on hd.id = h.deal_id and app.crm_deal_counts(hd)
                     where hd.pipeline_id = v_pipeline and h.changed_at >= v_since and h.to_kind in ('won', 'lost') and h.from_kind in ('open', 'parked')
                     order by h.deal_id, h.changed_at desc, h.id desc) x),
    'since', v_since,
    'history_since', v_history,
    'quarter', v_quarter);
end $fn$;
revoke all on function public.admin_crm_pipeline_summary(timestamptz, uuid) from public, anon;
grant execute on function public.admin_crm_pipeline_summary(timestamptz, uuid) to authenticated;

-- a deal the reader may count: visible, not archived, neither it nor its company in the restore list
create function app.crm_deal_counts(d app.crm_deals) returns boolean language sql stable security definer set search_path = '' as $$
  select d.deleted_at is null and d.archived_at is null and app.crm_visible(d.owner_id, d.visibility)
     and (d.company_id is null or exists (select 1 from app.crm_companies c where c.id = d.company_id and c.deleted_at is null))
$$;
revoke all on function app.crm_deal_counts(app.crm_deals) from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------ the stages, per pipeline
create or replace function public.admin_crm_stages() returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('crm.stages');
  return jsonb_build_object('ok', true,
    'reply_stage', (select s.reply_stage from app.crm_settings s),
    'pipelines', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'key', p.key, 'name', p.name, 'sort', p.sort,
                    'archived', p.archived_at is not null,
                    'deals', (select count(*) from app.crm_deals d where d.pipeline_id = p.id and d.status = 'open' and app.crm_deal_counts(d)))
                  order by p.sort, p.name), '[]') from app.crm_pipelines p),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('key', s.key, 'name', s.name, 'sort', s.sort, 'kind', s.kind, 'managed', s.managed,
               'archived', s.archived_at is not null, 'exit_criterion', s.exit_criterion,
               'pipeline', s.pipeline_id, 'probability', s.probability, 'rot_days', s.rot_days,
               'companies', (select count(*) from app.crm_companies co where co.stage = s.key and co.deleted_at is null and app.crm_visible(co.owner_id, co.visibility)),
               'deals', (select count(*) from app.crm_deals d where d.stage = s.key and app.crm_deal_counts(d)),
               'campaigns', (select count(*) from app.crm_campaigns c where s.key in (c.stage_target, c.stage_on_send)))
             order by s.sort, s.key), '[]') from app.crm_stages s));
end $fn$;

-- Add or change a stage. 0203: a new stage names its pipeline (the sales pipeline if not); a stage keeps its
-- pipeline; probability and rot_days may be set or cleared; a stage that holds deals is not archived.
create or replace function public.admin_crm_stage_save(p_key text, p jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_old app.crm_stages;
  v_kind text := coalesce(p->>'kind', 'open');
  v_exit text := nullif(btrim(coalesce(p->>'exit_criterion', '')), '');
  v_pipeline uuid;
  v_prob int;
  v_rot int;
begin
  if not (app.crm_can('global.settings')) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if coalesce(p_key, '') !~ '^[a-z][a-z0-9_]{1,39}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_key');
  end if;
  if char_length(btrim(coalesce(p->>'name', ''))) not between 1 and 60 or coalesce(p->>'sort', '') !~ '^[0-9]{1,4}$'
     or v_kind not in ('open', 'won', 'lost', 'parked') or char_length(coalesce(v_exit, '')) > 200
     or coalesce(p->>'probability', '') !~ '^([0-9]{1,3})?$' or coalesce(p->>'rot_days', '') !~ '^([0-9]{1,3})?$'
     or coalesce(p->>'pipeline', '') !~ '^([0-9a-f-]{36})?$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  v_prob := nullif(p->>'probability', '')::int;
  v_rot := nullif(p->>'rot_days', '')::int;
  if v_prob > 100 or v_rot not between 1 and 365 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select * into v_old from app.crm_stages where key = p_key;
  if v_old.key is null then
    v_pipeline := coalesce(nullif(p->>'pipeline', '')::uuid, app.crm_default_pipeline());
    if not exists (select 1 from app.crm_pipelines pl where pl.id = v_pipeline and pl.archived_at is null) then
      return jsonb_build_object('ok', false, 'error', 'invalid');
    end if;
    insert into app.crm_stages (key, name, sort, kind, exit_criterion, pipeline_id, probability, rot_days)
    values (p_key, btrim(p->>'name'), (p->>'sort')::int, v_kind, v_exit, v_pipeline, v_prob, v_rot);
    perform app.admin_log('crm.stage_create', null, 'crm_stage', p_key);
    return jsonb_build_object('ok', true);
  end if;
  if nullif(p->>'pipeline', '')::uuid is distinct from v_old.pipeline_id and nullif(p->>'pipeline', '') is not null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if v_old.managed and v_kind <> v_old.kind then
    return jsonb_build_object('ok', false, 'error', 'managed');
  end if;
  if coalesce((p->>'archived')::boolean, false) and (v_old.managed
      or exists (select 1 from app.crm_companies co where co.stage = p_key)
      or exists (select 1 from app.crm_deals d where d.stage = p_key and d.deleted_at is null)
      or exists (select 1 from app.crm_campaigns c where c.status in ('draft', 'scheduled', 'sending') and p_key in (c.stage_target, c.stage_on_send))
      or (select s.reply_stage from app.crm_settings s) = p_key) then
    return jsonb_build_object('ok', false, 'error', 'in_use');
  end if;
  update app.crm_stages set name = btrim(p->>'name'), sort = (p->>'sort')::int, kind = v_kind,
    exit_criterion = case when p ? 'exit_criterion' then v_exit else exit_criterion end,
    probability = case when p ? 'probability' then v_prob else probability end,
    rot_days = case when p ? 'rot_days' then v_rot else rot_days end,
    archived_at = case when coalesce((p->>'archived')::boolean, false) then coalesce(archived_at, now()) end
  where key = p_key;
  -- a kind that changed closes or reopens the deals in it
  if v_kind <> v_old.kind then
    update app.crm_deals d set status = case v_kind when 'won' then 'won' when 'lost' then 'lost' else 'open' end
    where d.stage = p_key;
  end if;
  perform app.admin_log('crm.stage_update', null, 'crm_stage', p_key);
  return jsonb_build_object('ok', true);
end $fn$;

-- Remove a stage: its deals move to another stage of the same pipeline first, each recorded as a move. A stage the
-- plan manages, a campaign aims at or the reply rule names is not removed.
create function public.admin_crm_stage_delete(p_key text, p_to text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_old app.crm_stages;
  v_to app.crm_stages;
  v_deal uuid;
  v_moved int := 0;
begin
  if not app.crm_can('global.settings') then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select * into v_old from app.crm_stages where key = p_key for update;
  if v_old.key is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_old.managed or exists (select 1 from app.crm_campaigns c where p_key in (c.stage_target, c.stage_on_send))
     or (select s.reply_stage from app.crm_settings s) = p_key then
    return jsonb_build_object('ok', false, 'error', 'in_use');
  end if;
  select * into v_to from app.crm_stages where key = p_to;
  if exists (select 1 from app.crm_deals d where d.stage = p_key)
     and (v_to.key is null or v_to.key = p_key or v_to.pipeline_id <> v_old.pipeline_id or v_to.managed or v_to.archived_at is not null) then
    return jsonb_build_object('ok', false, 'error', 'invalid_stage');
  end if;
  for v_deal in select d.id from app.crm_deals d where d.stage = p_key loop
    -- a deal in the restore list moves too, so it can come back
    update app.crm_deals set stage = v_to.key, updated_at = now() where id = v_deal;
    v_moved := v_moved + 1;
  end loop;
  delete from app.crm_stages where key = p_key;
  perform app.admin_log('crm.stage_delete', null, 'crm_stage', p_key, null, jsonb_build_object('to', p_to, 'moved', v_moved));
  return jsonb_build_object('ok', true, 'moved', v_moved);
end $fn$;
revoke all on function public.admin_crm_stage_delete(text, text) from public, anon;
grant execute on function public.admin_crm_stage_delete(text, text) to authenticated;

-- ------------------------------------------------------------------------------------------ pipelines, for the admin
create function public.admin_crm_pipeline_save(p_id uuid, p jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_name text := btrim(coalesce(p->>'name', ''));
  v_key text := coalesce(p->>'key', '');
  v_id uuid := p_id;
  v_archive boolean := coalesce((p->>'archived')::boolean, false);
begin
  if not app.crm_can('global.settings') then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(v_name) not between 1 and 60 or coalesce(p->>'sort', '0') !~ '^[0-9]{1,4}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if p_id is null then
    if v_key !~ '^[a-z][a-z0-9_]{1,39}$' then
      return jsonb_build_object('ok', false, 'error', 'invalid_key');
    end if;
    if exists (select 1 from app.crm_pipelines pl where pl.key = v_key) then
      return jsonb_build_object('ok', false, 'error', 'exists');
    end if;
    insert into app.crm_pipelines (key, name, sort) values (v_key, v_name, coalesce((p->>'sort')::int, 0)) returning id into v_id;
    perform app.admin_log('crm.pipeline_create', null, 'crm_pipeline', v_id::text, null, jsonb_build_object('key', v_key));
    return jsonb_build_object('ok', true, 'id', v_id);
  end if;
  if not exists (select 1 from app.crm_pipelines pl where pl.id = p_id) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  -- the sales pipeline holds the managed stages; an archived pipeline holds no open deal
  if v_archive and (p_id = app.crm_default_pipeline()
      or exists (select 1 from app.crm_deals d where d.pipeline_id = p_id and d.status = 'open' and d.deleted_at is null)) then
    return jsonb_build_object('ok', false, 'error', 'in_use');
  end if;
  update app.crm_pipelines set name = v_name, sort = coalesce((p->>'sort')::int, sort),
    archived_at = case when v_archive then coalesce(archived_at, now()) end, updated_at = now(), updated_by = auth.uid()
  where id = p_id;
  perform app.admin_log('crm.pipeline_update', null, 'crm_pipeline', p_id::text);
  return jsonb_build_object('ok', true, 'id', p_id);
end $fn$;
revoke all on function public.admin_crm_pipeline_save(uuid, jsonb) from public, anon;
grant execute on function public.admin_crm_pipeline_save(uuid, jsonb) to authenticated;

-- ------------------------------------------------------------------------------------------ deals, for the admin
create function app.crm_deal_json(d app.crm_deals) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', d.id, 'title', d.title, 'company_id', d.company_id,
    -- the names the reader may see: a company hidden from them or in the restore list, a contact in it, stay unnamed
    'company', (select c.name from app.crm_companies c where c.id = d.company_id and c.deleted_at is null and app.crm_visible(c.owner_id, c.visibility)),
    'contact_id', d.contact_id,
    'contact', (select coalesce(ct.name, ct.email) from app.crm_contacts ct where ct.id = d.contact_id and ct.deleted_at is null),
    'value', trim_scale(d.value), 'currency', d.currency, 'pipeline', d.pipeline_id, 'stage', d.stage, 'stage_changed_at', d.stage_changed_at,
    'status', d.status, 'closed_at', d.closed_at, 'owner_id', d.owner_id,
    'owner', (select u.email::text from auth.users u where u.id = d.owner_id),
    'expected_close', d.expected_close, 'probability', d.probability,
    'stage_probability', (select s.probability from app.crm_stages s where s.key = d.stage),
    'lost_text', d.lost_text, 'source', d.source, 'primary', d.company_primary, 'visibility', d.visibility,
    'archived', d.archived_at is not null, 'created_at', d.created_at, 'updated_at', d.updated_at, 'version', d.version)
$$;
revoke all on function app.crm_deal_json(app.crm_deals) from public, anon, authenticated;

-- The deals of a pipeline: open ones by default, or won, lost or all; filtered by company or by words in the title.
create function public.admin_crm_deals(p_pipeline uuid default null, p_status text default 'open', p_q text default null,
                                       p_company uuid default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_pipeline uuid := coalesce(p_pipeline, app.crm_default_pipeline());
  v_q text := nullif(lower(btrim(coalesce(p_q, ''))), '');
  v_limit int := app.crm_limit('limit_company_read');
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if coalesce(p_status, '') not in ('open', 'won', 'lost', 'all') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  perform app.admin_log('crm.deals');
  return jsonb_build_object('ok', true, 'pipeline', v_pipeline,
    'may', app.crm_may('deals'),
    'rows', (select coalesce(jsonb_agg(app.crm_deal_json(d) order by d.stage_changed_at desc), '[]') from (
        select d.* from app.crm_deals d
        where app.crm_deal_counts(d) and (p_company is not null or d.pipeline_id = v_pipeline)
          and (p_status = 'all' or d.status = p_status)
          and (p_company is null or d.company_id = p_company)
          and (v_q is null or lower(d.title) like '%' || v_q || '%')
        order by d.stage_changed_at desc limit v_limit) d),
    'limit', v_limit);
end $fn$;
revoke all on function public.admin_crm_deals(uuid, text, text, uuid) from public, anon;
grant execute on function public.admin_crm_deals(uuid, text, text, uuid) to authenticated;

-- One deal, with its stage history.
create function public.admin_crm_deal(p_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_d app.crm_deals;
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select * into v_d from app.crm_deals d where d.id = p_id;
  if v_d.id is null or not app.crm_deal_counts(v_d) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform app.admin_log('crm.deal', null, 'crm_deal', p_id::text);
  return jsonb_build_object('ok', true, 'deal', app.crm_deal_json(v_d), 'may', app.crm_may('deals'),
    'stages', (select coalesce(jsonb_agg(jsonb_build_object('key', s.key, 'name', s.name, 'kind', s.kind, 'managed', s.managed) order by s.sort), '[]')
               from app.crm_stages s where s.pipeline_id = v_d.pipeline_id and s.archived_at is null),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('from', h.from_stage, 'to', h.to_stage, 'at', h.changed_at,
                  'days', round(extract(epoch from (coalesce(h.left_at, now()) - h.changed_at)) / 86400)::int) order by h.changed_at desc, h.id desc), '[]')
                from app.crm_stage_changes h where h.deal_id = p_id));
end $fn$;
revoke all on function public.admin_crm_deal(uuid) from public, anon;
grant execute on function public.admin_crm_deal(uuid) to authenticated;

-- Add a deal (no id) or change one. A title is all it needs; the rest is checked when given. A primary deal's
-- company, pipeline and currency stay as they are (the company mirrors it); a customer's primary deal follows its plan.
create function public.admin_crm_deal_save(p_id uuid, p jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_old app.crm_deals;
  v_title text := btrim(coalesce(p->>'title', ''));
  v_company uuid;
  v_contact uuid;
  v_pipeline uuid;
  v_stage text;
  v_owner uuid;
  v_value numeric;
  v_currency text := upper(coalesce(nullif(p->>'currency', ''), 'NOK'));
  v_close date;
  v_prob int;
  v_lost text := nullif(btrim(coalesce(p->>'lost_text', '')), '');
  v_vis text;
  v_id uuid := p_id;
  v_why text;
begin
  if not app.crm_can(case when p_id is null then 'deals.create' else 'deals.edit' end) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(v_title) not between 1 and 200 or v_currency !~ '^[A-Z]{3}$' or char_length(coalesce(v_lost, '')) > 300
     or coalesce(p->>'value', '') !~ '^([0-9]{1,10}(\.[0-9]{1,2})?)?$' or coalesce(p->>'probability', '') !~ '^([0-9]{1,3})?$'
     or coalesce(p->>'expected_close', '') !~ '^([0-9]{4}-[0-9]{2}-[0-9]{2})?$'
     or coalesce(p->>'company_id', '') !~ '^([0-9a-f-]{36})?$' or coalesce(p->>'contact_id', '') !~ '^([0-9a-f-]{36})?$'
     or coalesce(p->>'owner_id', '') !~ '^([0-9a-f-]{36})?$' or coalesce(p->>'pipeline', '') !~ '^([0-9a-f-]{36})?$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  v_value := nullif(p->>'value', '')::numeric;
  v_prob := nullif(p->>'probability', '')::int;
  v_close := nullif(p->>'expected_close', '')::date;
  if v_prob > 100 or v_value > 1000000000 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if p_id is not null then
    select * into v_old from app.crm_deals d where d.id = p_id for update;
    if v_old.id is null or not app.crm_deal_counts(v_old) then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
  end if;
  v_company := case when p ? 'company_id' then nullif(p->>'company_id', '')::uuid else v_old.company_id end;
  v_contact := case when p ? 'contact_id' then nullif(p->>'contact_id', '')::uuid else v_old.contact_id end;
  v_pipeline := coalesce(nullif(p->>'pipeline', '')::uuid, v_old.pipeline_id, app.crm_default_pipeline());
  v_owner := case when p ? 'owner_id' then nullif(p->>'owner_id', '')::uuid else coalesce(v_old.owner_id, auth.uid()) end;
  v_vis := coalesce(nullif(p->>'visibility', ''), v_old.visibility, app.crm_default_visibility());
  if v_old.company_primary and (v_company is distinct from v_old.company_id or v_pipeline <> v_old.pipeline_id or v_currency <> 'NOK') then
    return jsonb_build_object('ok', false, 'error', 'primary');
  end if;
  if v_company is not null and not exists (select 1 from app.crm_companies c where c.id = v_company and c.deleted_at is null
                                           and app.crm_visible(c.owner_id, c.visibility)) then
    return jsonb_build_object('ok', false, 'error', 'invalid_company');
  end if;
  if v_contact is not null and not exists (select 1 from app.crm_contacts ct where ct.id = v_contact and ct.deleted_at is null
                                           and (v_company is null or ct.company_id = v_company)) then
    return jsonb_build_object('ok', false, 'error', 'invalid_contact');
  end if;
  if v_owner is not null and not exists (select 1 from app.platform_admins pa where pa.user_id = v_owner) then
    return jsonb_build_object('ok', false, 'error', 'invalid_owner');
  end if;
  if v_vis not in ('owner', 'group', 'group_tree', 'everyone')
     or (v_vis is distinct from v_old.visibility and p_id is not null and not app.crm_can('deals.visibility')) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if not exists (select 1 from app.crm_pipelines pl where pl.id = v_pipeline and pl.archived_at is null) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  -- the stage: as given, else the deal's own, else the pipeline's first open stage
  v_stage := coalesce(nullif(p->>'stage', ''), case when v_pipeline = v_old.pipeline_id then v_old.stage end,
    (select s.key from app.crm_stages s where s.pipeline_id = v_pipeline and s.kind = 'open' and not s.managed and s.archived_at is null
     order by s.sort limit 1));
  if v_stage is null or not exists (select 1 from app.crm_stages s where s.key = v_stage and s.pipeline_id = v_pipeline
                                    and (s.key = v_old.stage or (not s.managed and s.archived_at is null))) then
    return jsonb_build_object('ok', false, 'error', 'invalid_stage');
  end if;
  if v_old.company_primary and v_stage <> v_old.stage
     and exists (select 1 from app.crm_companies c where c.id = v_old.company_id and c.org_id is not null) then
    return jsonb_build_object('ok', false, 'error', 'managed');
  end if;
  if p_id is null then
    insert into app.crm_deals (title, company_id, contact_id, value, currency, pipeline_id, stage, owner_id, expected_close,
                               probability, lost_text, source, visibility)
    values (v_title, v_company, v_contact, v_value, v_currency, v_pipeline, v_stage, v_owner, v_close, v_prob, v_lost, 'manual', v_vis)
    returning id into v_id;
    if v_company is not null then
      perform app.crm_log(v_company, v_contact, 'note', 'Deal: ' || v_title);
    end if;
    perform app.admin_log('crm.deal_create', null, 'crm_deal', v_id::text);
    return jsonb_build_object('ok', true, 'id', v_id);
  end if;
  update app.crm_deals set title = v_title, company_id = v_company, contact_id = v_contact, value = v_value, currency = v_currency,
    owner_id = v_owner, expected_close = v_close, probability = v_prob, lost_text = v_lost, visibility = v_vis, updated_at = now()
  where id = p_id;
  -- a deal moved to another pipeline takes its stage with it in one write (the stage belongs to the pipeline)
  if v_pipeline <> v_old.pipeline_id then
    update app.crm_deals set pipeline_id = v_pipeline, stage = v_stage, updated_at = now() where id = p_id;
  elsif v_stage <> v_old.stage then
    v_why := app.crm_deal_set_stage(p_id, v_stage);
    if v_why is not null and v_why <> 'same' then
      return jsonb_build_object('ok', false, 'error', v_why);
    end if;
  end if;
  perform app.admin_log('crm.deal_update', null, 'crm_deal', p_id::text);
  return jsonb_build_object('ok', true, 'id', p_id);
end $fn$;
revoke all on function public.admin_crm_deal_save(uuid, jsonb) from public, anon;
grant execute on function public.admin_crm_deal_save(uuid, jsonb) to authenticated;

insert into supabase_migrations.schema_migrations (version, name) values ('20261004183000', '0203_crm_deals');
commit;
