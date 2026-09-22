-- risk_invariants.sql — app.risk_assessments, proved against the live schema.
--
-- The risk assessment is the middle step of § 3-1 bokstav c, and the one the design
-- computes from an index. What must hold once it is stored: it is readable only inside
-- its own organisation, it cannot rest on another organisation's kartlegging or be
-- signed by another organisation's employee, it cannot assess a factor the round never
-- asked about, it cannot carry a verdict with no reasoning behind it, and the database's
-- own referential maintenance must be able to null its author without the record
-- disappearing — the trap CLAUDE.md records five rediscoveries of.
--
-- It creates a second organisation and a throwaway puls, and removes both at the end.
-- Every row must read pass = true.
--
--   psql "$DATABASE_URL" -f supabase/tests/risk_invariants.sql
--
-- Through the Supabase MCP instead, run it as two statements: the DO block, then the
-- final select and its verdict.

create unlogged table if not exists public._ri(seq int, name text, expected text, actual text, pass bool);
truncate public._ri;

do $$
declare
  v_org uuid; v_other uuid := '00000000-0000-4000-8000-0000000000ff';
  v_round uuid; v_other_round uuid; v_other_meas uuid;
  v_emp uuid; v_other_emp uuid; v_ra uuid; v_msg text; v_n int;
  v_puls uuid; v_puls_meas uuid;
