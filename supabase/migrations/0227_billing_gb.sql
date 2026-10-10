-- 0227_billing_gb.sql — invoicing an organisation in the United Kingdom (UK-F3, X-113, D-274).
--
-- Empvibe is supplied from Norway to UK businesses: the place of supply is the United Kingdom and the
-- customer accounts for UK VAT itself under the reverse charge (VATA 1994 s.8; HMRC VAT Notice 741A
-- §§ 5, 6.3; docs/markets/uk-legal.md § 8). The reverse charge holds only for a customer that is a
-- business, and HMRC's test is evidence: «Where a customer is unable to provide a VAT number, or other
-- evidence to clearly demonstrate business activities, the supply should be treated as a B2C
-- transaction» (741A 6.3) — and a B2C supply would oblige the supplier to register for UK VAT. So:
--
--   * app.billing.vat_number: the organisation's UK VAT registration number, if it has one, stored
--     as HMRC writes it (GB and nine digits, twelve for a branch, GD or HA and three for a government
--     department or health authority). Set only by save_billing, for an organisation in the
--     United Kingdom. Read back in Oppsett › Betaling, and by the platform's organisation view
--     (app.op_org_get, 0206), where the invoice is made.
--   * save_billing takes p_vat_number, optional (D-251): null leaves the number as it is, '' clears
--     it. Confirming a plan for a UK organisation needs a VAT number or a company number, the
--     evidence that it buys for its business; without either it is refused (business_evidence_needed).
--   * EHF is the Norwegian e-invoice, addressed by a Norwegian organisation number. A UK organisation
--     is invoiced by e-mail; EHF is refused for it (ehf_not_offered).
--
-- The prices are the app's list (lib/site/pricing.ts PLAN_PRICES): £25 and £55 a month in the United
-- Kingdom (X-113), a year at app.annual_months() months' price, as in Norway. The database stores the
-- plan and the interval, never an amount; nothing here reads a price.
--
-- save_billing gains a parameter, so the old signature is set aside rather than overloaded (an
-- overload makes PostgREST's choice of function ambiguous): moved to app, renamed, revoked. A client
-- deployed before this sends the seven old arguments and reaches the new function, the eighth taking
-- its default.

-- ---------------------------------------------------------------- the VAT number
alter table app.billing add column vat_number text
  check (vat_number ~ '^GB(\d{9}|\d{12}|GD\d{3}|HA\d{3})$');
comment on column app.billing.vat_number is
  'The organisation''s UK VAT registration number (0227), for a reverse-charged invoice. Only for an organisation in the United Kingdom; set only by save_billing.';

-- ---------------------------------------------------------------- save_billing
alter function public.save_billing(uuid, text, text, text, boolean, boolean, text) set schema app;
alter function app.save_billing(uuid, text, text, text, boolean, boolean, text) rename to save_billing_retired_0227;
revoke all on function app.save_billing_retired_0227(uuid, text, text, text, boolean, boolean, text) from public, anon, authenticated;

-- 0202's, with the United Kingdom's VAT number, its business evidence and no EHF there.
create function public.save_billing(
  p_org uuid,
  p_plan text,
  p_invoice_email text,
  p_invoice_ref text,
  p_ehf boolean,
  p_confirm boolean,
  p_interval text default 'month',
  p_vat_number text default null
) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_employees int;
  v_org_number text;
  v_market text;
  v_email text := lower(btrim(coalesce(p_invoice_email, '')));
  v_ref text := nullif(btrim(coalesce(p_invoice_ref, '')), '');
  v_interval text := coalesce(p_interval, 'month');
  v_vat text;
begin
  if p_org is null or not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  select o.employee_count, o.org_number, o.market into v_employees, v_org_number, v_market
  from app.organizations o where o.id = p_org;

  if p_plan is null or p_plan not in ('small', 'usual', 'group') then
    return jsonb_build_object('ok', false, 'error', 'invalid_plan');
  end if;
  if v_interval not in ('month', 'year') then
    return jsonb_build_object('ok', false, 'error', 'invalid_interval');
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

  -- the UK VAT number: spaces and dots dropped, GB in front if it was left off; null keeps the stored one
  if p_vat_number is null then
    select b.vat_number into v_vat from app.billing b where b.org_id = p_org;
  else
    v_vat := nullif(upper(regexp_replace(p_vat_number, '[\s.\-]', '', 'g')), '');
    if v_vat ~ '^(\d{9}|\d{12})$' then
      v_vat := 'GB' || v_vat;
    end if;
    if v_vat is not null and (v_market is distinct from 'gb' or v_vat !~ '^GB(\d{9}|\d{12}|GD\d{3}|HA\d{3})$') then
      return jsonb_build_object('ok', false, 'error', 'invalid_vat_number');
    end if;
  end if;

  if coalesce(p_ehf, false) and v_market = 'gb' then
    return jsonb_build_object('ok', false, 'error', 'ehf_not_offered');
  end if;
  -- EHF is addressed by organisation number; without one there is nowhere to send it
  if coalesce(p_ehf, false) and v_org_number is null then
    return jsonb_build_object('ok', false, 'error', 'ehf_needs_orgnr');
  end if;
  -- a reverse-charged supply needs a business on the other side (VAT Notice 741A 6.3)
  if coalesce(p_confirm, false) and v_market = 'gb' and v_vat is null and v_org_number is null then
    return jsonb_build_object('ok', false, 'error', 'business_evidence_needed');
  end if;

  update app.billing b
     set plan = p_plan,
         billing_interval = v_interval,
         invoice_email = v_email,
         invoice_ref = v_ref,
         ehf = coalesce(p_ehf, false),
         vat_number = v_vat,
         -- 0202: confirming again after the move to the free plan took effect starts a new subscription
         confirmed_at = case when coalesce(p_confirm, false) and (b.confirmed_at is null or (b.free_from is not null and now() >= b.free_from))
                             then now() else b.confirmed_at end,
         confirmed_by = case when coalesce(p_confirm, false) and (b.confirmed_at is null or (b.free_from is not null and now() >= b.free_from))
                             then auth.uid() else b.confirmed_by end,
         free_from = case when coalesce(p_confirm, false) then null else b.free_from end,
         updated_at = now()
   where b.org_id = p_org;

  return jsonb_build_object('ok', true);
end $fn$;

revoke all on function public.save_billing(uuid, text, text, text, boolean, boolean, text, text) from public, anon;
grant execute on function public.save_billing(uuid, text, text, text, boolean, boolean, text, text) to authenticated;
