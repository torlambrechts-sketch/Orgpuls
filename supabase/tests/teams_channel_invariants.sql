-- teams_channel_invariants.sql — Microsoft Teams as a channel (0176, D-203), proved against the live
-- schema.
--
--   * the claim picks 'teams' exactly when the organisation has Teams on, has bound a tenant, the
--     person has an object id and no Teams problem, and the rule (organisation's, or the round's
--     own) says so; otherwise the e-mail/SMS rule as before (1-12)
--   * Teams comes before SMS when both would carry the link (13)
--   * a link somebody asked for keeps the channel they typed into; a notice to a role stays
--     e-mail and carries no Teams identity (14, 15)
--   * the recipient carries whom to address, and the conversation once the dispatcher kept one;
--     the e-mail stays in the hand-over for the fallback (16, 17)
--   * quiet hours hold a Teams invitation; an answered one is dropped; each send mints a new
--     token (18-20)
--   * dispatch_done records 'teams', null is e-mail, an unknown channel is refused (21-23)
--   * the bot's write paths: an unknown tenant or person is ignored, an install keeps the
--     conversation and clears a problem, a removal forgets it and records the person as blocked,
--     the dispatcher's report records blocked/unreachable (24-28)
--   * a changed object id, or an unbound tenant, forgets the conversation and the problem (29, 30)
--   * teams_status: counts for the daglig leder, null for anyone else; the list of addresses to
--     correct leaves Teams out (31, 32)
--   * no client may read teams_conversations or the outbox, or call the bot's or the dispatcher's
--     functions (33, 34)
--   * no answer table, and not invitations, has a column that could hold a Teams identity, and no
--     key links teams_conversations to them (35, 36)
--   * a round's Teams rule is fixed once it has opened (37)
--   * nothing that reacts to an answer (a trigger on invitations or an answer table) reaches Teams
--     or the outbox, so a sent card is never edited or deleted on answering (39)
--   * nothing from the test survives (38)
--
-- Everything is written inside a block that rolls itself back.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/teams_channel_invariants.sql

create unlogged table if not exists public._tci(seq int, name text, expected text, actual text, pass bool);
truncate public._tci;

do $$
declare
  v_org    uuid := '00000000-0000-4000-8000-0000000c7a01';
  v_unb    uuid := '00000000-0000-4000-8000-0000000c7a02';
  v_dl     uuid := '00000000-0000-4000-8000-0000000c7a03';
  v_vo     uuid := '00000000-0000-4000-8000-0000000c7a04';
  v_tenant text := '7e1a0000-0000-4000-8000-00000000c7a1';
  v_tenant2 text := '7e1a0000-0000-4000-8000-00000000c7a2';
  claims   constant text := '{"sub":"%s","role":"authenticated","aal":"aal1"}';
  v_ms uuid; v_ms2 uuid; v_round uuid; v_round2 uuid; v_planned uuid;
  v_e uuid; v_i uuid; v_o uuid; v_j jsonb; v_claim jsonb; v_mine jsonb;
  v_n int := 0;
  v_txt text; v_json jsonb;
  c_ch     text[] := '{}';
  c_rcpt   text; c_conv text; c_role text; c_quiet text; c_answered text; c_tokens text;
  c_done   text; c_null text; c_unknown text;
  c_set_unknown text; c_set text; c_clear text; c_report text; c_report_bad text;
  c_objchange text; c_unbind text; c_status text; c_list text; c_fixed text;
  v_tok1 text; v_tok2 text; v_tz text;
  -- a person for one case: an employee, an invitation and a due row
  v_obj text;
