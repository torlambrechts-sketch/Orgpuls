-- 0095_own_questions.sql — the organisation's own questions are asked, open answers are read,
-- and names are masked before a leader reads what an employee wrote (D-145, X-080).
--
-- The gap analysis (docs/implementation/gap-analyse-soundings.md, P0-1, P0-3, P1-8) found three
-- things the product said and did not do:
--
--   * Måleoppsett let a leader write up to five questions of their own, and no form ever asked
--     them: respond_form never read app.round_org_questions and nothing wrote to it.
--   * The open field («Hva bør vi gjøre noe med først?») was stored in extra_answers.free_text,
--     and no screen read it.
--   * The respondent was told the text is «sjekket for gjenkjennelige detaljer» before anyone
--     reads it. Nothing checked it.
--
-- This migration:
--
--   * gives an own question the design's two kinds (v3 bundle 5789-5809): «Skala 1–5» and
--     «Fritekst», and makes it a question of a round, at most five per round. The cap moves
--     from the organisation's bank to the round, because a bank capped at five would be full
--     after the first measurement.
--   * fixes a question's words and kind once a round that asks it has opened, and refuses a
--     client's delete of one that has been asked. "Nobody may change this content": the
--     database's own cascades still pass (CLAUDE.md, immutability triggers).
--   * adds app.org_question_answers, an answer table like the others: a response and a
--     question, RLS on, NO policy, grants revoked, append-only, written only by submit_response.
--   * asks them: respond_form returns `own`, submit_response takes `p_own`.
--   * reports them: public.results_own_questions — for a closed round, whole organisation only,
--     to daglig leder and verneombud, a question's figures only at k answers or more.
--   * reads the open answers: public.open_answers — the open field and own «Fritekst»
--     questions, for a closed round with at least k responses, whole organisation only, to the
--     daglig leder (a verneombud reads no single comment, 0022; an avdelingsleder's scope is
--     groups, and these texts have none), in an order that is not the order they were written in,
--     and masked.
--   * masks: app.mask_patterns / app.mask_apply replace every name in the organisation's own
--     register — an employee's first and last names, a department's name, a location's name —
--     with a marker the screen renders as «[navn]», «[avdeling]», «[sted]». Deterministic, in
--     the database, before the text leaves it: public.conversations masks what the employee
--     wrote in a thread the same way. What the respondent reads back of their own thread is not
--     masked; it is theirs.

-- ---------------------------------------------------------------- the question
alter table app.org_questions
  add column kind text not null default 'skala' check (kind in ('skala', 'fritekst'));

comment on column app.org_questions.kind is
  'How it is answered (0095): skala = 1–5, «i svært liten grad» to «i svært stor grad»; fritekst = a text, masked when read.';

-- the cap is five per round (the design's «{n} av 5»), not five in the organisation's bank
drop trigger org_questions_cap on app.org_questions;
drop function app.org_questions_cap();

create function app.round_org_questions_cap() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
declare v_n int;
begin
  if not exists (select 1 from app.rounds r join app.org_questions q on q.org_id = r.org_id
                 where r.id = new.round_id and q.id = new.question_id) then
    raise exception 'round % and question % are not in the same organisation', new.round_id, new.question_id;
  end if;
  select count(*) into v_n from app.round_org_questions
  where round_id = new.round_id and question_id <> new.question_id;
  if v_n >= 5 then
    raise exception 'a round may ask at most five of the organisation''s own questions (has %)', v_n;
  end if;
  return new;
end $fn$;
revoke all on function app.round_org_questions_cap() from public, anon, authenticated;

create trigger round_org_questions_cap before insert or update on app.round_org_questions
  for each row execute function app.round_org_questions_cap();

-- once a round that asks it has opened, its words and kind are what was answered
create function app.org_question_fixed() returns trigger
  language plpgsql set search_path = ''
as $fn$
declare
  v_asked boolean;
begin
  select exists (select 1 from app.round_org_questions rq join app.rounds r on r.id = rq.round_id
                 where rq.question_id = old.id and r.status <> 'planlagt') into v_asked;
  if tg_op = 'UPDATE' then
    if v_asked and (new.body is distinct from old.body or new.kind is distinct from old.kind
                    or new.org_id is distinct from old.org_id) then
      raise exception 'an own question is fixed once a round has asked it' using errcode = 'restrict_violation';
    end if;
    return new;
  end if;
  -- a client may not delete one that has been asked; the organisation's own deletion, and the
  -- database's work on its behalf, may
  if v_asked and current_user in ('authenticated', 'anon')
     and exists (select 1 from app.organizations o where o.id = old.org_id) then
    raise exception 'an own question that has been asked cannot be deleted' using errcode = 'restrict_violation';
  end if;
  return old;
end $fn$;

create trigger org_question_fixed before update or delete on app.org_questions
  for each row execute function app.org_question_fixed();

-- ---------------------------------------------------------------- the answers
create table app.org_question_answers (
  response_id uuid not null references app.responses (id) on delete cascade,
  question_id uuid not null references app.org_questions (id) on delete cascade,
  value       smallint check (value between 1 and 5),
  free_text   text check (char_length(free_text) between 1 and 4000),
  primary key (response_id, question_id),
  check ((value is null) <> (free_text is null))
);
create index org_question_answers_question_idx on app.org_question_answers (question_id);

comment on table app.org_question_answers is
  'Answers to an organisation''s own questions (0095, D-145). An answer table: no policy, no grant, append-only, written by submit_response only, read by results_own_questions and open_answers.';

-- append-only; a delete only once its response or its question is gone
create function app.org_question_answer_fixed() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from app.responses r where r.id = old.response_id)
       and exists (select 1 from app.org_questions q where q.id = old.question_id) then
      raise exception 'answers are append-only: % cannot be deleted', old.response_id using errcode = 'restrict_violation';
    end if;
    return old;
  end if;
  raise exception 'answers are immutable once submitted' using errcode = 'restrict_violation';
