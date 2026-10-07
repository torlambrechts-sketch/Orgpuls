-- 0210 · When a leader was last on Innsikt (D-244)
--
-- Innsikt's Enkel view opens «Siden sist» with «Du var sist inne 26. september»: the day of the visit
-- before this one. Nothing recorded it. Two dates on the membership do, in the organisation's own zone:
--
--   seen_on           the day of the latest visit to Innsikt
--   previous_seen_on  the day of the visit before that one, which is what the screen prints
--
-- They are written only by `innsikt_visit(org)`, for the caller's own active membership, and only once a
-- day: a second visit the same day returns the same earlier day, so reloading the page does not turn
-- «sist inne» into today. Dates, not instants – the screen names a day, and a day is all that is kept.
--
-- This is about the leaders who use the product, never about anyone who answers a survey.

alter table app.memberships
  add column seen_on date,
  add column previous_seen_on date;
comment on column app.memberships.seen_on is
  'The day (Europe/Oslo) of the member''s latest visit to Innsikt (0210, D-244); written only by innsikt_visit.';
comment on column app.memberships.previous_seen_on is
  'The day of the visit before seen_on: Innsikt''s «Du var sist inne» (0210, D-244).';

create function public.innsikt_visit(p_org uuid) returns date
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_today date := (now() at time zone 'Europe/Oslo')::date;
  v_id    uuid;
  v_seen  date;
  v_prev  date;
begin
  select m.id, m.seen_on, m.previous_seen_on into v_id, v_seen, v_prev
    from app.memberships m
    where m.org_id = p_org and m.user_id = auth.uid() and m.active
    for update;
  if v_id is null then
    return null;
  end if;
  if v_seen is not null and v_seen >= v_today then
    return v_prev;
  end if;
  update app.memberships set previous_seen_on = v_seen, seen_on = v_today where id = v_id;
  return v_seen;
end $fn$;

revoke all on function public.innsikt_visit(uuid) from public, anon;
grant execute on function public.innsikt_visit(uuid) to authenticated;
