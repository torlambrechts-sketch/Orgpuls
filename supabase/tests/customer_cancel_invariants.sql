-- customer_cancel_invariants.sql — the daglig leder cancels, and undoes it (0066, D-110).
--
--   * anon may not cancel or withdraw (1)
--   * only the daglig leder; only with confirmation; only a known reason (2)
--   * a trial ends today; deletion thirty Oslo days on; the answer and the source are kept (3)
--   * a confirmed subscription runs to the end of the month (4)
--   * a second cancellation is refused (5)
--   * withdrawing clears everything, by the customer or by support (6, 7)
--   * nothing written here survives (8)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/customer_cancel_invariants.sql

create unlogged table if not exists public._cci(seq int, name text, expected text, actual text, pass bool);
truncate public._cci;

do $$
declare
  v_org     uuid := '00000000-0000-4000-8000-000000000001';
  v_vo      uuid := '00000000-0000-4000-8000-00000c0c0e01';
  v_sup     uuid := '00000000-0000-4000-8000-00000c0c0e02';
  v_dl      uuid;
  v_rows    jsonb := '[]';
  v_json    jsonb;
  v_txt     text;
  v_today   date := (now() at time zone 'Europe/Oslo')::date;
  v_eom     date := (date_trunc('month', (now() at time zone 'Europe/Oslo')::date) + interval '1 month - 1 day')::date;
  claims    constant text := '{"sub":"%s","role":"authenticated","aal":"%s"}';
