-- 0195 — soft delete, the restore list and the purge (WP-0.3; D-210)
--
-- docs/crm-enrichment/INSTRUCTIONS.md CRM-12, SF-15, PIP-17: a deleted company, contact or activity is
-- marked with who, when and from where, listed for restore for a window (30 days by default), restored with
-- its links intact, and removed for good by a job once the window has passed. Bulk deletes show a preview;
-- a second admin's approval of a bulk delete is a setting, off by default.
--
-- A flag, not a trash table. Removing the row and keeping a copy would let the foreign keys act at once —
-- an activity's outreach re-queued (brreg_outreach_orphaned), list memberships and consent records
-- cascaded away — and a restore would re-insert them through triggers that write consent records and
-- growth events a second time. With a flag nothing cascades until the purge, so a restore is one update
-- and every link is where it was. The price is that every reader leaves a deleted row out: each function
-- that reads these tables was reviewed (crm_restore_invariants.sql holds the reviewed list and fails on a
-- new reader that neither filters deleted_at nor is added to it with its reason).
--   * the send path is closed centrally: app.crm_mailable and app.crm_on_list are false for a deleted contact
--   * a company's live activities are deleted with it (deleted_with names the company) and come back with it
--   * a deleted record keeps its unique key (org number, address): adding it again points to the restore list
--   * privacy actions are never blocked: erasure, unsubscribing and the recipient's own links work on a
--     deleted contact, and a person who proves their address again (double opt-in, a demo) brings it back
--   * the purge is the delete the foreign keys were written for; the changelog goes with the record (0194)

-- ------------------------------------------------------------------------------------------ the flag
alter table app.crm_companies
  add column deleted_at timestamptz,
  add column deleted_by uuid references auth.users (id) on delete set null,
  add column deleted_source text check (deleted_source in ('user', 'automation', 'api', 'import', 'sync', 'connector', 'meeting')),
  add constraint crm_companies_deleted_ck check ((deleted_at is null) = (deleted_source is null));
alter table app.crm_contacts
  add column deleted_at timestamptz,
  add column deleted_by uuid references auth.users (id) on delete set null,
  add column deleted_source text check (deleted_source in ('user', 'automation', 'api', 'import', 'sync', 'connector', 'meeting')),
  add constraint crm_contacts_deleted_ck check ((deleted_at is null) = (deleted_source is null));
alter table app.crm_activities
  add column deleted_at timestamptz,
  add column deleted_by uuid references auth.users (id) on delete set null,
  add column deleted_source text check (deleted_source in ('user', 'automation', 'api', 'import', 'sync', 'connector', 'meeting')),
  -- the company whose deletion took this activity with it; null when the activity was deleted on its own
  add column deleted_with uuid,
  add constraint crm_activities_deleted_ck check ((deleted_at is null) = (deleted_source is null) and (deleted_with is null or deleted_at is not null));
create index crm_companies_deleted_idx on app.crm_companies (deleted_at) where deleted_at is not null;
create index crm_contacts_deleted_idx on app.crm_contacts (deleted_at) where deleted_at is not null;
create index crm_activities_deleted_idx on app.crm_activities (deleted_at) where deleted_at is not null;
create index crm_activities_deleted_with_idx on app.crm_activities (deleted_with) where deleted_with is not null;
create index crm_companies_deleted_by_idx on app.crm_companies (deleted_by);
create index crm_contacts_deleted_by_idx on app.crm_contacts (deleted_by);
create index crm_activities_deleted_by_idx on app.crm_activities (deleted_by);

-- ------------------------------------------------------------------------------------------ the events
update app.crm_event_types set description = 'A company was moved to the restore list' where name = 'company.deleted';
update app.crm_event_types set description = 'A contact was moved to the restore list' where name = 'contact.deleted';
update app.crm_event_types set description = 'An activity was moved to the restore list' where name = 'activity.deleted';
insert into app.crm_event_types (name, entity, description) values
  ('company.restored',  'company',  'A company came back from the restore list'),
  ('contact.restored',  'contact',  'A contact came back from the restore list, by an admin or by the person proving their address again'),
  ('activity.restored', 'activity', 'An activity came back from the restore list'),
  ('company.purged',    'company',  'A company was removed for good: after the restore window, or deleted permanently'),
  ('contact.purged',    'contact',  'A contact was removed for good: after the restore window, deleted permanently, or erased'),
  ('activity.purged',   'activity', 'An activity was removed for good, with its company or on its own');

-- the flag is bookkeeping: it moves no version and writes no changelog line; its own events say what happened
CREATE OR REPLACE FUNCTION app.crm_untracked() RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  select array['id', 'product_id', 'created_at', 'updated_at', 'version', 'created_by', 'updated_by', 'stage_changed_at',
               'last_activity_at', 'last_engaged_at', 'manager_seen_at', 'optin_hash', 'optin_sent_at', 'admin_email',
               'deleted_at', 'deleted_by', 'deleted_source', 'deleted_with']
$$;

CREATE OR REPLACE FUNCTION app.crm_track() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
declare
  v_entity text := case tg_table_name when 'crm_companies' then 'company' when 'crm_contacts' then 'contact' else 'activity' end;
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_id uuid := coalesce(v_new ->> 'id', v_old ->> 'id')::uuid;
  v_source text := app.crm_change_source();
  v_actor uuid := auth.uid();
  v_fields text[];
begin
  if tg_op = 'INSERT' then
    insert into app.crm_events (name, entity, record_id, actor, source) values (v_entity || '.added', v_entity, v_id, v_actor, v_source);
  elsif tg_op = 'UPDATE' then
    -- 0195: into and out of the restore list
    if v_old ->> 'deleted_at' is null and v_new ->> 'deleted_at' is not null then
      insert into app.crm_events (name, entity, record_id, actor, source) values (v_entity || '.deleted', v_entity, v_id, v_actor, v_source);
    elsif v_old ->> 'deleted_at' is not null and v_new ->> 'deleted_at' is null then
      insert into app.crm_events (name, entity, record_id, actor, source) values (v_entity || '.restored', v_entity, v_id, v_actor, v_source);
    end if;
    select array_agg(n.key order by n.key) into v_fields from jsonb_each(v_new) n
    where not (n.key = any (app.crm_untracked())) and n.value is distinct from v_old -> n.key;
    if v_fields is null then
      return null;
    end if;
    insert into app.crm_changes (entity, record_id, field, old_value, new_value, actor, source)
    select v_entity, v_id, f, v_old -> f, v_new -> f, v_actor, v_source from unnest(v_fields) f;
    insert into app.crm_events (name, entity, record_id, actor, source, fields) values (v_entity || '.updated', v_entity, v_id, v_actor, v_source, v_fields);
    if v_entity = 'company' and 'stage' = any (v_fields) then
      insert into app.crm_events (name, entity, record_id, actor, source, fields) values ('company.stage_changed', v_entity, v_id, v_actor, v_source, array['stage']);
    end if;
    if v_entity = 'activity' and 'done_at' = any (v_fields) and v_old ->> 'done_at' is null then
      insert into app.crm_events (name, entity, record_id, actor, source, fields) values ('activity.completed', v_entity, v_id, v_actor, v_source, array['done_at']);
    end if;
  else
    -- the record is gone for good: its history goes with it (an erased contact leaves no old values behind);
    -- the event names only the record and the kind of change. 0195: a delete is a move to the restore list
    -- (an update, above), so the row leaving the table is the purge
    delete from app.crm_changes where entity = v_entity and record_id = v_id;
    insert into app.crm_events (name, entity, record_id, actor, source) values (v_entity || '.purged', v_entity, v_id, v_actor, v_source);
  end if;
  return null;
end $$;
revoke all on function app.crm_untracked(), app.crm_track() from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------ the rules
alter table app.crm_setting_defs drop constraint crm_setting_defs_area_check,
  add constraint crm_setting_defs_area_check check (area in ('contacts', 'audit', 'limits', 'deletion'));
insert into app.crm_setting_defs (key, area, kind, options, default_value, applies_to, sort) values
  ('delete_approval',     'deletion', 'choice', array['off', 'on'], '"off"', array['CRM-12', 'PIP-10', 'CRM-11'], 120),
  ('restore_window_days', 'deletion', 'limit',  null,               '30',    array['CRM-12', 'SF-15', 'PIP-17'], 130);