begin
  select id into v_org from app.organizations where id <> v_other order by id limit 1;
  select r.id into v_round from app.rounds r where r.org_id = v_org and r.status = 'lukket'
    order by r.closes_at desc limit 1;

  insert into public._ri
  select 1, 'RLS enabled on risk_assessments', 'true', relrowsecurity::text, relrowsecurity
  from pg_class where oid = 'app.risk_assessments'::regclass;

  insert into public._ri
  select 2, 'RLS enabled on risk_factor_assessments', 'true', relrowsecurity::text, relrowsecurity
  from pg_class where oid = 'app.risk_factor_assessments'::regclass;

  insert into public._ri
  select 3, 'no grants to anon', '0', count(*)::text, count(*) = 0
  from information_schema.role_table_grants
  where table_schema = 'app' and grantee = 'anon'
    and table_name in ('risk_assessments', 'risk_factor_assessments');

  insert into public._ri
  select 4, 'select policies are org-scoped', '2', count(*)::text, count(*) = 2
  from pg_policies
  where schemaname = 'app' and cmd = 'SELECT'
    and tablename in ('risk_assessments', 'risk_factor_assessments')
    and qual like '%is_org_member%';

  insert into app.organizations (id, name, org_number, employee_count, threshold)
  values (v_other, 'Testvirksomhet AS', '999999999', 1, 5) on conflict (id) do nothing;
  insert into app.measurements (org_id, kind, year, label)
  values (v_other, 'puls', 2099, 'Annen måling') returning id into v_other_meas;
  insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
  values (v_other, v_other_meas, 'planlagt', now(), now() + interval '7 days') returning id into v_other_round;
  insert into app.employees (org_id, full_name, email)
  values (v_other, 'Annen Ansatt', 'annen@test.example') returning id into v_other_emp;

  begin
    insert into app.risk_assessments (org_id, round_id, assessed_on)
    values (v_org, v_other_round, current_date);
    insert into public._ri values (5, 'another org''s round refused', 'rejected', 'ACCEPTED', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into public._ri values (5, 'another org''s round refused', 'rejected', left(v_msg, 60), true);
  end;

  begin
    insert into app.risk_assessments (org_id, round_id, assessed_on, assessed_by_employee_id)
    values (v_org, v_round, current_date, v_other_emp);
    insert into public._ri values (6, 'an assessor from another org refused', 'rejected', 'ACCEPTED', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into public._ri values (6, 'an assessor from another org refused', 'rejected', left(v_msg, 60), true);
  end;

  -- a throwaway puls of this organisation, carrying one factor and not the other
  insert into app.measurements (org_id, kind, year, label)
  values (v_org, 'puls', 2099, 'Testmåling') returning id into v_puls_meas;
  insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
  values (v_org, v_puls_meas, 'planlagt', now(), now() + interval '7 days') returning id into v_puls;
  insert into app.round_factors (org_id, round_id, factor_key) values (v_org, v_puls, 'ytring');

  insert into app.risk_assessments (org_id, round_id, assessed_on, summary)
  values (v_org, v_puls, date '2099-01-01', 'Testvurdering') returning id into v_ra;

  /*
   * "På denne bakgrunn" is a constraint, not a preposition. A puls carries two or three
   * factors; assessing one it never asked about would be a judgement resting on no data.
   */
  begin
    insert into app.risk_factor_assessments (assessment_id, factor_key, probability, consequence, assessment, conclusion)
    values (v_ra, 'mengde', 'hoy', 'alvorlig', 'Faktor som runden ikke målte', 'krever_tiltak');
    insert into public._ri values (7, 'a factor the round did not measure is refused', 'rejected', 'ACCEPTED', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into public._ri values (7, 'a factor the round did not measure is refused', 'rejected', left(v_msg, 70), true);
  end;

  -- a band with nothing behind it is a number wearing a judgement's clothes
  begin
    insert into app.risk_factor_assessments (assessment_id, factor_key, probability, consequence, assessment, conclusion)
    values (v_ra, 'ytring', 'hoy', 'alvorlig', '   ', 'krever_tiltak');
    insert into public._ri values (8, 'a banded verdict with no reasoning is refused', 'rejected', 'ACCEPTED', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into public._ri values (8, 'a banded verdict with no reasoning is refused', 'rejected', left(v_msg, 70), true);
  end;

  insert into app.risk_factor_assessments (assessment_id, factor_key, probability, consequence, assessment, conclusion)
  values (v_ra, 'ytring', 'hoy', 'alvorlig', 'Vurdert.', 'krever_tiltak');

  -- one standing assessment per kartlegging, so "is this round risk-assessed" has one answer
  begin
    insert into app.risk_assessments (org_id, round_id, assessed_on) values (v_org, v_puls, current_date);
    insert into public._ri values (9, 'a second standing assessment of one round is refused', 'rejected', 'ACCEPTED', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into public._ri values (9, 'a second standing assessment of one round is refused', 'rejected', left(v_msg, 60), true);
  end;

  -- the author leaves: the assessment stays, because it was still made, and on that date
  insert into app.employees (org_id, full_name, email)
  values (v_org, 'Test Testesen', 'test.testesen@test.example') returning id into v_emp;
  update app.risk_assessments set assessed_by_employee_id = v_emp where id = v_ra;
  delete from app.employees where id = v_emp;
  select count(*) into v_n from app.risk_assessments where id = v_ra and assessed_by_employee_id is null;
  insert into public._ri values (10, 'the assessor leaving nulls the link, keeps the assessment', '1', v_n::text, v_n = 1);

  delete from app.risk_assessments where id = v_ra;
  select count(*) into v_n from app.risk_factor_assessments where assessment_id = v_ra;
  insert into public._ri values (11, 'deleting an assessment takes its factors with it', '0', v_n::text, v_n = 0);

  -- put everything back: the fixture is the only source of rows that survive a reset
  delete from app.measurements where id = v_puls_meas;
  delete from app.organizations where id = v_other;
  select count(*) into v_n from app.organizations where id = v_other;
  insert into public._ri values (12, 'test rows removed', '0', v_n::text, v_n = 0);
end $$;

select seq, name, expected, actual, pass from public._ri order by seq;

-- The table above is the report; this is the verdict.
do $$
declare v_failed text;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) into v_failed
  from public._ri where not pass;
  if v_failed is not null then
    raise exception 'risk invariants failed: %', v_failed;
  end if;
end $$;

drop table public._ri;
