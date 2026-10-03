-- crm_sequences_invariants.sql — the register's general managers (0110) and follow-ups that send
-- themselves (0111), proved against the live schema.
--
--   * a register import stores the general manager on the company, greets the company's role
--     address with their name, tags company and address with the batch, and keeps no birth date;
--     a second import refreshes the manager, never duplicates; a bad tag is refused (1)
--   * business hours are weekdays 08–16 Oslo (2)
--   * a follow-up's audience: those the first mail reached N days ago; no_click leaves out a
--     clicker, no_open a reader; an answer, an unsubscribe, a bounce or a won/lost/parked company
--     ends it for them (3)
--   * «Resend after 7 days» makes a draft follow-up with the first mail's content, sending itself to
--     non-clickers; a chain holds at most seven mails (4)
--   * a follow-up is not finished while somebody due waits to be added, in or out of business
--     hours (9, 0115)
--   * an automatic follow-up is never sent as one batch, nor finished before its first mail is done (5)
--   * the daily cap holds campaign mail back, never a test (6)
--   * roles: an analyst reads the sequence and cannot resend or set the cap (7)
--   * nothing written here survives (8)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/crm_sequences_invariants.sql

create unlogged table if not exists public._csq(seq int, name text, expected text, actual text, pass bool);
truncate public._csq;

do $$
declare
  v_mkt    uuid := '00000000-0000-4000-8000-0000000c7101';
  v_ana    uuid := '00000000-0000-4000-8000-0000000c7102';
  v_a      uuid;
  v_b      uuid;
  v_c      uuid;
  v_d      uuid;
  v_camp   uuid;
  v_follow uuid;
  v_resend uuid;
  v_prev   uuid;
  v_json   jsonb;
  v_jobs   jsonb;
  v_txt    text;
  v_n      int;
  v_cap    int;
  v_rows   jsonb := '[]';
  claims   constant text := '{"sub":"%s","role":"authenticated","aal":"aal2"}';
