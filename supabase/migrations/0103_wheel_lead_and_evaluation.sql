-- 0103_wheel_lead_and_evaluation.sql — two settings that were saved and shown back, and did
-- nothing else (docs/audits/2026-09-28-wiring.md A-01 and A-02; D-153).
--
-- A-01  Årshjulet's «Hvem varsles først · N dager før» wrote year_wheels.notify_lead_days, and the
--       scheduler read each wheel_notifications row's own lead_days instead. The design ties the
--       chip to the first three rungs of the ladder — verneombud, tillitsvalgte and daglig leder,
--       "{lead} dager før" — and leaves avdelingsledere at 7 and alle ansatte at 1. The chip now
--       moves those three rows, in the database, so what the ladder prints is what wheel_tick
--       sends, whichever screen or script wrote the wheel.
--
-- A-02  Måleoppsett's «Evaluering av ordningen» (aml. § 9-2 tredje ledd) wrote
--       measurements.evaluation_cadence, and only the setup summary read it. The ordning is now
--       evaluated against it: app.evaluations records that it was, app.evaluation_due says when
--       it is next due by the cadence, the report prints both, and the daglig leder is reminded
--       once it is due and until one is recorded.

-- ---------------------------------------------------------------- A-01: the chip moves the ladder

/*
 * Invoker, not definer: the one who may write a wheel (wheel_write, daglig leder) is the one who
 * may write its ladder (wheel_notification_write_*, 0026), so the trigger needs no rights the
 * caller lacks. Only a changed value moves the rows: re-saving the wheel (a cadence, a switch)
 * leaves a ladder the Veiviser wrote alone.
 */
create function app.year_wheels_lead_sync() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  update app.wheel_notifications
     set lead_days = new.notify_lead_days
   where wheel_id = new.id
     and audience in ('verneombud', 'tillitsvalgte', 'daglig_leder');
  return null;
end $fn$;
revoke all on function app.year_wheels_lead_sync() from public, anon, authenticated;

create trigger year_wheels_lead_sync
  after update of notify_lead_days on app.year_wheels
  for each row
  when (old.notify_lead_days is distinct from new.notify_lead_days)
  execute function app.year_wheels_lead_sync();

-- ---------------------------------------------------------------- A-02: the evaluation, recorded

/*
 * One row per evaluation of the ordning: when it was held, with whom, and a note. The
 * organisation's own words about a meeting — never a respondent's — so they may be printed.
 * Read by every member (the verneombud advises on it, § 6-2); written by the daglig leder or the
 * verneombud, the pair that records section 8 (0023).
 */
create table app.evaluations (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references app.organizations (id) on delete cascade,
  held_on      date not null,
  counterpart  text check (counterpart is null or (length(btrim(counterpart)) > 0 and length(counterpart) <= 200)),
  note         text check (note is null or (length(btrim(note)) > 0 and length(note) <= 1000)),
  created_at   timestamptz not null default now(),
  unique (org_id, held_on)
);

alter table app.evaluations enable row level security;

create policy evaluation_read on app.evaluations
  for select to authenticated using (app.is_org_member(org_id));
create policy evaluation_insert on app.evaluations
  for insert to authenticated
  with check (app.has_role(org_id, array['daglig_leder', 'verneombud']::app.org_role[]));
create policy evaluation_delete on app.evaluations
  for delete to authenticated
  using (app.has_role(org_id, array['daglig_leder', 'verneombud']::app.org_role[]));

revoke all on app.evaluations from anon, public;
grant select, insert, delete on app.evaluations to authenticated;

-- a demo copy takes the template's evaluations with the rest of its record (0094)
insert into app.demo_copy_plan (table_name, step, mode, via, note)
values ('evaluations', 75, 'copy', null, 'evaluations of the ordning (§ 9-2)');

