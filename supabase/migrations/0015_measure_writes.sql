-- 0015_measure_writes.sql — the two things a measure needs before it can be edited.
--
-- 1. The rule the Tiltak screen states in its own lead: "Hvert tiltak henger på en
--    faktor og kan ikke lukkes før effekten er målt." Until now that was a sentence on
--    a page. An ordered enum makes "closed" the last step; it does not stop anyone
--    jumping to it from "Pågår", which is exactly the shortcut the documentation exists
--    to prevent — a measure closed without its effect measured is a measure nobody can
--    show worked.
--
--    The rule is on UPDATE only. An INSERT may carry any step, because importing a
--    history of measures that were closed years ago is legitimate and the fixture does
--    it; what may not happen is a measure in this system reaching "lukket" without
--    passing through "effekt målt".
--
-- 2. Who a measure affects. The design's handlingsplan asks it ("Hvem berøres"), and
--    § 3-1 documentation wants it: a measure aimed at one department is a different fact
--    from one aimed at the whole undertaking. It is a set of groups, so it is a table —
--    with the tenancy check the measure itself carries, because a row pairing this
--    organisation's measure with another's group would otherwise be accepted.

create function app.measures_closing_rule() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if new.step = 'lukket'
     and old.step is distinct from 'lukket'
     and old.step is distinct from 'effekt_malt' then
    raise exception
      'a measure may only be closed once its effect has been measured (step was %)', old.step
      using errcode = 'check_violation';
  end if;
  return new;
end $fn$;

create trigger measures_closing_rule
  before update on app.measures
  for each row execute function app.measures_closing_rule();

create table app.measure_groups (
  measure_id uuid not null references app.measures (id) on delete cascade,
  group_id   uuid not null references app.groups (id) on delete cascade,
  primary key (measure_id, group_id)
);

create index measure_groups_group_idx on app.measure_groups (group_id);

/**
 * Both ends in the same organisation. One EXISTS covers it: the join only produces a
 * row when the measure's org and the group's org are the same org.
 */
create function app.measure_groups_same_org() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not exists (
    select 1
    from app.measures m
    join app.groups g on g.org_id = m.org_id
    where m.id = new.measure_id and g.id = new.group_id
  ) then
    raise exception 'measure % and group % are not in the same organisation',
      new.measure_id, new.group_id;
  end if;
  return new;
end $fn$;

create trigger measure_groups_same_org
  before insert or update on app.measure_groups
  for each row execute function app.measure_groups_same_org();

alter table app.measure_groups enable row level security;

-- the measure's own audience decides: whoever may read the measure may read who it
-- affects, and whoever may write it may say so
create policy measure_group_read on app.measure_groups
  for select using (
    exists (select 1 from app.measures m where m.id = measure_id and app.is_org_member(m.org_id))
  );

create policy measure_group_write on app.measure_groups
  for all
  using (
    exists (
      select 1 from app.measures m
      where m.id = measure_id
        and app.has_role(m.org_id, array['daglig_leder', 'avdelingsleder']::app.org_role[])
    )
  )
  with check (
    exists (
      select 1 from app.measures m
      where m.id = measure_id
        and app.has_role(m.org_id, array['daglig_leder', 'avdelingsleder']::app.org_role[])
    )
  );

revoke all on app.measure_groups from anon, public;
grant select, insert, update, delete on app.measure_groups to authenticated;