end $fn$;

create trigger org_question_answers_immutable before update or delete on app.org_question_answers
  for each row execute function app.org_question_answer_fixed();

-- the answer matches the question's kind
create function app.org_question_answer_kind() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  if not exists (select 1 from app.org_questions q where q.id = new.question_id
                 and ((q.kind = 'skala') = (new.value is not null))) then
    raise exception 'an answer to question % does not match its kind', new.question_id;
  end if;
  return new;
end $fn$;

create trigger org_question_answers_kind before insert on app.org_question_answers
  for each row execute function app.org_question_answer_kind();

alter table app.org_question_answers enable row level security;
-- NO POLICIES, and no grants: every client role is denied, as for every answer table
revoke all on app.org_question_answers from public, anon, authenticated;
revoke all on function app.org_question_fixed(), app.org_question_answer_fixed(), app.org_question_answer_kind()
  from public, anon, authenticated;

-- a demo copy takes them with the rest of the answers (0094)
insert into app.demo_copy_plan (table_name, step, mode, via, note) values
  ('org_question_answers', 62, 'copy', 'response_id', 'own-question answers');

-- ---------------------------------------------------------------- writing them
/*
 * Måleoppsett's «＋ Legg til spørsmål» and «×», each one statement: a question is written and
 * put on its round together, and taken off with it. SECURITY INVOKER, so the caller's own
 * policies decide (org_question_write_*, round_org_question_write_*: daglig leder and
 * avdelingsleder), and the triggers refuse a sixth question or a round that has opened.
 */
create function public.add_round_question(p_round uuid, p_body text, p_kind text default 'skala') returns uuid
  language plpgsql security invoker set search_path = ''
as $fn$
declare
  v_org uuid;
  v_id  uuid;
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round;
  if v_org is null then
    raise exception 'no such round' using errcode = 'no_data_found';
  end if;
  insert into app.org_questions (org_id, body, kind) values (v_org, btrim(p_body), p_kind) returning id into v_id;
  insert into app.round_org_questions (round_id, question_id) values (p_round, v_id);
  return v_id;
end $fn$;

create function public.remove_round_question(p_round uuid, p_question uuid) returns void
  language plpgsql security invoker set search_path = ''
as $fn$
begin
  delete from app.round_org_questions where round_id = p_round and question_id = p_question;
  if not found then
    raise exception 'no such question on this round' using errcode = 'no_data_found';
  end if;
  -- the question goes with its last round
  delete from app.org_questions q where q.id = p_question
    and not exists (select 1 from app.round_org_questions rq where rq.question_id = q.id);
end $fn$;

