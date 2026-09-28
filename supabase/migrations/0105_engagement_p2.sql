-- 0105_engagement_p2.sql — engagement phase 2: «Siden sist», the thank-you's publish date, and why a
-- pulse asks again (docs/implementation/engagement-phase2-plan.md; X-085, D-156).
--
-- The owner took the plan's eight recommendations (2026-09-28):
--   1  «Siden sist» lists the whole organisation's measures only — the survey knows no group
--   2  no owner, not even as a role (D-151)
--   3  a step log, so «changed since» and «startet» are recorded facts
--   4  «Gjennomført» = gjennomført, effekt målt, lukket; «Pågår» = pågår; «besluttet» not shown
--   5  results shared with everyone at close + 7 days by default; leaders see them at close
--   6  an introduction per round, the organisation's greeting until one is written
--   7  «Siden sist» in e-mail and on the survey only, never in an SMS (D-128)
--   8  the pulse's reason once, under the factor's heading
--
-- Nothing here carries a person: every list is the organisation's, computed in the database, and
-- the survey's reply still has no round, invitation, group or employee in it.

-- ---------------------------------------------------------------- 3: the step log

/*
 * One row each time a measure takes a step. Read only by the definer functions below: no client
 * policy and no grant, like the answer tables. A measure's copy in a demo gets its own rows.
 */
create table app.measure_steps (
  measure_id uuid not null references app.measures (id) on delete cascade,
  step       app.measure_step not null,
  at         timestamptz not null default now(),
  primary key (measure_id, step, at)
);
alter table app.measure_steps enable row level security;
revoke all on app.measure_steps from public, anon, authenticated;

create function app.measure_steps_log() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if tg_op = 'INSERT' or new.step is distinct from old.step then
    insert into app.measure_steps (measure_id, step, at) values (new.id, new.step, now())
    on conflict do nothing;
  end if;
  return null;
end $fn$;
revoke all on function app.measure_steps_log() from public, anon, authenticated;

create trigger measures_step_log
  after insert or update of step on app.measures
  for each row execute function app.measure_steps_log();

-- what is known of the past: a finished measure's completion day, otherwise its last change
insert into app.measure_steps (measure_id, step, at)
select me.id, me.step,
       case when me.step in ('gjennomfort', 'effekt_malt', 'lukket') and me.completed_on is not null
            then (me.completed_on + time '12:00') at time zone 'Europe/Oslo'
            else me.updated_at end
from app.measures me
on conflict do nothing;

insert into app.demo_copy_plan (table_name, step, mode, via, note)
values ('measure_steps', 76, 'copy', 'measure_id', 'measures'' steps (0105)');

-- ---------------------------------------------------------------- measures_same_org, for referential maintenance
/*
 * 0013's rule, checked only where it can be broken: on insert, and when the round or the owner
 * changes. A deleted round sets `effect_round_id` null on its measures (an update Postgres makes)
 * while their own round may already be gone in the same statement; the old check refused that, so
 * deleting an organisation depended on the order its rounds lay on disk (CLAUDE.md: immutability
 * triggers must permit referential maintenance). Found when 0105's backfill reordered them.
 */
create or replace function app.measures_same_org() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if new.round_id is not null
     and (tg_op = 'INSERT' or new.round_id is distinct from old.round_id or new.org_id is distinct from old.org_id)
     and not exists (select 1 from app.rounds r
                     where r.id = new.round_id and r.org_id = new.org_id) then
    raise exception 'round % is not in organisation %', new.round_id, new.org_id;
  end if;

  if new.owner_employee_id is not null
     and (tg_op = 'INSERT' or new.owner_employee_id is distinct from old.owner_employee_id or new.org_id is distinct from old.org_id)
     and not exists (select 1 from app.employees e
                     where e.id = new.owner_employee_id and e.org_id = new.org_id) then
    raise exception 'employee % is not in organisation %', new.owner_employee_id, new.org_id;
  end if;

  new.updated_at := now();
  return new;
