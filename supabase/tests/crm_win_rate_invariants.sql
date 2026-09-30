-- crm_win_rate_invariants.sql — the stage history, the pipeline in figures, and call and LinkedIn
-- steps in a sequence (0137), proved against the live schema.
--
--   * every stage a company enters is recorded by the trigger, whoever moves it — the save, a
--     direct update like the plan sync's — with the kinds left and reached; a save that keeps the
--     stage records nothing (1)
--   * the history is a record: a row is not changed, not deleted while its company exists, and
--     goes with its company (2); no client role reads or writes it (3)
--   * the pipeline's figures: per stage and open, the deals, how many carry a value, and the sum of
--     those only (4)
--   * the win rate's counts: a win and a loss from an open stage count; a customer who cancels
--     (won → lost) is churn and does not; a deal lost and then won counts once, as won; nothing
--     closed before the period (5)
--   * a call step: made as a draft after a mail, armed, it makes one task per contact who has come
--     due, for the company's owner, due today, linked to the step; again makes no second; a contact
--     without a company gets none; no mail is queued for it (6)
--   * the chain waits on the task: the mail after it reaches a contact only once their task is done
--     or skipped and the days have passed; the step is not finished while a task is open (7)
--   * «Skip» only for a task a step made; reopening takes the skip back (8)
--   * the readers: the task list names the step's kind and journey; the sequence counts the step's
--     tasks; the journey counts its task steps; a call step cannot be «resent»; a call step without
--     a step before it is refused by the table (9)
--   * roles: an analyst reads the figures and cannot add a step or skip; anon may not ask (10)
--   * nothing written here survives (11)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/crm_win_rate_invariants.sql

create unlogged table if not exists public._cwr(seq int, name text, expected text, actual text, pass bool);
truncate public._cwr;

-- one snapshot for the whole probe, so rows other sessions commit meanwhile do not move the counts
begin isolation level repeatable read;

do $$
declare
  v_mkt   uuid := '00000000-0000-4000-8000-0000000c1371';
  v_ana   uuid := '00000000-0000-4000-8000-0000000c1372';
  v_a     uuid;
  v_b     uuid;
  v_c     uuid;
  v_d     uuid;
  v_e     uuid;
  v_ka    uuid;
  v_kb    uuid;
  v_kn    uuid;
  v_camp  uuid;
  v_step  uuid;
  v_next  uuid;
  v_task  uuid;
  v_hand  uuid;
  v_s0    jsonb;
  v_s1    jsonb;
  v_json  jsonb;
  v_txt   text;
  v_rows  jsonb := '[]';
  claims  constant text := '{"sub":"%s","role":"authenticated","aal":"aal2"}';
