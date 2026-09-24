-- dispatch_invariants.sql — the outbox's sender (0032), proved against the live schema.
--
--   * only service_role may claim, finish or release a row; no client role can (1-3)
--   * a reserved test domain is never an address (4, 5)
--   * a claim hands out a 64-character link whose hash, and only its hash, is stored (6, 7)
--   * a claimed row is leased: a second claim does not take it again (8)
--   * a recipient under a reserved domain is refused, and the row fails as no_address (9)
--   * an audience row goes to the members holding that role, and carries no link (10, 11)
--   * nothing is claimed for an organisation whose mail is switched off (12)
--   * a reminder for a closed round is marked stale rather than sent (13)
--   * done marks the row and its invitation sent (14); a failure keeps it for retry (15)
--     and the fifth failure ends it (16); a release gives the attempt back (17)
--
-- Everything is written inside a block that rolls itself back: the rows are never
-- committed, so the live dispatcher cannot see them, let alone mail them. Assertion 18
-- proves nothing is left.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/dispatch_invariants.sql

create unlogged table if not exists public._di(seq int, name text, expected text, actual text, pass bool);
truncate public._di;

do $$
declare
  v_org    uuid := '00000000-0000-4000-8000-0000000d1500';
  v_off    uuid := '00000000-0000-4000-8000-0000000d1501';
  v_dl     uuid := '00000000-0000-4000-8000-0000000d1502';
  v_ms     uuid; v_ms2 uuid; v_ms3 uuid;
  v_open   uuid; v_plan uuid; v_closed uuid; v_offround uuid;
  v_e1     uuid; v_e2 uuid; v_e3 uuid; v_eoff uuid;
  v_i1     uuid; v_i2 uuid; v_i3 uuid; v_ioff uuid;
  v_o1     uuid; v_o2 uuid; v_ofv uuid; v_ostale uuid; v_ooff uuid;
  v_claim  jsonb; v_again jsonb;
  v_mine   jsonb; v_fv jsonb;
  -- captured before the rollback
  c_tok_len int; c_hash_ok boolean; c_again int; c_o2 text; c_fv_rcpt text; c_fv_tok boolean;
  c_off int; c_stale text; c_sent text; c_retry text; c_dead boolean; c_release int;