-- ------------------------------------------------------------------------------------------ approvals
-- a bulk delete waiting for a second admin, while delete_approval is on
create table app.crm_delete_requests (
  id           uuid primary key default gen_random_uuid(),
  product_id   text not null default 'orgpuls',
  entity       text not null check (entity in ('company', 'contact', 'activity')),
  ids          uuid[] not null check (cardinality(ids) >= 2),
  reason       text check (char_length(reason) <= 500),
  requested_by uuid references auth.users (id) on delete set null,
  requested_at timestamptz not null default now(),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by   uuid references auth.users (id) on delete set null,
  decided_at   timestamptz,
  check ((status = 'pending') = (decided_at is null))
);
create index crm_delete_requests_pending_idx on app.crm_delete_requests (requested_at) where status = 'pending';
create index crm_delete_requests_requested_by_idx on app.crm_delete_requests (requested_by);
create index crm_delete_requests_decided_by_idx on app.crm_delete_requests (decided_by);
alter table app.crm_delete_requests enable row level security;
revoke all on app.crm_delete_requests from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------ the engine
-- Into the restore list: the live records among p_ids, deleted by p_by (the admin, or the requester of an
-- approved bulk delete). A company takes its live activities with it. Returns how many moved.
create function app.crm_soft_delete(p_entity text, p_ids uuid[], p_by uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_at timestamptz := now();
  v_source text := app.crm_change_source();
  v_n int;
begin
  if p_entity = 'company' then
    update app.crm_companies c set deleted_at = v_at, deleted_by = p_by, deleted_source = v_source
    where c.id = any (p_ids) and c.deleted_at is null;
    get diagnostics v_n = row_count;
    -- a statement of its own, so it sees the companies just marked
    update app.crm_activities a set deleted_at = v_at, deleted_by = p_by, deleted_source = v_source, deleted_with = a.company_id
    where a.company_id = any (p_ids) and a.deleted_at is null
      and exists (select 1 from app.crm_companies c where c.id = a.company_id and c.deleted_at = v_at);
  elsif p_entity = 'contact' then
    update app.crm_contacts c set deleted_at = v_at, deleted_by = p_by, deleted_source = v_source
    where c.id = any (p_ids) and c.deleted_at is null;
    get diagnostics v_n = row_count;
  else
    update app.crm_activities a set deleted_at = v_at, deleted_by = p_by, deleted_source = v_source
    where a.id = any (p_ids) and a.deleted_at is null;
    get diagnostics v_n = row_count;
  end if;
  return v_n;
end $$;

-- Out of the restore list, links intact. An activity that went with its company comes back with it, and
-- not on its own; one whose company is still deleted waits for the company. Returns restored and skipped.
create function app.crm_undelete(p_entity text, p_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  if p_entity = 'company' then
    update app.crm_companies c set deleted_at = null, deleted_by = null, deleted_source = null
    where c.id = any (p_ids) and c.deleted_at is not null;
    get diagnostics v_n = row_count;
    update app.crm_activities a set deleted_at = null, deleted_by = null, deleted_source = null, deleted_with = null
    where a.deleted_with = any (p_ids)
      and exists (select 1 from app.crm_companies c where c.id = a.deleted_with and c.deleted_at is null);
  elsif p_entity = 'contact' then
    update app.crm_contacts c set deleted_at = null, deleted_by = null, deleted_source = null
    where c.id = any (p_ids) and c.deleted_at is not null;
    get diagnostics v_n = row_count;
  else
    update app.crm_activities a set deleted_at = null, deleted_by = null, deleted_source = null
    where a.id = any (p_ids) and a.deleted_at is not null and a.deleted_with is null
      and exists (select 1 from app.crm_companies c where c.id = a.company_id and c.deleted_at is null);
    get diagnostics v_n = row_count;
  end if;
  return jsonb_build_object('restored', v_n, 'skipped', coalesce(cardinality(p_ids), 0) - v_n);
end $$;

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

-- ------------------------------------------------------------------------------------------ the admin's calls
-- A record's name for the restore list and the preview: a company's name, a contact's name and address, an
-- activity's kind and text with its company
create function app.crm_record_label(p_entity text, p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case p_entity
    when 'company' then (select jsonb_build_object('name', c.name, 'detail', c.org_number) from app.crm_companies c where c.id = p_id)
    when 'contact' then (select jsonb_build_object('name', coalesce(nullif(btrim(c.name), ''), c.email), 'detail', c.email) from app.crm_contacts c where c.id = p_id)
    else (select jsonb_build_object('name', left(a.body, 120), 'detail', co.name, 'kind', a.kind, 'origin', a.origin)
          from app.crm_activities a left join app.crm_companies co on co.id = a.company_id where a.id = p_id) end
$$;
revoke all on function app.crm_record_label(text, uuid) from public, anon, authenticated;

-- What a delete would do, before it is done: how many records, their names (the first ten), and what goes
-- with them now and at the purge. Audited: it reads names.
create function public.admin_crm_delete_preview(p_entity text, p_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_entity not in ('company', 'contact', 'activity') or p_ids is null or cardinality(p_ids) < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  v_ids := case p_entity
    when 'company' then array(select c.id from app.crm_companies c where c.id = any (p_ids) and c.deleted_at is null)
    when 'contact' then array(select c.id from app.crm_contacts c where c.id = any (p_ids) and c.deleted_at is null)
    else array(select a.id from app.crm_activities a where a.id = any (p_ids) and a.deleted_at is null) end;
  perform app.admin_log('crm.delete_preview', null, 'crm_' || p_entity, null, null,
    jsonb_build_object('entity', p_entity, 'count', cardinality(v_ids)));
  return jsonb_build_object('ok', true, 'entity', p_entity, 'count', cardinality(v_ids),
    'missing', (select count(distinct x) from unnest(p_ids) x) - cardinality(v_ids),
    'names', (select coalesce(jsonb_agg(app.crm_record_label(p_entity, x.id) order by x.n), '[]')
              from unnest(v_ids) with ordinality x(id, n) where x.n <= 10),
    'approval', app.crm_choice('delete_approval') = 'on' and cardinality(v_ids) > 1,
    'window', app.crm_limit('restore_window_days'),
    'effects', case p_entity
      when 'company' then jsonb_build_object(
        'activities', (select count(*) from app.crm_activities a where a.company_id = any (v_ids) and a.deleted_at is null),
        'open_tasks', (select count(*) from app.crm_activities a where a.company_id = any (v_ids) and a.deleted_at is null and a.kind = 'task' and a.done_at is null),
        'contacts', (select count(*) from app.crm_contacts c where c.company_id = any (v_ids) and c.deleted_at is null))
      when 'contact' then jsonb_build_object(
        'lists', (select count(*) from app.crm_list_members m where m.contact_id = any (v_ids) and m.status = 'subscribed'),
        'consent_records', (select count(*) from app.consent_records r where r.contact_id = any (v_ids)),
        'queued', (select count(*) from app.crm_sends s where s.contact_id = any (v_ids) and s.status in ('pending', 'sending', 'held')))
      else '{}'::jsonb end);
end $$;
revoke all on function public.admin_crm_delete_preview(text, uuid[]) from public, anon;
grant execute on function public.admin_crm_delete_preview(text, uuid[]) to authenticated;

-- Delete: into the restore list at once, or — a bulk delete while second-admin approval is on — as a
-- request another admin decides
create function public.admin_crm_delete(p_entity text, p_ids uuid[], p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
  v_n int;
  v_req uuid;
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not app.crm_reason_ok(p_reason) then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'setting', 'typed_reason');
  end if;
  if p_entity not in ('company', 'contact', 'activity') or p_ids is null or cardinality(p_ids) < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  v_ids := case p_entity
    when 'company' then array(select c.id from app.crm_companies c where c.id = any (p_ids) and c.deleted_at is null)
    when 'contact' then array(select c.id from app.crm_contacts c where c.id = any (p_ids) and c.deleted_at is null)
    else array(select a.id from app.crm_activities a where a.id = any (p_ids) and a.deleted_at is null) end;
  if cardinality(v_ids) = 0 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if app.crm_choice('delete_approval') = 'on' and cardinality(v_ids) > 1 then
    insert into app.crm_delete_requests (entity, ids, reason, requested_by)
    values (p_entity, v_ids, nullif(left(btrim(coalesce(p_reason, '')), 500), ''), auth.uid())
    returning id into v_req;
    perform app.admin_log('crm.delete_request', null, 'crm_delete_request', v_req::text, nullif(btrim(coalesce(p_reason, '')), ''),
      jsonb_build_object('entity', p_entity, 'count', cardinality(v_ids)));
    return jsonb_build_object('ok', true, 'pending', true, 'request', v_req, 'count', cardinality(v_ids));
  end if;
  v_n := app.crm_soft_delete(p_entity, v_ids, auth.uid());
  perform app.admin_log('crm.delete', null, 'crm_' || p_entity, case when v_n = 1 then v_ids[1]::text end,
    nullif(btrim(coalesce(p_reason, '')), ''), jsonb_build_object('entity', p_entity, 'count', v_n));
  return jsonb_build_object('ok', true, 'deleted', v_n);
end $$;
revoke all on function public.admin_crm_delete(text, uuid[], text) from public, anon;
grant execute on function public.admin_crm_delete(text, uuid[], text) to authenticated;

-- A second admin decides a bulk delete: never the one who asked
create function public.admin_crm_delete_decide(p_request uuid, p_approve boolean, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r app.crm_delete_requests;
  v_n int := 0;
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not app.crm_reason_ok(p_reason) then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'setting', 'typed_reason');
  end if;
  if p_approve is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select * into r from app.crm_delete_requests q where q.id = p_request for update;
  if r.id is null or r.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if r.requested_by = auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'own_request');
  end if;
  if p_approve then
    v_n := app.crm_soft_delete(r.entity, r.ids, r.requested_by);
  end if;
  update app.crm_delete_requests set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now()
  where id = r.id;
  perform app.admin_log(case when p_approve then 'crm.delete_approve' else 'crm.delete_reject' end, null, 'crm_delete_request', r.id::text,
    nullif(btrim(coalesce(p_reason, '')), ''), jsonb_build_object('entity', r.entity, 'count', cardinality(r.ids), 'deleted', v_n));
  return jsonb_build_object('ok', true, 'deleted', v_n);
end $$;
revoke all on function public.admin_crm_delete_decide(uuid, boolean, text) from public, anon;
grant execute on function public.admin_crm_delete_decide(uuid, boolean, text) to authenticated;

-- The restore list: what was deleted, by whom, when and from where, and when the job removes it; the bulk
-- deletes waiting for approval. An activity that went with its company is counted on the company's row.
create function public.admin_crm_trash(p_entity text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_days int := app.crm_limit('restore_window_days');
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_entity is not null and p_entity not in ('company', 'contact', 'activity') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  perform app.admin_log('crm.trash', null, null, null, null, jsonb_build_object('entity', p_entity));
  return (
    with del as (
      select 'company'::text as entity, c.id, c.deleted_at, c.deleted_by, c.deleted_source, true as restorable,
             (select count(*) from app.crm_activities a where a.deleted_with = c.id) as with_activities
      from app.crm_companies c where c.deleted_at is not null
      union all
      select 'contact', c.id, c.deleted_at, c.deleted_by, c.deleted_source, true, 0
      from app.crm_contacts c where c.deleted_at is not null
      union all
      select 'activity', a.id, a.deleted_at, a.deleted_by, a.deleted_source,
             exists (select 1 from app.crm_companies c where c.id = a.company_id and c.deleted_at is null), 0
      from app.crm_activities a where a.deleted_at is not null and a.deleted_with is null
    )
    select jsonb_build_object('ok', true,
      'window', v_days,
      'approval', app.crm_choice('delete_approval') = 'on',
      'may_write', app.crm_can_write(),
      'may_purge', coalesce(app.admin_role() = 'super_admin', false),
      'counts', jsonb_build_object(
        'company', (select count(*) from del where entity = 'company'),
        'contact', (select count(*) from del where entity = 'contact'),
        'activity', (select count(*) from del where entity = 'activity')),
      'rows', (select coalesce(jsonb_agg(jsonb_build_object('entity', x.entity, 'id', x.id, 'label', app.crm_record_label(x.entity, x.id),
                 'deleted_at', x.deleted_at, 'deleted_by', u.email, 'source', x.deleted_source, 'restorable', x.restorable,
                 'with_activities', x.with_activities,
                 'purge_at', case when v_days is not null then x.deleted_at + make_interval(days => v_days) end)
               order by x.deleted_at desc, x.id), '[]')
               from del x left join auth.users u on u.id = x.deleted_by
               where p_entity is null or x.entity = p_entity),
      'requests', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'entity', q.entity, 'count', cardinality(q.ids),
                     'names', (select coalesce(jsonb_agg(app.crm_record_label(q.entity, i.id) order by i.n), '[]')
                               from unnest(q.ids) with ordinality i(id, n) where i.n <= 5),
                     'reason', q.reason, 'requested_at', q.requested_at, 'requested_by', u.email, 'mine', q.requested_by = auth.uid())
                   order by q.requested_at), '[]')
                   from app.crm_delete_requests q left join auth.users u on u.id = q.requested_by
                   where q.status = 'pending'))
  );
