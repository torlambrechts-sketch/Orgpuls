-- slack_invariants.sql — Slack as a channel (0185, D-205), proved against the live schema.
--
--   * RLS is on for every new table; no client role has a grant on the token storage, the
--     matches, the nonces or the revocation queue, nor on Vault (1-3)
--   * the dispatcher's functions are the service role's alone (4)
--   * only a daglig leder starts, completes or undoes a connection; the nonce is the starter's own,
--     single use, bound to the session and expires; a role lost meanwhile refuses it (5-11)
--   * a completed connection keeps the token in Vault, never in a table (12)
--   * one organisation per workspace, no org-wide (Grid) install, the four scopes required, and a
--     refused workspace that is another organisation's is never revoked (13-15)
--   * Slack cannot be switched on without a working installation (16)
--   * matching: by digest of the work address, active employees only, ambiguous addresses match
--     nobody, a re-sync replaces the matches, a changed address forgets its match (17-20)
--   * the claim picks 'slack' exactly when the organisation has it on with a working installation,
--     the person a match, and the rule (organisation's or round's) says so; a link asked for and a
--     broken installation go by e-mail; the hand-over carries the member id and the e-mail (21-30)
--   * dispatch_done records 'slack' (31)
--   * a person Slack refused is unmatched; the refresh token is leased once; a refreshed pair is
--     stored in Vault (32-34)
--   * disconnecting queues the tokens for revocation, forgets every match, turns Slack off and is
--     logged; a revocation done deletes the secrets (35-37)
--   * slack_status: counts for the daglig leder, none for anyone else, nothing for a stranger (38)
--   * a Slack identity is unreachable from invitations and the answer tables, and nothing that reacts
--     to an answer reaches Slack (39-41)
--   * a round's Slack rule is fixed once it has opened (42)
--   * nothing from the test survives (43)
--
-- Everything is written inside a block that rolls itself back.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/slack_invariants.sql

create unlogged table if not exists public._sli(seq int, name text, expected text, actual text, pass bool);
truncate public._sli;

do $$
declare
  v_org   uuid := '00000000-0000-4000-8000-0000005a0c01';
  v_org2  uuid := '00000000-0000-4000-8000-0000005a0c02';
  v_dl    uuid := '00000000-0000-4000-8000-0000005a0c03';
  v_vo    uuid := '00000000-0000-4000-8000-0000005a0c04';
  v_dl2   uuid := '00000000-0000-4000-8000-0000005a0c05';
  v_sess  uuid := '00000000-0000-4000-8000-0000005a0c06';
  claims  constant text := '{"sub":"%s","role":"authenticated","aal":"aal1","session_id":"%s"}';
  -- test tokens are assembled, so no token-shaped literal sits in the repository (secret scanning)
  tok_a1 constant text := 'xox' || 'e.xox' || 'b-1-TESTACCESSTOKEN0001';
  tok_r1 constant text := 'xox' || 'e-1-TESTREFRESHTOKEN0001';
  tok_a2 constant text := 'xox' || 'e.xox' || 'b-1-TESTACCESSTOKEN0002';
  tok_r2 constant text := 'xox' || 'e-1-TESTREFRESHTOKEN0002';
  install constant jsonb := ('{"ok":true,"token_type":"bot","is_enterprise_install":false,
    "team_id":"T0SLACK1","team_name":"Slack Test","bot_user_id":"U0BOT0001",
    "access_token":"' || tok_a1 || '","refresh_token":"' || tok_r1 || '",
    "expires_in":43200,"scope":"chat:write,im:write,users:read,users:read.email"}')::jsonb;
  v_ms uuid; v_round uuid; v_planned uuid;
  v_e uuid; v_i uuid; v_o uuid; v_j jsonb; v_claim jsonb; v_mine jsonb; v_r jsonb;
  v_nonce text; v_n int := 0; v_txt text; v_secret uuid;
  v_emp1 uuid; v_emp2 uuid; v_emp3 uuid; v_emp4 uuid; v_emp5 uuid;
  c_start_vo text; c_complete_vo text; c_twice text; c_expired text; c_session text; c_lost text;
  c_vault text; c_intable text; c_taken text; c_grid text; c_scope text; c_enable text;
  c_match text; c_inactive text; c_ambig text; c_resync text; c_addr text;
  c_ch text[] := '{}'; c_rcpt text; c_done text; c_unmatch text; c_lease text; c_store text;
  c_disc text; c_revoke text; c_status_dl text; c_status_vo text; c_status_x text; c_fixed text;
  c_undo_vo text;
  h constant text := 'hex';
