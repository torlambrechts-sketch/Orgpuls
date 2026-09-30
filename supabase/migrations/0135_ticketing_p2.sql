-- 0135_ticketing_p2.sql — ticketing, the specification's Phase 2 (D-92's «left open»).
--
--   * CSAT. A reply that resolves a ticket is queued with `csat`; when the dispatcher claims it,
--     the claim mints a one-use rating key (256 random bits), stores only its SHA-256 in
--     app.ticket_csat with a 30-day expiry, and hands the plaintext to the dispatcher, which
--     prints the link in that one mail and nowhere else. The public page /vurdering reads the key
--     with csat_open and writes the rating (1–5, an optional comment) with csat_submit, once.
--     A key that is malformed, unknown, expired or already used answers the same `invalid`, and
--     each such miss is counted: past 200 misses in ten minutes both functions answer
--     `rate_limited` to everyone until the window passes. A miss row holds a time and nothing
--     else. A rating is fixed once given, and goes with its ticket.
--   * Canned replies are edited in the admin: create, edit, archive and restore, by support and
--     super-admins with a second factor, each change in app.admin_audit. The table is 0051's.
--   * Reporting: admin_ticket_report counts, over the tickets created in a window of weeks, the
--     volume by week, queue and type, the share of first replies and resolutions within their
--     deadline, the median times, and the ratings given — each over real rows, null where there
--     is nothing to count.
--   * @mentions. An internal note naming an admin who handles tickets (`@` and the part of their
--     address before the `@`) records a mention for them. They see how many are unseen on the
--     ticket pages and the list of them; opening the ticket marks its mentions seen.
--
--   * /vurdering, the rating page, is added to app.cms_reserved, so no CMS page can take it.
--
-- Every new table has RLS on, no policy and no client privilege: only the SECURITY DEFINER
-- functions below read or write them. Nothing here references a response-level table.

-- ---------------------------------------------------------------- CSAT
alter table app.ticket_mail add column csat boolean not null default false;

create table app.ticket_csat (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references app.tickets (id) on delete cascade,
  mail_id uuid not null unique references app.ticket_mail (id) on delete cascade,
  token_hash bytea not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  rating smallint check (rating between 1 and 5),
  comment text check (char_length(comment) between 1 and 2000),
  rated_at timestamptz,
  check ((rating is null) = (rated_at is null)),
  check (comment is null or rating is not null)
);
create index ticket_csat_ticket on app.ticket_csat (ticket_id);
create index ticket_csat_rated on app.ticket_csat (rated_at) where rated_at is not null;
alter table app.ticket_csat enable row level security;
revoke all on app.ticket_csat from public, anon, authenticated;

-- A rating, once given, is nobody's to change. A key not yet used may be minted again (the mail
-- was claimed again after a failed send). Deletes are the ticket's or the mail's cascade.
create function app.ticket_csat_fixed() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  if old.rated_at is not null
     and (new.ticket_id, new.mail_id, new.token_hash, new.rating, new.comment, new.rated_at)
         is distinct from (old.ticket_id, old.mail_id, old.token_hash, old.rating, old.comment, old.rated_at) then
    raise exception 'a rating cannot be changed';
  end if;
  if new.ticket_id is distinct from old.ticket_id or new.mail_id is distinct from old.mail_id then
    raise exception 'a rating belongs to its ticket';
  end if;
  return new;
end $fn$;
create trigger ticket_csat_fixed before update on app.ticket_csat
  for each row execute function app.ticket_csat_fixed();

-- a failed look-up: when, and nothing else
create table app.csat_misses (
  id bigint generated always as identity primary key,
  at timestamptz not null default now()
);
create index csat_misses_at on app.csat_misses (at);
alter table app.csat_misses enable row level security;
revoke all on app.csat_misses from public, anon, authenticated;

create function app.csat_limited() returns boolean
  language sql stable security definer set search_path = ''
as $fn$ select (select count(*) from app.csat_misses m where m.at > now() - interval '10 minutes') >= 200 $fn$;

create function app.csat_miss() returns void
  language sql volatile security definer set search_path = ''
as $fn$
  delete from app.csat_misses m where m.at < now() - interval '1 day';
  insert into app.csat_misses default values;
