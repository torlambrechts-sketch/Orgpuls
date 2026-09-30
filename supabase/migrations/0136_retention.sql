-- 0136_retention.sql — the retention and deletion routine, completed and proved (D-176).
--
-- The data processing agreement § 11 promises: "Når avtalen opphører, sletter Orgpuls
-- virksomhetens personopplysninger innen 30 dager". Appendix 1 promises nothing else for a live
-- organisation: "Lagringstid: så lenge avtalen gjelder, med mindre virksomheten sletter
-- opplysningene tidligere eller ber Orgpuls gjøre det."
--
-- The routine already exists (0064, 0065, 0066; D-108, D-110): a cancellation registered by the
-- daglig leder or by support, undoable until it is carried out; read-only from the agreement's
-- end; app.deletion_run() daily at 02:40 UTC (cron job orgpuls-deletion), which deletes each
-- organisation thirty Oslo days after its end through app.delete_organisation(), and writes
-- app.deletion_log. Nothing here replaces it. An audit of it against the whole catalog found:
--
--   1. **The sign-in audit log kept the people.** Supabase Auth writes auth.audit_log_entries
--      on every sign-in, with the account's id and e-mail address. Deleting the account left
--      those rows, so a deleted customer's users stayed, by address and sign-in time, for ever.
--      delete_organisation now deletes them for every account it deletes.
--   2. **The log counted six kinds, not every table.** app.org_row_counts() derives, from the
--      catalog, every table that holds the organisation's rows: each app table with an org_id,
--      and every table under those, under app.organizations or under the departing accounts by
--      a cascading key, as deep as the keys go. A table added tomorrow is counted without anyone editing this. The log keeps
--      the counts per table (deletion_log.tables) beside the old summary.
--   3. **Nothing guarded the deleting function itself.** It deleted whatever organisation it was
--      given. It now refuses one without a cancellation, and the schedule one not yet due.
--   4. **No dry run.** app.deletion_preview() lists every cancellation not yet carried out, with
--      what the run would delete, table by table; Admin › Operations shows it beside each row.
--
-- The platform's own records are kept, as 0064 decided: deletion_log, admin_audit (who did what
-- in the admin, with the organisation's id and name) and the company in the CRM, marked lost.

-- ---------------------------------------------------------------- the log, per table
alter table app.deletion_log add column tables jsonb not null default '{}'::jsonb;
comment on column app.deletion_log.tables is
  'Rows deleted per table, from app.org_row_counts() just before the deletion (0136). Counts only.';

-- ---------------------------------------------------------------- whose sign-in goes with it
-- A member's account goes with the organisation when it belongs to no other organisation and is
-- not a platform admin's (0064's rule, now in one place for the deletion and its preview).
create function app.org_departing_accounts(p_org uuid) returns uuid[]
  language sql stable security definer set search_path = ''
as $fn$
  select coalesce(array_agg(distinct m.user_id), '{}')
  from app.memberships m
  where m.org_id = p_org
    and not exists (select 1 from app.memberships o where o.user_id = m.user_id and o.org_id <> p_org)
    and not exists (select 1 from app.platform_admins pa where pa.user_id = m.user_id)
$fn$;

