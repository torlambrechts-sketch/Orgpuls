-- 0190 — Former employee names stay masked; an organisation with invitations can be deleted (D-206)
--
-- Two follow-ups found while building the Entra import (D-202).
--
-- 1. **A renamed person's old name kept masking.** Respondent text shown to a leader — a comment,
--    a reply in a conversation, an open answer — has the organisation's names replaced
--    (app.mask_patterns / app.mask_apply, 0095). mask_patterns read the register as it is now, so
--    a comment written about «Kari Nordmann» lost its ⟦n⟧ the moment she became «Kari Hansen»,
--    whether by hand (Ansatte, under 0026's update policy) or by the Entra sync (entra_sync_apply,
--    0165, which renames with a plain UPDATE of app.employees). Groups solved this in 0130 with
--    `former_names` and the groups_keep_names trigger; employees now do the same, with one
--    difference: the names are kept in a table of their own, app.employee_former_names, keyed by
--    organisation and name and by nothing else — no employee id. That is what lets a name outlive
--    the person's row:
--
--      * a rename keeps the old name (app.employees_keep_names, after update of full_name, so every
--        writer is caught: a client, the import, entra_sync_apply, a definer function);
--      * a delete keeps the name the person had — a comment that names them is just as identifying
--        after the leader removes them from the register as before. Deleting someone must not
--        unmask what was written about them. The rule only applies while the organisation exists:
--        when the organisation itself goes, its names go with it (cascade), and a delete inside that
--        cascade records nothing (CLAUDE.md: the trigger stands aside for referential maintenance).
--
--    How long a name is kept: as long as the organisation's answers are, which is as long as the
--    agreement lasts (0136, DPA annex 1). Respondent text is never deleted from a live organisation
--    apart from with its round, and a text written after a rename can use the old name as well, so
--    tying a name to particular comments would add a rule without changing what is masked. The row
--    holds a name and an organisation and nothing that says whose it was or when it changed; it is
--    counted and deleted with the organisation (org_row_counts derives it from org_id), and a demo
--    sandbox copies the template's along with the comments they mask.
--
--    The table is the register side's and closed to every client: RLS on, no policy, no grant.
--    Nothing reads it but app.mask_patterns, a definer function no client may call; what a client
--    sees is the masked text, as before. No answer table, no response column, no policy on either.
--
-- 2. **Deleting an organisation that has invitations failed.** Reproduced: an organisation with a
--    round and an invitation to an employee, deleted in one statement in the transaction that wrote
--    the invitation, fails with
--
--      23503 insert or update on table "invitations" violates foreign key constraint
--            "invitations_org_id_round_id_fkey" — Key (org_id, round_id) is not present in "rounds"
--
--    No trigger refuses it; the constraint does. The organisation's delete cascades along two
--    paths that both reach app.invitations: organisations → measurements → rounds → invitations
--    (CASCADE), and organisations → employees → invitations.employee_id (SET NULL). In the order
--    PostgreSQL ran them, the round went first and the SET NULL then updated the invitation before
--    the round's own cascade had removed it. An UPDATE of a row the current transaction wrote is
--    re-checked against every foreign key of the row, changed or not (ri_triggers.c,
--    RI_FKey_fk_upd_check_required), so the invitation's (org_id, round_id) was checked against a
--    round already gone. In a later transaction the check is skipped and the delete succeeds.
--
--    And without a transaction in common it still fails as soon as anyone has answered: responses
--    point at their group with NO ACTION (0042: a group that holds responses cannot be deleted),
--    and the same single-statement delete reaches groups before responses:
--
--      23503 update or delete on table "groups" violates foreign key constraint
--            "responses_group_id_fkey" on table "responses"
--
--    app.delete_organisation (0064/0136) and app.demo_drop (0094) already avoid both by deleting the
--    rounds before the organisation. The order is now the database's for every path: a BEFORE
--    DELETE trigger on app.organizations deletes the organisation's rounds first, which takes their
--    invitations, responses and answers with them through the cascades and the answer tables' own
--    rule (a delete only once the parent is gone). Nothing is weakened: no foreign key changes or
--    is deferred, responses_group_id_fkey still refuses deleting a group that holds responses, the
--    answer tables' immutability triggers are untouched, and nothing is added to a table a
--    submission writes (the growth firewall, 0141). It deletes only what the organisation's own
--    deletion deletes, and no client may delete an organisation.

-- ============================================================ 1. former employee names
create table app.employee_former_names (
  org_id uuid not null references app.organizations (id) on delete cascade,
  name   text not null check (name = btrim(name) and char_length(name) between 1 and 200),
  primary key (org_id, name)
);

comment on table app.employee_former_names is
  'Names people in the register had before a rename, or had when they were deleted (0190), kept so app.mask_patterns still masks them in respondent text written earlier. Organisation and name only: no employee id. Written by app.employees_keep_names only; read by app.mask_patterns only. No client access.';

alter table app.employee_former_names enable row level security;
-- NO POLICY, and no grant: every client role is denied by default. Read by app.mask_patterns.
revoke all on app.employee_former_names from public, anon, authenticated;

create function app.employees_keep_names() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_name text := left(btrim(regexp_replace(old.full_name, '\s+', ' ', 'g')), 200);
begin
  if v_name = '' then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    if new.full_name is distinct from old.full_name or new.org_id is distinct from old.org_id then
      insert into app.employee_former_names (org_id, name) values (old.org_id, v_name)
      on conflict do nothing;
    end if;
  -- a delete inside the organisation's own deletion records nothing: the names go with it
  elsif exists (select 1 from app.organizations o where o.id = old.org_id) then
    insert into app.employee_former_names (org_id, name) values (old.org_id, v_name)
    on conflict do nothing;
  end if;
  return null;
end $fn$;

revoke all on function app.employees_keep_names() from public, anon, authenticated;

create trigger employees_keep_names after update of full_name, org_id or delete on app.employees
  for each row execute function app.employees_keep_names();

-- 0130's body, with the people's former names among the names
create or replace function app.mask_patterns(p_org uuid) returns text[]
  language sql stable security definer set search_path = ''
as $fn$
  with words as (
    select 'a' as tag, btrim(g.name) as w from app.groups g where g.org_id = p_org
    union select 'a', btrim(f) from app.groups g, unnest(g.former_names) f where g.org_id = p_org
    union select 's', btrim(l.name) from app.locations l where l.org_id = p_org
    union select 'n', t from app.employees e,
      lateral (select regexp_split_to_table(e.full_name, '\s+') union select regexp_split_to_table(e.full_name, '[\s-]+')) x(t)
      where e.org_id = p_org
    union select 'n', t from app.employee_former_names f,
      lateral (select regexp_split_to_table(f.name, '\s+') union select regexp_split_to_table(f.name, '[\s-]+')) x(t)
      where f.org_id = p_org
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

revoke all on function app.mask_patterns(uuid) from public, anon, authenticated;

-- a sandbox's copied comments are masked as the template's are
insert into app.demo_copy_plan (table_name, step, mode, via, note) values
  ('employee_former_names', 21, 'copy', null, 'names the fictional people had before, for masking the copied comments');

-- ============================================================ 2. an organisation's rounds go first
create function app.organization_rounds_first() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  -- the order app.delete_organisation and app.demo_drop already keep, for every path: a round
  -- takes its invitations, responses and answers with it before the employees' SET NULL and the
  -- groups' delete could meet them
  delete from app.rounds where org_id = old.id;
  return old;
end $fn$;

revoke all on function app.organization_rounds_first() from public, anon, authenticated;

create trigger organizations_rounds_first before delete on app.organizations
  for each row execute function app.organization_rounds_first();
