-- 0119 — CRM: a deal's value and its contact (X-095, phase 4)
--
-- The design's pipeline is deals: a company with a contact, a yearly value, an owner, days in the
-- stage and the next step. Owner, next step and the stage's date exist since 0056; this adds the
-- value (whole kroner a year, an estimate the team enters, never an invoice) and names the contact:
-- the company's first contact, else the register's general manager (0110). The stage sums on the
-- board and the Overview's pipeline read it.

alter table app.crm_companies add column value_nok integer check (value_nok between 0 and 100000000);

create or replace function app.crm_company_json(co app.crm_companies) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select to_jsonb(co) - 'product_id' || jsonb_build_object(
    'owner_email', (select u.email::text from auth.users u where u.id = co.owner_id),
    'contacts', (select count(*) from app.crm_contacts c where c.company_id = co.id),
    'open_tasks', (select count(*) from app.crm_activities a where a.company_id = co.id and a.kind = 'task' and a.done_at is null),
    'contact_name', coalesce(
      (select coalesce(nullif(btrim(c.name), ''), c.email) from app.crm_contacts c where c.company_id = co.id order by c.created_at limit 1),
      co.manager_name))
$fn$;

create or replace function public.admin_crm_company_save(p_id uuid, p jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
AS $function$
declare
  v_id uuid := p_id;
  v_old app.crm_companies;
  v_tags text[];
  v_orgnr text := nullif(regexp_replace(coalesce(p->>'org_number', ''), '\s', '', 'g'), '');
  v_stage text := nullif(p->>'stage', '');
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p ? 'name' and char_length(btrim(coalesce(p->>'name', ''))) not between 1 and 200 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  if v_orgnr is not null and v_orgnr !~ '^[0-9]{9}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_org_number');
  end if;
  -- 0093: any configured stage a person may set: not one that follows the plan, not an archived one
  if v_stage is not null and not exists (select 1 from app.crm_stages s where s.key = v_stage and not s.managed and s.archived_at is null) then
    return jsonb_build_object('ok', false, 'error', 'invalid_stage');
  end if;
  if p ? 'tags' then
    if jsonb_typeof(p->'tags') <> 'array' or jsonb_array_length(p->'tags') > 20
       or exists (select 1 from jsonb_array_elements_text(p->'tags') t where t !~ '^[a-z0-9æøå_-]{1,40}$') then
      return jsonb_build_object('ok', false, 'error', 'invalid_tags');
    end if;
    v_tags := array(select distinct jsonb_array_elements_text(p->'tags'));
  end if;
  if nullif(p->>'owner_id', '') is not null and not exists (
      select 1 from app.platform_admins a where a.user_id = (p->>'owner_id')::uuid and a.active) then
    return jsonb_build_object('ok', false, 'error', 'invalid_owner');
  end if;
  -- 0119: the deal's yearly value in whole kroner, or empty for none
  if p ? 'value_nok' and nullif(p->>'value_nok', '') is not null and (p->>'value_nok' !~ '^[0-9]{1,9}$' or (p->>'value_nok')::bigint > 100000000) then
    return jsonb_build_object('ok', false, 'error', 'invalid_value');
  end if;
  begin
    perform nullif(p->>'next_step_at', '')::date;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'invalid_date');
  end;

  if v_id is null then
    if not p ? 'name' then
      return jsonb_build_object('ok', false, 'error', 'invalid_name');
    end if;
    if v_orgnr is not null and exists (select 1 from app.crm_companies c where c.product_id = 'orgpuls' and c.org_number = v_orgnr) then
      return jsonb_build_object('ok', false, 'error', 'exists');
    end if;
    insert into app.crm_companies (org_number, name, nace_code, employees, municipality, website, phone, source, stage, owner_id,
                                   next_step, next_step_at, tags, value_nok)
    values (v_orgnr, btrim(p->>'name'), case when p->>'nace_code' ~ '^[0-9]{2}(\.[0-9]{1,3})?$' then p->>'nace_code' end,
            case when p->>'employees' ~ '^[0-9]{1,7}$' then (p->>'employees')::int end, nullif(left(btrim(coalesce(p->>'municipality', '')), 80), ''),
            nullif(left(btrim(coalesce(p->>'website', '')), 300), ''), nullif(left(btrim(coalesce(p->>'phone', '')), 40), ''),
            'manual', coalesce(v_stage, 'new'), nullif(p->>'owner_id', '')::uuid,
            nullif(left(btrim(coalesce(p->>'next_step', '')), 300), ''), nullif(p->>'next_step_at', '')::date, coalesce(v_tags, '{}'),
            nullif(p->>'value_nok', '')::int)
    returning id into v_id;
    perform app.crm_log(v_id, null, 'stage', 'Opprettet: ' || coalesce(v_stage, 'new'));
    perform app.admin_log('crm.company_create', null, 'crm_company', v_id::text);
    return jsonb_build_object('ok', true, 'id', v_id);
  end if;

  select * into v_old from app.crm_companies where id = v_id;
  if v_old.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_stage is not null and v_old.org_id is not null then
    return jsonb_build_object('ok', false, 'error', 'stage_follows_plan');
  end if;
  update app.crm_companies c set
    name = case when p ? 'name' then btrim(p->>'name') else c.name end,
    website = case when p ? 'website' then nullif(left(btrim(coalesce(p->>'website', '')), 300), '') else c.website end,
    phone = case when p ? 'phone' then nullif(left(btrim(coalesce(p->>'phone', '')), 40), '') else c.phone end,
    owner_id = case when p ? 'owner_id' then nullif(p->>'owner_id', '')::uuid else c.owner_id end,
    next_step = case when p ? 'next_step' then nullif(left(btrim(coalesce(p->>'next_step', '')), 300), '') else c.next_step end,
    next_step_at = case when p ? 'next_step_at' then nullif(p->>'next_step_at', '')::date else c.next_step_at end,
    lost_reason = case when p ? 'lost_reason' then nullif(left(btrim(coalesce(p->>'lost_reason', '')), 300), '') else c.lost_reason end,
    value_nok = case when p ? 'value_nok' then nullif(p->>'value_nok', '')::int else c.value_nok end,
    tags = coalesce(v_tags, c.tags),
    stage = coalesce(v_stage, c.stage),
    stage_changed_at = case when v_stage is not null and v_stage <> c.stage then now() else c.stage_changed_at end,
    updated_at = now()
  where c.id = v_id;
  if v_stage is not null and v_stage <> v_old.stage then
    perform app.crm_log(v_id, null, 'stage', v_old.stage || ' → ' || v_stage
      || case when (select s.kind from app.crm_stages s where s.key = v_stage) = 'lost' and nullif(p->>'lost_reason', '') is not null
              then ': ' || left(p->>'lost_reason', 300) else '' end);
  end if;
  perform app.admin_log('crm.company_update', v_old.org_id, 'crm_company', v_id::text);
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$;

-- whom a deal may be given to, for the pipeline's dialogs: those who work the CRM, as the company page lists them
create function public.admin_crm_owners() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true, 'rows',
    (select coalesce(jsonb_agg(jsonb_build_object('id', a.user_id, 'email', u.email) order by u.email), '[]')
     from app.platform_admins a join auth.users u on u.id = a.user_id
     where a.active and a.role in ('super_admin', 'marketing')));
end $fn$;
revoke all on function public.admin_crm_owners() from public, anon;
grant execute on function public.admin_crm_owners() to authenticated;
