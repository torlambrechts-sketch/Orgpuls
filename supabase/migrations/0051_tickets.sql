-- 0051_tickets.sql — ticketing, a small ITSM module inside the admin (D-92, X-060).
--
-- The admin specification's Phase 1 ticketing: every request lands in one queue, linked to the
-- organisation and user it concerns.
--
--   * Two ways in, each an RPC:
--       - the site's contact form (submit_contact), callable by anyone;
--       - the in-app help form (submit_help_request), callable by a signed-in member. It
--         records the member's organisation, role, page and browser.
--     E-mail in is not built yet (D-92).
--   * Tickets have the specification's types (question, service request, incident, problem),
--     statuses, queues and categories.
--   * Priority is not chosen. A trigger derives it from impact (one user, one organisation,
--     many organisations) and whether a send is blocked. A personvern or security matter is
--     never below high.
--   * First-response and resolution deadlines follow the agreed targets, counted in
--     business hours: Monday to Friday, 08:00–16:00 Oslo time. Public holidays are not
--     subtracted (D-92).
--   * Messages and events are append-only. Internal notes never leave the admin.
--   * A reply that is not internal is queued in app.ticket_mail. The dispatcher sends it with
--     the product's e-mail provider, replying to the support address.
--   * No respondent has a channel here; the specification routes their questions through the
--     employer. No survey answer can be attached: nothing here references a response table.
--
-- RLS is on for every table, with no policy and no grant. Only the SECURITY DEFINER functions
-- below read or write them, and the admin ones only for the support and super-admin roles,
-- with a second factor, as the specification restricts ticket content.

-- ---------------------------------------------------------------- types
create type app.ticket_type as enum ('question', 'service_request', 'incident', 'problem');
create type app.ticket_status as enum ('new', 'open', 'waiting_customer', 'waiting_us', 'resolved', 'closed');
create type app.ticket_priority as enum ('low', 'normal', 'high', 'urgent');
create type app.ticket_queue as enum ('support', 'billing', 'sales', 'personvern');
create type app.ticket_category as enum (
  'getting_started', 'survey_delivery', 'results_anonymity', 'tiltak', 'billing', 'bug', 'feature_request', 'sales', 'personvern'
);
create type app.ticket_impact as enum ('one_user', 'one_org', 'many_orgs');

-- ---------------------------------------------------------------- business hours
-- p_hours of working time after p_from: Monday–Friday, 08:00–16:00 in Oslo.
create function app.add_business_hours(p_from timestamptz, p_hours numeric) returns timestamptz
  language plpgsql stable set search_path = ''
as $fn$
declare
  t timestamp := p_from at time zone 'Europe/Oslo';
  left_min numeric := greatest(p_hours, 0) * 60;
  avail numeric;
begin
  loop
    if extract(isodow from t) >= 6 then
      t := date_trunc('day', t) + interval '1 day' * (8 - extract(isodow from t)) + interval '8 hours';
      continue;
    end if;
    if t::time < time '08:00' then
      t := date_trunc('day', t) + interval '8 hours';
    elsif t::time >= time '16:00' then
      t := date_trunc('day', t) + interval '1 day 8 hours';
      continue;
    end if;
    avail := extract(epoch from (date_trunc('day', t) + interval '16 hours') - t) / 60;
    if left_min <= avail then
      return (t + make_interval(secs => left_min * 60)) at time zone 'Europe/Oslo';
    end if;
    left_min := left_min - avail;
    t := date_trunc('day', t) + interval '1 day 8 hours';
  end loop;
end $fn$;

-- The matrix: impact × whether a send is blocked. Personvern and security matters are at least high.
create function app.ticket_priority_of(p_impact app.ticket_impact, p_blocking boolean, p_category app.ticket_category)
  returns app.ticket_priority
  language sql immutable set search_path = ''
as $fn$
  select case
    when p_blocking and p_impact in ('one_org', 'many_orgs') then 'urgent'
    when p_blocking or p_impact = 'many_orgs' then 'high'
    when p_category = 'personvern' then 'high'
    when p_impact = 'one_org' then 'normal'
    when p_category in ('feature_request', 'sales') then 'low'
    else 'normal'
  end::app.ticket_priority
