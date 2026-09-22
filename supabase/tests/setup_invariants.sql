-- setup_invariants.sql — what Måleoppsett writes, proved against the live schema.
--
-- Migration 0017 gave the setup screen somewhere to write: the comment regime, the
-- reminder and closing schedule, which departments are invited, the organisation's own
-- questions, and the § 9-2 / § 6-2 consultation records.
--
-- **Order matters in this file, and it caught a false pass.** The blank-body and
-- over-length checks on app.org_questions are asserted while the organisation has NO own
-- questions, because the five-question cap is a trigger that fires first. Written the
-- other way round — blanks tested after the cap was filled — the assertion passed with
-- the message "an organisation may have at most five of its own questions", which is a
-- test that would keep passing if the blank check were dropped entirely. Same family as
-- the `updated_at > created_at` assertion in measure_invariants.sql that could never pass:
-- an assertion is only worth the specific thing it rules out.
--
--   psql "$DATABASE_URL" -f supabase/tests/setup_invariants.sql
--
-- Through the Supabase MCP instead, run it as two statements: the DO block, then the
-- final select and its verdict.

create unlogged table if not exists public._si(seq int, name text, expected text, actual text, pass bool);
truncate public._si;

do $$
declare
  v_org uuid; v_other uuid := '00000000-0000-4000-8000-0000000000ff';
  v_round uuid; v_meas uuid; v_grp uuid; v_other_grp uuid;
  v_msg text; v_n int; v_i int;
