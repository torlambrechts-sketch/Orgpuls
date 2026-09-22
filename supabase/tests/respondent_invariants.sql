-- respondent_invariants.sql — the write path, proved against the live schema.
--
-- rpc.submit_response is the only way an answer enters this product, and it is callable
-- by anon by design, so it is the surface most worth attacking. Run this after any
-- change to it, to app.responses / app.answers / app.extra_answers, or to the grants on
-- any of them. Every row must read pass = true.
--
-- It is written against the fixture's open puls (scripts/seed/design-fixture.mjs), uses
-- one of its invitations, and puts the round back to nobody-has-answered at the end --
-- which also exercises the cascade, since an append-only trigger that blocks
-- PostgreSQL's own referential maintenance is the failure CLAUDE.md records having been
-- rediscovered four times.
--
--   psql "$DATABASE_URL" -f supabase/tests/respondent_invariants.sql
--
-- Through the Supabase MCP instead, run it as two statements: the DO blocks, then the
-- final select.

create unlogged table if not exists public._inv(seq int, name text, expected text, actual text, pass bool);
truncate public._inv;

do $$
declare
  v_round uuid;
  v_emp uuid; v_emp2 uuid; v_tok text; v_tok2 text;
  v_res jsonb; v_before int; v_after int;
  v_answers jsonb; v_extra jsonb := '[]'::jsonb;
begin
  select r.id into v_round from app.rounds r where r.status = 'apen' order by r.opens_at desc limit 1;
  if v_round is null then
    raise exception 'no open round: re-run scripts/seed/design-fixture.mjs';
  end if;

  select e.id into v_emp from app.invitations i join app.employees e on e.id = i.employee_id
    where i.round_id = v_round and i.responded_at is null order by e.full_name limit 1;
  select e.id into v_emp2 from app.invitations i join app.employees e on e.id = i.employee_id
    where i.round_id = v_round and i.responded_at is null and e.id <> v_emp order by e.full_name limit 1;

  -- the fixture's token scheme: no plaintext is stored, it is derived from ids
  v_tok  := 'fixture.' || v_round::text || '.' || v_emp::text;
  v_tok2 := 'fixture.' || v_round::text || '.' || v_emp2::text;

  select jsonb_agg(jsonb_build_object('factor', rf.factor_key, 'ordinal', s.ordinal, 'value', 4))
    into v_answers
  from app.round_factors rf
  join app.statements s on s.factor_key = rf.factor_key
  where rf.round_id = v_round;

  v_res := public.submit_response('short', v_answers, v_extra);
  insert into public._inv values (1,'short token refused','invalid_token', v_res->>'error', v_res->>'error'='invalid_token');

  select count(*) into v_before from app.responses where round_id = v_round;
  v_res := public.submit_response('this-token-does-not-exist-at-all', v_answers, v_extra);
  select count(*) into v_after from app.responses where round_id = v_round;
  insert into public._inv values (2,'unknown token refused','invalid_token', v_res->>'error', v_res->>'error'='invalid_token');
  insert into public._inv values (3,'unknown token wrote nothing', v_before::text, v_after::text, v_before=v_after);

  -- a factor the round did not ask about must not consume the invitation
  select count(*) into v_before from app.responses where round_id = v_round;
  v_res := public.submit_response(v_tok, (select jsonb_build_array(jsonb_build_object(
             'factor', f.key, 'ordinal', 1, 'value', 4))
             from app.factors f where f.key not in (
               select rf.factor_key from app.round_factors rf where rf.round_id = v_round) limit 1),
           v_extra);
  select count(*) into v_after from app.responses where round_id = v_round;
  insert into public._inv values (4,'out-of-round factor refused','factor_not_in_round', v_res->>'error', v_res->>'error'='factor_not_in_round');
  insert into public._inv values (5,'refusal consumed no invitation', v_before::text, v_after::text, v_before=v_after);

  v_res := public.submit_response(v_tok, v_answers, '[{"key":"apent_felt","text":"hei"}]'::jsonb);
  insert into public._inv values (6,'out-of-round question refused','question_not_in_round', v_res->>'error', v_res->>'error'='question_not_in_round');

  -- the real thing, as the role a respondent actually has
  set local role anon;
  v_res := public.submit_response(v_tok, v_answers, v_extra);
  reset role;
  insert into public._inv values (7,'anon may submit','true', v_res->>'ok', (v_res->>'ok')='true');
  insert into public._inv values (8,'every answer written',
    jsonb_array_length(v_answers)::text, v_res->>'answers',
    (v_res->>'answers')::int = jsonb_array_length(v_answers));

  -- the caller must not be able to correlate their submission with a row
  insert into public._inv values (9,'no response id returned','no id keys',
    (select coalesce(string_agg(k,','),'none') from jsonb_object_keys(v_res) k where k like '%id%'),
    not exists (select 1 from jsonb_object_keys(v_res) k where k like '%id%'));

  select count(*) into v_before from app.responses where round_id = v_round;
  v_res := public.submit_response(v_tok, v_answers, v_extra);
  select count(*) into v_after from app.responses where round_id = v_round;
  insert into public._inv values (10,'replay refused','already_responded', v_res->>'error', v_res->>'error'='already_responded');
  insert into public._inv values (11,'replay wrote nothing', v_before::text, v_after::text, v_before=v_after);

  update app.invitations set expires_at = now() - interval '1 day'
    where round_id = v_round and employee_id = v_emp2;
  v_res := public.submit_response(v_tok2, v_answers, v_extra);
  insert into public._inv values (12,'expired token refused','expired', v_res->>'error', v_res->>'error'='expired');
  update app.invitations set expires_at = (select closes_at from app.rounds where id = v_round)
    where round_id = v_round and employee_id = v_emp2;
