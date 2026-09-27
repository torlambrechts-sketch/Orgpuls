-- 0076_survey_settings.sql — Målinger › Innstillinger: the organisation's standard for a
-- survey, a QR code as a way in, a second reminder and quiet hours (X-064, D-126).
--
-- Tor, 2026-09-27, after a proposal: settings under Målinger for how people receive a survey
-- and which question sets it asks, as a standard and per survey. QR is built, not withdrawn
-- from the industry pages. Violence and offensive behaviour are on by default, and turning
-- them off takes a reason. A tab of its own.
--
-- 1. app.survey_defaults — one row per organisation, written only by
--    public.save_survey_defaults (daglig leder). No row means the product's own defaults, and
--    then nothing below changes a round: the design's organisations have none.
--      * A new planned round takes the standard when the transaction that created it
--        commits (a deferred trigger), so whatever function created it has finished.
--      * Saving the standard also moves the planned rounds that still followed the old one,
--        field by field. A field somebody changed for that round stays as they set it.
--      * public.reset_round_settings puts one section of a planned round back on the
--        standard.
--      * The question sets outside the index (extra_questions) are a grunnlinje's: a puls
--        stays five statements.
--    Every change is logged in app.survey_defaults_log, so a verneombud sees what changed and
--    when.
-- 2. A round's settings are fixed when it opens. A client may change a planned round only;
--    the database's own functions (the wheel opening it, a puls it opens now) are not held.
--    Deletes the database issues itself — a round or a group going, and its rows with it —
--    pass (CLAUDE.md, "Immutability triggers must permit referential maintenance").
-- 3. Per round: final_reminder (a second reminder the day before closing) and sms_when (the
--    organisation's SMS rule, or another for this round), set in Måleoppsett. The reason
--    for leaving out violence or offensive behaviour goes with the round.
-- 4. QR: app.entry_codes holds one code per organisation, printed on a poster. The public
--    page asks for a mobile number or an e-mail address, and public.request_link sends that
--    person's own link, if they are on an open round's list and have not answered. The
--    answer is the same whatever is typed, so the page cannot tell anyone who works there
--    or who has answered. The code opens nothing by itself: the link is still the person's,
--    minted by the dispatcher like any other, and the older one stops working.
-- 5. The dispatcher: the two new kinds (0075), the round's own SMS rule, and quiet hours — no
--    invitation or reminder between 21:00 and 07:00 in the organisation's time zone. A link
--    somebody asked for goes at once.

-- ---------------------------------------------------------------------------
-- 1 · the standard
-- ---------------------------------------------------------------------------
create table app.survey_defaults (
  org_id                uuid primary key references app.organizations (id) on delete cascade,
  close_days_grunnlinje int  not null default 7 check (close_days_grunnlinje between 1 and 60),
  close_days_puls       int  not null default 7 check (close_days_puls between 1 and 60),
  reminder_day          int  default 2 check (reminder_day between 1 and 14),
  final_reminder        boolean not null default true,
  quiet_hours           boolean not null default true,
  comment_policy        app.comment_policy not null default 'lave',
  allow_dialogue        boolean not null default true,
  extras                text[] not null default array['anbefaling', 'krenkende', 'vold', 'apent_felt'],
  extras_off_reason     text check (extras_off_reason is null or length(btrim(extras_off_reason)) between 10 and 500),
  updated_at            timestamptz not null default now(),
  updated_by            uuid references auth.users (id) on delete set null,
  -- the statutory screening may be left out, but not without saying why
  constraint survey_defaults_screening_reason check (
    (extras @> array['krenkende', 'vold']) or extras_off_reason is not null)
);
create index survey_defaults_updated_by_idx on app.survey_defaults (updated_by);

alter table app.survey_defaults enable row level security;
revoke all on app.survey_defaults from anon, authenticated;
grant select on app.survey_defaults to authenticated;
create policy survey_defaults_read on app.survey_defaults for select to authenticated
  using (app.is_org_member(org_id));
-- no write policy: save_survey_defaults is the only writer

create table app.survey_defaults_log (
  id         bigint generated always as identity primary key,
  org_id     uuid not null references app.organizations (id) on delete cascade,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users (id) on delete set null,
  -- the keys that changed, each with its old and new value; never free text from a respondent
  change     jsonb not null
);
create index survey_defaults_log_org_idx on app.survey_defaults_log (org_id, changed_at desc);
create index survey_defaults_log_by_idx on app.survey_defaults_log (changed_by);

alter table app.survey_defaults_log enable row level security;
revoke all on app.survey_defaults_log from anon, authenticated;
grant select on app.survey_defaults_log to authenticated;
create policy survey_defaults_log_read on app.survey_defaults_log for select to authenticated
  using (app.is_org_member(org_id));

-- ---------------------------------------------------------------------------
-- 3 · per round
-- ---------------------------------------------------------------------------
alter table app.rounds
  add column final_reminder    boolean not null default false,
  add column sms_when          text check (sms_when in ('mangler', 'paaminn', 'alle')),
  add column extras_off_reason text check (extras_off_reason is null or length(btrim(extras_off_reason)) between 10 and 500);

comment on column app.rounds.final_reminder is
  'A second reminder, the day before the round closes, to those who have not answered.';
comment on column app.rounds.sms_when is
  'This round''s SMS rule; null follows the organisation''s (organizations.sms_when).';

grant update (final_reminder, sms_when) on app.rounds to authenticated;

-- ---------------------------------------------------------------------------
-- 2 · fixed once open
-- ---------------------------------------------------------------------------
create function app.round_settings_fixed() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  if current_user not in ('authenticated', 'anon') or old.status = 'planlagt' then
    return new;
  end if;
  if (new.comment_policy, new.allow_dialogue, new.reminder_day, new.close_after_days,
      new.final_reminder, new.sms_when, new.extras_off_reason)
     is distinct from
     (old.comment_policy, old.allow_dialogue, old.reminder_day, old.close_after_days,
      old.final_reminder, old.sms_when, old.extras_off_reason) then
    raise exception 'a round''s settings are fixed once it has opened' using errcode = 'restrict_violation';
  end if;
  return new;
end $fn$;

create trigger round_settings_fixed before update on app.rounds
  for each row execute function app.round_settings_fixed();

-- the round's questions and audience: the same rule for its child rows
create function app.round_child_fixed() returns trigger
  language plpgsql set search_path = ''
as $fn$
declare
  v_round  uuid := case when tg_op = 'DELETE' then old.round_id else new.round_id end;
  v_status app.round_status;
begin
  if current_user not in ('authenticated', 'anon') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select r.status into v_status from app.rounds r where r.id = v_round;
  -- the round is gone, and this row with it
  if not found or v_status = 'planlagt' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- a group deleted from the register takes its audience rows along
  if tg_op = 'DELETE' then
    if tg_table_name = 'round_groups'
       and not exists (select 1 from app.groups g where g.id = (to_jsonb(old) ->> 'group_id')::uuid) then
      return old;
    end if;
    if tg_table_name = 'round_org_questions'
       and not exists (select 1 from app.org_questions q where q.id = (to_jsonb(old) ->> 'question_id')::uuid) then
      return old;
    end if;
  end if;
  raise exception 'a round''s questions and audience are fixed once it has opened' using errcode = 'restrict_violation';
end $fn$;

create trigger round_factors_fixed before insert or update or delete on app.round_factors
  for each row execute function app.round_child_fixed();
create trigger round_groups_fixed before insert or update or delete on app.round_groups
  for each row execute function app.round_child_fixed();
create trigger round_extra_questions_fixed before insert or update or delete on app.round_extra_questions
  for each row execute function app.round_child_fixed();
create trigger round_org_questions_fixed before insert or update or delete on app.round_org_questions
  for each row execute function app.round_child_fixed();

-- ---------------------------------------------------------------------------
-- 1 · applying the standard
-- ---------------------------------------------------------------------------

-- the extras a grunnlinje asks when nothing else is chosen: all four, as plan_first_round
create function app.builtin_extras() returns text[]
  language sql immutable set search_path = ''
as $fn$ select array['anbefaling', 'krenkende', 'vold', 'apent_felt'] $fn$;

-- a round's extras, sorted, for comparing
create function app.round_extras(p_round uuid) returns text[]
  language sql stable security definer set search_path = ''
as $fn$
  select coalesce(array_agg(x.extra_key order by x.extra_key), '{}')
  from app.round_extra_questions x where x.round_id = p_round
$fn$;
revoke all on function app.round_extras(uuid) from public, anon, authenticated;

create function app.sorted(p text[]) returns text[]
  language sql immutable set search_path = ''
as $fn$ select coalesce(array_agg(x order by x), '{}') from unnest(p) x $fn$;

-- replace a round's extras (the definer's path; the trigger above lets it through)
create function app.set_round_extras_unchecked(p_round uuid, p_keys text[]) returns void
  language sql volatile security definer set search_path = ''