revoke all on function public.add_round_question(uuid, text, text), public.remove_round_question(uuid, uuid) from public, anon;
grant execute on function public.add_round_question(uuid, text, text), public.remove_round_question(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------- masking
/*
 * The patterns a text is masked with, for one organisation: [departments, locations, long
 * names, short names], each one alternation, longest first so «Drift og vedlikehold» goes
 * before «Drift». A name is each capitalised word of an employee's name (particles like «van»
 * are left: they are words), with its genitive. A name of three letters or fewer is matched with its capital
 * only, so «Per» is masked and «per uke» is not; a longer one in any case. A word boundary is
 * any letter, digit or Latin letter with a mark, so «Åse» is masked and «Åsen» is not.
 */
create function app.mask_patterns(p_org uuid) returns text[]
  language sql stable security definer set search_path = ''
as $fn$
  with words as (
    select 'a' as tag, btrim(g.name) as w from app.groups g where g.org_id = p_org
    union select 's', btrim(l.name) from app.locations l where l.org_id = p_org
    union select 'n', t from app.employees e,
      lateral (select regexp_split_to_table(e.full_name, '\s+') union select regexp_split_to_table(e.full_name, '[\s-]+')) x(t)
      where e.org_id = p_org
  ), kept as (
    select tag, w,
           regexp_replace(w, '([\[\].^$*+?(){}|\\-])', '\\\1', 'g') as esc
    from words
    where char_length(w) >= 2 and (tag <> 'n' or w ~ '^[[:upper:]]')
  )
  select array[
    (select string_agg(esc, '|' order by char_length(w) desc, w) from kept where tag = 'a'),
    (select string_agg(esc, '|' order by char_length(w) desc, w) from kept where tag = 's'),
    (select string_agg(esc, '|' order by char_length(w) desc, w) from kept where tag = 'n' and char_length(w) > 3),
    (select string_agg(esc, '|' order by char_length(w) desc, w) from kept where tag = 'n' and char_length(w) <= 3)
  ]
$fn$;

-- a text with its names replaced: ⟦a⟧ a department, ⟦s⟧ a location, ⟦n⟧ a person
create function app.mask_apply(p_text text, p_pat text[]) returns text
  language plpgsql immutable set search_path = ''
as $fn$
declare
  v   text := p_text;
  pre constant text := '(?<![[:alnum:]À-ɏ])(';
  -- a name may carry the genitive: «Øyvinds», «Per's»
  post constant text := ')(s|''s|’s)?(?![[:alnum:]À-ɏ])';
begin
  if v is null or p_pat is null then return v; end if;
  if p_pat[1] is not null then v := regexp_replace(v, pre || p_pat[1] || post, '⟦a⟧', 'gi'); end if;
  if p_pat[2] is not null then v := regexp_replace(v, pre || p_pat[2] || post, '⟦s⟧', 'gi'); end if;
  if p_pat[3] is not null then v := regexp_replace(v, pre || p_pat[3] || post, '⟦n⟧', 'gi'); end if;
  if p_pat[4] is not null then v := regexp_replace(v, pre || p_pat[4] || post, '⟦n⟧', 'g'); end if;
  return v;
end $fn$;

revoke all on function app.mask_patterns(uuid) from public, anon, authenticated;
revoke all on function app.mask_apply(text, text[]) from public, anon, authenticated;

-- ---------------------------------------------------------------- the respondent
create or replace function public.respond_form(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_inv    app.invitations%rowtype;
  v_org    app.organizations%rowtype;
  v_round  app.rounds%rowtype;
  v_qs     jsonb;
  v_extra  jsonb;
  v_module jsonb;
  v_own    jsonb;
begin
  if p_token is null or length(p_token) < 16 then
    return jsonb_build_object('error', 'invalid_token');
  end if;

  select * into v_inv from app.invitations i
  where i.token_hash = extensions.digest(p_token, 'sha256');

  if not found then
    return jsonb_build_object('error', 'invalid_token');
  end if;
  if v_inv.responded_at is not null then
    return jsonb_build_object('error', 'already_responded');
  end if;
  if v_inv.expires_at <= now() then
    return jsonb_build_object('error', 'expired');
  end if;

  select * into v_round from app.rounds r where r.id = v_inv.round_id;
  if v_round.status <> 'apen' then
    return jsonb_build_object('error', 'round_closed');
  end if;

  select * into v_org from app.organizations o where o.id = v_inv.org_id;

  -- shuffled per token, stable on reload
  select jsonb_agg(jsonb_build_object('factor', q.factor_key, 'ordinal', q.ordinal)
                   order by q.seed)
  into v_qs
  from (
    select rf.factor_key, s.ordinal,
           extensions.digest(p_token || rf.factor_key || s.ordinal::text, 'sha256') as seed
    from app.round_factors rf
    join app.statements s on s.factor_key = rf.factor_key
    where rf.round_id = v_round.id
  ) q;

  select jsonb_agg(jsonb_build_object(
           'key', x.extra_key, 'kind', q.kind,
           'options', (select count(*) from app.extra_options o where o.extra_key = x.extra_key))
         order by q.sort_order)
  into v_extra
  from app.round_extra_questions x
  join app.extra_questions q on q.key = x.extra_key
  where x.round_id = v_round.id;

  -- one module per round in practice; an array so a second would need no new shape
  select jsonb_agg(jsonb_build_object(
           'name', m.name,
           -- 0089: a module in variants takes about eight seconds a statement, as asked
           'minutes', case when rm.variant_key is null then m.estimated_minutes
                           else greatest(1, round(cardinality(rm.item_ids) * 8 / 60.0))::int end,
           'statements', (
             select coalesce(jsonb_agg(jsonb_build_object('item', i.id, 'factor', coalesce(f.i18n->('nb.' || rm.wording)->>'name', f.name),
                                                  'text', coalesce(i.text->>('nb.' || rm.wording), i.text->>'nb'),
                                                  'factor_en', f.i18n->'en'->>'name', 'text_en', i.text->>'en',
                                                  'help', i.help->>'nb', 'help_en', i.help->>'en')
                                       order by extensions.digest(p_token || i.id::text, 'sha256')), '[]'::jsonb)
             from app.module_items i
             -- 0089: the factor the respondent reads it under: the simplified one in the simplified
             -- set, its own in the extended set; in a puls, simplified for a core statement
             join lateral (
               select ff.name, ff.i18n from app.module_factor_items mi join app.module_factors ff on ff.id = mi.factor_id
               where mi.item_id = i.id
                 and (ff.variant_key is null
                      or ff.variant_key = coalesce(rm.variant_key, case when i.core_indicator then 'forenklet' else 'utvidet' end))
               order by ff.sort limit 1
             ) f on true
             where i.id = any (rm.item_ids)),
           'count', case when rm.include_count_items then (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'item', i.id, 'text', coalesce(i.text->>('nb.' || rm.wording), i.text->>'nb'),
                      'options', (select jsonb_agg(o->>'nb' order by n) from jsonb_array_elements(i.options) with ordinality as y(o, n)),
                      'text_en', i.text->>'en',
                      'options_en', (select jsonb_agg(o->>'en' order by n) from jsonb_array_elements(i.options) with ordinality as y(o, n)),
                      -- 0090: the answer each option is sent as
                      'answers', to_jsonb(app.count_answer_keys(i)))
                    order by i.sort), '[]'::jsonb)
             from app.module_items i where i.module_id = m.id and i.kind = 'count'
               -- 0089: the count questions of the round's variant; 0090: and of its factors
               and app.count_item_asked(i, rm)) else '[]'::jsonb end,
           'segments', case when rm.include_segments then (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'item', i.id, 'text', i.text->>'nb',
                      'options', (select jsonb_agg(o->>'nb' order by n) from jsonb_array_elements(i.options) with ordinality as y(o, n)),
                      'text_en', i.text->>'en',
                      'options_en', (select jsonb_agg(o->>'en' order by n) from jsonb_array_elements(i.options) with ordinality as y(o, n)))
                    order by i.sort), '[]'::jsonb)
             from app.module_items i where i.module_id = m.id and i.kind = 'segment') else '[]'::jsonb end)
         order by m.key)
  into v_module
  from app.round_modules rm join app.question_modules m on m.id = rm.module_id
  where rm.round_id = v_round.id;

  -- 0095: the organisation's own questions, in the order they were written, in its own words
  select jsonb_agg(jsonb_build_object('id', q.id, 'text', q.body, 'kind', q.kind) order by q.created_at, q.id)
  into v_own
  from app.round_org_questions rq join app.org_questions q on q.id = rq.question_id
  where rq.round_id = v_round.id;

  return jsonb_build_object(
    'org', v_org.name,
    'threshold', app.k_threshold(v_inv.org_id),
    'questions', coalesce(v_qs, '[]'::jsonb),
    'extra', coalesce(v_extra, '[]'::jsonb),
    'modules', coalesce(v_module, '[]'::jsonb),
    'own', coalesce(v_own, '[]'::jsonb)
  );
