-- org_industry_invariants.sql — the organisation's industry setting (0091, D-139), proved against
-- the live schema.
--
--   * a daglig leder writes it; a verneombud and an avdelingsleder cannot (1)
--   * only a manual choice names an industry, and a slug has the registry's shape (2)
--   * nothing written here survives (3)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/org_industry_invariants.sql

create unlogged table if not exists public._oind(seq int, name text, expected text, actual text, pass bool);
truncate public._oind;

do $$
declare
  v_org  uuid := '00000000-0000-4000-8000-00000000ae01';
  v_dl   uuid := '00000000-0000-4000-8000-0000000ae011';
  v_vo   uuid := '00000000-0000-4000-8000-0000000ae012';
  v_al   uuid := '00000000-0000-4000-8000-0000000ae013';
  v_u    uuid;
  v_rows jsonb := '[]';
  v_txt  text;
  v_n    int;
  claims constant text := '{"sub":"%s","role":"authenticated","aal":"aal1"}';
begin
  begin
    insert into app.organizations (id, name, org_number, employee_count) values (v_org, 'Bransje AS', '999000557', 12);
    insert into auth.users (id, email) values (v_dl, 'dl@ind-test.example'), (v_vo, 'vo@ind-test.example'), (v_al, 'al@ind-test.example');
    insert into app.profiles (id, full_name) values (v_dl, 'DL'), (v_vo, 'VO'), (v_al, 'AL');
    insert into app.memberships (org_id, user_id, role)
    values (v_org, v_dl, 'daglig_leder'), (v_org, v_vo, 'verneombud'), (v_org, v_al, 'avdelingsleder');

    -- 1 ------------------------------------------------------------ who writes
    v_txt := '';
    foreach v_u in array array[v_vo, v_al, v_dl] loop
      perform set_config('request.jwt.claims', format(claims, v_u), true);
      set local role authenticated;
      update app.organizations set industry_source = 'manual', industry_key = 'handel', industry_suggested = 'kunnskap-og-kontor'
      where id = v_org;
      get diagnostics v_n = row_count;
      reset role;
      v_txt := v_txt || v_n;
    end loop;
    perform set_config('request.jwt.claims', '', true);
    v_txt := v_txt || '|' || (select concat_ws(',', industry_source, industry_key, industry_suggested) from app.organizations where id = v_org);
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'only a daglig leder writes the industry',
      'expected', '001|manual,handel,kunnskap-og-kontor', 'actual', v_txt, 'pass', v_txt = '001|manual,handel,kunnskap-og-kontor');

    -- 2 ------------------------------------------------------------ the shape
    v_txt := '';
    begin
      update app.organizations set industry_source = 'brreg' where id = v_org;
      v_txt := 'written';
    exception when check_violation then v_txt := 'refused';
    end;
    begin
      update app.organizations set industry_source = null, industry_key = null, industry_suggested = 'handel' where id = v_org;
      v_txt := v_txt || ',written';
    exception when check_violation then v_txt := v_txt || ',refused';
    end;
    begin
      update app.organizations set industry_key = 'Handel; drop' where id = v_org;
      v_txt := v_txt || ',written';
    exception when check_violation then v_txt := v_txt || ',refused';
    end;
    begin
      update app.organizations set industry_source = 'annet' where id = v_org;
      v_txt := v_txt || ',written';
    exception when check_violation then v_txt := v_txt || ',refused';
    end;
    update app.organizations set industry_source = 'manual', industry_key = null, industry_suggested = null where id = v_org;
    update app.organizations set industry_source = 'brreg', industry_key = null, industry_suggested = null where id = v_org;
    v_txt := v_txt || ',' || (select industry_source from app.organizations where id = v_org);
    v_rows := v_rows || jsonb_build_object('seq', 2,
      'name', 'following the code names nothing; a slug has the registry''s shape; «ingen» and «følg koden» are taken',
      'expected', 'refused,refused,refused,refused,brreg', 'actual', v_txt, 'pass', v_txt = 'refused,refused,refused,refused,brreg');

    raise exception 'rollback' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 3 ---------------------------------------------------------------- nothing left
  select count(*) into v_n from app.organizations where id = v_org;
  v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'every probe row was rolled back',
    'expected', '0', 'actual', v_n::text, 'pass', v_n = 0);

  insert into public._oind
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._oind order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._oind;
  if v_failed is not null then raise exception 'org industry invariants failed: %', v_failed; end if;
  if v_count <> 3 then raise exception 'org industry invariants: expected 3 rows, got %', v_count; end if;
end $$;

drop table public._oind;
