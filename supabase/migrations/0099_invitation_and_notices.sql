-- 0099_invitation_and_notices.sql — a better invitation, overdue measures and a lagging
-- department told about (gap analysis P1-1, P1-5, P1-6 and the rest of P0-4; D-149).
--
-- P1-1. The invitation says how long it takes as a number («omtrent 4 minutter», from what the
-- round asks: app.round_minutes), promises that everyone hears the results when the ladder tells
-- them (0097's «alle ansatte» row), and carries the daglig leder's own greeting when one is
-- written (organizations.invite_greeting, set by set_invite_greeting). A leader's words, not a
-- respondent's: they may go in a mail.
--
-- P1-5 and P0-4. «Varsle verneombud når en frist ryker» (year_wheels.notify_vo_on_overdue, 0019)
-- was stored and never read. Now, every Monday morning, each owner of a measure that is past its
-- date — or has no date and has stood still for 30 days — gets one mail listing them, and the
-- verneombud a copy where the wheel says so. A measure's notice belongs to no round, so
-- outbox.round_id may be null (for these kinds only).
--
-- P1-6. During an open round, once half its time has passed, the daglig leder is told if a
-- department answers 10 percentage points or more below the rest — with what can be done: a
-- reminder, or more time. Only a department the participation view shows (at least k invited,
-- app.participation_visibility); the mail names none, and holds no figure: it points to Målinger.

-- ---------------------------------------------------------------- the invitation
alter table app.organizations
  add column invite_greeting    text check (invite_greeting is null or char_length(btrim(invite_greeting)) between 1 and 600),
  add column invite_greeting_by uuid references app.profiles (id) on delete set null;
create index organizations_invite_greeting_by_idx on app.organizations (invite_greeting_by);

comment on column app.organizations.invite_greeting is
  'The daglig leder''s greeting in the invitation (0099, P1-1). A leader''s words, shown to employees.';

create function public.set_invite_greeting(p_org uuid, p_text text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
begin
  if p_org is null or not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('error', 'not_allowed');
  end if;
  if v_text is not null and char_length(v_text) > 600 then
    return jsonb_build_object('error', 'too_long');
  end if;
  update app.organizations
  set invite_greeting = v_text, invite_greeting_by = case when v_text is null then null else auth.uid() end
  where id = p_org;
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.set_invite_greeting(uuid, text) from public, anon;
grant execute on function public.set_invite_greeting(uuid, text) to authenticated;

-- about seven seconds an item: the core survey's 37 is «fire minutter», as the design says it
create function app.round_minutes(p_round uuid) returns int
  language sql stable security definer set search_path = ''
as $fn$
  select greatest(2, round((
      (select count(*) from app.round_factors rf join app.statements s on s.factor_key = rf.factor_key where rf.round_id = p_round)
    + (select count(*) from app.round_extra_questions x where x.round_id = p_round)
    + (select count(*) from app.round_org_questions q where q.round_id = p_round)
    + coalesce((select sum(cardinality(rm.item_ids)) from app.round_modules rm where rm.round_id = p_round), 0)
  ) * 7 / 60.0))::int
$fn$;
revoke all on function app.round_minutes(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- measures past their date
alter table app.outbox alter column round_id drop not null;
alter table app.outbox add constraint outbox_round_or_measure
  check (round_id is not null or kind = 'tiltak_forfalt');

create function app.overdue_measures(p_org uuid)
  returns table (id uuid, title text, due_date date, owner_employee_id uuid)
  language sql stable security definer set search_path = ''
as $fn$
  select me.id, me.title, me.due_date, me.owner_employee_id
  from app.measures me
  join app.organizations o on o.id = me.org_id
  where me.org_id = p_org and me.step in ('besluttet', 'pagar')
    and (me.due_date < (now() at time zone coalesce(o.timezone, 'Europe/Oslo'))::date
         or (me.due_date is null and me.updated_at < now() - interval '30 days'))
$fn$;
revoke all on function app.overdue_measures(uuid) from public, anon, authenticated;

-- once a week, per owner, and a copy to the verneombud; never twice within six days
create function app.queue_measure_notices() returns int
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_n int := 0;
  v_k int;
begin
  insert into app.outbox (org_id, round_id, kind, employee_id, due_at)
  select distinct me.org_id, null::uuid, 'tiltak_forfalt'::app.outbox_kind, me.owner_employee_id, now()
  from app.organizations o
  cross join lateral app.overdue_measures(o.id) om
  join app.measures me on me.id = om.id
  where om.owner_employee_id is not null
    and not exists (select 1 from app.outbox x where x.org_id = o.id and x.kind = 'tiltak_forfalt'
                      and x.employee_id = om.owner_employee_id and x.created_at > now() - interval '6 days');
  get diagnostics v_k = row_count;
  v_n := v_n + v_k;

  insert into app.outbox (org_id, round_id, kind, audience, due_at)
  select o.id, null::uuid, 'tiltak_forfalt'::app.outbox_kind, 'verneombud'::app.notify_audience, now()
  from app.organizations o
  left join app.year_wheels w on w.org_id = o.id
  where coalesce(w.notify_vo_on_overdue, true)
    and exists (select 1 from app.overdue_measures(o.id))
    and not exists (select 1 from app.outbox x where x.org_id = o.id and x.kind = 'tiltak_forfalt'
                      and x.audience = 'verneombud' and x.created_at > now() - interval '6 days');
  get diagnostics v_k = row_count;
  return v_n + v_k;
end $fn$;
revoke all on function app.queue_measure_notices() from public, anon, authenticated;

select cron.schedule('orgpuls-measure-notices', '10 5 * * 1', $job$select app.queue_measure_notices()$job$);

-- ---------------------------------------------------------------- a department lagging behind
/*
 * The departments of an open round that the participation view shows, whose share answered is 10
 * points or more below the whole round's. Used to decide whether to tell the daglig leder, and
 * never returned to a client.
 */
create function app.lagging_groups(p_round uuid) returns table (group_id uuid)
  language sql stable security definer set search_path = ''
as $fn$
  with totals as (
    select (select count(*) from app.invitations i where i.round_id = p_round) as invited,
           (select count(*) from app.responses x where x.round_id = p_round) as answered
  ), per_group as (
    select pv.group_id, pv.headcount,
           (select count(*) from app.responses x where x.round_id = p_round and x.group_id = pv.group_id) as answered
    from app.participation_visibility(p_round) pv
    where pv.shown and pv.group_id is not null and pv.headcount > 0
  )
  select g.group_id from per_group g, totals t
  where t.invited > 0
    and 100.0 * g.answered / g.headcount <= 100.0 * t.answered / t.invited - 10
$fn$;
revoke all on function app.lagging_groups(uuid) from public, anon, authenticated;

create function app.queue_participation_alerts() returns int
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_n int;
begin
  insert into app.outbox (org_id, round_id, kind, audience, due_at)
  select r.org_id, r.id, 'svarprosent', 'daglig_leder', now()
  from app.rounds r
  where r.status = 'apen' and r.opens_at is not null and r.closes_at is not null
    and now() >= r.opens_at + (r.closes_at - r.opens_at) / 2
    and r.closes_at > now() + interval '1 day'
    and exists (select 1 from app.lagging_groups(r.id))
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $fn$;
revoke all on function app.queue_participation_alerts() from public, anon, authenticated;

select cron.schedule('orgpuls-participation-alerts', '35 * * * *', $job$select app.queue_participation_alerts()$job$);

-- ---------------------------------------------------------------- the claim
-- 0080's, with the organisation read on its own (a measure's notice has no round), the measures
-- a tiltak_forfalt lists, when a notice has become stale, and the invitation's own words.
create or replace function public.dispatch_claim(p_batch int default 20)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$

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
    select ro.status, ro.opens_at, ro.closes_at, ro.sms_when as round_sms_when, ms.kind, ms.year
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
      'greeting', case when x.kind = 'invitasjon' and v_org.invite_greeting is not null then
        jsonb_build_object('text', v_org.invite_greeting, 'by', v_org.greeting_by) end,
      'measures', v_items,
      'recipients', v_rcpt,
      -- the languages the survey is ready in, for the personal kinds (0079): the dispatcher
      -- adds the flag and the page strings' hash, as the respondent page does
      'locales', case when v_personal then app.round_locale_state(x.round_id) end,
      'token', v_key);
  end loop;

  return v_out;
end $fn$;

revoke all on function public.dispatch_claim(int) from public, anon, authenticated;
grant execute on function public.dispatch_claim(int) to service_role;
