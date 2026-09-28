-- 0106_audit_p0.sql — the four P0s of the 2026-09-28 deep audit (docs/audits/2026-09-28-deep.md).
--
-- AUD-01  Any member could read app.outbox, and a reminder row exists only for someone who has
--         not answered: «Ingen i virksomheten kan se den lista» was false. The outbox is now read
--         by definer functions only; the one screen that counted it gets the counts, never a row.
-- AUD-02  public.conversations returned each commenter's answer with the comment. With the
--         released whole-organisation figure, a non-commenter's answer, or a withheld group's
--         mean, followed by subtraction. The answer no longer leaves the database with a comment
--         (X-087, D-157).
-- AUD-03  public.screening_counts answered while a round was open, so polling between
--         submissions told a watcher how the newest respondent answered on harassment and
--         violence. It now answers for a closed round only, like results_summary.
-- AUD-04  A pre-notice with a lead of 0 (the Veiviser's unticked «varsle verneombudet først»,
--         and the avdelingsledere rung it always writes) is queued in the same tick that opens the
--         round, and dispatch_claim dropped it as round_already_open: the verneombud was never
--         told. It is now stale only when it fell due before the opening, and a pre-notice is
--         sent ahead of the invitations due at the same moment. The Veiviser also wrote
--         «alle ansatte» a day ahead of an unticked verneombud: no rung of the ladder may now be
--         told later than everyone (§ 6-2 fjerde ledd, `hjelp` «Varslingsrekkefølgen er ikke
--         valgfri»), and at the same moment everyone's notice goes last.
-- AUD-28  A daglig leder or verneombud could delete a measurement through PostgREST, and the
--         cascade took its rounds, responses and answers with it; or rewrite a closed one's kind
--         and year. No client deletes a measurement now, and only kind and the evaluation cadence
--         may be updated — kind only while none of its rounds has opened.

-- ---------------------------------------------------------------- AUD-01: the outbox, counted

drop policy if exists outbox_read on app.outbox;
revoke select on app.outbox from authenticated;
revoke all on app.outbox from anon, public;

/*
 * Årshjulet's and Integrasjoner's queue line: how much is waiting, sent, and given up on. Counts
 * for the organisation, to its members; no row, no recipient, no kind.
 */
create function public.queue_counts(p_org uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not app.is_org_member(p_org) then
    raise exception 'not a member' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'pending', count(*) filter (where o.sent_at is null and o.failed_at is null),
      'sent', count(*) filter (where o.sent_at is not null),
      'failed', count(*) filter (where o.sent_at is null and o.failed_at is not null))
    from app.outbox o where o.org_id = p_org);
end $fn$;
revoke all on function public.queue_counts(uuid) from public, anon;
grant execute on function public.queue_counts(uuid) to authenticated;

-- ---------------------------------------------------------------- AUD-28: a measurement keeps its answers

drop policy if exists measurement_write_delete on app.measurements;
revoke delete on app.measurements from authenticated;
revoke update on app.measurements from authenticated;
-- Måleoppsett writes these two, and nothing else (app/(app)/maleoppsett/actions.ts)
grant update (kind, evaluation_cadence) on app.measurements to authenticated;

/*
 * What a measurement is — its kind, its year — is fixed once one of its rounds has opened: the
 * report and the results read it. The evaluation cadence stays the organisation's to change.
 * Written as "nobody may change this content", so cascades from the organisation still run.
 */
create function app.measurements_fixed() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if (new.kind is distinct from old.kind or new.year is distinct from old.year or new.org_id is distinct from old.org_id)
     and exists (select 1 from app.rounds r where r.measurement_id = old.id and r.status <> 'planlagt') then
    raise exception 'measurement % has opened: its kind and year are fixed', old.id using errcode = '23514';
  end if;
  return new;
end $fn$;
revoke all on function app.measurements_fixed() from public, anon, authenticated;

create trigger measurements_fixed
  before update on app.measurements
  for each row execute function app.measurements_fixed();

