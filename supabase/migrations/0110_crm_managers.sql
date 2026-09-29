-- 0110 — the general manager from Brønnøysund, and an import that names what it brought (X-091)
--
-- Prospecting SMB companies means writing to the person who decides: the daglig leder (or, in a
-- sole proprietorship, the owner). Enhetsregisteret's open roles API names them. The admin's
-- Brønnøysund picker now reads that role for each company it finds and stores it on the company:
--
--   crm_companies.manager_name   the name as registered, and nothing else about the person: the
--                                register also gives a birth date, which is not needed and not kept
--   crm_companies.manager_role   DAGL (daglig leder) or INNH (innehaver)
--   crm_companies.manager_seen_at when the register was last read for it
--
-- The company's own register address (post@, firmapost@ …) is still the only address imported: a
-- business address is mailed on the B2B basis (0056, markedsføringsloven § 15 protects natural
-- persons), and the manager's name makes the mail's {navn} greet the person who reads it. No
-- personal address is guessed or constructed.
--
-- An import may carry a tag (e.g. `dl-bygg-oslo`), put on the companies and their addresses, so a
-- segment or a campaign reaches exactly that batch. Lists stay what they are: opt-in subscriptions,
-- which a register import can never join.

alter table app.crm_companies
  add column manager_name text check (manager_name is null or char_length(btrim(manager_name)) between 2 and 120),
  add column manager_role text check (manager_role is null or manager_role in ('DAGL', 'INNH')),
  add column manager_seen_at timestamptz,
  add constraint crm_companies_manager check ((manager_name is null) = (manager_role is null));
comment on column app.crm_companies.manager_name is
  'The daglig leder (or innehaver) as Enhetsregisteret names them (0110). Name only; no birth date is kept.';

-- p_rows: [{org_number, name, form_code, nace_code, nace_label, employees, municipality, municipality_no,
--           website, email, phone, manager_name, manager_role}]
-- p_tag:  one tag for the batch, on each company and its address (optional)
-- A company already in the CRM is not duplicated; its manager is refreshed from the register.
create or replace function public.admin_crm_company_import(p_rows jsonb, p_source text default 'brreg', p_tag text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  r jsonb;
  v_orgnr text;
  v_id uuid;
  v_email text;
  v_basis text;
  v_manager text;
  v_role text;
  v_old text;
  v_tag text := nullif(lower(btrim(coalesce(p_tag, ''))), '');
  v_tags text[];
  v_added int := 0;
  v_known int := 0;
  v_business int := 0;
  v_managers int := 0;
  v_skipped int := 0;
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 2000
     or (v_tag is not null and v_tag !~ '^[a-z0-9æøå_-]{1,40}$') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_orgnr := regexp_replace(coalesce(r->>'org_number', ''), '\s', '', 'g');
    if v_orgnr !~ '^[0-9]{9}$' or char_length(btrim(coalesce(r->>'name', ''))) = 0 then
      v_skipped := v_skipped + 1; continue;
    end if;
    v_role := case when r->>'manager_role' in ('DAGL', 'INNH') then r->>'manager_role' end;
    v_manager := case when v_role is not null and char_length(btrim(coalesce(r->>'manager_name', ''))) between 2 and 120
                      then btrim(r->>'manager_name') end;
    if v_manager is null then v_role := null; end if;
    v_tags := coalesce(array(select distinct t from unnest(string_to_array(lower(coalesce(r->>'tags', '')), ';') || v_tag) t
                             where t ~ '^[a-z0-9æøå_-]{1,40}$'), '{}');

    select id into v_id from app.crm_companies where product_id = 'orgpuls' and org_number = v_orgnr;
    if v_id is not null then
      v_known := v_known + 1;
      select manager_name into v_old from app.crm_companies where id = v_id;
      -- the register's address greets whoever the register names now, unless a person renamed it
      if v_manager is not null and v_manager is distinct from v_old then
        update app.crm_contacts c set name = v_manager, role = 'daglig_leder'
         where c.company_id = v_id and c.source = 'brreg' and (c.name is null or c.name = v_old);
      end if;
      update app.crm_companies c
         set manager_name = coalesce(v_manager, c.manager_name),
             manager_role = case when v_manager is not null then v_role else c.manager_role end,
             manager_seen_at = case when v_manager is not null then now() else c.manager_seen_at end,
             tags = array(select distinct t from unnest(c.tags || v_tags) t)
       where c.id = v_id;
    else
      insert into app.crm_companies (org_number, name, form_code, nace_code, nace_label, employees, municipality, municipality_no, website, phone,
                                     source, tags, manager_name, manager_role, manager_seen_at)
      values (v_orgnr, left(btrim(r->>'name'), 200), left(r->>'form_code', 10),
              case when r->>'nace_code' ~ '^[0-9]{2}(\.[0-9]{1,3})?$' then r->>'nace_code' end, left(r->>'nace_label', 200),
              case when r->>'employees' ~ '^[0-9]{1,7}$' then (r->>'employees')::int end, left(r->>'municipality', 80),
              case when r->>'municipality_no' ~ '^[0-9]{4}$' then r->>'municipality_no' end,
              nullif(left(btrim(coalesce(r->>'website', '')), 300), ''), nullif(left(btrim(coalesce(r->>'phone', '')), 40), ''),
              case when p_source = 'import' then 'import' else 'brreg' end, v_tags,
              v_manager, v_role, case when v_manager is not null then now() end)
      returning id into v_id;
      v_added := v_added + 1;
      perform app.crm_log(v_id, null, 'stage', 'Lagt til fra ' || case when p_source = 'import' then 'import' else 'Brønnøysundregistrene' end);
    end if;
    if v_manager is not null then v_managers := v_managers + 1; end if;

    v_email := lower(btrim(coalesce(r->>'email', '')));
    if v_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(v_email) <= 254 then
      v_basis := case when app.crm_role_address(v_email) and coalesce(r->>'form_code', '') <> 'ENK' then 'business' else 'none' end;
      insert into app.crm_contacts (email, name, company, org_number, company_id, role, source, basis, status, consent_source, tags)
      values (v_email, v_manager, left(btrim(r->>'name'), 200), v_orgnr, v_id,
              case when v_manager is not null then 'daglig_leder' end, 'brreg', v_basis, 'active',
              case when v_basis = 'business' then 'role address in Enhetsregisteret' end, v_tags)
      on conflict (product_id, email) do update
        set company_id = coalesce(app.crm_contacts.company_id, excluded.company_id),
            -- the register's manager greets the company address, unless a person has named it otherwise
            name = case when app.crm_contacts.source = 'brreg' then coalesce(excluded.name, app.crm_contacts.name) else app.crm_contacts.name end,
            role = case when app.crm_contacts.source = 'brreg' then coalesce(excluded.role, app.crm_contacts.role) else app.crm_contacts.role end,
            tags = array(select distinct t from unnest(app.crm_contacts.tags || excluded.tags) t);
      if v_basis = 'business' then v_business := v_business + 1; end if;
    end if;
  end loop;
  perform app.admin_log('crm.company_import', null, null, null, v_tag,
    jsonb_build_object('added', v_added, 'known', v_known, 'business', v_business, 'managers', v_managers, 'skipped', v_skipped));
  return jsonb_build_object('ok', true, 'added', v_added, 'known', v_known, 'business', v_business, 'managers', v_managers, 'skipped', v_skipped);
end $fn$;
revoke all on function public.admin_crm_company_import(jsonb, text, text) from public, anon;
grant execute on function public.admin_crm_company_import(jsonb, text, text) to authenticated;
drop function public.admin_crm_company_import(jsonb, text);