end $$;
revoke all on function public.admin_crm_trash(text) from public, anon;
grant execute on function public.admin_crm_trash(text) to authenticated;

create function public.admin_crm_restore(p_entity text, p_ids uuid[], p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_r jsonb;
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not app.crm_reason_ok(p_reason) then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'setting', 'typed_reason');
  end if;
  if p_entity not in ('company', 'contact', 'activity') or p_ids is null or cardinality(p_ids) < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  v_r := app.crm_undelete(p_entity, p_ids);
  if (v_r->>'restored')::int = 0 then
    return jsonb_build_object('ok', false, 'error', case when p_entity = 'activity' then 'company_deleted' else 'not_found' end);
  end if;
  perform app.admin_log('crm.restore', null, 'crm_' || p_entity, case when cardinality(p_ids) = 1 then p_ids[1]::text end,
    nullif(btrim(coalesce(p_reason, '')), ''), jsonb_build_object('entity', p_entity) || v_r);
  return jsonb_build_object('ok', true) || v_r;
end $$;
revoke all on function public.admin_crm_restore(text, uuid[], text) from public, anon;
grant execute on function public.admin_crm_restore(text, uuid[], text) to authenticated;

-- Delete permanently, before the window ends: a super-admin's call (a privacy request should not wait)
create function public.admin_crm_purge_now(p_entity text, p_ids uuid[], p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  if app.admin_role() is distinct from 'super_admin' then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not app.crm_reason_ok(p_reason) then
    return jsonb_build_object('ok', false, 'error', 'reason_required', 'setting', 'typed_reason');
  end if;
  if p_entity not in ('company', 'contact', 'activity') or p_ids is null or cardinality(p_ids) < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  v_n := app.crm_purge(p_entity, p_ids);
  if v_n = 0 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform app.admin_log('crm.purge', null, 'crm_' || p_entity, case when cardinality(p_ids) = 1 then p_ids[1]::text end,
    nullif(btrim(coalesce(p_reason, '')), ''), jsonb_build_object('entity', p_entity, 'count', v_n));
  return jsonb_build_object('ok', true, 'purged', v_n);
end $$;
revoke all on function public.admin_crm_purge_now(text, uuid[], text) from public, anon;
grant execute on function public.admin_crm_purge_now(text, uuid[], text) to authenticated;

-- ------------------------------------------------------------------------------------------ the readers
-- Each function below leaves a deleted record out (the reviewed list is in crm_restore_invariants.sql)

CREATE OR REPLACE FUNCTION app.crm_mailable(c app.crm_contacts)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select c.status = 'active'
    -- 0195: a contact in the restore list is never mailed
    and c.deleted_at is null
    and not app.crm_suppressed(c.email)
    and (c.basis = 'consent'
         or (c.basis = 'business' and app.crm_role_address(c.email))
         or (c.basis = 'customer' and (select s.customer_exception from app.crm_settings s)
             and app.crm_type(c.user_id, c.org_id, c.source) = 'customer'))
    -- 0193: the engagement window is a setting, 12 months by default; unlimited means no expiry
    and (app.crm_limit('mailable_engagement_months') is null
         or coalesce(c.last_engaged_at, c.consent_at, c.created_at) > now() - make_interval(months => app.crm_limit('mailable_engagement_months')))
$function$;

CREATE OR REPLACE FUNCTION app.crm_on_list(c app.crm_contacts, p_list uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select c.status = 'active'
    -- 0195: a contact in the restore list is never mailed
    and c.deleted_at is null
    and not app.crm_suppressed(c.email)
    and exists (select 1 from app.crm_list_members m where m.list_id = p_list and m.contact_id = c.id and m.status = 'subscribed')
    -- 0193: the engagement window is a setting, 12 months by default; unlimited means no expiry
    and (app.crm_limit('mailable_engagement_months') is null
         or coalesce(c.last_engaged_at, c.consent_at, c.created_at) > now() - make_interval(months => app.crm_limit('mailable_engagement_months')))
$function$;

CREATE OR REPLACE FUNCTION app.crm_contact_json(c app.crm_contacts)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'id', c.id, 'email', c.email, 'name', c.name, 'company', coalesce(co.name, c.company, o.name), 'org_number', coalesce(c.org_number, co.org_number, o.org_number),
    'org_id', c.org_id, 'org_name', o.name, 'company_id', c.company_id, 'role', c.role, 'source', c.source, 'basis', c.basis, 'status', c.status,
    'type', app.crm_type(c.user_id, c.org_id, c.source), 'mailable', app.crm_mailable(c), 'suppressed', app.crm_suppressed(c.email),
    'consent_at', c.consent_at, 'consent_source', c.consent_source, 'tags', to_jsonb(c.tags), 'lang', c.lang,
    'last_engaged_at', c.last_engaged_at, 'created_at', c.created_at, 'version', c.version,
    'lists', (select coalesce(jsonb_agg(l.key order by l.sort), '[]') from app.crm_list_members m join app.crm_lists l on l.id = m.list_id
              where m.contact_id = c.id and m.status = 'subscribed'))
  from (select 1) one
  left join app.organizations o on o.id = c.org_id
  -- 0195: a deleted company is not named
  left join app.crm_companies co on co.id = c.company_id and co.deleted_at is null
$function$;

CREATE OR REPLACE FUNCTION app.crm_company_json(co app.crm_companies)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select to_jsonb(co) - 'product_id' || jsonb_build_object(
    'owner_email', (select u.email::text from auth.users u where u.id = co.owner_id),
    'contacts', (select count(*) from app.crm_contacts c where c.company_id = co.id and c.deleted_at is null),
    'open_tasks', (select count(*) from app.crm_activities a where a.company_id = co.id and a.deleted_at is null and a.kind = 'task' and a.done_at is null),
    'contact_name', coalesce(
      (select coalesce(nullif(btrim(c.name), ''), c.email) from app.crm_contacts c where c.company_id = co.id and c.deleted_at is null order by c.created_at limit 1),
      co.manager_name))
$function$;

CREATE OR REPLACE FUNCTION public.admin_crm_companies(p_q text DEFAULT NULL::text, p_stage text DEFAULT NULL::text, p_owner uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_q text := nullif(lower(btrim(coalesce(p_q, ''))), '');
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.crm_sync();
  perform app.admin_log('crm.companies');
  return jsonb_build_object('ok', true,
    'stages', (select coalesce(jsonb_object_agg(x.stage, x.n), '{}') from (select stage, count(*) n from app.crm_companies where deleted_at is null group by stage) x),
    'tasks_due', (select count(*) from app.crm_activities a where a.deleted_at is null and a.kind = 'task' and a.done_at is null and a.due_at <= current_date),
    'rows', (select coalesce(jsonb_agg(app.crm_company_json(co) order by co.next_step_at nulls last, co.updated_at desc), '[]') from (
        select co.* from app.crm_companies co
        -- 0195: a deleted company is in the restore list, not here
        where co.deleted_at is null and (v_q is null or lower(co.name) like '%' || v_q || '%' or co.org_number = v_q or v_q = any (co.tags))
          and (p_stage is null or co.stage = p_stage)
          and (p_owner is null or co.owner_id = p_owner)
        order by co.next_step_at nulls last, co.updated_at desc limit app.crm_limit('limit_company_read')) co),
    -- 0192: the list's cap is a setting (null: every company); the page says when it is reached
    'limit', app.crm_limit('limit_company_read'));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_contacts(p_q text DEFAULT NULL::text, p_type text DEFAULT NULL::text, p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_q text := nullif(lower(btrim(coalesce(p_q, ''))), '');
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.crm_sync();
  perform app.admin_log('crm.contacts', null, null, null, null, jsonb_build_object('q', v_q is not null, 'type', p_type));
  return jsonb_build_object('ok', true,
    'counts', (select jsonb_build_object(
        'total', count(*),
        'prospect', count(*) filter (where t = 'prospect'), 'trial', count(*) filter (where t = 'trial'),
        'customer', count(*) filter (where t = 'customer'), 'former', count(*) filter (where t = 'former'),
        'mailable', count(*) filter (where m), 'pending', count(*) filter (where st = 'pending'),
        'unsubscribed', count(*) filter (where st = 'unsubscribed'))
      from (select app.crm_type(c.user_id, c.org_id, c.source) t, app.crm_mailable(c) m, c.status st from app.crm_contacts c where c.deleted_at is null) x),
    'suppressed', (select count(*) from app.crm_suppression),
    'customer_exception', (select s.customer_exception from app.crm_settings s),
    'waiting', (select count(*) from app.crm_sends s where s.status in ('pending', 'sending')),
    'rows', (select coalesce(jsonb_agg(app.crm_contact_json(c) order by c.created_at desc), '[]') from (
        select c.* from app.crm_contacts c left join app.organizations o on o.id = c.org_id
        -- 0195: a deleted contact is in the restore list, not here
        where c.deleted_at is null and (v_q is null or c.email like '%' || v_q || '%' or lower(coalesce(c.name, '')) like '%' || v_q || '%'
               or lower(coalesce(c.company, o.name, '')) like '%' || v_q || '%' or v_q = any (c.tags))
          and (p_type is null or app.crm_type(c.user_id, c.org_id, c.source) = p_type)
        -- 0192: no cap unless the setting sets one; a caller's own p_limit narrows it further
        order by c.created_at desc
        -- (greatest() skips a null, so a missing p_limit is spelled out rather than greatest(null, 1) = 1)
        limit nullif(least(case when p_limit is null then 2147483647 else greatest(p_limit, 1) end,
                           coalesce(app.crm_limit('limit_contact_read'), 2147483647)), 2147483647)) c),
    'limit', app.crm_limit('limit_contact_read'));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_company(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_co app.crm_companies;
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select * into v_co from app.crm_companies where id = p_id;
  if v_co.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  -- 0195: a deleted company is read from the restore list; its page says so
  if v_co.deleted_at is not null then
    return jsonb_build_object('ok', false, 'error', 'deleted');
  end if;
  perform app.admin_log('crm.company', v_co.org_id, 'crm_company', p_id::text);
  return jsonb_build_object('ok', true, 'company', app.crm_company_json(v_co),
    -- the score a «lead score» callback is made at (app.lead_rules), for its title
    'rules', app.lead_rules(),
    'contacts', (select coalesce(jsonb_agg(app.crm_contact_json(c) order by c.created_at), '[]') from app.crm_contacts c where c.company_id = p_id and c.deleted_at is null),
    'activities', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'body', a.body, 'due_at', a.due_at, 'done_at', a.done_at,
                     'admin_email', a.admin_email, 'created_at', a.created_at,
                     'contact', (select coalesce(c.name, c.email) from app.crm_contacts c where c.id = a.contact_id),
                     'origin', a.origin,
                     'trigger', (select t.kind from app.brreg_outreach o join app.brreg_triggers t on t.id = o.trigger_id where o.activity_id = a.id),
                     'stopped', a.kind = 'task' and app.brreg_task_objected(a.id)) order by a.created_at desc), '[]')
                   from app.crm_activities a where a.company_id = p_id and a.deleted_at is null),
    'mail', (select jsonb_build_object('sent', count(*) filter (where s.status = 'sent'), 'opened', count(*) filter (where s.opened_at is not null),
                     'clicked', count(*) filter (where s.clicked_at is not null), 'last_at', max(s.sent_at))
             from app.crm_sends s join app.crm_contacts c on c.id = s.contact_id where c.company_id = p_id and s.kind = 'campaign'),
    'admins', (select coalesce(jsonb_agg(jsonb_build_object('id', a.user_id, 'email', u.email) order by u.email), '[]')
               from app.platform_admins a join auth.users u on u.id = a.user_id
               where a.active and a.role in ('super_admin', 'marketing')));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_contact(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_c app.crm_contacts;
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select * into v_c from app.crm_contacts where id = p_id;
  if v_c.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  -- 0195: a deleted contact is read from the restore list; its page says so
  if v_c.deleted_at is not null then
    return jsonb_build_object('ok', false, 'error', 'deleted');
  end if;
  perform app.admin_log('crm.contact', v_c.org_id, 'crm_contact', p_id::text);
  return jsonb_build_object('ok', true, 'contact', app.crm_contact_json(v_c),
    'timeline', (select coalesce(jsonb_agg(jsonb_build_object(
        'kind', s.kind, 'campaign_id', s.campaign_id, 'campaign', g.name, 'status', s.status, 'created_at', s.created_at,
        'sent_at', s.sent_at, 'delivery', s.delivery, 'opened_at', s.opened_at, 'clicked_at', s.clicked_at,
        'unsubscribed_at', s.unsubscribed_at) order by s.created_at desc), '[]')
      from app.crm_sends s left join app.crm_campaigns g on g.id = s.campaign_id where s.contact_id = p_id));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.crm_sync();
  perform app.admin_log('crm.overview');
  return jsonb_build_object('ok', true,
    'mail', (select jsonb_build_object(
        'campaigns', count(distinct s.campaign_id), 'sent', count(*),
        'open_rate', round(avg((s.opened_at is not null)::int) * 100, 1),
        'click_rate', round(avg((s.clicked_at is not null)::int) * 100, 1),
        'ctor', round(100.0 * count(*) filter (where s.clicked_at is not null) / nullif(count(*) filter (where s.opened_at is not null), 0), 1),
        'unsubscribe_rate', round(avg((s.unsubscribed_at is not null)::int) * 100, 2),
        'bounce_rate', round(avg((s.delivery in ('hard_bounce', 'soft_bounce', 'invalid', 'blocked'))::int) * 100, 2))
      from app.crm_sends s where s.kind = 'campaign' and s.status = 'sent' and s.sent_at > now() - interval '90 days'),
    'subscribers', (select jsonb_build_object(
        'total', count(distinct m.contact_id) filter (where m.status = 'subscribed'),
        'joined_30d', count(*) filter (where m.subscribed_at > now() - interval '30 days'),
        'left_30d', count(*) filter (where m.unsubscribed_at > now() - interval '30 days'))
      from app.crm_list_members m),
    'pipeline', (select coalesce(jsonb_object_agg(x.stage, x.n), '{}') from (select stage, count(*) n from app.crm_companies where deleted_at is null group by stage) x),
    'won_90d', (select count(*) from app.crm_companies c where c.deleted_at is null and c.stage = 'customer' and c.stage_changed_at > now() - interval '90 days'),
    'trials_90d', (select count(*) from app.crm_companies c where c.deleted_at is null and c.stage in ('trial', 'customer') and c.created_at > now() - interval '90 days'
                   and c.source = 'signup'),
    'tasks_due', (select count(*) from app.crm_activities a where a.deleted_at is null and a.kind = 'task' and a.done_at is null and a.due_at <= current_date),
    'signups_from_email', (select count(*) from app.org_attribution a where a.channel = 'email'));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_pipeline_summary(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_quarter timestamptz := date_trunc('quarter', now() at time zone 'Europe/Oslo') at time zone 'Europe/Oslo';
  v_history timestamptz := (select s.stage_history_since from app.crm_settings s where s.id);
  v_since timestamptz;
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  v_since := greatest(coalesce(p_from, v_quarter), coalesce(v_history, now()));
  return jsonb_build_object('ok', true,
    'stages', (select coalesce(jsonb_agg(jsonb_build_object('key', x.key, 'count', x.n, 'valued', x.valued, 'value', x.value) order by x.sort), '[]')
               from (select s.key, s.sort, count(c.id) as n, count(c.value_nok) as valued, coalesce(sum(c.value_nok), 0) as value
                     from app.crm_stages s left join app.crm_companies c on c.stage = s.key and c.deleted_at is null
                     group by s.key, s.sort) x),
    'open', (select jsonb_build_object('count', count(*), 'valued', count(c.value_nok), 'value', coalesce(sum(c.value_nok), 0))
             from app.crm_companies c join app.crm_stages s on s.key = c.stage
             where c.deleted_at is null and s.kind = 'open' and s.archived_at is null),
    'won_quarter', (select jsonb_build_object('count', count(*), 'valued', count(c.value_nok), 'value', coalesce(sum(c.value_nok), 0))
                    from app.crm_companies c join app.crm_stages s on s.key = c.stage
                    where c.deleted_at is null and s.kind = 'won' and c.stage_changed_at >= v_quarter),
    'closed', (select jsonb_build_object('won', count(*) filter (where x.to_kind = 'won'), 'lost', count(*) filter (where x.to_kind = 'lost'))
               from (select distinct on (h.company_id) h.company_id, h.to_kind
                     from app.crm_stage_changes h
                     join app.crm_companies hc on hc.id = h.company_id and hc.deleted_at is null
                     where h.changed_at >= v_since and h.to_kind in ('won', 'lost') and h.from_kind in ('open', 'parked')
                     order by h.company_id, h.changed_at desc, h.id desc) x),
    'since', v_since,
    'history_since', v_history,
    'quarter', v_quarter);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_stages()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true,
    'reply_stage', (select s.reply_stage from app.crm_settings s),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('key', s.key, 'name', s.name, 'sort', s.sort, 'kind', s.kind, 'managed', s.managed,
               'archived', s.archived_at is not null, 'exit_criterion', s.exit_criterion,
               'companies', (select count(*) from app.crm_companies co where co.stage = s.key and co.deleted_at is null),
               'campaigns', (select count(*) from app.crm_campaigns c where s.key in (c.stage_target, c.stage_on_send)))
             order by s.sort, s.key), '[]') from app.crm_stages s));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_inbox(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
  v_sla int := (select s.sla_minutes from app.crm_settings s where s.id);
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.crm_sync();
  perform app.admin_log('crm.inbox');
  return (
    with leads as (
      -- a trial sign-up: the company the sign-up made
      select 'trial'::text as kind, co.id as company_id, null::uuid as contact_id, co.name as company,
             (select coalesce(c.name, c.email) from app.crm_contacts c where c.company_id = co.id order by c.created_at limit 1) as person,
             co.employees, co.stage, co.created_at,
             (select min(a.created_at) from app.crm_activities a where a.company_id = co.id
                and a.kind in ('call', 'email', 'meeting', 'reply', 'note') and a.created_at >= co.created_at) as answered_at
      from app.crm_companies co
      where co.deleted_at is null and co.source = 'signup' and co.created_at >= now() - make_interval(days => v_days)
      union all
      -- someone who wrote to us or asked for a demo
      select c.source, c.company_id, c.id, coalesce(co.name, c.company), coalesce(c.name, c.email),
             co.employees, co.stage, c.created_at,
             (select min(a.created_at) from app.crm_activities a where (a.contact_id = c.id or (c.company_id is not null and a.company_id = c.company_id))
                and a.kind in ('call', 'email', 'meeting', 'reply', 'note') and a.created_at >= c.created_at)
      from app.crm_contacts c left join app.crm_companies co on co.id = c.company_id and co.deleted_at is null
      where c.deleted_at is null and c.source in ('contact_form', 'demo') and c.created_at >= now() - make_interval(days => v_days)
    ),
    week as (select * from leads where created_at >= now() - interval '7 days')
    select jsonb_build_object('ok', true, 'sla_minutes', v_sla,
      'awaiting', (select count(*) from leads where answered_at is null),
      'week', jsonb_build_object(
        'leads', (select count(*) from week),
        'trials', (select count(*) from week where kind = 'trial'),
        'answered', (select count(*) from week where answered_at is not null),
        'median_minutes', (select percentile_cont(0.5) within group (order by extract(epoch from answered_at - created_at) / 60)
                           from week where answered_at is not null),
        'within_sla', (select count(*) from week where answered_at is not null and answered_at - created_at <= make_interval(mins => v_sla))),
      'rows', (select coalesce(jsonb_agg(jsonb_build_object('kind', l.kind, 'company_id', l.company_id, 'contact_id', l.contact_id,
                 'company', l.company, 'person', l.person, 'employees', l.employees, 'stage', l.stage,
                 'created_at', l.created_at, 'answered_at', l.answered_at)
               order by (l.answered_at is not null), l.created_at desc), '[]') from leads l))
  );
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_tasks()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true, 'rows', (
    select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'company_id', a.company_id, 'company', co.name, 'body', a.body, 'due_at', a.due_at,
      'admin_email', a.admin_email) order by a.due_at nulls last, a.created_at), '[]')
    from app.crm_activities a join app.crm_companies co on co.id = a.company_id
    where a.deleted_at is null and co.deleted_at is null and a.kind = 'task' and a.done_at is null));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_task_list(p_view text DEFAULT 'open'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if coalesce(p_view, '') not in ('open', 'done', 'all') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  -- contacts' names, a register's general manager and outreach addresses: read under audit
  perform app.admin_log('crm.task_list', null, null, null, null, jsonb_build_object('view', p_view));
  return jsonb_build_object('ok', true,
    -- the score a «lead score» callback was made at (app.lead_rules), for its title
    'rules', app.lead_rules(),
    'counts', (select jsonb_build_object(
        'open', count(*) filter (where a.done_at is null),
        'done', count(*) filter (where a.done_at > now() - interval '90 days'),
        'all', count(*) filter (where a.done_at is null or a.done_at > now() - interval '90 days'),
        -- 0143: made by a journey, a rule or a trigger; and the open ones on a one-hour SLA
        'automated', count(*) filter (where (a.campaign_id is not null or a.origin is not null)
                                        and (a.done_at is null or a.done_at > now() - interval '90 days')),
        'sla_open', count(*) filter (where a.sla_due_at is not null and a.done_at is null))
      from app.crm_activities a where a.deleted_at is null and a.kind = 'task'),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'company_id', a.company_id, 'company', co.name,
        'contact', (select coalesce(nullif(btrim(c.name), ''), c.email) from app.crm_contacts c where c.id = a.contact_id),
        'body', a.body, 'due_at', a.due_at, 'done_at', a.done_at, 'created_at', a.created_at, 'admin_email', a.admin_email,
        'skipped', a.skipped, 'campaign_id', a.campaign_id, 'step_kind', st.step_kind,
        'journey', (select r.name from app.crm_campaigns r where r.id = app.crm_chain_root(st.id)),
        'origin', a.origin, 'rule', a.rule, 'task_kind', a.task_kind, 'sla_due_at', a.sla_due_at,
        'sla_left', case when a.sla_due_at is not null and a.done_at is null then app.business_minutes(now(), a.sla_due_at) end,
        'sla_met', case when a.sla_due_at is not null and a.done_at is not null then a.done_at <= a.sla_due_at end,
        'trigger', (select t.kind from app.brreg_outreach o join app.brreg_triggers t on t.id = o.trigger_id where o.activity_id = a.id),
        'manager', (select o.manager_name from app.brreg_outreach o where o.activity_id = a.id),
        -- where the outreach goes: a letter to the business address the register gives, an email to the
        -- generic address (never one on the suppression list: brreg_suppression_reroute makes such an
        -- outreach a call or a letter, and this reads the list again); and whether an objection stopped it
        'to', (select case o.channel when 'letter' then e.address
                                     when 'email' then case when not app.crm_suppressed(o.email) then o.email end end
               from app.brreg_outreach o join app.brreg_entities e on e.org_number = o.org_number where o.activity_id = a.id),
        'stopped', app.brreg_task_objected(a.id))
        order by (a.done_at is not null), a.sla_due_at nulls last, a.due_at nulls last, a.done_at desc, a.created_at), '[]')
      from app.crm_activities a join app.crm_companies co on co.id = a.company_id
      left join app.crm_campaigns st on st.id = a.campaign_id
      where a.deleted_at is null and co.deleted_at is null and a.kind = 'task'
        and case p_view when 'open' then a.done_at is null
                        when 'done' then a.done_at > now() - interval '90 days'
                        else a.done_at is null or a.done_at > now() - interval '90 days' end));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_attention()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role app.platform_role := app.admin_role();
  v_support boolean;
  v_finance boolean;