-- ---------------------------------------------------------------- AUD-02: a comment without its answer

CREATE OR REPLACE FUNCTION public.conversations(p_round uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
  v_k   int;
  v_whole boolean;
  v_out jsonb;
  v_pat text[];
begin
  select m.org_id into v_org
  from app.memberships m
  where m.user_id = auth.uid() and m.active
    and m.role in ('daglig_leder', 'avdelingsleder')
  limit 1;

  if v_org is null then
    return jsonb_build_object('error', 'not_available');
  end if;

  v_k := app.k_threshold(v_org);
  v_pat := app.mask_patterns(v_org);

  select exists (
    select 1 from app.memberships m
    where m.user_id = auth.uid() and m.active and m.org_id = v_org
      and m.role = 'daglig_leder'
  ) into v_whole;

  -- 0106 (AUD-02): no answer_value. A commenter's own answer, next to the released figure for
  -- everyone, gives the others' answers by subtraction; the comment is what the leader answers.
  select coalesce(jsonb_agg(t order by t.opened_hour desc), '[]'::jsonb) into v_out
  from (
    select
      ct.id,
      ct.factor_key,
      ct.state,
      ct.flagged_varsel,
      ct.opened_hour,
      r.round_id,
      ms.kind  as round_kind,
      ms.year  as round_year,
      app.mask_apply(rc.body, v_pat) as opening,
      (select coalesce(jsonb_agg(jsonb_build_object(
                 'author', tm.author,
                 -- 0095: what the employee wrote is masked; the leader's own replies are not
                 'body', case when tm.author = 'ansatt' then app.mask_apply(tm.body, v_pat) else tm.body end, 'sent_hour', tm.sent_hour)
               order by tm.sent_hour), '[]'::jsonb)
         from app.thread_messages tm where tm.thread_id = ct.id) as messages,
      (select jsonb_build_object('name', p.full_name, 'mine', cr.requested_by = auth.uid())
         from app.contact_requests cr join app.profiles p on p.id = cr.requested_by
        where cr.thread_id = ct.id) as contact
    from app.comment_threads ct
    join app.responses r on r.id = ct.response_id
    join app.rounds rd on rd.id = r.round_id
    join app.measurements ms on ms.id = rd.measurement_id
    join app.response_comments rc
      on rc.response_id = ct.response_id
     and rc.factor_key = ct.factor_key
     and rc.ordinal = ct.ordinal
    where ct.org_id = v_org
      and (p_round is null or r.round_id = p_round)
      and (v_whole or r.group_id in (select vg.group_id from app.visible_groups(v_org) vg))
      and (
        select count(*) from app.responses r2
        where r2.round_id = r.round_id and r2.group_id is not distinct from r.group_id
      ) >= v_k
  ) t;

  return jsonb_build_object('threshold', v_k, 'threads', v_out);
end $function$;

-- ---------------------------------------------------------------- AUD-03: screening counts, after close

CREATE OR REPLACE FUNCTION public.screening_counts(p_round uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid; v_status app.round_status; v_k int; v_n int; v_out jsonb;
begin
  select r.org_id, r.status into v_org, v_status from app.rounds r where r.id = p_round;
  -- 0106 (AUD-03): a closed round only; counts that move with each submission are an answer
  if v_org is null or not app.is_org_member(v_org) or v_status <> 'lukket' then
    return jsonb_build_object('error', 'not_available');
  end if;

  v_k := app.k_threshold(v_org);
  select count(*) into v_n from app.responses where round_id = p_round;
  if v_n < v_k then
    return jsonb_build_object('status', 'insufficient_data', 'n', v_n, 'threshold', v_k);
  end if;

  select coalesce(jsonb_agg(q order by q.sort_order), '[]'::jsonb) into v_out
  from (
    select
      eq.key,
      eq.sort_order,
      (select count(*) from app.extra_answers ea
        join app.responses r2 on r2.id = ea.response_id
        where r2.round_id = p_round and ea.extra_key = eq.key) as answered,
      (select coalesce(jsonb_agg(jsonb_build_object('ordinal', o.ordinal, 'n', o.n)
                                 order by o.ordinal), '[]'::jsonb)
         from (
           select eo.ordinal,
                  (select count(*) from app.extra_answers ea2
                    join app.responses r3 on r3.id = ea2.response_id
                    where r3.round_id = p_round
                      and ea2.extra_key = eq.key
                      and ea2.option_ordinal = eo.ordinal) as n
           from app.extra_options eo where eo.extra_key = eq.key
         ) o) as options
    from app.extra_questions eq
    where eq.kind = 'choice'
      and eq.key in ('krenkende', 'vold')
      and exists (select 1 from app.round_extra_questions rq
                  where rq.round_id = p_round and rq.extra_key = eq.key)
  ) q;

  return jsonb_build_object('status', 'ok', 'n', v_n, 'threshold', v_k,
                            'questions', coalesce(v_out, '[]'::jsonb));
end $function$;

-- ---------------------------------------------------------------- AUD-04: the ladder's order, kept

/*
 * Nobody on the ladder is told later than everyone: a rung other than «alle ansatte» is never
 * shorter than it. Raised, not refused, so the Veiviser's «samtidig» means at the same time as
 * the employees. Invoker: the one who may write a ladder row may read its sibling.
 */
create function app.wheel_notifications_order() returns trigger
  language plpgsql set search_path = ''
as $fn$
declare
  v_all int;
begin
  if new.audience <> 'alle_ansatte' then
    -- before: a rung is never shorter than everyone's
    select n.lead_days into v_all from app.wheel_notifications n
    where n.wheel_id = new.wheel_id and n.audience = 'alle_ansatte';
    if v_all is not null and new.lead_days < v_all then new.lead_days := v_all; end if;
    return new;
  end if;
  -- after, for everyone's rung: the others that would now be later are raised to it
  if tg_when = 'AFTER' then
    update app.wheel_notifications n set lead_days = new.lead_days
     where n.wheel_id = new.wheel_id and n.audience <> 'alle_ansatte' and n.lead_days < new.lead_days;
    return null;
  end if;
  return new;
end $fn$;
revoke all on function app.wheel_notifications_order() from public, anon, authenticated;

create trigger wheel_notifications_order
  before insert or update of lead_days on app.wheel_notifications
  for each row execute function app.wheel_notifications_order();

create trigger wheel_notifications_order_all
  after insert or update of lead_days on app.wheel_notifications
  for each row when (new.audience = 'alle_ansatte')
  execute function app.wheel_notifications_order();

-- the ladders already written that way (none on hosted when this was written)
update app.wheel_notifications n
   set lead_days = a.lead_days
  from app.wheel_notifications a
 where a.wheel_id = n.wheel_id and a.audience = 'alle_ansatte'
   and n.audience <> 'alle_ansatte' and n.lead_days < a.lead_days;

-- ---------------------------------------------------------------- AUD-04: a lead of 0 is still sent first
-- The current definition (0105) with the stale rule and the order changed, and (AUD-06, a P1 of
-- the same audit) the invitation's publish date added.

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
    -- 0106 (AUD-04): a pre-notice goes before the invitations due at the same moment
    order by o.due_at, (o.kind <> 'forvarsel'), (o.audience = 'alle_ansatte'), o.id
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
    select ro.status, ro.opens_at, ro.closes_at, ro.sms_when as round_sms_when, ms.kind, ms.year, ro.results_publish_on,
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
      -- 0106 (AUD-04): stale only when it was due before the round opened; a lead of 0 is due at
      -- the opening itself and is queued in the same tick that opens it, and must still go out
      when x.kind = 'forvarsel' and r.status <> 'planlagt' and x.due_at < r.opens_at then 'round_already_open'
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
      -- 0106 (AUD-06): the day everyone is told, so the invitation names it instead of the deadline
      'publish_on', case when x.kind = 'invitasjon' then r.results_publish_on end,
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