$fn$;

-- The agreed targets, in business hours: a business day is eight.
create function app.ticket_first_response_hours(p app.ticket_priority) returns numeric
  language sql immutable set search_path = ''
as $fn$ select case p when 'urgent' then 4 when 'high' then 8 when 'normal' then 16 else 40 end $fn$;

create function app.ticket_resolve_hours(p app.ticket_priority) returns numeric
  language sql immutable set search_path = ''
as $fn$ select case p when 'urgent' then 16 when 'high' then 40 when 'normal' then 80 else 160 end $fn$;

-- ---------------------------------------------------------------- tables
create table app.tickets (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity (start with 1001) unique,
  product_id text not null default 'orgpuls',
  type app.ticket_type not null default 'question',
  status app.ticket_status not null default 'new',
  category app.ticket_category not null,
  queue app.ticket_queue not null,
  impact app.ticket_impact not null default 'one_user',
  blocking boolean not null default false,
  priority app.ticket_priority not null default 'normal',
  subject text not null check (char_length(subject) between 1 and 200),
  channel text not null check (channel in ('contact_form', 'in_app', 'email', 'admin')),
  org_id uuid references app.organizations (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  requester_name text check (char_length(requester_name) <= 120),
  requester_email text not null check (char_length(requester_email) <= 254 and requester_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  requester_org text check (char_length(requester_org) <= 200),
  context jsonb not null default '{}',
  assignee_id uuid references app.platform_admins (user_id) on delete set null,
  problem_id uuid references app.tickets (id) on delete set null,
  first_response_due timestamptz not null default now(),
  resolve_due timestamptz not null default now(),
  legal_due timestamptz,
  first_responded_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tickets_open on app.tickets (queue, status) where status not in ('resolved', 'closed');
create index tickets_org on app.tickets (org_id);
create index tickets_user on app.tickets (user_id);
create index tickets_assignee on app.tickets (assignee_id);
create index tickets_problem on app.tickets (problem_id);
create index tickets_requester on app.tickets (lower(requester_email), created_at);
alter table app.tickets enable row level security;
revoke all on app.tickets from public, anon, authenticated;

-- priority and deadlines are derived, never set; a personvern request also carries the 30-day legal clock
create function app.tickets_derive() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  new.priority := app.ticket_priority_of(new.impact, new.blocking, new.category);
  if tg_op = 'INSERT' or new.priority is distinct from old.priority then
    new.first_response_due := app.add_business_hours(new.created_at, app.ticket_first_response_hours(new.priority));
    new.resolve_due := app.add_business_hours(new.created_at, app.ticket_resolve_hours(new.priority));
  end if;
  if new.category = 'personvern' then
    new.legal_due := coalesce(new.legal_due, new.created_at + interval '30 days');
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if new.status = 'resolved' and old.status <> 'resolved' then new.resolved_at := now(); end if;
    if new.status = 'closed' and old.status <> 'closed' then new.closed_at := now(); end if;
    if new.status not in ('resolved', 'closed') then new.resolved_at := null; new.closed_at := null; end if;
  end if;
  return new;
end $fn$;
create trigger tickets_derive before insert or update on app.tickets
  for each row execute function app.tickets_derive();

create table app.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references app.tickets (id) on delete cascade,
  author_kind text not null check (author_kind in ('customer', 'admin', 'system')),
  author_id uuid references auth.users (id) on delete set null,
  author_email text,
  body text not null check (char_length(body) between 1 and 10000),
  internal boolean not null default false,
  created_at timestamptz not null default now()
);
create index ticket_messages_ticket on app.ticket_messages (ticket_id, created_at);
create index ticket_messages_author on app.ticket_messages (author_id);
alter table app.ticket_messages enable row level security;
revoke all on app.ticket_messages from public, anon, authenticated;

create table app.ticket_events (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references app.tickets (id) on delete cascade,
  at timestamptz not null default now(),
  actor_id uuid references auth.users (id) on delete set null,
  actor_email text,
  kind text not null check (kind ~ '^[a-z_]+$'),
  detail jsonb not null default '{}'
);
create index ticket_events_ticket on app.ticket_events (ticket_id, at);
create index ticket_events_actor on app.ticket_events (actor_id);
alter table app.ticket_events enable row level security;
revoke all on app.ticket_events from public, anon, authenticated;

-- a ticket about one survey round; a problem is linked through tickets.problem_id
create table app.ticket_links (
  ticket_id uuid not null references app.tickets (id) on delete cascade,
  round_id uuid not null references app.rounds (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (ticket_id, round_id)
);
create index ticket_links_round on app.ticket_links (round_id);
alter table app.ticket_links enable row level security;
revoke all on app.ticket_links from public, anon, authenticated;

create table app.canned_replies (
  id uuid primary key default gen_random_uuid(),
  product_id text not null default 'orgpuls',
  key text not null unique check (key ~ '^[a-z0-9_]+$'),
  title text not null,
  body text not null,
  sort int not null default 0,
  active boolean not null default true
);
alter table app.canned_replies enable row level security;
revoke all on app.canned_replies from public, anon, authenticated;

create table app.ticket_mail (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references app.ticket_messages (id) on delete cascade,
  to_email text not null,
  to_name text,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts int not null default 0,
  leased_until timestamptz,
  provider_id text,
  last_error text check (last_error ~ '^[a-z0-9_]{1,40}$'),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index ticket_mail_pending on app.ticket_mail (created_at) where status in ('pending', 'sending');
alter table app.ticket_mail enable row level security;
revoke all on app.ticket_mail from public, anon, authenticated;

-- "Nobody may change this content" — and a delete only as the ticket's own deletion cascades.
create function app.ticket_history_fixed() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from app.tickets t where t.id = old.ticket_id) then
      raise exception 'ticket history cannot be deleted';
    end if;
    return old;
  end if;
  -- UPDATE: only the author may become null (their account deleted)
  if tg_table_name = 'ticket_messages' then
    if (new.id, new.ticket_id, new.author_kind, new.author_email, new.body, new.internal, new.created_at)
         is distinct from (old.id, old.ticket_id, old.author_kind, old.author_email, old.body, old.internal, old.created_at)
       or (new.author_id is not null and new.author_id is distinct from old.author_id) then
      raise exception 'a ticket message cannot be changed';
    end if;
  else
    if (new.id, new.ticket_id, new.at, new.actor_email, new.kind, new.detail)
         is distinct from (old.id, old.ticket_id, old.at, old.actor_email, old.kind, old.detail)
       or (new.actor_id is not null and new.actor_id is distinct from old.actor_id) then
      raise exception 'a ticket event cannot be changed';
    end if;
  end if;
  return new;
end $fn$;
create trigger ticket_messages_fixed before update or delete on app.ticket_messages
  for each row execute function app.ticket_history_fixed();
create trigger ticket_events_fixed before update or delete on app.ticket_events
  for each row execute function app.ticket_history_fixed();

-- ---------------------------------------------------------------- canned replies (Norwegian)
insert into app.canned_replies (key, title, body, sort) values
  ('takk', 'Takk, vi ser på det',
   E'Hei,\n\nTakk for at du tok kontakt. Vi ser på saken og kommer tilbake til deg så snart vi vet mer.\n\nVennlig hilsen\nOrgpuls', 1),
  ('invitasjon_ikke_mottatt', 'Invitasjonen kom ikke fram',
   E'Hei,\n\nTakk for beskjeden. Når en invitasjon ikke kommer fram, skyldes det oftest at e-posten har havnet i søppelpost, eller at adressen i ansattlisten er feil. Sjekk adressen under Oppsett › Ansatte, og be gjerne den ansatte se i søppelposten. Du kan sende en påminnelse fra Målinger.\n\nSi fra om det fortsatt ikke kommer fram, så ser vi på utsendingsloggen.\n\nVennlig hilsen\nOrgpuls', 2),
  ('anonymitet', 'Hvordan anonymiteten virker',
   E'Hei,\n\nIngen svar kan knyttes til en person. Svarene lagres uten kobling til den som svarte, og resultater vises bare for grupper med minst fem svar. Heller ikke vi i Orgpuls kan se hvem som svarte hva.\n\nVennlig hilsen\nOrgpuls', 3),
  ('provetid_forlenget', 'Prøveperioden er forlenget',
   E'Hei,\n\nVi har forlenget prøveperioden deres. Den nye sluttdatoen står under Oppsett › Betaling.\n\nVennlig hilsen\nOrgpuls', 4),
  ('personvern_mottatt', 'Personvernhenvendelse mottatt',
   E'Hei,\n\nVi har mottatt henvendelsen og behandler den innen 30 dager, som personvernregelverket krever. Vi tar kontakt hvis vi trenger mer informasjon.\n\nVennlig hilsen\nOrgpuls', 5);

-- ---------------------------------------------------------------- helpers
create function app.ticket_event(p_ticket uuid, p_kind text, p_detail jsonb default '{}') returns void
  language sql volatile security definer set search_path = ''
as $fn$
  insert into app.ticket_events (ticket_id, actor_id, actor_email, kind, detail)
  values (p_ticket, auth.uid(), (select u.email from auth.users u where u.id = auth.uid()), p_kind, coalesce(p_detail, '{}'))
$fn$;

-- ---------------------------------------------------------------- ways in
-- The site's contact form. Anyone may call it; a filled honeypot is thanked and dropped, and
-- one address may write three times an hour. The four topics are the form's, in its order.
create function public.submit_contact(p_topic int, p_name text, p_email text, p_org text, p_message text, p_trap text default null)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := left(btrim(coalesce(p_name, '')), 120);
  v_body text := btrim(coalesce(p_message, ''));
  v_topic int := coalesce(p_topic, 0);
  v_subjects text[] := array['Spørsmål om produktet', 'Pris for konsern eller over 100 ansatte', 'Hjelp til første utsending', 'Personvern og databehandleravtale'];
  v_user uuid;
  v_org uuid;
  v_id uuid;
begin
  if coalesce(p_trap, '') <> '' then
    return jsonb_build_object('ok', true);
  end if;
  if v_name = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if v_topic not between 0 and 3 then v_topic := 0; end if;
  if v_body = '' then v_body := v_subjects[v_topic + 1]; end if;
  if char_length(v_body) > 5000 then
    return jsonb_build_object('ok', false, 'error', 'too_long');
  end if;
  if (select count(*) from app.tickets t where lower(t.requester_email) = v_email and t.created_at > now() - interval '1 hour') >= 3
     or (select count(*) from app.tickets t where t.channel = 'contact_form' and t.created_at > now() - interval '1 hour') >= 60 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- a known customer's address links the ticket to their account and organisation
  select u.id, m.org_id into v_user, v_org
  from auth.users u left join app.memberships m on m.user_id = u.id and m.active
  where lower(u.email) = v_email limit 1;

  -- nothing proves the sender owns the address, so the link is marked unverified for the admin
  insert into app.tickets (category, queue, type, subject, channel, org_id, user_id, requester_name, requester_email, requester_org, context)
  values ((array['getting_started', 'sales', 'getting_started', 'personvern'])[v_topic + 1]::app.ticket_category,
          (array['support', 'sales', 'support', 'personvern'])[v_topic + 1]::app.ticket_queue,
          'question', v_subjects[v_topic + 1], 'contact_form', v_org, v_user, v_name, v_email,
          nullif(left(btrim(coalesce(p_org, '')), 200), ''), jsonb_build_object('verified', false))
  returning id into v_id;
  insert into app.ticket_messages (ticket_id, author_kind, author_id, author_email, body) values (v_id, 'customer', v_user, v_email, v_body);
  insert into app.ticket_events (ticket_id, kind, detail) values (v_id, 'created', jsonb_build_object('channel', 'contact_form'));
  return jsonb_build_object('ok', true);
end $fn$;

-- The in-app help form. The caller's organisation, role, page and browser come with it.
create function public.submit_help_request(p_category text, p_subject text, p_body text, p_page text, p_browser text)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_role text;
  v_email text;
  v_name text;
  v_cat app.ticket_category;
  v_subject text := left(btrim(coalesce(p_subject, '')), 200);
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
  v_number bigint;
begin
  select m.org_id, m.role::text into v_org, v_role from app.memberships m where m.user_id = v_uid and m.active limit 1;
  if v_uid is null or v_org is null then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if v_body = '' or char_length(v_body) > 5000 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if p_category not in ('getting_started', 'survey_delivery', 'results_anonymity', 'tiltak', 'billing', 'bug', 'feature_request', 'personvern') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  v_cat := p_category::app.ticket_category;
  if (select count(*) from app.tickets t where t.user_id = v_uid and t.created_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  select u.email into v_email from auth.users u where u.id = v_uid;
  select p.full_name into v_name from app.profiles p where p.id = v_uid;

  insert into app.tickets (category, queue, type, subject, channel, org_id, user_id, requester_name, requester_email, context)
  values (v_cat,
          case v_cat when 'billing' then 'billing' when 'personvern' then 'personvern' else 'support' end::app.ticket_queue,
          case v_cat when 'bug' then 'incident' else 'question' end::app.ticket_type,
          coalesce(nullif(v_subject, ''), left(v_body, 80)), 'in_app', v_org, v_uid, v_name, v_email,
          jsonb_build_object('role', v_role,
                             'page', nullif(left(regexp_replace(coalesce(p_page, ''), '[?#].*$', ''), 160), ''),
                             'browser', nullif(left(coalesce(p_browser, ''), 200), '')))
  returning id, number into v_id, v_number;
  insert into app.ticket_messages (ticket_id, author_kind, author_id, author_email, body) values (v_id, 'customer', v_uid, v_email, v_body);
  insert into app.ticket_events (ticket_id, actor_id, actor_email, kind, detail) values (v_id, v_uid, v_email, 'created', jsonb_build_object('channel', 'in_app'));
  return jsonb_build_object('ok', true, 'number', v_number);
end $fn$;

-- ---------------------------------------------------------------- admin
-- The queue. p_view: 'open' (default), 'mine', 'unassigned', 'overdue', 'resolved', 'all'.
create function public.admin_tickets(p_queue text default null, p_view text default 'open', p_search text default null)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not app.is_platform_admin(array['super_admin', 'support']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('tickets.list', null, null, null, null, jsonb_build_object('queue', p_queue, 'view', p_view));
  return jsonb_build_object('ok', true,
    'counts', (select coalesce(jsonb_object_agg(q.queue, q.n), '{}') from (
        select t.queue::text as queue, count(*) as n from app.tickets t where t.status not in ('resolved', 'closed') group by t.queue) q),
    'rows', (select coalesce(jsonb_agg(r order by r.overdue desc, r.prio_rank, r.created_at), '[]') from (
      select t.id, t.number, t.subject, t.type, t.status, t.priority, t.queue, t.category, t.channel,
             t.requester_name, t.requester_email, o.name as org_name, t.org_id,
             a.email as assignee_email, t.created_at, t.first_response_due, t.resolve_due, t.first_responded_at, t.legal_due,
             (t.status not in ('resolved', 'closed') and
               ((t.first_responded_at is null and t.first_response_due < now()) or t.resolve_due < now()
                or (t.legal_due is not null and t.legal_due < now()))) as overdue,
             array_position(array['urgent', 'high', 'normal', 'low'], t.priority::text) as prio_rank,
             (select max(m.created_at) from app.ticket_messages m where m.ticket_id = t.id) as last_message_at
      from app.tickets t
      left join app.organizations o on o.id = t.org_id
      left join auth.users a on a.id = t.assignee_id
      where (p_queue is null or t.queue::text = p_queue)
        and case coalesce(p_view, 'open')
              when 'all' then true
              when 'resolved' then t.status in ('resolved', 'closed')
              when 'mine' then t.assignee_id = auth.uid() and t.status not in ('resolved', 'closed')
              when 'unassigned' then t.assignee_id is null and t.status not in ('resolved', 'closed')
              when 'overdue' then t.status not in ('resolved', 'closed') and
                ((t.first_responded_at is null and t.first_response_due < now()) or t.resolve_due < now())
              else t.status not in ('resolved', 'closed')
            end
        and (v_q is null or t.subject ilike '%' || v_q || '%' or t.requester_email ilike '%' || v_q || '%'
             or o.name ilike '%' || v_q || '%' or t.number::text = ltrim(v_q, '#'))
      limit 300) r));
end $fn$;

create function public.admin_ticket(p_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_t app.tickets;
begin
  if not app.is_platform_admin(array['super_admin', 'support']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select * into v_t from app.tickets where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform app.admin_log('ticket.view', v_t.org_id, 'ticket', p_id::text);
  return jsonb_build_object('ok', true,
    'ticket', to_jsonb(v_t) || jsonb_build_object(
      'org_name', (select o.name from app.organizations o where o.id = v_t.org_id),
      'assignee_email', (select u.email from auth.users u where u.id = v_t.assignee_id),
      'problem_number', (select p.number from app.tickets p where p.id = v_t.problem_id)),
    'messages', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'author_kind', m.author_kind, 'author_email', m.author_email,
        'body', m.body, 'internal', m.internal, 'created_at', m.created_at,
        'mail', (select tm.status from app.ticket_mail tm where tm.message_id = m.id)) order by m.created_at), '[]')
      from app.ticket_messages m where m.ticket_id = p_id),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'kind', e.kind, 'actor_email', e.actor_email, 'detail', e.detail)
        order by e.at, e.id), '[]') from app.ticket_events e where e.ticket_id = p_id),
    'rounds', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', ms.kind, 'year', ms.year, 'status', r.status,
        'linked', exists (select 1 from app.ticket_links l where l.ticket_id = p_id and l.round_id = r.id))
        order by r.opens_at desc nulls last), '[]')
      from app.rounds r join app.measurements ms on ms.id = r.measurement_id where r.org_id = v_t.org_id),
    'incidents', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'number', i.number, 'subject', i.subject, 'status', i.status)
        order by i.number), '[]') from app.tickets i where i.problem_id = p_id),
    'problems', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'number', p.number, 'subject', p.subject) order by p.number desc), '[]')
      from app.tickets p where p.type = 'problem' and p.status not in ('resolved', 'closed') and p.id <> p_id),
    'admins', (select coalesce(jsonb_agg(jsonb_build_object('id', a.user_id, 'email', u.email) order by u.email), '[]')
      from app.platform_admins a join auth.users u on u.id = a.user_id
      where a.active and a.role in ('super_admin', 'support')),
    'canned', (select coalesce(jsonb_agg(jsonb_build_object('key', c.key, 'title', c.title, 'body', c.body) order by c.sort), '[]')
      from app.canned_replies c where c.active),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'number', h.number, 'subject', h.subject, 'status', h.status,
        'created_at', h.created_at) order by h.created_at desc), '[]')
      from app.tickets h where h.id <> p_id and ((v_t.org_id is not null and h.org_id = v_t.org_id)
        or lower(h.requester_email) = lower(v_t.requester_email))));