begin
  v_txt := concat_ws(',',
    has_function_privilege('anon', 'public.cancel_subscription(uuid,text,boolean)', 'execute'),
    has_function_privilege('anon', 'public.withdraw_cancellation(uuid)', 'execute'),
    has_function_privilege('authenticated', 'public.cancel_subscription(uuid,text,boolean)', 'execute'));
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'anon may not cancel or withdraw', 'expected', 'f,f,t',
    'actual', v_txt, 'pass', v_txt = 'f,f,t');

  select m.user_id into v_dl from app.memberships m where m.org_id = v_org and m.role = 'daglig_leder' and m.active limit 1;

  begin
    update app.billing set cancelled_at = null, cancelled_by = null, cancel_effective_at = null, deletion_due_at = null,
                           confirmed_at = null, trial_ends_at = now() + interval '5 days'
    where org_id = v_org;
    insert into auth.users (id, email) values (v_vo, 'vo@cc-test.example'), (v_sup, 'sup@cc-test.example');
    insert into app.profiles (id, full_name) values (v_vo, 'Verne Ombud') on conflict (id) do nothing;
    insert into app.memberships (org_id, user_id, role, active) values (v_org, v_vo, 'verneombud', true);
    insert into app.platform_admins (user_id, role) values (v_sup, 'support');

    -- 2 ------------------------------------------------------------------ who, and how
    perform set_config('request.jwt.claims', format(claims, v_vo, 'aal1'), true);
    v_txt := coalesce(public.cancel_subscription(v_org, 'price', true)->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_dl, 'aal1'), true);
    v_txt := v_txt || ',' || coalesce(public.cancel_subscription(v_org, 'price', false)->>'error', 'ok');
    v_txt := v_txt || ',' || coalesce(public.cancel_subscription(v_org, 'for dyrt, Per sa det', true)->>'error', 'ok');
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'the daglig leder only; confirmed; a known reason only',
      'expected', 'not_allowed,confirm_required,invalid_reason', 'actual', v_txt, 'pass', v_txt = 'not_allowed,confirm_required,invalid_reason');

    -- 3 ------------------------------------------------------------------ a trial ends today
    v_json := public.cancel_subscription(v_org, 'not_needed', true);
    select concat_ws('|', coalesce(v_json->>'error', 'ok'), v_json->>'last_day',
                     (b.cancel_effective_at = ((v_today + 1)::timestamp at time zone 'Europe/Oslo'))::text,
                     (b.deletion_due_at = ((v_today + 31)::timestamp at time zone 'Europe/Oslo'))::text,
                     b.cancel_source, b.cancel_reason, (b.cancelled_by = v_dl)::text)
      into v_txt from app.billing b where b.org_id = v_org;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'a trial ends today; deletion thirty days on; who and why kept',
      'expected', 'ok|' || v_today || '|true|true|customer|not_needed|true', 'actual', v_txt,
      'pass', v_txt = 'ok|' || v_today || '|true|true|customer|not_needed|true');

    -- 5 ------------------------------------------------------------------ once
    v_txt := coalesce(public.cancel_subscription(v_org, 'price', true)->>'error', 'ok');
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'a second cancellation is refused', 'expected', 'already_cancelled',
      'actual', v_txt, 'pass', v_txt = 'already_cancelled');

    -- 6 ------------------------------------------------------------------ the customer withdraws
    v_txt := coalesce(public.withdraw_cancellation(v_org)->>'error', 'ok');
    select v_txt || '|' || concat_ws(',', coalesce(b.cancelled_at::text, '-'), coalesce(b.cancel_source, '-'), coalesce(b.cancel_reason, '-'))
      into v_txt from app.billing b where b.org_id = v_org;
    v_txt := v_txt || '|' || coalesce(public.withdraw_cancellation(v_org)->>'error', 'ok');
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'withdrawing clears everything; twice is refused',
      'expected', 'ok|-,-,-|not_cancelled', 'actual', v_txt, 'pass', v_txt = 'ok|-,-,-|not_cancelled');

    -- 4 ------------------------------------------------------------------ a subscription runs to month end
    update app.billing set plan = 'small', invoice_email = 'faktura@cc-test.example', confirmed_at = now() where org_id = v_org;
    v_json := public.cancel_subscription(v_org, 'price', true);
    select concat_ws('|', v_json->>'last_day', (b.cancel_effective_at = ((v_eom + 1)::timestamp at time zone 'Europe/Oslo'))::text,
                     app.org_access(v_org))
      into v_txt from app.billing b where b.org_id = v_org;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'a confirmed subscription runs to the end of the month, still active',
      'expected', v_eom || '|true|active', 'actual', v_txt, 'pass', v_txt = v_eom || '|true|active');

    -- 7 ------------------------------------------------------------------ support withdraws it
    perform set_config('request.jwt.claims', format(claims, v_sup, 'aal2'), true);
    v_txt := coalesce(public.admin_cancel_withdraw(v_org, 'Kunden ringte og angret')->>'error', 'ok');
    select v_txt || '|' || concat_ws(',', coalesce(b.cancel_source, '-'), coalesce(b.cancel_reason, '-')) into v_txt
    from app.billing b where b.org_id = v_org;
    perform public.admin_cancel_org(v_org, v_today + 3, 'Kunden sendte e-post');
    select v_txt || '|' || coalesce(b.cancel_source, '-') into v_txt from app.billing b where b.org_id = v_org;
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'support''s withdrawal clears who and why too; its own is marked admin',
      'expected', 'ok|-,-|admin', 'actual', v_txt, 'pass', v_txt = 'ok|-,-|admin');

    perform set_config('request.jwt.claims', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'every probe change was rolled back', 'expected', '0',
    'actual', (select count(*) from app.billing where cancelled_at is not null)::text,
    'pass', not exists (select 1 from app.billing where cancelled_at is not null)
      and not exists (select 1 from auth.users where email like '%@cc-test.example'));

  insert into public._cci
  select (x->>'seq')::int, x->>'name', x->>'expected', x->>'actual', (x->>'pass')::boolean from jsonb_array_elements(v_rows) x;
end $$;

select seq, name, expected, actual, pass from public._cci order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._cci;
  if v_failed is not null then raise exception 'customer cancel invariants failed: %', v_failed; end if;
  if v_count <> 8 then raise exception 'customer cancel invariants: expected 8 rows, got %', v_count; end if;
end $$;

drop table public._cci;
