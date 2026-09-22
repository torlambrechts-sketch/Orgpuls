-- 0012_response_comments.sql — the optional sentence a respondent adds to an answer.
--
-- The respondent screen puts a control under every scored question: "Vil du si mer?
-- Frivillig og anonymt". Nothing could store what it collects. A textarea whose contents
-- are discarded is worse than no textarea: the person believes they have told someone
-- something, and the promise printed two screens earlier -- "Skriver du en kommentar,
-- kan lederen svare deg uten å få vite hvem du er" -- becomes false.
--
-- This is the storage half only. The two-way thread that lets a manager reply without
-- learning who wrote it is the Samtaler segment and arrives with it; what matters now is
-- that the respondent's words are kept, on the same unlinked row as their answers, so
-- that segment has something to read.
--
-- Free text is the most identifying thing a respondent can produce -- a person can be
-- recognised by what they describe even when nothing about them is stored. So it gets
-- the treatment app.answers gets and then some: RLS on with no policy, grants revoked,
-- append-only. CLAUDE.md's rule that no respondent free text may reach a log, an error
-- payload or analytics applies to every reader of this table.
--
-- submit_response keeps its signature: the comment rides along on the answer it belongs
-- to, as an optional `comment` field, so this is a replace rather than another drop.

create table app.response_comments (
  response_id uuid not null references app.responses (id) on delete cascade,
  factor_key  text not null references app.factors (key),
  ordinal     int  not null,
  body        text not null check (btrim(body) <> ''),
  primary key (response_id, factor_key, ordinal),
  foreign key (factor_key, ordinal) references app.statements (factor_key, ordinal)
);

alter table app.response_comments enable row level security;

-- NO POLICIES, and no grants. Same as app.responses, app.answers, app.extra_answers.
revoke all on app.response_comments from anon, authenticated;

create function app.forbid_comment_change() returns trigger
  language plpgsql
  set search_path = ''
as $fn$
begin
  if tg_op = 'DELETE' then
    -- cascade from a deleted response is legitimate; a direct delete is not
    if exists (select 1 from app.responses r where r.id = old.response_id) then
      raise exception 'comments are append-only: % cannot be deleted', old.response_id
        using errcode = 'restrict_violation';
    end if;
    return old;
  end if;
  if new.body is distinct from old.body
     or new.factor_key is distinct from old.factor_key
     or new.ordinal is distinct from old.ordinal
     or new.response_id is distinct from old.response_id then
    raise exception 'comments are immutable once submitted'
      using errcode = 'restrict_violation';
  end if;
  return new;
end $fn$;

create trigger comments_immutable
  before update or delete on app.response_comments
  for each row execute function app.forbid_comment_change();

-- ---------------------------------------------------------------------------
-- submit_response, now keeping the comments too. Same signature as 0010.
-- ---------------------------------------------------------------------------
create or replace function public.submit_response(p_token text, p_answers jsonb, p_extra jsonb)
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

  select count(*) into v_bad
  from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) a
  where not exists (
    select 1 from app.round_factors rf
    where rf.round_id = v_inv.round_id and rf.factor_key = (a->>'factor')
  );
  if v_bad > 0 then
    return jsonb_build_object('ok', false, 'error', 'factor_not_in_round');
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

  -- the group is the one thing carried across, because per-group results are the
  -- product. k-anonymity is what makes that safe, and it is applied on read.
  select e.group_id into v_group from app.employees e where e.id = v_inv.employee_id;

  update app.invitations set responded_at = now() where id = v_inv.id;

  insert into app.responses (org_id, round_id, group_id, submitted_hour)
  values (v_inv.org_id, v_inv.round_id, v_group, date_trunc('hour', now()))
  returning id into v_resp;

  insert into app.answers (response_id, factor_key, ordinal, value)
  select v_resp, (a->>'factor')::text, (a->>'ordinal')::int, (a->>'value')::int
  from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) a
  where nullif(a->>'value', '') is not null;
  get diagnostics v_written = row_count;

  -- a comment is kept whether or not the question it hangs on was scored
  insert into app.response_comments (response_id, factor_key, ordinal, body)
  select v_resp, (a->>'factor')::text, (a->>'ordinal')::int,
         btrim(a->>'comment')
  from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) a
  where nullif(btrim(coalesce(a->>'comment', '')), '') is not null;

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