end $fn$;

-- Changes a ticket's fields. Each change is a ticket event and one audit row. Resolving a
-- problem writes a note on every incident linked to it and puts them back on our side.
create function public.admin_ticket_update(p_id uuid, p_changes jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_old app.tickets;
  v_new app.tickets;
  v_key text;
  v_diff jsonb := '{}';
begin
  if not app.is_platform_admin(array['super_admin', 'support']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select * into v_old from app.tickets where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  for v_key in select jsonb_object_keys(coalesce(p_changes, '{}')) loop
    if v_key not in ('status', 'type', 'impact', 'blocking', 'queue', 'category', 'assignee', 'problem') then
      return jsonb_build_object('ok', false, 'error', 'invalid');
    end if;
  end loop;
  begin
    update app.tickets t set
      status = coalesce((p_changes ->> 'status')::app.ticket_status, t.status),
      type = coalesce((p_changes ->> 'type')::app.ticket_type, t.type),
      impact = coalesce((p_changes ->> 'impact')::app.ticket_impact, t.impact),
      blocking = coalesce((p_changes ->> 'blocking')::boolean, t.blocking),
      queue = coalesce((p_changes ->> 'queue')::app.ticket_queue, t.queue),
      category = coalesce((p_changes ->> 'category')::app.ticket_category, t.category),
      assignee_id = case when p_changes ? 'assignee' then nullif(p_changes ->> 'assignee', '')::uuid else t.assignee_id end,
      problem_id = case when p_changes ? 'problem' then nullif(p_changes ->> 'problem', '')::uuid else t.problem_id end
    where t.id = p_id
    returning * into v_new;
  exception when invalid_text_representation or foreign_key_violation then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end;
  if v_new.problem_id = p_id or (v_new.problem_id is not null
     and not exists (select 1 from app.tickets p where p.id = v_new.problem_id and p.type = 'problem')) then
    raise exception 'a ticket can only be linked to another ticket of type problem';
  end if;

  select jsonb_object_agg(k, jsonb_build_object('from', to_jsonb(o) -> k, 'to', to_jsonb(n) -> k)) into v_diff
  from (select v_old as o, v_new as n) x,
       unnest(array['status', 'type', 'impact', 'blocking', 'queue', 'category', 'assignee_id', 'problem_id', 'priority']) k
  where (to_jsonb(v_old) -> k) is distinct from (to_jsonb(v_new) -> k);
  if v_diff is not null then
    perform app.ticket_event(p_id, 'updated', v_diff);
    perform app.admin_log('ticket.update', v_new.org_id, 'ticket', p_id::text, null, v_diff);
  end if;

  if v_new.type = 'problem' and v_new.status = 'resolved' and v_old.status <> 'resolved' then
    insert into app.ticket_messages (ticket_id, author_kind, body, internal)
    select i.id, 'system', format('Problem #%s er løst: %s', v_new.number, v_new.subject), true
    from app.tickets i where i.problem_id = p_id and i.status not in ('resolved', 'closed');
    update app.tickets i set status = 'waiting_us' where i.problem_id = p_id and i.status not in ('resolved', 'closed');
  end if;
  return jsonb_build_object('ok', true);
exception when raise_exception then
  return jsonb_build_object('ok', false, 'error', 'invalid');
end $fn$;

-- A reply to the requester, or an internal note. A reply is queued as e-mail and counts as
-- the first response; the ticket then waits on the customer unless it is being resolved.
create function public.admin_ticket_reply(p_id uuid, p_body text, p_internal boolean, p_status text default null)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_t app.tickets;
  v_body text := btrim(coalesce(p_body, ''));
  v_msg uuid;
begin
  if not app.is_platform_admin(array['super_admin', 'support']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if v_body = '' or char_length(v_body) > 10000 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if p_status is not null and p_status not in ('open', 'waiting_customer', 'waiting_us', 'resolved', 'closed') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select * into v_t from app.tickets where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  insert into app.ticket_messages (ticket_id, author_kind, author_id, author_email, body, internal)
  values (p_id, 'admin', auth.uid(), (select u.email from auth.users u where u.id = auth.uid()), v_body, coalesce(p_internal, false))
  returning id into v_msg;
  if not coalesce(p_internal, false) then
    insert into app.ticket_mail (message_id, to_email, to_name) values (v_msg, v_t.requester_email, v_t.requester_name);
    update app.tickets set first_responded_at = coalesce(first_responded_at, now()),
                           status = coalesce(p_status, 'waiting_customer')::app.ticket_status
    where id = p_id;
  elsif p_status is not null then
    update app.tickets set status = p_status::app.ticket_status where id = p_id;
  elsif v_t.status = 'new' then
    update app.tickets set status = 'open' where id = p_id;
  end if;
  perform app.ticket_event(p_id, case when coalesce(p_internal, false) then 'note' else 'reply' end,
                           jsonb_build_object('status', p_status));
  perform app.admin_log(case when coalesce(p_internal, false) then 'ticket.note' else 'ticket.reply' end, v_t.org_id, 'ticket', p_id::text);
  return jsonb_build_object('ok', true);
end $fn$;

create function public.admin_ticket_link_round(p_id uuid, p_round uuid, p_linked boolean) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_org uuid;
begin
  if not app.is_platform_admin(array['super_admin', 'support']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select t.org_id into v_org from app.tickets t where t.id = p_id;
  if v_org is null or not exists (select 1 from app.rounds r where r.id = p_round and r.org_id = v_org) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if p_linked then
    insert into app.ticket_links (ticket_id, round_id) values (p_id, p_round) on conflict do nothing;
  else
    delete from app.ticket_links where ticket_id = p_id and round_id = p_round;
  end if;
  perform app.ticket_event(p_id, case when p_linked then 'round_linked' else 'round_unlinked' end, jsonb_build_object('round', p_round));
  perform app.admin_log('ticket.link', v_org, 'ticket', p_id::text, null, jsonb_build_object('round', p_round, 'linked', p_linked));
  return jsonb_build_object('ok', true);
end $fn$;

-- An organisation's tickets, for its admin page.
create function public.admin_org_tickets(p_org uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin', 'support']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('tickets.org', p_org);
  return jsonb_build_object('ok', true, 'rows', (
    select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'number', t.number, 'subject', t.subject, 'status', t.status,
      'priority', t.priority, 'created_at', t.created_at) order by t.created_at desc), '[]')
    from app.tickets t where t.org_id = p_org));
end $fn$;

-- ---------------------------------------------------------------- the dispatcher's side
-- Leases up to p_batch replies for two minutes. Service role only.
create function public.ticket_mail_claim(p_batch int default 20) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v jsonb;
begin
  with c as (
    select tm.id from app.ticket_mail tm
    where (tm.status = 'pending' or (tm.status = 'sending' and tm.leased_until < now())) and tm.attempts < 5
    order by tm.created_at limit least(greatest(coalesce(p_batch, 20), 1), 50)
    for update skip locked
  ), u as (
    update app.ticket_mail tm set status = 'sending', leased_until = now() + interval '2 minutes', attempts = tm.attempts + 1
    from c where tm.id = c.id returning tm.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'to_email', u.to_email, 'to_name', u.to_name,
    'subject', format('Re: %s [#%s]', t.subject, t.number), 'number', t.number, 'body', m.body)), '[]') into v
  from u join app.ticket_messages m on m.id = u.message_id join app.tickets t on t.id = m.ticket_id;
  return v;
