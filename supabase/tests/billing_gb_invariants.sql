-- billing_gb_invariants.sql — invoicing an organisation in the United Kingdom (0227, X-113, D-274),
-- proved against the live schema.
--
--   * save_billing has one signature, with the VAT number last and optional; the old one is set
--     aside where no client can call it (1, 2)
--   * a UK daglig leder's VAT number is stored as HMRC writes it, spaces dropped and GB put in front;
--     one that is no VAT number is refused, and so is a VAT number for a Norwegian organisation (3..5)
--   * leaving the number out keeps it; an empty one clears it (6)
--   * a UK organisation has no EHF (7)
--   * a UK plan is confirmed only with a VAT number or a company number, the evidence that the
--     customer is a business and the reverse charge holds (8, 9)
--   * nothing written here survives (10)
--   * the platform, where the invoice is made, hears the market: the events and the organisation view
--     carry it (0228) (11, 12)
--
-- Makes its own organisations. Every row must read pass = true.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/billing_gb_invariants.sql

create unlogged table if not exists public._bgb(seq int, name text, expected text, actual text, pass bool);
truncate public._bgb;

do $$
declare
  v_gb     uuid := '00000000-0000-4000-8000-0000000b2001';
  v_bare   uuid := '00000000-0000-4000-8000-0000000b2002';
  v_no     uuid := '00000000-0000-4000-8000-0000000b2003';
  v_gbl    uuid := '00000000-0000-4000-8000-0000000b2004';
  v_barel  uuid := '00000000-0000-4000-8000-0000000b2005';
  v_nol    uuid := '00000000-0000-4000-8000-0000000b2006';
  v_rows   jsonb := '[]';
  v_json   jsonb;
  v_json2  jsonb;
  v_txt    text;
  v_ok     boolean;
  v_cnt    int;
