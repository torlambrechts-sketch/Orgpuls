-- 0197e — admin_crm_companies(text, text, uuid) replaced by its four-argument form (D-212), as written in
-- supabase/migrations/0197_crm_fields.sql. Held at the Supabase connector's approval step on 2026-10-04 because it
-- drops the old signature (DEC-34).

drop function public.admin_crm_companies(text, text, uuid);
create function public.admin_crm_companies(p_q text default null, p_stage text default null, p_owner uuid default null, p_custom jsonb default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_q text := nullif(lower(btrim(coalesce(p_q, ''))), '');
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  -- 0197: conditions name live fields the caller may see, with an operator their type has
  if p_custom is not null and (not app.crm_conditions_ok('company', p_custom) or not app.crm_conditions_visible('company', p_custom)) then
    return jsonb_build_object('ok', false, 'error', 'invalid_filter');
  end if;
  perform app.crm_sync();
  perform app.admin_log('crm.companies', null, null, null, null, case when p_custom is not null then jsonb_build_object('conditions', jsonb_array_length(p_custom)) end);
  return jsonb_build_object('ok', true,
    -- 0196: what the set allows, for the screen
    'may', app.crm_may('deals'),
    'stages', (select coalesce(jsonb_object_agg(x.stage, x.n), '{}') from (select stage, count(*) n from app.crm_companies where deleted_at is null and app.crm_visible(owner_id, visibility) group by stage) x),
    'tasks_due', (select count(*) from app.crm_activities a where a.deleted_at is null and app.crm_visible_company(a.company_id) and a.kind = 'task' and a.done_at is null and a.due_at <= current_date),
    'rows', (select coalesce(jsonb_agg(app.crm_company_json(co) order by co.next_step_at nulls last, co.updated_at desc), '[]') from (
        select co.* from app.crm_companies co
        -- 0195: a deleted company is in the restore list, not here
        where co.deleted_at is null and app.crm_visible(co.owner_id, co.visibility) and (v_q is null or lower(co.name) like '%' || v_q || '%' or co.org_number = v_q or v_q = any (co.tags))
          and (p_stage is null or co.stage = p_stage)
          and (p_owner is null or co.owner_id = p_owner)
          and (p_custom is null or app.crm_custom_match('company', co.custom, p_custom))
        order by co.next_step_at nulls last, co.updated_at desc limit app.crm_limit('limit_company_read')) co),
    -- 0192: the list's cap is a setting (null: every company); the page says when it is reached
    'limit', app.crm_limit('limit_company_read'));
end $$;
revoke all on function public.admin_crm_companies(text, text, uuid, jsonb) from public, anon;
grant execute on function public.admin_crm_companies(text, text, uuid, jsonb) to authenticated;