end $fn$;

create function public.ticket_mail_done(p_id uuid, p_ok boolean, p_provider_id text default null, p_error text default null, p_permanent boolean default false)
  returns void
  language sql security definer set search_path = ''
as $fn$
  update app.ticket_mail set
    status = case when p_ok then 'sent' when p_permanent or attempts >= 5 then 'failed' else 'pending' end,
    provider_id = case when p_ok then left(p_provider_id, 200) else provider_id end,
    sent_at = case when p_ok then now() else sent_at end,
    last_error = case when p_ok then null else left(regexp_replace(lower(coalesce(p_error, 'unknown')), '[^a-z0-9_]', '_', 'g'), 40) end,
    leased_until = null
  where id = p_id
$fn$;

-- ---------------------------------------------------------------- grants
revoke all on function app.ticket_event(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.submit_contact(int, text, text, text, text, text) from public;
grant execute on function public.submit_contact(int, text, text, text, text, text) to anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'public.submit_help_request(text,text,text,text,text)', 'public.admin_tickets(text,text,text)', 'public.admin_ticket(uuid)',
    'public.admin_ticket_update(uuid,jsonb)', 'public.admin_ticket_reply(uuid,text,boolean,text)',
    'public.admin_ticket_link_round(uuid,uuid,boolean)', 'public.admin_org_tickets(uuid)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['public.ticket_mail_claim(int)', 'public.ticket_mail_done(uuid,boolean,text,text,boolean)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
