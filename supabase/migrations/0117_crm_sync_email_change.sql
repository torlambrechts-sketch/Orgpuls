-- 0117 — the CRM sync survives an account changing its e-mail address
--
-- app.crm_sync (0094) upserts one contact per account on (product_id, email). A contact also holds
-- its account in user_id, which is unique. When an account's address changed, the sync inserted a
-- contact at the new address with the same user_id, collided with the old contact on user_id, and
-- the whole sync failed from then on, for every account, on every run. Found by
-- cancellation_invariants.sql, which changes a daglig leder's address, once the local stack held a
-- contact for that account. The sync now moves the account's contact to its new address first.

create or replace function app.crm_sync() returns void
  language plpgsql security definer set search_path = ''
AS $function$
begin
  insert into app.crm_companies (org_number, name, form_code, nace_code, nace_label, employees, municipality, municipality_no, source, stage, org_id)
  select o.org_number, left(o.name, 200), left(o.registry_form_code, 10),
         case when o.registry_nace_code ~ '^[0-9]{2}(\.[0-9]{1,3})?$' then o.registry_nace_code end, left(o.registry_nace_label, 200),
         o.employee_count, left(o.registry_municipality, 80),
         case when o.registry_municipality_no ~ '^[0-9]{4}$' then o.registry_municipality_no end,
         'signup', case when app.org_access(o.id) = 'active' then 'customer' else 'trial' end, o.id
  from app.organizations o
  where o.org_number ~ '^[0-9]{9}$' and not app.is_demo(o.id)
  on conflict (product_id, org_number) where org_number is not null do update set
    org_id = excluded.org_id,
    stage = excluded.stage,
    stage_changed_at = case when app.crm_companies.stage is distinct from excluded.stage then now() else app.crm_companies.stage_changed_at end,
    employees = coalesce(excluded.employees, app.crm_companies.employees),
    updated_at = now()
  where app.crm_companies.org_id is distinct from excluded.org_id or app.crm_companies.stage is distinct from excluded.stage;

  -- 0117: an account whose address changed. Its contact follows it to the new address; where
  -- another contact already holds that address (a subscriber who later signed up with it), the
  -- old contact lets go of the account and the upsert below attaches it to that one.
  update app.crm_contacts c set user_id = null, updated_at = now()
  from auth.users u
  where c.user_id = u.id and u.email is not null and c.email <> lower(btrim(u.email))
    and exists (select 1 from app.crm_contacts o where o.product_id = c.product_id and o.email = lower(btrim(u.email)) and o.id <> c.id);
  update app.crm_contacts c set email = lower(btrim(u.email)), updated_at = now()
  from auth.users u
  where c.user_id = u.id and u.email is not null and c.email <> lower(btrim(u.email))
    and lower(btrim(u.email)) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';

  insert into app.crm_contacts (email, name, user_id, org_id, role, source, basis, lang)
  select lower(btrim(u.email)), nullif(left(btrim(coalesce(p.full_name, '')), 120), ''), u.id, m.org_id,
         case m.role::text when 'daglig_leder' then 'daglig_leder' when 'avdelingsleder' then 'leder' when 'verneombud' then 'verneombud' end,
         'user', 'none', case when p.lang = 'en' then 'en' else 'no' end
  from auth.users u
  join lateral (select m.org_id, m.role from app.memberships m where m.user_id = u.id and not app.is_demo(m.org_id)
                order by m.active desc, m.created_at limit 1) m on true
  left join app.profiles p on p.id = u.id
  where u.email is not null and lower(btrim(u.email)) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  on conflict (product_id, email) do update set
    user_id = excluded.user_id,
    org_id = excluded.org_id,
    name = coalesce(app.crm_contacts.name, excluded.name),
    role = coalesce(app.crm_contacts.role, excluded.role),
    updated_at = now()
  where app.crm_contacts.user_id is distinct from excluded.user_id or app.crm_contacts.org_id is distinct from excluded.org_id
     or (app.crm_contacts.name is null and excluded.name is not null) or (app.crm_contacts.role is null and excluded.role is not null);

  update app.crm_contacts c set company_id = co.id, updated_at = now()
  from app.crm_companies co
  where co.org_id = c.org_id and c.org_id is not null and c.company_id is distinct from co.id;

  update app.crm_contacts c set basis = x.basis, updated_at = now()
  from (select c2.id, case when app.crm_type(c2.user_id, c2.org_id, c2.source) = 'customer' then 'customer' else 'none' end as basis
        from app.crm_contacts c2 where c2.basis <> 'consent' and c2.user_id is not null) x
  where c.id = x.id and c.basis is distinct from x.basis;
end $function$;