end $fn$;

-- ---------------------------------------------------------------- 5, 6: the round's send settings

alter table app.rounds
  add column intro_message text
    check (intro_message is null or (length(btrim(intro_message)) > 0 and length(intro_message) <= 600)),
  add column intro_by uuid references auth.users (id) on delete set null,
  add column results_publish_on date;

/*
 * A round's publish date follows its close: seven days after, unless someone chose another. A
 * moved close (extend_if_low, 0096) moves a default date with it, and a chosen date is never left
 * before the close.
 */
create function app.rounds_publish_default() returns trigger
  language plpgsql set search_path = ''
as $fn$
declare
  v_tz  text;
  v_new date;
begin
  if new.closes_at is null then return new; end if;
  select coalesce(o.timezone, 'Europe/Oslo') into v_tz from app.organizations o where o.id = new.org_id;
  v_new := (new.closes_at at time zone coalesce(v_tz, 'Europe/Oslo'))::date;
  if tg_op = 'INSERT' then
    if new.results_publish_on is null then new.results_publish_on := v_new + 7; end if;
  elsif old.closes_at is distinct from new.closes_at then
    if new.results_publish_on is null
       or (old.closes_at is not null
           and new.results_publish_on = (old.closes_at at time zone coalesce(v_tz, 'Europe/Oslo'))::date + 7) then
      new.results_publish_on := v_new + 7;
    end if;
  end if;
  new.results_publish_on := greatest(new.results_publish_on, v_new);
  return new;
end $fn$;
revoke all on function app.rounds_publish_default() from public, anon, authenticated;

create trigger rounds_publish_default
  before insert or update of closes_at on app.rounds
  for each row execute function app.rounds_publish_default();

-- rounds already closed keep what their employees were told: the day they closed; the rest, a week on
update app.rounds ro
   set results_publish_on = (ro.closes_at at time zone coalesce(o.timezone, 'Europe/Oslo'))::date
                            + case when ro.status = 'lukket' then 0 else 7 end
  from app.organizations o
 where o.id = ro.org_id and ro.closes_at is not null;

/* Whether a closed round's results are shared with everyone yet (the employees' notice and page). */
create function app.results_published(p_round uuid) returns boolean
  language sql stable security definer set search_path = ''
as $fn$
  select coalesce(ro.results_publish_on <= (now() at time zone coalesce(o.timezone, 'Europe/Oslo'))::date, true)
  from app.rounds ro join app.organizations o on o.id = ro.org_id
  where ro.id = p_round
$fn$;
revoke all on function app.results_published(uuid) from public, anon, authenticated;

/* The employees' results notice waits for the publish date, at nine in the morning where they are. */
create function app.outbox_hold_results() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_at timestamptz;
begin
  if new.kind = 'resultat' and new.audience = 'alle_ansatte' and new.round_id is not null then
    select (ro.results_publish_on + time '09:00') at time zone coalesce(o.timezone, 'Europe/Oslo')
      into v_at
      from app.rounds ro join app.organizations o on o.id = ro.org_id
     where ro.id = new.round_id and ro.results_publish_on is not null;
    if v_at is not null and v_at > new.due_at then new.due_at := v_at; end if;
  end if;
  return new;
end $fn$;
revoke all on function app.outbox_hold_results() from public, anon, authenticated;

create trigger outbox_hold_results
  before insert on app.outbox
  for each row execute function app.outbox_hold_results();

/*
 * The send settings, from Måleoppsett before a round opens: the introduction (while the round is
 * planned) and the publish date (until it has closed; not before the close, at most 60 days after).
 * The daglig leder only. A held results notice follows a moved date.
 */
create function public.set_round_send(p_round uuid, p_intro text, p_publish_on date) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  r      record;
  v_tz   text;
  v_close date;
  v_intro text := nullif(btrim(coalesce(p_intro, '')), '');