begin
  select id into v_org from app.organizations where id <> v_other order by id limit 1;
  select id into v_grp from app.groups where org_id = v_org order by sort_order limit 1;

  insert into public._si
  select 1, 'RLS on all four new tables', '4', count(*)::text, count(*) = 4
  from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'app'
  where c.relname in ('round_groups','org_questions','round_org_questions','round_consultations')
    and c.relrowsecurity;

  insert into public._si
  select 2, 'no grants to anon on any of them', '0', count(*)::text, count(*) = 0
  from information_schema.role_table_grants
  where table_schema = 'app' and grantee = 'anon'
    and table_name in ('round_groups','org_questions','round_org_questions','round_consultations');

  insert into public._si
  select 3, 'comment policy has the design''s four options', 'hvert,lave,slutt,av',
         string_agg(e.enumlabel, ',' order by e.enumsortorder),
         string_agg(e.enumlabel, ',' order by e.enumsortorder) = 'hvert,lave,slutt,av'
  from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'comment_policy';

  /*
   * The default is a privacy decision. A comment field on every statement gathers the
   * most and re-identifies the most; `lave` shows one only where somebody answered 1 or
   * 2. Whoever creates a round without thinking about it gets the design's own answer.
   */
  insert into public._si
  select 4, 'comment policy defaults to the least exposing that still collects', 'lave',
         column_default, column_default like '%lave%'
  from information_schema.columns
  where table_schema = 'app' and table_name = 'rounds' and column_name = 'comment_policy';

  -- ------------------------------------------------------------------ own questions
  -- FIRST, while the cap cannot be what refuses. See the file header.
  select count(*) into v_n from app.org_questions where org_id = v_org and active;
  insert into public._si values (5, 'precondition: no own questions, so the cap is not in play',
    '0', v_n::text, v_n = 0);

  begin
    insert into app.org_questions (org_id, body) values (v_org, '   ');
    insert into public._si values (6, 'a blank own question is refused by the blank check',
      'check constraint', 'ACCEPTED', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into public._si values (6, 'a blank own question is refused by the blank check',
      'check constraint', left(v_msg, 70), v_msg like '%check constraint%');
  end;

  begin
    insert into app.org_questions (org_id, body) values (v_org, repeat('x', 301));
    insert into public._si values (7, 'an over-long own question is refused',
      'check constraint', 'ACCEPTED', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into public._si values (7, 'an over-long own question is refused',
      'check constraint', left(v_msg, 70), v_msg like '%check constraint%');
  end;

  -- now fill to the cap and prove the sixth is refused, by the trigger this time
  for v_i in 1..5 loop
    insert into app.org_questions (org_id, body) values (v_org, 'Testspørsmål ' || v_i);
  end loop;
  begin
    insert into app.org_questions (org_id, body) values (v_org, 'Det sjette');
    insert into public._si values (8, 'a sixth own question is refused by the cap',
      'at most five', 'ACCEPTED', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into public._si values (8, 'a sixth own question is refused by the cap',
      'at most five', left(v_msg, 70), v_msg like '%at most five%');
  end;

  -- ------------------------------------------------------------------ round setup
  insert into app.measurements (org_id, kind, year, label)
  values (v_org, 'puls', 2099, 'Oppsett-test') returning id into v_meas;
  insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
  values (v_org, v_meas, 'planlagt', now(), now() + interval '7 days') returning id into v_round;

  insert into public._si
  select 9, 'a new round carries the default comment regime', 'lave,true',
         comment_policy::text || ',' || allow_dialogue::text,
         comment_policy = 'lave' and allow_dialogue
  from app.rounds where id = v_round;

  begin
    update app.rounds set reminder_day = 30 where id = v_round;
    insert into public._si values (10, 'a reminder outside 1..14 days is refused', 'rejected', 'ACCEPTED', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into public._si values (10, 'a reminder outside 1..14 days is refused', 'rejected', left(v_msg, 60), true);
  end;

  insert into app.organizations (id, name, org_number, employee_count, threshold)
  values (v_other, 'Testvirksomhet AS', '999999999', 1, 5) on conflict (id) do nothing;
  insert into app.groups (org_id, name, sort_order) values (v_other, 'Annen gruppe', 1)
  returning id into v_other_grp;

  begin
    insert into app.round_groups (round_id, group_id) values (v_round, v_other_grp);
    insert into public._si values (11, 'a group from another organisation is refused', 'rejected', 'ACCEPTED', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into public._si values (11, 'a group from another organisation is refused', 'rejected', left(v_msg, 70), true);
  end;

  insert into app.round_groups (round_id, group_id) values (v_round, v_grp);
  insert into public._si
  select 12, 'an invited group is recorded', '1', count(*)::text, count(*) = 1
  from app.round_groups where round_id = v_round;

  /*
   * A ticked box is a claim; a date and a named counterpart is documentation. § 9-2
   * første ledd is what an inspector asks about when results are broken down by group,
   * which this product does by default.
   */
  insert into app.round_consultations (round_id, kind, confirmed, held_on, counterpart)
  values (v_round, 'droftet_tillitsvalgte', true, date '2026-02-03', 'Kari Sund, tillitsvalgt Fellesforbundet');
  insert into public._si
  select 13, 'a drøfting is a date and a counterpart, not just a tick', '2026-02-03|true',
         held_on::text || '|' || (counterpart is not null)::text,
         held_on = date '2026-02-03' and counterpart is not null
  from app.round_consultations where round_id = v_round and kind = 'droftet_tillitsvalgte';

  insert into public._si
  select 14, 'the evaluation cadence defaults to årlig', 'arlig',
         evaluation_cadence::text, evaluation_cadence = 'arlig'
  from app.measurements where id = v_meas;

  -- referential maintenance: the round's setup goes with it, the questions do not
  delete from app.rounds where id = v_round;
  select count(*) into v_n from app.round_groups where round_id = v_round;
  insert into public._si values (15, 'deleting a round takes its invited groups with it', '0', v_n::text, v_n = 0);
  select count(*) into v_n from app.round_consultations where round_id = v_round;
  insert into public._si values (16, 'deleting a round takes its consultations with it', '0', v_n::text, v_n = 0);
  select count(*) into v_n from app.org_questions where org_id = v_org and active;
  insert into public._si values (17, 'the organisation''s own questions survive the round', '5', v_n::text, v_n = 5);

  -- put everything back: the fixture is the only source of rows that survive a reset
  delete from app.org_questions where org_id = v_org;
  delete from app.measurements where id = v_meas;
  delete from app.organizations where id = v_other;
  select count(*) into v_n from app.org_questions where org_id = v_org;
  insert into public._si values (18, 'test rows removed', '0', v_n::text, v_n = 0);
end $$;

select seq, name, expected, actual, pass from public._si order by seq;

-- The table above is the report; this is the verdict.
do $$
declare v_failed text;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) into v_failed
  from public._si where not pass;
  if v_failed is not null then
    raise exception 'setup invariants failed: %', v_failed;
  end if;
end $$;

drop table public._si;