end $function$;

-- p_own is a fifth argument: the four-argument function goes, so a call with four is not ambiguous
drop function public.submit_response(text, jsonb, jsonb, jsonb);

create function public.submit_response(p_token text, p_answers jsonb, p_extra jsonb, p_module jsonb default '{}'::jsonb,
                                       p_own jsonb default '[]'::jsonb)
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
  v_own     jsonb := coalesce(p_own, '[]'::jsonb);
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
                      and i.kind = 'count' and i.id::text = (x->>'item')
                      -- 0089: a question of the round's variant; 0090: and of its factors, answered
                      -- with one of the answers its options are stored as
                      and app.count_item_asked(i, rm)
                      and coalesce(x->>'answer', '') = any (app.count_answer_keys(i)));
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

  -- 0095: an own question the round asks, answered as its kind is: a value 1–5 on «skala», a
  -- text on «fritekst»
  if jsonb_typeof(v_own) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'question_not_in_round');
  end if;
  select count(*) into v_bad
  from jsonb_array_elements(v_own) x
  where jsonb_typeof(x) <> 'object'
     or not exists (
       select 1 from app.round_org_questions rq join app.org_questions q on q.id = rq.question_id
       where rq.round_id = v_inv.round_id and q.id::text = (x->>'question')
         and (   (q.kind = 'skala' and coalesce(x->>'value', '') ~ '^[1-5]$' and not x ? 'text')
              or (q.kind = 'fritekst' and not x ? 'value'
                  and char_length(btrim(coalesce(x->>'text', ''))) between 1 and 4000)));
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

  -- 0095: the own questions, on the same unlinked row, one answer each
  insert into app.org_question_answers (response_id, question_id, value, free_text)
  select distinct on ((x->>'question')::uuid) v_resp, (x->>'question')::uuid,
         nullif(x->>'value', '')::smallint, nullif(btrim(coalesce(x->>'text', '')), '')
  from jsonb_array_elements(v_own) x;

  -- v_resp is deliberately NOT returned: the caller must not be able to correlate
  -- their submission with a row.
  return jsonb_build_object('ok', true, 'answers', v_written, 'threads', v_keys);