begin
  begin
    insert into app.organizations (id, name, org_number, employee_count) values
      (v_org, 'Dispatch Test AS', '999000211', 3),
      (v_off, 'Dispatch Av AS', '999000212', 1);
    update app.organizations set mail_enabled = false where id = v_off;

    insert into auth.users (id, email) values (v_dl, 'leder@dispatch-test.no');
    insert into app.profiles (id, full_name) values (v_dl, 'Dagny Leder');
    insert into app.memberships (org_id, user_id, role) values (v_org, v_dl, 'daglig_leder');

    insert into app.employees (org_id, full_name, email) values (v_org, 'Ansatt En', 'en@dispatch-test.no') returning id into v_e1;
    insert into app.employees (org_id, full_name, email) values (v_org, 'Ansatt To', 'to@kunde.example') returning id into v_e2;
    insert into app.employees (org_id, full_name, email) values (v_org, 'Ansatt Tre', 'tre@dispatch-test.no') returning id into v_e3;
    insert into app.employees (org_id, full_name, email) values (v_off, 'Ansatt Av', 'av@dispatch-test.no') returning id into v_eoff;

    insert into app.measurements (org_id, kind, year) values (v_org, 'grunnlinje', 2026) returning id into v_ms;
    insert into app.measurements (org_id, kind, year) values (v_org, 'puls', 2027) returning id into v_ms2;
    insert into app.measurements (org_id, kind, year) values (v_off, 'grunnlinje', 2026) returning id into v_ms3;

    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
      values (v_org, v_ms, 'apen', now() - interval '1 hour', now() + interval '7 days') returning id into v_open;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
      values (v_org, v_ms2, 'planlagt', now() + interval '14 days', now() + interval '21 days') returning id into v_plan;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
      values (v_org, v_ms, 'lukket', now() - interval '30 days', now() - interval '20 days') returning id into v_closed;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
      values (v_off, v_ms3, 'apen', now() - interval '1 hour', now() + interval '7 days') returning id into v_offround;

    insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at)
      values (v_org, v_open, v_e1, extensions.digest('placeholder-1', 'sha256'), now() + interval '7 days') returning id into v_i1;
    insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at)
      values (v_org, v_open, v_e2, extensions.digest('placeholder-2', 'sha256'), now() + interval '7 days') returning id into v_i2;
    insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at)
      values (v_org, v_closed, v_e3, extensions.digest('placeholder-3', 'sha256'), now() - interval '20 days') returning id into v_i3;
    insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at)
      values (v_off, v_offround, v_eoff, extensions.digest('placeholder-4', 'sha256'), now() + interval '7 days') returning id into v_ioff;

    insert into app.outbox (org_id, round_id, kind, employee_id, invitation_id, due_at)
      values (v_org, v_open, 'invitasjon', v_e1, v_i1, now() - interval '5 minutes') returning id into v_o1;
    insert into app.outbox (org_id, round_id, kind, employee_id, invitation_id, due_at)
      values (v_org, v_open, 'invitasjon', v_e2, v_i2, now() - interval '5 minutes') returning id into v_o2;
    insert into app.outbox (org_id, round_id, kind, audience, due_at)
      values (v_org, v_plan, 'forvarsel', 'daglig_leder', now() - interval '5 minutes') returning id into v_ofv;
    insert into app.outbox (org_id, round_id, kind, employee_id, invitation_id, due_at)
      values (v_org, v_closed, 'paminnelse', v_e3, v_i3, now() - interval '25 days') returning id into v_ostale;
    insert into app.outbox (org_id, round_id, kind, employee_id, invitation_id, due_at)
      values (v_off, v_offround, 'invitasjon', v_eoff, v_ioff, now() - interval '5 minutes') returning id into v_ooff;

    v_claim := public.dispatch_claim(100);
    select e into v_mine from jsonb_array_elements(v_claim) e where (e->>'id')::uuid = v_o1;
    select e into v_fv from jsonb_array_elements(v_claim) e where (e->>'id')::uuid = v_ofv;

    c_tok_len := length(v_mine->>'token');
    c_hash_ok := exists (select 1 from app.invitations where id = v_i1 and token_hash = extensions.digest(v_mine->>'token', 'sha256'));
    v_again := public.dispatch_claim(100);
    c_again := (select count(*) from jsonb_array_elements(v_again) e where (e->>'id')::uuid in (v_o1, v_ofv));
    c_o2 := (select coalesce(last_error, 'unfailed') || case when failed_at is null then '' else ',failed' end from app.outbox where id = v_o2);
    c_fv_rcpt := (select string_agg(r->>'email' || ':' || (r->>'member'), ',') from jsonb_array_elements(v_fv->'recipients') r);
    c_fv_tok := (v_fv ? 'token') and jsonb_typeof(v_fv->'token') = 'null';
    c_off := (select count(*) from jsonb_array_elements(v_claim) e where (e->>'id')::uuid = v_ooff)
           + (select count(*) from app.outbox where id = v_ooff and (claimed_at is not null or failed_at is not null));
    c_stale := (select coalesce(last_error, 'unfailed') from app.outbox where id = v_ostale);

    perform public.dispatch_done(v_o1, true, null, false, 'brevo-msg-1');
    c_sent := (select (o.sent_at is not null)::text || ',' || (i.sent_at is not null)::text || ',' || coalesce(o.provider_id, '-')
               from app.outbox o join app.invitations i on i.id = o.invitation_id where o.id = v_o1);

    perform public.dispatch_done(v_ofv, false, 'http_500', false, null);
    c_retry := (select (failed_at is null)::text || ',' || (claimed_at is null)::text || ',' || attempts || ',' || last_error from app.outbox where id = v_ofv);

    update app.outbox set attempts = 5, claimed_at = now() where id = v_ofv;
    perform public.dispatch_done(v_ofv, false, 'http_500', false, null);
    c_dead := (select failed_at is not null from app.outbox where id = v_ofv);

    update app.outbox set attempts = 2, claimed_at = now(), failed_at = null where id = v_ofv;
    perform public.dispatch_release(array[v_ofv], 'provider_unauthorised');
    c_release := (select attempts from app.outbox where id = v_ofv and claimed_at is null);

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  insert into public._di
  select 1, 'no client role may claim', 'false,false',
         has_function_privilege('anon', 'public.dispatch_claim(int)', 'execute')::text || ',' ||
         has_function_privilege('authenticated', 'public.dispatch_claim(int)', 'execute')::text,
         not has_function_privilege('anon', 'public.dispatch_claim(int)', 'execute')
         and not has_function_privilege('authenticated', 'public.dispatch_claim(int)', 'execute');
  insert into public._di
  select 2, 'nor finish or release a row', 'false',
         (has_function_privilege('authenticated', 'public.dispatch_done(uuid,boolean,text,boolean,text)', 'execute')
          or has_function_privilege('authenticated', 'public.dispatch_release(uuid[],text)', 'execute')
          or has_function_privilege('anon', 'public.dispatch_done(uuid,boolean,text,boolean,text)', 'execute')
          or has_function_privilege('authenticated', 'app.dispatch_recipients(uuid)', 'execute'))::text,
         not (has_function_privilege('authenticated', 'public.dispatch_done(uuid,boolean,text,boolean,text)', 'execute')
          or has_function_privilege('authenticated', 'public.dispatch_release(uuid[],text)', 'execute')
          or has_function_privilege('anon', 'public.dispatch_done(uuid,boolean,text,boolean,text)', 'execute')
          or has_function_privilege('authenticated', 'app.dispatch_recipients(uuid)', 'execute'));
  insert into public._di
  select 3, 'service_role may', 'true',
         has_function_privilege('service_role', 'public.dispatch_claim(int)', 'execute')::text,
         has_function_privilege('service_role', 'public.dispatch_claim(int)', 'execute');

  insert into public._di values (4, 'reserved domains are refused', 'true,true,true,true',
    concat_ws(',', app.reserved_address('a@nordvik.example'), app.reserved_address('a@x.test'),
              app.reserved_address('a@example.com'), app.reserved_address(null)),
    app.reserved_address('a@nordvik.example') and app.reserved_address('a@x.test')
    and app.reserved_address('a@example.com') and app.reserved_address(null));
  insert into public._di values (5, 'real domains are not', 'false,false',
    concat_ws(',', app.reserved_address('a@orgpuls.com'), app.reserved_address('ola@firma.no')),
    not app.reserved_address('a@orgpuls.com') and not app.reserved_address('ola@firma.no'));

  insert into public._di values (6, 'the claim carries a 64-character link', '64', coalesce(c_tok_len::text, 'none'), c_tok_len = 64);
  insert into public._di values (7, 'and only its hash is stored', 'true', coalesce(c_hash_ok::text, 'none'), coalesce(c_hash_ok, false));
  insert into public._di values (8, 'a leased row is not claimed twice', '0', c_again::text, c_again = 0);
  insert into public._di values (9, 'a reserved recipient fails the row', 'no_address,failed', coalesce(c_o2, 'none'), c_o2 = 'no_address,failed');
  insert into public._di values (10, 'an audience row goes to the role''s members', 'leder@dispatch-test.no:true',
    coalesce(c_fv_rcpt, 'none'), c_fv_rcpt = 'leder@dispatch-test.no:true');
  insert into public._di values (11, 'and carries no link', 'true', coalesce(c_fv_tok::text, 'none'), coalesce(c_fv_tok, false));
  insert into public._di values (12, 'nothing is claimed while mail is off', '0', c_off::text, c_off = 0);
  insert into public._di values (13, 'a reminder for a closed round is stale', 'round_not_open', coalesce(c_stale, 'none'), c_stale = 'round_not_open');
  insert into public._di values (14, 'done marks the row and its invitation', 'true,true,brevo-msg-1', coalesce(c_sent, 'none'), c_sent = 'true,true,brevo-msg-1');
  insert into public._di values (15, 'a failure is kept for retry', 'true,true,1,http_500', coalesce(c_retry, 'none'), c_retry = 'true,true,1,http_500');
  insert into public._di values (16, 'the fifth failure ends it', 'true', coalesce(c_dead::text, 'none'), coalesce(c_dead, false));
  insert into public._di values (17, 'a release gives the attempt back', '1', coalesce(c_release::text, 'none'), c_release = 1);

  insert into public._di
  select 18, 'nothing from the test survives', '0', count(*)::text, count(*) = 0
  from (select id from app.organizations where id in (v_org, v_off)
        union all select id from auth.users where id = v_dl) left_over;
end $$;

select seq, name, expected, actual, pass from public._di order by seq;

do $$
declare v_failed text;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) into v_failed from public._di where not pass;
  if v_failed is not null then
    raise exception 'dispatch invariants failed: %', v_failed;
  end if;
end $$;

drop table public._di;
