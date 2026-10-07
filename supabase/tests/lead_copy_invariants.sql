-- lead_copy_invariants.sql — the e-mail copy of every lead (0209, D-242), proved against the live schema.
--
--   1 a claim returns the lead events not yet copied, and only lead kinds
--   2 a second claim returns none of them again
--   3 a released event is claimed again; older than seven days is never claimed
--   4 no client role may claim or release
--   5 nothing written here survives
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/lead_copy_invariants.sql

create unlogged table if not exists public._lci(seq int, name text, expected text, actual text, pass bool);
truncate public._lci;

do $$
declare
  v_rows jsonb := '[]'::jsonb;
  v_txt  text;
  v_n    int;
  v_json jsonb;
  v_ids  bigint[];
begin
  begin
    -- everything already there is out of the way: only this test's rows are uncopied
    update app.platform_events set copied_at = coalesce(copied_at, now());
    perform app.platform_emit('contact.submitted', null, '{"name":"Kari","email":"kari@kopi-test.example","topic":"product"}'::jsonb);
    perform app.platform_emit('template.requested', null, '{"name":"Ola","email":"ola@kopi-test.example","template":"tiltaksbank","consent":false}'::jsonb);
    perform app.platform_emit('demo.requested', null, '{"name":"Siri","email":"siri@kopi-test.example"}'::jsonb);
    perform app.platform_emit('usage.daily', null, '{"employees":3}'::jsonb);

    -- 1 -------------------------------------------------------------- lead kinds, once
    v_json := public.lead_copies_claim(20);
    select string_agg(r ->> 'kind', ' ' order by r ->> 'kind') into v_txt from jsonb_array_elements(v_json) r;
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'a claim returns the uncopied lead events, and only those',
      'expected', 'contact.submitted demo.requested template.requested', 'actual', coalesce(v_txt, 'none'),
      'pass', v_txt = 'contact.submitted demo.requested template.requested');

    -- 2 -------------------------------------------------------------- never twice
    v_n := jsonb_array_length(public.lead_copies_claim(20));
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'a second claim returns nothing',
      'expected', '0', 'actual', v_n::text, 'pass', v_n = 0);

    -- 3 -------------------------------------------------------------- released comes back; old never
    select array_agg((r ->> 'id')::bigint) into v_ids from jsonb_array_elements(v_json) r where r ->> 'kind' = 'contact.submitted';
    perform public.lead_copies_release(v_ids);
    update app.platform_events set copied_at = null, created_at = now() - interval '8 days'
      where payload ->> 'email' = 'siri@kopi-test.example';
    v_json := public.lead_copies_claim(20);
    select string_agg(r ->> 'kind', ' ') into v_txt from jsonb_array_elements(v_json) r;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'a released copy is claimed again, a week-old one never',
      'expected', 'contact.submitted', 'actual', coalesce(v_txt, 'none'), 'pass', v_txt = 'contact.submitted');

    -- 4 -------------------------------------------------------------- closed to clients
    v_txt := has_function_privilege('anon', 'public.lead_copies_claim(int)', 'execute')::text || ','
          || has_function_privilege('authenticated', 'public.lead_copies_claim(int)', 'execute')::text || ','
          || has_function_privilege('anon', 'public.lead_copies_release(bigint[])', 'execute')::text || ','
          || has_function_privilege('service_role', 'public.lead_copies_claim(int)', 'execute')::text;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'only the service role may claim or release',
      'expected', 'false,false,false,true', 'actual', v_txt, 'pass', v_txt = 'false,false,false,true');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 5 ---------------------------------------------------------------- nothing survives
  select count(*) into v_n from app.platform_events e where e.payload ->> 'email' like '%kopi-test.example';
  v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'every probe row was rolled back',
    'expected', '0', 'actual', v_n::text, 'pass', v_n = 0);

  insert into public._lci
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._lci order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._lci;
  if v_failed is not null then raise exception 'lead copy invariants failed: %', v_failed; end if;
  if v_count <> 5 then raise exception 'lead copy invariants: expected 5 rows, got %', v_count; end if;
end $$;

drop table public._lci;
