-- cancellation_invariants.sql — a cancellation, and the deletion 30 days after it ends (0064, D-108).
--
--   * the deletion log has RLS on and no client privilege; no client can delete, run deletions or
--     execute the platform's cancel and delete operations (1, 2)
--   * registering: only a platform command (0206), not a customer; a reason, a date from today; once;
--     the dates are the midnight after the last day in Oslo, and thirty Oslo days later (3, 0065)
--   * before the end nothing changes; after it the organisation is read-only and the banner's
--     state carries the deletion date (4)
--   * the cancellation mail is queued, and the trial's own mail stops (5)
--   * a cancellation can be withdrawn (6)
--   * the daily run deletes an organisation whose deletion is due: no row in any app table
--     keeps its id, its answers, comments and people are gone, its member accounts are gone,
--     an account that also belongs to another organisation and one that belongs to none stay,
--     the platform is told only that it was deleted, and the log records it without a person's
--     data (7, 8, 9)
--   * the other organisation is untouched, and its answers still add up (10)
--   * deleting now: a platform command only, a cancelled organisation, its number typed (11)
--   * nothing written here survives (12)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/cancellation_invariants.sql

create unlogged table if not exists public._cxi(seq int, name text, expected text, actual text, pass bool);
truncate public._cxi;

do $$
declare
  v_org     uuid := '00000000-0000-4000-8000-000000000001';
  v_demo    uuid := 'de000000-0000-4000-8000-000000000001';
  v_both    uuid := '00000000-0000-4000-8000-00000c0ec0a1';  -- a member here and in the other organisation
  v_out     uuid := '00000000-0000-4000-8000-00000c0ec0a2';  -- an account in no organisation
  v_dl      uuid;
  v_rows    jsonb := '[]';
  v_json    jsonb;
  v_cnt     int;
  v_ok      boolean;
  v_txt     text;
  v_today   date := (now() at time zone 'Europe/Oslo')::date;
  v_groups  uuid[];
  v_demo_answers int;
  tbl       record;
  claims    constant text := '{"sub":"%s","role":"authenticated","aal":"%s"}';
