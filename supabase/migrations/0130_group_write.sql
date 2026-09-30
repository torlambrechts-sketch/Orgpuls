-- 0130 — Groups are created and renamed in Oppsett › Grupper (D-172)
--
-- Until now no action created or renamed a group (D-76): the fixture wrote them and the
-- Veiviser pointed to a tab that could not add one. The daglig leder now does both there,
-- through the write path the table already had: `authenticated` holds insert and update on
-- app.groups, and 0026's `group_admin_insert` / `group_admin_update` admit the daglig leder
-- of the row's organisation and nobody else. A definer RPC would be a second rule beside the
-- policy; what the policy cannot say — the shape of a name — is said by the table instead,
-- so it holds for every writer, the seeds included.
--
--   * A name is trimmed and 1..60 characters. The old check (a non-blank name) stays.
--   * Two groups of one organisation may not share a name in any case. The employee import
--     matches column C to a group case-insensitively, so «Salg» and «salg» side by side would
--     make that match a guess. The (org_id, name) key stays; this index is stricter.
--   * Nothing here deletes a group, and Oppsett offers no way to. Results, round audiences and
--     memberships are keyed by group_id: a delete cascades a round's audience away
--     (round_groups) and is refused outright once anyone in the group has answered (responses
--     has no ON DELETE). 0026's delete policy is left as it is — survey_settings_invariants
--     proves what it does to an open round — but no action calls it.
--     Renaming is safe for the reason deleting is not: every result reads the name through the
--     id when it is read, so a closed round's figures follow the new name.
--   * A renamed group keeps its former names, and comment masking keeps masking them.
--     app.mask_patterns reads the register as it is now; a comment written about «Verksted»
--     before it became «Mekanisk» would otherwise lose its «[avdeling]» marker on the rename,
--     and a department name in a comment is what ties it to a small group. `former_names` is
--     written by the trigger alone: whatever a client sends for it is replaced.

alter table app.groups
  add constraint groups_name_shape check (name = btrim(name) and char_length(name) between 1 and 60);

create unique index groups_org_name_ci on app.groups (org_id, lower(name));

alter table app.groups
  add column former_names text[] not null default '{}';

comment on column app.groups.former_names is
  'Names this group had before a rename (0130), kept so app.mask_patterns still masks them in comments written earlier. Written by app.groups_keep_names only.';

create function app.groups_keep_names() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  if tg_op = 'INSERT' then
    new.former_names := '{}';
  elsif new.name is distinct from old.name then
    new.former_names := array_remove(
      case when old.name = any(old.former_names) then old.former_names
           else array_append(old.former_names, old.name) end,
      new.name);
  else
    new.former_names := old.former_names;
  end if;
  return new;
end
$fn$;

revoke all on function app.groups_keep_names() from public, anon, authenticated;

create trigger groups_keep_names before insert or update on app.groups
  for each row execute function app.groups_keep_names();

-- 0095's body, with a group's former names among the department words
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