-- ---------------------------------------------------------------- every row, counted from the catalog
-- The roots are the organisation's own row, the sign-in accounts that go with it, and every app
-- table with an org_id, apart from the platform's records that outlive it. Under them, every
-- table joined by a single-column cascading key (in app, and in auth under the accounts:
-- identities, sessions, second factors), pass after pass until no new table appears. Each table
-- is counted once, by the union of the keys that reach it. Tables outside app carry their schema.
create function app.org_row_counts(p_org uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_gone  uuid[] := app.org_departing_accounts(p_org);
  v_rel   oid[] := array['app.organizations'::regclass::oid, 'auth.users'::regclass::oid];
  v_pred  text[] := array[format('id = %L', p_org), format('id = any(%L::uuid[])', v_gone)];
  v_added int;
  v_n     bigint;
  v       jsonb := '{}'::jsonb;
  r       record;
begin
  for r in
    select c.oid, c.relname from pg_class c
    where c.relnamespace = 'app'::regnamespace and c.relkind in ('r', 'p')
      and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'org_id' and not a.attisdropped)
      and c.relname not in ('deletion_log', 'admin_audit', 'crm_companies')
    order by c.relname
  loop
    v_rel := v_rel || r.oid;
    -- a contact who subscribed with their own consent stays (0064)
    v_pred := v_pred || case when r.relname = 'crm_contacts'
                             then format('org_id = %L and basis <> %L', p_org, 'consent')
                             else format('org_id = %L', p_org) end;
  end loop;

  loop
    v_added := 0;
    for r in
      select k.conrelid,
             string_agg(format('%I in (select %I from %s where %s)', fa.attname, pa.attname, k.confrelid::regclass,
                               v_pred[array_position(v_rel, k.confrelid)]), ' or ' order by k.conname) as pred
      from pg_constraint k
      join pg_class c on c.oid = k.conrelid
      join pg_attribute fa on fa.attrelid = k.conrelid and fa.attnum = k.conkey[1]
      join pg_attribute pa on pa.attrelid = k.confrelid and pa.attnum = k.confkey[1]
      where k.contype = 'f' and k.confdeltype = 'c' and cardinality(k.conkey) = 1
        and c.relnamespace in ('app'::regnamespace, 'auth'::regnamespace)
        and k.confrelid = any(v_rel) and not (k.conrelid = any(v_rel))
      group by k.conrelid
    loop
      v_rel := v_rel || r.conrelid;
      v_pred := v_pred || r.pred;
      v_added := v_added + 1;
    end loop;
    exit when v_added = 0;
  end loop;

  for i in 1 .. cardinality(v_rel) loop
    execute format('select count(*) from %s where %s', v_rel[i]::regclass, v_pred[i]) into v_n;
    if v_n > 0 then
      v := v || jsonb_build_object((select case when c.relnamespace = 'app'::regnamespace then c.relname::text
                                                else c.relnamespace::regnamespace::text || '.' || c.relname end
                                    from pg_class c where c.oid = v_rel[i]), v_n);
    end if;
  end loop;

  -- Auth's sign-in log has no key to the account; it is matched by id and address
  if cardinality(v_gone) > 0 then
    select count(*) into v_n from auth.audit_log_entries x where app.audit_entry_of(x.payload, v_gone);
    if v_n > 0 then
      v := v || jsonb_build_object('auth.audit_log_entries', v_n);
    end if;
  end if;
  return v;
end $fn$;

-- An entry of Supabase Auth's sign-in log about one of these accounts: as the actor, or as the
-- account acted on. The e-mail address is matched too, for entries written before the id was.
create function app.audit_entry_of(p_payload json, p_users uuid[]) returns boolean
  language sql stable security definer set search_path = ''
as $fn$
  select (p_payload ->> 'actor_id') = any(p_users::text[])
      or (p_payload -> 'traits' ->> 'user_id') = any(p_users::text[])
      or lower(p_payload ->> 'actor_username') in (select lower(u.email::text) from auth.users u where u.id = any(p_users))
      or lower(p_payload -> 'traits' ->> 'user_email') in (select lower(u.email::text) from auth.users u where u.id = any(p_users))
$fn$;