begin
  if v_role is null or v_role = 'editor' then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  v_support := v_role in ('super_admin', 'support');
  v_finance := v_role in ('super_admin', 'support', 'finance');
  return jsonb_build_object('ok', true,
    'trials', (
      select coalesce(jsonb_agg(jsonb_build_object('org_id', o.id, 'name', o.name, 'ends_at', b.trial_ends_at,
               'employees', (select count(*) from app.employees e where e.org_id = o.id and e.active))
             order by b.trial_ends_at), '[]')
      from app.billing b join app.organizations o on o.id = b.org_id
      where not app.is_demo(o.id) and b.confirmed_at is null and b.cancelled_at is null
        and b.trial_ends_at > now() and b.trial_ends_at <= now() + interval '7 days'),
    'deletions', case when v_finance then (
      select coalesce(jsonb_agg(jsonb_build_object('org_id', o.id, 'name', o.name, 'due_at', b.deletion_due_at) order by b.deletion_due_at), '[]')
      from app.billing b join app.organizations o on o.id = b.org_id
      where not app.is_demo(o.id) and b.deletion_due_at is not null and b.deletion_due_at <= now() + interval '14 days') else '[]'::jsonb end,
    'tickets', case when v_support then (
      select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'number', t.number, 'subject', t.subject, 'org_name', coalesce(o.name, t.requester_org),
               'due_at', t.first_response_due) order by t.first_response_due), '[]')
      from app.tickets t left join app.organizations o on o.id = t.org_id
      where t.status not in ('resolved', 'closed') and t.first_responded_at is null and t.first_response_due < now()) else '[]'::jsonb end,
    'failures', case when v_support then (
      select count(*) from app.outbox x where x.failed_at > now() - interval '24 hours') else 0 end,
    'tasks', case when app.crm_can_read() then (
      select count(*) from app.crm_activities a where a.deleted_at is null and a.kind = 'task' and a.done_at is null and a.due_at < now()) else 0 end);
