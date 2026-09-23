-- write_invariants.sql — a refused write is refused, and says so.
--
-- This suite exists because of S1 in docs/CODE_REVIEW_2026-09-23.md, and it proves the
-- half of that defect that lives in the database rather than in TypeScript.
--
-- Row-level security does not raise on an UPDATE or DELETE it filters to zero rows. It
-- narrows the statement, the statement runs, and nothing matches. PostgREST turns that
-- into `204 No Content` with an empty body, supabase-js reports `error: null`, and every
-- server action in this product used to read that as success — so a verneombud could
-- change the årshjul's cadence, be told it saved, and watch the old value come back.
--
-- The application fix is `.select(...)` on every mutation plus `lib/supabase/write.ts`,
-- which reads the rows that come back. That fix is only correct if the database really
-- does answer a refused write with zero rows rather than an error, for every policy the
-- actions write through. **That is what this file asserts**, and it asserts it in both
-- directions: the refused caller changes nothing, and the permitted caller gets exactly
-- one row back. An assertion that only proved the first would keep passing if a policy
-- were widened to admit everybody.
--
-- The technique is settings_invariants.sql's: demote a real membership inside the single
-- transaction this block runs in, so a raise anywhere rolls the role back along with
-- everything else, and restore it explicitly on the happy path. Assertion 14 proves the
-- restore, and the whole thing is one DO block precisely so there is no window in which a
-- failure could leave the demotion behind.
--
-- NOTE ON ROLES. Each case switches to `authenticated` with `set local role`, runs the
-- statement, and resets before recording — the report table is written as the suite's own
-- role, because `authenticated` has no grant on it and should not acquire one.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/write_invariants.sql

create unlogged table if not exists public._wr(seq int, name text, expected text, actual text, pass bool);
truncate public._wr;

do $$
declare
  v_org uuid; v_user uuid; v_ms uuid; v_wheel uuid; v_meas uuid;
  v_n int; v_msg text; v_lead int; v_thresh int;