begin
  select ro.*, coalesce(o.timezone, 'Europe/Oslo') as tz into r
  from app.rounds ro join app.organizations o on o.id = ro.org_id where ro.id = p_round;
  if r.id is null or not app.has_role(r.org_id, array['daglig_leder']::app.org_role[]) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if r.status = 'lukket' then return jsonb_build_object('error', 'closed'); end if;
  if v_intro is not null and length(v_intro) > 600 then return jsonb_build_object('error', 'too_long'); end if;
  if r.status <> 'planlagt' and v_intro is distinct from r.intro_message then
    return jsonb_build_object('error', 'opened');
  end if;
  v_close := (r.closes_at at time zone r.tz)::date;
  if p_publish_on is not null and v_close is not null
     and (p_publish_on < v_close or p_publish_on > v_close + 60) then
    return jsonb_build_object('error', 'publish_range');
  end if;

  update app.rounds
     set intro_message = v_intro,
         intro_by = case when v_intro is distinct from r.intro_message then auth.uid() else intro_by end,
         results_publish_on = coalesce(p_publish_on, results_publish_on)
   where id = p_round;

  update app.outbox x
     set due_at = greatest(r.closes_at, (coalesce(p_publish_on, r.results_publish_on) + time '09:00') at time zone r.tz)
   where x.round_id = p_round and x.kind = 'resultat' and x.audience = 'alle_ansatte' and x.sent_at is null;

  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.set_round_send(uuid, text, date) from public, anon;
grant execute on function public.set_round_send(uuid, text, date) to authenticated;

-- ---------------------------------------------------------------- 1, 2, 4: «Siden sist»

/*
 * What was done since the last grunnlinje closed, for a round's invitation and its first page.
 *   first   true when no grunnlinje has closed before this round: the survey says so instead
 *   since   when that grunnlinje closed («svarene dere ga i {måned år}»)
 *   items   at most three: finished first, then the most recent; the whole organisation's
 *           collective measures only (none with a department), titles with people's names masked,
 *           no owner
 *   done    how many were finished since, for the invitation's «Siden sist er {n} tiltak gjennomført»
 */
create function app.since_last(p_round uuid) returns jsonb
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
           (select max(s.at) from app.measure_steps s where s.measure_id = me.id and s.step = me.step) as at
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

-- ---------------------------------------------------------------- 8: why a pulse asks again

/*
 * For a pulse: per factor it asks, the whole organisation's collective measures being worked on
 * (besluttet, pågår, gjennomført and not yet measured), with the day each started — the first
 * «pågår» in the log, or the day it was made. Nothing for a grunnlinje.
 */
create function app.pulse_reasons(p_round uuid) returns jsonb
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
                     order by y.started desc) as items
    from app.round_factors rf
    join app.measures me on me.org_id = r.org_id and me.factor_key = rf.factor_key
    cross join lateral (
      select coalesce((select min(s.at) from app.measure_steps s where s.measure_id = me.id and s.step = 'pagar'),
                      me.created_at) as started) y
    where rf.round_id = p_round and me.kind = 'kollektivt'
      and me.step in ('besluttet', 'pagar', 'gjennomfort')
      and not exists (select 1 from app.measure_groups g where g.measure_id = me.id)
    group by me.factor_key
  ) x;
  return v_out;
