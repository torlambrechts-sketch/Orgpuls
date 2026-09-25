-- billing_invariants.sql — the trial and the payment details (0048, D-89), proved against the
-- live schema.
--
--   * the table has RLS on; clients may read it and write nothing; anon may call neither RPC (1..3)
--   * the trial is fifteen days, set by a function, and every organisation has a row, a new
--     one from the moment it exists (4..6)
--   * a daglig leder extends once, by fifteen days; a second time, a verneombud, or a leader
--     of another organisation is refused (7..10)
--   * a plan must fit the headcount, the invoice address must be one, EHF needs an
--     organisation number; a confirmation is recorded, and ends the right to extend (11..15)
--   * only the daglig leder reads the row (16)
--   * nothing written here survives (17)
--
-- Reads the design fixture's organisation. Every row must read pass = true.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/billing_invariants.sql

create unlogged table if not exists public._bli(seq int, name text, expected text, actual text, pass bool);
truncate public._bli;

do $$
declare
  v_org    uuid := '00000000-0000-4000-8000-000000000001';
  v_other  uuid := '00000000-0000-4000-8000-0000000b1001';
  v_vo     uuid := '00000000-0000-4000-8000-0000000b1002';
  v_out    uuid := '00000000-0000-4000-8000-0000000b1003';
  v_dl     uuid;
  v_rows   jsonb := '[]';
  v_json   jsonb;
  v_cnt    int;
  v_ok     boolean;
  v_before timestamptz;
  v_after  timestamptz;
  v_txt    text;
