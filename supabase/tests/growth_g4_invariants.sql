-- growth_g4_invariants.sql — Sentral › Growth G4 (0144, D-185), proved against the live schema:
-- Tools & lead magnets and Deliverability.
--
--   * the growth section's roles, with the second factor, and nobody else, on both reads; the
--     claim and the write for the roles that write in the CRM only (super_admin, marketing) (1)
--   * every read and the write are audited; the write names each stream's result (2)
--   * the magnets: the report's seven in its order, six planned — no public tool exists — and the
--     newsletter's status derived from its CRM list, not typed; a descriptive name is no row's,
--     and the newsletter is named by its list (3)
--   * no fabricated figure: a tool's completions and consent are null, never 0; double opt-in is
--     null with no confirmation sent, and confirmed of the contacts actually mailed (a held
--     request is not a sent mail) once there are some (4)
--   * the Krav-sjekk rules: the four, their thresholds and references, each with a «sist
--     kontrollert» date and marked guidance; a version's content is never changed (an update that
--     changes none of it passes), it is deleted only with its rule, and a new version is a new
--     rule-set version (5)
--   * the two streams as the dispatcher sends them: no-reply@orgpuls.com and hei@nyheter.orgpuls.com;
--     a marketing template can never be bound to the product's stream (6)
--   * the registry: every kind the database can queue — each outbox kind, each lifecycle step, each
--     CRM send kind, each CRM template, the invitation test and the ticket reply — has a row (7)
--   * the 7-day derivations: personal and per-person notices, trial mail matched to its events by
--     provider id, CRM sends by template; SMS not counted as mail, nor its report as the stream's
--     last event; Auth's count is null (8)
--   * the authentication check: claimed before its lookups, once a minute for everyone; recorded
--     once, by the admin who claimed it, within two minutes, for the stream's own domain and a
--     known level; the read shows the latest (9)
--   * the new tables are closed: RLS on, no policy, no grant to a client or the service role (10)
--   * nothing written here survives (11)
--   * a personal notice's 7-day count is withheld below k; the invitation tests are counted apart (12)
--   * a withheld notice's messages are in no aggregate either: a stream's volume, reported, delivered
--     and the rest do not move when one is sent, so no total less the rows shown gives it back; a
--     complaint is a delivered message, a deferred one is not yet reported (13)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/growth_g4_invariants.sql

create unlogged table if not exists public._g4(seq int, name text, expected text, actual text, pass bool);
truncate public._g4;

do $$
declare
  v_su   uuid := '00000000-0000-4000-8000-00000000f441';
  v_an   uuid := '00000000-0000-4000-8000-00000000f442';
  v_mk   uuid := '00000000-0000-4000-8000-00000000f443';
  v_ed   uuid := '00000000-0000-4000-8000-00000000f444';
  v_sp   uuid := '00000000-0000-4000-8000-00000000f445';
  v_fi   uuid := '00000000-0000-4000-8000-00000000f446';
  v_org  uuid := '00000000-0000-4000-8000-00000000f447';
  v_dl   uuid := '00000000-0000-4000-8000-00000000f448';
  v_c1   uuid := '00000000-0000-4000-8000-00000000f449';
  v_c2   uuid := '00000000-0000-4000-8000-00000000f44a';
  v_c3   uuid := '00000000-0000-4000-8000-00000000f44b';
  v_c4   uuid := '00000000-0000-4000-8000-00000000f44c';
  v_camp uuid;
  v_run  bigint;
  v_run2 bigint;
  v_sms  uuid;
  v_na   text := rtrim(repeat('not_allowed,', 15), ',');
  v_ob   uuid;
  v_list uuid;
  v_audit bigint;
  v_j    jsonb;
  v_k    jsonb;
  v_txt  text;
  v_err  text;
  v_rows jsonb := '[]';
  v_meas uuid;
  v_round uuid;
  v_b    int;
  v_j2   jsonb;
  claims constant text := '{"sub":"%s","role":"authenticated","aal":"%s"}';
  good constant jsonb := '[{"stream":"transactional","domain":"orgpuls.com","spf":"pass","dkim":"pass","dmarc":"warn","dmarc_policy":"none"},
                           {"stream":"marketing","domain":"nyheter.orgpuls.com","spf":"pass","dkim":"pass","dmarc":"pass","dmarc_policy":"quarantine"}]';
