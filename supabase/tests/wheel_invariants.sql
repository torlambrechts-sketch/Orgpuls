-- wheel_invariants.sql — the scheduler, proved against the live schema.
--
-- Migration 0020 gave Årshjulet a real engine: pg_cron opens rounds, queues the
-- notification ladder, reminds, closes, freezes and plans the next year. The thing that
-- needed proving is not that it runs — it is that running it does not put a credential
-- at rest.
--
-- An invitation is a secret in a link. The obvious asynchronous design parks the
-- plaintext in the queue until it is sent, which would undo invariant 3: `app.invitations`
-- stores a SHA-256 precisely so the plaintext is never stored, and a queue holding live
-- login links is that exposure under another name. So the queue holds an instruction and
-- the dispatcher mints at the moment it sends.
--
-- Assertion 1 asserts the ABSENCE of any column that could hold one, by name, so a column
-- added later called `token`, `link` or `secret` fails here rather than in review.
-- Assertion 14 goes further and searches the whole outbox row as text for the token that
-- was actually minted.
--
--   psql "$DATABASE_URL" -f supabase/tests/wheel_invariants.sql
--
-- NOTE FOR CALLERS: invoke the tick as `select app.wheel_tick()`, never
-- `select (app.wheel_tick()).*`. The second form re-evaluates the function once per
-- output column, so the work happens on the first evaluation and the counts you read come
-- from the last one — which reports zero because by then there is nothing left to do.

create unlogged table if not exists public._wi(seq int, name text, expected text, actual text, pass bool);
truncate public._wi;

do $$
declare
  v_org uuid; v_round uuid; v_meas uuid; v_grp uuid;
  v_run app.job_runs; v_n int; v_before int; v_json jsonb; v_inv uuid; v_out uuid;
begin
  select id into v_org from app.organizations order by id limit 1;
  select id into v_grp from app.groups where org_id = v_org and name = 'Drift';

  insert into public._wi
  select 1, 'the outbox has no column that could hold a token', '0', count(*)::text, count(*) = 0
  from pg_attribute
  where attrelid = 'app.outbox'::regclass and attnum > 0 and not attisdropped
    and attname ~* '(token|secret|link|password|key)';

  insert into public._wi
  select 2, 'no client role may write the outbox', '0', count(*)::text, count(*) = 0
  from information_schema.role_table_grants
  where table_schema = 'app' and table_name = 'outbox'
    and grantee in ('anon','authenticated') and privilege_type <> 'SELECT';

  insert into public._wi
  select 3, 'no role may execute the tick', '0', count(*)::text, count(*) = 0
  from information_schema.role_routine_grants
  where routine_schema = 'app' and routine_name = 'wheel_tick'
    and grantee in ('anon','authenticated','public');

  insert into public._wi
  select 4, 'nor mint a link', '0', count(*)::text, count(*) = 0
  from information_schema.role_routine_grants
  where routine_schema = 'public' and routine_name = 'mint_invitation_link'
    and grantee in ('anon','authenticated','public');

  insert into public._wi
  select 5, 'the wheel is scheduled hourly in cron', '0 * * * *', schedule, schedule = '0 * * * *'
  from cron.job where jobname = 'orgpuls-wheel';

  -- idempotence is what makes it safe to run from a scheduler nobody watches
  select count(*) into v_before from app.rounds where org_id = v_org;
  v_run := app.wheel_tick();
  select count(*) into v_n from app.rounds where org_id = v_org;
  insert into public._wi values (6, 'a repeat tick plans nothing new', v_before::text, v_n::text, v_n = v_before);
  insert into public._wi values (7, 'and queues nothing new', '0', v_run.queued::text, v_run.queued = 0);

  insert into app.measurements (org_id, kind, year, label)
  values (v_org, 'puls', 2095, 'Hjultest') returning id into v_meas;
  insert into app.rounds (org_id, measurement_id, status, opens_at, close_after_days, reminder_day)
  values (v_org, v_meas, 'planlagt', now() - interval '1 minute', 7, 2) returning id into v_round;
  insert into app.round_factors (org_id, round_id, factor_key) values (v_org, v_round, 'ytring');
  insert into app.round_groups (round_id, group_id) values (v_round, v_grp);

  v_run := app.wheel_tick();

  insert into public._wi
  select 8, 'the wheel opened the due round', 'apen', status::text, status = 'apen'
  from app.rounds where id = v_round;

  select count(*) into v_n from app.invitations where round_id = v_round;
  insert into public._wi values (9, 'it invited only the chosen department', '12', v_n::text, v_n = 12);

  /*
   * An invitation nobody has been sent is an invitation nobody can redeem: the scheduler
   * hashes 32 bytes it then discards, so the row exists for the response rate's
   * denominator and no token opens it until a dispatcher mints one.
   */
  select count(*) into v_n from app.invitations where round_id = v_round and sent_at is not null;
  insert into public._wi values (10, 'no invitation is marked sent yet', '0', v_n::text, v_n = 0);

  select count(*) into v_n from app.outbox where round_id = v_round and kind = 'invitasjon';
  insert into public._wi values (11, 'one queued invitation per person', '12', v_n::text, v_n = 12);

  select o.id, o.invitation_id into v_out, v_inv from app.outbox o
  where o.round_id = v_round and o.kind = 'invitasjon' limit 1;

  v_json := public.mint_invitation_link(v_out);
  insert into public._wi
  select 12, 'the dispatcher gets a 64-character token', '64',
         coalesce(length(v_json->>'token'), 0)::text, length(v_json->>'token') = 64;

  insert into public._wi
  select 13, 'and that token opens the invitation it names', '1', count(*)::text, count(*) = 1
  from app.invitations i
  where i.id = v_inv and i.token_hash = extensions.digest(v_json->>'token', 'sha256');

  -- the whole row as text, searched for the token that was actually minted
  insert into public._wi
  select 14, 'the outbox row is marked sent, and still holds no token', 'sent,clean',
         case when o.sent_at is not null then 'sent' else 'pending' end || ',' ||
         case when o::text like '%' || (v_json->>'token') || '%' then 'LEAKED' else 'clean' end,
         o.sent_at is not null and o::text not like '%' || (v_json->>'token') || '%'
  from app.outbox o where o.id = v_out;

  v_json := public.mint_invitation_link(v_out);
  insert into public._wi
  select 15, 'a second mint on the same row is refused', 'not_pending',
         coalesce(v_json->>'error','MINTED'), v_json->>'error' = 'not_pending';

  delete from app.measurements where id = v_meas;
  select count(*) into v_n from app.outbox where round_id = v_round;
  insert into public._wi values (16, 'deleting the round empties its queue', '0', v_n::text, v_n = 0);
end $$;

select seq, name, expected, actual, pass from public._wi order by seq;

do $$
declare v_failed text;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) into v_failed
  from public._wi where not pass;
  if v_failed is not null then
    raise exception 'wheel invariants failed: %', v_failed;
  end if;
end $$;

drop table public._wi;
