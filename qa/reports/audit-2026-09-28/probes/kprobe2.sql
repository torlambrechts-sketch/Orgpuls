\set ON_ERROR_ROLLBACK on
begin;
insert into app.organizations (id, name, org_number, employee_count) values ('aa000000-0000-4000-8000-0000000000b1','Audit Five AS','999100003',5);
insert into auth.users (id, email) values ('aa000000-0000-4000-8000-00000000d0b1','dl@audit-five.example');
insert into app.profiles (id, full_name) values ('aa000000-0000-4000-8000-00000000d0b1','DL Five');
insert into app.memberships (org_id, user_id, role) values ('aa000000-0000-4000-8000-0000000000b1','aa000000-0000-4000-8000-00000000d0b1','daglig_leder');
insert into app.measurements (id, org_id, kind, year, label) values ('aa000000-0000-4000-8000-00000000e0b1','aa000000-0000-4000-8000-0000000000b1','grunnlinje',2026,'G');
insert into app.rounds (id, org_id, measurement_id, status, opens_at, closes_at, frozen_at) values
 ('aa000000-0000-4000-8000-00000000f0b1','aa000000-0000-4000-8000-0000000000b1','aa000000-0000-4000-8000-00000000e0b1','lukket', now()-interval '30 days', now()-interval '20 days', now()-interval '20 days');
-- five respondents, no groups. Four comment on ytring #1 and answered 5 there; the fifth did not comment and answered 1.
do $$ declare i int; v uuid; begin
  for i in 1..5 loop
    insert into app.responses (org_id, round_id, group_id, submitted_hour)
      values ('aa000000-0000-4000-8000-0000000000b1','aa000000-0000-4000-8000-00000000f0b1', null, date_trunc('hour', now()-interval '25 days')) returning id into v;
    insert into app.answers (response_id, factor_key, ordinal, value)
      select v, s.factor_key, s.ordinal, case when i = 5 then 1 else 5 end from app.statements s;
    if i <= 4 then
      insert into app.response_comments (response_id, factor_key, ordinal, body) values (v, 'ytring', 1, 'kommentar ' || i);
      insert into app.comment_threads (org_id, response_id, factor_key, ordinal, key_hash, opened_hour)
        values ('aa000000-0000-4000-8000-0000000000b1', v, 'ytring', 1, extensions.digest('k5'||i||gen_random_uuid(), 'sha256'), date_trunc('hour', now()-interval '25 days'));
    end if;
  end loop;
end $$;
select set_config('request.jwt.claims', json_build_object('sub','aa000000-0000-4000-8000-00000000d0b1','role','authenticated')::text, true) \g /dev/null
set local role authenticated;
select 'conversations', string_agg(t->>'answer_value', ',') from jsonb_array_elements(public.conversations('aa000000-0000-4000-8000-00000000f0b1')->'threads') t;
select 'org statement index ytring#1', i->>'index' from jsonb_array_elements(public.results_items('aa000000-0000-4000-8000-00000000f0b1')->'items') i where i->>'key'='ytring' and i->>'ordinal'='1';
select 'n', public.results_summary('aa000000-0000-4000-8000-00000000f0b1')->>'n';
select 'derived 5th person index = n*idx - sum(commenters)', 5 * (select (i->>'index')::int from jsonb_array_elements(public.results_items('aa000000-0000-4000-8000-00000000f0b1')->'items') i where i->>'key'='ytring' and i->>'ordinal'='1')
   - (select sum(((t->>'answer_value')::int - 1) * 25) from jsonb_array_elements(public.conversations('aa000000-0000-4000-8000-00000000f0b1')->'threads') t);
select 'comment_themes', public.comment_themes('aa000000-0000-4000-8000-00000000f0b1');
reset role;
rollback;