$fn$;

-- The rating page's first read: whether the key may still be used, and the case number.
create function public.csat_open(p_token text) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_number bigint;
begin
  if app.csat_limited() then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if coalesce(p_token, '') ~ '^[0-9a-f]{64}$' then
    select t.number into v_number
    from app.ticket_csat c join app.tickets t on t.id = c.ticket_id
    where c.token_hash = extensions.digest(p_token, 'sha256') and c.rated_at is null and c.expires_at > now();
  end if;
  if v_number is null then
    perform app.csat_miss();
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  return jsonb_build_object('ok', true, 'number', v_number);
end $fn$;

-- The rating, once. The input is checked before the key, so a bad input says nothing about it.
create function public.csat_submit(p_token text, p_rating int, p_comment text default null) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_ticket uuid;
begin
  if app.csat_limited() then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    return jsonb_build_object('ok', false, 'error', 'invalid_rating');
  end if;
  if char_length(v_comment) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'too_long');
  end if;
  if coalesce(p_token, '') ~ '^[0-9a-f]{64}$' then
    update app.ticket_csat c set rating = p_rating, comment = v_comment, rated_at = now()
    where c.token_hash = extensions.digest(p_token, 'sha256') and c.rated_at is null and c.expires_at > now()
    returning c.ticket_id into v_ticket;
  end if;
  if v_ticket is null then
    perform app.csat_miss();
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  -- the timeline says a rating came; the comment stays in the rating
  insert into app.ticket_events (ticket_id, kind, detail) values (v_ticket, 'csat', jsonb_build_object('rating', p_rating));
  return jsonb_build_object('ok', true);
end $fn$;

-- ---------------------------------------------------------------- mentions
create table app.ticket_mentions (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references app.tickets (id) on delete cascade,
  message_id uuid not null references app.ticket_messages (id) on delete cascade,
  admin_id uuid not null references app.platform_admins (user_id) on delete cascade,
  by_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  unique (message_id, admin_id)
);
create index ticket_mentions_admin on app.ticket_mentions (admin_id, created_at desc);
create index ticket_mentions_ticket on app.ticket_mentions (ticket_id);
create index ticket_mentions_by on app.ticket_mentions (by_id);
alter table app.ticket_mentions enable row level security;
revoke all on app.ticket_mentions from public, anon, authenticated;

-- how many of the caller's mentions are unseen
create function app.ticket_mentions_unseen() returns int
  language sql stable security definer set search_path = ''
as $fn$ select count(*)::int from app.ticket_mentions m where m.admin_id = auth.uid() and m.seen_at is null $fn$;

