-- crm_inbox_invariants.sql — the inbox and the board's stages (0112), proved against the live schema.
--
--   * every seeded stage says what the buyer did to reach it; a stage's criterion is saved with it (1)
--   * the inbox lists a trial sign-up and a contact-form lead as waiting, until a call or a note is
--     logged after they came; a logged stage change is not an answer; a newsletter sign-up is not a lead (2)
--   * the week's median first response and the share inside the target follow the target (3)
--   * the target is 1–1440 minutes; an analyst reads the inbox and cannot set it (4)
--   * nothing written here survives (5)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/crm_inbox_invariants.sql

create unlogged table if not exists public._cin(seq int, name text, expected text, actual text, pass bool);
truncate public._cin;

do $$
declare
  v_mkt   uuid := '00000000-0000-4000-8000-0000000c7201';
  v_ana   uuid := '00000000-0000-4000-8000-0000000c7202';
  v_trial uuid;
  v_form  uuid;
  v_json  jsonb;
  v_txt   text;
  v_sla   int;
  v_rows  jsonb := '[]';
  claims  constant text := '{"sub":"%s","role":"authenticated","aal":"aal2"}';
begin
  select sla_minutes into v_sla from app.crm_settings where id;
  -- 1 ---------------------------------------------------------------- exit criteria
  select count(*) filter (where exit_criterion is null)::text into v_txt from app.crm_stages
  where key in ('new', 'contacted', 'engaged', 'meeting', 'trial', 'customer', 'nurture', 'lost', 'not_relevant');
  begin
    insert into auth.users (id, email) values (v_mkt, 'marketing@cin-test.example'), (v_ana, 'analyst@cin-test.example');
    insert into app.platform_admins (user_id, role) values (v_mkt, 'marketing'), (v_ana, 'analyst');
    perform set_config('request.jwt.claims', format(claims, v_mkt), true);
    perform public.admin_crm_stage_save('meeting', '{"name":"Meeting","sort":"40","kind":"open","exit_criterion":"A demo is booked in the calendar"}');
    v_txt := v_txt || '|' || (select exit_criterion from app.crm_stages where key = 'meeting')
          || '|' || (select r->>'exit_criterion' from jsonb_array_elements(public.admin_crm_stages()->'rows') r where r->>'key' = 'engaged');
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'every seeded stage has its criterion; one is saved with its stage and read back',
      'expected', '0|A demo is booked in the calendar|They answered', 'actual', v_txt,
      'pass', v_txt = '0|A demo is booked in the calendar|They answered');

    -- 2 -------------------------------------------------------------- the inbox
    insert into app.crm_companies (name, source, stage, created_at) values ('Probe Prøve AS', 'signup', 'trial', now() - interval '20 minutes')
      returning id into v_trial;
    insert into app.crm_contacts (email, name, source, basis, status, created_at) values
      ('skjema@cin-test.example', 'Siri Skjema', 'contact_form', 'none', 'active', now() - interval '3 minutes') returning id into v_form;
    insert into app.crm_contacts (email, source, basis, status, consent_at, consent_source) values
      ('brev@cin-test.example', 'newsletter', 'consent', 'active', now(), 'probe');
    perform app.crm_log(v_trial, null, 'stage', 'probe: stage logged by the system');
    v_json := public.admin_crm_inbox(30);
    select string_agg(r->>'kind' || ':' || coalesce(r->>'answered_at', 'waiting'), ',' order by r->>'kind')
      into v_txt from jsonb_array_elements(v_json->'rows') r where r->>'company' like 'Probe%' or r->>'person' like '%Skjema%' or r->>'person' like 'brev@%';
    -- a call on the trial company answers it
    perform public.admin_crm_activity(v_trial, null, 'call', 'Probe: ringte');
    v_json := public.admin_crm_inbox(30);
    v_txt := v_txt || '|' || (select string_agg(r->>'kind' || ':' || case when r->>'answered_at' is null then 'waiting' else 'answered' end, ','
                                                order by r->>'kind')
                              from jsonb_array_elements(v_json->'rows') r where r->>'company' like 'Probe%' or r->>'person' like '%Skjema%');
    v_rows := v_rows || jsonb_build_object('seq', 2,
      'name', 'a sign-up and a form lead wait (a system stage log is no answer; a newsletter is no lead) until a call is logged',
      'expected', 'contact_form:waiting,trial:waiting|contact_form:waiting,trial:answered', 'actual', coalesce(v_txt, 'none'),
      'pass', v_txt = 'contact_form:waiting,trial:waiting|contact_form:waiting,trial:answered');

    -- 3 -------------------------------------------------------------- the week's figures follow the target
    perform public.admin_crm_sla(30);
    v_json := public.admin_crm_inbox(30);
    v_txt := concat_ws('|', v_json->>'sla_minutes', ((v_json->'week'->>'within_sla')::int >= 1)::text,
                       ((v_json->'week'->>'median_minutes')::numeric > 0)::text);
    perform public.admin_crm_sla(5);
    v_json := public.admin_crm_inbox(30);
    v_txt := v_txt || '|' || (v_json->>'sla_minutes') || '|'
          || ((v_json->'week'->>'within_sla')::int < (v_json->'week'->>'answered')::int)::text;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'answered in 20 minutes: inside a 30-minute target, outside a 5-minute one',
      'expected', '30|true|true|5|true', 'actual', v_txt, 'pass', v_txt = '30|true|true|5|true');

    -- 4 -------------------------------------------------------------- limits and roles
    v_txt := concat_ws(',', public.admin_crm_sla(0)->>'error', public.admin_crm_sla(2000)->>'error');
    perform set_config('request.jwt.claims', format(claims, v_ana), true);
    v_txt := concat_ws(',', v_txt, public.admin_crm_inbox(7)->>'ok', public.admin_crm_sla(10)->>'error',
                       public.admin_crm_stage_save('meeting', '{"name":"M","sort":"40","kind":"open"}')->>'error');
    perform set_config('request.jwt.claims', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'the target is 1–1440; an analyst reads the inbox and changes nothing',
      'expected', 'invalid,invalid,true,not_allowed,not_allowed', 'actual', v_txt, 'pass', v_txt = 'invalid,invalid,true,not_allowed,not_allowed');

    raise exception 'rollback' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 5 ---------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id::text from app.crm_companies where name like 'Probe %'
    union all select id::text from app.crm_contacts where email like '%@cin-test.example'
    union all select id::text from auth.users where id in (v_mkt, v_ana)) x;
  v_txt := v_txt || '|' || ((select sla_minutes from app.crm_settings where id) = v_sla)::text
        || '|' || (select exit_criterion from app.crm_stages where key = 'meeting');
  v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'every probe row was rolled back, the target and criteria as they were',
    'expected', '0|true|A meeting or demo is booked', 'actual', v_txt, 'pass', v_txt = '0|true|A meeting or demo is booked');

  insert into public._cin
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._cin order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._cin;
  if v_failed is not null then raise exception 'crm inbox invariants failed: %', v_failed; end if;
  if v_count <> 5 then raise exception 'crm inbox invariants: expected 5 rows, got %', v_count; end if;
end $$;

drop table public._cin;
