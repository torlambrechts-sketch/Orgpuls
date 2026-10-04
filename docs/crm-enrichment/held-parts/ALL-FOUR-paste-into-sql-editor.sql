-- All four held parts, in order (0195l, 0196d, 0197e, 0199f). Paste the whole file into the Supabase SQL editor
-- for project jmhhszsnjfqgclxzhciq and run it once. It runs as one transaction: all four land or none do.
begin;

-- 0195l — the purge (D-210): app.crm_purge, app.crm_purge_due, their revoke and the nightly job, exactly as
-- written in supabase/migrations/0195_crm_soft_delete.sql (lines 196–243). Held at the Supabase connector's approval
-- step on 2026-10-03 (DEC-29). The job is moved onto the runner by 0199f, applied after this.

-- For good: the deleted records among p_ids leave the table, and the foreign keys do what they were written
-- for (a company's activities, stage history and phone notices go with it; its contacts are unlinked; a
-- contact's memberships and consent records go with it). A contact's queued mail is withdrawn first.
create function app.crm_purge(p_entity text, p_ids uuid[]) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  if p_entity = 'company' then
    delete from app.crm_companies c where c.id = any (p_ids) and c.deleted_at is not null;
    get diagnostics v_n = row_count;
  elsif p_entity = 'contact' then
    delete from app.crm_sends s where s.contact_id = any (p_ids) and s.status in ('pending', 'sending', 'held')
      and exists (select 1 from app.crm_contacts c where c.id = s.contact_id and c.deleted_at is not null);
    delete from app.crm_contacts c where c.id = any (p_ids) and c.deleted_at is not null;
    get diagnostics v_n = row_count;
  else
    delete from app.crm_activities a where a.id = any (p_ids) and a.deleted_at is not null and a.deleted_with is null;
    get diagnostics v_n = row_count;
  end if;
  return v_n;
end $$;

-- The job: whatever has been in the restore list longer than the window leaves it for good. Unlimited
-- (null) keeps it until someone restores it or deletes it permanently.
create function app.crm_purge_due() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_days int := app.crm_limit('restore_window_days');
  v_cut timestamptz;
  v_co int := 0;
  v_ct int := 0;
  v_ac int := 0;
begin
  if v_days is null then
    return jsonb_build_object('window', null, 'companies', 0, 'contacts', 0, 'activities', 0);
  end if;
  v_cut := now() - make_interval(days => v_days);
  perform set_config('app.change_source', 'automation', true);
  v_ac := app.crm_purge('activity', array(select a.id from app.crm_activities a where a.deleted_at < v_cut and a.deleted_with is null));
  v_ct := app.crm_purge('contact', array(select c.id from app.crm_contacts c where c.deleted_at < v_cut));
  v_co := app.crm_purge('company', array(select c.id from app.crm_companies c where c.deleted_at < v_cut));
  return jsonb_build_object('window', v_days, 'companies', v_co, 'contacts', v_ct, 'activities', v_ac);
end $$;
revoke all on function app.crm_soft_delete(text, uuid[], uuid), app.crm_undelete(text, uuid[]), app.crm_purge(text, uuid[]),
  app.crm_purge_due() from public, anon, authenticated;

select cron.schedule('orgpuls-crm-purge', '25 2 * * *', $job$ select app.crm_purge_due() $job$);

-- 0196d — removing a custom set, removing a group, saving or removing a team (D-211), as written in
-- supabase/migrations/0196_crm_access.sql, with their grants. Held at the Supabase connector's approval step on
-- 2026-10-03 (DEC-29).

-- Remove a custom set; whoever had it works under their role's set again
create function public.admin_crm_set_delete(p_id uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_set app.crm_permission_sets;
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not app.crm_reason_ok(p_reason) then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'setting', 'typed_reason');
  end if;
  select * into v_set from app.crm_permission_sets s where s.id = p_id;
  if v_set.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_set.builtin then
    return jsonb_build_object('ok', false, 'error', 'builtin');
  end if;
  delete from app.crm_permission_sets where id = p_id;
  perform app.admin_log('admins.crm_set_delete', null, 'crm_permission_set', p_id::text, nullif(btrim(coalesce(p_reason, '')), ''),
    jsonb_build_object('name', v_set.name));
  return jsonb_build_object('ok', true);
end $$;

-- Remove a group without sub-groups; its members keep their sets and have no group
create function public.admin_crm_group_delete(p_id uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not app.crm_reason_ok(p_reason) then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'setting', 'typed_reason');
  end if;
  select g.name into v_name from app.crm_visibility_groups g where g.id = p_id;
  if v_name is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if exists (select 1 from app.crm_visibility_groups g where g.parent_id = p_id) then
    return jsonb_build_object('ok', false, 'error', 'has_children');
  end if;
  delete from app.crm_visibility_groups where id = p_id;
  perform app.admin_log('admins.crm_group_delete', null, 'crm_visibility_group', p_id::text, nullif(btrim(coalesce(p_reason, '')), ''),
    jsonb_build_object('name', v_name));
  return jsonb_build_object('ok', true);
end $$;

-- Add a team (no id) or change one: its name, manager and members (the list replaces the old one)
create function public.admin_crm_team_save(p_id uuid, p_name text, p_manager uuid, p_members uuid[], p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid := p_id;
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not app.crm_reason_ok(p_reason) then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'setting', 'typed_reason');
  end if;
  if char_length(v_name) not between 1 and 80 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  if (p_manager is not null and not exists (select 1 from app.platform_admins pa where pa.user_id = p_manager))
     or exists (select 1 from unnest(coalesce(p_members, '{}')) m where not exists (select 1 from app.platform_admins pa where pa.user_id = m)) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if exists (select 1 from app.crm_teams t where lower(t.name) = lower(v_name) and t.id is distinct from p_id) then
    return jsonb_build_object('ok', false, 'error', 'exists');
  end if;
  if p_id is null then
    insert into app.crm_teams (name, manager_id) values (v_name, p_manager) returning id into v_id;
  else
    update app.crm_teams set name = v_name, manager_id = p_manager, updated_at = now() where id = p_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    delete from app.crm_team_members m where m.team_id = p_id and not (m.user_id = any (coalesce(p_members, '{}')));
  end if;
  insert into app.crm_team_members (team_id, user_id)
  select v_id, m from (select distinct unnest(coalesce(p_members, '{}')) m) x
  on conflict do nothing;
  perform app.admin_log('admins.crm_team_save', null, 'crm_team', v_id::text, nullif(btrim(coalesce(p_reason, '')), ''),
    jsonb_build_object('name', v_name, 'manager', p_manager, 'members', coalesce(cardinality(p_members), 0)));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create function public.admin_crm_team_delete(p_id uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not app.crm_reason_ok(p_reason) then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'setting', 'typed_reason');
  end if;
  select t.name into v_name from app.crm_teams t where t.id = p_id;
  if v_name is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  delete from app.crm_teams where id = p_id;
  perform app.admin_log('admins.crm_team_delete', null, 'crm_team', p_id::text, nullif(btrim(coalesce(p_reason, '')), ''),
    jsonb_build_object('name', v_name));
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.admin_crm_set_delete(uuid, text), public.admin_crm_group_delete(uuid, text), public.admin_crm_team_save(uuid, text, uuid, uuid[], text), public.admin_crm_team_delete(uuid, text) from public, anon;
grant execute on function public.admin_crm_set_delete(uuid, text), public.admin_crm_group_delete(uuid, text), public.admin_crm_team_save(uuid, text, uuid, uuid[], text), public.admin_crm_team_delete(uuid, text) to authenticated;

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


-- 0199f, after 0195's purge part: the purge job through the runner (the migration's last schedule line)
select cron.schedule('orgpuls-crm-purge', '25 2 * * *', $job$ select app.crm_run('crm_purge') $job$);

commit;
