-- retention_invariants.sql — the deletion 30 days after the agreement ends, proved against the whole
-- catalog (0064, 0065, 0066, 0136; D-176). The data processing agreement § 11: "Når avtalen
-- opphører, sletter Orgpuls virksomhetens personopplysninger innen 30 dager".
--
--   * no client counts, previews, deletes or runs deletions; anon cannot open the list (1)
--   * the daily run is scheduled, once (2)
--   * the deleting function refuses an organisation without a cancellation (3)
--   * only the daglig leder cancels in the product, only a platform admin registers one (4)
--   * a cancellation: read-only from the midnight after the last day, deletion 30 Oslo days on,
--     and the function refuses the schedule before then (5)
--   * the dry run lists it, with what the run would delete, counted table by table; an
--     organisation with no cancellation is not in it (6)
--   * 29 days after the end, the run leaves every row (7)
--   * undo: not the verneombud; the daglig leder, and support with a reason, audited (8)
--   * 30 days after the end, the run deletes it: no row in any app table with an org_id keeps its
--     id (9); every table in app and Auth lost exactly the rows the log counted and not one more
--     (10); no id or e-mail address of it is left anywhere in the database, apart from the
--     platform's own records (11)
--   * the log remains, counts every table, and holds no person (12)
--   * the other organisation is untouched, table by table (13)
--   * nothing written here survives (14)
--
-- The table lists are read from the catalog when the suite runs, so a table added later is
-- counted, deleted and checked without anyone editing this file.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/retention_invariants.sql

create unlogged table if not exists public._rti(seq int, name text, expected text, actual text, pass bool);
truncate public._rti;

-- one snapshot for the whole probe: the before-and-after counts must not see another session's commits
begin transaction isolation level repeatable read;

do $$
declare
  v_org     uuid := '00000000-0000-4000-8000-000000000001';
  v_demo    uuid := 'de000000-0000-4000-8000-000000000001';
  v_vo      uuid := '00000000-0000-4000-8000-0000000d7e01';
  v_al      uuid := '00000000-0000-4000-8000-0000000d7e02';
  v_sup     uuid := '00000000-0000-4000-8000-0000000d7e03';
  v_out     uuid := '00000000-0000-4000-8000-0000000d7e04';
  v_dl      uuid;
  v_dl_mail text;
  v_grp     uuid;
  v_rows    jsonb := '[]';
  v_json    jsonb;
  v_txt     text;
  v_ok      boolean;
  v_n       bigint;
  v_gain    bigint;
  v_today   date := (now() at time zone 'Europe/Oslo')::date;
  v_before  jsonb;
  v_after   jsonb;
  v_counted jsonb;
  v_demo_before jsonb;
  v_ids     uuid[] := '{}';
  v_part    uuid[];
  v_pat     text[];
  v_idpat   text[];
  v_log     app.deletion_log;
  t         record;
  claims    constant text := '{"sub":"%s","role":"authenticated","aal":"aal2"}';
