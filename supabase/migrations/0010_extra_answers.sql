-- 0010_extra_answers.sql — somewhere to put the answers to the other four questions.
--
-- The respondent flow asks 37 questions. Until now only 33 of them could be stored:
-- app.answers holds (factor_key, ordinal, value) and has no shape for a chosen option
-- or a written sentence. A submission that silently dropped four answers would be a
-- product that lies to the person answering it, so this closes the gap before the
-- respondent surface exists rather than after.
--
-- The anonymity treatment is app.answers' exactly, and for the same reason: these rows
-- hang off app.responses, which carries a group and an hour and no linkage of any kind.
-- RLS is on with NO policy and the grants are revoked, so no client can read them —
-- reading happens through SECURITY DEFINER aggregates that apply k, when they are
-- written. Free text is the most identifying thing a respondent can produce, and it is
-- stored here on exactly the same unlinked row as everything else.
--
-- `submit_response` is replaced rather than overloaded. Giving the new parameter a
-- default would make every existing two-argument call ambiguous, so the old signature
-- is dropped and the new one takes its place in the same transaction.

create table app.extra_answers (
  response_id    uuid not null references app.responses (id) on delete cascade,
  extra_key      text not null references app.extra_questions (key),
  -- exactly one of these, decided by the question's kind and enforced below
  option_ordinal int,
  free_text      text,
  primary key (response_id, extra_key),
  constraint extra_answer_has_one_shape
    check ((option_ordinal is null) <> (free_text is null))
);

alter table app.extra_answers enable row level security;

-- NO POLICIES. Intentional, exactly as for app.responses and app.answers: RLS is on so
-- the default is deny for every role including authenticated, and the grants go too.
revoke all on app.extra_answers from anon, authenticated;

/**
 * The option a respondent chose must be an option the question actually offers, and a
 * written answer may only go to the question that asks for one. A CHECK cannot express
 * either, because both depend on another table.
 */
create function app.check_extra_answer() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
declare v_kind text;
begin
  select q.kind into v_kind from app.extra_questions q where q.key = new.extra_key;

  if new.free_text is not null then
    if v_kind <> 'free_text' then
      raise exception 'question % does not take written answers', new.extra_key;
    end if;
  else
    if v_kind = 'free_text' then
      raise exception 'question % takes a written answer, not an option', new.extra_key;
    end if;
    if not exists (
      select 1 from app.extra_options o
      where o.extra_key = new.extra_key and o.ordinal = new.option_ordinal
    ) then
      raise exception 'option % is not offered for question %',
        new.option_ordinal, new.extra_key;
    end if;
  end if;
  return new;
end $fn$;

create trigger extra_answer_guard
  before insert or update on app.extra_answers
  for each row execute function app.check_extra_answer();

/**
 * Frozen, like app.answers.
 *
 * Written as "nobody may change this content" rather than "reject every UPDATE and
 * DELETE": the columns that carry meaning are compared, and an UPDATE that leaves them
 * alone passes so PostgreSQL's own referential maintenance is not blocked. CLAUDE.md
 * records that the other formulation has been rediscovered as a bug four separate
 * times; this is the fifth table and it is not going to be the fifth time.
 */
create function app.forbid_extra_answer_change() returns trigger
  language plpgsql
  set search_path = ''
as $fn$
begin
  if tg_op = 'DELETE' then
    -- cascade from a deleted response is legitimate; a direct delete is not
    if exists (select 1 from app.responses r where r.id = old.response_id) then
      raise exception 'answers are append-only: % cannot be deleted', old.response_id
        using errcode = 'restrict_violation';
    end if;
    return old;
  end if;
  if new.extra_key is distinct from old.extra_key
     or new.option_ordinal is distinct from old.option_ordinal
     or new.free_text is distinct from old.free_text
     or new.response_id is distinct from old.response_id then
    raise exception 'answers are immutable once submitted'
      using errcode = 'restrict_violation';
  end if;
  return new;
end $fn$;

create trigger extra_answers_immutable
  before update or delete on app.extra_answers
  for each row execute function app.forbid_extra_answer_change();

-- ---------------------------------------------------------------------------
-- submit_response, now writing all 37
-- ---------------------------------------------------------------------------
drop function public.submit_response(text, jsonb);

create function public.submit_response(p_token text, p_answers jsonb, p_extra jsonb)
  returns jsonb
  language plpgsql security definer
  set search_path = ''
as $fn$
declare
  v_inv     app.invitations%rowtype;
  v_group   uuid;
  v_resp    uuid;
  v_written int;
  v_bad     int;
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

  -- every answer must be for a factor this round actually asked about
  select count(*) into v_bad
  from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) a
  where not exists (
    select 1 from app.round_factors rf
    where rf.round_id = v_inv.round_id and rf.factor_key = (a->>'factor')
  );
  if v_bad > 0 then
    return jsonb_build_object('ok', false, 'error', 'factor_not_in_round');
  end if;

  -- and the same for the questions outside the index
  select count(*) into v_bad
  from jsonb_array_elements(coalesce(p_extra, '[]'::jsonb)) x
  where not exists (
    select 1 from app.round_extra_questions rx
    where rx.round_id = v_inv.round_id and rx.extra_key = (x->>'key')
  );
  if v_bad > 0 then
    return jsonb_build_object('ok', false, 'error', 'question_not_in_round');
  end if;

  -- the group is the one thing carried across, because per-group results are the
  -- product. k-anonymity is what makes that safe, and it is applied on read.
  select e.group_id into v_group from app.employees e where e.id = v_inv.employee_id;

  update app.invitations set responded_at = now() where id = v_inv.id;

  insert into app.responses (org_id, round_id, group_id, submitted_hour)
  values (v_inv.org_id, v_inv.round_id, v_group, date_trunc('hour', now()))
  returning id into v_resp;

  insert into app.answers (response_id, factor_key, ordinal, value)
  select v_resp, (a->>'factor')::text, (a->>'ordinal')::int, (a->>'value')::int
  from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) a;
  get diagnostics v_written = row_count;

  -- a skipped question sends nothing, so an absent key is a skip and an empty string
  -- is not an answer either
  insert into app.extra_answers (response_id, extra_key, option_ordinal, free_text)
  select v_resp, (x->>'key')::text,
         nullif(x->>'option', '')::int,
         nullif(btrim(coalesce(x->>'text', '')), '')
  from jsonb_array_elements(coalesce(p_extra, '[]'::jsonb)) x
  where nullif(x->>'option', '') is not null
     or nullif(btrim(coalesce(x->>'text', '')), '') is not null;

  -- v_resp is deliberately NOT returned: the caller must not be able to correlate
  -- their submission with a row.
  return jsonb_build_object('ok', true, 'answers', v_written);
end $fn$;

-- anon MUST be able to call this one: it is the only write path a respondent has, and
-- a respondent is by definition not signed in.
revoke all on function public.submit_response(text, jsonb, jsonb) from public;
grant execute on function public.submit_response(text, jsonb, jsonb) to anon, authenticated;