as $fn$
  delete from app.round_extra_questions x
  where x.round_id = p_round and not (x.extra_key = any (p_keys));
  insert into app.round_extra_questions (org_id, round_id, extra_key)
  select r.org_id, r.id, q.key
  from app.rounds r, app.extra_questions q
  where r.id = p_round and q.key = any (p_keys)
  on conflict do nothing;
$fn$;
revoke all on function app.set_round_extras_unchecked(uuid, text[]) from public, anon, authenticated;

create function app.round_apply_defaults() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_round record;
  d       app.survey_defaults;
begin
  select r.*, ms.kind as ms_kind into v_round
  from app.rounds r join app.measurements ms on ms.id = r.measurement_id
  where r.id = new.id;
  if not found or v_round.status <> 'planlagt' then
    return null;
  end if;

  select * into d from app.survey_defaults where org_id = v_round.org_id;
  if not found then
    -- no standard: a grunnlinje the year wheel planned asked none of the screening, which
    -- the statutory report counts on. It gets plan_first_round's set, and nothing else moves.
    if v_round.ms_kind = 'grunnlinje' and app.round_extras(new.id) = '{}' then
      perform app.set_round_extras_unchecked(new.id, app.builtin_extras());
    end if;
    return null;
  end if;

  update app.rounds r
  set close_after_days = case when v_round.ms_kind = 'grunnlinje' then d.close_days_grunnlinje else d.close_days_puls end,
      closes_at = case when r.opens_at is null then r.closes_at
                       else r.opens_at + make_interval(days => case when v_round.ms_kind = 'grunnlinje'
                                                                    then d.close_days_grunnlinje else d.close_days_puls end) end,
      reminder_day = d.reminder_day,
      final_reminder = d.final_reminder,
      comment_policy = d.comment_policy,
      allow_dialogue = d.allow_dialogue,
      extras_off_reason = case when v_round.ms_kind = 'grunnlinje' then d.extras_off_reason end
  where r.id = new.id;

  if v_round.ms_kind = 'grunnlinje' then
    perform app.set_round_extras_unchecked(new.id, d.extras);
  end if;
  return null;
