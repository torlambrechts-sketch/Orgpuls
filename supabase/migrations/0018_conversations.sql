-- 0018_conversations.sql — anonymous two-way, without a linkage.
--
-- Samtaler is the hardest screen in the product to build honestly. A leader must be able
-- to read what somebody wrote and reply to them; the person must receive the reply; and
-- the organisation must still be unable to tell who wrote it. Every obvious construction
-- fails the third: a thread keyed to an invitation reaches `employee_id` in one join, and
-- a thread keyed to an employee is the linkage CLAUDE.md invariant 2 says must not exist
-- as a column at all — "not a nullable one, none".
--
-- The construction used here is a **capability the respondent holds and the organisation
-- cannot compute**:
--
--   1. `submit_response` mints 32 random bytes per comment and returns the hex to the
--      caller — the respondent's browser — once, in the submit response body.
--   2. The database stores only `sha256(key)`. There is no way back from the hash to the
--      key, so nobody with database access can produce a key they were not given.
--   3. The respondent returns with the key to read replies and to follow up. The server
--      hashes what it is handed and looks the thread up, exactly as `submit_response`
--      looks up an invitation — a transient comparison, never a stored association.
--
-- What the thread therefore carries: a response, a factor, an ordinal, a state, and a
-- hash. It carries no employee, no invitation, and no user. `app.responses` is already
-- unlinkable to a person by construction, so `response_id` reaches (org, round, group,
-- hour) and stops — the same reach `app.response_comments` has had since 0003.
--
-- **This changes rpc.submit_response, which invariant 3 pins**, and it does so
-- deliberately and with the user's sign-off. What invariant 3 protects is preserved: the
-- function still looks the token up by SHA-256 of the plaintext, still writes in a single
-- transaction, and still does not return the id of the response row. A capability key is
-- not that id: it names a conversation, it is minted rather than read back, and the
-- caller cannot derive the response from it — only the server can, and only while it
-- holds the key it was handed.
--
-- The reading side is k-gated exactly as results are. A comment from a group that did not
-- clear `app.k_threshold()` is withheld, because a comment from a group of three narrows
-- to one of three. And **the group never travels with the comment** even when it is
-- released: "somebody in Verksted wrote this" plus an eight-person department is a
-- smaller haystack than the product promises, and no screen needs it.

create type app.thread_state as enum ('venter', 'dialog', 'lukket');
create type app.message_author as enum ('ansatt', 'leder');

create table app.comment_threads (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references app.organizations (id) on delete cascade,
  -- reaches (org, round, group, hour) and stops; app.responses has no person on it
  response_id uuid not null references app.responses (id) on delete cascade,
  factor_key  text not null,
  ordinal     int  not null,
  -- the respondent's capability. Stored as a digest, unique so a key names one thread.
  key_hash    bytea not null unique,
  state       app.thread_state not null default 'venter',
  -- aml. kap. 2A. Set by a person who read it, never inferred from the text: classifying
  -- somebody's words as a varsel is a judgement with consequences for how the case must
  -- be handled, and a guess that is wrong either way does harm.
  flagged_varsel boolean not null default false,
  -- truncated to the hour, the same rule app.responses carries, so the moment a thread
  -- was opened cannot be matched against a clock
  opened_hour timestamptz not null,
  foreign key (response_id, factor_key, ordinal)
    references app.response_comments (response_id, factor_key, ordinal) on delete cascade,
  unique (response_id, factor_key, ordinal)
);

alter table app.comment_threads
  add constraint comment_threads_hour_truncated
  check (opened_hour = date_trunc('hour', opened_hour));

create index comment_threads_org_idx on app.comment_threads (org_id, state);

create table app.thread_messages (
  id        uuid primary key default gen_random_uuid(),
  thread_id uuid not null references app.comment_threads (id) on delete cascade,
  author    app.message_author not null,
  body      text not null check (length(btrim(body)) > 0 and length(body) <= 4000),
  -- same truncation, same reason
  sent_hour timestamptz not null check (sent_hour = date_trunc('hour', sent_hour))
);

create index thread_messages_thread_idx on app.thread_messages (thread_id, sent_hour);

-- ---------------------------------------------------------------------------
-- No client reads either table. Same shape as app.responses and app.answers:
-- RLS on, no policy, no grant, so every client role is denied by default and the
-- SECURITY DEFINER functions below are the only way anything leaves.
-- ---------------------------------------------------------------------------
alter table app.comment_threads enable row level security;
alter table app.thread_messages enable row level security;
revoke all on app.comment_threads, app.thread_messages from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- READ — leader side, k applied per thread.
-- ---------------------------------------------------------------------------
create function public.conversations(p_round uuid default null)
  returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_org uuid;
  v_k   int;
  v_out jsonb;
