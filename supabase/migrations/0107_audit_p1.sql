-- 0107_audit_p1.sql — P1s of the 2026-09-28 deep audit that live in the database
-- (docs/audits/2026-09-28-deep.md).
--
-- AUD-05  Årshjulet's lead chip wrote year_wheels.notify_lead_days and relied on a trigger that
--         fires only when the value changes; a Veiviser wheel stores 14 under a ladder at 2, so
--         choosing 14 did nothing while «Lagret» showed. Choosing a lead is now one call that sets
--         the value and the three rungs it drives, whether or not the number moved.
-- AUD-11  The step log's backfill (0105) wrote an unfinished measure's step at its last edit, and
--         «startet» fell back to the day a measure was made: dates printed as facts that were not.
--         Backfilled rows are marked inferred; only a recorded «pågår» is a start date.
-- AUD-12  An evaluation of the ordning could be recorded in the future, which silenced the § 9-2
--         reminder and printed «Evaluert» for a meeting not held. It must be on or before today
--         where the organisation is.

-- ---------------------------------------------------------------- AUD-05: the chip, in one call

/*
 * The lead of the first three rungs (verneombud, tillitsvalgte, daglig leder), as the design's
 * chip says. The daglig leder only, as for the wheel. The ladder's order (0106) still holds: a
 * rung is never shorter than everyone's.
 */
create function public.set_wheel_lead(p_org uuid, p_days int) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_wheel uuid;
begin
  if not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_days is null or p_days < 1 or p_days > 60 then
    return jsonb_build_object('error', 'range');
  end if;
  select id into v_wheel from app.year_wheels where org_id = p_org;
  if v_wheel is null then return jsonb_build_object('error', 'no_wheel'); end if;
  update app.year_wheels set notify_lead_days = p_days where id = v_wheel;
  update app.wheel_notifications set lead_days = p_days
   where wheel_id = v_wheel and audience in ('verneombud', 'tillitsvalgte', 'daglig_leder');
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.set_wheel_lead(uuid, int) from public, anon;
grant execute on function public.set_wheel_lead(uuid, int) to authenticated;

-- ---------------------------------------------------------------- AUD-11: inferred steps

alter table app.measure_steps add column inferred boolean not null default false;

-- What was written before this migration can no longer be told apart: 0105's backfill wrote an
-- unfinished step at the measure's last edit, and the trigger since then wrote each change as it
-- happened, at the same instant as that edit. Every existing row is therefore marked inferred —
-- printing no date is the honest answer — except a finished measure's completion day, which is
-- a recorded fact (completed_on).
update app.measure_steps s
   set inferred = true
  from app.measures me
 where me.id = s.measure_id
   and not (s.step in ('gjennomfort', 'effekt_malt', 'lukket') and me.completed_on is not null
            and s.at = (me.completed_on + time '12:00') at time zone 'Europe/Oslo');

/*
 * A measure made now is logged now. One inserted with an earlier created_at — the fixture, a demo
 * copy, an import — did not take its step today: it is logged at its own created_at, inferred.
 */
create or replace function app.measure_steps_log() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_past boolean := tg_op = 'INSERT' and new.created_at < now() - interval '1 minute';
begin
  if tg_op = 'INSERT' or new.step is distinct from old.step then
    insert into app.measure_steps (measure_id, step, at, inferred)
    values (new.id, new.step, case when v_past then new.created_at else now() end, v_past)
    on conflict do nothing;
  end if;
  return null;
end $fn$;

-- ---------------------------------------------------------------- AUD-11: the readers

