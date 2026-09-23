-- comment_theme_invariants.sql — "Hva de skrev" counts, and says nothing else (0030).
--
-- `public.comment_themes` is the first reader of `app.response_comments` that returns
-- numbers rather than a comment, so what it must NOT return matters as much as what it
-- does. Asserted one at a time:
--
--   * who may call it: authenticated only; a daglig leder or an avdelingsleder; a
--     verneombud and a non-member get the one refusal, `not_available` (1-4)
--   * the counts are the table's own: responses in the round, and distinct respondents
--     who wrote something (5-6)
--   * a factor is a theme only at k different respondents — not at k-1, and not at k
--     comments from fewer people (7-9)
--   * a theme carries counts and a factor key, nothing that could hold text or point at a
--     response (10)
--   * a round, or a department, under the threshold returns no counts at all (11-12)
--
-- The theme rows are written inside a block that rolls itself back: the comment table
-- refuses deletes (`comments_immutable`), so the only way to leave it as found is never to
-- commit. Throwaway accounts have no password and no identity; assertion 13 proves they
-- are gone.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/comment_theme_invariants.sql

create unlogged table if not exists public._cti(seq int, name text, expected text, actual text, pass bool);
truncate public._cti;

do $$
declare
  v_org     uuid := '00000000-0000-4000-8000-000000000001';
  v_dl      uuid;
  v_vo      uuid := '00000000-0000-4000-8000-0000000e2001';
  v_al      uuid := '00000000-0000-4000-8000-0000000e2002';
  v_out     uuid := '00000000-0000-4000-8000-0000000e2003';
  v_round   uuid;
  v_empty   uuid;
  v_small   uuid;
  v_json    jsonb;
  v_n       int;
  v_wrote   int;
  v_at_k1   boolean;
  v_at_k    jsonb;
  v_one_voice jsonb;
  v_k       int;