begin
  -- the caller's organisation, from their membership; nothing is taken from arguments
  select m.org_id into v_org
  from app.memberships m
  where m.user_id = auth.uid() and m.active
  limit 1;

  if v_org is null then
    return jsonb_build_object('error', 'not_available');
  end if;

  v_k := app.k_threshold(v_org);

  /*
   * `answered` is the count of responses in that thread's group for that round — the
   * same denominator the results gate uses. A thread whose group did not clear k is not
   * returned at all: not masked, not counted, absent. Masking it would still say "there
   * is a comment from Administrasjon", which in a group of three is most of the way to a
   * name.
   *
   * The group itself is never selected into the output. It exists in this query only as
   * the thing being counted.
   */
  select coalesce(jsonb_agg(t order by t.opened_hour desc), '[]'::jsonb) into v_out
  from (
    select
      ct.id,
      ct.factor_key,
      ct.state,
      ct.flagged_varsel,
      ct.opened_hour,
      r.round_id,
      ms.kind  as round_kind,
      ms.year  as round_year,
      -- the value on the statement the comment hangs on, which is what the design shows
      -- as "Negativ". A number, not the answer row.
      (select a.value from app.answers a
        where a.response_id = ct.response_id
          and a.factor_key = ct.factor_key and a.ordinal = ct.ordinal) as answer_value,
      rc.body as opening,
      (select coalesce(jsonb_agg(jsonb_build_object(
                 'author', tm.author, 'body', tm.body, 'sent_hour', tm.sent_hour)
               order by tm.sent_hour), '[]'::jsonb)
         from app.thread_messages tm where tm.thread_id = ct.id) as messages
    from app.comment_threads ct
    join app.responses r on r.id = ct.response_id
    join app.rounds rd on rd.id = r.round_id
    join app.measurements ms on ms.id = rd.measurement_id
    join app.response_comments rc
      on rc.response_id = ct.response_id
     and rc.factor_key = ct.factor_key
     and rc.ordinal = ct.ordinal
    where ct.org_id = v_org
      and (p_round is null or r.round_id = p_round)
      and (
        select count(*) from app.responses r2
        where r2.round_id = r.round_id and r2.group_id is not distinct from r.group_id
      ) >= v_k
  ) t;

  return jsonb_build_object('threshold', v_k, 'threads', v_out);
end $fn$;

