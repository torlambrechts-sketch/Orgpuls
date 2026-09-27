-- 0092_module_validation.sql — a module's validation status, decided in the admin (D-140).
--
-- Tor, 2026-09-27: "bygg resten også". innstillinger-og-forside.md § 4: under admin › Moduler a
-- super-admin marks a module «Validert», with a link to the validation report and a reason, or
-- takes it back to «Foreløpig», with a reason; both are audited. Every admin role sees the status,
-- the variants and the use.
--
-- 0089 froze `validation_status` with the rest of a published module, as part of what the version
-- says. The status is the one field the brief wants to move after publication: it is a verdict on
-- the module reached later, by evidence, not its content. So module_frozen now lets that one column
-- change, and only inside the admin's own function, which sets a transaction-local flag no client
-- can use (clients have no update privilege on the registry at all). The text, the statements and
-- the content hash stay frozen. A reseed never undoes a decision: module_seed compares hashes.
--
-- app.module_validation_log keeps every decision, append-only, with its link and reason. It has
-- RLS on, no policy and no grant; the admin reads it through admin_modules.

create table app.module_validation_log (
  id bigint generated always as identity primary key,
  -- key and version, not a reference: a draft can be reseeded, and the record should outlive it
  module_key text not null,
  module_version text not null,
  status text not null check (status in ('provisional', 'validated')),
  report_url text check (report_url is null or report_url ~ '^https://[^\s]+$'),
  reason text not null check (char_length(btrim(reason)) between 5 and 500),
  decided_by uuid,
  decided_at timestamptz not null default now(),
  constraint module_validation_report check (status <> 'validated' or report_url is not null)
);
create index module_validation_log_module on app.module_validation_log (module_key, module_version, decided_at desc);

alter table app.module_validation_log enable row level security;
revoke all on app.module_validation_log from public, anon, authenticated;

-- nobody may change a decision once recorded; no parent row exists whose removal would need to
create function app.module_validation_log_frozen() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  raise exception 'a validation decision is kept as it was made' using errcode = 'restrict_violation';
end $fn$;
create trigger module_validation_log_frozen before update or delete on app.module_validation_log
  for each row execute function app.module_validation_log_frozen();
revoke all on function app.module_validation_log_frozen() from public, anon, authenticated;

-- 0089's freeze, with the validation status movable by the admin's decision alone
create or replace function app.module_frozen() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'published module is immutable; create a new version' using errcode = 'restrict_violation';
    end if;
    return old;
  end if;
  if old.status = 'draft' then
    return new;
  end if;
  if (new.key, new.version, new.name, new.description, new.industry_key, new.estimated_minutes,
      new.scale, new.scoring, new.anonymity, new.relation_to_core, new.content_hash, new.published_at, new.created_at, new.i18n,
      new.wording)
     is distinct from
     (old.key, old.version, old.name, old.description, old.industry_key, old.estimated_minutes,
      old.scale, old.scoring, old.anonymity, old.relation_to_core, old.content_hash, old.published_at, old.created_at, old.i18n,
      old.wording)
     or (new.validation_status is distinct from old.validation_status
         and coalesce(current_setting('app.module_validation_decision', true), '') <> 'on')
     or (old.status = 'retired' and new.status is distinct from old.status)
     or (old.status = 'published' and new.status = 'draft') then
    raise exception 'published module is immutable; create a new version' using errcode = 'restrict_violation';
  end if;
  return new;
end $fn$;

/** «Validert» with a report and a reason, or back to «Foreløpig» with a reason: super-admin, audited. */
create function public.admin_module_set_validation(p_key text, p_version text, p_status text, p_report_url text, p_reason text)
  returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_id  uuid;
  v_old text;
  v_url text := nullif(btrim(coalesce(p_report_url, '')), '');
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 5 and 500 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  if p_status not in ('provisional', 'validated') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if p_status = 'validated' and (v_url is null or v_url !~ '^https://[^\s]+$') then
    return jsonb_build_object('ok', false, 'error', 'report_required');
  end if;
  select m.id, m.validation_status into v_id, v_old from app.question_modules m where m.key = p_key and m.version = p_version;
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_old is not distinct from p_status then
    return jsonb_build_object('ok', true, 'result', 'unchanged');
  end if;

  perform set_config('app.module_validation_decision', 'on', true);
  update app.question_modules set validation_status = p_status where id = v_id;
  perform set_config('app.module_validation_decision', '', true);

  insert into app.module_validation_log (module_key, module_version, status, report_url, reason, decided_by)
  values (p_key, p_version, p_status, case when p_status = 'validated' then v_url end, btrim(p_reason), auth.uid());
  perform app.admin_log(case p_status when 'validated' then 'module.validate' else 'module.provisional' end,
                        null, 'module', p_key || '@' || p_version, btrim(p_reason),
                        jsonb_strip_nulls(jsonb_build_object('from', v_old, 'report_url', case when p_status = 'validated' then v_url end)));
  return jsonb_build_object('ok', true, 'result', p_status);
end $fn$;
revoke all on function public.admin_module_set_validation(text, text, text, text, text) from public, anon;
grant execute on function public.admin_module_set_validation(text, text, text, text, text) to authenticated;

-- 0068's list, with each version's validation status and its last decision, and its variants
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
               'validation_status', m.validation_status,
               'decision', (select jsonb_build_object('status', d.status, 'report_url', d.report_url, 'reason', d.reason,
                                                      'at', d.decided_at)
                            from app.module_validation_log d
                            where d.module_key = m.key and d.module_version = m.version
                            order by d.decided_at desc, d.id desc limit 1),
               'factors', (select count(*) from app.module_factors f where f.module_id = m.id),
               'items', (select count(*) from app.module_items i where i.module_id = m.id and i.kind = 'likert5'),
               'rounds', (select count(*) from app.round_modules rm where rm.module_id = m.id),
               'variants', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'key', v.key, 'code', v.code, 'version', v.version, 'min_factors', v.min_factors,
                          'default_off', to_jsonb(v.default_off),
                          'factors', (select count(*) from app.module_factors f where f.module_id = m.id and f.variant_key = v.key),
                          'items', (select count(distinct mi.item_id) from app.module_factor_items mi
                                    join app.module_factors f on f.id = mi.factor_id
                                    where f.module_id = m.id and f.variant_key = v.key),
                          'rounds', (select count(*) from app.round_modules rm where rm.module_id = m.id and rm.variant_key = v.key))
                        order by v.sort)
                 from app.module_variants v where v.module_id = m.id), '[]'::jsonb),
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