end $function$;
revoke all on function public.submit_response(text, jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function public.submit_response(text, jsonb, jsonb, jsonb, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------- results
/*
 * The own «Skala 1–5» questions of a closed round: per question the answers' count, their
 * mean, and the share who said «i stor grad» or «i svært stor grad». Whole organisation only,
 * to daglig leder and verneombud (the readers of results_summary's whole scope), and a
 * question's figures only once k people have answered it. Reported for themselves: nothing
 * here enters an index («Egne spørsmål rapporteres for seg», v3 bundle 5811).
 */
create function public.results_own_questions(p_round uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_org uuid;
  v_k   int;
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round and r.status = 'lukket';
  if v_org is null or not app.has_role(v_org, array['daglig_leder', 'verneombud']::app.org_role[]) then
    return jsonb_build_object('error', 'not_available');
  end if;
  v_k := app.k_threshold(v_org);

  return jsonb_build_object('threshold', v_k, 'items', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', q.id, 'text', q.body, 'kind', q.kind,
             'suppressed', s.n < v_k,
             'n', case when s.n >= v_k then s.n end,
             'mean', case when s.n >= v_k then s.mean end,
             'high', case when s.n >= v_k then s.high end)
           order by q.created_at, q.id)
    from app.round_org_questions rq
    join app.org_questions q on q.id = rq.question_id
    join lateral (
      select count(a.value)::int as n,
             round(avg(a.value), 1) as mean,
             round(100.0 * count(*) filter (where a.value >= 4) / nullif(count(a.value), 0))::int as high
      from app.org_question_answers a join app.responses r on r.id = a.response_id
      where r.round_id = p_round and a.question_id = q.id and a.value is not null
    ) s on true
    where rq.round_id = p_round and q.kind = 'skala'), '[]'::jsonb));
end $fn$;
revoke all on function public.results_own_questions(uuid) from public, anon;
grant execute on function public.results_own_questions(uuid) to authenticated;

/*
 * What employees wrote in answer to a question, not on a statement: the open field (the
 * round's free-text screening question) and the own «Fritekst» questions. For a closed round
 * with at least k responses, whole organisation only, to the daglig leder: as with comments, a
 * verneombud reads no single text (0022), and an avdelingsleder's scope is groups. No
 * group, no hour, no order of writing: the texts come sorted by a digest of themselves.
 * Masked (app.mask_apply) before they leave the database.
 */