create or replace function app.since_last(p_round uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  r       record;
  v_prev  timestamptz;
  v_pat   text[];
  v_items jsonb;
  v_done  int;
begin
  select ro.id, ro.org_id, coalesce(ro.opens_at, now()) as at into r from app.rounds ro where ro.id = p_round;
  if r.id is null then return null; end if;
  select max(p.closes_at) into v_prev
  from app.rounds p join app.measurements m on m.id = p.measurement_id
  where p.org_id = r.org_id and p.id <> p_round and p.status = 'lukket' and m.kind = 'grunnlinje'
    and p.closes_at is not null and p.closes_at < r.at;
  if v_prev is null then
    return jsonb_build_object('first', true);
  end if;

  v_pat := app.mask_patterns(r.org_id);
  v_pat := array[null, null, v_pat[3], v_pat[4]];

  with changed as (
    select me.title, me.step <> 'pagar' as done,
           -- 0107 (AUD-11): a step only inferred from the past is not a date anything happened; it
           -- counts from the day the measure was made — after the last grunnlinje means changed
           -- since, before it means not known, and not listed
           coalesce((select max(s.at) from app.measure_steps s
                      where s.measure_id = me.id and s.step = me.step and not s.inferred),
                    case when exists (select 1 from app.measure_steps s
                                       where s.measure_id = me.id and s.step = me.step and s.inferred)
                         then me.created_at end) as at
    from app.measures me
    where me.org_id = r.org_id and me.kind = 'kollektivt'
      and me.step in ('pagar', 'gjennomfort', 'effekt_malt', 'lukket')
      and not exists (select 1 from app.measure_groups g where g.measure_id = me.id)
  ), since as (
    select * from changed where at > v_prev
  )
  select (select jsonb_agg(jsonb_build_object('title', app.mask_apply(t.title, v_pat),
                                              'status', case when t.done then 'gjennomfort' else 'pagar' end)
                           order by t.done desc, t.at desc)
          from (select * from since order by done desc, at desc limit 3) t),
         (select count(*) from since where done)
    into v_items, v_done;

  return jsonb_build_object('first', false, 'since', v_prev, 'items', coalesce(v_items, '[]'::jsonb), 'done', v_done);
end $fn$;

revoke all on function app.since_last(uuid) from public, anon, authenticated;

create or replace function app.pulse_reasons(p_round uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  r     record;
  v_pat text[];
  v_out jsonb;
begin
  select ro.id, ro.org_id, ms.kind, coalesce(o.timezone, 'Europe/Oslo') as tz into r
  from app.rounds ro join app.measurements ms on ms.id = ro.measurement_id
  join app.organizations o on o.id = ro.org_id
  where ro.id = p_round;
  if r.id is null or r.kind <> 'puls' then return '{}'::jsonb; end if;

  v_pat := app.mask_patterns(r.org_id);
  v_pat := array[null, null, v_pat[3], v_pat[4]];

  select coalesce(jsonb_object_agg(x.factor_key, x.items), '{}'::jsonb) into v_out
  from (
    select me.factor_key,
           jsonb_agg(jsonb_build_object('title', app.mask_apply(me.title, v_pat), 'started', (y.started at time zone r.tz)::date)
                     order by y.started desc nulls last) as items
    from app.round_factors rf
    join app.measures me on me.org_id = r.org_id and me.factor_key = rf.factor_key
    -- 0107 (AUD-11): «startet» is the first recorded «pågår», never the day it was made or an
    -- inferred step; a decided measure, or one whose start is not known, carries no date
    cross join lateral (
      select (select min(s.at) from app.measure_steps s
               where s.measure_id = me.id and s.step = 'pagar' and not s.inferred) as started) y
    where rf.round_id = p_round and me.kind = 'kollektivt'
      and me.step in ('besluttet', 'pagar', 'gjennomfort')
      and not exists (select 1 from app.measure_groups g where g.measure_id = me.id)
    group by me.factor_key
  ) x;
  return v_out;
end $fn$;

revoke all on function app.pulse_reasons(uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------- AUD-11: a demo copy of the step log

-- A copied measure keeps its created_at, so the insert trigger now logs it on that day, inferred —
-- the very row the copy of the template's log then brings. The copy skips what is already there,
-- as for round translations (0100).
CREATE OR REPLACE FUNCTION app.demo_copy_table(p_table text, p_template uuid, p_org uuid, p_owner uuid, p_build uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_plan  app.demo_copy_plan;
  v_rel   regclass := ('app.' || quote_ident(p_table))::regclass;
  v_cols  text;
  v_exprs text;
  v_where text;
  v_n     bigint;
begin
  select * into v_plan from app.demo_copy_plan where table_name = p_table and mode = 'copy';
  if not found then
    raise exception 'demo: % is not in the copy plan', p_table;
  end if;
  v_where := case when v_plan.via is null then 'x.org_id = $3'
                  else format('x.%I in (select m.old from app.demo_id_map m where m.build = $4)', v_plan.via) end;

  -- an id of this table's own is given a new value before any row points at it
  if exists (select 1 from pg_attribute a join pg_index i on i.indrelid = a.attrelid and i.indisprimary
             where a.attrelid = v_rel and a.attname = 'id' and i.indkey[0] = a.attnum and i.indnatts = 1
               and a.atttypid = 'uuid'::regtype) then
    execute format('insert into app.demo_id_map (build, old, new) select $4, x.id, gen_random_uuid() from app.%I x where %s',
                   p_table, v_where) using p_org, p_owner, p_template, p_build;
  end if;

  select string_agg(quote_ident(a.attname), ', ' order by a.attnum),
         string_agg(case
           -- every round goes in open: the triggers that fill a planned round from the
           -- organisation's defaults and modules (round_apply_defaults, round_default_modules)
           -- then stay out of it, and the round takes its own state once its rows are copied
           when p_table = 'rounds' and a.attname = 'status' then $$'apen'::app.round_status$$
           when p_table = 'rounds' and a.attname = 'frozen_at' then 'null'
           -- 0100: a sandbox's round has a page link of its own, never the template's
           when p_table = 'rounds' and a.attname = 'share_slug' then 'app.new_share_slug()'
           when p_table in ('invitations', 'comment_threads') and a.attname in ('token_hash', 'key_hash') then
             'extensions.digest(extensions.gen_random_bytes(32), ''sha256'')'
           when a.attname = 'org_id' then '$1'
           when a.atttypid = 'uuid'::regtype and fk.target in ('auth.users', 'app.profiles') then
             format('case when x.%I is null then null else $2 end', a.attname)
           when a.atttypid = 'uuid'::regtype then
             format('coalesce((select m.new from app.demo_id_map m where m.build = $4 and m.old = x.%1$I), x.%1$I)', a.attname)
           when a.atttypid = 'uuid[]'::regtype then
             format('case when x.%1$I is null then null else coalesce((select array_agg(coalesce(m.new, u.e) order by u.o) '
                    'from unnest(x.%1$I) with ordinality u(e, o) left join app.demo_id_map m on m.build = $4 and m.old = u.e), ''{}'') end',
                    a.attname)
           else format('x.%I', a.attname) end, ', ' order by a.attnum)
    into v_cols, v_exprs
  from pg_attribute a
  left join lateral (
    select k.confrelid::regclass::text as target from pg_constraint k
    where k.conrelid = a.attrelid and k.contype = 'f' and k.conkey = array[a.attnum]
    limit 1) fk on true
  where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
    and a.attidentity = '' and a.attgenerated = '';

  -- a round opened here pins today's wording, which the template's own then meets
  execute format('insert into app.%I (%s) select %s from app.%I x where %s%s',
                 p_table, v_cols, v_exprs, p_table, v_where,
                 case when p_table in ('round_translations', 'measure_steps') then ' on conflict do nothing' else '' end)
    using p_org, p_owner, p_template, p_build;
  get diagnostics v_n = row_count;
  return v_n;
end $function$;
revoke all on function app.demo_copy_table(text, uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- AUD-12: no evaluation in the future

create function app.evaluations_not_future() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if new.held_on > (now() at time zone coalesce(
       (select o.timezone from app.organizations o where o.id = new.org_id), 'Europe/Oslo'))::date then
    raise exception 'an evaluation cannot be recorded before it is held' using errcode = '23514';
  end if;
  return new;
end $fn$;
revoke all on function app.evaluations_not_future() from public, anon, authenticated;

create trigger evaluations_not_future
  before insert or update of held_on on app.evaluations
  for each row execute function app.evaluations_not_future();