begin
  -- 1 ------------------------------------------------------------------ privileges
  v_txt := concat_ws(',',
    has_function_privilege('authenticated', 'app.org_row_counts(uuid)', 'execute'),
    has_function_privilege('authenticated', 'app.deletion_preview()', 'execute'),
    has_function_privilege('authenticated', 'app.org_departing_accounts(uuid)', 'execute'),
    has_function_privilege('authenticated', 'app.delete_organisation(uuid,text,uuid)', 'execute'),
    has_function_privilege('authenticated', 'app.deletion_run()', 'execute'),
    has_function_privilege('anon', 'public.admin_deletions()', 'execute'));
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'no client counts, previews, deletes or runs deletions',
    'expected', 'f,f,f,f,f,f', 'actual', v_txt, 'pass', v_txt = 'f,f,f,f,f,f');

  -- 2 ------------------------------------------------------------------ the schedule
  select count(*) filter (where j.schedule = '40 2 * * *' and j.active)::text || '/' || count(*) into v_txt
  from cron.job j where j.command ilike '%app.deletion_run()%';
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'the daily run is scheduled, once',
    'expected', '1/1', 'actual', v_txt, 'pass', v_txt = '1/1');

  select m.user_id into v_dl from app.memberships m where m.org_id = v_org and m.role = 'daglig_leder' and m.active limit 1;
  select u.email::text into v_dl_mail from auth.users u where u.id = v_dl;
  select g.id into v_grp from app.groups g where g.org_id = v_org order by g.id limit 1;

  begin
    update app.billing set cancelled_at = null, cancelled_by = null, cancel_effective_at = null, deletion_due_at = null,
                           confirmed_at = null, trial_ends_at = now() + interval '5 days'
    where org_id = v_org;
    insert into auth.users (id, email) values
      (v_vo, 'vo@retention-test.example'), (v_al, 'al@retention-test.example'),
      (v_sup, 'sup@retention-test.example'), (v_out, 'out@retention-test.example');
    insert into app.profiles (id, full_name) values (v_vo, 'Verne Ombud'), (v_al, 'Avdeling Leder') on conflict (id) do nothing;
    insert into app.memberships (org_id, user_id, role, active, group_id) values
      (v_org, v_vo, 'verneombud', true, null), (v_org, v_al, 'avdelingsleder', true, v_grp);
    insert into app.platform_admins (user_id, role) values (v_sup, 'support');

    -- 3 ---------------------------------------------------------------- the guard
    v_txt := '';
    begin
      perform app.delete_organisation(v_org, 'schedule');
      v_txt := 'deleted';
    exception when insufficient_privilege then v_txt := 'refused';
    end;
    begin
      perform app.delete_organisation(v_org, 'admin', v_sup);
      v_txt := v_txt || ',deleted';
    exception when insufficient_privilege then v_txt := v_txt || ',refused';
    end;
    v_txt := v_txt || ',' || (select count(*) from app.organizations where id = v_org);
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'the deleting function refuses an organisation without a cancellation',
      'expected', 'refused,refused,1', 'actual', v_txt, 'pass', v_txt = 'refused,refused,1');

    -- 4 ---------------------------------------------------------------- who may cancel
    perform set_config('request.jwt.claims', format(claims, v_vo), true);
    v_txt := coalesce(public.cancel_subscription(v_org, 'price', true)->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_al), true);
    v_txt := v_txt || ',' || coalesce(public.cancel_subscription(v_org, 'price', true)->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_out), true);
    v_txt := v_txt || ',' || coalesce(public.cancel_subscription(v_org, 'price', true)->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_txt := v_txt || ',' || coalesce(public.admin_cancel_org(v_org, v_today, 'Kunden ba om det')->>'error', 'ok');
    v_txt := v_txt || ',' || coalesce(public.admin_deletions()->>'error', 'ok');
    v_txt := v_txt || ',' || coalesce((select cancelled_at::text from app.billing where org_id = v_org), 'none');
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'only the daglig leder cancels; only a platform admin registers or lists',
      'expected', 'not_allowed,not_allowed,not_allowed,not_allowed,not_allowed,none', 'actual', v_txt,
      'pass', v_txt = 'not_allowed,not_allowed,not_allowed,not_allowed,not_allowed,none');

    -- 5 ---------------------------------------------------------------- a cancellation, and its dates
    v_json := public.cancel_subscription(v_org, 'not_needed', true);
    select concat_ws('|', coalesce(v_json->>'error', 'ok'),
                     b.cancel_effective_at = ((v_today + 1)::timestamp at time zone 'Europe/Oslo'),
                     b.deletion_due_at = ((v_today + 31)::timestamp at time zone 'Europe/Oslo'),
                     ((b.deletion_due_at at time zone 'Europe/Oslo')::date - (b.cancel_effective_at at time zone 'Europe/Oslo')::date))
      into v_txt from app.billing b where b.org_id = v_org;
    begin
      perform app.delete_organisation(v_org, 'schedule');
      v_txt := v_txt || '|deleted';
    exception when insufficient_privilege then v_txt := v_txt || '|refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'cancelled: ends the midnight after today, deletion 30 Oslo days on; not before',
      'expected', 'ok|t|t|30|refused', 'actual', v_txt, 'pass', v_txt = 'ok|t|t|30|refused');

    -- 6 ---------------------------------------------------------------- the dry run
    perform set_config('request.jwt.claims', format(claims, v_sup), true);
    v_json := (select p from jsonb_array_elements(public.admin_deletions()->'pending') p where p->>'org_id' = v_org::text);
    v_txt := concat_ws('|',
      v_json->>'due',
      (v_json->'tables'->>'employees')::bigint = (select count(*) from app.employees where org_id = v_org),
      (v_json->'tables'->>'answers')::bigint = (select count(*) from app.answers a join app.responses r on r.id = a.response_id where r.org_id = v_org),
      (v_json->'tables'->>'response_comments')::bigint = (select count(*) from app.response_comments c join app.responses r on r.id = c.response_id where r.org_id = v_org),
      (v_json->'tables'->>'auth.users')::bigint = cardinality(app.org_departing_accounts(v_org)),
      exists (select 1 from jsonb_array_elements(app.deletion_preview()) p where p->>'org_id' = v_demo::text));
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'the dry run lists it, not due, table by table; not the other organisation',
      'expected', 'false|t|t|t|t|f', 'actual', coalesce(v_txt, 'not listed'), 'pass', v_txt = 'false|t|t|t|t|f');

    -- 7 ---------------------------------------------------------------- 29 days after the end
    perform set_config('request.jwt.claims', '', true);
    update app.billing set cancel_effective_at = now() - interval '29 days', deletion_due_at = now() + interval '1 day'
    where org_id = v_org;
    v_before := app.org_row_counts(v_org);
    v_n := app.deletion_run();
    v_txt := v_n || '|' || (app.org_row_counts(v_org) = v_before)::text || '|' || (select count(*) from app.organizations where id = v_org);
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', '29 days after the end the run deletes nothing',
      'expected', '0|true|1', 'actual', v_txt, 'pass', v_txt = '0|true|1');

    -- 8 ---------------------------------------------------------------- undo, before the deletion
    perform set_config('request.jwt.claims', format(claims, v_vo), true);
    v_txt := coalesce(public.withdraw_cancellation(v_org)->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_txt := v_txt || ',' || coalesce(public.withdraw_cancellation(v_org)->>'error', 'ok');
    v_txt := v_txt || ',' || coalesce((select cancelled_at::text from app.billing where org_id = v_org), 'cleared');
    perform set_config('request.jwt.claims', format(claims, v_sup), true);
    v_txt := v_txt || ',' || coalesce(public.admin_cancel_org(v_org, v_today, 'Kunden sa opp på e-post')->>'error', 'ok');
    v_txt := v_txt || ',' || coalesce(public.admin_cancel_withdraw(v_org, 'Kunden ombestemte seg')->>'error', 'ok');
    v_txt := v_txt || ',' || (select count(*) from app.admin_audit a where a.org_id = v_org and a.admin_id = v_sup
                                and a.action in ('org.cancel', 'org.cancel_withdraw') and a.reason is not null);
    perform set_config('request.jwt.claims', '', true);
    v_txt := v_txt || ',' || app.deletion_run() || ',' || (select count(*) from app.organizations where id = v_org);
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'undo: not the verneombud; the daglig leder; support with a reason, audited',
      'expected', 'not_allowed,ok,cleared,ok,ok,2,0,1', 'actual', v_txt, 'pass', v_txt = 'not_allowed,ok,cleared,ok,ok,2,0,1');

    -- 9, 10, 11 ------------------------------------------------------------ 30 days after the end
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    perform public.cancel_subscription(v_org, null, true);
    perform set_config('request.jwt.claims', '', true);
    update app.billing set cancel_effective_at = now() - interval '30 days 1 minute', deletion_due_at = now() - interval '1 minute'
    where org_id = v_org;
    -- what Supabase Auth writes at a sign-in: the account's id and address
    insert into auth.audit_log_entries (instance_id, id, payload, created_at, ip_address)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
            json_build_object('action', 'login', 'actor_id', v_dl, 'actor_username', v_dl_mail, 'log_type', 'account'),
            now(), '203.0.113.7');

    v_counted := app.org_row_counts(v_org);
    v_demo_before := app.org_row_counts(v_demo);
    -- every table in app and in Auth, counted whole
    v_before := '{}';
    for t in
      select c.oid::regclass rel, case when n.nspname = 'app' then c.relname::text else n.nspname || '.' || c.relname end k
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p') and n.nspname in ('app', 'auth')
    loop
      execute format('select count(*) from %s', t.rel) into v_n;
      v_before := v_before || jsonb_build_object(t.k, v_n);
    end loop;
    -- the ids it holds (the platform's records and a consented contact excepted), and its addresses
    for t in
      select c.relname from pg_class c
      where c.relnamespace = 'app'::regnamespace and c.relkind = 'r'
        and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'org_id' and not a.attisdropped)
        and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'id' and a.atttypid = 'uuid'::regtype and not a.attisdropped)
        and c.relname not in ('deletion_log', 'admin_audit', 'crm_companies', 'crm_contacts')
    loop
      execute format('select coalesce(array_agg(id), ''{}'') from app.%I where org_id = $1', t.relname) into v_part using v_org;
      v_ids := v_ids || v_part;
    end loop;
    v_ids := v_ids || v_org || app.org_departing_accounts(v_org);
    select array_agg(distinct '%' || lower(x) || '%') into v_pat from (
      select e.email::text x from app.employees e where e.org_id = v_org and e.email is not null
      union select u.email::text from auth.users u where u.id = any(app.org_departing_accounts(v_org))) s;
    v_idpat := array(select '%' || x::text || '%' from unnest(v_ids) x);

    v_n := app.deletion_run();

    -- 9: every app table with an org_id, apart from the platform's own records
    v_txt := null;
    for t in
      select c.relname from pg_class c
      where c.relnamespace = 'app'::regnamespace and c.relkind in ('r', 'p')
        and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'org_id' and not a.attisdropped)
        and c.relname not in ('deletion_log', 'admin_audit')
    loop
      execute format('select count(*) from app.%I where org_id = $1', t.relname) into v_n using v_org;
      if v_n > 0 then v_txt := concat_ws(',', v_txt, t.relname); end if;
    end loop;
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', '30 days after the end: no row in any app table with an org_id keeps its id',
      'expected', 'none', 'actual', coalesce(v_txt, 'none'), 'pass', v_txt is null);

    -- 10: each table lost exactly what the log counted; the log gained its one row
    select * into v_log from app.deletion_log where org_id = v_org;
    v_txt := null;
    for t in select key, value from jsonb_each(v_before) loop
      execute format('select count(*) from %s', case when t.key like '%.%' then t.key else 'app.' || quote_ident(t.key) end) into v_n;
      -- the rows a table may gain: the log's own, and the CRM company's move to «lost» (0064 keeps it)
      v_gain := (t.key = 'deletion_log')::int;
      if t.key = 'crm_stage_changes' then
        select count(*) into v_gain from app.crm_stage_changes sc join app.crm_companies cc on cc.id = sc.company_id
        where cc.org_number = v_log.org_number and sc.to_stage = 'lost' and sc.changed_at = now();
      end if;
      if t.value::bigint - v_n <> coalesce((v_log.tables->>t.key)::bigint, 0) - v_gain then
        v_txt := concat_ws(',', v_txt, t.key || ':' || (t.value::bigint - v_n) || '≠' || coalesce(v_log.tables->>t.key, '0'));
      end if;
    end loop;
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'every table lost exactly the rows the log counted, and not one more',
      'expected', 'none', 'actual', coalesce(v_txt, 'none'), 'pass', v_txt is null and v_log.id is not null);

    -- 11: no id or address of it anywhere, apart from the platform's own records
    v_txt := null;
    for t in
      select c.table_schema s, c.table_name tn, c.column_name cn, c.data_type dt, c.udt_name udt
      from information_schema.columns c
      join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
      where c.table_schema in ('app', 'auth', 'public', 'storage', 'net', 'cron', 'vault', 'supabase_functions')
        and not (c.table_schema = 'public' and c.table_name like '\_%')
        and (c.data_type in ('uuid', 'text', 'character varying', 'json', 'jsonb') or c.udt_name in ('_uuid', 'citext', '_text'))
        and (c.table_schema, c.table_name, c.column_name) not in
            (('app', 'deletion_log', 'org_id'), ('app', 'admin_audit', 'org_id'), ('app', 'admin_audit', 'target_id'))
    loop
      if t.dt = 'uuid' then
        execute format('select count(*) from %I.%I where %I = any($1)', t.s, t.tn, t.cn) into v_n using v_ids;
      elsif t.udt = '_uuid' then
        execute format('select count(*) from %I.%I where %I && $1', t.s, t.tn, t.cn) into v_n using v_ids;
      else
        execute format('select count(*) from %I.%I where lower(%I::text) like any($1) or %I::text like any($2)', t.s, t.tn, t.cn, t.cn)
          into v_n using v_pat, v_idpat;
      end if;
      if v_n > 0 then v_txt := concat_ws(',', v_txt, t.s || '.' || t.tn || '.' || t.cn || ':' || v_n); end if;
    end loop;
    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'no id or e-mail address of it is left anywhere but the platform''s records',
      'expected', 'none', 'actual', coalesce(v_txt, 'none') || ' (' || cardinality(v_ids) || ' ids, ' || cardinality(v_pat) || ' addresses)',
      'pass', v_txt is null and cardinality(v_ids) > 100 and cardinality(v_pat) > 10);

    -- 12: the record that it happened
    v_txt := concat_ws('|', v_log.run_by, v_log.org_number, (v_log.tables = v_counted)::text,
                       (v_log.tables->>'auth.audit_log_entries')::int > 0,
                       (v_log.counts ?| array['email', 'name', 'full_name']) or (v_log.tables ?| array['email', 'name', 'full_name']),
                       (select count(*) from app.deletion_log d where d.org_id = v_org
                          and (lower(row_to_json(d)::text) like any(v_pat))));
    v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'the log remains: every table counted as the dry run counted it, and no person',
      'expected', 'schedule|924118742|true|t|f|0', 'actual', coalesce(v_txt, 'no log'), 'pass', v_txt = 'schedule|924118742|true|t|f|0');

    -- 13: the other organisation
    v_txt := (select count(*) from app.organizations where id = v_demo)::text || '|' || (app.org_row_counts(v_demo) = v_demo_before)::text;
    v_rows := v_rows || jsonb_build_object('seq', 13, 'name', 'the other organisation is untouched, table by table',
      'expected', '1|true', 'actual', v_txt, 'pass', v_txt = '1|true');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 14 ------------------------------------------------------------------ nothing survives
  v_txt := concat_ws('|', (select count(*) from app.organizations where id in (v_org, v_demo)),
                     (select count(*) from app.deletion_log where org_id = v_org),
                     (select count(*) from auth.users where email like '%@retention-test.example'));
  v_rows := v_rows || jsonb_build_object('seq', 14, 'name', 'every probe change was rolled back',
    'expected', '2|0|0', 'actual', v_txt, 'pass', v_txt = '2|0|0');

  insert into public._rti
  select (x->>'seq')::int, x->>'name', x->>'expected', x->>'actual', (x->>'pass')::boolean from jsonb_array_elements(v_rows) x;
end $$;

commit;

select seq, name, expected, actual, pass from public._rti order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._rti;
  if v_failed is not null then raise exception 'retention invariants failed: %', v_failed; end if;
  if v_count <> 14 then raise exception 'retention invariants: expected 14 rows, got %', v_count; end if;
end $$;

drop table public._rti;
