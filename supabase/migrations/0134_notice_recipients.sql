-- 0134_notice_recipients.sql — a notice to several people is one provider message per person, and
-- the admin sees what happened to each; a ticket reply's delivery state on the ticket page (D-97).
--
-- Until now a notice to a role (forvarsel, resultat, svarprosent … to the daglig leder, the
-- avdelingsledere, the verneombud, the tillitsvalgte or everyone) went to Brevo as one request
-- with a version per person, and the outbox kept the first version's message id. A delivery
-- event for the second leader matched nothing, and one for the first set the state of the whole
-- notice. Now the dispatcher sends each person their own message and records it here:
--
--   * app.outbox_recipients: one row per person a notice to a role reached — the notice, a key
--     (SHA-256 of the lower-cased address) so a retry does not send the same person the notice
--     twice, the address masked for the admin ("ki…@firma.no"), the provider's id, and that
--     person's latest delivery state. Never the address itself.
--   * Only a notice to a role gets rows. A personal message — an invitation, a reminder, a link
--     somebody asked for — is refused by dispatch_recipient_sent: nothing here can hold a token,
--     an invitation or an employee, so nothing here can be set next to a response.
--   * record_mail_event matches a recipient's message id and sets that recipient's state alone,
--     latest event wins as before. The notice's own state, which the log's counts read, becomes
--     the worst of its recipients' latest states: a notice one leader never got counts as bounced.
--   * The admin: admin_notice_recipients lists the latest 200 such rows for an organisation under
--     its e-mail log; admin_ticket_mail gives each reply's delivery state, its time and the
--     provider's reason (already masked by record_mail_event) for the ticket page. Both are read
--     on pages whose main read is audited (email_log.view, ticket.view), so they add no entry.
--
-- RLS on, no policy and no client privilege, like app.mail_events: only the definer functions
-- below read or write it.

-- ---------------------------------------------------------------- the table
create table app.outbox_recipients (
  id bigint generated always as identity primary key,
  outbox_id uuid not null references app.outbox (id) on delete cascade,
  address_key bytea not null check (octet_length(address_key) = 32),
  masked text not null check (char_length(masked) between 1 and 120),
  -- the provider's id without the angle brackets it sometimes carries; null when it gave none
  provider_id text check (char_length(provider_id) between 1 and 200),
  sent_at timestamptz not null default now(),
  delivery app.mail_delivery,
  delivery_at timestamptz,
  unique (outbox_id, address_key)
);
create index outbox_recipients_provider_id on app.outbox_recipients (provider_id) where provider_id is not null;
alter table app.outbox_recipients enable row level security;
revoke all on app.outbox_recipients from public, anon, authenticated;

-- an address as the admin may see it: the first letter or two, and the domain
create function app.mask_address(p_email text) returns text
  language sql immutable set search_path = ''
as $fn$
  select left(case
    when position('@' in e) > 1 then
      left(split_part(e, '@', 1), case when char_length(split_part(e, '@', 1)) > 3 then 2 else 1 end) || '…@' || split_part(e, '@', 2)
    else '…' end, 120)
  from (select lower(btrim(coalesce(p_email, ''))) as e) s
