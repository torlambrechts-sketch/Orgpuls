-- 0046_contact_request.sql — a leader can ask to talk directly; only the employee can say yes.
--
-- A conversation stays anonymous by construction: `app.comment_threads` reaches a response
-- and stops, and a response carries no person (0018). Sometimes both sides want more than
-- that — "kan jeg ta med akkurat dette tilfellet?" — "Ja, gjerne." — and the next step is a
-- conversation with names.
--
-- The product cannot make that step, and must not be able to: it does not know who wrote
-- the comment. So the step is the employee's own:
--   1. A leader who can read the thread asks for direct contact (`request_contact`).
--   2. The employee's private thread page (`thread_by_key`, reached only with the key they
--      hold) shows the request, with the leader's name and work e-mail.
--   3. If they want to, they write to that address from their own mail program. Sending
--      it is what tells the leader who they are. Not sending it tells nobody anything.
--
-- Nothing about the employee enters the database at any step. The new table references the
-- thread and the leader who asked, never a person on the respondent's side, and has RLS
-- on with no policy and no grant, like every table the conversation lives in.
--
-- The gate is the read's own: a leader may ask on a thread only if `conversations` would
-- show it to them — the same role, the same department scope, the same k (0022).
-- `app.thread_visible` states that predicate once.

create table app.contact_requests (
  thread_id      uuid primary key references app.comment_threads (id) on delete cascade,
  -- the leader who asked; their name and address are what the employee is shown
  requested_by   uuid not null references app.profiles (id) on delete cascade,
  -- to the hour, as every time on a conversation is
  requested_hour timestamptz not null check (requested_hour = date_trunc('hour', requested_hour))
);

create index contact_requests_requested_by_idx on app.contact_requests (requested_by);

alter table app.contact_requests enable row level security;
revoke all on app.contact_requests from public, anon, authenticated;

comment on table app.contact_requests is
  'A leader''s request to talk directly with the author of a comment. Holds the thread and '
  'the leader, never the author. Read only through thread_by_key and conversations.';

-- ---------------------------------------------------------------- thread_visible
-- Whether the caller may read this thread in `conversations` (0022): a daglig leder or
-- avdelingsleder of its organisation, in scope for its group, and the group cleared k.
create function app.thread_visible(p_thread uuid) returns boolean
  language sql stable security definer set search_path = ''
as $fn$
  select exists (
    select 1
    from app.comment_threads ct
    join app.responses r on r.id = ct.response_id
    where ct.id = p_thread
      and exists (
        select 1 from app.memberships m
        where m.user_id = auth.uid() and m.active and m.org_id = ct.org_id
          and m.role in ('daglig_leder', 'avdelingsleder')
      )
      and (
        exists (
          select 1 from app.memberships m
          where m.user_id = auth.uid() and m.active and m.org_id = ct.org_id
            and m.role = 'daglig_leder'
        )
        or r.group_id in (select vg.group_id from app.visible_groups(ct.org_id) vg)
      )
      and (
        select count(*) from app.responses r2
        where r2.round_id = r.round_id and r2.group_id is not distinct from r.group_id
      ) >= app.k_threshold(ct.org_id)
  )
$fn$;