create function public.open_answers(p_round uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_org uuid;
  v_k   int;
  v_n   int;
  v_pat text[];
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round and r.status = 'lukket';
  if v_org is null or not app.has_role(v_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('error', 'not_available');
  end if;
  v_k := app.k_threshold(v_org);
  select count(*) into v_n from app.responses r where r.round_id = p_round;
  if v_n < v_k then
    return jsonb_build_object('status', 'insufficient_data', 'threshold', v_k);
  end if;
  v_pat := app.mask_patterns(v_org);

  return jsonb_build_object('status', 'ok', 'threshold', v_k, 'items', coalesce((
    select jsonb_agg(item order by ord, sort) from (
      select 0 as ord, q.sort_order::text as sort,
             jsonb_build_object('key', 'extra:' || x.extra_key, 'extra', x.extra_key, 'text', null,
               'answers', (select coalesce(jsonb_agg(app.mask_apply(e.free_text, v_pat)
                                                     order by extensions.digest(e.free_text, 'sha256')), '[]'::jsonb)
                           from app.extra_answers e join app.responses r on r.id = e.response_id
                           where r.round_id = p_round and e.extra_key = x.extra_key and e.free_text is not null)) as item
      from app.round_extra_questions x join app.extra_questions q on q.key = x.extra_key
      where x.round_id = p_round and q.kind = 'free_text'
      union all
      select 1, q.created_at::text || q.id::text,
             jsonb_build_object('key', 'own:' || q.id, 'extra', null, 'text', q.body,
               'answers', (select coalesce(jsonb_agg(app.mask_apply(a.free_text, v_pat)
                                                     order by extensions.digest(a.free_text, 'sha256')), '[]'::jsonb)
                           from app.org_question_answers a join app.responses r on r.id = a.response_id
                           where r.round_id = p_round and a.question_id = q.id and a.free_text is not null))
      from app.round_org_questions rq join app.org_questions q on q.id = rq.question_id
      where rq.round_id = p_round and q.kind = 'fritekst'
    ) t), '[]'::jsonb));
end $fn$;
revoke all on function public.open_answers(uuid) from public, anon;
grant execute on function public.open_answers(uuid) to authenticated;

-- ---------------------------------------------------------------- threads, masked
CREATE OR REPLACE FUNCTION public.conversations(p_round uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
  v_k   int;
  v_whole boolean;
  v_out jsonb;
  v_pat text[];
begin
  select m.org_id into v_org
  from app.memberships m
  where m.user_id = auth.uid() and m.active
    and m.role in ('daglig_leder', 'avdelingsleder')
  limit 1;

  if v_org is null then
    return jsonb_build_object('error', 'not_available');
  end if;

  v_k := app.k_threshold(v_org);
  v_pat := app.mask_patterns(v_org);

  select exists (
    select 1 from app.memberships m
    where m.user_id = auth.uid() and m.active and m.org_id = v_org
      and m.role = 'daglig_leder'
  ) into v_whole;

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
      (select a.value from app.answers a
        where a.response_id = ct.response_id
          and a.factor_key = ct.factor_key and a.ordinal = ct.ordinal) as answer_value,
      app.mask_apply(rc.body, v_pat) as opening,
      (select coalesce(jsonb_agg(jsonb_build_object(
                 'author', tm.author,
                 -- 0095: what the employee wrote is masked; the leader's own replies are not
                 'body', case when tm.author = 'ansatt' then app.mask_apply(tm.body, v_pat) else tm.body end, 'sent_hour', tm.sent_hour)
               order by tm.sent_hour), '[]'::jsonb)
         from app.thread_messages tm where tm.thread_id = ct.id) as messages,
      (select jsonb_build_object('name', p.full_name, 'mine', cr.requested_by = auth.uid())
         from app.contact_requests cr join app.profiles p on p.id = cr.requested_by
        where cr.thread_id = ct.id) as contact
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
      and (v_whole or r.group_id in (select vg.group_id from app.visible_groups(v_org) vg))
      and (
        select count(*) from app.responses r2
        where r2.round_id = r.round_id and r2.group_id is not distinct from r.group_id
      ) >= v_k
  ) t;

  return jsonb_build_object('threshold', v_k, 'threads', v_out);
end $function$;