end $$;

do $$
declare
  v_round uuid; v_resp uuid; v_msg text; v_n int;
begin
  select r.id into v_round from app.rounds r where r.status = 'apen' order by r.opens_at desc limit 1;
  select id into v_resp from app.responses where round_id = v_round limit 1;

  -- anonymity is structural: absent columns, not nullable ones
  insert into public._inv
  select 13, 'responses has no linkage column', 'none',
         coalesce(string_agg(column_name, ','), 'none'), count(*) = 0
  from information_schema.columns
  where table_schema='app' and table_name='responses'
    and column_name in ('invitation_id','employee_id','user_id','ip','ip_address','user_agent','created_at');

  insert into public._inv
  select 14, 'submitted_hour truncated to the hour', 'true',
         (submitted_hour = date_trunc('hour', submitted_hour))::text,
         submitted_hour = date_trunc('hour', submitted_hour)
  from app.responses where id = v_resp;

  insert into public._inv
  select 15, 'response carries a group', 'true', (group_id is not null)::text, group_id is not null
  from app.responses where id = v_resp;

  insert into public._inv
  select 16, 'no select policy on responses/answers/extra_answers', '0', count(*)::text, count(*) = 0
  from pg_policies
  where schemaname='app' and tablename in ('responses','answers','extra_answers') and cmd in ('SELECT','ALL');

  insert into public._inv
  select 17, 'no grants to anon/authenticated on those tables', '0', count(*)::text, count(*) = 0
  from information_schema.role_table_grants
  where table_schema='app' and table_name in ('responses','answers','extra_answers')
    and grantee in ('anon','authenticated');

  begin
    insert into app.extra_answers (response_id, extra_key, option_ordinal) values (v_resp, 'krenkende', 9);
    insert into public._inv values (18,'bogus option rejected','rejected','ACCEPTED',false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into public._inv values (18,'bogus option rejected','rejected', left(v_msg,60), true);
  end;

  begin
    update app.answers set value = 1 where response_id = v_resp;
    insert into public._inv values (19,'answers immutable','rejected','ACCEPTED',false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into public._inv values (19,'answers immutable','rejected', left(v_msg,60), true);
  end;

  begin
    delete from app.answers where response_id = v_resp;
    insert into public._inv values (20,'answers not directly deletable','rejected','ACCEPTED',false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into public._inv values (20,'answers not directly deletable','rejected', left(v_msg,60), true);
  end;

  -- put the fixture back, which also proves the freeze trigger lets a cascade through
  delete from app.responses where round_id = v_round;
  update app.invitations set responded_at = null where round_id = v_round;
  select count(*) into v_n from app.responses where round_id = v_round;
  insert into public._inv values (21,'fixture restored (cascade works)','0', v_n::text, v_n = 0);
end $$;

select seq, name, expected, actual, pass from public._inv order by seq;

-- The table above is the report; this is the verdict. It runs after the select so a
-- failing run still prints which assertion failed before it aborts.
do $$
declare v_failed text;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) into v_failed
  from public._inv where not pass;
  if v_failed is not null then
    raise exception 'invariants failed: %', v_failed;
  end if;
end $$;

drop table public._inv;