begin
  select c.relrowsecurity and not exists (
           select 1 from information_schema.role_table_grants g
           where g.table_schema = 'app' and g.table_name = 'deletion_log' and g.grantee in ('anon', 'authenticated'))
         and not exists (select 1 from pg_policies p where p.schemaname = 'app' and p.tablename = 'deletion_log')
    into v_ok from pg_class c where c.oid = 'app.deletion_log'::regclass;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'the deletion log has RLS on, no policy and no client privilege',
    'expected', 'true', 'actual', v_ok::text, 'pass', v_ok);

  v_txt := concat_ws(',',
    has_function_privilege('authenticated', 'app.delete_organisation(uuid,text,uuid)', 'execute'),
    has_function_privilege('authenticated', 'app.deletion_run()', 'execute'),
    has_function_privilege('anon', 'app.op_cancel_org(uuid,date,text)', 'execute'),
    has_function_privilege('authenticated', 'app.op_cancel_org(uuid,date,text)', 'execute'),
    has_function_privilege('anon', 'app.op_delete_now(uuid,text,text)', 'execute'),
    has_function_privilege('authenticated', 'app.op_delete_now(uuid,text,text)', 'execute'));
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'no client deletes, runs deletions or calls the platform''s operations',
    'expected', 'f,f,f,f,f,f', 'actual', v_txt, 'pass', v_txt = 'f,f,f,f,f,f');

  select m.user_id into v_dl from app.memberships m where m.org_id = v_org and m.role = 'daglig_leder' and m.active limit 1;

  begin
    insert into auth.users (id, email) values (v_both, 'both@cancel-test.example'), (v_out, 'out@cancel-test.example');
    insert into app.profiles (id, full_name) values (v_both, 'Begge'), (v_out, 'Utenfor');
    insert into app.memberships (org_id, user_id, role) values (v_org, v_both, 'verneombud'), (v_demo, v_both, 'verneombud');
    update app.lifecycle_settings set enabled = true;
    delete from app.lifecycle_mail;

    -- 3 ------------------------------------------------------------------ registering
    -- a signed-in customer, with no platform command around the call (0206)
    perform set_config('request.jwt.claims', format(claims, v_dl, 'aal2'), true);
    perform set_config('app.platform_actor', '', true);
    v_txt := coalesce(app.op_cancel_org(v_org, v_today + 5, 'Kunden ba om det')->>'error', 'ok');
    -- the platform, through a verified command: nobody is signed in
    perform set_config('request.jwt.claims', '', true);
    perform set_config('app.platform_actor', 'test@platform', true);
    v_txt := v_txt || ',' || coalesce(app.op_cancel_org(v_org, v_today + 5, 'kort')->>'error', 'ok');
    v_txt := v_txt || ',' || coalesce(app.op_cancel_org(v_org, v_today - 1, 'Kunden ba om det')->>'error', 'ok');
    v_json := app.op_cancel_org(v_org, v_today + 5, 'Kunden ba om det på e-post');
    v_txt := v_txt || ',' || coalesce(v_json->>'error', 'ok');
    v_txt := v_txt || ',' || coalesce(app.op_cancel_org(v_org, v_today + 9, 'Kunden ba om det igjen')->>'error', 'ok');
    select v_txt || ',' || (b.cancel_effective_at = ((v_today + 6)::timestamp at time zone 'Europe/Oslo')
                            and b.deletion_due_at = ((v_today + 36)::timestamp at time zone 'Europe/Oslo'))::text
      into v_txt from app.billing b where b.org_id = v_org;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'registering: a platform command only; reason and date checked; once; the dates',
      'expected', 'not_allowed,reason_required,invalid_date,ok,already_cancelled,true', 'actual', v_txt,
      'pass', v_txt = 'not_allowed,reason_required,invalid_date,ok,already_cancelled,true');

    -- 4 ------------------------------------------------------------------ access
    v_txt := app.org_access(v_org);
    update app.billing set cancel_effective_at = now() - interval '1 hour', deletion_due_at = now() - interval '1 hour' + interval '30 days'
    where org_id = v_org;
    v_txt := v_txt || '→' || app.org_access(v_org);
    perform set_config('app.platform_actor', '', true);
    perform set_config('request.jwt.claims', format(claims, v_dl, 'aal1'), true);
    v_json := public.org_access_state(v_org);
    v_txt := v_txt || ',' || (v_json->>'access') || ',' || ((v_json->>'deletion_due_at') is not null)::text;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'unchanged before the end; read-only after, with the deletion date',
      'expected', app.org_access(v_demo) || '→read_only,read_only,true', 'actual', v_txt,
      'pass', v_txt like '%→read_only,read_only,true' and split_part(v_txt, '→', 1) <> 'read_only');

    -- 5 ------------------------------------------------------------------ the mails
    -- the fixture's addresses are reserved test domains and its mail is off (0032); a real one here
    update app.organizations set mail_enabled = true where id = v_org;
    update auth.users set email = 'dl@cancel-test.no' where id = v_dl;
    perform app.lifecycle_plan();
    select string_agg(step, ',' order by step) into v_txt from app.lifecycle_mail where org_id = v_org;
    v_txt := coalesce(v_txt, 'none') || '|' || app.lifecycle_due(v_org, 'trial_ending')::text;
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'the cancellation mail is queued; the trial''s mail stops',
      'expected', 'cancelled|false', 'actual', v_txt, 'pass', v_txt = 'cancelled|false');

    -- 6 ------------------------------------------------------------------ withdrawing
    perform set_config('request.jwt.claims', '', true);
    perform set_config('app.platform_actor', 'test@platform', true);
    v_txt := coalesce(app.op_cancel_withdraw(v_org, 'Kunden ombestemte seg')->>'error', 'ok');
    v_txt := v_txt || ',' || coalesce((select cancelled_at::text from app.billing where org_id = v_org), 'cleared')
      || ',' || app.org_access(v_org);
    v_txt := v_txt || ',' || coalesce(app.op_cancel_withdraw(v_org, 'Kunden ombestemte seg')->>'error', 'ok');
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'a cancellation can be withdrawn, once',
      'expected', 'ok,cleared,' || app.org_access(v_org) || ',not_cancelled', 'actual', v_txt,
      'pass', v_txt like 'ok,cleared,%,not_cancelled' and v_txt not like '%read_only%');

    -- 7, 8, 9 -------------------------------------------------------------- the daily run
    perform app.op_cancel_org(v_org, v_today, 'Kunden sa opp');
    perform set_config('app.platform_actor', '', true);
    update app.billing set cancel_effective_at = now() - interval '31 days', deletion_due_at = now() - interval '1 day'
    where org_id = v_org;
    select array_agg(id) into v_groups from app.groups where org_id = v_org;
    select count(*) into v_demo_answers from app.answers a join app.responses r on r.id = a.response_id where r.org_id = v_demo;
    perform set_config('request.jwt.claims', '', true);
    perform app.deletion_run();

    -- every table in app with an org_id column, apart from those app.org_row_counts leaves out: the log
    -- and the platform's delivery queue (which keeps only the notice that the organisation was deleted, 0205, 0206)
    v_txt := null;
    for tbl in
      select c.table_name from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
      where c.table_schema = 'app' and c.column_name = 'org_id' and c.table_name not in ('deletion_log', 'platform_events')
    loop
      execute format('select count(*) from app.%I where org_id = $1', tbl.table_name) into v_cnt using v_org;
      if v_cnt > 0 then v_txt := concat_ws(',', v_txt, tbl.table_name); end if;
    end loop;
    v_cnt := (select count(*) from app.deletion_log);
    v_txt := v_cnt || '|' || coalesce(v_txt, 'none')
      || '|' || (select count(*) from app.responses where group_id = any(v_groups))
      || '|' || (select count(*) from app.memberships where user_id = v_dl)
      || '|' || (select count(*) from auth.users where id = v_dl);
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'the run deletes it: no app row keeps its id; answers, people and accounts gone',
      'expected', '1|none|0|0|0', 'actual', v_txt, 'pass', v_txt = '1|none|0|0|0');

    v_txt := concat_ws('|',
      (select count(*) from auth.users where id in (v_both, v_out)),
      (select count(*) from app.memberships where user_id = v_both and org_id = v_demo),
      (select string_agg(e.kind || ':' || e.payload::text, ',' order by e.id) from app.platform_events e where e.org_id = v_org));
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'accounts that are not only its own stay; the platform hears only that it went',
      'expected', '2|1|org.deleted:{}', 'actual', coalesce(v_txt, 'none'), 'pass', v_txt = '2|1|org.deleted:{}');

    select concat_ws('|', d.org_number, d.run_by, (d.counts->>'responses')::int > 0, d.counts->>'accounts',
                      d.counts ?| array['email', 'name', 'full_name'])
      into v_txt from app.deletion_log d where d.org_id = v_org;
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'the log records it, with counts and no person',
      'expected', '924118742|schedule|t|1|f', 'actual', coalesce(v_txt, 'none'), 'pass', v_txt = '924118742|schedule|t|1|f');

    -- 10 ----------------------------------------------------------------- the other organisation
    v_txt := (select count(*) from app.organizations where id = v_demo)::text || '|'
      || ((select count(*) from app.answers a join app.responses r on r.id = a.response_id where r.org_id = v_demo) = v_demo_answers)::text;
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'the other organisation is untouched',
      'expected', '1|true', 'actual', v_txt, 'pass', v_txt = '1|true');

    -- 11 ----------------------------------------------------------------- deleting now
    -- a member of the organisation, with no platform command around the call, is refused before anything is read
    perform set_config('request.jwt.claims', format(claims, v_both, 'aal2'), true);
    perform set_config('app.platform_actor', '', true);
    v_txt := coalesce(app.op_delete_now(v_demo, '990000001', 'Sletteforespørsel')->>'error', 'ok');
    perform set_config('request.jwt.claims', '', true);
    perform set_config('app.platform_actor', 'test@platform', true);
    v_txt := v_txt || ',' || coalesce(app.op_delete_now(v_demo, '990000001', 'Sletteforespørsel')->>'error', 'ok');
    perform app.op_cancel_org(v_demo, v_today + 20, 'Kunden sa opp');
    v_txt := v_txt || ',' || coalesce(app.op_delete_now(v_demo, '990 000 002', 'Sletteforespørsel')->>'error', 'ok');
    v_json := app.op_delete_now(v_demo, '990 000 001', 'Sletteforespørsel fra daglig leder');
    v_txt := v_txt || ',' || coalesce(v_json->>'error', 'ok') || ',' || (select count(*) from app.organizations where id = v_demo)
      || ',' || (select run_by from app.deletion_log where org_id = v_demo);
    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'deleting now: a platform command, cancelled, number typed',
      'expected', 'not_allowed,not_cancelled,confirm_mismatch,ok,0,admin', 'actual', v_txt,
      'pass', v_txt = 'not_allowed,not_cancelled,confirm_mismatch,ok,0,admin');

    perform set_config('request.jwt.claims', '', true);
    perform set_config('app.platform_actor', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'every probe change was rolled back', 'expected', '2 organisations, no log',
    'actual', (select count(*) from app.organizations)::text || ' organisations, ' || (select count(*) from app.deletion_log) || ' log',
    'pass', (select count(*) from app.organizations where id in (v_org, v_demo)) = 2 and not exists (select 1 from app.deletion_log)
      and not exists (select 1 from auth.users where email like '%@cancel-test.example'));

  insert into public._cxi
  select (x->>'seq')::int, x->>'name', x->>'expected', x->>'actual', (x->>'pass')::boolean from jsonb_array_elements(v_rows) x;
end $$;

select seq, name, expected, actual, pass from public._cxi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._cxi;
  if v_failed is not null then raise exception 'cancellation invariants failed: %', v_failed; end if;
  if v_count <> 12 then raise exception 'cancellation invariants: expected 12 rows, got %', v_count; end if;
end $$;

drop table public._cxi;
