-- 0193 — the engagement window of mailability is a CRM rule setting (D-208, DEC-22)
--
-- app.crm_mailable and app.crm_on_list mail only a contact who engaged (or consented, or was added) within
-- 12 months: the specification's list hygiene, which keeps the marketing domain's reputation and so the survey
-- invitations' deliverability. Tor decided (docs/crm-enrichment/DECISIONS.md DEC-22, 2026-10-03) that it is a
-- setting with today's 12 months as its default. Unlimited means a consented contact never ages out.

insert into app.crm_setting_defs (key, area, kind, options, default_value, applies_to, sort)
values ('mailable_engagement_months', 'contacts', 'limit', null, '12', array['CMP-03', 'CMP-04', 'CMP-08'], 15);

CREATE OR REPLACE FUNCTION app.crm_mailable(c app.crm_contacts)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select c.status = 'active'
    and not app.crm_suppressed(c.email)
    and (c.basis = 'consent'
         or (c.basis = 'business' and app.crm_role_address(c.email))
         or (c.basis = 'customer' and (select s.customer_exception from app.crm_settings s)
             and app.crm_type(c.user_id, c.org_id, c.source) = 'customer'))
    -- 0193: the engagement window is a setting, 12 months by default; unlimited means no expiry
    and (app.crm_limit('mailable_engagement_months') is null
         or coalesce(c.last_engaged_at, c.consent_at, c.created_at) > now() - make_interval(months => app.crm_limit('mailable_engagement_months')))
$function$;

CREATE OR REPLACE FUNCTION app.crm_on_list(c app.crm_contacts, p_list uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select c.status = 'active'
    and not app.crm_suppressed(c.email)
    and exists (select 1 from app.crm_list_members m where m.list_id = p_list and m.contact_id = c.id and m.status = 'subscribed')
    -- 0193: the engagement window is a setting, 12 months by default; unlimited means no expiry
    and (app.crm_limit('mailable_engagement_months') is null
         or coalesce(c.last_engaged_at, c.consent_at, c.created_at) > now() - make_interval(months => app.crm_limit('mailable_engagement_months')))
$function$;
