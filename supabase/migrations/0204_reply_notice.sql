-- 0204_reply_notice.sql — a person who wrote a comment can ask to be told when management
-- answers it (X-103, D-229).
--
-- Tor, 2026-10-05, after comparing with Peakon and Culture Amp (which link every comment to its
-- author so they can mail the reply): "Kan vi lage det som en innstilling under undersøkelsen med
-- standard at brukerne får spørsmål på slutten om de har lagt inn kommentarer". An organisation's
-- setting, on by default; the person is asked at the end of the survey, only if they wrote a
-- comment, and only they can say yes.
--
-- What changes about anonymity, and what does not:
--   * Nobody who does not say yes is linked to anything. app.responses still carries no person,
--     and so does every answer table (invariant 2 holds for them unchanged).
--   * For a person who says yes, app.thread_recipients holds one row per conversation their
--     comments opened: the conversation, and — sealed with pgp_sym_encrypt under a key kept in
--     Vault — the employee and the conversation's key. Nothing else in the schema can join it to
--     a person: there is no foreign key to employees or invitations, no policy, no grant, and the
--     only readers are reply_notice_claim (the dispatcher, service role) and the functions that
--     delete it. No role of the organisation can read it, and no screen shows whether anyone said
--     yes.
--   * The link reaches the whole response, because a conversation reaches its response (0018).
--     The question the person is asked says so.
--   * It goes when the conversation is closed, when the person turns it off from the conversation
--     (stop_reply_notice), after a year at most, and with the round or the organisation.
--
-- 1. The setting: app.survey_defaults.reply_notice and app.rounds.reply_notice, beside
--    allow_dialogue and inherited, followed, reset and fixed like it (0076). It only means
--    something while the round allows dialogue.
-- 2. app.reply_notice_offered(invitation): the round's setting, the organisation sends mail (or
--    SMS) and the person can be reached by it, and the organisation is not a demo. respond_form
--    says whether to ask; submit_response takes p_notify and checks it again.
-- 3. app.reply_notices: what the dispatcher sends — one pending notice per conversation, queued
--    by reply_to_thread («svar») and request_contact («kontakt»), due 20 minutes to two hours
--    later and never between 21 and 07 in the organisation's time zone, so the moment a phone
--    lights up does not line up with the moment a leader pressed «Send». Not app.outbox: its rows
--    name the employee and are read for delivery status.
-- 4. No trigger on comment_threads or thread_messages: they are answer tables, and the anonymity
--    firewall (0143, rule 6) keeps anything from being attached to them. The functions that write
--    them queue and delete instead.

-- ---------------------------------------------------------------------------
-- 1 · the setting
alter table app.survey_defaults add column reply_notice boolean not null default true;
alter table app.rounds add column reply_notice boolean not null default true;
comment on column app.survey_defaults.reply_notice is
  'Ask a person who wrote a comment whether they want to be told when management answers (0204). Only while allow_dialogue.';
comment on column app.rounds.reply_notice is
  'This round asks a person who wrote a comment whether they want to be told when management answers (0204). Fixed when the round opens.';
-- Måleoppsett writes a planned round's settings directly, as it does allow_dialogue (0042)
grant update (reply_notice) on app.rounds to authenticated;

do $$
declare
  r     record;
  v_def text;
