-- 0019_year_wheel.sql — the year's shape, as a row rather than as a plan on a wall.
--
-- Årshjulet is the organisation's own answer to "when do we measure, and who hears about
-- it first". It is a setting, not a schedule: this migration stores the intent, and 0020
-- stores the machinery that acts on it. The split matters, because an organisation that
-- has described its year has not yet started it — `active` defaults **false**, so writing
-- a wheel never causes a round to be created behind somebody's back.
--
-- `notify_lead_days` on the wheel is the default; `wheel_notifications` overrides it per
-- audience, which is how the design's ladder (verneombud first, everyone last) is data
-- rather than an ordering hard-coded in a component. `sort_order` is the row order the
-- screen prints, kept beside the audience so reordering the list is a write and not a
-- deploy.
--
-- Nothing here holds a person. A wheel belongs to an organisation and names audiences by
-- role, never by employee, so the notification ladder cannot become a list of who was
-- told what.

create type app.wheel_cadence as enum ('minimum', 'kvartalspuls', 'manedspuls');
create type app.notify_audience as enum
  ('verneombud', 'tillitsvalgte', 'daglig_leder', 'avdelingsledere', 'alle_ansatte');

create table app.year_wheels (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null unique references app.organizations (id) on delete cascade,
  cadence              app.wheel_cadence not null default 'kvartalspuls',
  baseline_month       int not null default 9 check (baseline_month between 1 and 12),
  notify_lead_days     int not null default 14 check (notify_lead_days between 1 and 60),
  extend_if_low        boolean not null default true,
  skip_fellesferie     boolean not null default true,
  notify_vo_on_overdue boolean not null default true,
  active               boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table app.wheel_notifications (
  wheel_id   uuid not null references app.year_wheels (id) on delete cascade,
  audience   app.notify_audience not null,
  lead_days  int not null check (lead_days between 0 and 60),
  sort_order int not null,
  primary key (wheel_id, audience)
);

create function app.year_wheels_touch() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  new.updated_at := now();
  return new;
end $fn$;

create trigger year_wheels_touch
  before update on app.year_wheels
  for each row execute function app.year_wheels_touch();

alter table app.year_wheels enable row level security;
alter table app.wheel_notifications enable row level security;

-- Any member may read the year's shape: knowing when the next måling falls is the point
-- of publishing it. Only daglig leder may change it, because changing it changes when
-- everybody is asked.
create policy wheel_read on app.year_wheels
  for select using (app.is_org_member(org_id));
create policy wheel_write on app.year_wheels
  for all
  using (app.has_role(org_id, array['daglig_leder']::app.org_role[]))
  with check (app.has_role(org_id, array['daglig_leder']::app.org_role[]));

create policy wheel_notification_read on app.wheel_notifications
  for select using (
    exists (select 1 from app.year_wheels w where w.id = wheel_id and app.is_org_member(w.org_id))
  );
create policy wheel_notification_write on app.wheel_notifications
  for all
  using (exists (select 1 from app.year_wheels w where w.id = wheel_id
                 and app.has_role(w.org_id, array['daglig_leder']::app.org_role[])))
  with check (exists (select 1 from app.year_wheels w where w.id = wheel_id
                 and app.has_role(w.org_id, array['daglig_leder']::app.org_role[])));

revoke all on app.year_wheels, app.wheel_notifications from anon, public;
grant select, insert, update, delete on app.year_wheels, app.wheel_notifications to authenticated;