begin
  begin
    -- other rows due on this database are leased for the length of the test, so every claim
    -- below sees this test's rows (all of it is rolled back)
    update app.outbox set claimed_at = now()
    where sent_at is null and failed_at is null and (claimed_at is null or claimed_at < now() - interval '10 minutes');

    insert into app.organizations (id, name, org_number, employee_count) values
      (v_org, 'Teams Test AS', '999000771', 10),
      (v_unb, 'Teams Ubundet AS', '999000772', 2);
    insert into app.survey_defaults (org_id, quiet_hours) values (v_org, false), (v_unb, false);
    insert into app.entra_tenants (org_id, tenant_id) values (v_org, v_tenant);

    insert into auth.users (id, email) values (v_dl, 'leder@teams-test.no'), (v_vo, 'vo@teams-test.no');
    insert into app.profiles (id, full_name) values (v_dl, 'Dagny Leder'), (v_vo, 'Vera Verneombud');
    insert into app.memberships (org_id, user_id, role) values (v_org, v_dl, 'daglig_leder'), (v_org, v_vo, 'verneombud');

    insert into app.measurements (org_id, kind, year) values (v_org, 'grunnlinje', 2026) returning id into v_ms;
    insert into app.measurements (org_id, kind, year) values (v_unb, 'grunnlinje', 2026) returning id into v_ms2;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
      values (v_org, v_ms, 'apen', now() - interval '1 hour', now() + interval '7 days') returning id into v_round;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
      values (v_unb, v_ms2, 'apen', now() - interval '1 hour', now() + interval '7 days') returning id into v_round2;

    -- 1-15: the channel rule, one person per case
    for v_j in select * from jsonb_array_elements('[
        {"case":"teams off",                  "org":"org", "on":false, "when":"alle",    "kind":"invitasjon", "email":"t1@teams-test.no", "obj":true,  "want":"email"},
        {"case":"alle, object id",            "org":"org", "on":true,  "when":"alle",    "kind":"invitasjon", "email":"t2@teams-test.no", "obj":true,  "want":"teams"},
        {"case":"alle, no object id",         "org":"org", "on":true,  "when":"alle",    "kind":"invitasjon", "email":"t3@teams-test.no", "obj":false, "want":"email"},
        {"case":"alle, blocked",              "org":"org", "on":true,  "when":"alle",    "kind":"invitasjon", "email":"t4@teams-test.no", "obj":true,  "want":"email", "problem":"blocked"},
        {"case":"alle, unreachable",          "org":"org", "on":true,  "when":"alle",    "kind":"invitasjon", "email":"t5@teams-test.no", "obj":true,  "want":"email", "problem":"invalid"},
        {"case":"paaminn, invitation",        "org":"org", "on":true,  "when":"paaminn", "kind":"invitasjon", "email":"t6@teams-test.no", "obj":true,  "want":"email"},
        {"case":"paaminn, reminder",          "org":"org", "on":true,  "when":"paaminn", "kind":"paminnelse", "email":"t7@teams-test.no", "obj":true,  "want":"teams"},
        {"case":"paaminn, last reminder",     "org":"org", "on":true,  "when":"paaminn", "kind":"siste_paminnelse", "email":"t8@teams-test.no", "obj":true, "want":"teams"},
        {"case":"mangler, has e-mail",        "org":"org", "on":true,  "when":"mangler", "kind":"invitasjon", "email":"t9@teams-test.no", "obj":true,  "want":"email"},
        {"case":"mangler, object id only",    "org":"org", "on":true,  "when":"mangler", "kind":"invitasjon", "email":null,                "obj":true,  "want":"teams"},
        {"case":"no tenant bound",            "org":"unb", "on":true,  "when":"alle",    "kind":"invitasjon", "email":"t11@teams-test.no","obj":true,  "want":"email"},
        {"case":"round says reminders only",  "org":"org", "on":true,  "when":"alle",    "kind":"invitasjon", "email":"t12@teams-test.no","obj":true,  "want":"email", "round_when":"paaminn"},
        {"case":"teams before sms",           "org":"org", "on":true,  "when":"alle",    "kind":"invitasjon", "email":"t13@teams-test.no","obj":true,  "want":"teams", "sms":true},
        {"case":"a link asked for",           "org":"org", "on":true,  "when":"alle",    "kind":"lenke",      "email":"t14@teams-test.no","obj":true,  "want":"email"}
      ]'::jsonb)
    loop
      v_n := v_n + 1;
      v_obj := case when (v_j->>'obj')::boolean then format('0b1e0000-0000-4000-8000-%s', lpad(v_n::text, 12, '0')) end;
      update app.organizations set teams_enabled = (v_j->>'on')::boolean, teams_when = v_j->>'when',
             sms_enabled = coalesce((v_j->>'sms')::boolean, false), sms_when = 'alle'
      where id = case when v_j->>'org' = 'unb' then v_unb else v_org end;
      update app.rounds set teams_when = v_j->>'round_when' where id = v_round;
      insert into app.employees (org_id, full_name, email, phone, entra_object_id, source)
        values (case when v_j->>'org' = 'unb' then v_unb else v_org end, v_j->>'case', v_j->>'email',
                case when (v_j->>'sms')::boolean then '+4791000771' end, v_obj,
                case when v_obj is null then 'manual' else 'entra' end)
        returning id into v_e;
      if v_j ? 'problem' then
        insert into app.address_problems (employee_id, channel, org_id, problem, at)
        values (v_e, 'teams', v_org, (v_j->>'problem')::app.mail_delivery, now());
      end if;
      insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at)
        values (case when v_j->>'org' = 'unb' then v_unb else v_org end,
                case when v_j->>'org' = 'unb' then v_round2 else v_round end,
                v_e, extensions.digest(v_j->>'case', 'sha256'), now() + interval '7 days') returning id into v_i;
      insert into app.outbox (org_id, round_id, kind, employee_id, invitation_id, due_at, channel)
        values (case when v_j->>'org' = 'unb' then v_unb else v_org end,
                case when v_j->>'org' = 'unb' then v_round2 else v_round end,
                (v_j->>'kind')::app.outbox_kind, v_e, v_i, now() - interval '1 minute',
                case when v_j->>'kind' = 'lenke' then 'email' end)
        returning id into v_o;
      v_claim := public.dispatch_claim(100);
      select e into v_mine from jsonb_array_elements(v_claim) e where (e->>'id')::uuid = v_o;
      c_ch := c_ch || (v_j->>'case' || '=' || coalesce(v_mine->>'channel', (select 'failed:' || coalesce(last_error, '?') from app.outbox where id = v_o)));
      if v_j->>'case' = 'alle, object id' then
        -- 16: whom to address, and the e-mail kept for the fallback
        c_rcpt := concat_ws(',', (v_mine->'recipients'->0->'teams'->>'object_id' = v_obj)::text,
                            (v_mine->'recipients'->0->'teams'->>'tenant_id' = v_tenant)::text,
                            coalesce(v_mine->'recipients'->0->'teams'->>'conversation_id', 'none'),
                            v_mine->'recipients'->0->>'email');
        -- 21: done records the channel
        perform public.dispatch_done(v_o, true, null, false, null, 'teams');
        c_done := (select channel from app.outbox where id = v_o);
        -- 17: the dispatcher keeps the conversation it made, and the next message is addressed to it
        perform public.teams_dispatch_result(v_o, 'a:1conversation', 'https://smba.trafficmanager.net/emea/');
        update app.invitations set token_hash = extensions.digest('x', 'sha256') where id = v_i;
        insert into app.outbox (org_id, round_id, kind, employee_id, invitation_id, due_at)
          values (v_org, v_round, 'paminnelse', v_e, v_i, now() - interval '1 minute') returning id into v_o;
        v_claim := public.dispatch_claim(100);
        select e into v_mine from jsonb_array_elements(v_claim) e where (e->>'id')::uuid = v_o;
        c_conv := concat_ws(',', v_mine->>'channel', v_mine->'recipients'->0->'teams'->>'conversation_id',
                            v_mine->'recipients'->0->'teams'->>'service_url');
        perform public.dispatch_done(v_o, true, null, false, null, null);
        c_null := (select channel from app.outbox where id = v_o);
      end if;
    end loop;
    update app.organizations set sms_enabled = false, teams_enabled = true, teams_when = 'alle' where id = v_org;
    update app.rounds set teams_when = null where id = v_round;

    -- 15: a notice to a role: e-mail, and no Teams identity in it
    insert into app.employees (org_id, full_name, email, entra_object_id, source, duty_role)
      values (v_org, 'Vera i registeret', 'vera@teams-test.no', '0b1e0000-0000-4000-8000-0000000000ff', 'entra', 'verneombud');
    insert into app.outbox (org_id, round_id, kind, audience, due_at)
      values (v_org, v_round, 'svarprosent', 'verneombud', now() - interval '1 minute') returning id into v_o;
    v_claim := public.dispatch_claim(100);
    select e into v_mine from jsonb_array_elements(v_claim) e where (e->>'id')::uuid = v_o;
    c_role := coalesce(v_mine->>'channel', 'unclaimed') || ',' ||
              (select count(*) from jsonb_array_elements(v_mine->'recipients') r where r ? 'teams' and r->'teams' <> 'null'::jsonb)::text;

    -- 18: quiet hours hold a Teams invitation: a zone where it is night now
    select z into v_tz from (values ('Etc/GMT+12'), ('Etc/GMT+9'), ('Etc/GMT+6'), ('Etc/GMT+3'), ('Etc/GMT'), ('Etc/GMT-3'), ('Etc/GMT-6'), ('Etc/GMT-9'), ('Etc/GMT-12')) t(z)
    where extract(hour from now() at time zone z) not between 7 and 20 limit 1;
    update app.organizations set timezone = v_tz where id = v_org;
    update app.survey_defaults set quiet_hours = true where org_id = v_org;
    insert into app.employees (org_id, full_name, email, entra_object_id, source)
      values (v_org, 'Natt', 'natt@teams-test.no', '0b1e0000-0000-4000-8000-0000000000a1', 'entra') returning id into v_e;
    insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at)
      values (v_org, v_round, v_e, extensions.digest('natt', 'sha256'), now() + interval '7 days') returning id into v_i;
    insert into app.outbox (org_id, round_id, kind, employee_id, invitation_id, due_at)
      values (v_org, v_round, 'invitasjon', v_e, v_i, now() - interval '1 minute') returning id into v_o;
    v_claim := public.dispatch_claim(100);
    c_quiet := (select (claimed_at is null and failed_at is null)::text from app.outbox where id = v_o)
               || ',' || (select count(*) from jsonb_array_elements(v_claim) e where (e->>'id')::uuid = v_o)::text;
    update app.outbox set failed_at = now(), last_error = 'test' where id = v_o;
    update app.organizations set timezone = 'Europe/Oslo' where id = v_org;
    update app.survey_defaults set quiet_hours = false where org_id = v_org;

    -- 19: an answered invitation is dropped, not sent by Teams
    insert into app.employees (org_id, full_name, email, entra_object_id, source)
      values (v_org, 'Svart', 'svart@teams-test.no', '0b1e0000-0000-4000-8000-0000000000a2', 'entra') returning id into v_e;
    insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at, responded_at)
      values (v_org, v_round, v_e, extensions.digest('svart', 'sha256'), now() + interval '7 days', now()) returning id into v_i;
    insert into app.outbox (org_id, round_id, kind, employee_id, invitation_id, due_at)
      values (v_org, v_round, 'paminnelse', v_e, v_i, now() - interval '1 minute') returning id into v_o;
    v_claim := public.dispatch_claim(100);
    c_answered := (select coalesce(last_error, 'unfailed') from app.outbox where id = v_o);

    -- 20: each Teams send mints its own token
    insert into app.employees (org_id, full_name, email, entra_object_id, source)
      values (v_org, 'To ganger', 'to@teams-test.no', '0b1e0000-0000-4000-8000-0000000000a3', 'entra') returning id into v_e;
    insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at)
      values (v_org, v_round, v_e, extensions.digest('to', 'sha256'), now() + interval '7 days') returning id into v_i;
    insert into app.outbox (org_id, round_id, kind, employee_id, invitation_id, due_at)
      values (v_org, v_round, 'invitasjon', v_e, v_i, now() - interval '1 minute') returning id into v_o;
    v_claim := public.dispatch_claim(100);
    select e->>'token' into v_tok1 from jsonb_array_elements(v_claim) e where (e->>'id')::uuid = v_o;
    perform public.dispatch_done(v_o, true, null, false, null, 'teams');
    insert into app.outbox (org_id, round_id, kind, employee_id, invitation_id, due_at)
      values (v_org, v_round, 'paminnelse', v_e, v_i, now() - interval '1 minute') returning id into v_o;
    v_claim := public.dispatch_claim(100);
    select e->>'token' into v_tok2 from jsonb_array_elements(v_claim) e where (e->>'id')::uuid = v_o;
    c_tokens := (v_tok1 is not null and v_tok2 is not null and v_tok1 <> v_tok2
                 and exists (select 1 from app.invitations where id = v_i and token_hash = extensions.digest(v_tok2, 'sha256')))::text;

    -- 23: an unknown channel is refused, and nothing is recorded
    begin
      perform public.dispatch_done(v_o, true, null, false, null, 'fax');
      c_unknown := 'accepted';
    exception when invalid_parameter_value then
      c_unknown := 'refused,' || (select (sent_at is null)::text from app.outbox where id = v_o);
    end;

    -- 24-28: the bot's write paths
    insert into app.employees (org_id, full_name, email, entra_object_id, source)
      values (v_org, 'Installert', 'inst@teams-test.no', 'abcdef00-0000-4000-8000-0000000000b1', 'entra') returning id into v_e;
    -- each call is its own statement: a query in the same statement would not see what it wrote
    c_set_unknown := public.teams_conversation_set(v_tenant2, 'abcdef00-0000-4000-8000-0000000000b1', 'a:x', 'https://smba.trafficmanager.net/emea/')->>'matched';
    c_set_unknown := c_set_unknown || ',' || (public.teams_conversation_set(v_tenant, 'abcdef00-0000-4000-8000-0000000000ff', 'a:x', 'https://smba.trafficmanager.net/emea/')->>'matched');
    c_set_unknown := c_set_unknown || ',' || (public.teams_conversation_set(v_tenant, 'abcdef00-0000-4000-8000-0000000000b1', 'a:x', 'https://evil.example/')->>'error');
    c_set_unknown := c_set_unknown || ',' || (select count(*) from app.teams_conversations where employee_id = v_e)::text;
    insert into app.address_problems (employee_id, channel, org_id, problem, at) values (v_e, 'teams', v_org, 'blocked', now());
    c_set := public.teams_conversation_set(upper(v_tenant), 'ABCDEF00-0000-4000-8000-0000000000B1', 'a:inst', 'https://smba.trafficmanager.net/emea/')->>'matched';
    c_set := c_set || ',' || coalesce((select conversation_id from app.teams_conversations where employee_id = v_e), 'none')
                   || ',' || (select count(*) from app.address_problems where employee_id = v_e and channel = 'teams')::text;
    c_clear := public.teams_conversation_clear(v_tenant, 'abcdef00-0000-4000-8000-0000000000b1')->>'matched';
    c_clear := c_clear || ',' || (select count(*) from app.teams_conversations where employee_id = v_e)::text
                       || ',' || coalesce((select problem::text from app.address_problems where employee_id = v_e and channel = 'teams'), 'none');
    -- the dispatcher's report: unreachable, on a personal row; anything else refused
    insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at)
      values (v_org, v_round, v_e, extensions.digest('inst', 'sha256'), now() + interval '7 days') returning id into v_i;
    insert into app.outbox (org_id, round_id, kind, employee_id, invitation_id, due_at)
      values (v_org, v_round, 'invitasjon', v_e, v_i, now() + interval '1 day') returning id into v_o;
    c_report := public.teams_dispatch_result(v_o, null, null, 'invalid')->>'ok';
    c_report := c_report || ',' || coalesce((select problem::text from app.address_problems where employee_id = v_e and channel = 'teams'), 'none');
    c_report_bad := public.teams_dispatch_result(v_o, null, null, 'spam')->>'error';
    c_report_bad := c_report_bad || ',' || (public.teams_dispatch_result(v_o, 'a:ok', 'https://evil.example/', null)->>'error');
    select id into v_i from app.outbox o where o.org_id = v_org and o.kind = 'svarprosent' limit 1;
    c_report_bad := c_report_bad || ',' || (public.teams_dispatch_result(v_i, 'a:ok', 'https://smba.trafficmanager.net/emea/', null)->>'error');

    -- 29: a new object id is a new person to Teams
    perform public.teams_conversation_set(v_tenant, 'abcdef00-0000-4000-8000-0000000000b1', 'a:again', 'https://smba.trafficmanager.net/emea/');
    insert into app.address_problems (employee_id, channel, org_id, problem, at) values (v_e, 'teams', v_org, 'invalid', now())
      on conflict (employee_id, channel) do nothing;
    update app.employees set entra_object_id = 'abcdef00-0000-4000-8000-0000000000b2' where id = v_e;
    c_objchange := concat_ws(',',
      (select count(*) from app.teams_conversations where employee_id = v_e)::text,
      (select count(*) from app.address_problems where employee_id = v_e and channel = 'teams')::text);

    -- 31, 32: what the leader sees
    perform public.teams_conversation_set(v_tenant, 'abcdef00-0000-4000-8000-0000000000b2', 'a:counted', 'https://smba.trafficmanager.net/emea/');
    insert into app.address_problems (employee_id, channel, org_id, problem, at)
      select id, 'teams', v_org, 'blocked', now() from app.employees where org_id = v_org and full_name = 'Svart';
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    v_json := public.teams_status(v_org);
    c_status := concat_ws(',', v_json->>'tenant_bound', ((v_json->>'with_object_id')::int > 0)::text,
                          v_json->>'with_conversation', ((v_json->>'blocked')::int >= 2)::text, ((v_json->>'unreachable')::int >= 1)::text,
                          ((v_json->>'sent_30d')::int >= 2)::text);
    c_list := (select count(*) from jsonb_array_elements(public.address_problems(v_org)) x where x->>'channel' = 'teams')::text;
    perform set_config('request.jwt.claims', format(claims, v_vo), true);
    c_status := c_status || ',' || coalesce(public.teams_status(v_org)::text, 'null');
    perform set_config('request.jwt.claims', '', true);

    -- 30: unbinding the tenant forgets what the bot knew there
    delete from app.entra_tenants where org_id = v_org;
    c_unbind := concat_ws(',',
      (select count(*) from app.teams_conversations where org_id = v_org)::text,
      (select count(*) from app.address_problems where org_id = v_org and channel = 'teams')::text);

    -- 37: a round's Teams rule is fixed once it has opened (as a client)
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    set local role authenticated;
    begin
      update app.rounds set teams_when = 'alle' where id = v_round;
      c_fixed := 'changed';
    exception when restrict_violation then c_fixed := 'fixed';
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  insert into public._tci values
    (1,  'Teams off: e-mail',                                   'teams off=email',                 c_ch[1],  c_ch[1]  = 'teams off=email'),
    (2,  'Teams on for everyone, object id: Teams',             'alle, object id=teams',           c_ch[2],  c_ch[2]  = 'alle, object id=teams'),
    (3,  'no object id: e-mail',                                'alle, no object id=email',        c_ch[3],  c_ch[3]  = 'alle, no object id=email'),
    (4,  'blocked the app: e-mail',                             'alle, blocked=email',             c_ch[4],  c_ch[4]  = 'alle, blocked=email'),
    (5,  'unreachable in Teams: e-mail',                        'alle, unreachable=email',         c_ch[5],  c_ch[5]  = 'alle, unreachable=email'),
    (6,  'reminders only, an invitation: e-mail',               'paaminn, invitation=email',       c_ch[6],  c_ch[6]  = 'paaminn, invitation=email'),
    (7,  'reminders only, a reminder: Teams',                   'paaminn, reminder=teams',         c_ch[7],  c_ch[7]  = 'paaminn, reminder=teams'),
    (8,  'reminders only, the last reminder: Teams',            'paaminn, last reminder=teams',    c_ch[8],  c_ch[8]  = 'paaminn, last reminder=teams'),
    (9,  'only without e-mail, has e-mail: e-mail',             'mangler, has e-mail=email',       c_ch[9],  c_ch[9]  = 'mangler, has e-mail=email'),
    (10, 'only without e-mail, object id only: Teams',          'mangler, object id only=teams',   c_ch[10], c_ch[10] = 'mangler, object id only=teams'),
    (11, 'no tenant bound: e-mail',                             'no tenant bound=email',           c_ch[11], c_ch[11] = 'no tenant bound=email'),
    (12, 'the round''s own rule wins over the organisation''s', 'round says reminders only=email', c_ch[12], c_ch[12] = 'round says reminders only=email'),
    (13, 'Teams before SMS when both would carry it',           'teams before sms=teams',          c_ch[13], c_ch[13] = 'teams before sms=teams'),
    (14, 'a link asked for goes the way it was asked',          'a link asked for=email',          c_ch[14], c_ch[14] = 'a link asked for=email'),
    (15, 'a role notice is e-mail with no Teams identity',      'email,0',                         coalesce(c_role, 'none'), c_role = 'email,0'),
    (16, 'the recipient carries whom to address, and the e-mail for the fallback', 'true,true,none,t2@teams-test.no',
         coalesce(c_rcpt, 'none'), c_rcpt = 'true,true,none,t2@teams-test.no'),
    (17, 'a kept conversation addresses the next message',     'teams,a:1conversation,https://smba.trafficmanager.net/emea/',
         coalesce(c_conv, 'none'), c_conv = 'teams,a:1conversation,https://smba.trafficmanager.net/emea/'),
    (18, 'quiet hours hold a Teams invitation',                 'true,0',                          coalesce(c_quiet, 'none'), c_quiet = 'true,0'),
    (19, 'an answered invitation is dropped',                   'answered_or_expired',             coalesce(c_answered, 'none'), c_answered = 'answered_or_expired'),
    (20, 'each send mints a new token, and only its hash is kept', 'true',                         coalesce(c_tokens, 'none'), c_tokens = 'true'),
    (21, 'done records teams',                                  'teams',                           coalesce(c_done, 'none'), c_done = 'teams'),
    (22, 'done without a channel records e-mail',               'email',                           coalesce(c_null, 'none'), c_null = 'email'),
    (23, 'done refuses an unknown channel and records nothing', 'refused,true',                    coalesce(c_unknown, 'none'), c_unknown = 'refused,true'),
    (24, 'the bot ignores an unknown tenant or person and a foreign service URL', 'false,false,invalid,0',
         coalesce(c_set_unknown, 'none'), c_set_unknown = 'false,false,invalid,0'),
    (25, 'an install keeps the conversation and clears the problem', 'true,a:inst,0',             coalesce(c_set, 'none'), c_set = 'true,a:inst,0'),
    (26, 'a removal forgets it and records the person as blocked', 'true,0,blocked',              coalesce(c_clear, 'none'), c_clear = 'true,0,blocked'),
    (27, 'the dispatcher records an unreachable person',        'true,invalid',                    coalesce(c_report, 'none'), c_report = 'true,invalid'),
    (28, 'and nothing but blocked or unreachable, on Microsoft''s host, for a personal row', 'invalid,invalid,not_personal',
         coalesce(c_report_bad, 'none'), c_report_bad = 'invalid,invalid,not_personal'),
    (29, 'a new object id forgets the conversation and the problem', '0,0',                       coalesce(c_objchange, 'none'), c_objchange = '0,0'),
    (30, 'unbinding the tenant forgets what the bot knew there', '0,0',                            coalesce(c_unbind, 'none'), c_unbind = '0,0'),
    (31, 'teams_status: counts for the daglig leder, null for the verneombud', 'true,true,2,true,true,true,null',
         coalesce(c_status, 'none'), c_status = 'true,true,2,true,true,true,null'),
    (32, 'the list of addresses to correct leaves Teams out',   '0',                               coalesce(c_list, 'none'), c_list = '0'),
    (37, 'a round''s Teams rule is fixed once it has opened',   'fixed',                           coalesce(c_fixed, 'none'), c_fixed = 'fixed');

  -- 33, 34: closed to clients
  select concat_ws(',',
           has_table_privilege('authenticated', 'app.teams_conversations', 'select')::text,
           has_table_privilege('anon', 'app.teams_conversations', 'select')::text,
           has_table_privilege('authenticated', 'app.outbox', 'select')::text,
           (select relrowsecurity from pg_class where oid = 'app.teams_conversations'::regclass)::text,
           (select count(*) from pg_policies where schemaname = 'app' and tablename = 'teams_conversations'))
    into v_txt;
  insert into public._tci values (33, 'no client may read teams_conversations or the outbox; RLS on, no policy',
    'false,false,false,true,0', v_txt, v_txt = 'false,false,false,true,0');
  select string_agg(f, ',' order by f) into v_txt from unnest(array[
    'public.teams_conversation_set(text,text,text,text)', 'public.teams_conversation_clear(text,text)',
    'public.teams_dispatch_result(uuid,text,text,text)', 'public.dispatch_done(uuid,boolean,text,boolean,text,text)',
    'public.dispatch_claim(integer)', 'app.dispatch_recipients(uuid)']) f
  where has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute')
     -- app.dispatch_recipients is called only inside the claim, so not even the service role holds it
     or (f <> 'app.dispatch_recipients(uuid)' and not has_function_privilege('service_role', f, 'execute'));
  insert into public._tci values (34, 'the bot''s and the dispatcher''s functions are the service role''s alone',
    'none', coalesce(v_txt, 'none'), v_txt is null);

  -- 35, 36: nothing about Teams can be joined to an answer
  select string_agg(c.table_name || '.' || c.column_name, ',' order by 1) into v_txt
  from information_schema.columns c
  where c.table_schema = 'app'
    and c.table_name in ('responses', 'answers', 'extra_answers', 'response_comments', 'not_relevant_answers',
                         'module_answers', 'module_segment_answers', 'module_not_relevant_answers', 'invitations')
    and c.column_name ~* '(entra|teams|object_id|aad|tenant|conversation)';
  insert into public._tci values (35, 'no answer table, nor invitations, has a column for a Teams identity',
    'none', coalesce(v_txt, 'none'), v_txt is null);
  select string_agg(conname, ',') into v_txt from pg_constraint
  where contype = 'f' and (
    (conrelid = 'app.teams_conversations'::regclass and confrelid not in ('app.employees'::regclass, 'app.organizations'::regclass))
    or (confrelid = 'app.teams_conversations'::regclass));
  insert into public._tci values (36, 'teams_conversations points only at the register, and nothing points at it',
    'none', coalesce(v_txt, 'none'), v_txt is null);

  -- 39: nothing reacts to an answer (growth_firewall_invariants 17): no trigger on invitations or
  -- an answer table reaches Teams, so a sent card is never edited, deleted or followed up on answering
  select string_agg(c.relname || '.' || t.tgname, ',') into v_txt
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
  join pg_proc p on p.oid = t.tgfoid
  where not t.tgisinternal and n.nspname = 'app'
    and c.relname in ('invitations', 'responses', 'answers', 'extra_answers', 'response_comments')
    and p.prosrc ~* '(teams|outbox)';
  select nullif(concat_ws('|', v_txt, (select string_agg(rule, ',') from app.growth_firewall()
                                       where rule = 'nothing_attached_to_answers' and not pass)), '') into v_txt;
  insert into public._tci values (39, 'nothing that reacts to an answer reaches Teams or the outbox',
    'none', coalesce(v_txt, 'none'), v_txt is null);

  insert into public._tci
  select 38, 'nothing from the test survives', '0', count(*)::text, count(*) = 0
  from (select id from app.organizations where id in (v_org, v_unb)
        union all select id from auth.users where id in (v_dl, v_vo)
        union all select employee_id from app.teams_conversations where org_id in (v_org, v_unb)) left_over;
end $$;

select seq, name, expected, actual, pass from public._tci order by seq;

do $$
declare v_failed text;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) into v_failed from public._tci where not pass;
  if v_failed is not null then
    raise exception 'teams channel invariants failed: %', v_failed;
  end if;
end $$;

drop table public._tci;