-- The admins a note names: `@` and the part of an address before its `@`, not preceded by a
-- character an address may hold (so a customer's kari@firma.no in a note names nobody). Only an
-- active admin who handles tickets, and never the note's own author.
create function app.ticket_mention(p_ticket uuid, p_message uuid, p_body text) returns int
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_n int;
begin
  insert into app.ticket_mentions (ticket_id, message_id, admin_id, by_id)
  select distinct p_ticket, p_message, a.user_id, auth.uid()
  from app.platform_admins a join auth.users u on u.id = a.user_id
  where a.active and a.role in ('super_admin', 'support') and a.user_id is distinct from auth.uid()
    and lower(split_part(u.email, '@', 1)) in (
      select lower(m[1]) from regexp_matches(coalesce(p_body, ''), '(?:^|[^A-Za-z0-9._%+-])@([A-Za-z0-9._%+-]*[A-Za-z0-9_%+-])', 'g') m)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $fn$;

create function public.admin_ticket_mentions(p_all boolean default false) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin', 'support']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('tickets.mentions', null, null, null, null, jsonb_build_object('all', coalesce(p_all, false)));
  return jsonb_build_object('ok', true,
    'mentions_unseen', app.ticket_mentions_unseen(),
    'rows', (select coalesce(jsonb_agg(r order by r.seen desc, r.created_at desc), '[]') from (
      select mt.id, mt.ticket_id, t.number, t.subject, t.status, mt.created_at, mt.seen_at, mt.seen_at is null as seen,
             msg.author_email as by_email, left(msg.body, 280) as excerpt
      from app.ticket_mentions mt
      join app.tickets t on t.id = mt.ticket_id
      join app.ticket_messages msg on msg.id = mt.message_id
      where mt.admin_id = auth.uid() and (coalesce(p_all, false) or mt.seen_at is null or mt.seen_at > now() - interval '14 days')
      order by mt.created_at desc
      limit 200) r));
end $fn$;

-- Marks the caller's own mentions seen: one ticket's, or all of them.
create function public.admin_ticket_mentions_seen(p_ticket uuid default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_n int;
begin
  if not app.is_platform_admin(array['super_admin', 'support']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  update app.ticket_mentions m set seen_at = now()
  where m.admin_id = auth.uid() and m.seen_at is null and (p_ticket is null or m.ticket_id = p_ticket);
  get diagnostics v_n = row_count;
  perform app.admin_log('ticket.mentions_seen', null, 'ticket', p_ticket::text, null, jsonb_build_object('n', v_n));
  return jsonb_build_object('ok', true, 'n', v_n);
end $fn$;

-- ---------------------------------------------------------------- canned replies
alter table app.canned_replies
  add constraint canned_replies_title_len check (char_length(btrim(title)) between 1 and 120),
  add constraint canned_replies_body_len check (char_length(btrim(body)) between 1 and 10000);

create function public.admin_canned_replies() returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin', 'support']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('tickets.canned');
  return jsonb_build_object('ok', true,
    'mentions_unseen', app.ticket_mentions_unseen(),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'key', c.key, 'title', c.title, 'body', c.body,
        'sort', c.sort, 'active', c.active) order by c.active desc, c.sort, c.title), '[]')
      from app.canned_replies c where c.product_id = 'orgpuls'));
end $fn$;