revoke all on function app.thread_visible(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- request_contact
create function public.request_contact(p_thread uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare v_state app.thread_state;
begin
  -- one answer for "no such thread" and "not yours to see", as conversations gives
  if p_thread is null or not app.thread_visible(p_thread) then
    return jsonb_build_object('ok', false, 'error', 'not_available');
  end if;

  select ct.state into v_state from app.comment_threads ct where ct.id = p_thread;
  if v_state = 'lukket' then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;

  -- the employee is shown an address to write to; without one there is nothing to offer
  if not exists (select 1 from auth.users u where u.id = auth.uid() and u.email is not null) then
    return jsonb_build_object('ok', false, 'error', 'no_email');
  end if;

  insert into app.contact_requests (thread_id, requested_by, requested_hour)
  values (p_thread, auth.uid(), date_trunc('hour', now()))
  on conflict (thread_id) do update
    set requested_by = excluded.requested_by, requested_hour = excluded.requested_hour;

  return jsonb_build_object('ok', true);
end $fn$;

revoke all on function public.request_contact(uuid) from public, anon;
grant execute on function public.request_contact(uuid) to authenticated;

-- ---------------------------------------------------------------- withdraw_contact
-- The leader who asked, or a daglig leder, can take the request back.
create function public.withdraw_contact(p_thread uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if p_thread is null or not app.thread_visible(p_thread) then
    return jsonb_build_object('ok', false, 'error', 'not_available');
  end if;

  delete from app.contact_requests cr
  where cr.thread_id = p_thread
    and (cr.requested_by = auth.uid()
         or exists (
           select 1 from app.comment_threads ct
           join app.memberships m on m.org_id = ct.org_id
           where ct.id = p_thread and m.user_id = auth.uid() and m.active and m.role = 'daglig_leder'
         ));

  return jsonb_build_object('ok', true);
end $fn$;

revoke all on function public.withdraw_contact(uuid) from public, anon;
grant execute on function public.withdraw_contact(uuid) to authenticated;

-- ---------------------------------------------------------------- thread_by_key
-- As 0018, plus `contact`: the name and work address of the leader who asked, while that
-- leader still holds a leader role in the organisation. Only the key's holder reads this.
create or replace function public.thread_by_key(p_key text)
  returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare v_id uuid; v_out jsonb;
begin
  if p_key is null or length(p_key) < 32 then
    return jsonb_build_object('error', 'invalid_key');
  end if;

  select ct.id into v_id
  from app.comment_threads ct
  where ct.key_hash = extensions.digest(p_key, 'sha256');

  -- one answer for "no such key" and "wrong key", so this cannot be used to probe
  if not found then
    return jsonb_build_object('error', 'invalid_key');
  end if;

  select jsonb_build_object(
    'state', ct.state,
    'factor_key', ct.factor_key,
    'opening', rc.body,
    'messages', (select coalesce(jsonb_agg(jsonb_build_object(
                    'author', tm.author, 'body', tm.body, 'sent_hour', tm.sent_hour)
                  order by tm.sent_hour), '[]'::jsonb)
                 from app.thread_messages tm where tm.thread_id = ct.id),
    'contact', (select jsonb_build_object('name', p.full_name, 'email', u.email)
                from app.contact_requests cr
                join app.profiles p on p.id = cr.requested_by
                join auth.users u on u.id = cr.requested_by
                where cr.thread_id = ct.id and u.email is not null
                  and exists (
                    select 1 from app.memberships m
                    where m.user_id = cr.requested_by and m.org_id = ct.org_id and m.active
                      and m.role in ('daglig_leder', 'avdelingsleder')
                  )))
  into v_out
  from app.comment_threads ct
  join app.response_comments rc
    on rc.response_id = ct.response_id and rc.factor_key = ct.factor_key
   and rc.ordinal = ct.ordinal
  where ct.id = v_id;

  return v_out;
end $fn$;

-- ---------------------------------------------------------------- conversations
-- As 0022, plus `contact` per thread: who asked for direct contact, and whether it was you.
create or replace function public.conversations(p_round uuid default null) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_org uuid;
  v_k   int;
  v_whole boolean;
  v_out jsonb;
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

  select exists (
    select 1 from app.memberships m
    where m.user_id = auth.uid() and m.active and m.org_id = v_org
      and m.role = 'daglig_leder'
  ) into v_whole;

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
      (select a.value from app.answers a
        where a.response_id = ct.response_id
          and a.factor_key = ct.factor_key and a.ordinal = ct.ordinal) as answer_value,
      rc.body as opening,
      (select coalesce(jsonb_agg(jsonb_build_object(
                 'author', tm.author, 'body', tm.body, 'sent_hour', tm.sent_hour)
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
end $fn$;