end $fn$;
revoke all on function app.round_apply_defaults() from public, anon, authenticated;

create constraint trigger round_apply_defaults after insert on app.rounds
  deferrable initially deferred
  for each row execute function app.round_apply_defaults();

-- the standard as it stands, or the product's own
create function app.survey_defaults_of(p_org uuid) returns app.survey_defaults
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  d app.survey_defaults;
begin
  select * into d from app.survey_defaults where org_id = p_org;
  if not found then
    d := jsonb_populate_record(null::app.survey_defaults, jsonb_build_object(
      'org_id', p_org, 'close_days_grunnlinje', 7, 'close_days_puls', 7, 'reminder_day', 2,
      'final_reminder', true, 'quiet_hours', true, 'comment_policy', 'lave',
      'allow_dialogue', true, 'extras', to_jsonb(app.builtin_extras())));
  end if;
  return d;
end $fn$;
revoke all on function app.survey_defaults_of(uuid) from public, anon, authenticated;

create function public.save_survey_defaults(p_org uuid, p jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_old    app.survey_defaults;
  v_had    boolean;
  v_new    app.survey_defaults;
  v_change jsonb := '{}'::jsonb;
  v_key    text;
  v_round  record;
  v_n      int := 0;
begin
  if p_org is null or not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('error', 'not_allowed');
  end if;

  select * into v_old from app.survey_defaults where org_id = p_org;
  v_had := found;
  if not v_had then v_old := app.survey_defaults_of(p_org); end if;

  begin
    v_new := v_old;
    v_new.close_days_grunnlinje := (p ->> 'close_days_grunnlinje')::int;
    v_new.close_days_puls       := (p ->> 'close_days_puls')::int;
    v_new.reminder_day          := (p ->> 'reminder_day')::int;
    v_new.final_reminder        := (p ->> 'final_reminder')::boolean;
    v_new.quiet_hours           := (p ->> 'quiet_hours')::boolean;
    v_new.comment_policy        := (p ->> 'comment_policy')::app.comment_policy;
    v_new.allow_dialogue        := (p ->> 'allow_dialogue')::boolean;
    v_new.extras := app.sorted(array(select distinct x from jsonb_array_elements_text(p -> 'extras') x
                                     where x in (select q.key from app.extra_questions q)));
    v_new.extras_off_reason := case when v_new.extras @> array['krenkende', 'vold'] then null
                                    else nullif(btrim(p ->> 'extras_off_reason'), '') end;
  exception when others then
    return jsonb_build_object('error', 'invalid');
  end;

  if v_new.close_days_grunnlinje is null or v_new.close_days_puls is null
     or v_new.final_reminder is null or v_new.quiet_hours is null
     or v_new.comment_policy is null or v_new.allow_dialogue is null
     or v_new.close_days_grunnlinje not between 1 and 60 or v_new.close_days_puls not between 1 and 60
     or v_new.reminder_day not between 1 and 14
     or length(coalesce(v_new.extras_off_reason, '')) > 500 then
    return jsonb_build_object('error', 'invalid');
  end if;
  if not (v_new.extras @> array['krenkende', 'vold'])
     and (v_new.extras_off_reason is null or length(v_new.extras_off_reason) < 10) then
    return jsonb_build_object('error', 'reason_required');
  end if;

  for v_key in select k from jsonb_object_keys(to_jsonb(v_new)) k
               where k not in ('org_id', 'updated_at', 'updated_by') loop
    if to_jsonb(v_new) -> v_key is distinct from to_jsonb(v_old) -> v_key then
      v_change := v_change || jsonb_build_object(v_key,
        jsonb_build_object('from', case when v_had then to_jsonb(v_old) -> v_key end, 'to', to_jsonb(v_new) -> v_key));
    end if;
  end loop;

  insert into app.survey_defaults as s (org_id, close_days_grunnlinje, close_days_puls, reminder_day,
    final_reminder, quiet_hours, comment_policy, allow_dialogue, extras, extras_off_reason, updated_at, updated_by)
  values (p_org, v_new.close_days_grunnlinje, v_new.close_days_puls, v_new.reminder_day,
    v_new.final_reminder, v_new.quiet_hours, v_new.comment_policy, v_new.allow_dialogue, v_new.extras,
    v_new.extras_off_reason, now(), auth.uid())
  on conflict (org_id) do update set
    close_days_grunnlinje = excluded.close_days_grunnlinje, close_days_puls = excluded.close_days_puls,
    reminder_day = excluded.reminder_day, final_reminder = excluded.final_reminder,
    quiet_hours = excluded.quiet_hours, comment_policy = excluded.comment_policy,
    allow_dialogue = excluded.allow_dialogue, extras = excluded.extras,
    extras_off_reason = excluded.extras_off_reason, updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;

  if v_change <> '{}'::jsonb then
    insert into app.survey_defaults_log (org_id, changed_by, change) values (p_org, auth.uid(), v_change);
  end if;

  -- the planned rounds that followed the old standard follow the new one, field by field.
  -- Before there was a standard, nobody chose to follow it, so nothing moves on the first save.
  if v_had then
    for v_round in
      select r.*, ms.kind as ms_kind from app.rounds r join app.measurements ms on ms.id = r.measurement_id
      where r.org_id = p_org and r.status = 'planlagt'
    loop
      update app.rounds r set
        close_after_days = case
          when v_round.ms_kind = 'grunnlinje' and r.close_after_days = v_old.close_days_grunnlinje then v_new.close_days_grunnlinje
          when v_round.ms_kind <> 'grunnlinje' and r.close_after_days = v_old.close_days_puls then v_new.close_days_puls
          else r.close_after_days end,
        reminder_day = case when r.reminder_day is not distinct from v_old.reminder_day then v_new.reminder_day else r.reminder_day end,
        final_reminder = case when r.final_reminder = v_old.final_reminder then v_new.final_reminder else r.final_reminder end,
        comment_policy = case when r.comment_policy = v_old.comment_policy then v_new.comment_policy else r.comment_policy end,
        allow_dialogue = case when r.allow_dialogue = v_old.allow_dialogue then v_new.allow_dialogue else r.allow_dialogue end
      where r.id = v_round.id;
      update app.rounds r set closes_at = r.opens_at + make_interval(days => r.close_after_days)
      where r.id = v_round.id and r.opens_at is not null;
      if v_round.ms_kind = 'grunnlinje' and app.round_extras(v_round.id) = app.sorted(v_old.extras) then
        perform app.set_round_extras_unchecked(v_round.id, v_new.extras);
        update app.rounds set extras_off_reason = v_new.extras_off_reason where id = v_round.id;
      end if;
      v_n := v_n + 1;
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'planned_rounds', v_n);
end $fn$;
revoke all on function public.save_survey_defaults(uuid, jsonb) from public, anon;
grant execute on function public.save_survey_defaults(uuid, jsonb) to authenticated;

