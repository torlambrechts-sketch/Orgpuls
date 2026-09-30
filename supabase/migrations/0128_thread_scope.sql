-- 0128 — Replying to and closing a conversation take the same scope as reading it (D-82)
--
-- `reply_to_thread` and `set_thread` (0018) let any daglig leder or avdelingsleder of the
-- organisation write to any of its threads, while `conversations` shows an avdelingsleder only the
-- threads of their own groups, and nobody a thread whose group is under the threshold. A thread
-- id from elsewhere — a shared link, an old page — was enough to answer in a group the leader may
-- not read, or to close it. Both now ask `app.thread_visible` (0046), as `request_contact` does.
-- The answers are unchanged: `not_found` for no such thread, `denied` for one that is not yours.

create or replace function public.reply_to_thread(p_thread uuid, p_body text)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if p_body is null or btrim(p_body) = '' or length(p_body) > 4000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_body');
  end if;
  if not exists (select 1 from app.comment_threads ct where ct.id = p_thread) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  -- the leaders who may read the thread, in scope for its group, and the group cleared k
  if not app.thread_visible(p_thread) then
    return jsonb_build_object('ok', false, 'error', 'denied');
  end if;

  insert into app.thread_messages (thread_id, author, body, sent_hour)
  values (p_thread, 'leder', btrim(p_body), date_trunc('hour', now()));

  update app.comment_threads set state = 'dialog'
  where id = p_thread and state = 'venter';

  return jsonb_build_object('ok', true);
end $fn$;

create or replace function public.set_thread(p_thread uuid, p_state text default null,
                                             p_flagged boolean default null)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not exists (select 1 from app.comment_threads ct where ct.id = p_thread) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if not app.thread_visible(p_thread) then
    return jsonb_build_object('ok', false, 'error', 'denied');
  end if;
  if p_state is not null and p_state not in ('venter', 'dialog', 'lukket') then
    return jsonb_build_object('ok', false, 'error', 'invalid_state');
  end if;

  update app.comment_threads
  set state = coalesce(p_state::app.thread_state, state),
      flagged_varsel = coalesce(p_flagged, flagged_varsel)
  where id = p_thread;

  return jsonb_build_object('ok', true);
end $fn$;