begin
  select m.user_id into v_dl from app.memberships m
    where m.org_id = v_org and m.active and m.role = 'daglig_leder' order by m.id limit 1;
  select r.id into v_round from app.rounds r join app.measurements ms on ms.id = r.measurement_id
    where r.org_id = v_org and ms.kind = 'grunnlinje' and ms.year = 2026;
  select r.id into v_empty from app.rounds r
    where r.org_id = v_org and not exists (select 1 from app.responses x where x.round_id = r.id)
    order by r.id limit 1;
  select g.id into v_small from app.groups g where g.org_id = v_org and g.name = 'Administrasjon';
  v_k := app.k_threshold(v_org);

  insert into auth.users (id, email) values
    (v_vo, 'vo@comment-test.example'), (v_al, 'al@comment-test.example'), (v_out, 'out@comment-test.example');
  insert into app.profiles (id, full_name) values (v_vo, 'VO'), (v_al, 'AL'), (v_out, 'OUT');
  insert into app.memberships (org_id, user_id, role) values (v_org, v_vo, 'verneombud');
  insert into app.memberships (org_id, user_id, role, group_id) values (v_org, v_al, 'avdelingsleder', v_small);

  -- 1..4 -------------------------------------------------------------------- who
  insert into public._cti
  select 1, 'anon may not execute it', 'false', has_function_privilege('anon', 'public.comment_themes(uuid)', 'execute')::text,
         not has_function_privilege('anon', 'public.comment_themes(uuid)', 'execute');

  perform set_config('request.jwt.claims', json_build_object('sub', v_vo, 'role', 'authenticated')::text, true);
  v_json := public.comment_themes(v_round);
  insert into public._cti values (2, 'a verneombud is refused', 'not_available', v_json->>'error', v_json->>'error' = 'not_available');

  perform set_config('request.jwt.claims', json_build_object('sub', v_out, 'role', 'authenticated')::text, true);
  v_json := public.comment_themes(v_round);
  insert into public._cti values (3, 'a signed-in non-member is refused', 'not_available', v_json->>'error', v_json->>'error' = 'not_available');

  perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
  v_json := public.comment_themes(v_round);
  insert into public._cti values (4, 'a daglig leder is answered', 'ok', coalesce(v_json->>'status', v_json->>'error'), v_json->>'status' = 'ok');

  -- 5, 6 ---------------------------------------------------------------- the counts
  select count(*) into v_n from app.responses where round_id = v_round;
  insert into public._cti values (5, 'n is the round''s responses', v_n::text, v_json->>'n', (v_json->>'n')::int = v_n);

  select count(distinct rc.response_id) into v_wrote
  from app.response_comments rc join app.responses r on r.id = rc.response_id where r.round_id = v_round;
  insert into public._cti values (6, 'wrote is distinct respondents with a comment', v_wrote::text, v_json->>'wrote', (v_json->>'wrote')::int = v_wrote);

  -- 7..9 ------------------------------------------ the k rule, on rows that never commit
  begin
    -- k-1 people on 'kollega', statement 1 — below the rule
    insert into app.response_comments (response_id, factor_key, ordinal, body)
    select r.id, 'kollega', 1, 'probe'
    from app.responses r
    where r.round_id = v_round
      and not exists (select 1 from app.response_comments c where c.response_id = r.id and c.factor_key = 'kollega')
    order by r.id limit v_k - 1;
    v_at_k1 := exists (select 1 from jsonb_array_elements(public.comment_themes(v_round)->'themes') t where t->>'key' = 'kollega');

    -- one person's two further comments on the same factor: more comments, not more people
    insert into app.response_comments (response_id, factor_key, ordinal, body)
    select c.response_id, 'kollega', o, 'probe'
    from (select response_id from app.response_comments where factor_key = 'kollega' and body = 'probe'
          order by response_id limit 1) c
    cross join (values (2), (3)) v(o);
    v_one_voice := (select t from jsonb_array_elements(public.comment_themes(v_round)->'themes') t where t->>'key' = 'kollega');

    -- the k-th person
    insert into app.response_comments (response_id, factor_key, ordinal, body)
    select r.id, 'kollega', 1, 'probe'
    from app.responses r
    where r.round_id = v_round
      and not exists (select 1 from app.response_comments c where c.response_id = r.id and c.factor_key = 'kollega')
    order by r.id limit 1;
    v_at_k := (select t from jsonb_array_elements(public.comment_themes(v_round)->'themes') t where t->>'key' = 'kollega');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  insert into public._cti values (7, 'k-1 respondents on a factor make no theme', 'absent',
    case when v_at_k1 then 'present' else 'absent' end, not v_at_k1);
  insert into public._cti values (8, 'k comments from fewer than k people make no theme', 'absent',
    case when v_one_voice is null then 'absent' else 'present' end, v_one_voice is null);
  insert into public._cti values (9, 'k respondents make a theme, counted in people', v_k || ' people, ' || (v_k + 2) || ' comments',
    coalesce((v_at_k->>'people') || ' people, ' || (v_at_k->>'comments') || ' comments', 'absent'),
    (v_at_k->>'people')::int = v_k and (v_at_k->>'comments')::int = v_k + 2);

  -- 10 --------------------------------------------------------------- nothing but counts
  insert into public._cti values (10, 'a theme carries only a key and counts', 'key,sort_order,comments,people,low,mid,high',
    (select string_agg(k, ',' order by k) from jsonb_object_keys(coalesce(v_at_k, '{}'::jsonb)) k),
    (select array_agg(k order by k) from jsonb_object_keys(coalesce(v_at_k, '{}'::jsonb)) k)
      = array['comments','high','key','low','mid','people','sort_order']);

  -- 11, 12 -------------------------------------------------------- under the threshold
  v_json := public.comment_themes(v_empty);
  insert into public._cti values (11, 'a round under the threshold returns no counts', 'insufficient_data, no wrote',
    (v_json->>'status') || case when v_json ? 'wrote' then ', wrote' else ', no wrote' end,
    v_json->>'status' = 'insufficient_data' and not v_json ? 'wrote' and not v_json ? 'themes');

  perform set_config('request.jwt.claims', json_build_object('sub', v_al, 'role', 'authenticated')::text, true);
  v_json := public.comment_themes(v_round);
  insert into public._cti values (12, 'an avdelingsleder of a department under k gets no counts', 'insufficient_data',
    coalesce(v_json->>'status', v_json->>'error'), v_json->>'status' = 'insufficient_data' and not v_json ? 'wrote');
  perform set_config('request.jwt.claims', '', true);

  -- 13 ------------------------------------------------------------------- clean up
  delete from app.memberships where user_id in (v_vo, v_al, v_out);
  delete from app.profiles where id in (v_vo, v_al, v_out);
  delete from auth.users where id in (v_vo, v_al, v_out);
  insert into public._cti
  select 13, 'every throwaway row and every probe comment is gone', '0', count(*)::text, count(*) = 0
  from (
    select id::text from auth.users where id in (v_vo, v_al, v_out)
    union all select response_id::text from app.response_comments where body = 'probe'
  ) left_over;
end $$;

select seq, name, expected, actual, pass from public._cti order by seq;

do $$
declare v_failed text;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) into v_failed from public._cti where not pass;
  if v_failed is not null then
    raise exception 'comment theme invariants failed: %', v_failed;
  end if;
end $$;

drop table public._cti;
