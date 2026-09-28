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

\echo === probe4
reset role;
update app.employees set email = 'ansatt10@auditprobe-orgpuls.no' where org_id='aa000000-0000-4000-8000-0000000000a1' and full_name='Ansatt 10';
insert into app.survey_defaults (org_id, quiet_hours) values ('aa000000-0000-4000-8000-0000000000a1', false) on conflict (org_id) do update set quiet_hours = false;
update app.organizations set invite_greeting = 'Org-hilsen', invite_greeting_by = 'aa000000-0000-4000-8000-00000000d001' where id = 'aa000000-0000-4000-8000-0000000000a1';
update app.rounds set intro_message = 'Rundens egen intro', intro_by = 'aa000000-0000-4000-8000-00000000d001' where id = 'aa000000-0000-4000-8000-00000000f003';
insert into app.outbox (org_id, round_id, kind, audience, due_at, invitation_id)
 select org_id, round_id, 'invitasjon', 'alle_ansatte', now() - interval '1 minute', id from app.invitations where round_id = 'aa000000-0000-4000-8000-00000000f003';
select 'claim', j->>'kind', j->'greeting', j->'since'->>'first', jsonb_array_length(j->'since'->'items'), (j ? 'token') from jsonb_array_elements(public.dispatch_claim(5)) j;
select 'outbox after', kind, failed_at is not null, last_error, claimed_at is not null from app.outbox where org_id='aa000000-0000-4000-8000-0000000000a1';
select 'tz', timezone, extract(hour from now() at time zone timezone) from app.organizations where id='aa000000-0000-4000-8000-0000000000a1';
rollback;