-- Creates (p_id null) or edits one. A new one's key is made here; it is only the reply box's handle.
create function public.admin_canned_reply_save(p_id uuid, p_title text, p_body text, p_sort int default 0) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
begin
  if not app.is_platform_admin(array['super_admin', 'support']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(v_title) not between 1 and 120 or char_length(v_body) not between 1 and 10000
     or coalesce(p_sort, 0) not between 0 and 999 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if p_id is null then
    insert into app.canned_replies (key, title, body, sort)
    values ('c_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), v_title, v_body, coalesce(p_sort, 0))
    returning id into v_id;
    perform app.admin_log('ticket.canned_create', null, 'canned_reply', v_id::text, null, jsonb_build_object('title', v_title));
  else
    update app.canned_replies c set title = v_title, body = v_body, sort = coalesce(p_sort, 0)
    where c.id = p_id returning c.id into v_id;
    if v_id is null then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    perform app.admin_log('ticket.canned_update', null, 'canned_reply', v_id::text, null, jsonb_build_object('title', v_title));
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $fn$;

-- Archives (p_active false) or restores one. An archived reply is not offered in the reply box.
create function public.admin_canned_reply_active(p_id uuid, p_active boolean) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_id uuid;
begin
  if not app.is_platform_admin(array['super_admin', 'support']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_active is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  update app.canned_replies c set active = p_active where c.id = p_id returning c.id into v_id;
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform app.admin_log(case when p_active then 'ticket.canned_restore' else 'ticket.canned_archive' end, null, 'canned_reply', v_id::text);
  return jsonb_build_object('ok', true);
end $fn$;

-- ---------------------------------------------------------------- reporting
-- Over the tickets created in the last p_weeks weeks (Monday to Monday, Oslo). A share or a median
-- is null where there is nothing to count; the page says so rather than print a nought.
--   first reply met:  replied by its deadline; missed: replied after it, or still unanswered past it.
--     A ticket closed without a reply is not counted (spam, a duplicate).
--   resolution met:   resolved or closed by its deadline; missed: after it, or still open past it.
--   medians:          calendar hours from creation to the first reply, and to resolution.
--   ratings:          given in the window; `sent` is the rating links whose mail was sent in it.
create function public.admin_ticket_report(p_weeks int default 12) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_start timestamptz;
  v_this date := date_trunc('week', now() at time zone 'Europe/Oslo')::date;
begin
  if not app.is_platform_admin(array['super_admin', 'support']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_weeks is null or p_weeks not in (4, 12, 26, 52) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  v_start := ((v_this - (p_weeks - 1) * 7)::timestamp) at time zone 'Europe/Oslo';
  perform app.admin_log('tickets.report', null, null, null, null, jsonb_build_object('weeks', p_weeks));
  return (
    with t as (
      select x.*, coalesce(x.resolved_at, x.closed_at) as done_at, x.status in ('resolved', 'closed') as finished
      from app.tickets x where x.created_at >= v_start
    ), c as (
      select c.* from app.ticket_csat c where c.rated_at >= v_start
    )
    select jsonb_build_object('ok', true,
      'weeks', p_weeks,
      'since', v_start,
      'mentions_unseen', app.ticket_mentions_unseen(),
      'total', (select count(*) from t),
      'weekly', (select coalesce(jsonb_agg(jsonb_build_object('week', w.d, 'n',
          (select count(*) from t where (t.created_at at time zone 'Europe/Oslo')::date >= w.d
                                     and (t.created_at at time zone 'Europe/Oslo')::date < w.d + 7)) order by w.d), '[]')
        from (select (v_this - g * 7) as d from generate_series(0, p_weeks - 1) g) w),
      'by_queue', (select coalesce(jsonb_object_agg(q.queue, q.n), '{}') from (
          select t.queue::text as queue, count(*) as n from t group by t.queue) q),
      'by_type', (select coalesce(jsonb_object_agg(q.type, q.n), '{}') from (
          select t.type::text as type, count(*) as n from t group by t.type) q),
      'first_reply', (select jsonb_build_object(
          'met', count(*) filter (where t.first_responded_at is not null and t.first_responded_at <= t.first_response_due),
          'missed', count(*) filter (where (t.first_responded_at is not null and t.first_responded_at > t.first_response_due)
                                        or (t.first_responded_at is null and not t.finished and t.first_response_due < now())),
          'pending', count(*) filter (where t.first_responded_at is null and not t.finished and t.first_response_due >= now()),
          'median_hours', round((percentile_cont(0.5) within group (order by extract(epoch from t.first_responded_at - t.created_at) / 3600)
                                  filter (where t.first_responded_at is not null))::numeric, 1))
        from t),
      'resolution', (select jsonb_build_object(
          'met', count(*) filter (where t.finished and t.done_at <= t.resolve_due),
          'missed', count(*) filter (where (t.finished and t.done_at > t.resolve_due) or (not t.finished and t.resolve_due < now())),
          'pending', count(*) filter (where not t.finished and t.resolve_due >= now()),
          'median_hours', round((percentile_cont(0.5) within group (order by extract(epoch from t.done_at - t.created_at) / 3600)
                                  filter (where t.finished and t.done_at is not null))::numeric, 1))
        from t),
      'csat', jsonb_build_object(
          'rated', (select count(*) from c),
          'average', (select round(avg(c.rating)::numeric, 2) from c),
          'dist', (select coalesce(jsonb_object_agg(d.rating, d.n), '{}') from (
              select c.rating::text as rating, count(*) as n from c group by c.rating) d),
          'sent', (select count(*) from app.ticket_csat s join app.ticket_mail m on m.id = s.mail_id
                   where m.status = 'sent' and m.sent_at >= v_start))
    ));
end $fn$;

-- ---------------------------------------------------------------- 0051's readers and writers, extended
-- The queue, as 0051, with the caller's unseen mentions for the tabs' badge.
create or replace function public.admin_tickets(p_queue text default null, p_view text default 'open', p_search text default null)
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
    'mentions_unseen', app.ticket_mentions_unseen(),
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

-- One ticket, as 0051, with its ratings, who each note mentioned, and the canned replies' ids.
-- Opening it marks the caller's mentions on it seen.
create or replace function public.admin_ticket(p_id uuid) returns jsonb
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
  update app.ticket_mentions m set seen_at = now() where m.ticket_id = p_id and m.admin_id = auth.uid() and m.seen_at is null;
  return jsonb_build_object('ok', true,
    'ticket', to_jsonb(v_t) || jsonb_build_object(
      'org_name', (select o.name from app.organizations o where o.id = v_t.org_id),
      'assignee_email', (select u.email from auth.users u where u.id = v_t.assignee_id),
      'problem_number', (select p.number from app.tickets p where p.id = v_t.problem_id)),
    'messages', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'author_kind', m.author_kind, 'author_email', m.author_email,
        'body', m.body, 'internal', m.internal, 'created_at', m.created_at,
        'mail', (select tm.status from app.ticket_mail tm where tm.message_id = m.id),
        'csat', coalesce((select tm.csat from app.ticket_mail tm where tm.message_id = m.id), false),
        'mentions', (select coalesce(jsonb_agg(u.email order by u.email), '[]') from app.ticket_mentions mt
                     join auth.users u on u.id = mt.admin_id where mt.message_id = m.id)) order by m.created_at), '[]')
      from app.ticket_messages m where m.ticket_id = p_id),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'kind', e.kind, 'actor_email', e.actor_email, 'detail', e.detail)
        order by e.at, e.id), '[]') from app.ticket_events e where e.ticket_id = p_id),
    'csat', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'created_at', c.created_at, 'expires_at', c.expires_at,
        'rating', c.rating, 'comment', c.comment, 'rated_at', c.rated_at) order by c.created_at), '[]')
      from app.ticket_csat c where c.ticket_id = p_id),
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
    'canned', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'key', c.key, 'title', c.title, 'body', c.body) order by c.sort, c.title), '[]')
      from app.canned_replies c where c.active),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'number', h.number, 'subject', h.subject, 'status', h.status,
        'created_at', h.created_at) order by h.created_at desc), '[]')
      from app.tickets h where h.id <> p_id and ((v_t.org_id is not null and h.org_id = v_t.org_id)
        or lower(h.requester_email) = lower(v_t.requester_email))));