-- one section of a planned round back on the standard
create function public.reset_round_settings(p_round uuid, p_section text) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_round record;
  d       app.survey_defaults;
begin
  select r.*, ms.kind as ms_kind into v_round
  from app.rounds r join app.measurements ms on ms.id = r.measurement_id where r.id = p_round;
  if not found or not app.has_role(v_round.org_id, array['daglig_leder', 'verneombud']::app.org_role[]) then
    return jsonb_build_object('error', 'not_allowed');
  end if;
  if v_round.status <> 'planlagt' then
    return jsonb_build_object('error', 'locked');
  end if;
  select * into d from app.survey_defaults where org_id = v_round.org_id;
  if not found then
    return jsonb_build_object('error', 'no_standard');
  end if;

  if p_section = 'rytme' then
    update app.rounds set
      reminder_day = d.reminder_day, final_reminder = d.final_reminder,
      close_after_days = case when v_round.ms_kind = 'grunnlinje' then d.close_days_grunnlinje else d.close_days_puls end
    where id = p_round;
    update app.rounds r set closes_at = r.opens_at + make_interval(days => r.close_after_days)
    where r.id = p_round and r.opens_at is not null;
  elsif p_section = 'kommentarer' then
    update app.rounds set comment_policy = d.comment_policy, allow_dialogue = d.allow_dialogue where id = p_round;
  elsif p_section = 'tillegg' and v_round.ms_kind = 'grunnlinje' then
    perform app.set_round_extras_unchecked(p_round, d.extras);
    update app.rounds set extras_off_reason = d.extras_off_reason where id = p_round;
  elsif p_section = 'utsending' then
    update app.rounds set sms_when = null where id = p_round;
  else
    return jsonb_build_object('error', 'invalid');
  end if;
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.reset_round_settings(uuid, text) from public, anon;
grant execute on function public.reset_round_settings(uuid, text) to authenticated;