end $fn$;
revoke all on function app.pulse_reasons(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- the readers that carry it
-- Each is the current definition (0104) with the phase's keys added.

CREATE OR REPLACE FUNCTION public.respond_form(p_token text)
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
  v_own    jsonb;
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
                      'options_en', (select jsonb_agg(o->>'en' order by n) from jsonb_array_elements(i.options) with ordinality as y(o, n)),
                      -- 0090: the answer each option is sent as
                      'answers', to_jsonb(app.count_answer_keys(i)))
                    order by i.sort), '[]'::jsonb)
             from app.module_items i where i.module_id = m.id and i.kind = 'count'
               -- 0089: the count questions of the round's variant; 0090: and of its factors
               and app.count_item_asked(i, rm)) else '[]'::jsonb end,
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

  -- 0095: the organisation's own questions, in the order they were written, in its own words
  select jsonb_agg(jsonb_build_object('id', q.id, 'text', q.body, 'kind', q.kind) order by q.created_at, q.id)
  into v_own
  from app.round_org_questions rq join app.org_questions q on q.id = rq.question_id
  where rq.round_id = v_round.id;

  return jsonb_build_object(
    'org', v_org.name,
    -- 0104: the organisation's logo, by its address; says nothing about the person
    'logo', app.logo_key(v_org.id),
    'threshold', app.k_threshold(v_inv.org_id),
    'questions', coalesce(v_qs, '[]'::jsonb),
    'extra', coalesce(v_extra, '[]'::jsonb),
    'modules', coalesce(v_module, '[]'::jsonb),
    'own', coalesce(v_own, '[]'::jsonb),
    -- 0105 (engagement phase 2): what was done since the last grunnlinje, why a pulse asks again,
    -- and when everyone is told the results — the whole organisation's, never the person's group
    'since', app.since_last(v_round.id),
    'reasons', app.pulse_reasons(v_round.id),
    'publish_on', case when exists (
        select 1 from app.year_wheels yw join app.wheel_notifications wn on wn.wheel_id = yw.id
        where yw.org_id = v_round.org_id and wn.audience = 'alle_ansatte') then v_round.results_publish_on end,
    'page', v_round.results_page
  );
end $function$;