end $function$;

CREATE OR REPLACE FUNCTION app.lead_contacts()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select c.id from app.crm_contacts c
  join app.crm_companies co on co.id = c.company_id
  join app.crm_stages s on s.key = co.stage
  where c.product_id = 'orgpuls' and c.deleted_at is null and co.deleted_at is null and s.kind = 'open' and s.archived_at is null
$function$;

CREATE OR REPLACE FUNCTION app.crm_segment_contacts(f jsonb)
 RETURNS SETOF app.crm_contacts
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select c.* from app.crm_contacts c
  left join app.organizations o on o.id = c.org_id
  left join app.crm_companies co on co.id = c.company_id and co.deleted_at is null
  -- 0195: a deleted contact is in no segment
  where c.deleted_at is null and app.crm_filter_ok(f)
    and (not f ? 'types' or app.crm_type(c.user_id, c.org_id, c.source) in (select jsonb_array_elements_text(f->'types')))
    and (not f ? 'roles' or c.role in (select jsonb_array_elements_text(f->'roles')))
    and (not f ? 'sources' or c.source in (select jsonb_array_elements_text(f->'sources')))
    and (not f ? 'bases' or c.basis in (select jsonb_array_elements_text(f->'bases')))
    and (not f ? 'stages' or co.stage in (select jsonb_array_elements_text(f->'stages')))
    and (not f ? 'lists' or exists (select 1 from app.crm_list_members m join app.crm_lists l on l.id = m.list_id
                                    where m.contact_id = c.id and m.status = 'subscribed'
                                      and l.key in (select jsonb_array_elements_text(f->'lists'))))
    and (not f ? 'tags' or c.tags && array(select jsonb_array_elements_text(f->'tags')))
    and (not f ? 'lang' or c.lang = f->>'lang')
    and (not f ? 'min_employees' or coalesce(o.employee_count, co.employees, 0) >= (f->>'min_employees')::numeric)
    and (not f ? 'max_employees' or coalesce(o.employee_count, co.employees, 0) <= (f->>'max_employees')::numeric)
    and (not f ? 'nace' or coalesce(o.registry_nace_code, co.nace_code) like (f->>'nace') || '%')
    and (not f ? 'no_survey_days' or (c.org_id is not null and not exists (
          select 1 from app.rounds r where r.org_id = c.org_id and r.status in ('apen', 'lukket')
            and r.opens_at > now() - make_interval(days => (f->>'no_survey_days')::int))))
    and (not coalesce((f->>'mailable_only')::boolean, false) or app.crm_mailable(c))
$function$;