begin
  select id into v_org from app.organizations order by id limit 1;
  select id, user_id into v_ms, v_user from app.memberships
    where org_id = v_org and active and role = 'daglig_leder' order by id limit 1;
  select id, notify_lead_days into v_wheel, v_lead from app.year_wheels where org_id = v_org;
  select threshold into v_thresh from app.organizations where id = v_org;
  select id into v_meas from app.measures where org_id = v_org order by created_at limit 1;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  -- 1, 2 --------------------------------------- the permitted caller gets its row back
  -- Each write sets a column to the value it already holds, so the assertion is about
  -- what RLS returns and never about changing the fixture.
  set local role authenticated;
  with touched as (
    update app.year_wheels set notify_lead_days = v_lead where id = v_wheel returning id
  ) select count(*) into v_n from touched;
  reset role;
  insert into public._wr values (1, 'a daglig leder''s wheel update returns its row', '1', v_n::text, v_n = 1);

  set local role authenticated;
  with touched as (
    update app.organizations set threshold = v_thresh where id = v_org returning id
  ) select count(*) into v_n from touched;
  reset role;
  insert into public._wr values (2, 'and their threshold update returns its row', '1', v_n::text, v_n = 1);

  set local role authenticated;
  with touched as (
    update app.measures set step = step where id = v_meas returning id
  ) select count(*) into v_n from touched;
  reset role;
  insert into public._wr values (3, 'and their measure update returns its row', '1', v_n::text, v_n = 1);

  -- 4..11 --------------------------- the refused caller changes nothing, and is not told
  update app.memberships set role = 'verneombud' where id = v_ms;

  begin
    set local role authenticated;
    with touched as (
      update app.year_wheels set notify_lead_days = 3 where id = v_wheel returning id
    ) select count(*) into v_n from touched;
    reset role;
    insert into public._wr values (4, 'a verneombud''s wheel update raises nothing', 'silent', 'silent', true);
    insert into public._wr values (5, 'and changes no row', '0', v_n::text, v_n = 0);
  exception when others then
    reset role;
    get stacked diagnostics v_msg = message_text;
    -- an exception would be a *better* outcome than silence, and would mean the
    -- application fix is aimed at the wrong thing — so it fails here rather than passing
    insert into public._wr values (4, 'a verneombud''s wheel update raises nothing', 'silent', left(v_msg, 50), false);
    insert into public._wr values (5, 'and changes no row', '0', 'raised instead', false);
  end;

  insert into public._wr
  select 6, 'the wheel is untouched by the refused write', v_lead::text,
         notify_lead_days::text, notify_lead_days = v_lead
  from app.year_wheels where id = v_wheel;

  set local role authenticated;
  with touched as (
    update app.organizations set threshold = 10 where id = v_org returning id
  ) select count(*) into v_n from touched;
  reset role;
  insert into public._wr values (7, 'nor may they raise the threshold', '0', v_n::text, v_n = 0);

  insert into public._wr
  select 8, 'and the threshold is unmoved', v_thresh::text, threshold::text, threshold = v_thresh
  from app.organizations where id = v_org;

  set local role authenticated;
  with touched as (
    update app.measures set step = step where id = v_meas returning id
  ) select count(*) into v_n from touched;
  reset role;
  insert into public._wr values (9, 'nor touch a measure', '0', v_n::text, v_n = 0);

  set local role authenticated;
  with touched as (
    delete from app.measures where id = v_meas returning id
  ) select count(*) into v_n from touched;
  reset role;
  insert into public._wr values (10, 'nor delete one', '0', v_n::text, v_n = 0);

  insert into public._wr
  select 11, 'and the measure is still there', '1', count(*)::text, count(*) = 1
  from app.measures where id = v_meas;

  -- 12 -------------------------------------- an INSERT refused by WITH CHECK does raise
  -- Recorded because it is the one shape that behaves differently: a WITH CHECK violation
  -- is an error, where a filtered UPDATE is a silence. Both are visible to the caller now;
  -- this asserts which is which so the difference is on the record.
  begin
    set local role authenticated;
    insert into app.locations (org_id, name, address, headcount)
    values (v_org, 'Skal avvises', 'Ingen vei 1', 0);
    reset role;
    insert into public._wr values (12, 'a refused insert raises rather than silently doing nothing',
      'raised', 'ACCEPTED', false);
  exception when others then
    reset role;
    get stacked diagnostics v_msg = message_text;
    insert into public._wr values (12, 'a refused insert raises rather than silently doing nothing',
      'raised', left(v_msg, 45), true);
  end;

  -- 13, 14 ------------------------------------------- restored, and permitted again
  update app.memberships set role = 'daglig_leder' where id = v_ms;

  set local role authenticated;
  with touched as (
    update app.measures set step = step where id = v_meas returning id
  ) select count(*) into v_n from touched;
  reset role;
  insert into public._wr values (13, 'a daglig leder may again, and the row comes back', '1', v_n::text, v_n = 1);

  insert into public._wr
  select 14, 'the membership is back as it was', 'daglig_leder|true',
         role::text || '|' || active::text, role = 'daglig_leder' and active
  from app.memberships where id = v_ms;

  -- 15 ------------------------------------------------------------ the structural rule
  -- Every table the server actions write through must gate its writes on a role, not on
  -- mere membership. A write policy that only asks is_org_member would make the whole
  -- suite above pass while granting every member every write.
  insert into public._wr
  select 15, 'every table the actions write gates writes on a role', '0', count(*)::text, count(*) = 0
  from pg_policies p
  where p.schemaname = 'app'
    and p.tablename in ('year_wheels','organizations','locations','measures',
                        'org_questions','rounds','round_consultations')
    and p.cmd in ('ALL','UPDATE','INSERT','DELETE')
    and coalesce(p.qual, '') || coalesce(p.with_check, '') not like '%has_role%';

  perform set_config('request.jwt.claims', '', true);
end $$;

select seq, name, expected, actual, pass from public._wr order by seq;

-- The table above is the report; this is the verdict.
do $$
declare v_failed text;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) into v_failed
  from public._wr where not pass;
  if v_failed is not null then
    raise exception 'write invariants failed: %', v_failed;
  end if;
end $$;

drop table public._wr;