$fn$;
revoke all on function app.mask_address(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- the dispatcher's side
-- The people a notice has already reached, as their address keys (hex), so a retry skips them.
create function public.dispatch_reached(p_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select coalesce(jsonb_agg(encode(r.address_key, 'hex') order by r.id), '[]'::jsonb)
  from app.outbox_recipients r where r.outbox_id = p_id
$fn$;

-- One person reached by a notice to a role, with the provider's id for their message. Refuses
-- anything personal: a row with an employee or an invitation never gets a recipient row.
create function public.dispatch_recipient_sent(p_id uuid, p_email text, p_provider_id text default null)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_x     app.outbox;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_pid   text := nullif(left(btrim(coalesce(p_provider_id, ''), '<> '), 200), '');
  v_row   bigint;
begin
  select * into v_x from app.outbox where id = p_id;
  if v_x.id is null or v_x.audience is null or v_x.employee_id is not null or v_x.invitation_id is not null
     or v_x.kind in ('invitasjon', 'paminnelse', 'siste_paminnelse', 'lenke') then
    return jsonb_build_object('ok', false, 'error', 'not_a_notice');
  end if;
  if v_x.sent_at is not null or v_x.failed_at is not null then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  if position('@' in v_email) < 2 or char_length(v_email) > 320 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  insert into app.outbox_recipients (outbox_id, address_key, masked, provider_id)
  values (p_id, extensions.digest(v_email, 'sha256'), app.mask_address(v_email), v_pid)
  on conflict (outbox_id, address_key) do nothing
  returning id into v_row;
  return jsonb_build_object('ok', true, 'duplicate', v_row is null);
end $fn$;

-- ---------------------------------------------------------------- the webhook's write path
-- 0053's definition, with a third place a message id can belong: one recipient of a notice.
create or replace function public.record_mail_event(p_event text, p_message_id text, p_at timestamptz, p_reason text default null)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_id   text := btrim(coalesce(p_message_id, ''), '<> ');
  v_out  app.outbox;
  v_rcpt app.outbox_recipients;
  v_tm   uuid;
  v_org  uuid;
  v_ev   app.mail_delivery;
  v_row  bigint;
  v_roll app.mail_delivery;
  v_rat  timestamptz;
begin
  if v_id = '' or p_at is null or p_event not in ('delivered', 'soft_bounce', 'hard_bounce', 'blocked', 'spam', 'invalid', 'deferred', 'unsubscribed', 'error') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  v_ev := p_event::app.mail_delivery;
  select * into v_out from app.outbox o where btrim(o.provider_id, '<> ') = v_id limit 1;
  if v_out.id is null then
    -- 0134: one person's message of a notice to several
    select * into v_rcpt from app.outbox_recipients r where r.provider_id = v_id limit 1;
    if v_rcpt.id is not null then
      select * into v_out from app.outbox o where o.id = v_rcpt.outbox_id;
    end if;
  end if;
  if v_out.id is null then
    select tm.id into v_tm from app.ticket_mail tm where btrim(tm.provider_id, '<> ') = v_id limit 1;
    select t.org_id into v_org from app.ticket_mail tm join app.ticket_messages m on m.id = tm.message_id
      join app.tickets t on t.id = m.ticket_id where tm.id = v_tm;
  else
    v_org := v_out.org_id;
  end if;

  insert into app.mail_events (at, event, message_id, outbox_id, ticket_mail_id, org_id, reason)
  values (p_at, p_event, left(v_id, 200), v_out.id, v_tm, v_org,
          nullif(left(regexp_replace(coalesce(p_reason, ''), '[^\s@<>"'']+@[^\s@<>"'']+', '[address]', 'g'), 200), ''))
  on conflict (message_id, event, at) do nothing
  returning id into v_row;
  if v_row is null then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  if v_rcpt.id is not null then
    -- that person's state: the latest event wins, an older one arriving late does not overwrite it
    update app.outbox_recipients set delivery = v_ev, delivery_at = p_at
    where id = v_rcpt.id and (delivery_at is null or delivery_at <= p_at);
    -- the notice's: the worst of its recipients' latest states, at the latest of their times
    select r.delivery into v_roll from app.outbox_recipients r
    where r.outbox_id = v_out.id and r.delivery is not null
    order by case when r.delivery = 'delivered' then 3 when r.delivery in ('soft_bounce', 'deferred') then 2 else 1 end,
             r.delivery_at desc
    limit 1;
    select max(r.delivery_at) into v_rat from app.outbox_recipients r where r.outbox_id = v_out.id;
    update app.outbox set delivery = v_roll, delivery_at = v_rat where id = v_out.id;
  elsif v_out.id is not null then
    update app.outbox set delivery = v_ev, delivery_at = p_at
    where id = v_out.id and (delivery_at is null or delivery_at <= p_at);
    if v_out.employee_id is not null and v_ev in ('hard_bounce', 'invalid', 'blocked', 'spam', 'unsubscribed') then
      insert into app.address_problems (employee_id, channel, org_id, problem, at)
      values (v_out.employee_id, coalesce(v_out.channel, 'email'), v_out.org_id, v_ev, p_at)
      on conflict (employee_id, channel) do update set problem = excluded.problem, at = excluded.at;
    elsif v_out.employee_id is not null and v_ev = 'delivered' then
      delete from app.address_problems where employee_id = v_out.employee_id and channel = coalesce(v_out.channel, 'email');
    end if;
  elsif v_tm is not null then
    update app.ticket_mail set delivery = v_ev, delivery_at = p_at
    where id = v_tm and (delivery_at is null or delivery_at <= p_at);
  end if;
  return jsonb_build_object('ok', true, 'matched', v_out.id is not null or v_tm is not null);
end $fn$;

-- ---------------------------------------------------------------- the admin
-- The people an organisation's notices to roles reached, newest first: which notice, the masked
-- address, when it was sent, what the provider last said and when, and its reason when it was
-- not a delivery.
create function public.admin_notice_recipients(p_org uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin', 'support']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true, 'rows', (
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', l.id, 'kind', l.kind, 'audience', l.audience, 'masked', l.masked, 'sent_at', l.sent_at,
        'delivery', l.delivery, 'delivery_at', l.delivery_at, 'reason', l.reason)
        order by l.sent_at desc, l.id desc), '[]'::jsonb)
    from (
      select r.id, x.kind, x.audience, r.masked, r.sent_at, r.delivery, r.delivery_at,
             case when r.delivery is distinct from 'delivered' and r.provider_id is not null then (
               select e.reason from app.mail_events e
               where e.message_id = r.provider_id and e.event = r.delivery::text and e.at = r.delivery_at
               order by e.id desc limit 1) end as reason
      from app.outbox_recipients r join app.outbox x on x.id = r.outbox_id
      where x.org_id = p_org
      order by r.sent_at desc, r.id desc
      limit 200) l));
