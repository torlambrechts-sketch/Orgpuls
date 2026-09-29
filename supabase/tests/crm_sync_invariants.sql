-- crm_sync_invariants.sql — the CRM sync and an account's changed address (0117), proved against the
-- live schema.
--
--   * an account whose address changed: its contact moves to the new address and the sync runs (1)
--   * the new address already a subscriber's contact: that contact takes the account, the old one lets
--     go of it, and the sync runs (2)
--   * nothing written here survives (3)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/crm_sync_invariants.sql

create unlogged table if not exists public._csy(seq int, name text, expected text, actual text, pass bool);
truncate public._csy;

do $$
declare
  v_org uuid := '00000000-0000-4000-8000-0000000c5901';
  v_a   uuid := '00000000-0000-4000-8000-0000000c5911';
  v_b   uuid := '00000000-0000-4000-8000-0000000c5912';
  v_txt text;
  v_rows jsonb := '[]';
begin
  begin
    insert into app.organizations (id, name, org_number, employee_count) values (v_org, 'Synk Test AS', '999059101', 12);
    insert into auth.users (id, email) values (v_a, 'a.old@sync-test.example'), (v_b, 'b.old@sync-test.example');
    insert into app.profiles (id, full_name) values (v_a, 'Anna'), (v_b, 'Bo');
    insert into app.memberships (org_id, user_id, role) values (v_org, v_a, 'daglig_leder'), (v_org, v_b, 'verneombud');
    perform app.crm_sync();

    -- 1 -------------------------------------------------------------- the address changed
    update auth.users set email = 'a.new@sync-test.example' where id = v_a;
    perform app.crm_sync();
    select string_agg(email || '=' || (user_id is not distinct from v_a)::text, ',' order by email) into v_txt
      from app.crm_contacts where email like 'a.%@sync-test.example';
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'a changed address: the contact follows it and the sync runs',
      'expected', 'a.new@sync-test.example=true', 'actual', v_txt, 'pass', v_txt = 'a.new@sync-test.example=true');

    -- 2 -------------------------------------------------------------- the new address was a subscriber's
    insert into app.crm_contacts (email, source, basis, status, consent_at, consent_source)
      values ('b.new@sync-test.example', 'newsletter', 'consent', 'active', now(), 'sync test');
    update auth.users set email = 'b.new@sync-test.example' where id = v_b;
    perform app.crm_sync();
    select string_agg(email || '=' || (user_id is not distinct from v_b)::text, ',' order by email) into v_txt
      from app.crm_contacts where email like 'b.%@sync-test.example';
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'the new address was a subscriber''s: that contact takes the account',
      'expected', 'b.new@sync-test.example=true,b.old@sync-test.example=false', 'actual', v_txt,
      'pass', v_txt = 'b.new@sync-test.example=true,b.old@sync-test.example=false');

    raise exception 'rollback';
  exception when others then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 3 ---------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id from app.organizations where id = v_org
    union all select id from auth.users where email like '%@sync-test.example'
    union all select id from app.crm_contacts where email like '%@sync-test.example') x;
  v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._csy
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._csy order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._csy;
  if v_failed is not null then raise exception 'crm sync invariants failed: %', v_failed; end if;
  if v_count <> 3 then raise exception 'crm sync invariants: expected 3 rows, got %', v_count; end if;
end $$;
