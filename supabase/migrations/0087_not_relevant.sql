-- 0087_not_relevant.sql — «Ikke relevant for meg» as an answer of its own (D-134).
--
-- A respondent may say a statement does not apply to their job — «Jeg kan tilkalle hjelp raskt
-- hvis noe skjer mens jeg er alene» for someone who never works alone. That is not an opinion
-- on the scale: folded into «Verken eller» it would pull the index towards the middle, and
-- dropped as a skip it would be lost. So it is kept, and kept apart.
--
--   * Two answer tables of their own, beside app.answers and app.module_answers. Every reader
--     of answers (the indices, cell_release's n, the recommendation score, importance, comment
--     themes) reads those two tables only, so a not-relevant answer cannot enter an index, a k
--     count or a denominator by accident: it is absent from them by construction.
--   * The same shape as the answer tables: a response and a statement, nothing else. RLS on,
--     NO policy, grants revoked, append-only, written only by submit_response (invariants 1–3).
--   * submit_response takes `na: true` on a statement in place of a value. The recommendation
--     question, the count questions and the background questions have no such answer: they
--     keep their own options («Vet ikke», «Vil ikke svare») and a skip.
--   * public.results_not_relevant: how many said «ikke relevant» per statement, for the whole
--     organisation only, to those who choose the question set (daglig leder, verneombud), for
--     a closed round, and only for a statement at least k people marked not relevant.

-- ---------------------------------------------------------------- the two tables
create table app.not_relevant_answers (
  response_id uuid not null references app.responses (id) on delete cascade,
  factor_key  text not null references app.factors (key),
  ordinal     int  not null,
  primary key (response_id, factor_key, ordinal),
  foreign key (factor_key, ordinal) references app.statements (factor_key, ordinal)
);
create index not_relevant_answers_statement_idx on app.not_relevant_answers (factor_key, ordinal);

create table app.module_not_relevant_answers (
  response_id uuid not null references app.responses (id) on delete cascade,
  item_id     uuid not null references app.module_items (id),
  primary key (response_id, item_id)
);
create index module_not_relevant_answers_item_idx on app.module_not_relevant_answers (item_id);

comment on table app.not_relevant_answers is
  '«Ikke relevant for meg» on a core statement (0087, D-134). Never read by an index; counted by results_not_relevant.';
comment on table app.module_not_relevant_answers is
  '«Ikke relevant for meg» on a module statement (0087, D-134). Never read by an index; counted by results_not_relevant.';

-- append-only, "nobody may change this content": a delete only once the response is gone
create trigger not_relevant_answers_immutable before update or delete on app.not_relevant_answers
  for each row execute function app.forbid_module_answer_change();
create trigger module_not_relevant_answers_immutable before update or delete on app.module_not_relevant_answers
  for each row execute function app.forbid_module_answer_change();

-- a statement is answered on the scale or marked not relevant, never both
create function app.not_relevant_exclusive() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  if tg_table_name = 'not_relevant_answers' then
    if exists (select 1 from app.answers a
               where a.response_id = new.response_id and a.factor_key = new.factor_key and a.ordinal = new.ordinal) then
      raise exception 'a statement is answered or not relevant, not both' using errcode = 'check_violation';
    end if;
  elsif exists (select 1 from app.module_answers a where a.response_id = new.response_id and a.item_id = new.item_id) then
    raise exception 'a statement is answered or not relevant, not both' using errcode = 'check_violation';
  end if;
  return new;
end $fn$;
create trigger not_relevant_answers_exclusive before insert on app.not_relevant_answers
  for each row execute function app.not_relevant_exclusive();
create trigger module_not_relevant_answers_exclusive before insert on app.module_not_relevant_answers
  for each row execute function app.not_relevant_exclusive();