begin
  begin
    -- other rows due on this database are leased for the length of the test (all rolled back)
    update app.outbox set claimed_at = now()
    where sent_at is null and failed_at is null and (claimed_at is null or claimed_at < now() - interval '10 minutes');

    insert into app.organizations (id, name, org_number, employee_count) values
      (v_org, 'Slack Test AS', '999000851', 10), (v_org2, 'Slack Annen AS', '999000852', 3);
    insert into app.survey_defaults (org_id, quiet_hours) values (v_org, false), (v_org2, false);
    insert into auth.users (id, email) values
      (v_dl, 'leder@slack-test.no'), (v_vo, 'vo@slack-test.no'), (v_dl2, 'leder@slack-annen.no');
    insert into app.profiles (id, full_name) values (v_dl, 'Dagny Leder'), (v_vo, 'Vera Verneombud'), (v_dl2, 'Annen Leder');
    insert into app.memberships (org_id, user_id, role) values
      (v_org, v_dl, 'daglig_leder'), (v_org, v_vo, 'verneombud'), (v_org2, v_dl2, 'daglig_leder');

    insert into app.measurements (org_id, kind, year) values (v_org, 'grunnlinje', 2026) returning id into v_ms;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
      values (v_org, v_ms, 'apen', now() - interval '1 hour', now() + interval '7 days') returning id into v_round;

    -- ------------------------------------------------ 5-11: who may connect, and the nonce
    perform set_config('request.jwt.claims', format(claims, v_vo, v_sess), true);
    c_start_vo := public.slack_connect_start(v_org) ->> 'error';

    perform set_config('request.jwt.claims', format(claims, v_dl, v_sess), true);
    v_nonce := public.slack_connect_start(v_org) ->> 'nonce';
    -- the verneombud presents the leader's nonce: it is not theirs
    perform set_config('request.jwt.claims', format(claims, v_vo, v_sess), true);
    c_complete_vo := public.slack_connect_complete(v_nonce, install) ->> 'error';
    c_undo_vo := public.slack_disconnect(v_org) ->> 'error';

    -- another session of the same leader may not complete it
    perform set_config('request.jwt.claims', format(claims, v_dl, gen_random_uuid()), true);
    c_session := public.slack_connect_complete(v_nonce, install) ->> 'error';
    -- and the nonce is spent by that attempt
    perform set_config('request.jwt.claims', format(claims, v_dl, v_sess), true);
    c_twice := public.slack_connect_complete(v_nonce, install) ->> 'error';

    -- expired
    v_nonce := public.slack_connect_start(v_org) ->> 'nonce';
    update app.slack_connect_nonces set expires_at = now() - interval '1 minute'
    where nonce_sha256 = encode(extensions.digest(v_nonce, 'sha256'), h);
    c_expired := public.slack_connect_complete(v_nonce, install) ->> 'error';

    -- the role lost between start and completion
    v_nonce := public.slack_connect_start(v_org) ->> 'nonce';
    update app.memberships set role = 'avdelingsleder' where org_id = v_org and user_id = v_dl;
    c_lost := public.slack_connect_complete(v_nonce, install) ->> 'error';
    update app.memberships set role = 'daglig_leder' where org_id = v_org and user_id = v_dl;

    -- 14, 15: an org-wide install and a missing scope
    v_nonce := public.slack_connect_start(v_org) ->> 'nonce';
    c_grid := public.slack_connect_complete(v_nonce, install || '{"is_enterprise_install":true}') ->> 'error';
    v_nonce := public.slack_connect_start(v_org) ->> 'nonce';
    c_scope := public.slack_connect_complete(v_nonce, install || '{"scope":"chat:write,im:write,users:read"}') ->> 'error';

    -- 16: not on before it is connected
    begin
      update app.organizations set slack_enabled = true where id = v_org;
      c_enable := 'switched on';
    exception when check_violation then c_enable := 'refused';
    end;

    -- 12: connected; the token is in Vault and in no table column
    v_nonce := public.slack_connect_start(v_org) ->> 'nonce';
    v_r := public.slack_connect_complete(v_nonce, install);
    c_vault := concat_ws(',', v_r ->> 'ok',
      (select app.slack_secret(si.access_secret) = tok_a1 from app.slack_installs si where si.org_id = v_org)::text,
      (select app.slack_secret(si.refresh_secret) = tok_r1 from app.slack_installs si where si.org_id = v_org)::text);
    select string_agg(t, ',') into c_intable from (
      select 'slack_installs' t from app.slack_installs si where si.org_id = v_org and row_to_json(si)::text ~ 'TESTACCESSTOKEN|TESTREFRESHTOKEN'
      union all select 'slack_install_log' from app.slack_install_log l where l.org_id = v_org and row_to_json(l)::text ~ 'TESTACCESSTOKEN'
    ) x;

    -- 16: and, once connected, the daglig leder may switch it on, as a client
    begin
      set local role authenticated;
      update app.organizations set slack_enabled = true where id = v_org;
      reset role;
      c_enable := c_enable || ',' || (select slack_enabled::text from app.organizations where id = v_org);
      update app.organizations set slack_enabled = false where id = v_org;
    exception when others then
      reset role;
      c_enable := c_enable || ',' || sqlstate;
    end;

    -- 13: the same workspace for another organisation
    perform set_config('request.jwt.claims', format(claims, v_dl2, v_sess), true);
    v_nonce := public.slack_connect_start(v_org2) ->> 'nonce';
    v_r := public.slack_connect_complete(v_nonce, install);
    c_taken := concat_ws(',', v_r ->> 'error', v_r ->> 'revoke');
    perform set_config('request.jwt.claims', format(claims, v_dl, v_sess), true);

    -- ------------------------------------------------ 17-20: matching
    insert into app.employees (org_id, full_name, email) values (v_org, 'Ada', 'Ada@Slack-Test.no ') returning id into v_emp1;
    insert into app.employees (org_id, full_name, email) values (v_org, 'Bo', 'bo@slack-test.no') returning id into v_emp2;
    insert into app.employees (org_id, full_name, email, active) values (v_org, 'Cy', 'cy@slack-test.no', false) returning id into v_emp3;
    insert into app.employees (org_id, full_name, email) values (v_org, 'Di 1', 'di@slack-test.no') returning id into v_emp4;
    insert into app.employees (org_id, full_name, email) values (v_org, 'Di 2', 'DI@slack-test.no') returning id into v_emp5;
    v_r := public.slack_sync_apply(v_org, jsonb_build_array(
      jsonb_build_object('id', 'U0ADA0001', 'email_sha256', encode(extensions.digest('ada@slack-test.no', 'sha256'), h)),
      jsonb_build_object('id', 'U0BO00001', 'email_sha256', encode(extensions.digest('bo@slack-test.no', 'sha256'), h)),
      jsonb_build_object('id', 'U0CY00001', 'email_sha256', encode(extensions.digest('cy@slack-test.no', 'sha256'), h)),
      jsonb_build_object('id', 'U0DI00001', 'email_sha256', encode(extensions.digest('di@slack-test.no', 'sha256'), h)),
      jsonb_build_object('id', 'not-an-id', 'email_sha256', encode(extensions.digest('bo@slack-test.no', 'sha256'), h))), 5);
    c_match := concat_ws(',', v_r ->> 'matched',
      (select slack_user_id from app.slack_members where employee_id = v_emp1),
      (select slack_user_id from app.slack_members where employee_id = v_emp2));
    c_inactive := coalesce((select slack_user_id from app.slack_members where employee_id = v_emp3), 'none');
    c_ambig := coalesce((select string_agg(slack_user_id, ',') from app.slack_members where employee_id in (v_emp4, v_emp5)), 'none');
    -- a re-sync in which Bo is gone keeps Ada and drops Bo
    perform public.slack_sync_apply(v_org, jsonb_build_array(
      jsonb_build_object('id', 'U0ADA0001', 'email_sha256', encode(extensions.digest('ada@slack-test.no', 'sha256'), h))), 1);
    c_resync := concat_ws(',', (select count(*) from app.slack_members where org_id = v_org)::text,
      (select sync_members from app.slack_installs where org_id = v_org)::text,
      (select (synced_at is not null and sync_requested_at is null)::text from app.slack_installs where org_id = v_org));
    -- a changed address forgets the match
    update app.employees set email = 'bo@slack-test.no' where id = v_emp1;
    c_addr := coalesce((select slack_user_id from app.slack_members where employee_id = v_emp1), 'none');
    update app.employees set email = 'ada@slack-test.no' where id = v_emp1;

    -- ------------------------------------------------ 21-30: the channel rule
    update app.organizations set slack_enabled = true where id = v_org;
    for v_j in select * from jsonb_array_elements('[
        {"case":"slack off",              "on":false, "when":"alle",    "kind":"invitasjon", "match":true,  "want":"email"},
        {"case":"alle, matched",          "on":true,  "when":"alle",    "kind":"invitasjon", "match":true,  "want":"slack"},
        {"case":"alle, not matched",      "on":true,  "when":"alle",    "kind":"invitasjon", "match":false, "want":"email"},
        {"case":"paaminn, invitation",    "on":true,  "when":"paaminn", "kind":"invitasjon", "match":true,  "want":"email"},
        {"case":"paaminn, reminder",      "on":true,  "when":"paaminn", "kind":"paminnelse", "match":true,  "want":"slack"},
        {"case":"paaminn, last reminder", "on":true,  "when":"paaminn", "kind":"siste_paminnelse", "match":true, "want":"slack"},
        {"case":"round: reminders only",  "on":true,  "when":"alle",    "kind":"invitasjon", "match":true,  "want":"email", "round_when":"paaminn"},
        {"case":"a link asked for",       "on":true,  "when":"alle",    "kind":"lenke",      "match":true,  "want":"email"},
        {"case":"slack before sms",       "on":true,  "when":"alle",    "kind":"invitasjon", "match":true,  "want":"slack", "sms":true},
        {"case":"installation broken",    "on":true,  "when":"alle",    "kind":"invitasjon", "match":true,  "want":"email", "broken":true}
      ]'::jsonb)
    loop
      v_n := v_n + 1;
      update app.organizations set slack_when = v_j->>'when', sms_enabled = coalesce((v_j->>'sms')::boolean, false), sms_when = 'alle'
      where id = v_org;
      update app.organizations set slack_enabled = (v_j->>'on')::boolean where id = v_org;
      update app.rounds set slack_when = v_j->>'round_when' where id = v_round;
      if (v_j->>'broken')::boolean then
        perform public.slack_install_broken(v_org, 'token_revoked');
      end if;
      insert into app.employees (org_id, full_name, email, phone)
        values (v_org, v_j->>'case', format('s%s@slack-test.no', v_n), case when (v_j->>'sms')::boolean then '+4791000851' end)
        returning id into v_e;
      if (v_j->>'match')::boolean then
        insert into app.slack_members (employee_id, org_id, slack_user_id) values (v_e, v_org, format('U0RULE%s', lpad(v_n::text, 4, '0')));
      end if;
      insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at)
        values (v_org, v_round, v_e, extensions.digest(v_j->>'case', 'sha256'), now() + interval '7 days') returning id into v_i;
      insert into app.outbox (org_id, round_id, kind, employee_id, invitation_id, due_at, channel)
        values (v_org, v_round, (v_j->>'kind')::app.outbox_kind, v_e, v_i, now() - interval '1 minute',
                case when v_j->>'kind' = 'lenke' then 'email' end)
        returning id into v_o;
      v_claim := public.dispatch_claim(100);
      select e into v_mine from jsonb_array_elements(v_claim) e where (e->>'id')::uuid = v_o;
      c_ch := c_ch || (v_j->>'case' || '=' || coalesce(v_mine->>'channel', (select 'failed:' || coalesce(last_error, '?') from app.outbox where id = v_o)));
      if v_j->>'case' = 'alle, matched' then
        c_rcpt := concat_ws(',', v_mine->'recipients'->0->'slack'->>'user_id',
                            (v_mine->'recipients'->0->'slack'->>'org' = v_org::text)::text,
                            v_mine->'recipients'->0->>'email');
        perform public.dispatch_done(v_o, true, null, false, null, 'slack');
        c_done := (select channel from app.outbox where id = v_o);
        -- 32: Slack said the member is gone: unmatched
        v_r := public.slack_dispatch_result(v_o, 'user_not_found');
        c_unmatch := concat_ws(',', v_r ->> 'ok', coalesce((select slack_user_id from app.slack_members where employee_id = v_e), 'none'));
      end if;
      if (v_j->>'broken')::boolean then
        update app.slack_installs set status = 'active', broken_reason = null, broken_at = null where org_id = v_org;
      end if;
    end loop;

    -- 33: the refresh token is handed out once, to one runner
    update app.slack_installs set expires_at = now() + interval '5 minutes', refreshing_at = null where org_id = v_org;
    c_lease := concat_ws(',', (public.slack_token(v_org) ? 'refresh_token')::text, (public.slack_token(v_org) ? 'refresh_token')::text);
    -- 34: a refreshed pair goes to Vault, and the lease is released
    v_r := public.slack_token_store(v_org, tok_a2, tok_r2, 43200);
    c_store := concat_ws(',', v_r ->> 'ok', (public.slack_token(v_org) ->> 'token' = tok_a2)::text,
      (select (refreshing_at is null and expires_at > now() + interval '11 hours')::text from app.slack_installs where org_id = v_org));

    -- 38: what each sees
    v_r := public.slack_status(v_org);
    c_status_dl := concat_ws(',', v_r ->> 'connected', v_r ->> 'team_name', (v_r -> 'counts' ->> 'matched' is not null)::text, v_r ->> 'installed_by');
    perform set_config('request.jwt.claims', format(claims, v_vo, v_sess), true);
    v_r := public.slack_status(v_org);
    c_status_vo := concat_ws(',', v_r ->> 'connected', coalesce(v_r ->> 'counts', 'no counts'), coalesce(v_r ->> 'installed_by', 'no name'));
    perform set_config('request.jwt.claims', format(claims, v_dl2, v_sess), true);
    c_status_x := public.slack_status(v_org) ->> 'error';

    -- 35-37: disconnecting
    perform set_config('request.jwt.claims', format(claims, v_dl, v_sess), true);
    select access_secret into v_secret from app.slack_installs where org_id = v_org;
    v_r := public.slack_disconnect(v_org);
    c_disc := concat_ws(',', v_r ->> 'ok',
      (select count(*) from app.slack_members where org_id = v_org)::text,
      (select slack_enabled::text from app.organizations where id = v_org),
      (select event from app.slack_install_log where org_id = v_org order by id desc limit 1),
      (select count(*) from app.slack_revocations where access_secret = v_secret)::text);
    v_r := public.slack_revoke_claim(50);
    select (e ->> 'id')::bigint into v_n from jsonb_array_elements(v_r) e where e ->> 'token' = tok_a2;
    perform public.slack_revoke_done(v_n);
    c_revoke := concat_ws(',', (v_n is not null)::text,
      (select count(*) from vault.secrets where id = v_secret)::text,
      (select count(*) from app.slack_revocations where access_secret = v_secret)::text);

    -- 42: a round's Slack rule is fixed once open
    begin
      set local role authenticated;
      update app.rounds set slack_when = 'alle' where id = v_round;
      c_fixed := 'changed';
    exception when restrict_violation then c_fixed := 'fixed';
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  insert into public._sli values
    (5, 'a verneombud cannot start a connection', 'not_allowed', c_start_vo, c_start_vo = 'not_allowed'),
    (6, 'a nonce is its starter''s own', 'nonce_invalid', c_complete_vo, c_complete_vo = 'nonce_invalid'),
    (7, 'a nonce is bound to the session that started it', 'nonce_invalid', c_session, c_session = 'nonce_invalid'),
    (8, 'a nonce is single use', 'nonce_used', c_twice, c_twice = 'nonce_used'),
    (9, 'a nonce expires', 'nonce_expired', c_expired, c_expired = 'nonce_expired'),
    (10, 'a daglig leder who lost the role cannot complete', 'not_allowed', c_lost, c_lost = 'not_allowed'),
    (11, 'a verneombud cannot disconnect', 'not_allowed', c_undo_vo, c_undo_vo = 'not_allowed'),
    (12, 'the tokens are in Vault and in no table', 'true,true,true|none', c_vault || '|' || coalesce(c_intable, 'none'),
         c_vault = 'true,true,true' and c_intable is null),
    (13, 'one organisation per workspace, and its token is not revoked', 'team_taken,false', c_taken, c_taken = 'team_taken,false'),
    (14, 'an org-wide Grid install is refused', 'enterprise_install', c_grid, c_grid = 'enterprise_install'),
    (15, 'all four scopes are required', 'invalid_install', c_scope, c_scope = 'invalid_install'),
    (16, 'Slack cannot be switched on before it is connected, and the daglig leder can once it is', 'refused,true', c_enable, c_enable = 'refused,true'),
    (17, 'members are matched by the digest of their work address', '2,U0ADA0001,U0BO00001', c_match, c_match = '2,U0ADA0001,U0BO00001'),
    (18, 'an inactive employee is not matched', 'none', c_inactive, c_inactive = 'none'),
    (19, 'an address two employees share matches nobody', 'none', c_ambig, c_ambig = 'none'),
    (20, 'a re-sync replaces the matches and records the count', '1,1,true', c_resync, c_resync = '1,1,true'),
    (21, 'a changed address forgets its match', 'none', c_addr, c_addr = 'none'),
    (22, 'the channel rule, case by case',
         'slack off=email|alle, matched=slack|alle, not matched=email|paaminn, invitation=email|paaminn, reminder=slack|paaminn, last reminder=slack|round: reminders only=email|a link asked for=email|slack before sms=slack|installation broken=email',
         array_to_string(c_ch, '|'),
         array_to_string(c_ch, '|') = 'slack off=email|alle, matched=slack|alle, not matched=email|paaminn, invitation=email|paaminn, reminder=slack|paaminn, last reminder=slack|round: reminders only=email|a link asked for=email|slack before sms=slack|installation broken=email'),
    (23, 'the hand-over carries the member id, the organisation and the e-mail for the fallback',
         'U0RULE0002,true,s2@slack-test.no', c_rcpt, c_rcpt = 'U0RULE0002,true,s2@slack-test.no'),
    (31, 'dispatch_done records slack', 'slack', c_done, c_done = 'slack'),
    (32, 'a member Slack does not know is unmatched', 'true,none', c_unmatch, c_unmatch = 'true,none'),
    (33, 'the refresh token is leased to one runner', 'true,false', c_lease, c_lease = 'true,false'),
    (34, 'a refreshed pair is stored and the lease released', 'true,true,true', c_store, c_store = 'true,true,true'),
    (35, 'disconnecting forgets the matches, turns Slack off, logs and queues the tokens', 'true,0,false,disconnected,1',
         c_disc, c_disc = 'true,0,false,disconnected,1'),
    (36, 'a revocation done deletes the secrets', 'true,0,0', c_revoke, c_revoke = 'true,0,0'),
    (38, 'slack_status: the leader sees counts and who connected, the verneombud neither, a stranger nothing',
         'true,Slack Test,true,Dagny Leder|true,no counts,no name|not_allowed',
         concat_ws('|', c_status_dl, c_status_vo, c_status_x),
         concat_ws('|', c_status_dl, c_status_vo, c_status_x) = 'true,Slack Test,true,Dagny Leder|true,no counts,no name|not_allowed'),
    (42, 'a round''s Slack rule is fixed once it has opened', 'fixed', c_fixed, c_fixed = 'fixed');

  -- 1: RLS on every new table
  select string_agg(c.relname, ',' order by c.relname) into v_txt
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'app' and c.relname like 'slack\_%' and c.relkind = 'r' and not c.relrowsecurity;
  insert into public._sli values (1, 'RLS is on for every Slack table', 'none', coalesce(v_txt, 'none'), v_txt is null);
  select count(*)::text into v_txt from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'app' and c.relname in ('slack_installs', 'slack_members', 'slack_install_log', 'slack_connect_nonces', 'slack_revocations');
  insert into public._sli values (1, 'the five Slack tables exist', '5', v_txt, v_txt = '5');

  -- 2: no client grant on the token storage, the matches, the nonces, the queue; no policy on them
  select string_agg(format('%s:%s:%s', table_name, grantee, privilege_type), ',') into v_txt
  from information_schema.table_privileges
  where table_schema = 'app' and table_name in ('slack_installs', 'slack_members', 'slack_connect_nonces', 'slack_revocations')
    and grantee in ('anon', 'authenticated', 'public');
  select concat_ws('|', v_txt, (select string_agg(tablename || '.' || policyname, ',') from pg_policies
    where schemaname = 'app' and tablename in ('slack_installs', 'slack_members', 'slack_connect_nonces', 'slack_revocations'))) into v_txt;
  insert into public._sli values (2, 'no client grant or policy on tokens, matches, nonces or the revocation queue', '', v_txt, v_txt = '');
  -- the log: read, never written, by a client
  select string_agg(privilege_type, ',' order by privilege_type) into v_txt
  from information_schema.table_privileges where table_schema = 'app' and table_name = 'slack_install_log' and grantee in ('anon', 'authenticated');
  insert into public._sli values (2, 'the log is read-only to clients', 'SELECT', coalesce(v_txt, ''), v_txt = 'SELECT');

  -- 3: Vault is no client's
  select concat_ws(',', has_table_privilege('authenticated', 'vault.decrypted_secrets', 'select'),
                        has_table_privilege('anon', 'vault.decrypted_secrets', 'select'),
                        has_table_privilege('authenticated', 'vault.secrets', 'select'),
                        has_function_privilege('authenticated', 'app.slack_secret(uuid)', 'execute'),
                        has_function_privilege('anon', 'app.slack_secret(uuid)', 'execute')) into v_txt;
  insert into public._sli values (3, 'no client can read Vault or call the secret reader', 'f,f,f,f,f', v_txt,
    v_txt = 'f,f,f,f,f');

  -- 4: the dispatcher's functions
  select string_agg(p.oid::regprocedure::text, ',') into v_txt
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('slack_token', 'slack_token_store', 'slack_install_broken', 'slack_sync_due',
          'slack_sync_apply', 'slack_sync_failed', 'slack_dispatch_result', 'slack_revoke_claim', 'slack_revoke_done')
    and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'));
  insert into public._sli values (4, 'the dispatcher''s Slack functions are the service role''s alone', 'none', coalesce(v_txt, 'none'), v_txt is null);
  select count(*)::text into v_txt from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'slack\_%' and has_function_privilege('anon', p.oid, 'execute');
  insert into public._sli values (4, 'anon may call no Slack function', '0', v_txt, v_txt = '0');

  -- 39: no answer table, nor invitations, has a column for a Slack identity
  select string_agg(table_name || '.' || column_name, ',') into v_txt
  from information_schema.columns
  where table_schema = 'app' and table_name in ('invitations', 'responses', 'answers', 'extra_answers', 'response_comments', 'outbox')
    and column_name ~* 'slack|chat|member_id|user_id';
  insert into public._sli values (39, 'no answer table, nor invitations or the outbox, has a column for a Slack identity',
    'none', coalesce(v_txt, 'none'), v_txt is null);

  -- 40: slack_members points only at the register, and nothing points at it
  select string_agg(conrelid::regclass || '->' || confrelid::regclass, ',' order by confrelid::regclass::text) into v_txt
  from pg_constraint
  where contype = 'f' and (conrelid = 'app.slack_members'::regclass or confrelid = 'app.slack_members'::regclass
                           or confrelid = 'app.slack_installs'::regclass);
  insert into public._sli values (40, 'the Slack match points at the register only, and nothing points at it',
    'app.slack_members->app.employees,app.slack_members->app.organizations', coalesce(v_txt, 'none'),
    v_txt = 'app.slack_members->app.employees,app.slack_members->app.organizations');

  -- 41: nothing that reacts to an answer reaches Slack
  select string_agg(c.relname || '.' || t.tgname, ',') into v_txt
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
  join pg_proc p on p.oid = t.tgfoid
  where not t.tgisinternal and n.nspname = 'app'
    and c.relname in ('invitations', 'responses', 'answers', 'extra_answers', 'response_comments')
    and p.prosrc ~* 'slack';
  insert into public._sli values (41, 'nothing that reacts to an answer reaches Slack', 'none', coalesce(v_txt, 'none'), v_txt is null);

  insert into public._sli
  select 43, 'nothing from the test survives', '0', count(*)::text, count(*) = 0
  from (select id from app.organizations where id in (v_org, v_org2)
        union all select id from auth.users where id in (v_dl, v_vo, v_dl2)
        union all select org_id from app.slack_installs where org_id in (v_org, v_org2)
        union all select employee_id from app.slack_members where org_id in (v_org, v_org2)) left_over;
end $$;

select seq, name, expected, actual, pass from public._sli order by seq;

do $$
declare v_failed text;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) into v_failed from public._sli where not pass;
  if v_failed is not null then
    raise exception 'slack invariants failed: %', v_failed;
  end if;
end $$;

drop table public._sli;