end $fn$;

-- A reply or a note, as 0051. A reply that resolves the ticket is queued to carry a rating link;
-- a note records the admins it mentions.
create or replace function public.admin_ticket_reply(p_id uuid, p_body text, p_internal boolean, p_status text default null)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_t app.tickets;
  v_body text := btrim(coalesce(p_body, ''));
  v_msg uuid;
  v_mentions int := 0;
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
    insert into app.ticket_mail (message_id, to_email, to_name, csat)
    values (v_msg, v_t.requester_email, v_t.requester_name, p_status is not distinct from 'resolved');
    update app.tickets set first_responded_at = coalesce(first_responded_at, now()),
                           status = coalesce(p_status, 'waiting_customer')::app.ticket_status
    where id = p_id;
  else
    v_mentions := app.ticket_mention(p_id, v_msg, v_body);
    if p_status is not null then
      update app.tickets set status = p_status::app.ticket_status where id = p_id;
    elsif v_t.status = 'new' then
      update app.tickets set status = 'open' where id = p_id;
    end if;
  end if;
  perform app.ticket_event(p_id, case when coalesce(p_internal, false) then 'note' else 'reply' end,
                           jsonb_strip_nulls(jsonb_build_object('status', p_status, 'mentions', nullif(v_mentions, 0))));
  perform app.admin_log(case when coalesce(p_internal, false) then 'ticket.note' else 'ticket.reply' end, v_t.org_id, 'ticket', p_id::text);
  return jsonb_build_object('ok', true);
end $fn$;

-- The dispatcher's claim, as 0051. A reply queued with `csat` gets a rating key minted here: the
-- plaintext goes to the dispatcher in this answer, the database keeps its SHA-256. Claimed again
-- after a failed send, it gets a new key and the old one stops working — unless it was used.
create or replace function public.ticket_mail_claim(p_batch int default 20) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v jsonb;
  v_ids uuid[];
  v_keys jsonb := '{}';
  v_key text;
  r record;
