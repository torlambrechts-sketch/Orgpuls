-- 0129 — The deep audit's open P2 and P3 findings in the database (docs/audits/2026-09-28-deep.md)
--
-- AUD-22  The employees' page listed a department's measures and printed how many answered when
--         fewer than k had. It promises «ingen avdeling» and «ingen tall der færre enn k har svart»:
--         both now hold (round_page).
-- AUD-23  The publish date moved after the invitation had named it. Once a round is open the date
--         may only come earlier, never later than the one people were told (set_round_send).
-- AUD-26  A date was accepted for a round with no close, and a close moved earlier never pulled a
--         date back under close + 60 (set_round_send, the publish-date trigger).
-- P3      queue_evaluation_notices queued for organisations whose e-mail is off, every demo
--         sandbox among them, to go all at once when mail was turned on.
-- P3      The foreign keys org_logos.updated_by and rounds.intro_by get their indexes.

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
  where m.round_id = r.id and m.kind = 'kollektivt' and m.step <> 'foreslatt'
    -- 0129 (AUD-22): the whole organisation's measures only, as «Siden sist» lists them; the page
    -- promises no department
    and not exists (select 1 from app.measure_groups g where g.measure_id = m.id);

  return jsonb_build_object(
    'status', case when v_n >= v_k then 'ok' else 'insufficient_data' end,
    'org', r.org_name,
    -- 0104
    'logo', app.logo_key(r.org_id),
    'round', jsonb_build_object('kind', r.kind, 'year', r.year, 'opens_at', r.opens_at, 'closes_at', r.closes_at),
    'threshold', v_k,
    -- 0129 (AUD-22): «no figure where fewer than k answered» holds for the count of answers too
    'asked', case when v_n >= v_k then coalesce(v_asked, 0) end,
    'answered', case when v_n >= v_k then coalesce(v_answered, 0) end,
    'index', v_overall,
    'band', case when v_overall is not null then app.risk_band(v_overall) end,
    'factors', coalesce(v_factors, '[]'::jsonb),
    'measures', v_measures);
end $function$;

/*
 * set_round_send, as in 0105, with the publish date's rules made whole: a date needs a close;
 * it lies between the close and close + 60; and once the round is open — the invitation has named
 * the day — it may move earlier, never later.
 */
create or replace function public.set_round_send(p_round uuid, p_intro text, p_publish_on date) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  r      record;
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
  if p_publish_on is not null then
    if v_close is null or p_publish_on < v_close or p_publish_on > v_close + 60 then
      return jsonb_build_object('error', 'publish_range');
    end if;
    -- 0129 (AUD-23): the invitation has told people this day; it may come sooner, not later
    if r.status <> 'planlagt' and r.results_publish_on is not null and p_publish_on > r.results_publish_on then
      return jsonb_build_object('error', 'publish_later');
    end if;
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

/*
 * The publish date follows the close (0105), and now stays within close + 60 when the close moves
 * earlier (AUD-26).
 */
create or replace function app.rounds_publish_default() returns trigger
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
  new.results_publish_on := least(greatest(new.results_publish_on, v_new), v_new + 60);
  return new;
end $fn$;

-- ---------------------------------------------------------------- the evaluation reminder, mail on only
create or replace function app.queue_evaluation_notices() returns int
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_n int;
begin
  insert into app.outbox (org_id, round_id, kind, audience, due_at)
  select o.id, null::uuid, 'evaluering'::app.outbox_kind, 'daglig_leder'::app.notify_audience, now()
  from app.organizations o
  cross join lateral app.evaluation_due(o.id) d
  where o.mail_enabled
    and d.due_on is not null
    and d.due_on <= (now() at time zone coalesce(o.timezone, 'Europe/Oslo'))::date
    and not exists (select 1 from app.outbox x where x.org_id = o.id and x.kind = 'evaluering'
                      and x.created_at > now() - interval '27 days');
  get diagnostics v_n = row_count;
  return v_n;
end $fn$;

-- ---------------------------------------------------------------- indexes
create index if not exists org_logos_updated_by on app.org_logos (updated_by);
create index if not exists rounds_intro_by on app.rounds (intro_by);