alter table app.not_relevant_answers        enable row level security;
alter table app.module_not_relevant_answers enable row level security;
-- NO POLICIES, and no grants: every client role is denied, as for every answer table
revoke all on app.not_relevant_answers, app.module_not_relevant_answers from public, anon, authenticated;
revoke all on function app.not_relevant_exclusive() from public, anon, authenticated;

-- ---------------------------------------------------------------- the one write path
-- 0069's function, with `na` on a statement: `{factor, ordinal, na: true}` and `{item, na: true}`.
-- Everything else is unchanged.
create or replace function public.submit_response(p_token text, p_answers jsonb, p_extra jsonb, p_module jsonb default '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_inv     app.invitations%rowtype;
  v_group   uuid;
  v_resp    uuid;
  v_written int;
  v_bad     int;
  v_hour    timestamptz := date_trunc('hour', now());
  v_keys    jsonb := '[]'::jsonb;
  v_key     text;
  v_a       jsonb;
  v_mod     jsonb := coalesce(p_module, '{}'::jsonb);
begin
  if p_token is null or length(p_token) < 16 then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  -- looked up BY hash: the plaintext token is never stored and never compared
  select * into v_inv
  from app.invitations i
  where i.token_hash = extensions.digest(p_token, 'sha256');

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;
  if v_inv.responded_at is not null then
    -- replay: refused, and refused without revealing anything about the first answer
    return jsonb_build_object('ok', false, 'error', 'already_responded');
  end if;
  if v_inv.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  perform 1 from app.rounds r where r.id = v_inv.round_id and r.status = 'apen';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'round_closed');
  end if;

  select count(*) into v_bad
  from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) a
  where not exists (
    select 1 from app.round_factors rf
    where rf.round_id = v_inv.round_id and rf.factor_key = (a->>'factor')
  );
  if v_bad > 0 then
    return jsonb_build_object('ok', false, 'error', 'factor_not_in_round');
  end if;
  -- 0087: «ikke relevant» stands in place of a value, never beside one
  select count(*) into v_bad
  from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) a
  where a ? 'na' and (a->'na' <> 'true'::jsonb or nullif(a->>'value', '') is not null);
  if v_bad > 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_answer');
  end if;

  select count(*) into v_bad
  from jsonb_array_elements(coalesce(p_extra, '[]'::jsonb)) x
  where not exists (
    select 1 from app.round_extra_questions rx
    where rx.round_id = v_inv.round_id and rx.extra_key = (x->>'key')
  );
  if v_bad > 0 then
    return jsonb_build_object('ok', false, 'error', 'question_not_in_round');
  end if;

  -- 0069: every module answer must be one the round asks, in the shape its kind takes;
  -- 0087: a statement's answer is a value 1–5 or `na: true`
  if jsonb_typeof(v_mod) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'question_not_in_round');
  end if;
  select count(*) into v_bad
  from jsonb_array_elements(coalesce(v_mod->'answers', '[]'::jsonb)) x
  where not exists (select 1 from app.round_modules rm
                    where rm.round_id = v_inv.round_id and (x->>'item') = any (rm.item_ids::text[]))
     or not (   (coalesce(x->>'value', '') ~ '^[1-5]$' and not x ? 'na')
             or (x->'na' = 'true'::jsonb and nullif(x->>'value', '') is null));
  if v_bad > 0 then
    return jsonb_build_object('ok', false, 'error', 'question_not_in_round');
  end if;
  select count(*) into v_bad
  from jsonb_array_elements(coalesce(v_mod->'count', '[]'::jsonb)) x
  where not exists (select 1 from app.round_modules rm join app.module_items i on i.module_id = rm.module_id
                    where rm.round_id = v_inv.round_id and rm.include_count_items
                      and i.kind = 'count' and i.id::text = (x->>'item'))
     or coalesce(x->>'answer', '') not in ('ja', 'nei', 'vet_ikke');
  if v_bad > 0 then
    return jsonb_build_object('ok', false, 'error', 'question_not_in_round');
  end if;
  select count(*) into v_bad
  from jsonb_array_elements(coalesce(v_mod->'segments', '[]'::jsonb)) x
  where not exists (select 1 from app.round_modules rm join app.module_items i on i.module_id = rm.module_id
                    where rm.round_id = v_inv.round_id and rm.include_segments
                      and i.kind = 'segment' and i.id::text = (x->>'item')
                      and coalesce(x->>'option', '') ~ '^[1-9]$'
                      and (x->>'option')::int <= jsonb_array_length(i.options));
  if v_bad > 0 then
    return jsonb_build_object('ok', false, 'error', 'question_not_in_round');
  end if;

  -- the group is the one thing carried across, because per-group results are the
  -- product. k-anonymity is what makes that safe, and it is applied on read.
  select e.group_id into v_group from app.employees e where e.id = v_inv.employee_id;

  update app.invitations set responded_at = now() where id = v_inv.id;

  insert into app.responses (org_id, round_id, group_id, submitted_hour)
  values (v_inv.org_id, v_inv.round_id, v_group, v_hour)
  returning id into v_resp;

  insert into app.answers (response_id, factor_key, ordinal, value)
  select v_resp, (a->>'factor')::text, (a->>'ordinal')::int, (a->>'value')::int
  from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) a
  where nullif(a->>'value', '') is not null;
  get diagnostics v_written = row_count;

  -- 0087: «ikke relevant», on its own table, where no index reads it
  insert into app.not_relevant_answers (response_id, factor_key, ordinal)
  select distinct v_resp, (a->>'factor')::text, (a->>'ordinal')::int
  from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) a
  where a->'na' = 'true'::jsonb;

  /*
   * A comment is kept whether or not the question it hangs on was scored, and each one
   * opens a thread whose key goes back to the respondent and nowhere else (0018, 0042).
   * The key is 32 random bytes, returned once and stored only as a digest.
   */
  for v_a in select x from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) x loop
    if nullif(btrim(coalesce(v_a->>'comment', '')), '') is not null then
      insert into app.response_comments (response_id, factor_key, ordinal, body)
      values (v_resp, (v_a->>'factor')::text, (v_a->>'ordinal')::int, btrim(v_a->>'comment'));

      v_key := encode(extensions.gen_random_bytes(32), 'hex');
      insert into app.comment_threads (org_id, response_id, factor_key, ordinal, key_hash, opened_hour)
      values (v_inv.org_id, v_resp, (v_a->>'factor')::text, (v_a->>'ordinal')::int,
              extensions.digest(v_key, 'sha256'), v_hour);
      v_keys := v_keys || to_jsonb(v_key);
    end if;
  end loop;

  -- a skipped question sends nothing, so an absent key is a skip and an empty string
  -- is not an answer either
  insert into app.extra_answers (response_id, extra_key, option_ordinal, free_text)
  select v_resp, (x->>'key')::text,
         nullif(x->>'option', '')::int,
         nullif(btrim(coalesce(x->>'text', '')), '')
  from jsonb_array_elements(coalesce(p_extra, '[]'::jsonb)) x
  where nullif(x->>'option', '') is not null
     or nullif(btrim(coalesce(x->>'text', '')), '') is not null;

  -- 0069: the module's statements and background questions, on the same unlinked row
  insert into app.module_answers (response_id, item_id, value)
  select distinct on ((x->>'item')::uuid) v_resp, (x->>'item')::uuid, (x->>'value')::int
  from jsonb_array_elements(coalesce(v_mod->'answers', '[]'::jsonb)) x
  where nullif(x->>'value', '') is not null;
  get diagnostics v_bad = row_count;
  v_written := v_written + v_bad;

  insert into app.module_not_relevant_answers (response_id, item_id)
  select distinct v_resp, (x->>'item')::uuid
  from jsonb_array_elements(coalesce(v_mod->'answers', '[]'::jsonb)) x
  where x->'na' = 'true'::jsonb;

  insert into app.module_segment_answers (response_id, item_id, option_ordinal)
  select distinct on ((x->>'item')::uuid) v_resp, (x->>'item')::uuid, (x->>'option')::int
  from jsonb_array_elements(coalesce(v_mod->'segments', '[]'::jsonb)) x;

  -- 0069: count questions, with nothing that leads back to this response or its group
  insert into app.org_count_answers (round_id, item_id, answer)
  select distinct on ((x->>'item')::uuid) v_inv.round_id, (x->>'item')::uuid, x->>'answer'
  from jsonb_array_elements(coalesce(v_mod->'count', '[]'::jsonb)) x;

  -- v_resp is deliberately NOT returned: the caller must not be able to correlate
  -- their submission with a row.
  return jsonb_build_object('ok', true, 'answers', v_written, 'threads', v_keys);