-- a planned round's extras, with the reason when the screening is left out
create function public.set_round_extras(p_round uuid, p_keys text[], p_reason text) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_round  record;
  v_keys   text[];
  v_reason text := nullif(btrim(p_reason), '');
begin
  select r.*, ms.kind as ms_kind into v_round
  from app.rounds r join app.measurements ms on ms.id = r.measurement_id where r.id = p_round;
  if not found or not app.has_role(v_round.org_id, array['daglig_leder', 'verneombud']::app.org_role[]) then
    return jsonb_build_object('error', 'not_allowed');
  end if;
  if v_round.status <> 'planlagt' then
    return jsonb_build_object('error', 'locked');
  end if;
  v_keys := app.sorted(array(select distinct x from unnest(coalesce(p_keys, '{}')) x
                             where x in (select q.key from app.extra_questions q)));
  if v_keys @> array['krenkende', 'vold'] then
    v_reason := null;
  elsif v_reason is null or length(v_reason) < 10 or length(v_reason) > 500 then
    return jsonb_build_object('error', 'reason_required');
  end if;
  perform app.set_round_extras_unchecked(p_round, v_keys);
  update app.rounds set extras_off_reason = v_reason where id = p_round;
  return jsonb_build_object('ok', true, 'extras', to_jsonb(v_keys));