begin
  begin
    insert into auth.users (id, email) values (v_mkt, 'marketing@cwr-test.example'), (v_ana, 'analyst@cwr-test.example');
    insert into app.platform_admins (user_id, role) values (v_mkt, 'marketing'), (v_ana, 'analyst');
    perform set_config('request.jwt.claims', format(claims, v_mkt), true);
    v_s0 := public.admin_crm_pipeline_summary(null);

    -- 1 -------------------------------------------------------------- every stage entered is recorded
    v_a := (public.admin_crm_company_save(null, '{"name":"Vinn Probe AS","value_nok":"100000"}'::jsonb)->>'id')::uuid;
    perform public.admin_crm_company_save(v_a, '{"stage":"meeting"}'::jsonb);
    perform public.admin_crm_company_save(v_a, '{"stage":"meeting","next_step":"Ring"}'::jsonb);
    update app.crm_companies set stage = 'customer' where id = v_a;   -- as the plan sync moves it
    select string_agg(coalesce(h.from_stage, '∅') || ':' || coalesce(h.from_kind, '∅') || '>' || h.to_stage || ':' || h.to_kind, ',' order by h.id)
      into v_txt from app.crm_stage_changes h where h.company_id = v_a;
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'created, moved by the save and by a direct update: each recorded once, with kinds',
      'expected', '∅:∅>new:open,new:open>meeting:open,meeting:open>customer:won', 'actual', v_txt,
      'pass', v_txt = '∅:∅>new:open,new:open>meeting:open,meeting:open>customer:won');

    -- 2 -------------------------------------------------------------- a record
    v_txt := '';
    begin
      update app.crm_stage_changes set to_stage = 'lost' where company_id = v_a;
      v_txt := 'updated';
    exception when others then v_txt := 'no-update';
    end;
    begin
      delete from app.crm_stage_changes where company_id = v_a;
      v_txt := v_txt || ',deleted';
    exception when others then v_txt := v_txt || ',no-delete';
    end;
    insert into app.crm_companies (name, source, stage) values ('Borte Probe AS', 'manual', 'new') returning id into v_e;
    delete from app.crm_companies where id = v_e;
    v_txt := v_txt || ',' || (select count(*) from app.crm_stage_changes where company_id = v_e);
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'a row is not changed, nor deleted while its company exists; it goes with its company',
      'expected', 'no-update,no-delete,0', 'actual', v_txt, 'pass', v_txt = 'no-update,no-delete,0');

    -- 3 -------------------------------------------------------------- no client reads or writes it
    v_txt := concat_ws(',',
      (select relrowsecurity::text from pg_class where oid = 'app.crm_stage_changes'::regclass),
      (select count(*) from pg_policies where schemaname = 'app' and tablename = 'crm_stage_changes'),
      has_table_privilege('authenticated', 'app.crm_stage_changes', 'select')::text,
      has_table_privilege('anon', 'app.crm_stage_changes', 'insert')::text);
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'RLS on, no policy, no grant: clients neither read nor write the history',
      'expected', 'true,0,false,false', 'actual', v_txt, 'pass', v_txt = 'true,0,false,false');

    -- 4 -------------------------------------------------------------- the pipeline in figures
    v_b := (public.admin_crm_company_save(null, '{"name":"Tap Probe AS","value_nok":"40000","stage":"engaged"}'::jsonb)->>'id')::uuid;
    v_c := (public.admin_crm_company_save(null, '{"name":"Uten Verdi Probe AS","stage":"engaged"}'::jsonb)->>'id')::uuid;
    v_d := (public.admin_crm_company_save(null, '{"name":"Frafall Probe AS","value_nok":"9000","stage":"engaged"}'::jsonb)->>'id')::uuid;
    v_s1 := public.admin_crm_pipeline_summary(null);
    select concat_ws(',',
      ((a->>'count')::int - (b->>'count')::int), ((a->>'valued')::int - (b->>'valued')::int), ((a->>'value')::bigint - (b->>'value')::bigint))
      into v_txt
      from jsonb_array_elements(v_s1->'stages') a, jsonb_array_elements(v_s0->'stages') b
      where a->>'key' = 'engaged' and b->>'key' = 'engaged';
    v_txt := v_txt || '|' || concat_ws(',',
      ((v_s1->'open'->>'count')::int - (v_s0->'open'->>'count')::int),
      ((v_s1->'open'->>'valued')::int - (v_s0->'open'->>'valued')::int),
      ((v_s1->'open'->>'value')::bigint - (v_s0->'open'->>'value')::bigint));
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'three deals in Engaged, two with a value: the sum is theirs, and says it is two of three',
      'expected', '3,2,49000|3,2,49000', 'actual', v_txt, 'pass', v_txt = '3,2,49000|3,2,49000');

    -- 5 -------------------------------------------------------------- what closed
    perform public.admin_crm_company_save(v_b, '{"stage":"lost","lost_reason":"Pris"}'::jsonb);     -- lost from open
    perform public.admin_crm_company_save(v_c, '{"stage":"not_relevant"}'::jsonb);               -- lost from open …
    perform public.admin_crm_company_save(v_c, '{"stage":"meeting"}'::jsonb);                    -- … reopened …
    update app.crm_companies set stage = 'customer' where id = v_c;                              -- … and won: once, as won
    update app.crm_companies set stage = 'customer' where id = v_d;                              -- won …
    update app.crm_companies set stage = 'lost' where id = v_d;                                  -- … then cancels: churn
    v_s1 := public.admin_crm_pipeline_summary(null);
    -- v_a won, v_b lost, v_c won (once), v_d won (its churn is not a loss): 3 won, 1 lost
    v_txt := concat_ws(',',
      ((v_s1->'closed'->>'won')::int - (v_s0->'closed'->>'won')::int),
      ((v_s1->'closed'->>'lost')::int - (v_s0->'closed'->>'lost')::int),
      (public.admin_crm_pipeline_summary(now() + interval '1 day')->'closed')::text,
      ((v_s1->>'since')::timestamptz >= (v_s1->>'history_since')::timestamptz)::text);
    v_rows := v_rows || jsonb_build_object('seq', 5,
      'name', 'won from open counts, lost from open counts, lost-then-won counts once as won, churn is no loss; a period with nothing closed is 0 of 0',
      'expected', '3,1,{"won": 0, "lost": 0},true', 'actual', v_txt, 'pass', v_txt = '3,1,{"won": 0, "lost": 0},true');
    -- each company's last close from an open or parked stage decides: v_d's move from won to lost is
    -- not a close, so its win stands
    v_txt := concat_ws(',',
      (select h.to_kind from app.crm_stage_changes h where h.company_id = v_b order by h.id desc limit 1),
      (select h.from_kind || '>' || h.to_kind from app.crm_stage_changes h where h.company_id = v_d order by h.id desc limit 1));
    v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'the loss from open and the churn from won are recorded as such',
      'expected', 'lost,won>lost', 'actual', v_txt, 'pass', v_txt = 'lost,won>lost');

    -- 6 -------------------------------------------------------------- a call step makes tasks
    update app.crm_companies set stage = 'contacted', owner_id = v_mkt where id in (v_a, v_b);
    insert into app.crm_contacts (email, name, source, basis, status, consent_at, consent_source, company_id, lang) values
      ('ka@cwr-test.example', 'Kari A', 'manual', 'consent', 'active', now(), 'probe', v_a, 'no'),
      ('kb@cwr-test.example', 'Knut B', 'manual', 'consent', 'active', now(), 'probe', v_b, 'no'),
      ('kn@cwr-test.example', 'Nils Ingen', 'manual', 'consent', 'active', now(), 'probe', null, 'no');
    select id into v_ka from app.crm_contacts where email = 'ka@cwr-test.example';
    select id into v_kb from app.crm_contacts where email = 'kb@cwr-test.example';
    select id into v_kn from app.crm_contacts where email = 'kn@cwr-test.example';
    v_camp := (public.admin_crm_campaign_save(null, jsonb_build_object('name', 'Probe kjede', 'template_key', 'forste-kontakt', 'lang', 'no'))->>'id')::uuid;
    update app.crm_campaigns set status = 'sent', started_at = now() - interval '9 days', finished_at = now() - interval '9 days' where id = v_camp;
    insert into app.crm_sends (kind, campaign_id, contact_id, status, sent_at, delivery)
    select 'campaign', v_camp, c.id, 'sent', now() - interval '8 days', 'delivered' from app.crm_contacts c where c.id in (v_ka, v_kb, v_kn);
    v_json := public.admin_crm_step_save(null, jsonb_build_object('follows_id', v_camp, 'step_kind', 'call', 'title', 'Ring om tilbudet',
                                                                  'name', 'Probe kjede · ring', 'follow_days', '3'));
    v_step := (v_json->>'id')::uuid;
    v_txt := concat_ws(',', (select status || ':' || step_kind || ':' || follow_auto::text from app.crm_campaigns where id = v_step),
      coalesce(public.admin_crm_campaign_schedule(v_step, now())->>'error', 'armed'));
    perform app.crm_step_tasks();
    perform app.crm_step_tasks();
    v_txt := v_txt || '|' || (select string_agg(ct.email || ':' || (a.admin_id = v_mkt)::text || ':' || (a.due_at = (now() at time zone 'Europe/Oslo')::date)::text
                                                 || ':' || a.body, ',' order by ct.email)
                              from app.crm_activities a join app.crm_contacts ct on ct.id = a.contact_id where a.campaign_id = v_step)
      || '|' || (select status || ':' || audience from app.crm_campaigns where id = v_step)
      || '|' || (select count(*) from app.crm_sends where campaign_id = v_step)
      || '|' || (position('step_kind = ''mail''' in pg_get_functiondef('public.crm_mail_claim(int)'::regprocedure)) > 0
                 and position('crm_step_tasks' in pg_get_functiondef('public.crm_mail_claim(int)'::regprocedure)) > 0)::text;
    v_rows := v_rows || jsonb_build_object('seq', 6,
      'name', 'a call step is a draft, arms, makes one task per contact due (for the owner, due today, not twice, none without a company), queues no mail',
      'expected', 'draft:call:true,armed|ka@cwr-test.example:true:true:Ring om tilbudet,kb@cwr-test.example:true:true:Ring om tilbudet|sending:2|0|true',
      'actual', v_txt,
      'pass', v_txt = 'draft:call:true,armed|ka@cwr-test.example:true:true:Ring om tilbudet,kb@cwr-test.example:true:true:Ring om tilbudet|sending:2|0|true');

    -- 7 -------------------------------------------------------------- the chain waits on the task
    insert into app.crm_campaigns (name, kind, lang, subject, blocks, utm_campaign, follows_id, follow_days, follow_auto, status, scheduled_at)
    values ('Probe kjede · etter', 'campaign', 'no', 'Etter samtalen', '[]', 'probe-etter', v_step, 2, true, 'scheduled', now())
    returning id into v_next;
    select id into v_task from app.crm_activities where campaign_id = v_step and contact_id = v_ka;
    v_txt := (select count(*) from app.crm_follow_audience((select c from app.crm_campaigns c where c.id = v_next)))::text;
    perform public.admin_crm_task_done(v_task);
    v_txt := v_txt || ',' || (select count(*) from app.crm_follow_audience((select c from app.crm_campaigns c where c.id = v_next)));
    update app.crm_activities set done_at = now() - interval '3 days' where id = v_task;
    v_txt := v_txt || ',' || coalesce((select string_agg(x.email, '') from app.crm_follow_audience((select c from app.crm_campaigns c where c.id = v_next)) x), '');
    v_txt := v_txt || ',' || (select app.crm_follow_done(c)::text from app.crm_campaigns c where c.id = v_step);
    v_rows := v_rows || jsonb_build_object('seq', 7,
      'name', 'the mail after the call reaches nobody while the task is open, nobody the day it is done, the contact once the days have passed; the step is not finished while a task is open',
      'expected', '0,0,ka@cwr-test.example,false', 'actual', v_txt, 'pass', v_txt = '0,0,ka@cwr-test.example,false');

    -- 8 -------------------------------------------------------------- skip
    insert into app.crm_activities (company_id, kind, body) values (v_a, 'task', 'Probe for hånd') returning id into v_hand;
    select id into v_task from app.crm_activities where campaign_id = v_step and contact_id = v_kb;
    -- one statement each: a query does not see what a function it calls has just written
    v_txt := public.admin_crm_task_skip(v_hand)->>'error';
    v_txt := v_txt || ',' || coalesce(public.admin_crm_task_skip(v_task)->>'error', 'skipped');
    v_txt := v_txt || ',' || (select skipped::text || ':' || (done_at is not null)::text from app.crm_activities where id = v_task);
    v_txt := v_txt || ',' || (select app.crm_follow_done(c)::text from app.crm_campaigns c where c.id = v_step);
    perform public.admin_crm_task_done(v_task);   -- reopened
    v_txt := v_txt || ',' || (select skipped::text || ':' || (done_at is not null)::text from app.crm_activities where id = v_task);
    v_rows := v_rows || jsonb_build_object('seq', 8,
      'name', 'a hand-made task cannot be skipped; a step''s can, and the step may then finish; reopening takes the skip back',
      'expected', 'not_found,skipped,true:true,true,false:false', 'actual', v_txt, 'pass', v_txt = 'not_found,skipped,true:true,true,false:false');

    -- 9 -------------------------------------------------------------- the readers
    v_json := public.admin_crm_task_list('all');
    v_txt := (select concat_ws(':', r->>'step_kind', r->>'journey', (r->>'campaign_id' = v_step::text)::text)
              from jsonb_array_elements(v_json->'rows') r where r->>'id' = (select id::text from app.crm_activities where campaign_id = v_step and contact_id = v_ka))
      || ',' || ((v_json->'counts'->>'journeys')::int >= 2)::text
      || ',' || (select concat_ws(':', s->>'step_kind', s->'tasks'->>'made', s->'tasks'->>'done', s->'tasks'->>'open')
                 from jsonb_array_elements(public.admin_crm_sequence(v_next)->'steps') s where s->>'step' = '2')
      || ',' || (select concat_ws(':', j->>'mails', j->>'tasks') from jsonb_array_elements(public.admin_crm_journeys()->'rows') j where j->>'id' = v_camp::text)
      || ',' || (public.admin_crm_campaign_resend(v_step, 7)->>'error');
    begin
      insert into app.crm_campaigns (name, subject, utm_campaign, step_kind) values ('Løs', 'Ring', 'probe-los', 'linkedin');
      v_txt := v_txt || ',inserted';
    exception when check_violation then v_txt := v_txt || ',refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 9,
      'name', 'the task list names kind and journey; the sequence counts the step''s tasks; the journey its task step; no resend; no step without one before',
      'expected', 'call:Probe kjede:true,true,call:2:1:1,2:1,invalid_step,refused', 'actual', v_txt,
      'pass', v_txt = 'call:Probe kjede:true,true,call:2:1:1,2:1,invalid_step,refused');

    -- 10 ------------------------------------------------------------- roles
    perform set_config('request.jwt.claims', format(claims, v_ana), true);
    v_txt := concat_ws(',', public.admin_crm_pipeline_summary(null)->>'ok',
      public.admin_crm_step_save(null, jsonb_build_object('follows_id', v_camp, 'step_kind', 'linkedin', 'title', 'x', 'name', 'x', 'follow_days', '2'))->>'error',
      public.admin_crm_task_skip(v_task)->>'error',
      has_function_privilege('anon', 'public.admin_crm_pipeline_summary(timestamptz)', 'execute')::text,
      has_function_privilege('anon', 'public.admin_crm_step_save(uuid, jsonb)', 'execute')::text,
      has_function_privilege('anon', 'public.admin_crm_task_skip(uuid)', 'execute')::text);
    perform set_config('request.jwt.claims', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'an analyst reads the figures, cannot add a step or skip; anon may not ask',
      'expected', 'true,not_allowed,not_allowed,false,false,false', 'actual', v_txt, 'pass', v_txt = 'true,not_allowed,not_allowed,false,false,false');

    raise exception 'rollback';
  exception when others then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 11 --------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id from app.crm_companies where name like '%Probe AS'
    union all select id from auth.users where email like '%@cwr-test.example'
    union all select id from app.crm_contacts where email like '%@cwr-test.example') x;
  v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._cwr
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

commit;

select seq, name, expected, actual, pass from public._cwr order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._cwr;
  if v_failed is not null then raise exception 'crm win rate invariants failed: %', v_failed; end if;
  if v_count <> 12 then raise exception 'crm win rate invariants: expected 12 rows, got %', v_count; end if;
end $$;
