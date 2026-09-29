-- override_basis_invariants.sql — an override records the file text it replaced (0109, X-090).
--
--   * anyone reads the approved overrides as {text, file}: the text and the SHA-256 of the file
--     text it replaced, or null for a row older than 0109; a draft is not read (1)
--   * an import records the basis on a new override and re-bases it with a new wording; the same
--     wording again changes nothing, and no client can read or write the table directly (2)
--   * nothing written here survives (3)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/override_basis_invariants.sql

create unlogged table if not exists public._obi(seq int, name text, expected text, actual text, pass bool);
truncate public._obi;

do $$
declare
  v_sa     uuid := '00000000-0000-4000-8000-00000b0b0001';
  claims   constant text := '{"sub":"%s","role":"authenticated","aal":"%s"}';
  h1       constant text := repeat('1', 64);
  h2       constant text := repeat('2', 64);
  v_was    boolean;
  v_rows   jsonb := '[]'::jsonb;
  v_txt    text;
  v_json   jsonb;
  v_cnt    int;
begin
  select auto_approve into v_was from app.platform_settings where id;
  begin
    update app.platform_settings set auto_approve = false where id;
    insert into auth.users (id, email) values (v_sa, 'sa@obi-test.example');
    insert into app.platform_admins (user_id, role) values (v_sa, 'super_admin');

    -- 1 ---------------------------------------------------------------- the public shape
    insert into app.message_overrides (locale, key, text, status, file_hash) values
      ('no', 'probe.based', 'Ny tekst', 'approved', h1),
      ('no', 'probe.legacy', 'Gammel rad', 'approved', null),
      ('no', 'probe.draft', 'Utkast', 'draft', h1);
    set local role anon;
    v_json := public.message_overrides('no');
    reset role;
    v_txt := concat_ws('|', v_json -> 'probe.based' ->> 'text', v_json -> 'probe.based' ->> 'file',
                       v_json -> 'probe.legacy' ->> 'text', coalesce(v_json -> 'probe.legacy' ->> 'file', 'null'),
                       coalesce(v_json ->> 'probe.draft', 'none'));
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'anon reads approved overrides as {text, file}; a draft is not read',
      'expected', concat_ws('|', 'Ny tekst', h1, 'Gammel rad', 'null', 'none'), 'actual', v_txt,
      'pass', v_txt = concat_ws('|', 'Ny tekst', h1, 'Gammel rad', 'null', 'none'));

    -- 2 ---------------------------------------------------------------- written with its basis
    perform set_config('request.jwt.claims', format(claims, v_sa, 'aal2'), true);
    set local role authenticated;
    v_json := public.admin_message_overrides_import('en', jsonb_build_array(jsonb_build_object('key', 'probe.one', 'text', 'One', 'file_hash', h1)));
    v_txt := 'new=' || (v_json->>'new');
    v_txt := v_txt || ',read=' || coalesce((select i->>'file_hash' from jsonb_array_elements(public.admin_message_overrides('en')->'items') i where i->>'key' = 'probe.one'), 'none');
    v_json := public.admin_message_overrides_import('en', jsonb_build_array(jsonb_build_object('key', 'probe.one', 'text', 'One', 'file_hash', h2)));
    v_txt := v_txt || ',same=' || (v_json->>'same');
    v_json := public.admin_message_overrides_import('en', jsonb_build_array(jsonb_build_object('key', 'probe.one', 'text', 'One, again', 'file_hash', h2)));
    v_txt := v_txt || ',changed=' || (v_json->>'changed');
    v_json := public.admin_message_overrides_import('en', jsonb_build_array(jsonb_build_object('key', 'probe.one', 'text', 'One, bad', 'file_hash', 'not-a-hash')));
    v_txt := v_txt || ',refused=' || jsonb_array_length(v_json->'refused');
    begin
      perform 1 from app.message_overrides;
      v_txt := v_txt || ',select=allowed';
    exception when insufficient_privilege then
      v_txt := v_txt || ',select=denied';
    end;
    reset role;
    v_txt := v_txt || ',row=' || (select text || ':' || (file_hash = h2)::text from app.message_overrides where locale = 'en' and key = 'probe.one');
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'an import records the basis, a new wording re-bases it, a bad hash is refused, the table stays closed',
      'expected', 'new=1,read=' || h1 || ',same=1,changed=1,refused=1,select=denied,row=One, again:true', 'actual', v_txt,
      'pass', v_txt = 'new=1,read=' || h1 || ',same=1,changed=1,refused=1,select=denied,row=One, again:true');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 3 ----------------------------------------------------------------- nothing survives
  select count(*) into v_cnt from (
    select key from app.message_overrides where key like 'probe.%'
    union all select id::text from auth.users where id = v_sa) x;
  v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'every probe row was rolled back, the switch as it was',
    'expected', '0/true', 'actual', v_cnt || '/' || ((select auto_approve from app.platform_settings where id) is not distinct from v_was)::text,
    'pass', v_cnt = 0 and (select auto_approve from app.platform_settings where id) is not distinct from v_was);

  insert into public._obi
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._obi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._obi;
  if v_failed is not null then raise exception 'override basis invariants failed: %', v_failed; end if;
  if v_count <> 3 then raise exception 'override basis invariants: expected 3 rows, got %', v_count; end if;
end $$;

drop table public._obi;
