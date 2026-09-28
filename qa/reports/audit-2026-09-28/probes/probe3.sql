\set ON_ERROR_ROLLBACK on
\set ON_ERROR_STOP off
set client_min_messages = notice;
begin;
insert into app.organizations (id, name, org_number, employee_count, mail_enabled) values
 ('aa000000-0000-4000-8000-0000000000a1','Audit P AS','999100001',20,true), ('aa000000-0000-4000-8000-0000000000a2','Audit X AS','999100002',20,true);
insert into auth.users (id, email) values
 ('aa000000-0000-4000-8000-00000000d001','dl@audit-p.example'),('aa000000-0000-4000-8000-00000000d002','ala@audit-p.example'),('aa000000-0000-4000-8000-00000000d003','alb@audit-p.example'),
 ('aa000000-0000-4000-8000-00000000d004','vo@audit-p.example'),('aa000000-0000-4000-8000-00000000d005','dl@audit-x.example');
insert into app.profiles (id, full_name) values ('aa000000-0000-4000-8000-00000000d001','Dina Audit'),('aa000000-0000-4000-8000-00000000d002','Anne A'),('aa000000-0000-4000-8000-00000000d003','Bjorn B'),('aa000000-0000-4000-8000-00000000d004','Vera V'),('aa000000-0000-4000-8000-00000000d005','Xander X');
insert into app.groups (id, org_id, name) values ('aa000000-0000-4000-8000-00000000aa01','aa000000-0000-4000-8000-0000000000a1','Gruppe A'),('aa000000-0000-4000-8000-00000000bb01','aa000000-0000-4000-8000-0000000000a1','Gruppe B');
insert into app.memberships (org_id, user_id, role) values ('aa000000-0000-4000-8000-0000000000a1','aa000000-0000-4000-8000-00000000d001','daglig_leder'),('aa000000-0000-4000-8000-0000000000a1','aa000000-0000-4000-8000-00000000d004','verneombud'),('aa000000-0000-4000-8000-0000000000a2','aa000000-0000-4000-8000-00000000d005','daglig_leder');
insert into app.memberships (org_id, user_id, role, group_id) values ('aa000000-0000-4000-8000-0000000000a1','aa000000-0000-4000-8000-00000000d002','avdelingsleder','aa000000-0000-4000-8000-00000000aa01'),('aa000000-0000-4000-8000-0000000000a1','aa000000-0000-4000-8000-00000000d003','avdelingsleder','aa000000-0000-4000-8000-00000000bb01');
insert into app.employees (org_id, group_id, full_name, email)
 select 'aa000000-0000-4000-8000-0000000000a1', case when i <= 4 then 'aa000000-0000-4000-8000-00000000aa01'::uuid else 'aa000000-0000-4000-8000-00000000bb01'::uuid end, 'Ansatt '||i, 'e'||i||'@audit-p.example' from generate_series(1,10) i;
insert into app.measurements (id, org_id, kind, year, label) values
 ('aa000000-0000-4000-8000-00000000e001','aa000000-0000-4000-8000-0000000000a1','grunnlinje',2025,'G25'),
 ('aa000000-0000-4000-8000-00000000e002','aa000000-0000-4000-8000-0000000000a1','grunnlinje',2026,'G26'),
 ('aa000000-0000-4000-8000-00000000e003','aa000000-0000-4000-8000-0000000000a1','puls',2026,'P26'),
 ('aa000000-0000-4000-8000-00000000e004','aa000000-0000-4000-8000-0000000000a2','puls',2026,'X26');
insert into app.rounds (id, org_id, measurement_id, status, opens_at, closes_at, frozen_at) values
 ('aa000000-0000-4000-8000-00000000f001','aa000000-0000-4000-8000-0000000000a1','aa000000-0000-4000-8000-00000000e001','lukket', now()-interval '130 days', now()-interval '120 days', now()-interval '120 days'),
 ('aa000000-0000-4000-8000-00000000f002','aa000000-0000-4000-8000-0000000000a1','aa000000-0000-4000-8000-00000000e002','lukket', now()-interval '30 days', now()-interval '20 days', now()-interval '20 days');
