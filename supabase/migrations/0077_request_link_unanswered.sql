-- 0077_request_link_unanswered.sql — the QR page's function no longer reads who has answered
-- (D-126, engagement invariant I7).
--
-- 0076's public.request_link queued a link only for an invitation with no answer. The reply
-- was the same either way, so nothing reached the caller; but it made a function anyone may
-- call select people by whether they have answered, which I7 keeps to the system ("reminders
-- are system-sent"). The filter moves to where it already is for every reminder: the
-- dispatcher's claim drops a message for an invitation that has been answered or has expired.
-- What a person receives is unchanged; what the public function touches is less.

/*
 * A person asks for their link. p_contact is an e-mail address or an E.164 number (the page
 * normalises what was typed). For every open round of the organisation where that address
 * or number is on an unexpired invitation, a 'lenke' message is queued on the channel they
 * typed. Whether they have answered is not this function's to know: the dispatcher's claim,
 * which only the system runs, drops the message then ('answered_or_expired'), as it does for
 * a reminder. The answer is {"ok": true} whatever happened — a match, no match, too soon
 * again — so the page reveals nothing about anyone.
 *
 * Limits: one message per person per round per ten minutes (the outbox row is re-armed, not
 * duplicated), and per organisation no more link messages in an hour than twice its active
 * employees, at least 20. SMS is billed; these keep a stranger with a list of numbers from
 * running up the bill.
 */
create or replace function public.request_link(p_code text, p_contact text) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_org     uuid;
  v_mail    boolean;
  v_sms     boolean;
  v_contact text := lower(btrim(coalesce(p_contact, '')));
  v_phone   boolean;
  v_cap     int;
  v_recent  int;
begin
  select c.org_id, o.mail_enabled, o.mail_enabled and o.sms_enabled into v_org, v_mail, v_sms
  from app.entry_codes c join app.organizations o on o.id = c.org_id
  where c.code = lower(btrim(coalesce(p_code, '')));
  if v_org is null then
    return jsonb_build_object('error', 'unknown');
  end if;

  v_phone := v_contact ~ '^\+[1-9][0-9]{7,14}$';
  if not v_phone and not (v_contact ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(v_contact) <= 254) then
    return jsonb_build_object('error', 'invalid');
  end if;
  if (v_phone and not v_sms) or (not v_phone and not v_mail) then
    return jsonb_build_object('ok', true);
  end if;

  select greatest(20, 2 * count(*)) into v_cap from app.employees e where e.org_id = v_org and e.active;
  select count(*) into v_recent from app.outbox o
  where o.org_id = v_org and o.kind = 'lenke' and o.due_at > now() - interval '1 hour';
  if v_recent >= v_cap then
    return jsonb_build_object('ok', true);
  end if;

  insert into app.outbox as ob (org_id, round_id, kind, employee_id, invitation_id, due_at, channel)
  select r.org_id, r.id, 'lenke', i.employee_id, i.id, now(), case when v_phone then 'sms' else 'email' end
  from app.rounds r
  join app.invitations i on i.round_id = r.id
  join app.employees e on e.id = i.employee_id
  where r.org_id = v_org and r.status = 'apen'
    and (r.closes_at is null or r.closes_at > now())
    and i.expires_at > now()
    and e.active
    and case when v_phone then e.phone = v_contact else lower(btrim(e.email)) = v_contact end
  on conflict (round_id, kind, employee_id) where employee_id is not null do update
    set due_at = now(), sent_at = null, failed_at = null, claimed_at = null, attempts = 0,
        last_error = null, provider_id = null, channel = excluded.channel, invitation_id = excluded.invitation_id
    where (ob.sent_at is not null and ob.sent_at < now() - interval '10 minutes')
       or (ob.failed_at is not null and ob.failed_at < now() - interval '10 minutes');

  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.request_link(text, text) from public;
grant execute on function public.request_link(text, text) to anon, authenticated;