begin
  with c as (
    select tm.id from app.ticket_mail tm
    where (tm.status = 'pending' or (tm.status = 'sending' and tm.leased_until < now())) and tm.attempts < 5
    order by tm.created_at limit least(greatest(coalesce(p_batch, 20), 1), 50)
    for update skip locked
  ), u as (
    update app.ticket_mail tm set status = 'sending', leased_until = now() + interval '2 minutes', attempts = tm.attempts + 1
    from c where tm.id = c.id returning tm.id
  )
  select coalesce(array_agg(u.id), '{}') into v_ids from u;

  for r in select tm.id, m.ticket_id from app.ticket_mail tm join app.ticket_messages m on m.id = tm.message_id
           where tm.id = any (v_ids) and tm.csat loop
    v_key := encode(extensions.gen_random_bytes(32), 'hex');
    insert into app.ticket_csat (ticket_id, mail_id, token_hash, expires_at)
    values (r.ticket_id, r.id, extensions.digest(v_key, 'sha256'), now() + interval '30 days')
    on conflict (mail_id) do update set token_hash = excluded.token_hash, created_at = now(), expires_at = excluded.expires_at
      where app.ticket_csat.rated_at is null;
    if found then
      v_keys := v_keys || jsonb_build_object(r.id::text, v_key);
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('id', tm.id, 'to_email', tm.to_email, 'to_name', tm.to_name,
    'subject', format('Re: %s [#%s]', t.subject, t.number), 'number', t.number, 'body', m.body,
    'csat_key', v_keys ->> tm.id::text)), '[]') into v
  from app.ticket_mail tm join app.ticket_messages m on m.id = tm.message_id join app.tickets t on t.id = m.ticket_id
  where tm.id = any (v_ids);
  return v;
end $fn$;

-- ---------------------------------------------------------------- the rating page's address
-- /vurdering is the site's now, so no CMS page may take it (as 0124, with it added).
create or replace function app.cms_reserved(p_kind text, p_slug text) returns boolean
  language sql immutable set search_path = ''
as $fn$
  select case p_kind
    when 'page' then p_slug = any (array[
      -- app/(marketing)
      'artikler', 'avmeld', 'bli-med', 'bransjer', 'bruksomrader', 'demo', 'hvorfor', 'kontakt', 'logg-inn', 'lovkrav', 'nyhetsbrev',
      'nytt-passord', 'personvernerklaering', 'plattform', 'priser', 'registrer', 'sikkerhet', 'smaa-bedrifter', 'verneombud',
      'vurdering',
      -- the industries (content/industries)
      'bygg-og-anlegg', 'helse-og-omsorg', 'barnehage-og-skole', 'kunnskap-og-kontor', 'handel',
      -- app/(app), the admin, and the app's other roots
      'forhandsvis', 'hjelp', 'innsikt', 'integrasjoner', 'kommentarer', 'maleoppsett', 'malinger', 'oppsett', 'rapport', 'resultater', 'tiltak',
      'admin', 'api', 'auth', 'inn', 'logo', 'media', 'primitives', 'r', 's', 'sitemap', 'robots',
      -- addresses next.config.ts redirects
      'resultat', 'samtaler', 'arshjulet', 'om-oss'])
    when 'article' then p_slug = any (array[
      'nye-regler-psykososialt-arbeidsmiljo-2026', 'krav-til-kartlegging-av-psykososialt-arbeidsmiljo', 'medarbeiderundersokelse-sporsmal',
      'hvor-ofte-bor-dere-male-arbeidsmiljoet', 'anonym-medarbeiderundersokelse', 'verneombudets-rolle-i-kartleggingen'])
    else true
  end
$fn$;

-- ---------------------------------------------------------------- grants
revoke all on function app.csat_limited() from public, anon, authenticated;
revoke all on function app.csat_miss() from public, anon, authenticated;
revoke all on function app.ticket_mentions_unseen() from public, anon, authenticated;
revoke all on function app.ticket_mention(uuid, uuid, text) from public, anon, authenticated;
revoke all on function app.ticket_csat_fixed() from public, anon, authenticated;
revoke all on function public.csat_open(text) from public;
revoke all on function public.csat_submit(text, int, text) from public;
grant execute on function public.csat_open(text) to anon, authenticated;
grant execute on function public.csat_submit(text, int, text) to anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'public.admin_ticket_mentions(boolean)', 'public.admin_ticket_mentions_seen(uuid)', 'public.admin_canned_replies()',
    'public.admin_canned_reply_save(uuid,text,text,int)', 'public.admin_canned_reply_active(uuid,boolean)',
    'public.admin_ticket_report(int)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