begin
  begin
    insert into auth.users (id, email) values (v_su, 'su@g4-probe.example'), (v_an, 'an@g4-probe.example'), (v_mk, 'mk@g4-probe.example'),
      (v_ed, 'ed@g4-probe.example'), (v_sp, 'sp@g4-probe.example'), (v_fi, 'fi@g4-probe.example'), (v_dl, 'dl@g4-probe.example');
    insert into app.platform_admins (user_id, role) values (v_su, 'super_admin'), (v_an, 'analyst'), (v_mk, 'marketing'),
      (v_ed, 'editor'), (v_sp, 'support'), (v_fi, 'finance');
    select coalesce(max(id), 0) into v_audit from app.admin_audit;
    -- the rate limit is global: an earlier real check must not decide this suite
    delete from app.mail_auth_checks;
    delete from app.mail_auth_runs;

    -- 1 -------------------------------------------------------------- the growth section's roles
    perform set_config('request.jwt.claims', format(claims, v_ed, 'aal2'), true);
    v_txt := concat_ws(',', public.admin_growth_magnets()->>'error', public.admin_growth_deliverability()->>'error',
                       public.admin_deliverability_claim()->>'error', public.admin_deliverability_check(1, good)->>'error');
    perform set_config('request.jwt.claims', format(claims, v_sp, 'aal2'), true);
    v_txt := concat_ws(',', v_txt, public.admin_growth_magnets()->>'error', public.admin_growth_deliverability()->>'error', public.admin_deliverability_claim()->>'error');
    perform set_config('request.jwt.claims', format(claims, v_fi, 'aal2'), true);
    v_txt := concat_ws(',', v_txt, public.admin_growth_magnets()->>'error', public.admin_growth_deliverability()->>'error');
    -- the right role without its second factor
    perform set_config('request.jwt.claims', format(claims, v_mk, 'aal1'), true);
    v_txt := concat_ws(',', v_txt, public.admin_growth_magnets()->>'error', public.admin_growth_deliverability()->>'error', public.admin_deliverability_claim()->>'error');
    -- a product user
    perform set_config('request.jwt.claims', format(claims, v_dl, 'aal2'), true);
    v_txt := concat_ws(',', v_txt, public.admin_growth_deliverability()->>'error');
    -- the analyst reads, and writes nothing (read-only everywhere in the CRM)
    perform set_config('request.jwt.claims', format(claims, v_an, 'aal2'), true);
    v_txt := concat_ws(',', v_txt, public.admin_deliverability_claim()->>'error', public.admin_deliverability_check(1, good)->>'error');
    v_txt := concat_ws('|', v_txt, public.admin_growth_magnets()->>'ok', public.admin_growth_deliverability()->>'ok');
    perform set_config('request.jwt.claims', format(claims, v_su, 'aal2'), true);
    v_txt := concat_ws('|', v_txt, public.admin_growth_magnets()->>'ok', public.admin_growth_deliverability()->>'ok');
    perform set_config('request.jwt.claims', format(claims, v_mk, 'aal2'), true);
    v_run := (public.admin_deliverability_claim()->>'run')::bigint;
    v_txt := concat_ws('|', v_txt, public.admin_growth_magnets()->>'ok', public.admin_growth_deliverability()->>'ok', (v_run is not null)::text,
                       public.admin_deliverability_check(v_run, good)->>'ok');
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'reads for super_admin, analyst and marketing with the second factor; the check for super_admin and marketing only',
      'expected', v_na || '|true|true|true|true|true|true|true|true',
      'actual', v_txt, 'pass', v_txt = v_na || '|true|true|true|true|true|true|true|true');

    -- 2 -------------------------------------------------------------- audited
    select concat_ws(',',
      (select count(*) from app.admin_audit where id > v_audit and action = 'growth.magnets_view'),
      (select count(*) from app.admin_audit where id > v_audit and action = 'growth.deliverability_view'),
      (select count(*) from app.admin_audit where id > v_audit and action = 'deliverability.auth_check' and admin_id = v_mk
         and (detail->>'run')::bigint = v_run
         and detail->'results' @> '[{"stream":"transactional","dmarc":"warn","dmarc_policy":"none"},{"stream":"marketing","dmarc":"pass"}]'),
      -- the claim is audited when it is made, before any lookup, whether or not a record follows
      (select count(*) from app.admin_audit where id > v_audit and action = 'deliverability.auth_claim' and admin_id = v_mk
         and target_type = 'mail_auth_runs' and target_id = v_run::text),
      -- a refused call writes nothing
      (select count(*) from app.admin_audit where id > v_audit and admin_id in (v_ed, v_sp, v_fi)))
    into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'every read, the claim and the write are audited; a refusal is not',
      'expected', '3,3,1,1,0', 'actual', v_txt, 'pass', v_txt = '3,3,1,1,0');

    -- 3 -------------------------------------------------------------- the magnets, true status
    perform set_config('request.jwt.claims', format(claims, v_su, 'aal2'), true);
    v_j := public.admin_growth_magnets();
    select string_agg(x->>'rank' || ':' || (x->>'key') || ':' || (x->>'status') || ':' || (x->>'derived'), ',' order by (x->>'rank')::int)
      into v_txt from jsonb_array_elements(v_j->'magnets') x;
    -- a descriptive name is a message, not a row's; the newsletter is named by its CRM list
    v_txt := v_txt || '|' || (select string_agg(x->>'key', ',' order by (x->>'rank')::int) from jsonb_array_elements(v_j->'magnets') x where x->'name' = 'null'::jsonb)
                   || ':' || (select x->>'list_name' from jsonb_array_elements(v_j->'magnets') x where x->>'key' = 'nyhetsbrev');
    update app.crm_lists set archived_at = now() where product_id = 'orgpuls' and key = 'nyhetsbrev';
    v_txt := v_txt || '|' || (select x->>'status' from jsonb_array_elements(public.admin_growth_magnets()->'magnets') x where x->>'key' = 'nyhetsbrev');
    update app.crm_lists set archived_at = null where product_id = 'orgpuls' and key = 'nyhetsbrev';
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'the report''s seven in order, six planned, the newsletter live only while its list is',
      'expected', '1:krav_sjekk:planned:false,2:risiko_sjekk:planned:false,3:dokumentasjonspakke:planned:false,4:sykefravaer:planned:false,'
                  || '5:arshjul:planned:false,6:bransjeguider:planned:false,7:nyhetsbrev:live:true|bransjeguider,nyhetsbrev:Nyhetsbrevet|planned',
      'actual', v_txt,
      'pass', v_txt = '1:krav_sjekk:planned:false,2:risiko_sjekk:planned:false,3:dokumentasjonspakke:planned:false,4:sykefravaer:planned:false,'
                  || '5:arshjul:planned:false,6:bransjeguider:planned:false,7:nyhetsbrev:live:true|bransjeguider,nyhetsbrev:Nyhetsbrevet|planned');

    -- 4 -------------------------------------------------------------- no fabricated figure
    -- counted as deltas: the local database may hold other contacts
    v_k := jsonb_build_object('sent', v_j->'doi'->'sent', 'confirmed', v_j->'doi'->'confirmed',
             'list', (select x->'doi' from jsonb_array_elements(v_j->'magnets') x where x->>'key' = 'nyhetsbrev'));
    select id into v_list from app.crm_lists where product_id = 'orgpuls' and key = 'nyhetsbrev';
    insert into app.crm_contacts (id, email, name, source, basis, status, consent_at, consent_source, optin_sent_at, optin_hash)
    values (v_c1, 'c1@g4-probe.example', 'C1', 'newsletter', 'consent', 'active', now() - interval '1 day', 'double opt-in (newsletter)', now() - interval '1 day 1 hour', null),
           (v_c2, 'c2@g4-probe.example', 'C2', 'newsletter', 'none', 'pending', null, null, now() - interval '2 days', repeat('a', 64)),
           (v_c3, 'c3@g4-probe.example', 'C3', 'newsletter', 'consent', 'active', now() - interval '200 days', 'double opt-in (newsletter)', now() - interval '200 days', null),
           (v_c4, 'c4@g4-probe.example', 'C4', 'newsletter', 'none', 'pending', null, null, now() - interval '1 day', repeat('d', 64));
    -- what was mailed: c1 confirmed after its mail, c2 not yet, c3 before the 90 days; c4's request
    -- was held, so no mail went out and it is not counted
    insert into app.crm_sends (kind, contact_id, to_email, status, sent_at)
    values ('optin', v_c1, 'c1@g4-probe.example', 'sent', now() - interval '1 day 1 hour'),
           ('optin', v_c2, 'c2@g4-probe.example', 'sent', now() - interval '2 days'),
           ('optin', v_c3, 'c3@g4-probe.example', 'sent', now() - interval '200 days'),
           ('optin', v_c4, 'c4@g4-probe.example', 'held', null);
    insert into app.crm_list_members (list_id, contact_id, status, source, subscribed_at)
    values (v_list, v_c1, 'subscribed', 'newsletter', now()), (v_list, v_c2, 'pending', 'newsletter', null);
    v_j := public.admin_growth_magnets();
    select concat_ws(',',
      -- every tool: null completions and no consent measure
      (select count(*) from jsonb_array_elements(v_j->'magnets') x where x->>'kind' <> 'newsletter' and x->'completions' = 'null'::jsonb and x->'doi' = 'null'::jsonb),
      ((v_j->'doi'->>'sent')::int - (v_k->>'sent')::int),
      ((v_j->'doi'->>'confirmed')::int - (v_k->>'confirmed')::int),
      (select ((x->'doi'->>'sent')::int - (v_k->'list'->>'sent')::int) || '/' || ((x->'doi'->>'confirmed')::int - (v_k->'list'->>'confirmed')::int)
         from jsonb_array_elements(v_j->'magnets') x where x->>'key' = 'nyhetsbrev'),
      (select x->>'completions' from jsonb_array_elements(v_j->'magnets') x where x->>'key' = 'nyhetsbrev')::int
        - (select count(*) from app.crm_list_members m where m.list_id = v_list and m.status = 'subscribed')::int)
    into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'tools record nothing (null, never 0); double opt-in is confirmed of the contacts mailed in 90 days',
      'expected', '6,2,1,2/1,0', 'actual', v_txt, 'pass', v_txt = '6,2,1,2/1,0');

    -- 5 -------------------------------------------------------------- the Krav-sjekk rules, versioned
    select string_agg(concat_ws(':', x->>'key', x->>'version', coalesce(x->>'threshold', '-'), coalesce(x->>'on_demand_from', '-'),
                                x->>'reference', (x->>'checked_on' is not null)::text, x->>'guidance'), ',' order by ord)
      into v_txt from jsonb_array_elements(v_j->'rules') with ordinality as a(x, ord);
    v_txt := v_txt || '|' || (v_j->>'ruleset_version');
    begin
      update app.growth_krav_rule_versions set threshold = 10 where rule_key = 'verneombud';
      v_err := 'updated';
    exception when others then v_err := 'refused';
    end;
    v_txt := v_txt || '|' || v_err;
    -- an update that changes no content passes (the guard compares, it does not refuse by kind)
    begin
      update app.growth_krav_rule_versions set threshold = threshold where rule_key = 'verneombud';
      v_err := 'passed';
    exception when others then v_err := 'refused';
    end;
    v_txt := v_txt || ',' || v_err;
    begin
      delete from app.growth_krav_rule_versions where rule_key = 'amu';
      v_err := 'deleted';
    exception when others then v_err := 'refused';
    end;
    v_txt := v_txt || ',' || v_err;
    insert into app.growth_krav_rule_versions (rule_key, version, threshold, reference, checked_on, checked_against, guidance_only)
    values ('verneombud', 2, 5, 'arbeidsmiljøloven § 6-1', current_date, 'Lovdata', true);
    v_j := public.admin_growth_magnets();
    v_txt := v_txt || ',' || (select x->>'version' from jsonb_array_elements(v_j->'rules') x where x->>'key' = 'verneombud') || ',' || (v_j->>'ruleset_version');
    -- a rule goes with its versions (the guard lets the cascade through)
    delete from app.growth_krav_rules where key = 'bht';
    v_txt := v_txt || ',' || (select count(*) from app.growth_krav_rule_versions where rule_key = 'bht');
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'four rules with their thresholds, references, checked dates and guidance; versions are append-only',
      'expected', 'verneombud:1:5:-:arbeidsmiljøloven § 6-1:true:true,amu:1:30:10:arbeidsmiljøloven § 7-1:true:true,'
                  || 'bht:1:-:-:forskrift 2011-12-06-1355 § 13-1:true:true,wording_4_3:1:-:-:arbeidsmiljøloven § 4-3:true:true|1|refused,passed,refused,2,2,0',
      'actual', v_txt,
      'pass', v_txt = 'verneombud:1:5:-:arbeidsmiljøloven § 6-1:true:true,amu:1:30:10:arbeidsmiljøloven § 7-1:true:true,'
                  || 'bht:1:-:-:forskrift 2011-12-06-1355 § 13-1:true:true,wording_4_3:1:-:-:arbeidsmiljøloven § 4-3:true:true|1|refused,passed,refused,2,2,0');

    -- 6 -------------------------------------------------------------- the streams
    v_j := public.admin_growth_deliverability();
    select string_agg((x->>'key') || '=' || (x->>'sender') || '@' || (x->>'domain'), ',' order by ord) into v_txt
      from jsonb_array_elements(v_j->'streams') with ordinality as a(x, ord);
    begin
      insert into app.mail_templates (key, source, ref, classification, stream, locales, sort) values ('crm.probe', 'crm', 'probe', 'marketing', 'transactional', '{no}', 9999);
      v_err := 'accepted';
    exception when check_violation then v_err := 'refused';
    end;
    v_txt := v_txt || '|' || v_err || '|' || (public.admin_growth_magnets()->>'marketing_domain');
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'two streams as the dispatcher sends them; marketing is never on the product''s stream',
      'expected', 'transactional=no-reply@orgpuls.com@orgpuls.com,marketing=hei@nyheter.orgpuls.com@nyheter.orgpuls.com|refused|nyheter.orgpuls.com',
      'actual', v_txt,
      'pass', v_txt = 'transactional=no-reply@orgpuls.com@orgpuls.com,marketing=hei@nyheter.orgpuls.com@nyheter.orgpuls.com|refused|nyheter.orgpuls.com');

    -- 7 -------------------------------------------------------------- every kind has a registry row
    select concat_ws(',',
      (select count(*) from unnest(enum_range(null::app.outbox_kind)) k
        where not exists (select 1 from app.mail_templates t where t.source = 'notice' and t.ref = k::text)),
      (select count(*) from regexp_matches((select pg_get_constraintdef(c.oid) from pg_constraint c
                                            where c.conrelid = 'app.lifecycle_mail'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%(step = ANY%'), '''([a-z_]+)''', 'g') s
        where not exists (select 1 from app.mail_templates t where t.source = 'lifecycle' and t.ref = s[1])),
      (select count(*) from regexp_matches((select pg_get_constraintdef(c.oid) from pg_constraint c
                                            where c.conrelid = 'app.crm_sends'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%(kind = ANY%'), '''([a-z_]+)''', 'g') s
        where not exists (select 1 from app.mail_templates t where t.source = 'crm' and t.ref = s[1])),
      (select count(*) from app.crm_templates c where not exists (select 1 from app.mail_templates t where t.key = 'crm.' || c.key and t.ref = 'template:' || c.key)),
      (select count(*) from app.mail_templates where key in ('notice.test', 'ticket.reply')),
      (select count(*) from app.mail_templates where source = 'auth'),
      (select count(*) from app.mail_templates where classification = 'marketing' and stream <> 'marketing'))
    into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'every outbox kind, lifecycle step, CRM send kind and CRM template has a registry row',
      'expected', '0,0,0,0,2,4,0', 'actual', v_txt, 'pass', v_txt = '0,0,0,0,2,4,0');

    -- 8 -------------------------------------------------------------- the 7-day derivations
    perform set_config('request.jwt.claims', '', true);
    v_k := v_j;  -- the baseline, from row 6
    insert into app.organizations (id, name, org_number, employee_count, mail_enabled) values (v_org, 'G4 probe AS', '999000441', 9, false);
    insert into app.profiles (id, full_name) values (v_dl, 'Dina');
    -- a notice as one message on e-mail, delivered; one on SMS, not mail
    insert into app.outbox (org_id, kind, audience, due_at, sent_at, channel, provider_id, delivery, delivery_at)
    values (v_org, 'evaluering', 'daglig_leder', now() - interval '1 day', now() - interval '1 day', 'email', '<g4-1@probe>', 'delivered', now());
    insert into app.outbox (org_id, kind, audience, due_at, sent_at, channel, provider_id, delivery, delivery_at)
    values (v_org, 'evaluering', 'daglig_leder', now() - interval '1 day', now() - interval '1 day', 'sms', 'g4-sms', 'delivered', now())
    returning id into v_sms;
    -- the SMS's report, and a report matched to nothing, arrive after every e-mail event: neither is
    -- the transactional stream's last event
    insert into app.mail_events (received_at, at, event, message_id, outbox_id, org_id)
    values (now() + interval '1 hour', now(), 'delivered', 'g4-sms', v_sms, v_org),
           (now() + interval '2 hours', now(), 'delivered', 'g4-nomatch', null, null);
    -- a notice to a role, a message per person: one spam, one with no event yet
    insert into app.outbox (org_id, kind, audience, due_at, sent_at, channel)
    values (v_org, 'tiltak_forfalt', 'avdelingsledere', now() - interval '1 day', now() - interval '1 day', 'email')
    returning id into v_ob;
    insert into app.outbox_recipients (outbox_id, address_key, masked, provider_id, sent_at, delivery, delivery_at)
    values (v_ob, sha256('g4-a'::bytea), 'a***', 'g4-r1', now() - interval '1 day', 'spam', now()), (v_ob, sha256('g4-b'::bytea), 'b***', 'g4-r2', now() - interval '1 day', null, null);
    -- trial mail: its hard bounce is found in mail_events by its provider id
    insert into app.lifecycle_mail (org_id, user_id, step, status, sent_at, provider_id) values (v_org, v_dl, 'welcome', 'sent', now() - interval '2 days', '<g4-life@probe>');
    insert into app.mail_events (at, event, message_id) values (now() - interval '1 day', 'hard_bounce', 'g4-life@probe');
    -- a campaign from the «lovkrav» template, delivered, and a confirmation mail not yet reported
    insert into app.crm_campaigns (name, kind, lang, subject, template_key, utm_campaign) values ('G4 probe', 'campaign', 'no', 'Probe', 'lovkrav', 'g4-probe') returning id into v_camp;
    insert into app.crm_sends (kind, campaign_id, contact_id, to_email, status, sent_at, delivery, delivery_at, unsub_hash)
    values ('campaign', v_camp, v_c1, 'c1@g4-probe.example', 'sent', now() - interval '1 day', 'delivered', now(), repeat('b', 64)),
           ('optin', null, v_c2, 'c2@g4-probe.example', 'sent', now() - interval '1 day', null, null, repeat('c', 64));
    perform set_config('request.jwt.claims', format(claims, v_su, 'aal2'), true);
    v_j := public.admin_growth_deliverability();
    select concat_ws(',',
      -- transactional: +4 messages (the e-mail notice, the two role recipients, the trial mail); the SMS is not mail
      (select (a->>'sent')::int - (b->>'sent')::int from jsonb_array_elements(v_j->'streams') a, jsonb_array_elements(v_k->'streams') b
        where a->>'key' = 'transactional' and b->>'key' = 'transactional'),
      (select (a->>'reported')::int - (b->>'reported')::int from jsonb_array_elements(v_j->'streams') a, jsonb_array_elements(v_k->'streams') b
        where a->>'key' = 'transactional' and b->>'key' = 'transactional'),
      (select (a->>'spam')::int - (b->>'spam')::int from jsonb_array_elements(v_j->'streams') a, jsonb_array_elements(v_k->'streams') b
        where a->>'key' = 'transactional' and b->>'key' = 'transactional'),
      (select (a->>'hard_bounces')::int - (b->>'hard_bounces')::int from jsonb_array_elements(v_j->'streams') a, jsonb_array_elements(v_k->'streams') b
        where a->>'key' = 'transactional' and b->>'key' = 'transactional'),
      (select (a->>'sent')::int - (b->>'sent')::int || '/' || ((a->>'delivered')::int - (b->>'delivered')::int)
         from jsonb_array_elements(v_j->'streams') a, jsonb_array_elements(v_k->'streams') b where a->>'key' = 'marketing' and b->>'key' = 'marketing'),
      (select (a->>'sent')::int - (b->>'sent')::int from jsonb_array_elements(v_j->'templates') a, jsonb_array_elements(v_k->'templates') b
        where a->>'key' = 'crm.lovkrav' and b->>'key' = 'crm.lovkrav'),
      (select (a->>'sent')::int - (b->>'sent')::int from jsonb_array_elements(v_j->'templates') a, jsonb_array_elements(v_k->'templates') b
        where a->>'key' = 'notice.evaluering' and b->>'key' = 'notice.evaluering'),
      (select (a->>'sent')::int - (b->>'sent')::int from jsonb_array_elements(v_j->'templates') a, jsonb_array_elements(v_k->'templates') b
        where a->>'key' = 'notice.tiltak_forfalt' and b->>'key' = 'notice.tiltak_forfalt'),
      (select count(*) from jsonb_array_elements(v_j->'templates') a where a->>'source' = 'auth' and a->'sent' = 'null'::jsonb),
      -- the stream's last event is the trial mail's (received now), not the later SMS or unmatched one
      (select (x->>'last_event_at')::timestamptz = now() from jsonb_array_elements(v_j->'streams') x where x->>'key' = 'transactional'))
    into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'seven days per stream and template from what records each send; SMS is neither mail nor its last event; Auth has no count',
      'expected', '4,3,1,1,2/1,1,1,2,4,t', 'actual', v_txt, 'pass', v_txt = '4,3,1,1,2/1,1,1,2,4,t');

    -- 12 ------------------------------------------------------------- a personal notice below k
    select concat_ws(',',
      coalesce(app.mail_template_count('notice.paminnelse', 3)::text, 'withheld'),
      app.mail_template_count('notice.siste_paminnelse', 5),
      app.mail_template_count('notice.invitasjon', 0),
      coalesce(app.mail_template_count('notice.lenke', 1)::text, 'withheld'),
      -- a notice to a role counts no respondent: its 1 is shown
      app.mail_template_count('notice.evaluering', 1),
      -- the read applies the rule to every personal kind, and says when it withheld
      (select count(*) from jsonb_array_elements(v_j->'templates') a
        cross join lateral (select app.mail_template_count(a->>'key', (select count(*) from app.mail_sent_7d() m where m.template = a->>'key')) as n) r
        where a->>'key' in ('notice.invitasjon', 'notice.paminnelse', 'notice.siste_paminnelse', 'notice.lenke')
          and coalesce(a->>'sent', '-') = coalesce(r.n::text, '-') and (a->>'withheld')::boolean = (r.n is null)),
      -- the invitation tests, never reported, are counted apart
      (select (x->>'tests')::int = (select count(*) from app.mail_sent_7d() m where m.template = 'notice.test')
         from jsonb_array_elements(v_j->'streams') x where x->>'key' = 'transactional'))
    into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'a personal notice''s count is withheld below k; the invitation tests are counted apart',
      'expected', 'withheld,5,0,withheld,1,4,t', 'actual', v_txt, 'pass', v_txt = 'withheld,5,0,withheld,1,4,t');

    -- 13 ------------------------------------------------------------- withheld from every aggregate
    -- two last reminders, to two people who have not answered, delivered: below k their count is
    -- withheld, and the stream's figures must not move either, or its total less the rows shown
    -- would give the two back (review of 883bcd4)
    perform set_config('request.jwt.claims', '', true);
    select count(*) into v_b from app.mail_sent_7d() m where m.template = 'notice.siste_paminnelse';
    insert into app.measurements (org_id, kind, year, label) values (v_org, 'grunnlinje', 2026, 'G4 probe') returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'apen', now() - interval '3 days', now() + interval '4 days') returning id into v_round;
    with e as (
      insert into app.employees (org_id, full_name, email) values (v_org, 'E1', 'e1@g4-probe.example'), (v_org, 'E2', 'e2@g4-probe.example') returning id)
    insert into app.outbox (org_id, round_id, kind, employee_id, due_at, sent_at, channel, provider_id, delivery, delivery_at)
    select v_org, v_round, 'siste_paminnelse', e.id, now() - interval '1 day', now() - interval '1 day', 'email', 'g4-sp-' || e.id, 'delivered', now()
    from e;
    -- and two campaign mails: one complained about after delivery, one deferred (still in flight)
    insert into app.crm_sends (kind, campaign_id, contact_id, to_email, status, sent_at, delivery, delivery_at, unsub_hash)
    values ('campaign', v_camp, v_c3, 'c3@g4-probe.example', 'sent', now() - interval '1 day', 'spam', now(), repeat('e', 64)),
           ('campaign', v_camp, v_c4, 'c4@g4-probe.example', 'sent', now() - interval '1 day', 'deferred', now(), repeat('f', 64));
    -- read as the analyst, the growth role that writes nothing
    perform set_config('request.jwt.claims', format(claims, v_an, 'aal2'), true);
    v_j2 := public.admin_growth_deliverability();
    select concat_ws(',',
      -- the probe is below k (true on any database without two recent last reminders of its own)
      (v_b + 2 between 1 and app.k_min() - 1)::text,
      (select coalesce(a->>'sent', 'null') || '/' || (a->>'withheld') from jsonb_array_elements(v_j2->'templates') a where a->>'key' = 'notice.siste_paminnelse'),
      (select a->>'withheld' from jsonb_array_elements(v_j2->'streams') a where a->>'key' = 'transactional'),
      -- the transactional stream's figures did not move
      (select concat_ws('/', (a->>'sent')::int - (b->>'sent')::int, (a->>'reported')::int - (b->>'reported')::int,
                             (a->>'delivered')::int - (b->>'delivered')::int, (a->>'tests')::int - (b->>'tests')::int)
         from jsonb_array_elements(v_j2->'streams') a, jsonb_array_elements(v_j->'streams') b
        where a->>'key' = 'transactional' and b->>'key' = 'transactional'),
      -- on every stream, the total is exactly the rows shown (and the mail of no registry row): the
      -- total less the rows shown reveals nothing
      (select count(*) from jsonb_array_elements(v_j2->'streams') st
        where (st->>'sent')::int
              - (select coalesce(sum((t->>'sent')::int), 0) from jsonb_array_elements(v_j2->'templates') t where t->>'stream' = st->>'key')
              - (select count(*) from app.mail_sent_7d() m where m.stream = st->>'key' and not exists (select 1 from app.mail_templates r where r.key = m.template))
              = 0),
      -- marketing: +2 sent, +1 reported (the deferred one is not), +1 delivered (the complaint is), +1 spam
      (select concat_ws('/', (a->>'sent')::int - (b->>'sent')::int, (a->>'reported')::int - (b->>'reported')::int,
                             (a->>'delivered')::int - (b->>'delivered')::int, (a->>'spam')::int - (b->>'spam')::int)
         from jsonb_array_elements(v_j2->'streams') a, jsonb_array_elements(v_j->'streams') b
        where a->>'key' = 'marketing' and b->>'key' = 'marketing'))
    into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 13, 'name', 'a withheld notice is in no aggregate, so no total less the rows shown gives it back; a complaint is delivered, a deferred mail not yet reported',
      'expected', 'true,null/true,true,0/0/0/0,2,2/1/1/1', 'actual', v_txt, 'pass', v_txt = 'true,null/true,true,0/0/0/0,2,2/1/1/1');

    -- 9 -------------------------------------------------------------- the authentication check
    delete from app.mail_auth_checks;
    delete from app.mail_auth_runs;
    perform set_config('request.jwt.claims', format(claims, v_mk, 'aal2'), true);
    v_run := (public.admin_deliverability_claim()->>'run')::bigint;
    v_txt := concat_ws(',',
      public.admin_deliverability_check(v_run, '[{"stream":"marketing","domain":"evil.example","spf":"pass","dkim":"pass","dmarc":"pass"}]')->>'error',
      public.admin_deliverability_check(v_run, '[{"stream":"marketing","domain":"nyheter.orgpuls.com","spf":"great","dkim":"pass","dmarc":"pass"}]')->>'error',
      public.admin_deliverability_check(v_run, '[{"stream":"marketing","domain":"nyheter.orgpuls.com","spf":"pass","dkim":"pass","dmarc":"pass"},{"stream":"marketing","domain":"nyheter.orgpuls.com","spf":"pass","dkim":"pass","dmarc":"pass"}]')->>'error',
      public.admin_deliverability_check(v_run, '{"stream":"marketing"}')->>'error',
      (select count(*) from app.mail_auth_checks),
      -- a run that was never claimed
      public.admin_deliverability_check(v_run + 1000, good)->>'error');
    -- another admin cannot record this admin's run
    perform set_config('request.jwt.claims', format(claims, v_su, 'aal2'), true);
    v_txt := concat_ws(',', v_txt, public.admin_deliverability_check(v_run, good)->>'error',
      -- one claim a minute, for everyone, before any lookup goes out
      public.admin_deliverability_claim()->>'error');
    perform set_config('request.jwt.claims', format(claims, v_mk, 'aal2'), true);
    v_txt := concat_ws(',', v_txt,
      public.admin_deliverability_check(v_run, good)->>'recorded',
      -- a run is recorded once
      public.admin_deliverability_check(v_run, good)->>'error',
      public.admin_deliverability_claim()->>'error');
    -- a claim not recorded within two minutes has expired
    update app.mail_auth_runs set claimed_at = claimed_at - interval '5 minutes', recorded_at = recorded_at - interval '5 minutes';
    perform set_config('request.jwt.claims', format(claims, v_su, 'aal2'), true);
    v_run2 := (public.admin_deliverability_claim()->>'run')::bigint;
    update app.mail_auth_runs set claimed_at = claimed_at - interval '3 minutes' where id = v_run2;
    v_txt := concat_ws(',', v_txt, (v_run2 is not null)::text, public.admin_deliverability_check(v_run2, good)->>'error');
    v_j := public.admin_growth_deliverability();
    v_txt := v_txt || '|' || (select string_agg((x->>'key') || ':' || (x->'check'->>'domain') || ':' || (x->'check'->>'dmarc') || ':' || coalesce(x->'check'->>'dmarc_policy', '-'), ',')
                               from jsonb_array_elements(v_j->'streams') x);
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'the check is claimed once a minute and recorded once, by its claimant, within two minutes, for its stream''s domain and known levels',
      'expected', 'invalid,invalid,invalid,invalid,0,invalid,invalid,too_soon,2,invalid,too_soon,true,invalid|transactional:orgpuls.com:warn:none,marketing:nyheter.orgpuls.com:pass:quarantine',
      'actual', v_txt,
      'pass', v_txt = 'invalid,invalid,invalid,invalid,0,invalid,invalid,too_soon,2,invalid,too_soon,true,invalid|transactional:orgpuls.com:warn:none,marketing:nyheter.orgpuls.com:pass:quarantine');

    raise exception 'rollback';
  exception when others then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 10 --------------------------------------------------------------- the tables are closed
  select concat_ws(',',
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'app' and c.relname in ('growth_magnets', 'growth_krav_rules', 'growth_krav_rule_versions', 'mail_streams', 'mail_templates', 'mail_auth_runs', 'mail_auth_checks')
        and c.relrowsecurity),
    (select count(*) from pg_policies where schemaname = 'app'
      and tablename in ('growth_magnets', 'growth_krav_rules', 'growth_krav_rule_versions', 'mail_streams', 'mail_templates', 'mail_auth_runs', 'mail_auth_checks')),
    (select count(*) from (values ('anon'), ('authenticated'), ('service_role')) r(role)
      cross join (values ('app.growth_magnets'), ('app.growth_krav_rules'), ('app.growth_krav_rule_versions'), ('app.mail_streams'),
                         ('app.mail_templates'), ('app.mail_auth_runs'), ('app.mail_auth_checks')) t(tbl)
      where has_table_privilege(r.role, t.tbl, 'select,insert,update,delete')
         or has_any_column_privilege(r.role, t.tbl, 'select,insert,update')),
    (select count(*) from (values ('anon'), ('authenticated')) r(role)
      where has_function_privilege(r.role, 'app.growth_doi(text)', 'execute') or has_function_privilege(r.role, 'app.mail_sent_7d()', 'execute')
         or has_function_privilege(r.role, 'app.mail_template_count(text, bigint)', 'execute')),
    has_function_privilege('anon', 'public.admin_deliverability_check(bigint, jsonb)', 'execute'),
    has_function_privilege('anon', 'public.admin_deliverability_claim()', 'execute'))
  into v_txt;
  v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'the seven tables have RLS, no policy and no grant; the helpers, the claim and the write are not anon''s',
    'expected', '7,0,0,0,f,f', 'actual', v_txt, 'pass', v_txt = '7,0,0,0,f,f');

  -- 11 --------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id::text from auth.users where email like '%@g4-probe.example'
    union all select id::text from app.organizations where id = v_org
    union all select id::text from app.crm_contacts where email like '%@g4-probe.example'
    union all select id::text from app.mail_events where message_id like 'g4-%'
    union all select key from app.mail_templates where key = 'crm.probe'
    union all select rule_key from app.growth_krav_rule_versions where version > 1 and checked_on = current_date and rule_key = 'verneombud'
    union all select id::text from app.admin_audit where admin_email like '%@g4-probe.example'
    union all select id::text from app.employees where email like '%@g4-probe.example') x;
  v_txt := v_txt || ',' || (select count(*) from app.growth_krav_rules) || ',' || (select count(*) from app.growth_magnets);
  v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'every probe row was rolled back', 'expected', '0,4,7', 'actual', v_txt, 'pass', v_txt = '0,4,7');

  insert into public._g4
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._g4 order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._g4;
  if v_failed is not null then raise exception 'growth G4 invariants failed: %', v_failed; end if;
  if v_count <> 13 then raise exception 'growth G4 invariants: expected 13 rows, got %', v_count; end if;
end $$;
