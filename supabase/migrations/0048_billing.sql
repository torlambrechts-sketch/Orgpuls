-- 0048_billing.sql — the trial and the organisation's payment details. D-89.
--
-- Orgpuls is free for a trial of fifteen days, which a daglig leder may extend once, by
-- another fifteen. Before it ends they choose a plan and give the invoice details, and
-- confirm; Orgpuls invoices from the day the trial ends. Payment is by invoice (e-mail or
-- EHF), so nothing here holds a card or talks to a payment provider.
--
--   * app.trial_days(): 15, a function like app.k_min(), so no row can change the length.
--   * app.billing: one row per organisation, made by a trigger when the organisation is.
--     It is not a column set on app.organizations, because a daglig leder may update that
--     table (org_update), and could then set their own trial end. Here the client may read
--     and never write: the two RPCs below are the only write paths.
--   * public.extend_trial: once per organisation, before a plan is confirmed.
--   * public.save_billing: plan, invoice address, reference, EHF; and, when asked, confirms.
--
-- Only the daglig leder reads the row: invoice details are the employer's business, not the
-- verneombud's or a department manager's.

create function app.trial_days() returns int
  language sql immutable parallel safe set search_path = ''
as $fn$ select 15 $fn$;

create table app.billing (
  org_id uuid primary key references app.organizations (id) on delete cascade,
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null,
  trial_extended_at timestamptz,
  trial_extended_by uuid references app.profiles (id) on delete set null,
  plan text check (plan in ('small', 'usual', 'group')),
  invoice_email text check (
    invoice_email is null or (char_length(invoice_email) <= 254 and invoice_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  ),
  invoice_ref text check (invoice_ref is null or char_length(btrim(invoice_ref)) between 1 and 60),
  ehf boolean not null default false,
  confirmed_at timestamptz,
  confirmed_by uuid references app.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  check (trial_ends_at > trial_started_at),
  -- a confirmation always names what was confirmed
  check (confirmed_at is null or (plan is not null and invoice_email is not null))
);

create index billing_trial_extended_by on app.billing (trial_extended_by);
create index billing_confirmed_by on app.billing (confirmed_by);

alter table app.billing enable row level security;
create policy billing_read on app.billing for select to authenticated
  using (app.has_role(org_id, array['daglig_leder']::app.org_role[]));
grant select on app.billing to authenticated;
-- no insert, update or delete policy and no such grant

-- ---------------------------------------------------------------- every organisation has one
create function app.billing_for_new_org() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  insert into app.billing (org_id, trial_started_at, trial_ends_at)
  values (new.id, now(), now() + make_interval(days => app.trial_days()))
  on conflict (org_id) do nothing;
  return new;
end $fn$;

create trigger organizations_billing after insert on app.organizations
  for each row execute function app.billing_for_new_org();

-- the organisations that exist today start their trial now, with the full fifteen days
insert into app.billing (org_id, trial_started_at, trial_ends_at)
select o.id, now(), now() + make_interval(days => app.trial_days())
from app.organizations o
on conflict (org_id) do nothing;

-- ---------------------------------------------------------------- extend_trial
create function public.extend_trial(p_org uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_row app.billing;
  v_end timestamptz;
begin
  if p_org is null or not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  select * into v_row from app.billing b where b.org_id = p_org for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if v_row.confirmed_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_subscribed');
  end if;
  if v_row.trial_extended_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_extended');
  end if;

  -- from today if the trial has already run out, so the extension is always fifteen real days
  update app.billing b
     set trial_ends_at = greatest(b.trial_ends_at, now()) + make_interval(days => app.trial_days()),
         trial_extended_at = now(),
         trial_extended_by = auth.uid(),
         updated_at = now()
   where b.org_id = p_org
  returning b.trial_ends_at into v_end;

  return jsonb_build_object('ok', true, 'trial_ends_at', v_end);
end $fn$;

-- ---------------------------------------------------------------- save_billing
-- The plan must fit the organisation's stated headcount, as the price list does: Liten to
-- 25, Vanlig to 100, and "Flere selskaper" (by agreement) for any size.
create function public.save_billing(
  p_org uuid,
  p_plan text,
  p_invoice_email text,
  p_invoice_ref text,
  p_ehf boolean,
  p_confirm boolean
) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_employees int;
  v_org_number text;
  v_email text := lower(btrim(coalesce(p_invoice_email, '')));
  v_ref text := nullif(btrim(coalesce(p_invoice_ref, '')), '');
begin
  if p_org is null or not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  select o.employee_count, o.org_number into v_employees, v_org_number
  from app.organizations o where o.id = p_org;

  if p_plan is null or p_plan not in ('small', 'usual', 'group') then
    return jsonb_build_object('ok', false, 'error', 'invalid_plan');
  end if;
  if (p_plan = 'small' and v_employees > 25) or (p_plan = 'usual' and v_employees > 100) then
    return jsonb_build_object('ok', false, 'error', 'plan_too_small');
  end if;
  if char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;
  if v_ref is not null and char_length(v_ref) > 60 then
    return jsonb_build_object('ok', false, 'error', 'invalid_ref');
  end if;
  -- EHF is addressed by organisation number; without one there is nowhere to send it
  if coalesce(p_ehf, false) and v_org_number is null then
    return jsonb_build_object('ok', false, 'error', 'ehf_needs_orgnr');
  end if;

  update app.billing b
     set plan = p_plan,
         invoice_email = v_email,
         invoice_ref = v_ref,
         ehf = coalesce(p_ehf, false),
         confirmed_at = case when coalesce(p_confirm, false) and b.confirmed_at is null then now() else b.confirmed_at end,
         confirmed_by = case when coalesce(p_confirm, false) and b.confirmed_at is null then auth.uid() else b.confirmed_by end,
         updated_at = now()
   where b.org_id = p_org;

  return jsonb_build_object('ok', true);
end $fn$;

revoke all on function public.extend_trial(uuid) from public, anon;
grant execute on function public.extend_trial(uuid) to authenticated;
revoke all on function public.save_billing(uuid, text, text, text, boolean, boolean) from public, anon;
grant execute on function public.save_billing(uuid, text, text, text, boolean, boolean) to authenticated;
revoke all on function app.billing_for_new_org() from public, anon, authenticated;
