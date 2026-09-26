-- 0068_module_pilots.sql — a draft module, tried by named organisations first (D-112).
--
-- The hand-off's definition of done for an industry module ends with "a real test survey
-- with the module is completed end to end, with a PDF report checked by a human", and
-- publishing waits for sign-off on its open decisions. A published version can never be
-- withdrawn or changed (0067), so the test has to run before publishing, against the draft.
--
-- A pilot is that: a super-admin names an organisation, with a reason, audited, and that
-- organisation's leaders see and may choose the draft exactly as they would a published
-- version. Nobody else sees it. A draft some round has asked cannot be re-seeded (the
-- round's reference to it blocks the replacement), so a pilot's answers always name the
-- wording that was asked; changing the wording means a new version.

create table app.module_pilots (
  module_id  uuid not null references app.question_modules (id) on delete cascade,
  org_id     uuid not null references app.organizations (id) on delete cascade,
  added_by   uuid references auth.users (id) on delete set null,
  added_at   timestamptz not null default now(),
  primary key (module_id, org_id)
);
create index module_pilots_org_idx on app.module_pilots (org_id);
create index module_pilots_added_by_idx on app.module_pilots (added_by);

alter table app.module_pilots enable row level security;
-- read by the admin functions and by app.module_visible (definer); no client reads or writes it
revoke all on app.module_pilots from anon, authenticated;

/** Published or retired for anyone; a draft for platform admins and its pilot organisations' members. */
create or replace function app.module_visible(p_module uuid) returns boolean
  language sql stable security definer set search_path = ''
as $fn$
  select exists (select 1 from app.question_modules m where m.id = p_module and m.status <> 'draft')
      or exists (select 1 from app.module_pilots p where p.module_id = p_module and app.is_org_member(p.org_id))
      or app.is_platform_admin(array['super_admin', 'support', 'finance', 'analyst', 'marketing']::app.platform_role[])
$fn$;

/** 0067's rule, with one addition: a pilot organisation's round may ask the draft. */
create or replace function app.round_module_ok() returns trigger
  language plpgsql set search_path = ''
as $fn$
declare v_status app.round_status;
begin
  select r.status into v_status from app.rounds r
  where r.id = case when tg_op = 'DELETE' then old.round_id else new.round_id end;
  if tg_op = 'DELETE' then
    if found and v_status <> 'planlagt' then
      raise exception 'a round''s modules are fixed once it has opened' using errcode = 'restrict_violation';
    end if;
    return old;
  end if;
  if v_status <> 'planlagt' and (tg_op = 'INSERT' or to_jsonb(new) is distinct from to_jsonb(old)) then
    raise exception 'a round''s modules are fixed once it has opened' using errcode = 'restrict_violation';
  end if;
  if not exists (select 1 from app.question_modules m
                 where m.id = new.module_id
                   and (m.status = 'published'
                        or (m.status = 'draft' and exists (select 1 from app.module_pilots p
                                                           where p.module_id = m.id and p.org_id = new.org_id)))) then
    raise exception 'module % is not published', new.module_id using errcode = 'check_violation';
  end if;
  if exists (select 1 from unnest(new.item_ids) x
             where not exists (select 1 from app.module_items i
                               where i.id = x and i.module_id = new.module_id and i.kind = 'likert5')) then
    raise exception 'a round asks only statements of its module' using errcode = 'check_violation';
  end if;
  return new;
end $fn$;

/** Add or remove a pilot organisation for a draft: super-admin, with a reason, audited. */
create function public.admin_module_pilot(p_key text, p_version text, p_org uuid, p_on boolean, p_reason text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_mod    uuid;
  v_status app.module_status;
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  select m.id, m.status into v_mod, v_status from app.question_modules m where m.key = p_key and m.version = p_version;
  if v_mod is null or not exists (select 1 from app.organizations o where o.id = p_org) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_on and v_status <> 'draft' then
    return jsonb_build_object('ok', false, 'error', 'not_draft');
  end if;
  if p_on then
    insert into app.module_pilots (module_id, org_id, added_by) values (v_mod, p_org, auth.uid()) on conflict do nothing;
  else
    -- a pilot whose planned round still asks the draft keeps it; the round must drop it first
    if exists (select 1 from app.round_modules rm where rm.module_id = v_mod and rm.org_id = p_org) and v_status = 'draft' then
      return jsonb_build_object('ok', false, 'error', 'in_use');
    end if;
    delete from app.module_pilots where module_id = v_mod and org_id = p_org;
  end if;
  perform app.admin_log('module.' || case when p_on then 'pilot_add' else 'pilot_remove' end,
                        p_org, 'module', p_key || '@' || p_version, btrim(p_reason), null);
  return jsonb_build_object('ok', true);
end $fn$;

revoke all on function public.admin_module_pilot(text, text, uuid, boolean, text) from public, anon;
grant execute on function public.admin_module_pilot(text, text, uuid, boolean, text) to authenticated;

/** 0067's list, with each draft's pilot organisations. */
create or replace function public.admin_modules() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin', 'support', 'finance', 'analyst', 'marketing']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true,
    'modules', coalesce((
      select jsonb_agg(jsonb_build_object(
               'key', m.key, 'version', m.version, 'name', m.name, 'status', m.status,
               'published_at', m.published_at, 'retired_at', m.retired_at, 'content_hash', m.content_hash,
               'factors', (select count(*) from app.module_factors f where f.module_id = m.id),
               'items', (select count(*) from app.module_items i where i.module_id = m.id and i.kind = 'likert5'),
               'rounds', (select count(*) from app.round_modules rm where rm.module_id = m.id),
               'pilots', coalesce((select jsonb_agg(jsonb_build_object('org_id', o.id, 'name', o.name) order by o.name)
                                   from app.module_pilots p join app.organizations o on o.id = p.org_id
                                   where p.module_id = m.id), '[]'::jsonb))
             order by m.key, string_to_array(m.version, '.')::int[] desc)
      from app.question_modules m), '[]'::jsonb),
    'adoption', coalesce((
      select jsonb_agg(jsonb_build_object('nace', x.nace, 'rounds', x.rounds, 'with_module', x.with_module) order by x.nace)
      from (
        select coalesce(left(o.registry_nace_code, 2), '–') as nace, count(*) as rounds,
               count(*) filter (where exists (select 1 from app.round_modules rm where rm.round_id = r.id)) as with_module
        from app.rounds r
        join app.measurements me on me.id = r.measurement_id and me.kind = 'grunnlinje'
        join app.organizations o on o.id = r.org_id
        where r.opens_at > now() - interval '1 year'
        group by 1
      ) x), '[]'::jsonb));
end $fn$;

/** The draft modules the caller's organisation pilots, for Måleoppsett's offer. */
create function public.pilot_module_ids(p_org uuid) returns uuid[]
  language sql stable security definer set search_path = ''
as $fn$
  select coalesce(array_agg(p.module_id), '{}')
  from app.module_pilots p join app.question_modules m on m.id = p.module_id and m.status = 'draft'
  where p.org_id = p_org and app.is_org_member(p_org)
$fn$;

revoke all on function public.pilot_module_ids(uuid) from public, anon;
grant execute on function public.pilot_module_ids(uuid) to authenticated;
