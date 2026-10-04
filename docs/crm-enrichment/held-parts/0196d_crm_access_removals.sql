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
