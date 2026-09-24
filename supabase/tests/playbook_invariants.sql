-- playbook_invariants.sql — app.measures.playbook_key (0031), proved against the live schema.
--
-- A measure may say which playbook suggestion it was adopted from. What must hold:
--
--   * the column is optional — a measure written by hand has none (1)
--   * a key is `<factor>.<n>` with n in 1..3, nothing else (2, 3)
--   * one organisation adopts a suggestion once; a second row is refused (4)
--   * another organisation may adopt the same suggestion (5)
--   * deleting the measure frees the key — the button offers it again (6)
--   * the column changed no access rule: measure_read and measure_write are as 0013 left them (7)
--
-- Every row it writes is deleted before the end. Every row must read pass = true.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/playbook_invariants.sql

create unlogged table if not exists public._pbi(seq int, name text, expected text, actual text, pass bool);
truncate public._pbi;

do $$
declare
  v_org   uuid;
  v_other uuid := '00000000-0000-4000-8000-00000000d0ff';
  v_a     uuid; v_b uuid; v_c uuid;
  v_msg   text;
begin
  select id into v_org from app.organizations where id <> v_other order by id limit 1;
  insert into app.organizations (id, name, org_number, employee_count)
  values (v_other, 'Playbook Test AS', '999000111', 12);

  -- 1: optional
  insert into app.measures (org_id, factor_key, title) values (v_org, 'ytring', 'Skrevet for hånd') returning id into v_a;
  insert into public._pbi
  select 1, 'a hand-written measure carries no key', 'null', coalesce(playbook_key, 'null'), playbook_key is null
  from app.measures where id = v_a;

  -- 2, 3: the shape
  begin
    insert into app.measures (org_id, factor_key, title, playbook_key) values (v_org, 'ytring', 'x', 'ytring.4');
    v_msg := 'accepted';
  exception when check_violation then v_msg := 'check constraint'; end;
  insert into public._pbi values (2, 'a fourth suggestion does not exist', 'check constraint', v_msg, v_msg = 'check constraint');

  begin
    insert into app.measures (org_id, factor_key, title, playbook_key) values (v_org, 'ytring', 'x', 'Ytring-1');
    v_msg := 'accepted';
  exception when check_violation then v_msg := 'check constraint'; end;
  insert into public._pbi values (3, 'a key outside <factor>.<n> is refused', 'check constraint', v_msg, v_msg = 'check constraint');

  -- 4: once per organisation
  insert into app.measures (org_id, factor_key, title, playbook_key) values (v_org, 'ytring', 'Svar innen fem dager', 'ytring.1') returning id into v_b;
  begin
    insert into app.measures (org_id, factor_key, title, playbook_key) values (v_org, 'ytring', 'Svar innen fem dager', 'ytring.1');
    v_msg := 'accepted';
  exception when unique_violation then v_msg := 'unique'; end;
  insert into public._pbi values (4, 'the same organisation cannot adopt a suggestion twice', 'unique', v_msg, v_msg = 'unique');

  -- 5: per organisation, not global
  begin
    insert into app.measures (org_id, factor_key, title, playbook_key) values (v_other, 'ytring', 'Svar innen fem dager', 'ytring.1') returning id into v_c;
    v_msg := 'accepted';
  exception when unique_violation then v_msg := 'unique'; end;
  insert into public._pbi values (5, 'another organisation may adopt the same suggestion', 'accepted', v_msg, v_msg = 'accepted');

  -- 6: deleting frees the key
  delete from app.measures where id = v_b;
  begin
    insert into app.measures (org_id, factor_key, title, playbook_key) values (v_org, 'ytring', 'Svar innen fem dager', 'ytring.1') returning id into v_b;
    v_msg := 'accepted';
  exception when unique_violation then v_msg := 'unique'; end;
  insert into public._pbi values (6, 'deleting the measure offers the suggestion again', 'accepted', v_msg, v_msg = 'accepted');

  -- 7: no policy moved (0013's write policy was split per command later; write_invariants 16)
  insert into public._pbi
  select 7, 'measures keep exactly the policies they had', 'measure_read,measure_write_delete,measure_write_insert,measure_write_update',
         string_agg(policyname, ',' order by policyname),
         string_agg(policyname, ',' order by policyname) = 'measure_read,measure_write_delete,measure_write_insert,measure_write_update'
  from pg_policies where schemaname = 'app' and tablename = 'measures';

  -- clean up
  delete from app.measures where id in (v_a, v_b, v_c);
  delete from app.organizations where id = v_other;
  insert into public._pbi
  select 8, 'every test row is gone', '0', count(*)::text, count(*) = 0
  from (select id from app.measures where id in (v_a, v_b, v_c)
        union all select id from app.organizations where id = v_other) x;
end $$;

select seq, name, expected, actual, pass from public._pbi order by seq;

do $$
declare v_failed text;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) into v_failed from public._pbi where not pass;
  if v_failed is not null then
    raise exception 'playbook invariants failed: %', v_failed;
  end if;
end $$;

drop table public._pbi;
