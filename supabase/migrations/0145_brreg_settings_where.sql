-- 0145 — the Brønnøysund engine's one-row settings, updated through the API (D-184).
--
-- The API's connections load pg-safeupdate, which refuses an UPDATE or DELETE without a WHERE clause.
-- 0143 updated app.brreg_settings, a table of one row, without one in two places: brreg_poll_end (the
-- poll's end: its state and the feeds' positions) and admin_brreg_set_dry_run (the admin's switch).
-- Both fail when called through the API, which is the only way they are called; the suites call them
-- as the database owner, where the extension is not loaded, and did not see it. The first live poll
-- (2026-09-30) did its work and could not record its end.
--
-- The scan this found them with (supabase/tests/safeupdate_invariants.sql) also found two older CRM
-- functions updating app.crm_settings, another one-row table, without a WHERE: admin_crm_settings (the
-- customer exception) and admin_crm_reply_stage (the stage a reply moves a contact to). Both have
-- failed through the API since they were written; they are fixed here the same way.
--
-- All four now name the row by its key. The suite scans every function in `app` and `public` for an
-- UPDATE or DELETE of an `app` table without a WHERE.

create or replace function public.brreg_poll_end(p_poll bigint, p_changes int, p_feed_cursor bigint, p_roles_cursor bigint, p_error text default null)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  update app.brreg_polls
  set status = case when p_error is null then 'done' else 'failed' end, finished_at = now(),
      changes = greatest(coalesce(p_changes, 0), 0),
      error = case when p_error ~ '^[a-z0-9_]{1,60}$' then p_error when p_error is not null then 'failed' end
  where id = p_poll and status = 'running';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_running');
  end if;
  update app.brreg_settings
  set feed_cursor = coalesce(greatest(p_feed_cursor, feed_cursor), p_feed_cursor, feed_cursor),
      roles_cursor = coalesce(greatest(p_roles_cursor, roles_cursor), p_roles_cursor, roles_cursor)
  where id;
  return jsonb_build_object('ok', true);
end $fn$;

create or replace function public.admin_brreg_set_dry_run(p_on boolean, p_reason text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_id uuid;
  v_n int := 0;
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_on is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if (select s.dry_run from app.brreg_settings s) = p_on then
    return jsonb_build_object('ok', false, 'error', 'unchanged');
  end if;
  update app.brreg_settings set dry_run = p_on where id;
  -- switched off: what is queued is assigned now
  if not p_on then
    for v_id in select o.id from app.brreg_outreach o where o.status = 'queued' order by o.created_at loop
      if app.brreg_assign(v_id) then v_n := v_n + 1; end if;
    end loop;
  end if;
  perform app.admin_log('crm.brreg_dry_run', null, 'brreg_settings', null, p_reason, jsonb_build_object('dry_run', p_on, 'assigned', v_n));
  return jsonb_build_object('ok', true, 'assigned', v_n);
end $fn$;

CREATE OR REPLACE FUNCTION public.admin_crm_settings(p_customer_exception boolean, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  update app.crm_settings set customer_exception = coalesce(p_customer_exception, false), changed_by = auth.uid(), changed_at = now() where id;
  perform app.admin_log('crm.settings', null, null, null, p_reason, jsonb_build_object('customer_exception', coalesce(p_customer_exception, false)));
  return jsonb_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_reply_stage(p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not exists (select 1 from app.crm_stages s where s.key = p_key and not s.managed and s.archived_at is null) then
    return jsonb_build_object('ok', false, 'error', 'invalid_stage');
  end if;
  update app.crm_settings set reply_stage = p_key, changed_by = auth.uid(), changed_at = now() where id;
  perform app.admin_log('crm.reply_stage', null, 'crm_stage', p_key);
  return jsonb_build_object('ok', true);
end $function$;