begin
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'RLS is on for app.billing', 'expected', 'true',
    'actual', (select relrowsecurity::text from pg_class where oid = 'app.billing'::regclass),
    'pass', (select relrowsecurity from pg_class where oid = 'app.billing'::regclass));

  v_ok := has_table_privilege('authenticated', 'app.billing', 'select')
          and not has_table_privilege('authenticated', 'app.billing', 'insert')
          and not has_table_privilege('authenticated', 'app.billing', 'update')
          and not has_table_privilege('authenticated', 'app.billing', 'delete')
          and not has_table_privilege('anon', 'app.billing', 'select')
          and not exists (select 1 from pg_policies where schemaname = 'app' and tablename = 'billing' and cmd <> 'SELECT');
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'clients read the billing row and write nothing', 'expected', 'true',
    'actual', v_ok::text, 'pass', v_ok);

  v_ok := not has_function_privilege('anon', 'public.extend_trial(uuid)', 'execute')
          and not has_function_privilege('anon', 'public.save_billing(uuid,text,text,text,boolean,boolean)', 'execute');
  v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'anon may call neither RPC', 'expected', 'true',
    'actual', v_ok::text, 'pass', v_ok);

  v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'the trial is fifteen days', 'expected', '15',
    'actual', app.trial_days()::text, 'pass', app.trial_days() = 15);

  select count(*) into v_cnt from app.organizations o where not exists (select 1 from app.billing b where b.org_id = o.id);
  v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'every organisation has a billing row', 'expected', '0 without',
    'actual', v_cnt || ' without', 'pass', v_cnt = 0);

  select m.user_id into v_dl from app.memberships m
  where m.org_id = v_org and m.active and m.role = 'daglig_leder' order by m.id limit 1;

  begin
    -- another organisation, without an organisation number, and its daglig leder; and a verneombud here
    insert into auth.users (id, email) values (v_vo, 'vo@billing-test.example'), (v_out, 'out@billing-test.example');
    insert into app.profiles (id, full_name) values (v_vo, 'VO'), (v_out, 'OUT');
    insert into app.organizations (id, name, employee_count) values (v_other, 'Annen AS', 10);
    insert into app.memberships (org_id, user_id, role, group_id) values
      (v_org, v_vo, 'verneombud', null), (v_other, v_out, 'daglig_leder', null);

    select b.trial_ends_at - b.trial_started_at into v_txt from app.billing b where b.org_id = v_other;
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'a new organisation starts a fifteen-day trial', 'expected', '15 days',
      'actual', coalesce(v_txt, 'no row'), 'pass', v_txt = '15 days');

    -- 7..10 -------------------------------------------------------- extending
    -- the fixture organisation may have been extended or confirmed by an earlier run of the
    -- product; the probe starts from a fresh trial
    update app.billing set trial_extended_at = null, trial_extended_by = null, confirmed_at = null, confirmed_by = null,
      plan = null, invoice_email = null where org_id = v_org;
    select trial_ends_at into v_before from app.billing where org_id = v_org;
    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    v_json := public.extend_trial(v_org);
    select trial_ends_at into v_after from app.billing where org_id = v_org;
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'a daglig leder extends the trial by fifteen days', 'expected', 'ok, +15 days',
      'actual', (v_json->>'ok') || ', +' || (v_after - greatest(v_before, now()))::text,
      'pass', (v_json->>'ok')::boolean and v_after - greatest(v_before, now()) = interval '15 days');

    v_json := public.extend_trial(v_org);
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'the trial can be extended only once', 'expected', 'already_extended',
      'actual', v_json->>'error', 'pass', v_json->>'error' = 'already_extended');

    perform set_config('request.jwt.claims', json_build_object('sub', v_vo, 'role', 'authenticated')::text, true);
    v_json := public.extend_trial(v_org);
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'a verneombud cannot extend', 'expected', 'not_allowed',
      'actual', v_json->>'error', 'pass', v_json->>'error' = 'not_allowed');

    perform set_config('request.jwt.claims', json_build_object('sub', v_out, 'role', 'authenticated')::text, true);
    v_json := public.extend_trial(v_org);
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'a daglig leder of another organisation cannot extend this one', 'expected', 'not_allowed',
      'actual', v_json->>'error', 'pass', v_json->>'error' = 'not_allowed');

    -- 11..15 ------------------------------------------------------- saving and confirming
    update app.organizations set employee_count = 40 where id = v_other;
    v_json := public.save_billing(v_other, 'small', 'faktura@annen.example', null, false, false);
    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'a plan must fit the headcount', 'expected', 'plan_too_small',
      'actual', v_json->>'error', 'pass', v_json->>'error' = 'plan_too_small');

    v_json := public.save_billing(v_other, 'usual', 'ikke en adresse', null, false, false);
    v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'the invoice address must be an e-mail address', 'expected', 'invalid_email',
      'actual', v_json->>'error', 'pass', v_json->>'error' = 'invalid_email');

    v_json := public.save_billing(v_other, 'usual', 'faktura@annen.example', null, true, false);
    v_rows := v_rows || jsonb_build_object('seq', 13, 'name', 'EHF needs an organisation number', 'expected', 'ehf_needs_orgnr',
      'actual', v_json->>'error', 'pass', v_json->>'error' = 'ehf_needs_orgnr');

    v_json := public.save_billing(v_other, 'usual', ' Faktura@Annen.example ', 'PO-17', false, true);
    select count(*) into v_cnt from app.billing
    where org_id = v_other and confirmed_at is not null and confirmed_by = v_out and plan = 'usual'
      and invoice_email = 'faktura@annen.example' and invoice_ref = 'PO-17';
    v_rows := v_rows || jsonb_build_object('seq', 14, 'name', 'a confirmation records the plan, the address and who confirmed', 'expected', 'ok, 1 row',
      'actual', (v_json->>'ok') || ', ' || v_cnt || ' row', 'pass', (v_json->>'ok')::boolean and v_cnt = 1);

    v_json := public.extend_trial(v_other);
    v_rows := v_rows || jsonb_build_object('seq', 15, 'name', 'a confirmed plan cannot extend the trial', 'expected', 'already_subscribed',
      'actual', v_json->>'error', 'pass', v_json->>'error' = 'already_subscribed');

    -- 16 ----------------------------------------------------------- who reads
    perform set_config('request.jwt.claims', json_build_object('sub', v_vo, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into v_cnt from app.billing where org_id = v_org;
    execute 'reset role';
    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select v_cnt * 10 + count(*) into v_cnt from app.billing where org_id = v_org;
    execute 'reset role';
    v_rows := v_rows || jsonb_build_object('seq', 16, 'name', 'only the daglig leder reads the billing row', 'expected', 'verneombud 0, daglig leder 1',
      'actual', 'verneombud ' || (v_cnt / 10) || ', daglig leder ' || (v_cnt % 10), 'pass', v_cnt = 1);

    perform set_config('request.jwt.claims', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  select count(*) into v_cnt from auth.users where id in (v_vo, v_out);
  v_rows := v_rows || jsonb_build_object('seq', 17, 'name', 'every probe row was rolled back', 'expected', '0 users, 0 organisations',
    'actual', v_cnt || ' users, ' || (select count(*) from app.organizations where id = v_other) || ' organisations',
    'pass', v_cnt = 0 and not exists (select 1 from app.organizations where id = v_other));

  insert into public._bli
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean
  from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._bli order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._bli;
  if v_failed is not null then
    raise exception 'billing invariants failed: %', v_failed;
  end if;
  if v_count <> 17 then
    raise exception 'billing invariants: expected 17 rows, got %', v_count;
  end if;
end $$;

drop table public._bli;
