-- 0209 · A copy of every lead by e-mail, as a backstop (D-242)
--
-- Tor, 2026-10-07: «kontakt oss og alle lead også går med cc til … for sikkerhet». The platform remains
-- where leads are worked; this is a copy in a mailbox, so that a lead survives a platform that is down,
-- misconfigured or does not yet know a kind (template.requested, X-107/D-241).
--
-- The dispatcher sends the copies through Brevo, to the address in its secret ORGPULS_LEAD_COPY_TO, kept
-- out of the repository. A copy is sent once per event, whatever happens to the platform delivery:
--
--   lead_copies_claim     the lead events not yet copied (a contact message, a demo request, a template
--                         request), marked as copied in the same statement, so two runs never send one twice
--   lead_copies_release   gives back the ones Brevo refused, to be tried in the next run
--
-- Only events from the last seven days are copied: the first run after this migration copies the week's
-- leads, not the history.

alter table app.platform_events add column copied_at timestamptz;
comment on column app.platform_events.copied_at is
  'When the e-mail copy of a lead event was sent (0209, D-242); null for other kinds, and for a lead not yet copied.';

create function public.lead_copies_claim(p_batch int default 20) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare v_rows jsonb;
begin
  with picked as (
    select e.id from app.platform_events e
    where e.copied_at is null
      and e.kind in ('contact.submitted', 'demo.requested', 'template.requested')
      and e.created_at > now() - interval '7 days'
    order by e.id
    limit greatest(1, least(coalesce(p_batch, 20), 100))
    for update skip locked)
  , marked as (
    update app.platform_events e set copied_at = now()
    from picked where e.id = picked.id
    returning e.id, e.kind, e.payload, e.created_at)
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'payload', m.payload, 'created_at', m.created_at) order by m.id), '[]'::jsonb)
  into v_rows from marked m;
  return v_rows;
end $fn$;

create function public.lead_copies_release(p_ids bigint[]) returns void
  language sql volatile security definer set search_path = ''
as $fn$
  update app.platform_events e set copied_at = null where e.id = any (p_ids);
$fn$;

revoke all on function public.lead_copies_claim(int) from public, anon, authenticated;
revoke all on function public.lead_copies_release(bigint[]) from public, anon, authenticated;
grant execute on function public.lead_copies_claim(int) to service_role;
grant execute on function public.lead_copies_release(bigint[]) to service_role;
