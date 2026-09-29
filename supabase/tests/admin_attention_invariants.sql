-- admin_attention_invariants.sql — «Needs attention» on Sentral's dashboard (0116, X-095), proved
-- against the live schema.
--
--   * no client but a platform admin gets an answer; anon may not call it (1)
--   * a trial ending within 7 days is listed; one ending later, a confirmed one and a demo are not (2)
--   * a deletion due within 14 days is listed for finance, not for an analyst; tickets past their
--     first-reply time for support, not for finance (3)
--   * nothing written here survives (4)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/admin_attention_invariants.sql

create unlogged table if not exists public._att(seq int, name text, expected text, actual text, pass bool);
truncate public._att;

do $$
declare
  v_sup  uuid := '00000000-0000-4000-8000-0000000a7101';
  v_fin  uuid := '00000000-0000-4000-8000-0000000a7102';
  v_ana  uuid := '00000000-0000-4000-8000-0000000a7103';
  v_soon uuid := '00000000-0000-4000-8000-0000000a7111';
  v_late uuid := '00000000-0000-4000-8000-0000000a7112';
  v_paid uuid := '00000000-0000-4000-8000-0000000a7113';
  v_demo uuid := '00000000-0000-4000-8000-0000000a7114';
  v_gone uuid := '00000000-0000-4000-8000-0000000a7115';
  v_json jsonb;
  v_txt  text;
  v_rows jsonb := '[]';
  claims constant text := '{"sub":"%s","role":"authenticated","aal":"aal2"}';
begin
  -- 1 ---------------------------------------------------------------- who may ask
  v_txt := has_function_privilege('anon', 'public.admin_attention()', 'execute')::text || '|'
        || (public.admin_attention()->>'error');
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'anon may not call it; a caller who is not an admin is refused',
    'expected', 'false|not_allowed', 'actual', v_txt, 'pass', v_txt = 'false|not_allowed');

  begin
    insert into auth.users (id, email) values (v_sup, 'support@att-test.example'), (v_fin, 'finance@att-test.example'), (v_ana, 'analyst@att-test.example');
    insert into app.platform_admins (user_id, role) values (v_sup, 'support'), (v_fin, 'finance'), (v_ana, 'analyst');
    insert into app.organizations (id, name, org_number, employee_count) values
      (v_soon, 'Att Snart AS', '999071101', 12), (v_late, 'Att Senere AS', '999071102', 12), (v_paid, 'Att Betalt AS', '999071103', 12),
      (v_demo, 'Att Demo AS', '999071104', 12), (v_gone, 'Att Slettes AS', '999071105', 12);
    update app.billing set trial_ends_at = now() + interval '3 days' where org_id in (v_soon, v_paid, v_demo);
    update app.billing set trial_ends_at = now() + interval '10 days' where org_id = v_late;
    update app.billing set plan = 'small', invoice_email = 'faktura@att-test.example', confirmed_at = now() where org_id = v_paid;
    update app.billing set cancelled_at = now() - interval '30 days', cancel_effective_at = now() - interval '1 day',
      deletion_due_at = now() + interval '5 days', trial_ends_at = now() + interval '3 days' where org_id = v_gone;
    -- marked as a demo last: a demo's billing is locked (organizations_demo_locked)
    insert into app.demo_orgs (org_id, kind) values (v_demo, 'sandbox');
    insert into app.tickets (category, queue, channel, subject, requester_email, created_at) values ('bug', 'support', 'admin', 'Att: past its reply time', 'kunde@att-test.example', now() - interval '30 days');

    -- 2 -------------------------------------------------------------- trials
    perform set_config('request.jwt.claims', format(claims, v_ana), true);
    v_json := public.admin_attention();
    select string_agg(x->>'name', ',' order by x->>'name') into v_txt
      from jsonb_array_elements(v_json->'trials') x where x->>'name' like 'Att %';
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'a trial ending within 7 days is listed; later, confirmed, cancelled and demo ones are not',
      'expected', 'Att Snart AS', 'actual', v_txt, 'pass', v_txt = 'Att Snart AS');

    -- 3 -------------------------------------------------------------- by role
    v_txt := (select count(*) from jsonb_array_elements(v_json->'deletions') x where x->>'name' like 'Att %')::text || ','
          || (select count(*) from jsonb_array_elements(v_json->'tickets') x where x->>'subject' like 'Att:%')::text;
    perform set_config('request.jwt.claims', format(claims, v_fin), true);
    v_json := public.admin_attention();
    v_txt := v_txt || '|' || (select count(*) from jsonb_array_elements(v_json->'deletions') x where x->>'name' like 'Att %')::text || ','
          || (select count(*) from jsonb_array_elements(v_json->'tickets') x where x->>'subject' like 'Att:%')::text;
    perform set_config('request.jwt.claims', format(claims, v_sup), true);
    v_json := public.admin_attention();
    v_txt := v_txt || '|' || (select count(*) from jsonb_array_elements(v_json->'deletions') x where x->>'name' like 'Att %')::text || ','
          || (select count(*) from jsonb_array_elements(v_json->'tickets') x where x->>'subject' like 'Att:%')::text;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'deletions for finance and support, not an analyst; tickets past SLA for support only',
      'expected', '0,0|1,0|1,1', 'actual', v_txt, 'pass', v_txt = '0,0|1,0|1,1');

    raise exception 'rollback';
  exception when others then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 4 ---------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id from app.organizations where name like 'Att % AS'
    union all select id from auth.users where email like '%@att-test.example'
    union all select id from app.tickets where subject like 'Att:%') x;
  v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._att
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._att order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._att;
  if v_failed is not null then raise exception 'admin attention invariants failed: %', v_failed; end if;
  if v_count <> 4 then raise exception 'admin attention invariants: expected 4 rows, got %', v_count; end if;
end $$;
