-- 0150 — The anonymity floor is three; five stays the default and the strong recommendation (D-198).
--
-- The owner's decision, 2 October 2026: «Gulvet for anonymitet kan senkes til 3 … 5 er sterkt
-- anbefalt, men kan senkes til 3. Ved små team.» Until now app.k_min() (0001) was both the floor
-- and the default: a function returning 5, and organizations.threshold was `between 5 and 10`.
--
-- 1. app.k_floor() returns 3: the absolute floor. No result, comment, segment, participation
--    figure or export is ever shown for fewer than three answers, in any organisation. It is a
--    function, not a column, for the reason k_min() is: no row can lower it.
--    app.k_min() stays 5. It is the default every new organisation starts at (create_organisation,
--    0024; the column's default), and the floor of the platform's own analytics (0141, 0144: the
--    growth events and bands), which do not follow an organisation's choice.
-- 2. organizations.threshold may be 3 to 10 (was 5 to 10); the default stays 5. Only the daglig
--    leder writes it (RLS, 0001). Every change is logged in app.survey_defaults_log (0076), the log
--    of the organisation's survey settings, as {"threshold": {"from", "to"}} with who and when;
--    Målinger › Innstillinger reads it (lib/settings/survey.ts getDefaultsLog).
-- 3. No retroactive exposure. A round keeps the threshold it opened with: respondents answered
--    under the threshold they were shown (respond_form returns it). app.rounds.k holds it:
--      * on insert, the organisation's effective threshold;
--      * while the round is planned and holds no answer, it follows the organisation's setting —
--        every update of the round re-reads it, and a change of the setting touches the planned
--        rounds (so a planned round always shows the threshold it will open with);
--      * from the update that opens it (planlagt → apen) it is frozen: any later change of k is
--        refused. The rule compares k only, so the database's own referential maintenance on
--        rounds (intro_by ON DELETE SET NULL) and the cascades that delete a round pass
--        (CLAUDE.md, «Immutability triggers must permit referential maintenance»).
--    Existing rounds get their organisation's current effective threshold, which is 5 or more for
--    every organisation today (the old CHECK), so nothing anyone has seen changes.
-- 4. app.k_round(round) = greatest(the round's k, k_floor()). Every customer-facing reader that
--    took app.k_threshold(org) — the organisation's CURRENT setting — now takes the round's k. A
--    reader spanning rounds (conversations with no round, org_unlocked, admin_org_detail) applies
--    each round's own k per row. Readers that call these per round (results_digest, the
--    trends, the report, the employee results page, lagging_groups, participation_shown) follow.
--    app.k_threshold(org) is floored at k_floor(); it remains the source a round takes its k from,
--    and the figure for what belongs to no round (a measure's notice in dispatch_claim, the
--    'threshold' conversations reports when asked for every round).
-- 5. Raising stays possible at any time and applies to planned rounds; nothing lowers a round
--    that has opened.

-- ---------------------------------------------------------------- 1 · the floor
create function app.k_floor() returns int
  language sql immutable parallel safe
  set search_path = ''
as $$ select 3 $$;

comment on function app.k_floor() is
  'Absolute minimum group size for any published result, in any organisation. Not configurable by data.';
comment on function app.k_min() is
  'The default and recommended group size (5): every new organisation starts here, and the platform''s own analytics never go below it. The floor is app.k_floor().';

-- ---------------------------------------------------------------- 2 · the setting
alter table app.organizations drop constraint organizations_threshold_check;
alter table app.organizations add constraint organizations_threshold_check check (threshold between 3 and 10);

create or replace function app.k_threshold(p_org uuid) returns int
  language sql stable security definer
  set search_path = ''
as $$
  select greatest(
    coalesce((select o.threshold from app.organizations o where o.id = p_org), app.k_min()),
    app.k_floor()
  )
$$;

comment on function app.k_threshold(uuid) is
  'The organisation''s current threshold, floored at app.k_floor(); 5 (app.k_min()) when unknown. What a round takes at insert and follows until it opens. A result reader uses app.k_round(round).';

-- ---------------------------------------------------------------- 3 · the round's own k
alter table app.rounds add column k int;
update app.rounds r set k = app.k_threshold(r.org_id) where r.k is null;
alter table app.rounds alter column k set not null;
alter table app.rounds add constraint rounds_k_range check (k between 3 and 10);

comment on column app.rounds.k is
  'The anonymity threshold this round''s results are released at: the organisation''s while the round is planned, frozen when it opens (0150).';

create function app.round_k_fixed() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if tg_op = 'INSERT' then
    new.k := app.k_threshold(new.org_id);
    return new;
  end if;
  -- planned and unanswered: it follows the organisation, whatever an update names. The update
  -- that opens it is the last to read the setting.
  if old.status = 'planlagt' and not exists (select 1 from app.responses x where x.round_id = old.id) then
    new.k := app.k_threshold(new.org_id);
    return new;
  end if;
  if new.k is distinct from old.k then
    raise exception 'a round''s anonymity threshold is fixed once it has opened' using errcode = 'restrict_violation';
  end if;
  return new;
end $fn$;
revoke all on function app.round_k_fixed() from public, anon, authenticated;

create trigger round_k before insert or update on app.rounds
  for each row execute function app.round_k_fixed();

create function app.k_round(p_round uuid) returns int
  language sql stable security definer
  set search_path = ''
as $$
  select greatest(
    coalesce((select r.k from app.rounds r where r.id = p_round), app.k_min()),
    app.k_floor()
  )
$$;
revoke all on function app.k_round(uuid) from public, anon, authenticated;

comment on function app.k_round(uuid) is
  'Effective k for a round''s results: the k it opened with, never below app.k_floor(); 5 for an unknown round.';

-- a change of the setting: logged, and carried to the rounds that have not opened
create function app.organization_threshold_changed() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  insert into app.survey_defaults_log (org_id, changed_by, change)
  values (new.id, auth.uid(), jsonb_build_object('threshold', jsonb_build_object('from', old.threshold, 'to', new.threshold)));
  -- round_k_fixed sets the value; naming it here is for the reader
  update app.rounds r set k = app.k_threshold(new.id)
  where r.org_id = new.id and r.status = 'planlagt' and r.k is distinct from app.k_threshold(new.id);
  return null;
end $fn$;
revoke all on function app.organization_threshold_changed() from public, anon, authenticated;

create trigger organizations_threshold_changed after update of threshold on app.organizations
  for each row when (old.threshold is distinct from new.threshold)
  execute function app.organization_threshold_changed();

-- ---------------------------------------------------------------- 4 · the readers take the round's k
-- Each reader's latest definition (named per row) is changed in the named place only; a
-- definition that does not hold the expected text stops the migration rather than guess.
do $$
declare
  r     record;
  v_def text;
begin
  for r in select * from (values
    -- the release functions every result reader goes through (0042, 0045, 0073, 0089)
    ('app.cell_release(uuid)',              'v_k := app.k_threshold(v_org);', 'v_k := app.k_round(p_round);'),
    ('app.group_release(uuid)',             'v_k := app.k_threshold(v_org);', 'v_k := app.k_round(p_round);'),
    ('app.module_cell_release(uuid)',       'v_k := app.k_threshold(v_org);', 'v_k := app.k_round(p_round);'),
    ('app.participation_visibility(uuid)',  'v_k := app.k_threshold(v_org);', 'v_k := app.k_round(p_round);'),
    -- the readers
    ('public.comment_themes(uuid)',         'v_k := app.k_threshold(v_org);', 'v_k := app.k_round(p_round);'),
    ('public.module_results(uuid)',         'v_k := app.k_threshold(v_org);', 'v_k := app.k_round(p_round);'),
    ('public.open_answers(uuid)',           'v_k := app.k_threshold(v_org);', 'v_k := app.k_round(p_round);'),
    ('public.participation(uuid)',          'v_k := app.k_threshold(v_org);', 'v_k := app.k_round(p_round);'),
    ('public.results_by_group(uuid)',       'v_k := app.k_threshold(v_org);', 'v_k := app.k_round(p_round);'),
    ('public.results_effect(uuid)',         'v_k := app.k_threshold(v_org);', 'v_k := app.k_round(p_round);'),
    ('public.results_items(uuid)',          'v_k := app.k_threshold(v_org);', 'v_k := app.k_round(p_round);'),
    ('public.results_not_relevant(uuid)',   'v_k := app.k_threshold(v_org);', 'v_k := app.k_round(p_round);'),
    ('public.results_own_questions(uuid)',  'v_k := app.k_threshold(v_org);', 'v_k := app.k_round(p_round);'),
    ('public.results_recommendation(uuid)', 'v_k := app.k_threshold(v_org);', 'v_k := app.k_round(p_round);'),
    ('public.results_summary(uuid)',        'v_k := app.k_threshold(v_org);', 'v_k := app.k_round(p_round);'),
    ('public.screening_counts(uuid)',       'v_k := app.k_threshold(v_org);', 'v_k := app.k_round(p_round);'),
    ('public.get_count_item_totals(uuid)',  'v_k := app.k_threshold(v_org);', 'v_k := app.k_round(p_round_id);'),
    ('public.reminder_status(uuid)',        'app.k_threshold(v_org)',         'app.k_round(p_round)'),
    ('public.round_page(text)',             'v_k := app.k_threshold(r.org_id);', 'v_k := app.k_round(r.id);'),
    ('public.round_ready(uuid)',            'v_k := app.k_threshold(r.org_id);', 'v_k := app.k_round(r.id);'),
    ('app.round_preview_json(uuid)',        '''k'', app.k_threshold(r.org_id),', '''k'', app.k_round(r.id),'),
    -- a thread is answerable when its own round's group cleared that round's k
    ('app.thread_visible(uuid)',            ') >= app.k_threshold(ct.org_id)', ') >= app.k_round(r.round_id)'),
    -- what the respondent is told is what their round will apply
    ('public.respond_form(text)',           'app.k_threshold(v_inv.org_id)', 'app.k_round(v_inv.round_id)'),
    -- the invitation and its reminders state the round's k; a measure's notice has no round
    ('public.dispatch_claim(integer)',      'app.k_threshold(org.id) as k,',
                                            'case when x.round_id is null then app.k_threshold(org.id) else app.k_round(x.round_id) end as k,'),
    -- conversations spans rounds when asked for none: each thread by its own round's k
    ('public.conversations(uuid)',          'v_k := app.k_threshold(v_org);',
                                            'v_k := case when p_round is null then app.k_threshold(v_org) else app.k_round(p_round) end;'),
    ('public.conversations(uuid)',          ') >= v_k',                       ') >= app.k_round(r.round_id)'),
    -- an organisation has results once a closed round has a group at that round's k (0060)
    ('app.org_unlocked(uuid)',              'group by r.id, e.group_id, o.threshold having count(*) >= o.threshold',
                                            'group by r.id, e.group_id having count(*) >= app.k_round(r.id)'),
    -- the platform's view of a customer's rounds: a group under the round's own k
    ('public.admin_org_detail(uuid)',       'g.answered < o.threshold',       'g.answered < app.k_round(r.id)')
  ) as t(fn, old_text, new_text) loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    if position(r.old_text in v_def) = 0 then
      raise exception '0150: % does not hold «%»; read its definition and write this by hand', r.fn, r.old_text;
    end if;
    execute replace(v_def, r.old_text, r.new_text);
  end loop;
end $$;

-- the segment rule (0070) floors at k_floor(), not at 5; the caller passes the round's k
create or replace function app.segment_cell_ok(p_k int, p_n_both int, p_n_group int) returns boolean
  language sql immutable set search_path = ''
as $fn$ select p_n_both >= greatest(p_k, app.k_floor()) and (p_n_group - p_n_both) >= greatest(p_k, app.k_floor()) $fn$;

-- and nothing else reads the organisation's current threshold where a round's applies
do $$
declare v text;
begin
  select string_agg(n.nspname || '.' || p.proname, ', ' order by n.nspname, p.proname) into v
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('app', 'public') and p.prosrc ~ 'k_threshold'
    and p.proname not in ('k_threshold', 'round_k_fixed', 'organization_threshold_changed', 'conversations', 'dispatch_claim');
  if v is not null then
    raise exception '0150: these still read the organisation''s current threshold: %', v;
  end if;
end $$;
