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
