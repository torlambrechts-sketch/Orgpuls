-- ticketing_p2_invariants.sql — ticketing Phase 2 (0135): ratings, canned replies edited in the
-- admin, reporting and @mentions, proved against the live schema.
--
--   * the new tables have RLS on, no policy and no client privilege; anon may call the two rating
--     functions and nothing else new; the helpers are nobody's (1, 2)
--   * only a reply that resolves carries a rating link; a note and an ordinary reply do not (3)
--   * the claim mints a 256-bit key, stores only its SHA-256, expiring in 30 days (4)
--   * the key opens the page; unknown and malformed keys answer `invalid` (5)
--   * a rating is given once: input is checked before the key, a spent key answers exactly as an
--     unknown one, the timeline gets the rating and not the comment (6)
--   * an expired key answers `invalid` (7); a given rating cannot be changed (8)
--   * a key claimed again after a failed send is replaced; a used one is never re-minted (9)
--   * past 200 misses in ten minutes both functions answer `rate_limited`; a miss is a time only (10)
--   * canned replies: support and super-admins with a second factor create, edit, archive and
--     restore, each audited; an archived reply is not offered; bad input is refused (11, 12)
--   * @mentions: a note records the ticket admins it names — not its author, not a non-ticket
--     admin, not an address in the text, never from a reply; the count, the list, seen on
--     opening, and «mark all seen» (13)
--   * the new readers refuse finance, a customer and aal1 (14)
--   * the report counts real rows: volume, queues, types, first reply and resolution met/missed,
--     ratings; its window is one of four (15, 16)
--   * no new function reads a response-level table (17)
--   * nothing written here survives (18)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/ticketing_p2_invariants.sql

create unlogged table if not exists public._tp2(seq int, name text, expected text, actual text, pass bool);
truncate public._tp2;

do $$
declare
  v_sup   uuid := '00000000-0000-4000-8000-0000000f3501';
  v_sup2  uuid := '00000000-0000-4000-8000-0000000f3502';
  v_fin   uuid := '00000000-0000-4000-8000-0000000f3503';
  v_dl    uuid;
  v_a     uuid;
  v_b     uuid;
  v_c     uuid;
  v_ma    uuid;
  v_mb    uuid;
  v_mc    uuid;
  v_can   uuid;
  v_key   text;
  v_key2  text;
  v_other text := repeat('0123456789abcdef', 4);
  v_r0    jsonb;
  v_r1    jsonb;
  v_json  jsonb;
  v_txt   text;
  v_ok    boolean;
  v_rows  jsonb := '[]';
  claims  constant text := '{"sub":"%s","role":"authenticated","aal":"%s"}';
