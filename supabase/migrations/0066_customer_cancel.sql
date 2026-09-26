-- 0066_customer_cancel.sql — the daglig leder cancels in Oppsett › Betaling (D-110).
--
-- 0064 let support register a cancellation the customer sent. The customer can now do it
-- themselves, and undo it, on the same rules:
--
--   * **When it ends.** A confirmed subscription runs to the end of the current month (the
--     monthly agreement the site promises, and the terms draft § 10). A trial, a grace
--     period or a read-only organisation has nothing to pay for, so it ends today. The
--     agreement ends at midnight after the last day in Oslo, and deletion is due thirty
--     Oslo days later, as 0065 counts it.
--   * **A deliberate act.** The call must carry an explicit confirmation; the screen asks for
--     it beside both dates.
--   * **Why**, as one of five fixed answers — never free text, which could name a person.
--   * **Undo**, by the daglig leder, until the deletion is carried out, whoever registered it.
--
-- billing gains who cancelled (admin or customer) and the answer. A trigger clears both when
-- a cancellation is withdrawn, by either path, so a withdrawn cancellation leaves nothing.

alter table app.billing
  add column cancel_source text check (cancel_source in ('admin', 'customer')),
  add column cancel_reason text check (cancel_reason in ('price', 'not_needed', 'missing', 'switching', 'other'));

create function app.billing_cancel_clear() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  if new.cancelled_at is null then
    new.cancel_source := null;
    new.cancel_reason := null;
  elsif new.cancel_source is null then
    new.cancel_source := 'admin';
  end if;
  return new;
end $fn$;

create trigger billing_cancel_clear before insert or update on app.billing
  for each row execute function app.billing_cancel_clear();

-- ---------------------------------------------------------------- cancelling
create function public.cancel_subscription(p_org uuid, p_reason text, p_confirm boolean) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  b app.billing;
  v_today date := (now() at time zone 'Europe/Oslo')::date;
  v_last date;
begin
  if p_org is null or not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_confirm is not true then
    return jsonb_build_object('ok', false, 'error', 'confirm_required');
  end if;
  if p_reason is not null and p_reason not in ('price', 'not_needed', 'missing', 'switching', 'other') then
    return jsonb_build_object('ok', false, 'error', 'invalid_reason');
  end if;
  select * into b from app.billing where org_id = p_org for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if b.cancelled_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_cancelled');
  end if;

  -- a paid month runs out; a trial has nothing to run out
  v_last := case when b.confirmed_at is not null and app.org_access(p_org) = 'active'
                 then (date_trunc('month', v_today) + interval '1 month - 1 day')::date
                 else v_today end;

  update app.billing set
    cancelled_at = now(), cancelled_by = auth.uid(), cancel_source = 'customer', cancel_reason = p_reason,
    cancel_effective_at = ((v_last + 1)::timestamp at time zone 'Europe/Oslo'),
    deletion_due_at = ((v_last + 31)::timestamp at time zone 'Europe/Oslo'),
    updated_at = now()
  where org_id = p_org;
  perform app.lifecycle_plan();
  return jsonb_build_object('ok', true, 'last_day', v_last,
    'deletion_due_at', ((v_last + 31)::timestamp at time zone 'Europe/Oslo'));
end $fn$;

create function public.withdraw_cancellation(p_org uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if p_org is null or not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  update app.billing set cancelled_at = null, cancelled_by = null, cancel_effective_at = null, deletion_due_at = null, updated_at = now()
  where org_id = p_org and cancelled_at is not null;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_cancelled');
  end if;
  return jsonb_build_object('ok', true);
end $fn$;

-- ---------------------------------------------------------------- the admin sees who and why
create or replace function public.admin_org_cancellation(p_org uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin', 'support', 'finance']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true, 'row', (
    select jsonb_build_object('cancelled_at', b.cancelled_at, 'cancelled_by', u.email, 'effective_at', b.cancel_effective_at,
                              'deletion_due_at', b.deletion_due_at, 'org_number', o.org_number,
                              'source', b.cancel_source, 'reason', b.cancel_reason)
    from app.billing b join app.organizations o on o.id = b.org_id left join auth.users u on u.id = b.cancelled_by
    where b.org_id = p_org));
end $fn$;

-- ---------------------------------------------------------------- grants
revoke all on function app.billing_cancel_clear() from public, anon, authenticated;
revoke all on function public.cancel_subscription(uuid, text, boolean) from public, anon;
grant execute on function public.cancel_subscription(uuid, text, boolean) to authenticated;
revoke all on function public.withdraw_cancellation(uuid) from public, anon;
grant execute on function public.withdraw_cancellation(uuid) to authenticated;