insert into app.rounds (id, org_id, measurement_id, status, opens_at, closes_at) values
 ('aa000000-0000-4000-8000-00000000f003','aa000000-0000-4000-8000-0000000000a1','aa000000-0000-4000-8000-00000000e003','apen', now()-interval '1 day', now()+interval '6 days'),
 ('aa000000-0000-4000-8000-00000000f004','aa000000-0000-4000-8000-0000000000a1','aa000000-0000-4000-8000-00000000e003','planlagt', now()+interval '10 days', now()+interval '17 days'),
 ('aa000000-0000-4000-8000-00000000f005','aa000000-0000-4000-8000-0000000000a2','aa000000-0000-4000-8000-00000000e004','planlagt', now()+interval '10 days', now()+interval '17 days');
insert into app.round_factors (org_id, round_id, factor_key) select 'aa000000-0000-4000-8000-0000000000a1', 'aa000000-0000-4000-8000-00000000f002', key from app.factors on conflict do nothing;
insert into app.round_factors (org_id, round_id, factor_key) values ('aa000000-0000-4000-8000-0000000000a1','aa000000-0000-4000-8000-00000000f003','ytring') on conflict do nothing;
-- round R_c: group A 4 respondents answer 1 everywhere, group B 5 respondents answer 5; each comments on ytring #1
do $$ declare i int; v uuid; g uuid; val int; begin
  for i in 1..9 loop
    g := case when i <= 4 then 'aa000000-0000-4000-8000-00000000aa01'::uuid else 'aa000000-0000-4000-8000-00000000bb01'::uuid end;
    val := case when i <= 4 then 1 else 5 end;
    insert into app.responses (org_id, round_id, group_id, submitted_hour)
      values ('aa000000-0000-4000-8000-0000000000a1','aa000000-0000-4000-8000-00000000f002', g, date_trunc('hour', now()-interval '25 days')) returning id into v;
    insert into app.answers (response_id, factor_key, ordinal, value)
      select v, s.factor_key, s.ordinal, val from app.statements s;
    insert into app.response_comments (response_id, factor_key, ordinal, body)
      values (v, 'ytring', 1, case when i <= 4 then 'A-SECRET-COMMENT ' else 'B-comment ' end || i);
    insert into app.comment_threads (org_id, response_id, factor_key, ordinal, key_hash, opened_hour)
      values ('aa000000-0000-4000-8000-0000000000a1', v, 'ytring', 1, extensions.digest('k'||i||gen_random_uuid(), 'sha256'), date_trunc('hour', now()-interval '25 days'));
  end loop;
end $$;
insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at, responded_at)
 select 'aa000000-0000-4000-8000-0000000000a1','aa000000-0000-4000-8000-00000000f002', e.id, extensions.digest('inv'||e.id, 'sha256'), now()-interval '20 days', now()-interval '25 days'
 from app.employees e where e.org_id='aa000000-0000-4000-8000-0000000000a1' and e.full_name <> 'Ansatt 10';
insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at)
 select 'aa000000-0000-4000-8000-0000000000a1','aa000000-0000-4000-8000-00000000f003', e.id, extensions.digest('audit-probe-token-0123456789abcdef', 'sha256'), now()+interval '6 days'
 from app.employees e where e.org_id='aa000000-0000-4000-8000-0000000000a1' and e.full_name = 'Ansatt 10';
