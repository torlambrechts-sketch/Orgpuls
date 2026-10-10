-- 0219 — A notice names the organisation's market (SE-C, D-257).
--
-- Four of the mail texts state law: the safety representative's notice before a survey, the
-- results notice's line on the report, and the evaluation reminder's two leads. They state Norway's
-- (arbeidsmiljøloven § 6-2, § 9-2, Arbeidstilsynet). An organisation in Sweden reads its own
-- market's law in the product (lib/i18n/market-overlay.ts), and its mail must say the same: the
-- dispatcher lays the market's pack over the mail texts (supabase/functions/_shared/mail.ts), so it
-- needs to know the market.
--
-- dispatch_claim, as 0185 left it, and lifecycle_mail_claim, as 0064 left it (the results notice is
-- one of its steps), each with one field more in each job: `market`, the organisation's (0214),
-- Norway's where none is set. Nothing else changes: not the channel rule, not the recipients, not
-- the lease, not the grants.

create or replace function public.dispatch_claim(p_batch integer DEFAULT 20)
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
  -- 0185: Slack
  v_slack   boolean;
  v_srule   text;
  v_suser   text;
  v_org     record;
  v_items   jsonb;
  -- 0176: Teams
  v_object  text;
  v_teams   boolean;
  v_trule   text;
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
    select org.name as org_name, org.default_lang, org.market, case when x.round_id is null then app.k_threshold(org.id) else app.k_round(x.round_id) end as k,
           org.sms_enabled, org.sms_when, org.sms_text, org.invite_greeting, org.slack_enabled, org.slack_when,
           exists (select 1 from app.slack_installs si where si.org_id = org.id and si.status = 'active') as slack_ready,
           org.teams_enabled, org.teams_when, (select et.tenant_id from app.entra_tenants et where et.org_id = org.id) as tenant_id,
           (select p.full_name from app.profiles p where p.id = org.invite_greeting_by) as greeting_by
    into v_org
    from app.organizations org where org.id = x.org_id;

    r := null;
    select ro.status, ro.opens_at, ro.closes_at, ro.sms_when as round_sms_when, ro.slack_when as round_slack_when, ro.teams_when as round_teams_when, ms.kind, ms.year, ro.results_publish_on,
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
      -- 0212: «dette gjør vi» only while the page it points to is shown
      when x.kind = 'tiltak_status' and (r.status <> 'lukket' or x.due_at < now() - interval '14 days'
        or not exists (select 1 from app.rounds ro where ro.id = x.round_id and ro.results_page and app.results_published(ro.id))) then 'stale'
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
      select case when d.email is null or app.reserved_address(d.email) then null else d.email end, d.phone, d.entra_object_id
      into v_email, v_phone, v_object
      from app.dispatch_recipients(x.id) d
      limit 1;
      v_sms := v_org.sms_enabled and v_phone is not null;
      v_rule := coalesce(r.round_sms_when, v_org.sms_when);
      -- 0185: Slack when the organisation has it on and a working installation, and the person a
      -- match in the workspace; the rule is the organisation's, or the round's own
      v_suser := (select sm.slack_user_id from app.slack_members sm
                  join app.employees e on e.id = sm.employee_id and e.active
                  where sm.employee_id = x.employee_id and sm.org_id = x.org_id);
      v_slack := v_org.slack_enabled and v_org.slack_ready and v_suser is not null;
      v_srule := coalesce(r.round_slack_when, v_org.slack_when);
      -- 0176: Teams when the organisation has it on and a tenant bound, the person an object id
      -- and nothing Teams said against them; the rule as SMS's
      v_teams := v_org.teams_enabled and v_org.tenant_id is not null and v_object is not null
                 and not exists (select 1 from app.address_problems ap
                                 where ap.employee_id = x.employee_id and ap.channel = 'teams');
      v_trule := coalesce(r.round_teams_when, v_org.teams_when);
      if x.kind = 'lenke' then
        -- the channel they typed their address or number into
        v_channel := case
          when x.channel = 'sms' and v_sms then 'sms'
          when x.channel = 'email' and v_email is not null then 'email'
        end;
      else
        v_channel := case
          when v_teams and (v_trule = 'alle'
                            or (v_trule = 'paaminn' and x.kind in ('paminnelse', 'siste_paminnelse'))
                            or (v_trule = 'mangler' and v_email is null)) then 'teams'
          when v_slack and (v_srule = 'alle'
                            or (v_srule = 'paaminn' and x.kind in ('paminnelse', 'siste_paminnelse'))) then 'slack'
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
                 -- 0185: whom the bot writes to, only when Slack carries the link
                 'slack', case when v_channel = 'slack' then jsonb_build_object('user_id', v_suser, 'org', x.org_id) end,
                 -- 0176: whom the bot addresses, only when Teams carries the link
                 'teams', case when v_channel = 'teams' then jsonb_build_object(
                   'object_id', d.entra_object_id, 'tenant_id', d.tenant_id,
                   'conversation_id', d.conversation_id, 'service_url', d.service_url) end,
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
      -- 0219 (D-257): whose law the notice states, the organisation's market's
      'market', coalesce(v_org.market, 'no'),
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
        when x.kind in ('resultat', 'tiltak_status') then (
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

revoke all on function public.dispatch_claim(int) from public, anon, authenticated;
grant execute on function public.dispatch_claim(int) to service_role;

-- ---------------------------------------------------------------- the lifecycle mail
create or replace function public.lifecycle_mail_claim(p_batch integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v jsonb;
begin
  update app.lifecycle_mail lm set status = 'skipped', leased_until = null
  where lm.status = 'pending'
    and (not app.lifecycle_due(lm.org_id, lm.step)
         or not exists (select 1 from app.organizations o where o.id = lm.org_id and o.mail_enabled)
         or not exists (select 1 from app.memberships m where m.org_id = lm.org_id and m.user_id = lm.user_id
                        and m.active and m.role = 'daglig_leder'));

  with c as (
    select lm.id from app.lifecycle_mail lm
    where (lm.status = 'pending' or (lm.status = 'sending' and lm.leased_until < now())) and lm.attempts < 5
    order by lm.created_at limit least(greatest(coalesce(p_batch, 20), 1), 50)
    for update skip locked
  ), u as (
    update app.lifecycle_mail lm set status = 'sending', leased_until = now() + interval '2 minutes', attempts = lm.attempts + 1
    from c where lm.id = c.id returning lm.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', u.id, 'step', u.step,
    'to_email', lower(au.email::text), 'name', split_part(coalesce(p.full_name, ''), ' ', 1), 'lang', coalesce(p.lang, 'no'),
    'org', o.name, 'k', o.threshold, 'market', o.market,
    'trial_ends_at', b.trial_ends_at, 'read_only_from', b.trial_ends_at + make_interval(days => app.grace_days()),
    'cancel_effective_at', b.cancel_effective_at, 'deletion_due_at', b.deletion_due_at)), '[]') into v
  from u
  join app.organizations o on o.id = u.org_id
  join app.billing b on b.org_id = u.org_id
  join auth.users au on au.id = u.user_id
  left join app.profiles p on p.id = u.user_id;
  return v;
end $function$;

revoke all on function public.lifecycle_mail_claim(int) from public, anon, authenticated;
grant execute on function public.lifecycle_mail_claim(int) to service_role;
