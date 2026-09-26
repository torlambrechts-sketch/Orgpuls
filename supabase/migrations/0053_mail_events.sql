-- 0053_mail_events.sql — what happened to a mail after the provider accepted it (D-97).
--
-- Until now "sent" meant only that Brevo accepted the message. Delivery, bounces, blocks and
-- spam complaints happen after that. Brevo reports them to a webhook, orgpuls-mail-events,
-- which calls record_mail_event() below with the service role.
--
-- What is kept, and what is not:
--   * app.mail_events: one row per provider event, holding the event, the provider's message
--     id, its time and the provider's reason with any address masked. No address, no subject,
--     no link. A row is linked to the outbox row or ticket reply it answers.
--   * app.outbox.delivery, app.ticket_mail.delivery: the latest delivery state, for the counts
--     the admin shows.
--   * app.address_problems: an employee whose address hard-bounced, was invalid, was blocked
--     or complained. The product tells the daglig leder so the address can be corrected. It
--     sits in its own table, not on app.employees (which customers update), and a trigger
--     clears it when the address changes.
--   * Opens and clicks are not recorded at all. An open or a click is a per-person timestamp
--     of engaging with a survey link. Next to an answer's submitted hour it narrows who
--     answered, and the response rate already measures engagement without naming anyone.
--     The webhook is registered without those events, and the receiver ignores them.

-- ---------------------------------------------------------------- tables
create table app.mail_events (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  at timestamptz not null,
  event text not null check (event in ('delivered', 'soft_bounce', 'hard_bounce', 'blocked', 'spam', 'invalid', 'deferred', 'unsubscribed', 'error')),
  message_id text not null check (char_length(message_id) between 1 and 200),
  outbox_id uuid references app.outbox (id) on delete set null,
  ticket_mail_id uuid references app.ticket_mail (id) on delete set null,
  org_id uuid references app.organizations (id) on delete cascade,
  reason text check (char_length(reason) <= 200),
  unique (message_id, event, at)
);
create index mail_events_at on app.mail_events (at);
create index mail_events_org on app.mail_events (org_id, at);
create index mail_events_outbox on app.mail_events (outbox_id);
create index mail_events_ticket_mail on app.mail_events (ticket_mail_id);
alter table app.mail_events enable row level security;
revoke all on app.mail_events from public, anon, authenticated;

create type app.mail_delivery as enum ('delivered', 'soft_bounce', 'hard_bounce', 'blocked', 'spam', 'invalid', 'deferred', 'unsubscribed', 'error');

alter table app.outbox add column delivery app.mail_delivery, add column delivery_at timestamptz;
alter table app.ticket_mail add column delivery app.mail_delivery, add column delivery_at timestamptz;

-- the provider's id, without the angle brackets it sometimes carries, for the webhook's lookup
create index outbox_provider_id on app.outbox (btrim(provider_id, '<> ')) where provider_id is not null;
create index ticket_mail_provider_id on app.ticket_mail (btrim(provider_id, '<> ')) where provider_id is not null;

