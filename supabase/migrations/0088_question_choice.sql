-- 0088_question_choice.sql — choosing an industry module's statements one by one, and a
-- grunnlinje that always asks the whole core (D-136).
--
-- Tor, 2026-09-27: "Can this be implemented so we can select questions … individually or mark
-- irrelevant questions? Make sure NPS is intact and that we stay within the boundaries of
-- employee survey." Within those boundaries:
--
--   * An organisation may leave out single statements of an industry module (app.org_module_
--     items_off), by code, so the choice outlives a new version of the module. Every planned
--     grunnlinje and every new one asks the module without them. A reason may be kept with it,
--     and every change is logged (app.org_module_items_log). At least one statement stays: a
--     module with none is switched off, which is set_org_module's.
--   * The eleven core factors are not choosable in a grunnlinje: they are what arbeidsmiljøloven
--     § 4-3 asks to be surveyed, and what makes this year comparable with the last. The design
--     locks them; until now only the round-creating paths did. A grunnlinje that opens with a
--     factor missing gets it back as it opens (app.round_whole_core), so no path — a form, the
--     API — can open one without the whole core.
--   * Nothing here touches the recommendation question (NPS): it stays one of the round's extra
--     questions, chosen as before, answered and scored as before (0035, 0042).

-- ---------------------------------------------------------------- statements left out
create table app.org_module_items_off (
  org_id     uuid not null references app.organizations (id) on delete cascade,
  module_key text not null check (module_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  item_code  text not null check (item_code ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)+$'),
  reason     text check (reason is null or char_length(btrim(reason)) between 1 and 500),
  off_at     timestamptz not null default now(),
  off_by     uuid references auth.users (id) on delete set null,
  primary key (org_id, module_key, item_code)
);
create index org_module_items_off_by_idx on app.org_module_items_off (off_by);

alter table app.org_module_items_off enable row level security;
revoke all on app.org_module_items_off from anon, authenticated;
grant select on app.org_module_items_off to authenticated;
create policy org_module_items_off_read on app.org_module_items_off for select to authenticated
  using (app.is_org_member(org_id));
-- no write policy: set_org_module_item is the only writer

-- every change, append-only, so a verneombud can see what was left out, when and why
create table app.org_module_items_log (
  id         bigint generated always as identity primary key,
  org_id     uuid not null references app.organizations (id) on delete cascade,
  module_key text not null,
  item_code  text not null,
  asked      boolean not null,
  reason     text,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users (id) on delete set null
);
create index org_module_items_log_org_idx on app.org_module_items_log (org_id, changed_at desc);
create index org_module_items_log_by_idx on app.org_module_items_log (changed_by);

-- "nobody may change this content": the account column may be nulled by its foreign key, and a
-- row goes only with its organisation
create function app.forbid_item_log_change() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from app.organizations o where o.id = old.org_id) then
      raise exception 'the question log is append-only' using errcode = 'restrict_violation';
    end if;
    return old;
  end if;
  if (new.id, new.org_id, new.module_key, new.item_code, new.asked, new.reason, new.changed_at)
     is distinct from (old.id, old.org_id, old.module_key, old.item_code, old.asked, old.reason, old.changed_at)
     or (new.changed_by is not null and new.changed_by is distinct from old.changed_by) then
    raise exception 'the question log is append-only' using errcode = 'restrict_violation';
  end if;
  return new;
end $fn$;
create trigger org_module_items_log_immutable before update or delete on app.org_module_items_log
  for each row execute function app.forbid_item_log_change();

alter table app.org_module_items_log enable row level security;
revoke all on app.org_module_items_log from anon, authenticated;
grant select on app.org_module_items_log to authenticated;
create policy org_module_items_log_read on app.org_module_items_log for select to authenticated
  using (app.has_role(org_id, array['daglig_leder', 'verneombud']::app.org_role[]));
revoke all on function app.forbid_item_log_change() from public, anon, authenticated;

-- ---------------------------------------------------------------- the one write path
/**
 * A statement of an industry module in or out of the organisation's grunnlinjer. Daglig leder,
 * as for the module itself (set_org_module). Applied at once to the planned grunnlinjer that ask
 * the module; open and closed rounds are never touched (0071, round_module_ok).
 */
create function public.set_org_module_item(p_org uuid, p_key text, p_code text, p_asked boolean, p_reason text default null)
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
revoke all on function public.set_org_module_item(uuid, text, text, boolean, text) from public, anon;
grant execute on function public.set_org_module_item(uuid, text, text, boolean, text) to authenticated;

-- a module on a round: every likert statement the organisation has not left out, and the count
-- questions (0074, now without the statements left out)
create or replace function app.add_round_module(p_org uuid, p_round uuid, p_module uuid) returns void
  language sql volatile security definer set search_path = ''
as $fn$
  insert into app.round_modules (org_id, round_id, module_id, item_ids, include_count_items, include_segments)
  select p_org, p_round, p_module, array_agg(i.id order by i.sort), true, false
  from app.module_items i
  join app.question_modules m on m.id = i.module_id
  where i.module_id = p_module and i.kind = 'likert5'
    and not exists (select 1 from app.org_module_items_off o
                    where o.org_id = p_org and o.module_key = m.key and o.item_code = i.code)
  having count(*) > 0
  on conflict (round_id, module_id) do nothing
$fn$;
revoke all on function app.add_round_module(uuid, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- the whole core
/**
 * A grunnlinje opens with all eleven core factors. The round-creating paths already give it
 * them (0041, 0052); this is the guarantee for every other path. It adds what is missing rather
 * than refusing to open, so the year wheel never stalls on it.
 */
create function app.round_whole_core() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if old.status = 'planlagt' and new.status = 'apen'
     and exists (select 1 from app.measurements ms where ms.id = new.measurement_id and ms.kind = 'grunnlinje') then
    insert into app.round_factors (org_id, round_id, factor_key)
    select new.org_id, new.id, f.key from app.factors f
    on conflict (round_id, factor_key) do nothing;
  end if;
  return new;
end $fn$;
revoke all on function app.round_whole_core() from public, anon, authenticated;

create trigger round_whole_core before update of status on app.rounds
  for each row execute function app.round_whole_core();