-- ---------------------------------------------------------------- deleting, guarded and complete
create or replace function app.delete_organisation(p_org uuid, p_run_by text, p_admin uuid default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  o app.organizations;
  b app.billing;
  v_users uuid[];
  v_gone uuid[];
  v_counts jsonb;
  v_tables jsonb;
  v_n int;
begin
  select * into o from app.organizations where id = p_org;
  if not found then
    return null;
  end if;
  select * into b from app.billing where org_id = p_org;
  -- only a cancelled organisation, and the schedule only once its deletion is due
  if b.cancelled_at is null then
    raise exception 'delete_organisation: % has no cancellation', p_org using errcode = 'insufficient_privilege';
  end if;
  if p_run_by = 'schedule' and (b.deletion_due_at is null or b.deletion_due_at > now()) then
    raise exception 'delete_organisation: % is not due until %', p_org, b.deletion_due_at using errcode = 'insufficient_privilege';
  end if;

  select coalesce(array_agg(distinct m.user_id), '{}') into v_users from app.memberships m where m.org_id = p_org;
  v_gone := app.org_departing_accounts(p_org);
  v_tables := app.org_row_counts(p_org);

  v_counts := jsonb_build_object(
    'employees', (select count(*) from app.employees e where e.org_id = p_org),
    'groups', (select count(*) from app.groups g where g.org_id = p_org),
    'rounds', (select count(*) from app.rounds r where r.org_id = p_org),
    'responses', (select count(*) from app.responses r where r.org_id = p_org),
    'measures', (select count(*) from app.measures m where m.org_id = p_org),
    'members', cardinality(v_users),
    'tickets', (select count(*) from app.tickets t where t.org_id = p_org));

  -- CRM: people known only through the customer relationship go; the company stays, lost
  delete from app.crm_contacts c where c.org_id = p_org and c.basis <> 'consent';
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('crm_contacts', v_n);
  update app.crm_companies set stage = 'lost', stage_changed_at = now(), updated_at = now()
  where org_id = p_org and stage in ('trial', 'customer');

  -- support history is kept only while the customer relationship lasts
  delete from app.tickets where org_id = p_org;

  -- rounds before the organisation: a group cannot go while its answers exist (0042)
  delete from app.rounds where org_id = p_org;
  delete from app.organizations where id = p_org;

  -- sign-in accounts that belonged here only, never a platform admin's, and what Auth logged
  -- about them (read before the accounts go: the log is matched by address as well as by id)
  delete from auth.audit_log_entries a where app.audit_entry_of(a.payload, v_gone);
  delete from auth.mfa_factors where user_id = any(v_gone);
  delete from auth.identities where user_id = any(v_gone);
  delete from auth.users where id = any(v_gone);
  v_counts := v_counts || jsonb_build_object('accounts', cardinality(v_gone));

  insert into app.deletion_log (org_id, org_number, org_name, cancelled_at, cancel_effective_at, deletion_due_at, run_by, admin_id, counts, tables)
  values (p_org, o.org_number, o.name, b.cancelled_at, b.cancel_effective_at, b.deletion_due_at, p_run_by, p_admin, v_counts, v_tables);
  return v_counts;
end $fn$;

-- ---------------------------------------------------------------- the dry run
-- Every cancellation not yet carried out, with what the run would delete. `due` is true once the
-- next daily run will delete it; a due row still listed after a run means the run failed.
create function app.deletion_preview() returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
           'org_id', o.id, 'name', o.name, 'org_number', o.org_number,
           'cancelled_at', b.cancelled_at, 'effective_at', b.cancel_effective_at, 'deletion_due_at', b.deletion_due_at,
           'due', b.deletion_due_at <= now(),
           'tables', app.org_row_counts(o.id))
         order by b.deletion_due_at), '[]'::jsonb)
  from app.billing b join app.organizations o on o.id = b.org_id
  where b.cancelled_at is not null
$fn$;

create or replace function public.admin_deletions() returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin', 'support', 'finance']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('deletions.view');
  return jsonb_build_object('ok', true,
    'pending', app.deletion_preview(),
    'done', (select coalesce(jsonb_agg(jsonb_build_object('org_number', d.org_number, 'name', d.org_name,
               'cancelled_at', d.cancelled_at, 'deletion_due_at', d.deletion_due_at, 'deleted_at', d.deleted_at,
               'run_by', d.run_by, 'admin', u.email, 'counts', d.counts, 'tables', d.tables) order by d.deleted_at desc), '[]')
             from (select * from app.deletion_log order by deleted_at desc limit 200) d left join auth.users u on u.id = d.admin_id));
end $fn$;

-- ---------------------------------------------------------------- grants: none of it is a client's
revoke all on function app.org_departing_accounts(uuid) from public, anon, authenticated;
revoke all on function app.org_row_counts(uuid) from public, anon, authenticated;
revoke all on function app.audit_entry_of(json, uuid[]) from public, anon, authenticated;
revoke all on function app.deletion_preview() from public, anon, authenticated;
revoke all on function app.delete_organisation(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.admin_deletions() from public, anon;
grant execute on function public.admin_deletions() to authenticated;
