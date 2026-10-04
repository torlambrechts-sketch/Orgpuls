-- 0201_free_plan_and_annual.sql — a free plan after the trial, and yearly billing (D-217).
--
-- Decided by the owner on 2026-10-04, to bring organisations in before asking them to pay:
--
--   * **The free plan is where the trial lands.** The trial (15 days, one extension of 15) and
--     the 14 days' grace are unchanged; an organisation that has not chosen a plan by then is on
--     the free plan instead of read-only. It keeps everything it has, and it may go on running
--     the standard main survey (the grunnlinje: the core instrument and the questions outside the
--     index), read its results and work with its measures, for as long as it likes, at any size.
--   * **What the free plan does not include**, refused here rather than hidden on a screen:
--     pulses and follow-up rounds (start_next_pulse, wheel_month_change «legg til», the wheel's
--     own planning, a measurement of another kind), the industry modules (set_org_module, a
--     round's module rows) and the organisation's own questions. The statutory report and the
--     comparisons with earlier rounds are read paths the app does not render for a free
--     organisation (lib/billing/plan.ts); the data stays the organisation's own.
--   * A round that is already open is never cut off, as for read-only (0052). A puls planned
--     during the trial waits, as a read-only organisation's rounds wait, and opens when a plan is
--     chosen; a grunnlinje planned during the trial opens without its module and own-question rows.
--   * A cancellation still ends in read-only and deletion (0064): that is the customer ending the
--     agreement, not the trial running out.
--
--   * **Yearly billing**: app.billing.billing_interval, 'month' or 'year'. A year costs
--     app.annual_months() = 10 months' price, two months free. save_billing takes the interval; a
--     yearly subscription cancelled runs to the end of its paid year, a monthly one to the end of
--     the month, as before. MRR counts a year as a twelfth.

-- ---------------------------------------------------------------- yearly billing
alter table app.billing add column billing_interval text not null default 'month'
  check (billing_interval in ('month', 'year'));
comment on column app.billing.billing_interval is
  'How the subscription is invoiced (0201): month, or year at app.annual_months() months'' price. Set only by save_billing.';

create function app.annual_months() returns int
  language sql immutable parallel safe set search_path = ''
as $fn$ select 10 $fn$;

-- the plan's monthly recurring revenue: a yearly invoice spread over twelve months
create function app.plan_mrr_nok(p_plan text, p_interval text) returns int
  language sql immutable set search_path = ''
as $fn$
  select case when p_interval = 'year' then round(app.plan_monthly_nok(p_plan) * app.annual_months() / 12.0)::int
              else app.plan_monthly_nok(p_plan) end
$fn$;

-- ---------------------------------------------------------------- access
-- trial | grace | free | active | read_only. Read-only is now only a cancellation that has taken
-- effect; past the trial and its grace, unconfirmed, an organisation is on the free plan.
create or replace function app.org_access(p_org uuid) returns text
  language sql stable security definer set search_path = ''
as $fn$
  select coalesce((
    select case
      when b.cancel_effective_at is not null and now() >= b.cancel_effective_at then 'read_only'
      when b.confirmed_at is not null then 'active'
      when now() < b.trial_ends_at then 'trial'
      when now() < b.trial_ends_at + make_interval(days => app.grace_days()) then 'grace'
      else 'free'
    end
    from app.billing b where b.org_id = p_org), 'trial')
$fn$;

create function app.org_free(p_org uuid) returns boolean
  language sql stable security definer set search_path = ''
as $fn$ select coalesce(app.org_access(p_org) = 'free', false) $fn$;

-- free_from replaces read_only_from, which is kept for a client deployed before this
create or replace function public.org_access_state(p_org uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select case when app.is_org_member(p_org) then (
    select jsonb_build_object('access', app.org_access(p_org),
                              'trial_ends_at', b.trial_ends_at,
                              'free_from', b.trial_ends_at + make_interval(days => app.grace_days()),
                              'read_only_from', b.trial_ends_at + make_interval(days => app.grace_days()),
                              'cancel_effective_at', b.cancel_effective_at,
                              'deletion_due_at', b.deletion_due_at)
    from app.billing b where b.org_id = p_org)
  end
$fn$;

-- ---------------------------------------------------------------- the free plan's limits
-- A puls: the public name checks access first, as 0052's wrapper did.
create or replace function public.start_next_pulse(p_org uuid) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
begin
  if p_org is not null and app.is_org_member(p_org) then
    if app.org_access(p_org) = 'read_only' then
      return jsonb_build_object('error', 'read_only');
    end if;
    if app.org_free(p_org) then
      return jsonb_build_object('error', 'free_plan');
    end if;
  end if;
  return app.start_next_pulse_unchecked(p_org);
end $fn$;

-- A month added to the wheel is a puls. Skipping one, or taking a mark back, stays open to all.
alter function public.wheel_month_change(uuid, int, int, text) set schema app;
alter function app.wheel_month_change(uuid, int, int, text) rename to wheel_month_change_unchecked;
revoke all on function app.wheel_month_change_unchecked(uuid, int, int, text) from public, anon, authenticated;

create function public.wheel_month_change(p_org uuid, p_year int, p_month int, p_action text) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
begin
  if p_action = 'legg_til' and p_org is not null and app.is_org_member(p_org) and app.org_free(p_org) then
    return jsonb_build_object('error', 'free_plan');
  end if;
  return app.wheel_month_change_unchecked(p_org, p_year, p_month, p_action);
end $fn$;

-- Turning an industry module on. Turning one off stays open to all.
alter function public.set_org_module(uuid, text, boolean) set schema app;
alter function app.set_org_module(uuid, text, boolean) rename to set_org_module_unchecked;
revoke all on function app.set_org_module_unchecked(uuid, text, boolean) from public, anon, authenticated;

create function public.set_org_module(p_org uuid, p_key text, p_enabled boolean) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
begin
  if coalesce(p_enabled, false) and p_org is not null and app.is_org_member(p_org) and app.org_free(p_org) then
    return jsonb_build_object('error', 'free_plan');
  end if;
  return app.set_org_module_unchecked(p_org, p_key, p_enabled);
end $fn$;

-- The same limits on the tables, whatever path writes them: a measurement of another kind than
-- the grunnlinje (Måleoppsett writes app.measurements directly), a module switched on, a round's
-- module rows and own questions. The messages begin «free_plan» so a server action can name the
-- refusal without echoing it.
create function app.free_plan_guard() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_org uuid;
begin
  if tg_table_name = 'measurements' then
    if new.kind = 'grunnlinje' or (tg_op = 'UPDATE' and new.kind is not distinct from old.kind) then
      return new;
    end if;
    v_org := new.org_id;
  elsif tg_table_name = 'org_modules' then
    if not new.enabled or (tg_op = 'UPDATE' and old.enabled) then
      return new;
    end if;
    v_org := new.org_id;
  elsif tg_table_name = 'round_modules' then
    v_org := new.org_id;
  else -- round_org_questions
    select r.org_id into v_org from app.rounds r where r.id = new.round_id;
  end if;

  if not app.org_free(v_org) then
    return new;
  end if;
  -- a new round takes the organisation's enabled modules from a trigger (round_default_modules);
  -- on the free plan that copy is skipped rather than refused, so planning a grunnlinje still works
  if tg_table_name = 'round_modules' and pg_trigger_depth() > 1 then
    return null;
  end if;
  raise exception 'free_plan: % is not included in the free plan', tg_table_name using errcode = 'P0001';
end $fn$;
revoke all on function app.free_plan_guard() from public, anon, authenticated;

create trigger measurements_free_plan before insert or update of kind on app.measurements
  for each row execute function app.free_plan_guard();
create trigger org_modules_free_plan before insert or update of enabled on app.org_modules
  for each row execute function app.free_plan_guard();
create trigger round_modules_free_plan before insert on app.round_modules
  for each row execute function app.free_plan_guard();
create trigger round_org_questions_free_plan before insert on app.round_org_questions
  for each row execute function app.free_plan_guard();

-- ---------------------------------------------------------------- the wheel
-- 0133's wheel_plan and wheel_tick, with the 0201 lines marked.
CREATE OR REPLACE FUNCTION app.wheel_plan(p_wheel uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  w         app.year_wheels%rowtype;
  m         record;
  v_tz      text;
  v_year    int;
  v_at      timestamptz;
  v_planned int := 0;
begin
  select * into w from app.year_wheels where id = p_wheel;
  if not found then
    return 0;
  end if;
  select coalesce(o.timezone, 'Europe/Oslo') into v_tz from app.organizations o where o.id = w.org_id;

  for m in select * from app.wheel_months(w.cadence, w.baseline_month, w.skip_fellesferie) loop
    for v_year in extract(year from now())::int .. extract(year from now())::int + 1 loop
      v_at := app.first_tuesday(v_year, m.month, v_tz);
      continue when v_at <= now() or v_at > now() + interval '1 year';

      continue when exists (
        select 1 from app.rounds ro join app.measurements ms on ms.id = ro.measurement_id
        where ro.org_id = w.org_id and ms.kind = m.kind
          and date_trunc('month', ro.opens_at at time zone v_tz)
            = date_trunc('month', v_at at time zone v_tz));

      -- 0201: on the free plan the wheel plans the grunnlinje and nothing else
      continue when m.kind <> 'grunnlinje' and app.org_free(w.org_id);

      continue when m.kind = 'grunnlinje' and exists (
        select 1 from app.rounds ro join app.measurements ms on ms.id = ro.measurement_id
        where ro.org_id = w.org_id and ms.kind = 'grunnlinje'
          and ro.opens_at < v_at and ro.opens_at > v_at - interval '6 months');

      continue when m.kind = 'puls' and (
        not exists (select 1 from app.measures me
                    where me.org_id = w.org_id and me.step <> 'lukket')
        or exists (
          select 1 from app.rounds ro join app.measurements ms on ms.id = ro.measurement_id
          where ro.org_id = w.org_id and ms.kind = 'grunnlinje'
            and date_trunc('month', ro.opens_at at time zone v_tz)
              = date_trunc('month', v_at at time zone v_tz)));

      -- 0133: a month the leader skipped keeps no puls
      continue when m.kind = 'puls' and exists (
        select 1 from app.wheel_month_marks mk
        where mk.org_id = w.org_id and mk.year = v_year and mk.month = m.month and mk.mark = 'hoppet_over');

      if app.plan_round(w.org_id, m.kind, v_year, m.month, v_tz) is not null then
        v_planned := v_planned + 1;
      end if;
    end loop;
  end loop;

  -- 0133: a month the leader added is planned as the wheel's own are, whatever its distance
  for m in
    select mk.year, mk.month from app.wheel_month_marks mk
    where mk.org_id = w.org_id and mk.mark = 'lagt_til'
  loop
    v_at := app.first_tuesday(m.year, m.month, v_tz);
    continue when v_at <= now();
    continue when exists (
      select 1 from app.rounds ro
      where ro.org_id = w.org_id
        and date_trunc('month', ro.opens_at at time zone v_tz) = date_trunc('month', v_at at time zone v_tz));
    continue when not exists (select 1 from app.measures me where me.org_id = w.org_id and me.step <> 'lukket');
    -- 0201: an added month is a puls, which the free plan does not include
    continue when app.org_free(w.org_id);

    if app.plan_round(w.org_id, 'puls', m.year, m.month, v_tz) is not null then
      v_planned := v_planned + 1;
    end if;
  end loop;

  return v_planned;
end $function$;

CREATE OR REPLACE FUNCTION app.wheel_tick()
 RETURNS app.job_runs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  w         app.year_wheels%rowtype;
  r         record;
  v_opened  int := 0;
  v_closed  int := 0;
  v_queued  int := 0;
  v_planned int := 0;
  v_n       int;
  v_tz      text;
  v_run     app.job_runs;
  v_readonly boolean;
  v_free boolean;
  v_invited int;
  v_answered int;
begin
  for w in select * from app.year_wheels where active loop
    -- 0042: the same lock start_next_pulse takes, so the two cannot open rounds at once
    perform pg_advisory_xact_lock(hashtext('start_next_pulse:' || w.org_id::text));
    select coalesce(o.timezone, 'Europe/Oslo') into v_tz
    from app.organizations o where o.id = w.org_id;

    -- 0052: past its trial and 14 days' grace, unconfirmed, an organisation reads its results
    -- and sends nothing new. A planned round that falls due waits a day at a time, so it opens
    -- with its full length once the plan is confirmed; a round already open runs on, with its
    -- reminders and its close (steps 3 and 4 do not look at this).
    v_readonly := coalesce(app.org_access(w.org_id) = 'read_only', false);
    if v_readonly then
      update app.rounds set opens_at = now() + interval '1 day'
      where org_id = w.org_id and status = 'planlagt' and opens_at is not null and opens_at <= now() + interval '1 day';
    end if;

    -- 0201: on the free plan only the grunnlinje runs. A planned puls or follow-up (planned during
    -- the trial) waits a day at a time, as a read-only organisation's rounds do, so it opens with
    -- its full length once a plan is chosen, and it sends no forvarsel while it waits.
    v_free := not v_readonly and app.org_free(w.org_id);
    if v_free then
      update app.rounds ro set opens_at = now() + interval '1 day'
      from app.measurements ms
      where ms.id = ro.measurement_id and ms.kind <> 'grunnlinje'
        and ro.org_id = w.org_id and ro.status = 'planlagt' and ro.opens_at is not null
        and ro.opens_at <= now() + interval '1 day';
    end if;

    -- 1 ---------------------------------------------------------------- forvarsel
    for r in
      select ro.id, ro.org_id, ro.opens_at from app.rounds ro
      where ro.org_id = w.org_id and ro.status = 'planlagt' and ro.opens_at is not null
        and not v_readonly
        and not (v_free and exists (select 1 from app.measurements ms
                                    where ms.id = ro.measurement_id and ms.kind <> 'grunnlinje'))
    loop
      insert into app.outbox (org_id, round_id, kind, audience, due_at)
      select r.org_id, r.id, 'forvarsel', n.audience, r.opens_at - make_interval(days => n.lead_days)
      from app.wheel_notifications n
      where n.wheel_id = w.id
        and r.opens_at - make_interval(days => n.lead_days) <= now()
      on conflict do nothing;
      get diagnostics v_n = row_count;
      v_queued := v_queued + v_n;
    end loop;

    -- 2 ---------------------------------------------------------------- open
    for r in
      select ro.* from app.rounds ro
      where ro.org_id = w.org_id and ro.status = 'planlagt'
        and ro.opens_at is not null and ro.opens_at <= now()
        and not v_readonly
        and not (v_free and exists (select 1 from app.measurements ms
                                    where ms.id = ro.measurement_id and ms.kind <> 'grunnlinje'))
    loop
      -- 0201: a grunnlinje planned during the trial opens on the free plan without what that plan
      -- does not include: the industry modules and the organisation's own questions. The
      -- organisation's choices stay (org_modules, its question bank); only this round's copies go.
      if v_free then
        delete from app.round_modules where round_id = r.id;
        delete from app.round_org_questions where round_id = r.id;
      end if;

      update app.rounds
      set status = 'apen',
          closes_at = r.opens_at + make_interval(days => r.close_after_days)
      where id = r.id;
      v_opened := v_opened + 1;

      insert into app.invitations (org_id, round_id, employee_id, token_hash, sent_at, expires_at)
      select r.org_id, r.id, e.id,
             extensions.digest(encode(extensions.gen_random_bytes(32), 'hex'), 'sha256'),
             null,
             r.opens_at + make_interval(days => r.close_after_days)
      from app.employees e
      where e.org_id = r.org_id and e.active
        and (not exists (select 1 from app.round_groups rg where rg.round_id = r.id)
             or e.group_id in (select rg.group_id from app.round_groups rg where rg.round_id = r.id))
      on conflict do nothing;

      insert into app.outbox (org_id, round_id, kind, employee_id, invitation_id, due_at)
      select r.org_id, r.id, 'invitasjon', i.employee_id, i.id, r.opens_at
      from app.invitations i where i.round_id = r.id
      on conflict do nothing;
      get diagnostics v_n = row_count;
      v_queued := v_queued + v_n;
    end loop;

    -- 3 ---------------------------------------------------------------- reminder
    -- 0133: once per round (the record, not the rows, says it went), and only while the round has
    -- sent fewer than two. A person the leader reminded earlier is reminded again: their row is
    -- queued again, as the extension does.
    for r in
      select ro.* from app.rounds ro
      where ro.org_id = w.org_id and ro.status = 'apen'
        and ro.reminder_day is not null
        and ro.opens_at + make_interval(days => ro.reminder_day) <= now()
        and not exists (select 1 from app.round_reminders rr where rr.round_id = ro.id and rr.source = 'stige')
        and app.round_reminder_count(ro.id) < 2
    loop
      insert into app.outbox as ob (org_id, round_id, kind, employee_id, invitation_id, due_at)
      select r.org_id, r.id, 'paminnelse', i.employee_id, i.id,
             r.opens_at + make_interval(days => r.reminder_day)
      from app.invitations i
      where i.round_id = r.id and i.responded_at is null
      on conflict (round_id, kind, employee_id) where employee_id is not null do update
        set due_at = excluded.due_at, sent_at = null, failed_at = null, claimed_at = null, attempts = 0,
            last_error = null, provider_id = null, delivery = null, delivery_at = null,
            invitation_id = excluded.invitation_id;
      get diagnostics v_n = row_count;
      v_queued := v_queued + v_n;

      insert into app.round_reminders (org_id, round_id, source, sent_at)
      values (r.org_id, r.id, 'stige', r.opens_at + make_interval(days => r.reminder_day))
      on conflict do nothing;
    end loop;

    -- 4 ---------------------------------------------------------------- close
    for r in
      select ro.* from app.rounds ro
      where ro.org_id = w.org_id and ro.status = 'apen'
        and ro.closes_at is not null and ro.closes_at <= now()
    loop
      -- 0096: fewer than half answered, and the wheel says extend: three days more, once
      -- the response rate as every screen counts it: responses over invitations
      select count(*) into v_invited from app.invitations i where i.round_id = r.id;
      select count(*) into v_answered from app.responses x where x.round_id = r.id;

      if w.extend_if_low and r.extended_at is null and v_invited > 0 and v_answered * 2 < v_invited then
        update app.rounds
        set closes_at = r.closes_at + interval '3 days', extended_at = now()
        where id = r.id;
        update app.invitations
        set expires_at = greatest(expires_at, r.closes_at + interval '3 days')
        where round_id = r.id and responded_at is null;

        -- a reminder now to everyone who has not answered: their one reminder row, queued again —
        -- 0133: unless the round has sent its two
        if app.round_reminder_count(r.id) < 2 then
          insert into app.outbox as ob (org_id, round_id, kind, employee_id, invitation_id, due_at)
          select r.org_id, r.id, 'paminnelse', i.employee_id, i.id, now()
          from app.invitations i
          where i.round_id = r.id and i.responded_at is null
          on conflict (round_id, kind, employee_id) where employee_id is not null do update
            set due_at = now(), sent_at = null, failed_at = null, claimed_at = null, attempts = 0,
                last_error = null, provider_id = null, delivery = null, delivery_at = null,
                invitation_id = excluded.invitation_id;
          get diagnostics v_n = row_count;
          v_queued := v_queued + v_n;

          insert into app.round_reminders (org_id, round_id, source, sent_at)
          values (r.org_id, r.id, 'forlengelse', now())
          on conflict do nothing;
        end if;
        continue;
      end if;

      v_queued := v_queued + app.close_round(r.id);
      v_closed := v_closed + 1;
    end loop;

    -- 5 ---------------------------------------------------------------- plan ahead
    v_planned := v_planned + app.wheel_plan(w.id);
  end loop;

  insert into app.job_runs (opened, closed, queued, planned)
  values (v_opened, v_closed, v_queued, v_planned)
  returning * into v_run;

  return v_run;
end $function$;


-- ---------------------------------------------------------------- save_billing, with the interval
-- 0048's, unchanged but for p_interval. The six-argument form is dropped so one signature remains.
drop function public.save_billing(uuid, text, text, text, boolean, boolean);

create function public.save_billing(
  p_org uuid,
  p_plan text,
  p_invoice_email text,
  p_invoice_ref text,
  p_ehf boolean,
  p_confirm boolean,
  p_interval text default 'month'
) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_employees int;
  v_org_number text;
  v_email text := lower(btrim(coalesce(p_invoice_email, '')));
  v_ref text := nullif(btrim(coalesce(p_invoice_ref, '')), '');
  v_interval text := coalesce(p_interval, 'month');
begin
  if p_org is null or not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  select o.employee_count, o.org_number into v_employees, v_org_number
  from app.organizations o where o.id = p_org;

  if p_plan is null or p_plan not in ('small', 'usual', 'group') then
    return jsonb_build_object('ok', false, 'error', 'invalid_plan');
  end if;
  if v_interval not in ('month', 'year') then
    return jsonb_build_object('ok', false, 'error', 'invalid_interval');
  end if;
  if (p_plan = 'small' and v_employees > 25) or (p_plan = 'usual' and v_employees > 100) then
    return jsonb_build_object('ok', false, 'error', 'plan_too_small');
  end if;
  if char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;
  if v_ref is not null and char_length(v_ref) > 60 then
    return jsonb_build_object('ok', false, 'error', 'invalid_ref');
  end if;
  -- EHF is addressed by organisation number; without one there is nowhere to send it
  if coalesce(p_ehf, false) and v_org_number is null then
    return jsonb_build_object('ok', false, 'error', 'ehf_needs_orgnr');
  end if;

  update app.billing b
     set plan = p_plan,
         billing_interval = v_interval,
         invoice_email = v_email,
         invoice_ref = v_ref,
         ehf = coalesce(p_ehf, false),
         confirmed_at = case when coalesce(p_confirm, false) and b.confirmed_at is null then now() else b.confirmed_at end,
         confirmed_by = case when coalesce(p_confirm, false) and b.confirmed_at is null then auth.uid() else b.confirmed_by end,
         updated_at = now()
   where b.org_id = p_org;

  return jsonb_build_object('ok', true);
end $fn$;

revoke all on function public.save_billing(uuid, text, text, text, boolean, boolean, text) from public, anon;
grant execute on function public.save_billing(uuid, text, text, text, boolean, boolean, text) to authenticated;

-- ---------------------------------------------------------------- cancelling a yearly plan
-- 0066's, with the paid period: a month runs to its end as before; a year runs to the end of the
-- paid year, counted from the day the subscription started (the trial's end, or the confirmation
-- if that came later). Before the first paid day there is nothing to run out.
create or replace function public.cancel_subscription(p_org uuid, p_reason text, p_confirm boolean) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  b app.billing;
  v_today date := (now() at time zone 'Europe/Oslo')::date;
  v_start date;
  v_last date;
begin
  if p_org is null or not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_confirm is not true then
    return jsonb_build_object('ok', false, 'error', 'confirm_required');
  end if;
  if p_reason is not null and p_reason not in ('price', 'not_needed', 'missing', 'switching', 'other') then
    return jsonb_build_object('ok', false, 'error', 'invalid_reason');
  end if;
  select * into b from app.billing where org_id = p_org for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if b.cancelled_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_cancelled');
  end if;

  if b.confirmed_at is not null and app.org_access(p_org) = 'active' then
    if b.billing_interval = 'year' then
      v_start := (greatest(b.trial_ends_at, b.confirmed_at) at time zone 'Europe/Oslo')::date;
      v_last := case when v_today < v_start then v_today
                     else (v_start + make_interval(years => extract(year from age(v_today, v_start))::int + 1)
                           - interval '1 day')::date end;
    else
      v_last := (date_trunc('month', v_today) + interval '1 month - 1 day')::date;
    end if;
  else
    -- a trial, or the free plan, has nothing to run out
    v_last := v_today;
  end if;

  update app.billing set
    cancelled_at = now(), cancelled_by = auth.uid(), cancel_source = 'customer', cancel_reason = p_reason,
    cancel_effective_at = ((v_last + 1)::timestamp at time zone 'Europe/Oslo'),
    deletion_due_at = ((v_last + 31)::timestamp at time zone 'Europe/Oslo'),
    updated_at = now()
  where org_id = p_org;
  perform app.lifecycle_plan();
  return jsonb_build_object('ok', true, 'last_day', v_last,
    'deletion_due_at', ((v_last + 31)::timestamp at time zone 'Europe/Oslo'));
end $fn$;

-- ---------------------------------------------------------------- the admin's money
-- MRR counts a yearly invoice as a twelfth (plan_mrr_nok). admin_org_detail is left as it is: the
-- hosted project carries a version of it this repository's migrations do not, and a definition built
-- from the local one would overwrite it (D-217 names the follow-up).
CREATE OR REPLACE FUNCTION app.kpi_capture(p_day date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_day date := coalesce(p_day, (now() at time zone 'Europe/Oslo')::date);
begin
  insert into app.kpi_daily (day, mrr, paying, trials, grace, read_only, signups, visitors, sessions)
  select v_day,
         coalesce(sum(app.plan_mrr_nok(b.plan, b.billing_interval)) filter (where b.confirmed_at is not null), 0),
         count(*) filter (where b.confirmed_at is not null and b.plan in ('small', 'usual')),
         count(*) filter (where app.org_access(o.id) = 'trial'),
         count(*) filter (where app.org_access(o.id) = 'grace'),
         count(*) filter (where app.org_access(o.id) = 'read_only'),
         count(*) filter (where (o.created_at at time zone 'Europe/Oslo')::date = v_day),
         (select count(distinct e.visitor) from app.web_events e where e.day = v_day),
         (select count(*) from (
            select e.visitor, e.at, lag(e.at) over (partition by e.visitor order by e.at, e.id) as prev
            from app.web_events e where e.day = v_day) x
          where x.prev is null or x.at - x.prev > interval '30 minutes')
  from app.billing b join app.organizations o on o.id = b.org_id
  on conflict (day) do update set
    mrr = excluded.mrr, paying = excluded.paying, trials = excluded.trials, grace = excluded.grace,
    read_only = excluded.read_only, signups = excluded.signups, visitors = excluded.visitors,
    sessions = excluded.sessions, captured_at = now();
end $function$;

CREATE OR REPLACE FUNCTION public.admin_kpis()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if app.admin_role() is null or app.admin_role() = 'editor' then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('kpis.view');
  return (
    select jsonb_build_object(
      'ok', true,
      'orgs', count(*),
      'paying', count(*) filter (where b.confirmed_at is not null and b.plan in ('small', 'usual')),
      'offers_requested', count(*) filter (where b.confirmed_at is not null and b.plan = 'group'),
      'trials_active', count(*) filter (where b.confirmed_at is null and b.trial_ends_at > now()),
      'trials_expiring_7d', count(*) filter (where b.confirmed_at is null and b.trial_ends_at between now() and now() + interval '7 days'),
      'trials_expired', count(*) filter (where b.confirmed_at is null and b.trial_ends_at <= now()),
      'mrr', coalesce(sum(app.plan_mrr_nok(b.plan, b.billing_interval)) filter (where b.confirmed_at is not null), 0),
      'arr', coalesce(sum(app.plan_mrr_nok(b.plan, b.billing_interval)) filter (where b.confirmed_at is not null), 0) * 12,
      -- of the trials that have run their course (confirmed, or ended), the share confirmed
      'conversion', round(100.0 * count(*) filter (where b.confirmed_at is not null)
                          / nullif(count(*) filter (where b.confirmed_at is not null or b.trial_ends_at <= now()), 0), 1))
    from app.billing b join app.organizations o on o.id = b.org_id
  );
end $function$;

CREATE OR REPLACE FUNCTION public.admin_org_list(p_search text DEFAULT NULL::text, p_status text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
  v_rows jsonb;
begin
  if not app.is_platform_admin(array['super_admin', 'support', 'finance']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('orgs.list', null, null, null, null,
    jsonb_strip_nulls(jsonb_build_object('search', v_q, 'status', p_status)));

  select coalesce(jsonb_agg(x order by x.created_at desc), '[]') into v_rows
  from (
    select o.id, o.name, o.org_number, o.employee_count, o.created_at,
           app.org_status(o.id) as status,
           b.plan, b.trial_ends_at, b.confirmed_at,
           case when b.confirmed_at is not null then app.plan_mrr_nok(b.plan, b.billing_interval) end as mrr,
           b.cancelled_at, b.cancel_effective_at,
           (select count(*) from app.employees e where e.org_id = o.id and e.active) as registered,
           (select count(*) from app.memberships m where m.org_id = o.id and m.active) as users,
           (select max(i.sent_at) from app.invitations i where i.org_id = o.id) as last_sent,
           last.invited as last_invited, last.answered as last_answered,
           ow.user_id as owner_id, ou.email::text as owner_email,
           (select nullif(btrim(p.full_name), '') from app.memberships m join app.profiles p on p.id = m.user_id
            where m.org_id = o.id and m.active and m.role = 'daglig_leder' order by m.created_at limit 1) as contact_name,
           app.is_demo(o.id) as demo
    from app.organizations o
    join app.billing b on b.org_id = o.id
    left join app.account_owners ow on ow.org_id = o.id
    left join auth.users ou on ou.id = ow.user_id
    left join lateral (
      select count(*) as invited, count(i.responded_at) as answered
      from app.invitations i
      where i.round_id = (select r.id from app.rounds r where r.org_id = o.id and r.status = 'lukket'
                          order by r.closes_at desc nulls last limit 1)
    ) last on true
    where (v_q is null
           or o.name ilike '%' || v_q || '%'
           or o.org_number = regexp_replace(v_q, '\s', '', 'g')
           or exists (select 1 from app.memberships m join auth.users u on u.id = m.user_id
                      where m.org_id = o.id and u.email ilike '%' || v_q || '%'))
      and (p_status is null or app.org_status(o.id) = p_status)
  ) x;

  return jsonb_build_object('ok', true, 'rows', v_rows);
end $function$;

-- ---------------------------------------------------------------- grants
revoke all on function app.annual_months() from public, anon, authenticated;
revoke all on function app.plan_mrr_nok(text, text) from public, anon, authenticated;
revoke all on function app.org_free(uuid) from public, anon, authenticated;
revoke all on function public.wheel_month_change(uuid, int, int, text) from public, anon;
grant execute on function public.wheel_month_change(uuid, int, int, text) to authenticated;
revoke all on function public.set_org_module(uuid, text, boolean) from public, anon;
grant execute on function public.set_org_module(uuid, text, boolean) to authenticated;
