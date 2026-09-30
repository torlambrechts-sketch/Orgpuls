-- growth_g4_invariants.sql — Sentral › Growth G4 (0144, D-185), proved against the live schema:
-- Tools & lead magnets and Deliverability.
--
--   * the growth section's roles, with the second factor, and nobody else, on both reads and the
--     one write (1)
--   * every read and the write are audited; the write names each stream's result (2)
--   * the magnets: the report's seven in its order, six planned — no public tool exists — and the
--     newsletter's status derived from its CRM list, not typed (3)
--   * no fabricated figure: a tool's completions and consent are null, never 0; double opt-in is
--     null with no confirmation sent, and confirmed of sent once there are some (4)
--   * the Krav-sjekk rules: the four, their thresholds and references, each with a «sist
--     kontrollert» date and marked guidance; a version is never edited, is deleted only with its
--     rule, and a new version is a new rule-set version (5)
--   * the two streams as the dispatcher sends them: no-reply@orgpuls.com and hei@nyheter.orgpuls.com;
--     a marketing template can never be bound to the product's stream (6)
--   * the registry: every kind the database can queue — each outbox kind, each lifecycle step, each
--     CRM send kind, each CRM template, the invitation test and the ticket reply — has a row (7)
--   * the 7-day derivations: personal and per-person notices, trial mail matched to its events by
--     provider id, CRM sends by template; SMS not counted as mail; a stream with sends and no event
--     reports none; Auth's count is null (8)
--   * the authentication check records only the stream's own domain and a known level, once a
--     minute, and the read shows the latest (9)
--   * the new tables are closed: RLS on, no policy, no grant to a client or the service role (10)
--   * nothing written here survives (11)
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
  v_camp uuid;
  v_ob   uuid;
  v_list uuid;
  v_audit bigint;
  v_j    jsonb;
  v_k    jsonb;
  v_txt  text;
  v_err  text;
  v_rows jsonb := '[]';
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

    -- 1 -------------------------------------------------------------- the growth section's roles
    perform set_config('request.jwt.claims', format(claims, v_ed, 'aal2'), true);
    v_txt := concat_ws(',', public.admin_growth_magnets()->>'error', public.admin_growth_deliverability()->>'error', public.admin_deliverability_check(good)->>'error');
    perform set_config('request.jwt.claims', format(claims, v_sp, 'aal2'), true);
    v_txt := concat_ws(',', v_txt, public.admin_growth_magnets()->>'error', public.admin_growth_deliverability()->>'error', public.admin_deliverability_check(good)->>'error');
    perform set_config('request.jwt.claims', format(claims, v_fi, 'aal2'), true);
    v_txt := concat_ws(',', v_txt, public.admin_growth_magnets()->>'error', public.admin_growth_deliverability()->>'error');
    -- the right role without its second factor
    perform set_config('request.jwt.claims', format(claims, v_mk, 'aal1'), true);
    v_txt := concat_ws(',', v_txt, public.admin_growth_magnets()->>'error', public.admin_growth_deliverability()->>'error', public.admin_deliverability_check(good)->>'error');
    -- a product user
    perform set_config('request.jwt.claims', format(claims, v_dl, 'aal2'), true);
    v_txt := concat_ws(',', v_txt, public.admin_growth_deliverability()->>'error');
    perform set_config('request.jwt.claims', format(claims, v_an, 'aal2'), true);
    v_txt := concat_ws('|', v_txt, public.admin_growth_magnets()->>'ok', public.admin_growth_deliverability()->>'ok');
    perform set_config('request.jwt.claims', format(claims, v_su, 'aal2'), true);
    v_txt := concat_ws('|', v_txt, public.admin_growth_magnets()->>'ok', public.admin_growth_deliverability()->>'ok');
    perform set_config('request.jwt.claims', format(claims, v_mk, 'aal2'), true);
    v_txt := concat_ws('|', v_txt, public.admin_growth_magnets()->>'ok', public.admin_growth_deliverability()->>'ok', public.admin_deliverability_check(good)->>'ok');
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'super_admin, analyst and marketing with the second factor, and nobody else',
      'expected', repeat('not_allowed,', 11) || 'not_allowed|true|true|true|true|true|true|true',
      'actual', v_txt, 'pass', v_txt = repeat('not_allowed,', 11) || 'not_allowed|true|true|true|true|true|true|true');

    -- 2 -------------------------------------------------------------- audited
    select concat_ws(',',
      (select count(*) from app.admin_audit where id > v_audit and action = 'growth.magnets_view'),
      (select count(*) from app.admin_audit where id > v_audit and action = 'growth.deliverability_view'),
      (select count(*) from app.admin_audit where id > v_audit and action = 'deliverability.auth_check' and admin_id = v_mk
         and detail->'results' @> '[{"stream":"transactional","dmarc":"warn"},{"stream":"marketing","dmarc":"pass"}]'),
      -- a refused call writes nothing
      (select count(*) from app.admin_audit where id > v_audit and admin_id in (v_ed, v_sp, v_fi)))
    into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'every read and the write are audited; a refusal is not',
      'expected', '3,3,1,0', 'actual', v_txt, 'pass', v_txt = '3,3,1,0');

    -- 3 -------------------------------------------------------------- the magnets, true status
    perform set_config('request.jwt.claims', format(claims, v_su, 'aal2'), true);
    v_j := public.admin_growth_magnets();
    select string_agg(x->>'rank' || ':' || (x->>'key') || ':' || (x->>'status') || ':' || (x->>'derived'), ',' order by (x->>'rank')::int)
      into v_txt from jsonb_array_elements(v_j->'magnets') x;
    update app.crm_lists set archived_at = now() where product_id = 'orgpuls' and key = 'nyhetsbrev';
    v_txt := v_txt || '|' || (select x->>'status' from jsonb_array_elements(public.admin_growth_magnets()->'magnets') x where x->>'key' = 'nyhetsbrev');
    update app.crm_lists set archived_at = null where product_id = 'orgpuls' and key = 'nyhetsbrev';
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'the report''s seven in order, six planned, the newsletter live only while its list is',
      'expected', '1:krav_sjekk:planned:false,2:risiko_sjekk:planned:false,3:dokumentasjonspakke:planned:false,4:sykefravaer:planned:false,'
                  || '5:arshjul:planned:false,6:bransjeguider:planned:false,7:nyhetsbrev:live:true|planned',
      'actual', v_txt,
      'pass', v_txt = '1:krav_sjekk:planned:false,2:risiko_sjekk:planned:false,3:dokumentasjonspakke:planned:false,4:sykefravaer:planned:false,'
                  || '5:arshjul:planned:false,6:bransjeguider:planned:false,7:nyhetsbrev:live:true|planned');

    -- 4 -------------------------------------------------------------- no fabricated figure
    -- counted as deltas: the local database may hold other contacts
    v_k := v_j->'doi';
    select id into v_list from app.crm_lists where product_id = 'orgpuls' and key = 'nyhetsbrev';
    insert into app.crm_contacts (id, email, name, source, basis, status, consent_at, consent_source, optin_sent_at, optin_hash)
    values (v_c1, 'c1@g4-probe.example', 'C1', 'newsletter', 'consent', 'active', now() - interval '1 day', 'double opt-in (newsletter)', now() - interval '1 day 1 hour', null),
           (v_c2, 'c2@g4-probe.example', 'C2', 'newsletter', 'none', 'pending', null, null, now() - interval '2 days', repeat('a', 64)),
           (v_c3, 'c3@g4-probe.example', 'C3', 'newsletter', 'consent', 'active', now() - interval '200 days', 'double opt-in (newsletter)', now() - interval '200 days', null);
    insert into app.crm_list_members (list_id, contact_id, status, source, subscribed_at)
    values (v_list, v_c1, 'subscribed', 'newsletter', now()), (v_list, v_c2, 'pending', 'newsletter', null);
    v_j := public.admin_growth_magnets();
    select concat_ws(',',
      -- every tool: null completions and no consent measure
      (select count(*) from jsonb_array_elements(v_j->'magnets') x where x->>'kind' <> 'newsletter' and x->'completions' = 'null'::jsonb and x->'doi' = 'null'::jsonb),
      ((v_j->'doi'->>'sent')::int - (v_k->>'sent')::int),
      ((v_j->'doi'->>'confirmed')::int - (v_k->>'confirmed')::int),
      (select (x->'doi'->>'sent') || '/' || (x->'doi'->>'confirmed') from jsonb_array_elements(v_j->'magnets') x where x->>'key' = 'nyhetsbrev'),
      (select x->>'completions' from jsonb_array_elements(v_j->'magnets') x where x->>'key' = 'nyhetsbrev')::int
        - (select count(*) from app.crm_list_members m where m.list_id = v_list and m.status = 'subscribed')::int)
    into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'tools record nothing (null, never 0); double opt-in is confirmed of sent in 90 days',
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
                  || 'bht:1:-:-:forskrift 2011-12-06-1355 § 13-1:true:true,wording_4_3:1:-:-:arbeidsmiljøloven § 4-3:true:true|1|refused,refused,2,2,0',
      'actual', v_txt,
      'pass', v_txt = 'verneombud:1:5:-:arbeidsmiljøloven § 6-1:true:true,amu:1:30:10:arbeidsmiljøloven § 7-1:true:true,'
                  || 'bht:1:-:-:forskrift 2011-12-06-1355 § 13-1:true:true,wording_4_3:1:-:-:arbeidsmiljøloven § 4-3:true:true|1|refused,refused,2,2,0');

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
    values (v_org, 'evaluering', 'daglig_leder', now() - interval '1 day', now() - interval '1 day', 'email', '<g4-1@probe>', 'delivered', now()),
           (v_org, 'evaluering', 'daglig_leder', now() - interval '1 day', now() - interval '1 day', 'sms', 'g4-sms', 'delivered', now());
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
      (select count(*) from jsonb_array_elements(v_j->'templates') a where a->>'source' = 'auth' and a->'sent' = 'null'::jsonb))
    into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'seven days per stream and template from what records each send; SMS is not mail; Auth has no count',
      'expected', '4,3,1,1,2/1,1,1,2,4', 'actual', v_txt, 'pass', v_txt = '4,3,1,1,2/1,1,1,2,4');

    -- 9 -------------------------------------------------------------- the authentication check
    delete from app.mail_auth_checks;
    perform set_config('request.jwt.claims', format(claims, v_an, 'aal2'), true);
    v_txt := concat_ws(',',
      public.admin_deliverability_check('[{"stream":"marketing","domain":"evil.example","spf":"pass","dkim":"pass","dmarc":"pass"}]')->>'error',
      public.admin_deliverability_check('[{"stream":"marketing","domain":"nyheter.orgpuls.com","spf":"great","dkim":"pass","dmarc":"pass"}]')->>'error',
      public.admin_deliverability_check('[{"stream":"marketing","domain":"nyheter.orgpuls.com","spf":"pass","dkim":"pass","dmarc":"pass"},{"stream":"marketing","domain":"nyheter.orgpuls.com","spf":"pass","dkim":"pass","dmarc":"pass"}]')->>'error',
      public.admin_deliverability_check('{"stream":"marketing"}')->>'error',
      (select count(*) from app.mail_auth_checks),
      public.admin_deliverability_check(good)->>'recorded',
      public.admin_deliverability_check(good)->>'error');
    v_j := public.admin_growth_deliverability();
    v_txt := v_txt || '|' || (select string_agg((x->>'key') || ':' || (x->'check'->>'domain') || ':' || (x->'check'->>'dmarc') || ':' || coalesce(x->'check'->>'dmarc_policy', '-'), ',')
                               from jsonb_array_elements(v_j->'streams') x);
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'the check records only its stream''s domain and known levels, once a minute; the read shows the latest',
      'expected', 'invalid,invalid,invalid,invalid,0,2,too_soon|transactional:orgpuls.com:warn:none,marketing:nyheter.orgpuls.com:pass:quarantine',
      'actual', v_txt,
      'pass', v_txt = 'invalid,invalid,invalid,invalid,0,2,too_soon|transactional:orgpuls.com:warn:none,marketing:nyheter.orgpuls.com:pass:quarantine');

    raise exception 'rollback';
  exception when others then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 10 --------------------------------------------------------------- the tables are closed
  select concat_ws(',',
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'app' and c.relname in ('growth_magnets', 'growth_krav_rules', 'growth_krav_rule_versions', 'mail_streams', 'mail_templates', 'mail_auth_checks')
        and c.relrowsecurity),
    (select count(*) from pg_policies where schemaname = 'app'
      and tablename in ('growth_magnets', 'growth_krav_rules', 'growth_krav_rule_versions', 'mail_streams', 'mail_templates', 'mail_auth_checks')),
    (select count(*) from (values ('anon'), ('authenticated'), ('service_role')) r(role)
      cross join (values ('app.growth_magnets'), ('app.growth_krav_rules'), ('app.growth_krav_rule_versions'), ('app.mail_streams'),
                         ('app.mail_templates'), ('app.mail_auth_checks')) t(tbl)
      where has_table_privilege(r.role, t.tbl, 'select,insert,update,delete')
         or has_any_column_privilege(r.role, t.tbl, 'select,insert,update')),
    (select count(*) from (values ('anon'), ('authenticated')) r(role)
      where has_function_privilege(r.role, 'app.growth_doi(text)', 'execute') or has_function_privilege(r.role, 'app.mail_sent_7d()', 'execute')),
    has_function_privilege('anon', 'public.admin_deliverability_check(jsonb)', 'execute'))
  into v_txt;
  v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'the six tables have RLS, no policy and no grant; the helpers and the write are not anon''s',
    'expected', '6,0,0,0,f', 'actual', v_txt, 'pass', v_txt = '6,0,0,0,f');

  -- 11 --------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id::text from auth.users where email like '%@g4-probe.example'
    union all select id::text from app.organizations where id = v_org
    union all select id::text from app.crm_contacts where email like '%@g4-probe.example'
    union all select id::text from app.mail_events where message_id like 'g4-%'
    union all select key from app.mail_templates where key = 'crm.probe'
    union all select rule_key from app.growth_krav_rule_versions where version > 1 and checked_on = current_date and rule_key = 'verneombud'
    union all select id::text from app.admin_audit where admin_email like '%@g4-probe.example') x;
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
  if v_count <> 11 then raise exception 'growth G4 invariants: expected 11 rows, got %', v_count; end if;
end $$;
