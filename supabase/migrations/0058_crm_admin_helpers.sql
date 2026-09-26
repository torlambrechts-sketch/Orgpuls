-- 0058_crm_admin_helpers.sql — three small things the CRM's screens need (D-103).
--
--   * admin_crm_save_contact takes a company: a person added on a prospect's page belongs
--     to it, and a contact can be moved to another company.
--   * admin_crm_list_remove takes one contact off one list on their behalf, with a reason.
--   * admin_crm_known_orgnrs says which of a page of Brønnøysund results are already in the
--     CRM, so the picker can mark them.

create or replace function public.admin_crm_save_contact(p_id uuid, p jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_id uuid := p_id;
  v_email text := lower(btrim(coalesce(p->>'email', '')));
  v_tags text[];
  v_consent_at timestamptz;
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p ? 'tags' then
    if jsonb_typeof(p->'tags') <> 'array' or jsonb_array_length(p->'tags') > 20
       or exists (select 1 from jsonb_array_elements_text(p->'tags') t where t !~ '^[a-z0-9æøå_-]{1,40}$') then
      return jsonb_build_object('ok', false, 'error', 'invalid_tags');
    end if;
    v_tags := array(select distinct jsonb_array_elements_text(p->'tags'));
  end if;
  if coalesce(p->>'role', '') <> '' and p->>'role' not in ('daglig_leder', 'hr', 'leder', 'verneombud', 'annet') then
    return jsonb_build_object('ok', false, 'error', 'invalid_role');
  end if;
  if nullif(p->>'company_id', '') is not null and not exists (select 1 from app.crm_companies co where co.id = (p->>'company_id')::uuid) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if coalesce(p->>'org_number', '') <> '' and regexp_replace(p->>'org_number', '\s', '', 'g') !~ '^[0-9]{9}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_org_number');
  end if;

  if v_id is null then
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
      return jsonb_build_object('ok', false, 'error', 'invalid_email');
    end if;
    if char_length(btrim(coalesce(p->>'consent_source', ''))) < 3 then
      return jsonb_build_object('ok', false, 'error', 'consent_required');
    end if;
    begin
      v_consent_at := coalesce(nullif(p->>'consent_at', '')::timestamptz, now());
    exception when others then
      return jsonb_build_object('ok', false, 'error', 'invalid_consent_at');
    end;
    if v_consent_at > now() + interval '1 day' then
      return jsonb_build_object('ok', false, 'error', 'invalid_consent_at');
    end if;
    if exists (select 1 from app.crm_contacts c where c.product_id = 'orgpuls' and c.email = v_email) then
      return jsonb_build_object('ok', false, 'error', 'exists');
    end if;
    insert into app.crm_contacts (email, name, company, org_number, role, source, basis, status, consent_at, consent_source, tags, lang, company_id)
    values (v_email, nullif(left(btrim(coalesce(p->>'name', '')), 120), ''), nullif(left(btrim(coalesce(p->>'company', '')), 200), ''),
            nullif(regexp_replace(coalesce(p->>'org_number', ''), '\s', '', 'g'), ''), nullif(p->>'role', ''),
            case when p->>'source' = 'event' then 'event' else 'manual' end, 'consent', 'active', v_consent_at,
            left(btrim(p->>'consent_source'), 200), coalesce(v_tags, '{}'), case when p->>'lang' = 'en' then 'en' else 'no' end,
            nullif(p->>'company_id', '')::uuid)
    returning id into v_id;
    perform app.admin_log('crm.contact_create', null, 'crm_contact', v_id::text, null, jsonb_build_object('consent_source', left(btrim(p->>'consent_source'), 200)));
  else
    update app.crm_contacts c set
      name = case when p ? 'name' then nullif(left(btrim(coalesce(p->>'name', '')), 120), '') else c.name end,
      company = case when p ? 'company' then nullif(left(btrim(coalesce(p->>'company', '')), 200), '') else c.company end,
      org_number = case when p ? 'org_number' then nullif(regexp_replace(coalesce(p->>'org_number', ''), '\s', '', 'g'), '') else c.org_number end,
      role = case when p ? 'role' then nullif(p->>'role', '') else c.role end,
      tags = coalesce(v_tags, c.tags),
      lang = case when p->>'lang' in ('no', 'en') then p->>'lang' else c.lang end,
      company_id = case when p ? 'company_id' then nullif(p->>'company_id', '')::uuid else c.company_id end,
      updated_at = now()
    where c.id = v_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    perform app.admin_log('crm.contact_update', null, 'crm_contact', v_id::text, null, p - 'email' - 'consent_source' - 'consent_at');
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $fn$;

create function public.admin_crm_list_remove(p_list uuid, p_contact uuid, p_reason text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  update app.crm_list_members set status = 'unsubscribed', unsubscribed_at = now()
  where list_id = p_list and contact_id = p_contact and status <> 'unsubscribed';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform app.admin_log('crm.list_remove', null, 'crm_contact', p_contact::text, p_reason, jsonb_build_object('list', p_list));
  return jsonb_build_object('ok', true);
end $fn$;

create function public.admin_crm_known_orgnrs(p_orgnrs text[]) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true, 'known', (
    select coalesce(jsonb_agg(co.org_number), '[]') from app.crm_companies co
    where co.org_number = any (coalesce(p_orgnrs[1:200], '{}'))));
end $fn$;

do $$
declare f text;
begin
  foreach f in array array['public.admin_crm_list_remove(uuid,uuid,text)', 'public.admin_crm_known_orgnrs(text[])']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