begin
  select daily_cap into v_cap from app.crm_settings where id;
  begin
    insert into auth.users (id, email) values (v_mkt, 'marketing@csq-test.example'), (v_ana, 'analyst@csq-test.example');
    insert into app.platform_admins (user_id, role) values (v_mkt, 'marketing'), (v_ana, 'analyst');
    perform set_config('request.jwt.claims', format(claims, v_mkt), true);

    -- 1 -------------------------------------------------------------- the register's general manager
    v_json := public.admin_crm_company_import(jsonb_build_array(
      jsonb_build_object('org_number', '999710001', 'name', 'PROBE BYGG AS', 'form_code', 'AS', 'employees', 12,
                         'email', 'post@probebygg-csq.example', 'manager_name', 'Anders Opedal', 'manager_role', 'DAGL', 'fodselsdato', '1968-05-04'),
      jsonb_build_object('org_number', '999710002', 'name', 'PROBE ENK', 'form_code', 'ENK', 'employees', 1,
                         'email', 'kari@probeenk-csq.example', 'manager_name', 'Kari Nord', 'manager_role', 'INNH'),
      jsonb_build_object('org_number', '999710003', 'name', 'PROBE UTEN AS', 'form_code', 'AS', 'manager_name', 'X', 'manager_role', 'LEDE')),
      'brreg', 'dl-csq-bygg');
    v_txt := concat_ws('|', v_json->>'added', v_json->>'managers', v_json->>'business',
      (select manager_name || ':' || manager_role || ':' || (manager_seen_at is not null)::text || ':' || array_to_string(tags, ',')
         from app.crm_companies where org_number = '999710001'),
      (select coalesce(name, '-') || ':' || coalesce(role, '-') || ':' || basis || ':' || array_to_string(tags, ',')
         from app.crm_contacts where email = 'post@probebygg-csq.example'),
      (select basis from app.crm_contacts where email = 'kari@probeenk-csq.example'),
      (select coalesce(manager_name, 'none') from app.crm_companies where org_number = '999710003'),
      -- the register's birth date has nowhere to go
      (select count(*) from information_schema.columns where table_schema = 'app' and table_name in ('crm_companies', 'crm_contacts')
         and column_name ~ '(fodsel|birth)')::text);
    v_json := public.admin_crm_company_import(jsonb_build_array(
      jsonb_build_object('org_number', '999710001', 'name', 'PROBE BYGG AS', 'manager_name', 'Siri Opedal', 'manager_role', 'DAGL')), 'brreg', null);
    v_txt := concat_ws('|', v_txt, v_json->>'added', v_json->>'known',
      (select manager_name from app.crm_companies where org_number = '999710001'),
      (select name from app.crm_contacts where email = 'post@probebygg-csq.example'),
      (select count(*) from app.crm_companies where org_number = '999710001')::text,
      public.admin_crm_company_import('[{"org_number":"999710001","name":"X"}]', 'brreg', 'Bad Tag!')->>'error');
    v_rows := v_rows || jsonb_build_object('seq', 1,
      'name', 'the manager on the company, greeting its role address; tagged; no birth date; refreshed on a second import; bad tag refused',
      'expected', '3|2|1|Anders Opedal:DAGL:true:dl-csq-bygg|Anders Opedal:daglig_leder:business:dl-csq-bygg|none|none|0|0|1|Siri Opedal|Siri Opedal|1|invalid',
      'actual', v_txt,
      'pass', v_txt = '3|2|1|Anders Opedal:DAGL:true:dl-csq-bygg|Anders Opedal:daglig_leder:business:dl-csq-bygg|none|none|0|0|1|Siri Opedal|Siri Opedal|1|invalid');

    -- 2 -------------------------------------------------------------- business hours
    v_txt := concat_ws(',',
      app.crm_business_hours('2026-09-29 09:30 Europe/Oslo')::text,   -- a Tuesday morning
      app.crm_business_hours('2026-09-29 07:30 Europe/Oslo')::text,
      app.crm_business_hours('2026-09-29 16:30 Europe/Oslo')::text,
      app.crm_business_hours('2026-10-03 11:00 Europe/Oslo')::text);  -- a Saturday
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'business hours are weekdays 08–16 Oslo',
      'expected', 'true,false,false,false', 'actual', v_txt, 'pass', v_txt = 'true,false,false,false');

    -- 3 -------------------------------------------------------------- who a follow-up reaches
    insert into app.crm_companies (name, source, stage) values ('Probe A AS', 'manual', 'contacted') returning id into v_a;
    insert into app.crm_companies (name, source, stage) values ('Probe B AS', 'manual', 'contacted') returning id into v_b;
    insert into app.crm_companies (name, source, stage) values ('Probe C AS', 'manual', 'contacted') returning id into v_c;
    insert into app.crm_companies (name, source, stage) values ('Probe D AS', 'manual', 'contacted') returning id into v_d;
    insert into app.crm_contacts (email, name, source, basis, status, consent_at, consent_source, company_id, lang) values
      ('a@a-csq.example', 'A', 'manual', 'consent', 'active', now(), 'probe', v_a, 'no'),
      ('b@b-csq.example', 'B', 'manual', 'consent', 'active', now(), 'probe', v_b, 'no'),
      ('c@c-csq.example', 'C', 'manual', 'consent', 'active', now(), 'probe', v_c, 'no'),
      ('d@d-csq.example', 'D', 'manual', 'consent', 'active', now(), 'probe', v_d, 'no');
    v_json := public.admin_crm_campaign_save(null, jsonb_build_object('name', 'Probe sekvens', 'template_key', 'forste-kontakt', 'lang', 'no'));
    v_camp := (v_json->>'id')::uuid;
    update app.crm_campaigns set status = 'sent', started_at = now() - interval '9 days', finished_at = now() - interval '9 days' where id = v_camp;
    insert into app.crm_sends (kind, campaign_id, contact_id, status, sent_at, delivery, opened_at, clicked_at)
    select 'campaign', v_camp, c.id, 'sent', now() - interval '8 days', 'delivered',
           case when c.email in ('b@b-csq.example', 'c@c-csq.example') then now() - interval '7 days' end,
           case when c.email = 'c@c-csq.example' then now() - interval '7 days' end
    from app.crm_contacts c where c.email like '%-csq.example' and c.company_id in (v_a, v_b, v_c, v_d);
    v_json := public.admin_crm_campaign_save(null, jsonb_build_object('name', 'Probe oppfølging', 'template_key', 'forste-kontakt', 'lang', 'no'));
    v_follow := (v_json->>'id')::uuid;
    perform public.admin_crm_campaign_pipeline(v_follow, jsonb_build_object('follows_id', v_camp, 'follow_days', 7, 'follow_when', 'no_reply'));
    select string_agg(split_part(x.email, '@', 1), '' order by x.email) into v_txt
      from app.crm_follow_audience((select c from app.crm_campaigns c where c.id = v_follow)) x;
    update app.crm_campaigns set follow_when = 'no_click' where id = v_follow;
    v_txt := v_txt || ',' || (select string_agg(split_part(x.email, '@', 1), '' order by x.email)
      from app.crm_follow_audience((select c from app.crm_campaigns c where c.id = v_follow)) x);
    update app.crm_campaigns set follow_when = 'no_open' where id = v_follow;
    v_txt := v_txt || ',' || (select string_agg(split_part(x.email, '@', 1), '' order by x.email)
      from app.crm_follow_audience((select c from app.crm_campaigns c where c.id = v_follow)) x);
    -- A answers, D is won; B unsubscribes from the first mail
    update app.crm_campaigns set follow_when = 'no_reply' where id = v_follow;
    perform public.admin_crm_activity(v_a, null, 'reply', 'Probe: svarte');
    update app.crm_companies set stage = 'customer' where id = v_d;
    update app.crm_sends set unsubscribed_at = now() where campaign_id = v_camp
      and contact_id = (select id from app.crm_contacts where email = 'b@b-csq.example');
    v_txt := v_txt || ',' || coalesce((select string_agg(split_part(x.email, '@', 1), '' order by x.email)
      from app.crm_follow_audience((select c from app.crm_campaigns c where c.id = v_follow)) x), '');
    v_rows := v_rows || jsonb_build_object('seq', 3,
      'name', 'no_reply: all four; no_click: not C; no_open: A and D; then an answer, a win and an unsubscribe leave C',
      'expected', 'abcd,abd,ad,c', 'actual', v_txt, 'pass', v_txt = 'abcd,abd,ad,c');

    -- 4 -------------------------------------------------------------- resend, and the seven-mail cap
    -- 0192: the cap is a setting, unlimited by default (crm_rules_invariants proves off); here it is seven
    insert into app.crm_setting_values (key, value) values ('limit_sequence_mails', '7');
    v_json := public.admin_crm_campaign_resend(v_camp, 7);
    v_resend := (v_json->>'id')::uuid;
    select concat_ws(':', r.status, r.follow_days, r.follow_when, r.follow_auto::text, (r.subject = p.subject)::text, (r.blocks = p.blocks)::text)
      into v_txt from app.crm_campaigns r, app.crm_campaigns p where r.id = v_resend and p.id = v_camp;
    v_prev := v_resend;
    for v_n in 1..5 loop
      v_json := public.admin_crm_campaign_resend(v_prev, 3);
      exit when v_json->>'error' is not null;
      v_prev := (v_json->>'id')::uuid;
    end loop;
    v_txt := concat_ws('|', v_txt, app.crm_chain_depth(v_prev), public.admin_crm_campaign_resend(v_prev, 3)->>'error',
      public.admin_crm_campaign_pipeline(v_follow, jsonb_build_object('follows_id', v_prev, 'follow_days', 3))->>'error');
    v_rows := v_rows || jsonb_build_object('seq', 4,
      'name', 'a resend is a draft follow-up of the same mail to non-clickers, sending itself; with the setting at seven, a chain stops at seven',
      'expected', 'draft:7:no_click:true:true:true|7|too_many_steps|too_many_steps', 'actual', v_txt,
      'pass', v_txt = 'draft:7:no_click:true:true:true|7|too_many_steps|too_many_steps');

    -- 5 -------------------------------------------------------------- an automatic follow-up is never one batch
    update app.crm_campaigns set follow_auto = true, status = 'scheduled', scheduled_at = now() - interval '1 hour' where id = v_follow;
    -- 0115: whatever the hour, a follow-up whose first mail's time has run is not done while C, who is due, waits to be added
    select concat_ws('|', app.crm_follow_done(c)::text, (select count(*) from app.crm_follow_audience(c))) into v_txt from app.crm_campaigns c where c.id = v_follow;
    v_rows := v_rows || jsonb_build_object('seq', 9,
      'name', 'a follow-up is not finished while somebody due is still to be added (0115), in or out of business hours',
      'expected', 'false|1', 'actual', v_txt, 'pass', v_txt = 'false|1');
    perform set_config('request.jwt.claims', '', true);
    v_jobs := public.crm_mail_claim(50);
    select status into v_txt from app.crm_campaigns where id = v_follow;
    v_txt := case when app.crm_business_hours() then
               -- in business hours C is added and claimed at once; the campaign runs on
               v_txt || ':' || (select count(*) from app.crm_sends where campaign_id = v_follow)
             else v_txt || ':0' end;
    v_rows := v_rows || jsonb_build_object('seq', 5,
      'name', 'an armed automatic follow-up adds only who is due (C, in business hours) and is not finished while its first mail''s time runs',
      'expected', case when app.crm_business_hours() then 'sending:1' else 'scheduled:0' end, 'actual', v_txt,
      'pass', v_txt = case when app.crm_business_hours() then 'sending:1' else 'scheduled:0' end);
    -- release anything claimed for the probe
    update app.crm_sends set status = 'skipped', to_email = null where campaign_id = v_follow;

    -- 6 -------------------------------------------------------------- the daily cap
    perform set_config('request.jwt.claims', format(claims, v_mkt), true);
    select count(*) into v_n from app.crm_sends s where s.kind = 'campaign' and s.status in ('sent', 'sending')
      and (coalesce(s.sent_at, now()) at time zone 'Europe/Oslo')::date = (now() at time zone 'Europe/Oslo')::date;
    v_txt := coalesce(public.admin_crm_daily_cap(v_n + 1)->>'error', 'ok') || ',' || coalesce(public.admin_crm_daily_cap(0)->>'error', 'ok');
    perform public.admin_crm_daily_cap(v_n + 1);
    insert into app.crm_sends (kind, campaign_id, contact_id, to_email, status, variant)
    select 'campaign', v_resend, c.id, c.email, 'pending', 'a' from app.crm_contacts c where c.email in ('c@c-csq.example', 'd@d-csq.example');
    insert into app.crm_sends (kind, campaign_id, contact_id, to_email, status)
    select 'test', v_camp, c.id, c.email, 'pending' from app.crm_contacts c where c.email = 'a@a-csq.example';
    perform set_config('request.jwt.claims', '', true);
    v_jobs := public.crm_mail_claim(50);
    v_txt := concat_ws('|', v_txt,
      (select count(*) from jsonb_array_elements(v_jobs) j where j->>'kind' = 'campaign')::text,
      (select count(*) from jsonb_array_elements(v_jobs) j where j->>'kind' = 'test' and j->>'to_email' = 'a@a-csq.example')::text,
      (select count(*) from app.crm_sends where kind = 'campaign' and campaign_id = v_resend and status = 'pending')::text);
    v_rows := v_rows || jsonb_build_object('seq', 6,
      'name', 'the cap is set (0 refused); one campaign mail left today goes, the other waits; the test is not held',
      'expected', 'ok,invalid|1|1|1', 'actual', v_txt, 'pass', v_txt = 'ok,invalid|1|1|1');

    -- 7 -------------------------------------------------------------- roles
    perform set_config('request.jwt.claims', format(claims, v_ana), true);
    v_txt := concat_ws(',', public.admin_crm_sequence(v_resend)->>'ok', jsonb_array_length(public.admin_crm_sequence(v_resend)->'steps')::text,
      public.admin_crm_campaign_resend(v_camp, 7)->>'error', public.admin_crm_daily_cap(10)->>'error',
      public.admin_crm_sending()->>'ok');
    perform set_config('request.jwt.claims', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'an analyst reads the chain and the sending state, and cannot resend or set the cap',
      'expected', 'true,8,not_allowed,not_allowed,true', 'actual', v_txt, 'pass', v_txt = 'true,8,not_allowed,not_allowed,true');

    raise exception 'rollback' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 8 ---------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id::text from app.crm_companies where name like 'Probe % AS' or org_number like '99971000_'
    union all select id::text from app.crm_contacts where email like '%csq.example'
    union all select id::text from auth.users where id in (v_mkt, v_ana)) x;
  v_txt := v_txt || '|' || ((select daily_cap from app.crm_settings where id) is not distinct from v_cap)::text;
  v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'every probe row was rolled back, the cap as it was',
    'expected', '0|true', 'actual', v_txt, 'pass', v_txt = '0|true');

  insert into public._csq
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._csq order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._csq;
  if v_failed is not null then raise exception 'crm sequence invariants failed: %', v_failed; end if;
  if v_count <> 9 then raise exception 'crm sequence invariants: expected 9 rows, got %', v_count; end if;
end $$;

drop table public._csq;
