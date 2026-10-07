-- template_request_invariants.sql — the templates behind an e-mail address (0208, D-241), proved
-- against the live schema.
--
--   1 a request becomes one template.requested event carrying only its kind's fields, the address
--     lower-cased and the consent as ticked
--   2 a filled honeypot is dropped, a malformed address or template key refused, and one address is
--     limited to ten requests an hour
--   3 the site's anonymous role may call it, and may not read what it wrote
--   4 a request waits for the platform past 30 days, like a contact message, until it is delivered
--   5 nothing written here survives
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/template_request_invariants.sql

create unlogged table if not exists public._tri(seq int, name text, expected text, actual text, pass bool);
truncate public._tri;

do $$
declare
  v_rows jsonb := '[]'::jsonb;
  v_txt  text;
  v_n    int;
  v_json jsonb;
begin
  begin
    -- 1 -------------------------------------------------------------- one event, registered fields only
    v_json := public.request_template('risikovurdering', 'Kari', 'Kari@Mal-Test.example', 'Firma AS', 'Daglig leder', true, 'no', null);
    select count(*) into v_n from app.platform_events e where e.kind = 'template.requested' and e.payload ->> 'email' = 'kari@mal-test.example';
    select e.payload ->> 'template' || ',' || (e.payload ->> 'consent') || ',' || (e.payload ->> 'lang') || ','
           || (select count(*) from jsonb_object_keys(e.payload) f where f <> all (k.fields))
      into v_txt
      from app.platform_events e join app.platform_event_kinds k on k.kind = e.kind
     where e.kind = 'template.requested' and e.payload ->> 'email' = 'kari@mal-test.example' order by e.id limit 1;
    v_txt := (v_json ->> 'ok') || ',' || v_n || ',' || coalesce(v_txt, 'none');
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'a request is one template.requested event with only its own fields',
      'expected', 'true,1,risikovurdering,true,no,0', 'actual', v_txt, 'pass', v_txt = 'true,1,risikovurdering,true,no,0');

    -- 2 -------------------------------------------------------------- bots, bad input, the hourly limit
    v_txt := coalesce(public.request_template('risikovurdering', 'Bot', 'bot@mal-test.example', '', '', false, 'no', 'filled') ->> 'error', 'ok');
    v_txt := v_txt || ',' || coalesce(public.request_template('risikovurdering', 'Kari', 'ikke-en-adresse', '', '', false, 'no', null) ->> 'error', 'ok');
    v_txt := v_txt || ',' || coalesce(public.request_template('../../etc', 'Kari', 'kari@mal-test.example', '', '', false, 'no', null) ->> 'error', 'ok');
    v_txt := v_txt || ',' || (select count(*) from app.platform_events e where e.payload ->> 'email' = 'bot@mal-test.example');
    for i in 1..9 loop
      perform public.request_template('tiltaksbank', 'Kari', 'kari@mal-test.example', '', '', false, 'en', null);
    end loop;
    v_txt := v_txt || ',' || coalesce(public.request_template('tiltaksbank', 'Kari', 'kari@mal-test.example', '', '', false, 'en', null) ->> 'error', 'ok');
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'a bot is dropped, bad input refused, ten an hour per address',
      'expected', 'ok,invalid,invalid,0,rate_limited', 'actual', v_txt, 'pass', v_txt = 'ok,invalid,invalid,0,rate_limited');

    -- 3 -------------------------------------------------------------- callable, not readable
    v_txt := has_function_privilege('anon', 'public.request_template(text, text, text, text, text, boolean, text, text)', 'execute')::text
             || ',' || has_table_privilege('anon', 'app.platform_events', 'select')::text
             || ',' || has_table_privilege('authenticated', 'app.platform_events', 'select')::text;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'the site may call request_template and may not read the events',
      'expected', 'true,false,false', 'actual', v_txt, 'pass', v_txt = 'true,false,false');

    -- 4 -------------------------------------------------------------- kept until delivered
    update app.platform_events set created_at = now() - interval '40 days' where payload ->> 'email' = 'kari@mal-test.example';
    perform public.platform_events_claim(1);
    select count(*) into v_n from app.platform_events e where e.payload ->> 'email' = 'kari@mal-test.example';
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'an undelivered request outlives the 30 days',
      'expected', '10', 'actual', v_n::text, 'pass', v_n = 10);

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 5 ---------------------------------------------------------------- nothing survives
  select count(*) into v_n from app.platform_events e where e.payload ->> 'email' like '%mal-test.example';
  v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'every probe row was rolled back',
    'expected', '0', 'actual', v_n::text, 'pass', v_n = 0);

  insert into public._tri
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._tri order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._tri;
  if v_failed is not null then raise exception 'template request invariants failed: %', v_failed; end if;
  if v_count <> 5 then raise exception 'template request invariants: expected 5 rows, got %', v_count; end if;
end $$;

drop table public._tri;
