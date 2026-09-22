-- measure_invariants.sql — app.measures, proved against the live schema.
--
-- A measure is the organisation's record of a decision it made about a factor, and the
-- statutory report prints it. What must hold: it is readable only inside its own
-- organisation, it cannot be made to point at another organisation's round or employee,
-- and the database's own referential maintenance must be able to null those references
-- without the row disappearing or the delete failing — which is the trap CLAUDE.md
-- records having been rediscovered five times.
--
-- It creates a second organisation and a throwaway round, and removes both at the end.
-- Every row must read pass = true.
--
--   psql "$DATABASE_URL" -f supabase/tests/measure_invariants.sql
--
-- Through the Supabase MCP instead, run it as two statements: the DO block, then the
-- final select and its verdict.

create unlogged table if not exists public._mi(seq int, name text, expected text, actual text, pass bool);
truncate public._mi;

do $$
declare
  v_org uuid; v_other uuid := '00000000-0000-4000-8000-0000000000ff';
  v_meas uuid; v_round uuid; v_other_round uuid;
  v_emp uuid; v_other_emp uuid; v_m uuid;
  v_msg text; v_n int; v_step app.measure_step; v_updated timestamptz;
begin
  select id into v_org from app.organizations where id <> v_other order by id limit 1;

  -- a throwaway employee, not one of the fixture's: assertion 12 deletes its owner, and
  -- deleting a real employee would change the headcount every response rate divides by.
  insert into app.employees (org_id, full_name, email)
  values (v_org, 'Test Testesen', 'test.testesen@test.example') returning id into v_emp;

  insert into public._mi
  select 1, 'RLS enabled on measures', 'true', relrowsecurity::text, relrowsecurity
  from pg_class where oid = 'app.measures'::regclass;

  insert into public._mi
  select 2, 'select policy is org-scoped', 'is_org_member',
         coalesce(string_agg(policyname, ','), 'none'),
         count(*) = 1
  from pg_policies
  where schemaname = 'app' and tablename = 'measures' and cmd = 'SELECT'
    and qual like '%is_org_member%';

  insert into public._mi
  select 3, 'no grants to anon', '0', count(*)::text, count(*) = 0
  from information_schema.role_table_grants
  where table_schema = 'app' and table_name = 'measures' and grantee = 'anon';

  insert into public._mi
  select 4, 'six steps, lukket last', 'foreslatt,besluttet,pagar,gjennomfort,effekt_malt,lukket',
         string_agg(e.enumlabel, ',' order by e.enumsortorder),
         string_agg(e.enumlabel, ',' order by e.enumsortorder)
         = 'foreslatt,besluttet,pagar,gjennomfort,effekt_malt,lukket'
  from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'measure_step';

  -- a throwaway round of this organisation, to delete under a measure later
  insert into app.measurements (org_id, kind, year, label)
  values (v_org, 'puls', 2099, 'Testmåling') returning id into v_meas;
  insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
  values (v_org, v_meas, 'planlagt', now(), now() + interval '7 days') returning id into v_round;

  -- and a second organisation with a round and an employee of its own
  insert into app.organizations (id, name, org_number, employee_count, threshold)
  values (v_other, 'Testvirksomhet AS', '999999999', 1, 5) on conflict (id) do nothing;
  insert into app.measurements (org_id, kind, year, label)
  values (v_other, 'puls', 2099, 'Annen måling') returning id into v_m;
  insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
  values (v_other, v_m, 'planlagt', now(), now() + interval '7 days') returning id into v_other_round;
  insert into app.employees (org_id, full_name, email)
  values (v_other, 'Annen Ansatt', 'annen@test.example') returning id into v_other_emp;

  begin
    insert into app.measures (org_id, factor_key, round_id, title)
    values (v_org, 'ytring', v_other_round, 'Tiltak mot annen runde');
    insert into public._mi values (5, 'other org round refused', 'rejected', 'ACCEPTED', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into public._mi values (5, 'other org round refused', 'rejected', left(v_msg, 60), true);
  end;

  begin
    insert into app.measures (org_id, factor_key, owner_employee_id, title)
    values (v_org, 'ytring', v_other_emp, 'Tiltak med annen eier');
    insert into public._mi values (6, 'other org owner refused', 'rejected', 'ACCEPTED', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into public._mi values (6, 'other org owner refused', 'rejected', left(v_msg, 60), true);
  end;

  begin
    insert into app.measures (org_id, factor_key, title) values (v_org, 'ytring', '   ');
    insert into public._mi values (7, 'blank title refused', 'rejected', 'ACCEPTED', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into public._mi values (7, 'blank title refused', 'rejected', left(v_msg, 60), true);
  end;

  -- the real thing, pointing at this organisation's own round and employee
  insert into app.measures (org_id, factor_key, round_id, owner_employee_id, title, step)
  values (v_org, 'ytring', v_round, v_emp, 'Testtiltak', 'besluttet')
  returning id, updated_at into v_m, v_updated;

  insert into public._mi values (8, 'measure created', 'true', (v_m is not null)::text, v_m is not null);

  update app.measures set step = 'pagar' where id = v_m;
  select step into v_step from app.measures where id = v_m;
  insert into public._mi values (9, 'step advances', 'pagar', v_step::text, v_step = 'pagar');

  /*
   * updated_at is the server's, not the caller's.
   *
   * The obvious assertion -- that updated_at moves past created_at after an update --
   * cannot pass and does not mean anything: now() is the transaction's start time, so
   * inside one transaction every now() is the same instant. What is worth proving is
   * that a client cannot set the column: the trigger overwrites whatever arrives.
   */
  update app.measures set updated_at = timestamptz '2000-01-01' where id = v_m;
  select updated_at into v_updated from app.measures where id = v_m;
  insert into public._mi values (10, 'updated_at is the server''s, not the caller''s',
    'overwritten',
    case when v_updated > timestamptz '2020-01-01' then 'overwritten' else 'kept the caller''s' end,
    v_updated > timestamptz '2020-01-01');

  -- referential maintenance: the parent goes, the record stays
  delete from app.rounds where id = v_round;
  select count(*) into v_n from app.measures where id = v_m and round_id is null;
  insert into public._mi values (11, 'round delete nulls the link, keeps the measure', '1', v_n::text, v_n = 1);

  delete from app.employees where id = v_emp;
  select count(*) into v_n from app.measures where id = v_m and owner_employee_id is null;
  insert into public._mi values (12, 'employee delete nulls the owner, keeps the measure', '1', v_n::text, v_n = 1);

  -- put everything back: the fixture is the only source of rows that survive a reset
  delete from app.measures where id = v_m;
  delete from app.measurements where id = v_meas;
  delete from app.organizations where id = v_other;
  select count(*) into v_n from app.organizations where id = v_other;
  insert into public._mi values (13, 'test rows removed', '0', v_n::text, v_n = 0);
end $$;

select seq, name, expected, actual, pass from public._mi order by seq;

-- The table above is the report; this is the verdict.
do $$
declare v_failed text;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) into v_failed
  from public._mi where not pass;
  if v_failed is not null then
    raise exception 'measure invariants failed: %', v_failed;
  end if;
end $$;

drop table public._mi;