end $fn$;
revoke all on function public.set_round_extras(uuid, text[], text) from public, anon;
grant execute on function public.set_round_extras(uuid, text[], text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4 · QR: a door, not a key
-- ---------------------------------------------------------------------------
create table app.entry_codes (
  org_id     uuid primary key references app.organizations (id) on delete cascade,
  -- eight characters without look-alikes (no i, l, o, 0, 1): read off a poster, typed by hand
  code       text not null unique check (code ~ '^[a-hjkmnp-z2-9]{8}$'),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);
create index entry_codes_created_by_idx on app.entry_codes (created_by);

alter table app.entry_codes enable row level security;
revoke all on app.entry_codes from anon, authenticated;
grant select on app.entry_codes to authenticated;
create policy entry_codes_read on app.entry_codes for select to authenticated
  using (app.is_org_member(org_id));
-- no write policy: public.entry_code is the only writer

create function app.new_entry_code() returns text
  language sql volatile set search_path = ''
as $fn$
  select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + get_byte(x.b, i) % 31, 1), '' order by i)
  from (select extensions.gen_random_bytes(8) as b) x, generate_series(0, 7) i
$fn$;
revoke all on function app.new_entry_code() from public, anon, authenticated;

-- the organisation's code, made on first use; p_new replaces it, and the old poster stops working
create function public.entry_code(p_org uuid, p_new boolean default false) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_code text;
begin
  if p_org is null or not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('error', 'not_allowed');
  end if;
  select code into v_code from app.entry_codes where org_id = p_org;
  if v_code is null or coalesce(p_new, false) then
    loop
      begin
        v_code := app.new_entry_code();
        insert into app.entry_codes (org_id, code, created_at, created_by)
        values (p_org, v_code, now(), auth.uid())
        on conflict (org_id) do update
          set code = excluded.code, created_at = excluded.created_at, created_by = excluded.created_by;
        exit;
      exception when unique_violation then
        -- another organisation holds this code; draw again
      end;
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'code', v_code);
end $fn$;
revoke all on function public.entry_code(uuid, boolean) from public, anon;
grant execute on function public.entry_code(uuid, boolean) to authenticated;

-- what the public page may say: the name on the poster, whether a survey is open, the channels
create function public.entry_info(p_code text) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select coalesce((
    select jsonb_build_object(
      'org', o.name,
      'lang', coalesce(o.default_lang, 'no'),
      'open', exists (select 1 from app.rounds r
                      where r.org_id = o.id and r.status = 'apen'
                        and (r.closes_at is null or r.closes_at > now())),
      'email', o.mail_enabled,
      'sms', o.mail_enabled and o.sms_enabled)
    from app.entry_codes c join app.organizations o on o.id = c.org_id
    where c.code = lower(btrim(p_code))
  ), jsonb_build_object('error', 'unknown'))
$fn$;
revoke all on function public.entry_info(text) from public;
grant execute on function public.entry_info(text) to anon, authenticated;

/*
 * A person asks for their link. p_contact is an e-mail address or an E.164 number (the page
 * normalises what was typed). For every open round of the organisation where that address
 * or number is on an unanswered, unexpired invitation, a 'lenke' message is queued on the
 * channel they typed. The answer is {"ok": true} whatever happened — a match, no match,
 * already answered, too soon again — so the page reveals nothing about anyone.
 *
 * Limits: one message per person per round per ten minutes (the outbox row is re-armed, not
 * duplicated), and per organisation no more link messages in an hour than twice its active
 * employees, at least 20. SMS is billed; these keep a stranger with a list of numbers from
 * running up the bill.
 */
create function public.request_link(p_code text, p_contact text) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_org     uuid;
  v_mail    boolean;
  v_sms     boolean;
  v_contact text := lower(btrim(coalesce(p_contact, '')));
  v_phone   boolean;
  v_cap     int;
  v_recent  int;