insert into app.measures (org_id, factor_key, title, step) values ('aa000000-0000-4000-8000-0000000000a1','ytring','Audit tiltak hele huset','pagar');
insert into app.measures (org_id, round_id, factor_key, title, step) values ('aa000000-0000-4000-8000-0000000000a1','aa000000-0000-4000-8000-00000000f002','ytring','Audit tiltak runde','pagar');
insert into app.year_wheels (id, org_id) values ('aa000000-0000-4000-8000-00000000cc01','aa000000-0000-4000-8000-0000000000a1');
insert into app.wheel_notifications (wheel_id, audience, lead_days, sort_order) values ('aa000000-0000-4000-8000-00000000cc01','alle_ansatte',1,5);
insert into app.evaluations (org_id, held_on, note) values ('aa000000-0000-4000-8000-0000000000a1', current_date - 10, 'P eval'), ('aa000000-0000-4000-8000-0000000000a2', current_date - 10, 'X eval');
insert into app.org_logos (org_id, key, mime, content) values
 ('aa000000-0000-4000-8000-0000000000a1','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1','image/png','\x89504e470d0a1a0a00'::bytea),
 ('aa000000-0000-4000-8000-0000000000a2','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2','image/png','\x89504e470d0a1a0a01'::bytea);
select 'setup done', set_config('audit.slug', (select share_slug from app.rounds where id='aa000000-0000-4000-8000-00000000f002'), true), (select results_publish_on from app.rounds where id='aa000000-0000-4000-8000-00000000f002') as pub;

\echo === probe3
reset role;
insert into app.wheel_notifications (wheel_id, audience, lead_days, sort_order) values
 ('aa000000-0000-4000-8000-00000000cc01','verneombud',2,1),('aa000000-0000-4000-8000-00000000cc01','daglig_leder',2,3),('aa000000-0000-4000-8000-00000000cc01','avdelingsledere',7,4);
-- verneombud tries the chip
select set_config('request.jwt.claims', json_build_object('sub','aa000000-0000-4000-8000-00000000d004','role','authenticated')::text, true) \g /dev/null
set local role authenticated;
with u as (update app.year_wheels set notify_lead_days = 21 where id='aa000000-0000-4000-8000-00000000cc01' returning 1) select 'VO wheel update rows', count(*) from u;
reset role;
select 'after VO', string_agg(audience||'='||lead_days, ',' order by sort_order) from app.wheel_notifications where wheel_id='aa000000-0000-4000-8000-00000000cc01';
-- daglig leder moves the chip
select set_config('request.jwt.claims', json_build_object('sub','aa000000-0000-4000-8000-00000000d001','role','authenticated')::text, true) \g /dev/null
set local role authenticated;
with u as (update app.year_wheels set notify_lead_days = 21 where id='aa000000-0000-4000-8000-00000000cc01' returning 1) select 'DL wheel update rows', count(*) from u;
reset role;
select 'after DL', string_agg(audience||'='||lead_days, ',' order by sort_order) from app.wheel_notifications where wheel_id='aa000000-0000-4000-8000-00000000cc01';
-- evaluation dated in the future, as the verneombud, through RLS as addEvaluation does
select 'status before', public.evaluation_status('aa000000-0000-4000-8000-0000000000a1') from (select set_config('request.jwt.claims', json_build_object('sub','aa000000-0000-4000-8000-00000000d001','role','authenticated')::text, true)) x;
select set_config('request.jwt.claims', json_build_object('sub','aa000000-0000-4000-8000-00000000d004','role','authenticated')::text, true) \g /dev/null
set local role authenticated;
insert into app.evaluations (org_id, held_on) values ('aa000000-0000-4000-8000-0000000000a1', date '2099-01-01');
select 'status after future eval', public.evaluation_status('aa000000-0000-4000-8000-0000000000a1');
reset role;
-- set_round_send publish range on a round without a close
update app.rounds set closes_at = null where id = 'aa000000-0000-4000-8000-00000000f004';
select set_config('request.jwt.claims', json_build_object('sub','aa000000-0000-4000-8000-00000000d001','role','authenticated')::text, true) \g /dev/null
set local role authenticated;
select 'set_round_send no close, 2099', public.set_round_send('aa000000-0000-4000-8000-00000000f004', null, date '2099-01-01');
reset role;
update app.rounds set closes_at = now() + interval '17 days' where id = 'aa000000-0000-4000-8000-00000000f004';
select 'publish_on after close set', results_publish_on, (closes_at at time zone 'Europe/Oslo')::date as close_on from app.rounds where id='aa000000-0000-4000-8000-00000000f004';
rollback;
