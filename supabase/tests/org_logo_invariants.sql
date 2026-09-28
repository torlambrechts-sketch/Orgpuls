-- org_logo_invariants.sql — the organisation's own logo (0104, D-154), proved against the live
-- schema.
--
--   * the daglig leder stores a PNG, JPEG or WebP; the type is read from the bytes, and its
--     address is 32 hex characters that change with the image (1)
--   * an SVG, a file of the wrong kind or one over 256 KB is refused with a reason, and nothing
--     is stored (2)
--   * an avdelingsleder, a verneombud and a stranger may not store, remove or switch it (3)
--   * members read the row; a stranger reads none, and anon cannot read the table (4)
--   * anon reads the image by its exact address only; a malformed or unknown one is nothing (5)
--   * the survey, the entry page, the round page and a claimed notice carry the address, and
--     nothing else about the logo (6)
--   * «Hva står i toppen» switches in_header; remove deletes the row (7)
--   * nothing written here survives (8)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/org_logo_invariants.sql

create unlogged table if not exists public._oli(seq int, name text, expected text, actual text, pass bool);
truncate public._oli;

do $$
declare
  v_org    uuid := '00000000-0000-4000-8000-00000000f001';
  v_dl     uuid := '00000000-0000-4000-8000-0000000f0011';
  v_al     uuid := '00000000-0000-4000-8000-0000000f0012';
  v_vo     uuid := '00000000-0000-4000-8000-0000000f0013';
  v_x      uuid := '00000000-0000-4000-8000-0000000f0014';
  v_png    text := encode('\x89504e470d0a1a0a0000000d49484452'::bytea, 'base64');
  v_jpeg   text := encode('\xffd8ffe000104a464946'::bytea, 'base64');
  v_webp   text := encode('\x52494646240000005745425056503820'::bytea, 'base64');
  v_svg    text := encode(convert_to('<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>', 'UTF8'), 'base64');
  v_big    text := encode('\x89504e470d0a1a0a'::bytea || decode(repeat('00', 262144), 'hex'), 'base64');
  v_key    text;
  v_key2   text;
  v_meas   uuid;
  v_round  uuid;
  v_slug   text;
  v_code   text;
  v_json   jsonb;
  v_txt    text;
  v_n      int;
  v_rows   jsonb := '[]';
  v_cnt    int;