end $function$;

revoke all on function public.submit_response(text, jsonb, jsonb, jsonb) from public;
grant execute on function public.submit_response(text, jsonb, jsonb, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------- the one reader
/**
 * How many said «ikke relevant» per statement in a closed round, for the whole organisation.
 *
 *   - Only daglig leder and verneombud: they choose the question set, and this is what they
 *     choose it by. A department leader gets nothing from it.
 *   - A statement is listed only when at least k people marked it not relevant. A smaller
 *     count could point at the one or two it does not apply to — the only office worker in a
 *     construction firm — and say that they answered. At k or more it is a pattern, not a
 *     person. Skips are not counted: nobody can tell who was shown what and moved on.
 *   - `n` is the answers on the scale, `na` the not-relevant marks. Nothing per group, per
 *     time or per person exists to return.
 */
create function public.results_not_relevant(p_round uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_org   uuid;
  v_k     int;
  v_items jsonb;
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round and r.status = 'lukket';
  if v_org is null or not app.has_role(v_org, array['daglig_leder', 'verneombud']::app.org_role[]) then
    return jsonb_build_object('error', 'not_available');
  end if;
  v_k := app.k_threshold(v_org);

  with core as (
    select s.factor_key, s.ordinal,
           (select count(*) from app.answers a join app.responses r on r.id = a.response_id
             where r.round_id = p_round and a.factor_key = s.factor_key and a.ordinal = s.ordinal) as n,
           (select count(*) from app.not_relevant_answers x join app.responses r on r.id = x.response_id
             where r.round_id = p_round and x.factor_key = s.factor_key and x.ordinal = s.ordinal) as na
    from app.statements s
    join app.round_factors rf on rf.round_id = p_round and rf.factor_key = s.factor_key
  ), modules as (
    select i.id,
           (select count(*) from app.module_answers a join app.responses r on r.id = a.response_id
             where r.round_id = p_round and a.item_id = i.id) as n,
           (select count(*) from app.module_not_relevant_answers x join app.responses r on r.id = x.response_id
             where r.round_id = p_round and x.item_id = i.id) as na
    from app.round_modules rm
    join app.module_items i on i.id = any (rm.item_ids)
    where rm.round_id = p_round and i.kind = 'likert5'
  )
  select jsonb_agg(item order by ord, key) into v_items from (
    select 0 as ord, format('core:%s:%s', c.factor_key, c.ordinal) as key,
           jsonb_build_object('key', format('core:%s:%s', c.factor_key, c.ordinal), 'n', c.n, 'na', c.na) as item
    from core c where c.na >= v_k
    union all
    select 1, format('module:%s', m.id),
           jsonb_build_object('key', format('module:%s', m.id), 'n', m.n, 'na', m.na)
    from modules m where m.na >= v_k
  ) x;

  return jsonb_build_object('threshold', v_k, 'items', coalesce(v_items, '[]'::jsonb));
end $fn$;
revoke all on function public.results_not_relevant(uuid) from public, anon;
grant execute on function public.results_not_relevant(uuid) to authenticated;
