-- crm_deal_invariants.sql — a deal's value and contact (0119, X-095), proved against the live schema.
--
--   * a new deal keeps its value; the pipeline's reader returns it with the contact (1)
--   * an update without a value leaves it; an empty value clears it; a bad one is refused (2)
--   * the contact is the first contact, else the register's general manager (3)
--   * support may read, not write; the owners offered are those who work the CRM (4, 6)
--   * nothing written here survives (5)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/crm_deal_invariants.sql

create unlogged table if not exists public._deal(seq int, name text, expected text, actual text, pass bool);
truncate public._deal;

do $$
declare
  v_mkt uuid := '00000000-0000-4000-8000-0000000a7301';
  v_sup uuid := '00000000-0000-4000-8000-0000000a7302';
  v_id  uuid;
  v_row jsonb;
  v_txt text;
  v_rows jsonb := '[]';
  claims constant text := '{"sub":"%s","role":"authenticated","aal":"aal2"}';
begin
  begin
    insert into auth.users (id, email) values (v_mkt, 'marketing@deal-test.example'), (v_sup, 'support@deal-test.example');
    insert into app.platform_admins (user_id, role) values (v_mkt, 'marketing'), (v_sup, 'support');
    perform set_config('request.jwt.claims', format(claims, v_mkt), true);

    -- 1 -------------------------------------------------------------- a new deal
    v_id := (public.admin_crm_company_save(null, '{"name":"Verdi Test AS","value_nok":"120000"}'::jsonb)->>'id')::uuid;
    select x into v_row from jsonb_array_elements(public.admin_crm_companies('verdi test', null)->'rows') x;
    v_txt := coalesce(v_row->>'value_nok', 'null') || ',' || coalesce(v_row->>'contact_name', 'none');
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'a new deal keeps its value; the reader returns it',
      'expected', '120000,none', 'actual', v_txt, 'pass', v_txt = '120000,none');

    -- 2 -------------------------------------------------------------- updates
    perform public.admin_crm_company_save(v_id, '{"next_step":"Ring"}'::jsonb);
    v_txt := (select coalesce(value_nok::text, 'null') from app.crm_companies where id = v_id);
    v_txt := v_txt || ',' || coalesce(public.admin_crm_company_save(v_id, '{"value_nok":"12.5"}'::jsonb)->>'error', 'ok')
          || ',' || coalesce(public.admin_crm_company_save(v_id, '{"value_nok":"999999999"}'::jsonb)->>'error', 'ok');
    perform public.admin_crm_company_save(v_id, '{"value_nok":""}'::jsonb);
    v_txt := v_txt || ',' || (select coalesce(value_nok::text, 'null') from app.crm_companies where id = v_id);
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'an update without a value keeps it; a bad one is refused; empty clears it',
      'expected', '120000,invalid_value,invalid_value,null', 'actual', v_txt, 'pass', v_txt = '120000,invalid_value,invalid_value,null');

    -- 3 -------------------------------------------------------------- the contact
    update app.crm_companies set manager_name = 'Mona Leder', manager_role = 'DAGL' where id = v_id;
    v_txt := (select app.crm_company_json(c)->>'contact_name' from app.crm_companies c where c.id = v_id);
    insert into app.crm_contacts (email, name, company_id, source, basis) values ('kari@deal-test.example', 'Kari Kontakt', v_id, 'manual', 'business');
    v_txt := v_txt || ',' || (select app.crm_company_json(c)->>'contact_name' from app.crm_companies c where c.id = v_id);
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'the contact is the first contact, else the general manager',
      'expected', 'Mona Leder,Kari Kontakt', 'actual', v_txt, 'pass', v_txt = 'Mona Leder,Kari Kontakt');

    -- 6 -------------------------------------------------------------- whom a deal may be given to
    v_txt := (select string_agg(x->>'email', ',' order by x->>'email') from jsonb_array_elements(public.admin_crm_owners()->'rows') x
              where x->>'email' like '%@deal-test.example') || ',' || has_function_privilege('anon', 'public.admin_crm_owners()', 'execute')::text;
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'the owners offered are the CRM''s own; anon may not ask',
      'expected', 'marketing@deal-test.example,false', 'actual', v_txt, 'pass', v_txt = 'marketing@deal-test.example,false');

    -- 4a ------------------------------------------------------------- support reads, does not write
    perform set_config('request.jwt.claims', format(claims, v_sup), true);
    v_txt := coalesce(public.admin_crm_company_save(v_id, '{"value_nok":"5"}'::jsonb)->>'error', 'ok');
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'support may not set a value',
      'expected', 'not_allowed', 'actual', v_txt, 'pass', v_txt = 'not_allowed');

    raise exception 'rollback';
  exception when others then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 5 ---------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id from app.crm_companies where name = 'Verdi Test AS'
    union all select id from auth.users where email like '%@deal-test.example') x;
  v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._deal
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._deal order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._deal;
  if v_failed is not null then raise exception 'crm deal invariants failed: %', v_failed; end if;
  if v_count <> 6 then raise exception 'crm deal invariants: expected 6 rows, got %', v_count; end if;
end $$;