begin
  begin
    insert into app.organizations (id, name, org_number, employee_count, mail_enabled)
    values (v_org, 'Logo Test AS', '999000921', 8, true);
    insert into auth.users (id, email) values
      (v_dl, 'dl@logo-probe.no'), (v_al, 'al@logo-probe.no'), (v_vo, 'vo@logo-probe.no'), (v_x, 'x@logo-probe.no');
    insert into app.profiles (id, full_name) values (v_dl, 'Dina'), (v_al, 'Arne'), (v_vo, 'Vera'), (v_x, 'Xavier');
    insert into app.memberships (org_id, user_id, role)
    values (v_org, v_dl, 'daglig_leder'), (v_org, v_al, 'avdelingsleder'), (v_org, v_vo, 'verneombud');

    -- 1 ---------------------------------------------------------------- the three types, by their bytes
    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_txt := '';
    v_key := public.set_org_logo(v_org, v_jpeg)->>'key';
    v_txt := v_txt || (select mime from app.org_logos where org_id = v_org);
    v_key := public.set_org_logo(v_org, v_webp)->>'key';
    v_txt := v_txt || '|' || (select mime from app.org_logos where org_id = v_org);
    v_key2 := public.set_org_logo(v_org, v_png)->>'key';
    v_txt := v_txt || '|' || (select mime from app.org_logos where org_id = v_org);
    reset role;
    v_txt := v_txt || '|' || (v_key2 ~ '^[0-9a-f]{32}$' and v_key2 <> v_key)::text;
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'the daglig leder stores JPEG, WebP and PNG, typed by their bytes; a new image, a new address',
      'expected', 'image/jpeg|image/webp|image/png|true', 'actual', v_txt, 'pass', v_txt = 'image/jpeg|image/webp|image/png|true');
    v_key := v_key2;

    -- 2 ---------------------------------------------------------------- refused, and nothing changed
    set local role authenticated;
    v_txt := concat_ws('|',
      public.set_org_logo(v_org, v_svg)->>'error',
      public.set_org_logo(v_org, encode(convert_to('GIF89a', 'UTF8'), 'base64'))->>'error',
      public.set_org_logo(v_org, v_big)->>'error',
      public.set_org_logo(v_org, '***')->>'error',
      ((select key from app.org_logos where org_id = v_org) = v_key)::text);
    reset role;
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'SVG, GIF, over 256 KB and unreadable are refused; the stored logo is untouched',
      'expected', 'type|type|too_large|unreadable|true', 'actual', v_txt, 'pass', v_txt = 'type|type|too_large|unreadable|true');

    -- 3 ---------------------------------------------------------------- nobody else writes
    v_txt := '';
    foreach v_json in array array[
      jsonb_build_object('who', 'avdelingsleder', 'id', v_al), jsonb_build_object('who', 'verneombud', 'id', v_vo),
      jsonb_build_object('who', 'stranger', 'id', v_x)]
    loop
      perform set_config('request.jwt.claims', json_build_object('sub', v_json->>'id', 'role', 'authenticated')::text, true);
      v_n := 0;
      begin set local role authenticated; perform public.set_org_logo(v_org, v_png); reset role;
      exception when insufficient_privilege then reset role; v_n := v_n + 1; end;
      begin set local role authenticated; perform public.remove_org_logo(v_org); reset role;
      exception when insufficient_privilege then reset role; v_n := v_n + 1; end;
      begin set local role authenticated; perform public.set_logo_in_header(v_org, false); reset role;
      exception when insufficient_privilege then reset role; v_n := v_n + 1; end;
      v_txt := v_txt || (v_json->>'who') || ':' || v_n || ' ';
    end loop;
    perform set_config('request.jwt.claims', '', true);
    v_txt := v_txt || ((select key from app.org_logos where org_id = v_org) = v_key)::text;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'avdelingsleder, verneombud and a stranger are refused all three writes',
      'expected', 'avdelingsleder:3 verneombud:3 stranger:3 true', 'actual', v_txt,
      'pass', v_txt = 'avdelingsleder:3 verneombud:3 stranger:3 true');

    -- 4 ---------------------------------------------------------------- who reads the row
    perform set_config('request.jwt.claims', json_build_object('sub', v_vo, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into v_n from app.org_logos where org_id = v_org;
    reset role;
    v_txt := 'member:' || v_n;
    perform set_config('request.jwt.claims', json_build_object('sub', v_x, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into v_n from app.org_logos where org_id = v_org;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    v_txt := v_txt || '|stranger:' || v_n;
    begin
      set local role anon;
      select count(*) into v_n from app.org_logos;
      reset role;
      v_txt := v_txt || '|anon:read';
    exception when insufficient_privilege then
      reset role;
      v_txt := v_txt || '|anon:denied';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'a member reads the row, a stranger none, anon is denied the table',
      'expected', 'member:1|stranger:0|anon:denied', 'actual', v_txt, 'pass', v_txt = 'member:1|stranger:0|anon:denied');

    -- 5 ---------------------------------------------------------------- the image, by address only
    set local role anon;
    v_json := public.org_logo(v_key);
    v_txt := concat_ws('|', v_json->>'mime', ((v_json->>'data') = v_png)::text,
                       coalesce(public.org_logo(upper(v_key))::text, 'null'),
                       coalesce(public.org_logo(repeat('0', 32))::text, 'null'),
                       coalesce(public.org_logo('%')::text, 'null'));
    reset role;
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'anon reads the image by its exact address; wrong case, unknown or malformed is nothing',
      'expected', 'image/png|true|null|null|null', 'actual', v_txt, 'pass', v_txt = 'image/png|true|null|null|null');

    -- 6 ---------------------------------------------------------------- where the address travels
    insert into app.measurements (org_id, kind, year, label) values (v_org, 'puls', 2026, 'Probe') returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'apen', now() - interval '20 days', now() - interval '10 days') returning id, share_slug into v_round, v_slug;
    update app.rounds set status = 'lukket' where id = v_round;
    v_code := 'kgmprb23';
    insert into app.entry_codes (org_id, code) values (v_org, v_code);
    insert into app.outbox (org_id, round_id, kind, audience, due_at) values (v_org, v_round, 'resultat', 'daglig_leder', now() - interval '1 minute');
    update app.outbox set due_at = now() + interval '1 day'
      where org_id <> v_org and sent_at is null and failed_at is null and due_at <= now();
    select j into v_json from jsonb_array_elements(public.dispatch_claim(100)) j where (j->>'kind') = 'resultat' limit 1;
    set local role anon;
    v_txt := concat_ws('|',
      (public.round_page(v_slug)->>'logo' = v_key)::text,
      (public.entry_info(v_code)->>'logo' = v_key)::text);
    reset role;
    v_txt := v_txt || '|' || ((v_json->>'logo') = v_key)::text
      || '|' || ((select count(*) from jsonb_object_keys(public.round_page(v_slug)) k where k like '%logo%'))::text;
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'the round page, the entry page and a claimed notice carry the address, one key only',
      'expected', 'true|true|true|1', 'actual', v_txt, 'pass', v_txt = 'true|true|true|1');

    -- 7 ---------------------------------------------------------------- the header choice, and removal
    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.set_logo_in_header(v_org, false);
    v_txt := (select in_header from app.org_logos where org_id = v_org)::text;
    perform public.remove_org_logo(v_org);
    select count(*) into v_n from app.org_logos where org_id = v_org;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    v_txt := v_txt || '|' || v_n || '|' || coalesce(public.round_page(v_slug)->>'logo', 'null');
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', '«Orgpuls» on top turns in_header off; removing deletes the row and the address goes',
      'expected', 'false|0|null', 'actual', v_txt, 'pass', v_txt = 'false|0|null');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 8 ----------------------------------------------------------------- nothing survives
  select count(*) into v_cnt from (
    select id::text from app.organizations where id = v_org
    union all select org_id::text from app.org_logos where org_id = v_org
    union all select id::text from auth.users where id in (v_dl, v_al, v_vo, v_x)) x;
  v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'every probe row was rolled back',
    'expected', '0', 'actual', v_cnt::text, 'pass', v_cnt = 0);

  insert into public._oli
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._oli order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._oli;
  if v_failed is not null then raise exception 'org logo invariants failed: %', v_failed; end if;
  if v_count <> 8 then raise exception 'org logo invariants: expected 8 rows, got %', v_count; end if;
end $$;

drop table public._oli;
