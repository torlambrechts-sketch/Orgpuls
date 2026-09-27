-- 0080_dispatch_language.sql — engagement P1.3: invitations and the system's reminders in the
-- employee's language (D-127).
--
--   * app.dispatch_recipients gives an employee's own language (0079's employees.language),
--     where it gave none before. Members keep their profile's.
--   * public.dispatch_claim adds, for a personal message, the survey's language state
--     (app.round_locale_state: items missing a translation, UI hashes approved). The dispatcher
--     decides with the flag and the hash of the page strings it was deployed with: the
--     employee's language where it is offered, else bokmål, and the link then opens the survey
--     in it (?lang=). With no language flag on the dispatcher, nothing changes: the
--     organisation's language, as before.
--
-- The language goes into the message and the link, never into the outbox or with an answer (I6).

create or replace function app.dispatch_recipients(p_outbox uuid)
  returns table (email text, phone text, name text, lang text, member boolean)
  language sql stable security definer set search_path = ''
as $$
  with x as (
    select * from app.outbox where id = p_outbox
  ),
  members as (
    select lower(u.email::text) as email, p.full_name as name, p.lang, m.role::text as role
    from x
    join app.memberships m on m.org_id = x.org_id and m.active
    join app.profiles p on p.id = m.user_id
    join auth.users u on u.id = m.user_id
  ),
  scope as (
    select e.* from x
    join app.rounds r on r.id = x.round_id
    join app.employees e on e.org_id = r.org_id and e.active
    where not exists (select 1 from app.round_groups rg where rg.round_id = r.id)
       or e.group_id in (select rg.group_id from app.round_groups rg where rg.round_id = r.id)
  ),
  picked as (
    select nullif(lower(btrim(e.email)), '') as email, e.phone, e.full_name as name, e.language as lang, false as member
    from x join app.employees e on e.id = x.employee_id
    union all
    select mb.email, null, mb.name, mb.lang, true from members mb, x
    where (x.audience = 'daglig_leder' and mb.role = 'daglig_leder')
       or (x.audience = 'avdelingsledere' and mb.role = 'avdelingsleder')
       or (x.audience = 'verneombud' and mb.role = 'verneombud')
    union all
    select nullif(lower(btrim(s.email)), ''), null, s.full_name, null, false from scope s, x
    where x.audience = 'alle_ansatte'
  )
  select distinct on (coalesce(email, phone)) email, phone, name, lang, member
  from picked
  where email is not null or phone is not null
  order by coalesce(email, phone), member desc
$$;

revoke all on function app.dispatch_recipients(uuid) from public, anon, authenticated;

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
    select ro.status, ro.opens_at, ro.closes_at, ro.sms_when as round_sms_when, ms.kind, ms.year,
           org.name as org_name, org.default_lang, app.k_threshold(ro.org_id) as k,
           org.sms_enabled, org.sms_when, org.sms_text
    into r
    from app.rounds ro
    join app.measurements ms on ms.id = ro.measurement_id
    join app.organizations org on org.id = ro.org_id
    where ro.id = x.round_id;

    v_personal := x.kind in ('invitasjon', 'paminnelse', 'siste_paminnelse', 'lenke');

    v_why := case
      when v_personal and r.status <> 'apen' then 'round_not_open'
      when v_personal and exists (
        select 1 from app.invitations i
        where i.id = x.invitation_id and (i.responded_at is not null or i.expires_at <= now())
      ) then 'answered_or_expired'
      when x.kind = 'forvarsel' and r.status <> 'planlagt' then 'round_already_open'
      when x.kind = 'resultat' and (r.status <> 'lukket' or x.due_at < now() - interval '14 days') then 'stale'
    end;

    v_channel := 'email';
    if v_why is null and v_personal then
      -- one person: choose the channel that carries their link
      select case when d.email is null or app.reserved_address(d.email) then null else d.email end, d.phone
      into v_email, v_phone
      from app.dispatch_recipients(x.id) d
      limit 1;
      v_sms := r.sms_enabled and v_phone is not null;
      v_rule := coalesce(r.round_sms_when, r.sms_when);
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
    if r.kind = 'puls' and r.opens_at is not null then
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
      'sms_text', r.sms_text,
      'lang', coalesce(r.default_lang, 'no'),
      'org', r.org_name,
      'k', r.k,
      'round', jsonb_build_object(
        'kind', r.kind, 'year', r.year, 'pulse', nullif(v_pulse, 0),
        'opens_at', r.opens_at, 'closes_at', r.closes_at),
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