create table app.address_problems (
  employee_id uuid not null references app.employees (id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  org_id uuid not null references app.organizations (id) on delete cascade,
  problem app.mail_delivery not null check (problem in ('hard_bounce', 'invalid', 'blocked', 'spam', 'unsubscribed')),
  at timestamptz not null,
  primary key (employee_id, channel)
);
create index address_problems_org on app.address_problems (org_id);
alter table app.address_problems enable row level security;
revoke all on app.address_problems from public, anon, authenticated;

-- a corrected address is a fresh start
create function app.address_problems_clear() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if new.email is distinct from old.email then
    delete from app.address_problems where employee_id = new.id and channel = 'email';
  end if;
  if new.phone is distinct from old.phone then
    delete from app.address_problems where employee_id = new.id and channel = 'sms';
  end if;
  return new;
end $fn$;
create trigger employees_address_problems_clear after update of email, phone on app.employees
  for each row execute function app.address_problems_clear();

-- ---------------------------------------------------------------- the webhook's write path
-- One provider event. Service role only. Idempotent: the same event arriving twice is one row.
create function public.record_mail_event(p_event text, p_message_id text, p_at timestamptz, p_reason text default null)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_id text := btrim(coalesce(p_message_id, ''), '<> ');
  v_out app.outbox;
  v_tm uuid;
  v_org uuid;
  v_ev app.mail_delivery;
  v_row bigint;
begin
  if v_id = '' or p_at is null or p_event not in ('delivered', 'soft_bounce', 'hard_bounce', 'blocked', 'spam', 'invalid', 'deferred', 'unsubscribed', 'error') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  v_ev := p_event::app.mail_delivery;
  select * into v_out from app.outbox o where btrim(o.provider_id, '<> ') = v_id limit 1;
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

  -- the latest event is the state; an older one arriving late does not overwrite it
  if v_out.id is not null then
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

-- ---------------------------------------------------------------- the product
-- The daglig leder's list of employees whose address does not take mail: name, address, what
-- the provider said and the day. Nothing about which round or when during it.
create function public.address_problems(p_org uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select case when app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    coalesce((select jsonb_agg(jsonb_build_object(
        'employee_id', e.id, 'name', e.full_name, 'email', e.email, 'phone', e.phone,
        'channel', a.channel, 'problem', a.problem, 'day', (a.at at time zone 'Europe/Oslo')::date)
        order by e.full_name)
      from app.address_problems a join app.employees e on e.id = a.employee_id
      where a.org_id = p_org and e.active), '[]'::jsonb)
  end
$fn$;

-- ---------------------------------------------------------------- the admin
-- One organisation's log, now with what happened after sending.
create or replace function public.admin_email_log(p_org uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin', 'support']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('email_log.view', p_org);
  return jsonb_build_object('ok', true, 'rows', (
    select coalesce(jsonb_agg(l order by l.day desc, l.kind), '[]') from (
      select (x.due_at at time zone 'Europe/Oslo')::date as day, x.kind, x.channel, coalesce(x.audience::text, 'employee') as audience,
             count(*) as total,
             count(*) filter (where x.sent_at is not null) as sent,
             count(*) filter (where x.failed_at is not null) as failed,
             count(*) filter (where x.sent_at is null and x.failed_at is null) as pending,
             count(*) filter (where x.delivery = 'delivered') as delivered,
             count(*) filter (where x.delivery in ('soft_bounce', 'deferred')) as soft,
             count(*) filter (where x.delivery in ('hard_bounce', 'invalid', 'blocked')) as bounced,
             count(*) filter (where x.delivery in ('spam', 'unsubscribed')) as complaints
      from app.outbox x where x.org_id = p_org
      group by 1, 2, 3, 4) l),
    'address_problems', (select count(*) from app.address_problems a where a.org_id = p_org));
end $fn$;

-- Deliverability across every organisation over p_days (1..90): per day and in total, with
-- the rates providers judge a sender by. Counts only.
create function public.admin_deliverability(p_days int default 30) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_from timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 90));
begin
  if not app.is_platform_admin(array['super_admin', 'support']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('deliverability.view');
  return jsonb_build_object('ok', true,
    'totals', (select jsonb_build_object(
        'events', count(*),
        'delivered', count(*) filter (where e.event = 'delivered'),
        'soft', count(*) filter (where e.event in ('soft_bounce', 'deferred')),
        'hard', count(*) filter (where e.event in ('hard_bounce', 'invalid')),
        'blocked', count(*) filter (where e.event = 'blocked'),
        'spam', count(*) filter (where e.event = 'spam'),
        'unsubscribed', count(*) filter (where e.event = 'unsubscribed'),
        'unmatched', count(*) filter (where e.outbox_id is null and e.ticket_mail_id is null))
      from app.mail_events e where e.at >= v_from),
    'daily', (select coalesce(jsonb_agg(d order by d.day), '[]') from (
        select (e.at at time zone 'Europe/Oslo')::date as day,
               count(*) filter (where e.event = 'delivered') as delivered,
               count(*) filter (where e.event in ('hard_bounce', 'invalid', 'blocked')) as bounced,
               count(*) filter (where e.event in ('spam', 'unsubscribed')) as complaints
        from app.mail_events e where e.at >= v_from group by 1) d),
    'orgs', (select coalesce(jsonb_agg(o order by o.bounced desc, o.name), '[]') from (
        select e.org_id, og.name,
               count(*) filter (where e.event = 'delivered') as delivered,
               count(*) filter (where e.event in ('hard_bounce', 'invalid', 'blocked')) as bounced,
               count(*) filter (where e.event in ('spam', 'unsubscribed')) as complaints,
               (select count(*) from app.address_problems a where a.org_id = e.org_id) as address_problems
        from app.mail_events e join app.organizations og on og.id = e.org_id
        where e.at >= v_from group by e.org_id, og.name
        having count(*) filter (where e.event in ('hard_bounce', 'invalid', 'blocked', 'spam', 'unsubscribed')) > 0
        limit 50) o));
end $fn$;

-- ---------------------------------------------------------------- grants
revoke all on function public.record_mail_event(text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.record_mail_event(text, text, timestamptz, text) to service_role;
revoke all on function public.address_problems(uuid) from public, anon;
grant execute on function public.address_problems(uuid) to authenticated;
revoke all on function public.admin_deliverability(int) from public, anon;
grant execute on function public.admin_deliverability(int) to authenticated;