end $fn$;

-- What happened to each reply a ticket sent: the state, its time, and the provider's reason when
-- it was not a delivery (masked on the way in by record_mail_event).
create function public.admin_ticket_mail(p_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin', 'support']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true, 'rows', (
    select coalesce(jsonb_agg(jsonb_build_object(
        'message_id', tm.message_id, 'delivery', tm.delivery, 'delivery_at', tm.delivery_at,
        'reason', case when tm.delivery is distinct from 'delivered' and tm.provider_id is not null then (
          select e.reason from app.mail_events e
          where e.ticket_mail_id = tm.id and e.event = tm.delivery::text and e.at = tm.delivery_at
          order by e.id desc limit 1) end)
        order by m.created_at), '[]'::jsonb)
    from app.ticket_mail tm join app.ticket_messages m on m.id = tm.message_id
    where m.ticket_id = p_id and tm.delivery is not null));
end $fn$;

-- ---------------------------------------------------------------- grants
revoke all on function public.dispatch_reached(uuid) from public, anon, authenticated;
grant execute on function public.dispatch_reached(uuid) to service_role;
revoke all on function public.dispatch_recipient_sent(uuid, text, text) from public, anon, authenticated;
grant execute on function public.dispatch_recipient_sent(uuid, text, text) to service_role;
revoke all on function public.record_mail_event(text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.record_mail_event(text, text, timestamptz, text) to service_role;
revoke all on function public.admin_notice_recipients(uuid) from public, anon;
grant execute on function public.admin_notice_recipients(uuid) to authenticated;
revoke all on function public.admin_ticket_mail(uuid) from public, anon;
grant execute on function public.admin_ticket_mail(uuid) to authenticated;
