-- 0074_org_modules.sql — an organisation chooses its industry question sets (D-124).
--
-- Tor, 2026-09-27: the question sets belong under Målinger › Spørsmålssett, "standard av,
-- men KAN velges". Until now a module was added round by round in Måleoppsett. This adds the
-- organisation's own standing choice:
--
--   * app.org_modules holds, per organisation and module key, whether it is on. No row means
--     off — the default is off and stays off until a daglig leder turns it on;
--   * public.set_org_module(org, key, on) is the one write path. It checks the role and that a
--     version of the module may be used by this organisation (published, or a pilot's draft),
--     records the choice, and applies it to the organisation's PLANNED grunnlinjer: on adds
--     the newest usable version with every statement and the count questions, off removes it.
--     Open and closed rounds are never touched — a round's modules are fixed once it opens
--     (0071, app.round_module_ok);
--   * a new grunnlinje (the year wheel's or a hand-made one) takes the organisation's chosen
--     modules as it is created, as a new puls takes its open measures' statements (0071).
--
-- Måleoppsett still decides round by round: switching a module off there for one round
-- changes that round only. The choice is by key, not version, so a newer published version
-- is what the next round asks.

create table app.org_modules (
  org_id      uuid not null references app.organizations (id) on delete cascade,
  module_key  text not null check (module_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  enabled     boolean not null default false,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null,
  primary key (org_id, module_key)
);
create index org_modules_updated_by_idx on app.org_modules (updated_by);

alter table app.org_modules enable row level security;
revoke all on app.org_modules from anon, authenticated;
grant select on app.org_modules to authenticated;
create policy org_modules_read on app.org_modules for select to authenticated
  using (app.is_org_member(org_id));
-- no insert, update or delete policy: set_org_module is the only writer

-- the newest version of a module this organisation may use, or null
create function app.latest_usable_module(p_key text, p_org uuid) returns uuid
  language sql stable security definer set search_path = ''
as $fn$
  select m.id from app.question_modules m
  where m.key = p_key and app.module_usable(m.id, p_org)
  order by string_to_array(m.version, '.')::int[] desc
  limit 1
$fn$;
revoke all on function app.latest_usable_module(text, uuid) from public, anon, authenticated;

-- a module on a round: every likert statement, and the count questions
create function app.add_round_module(p_org uuid, p_round uuid, p_module uuid) returns void
  language sql volatile security definer set search_path = ''
as $fn$
  insert into app.round_modules (org_id, round_id, module_id, item_ids, include_count_items, include_segments)
  select p_org, p_round, p_module, array_agg(i.id order by i.sort), true, false
  from app.module_items i where i.module_id = p_module and i.kind = 'likert5'
  having count(*) > 0
  on conflict (round_id, module_id) do nothing
$fn$;
revoke all on function app.add_round_module(uuid, uuid, uuid) from public, anon, authenticated;

create function public.set_org_module(p_org uuid, p_key text, p_enabled boolean) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_module uuid;
  v_round  record;
  v_n      int := 0;
begin
  if p_org is null or not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('error', 'not_allowed');
  end if;
  v_module := app.latest_usable_module(p_key, p_org);
  if v_module is null then
    return jsonb_build_object('error', 'not_available');
  end if;

  insert into app.org_modules (org_id, module_key, enabled, updated_at, updated_by)
  values (p_org, p_key, p_enabled, now(), auth.uid())
  on conflict (org_id, module_key) do update
    set enabled = excluded.enabled, updated_at = excluded.updated_at, updated_by = excluded.updated_by;

  -- apply to the planned grunnlinjer, and to nothing that has opened
  for v_round in
    select r.id from app.rounds r join app.measurements ms on ms.id = r.measurement_id
    where r.org_id = p_org and r.status = 'planlagt' and ms.kind = 'grunnlinje'
  loop
    if p_enabled then
      perform app.add_round_module(p_org, v_round.id, v_module);
    else
      delete from app.round_modules rm
      where rm.round_id = v_round.id
        and rm.module_id in (select m.id from app.question_modules m where m.key = p_key);
    end if;
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('ok', true, 'enabled', p_enabled, 'planned_rounds', v_n);
end $fn$;
revoke all on function public.set_org_module(uuid, text, boolean) from public, anon;
grant execute on function public.set_org_module(uuid, text, boolean) to authenticated;

-- a new grunnlinje takes the organisation's chosen modules
create function app.round_default_modules() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_kind   app.measurement_kind;
  v_choice record;
  v_module uuid;
begin
  select ms.kind into v_kind from app.measurements ms where ms.id = new.measurement_id;
  if v_kind is distinct from 'grunnlinje' or new.status <> 'planlagt' then
    return new;
  end if;
  for v_choice in select om.module_key from app.org_modules om where om.org_id = new.org_id and om.enabled loop
    v_module := app.latest_usable_module(v_choice.module_key, new.org_id);
    if v_module is not null then
      perform app.add_round_module(new.org_id, new.id, v_module);
    end if;
  end loop;
  return new;
end $fn$;
revoke all on function app.round_default_modules() from public, anon, authenticated;

create trigger round_default_modules after insert on app.rounds
  for each row execute function app.round_default_modules();