revoke all on function public.conversations(uuid) from public, anon;
grant execute on function public.conversations(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- READ — respondent side, by capability.
-- ---------------------------------------------------------------------------
create function public.thread_by_key(p_key text)
  returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare v_id uuid; v_out jsonb;
begin
  if p_key is null or length(p_key) < 32 then
    return jsonb_build_object('error', 'invalid_key');
  end if;

  select ct.id into v_id
  from app.comment_threads ct
  where ct.key_hash = extensions.digest(p_key, 'sha256');

  -- one answer for "no such key" and "wrong key", so this cannot be used to probe
  if not found then
    return jsonb_build_object('error', 'invalid_key');
  end if;

  select jsonb_build_object(
    'state', ct.state,
    'factor_key', ct.factor_key,
    'opening', rc.body,
    'messages', (select coalesce(jsonb_agg(jsonb_build_object(
                    'author', tm.author, 'body', tm.body, 'sent_hour', tm.sent_hour)
                  order by tm.sent_hour), '[]'::jsonb)
                 from app.thread_messages tm where tm.thread_id = ct.id))
  into v_out
  from app.comment_threads ct
  join app.response_comments rc
    on rc.response_id = ct.response_id and rc.factor_key = ct.factor_key
   and rc.ordinal = ct.ordinal
  where ct.id = v_id;

  return v_out;
end $fn$;

revoke all on function public.thread_by_key(text) from public;
grant execute on function public.thread_by_key(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- WRITE — a leader replies.
-- ---------------------------------------------------------------------------
create function public.reply_to_thread(p_thread uuid, p_body text)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare v_org uuid;
begin
  if p_body is null or btrim(p_body) = '' or length(p_body) > 4000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_body');
  end if;

  select ct.org_id into v_org from app.comment_threads ct where ct.id = p_thread;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- the same pair that owns measures and risk assessments answers on the employer's behalf
  if not app.has_role(v_org, array['daglig_leder','avdelingsleder']::app.org_role[]) then
    return jsonb_build_object('ok', false, 'error', 'denied');
  end if;

  insert into app.thread_messages (thread_id, author, body, sent_hour)
  values (p_thread, 'leder', btrim(p_body), date_trunc('hour', now()));

  update app.comment_threads set state = 'dialog'
  where id = p_thread and state = 'venter';

  return jsonb_build_object('ok', true);
end $fn$;

revoke all on function public.reply_to_thread(uuid, text) from public, anon;
grant execute on function public.reply_to_thread(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- WRITE — the respondent follows up, by capability.
-- ---------------------------------------------------------------------------
create function public.follow_up(p_key text, p_body text)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare v_id uuid;
begin
  if p_key is null or length(p_key) < 32 then
    return jsonb_build_object('ok', false, 'error', 'invalid_key');
  end if;
  if p_body is null or btrim(p_body) = '' or length(p_body) > 4000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_body');
  end if;

  select ct.id into v_id from app.comment_threads ct
  where ct.key_hash = extensions.digest(p_key, 'sha256') and ct.state <> 'lukket';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_key');
  end if;

  insert into app.thread_messages (thread_id, author, body, sent_hour)
  values (v_id, 'ansatt', btrim(p_body), date_trunc('hour', now()));

  return jsonb_build_object('ok', true);
end $fn$;

revoke all on function public.follow_up(text, text) from public;
grant execute on function public.follow_up(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- WRITE — a leader closes a thread, or marks it as a possible varsel.
-- ---------------------------------------------------------------------------
create function public.set_thread(p_thread uuid, p_state text default null,
                                  p_flagged boolean default null)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare v_org uuid;
begin
  select ct.org_id into v_org from app.comment_threads ct where ct.id = p_thread;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if not app.has_role(v_org, array['daglig_leder','avdelingsleder']::app.org_role[]) then
    return jsonb_build_object('ok', false, 'error', 'denied');
  end if;
  if p_state is not null and p_state not in ('venter', 'dialog', 'lukket') then
    return jsonb_build_object('ok', false, 'error', 'invalid_state');
  end if;

  update app.comment_threads
  set state = coalesce(p_state::app.thread_state, state),
      flagged_varsel = coalesce(p_flagged, flagged_varsel)
  where id = p_thread;

  return jsonb_build_object('ok', true);
end $fn$;

revoke all on function public.set_thread(uuid, text, boolean) from public, anon;
grant execute on function public.set_thread(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- The write path, extended: a comment may accompany an answer, and each one opens a
-- thread whose key goes back to the respondent and nowhere else.
-- ---------------------------------------------------------------------------
create or replace function public.submit_response(p_token text, p_answers jsonb)
  returns jsonb
  language plpgsql security definer
  set search_path = ''
as $fn$
declare
  v_inv     app.invitations%rowtype;
  v_group   uuid;
  v_resp    uuid;
  v_written int;
  v_asked   int;
  v_hour    timestamptz;
  v_keys    jsonb := '[]'::jsonb;
  v_key     text;
  a         jsonb;
begin
  if p_token is null or length(p_token) < 16 then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select * into v_inv
  from app.invitations i
  where i.token_hash = extensions.digest(p_token, 'sha256');

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;
  if v_inv.responded_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_responded');
  end if;
  if v_inv.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  perform 1 from app.rounds r where r.id = v_inv.round_id and r.status = 'apen';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'round_closed');
  end if;

  select count(*) into v_asked
  from jsonb_array_elements(p_answers) x
  where not exists (
    select 1 from app.round_factors rf
    where rf.round_id = v_inv.round_id and rf.factor_key = (x->>'factor')
  );
  if v_asked > 0 then
    return jsonb_build_object('ok', false, 'error', 'factor_not_in_round');
  end if;

  select e.group_id into v_group from app.employees e where e.id = v_inv.employee_id;

  update app.invitations set responded_at = now() where id = v_inv.id;

  v_hour := date_trunc('hour', now());

  insert into app.responses (org_id, round_id, group_id, submitted_hour)
  values (v_inv.org_id, v_inv.round_id, v_group, v_hour)
  returning id into v_resp;

  insert into app.answers (response_id, factor_key, ordinal, value)
  select v_resp, (x->>'factor')::text, (x->>'ordinal')::int, (x->>'value')::int
  from jsonb_array_elements(p_answers) x;
  get diagnostics v_written = row_count;

  /*
   * A comment, where one was written, and the capability that lets its author come back
   * to it. The key is 32 random bytes, returned once and stored only as a digest — so
   * this is the single moment in the system's life when the plaintext exists, and it
   * exists in the caller's hands rather than in a column.
   *
   * The keys are returned in the order the comments were given, and carry nothing about
   * the thread or the response they name. v_resp is still not returned.
   */
  for a in select x from jsonb_array_elements(p_answers) x loop
    if coalesce(btrim(a->>'comment'), '') <> '' then
      insert into app.response_comments (response_id, factor_key, ordinal, body)
      values (v_resp, (a->>'factor')::text, (a->>'ordinal')::int, btrim(a->>'comment'));

      v_key := encode(extensions.gen_random_bytes(32), 'hex');

      insert into app.comment_threads
        (org_id, response_id, factor_key, ordinal, key_hash, opened_hour)
      values
        (v_inv.org_id, v_resp, (a->>'factor')::text, (a->>'ordinal')::int,
         extensions.digest(v_key, 'sha256'), v_hour);

      v_keys := v_keys || to_jsonb(v_key);
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'answers', v_written, 'threads', v_keys);
end $fn$;
