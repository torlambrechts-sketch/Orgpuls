-- 0065_cancellation_oslo_days.sql — the deletion date counted in Oslo's calendar (D-108).
--
-- 0064 set deletion_due_at to the end plus interval '30 days', which PostgreSQL adds in the
-- session's time zone. Sessions run in UTC, so across the end of summer time the deletion
-- fell at 23:00 the day before in Oslo: still within 30 days, but shown as the 30th day
-- instead of the 31st. Both dates are now midnights in Oslo: the agreement ends the midnight
-- after its last day, and deletion is due thirty Oslo days later. The constraint no longer
-- does interval arithmetic, whose answer depended on the session.

alter table app.billing drop constraint billing_cancel_whole;
alter table app.billing add constraint billing_cancel_whole check (
  (cancelled_at is null and cancel_effective_at is null and deletion_due_at is null)
  or (cancelled_at is not null and cancel_effective_at is not null and deletion_due_at is not null
      and deletion_due_at > cancel_effective_at and deletion_due_at <= cancel_effective_at + interval '31 days'));

create or replace function public.admin_cancel_org(p_org uuid, p_ends date, p_reason text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_today date := (now() at time zone 'Europe/Oslo')::date;
  v_end timestamptz;
  v_due timestamptz;
begin
  if not app.is_platform_admin(array['super_admin', 'support', 'finance']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  if p_ends is null or p_ends < v_today or p_ends > v_today + 366 then
    return jsonb_build_object('ok', false, 'error', 'invalid_date');
  end if;
  if not exists (select 1 from app.billing b where b.org_id = p_org) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if exists (select 1 from app.billing b where b.org_id = p_org and b.cancelled_at is not null) then
    return jsonb_build_object('ok', false, 'error', 'already_cancelled');
  end if;
  v_end := ((p_ends + 1)::timestamp at time zone 'Europe/Oslo');
  v_due := ((p_ends + 31)::timestamp at time zone 'Europe/Oslo');
  update app.billing set cancelled_at = now(), cancelled_by = auth.uid(), cancel_effective_at = v_end,
                         deletion_due_at = v_due, updated_at = now()
  where org_id = p_org;
  perform app.admin_log('org.cancel', p_org, 'billing', p_org::text, left(btrim(p_reason), 500),
    jsonb_build_object('ends', p_ends, 'deletion_due', v_due));
  perform app.lifecycle_plan();
  return jsonb_build_object('ok', true, 'effective_at', v_end, 'deletion_due_at', v_due);
end $fn$;