begin
  -- 1 ---------------------------------------------------------------- the tables' posture
  select string_agg(c.relname || ':' || c.relrowsecurity
           || '/' || (select count(*) from pg_policies p where p.schemaname = 'app' and p.tablename = c.relname)
           || '/' || (select count(*) from information_schema.role_table_grants g
                      where g.table_schema = 'app' and g.table_name = c.relname and g.grantee in ('anon', 'authenticated')),
           ' ' order by c.relname) into v_txt
  from pg_class c where c.oid in ('app.ticket_csat'::regclass, 'app.csat_misses'::regclass, 'app.ticket_mentions'::regclass);
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'the new tables: RLS on, no policy, no client privilege',
    'expected', 'csat_misses:true/0/0 ticket_csat:true/0/0 ticket_mentions:true/0/0', 'actual', v_txt,
    'pass', v_txt = 'csat_misses:true/0/0 ticket_csat:true/0/0 ticket_mentions:true/0/0');

  -- 2 ---------------------------------------------------------------- who may call what
  select string_agg(p.proname, ',' order by p.proname) into v_txt from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('csat_open', 'csat_submit', 'admin_ticket_mentions', 'admin_ticket_mentions_seen',
    'admin_canned_replies', 'admin_canned_reply_save', 'admin_canned_reply_active', 'admin_ticket_report')
    and has_function_privilege('anon', p.oid, 'execute');
  v_ok := v_txt = 'csat_open,csat_submit'
    and not has_function_privilege('authenticated', 'app.csat_miss()', 'execute')
    and not has_function_privilege('anon', 'app.csat_miss()', 'execute')
    and not has_function_privilege('authenticated', 'app.ticket_mention(uuid,uuid,text)', 'execute')
    and not has_function_privilege('authenticated', 'app.ticket_mentions_unseen()', 'execute')
    and has_function_privilege('authenticated', 'public.admin_ticket_report(int)', 'execute')
    and not has_function_privilege('authenticated', 'public.ticket_mail_claim(int)', 'execute');
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'anon may rate and nothing else new; the helpers and the claim are no client''s',
    'expected', 'csat_open,csat_submit', 'actual', coalesce(v_txt, 'none'), 'pass', v_ok);

  begin
    insert into auth.users (id, email) values (v_sup, 'probe.sup@tp2-probe.no'), (v_sup2, 'probe.sup2@tp2-probe.no'),
      (v_fin, 'probe.fin@tp2-probe.no');
    insert into app.platform_admins (user_id, role) values (v_sup, 'support'), (v_sup2, 'support'), (v_fin, 'finance');
    select m.user_id into v_dl from app.memberships m where m.role = 'daglig_leder' and m.active limit 1;

    perform set_config('request.jwt.claims', format(claims, v_sup, 'aal2'), true);
    v_r0 := public.admin_ticket_report(4);

    -- three tickets ten days old: A answered in time, B answered late, C not answered
    insert into app.tickets (category, queue, type, subject, channel, requester_email, created_at)
    values ('getting_started', 'support', 'question', 'Probe A', 'contact_form', 'a@tp2-probe.no', now() - interval '10 days')
    returning id into v_a;
    insert into app.tickets (category, queue, type, subject, channel, requester_email, created_at)
    values ('getting_started', 'support', 'question', 'Probe B', 'contact_form', 'b@tp2-probe.no', now() - interval '10 days')
    returning id into v_b;
    insert into app.tickets (category, queue, type, subject, channel, requester_email, created_at)
    values ('getting_started', 'support', 'question', 'Probe C', 'contact_form', 'c@tp2-probe.no', now() - interval '10 days')
    returning id into v_c;
    update app.tickets set first_responded_at = created_at + interval '1 minute' where id = v_a;
    update app.tickets set first_responded_at = first_response_due + interval '1 minute' where id = v_b;

    -- 3 -------------------------------------------------------------- which mail carries a link
    perform public.admin_ticket_reply(v_a, 'Hei, dette er løst nå.', false, 'resolved');
    perform public.admin_ticket_reply(v_b, 'Hei, vi ser på det.', false, null);
    perform public.admin_ticket_reply(v_c, 'Intern: vent med svar.', true, null);
    select tm.id into v_ma from app.ticket_mail tm join app.ticket_messages m on m.id = tm.message_id where m.ticket_id = v_a;
    select tm.id into v_mb from app.ticket_mail tm join app.ticket_messages m on m.id = tm.message_id where m.ticket_id = v_b;
    v_txt := concat_ws(',',
      (select tm.csat from app.ticket_mail tm where tm.id = v_ma),
      (select tm.csat from app.ticket_mail tm where tm.id = v_mb),
      (select count(*) from app.ticket_mail tm join app.ticket_messages m on m.id = tm.message_id where m.ticket_id = v_c));
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'only a reply that resolves carries a rating link; a note sends nothing',
      'expected', 't,f,0', 'actual', v_txt, 'pass', v_txt = 't,f,0');

    -- 4 -------------------------------------------------------------- the key
    perform set_config('request.jwt.claims', '', true);
    v_json := public.ticket_mail_claim(50);
    select j->>'csat_key' into v_key from jsonb_array_elements(v_json) j where j->>'id' = v_ma::text;
    v_ok := v_key ~ '^[0-9a-f]{64}$'
      and (select c.token_hash = extensions.digest(v_key, 'sha256') from app.ticket_csat c where c.mail_id = v_ma)
      and (select abs(extract(epoch from c.expires_at - (now() + interval '30 days'))) < 5 from app.ticket_csat c where c.mail_id = v_ma)
      and not exists (select 1 from app.ticket_csat c where to_jsonb(c)::text like '%' || v_key || '%')
      and not exists (select 1 from app.ticket_mail tm where to_jsonb(tm)::text like '%' || v_key || '%')
      and (select j->>'csat_key' from jsonb_array_elements(v_json) j where j->>'id' = v_mb::text) is null;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'the claim mints a 256-bit key, keeps only its SHA-256, 30 days',
      'expected', 'true', 'actual', coalesce(v_ok, false)::text, 'pass', coalesce(v_ok, false));

    -- 5 -------------------------------------------------------------- the page opens
    v_txt := concat_ws(',',
      (public.csat_open(v_key)->>'number') = (select number::text from app.tickets where id = v_a),
      public.csat_open(v_other)->>'error',
      public.csat_open('abc')->>'error',
      public.csat_open(null)->>'error');
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'the key opens the page with its case number; unknown and malformed do not',
      'expected', 't,invalid,invalid,invalid', 'actual', v_txt, 'pass', v_txt = 't,invalid,invalid,invalid');

    -- 6 -------------------------------------------------------------- once
    v_txt := concat_ws(',',
      public.csat_submit(v_key, 0, null)->>'error',
      public.csat_submit(v_key, 4, repeat('x', 2001))->>'error',
      public.csat_submit(v_key, 4, '  Rask hjelp  ')->>'ok',
      (public.csat_submit(v_key, 5, null) = public.csat_submit(v_other, 5, null))::text,
      public.csat_submit(v_key, 5, null)->>'error',
      public.csat_open(v_key)->>'error');
    v_txt := v_txt || ',' || (select c.rating || '/' || c.comment from app.ticket_csat c where c.mail_id = v_ma)
      || ',' || (select e.detail::text from app.ticket_events e where e.ticket_id = v_a and e.kind = 'csat');
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'a rating is given once; a spent key answers as an unknown one; the timeline has no comment',
      'expected', 'invalid_rating,too_long,true,true,invalid,invalid,4/Rask hjelp,{"rating": 4}', 'actual', v_txt,
      'pass', v_txt = 'invalid_rating,too_long,true,true,invalid,invalid,4/Rask hjelp,{"rating": 4}');

    -- 7 -------------------------------------------------------------- expired
    insert into app.ticket_csat (ticket_id, mail_id, token_hash, expires_at)
    values (v_b, v_mb, extensions.digest(repeat('e', 64), 'sha256'), now() - interval '1 minute');
    v_txt := concat_ws(',', public.csat_open(repeat('e', 64))->>'error', public.csat_submit(repeat('e', 64), 3, null)->>'error');
    delete from app.ticket_csat where mail_id = v_mb;
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'an expired key answers invalid', 'expected', 'invalid,invalid',
      'actual', v_txt, 'pass', v_txt = 'invalid,invalid');

    -- 8 -------------------------------------------------------------- fixed
    begin
      update app.ticket_csat set rating = 1 where mail_id = v_ma;
      v_txt := 'changed';
    exception when raise_exception then v_txt := 'refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'a given rating cannot be changed', 'expected', 'refused',
      'actual', v_txt, 'pass', v_txt = 'refused');

    -- the report after the probes: the sent mail counts as a link sent
    perform public.ticket_mail_done(v_ma, true, 'probe', null, false);
    perform set_config('request.jwt.claims', format(claims, v_sup, 'aal2'), true);
    v_r1 := public.admin_ticket_report(4);

    -- 9 -------------------------------------------------------------- claimed again
    perform public.admin_ticket_reply(v_c, 'Hei, dette er løst.', false, 'resolved');
    select tm.id into v_mc from app.ticket_mail tm join app.ticket_messages m on m.id = tm.message_id where m.ticket_id = v_c;
    perform set_config('request.jwt.claims', '', true);
    select j->>'csat_key' into v_key2 from jsonb_array_elements(public.ticket_mail_claim(50)) j where j->>'id' = v_mc::text;
    perform public.ticket_mail_done(v_mc, false, null, 'timeout', false);
    update app.ticket_mail set status = 'pending' where id = v_ma;
    v_json := public.ticket_mail_claim(50);
    v_txt := concat_ws(',',
      public.csat_open(v_key2)->>'error',
      (select (public.csat_open(j->>'csat_key')->>'ok') from jsonb_array_elements(v_json) j where j->>'id' = v_mc::text),
      coalesce((select j->>'csat_key' from jsonb_array_elements(v_json) j where j->>'id' = v_ma::text), 'none'),
      (select c.rating from app.ticket_csat c where c.mail_id = v_ma));
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'a key claimed again is replaced; a used one is never re-minted',
      'expected', 'invalid,true,none,4', 'actual', v_txt, 'pass', v_txt = 'invalid,true,none,4');

    -- 10 ------------------------------------------------------------- the limit
    select j->>'csat_key' into v_key2 from jsonb_array_elements(v_json) j where j->>'id' = v_mc::text;
    insert into app.csat_misses (at) select now() from generate_series(1, 200);
    v_txt := concat_ws(',', public.csat_open(v_key2)->>'error', public.csat_submit(v_key2, 5, null)->>'error',
      (select string_agg(a.attname, '/' order by a.attnum) from pg_attribute a
       where a.attrelid = 'app.csat_misses'::regclass and a.attnum > 0 and not a.attisdropped));
    delete from app.csat_misses where at > now() - interval '1 minute';
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'past 200 misses in ten minutes both answer rate_limited; a miss is a time',
      'expected', 'rate_limited,rate_limited,id/at', 'actual', v_txt, 'pass', v_txt = 'rate_limited,rate_limited,id/at');

    -- 11 ------------------------------------------------------------- canned replies
    perform set_config('request.jwt.claims', format(claims, v_fin, 'aal2'), true);
    v_txt := public.admin_canned_replies()->>'error';
    v_txt := v_txt || ',' || (public.admin_canned_reply_save(null, 'Probe', 'Hei', 0)->>'error');
    perform set_config('request.jwt.claims', format(claims, v_sup, 'aal1'), true);
    v_txt := v_txt || ',' || (public.admin_canned_reply_save(null, 'Probe', 'Hei', 0)->>'error');
    perform set_config('request.jwt.claims', format(claims, v_sup, 'aal2'), true);
    v_can := (public.admin_canned_reply_save(null, 'Probe svar', E'Hei,\n\nProbe.', 7)->>'id')::uuid;
    -- one statement each: a statement's subqueries do not see what a function earlier in it wrote
    v_txt := v_txt || ',' || (public.admin_canned_reply_save(v_can, 'Probe svar 2', 'Hei igjen', 8)->>'ok');
    v_txt := v_txt || ',' || (select c.title || '/' || c.sort || '/' || (c.key ~ '^[a-z0-9_]+$') from app.canned_replies c where c.id = v_can);
    v_txt := v_txt || ',' || (public.admin_canned_reply_active(v_can, false)->>'ok');
    v_txt := v_txt || ',' || (select count(*) from jsonb_array_elements(public.admin_ticket(v_a)->'canned') x where x->>'id' = v_can::text);
    v_txt := v_txt || ',' || (public.admin_canned_reply_active(v_can, true)->>'ok');
    v_txt := v_txt || ',' || (select count(*) from jsonb_array_elements(public.admin_ticket(v_a)->'canned') x where x->>'id' = v_can::text);
    v_txt := v_txt || ',' || (select string_agg(a.action, '/' order by a.id) from app.admin_audit a
                 where a.admin_id = v_sup and a.target_type = 'canned_reply' and a.target_id = v_can::text);
    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'canned replies: support with aal2 edits, archives and restores, audited',
      'expected', 'not_allowed,not_allowed,not_allowed,true,Probe svar 2/8/true,true,0,true,1,ticket.canned_create/ticket.canned_update/ticket.canned_archive/ticket.canned_restore',
      'actual', v_txt,
      'pass', v_txt = 'not_allowed,not_allowed,not_allowed,true,Probe svar 2/8/true,true,0,true,1,ticket.canned_create/ticket.canned_update/ticket.canned_archive/ticket.canned_restore');

    -- 12 ------------------------------------------------------------- bad input
    v_txt := concat_ws(',',
      public.admin_canned_reply_save(null, '  ', 'Hei', 0)->>'error',
      public.admin_canned_reply_save(null, 'Tittel', repeat('x', 10001), 0)->>'error',
      public.admin_canned_reply_save(null, 'Tittel', 'Hei', 1000)->>'error',
      public.admin_canned_reply_save(gen_random_uuid(), 'Tittel', 'Hei', 0)->>'error',
      public.admin_canned_reply_active(gen_random_uuid(), false)->>'error');
    v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'a canned reply without a title, too long or unknown is refused',
      'expected', 'invalid,invalid,invalid,not_found,not_found', 'actual', v_txt,
      'pass', v_txt = 'invalid,invalid,invalid,not_found,not_found');

    -- 13 ------------------------------------------------------------- mentions
    perform public.admin_ticket_reply(v_b, 'Kan @probe.sup2 se på dette? Kunden kari@firma.no venter. @probe.sup og @probe.fin, @nobody.',
                                      true, null);
    perform public.admin_ticket_reply(v_b, 'Hei, @probe.sup2 tar saken.', false, null);
    v_txt := (select string_agg(u.email, '/' order by u.email) from app.ticket_mentions mt join auth.users u on u.id = mt.admin_id
              where mt.ticket_id = v_b);
    perform set_config('request.jwt.claims', format(claims, v_sup2, 'aal2'), true);
    v_json := public.admin_ticket_mentions(false);
    v_txt := concat_ws(',', v_txt, v_json->>'mentions_unseen', jsonb_array_length(v_json->'rows'),
      (v_json->'rows'->0->>'number') = (select number::text from app.tickets where id = v_b),
      public.admin_tickets(null, 'all', null)->>'mentions_unseen',
      (select jsonb_array_length(m->'mentions') from jsonb_array_elements(public.admin_ticket(v_b)->'messages') m where (m->>'internal')::boolean),
      public.admin_ticket_report(4)->>'mentions_unseen');
    perform set_config('request.jwt.claims', format(claims, v_sup, 'aal2'), true);
    perform public.admin_ticket_reply(v_c, '@PROBE.SUP2: en til.', true, null);
    perform set_config('request.jwt.claims', format(claims, v_sup2, 'aal2'), true);
    v_txt := concat_ws(',', v_txt, public.admin_canned_replies()->>'mentions_unseen',
      public.admin_ticket_mentions_seen(null)->>'n', public.admin_ticket_mentions(false)->>'mentions_unseen',
      jsonb_array_length(public.admin_ticket_mentions(false)->'rows'));
    v_rows := v_rows || jsonb_build_object('seq', 13, 'name', 'a note records the ticket admins it names; count, list, seen on opening, mark all seen',
      'expected', 'probe.sup2@tp2-probe.no,1,1,t,1,1,0,1,1,0,2', 'actual', v_txt,
      'pass', v_txt = 'probe.sup2@tp2-probe.no,1,1,t,1,1,0,1,1,0,2');

    -- 14 ------------------------------------------------------------- the readers' doors
    perform set_config('request.jwt.claims', format(claims, v_fin, 'aal2'), true);
    v_txt := concat_ws(',', public.admin_ticket_mentions(false)->>'error', public.admin_ticket_mentions_seen(null)->>'error',
      public.admin_ticket_report(4)->>'error');
    perform set_config('request.jwt.claims', format(claims, v_dl, 'aal2'), true);
    v_txt := concat_ws(',', v_txt, public.admin_ticket_report(4)->>'error', public.admin_canned_replies()->>'error');
    perform set_config('request.jwt.claims', format(claims, v_sup, 'aal1'), true);
    v_txt := concat_ws(',', v_txt, public.admin_ticket_report(4)->>'error', public.admin_ticket_mentions(false)->>'error');
    v_rows := v_rows || jsonb_build_object('seq', 14, 'name', 'the new readers refuse finance, a customer and aal1',
      'expected', 'not_allowed,not_allowed,not_allowed,not_allowed,not_allowed,not_allowed,not_allowed', 'actual', v_txt,
      'pass', v_txt = 'not_allowed,not_allowed,not_allowed,not_allowed,not_allowed,not_allowed,not_allowed');

    -- 15 ------------------------------------------------------------- the report counts real rows
    v_txt := concat_ws(',',
      (v_r1->>'total')::int - (v_r0->>'total')::int,
      (v_r1->>'total')::int = (select count(*) from app.tickets t where t.created_at >= (v_r1->>'since')::timestamptz),
      (select sum((w->>'n')::int) from jsonb_array_elements(v_r1->'weekly') w) = (v_r1->>'total')::int,
      jsonb_array_length(v_r1->'weekly'),
      coalesce((v_r1->'by_queue'->>'support')::int, 0) - coalesce((v_r0->'by_queue'->>'support')::int, 0),
      coalesce((v_r1->'by_type'->>'question')::int, 0) - coalesce((v_r0->'by_type'->>'question')::int, 0),
      (v_r1->'first_reply'->>'met')::int - (v_r0->'first_reply'->>'met')::int,
      (v_r1->'first_reply'->>'missed')::int - (v_r0->'first_reply'->>'missed')::int,
      (v_r1->'resolution'->>'met')::int - (v_r0->'resolution'->>'met')::int,
      (v_r1->'resolution'->>'pending')::int - (v_r0->'resolution'->>'pending')::int,
      (v_r1->'csat'->>'rated')::int - (v_r0->'csat'->>'rated')::int,
      coalesce((v_r1->'csat'->'dist'->>'4')::int, 0) - coalesce((v_r0->'csat'->'dist'->>'4')::int, 0),
      (v_r1->'csat'->>'sent')::int - (v_r0->'csat'->>'sent')::int,
      (v_r1->'csat'->>'average')::numeric = (select round(avg(c.rating)::numeric, 2) from app.ticket_csat c
                                             where c.rated_at >= (v_r1->>'since')::timestamptz),
      (v_r1->'first_reply'->>'median_hours') is not null);
    v_rows := v_rows || jsonb_build_object('seq', 15, 'name', 'the report counts the real rows: volume, queue, type, deadlines met and missed, ratings',
      'expected', '3,t,t,4,3,3,1,2,1,2,1,1,1,t,t', 'actual', v_txt,
      'pass', v_txt = '3,t,t,4,3,3,1,2,1,2,1,1,1,t,t');

    -- 16 ------------------------------------------------------------- the window
    perform set_config('request.jwt.claims', format(claims, v_sup, 'aal2'), true);
    v_txt := concat_ws(',', public.admin_ticket_report(5)->>'error', public.admin_ticket_report(null)->>'error',
      jsonb_array_length(public.admin_ticket_report(52)->'weekly'),
      exists (select 1 from app.admin_audit a where a.admin_id = v_sup and a.action = 'tickets.report'));
    v_rows := v_rows || jsonb_build_object('seq', 16, 'name', 'the report''s window is 4, 12, 26 or 52 weeks, and reading it is audited',
      'expected', 'invalid,invalid,52,t', 'actual', v_txt, 'pass', v_txt = 'invalid,invalid,52,t');

    perform set_config('request.jwt.claims', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 17 --------------------------------------------------------------- no answer table
  select string_agg(p.proname, ', ') into v_txt from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'app') and (p.proname like '%csat%' or p.proname like '%mention%' or p.proname like '%canned%'
    or p.proname = 'admin_ticket_report')
    and p.prosrc ~* 'app\.(responses|answers|extra_answers|response_comments)\M';
  v_rows := v_rows || jsonb_build_object('seq', 17, 'name', 'no new function reads a response-level table', 'expected', 'none',
    'actual', coalesce(v_txt, 'none'), 'pass', v_txt is null);

  -- 18 --------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id::text from auth.users where email like '%@tp2-probe.no'
    union all select id::text from app.tickets where requester_email like '%@tp2-probe.no'
    union all select id::text from app.canned_replies where title like 'Probe svar%') x;
  v_rows := v_rows || jsonb_build_object('seq', 18, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._tp2
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._tp2 order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._tp2;
  if v_failed is not null then raise exception 'ticketing p2 invariants failed: %', v_failed; end if;
  if v_count <> 18 then raise exception 'ticketing p2 invariants: expected 18 rows, got %', v_count; end if;
end $$;

drop table public._tp2;