CREATE OR REPLACE FUNCTION app.crm_follow_audience(v_c app.crm_campaigns)
 RETURNS TABLE(contact_id uuid, email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with reached as (
    select p.contact_id, p.sent_at as at, p.sent_at as since, p.clicked_at, p.opened_at, p.unsubscribed_at, p.delivery::text as delivery
    from app.crm_sends p
    where p.campaign_id = v_c.follows_id and p.kind = 'campaign' and p.status = 'sent'
    union all
    select a.contact_id, a.done_at, a.created_at, null::timestamptz, null::timestamptz, null::timestamptz, null::text
    from app.crm_activities a
    where a.campaign_id = v_c.follows_id and a.kind = 'task' and a.done_at is not null and a.contact_id is not null
  )
  select c.id, c.email
  from reached p
  join app.crm_campaigns pc on pc.id = v_c.follows_id
  join app.crm_contacts c on c.id = p.contact_id
  -- 0195: a deleted company counts as none: its stage matches nothing and it gets no task
  left join app.crm_companies co on co.id = c.company_id and co.deleted_at is null
  where p.at <= now() - make_interval(days => v_c.follow_days)
    and p.unsubscribed_at is null and coalesce(p.delivery, '') not in ('hard_bounce', 'invalid', 'blocked', 'spam')
    and (v_c.follow_when <> 'no_click' or p.clicked_at is null)
    and (v_c.follow_when <> 'no_open' or (p.opened_at is null and p.clicked_at is null))
    -- an answer ends the conversation's automation
    and (co.id is null or not exists (select 1 from app.crm_activities a where a.company_id = co.id and a.kind = 'reply' and a.created_at >= p.since))
    -- won, lost or parked companies are not chased
    and (co.id is null or not exists (select 1 from app.crm_stages st where st.key = co.stage and st.kind in ('won', 'lost', 'parked')))
    and (coalesce(pc.stage_on_send, pc.stage_target) is null or co.stage = coalesce(pc.stage_on_send, pc.stage_target))
    and (v_c.stage_target is null or co.stage = v_c.stage_target)
    and case when v_c.list_id is not null then app.crm_on_list(c, v_c.list_id) else app.crm_mailable(c) end
    -- 0137: a call or LinkedIn step makes a task, and a task belongs to a company
    and (v_c.step_kind = 'mail' or co.id is not null)
$function$;

CREATE OR REPLACE FUNCTION app.crm_step_tasks()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_cc app.crm_campaigns;
  v_n int := 0;
  v_k int;
begin
  for v_cc in select * from app.crm_campaigns where step_kind <> 'mail' and status in ('scheduled', 'sending') and scheduled_at <= now()
      for update skip locked loop
    insert into app.crm_activities (company_id, contact_id, kind, body, due_at, admin_id, admin_email, campaign_id)
    select c.company_id, x.contact_id, 'task', left(btrim(v_cc.subject), 4000), (now() at time zone 'Europe/Oslo')::date,
           co.owner_id, (select u.email::text from auth.users u where u.id = co.owner_id), v_cc.id
    from app.crm_follow_audience(v_cc) x
    join app.crm_contacts c on c.id = x.contact_id
    join app.crm_companies co on co.id = c.company_id and co.deleted_at is null
    where not exists (select 1 from app.crm_activities a where a.campaign_id = v_cc.id and a.contact_id = x.contact_id)
    on conflict do nothing;
    get diagnostics v_k = row_count;
    v_n := v_n + v_k;
    update app.crm_companies co set last_activity_at = now()
    where exists (select 1 from app.crm_activities a where a.campaign_id = v_cc.id and a.company_id = co.id and a.created_at = now());
    update app.crm_campaigns c set status = 'sending', started_at = coalesce(c.started_at, now()),
      audience = (select count(*) from app.crm_activities a where a.campaign_id = c.id and a.kind = 'task'), updated_at = now()
    where c.id = v_cc.id;
  end loop;
  return v_n;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_mail_claim(p_batch integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_c record;
  v_cc app.crm_campaigns;
  v_n int;
  v_test int;
  v_jobs jsonb := '[]';
  v_s record;
  v_token text;
  v_a numeric;
  v_b numeric;
  v_filter jsonb;
  v_left int;
begin
  -- start what is due: the audience, split for an A/B test when there is a subject B
  for v_c in select * from app.crm_campaigns where status = 'scheduled' and scheduled_at <= now() and not follow_auto for update skip locked loop
    v_filter := (select g.filter from app.crm_segments g where g.id = v_c.segment_id);
    if v_c.follows_id is not null then
      -- 0093, 0111: a follow-up goes to those the first mail reached the given days ago who have
      -- not answered, unsubscribed, bounced or moved on
      select * into v_cc from app.crm_campaigns where id = v_c.id;
      insert into app.crm_sends (kind, campaign_id, contact_id, to_email)
      select 'campaign', v_c.id, x.contact_id, x.email from app.crm_follow_audience(v_cc) x
      on conflict do nothing;
    elsif v_c.list_id is not null then
      insert into app.crm_sends (kind, campaign_id, contact_id, to_email)
      select 'campaign', v_c.id, c.id, c.email from app.crm_contacts c
      where app.crm_on_list(c, v_c.list_id)
        and (v_filter is null or c.id in (select x.id from app.crm_segment_contacts(v_filter) x))
        and (v_c.stage_target is null or exists (select 1 from app.crm_companies co where co.id = c.company_id and co.stage = v_c.stage_target and co.deleted_at is null))
      on conflict do nothing;
    elsif v_c.segment_id is null and v_c.stage_target is not null then
      insert into app.crm_sends (kind, campaign_id, contact_id, to_email)
      select 'campaign', v_c.id, c.id, c.email from app.crm_contacts c join app.crm_companies co on co.id = c.company_id
      where co.stage = v_c.stage_target and co.deleted_at is null and app.crm_mailable(c) and c.lang = v_c.lang
      on conflict do nothing;
    else
      insert into app.crm_sends (kind, campaign_id, contact_id, to_email)
      select 'campaign', v_c.id, s.id, s.email
      from (select distinct on (x.id) x.* from app.crm_segment_contacts(coalesce(v_filter, '{"types":[]}')) x) s
      where app.crm_mailable(s) and s.lang = v_c.lang
        and (v_c.stage_target is null or exists (select 1 from app.crm_companies co where co.id = s.company_id and co.stage = v_c.stage_target and co.deleted_at is null))
      on conflict do nothing;
    end if;
    get diagnostics v_n = row_count;
    if btrim(v_c.subject_b) <> '' and v_n >= 4 then
      v_test := greatest(2, (v_n * v_c.ab_percent / 100));
      with ranked as (
        select s.id, row_number() over (order by random()) as rn from app.crm_sends s where s.campaign_id = v_c.id and s.kind = 'campaign'
      )
      update app.crm_sends s set
        variant = case when r.rn <= v_test then case when r.rn % 2 = 1 then 'a' else 'b' end end,
        status = case when r.rn <= v_test then 'pending' else 'held' end
      from ranked r where r.id = s.id;
    else
      update app.crm_sends set variant = 'a' where campaign_id = v_c.id and kind = 'campaign';
    end if;
    update app.crm_campaigns set status = 'sending', started_at = now(), audience = v_n, updated_at = now() where id = v_c.id;
  end loop;

  -- 0111: automatic follow-ups add whoever has come due, in business hours
  if app.crm_business_hours() then
    for v_cc in select * from app.crm_campaigns where status in ('scheduled', 'sending') and follow_auto and step_kind = 'mail' and scheduled_at <= now()
        for update skip locked loop
      insert into app.crm_sends (kind, campaign_id, contact_id, to_email, variant)
      select 'campaign', v_cc.id, x.contact_id, x.email, 'a' from app.crm_follow_audience(v_cc) x
      on conflict do nothing;
      update app.crm_campaigns c set status = 'sending', started_at = coalesce(c.started_at, now()),
        audience = (select count(*) from app.crm_sends s where s.campaign_id = c.id and s.kind = 'campaign'), updated_at = now()
      where c.id = v_cc.id;
    end loop;
    -- 0137: call and LinkedIn steps make a task for each contact who has come due
    perform app.crm_step_tasks();
  end if;
  -- … and are done once the step before is done and its last contact's time has passed
  update app.crm_campaigns c set status = 'sent', finished_at = now(), updated_at = now()
  where c.follow_auto and c.status in ('scheduled', 'sending') and app.crm_follow_done(c);

  -- decide A/B tests whose wait is over, and release the rest with the winner
  for v_c in select * from app.crm_campaigns where status = 'sending' and btrim(subject_b) <> '' and ab_decided_at is null
      and started_at + make_interval(hours => ab_wait_hours) <= now() for update skip locked loop
    select
      avg(case when v_c.ab_metric = 'click' then (s.clicked_at is not null)::int else (s.opened_at is not null)::int end) filter (where s.variant = 'a'),
      avg(case when v_c.ab_metric = 'click' then (s.clicked_at is not null)::int else (s.opened_at is not null)::int end) filter (where s.variant = 'b')
      into v_a, v_b
    from app.crm_sends s where s.campaign_id = v_c.id and s.kind = 'campaign' and s.status = 'sent';
    update app.crm_campaigns set ab_winner = case when coalesce(v_b, 0) > coalesce(v_a, 0) then 'b' else 'a' end, ab_decided_at = now()
    where id = v_c.id;
    update app.crm_sends set status = 'pending', variant = case when coalesce(v_b, 0) > coalesce(v_a, 0) then 'b' else 'a' end
    where campaign_id = v_c.id and status = 'held';
  end loop;

  update app.crm_campaigns c set status = 'sent', finished_at = now(), updated_at = now()
  where c.status = 'sending' and not c.follow_auto
    and not exists (select 1 from app.crm_sends s where s.campaign_id = c.id and s.status in ('held', 'pending', 'sending'));

  -- 0111: the day's cap on campaign mail; tests and confirmations are never held by it
  v_left := (select s.daily_cap from app.crm_settings s where s.id)
          - (select count(*) from app.crm_sends s where s.kind = 'campaign' and s.status in ('sent', 'sending')
               and (coalesce(s.sent_at, now()) at time zone 'Europe/Oslo')::date = (now() at time zone 'Europe/Oslo')::date);

  for v_s in
    select s.id, s.kind, s.campaign_id, s.contact_id, s.to_email, s.variant from app.crm_sends s
    where (s.status = 'pending' or (s.status = 'sending' and s.leased_until < now())) and s.attempts < 5
      and (s.kind <> 'campaign' or v_left is null or v_left > 0)
    order by s.kind <> 'campaign' desc, s.created_at limit least(greatest(coalesce(p_batch, 25), 1), 50)
    for update skip locked
  loop
    if v_s.kind = 'campaign' and v_left is not null then
      if v_left <= 0 then continue; end if;
      v_left := v_left - 1;
    end if;
    if v_s.kind = 'campaign' and not coalesce((
        select case when g.list_id is not null then app.crm_on_list(c, g.list_id) else app.crm_mailable(c) end
        from app.crm_contacts c, app.crm_campaigns g where c.id = v_s.contact_id and g.id = v_s.campaign_id), false) then
      update app.crm_sends set status = 'skipped', to_email = null where id = v_s.id;
      continue;
    end if;
    if v_s.kind = 'optin' and exists (select 1 from app.crm_contacts c where c.id = v_s.contact_id and c.basis = 'consent' and c.status = 'active'
        and not exists (select 1 from app.crm_list_members m where m.contact_id = c.id and m.status = 'pending')) then
      update app.crm_sends set status = 'skipped', to_email = null where id = v_s.id;
      continue;
    end if;
    v_token := app.crm_new_token();
    if v_s.kind = 'optin' then
      update app.crm_contacts set optin_hash = app.crm_token_hash(v_token) where id = v_s.contact_id;
      update app.crm_sends set status = 'sending', leased_until = now() + interval '2 minutes', attempts = attempts + 1 where id = v_s.id;
    else
      update app.crm_sends set status = 'sending', leased_until = now() + interval '2 minutes', attempts = attempts + 1,
        unsub_hash = app.crm_token_hash(v_token) where id = v_s.id;
    end if;
    v_jobs := v_jobs || jsonb_build_object(
      'id', v_s.id, 'kind', v_s.kind, 'to_email', v_s.to_email, 'token', v_token,
      'name', (select c.name from app.crm_contacts c where c.id = v_s.contact_id),
      'basis', (select c.basis from app.crm_contacts c where c.id = v_s.contact_id),
      'company', (select coalesce(co.name, c.company) from app.crm_contacts c left join app.crm_companies co on co.id = c.company_id
                  where c.id = v_s.contact_id),
      'lang', coalesce((select g.lang from app.crm_campaigns g where g.id = v_s.campaign_id),
                       (select c.lang from app.crm_contacts c where c.id = v_s.contact_id), 'no'),
      'lists', case when v_s.kind = 'optin' then (
                 select coalesce(jsonb_agg(jsonb_build_object('name_no', l.name_no, 'name_en', l.name_en) order by l.sort), '[]')
                 from app.crm_list_members m join app.crm_lists l on l.id = m.list_id
                 where m.contact_id = v_s.contact_id and m.status = 'pending') end,
      'sender', (select jsonb_build_object('name', p.name, 'email', p.email, 'reply_to', p.reply_to)
                 from app.crm_campaigns g join app.crm_senders p on p.id = g.sender_id where g.id = v_s.campaign_id),
      'campaign', (select jsonb_build_object('kind', g.kind, 'style', g.style,
                     'signature', coalesce(nullif(btrim(g.signature), ''), (select p.signature from app.crm_senders p where p.id = g.sender_id), ''),
                     'subject', case when v_s.variant = 'b' and btrim(g.subject_b) <> '' then g.subject_b else g.subject end,
                     'preheader', g.preheader, 'blocks', g.blocks, 'utm_campaign', g.utm_campaign,
                     'web_slug', case when g.publish_web then g.slug end,
                     'list', (select jsonb_build_object('name_no', l.name_no, 'name_en', l.name_en) from app.crm_lists l where l.id = g.list_id))
                   from app.crm_campaigns g where g.id = v_s.campaign_id));
  end loop;
  return v_jobs;
end $function$;

CREATE OR REPLACE FUNCTION app.brreg_assign(p_outreach uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  o app.brreg_outreach;
  en app.brreg_entities;
  v_company uuid;
  v_task uuid;
begin
  select * into o from app.brreg_outreach x where x.id = p_outreach for update;
  if o.id is null or o.status <> 'queued' or o.channel is null then
    return false;
  end if;
  if exists (select 1 from app.brreg_dnc d where d.org_number = o.org_number) then
    -- stopped for good: the manager's name has no purpose left
    update app.brreg_outreach set status = 'do_not_contact', manager_name = null where id = o.id;
    return false;
  end if;
  select * into en from app.brreg_entities e where e.org_number = o.org_number;
  if o.channel = 'email' and (o.email is null or app.crm_suppressed(o.email)) then
    o.channel := case when en.phone is not null then 'phone' else 'letter' end;
    update app.brreg_outreach set channel = o.channel, email = null where id = o.id;
  end if;
  select c.id into v_company from app.crm_companies c where c.product_id = 'orgpuls' and c.org_number = o.org_number;
  -- 0195: a company in the restore list is not contacted; once restored or purged, the outreach goes ahead
  if exists (select 1 from app.crm_companies c where c.id = v_company and c.deleted_at is not null) then
    return false;
  end if;
  if v_company is null then
    insert into app.crm_companies (name, org_number, form_code, nace_code, employees, municipality, phone, source, stage)
    values (en.name, en.org_number, en.form_code, en.nace_code, en.employees, en.municipality, en.phone, 'brreg', 'new')
    returning id into v_company;
  end if;
  insert into app.crm_activities (company_id, kind, body, due_at, origin, rule, task_kind)
  values (v_company, 'task', 'auto:outreach_' || o.channel, app.next_workday(), 'trigger', 'R11',
          case o.channel when 'phone' then 'call' else o.channel end)
  returning id into v_task;
  update app.brreg_outreach set status = 'assigned', company_id = v_company, activity_id = v_task, assigned_at = now()
  where id = o.id;
  return true;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_activity(p_company uuid, p_contact uuid, p_kind text, p_body text, p_due date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_kind not in ('note', 'call', 'meeting', 'email', 'task', 'reply') or char_length(btrim(coalesce(p_body, ''))) not between 1 and 4000 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if not exists (select 1 from app.crm_companies c where c.id = p_company and c.deleted_at is null) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_contact is not null and not exists (select 1 from app.crm_contacts c where c.id = p_contact and c.company_id = p_company and c.deleted_at is null) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  perform app.crm_log(p_company, p_contact, p_kind, btrim(p_body), case when p_kind = 'task' then p_due end);
  -- a first call, mail or meeting moves a new prospect to "contacted"
  if p_kind in ('call', 'email', 'meeting') then
    update app.crm_companies set stage = 'contacted', stage_changed_at = now() where id = p_company and stage = 'new' and org_id is null;
  end if;
  -- 0093: an answer is the signal that counts (not an open, not a click): the company moves on to
  -- the stage the settings name for it, forward only
  if p_kind = 'reply' then
    perform app.crm_advance(p_company, (select s.reply_stage from app.crm_settings s), 'svar mottatt');
  end if;
  perform app.admin_log('crm.activity_add', null, 'crm_company', p_company::text);
  return jsonb_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_list_add(p_list uuid, p_contacts uuid[], p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_n int;
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p_source, ''))) < 3 then
    return jsonb_build_object('ok', false, 'error', 'consent_required');
  end if;
  if not exists (select 1 from app.crm_lists l where l.id = p_list and l.archived_at is null) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  insert into app.crm_list_members (list_id, contact_id, status, source, subscribed_at)
  select p_list, c.id, 'subscribed', left(btrim(p_source), 200), now()
  from app.crm_contacts c
  where c.id = any (coalesce(p_contacts, '{}')) and c.deleted_at is null and c.basis = 'consent' and c.status = 'active' and not app.crm_suppressed(c.email)
  on conflict (list_id, contact_id) do update set status = 'subscribed', subscribed_at = now(), unsubscribed_at = null, source = excluded.source
  where app.crm_list_members.status = 'pending';
  get diagnostics v_n = row_count;
  perform app.admin_log('crm.list_add', null, 'crm_list', p_list::text, p_source, jsonb_build_object('added', v_n));
  return jsonb_build_object('ok', true, 'added', v_n, 'refused', coalesce(cardinality(p_contacts), 0) - v_n);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_stage_move(p_ids uuid[], p_to text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_co app.crm_companies;
  v_to text;
  v_moved int := 0;
  v_skipped int := 0;
  v_max int := app.crm_limit('limit_bulk_move');
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_ids is null or cardinality(p_ids) < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if v_max is not null and cardinality(p_ids) > v_max then
    return jsonb_build_object('ok', false, 'error', 'too_many', 'setting', 'limit_bulk_move', 'limit', v_max);
  end if;
  if p_to is not null and not exists (select 1 from app.crm_stages s where s.key = p_to and not s.managed and s.archived_at is null) then
    return jsonb_build_object('ok', false, 'error', 'invalid_stage');
  end if;
  foreach v_id in array p_ids loop
    select * into v_co from app.crm_companies where id = v_id for update;
    if v_co.id is null or v_co.org_id is not null or v_co.deleted_at is not null then
      v_skipped := v_skipped + 1; continue;
    end if;
    v_to := coalesce(p_to, (
      select n.key from app.crm_stages cur, app.crm_stages n
      where cur.key = v_co.stage and cur.kind = 'open' and n.kind = 'open' and not n.managed and n.archived_at is null and n.sort > cur.sort
      order by n.sort limit 1));
    if v_to is null or v_to = v_co.stage then
      v_skipped := v_skipped + 1; continue;
    end if;
    update app.crm_companies set stage = v_to, stage_changed_at = now(), updated_at = now() where id = v_id;
    perform app.crm_log(v_id, null, 'stage', v_co.stage || ' → ' || v_to);
    v_moved := v_moved + 1;
  end loop;
  perform app.admin_log('crm.stage_move', null, 'crm_company', null, null,
    jsonb_build_object('to', coalesce(p_to, 'next'), 'moved', v_moved, 'skipped', v_skipped));
  return jsonb_build_object('ok', true, 'moved', v_moved, 'skipped', v_skipped);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_task_done(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if exists (select 1 from app.crm_activities a where a.id = p_id and a.done_at is not null) and app.brreg_task_objected(p_id) then
    return jsonb_build_object('ok', false, 'error', 'stopped');
  end if;
  -- 0137: reopening a task also takes back a skip
  update app.crm_activities set done_at = case when done_at is null then now() end, skipped = false where id = p_id and kind = 'task' and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform app.admin_log('crm.task_done', null, 'crm_activity', p_id::text);
  return jsonb_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_task_skip(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  update app.crm_activities set done_at = now(), skipped = true
  where id = p_id and kind = 'task' and campaign_id is not null and done_at is null and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform app.admin_log('crm.task_skip', null, 'crm_activity', p_id::text);
  return jsonb_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_company_save(p_id uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
      -- 0195: a deleted company keeps its organisation number; the form points to the restore list
      return jsonb_build_object('ok', false, 'error', case when exists (select 1 from app.crm_companies c where c.product_id = 'orgpuls'
        and c.org_number = v_orgnr and c.deleted_at is not null) then 'exists_deleted' else 'exists' end);
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
  if v_old.deleted_at is not null then
    return jsonb_build_object('ok', false, 'error', 'deleted');
  end if;
  -- 0194: a form sends the version it was opened at; a newer one means someone else saved meanwhile
  if nullif(p->>'version', '') is not null and (p->>'version' !~ '^[0-9]{1,9}$' or (p->>'version')::int <> v_old.version) then
    return jsonb_build_object('ok', false, 'error', 'stale', 'version', v_old.version);
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

CREATE OR REPLACE FUNCTION public.admin_crm_save_contact(p_id uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid := p_id;
  v_email text := lower(btrim(coalesce(p->>'email', '')));
  v_tags text[];
  v_consent_at timestamptz;
  v_rule text := app.crm_choice('contact_rule');
  v_source text := nullif(left(btrim(coalesce(p->>'consent_source', '')), 200), '');
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
    -- 0192: the contact rule decides (default none: a consent source is optional)
    if v_rule = 'opt_in_only' then
      return jsonb_build_object('ok', false, 'error', 'blocked_by_setting', 'setting', 'contact_rule');
    end if;
    if char_length(coalesce(v_source, '')) < 3 then
      if v_rule = 'source_and_basis' then
        return jsonb_build_object('ok', false, 'error', 'consent_required', 'setting', 'contact_rule');
      end if;
      v_source := null;
    end if;
    if v_source is not null then
      begin
        v_consent_at := coalesce(nullif(p->>'consent_at', '')::timestamptz, now());
      exception when others then
        return jsonb_build_object('ok', false, 'error', 'invalid_consent_at');
      end;
      if v_consent_at > now() + interval '1 day' then
        return jsonb_build_object('ok', false, 'error', 'invalid_consent_at');
      end if;
    end if;
    if exists (select 1 from app.crm_contacts c where c.product_id = 'orgpuls' and c.email = v_email) then
      -- 0195: a deleted contact keeps its address; the form points to the restore list
      return jsonb_build_object('ok', false, 'error', case when exists (select 1 from app.crm_contacts c where c.product_id = 'orgpuls'
        and c.email = v_email and c.deleted_at is not null) then 'exists_deleted' else 'exists' end);
    end if;
    insert into app.crm_contacts (email, name, company, org_number, role, source, basis, status, consent_at, consent_source, tags, lang, company_id)
    values (v_email, nullif(left(btrim(coalesce(p->>'name', '')), 120), ''), nullif(left(btrim(coalesce(p->>'company', '')), 200), ''),
            nullif(regexp_replace(coalesce(p->>'org_number', ''), '\s', '', 'g'), ''), nullif(p->>'role', ''),
            case when p->>'source' = 'event' then 'event' else 'manual' end,
            -- without a consent source the contact has no basis, so no campaign mails it (app.crm_mailable)
            case when v_source is not null then 'consent' else 'none' end, 'active', v_consent_at,
            v_source, coalesce(v_tags, '{}'), case when p->>'lang' = 'en' then 'en' else 'no' end,
            nullif(p->>'company_id', '')::uuid)
    returning id into v_id;
    perform app.admin_log('crm.contact_create', null, 'crm_contact', v_id::text, null, jsonb_build_object('consent_source', v_source));
  else
    if exists (select 1 from app.crm_contacts c where c.id = v_id and c.deleted_at is not null) then
      return jsonb_build_object('ok', false, 'error', 'deleted');
    end if;
    -- 0194: a form sends the version it was opened at; a newer one means someone else saved meanwhile
    if nullif(p->>'version', '') is not null and (p->>'version' !~ '^[0-9]{1,9}$'
        or not exists (select 1 from app.crm_contacts c where c.id = v_id and c.version = (p->>'version')::int)) then
      return jsonb_build_object('ok', false, 'error', case when exists (select 1 from app.crm_contacts c where c.id = v_id) then 'stale' else 'not_found' end);
    end if;
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
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_company_import(p_rows jsonb, p_source text DEFAULT 'brreg'::text, p_tag text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_max int := app.crm_limit('limit_register_import_rows');
begin
  perform set_config('app.consent_via', 'import', true);  -- 0141: the ledger records the method
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 1
     or (v_tag is not null and v_tag !~ '^[a-z0-9æøå_-]{1,40}$') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if v_max is not null and jsonb_array_length(p_rows) > v_max then
    return jsonb_build_object('ok', false, 'error', 'too_many', 'setting', 'limit_register_import_rows', 'limit', v_max);
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
    -- 0195: a company in the restore list is left as it is; the row is skipped
    if v_id is not null and exists (select 1 from app.crm_companies c where c.id = v_id and c.deleted_at is not null) then
      v_skipped := v_skipped + 1; continue;
    end if;
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
            tags = array(select distinct t from unnest(app.crm_contacts.tags || excluded.tags) t)
      where app.crm_contacts.deleted_at is null;
      if v_basis = 'business' then v_business := v_business + 1; end if;
    end if;
  end loop;
  perform app.admin_log('crm.company_import', null, null, null, v_tag,
    jsonb_build_object('added', v_added, 'known', v_known, 'business', v_business, 'managers', v_managers, 'skipped', v_skipped));
  return jsonb_build_object('ok', true, 'added', v_added, 'known', v_known, 'business', v_business, 'managers', v_managers, 'skipped', v_skipped);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_crm_import(p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r jsonb;
  i int := 0;
  v_email text;
  v_at timestamptz;
  v_tags text[];
  v_inserted int := 0;
  v_updated int := 0;
  v_suppressed int := 0;
  v_rejected jsonb := '[]';
  v_rule text := app.crm_choice('contact_rule');
  v_need_source boolean := app.crm_choice('import_consent_source') = 'required' or app.crm_choice('contact_rule') = 'source_and_basis';
  v_max int := app.crm_limit('limit_contact_import_rows');
  v_source text;
begin
  perform set_config('app.consent_via', 'import', true);  -- 0141: the ledger records the method
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  -- 0192: limits and the contact rule are settings, unlimited and off by default
  if v_max is not null and jsonb_array_length(p_rows) > v_max then
    return jsonb_build_object('ok', false, 'error', 'too_many', 'setting', 'limit_contact_import_rows', 'limit', v_max);
  end if;
  if v_rule = 'opt_in_only' then
    return jsonb_build_object('ok', false, 'error', 'blocked_by_setting', 'setting', 'contact_rule');
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    v_email := lower(btrim(coalesce(r->>'email', '')));
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
      v_rejected := v_rejected || jsonb_build_object('row', i, 'reason', 'invalid_email'); continue;
    end if;
    v_source := nullif(left(btrim(coalesce(r->>'consent_source', '')), 200), '');
    if char_length(coalesce(v_source, '')) < 3 then
      if v_need_source then
        v_rejected := v_rejected || jsonb_build_object('row', i, 'reason', 'consent_required'); continue;
      end if;
      v_source := null;
    end if;
    v_at := null;
    if v_source is not null then
      begin
        v_at := coalesce(nullif(btrim(coalesce(r->>'consent_at', '')), '')::timestamptz, now());
      exception when others then
        v_rejected := v_rejected || jsonb_build_object('row', i, 'reason', 'invalid_consent_at'); continue;
      end;
      if v_at > now() + interval '1 day' then
        v_rejected := v_rejected || jsonb_build_object('row', i, 'reason', 'invalid_consent_at'); continue;
      end if;
    end if;
    if coalesce(r->>'role', '') <> '' and r->>'role' not in ('daglig_leder', 'hr', 'leder', 'verneombud', 'annet') then
      v_rejected := v_rejected || jsonb_build_object('row', i, 'reason', 'invalid_role'); continue;
    end if;
    v_tags := array(select distinct t from unnest(string_to_array(lower(coalesce(r->>'tags', '')), ';')) t
                    where btrim(t) ~ '^[a-z0-9æøå_-]{1,40}$');
    -- 0195: an address held by a deleted contact is restored from the restore list, not re-imported
    if exists (select 1 from app.crm_contacts c where c.product_id = 'orgpuls' and c.email = v_email and c.deleted_at is not null) then
      v_rejected := v_rejected || jsonb_build_object('row', i, 'reason', 'deleted'); continue;
    end if;
    if app.crm_suppressed(v_email) then v_suppressed := v_suppressed + 1; end if;
    insert into app.crm_contacts (email, name, company, org_number, role, source, basis, status, consent_at, consent_source, tags, lang)
    values (v_email, nullif(left(btrim(coalesce(r->>'name', '')), 120), ''), nullif(left(btrim(coalesce(r->>'company', '')), 200), ''),
            case when regexp_replace(coalesce(r->>'org_number', ''), '\s', '', 'g') ~ '^[0-9]{9}$' then regexp_replace(r->>'org_number', '\s', '', 'g') end,
            nullif(r->>'role', ''), 'import', case when v_source is not null then 'consent' else 'none' end, 'active', v_at, v_source,
            coalesce(v_tags, '{}'), case when r->>'lang' = 'en' then 'en' else 'no' end)
    on conflict (product_id, email) do nothing;
    if found then
      v_inserted := v_inserted + 1;
    else
      update app.crm_contacts c set
        name = coalesce(c.name, nullif(left(btrim(coalesce(r->>'name', '')), 120), '')),
        company = coalesce(c.company, nullif(left(btrim(coalesce(r->>'company', '')), 200), '')),
        role = coalesce(c.role, nullif(r->>'role', '')),
        tags = array(select distinct t from unnest(c.tags || coalesce(v_tags, '{}')) t),
        updated_at = now()
      where c.product_id = 'orgpuls' and c.email = v_email;
      v_updated := v_updated + 1;
    end if;
  end loop;
  perform app.admin_log('crm.import', null, null, null, null,
    jsonb_build_object('rows', i, 'inserted', v_inserted, 'updated', v_updated, 'rejected', jsonb_array_length(v_rejected)));
  return jsonb_build_object('ok', true, 'inserted', v_inserted, 'updated', v_updated, 'suppressed', v_suppressed, 'rejected', v_rejected);
end $function$;

CREATE OR REPLACE FUNCTION public.crm_confirm(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_c app.crm_contacts;
begin
  perform set_config('app.consent_via', 'double_opt_in', true);  -- 0141: the ledger records the method
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select * into v_c from app.crm_contacts c where c.optin_hash = app.crm_token_hash(p_token);
  if v_c.id is null or v_c.optin_sent_at < now() - interval '7 days' then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  update app.crm_contacts set basis = 'consent', status = 'active', consent_at = now(),
    consent_source = 'double opt-in (' || v_c.source || ')', optin_hash = null, last_engaged_at = now(), updated_at = now(),
    -- 0195: the person proved the address and asked; that brings a deleted contact back
    deleted_at = null, deleted_by = null, deleted_source = null
  where id = v_c.id;
  update app.crm_list_members set status = 'subscribed', subscribed_at = now(), unsubscribed_at = null
  where contact_id = v_c.id and status = 'pending';
  delete from app.crm_suppression where email_hash = app.crm_hash(v_c.email);
  return jsonb_build_object('ok', true, 'lang', v_c.lang);
end $function$;

CREATE OR REPLACE FUNCTION app.demo_lead(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_email text;
  r       app.demo_requests;
begin
  perform set_config('app.consent_via', 'demo_request', true);  -- 0141: the ledger records the method
  select lower(btrim(u.email)) into v_email from auth.users u where u.id = p_user;
  select * into r from app.demo_requests q where q.email = v_email order by q.at desc limit 1;
  if v_email is null or r.id is null then
    return;
  end if;
  insert into app.crm_contacts (email, name, company, role, source, basis, status, consent_at, consent_source, tags, lang)
  values (v_email, r.name, r.company, r.role, 'demo', case when r.consent then 'consent' else 'none' end, 'active',
          case when r.consent then r.at end, case when r.consent then 'demo request (box ticked, address proved)' end,
          array['demo'], r.lang)
  on conflict (product_id, email) do update set
    name = coalesce(app.crm_contacts.name, excluded.name),
    company = coalesce(app.crm_contacts.company, excluded.company),
    role = coalesce(app.crm_contacts.role, excluded.role),
    tags = case when 'demo' = any (app.crm_contacts.tags) or cardinality(app.crm_contacts.tags) >= 20
                then app.crm_contacts.tags else app.crm_contacts.tags || 'demo'::text end,
    basis = case when r.consent and app.crm_contacts.basis in ('none', 'business') then 'consent' else app.crm_contacts.basis end,
    consent_at = case when r.consent and app.crm_contacts.basis in ('none', 'business') then r.at else app.crm_contacts.consent_at end,
    consent_source = case when r.consent and app.crm_contacts.basis in ('none', 'business')
                          then 'demo request (box ticked, address proved)' else app.crm_contacts.consent_source end,
    updated_at = now(),
    -- 0195: the person asked for a demo and proved the address; that brings a deleted contact back
    deleted_at = null, deleted_by = null, deleted_source = null;
end $function$;