/*
 * When the ordning is next due for evaluation.
 *
 *   cadence   the evaluation_cadence of the measurement whose round closed last — the ordning
 *             that has produced results — or, before any has, of the newest measurement
 *   last_on   the last evaluation recorded
 *   due_on    from the last evaluation, or from the first round that closed if none is:
 *               hver_6_mnd        six months on
 *               arlig             a year on
 *               etter_hver_runde  the day the first round after it closed; null while none has
 *
 * Nothing is due before a round has closed: an ordning that has measured nothing has nothing to
 * evaluate. The zone is the organisation's, as for the measures' dates (0099).
 */
create function app.evaluation_due(p_org uuid)
  returns table (cadence app.evaluation_cadence, last_on date, due_on date)
  language sql stable security definer set search_path = ''
as $fn$
  with o as (
    select coalesce(timezone, 'Europe/Oslo') as tz from app.organizations where id = p_org
  ), c as (
    select coalesce(
      (select ms.evaluation_cadence from app.rounds r join app.measurements ms on ms.id = r.measurement_id
        where r.org_id = p_org and r.status = 'lukket' order by r.closes_at desc nulls last limit 1),
      (select ms.evaluation_cadence from app.measurements ms where ms.org_id = p_org
        order by ms.year desc, ms.created_at desc limit 1)) as cadence
  ), l as (
    select max(held_on) as last_on from app.evaluations where org_id = p_org
  ), closed as (
    select (r.closes_at at time zone o.tz)::date as closed_on
    from app.rounds r, o where r.org_id = p_org and r.status = 'lukket' and r.closes_at is not null
  ), base as (
    select coalesce(l.last_on, (select min(closed_on) from closed)) as base_on from l
  )
  select c.cadence, l.last_on,
         case
           when b.base_on is null or c.cadence is null then null
           when c.cadence = 'hver_6_mnd' then (b.base_on + interval '6 months')::date
           when c.cadence = 'arlig' then (b.base_on + interval '1 year')::date
           else (select min(closed_on) from closed where closed_on > b.base_on
                   or (l.last_on is null and closed_on >= b.base_on))
         end
  from c, l, base b
$fn$;
revoke all on function app.evaluation_due(uuid) from public, anon, authenticated;

/*
 * The screens' reader: Rapport prints it, the register shows it. Members of the organisation
 * only; the dates say nothing about any person.
 */
create function public.evaluation_status(p_org uuid)
  returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v record;
begin
  if not app.is_org_member(p_org) then
    raise exception 'not a member' using errcode = '42501';
  end if;
  select * into v from app.evaluation_due(p_org);
  return jsonb_build_object('cadence', v.cadence, 'last_on', v.last_on, 'due_on', v.due_on);
end $fn$;
revoke all on function public.evaluation_status(uuid) from public, anon;
grant execute on function public.evaluation_status(uuid) to authenticated;

-- ---------------------------------------------------------------- A-02: the reminder

-- a notice with no round is a measure's (0099) or an evaluation's
alter table app.outbox drop constraint outbox_round_or_measure;
alter table app.outbox add constraint outbox_round_or_measure
  check (round_id is not null or kind in ('tiltak_forfalt', 'evaluering'));

/*
 * Every Monday: an organisation whose evaluation is due and not recorded gets one reminder to the
 * daglig leder, and another four weeks on while it stays undone — a nudge, not a weekly nag.
 */
create function app.queue_evaluation_notices() returns int
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_n int;
begin
  insert into app.outbox (org_id, round_id, kind, audience, due_at)
  select o.id, null::uuid, 'evaluering'::app.outbox_kind, 'daglig_leder'::app.notify_audience, now()
  from app.organizations o
  cross join lateral app.evaluation_due(o.id) d
  where d.due_on is not null
    and d.due_on <= (now() at time zone coalesce(o.timezone, 'Europe/Oslo'))::date
    and not exists (select 1 from app.outbox x where x.org_id = o.id and x.kind = 'evaluering'
                      and x.created_at > now() - interval '27 days');
  get diagnostics v_n = row_count;
  return v_n;
end $fn$;
revoke all on function app.queue_evaluation_notices() from public, anon, authenticated;

select cron.schedule('orgpuls-evaluation-notices', '20 5 * * 1', $job$select app.queue_evaluation_notices()$job$);