CREATE OR REPLACE FUNCTION public.round_page(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r          record;
  v_k        int;
  v_n        int;
  v_asked    int;
  v_answered int;
  v_factors  jsonb;
  v_overall  numeric;
  v_measures jsonb;
  v_pat      text[];
begin
  -- one answer for a link that is malformed, unknown, not yet closed or switched off
  if p_slug is null or p_slug !~ '^[A-Za-z0-9_-]{16}$' then
    return jsonb_build_object('error', 'not_available');
  end if;
  select ro.id, ro.org_id, ro.opens_at, ro.closes_at, ms.kind, ms.year, org.name as org_name
  into r
  from app.rounds ro
  join app.measurements ms on ms.id = ro.measurement_id
  join app.organizations org on org.id = ro.org_id
  where ro.share_slug = p_slug and ro.status = 'lukket' and ro.results_page
    -- 0105: not before the day the results are shared with everyone
    and app.results_published(ro.id);
  if r.id is null then
    return jsonb_build_object('error', 'not_available');
  end if;

  v_k := app.k_threshold(r.org_id);
  select count(*) into v_n from app.responses resp where resp.round_id = r.id;

  -- the totals public.participation gives the leaders: invited and still employed, and answered
  select count(e.id)::int, count(i.responded_at)::int into v_asked, v_answered
  from app.invitations i
  join app.employees e on e.id = i.employee_id and e.active
  where i.round_id = r.id;

  if v_n >= v_k then
    -- the whole house only, as public.results_summary reads it for the daglig leder
    select jsonb_agg(x order by (x->>'sort_order')::int) into v_factors
    from (
      select jsonb_build_object('key', f.key, 'sort_order', f.sort_order,
               'index', round(avg(app.to_index(ans.value))),
               'band', app.risk_band(round(avg(app.to_index(ans.value))))) as x
      from app.answers ans
      join app.responses resp on resp.id = ans.response_id
      join app.factors f on f.key = ans.factor_key
      where resp.round_id = r.id
      group by f.key, f.sort_order
      having (
        select min(y.m) from (
          select count(distinct a2.response_id) as m
          from app.statements st
          left join app.answers a2
            on a2.factor_key = st.factor_key and a2.ordinal = st.ordinal
           and a2.response_id in (select r3.id from app.responses r3 where r3.round_id = r.id)
          where st.factor_key = f.key
          group by st.ordinal) y) >= v_k
    ) s;
    select round(avg((e->>'index')::numeric)) into v_overall
    from jsonb_array_elements(coalesce(v_factors, '[]'::jsonb)) e;
  end if;

  -- people's names only: a measure's department or place is what employees need to see
  v_pat := app.mask_patterns(r.org_id);
  v_pat := array[null, null, v_pat[3], v_pat[4]];
  select coalesce(jsonb_agg(jsonb_build_object(
           'title', app.mask_apply(m.title, v_pat),
           'factor', m.factor_key,
           'step', m.step,
           'due', m.due_date,
           'done', m.completed_on)
         order by array_position(array['pagar', 'besluttet', 'gjennomfort', 'effekt_malt', 'lukket']::app.measure_step[], m.step),
                  m.due_date nulls last, m.title), '[]'::jsonb)
  into v_measures
  from app.measures m
  where m.round_id = r.id and m.kind = 'kollektivt' and m.step <> 'foreslatt';

  return jsonb_build_object(
    'status', case when v_n >= v_k then 'ok' else 'insufficient_data' end,
    'org', r.org_name,
    -- 0104
    'logo', app.logo_key(r.org_id),
    'round', jsonb_build_object('kind', r.kind, 'year', r.year, 'opens_at', r.opens_at, 'closes_at', r.closes_at),
    'threshold', v_k,
    'asked', coalesce(v_asked, 0),
    'answered', coalesce(v_answered, 0),
    'index', v_overall,
    'band', case when v_overall is not null then app.risk_band(v_overall) end,
    'factors', coalesce(v_factors, '[]'::jsonb),
    'measures', v_measures);
end $function$;

CREATE OR REPLACE FUNCTION public.dispatch_claim(p_batch integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$

declare
  v_out     jsonb := '[]'::jsonb;
  x         record;
  r         record;
  v_why     text;
  v_rcpt    jsonb;
  v_key     text;
  v_pulse   int;
  v_channel text;
  v_email   text;
  v_phone   text;
  v_sms     boolean;
  v_rule    text;
  v_personal boolean;
  v_org     record;
  v_items   jsonb;
begin
  for x in
    select o.*
    from app.outbox o
    join app.organizations org on org.id = o.org_id
    left join app.survey_defaults sd on sd.org_id = o.org_id
    where o.sent_at is null
      and o.failed_at is null
      and o.due_at <= now()
      and (o.claimed_at is null or o.claimed_at < now() - interval '10 minutes')
      and org.mail_enabled
      -- quiet hours: no invitation or reminder between 21 and 07 where the organisation is.
      -- A link somebody asked for is not held.
      and (o.kind not in ('invitasjon', 'paminnelse', 'siste_paminnelse')
           or not coalesce(sd.quiet_hours, true)
           or extract(hour from now() at time zone org.timezone) between 7 and 20)
    order by o.due_at, o.id
    limit least(greatest(coalesce(p_batch, 20), 1), 100)
    for update of o skip locked
  loop
    -- 0099: the organisation on its own, since a measure's notice belongs to no round
    select org.name as org_name, org.default_lang, app.k_threshold(org.id) as k,
           org.sms_enabled, org.sms_when, org.sms_text, org.invite_greeting,
           (select p.full_name from app.profiles p where p.id = org.invite_greeting_by) as greeting_by
    into v_org
    from app.organizations org where org.id = x.org_id;

    r := null;
    select ro.status, ro.opens_at, ro.closes_at, ro.sms_when as round_sms_when, ms.kind, ms.year,
           -- 0105: the round's own introduction, and who wrote it
           ro.intro_message, (select p.full_name from app.profiles p where p.id = ro.intro_by) as intro_by_name
    into r
    from app.rounds ro
    join app.measurements ms on ms.id = ro.measurement_id
    where ro.id = x.round_id;

    -- 0099: a measure's notice lists what is overdue now, for its owner or for the verneombud
    v_items := null;
    if x.kind = 'tiltak_forfalt' then
      select coalesce(jsonb_agg(jsonb_build_object('title', me.title, 'due', me.due_date) order by me.due_date nulls last, me.title), '[]'::jsonb)
      into v_items
      from app.overdue_measures(x.org_id) me
      where x.employee_id is null or me.owner_employee_id = x.employee_id;
    end if;

    v_personal := x.kind in ('invitasjon', 'paminnelse', 'siste_paminnelse', 'lenke');

    v_why := case
      when v_personal and r.status <> 'apen' then 'round_not_open'
      when v_personal and exists (
        select 1 from app.invitations i
        where i.id = x.invitation_id and (i.responded_at is not null or i.expires_at <= now())
      ) then 'answered_or_expired'
      when x.kind = 'forvarsel' and r.status <> 'planlagt' then 'round_already_open'
      when x.kind = 'resultat' and (r.status <> 'lukket' or x.due_at < now() - interval '14 days') then 'stale'
      -- 0099: nothing overdue any more, or a round no longer open
      when x.kind = 'tiltak_forfalt' and jsonb_array_length(v_items) = 0 then 'resolved'
      when x.kind = 'svarprosent' and (r.status is distinct from 'apen' or x.due_at < now() - interval '3 days') then 'stale'
      -- 0104: an evaluation recorded since, or no longer due (A-02)
      when x.kind = 'evaluering' and not exists (
        select 1 from app.evaluation_due(x.org_id) d
        where d.due_on is not null and d.due_on <= (now() at time zone 'Europe/Oslo')::date) then 'resolved'
    end;

    v_channel := 'email';
    if v_why is null and v_personal then
      -- one person: choose the channel that carries their link
      select case when d.email is null or app.reserved_address(d.email) then null else d.email end, d.phone
      into v_email, v_phone
      from app.dispatch_recipients(x.id) d
      limit 1;
      v_sms := v_org.sms_enabled and v_phone is not null;
      v_rule := coalesce(r.round_sms_when, v_org.sms_when);
      if x.kind = 'lenke' then
        -- the channel they typed their address or number into
        v_channel := case
          when x.channel = 'sms' and v_sms then 'sms'
          when x.channel = 'email' and v_email is not null then 'email'
        end;
      else
        v_channel := case
          when v_sms and (v_rule = 'alle'
                          or (v_rule = 'paaminn' and x.kind in ('paminnelse', 'siste_paminnelse'))
                          or (v_rule = 'mangler' and v_email is null)) then 'sms'
          when v_email is not null then 'email'
          when v_sms then 'sms'
        end;
      end if;
      if v_channel is null then
        v_why := 'no_address';
      else
        select coalesce(jsonb_agg(jsonb_build_object(
                 'email', v_email,
                 'phone', case when v_sms then v_phone end,
                 'name', d.name, 'lang', d.lang, 'member', d.member)), '[]'::jsonb)
        into v_rcpt
        from app.dispatch_recipients(x.id) d;
      end if;
    elsif v_why is null then
      -- a role notice: e-mail only, never to a reserved address
      select coalesce(jsonb_agg(jsonb_build_object(
               'email', d.email, 'phone', null, 'name', d.name, 'lang', d.lang, 'member', d.member)), '[]'::jsonb)
      into v_rcpt
      from app.dispatch_recipients(x.id) d
      where d.email is not null and not app.reserved_address(d.email);
      if jsonb_array_length(v_rcpt) = 0 then v_why := 'no_address'; end if;
    end if;

    if v_why is not null then
      update app.outbox set failed_at = now(), last_error = v_why, claimed_at = null where id = x.id;
      continue;
    end if;

    v_key := null;
    if x.invitation_id is not null then
      v_key := app.new_respondent_token();
      update app.invitations set token_hash = extensions.digest(v_key, 'sha256') where id = x.invitation_id;
    end if;

    v_pulse := null;
    if x.round_id is not null and r.kind = 'puls' and r.opens_at is not null then
      select count(*) into v_pulse
      from app.rounds r2 join app.measurements m2 on m2.id = r2.measurement_id
      where r2.org_id = x.org_id and m2.kind = 'puls' and m2.year = r.year
        and r2.opens_at is not null
        and (r2.opens_at < r.opens_at or (r2.opens_at = r.opens_at and r2.id <= x.round_id));
    end if;

    update app.outbox set claimed_at = now(), attempts = attempts + 1 where id = x.id;

    v_out := v_out || jsonb_build_object(
      'id', x.id,
      'kind', x.kind,
      'audience', x.audience,
      'channel', v_channel,
      'sms_text', v_org.sms_text,
      'lang', coalesce(v_org.default_lang, 'no'),
      'org', v_org.org_name,
      'k', v_org.k,
      'round', case when x.round_id is not null then jsonb_build_object(
        'kind', r.kind, 'year', r.year, 'pulse', nullif(v_pulse, 0),
        'opens_at', r.opens_at, 'closes_at', r.closes_at) end,
      -- 0099 (P1-1): what an invitation says about itself — its length, whether everyone is told
      -- the results, and the daglig leder's own greeting
      'minutes', case when x.kind = 'invitasjon' then app.round_minutes(x.round_id) end,
      'results_shared', case when x.kind = 'invitasjon' then exists (
        select 1 from app.year_wheels yw join app.wheel_notifications wn on wn.wheel_id = yw.id
        where yw.org_id = x.org_id and wn.audience = 'alle_ansatte') end,
      -- 0105: the round's introduction where one was written for it, else the organisation's greeting
      'greeting', case when x.kind = 'invitasjon' and coalesce(r.intro_message, v_org.invite_greeting) is not null then
        jsonb_build_object('text', coalesce(r.intro_message, v_org.invite_greeting),
                           'by', case when r.intro_message is not null then r.intro_by_name else v_org.greeting_by end) end,
      -- 0105 (engagement phase 2): «Siden sist», for the invitation's e-mail
      'since', case when x.kind = 'invitasjon' then app.since_last(x.round_id) end,
      'measures', v_items,
      -- 0104 (A-02): when the ordning was last evaluated, by which cadence, and when it fell due
      'evaluation', case when x.kind = 'evaluering' then (
        select jsonb_build_object('cadence', d.cadence, 'last_on', d.last_on, 'due_on', d.due_on)
        from app.evaluation_due(x.org_id) d) end,
      -- 0104: the organisation's logo, by its address, for the head of every notice
      'logo', app.logo_key(x.org_id),
      -- 0100 (P1-3): the page «Dette sa dere, dette gjør vi» — the round's own in its results
      -- notice, the last one shared in the next invitation
      'results_page', case
        when x.kind = 'resultat' then (
          select ro.share_slug from app.rounds ro
          where ro.id = x.round_id and ro.status = 'lukket' and ro.results_page)
        when x.kind = 'invitasjon' then (
          select ro.share_slug from app.rounds ro
          where ro.org_id = x.org_id and ro.id <> x.round_id and ro.status = 'lukket' and ro.results_page
            and app.results_published(ro.id)
          order by ro.closes_at desc nulls last limit 1)
      end,
      'recipients', v_rcpt,
      -- the languages the survey is ready in, for the personal kinds (0079): the dispatcher
      -- adds the flag and the page strings' hash, as the respondent page does
      'locales', case when v_personal then app.round_locale_state(x.round_id) end,
      'token', v_key);
  end loop;

  return v_out;
end $function$;