begin
  for r in select * from (values
    ('app.survey_defaults_of(uuid)',
     $a$'allow_dialogue', true, 'extras'$a$,
     $a$'allow_dialogue', true, 'reply_notice', true, 'extras'$a$),
    ('public.save_survey_defaults(uuid,jsonb)',
     $a$v_new.allow_dialogue        := (p ->> 'allow_dialogue')::boolean;$a$,
     $a$v_new.allow_dialogue        := (p ->> 'allow_dialogue')::boolean;
    -- 0204: a client from before the setting sends none; it keeps what was there
    v_new.reply_notice          := coalesce((p ->> 'reply_notice')::boolean, v_old.reply_notice, true);$a$),
    ('public.save_survey_defaults(uuid,jsonb)',
     $a$final_reminder, quiet_hours, comment_policy, allow_dialogue, extras, extras_off_reason, updated_at, updated_by)$a$,
     $a$final_reminder, quiet_hours, comment_policy, allow_dialogue, reply_notice, extras, extras_off_reason, updated_at, updated_by)$a$),
    ('public.save_survey_defaults(uuid,jsonb)',
     $a$v_new.final_reminder, v_new.quiet_hours, v_new.comment_policy, v_new.allow_dialogue, v_new.extras,$a$,
     $a$v_new.final_reminder, v_new.quiet_hours, v_new.comment_policy, v_new.allow_dialogue, v_new.reply_notice, v_new.extras,$a$),
    ('public.save_survey_defaults(uuid,jsonb)',
     $a$allow_dialogue = excluded.allow_dialogue, extras = excluded.extras,$a$,
     $a$allow_dialogue = excluded.allow_dialogue, reply_notice = excluded.reply_notice, extras = excluded.extras,$a$),
    ('public.save_survey_defaults(uuid,jsonb)',
     $a$allow_dialogue = case when r.allow_dialogue = v_old.allow_dialogue then v_new.allow_dialogue else r.allow_dialogue end$a$,
     $a$allow_dialogue = case when r.allow_dialogue = v_old.allow_dialogue then v_new.allow_dialogue else r.allow_dialogue end,
        reply_notice = case when r.reply_notice = v_old.reply_notice then v_new.reply_notice else r.reply_notice end$a$),
    ('app.round_apply_defaults()',
     $a$allow_dialogue = d.allow_dialogue,$a$,
     $a$allow_dialogue = d.allow_dialogue,
        reply_notice = d.reply_notice,$a$),
    ('app.round_settings_fixed()',
     $a$(new.comment_policy, new.allow_dialogue,$a$,
     $a$(new.comment_policy, new.allow_dialogue, new.reply_notice,$a$),
    ('app.round_settings_fixed()',
     $a$(old.comment_policy, old.allow_dialogue,$a$,
     $a$(old.comment_policy, old.allow_dialogue, old.reply_notice,$a$),
    ('public.reset_round_settings(uuid,text)',
     $a$allow_dialogue = d.allow_dialogue where id = p_round;$a$,
     $a$allow_dialogue = d.allow_dialogue, reply_notice = d.reply_notice where id = p_round;$a$)
  ) as t(fn, old_text, new_text) loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    if position(r.old_text in v_def) = 0 then
      raise exception '0204: % does not hold «%»; read its definition and write this by hand', r.fn, r.old_text;
    end if;
    execute replace(v_def, r.old_text, r.new_text);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2 · the seal
-- The key is made here, once, by the database, and never leaves it: nobody prints it, and a
-- dump without Vault's own key holds only ciphertext.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'orgpuls_reply_notice_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'orgpuls_reply_notice_key',
                                'Seals app.thread_recipients (0204). Never printed, never copied.');
  end if;
end $$;

create function app.reply_notice_key() returns text
  language sql stable security definer set search_path = ''
as $fn$
  select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'orgpuls_reply_notice_key'
$fn$;

create function app.reply_notice_seal(p_employee uuid, p_key text) returns bytea
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare v_secret text := app.reply_notice_key();
begin
  if v_secret is null then
    raise exception 'reply notice key missing' using errcode = 'invalid_parameter_value';
  end if;
  return extensions.pgp_sym_encrypt(jsonb_build_object('e', p_employee, 'k', p_key)::text, v_secret);
end $fn$;

create function app.reply_notice_open(p_sealed bytea) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  return extensions.pgp_sym_decrypt(p_sealed, app.reply_notice_key())::jsonb;
exception when others then
  return null;
end $fn$;

/*
 * Whether a person may be asked (respond_form) and may say yes (submit_response): the round asks
 * and allows dialogue, the organisation is not a demo, and there is a way to reach this person —
 * e-mail, or SMS where the organisation sends it.
 */
create function app.reply_notice_offered(p_invitation uuid) returns boolean
  language sql stable security definer set search_path = ''
as $fn$
  select coalesce((
    select r.reply_notice and r.allow_dialogue and not app.is_demo(o.id) and o.mail_enabled
       and ((nullif(btrim(e.email), '') is not null) or (o.sms_enabled and nullif(btrim(e.phone), '') is not null))
    from app.invitations i
    join app.rounds r on r.id = i.round_id
    join app.organizations o on o.id = i.org_id
    join app.employees e on e.id = i.employee_id
    where i.id = p_invitation), false)
$fn$;

revoke all on function app.reply_notice_key() from public, anon, authenticated;
revoke all on function app.reply_notice_seal(uuid, text) from public, anon, authenticated;
revoke all on function app.reply_notice_open(bytea) from public, anon, authenticated;
revoke all on function app.reply_notice_offered(uuid) from public, anon, authenticated;

create table app.thread_recipients (
  thread_id    uuid primary key references app.comment_threads (id) on delete cascade,
  -- pgp_sym_encrypt of {"e": employee id, "k": the conversation's key}, under app.reply_notice_key()
  sealed       bytea not null,
  created_hour timestamptz not null
);
alter table app.thread_recipients enable row level security;
revoke all on app.thread_recipients from public, anon, authenticated, service_role;
comment on table app.thread_recipients is
  'Who asked to be told when management answers their comment (0204, X-103): one row per conversation, the person sealed. No policy, no grant, no foreign key to a person; written by submit_response, read by reply_notice_claim only.';

-- ---------------------------------------------------------------------------
-- 3 · what is sent
create table app.reply_notices (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references app.comment_threads (id) on delete cascade,
  reason     text not null check (reason in ('svar', 'kontakt')),
  due_at     timestamptz not null,
  claimed_at timestamptz,
  sent_at    timestamptz,
  failed_at  timestamptz,
  attempts   int not null default 0,
  last_error text check (length(last_error) <= 200),
  created_at timestamptz not null default now()
);
create unique index reply_notices_pending on app.reply_notices (thread_id) where sent_at is null and failed_at is null;
create index reply_notices_due on app.reply_notices (due_at) where sent_at is null and failed_at is null;
alter table app.reply_notices enable row level security;
revoke all on app.reply_notices from public, anon, authenticated, service_role;
comment on table app.reply_notices is
  'Notices to a person who asked to be told when management answers (0204): one pending per conversation, sent by the dispatcher through reply_notice_claim. No policy, no grant.';

insert into app.demo_copy_plan (table_name, step, mode, via, note) values
  ('thread_recipients', null, 'skip', null, 'a person''s request to be told; a demo asks nobody (0204)'),
  ('reply_notices', null, 'skip', null, 'notices to a person; a demo sends none (0204)')
on conflict (table_name) do nothing;

/*
 * Queue a notice for a conversation whose author asked for one. A second answer before the first
 * notice went keeps the one notice; a request to talk directly outranks an answer.
 */
create function app.queue_reply_notice(p_thread uuid, p_reason text) returns void
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_tz    text;
  v_due   timestamptz;
  v_local timestamp;
begin
  if not exists (select 1 from app.thread_recipients tr where tr.thread_id = p_thread) then
    return;
  end if;
  select coalesce(o.timezone, 'Europe/Oslo') into v_tz
  from app.comment_threads ct join app.organizations o on o.id = ct.org_id where ct.id = p_thread;

  v_due := now() + make_interval(mins => 20 + floor(random() * 100)::int);
  v_local := v_due at time zone v_tz;
  if extract(hour from v_local) >= 21 or extract(hour from v_local) < 7 then
    v_local := date_trunc('day', v_local)
             + case when extract(hour from v_local) >= 21 then interval '1 day' else interval '0' end
             + interval '7 hours' + make_interval(mins => floor(random() * 60)::int);
    v_due := v_local at time zone v_tz;
  end if;

  insert into app.reply_notices as n (thread_id, reason, due_at) values (p_thread, p_reason, v_due)
  on conflict (thread_id) where sent_at is null and failed_at is null
  do update set reason = case when excluded.reason = 'kontakt' then 'kontakt' else n.reason end;
end $fn$;
revoke all on function app.queue_reply_notice(uuid, text) from public, anon, authenticated;

/* A conversation's link to its author, and anything queued for it, gone. */
create function app.forget_reply_notice(p_thread uuid) returns void
  language sql volatile security definer set search_path = ''
as $fn$
  delete from app.thread_recipients where thread_id = p_thread;
  delete from app.reply_notices where thread_id = p_thread and sent_at is null;
$fn$;
revoke all on function app.forget_reply_notice(uuid) from public, anon, authenticated;

-- the functions that write conversations queue and forget; no trigger on an answer table (rule 6)
do $$
declare
  r     record;
  v_def text;
begin
  for r in select * from (values
    ('public.reply_to_thread(uuid,text)',
     $a$where id = p_thread and state = 'venter';$a$,
     $a$where id = p_thread and state = 'venter';

  -- 0204: the author, if they asked, is told an answer came
  perform app.queue_reply_notice(p_thread, 'svar');$a$),
    ('public.request_contact(uuid)',
     $a$set requested_by = excluded.requested_by, requested_hour = excluded.requested_hour;$a$,
     $a$set requested_by = excluded.requested_by, requested_hour = excluded.requested_hour;

  -- 0204: the author, if they asked, is told a leader would like to talk
  perform app.queue_reply_notice(p_thread, 'kontakt');$a$),
    ('public.set_thread(uuid,text,boolean)',
     $a$flagged_varsel = coalesce(p_flagged, flagged_varsel)
  where id = p_thread;$a$,
     $a$flagged_varsel = coalesce(p_flagged, flagged_varsel)
  where id = p_thread;

  -- 0204: a closed conversation forgets who asked to be told
  if p_state = 'lukket' then
    perform app.forget_reply_notice(p_thread);
  end if;$a$),
    ('public.thread_by_key(text)',
     $a$'state', ct.state,$a$,
     $a$'state', ct.state,
    -- 0204: whether its author is told when management answers (they can turn it off)
    'notify', exists (select 1 from app.thread_recipients tr where tr.thread_id = ct.id),$a$),
    ('public.respond_form(text)',
     $a$'page', v_round.results_page$a$,
     $a$'page', v_round.results_page,
    -- 0204: ask, at the end, whether to be told when management answers a comment
    'reply_notice', app.reply_notice_offered(v_inv.id)$a$)
  ) as t(fn, old_text, new_text) loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    if position(r.old_text in v_def) = 0 then
      raise exception '0204: % does not hold «%»; read its definition and write this by hand', r.fn, r.old_text;
    end if;
    execute replace(v_def, r.old_text, r.new_text);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4 · submit_response takes p_notify
-- 0095's function, with the person's answer to the question at the end. The id of the row it
-- wrote is still never returned.
drop function public.submit_response(text, jsonb, jsonb, jsonb, jsonb);

create function public.submit_response(p_token text, p_answers jsonb, p_extra jsonb, p_module jsonb default '{}'::jsonb,
                                       p_own jsonb default '[]'::jsonb, p_notify boolean default false)
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
  v_thread  uuid;
  v_notify  boolean;
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

  -- 0204: the person asked to be told when management answers, and this round lets them be.
  -- Their conversations' link to them is sealed into app.thread_recipients and nowhere else.
  v_notify := coalesce(p_notify, false) and app.reply_notice_offered(v_inv.id);

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
              extensions.digest(v_key, 'sha256'), v_hour)
      returning id into v_thread;
      v_keys := v_keys || to_jsonb(v_key);

      if v_notify then
        insert into app.thread_recipients (thread_id, sealed, created_hour)
        values (v_thread, app.reply_notice_seal(v_inv.employee_id, v_key), v_hour);
      end if;
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
  -- 0204: whether they will be told, so the thank-you can say so; never which row
  return jsonb_build_object('ok', true, 'answers', v_written, 'threads', v_keys,
                            'notice', v_notify and jsonb_array_length(v_keys) > 0);
end $function$;
revoke all on function public.submit_response(text, jsonb, jsonb, jsonb, jsonb, boolean) from public;
grant execute on function public.submit_response(text, jsonb, jsonb, jsonb, jsonb, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5 · the person turns it off, from their conversation
-- The key is the person's own capability (0018); the answer is the same whatever is sent.
create function public.stop_reply_notice(p_key text) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare v_thread uuid;
begin
  if p_key is not null and length(p_key) >= 32 then
    select ct.id into v_thread from app.comment_threads ct where ct.key_hash = extensions.digest(p_key, 'sha256');
    if v_thread is not null then
      perform app.forget_reply_notice(v_thread);
    end if;
  end if;
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.stop_reply_notice(text) from public;
grant execute on function public.stop_reply_notice(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6 · the dispatcher
/*
 * The notices that are due, each with where it goes. The seal is opened here and nowhere else;
 * what comes back (an address or a number, and the conversation's key for its link) goes to the
 * dispatcher and from it to the person, never into a table or a log. A notice that cannot go —
 * the person asked to stop, left, or has no way to be reached any more — is marked failed and
 * not returned. Links older than a year are forgotten first.
 */
create function public.reply_notice_claim(p_batch int default 20) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_out jsonb := '[]'::jsonb;
  n     record;
  v_s   jsonb;
  v_e   app.employees%rowtype;
  v_o   app.organizations%rowtype;
  v_ch  text;
begin
  delete from app.thread_recipients where created_hour < now() - interval '1 year';

  for n in
    with picked as (
      select x.id from app.reply_notices x
      where x.sent_at is null and x.failed_at is null and x.due_at <= now()
        and (x.claimed_at is null or x.claimed_at < now() - interval '10 minutes')
      order by x.due_at
      limit greatest(1, least(coalesce(p_batch, 20), 100))
      for update skip locked)
    update app.reply_notices x set claimed_at = now(), attempts = x.attempts + 1
    from picked where x.id = picked.id
    returning x.id, x.thread_id, x.reason
  loop
    v_s := (select app.reply_notice_open(tr.sealed) from app.thread_recipients tr where tr.thread_id = n.thread_id);
    v_e := null;
    v_o := null;
    v_ch := null;
    if v_s is not null then
      select * into v_e from app.employees e where e.id = (v_s ->> 'e')::uuid and e.active;
      select o.* into v_o from app.comment_threads ct join app.organizations o on o.id = ct.org_id where ct.id = n.thread_id;
      if v_e.id is not null and v_o.id is not null and v_o.mail_enabled and not app.is_demo(v_o.id) then
        v_ch := case when nullif(btrim(v_e.email), '') is not null then 'email'
                     when v_o.sms_enabled and nullif(btrim(v_e.phone), '') is not null then 'sms' end;
      end if;
    end if;

    if v_ch is null then
      update app.reply_notices set failed_at = now(), last_error = 'unreachable' where id = n.id;
      continue;
    end if;

    v_out := v_out || jsonb_build_object(
      'id', n.id,
      'reason', n.reason,
      'channel', v_ch,
      'email', case when v_ch = 'email' then btrim(v_e.email) end,
      'phone', case when v_ch = 'sms' then btrim(v_e.phone) end,
      'lang', coalesce(v_e.language, 'no'),
      'org', v_o.name,
      'key', v_s ->> 'k');
  end loop;
  return v_out;
end $fn$;

create function public.reply_notice_done(p_id uuid, p_ok boolean, p_error text default null, p_permanent boolean default false)
  returns void
  language sql volatile security definer set search_path = ''
as $fn$
  update app.reply_notices x set
    sent_at    = case when p_ok then now() end,
    failed_at  = case when not p_ok and (p_permanent or x.attempts >= 5) then now() end,
    claimed_at = case when p_ok then x.claimed_at end,
    due_at     = case when p_ok then x.due_at else now() + interval '15 minutes' end,
    last_error = case when p_ok then null else left(p_error, 200) end
  where x.id = p_id and x.sent_at is null;
$fn$;

revoke all on function public.reply_notice_claim(int) from public, anon, authenticated;
revoke all on function public.reply_notice_done(uuid, boolean, text, boolean) from public, anon, authenticated;
grant execute on function public.reply_notice_claim(int) to service_role;
grant execute on function public.reply_notice_done(uuid, boolean, text, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 7 · the data processing agreement says so (vedlegg 1): a new version, as 0186 did for Slack
insert into app.dpa_versions (version, text_sha256, published_on)
values ('2026-10-05', 'bb0c548efca436bbac573f8ed59ca1aaabf748b4b4de09d942f8a8b100186904', date '2026-10-05');