begin
  select c.org_id, o.mail_enabled, o.mail_enabled and o.sms_enabled into v_org, v_mail, v_sms
  from app.entry_codes c join app.organizations o on o.id = c.org_id
  where c.code = lower(btrim(coalesce(p_code, '')));
  if v_org is null then
    return jsonb_build_object('error', 'unknown');
  end if;

  v_phone := v_contact ~ '^\+[1-9][0-9]{7,14}$';
  if not v_phone and not (v_contact ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(v_contact) <= 254) then
    return jsonb_build_object('error', 'invalid');
  end if;
  if (v_phone and not v_sms) or (not v_phone and not v_mail) then
    return jsonb_build_object('ok', true);
  end if;

  select greatest(20, 2 * count(*)) into v_cap from app.employees e where e.org_id = v_org and e.active;
  select count(*) into v_recent from app.outbox o
  where o.org_id = v_org and o.kind = 'lenke' and o.due_at > now() - interval '1 hour';
  if v_recent >= v_cap then
    return jsonb_build_object('ok', true);
  end if;

  insert into app.outbox as ob (org_id, round_id, kind, employee_id, invitation_id, due_at, channel)
  select r.org_id, r.id, 'lenke', i.employee_id, i.id, now(), case when v_phone then 'sms' else 'email' end
  from app.rounds r
  join app.invitations i on i.round_id = r.id
  join app.employees e on e.id = i.employee_id
  where r.org_id = v_org and r.status = 'apen'
    and (r.closes_at is null or r.closes_at > now())
    and i.responded_at is null and i.expires_at > now()
    and e.active
    and case when v_phone then e.phone = v_contact else lower(btrim(e.email)) = v_contact end
  on conflict (round_id, kind, employee_id) where employee_id is not null do update
    set due_at = now(), sent_at = null, failed_at = null, claimed_at = null, attempts = 0,
        last_error = null, provider_id = null, channel = excluded.channel, invitation_id = excluded.invitation_id
    where (ob.sent_at is not null and ob.sent_at < now() - interval '10 minutes')
       or (ob.failed_at is not null and ob.failed_at < now() - interval '10 minutes');

  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.request_link(text, text) from public;