begin
  select count(*) into v_cnt from pg_proc p where p.proname = 'save_billing' and p.pronamespace = 'public'::regnamespace;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'save_billing has one signature, the VAT number last', 'expected', '1, 8 arguments, p_vat_number',
    'actual', v_cnt || ', ' || (select pronargs || ' arguments, ' || (proargnames)[pronargs] from pg_proc where oid = 'public.save_billing(uuid,text,text,text,boolean,boolean,text,text)'::regprocedure),
    'pass', v_cnt = 1 and (select (proargnames)[pronargs] = 'p_vat_number' and pronargdefaults = 2
                           from pg_proc where oid = 'public.save_billing(uuid,text,text,text,boolean,boolean,text,text)'::regprocedure));

  v_ok := not has_function_privilege('anon', 'public.save_billing(uuid,text,text,text,boolean,boolean,text,text)', 'execute')
          and has_function_privilege('authenticated', 'public.save_billing(uuid,text,text,text,boolean,boolean,text,text)', 'execute')
          and not has_function_privilege('authenticated', 'app.save_billing_retired_0227(uuid,text,text,text,boolean,boolean,text)', 'execute')
          and not has_function_privilege('anon', 'app.save_billing_retired_0227(uuid,text,text,text,boolean,boolean,text)', 'execute');
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'the signed-in may call it, anon may not, and nobody the retired one', 'expected', 'true',
    'actual', v_ok::text, 'pass', v_ok);

  begin
    insert into auth.users (id, email) values (v_gbl, 'gb@bgb-test.example'), (v_barel, 'bare@bgb-test.example'), (v_nol, 'no@bgb-test.example');
    insert into app.profiles (id, full_name) values (v_gbl, 'GB'), (v_barel, 'BARE'), (v_nol, 'NO');
    insert into app.organizations (id, name, employee_count, market, org_number) values
      (v_gb, 'Probe Ltd', 10, 'gb', '12345678'),
      (v_bare, 'Probe Partners', 10, 'gb', null),
      (v_no, 'Probe AS', 10, 'no', null);
    insert into app.memberships (org_id, user_id, role, group_id) values
      (v_gb, v_gbl, 'daglig_leder', null), (v_bare, v_barel, 'daglig_leder', null), (v_no, v_nol, 'daglig_leder', null);

    -- 3..5 ---------------------------------------------------------- the number
    perform set_config('request.jwt.claims', json_build_object('sub', v_gbl, 'role', 'authenticated')::text, true);
    v_json := public.save_billing(v_gb, 'small', 'accounts@probe.example', null, false, false, 'month', ' 123 4567 89 ');
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'a UK VAT number is stored as HMRC writes it', 'expected', 'ok, GB123456789',
      'actual', coalesce(v_json->>'error', 'ok') || ', ' || coalesce((select vat_number from app.billing where org_id = v_gb), 'none'),
      'pass', (v_json->>'ok')::boolean and (select vat_number from app.billing where org_id = v_gb) = 'GB123456789');

    v_json := public.save_billing(v_gb, 'small', 'accounts@probe.example', null, false, false, 'month', 'GB12345');
    v_json2 := public.save_billing(v_gb, 'small', 'accounts@probe.example', null, false, false, 'month', 'NO 922 698 422 MVA');
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'a number that is no UK VAT number is refused, and the stored one kept',
      'expected', 'invalid_vat_number, invalid_vat_number, GB123456789',
      'actual', coalesce(v_json->>'error', 'ok') || ', ' || coalesce(v_json2->>'error', 'ok') || ', ' || coalesce((select vat_number from app.billing where org_id = v_gb), 'none'),
      'pass', v_json->>'error' = 'invalid_vat_number' and v_json2->>'error' = 'invalid_vat_number'
              and (select vat_number from app.billing where org_id = v_gb) = 'GB123456789');

    perform set_config('request.jwt.claims', json_build_object('sub', v_nol, 'role', 'authenticated')::text, true);
    v_json := public.save_billing(v_no, 'small', 'faktura@probe.example', null, false, false, 'month', 'GB123456789');
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'a Norwegian organisation stores no UK VAT number', 'expected', 'invalid_vat_number, none',
      'actual', coalesce(v_json->>'error', 'ok') || ', ' || coalesce((select vat_number from app.billing where org_id = v_no), 'none'),
      'pass', v_json->>'error' = 'invalid_vat_number' and (select vat_number from app.billing where org_id = v_no) is null);

    -- 6 ------------------------------------------------------------- kept, cleared
    perform set_config('request.jwt.claims', json_build_object('sub', v_gbl, 'role', 'authenticated')::text, true);
    v_json := public.save_billing(v_gb, 'usual', 'accounts@probe.example', null, false, false, 'month');
    v_txt := coalesce((select vat_number from app.billing where org_id = v_gb), 'none');
    v_json2 := public.save_billing(v_gb, 'usual', 'accounts@probe.example', null, false, false, 'month', '');
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'left out, the number is kept; empty, it is cleared', 'expected', 'GB123456789, none',
      'actual', v_txt || ', ' || coalesce((select vat_number from app.billing where org_id = v_gb), 'none'),
      'pass', (v_json->>'ok')::boolean and (v_json2->>'ok')::boolean and v_txt = 'GB123456789'
              and (select vat_number from app.billing where org_id = v_gb) is null);

    -- 7 ------------------------------------------------------------- no EHF
    v_json := public.save_billing(v_gb, 'usual', 'accounts@probe.example', null, true, false, 'month');
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'a UK organisation has no EHF', 'expected', 'ehf_not_offered, false',
      'actual', coalesce(v_json->>'error', 'ok') || ', ' || (select ehf::text from app.billing where org_id = v_gb),
      'pass', v_json->>'error' = 'ehf_not_offered' and not (select ehf from app.billing where org_id = v_gb));

    -- 8, 9 ---------------------------------------------------------- evidence of a business
    perform set_config('request.jwt.claims', json_build_object('sub', v_barel, 'role', 'authenticated')::text, true);
    v_json := public.save_billing(v_bare, 'small', 'accounts@partners.example', null, false, true, 'month');
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'without a VAT number or a company number, a UK plan is not confirmed',
      'expected', 'business_evidence_needed, not confirmed',
      'actual', coalesce(v_json->>'error', 'ok') || ', ' || case when (select confirmed_at from app.billing where org_id = v_bare) is null then 'not confirmed' else 'confirmed' end,
      'pass', v_json->>'error' = 'business_evidence_needed' and (select confirmed_at from app.billing where org_id = v_bare) is null);

    v_json := public.save_billing(v_bare, 'small', 'accounts@partners.example', null, false, true, 'month', 'GB987654321');
    perform set_config('request.jwt.claims', json_build_object('sub', v_gbl, 'role', 'authenticated')::text, true);
    v_json2 := public.save_billing(v_gb, 'small', 'accounts@probe.example', null, false, true, 'year');
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'with a VAT number, or a company number, it is', 'expected', 'ok, ok, confirmed, confirmed',
      'actual', coalesce(v_json->>'error', 'ok') || ', ' || coalesce(v_json2->>'error', 'ok') || ', '
                || (select string_agg(case when confirmed_at is null then 'not confirmed' else 'confirmed' end, ', ' order by org_id) from app.billing where org_id in (v_gb, v_bare)),
      'pass', (v_json->>'ok')::boolean and (v_json2->>'ok')::boolean
              and not exists (select 1 from app.billing where org_id in (v_gb, v_bare) and confirmed_at is null));

    -- 11, 12 ------------------------------------------------------ the platform hears the market
    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'org.created and billing.changed may carry the market, and the organisation view names it',
      'expected', 'true, true, gb',
      'actual', (select string_agg(('market' = any (fields))::text, ', ' order by kind) from app.platform_event_kinds where kind in ('billing.changed', 'org.created'))
                || ', ' || coalesce(app.op_org_get(v_gb)->>'market', 'none'),
      'pass', (select bool_and('market' = any (fields)) and count(*) = 2 from app.platform_event_kinds where kind in ('billing.changed', 'org.created'))
              and app.op_org_get(v_gb)->>'market' = 'gb'
              and exists (select 1 from jsonb_array_elements(app.op_orgs_list('Probe Ltd', 5)) x where x->>'market' = 'gb'));

    v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'the events a UK organisation sends say it is in the United Kingdom',
      'expected', 'gb, gb',
      'actual', coalesce((select payload->>'market' from app.platform_events where org_id = v_gb and kind = 'org.created' order by id desc limit 1), 'none')
                || ', ' || coalesce((select payload->>'market' from app.platform_events where org_id = v_gb and kind = 'billing.changed' order by id desc limit 1), 'none'),
      'pass', (select payload->>'market' from app.platform_events where org_id = v_gb and kind = 'org.created' order by id desc limit 1) = 'gb'
              and (select payload->>'market' from app.platform_events where org_id = v_gb and kind = 'billing.changed' order by id desc limit 1) = 'gb');

    perform set_config('request.jwt.claims', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  select count(*) into v_cnt from app.organizations where id in (v_gb, v_bare, v_no);
  v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'every probe row was rolled back', 'expected', '0 organisations, 0 users',
    'actual', v_cnt || ' organisations, ' || (select count(*) from auth.users where id in (v_gbl, v_barel, v_nol)) || ' users',
    'pass', v_cnt = 0 and not exists (select 1 from auth.users where id in (v_gbl, v_barel, v_nol)));

  insert into public._bgb
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean
  from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._bgb order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._bgb;
  if v_failed is not null then
    raise exception 'billing gb invariants failed: %', v_failed;
  end if;
  if v_count <> 12 then
    raise exception 'billing gb invariants: expected 12 rows, got %', v_count;
  end if;
end $$;

drop table public._bgb;
