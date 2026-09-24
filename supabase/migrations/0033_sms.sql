-- 0033_sms.sql — SMS as a second channel on the dispatcher. D-66.
--
-- The design's SMS screen (Integrasjoner › SMS) has three steps: mobile numbers, a sender
-- and a message, and when SMS is used — "Bare de uten e-post", "Bare som påminnelse" or
-- "Alle" — with "Aktiver SMS" / "Koble fra". This migration stores those choices and makes
-- the claim decide, per person, which channel carries their link.
--
-- The rule, for an invitation or a reminder (the two mails that carry a respondent link):
--
--   SMS    when SMS is on, the person has a number, and the mode says so —
--          "alle" always, "paaminn" for a reminder, "mangler" when there is no address;
--   e-mail otherwise, when there is an address;
--   SMS    when there is no address but a number and SMS is on — nobody is left without;
--   failed as no_address when there is neither.
--
-- Notices to a role stay e-mail: they go to members, who sign in with an address.
--
-- The number is the register's own `employees.phone`, in E.164 from now on; the app
-- normalises what people type (supabase/functions/_shared/sms.ts) and this check refuses
-- anything else, so a malformed number cannot reach the operator. The sender name is not
-- stored: every sender has to be registered with the operators, so it is one name for the
-- product, set on the function (D-66).

alter table app.employees
  add constraint employees_phone_e164 check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$');

comment on column app.employees.phone is
  'Mobile number in E.164 (+4791234567). Used only to send the survey link by SMS, when the organisation has SMS on.';

alter table app.organizations
  add column sms_enabled boolean not null default false,
  add column sms_when text not null default 'mangler' check (sms_when in ('mangler', 'paaminn', 'alle')),
  add column sms_text text check (sms_text is null or length(sms_text) <= 300);

comment on column app.organizations.sms_enabled is
  'Whether survey links may go by SMS. Off by default: every message is billed.';
comment on column app.organizations.sms_when is
  'mangler: only people without an e-mail address; paaminn: reminders; alle: everyone with a number.';
comment on column app.organizations.sms_text is
  'The organisation''s own SMS text; the personal link is appended. Null means the default text.';

alter table app.outbox
  add column channel text check (channel in ('email', 'sms'));

comment on column app.outbox.channel is
  'The channel that carried the message, set when it is sent.';

-- ---------------------------------------------------------------------------
-- Recipients now carry the number. The return type changes, so the function is replaced.
-- ---------------------------------------------------------------------------
drop function app.dispatch_recipients(uuid);

create function app.dispatch_recipients(p_outbox uuid)
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
    select nullif(lower(btrim(e.email)), '') as email, e.phone, e.full_name as name, null::text as lang, false as member
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

-- ---------------------------------------------------------------------------
-- The claim, now with a channel per row. Same signature as 0032's, so it is replaced.
-- ---------------------------------------------------------------------------
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
begin
  for x in
    select o.*
    from app.outbox o
    join app.organizations org on org.id = o.org_id
    where o.sent_at is null
      and o.failed_at is null
      and o.due_at <= now()
      and (o.claimed_at is null or o.claimed_at < now() - interval '10 minutes')
      and org.mail_enabled
    order by o.due_at, o.id
    limit least(greatest(coalesce(p_batch, 20), 1), 100)
    for update of o skip locked
  loop
    select ro.status, ro.opens_at, ro.closes_at, ms.kind, ms.year,
           org.name as org_name, org.default_lang, app.k_threshold(ro.org_id) as k,
           org.sms_enabled, org.sms_when, org.sms_text
    into r
    from app.rounds ro
    join app.measurements ms on ms.id = ro.measurement_id
    join app.organizations org on org.id = ro.org_id
    where ro.id = x.round_id;

    v_why := case
      when x.kind in ('invitasjon', 'paminnelse') and r.status <> 'apen' then 'round_not_open'
      when x.kind in ('invitasjon', 'paminnelse') and exists (
        select 1 from app.invitations i
        where i.id = x.invitation_id and (i.responded_at is not null or i.expires_at <= now())
      ) then 'answered_or_expired'
      when x.kind = 'forvarsel' and r.status <> 'planlagt' then 'round_already_open'
      when x.kind = 'resultat' and (r.status <> 'lukket' or x.due_at < now() - interval '14 days') then 'stale'
    end;

    v_channel := 'email';
    if v_why is null and x.kind in ('invitasjon', 'paminnelse') then
      -- one person: choose the channel that carries their link
      select case when d.email is null or app.reserved_address(d.email) then null else d.email end, d.phone
      into v_email, v_phone
      from app.dispatch_recipients(x.id) d
      limit 1;
      v_sms := r.sms_enabled and v_phone is not null;
      v_channel := case
        when v_sms and (r.sms_when = 'alle'
                        or (r.sms_when = 'paaminn' and x.kind = 'paminnelse')
                        or (r.sms_when = 'mangler' and v_email is null)) then 'sms'
        when v_email is not null then 'email'
        when v_sms then 'sms'
      end;
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
      v_key := encode(extensions.gen_random_bytes(32), 'hex');
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
      'token', v_key);
  end loop;

  return v_out;
end $fn$;

-- ---------------------------------------------------------------------------
-- Done records the channel that carried the message. A new parameter changes the
-- signature, so 0032's version is dropped and replaced.
-- ---------------------------------------------------------------------------
drop function public.dispatch_done(uuid, boolean, text, boolean, text);

create function public.dispatch_done(
  p_id uuid, p_ok boolean, p_error text default null,
  p_permanent boolean default false, p_provider_id text default null,
  p_channel text default null)
  returns void
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if p_ok then
    update app.outbox
    set sent_at = now(), claimed_at = null, last_error = null,
        provider_id = left(p_provider_id, 200),
        channel = case when p_channel in ('email', 'sms') then p_channel else 'email' end
    where id = p_id and sent_at is null;

    update app.invitations i
    set sent_at = coalesce(i.sent_at, now())
    from app.outbox o
    where o.id = p_id and i.id = o.invitation_id;
  else
    update app.outbox
    set claimed_at = null,
        last_error = left(coalesce(p_error, 'failed'), 200),
        failed_at = case when p_permanent or attempts >= 5 then now() end
    where id = p_id and sent_at is null;
  end if;
end $fn$;

revoke all on function public.dispatch_claim(int) from public, anon, authenticated;
revoke all on function public.dispatch_done(uuid, boolean, text, boolean, text, text) from public, anon, authenticated;
grant execute on function public.dispatch_claim(int) to service_role;
grant execute on function public.dispatch_done(uuid, boolean, text, boolean, text, text) to service_role;