grant execute on function public.request_link(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3 · the second reminder, queued hourly
-- ---------------------------------------------------------------------------
create function app.queue_final_reminders() returns int
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_n int;
begin
  insert into app.outbox (org_id, round_id, kind, employee_id, invitation_id, due_at)
  select r.org_id, r.id, 'siste_paminnelse', i.employee_id, i.id, r.closes_at - interval '1 day'
  from app.rounds r
  join app.invitations i on i.round_id = r.id
  where r.status = 'apen' and r.final_reminder
    and r.opens_at is not null and r.closes_at is not null
    and r.closes_at - interval '1 day' <= now()
    and r.closes_at > now() + interval '2 hours'
    -- only when it is a second reminder, not the first one again on the same day
    and r.opens_at < r.closes_at - interval '1 day'
    and (r.reminder_day is null or r.opens_at + make_interval(days => r.reminder_day) < r.closes_at - interval '1 day')
    and i.responded_at is null and i.expires_at > now()
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $fn$;
revoke all on function app.queue_final_reminders() from public, anon, authenticated;

select cron.schedule('orgpuls-final-reminders', '25 * * * *', $job$select app.queue_final_reminders()$job$);

-- ---------------------------------------------------------------------------
-- 5 · the claim: new kinds, the round's SMS rule, quiet hours. Same signature as 0033's.
-- ---------------------------------------------------------------------------
create or replace function public.dispatch_claim(p_batch int default 20)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_out     jsonb := '[]'::jsonb;
  x         record;
  r         record;
  v_why     text;
  v_rcpt    jsonb;
  v_key     text;
  v_pulse   int;
  v_channel text;
  v_email   text;
  v_phone   text;
  v_sms     boolean;
  v_rule    text;
  v_personal boolean;
begin
  for x in
    select o.*
    from app.outbox o
    join app.organizations org on org.id = o.org_id
    left join app.survey_defaults sd on sd.org_id = o.org_id
    where o.sent_at is null
      and o.failed_at is null
      and o.due_at <= now()
      and (o.claimed_at is null or o.claimed_at < now() - interval '10 minutes')
      and org.mail_enabled
      -- quiet hours: no invitation or reminder between 21 and 07 where the organisation is.
      -- A link somebody asked for is not held.
      and (o.kind not in ('invitasjon', 'paminnelse', 'siste_paminnelse')
           or not coalesce(sd.quiet_hours, true)
           or extract(hour from now() at time zone org.timezone) between 7 and 20)
    order by o.due_at, o.id
    limit least(greatest(coalesce(p_batch, 20), 1), 100)
    for update of o skip locked
  loop
    select ro.status, ro.opens_at, ro.closes_at, ro.sms_when as round_sms_when, ms.kind, ms.year,
           org.name as org_name, org.default_lang, app.k_threshold(ro.org_id) as k,
           org.sms_enabled, org.sms_when, org.sms_text
    into r
    from app.rounds ro
    join app.measurements ms on ms.id = ro.measurement_id
    join app.organizations org on org.id = ro.org_id
    where ro.id = x.round_id;

    v_personal := x.kind in ('invitasjon', 'paminnelse', 'siste_paminnelse', 'lenke');

    v_why := case
      when v_personal and r.status <> 'apen' then 'round_not_open'
      when v_personal and exists (
        select 1 from app.invitations i
        where i.id = x.invitation_id and (i.responded_at is not null or i.expires_at <= now())
      ) then 'answered_or_expired'
      when x.kind = 'forvarsel' and r.status <> 'planlagt' then 'round_already_open'
      when x.kind = 'resultat' and (r.status <> 'lukket' or x.due_at < now() - interval '14 days') then 'stale'
    end;

    v_channel := 'email';
    if v_why is null and v_personal then
      -- one person: choose the channel that carries their link
      select case when d.email is null or app.reserved_address(d.email) then null else d.email end, d.phone
      into v_email, v_phone
      from app.dispatch_recipients(x.id) d
      limit 1;
      v_sms := r.sms_enabled and v_phone is not null;
      v_rule := coalesce(r.round_sms_when, r.sms_when);
      if x.kind = 'lenke' then
        -- the channel they typed their address or number into
        v_channel := case
          when x.channel = 'sms' and v_sms then 'sms'
          when x.channel = 'email' and v_email is not null then 'email'
        end;
      else
        v_channel := case
          when v_sms and (v_rule = 'alle'
                          or (v_rule = 'paaminn' and x.kind in ('paminnelse', 'siste_paminnelse'))
                          or (v_rule = 'mangler' and v_email is null)) then 'sms'
          when v_email is not null then 'email'
          when v_sms then 'sms'
        end;
      end if;
      if v_channel is null then
        v_why := 'no_address';
      else
        select coalesce(jsonb_agg(jsonb_build_object(
                 'email', v_email,
                 'phone', case when v_sms then v_phone end,
                 'name', d.name, 'lang', d.lang, 'member', d.member)), '[]'::jsonb)
        into v_rcpt
        from app.dispatch_recipients(x.id) d;
      end if;
    elsif v_why is null then
      -- a role notice: e-mail only, never to a reserved address
      select coalesce(jsonb_agg(jsonb_build_object(
               'email', d.email, 'phone', null, 'name', d.name, 'lang', d.lang, 'member', d.member)), '[]'::jsonb)
      into v_rcpt
      from app.dispatch_recipients(x.id) d
      where d.email is not null and not app.reserved_address(d.email);
      if jsonb_array_length(v_rcpt) = 0 then v_why := 'no_address'; end if;
    end if;

    if v_why is not null then
      update app.outbox set failed_at = now(), last_error = v_why, claimed_at = null where id = x.id;
      continue;
    end if;

    v_key := null;
    if x.invitation_id is not null then
      v_key := encode(extensions.gen_random_bytes(32), 'hex');
      update app.invitations set token_hash = extensions.digest(v_key, 'sha256') where id = x.invitation_id;
    end if;

    v_pulse := null;
    if r.kind = 'puls' and r.opens_at is not null then
      select count(*) into v_pulse
      from app.rounds r2 join app.measurements m2 on m2.id = r2.measurement_id
      where r2.org_id = x.org_id and m2.kind = 'puls' and m2.year = r.year
        and r2.opens_at is not null
        and (r2.opens_at < r.opens_at or (r2.opens_at = r.opens_at and r2.id <= x.round_id));
    end if;

    update app.outbox set claimed_at = now(), attempts = attempts + 1 where id = x.id;

    v_out := v_out || jsonb_build_object(
      'id', x.id,
      'kind', x.kind,
      'audience', x.audience,
      'channel', v_channel,
      'sms_text', r.sms_text,
      'lang', coalesce(r.default_lang, 'no'),
      'org', r.org_name,
      'k', r.k,
      'round', jsonb_build_object(
        'kind', r.kind, 'year', r.year, 'pulse', nullif(v_pulse, 0),
        'opens_at', r.opens_at, 'closes_at', r.closes_at),
      'recipients', v_rcpt,
      'token', v_key);
  end loop;

  return v_out;
end $fn$;

revoke all on function public.dispatch_claim(int) from public, anon, authenticated;
grant execute on function public.dispatch_claim(int) to service_role;
