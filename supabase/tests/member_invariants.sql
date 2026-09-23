-- member_invariants.sql — who gets in, and who can let them (migration 0028).
--
-- Membership decides everything a person can read, so the rules around it are asserted one
-- at a time rather than trusted:
--
--   * nobody writes `app.memberships` directly any more — a daglig leder could previously
--     insert any user id into their organisation (1-3)
--   * an invitation is stored as a digest and returned once (4-6)
--   * only a daglig leder invites, and an avdelingsleder must be given a department of this
--     organisation (7-10)
--   * only the invited address may accept, once, before expiry, and not from another
--     organisation (11-17)
--   * the last daglig leder cannot be demoted or deactivated (18-20)
--   * an organisation and its departments can still be deleted: the invitation table does
--     not block referential maintenance (21-22)
--   * a locked organisation (the shared demo) issues no invitations, and no client role can
--     read or lift the lock (25-26, migration 0029)
--
-- The suite creates two throwaway accounts — an invitee and an outsider — **with no
-- password and no identity**, so nothing here can be signed in as, and assertion 23 proves
-- they and everything they touched are gone again. Safe wherever the other suites run.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/member_invariants.sql

create unlogged table if not exists public._mi(seq int, name text, expected text, actual text, pass bool);
truncate public._mi;

do $$
declare
  v_org     uuid;
  v_dl      uuid;
  v_dl_ms   uuid;
  v_grp     uuid;
  v_other_grp uuid;
  v_invitee uuid := '00000000-0000-4000-8000-0000000e1001';
  v_outsider uuid := '00000000-0000-4000-8000-0000000e1002';
  v_tmp_org uuid := '00000000-0000-4000-8000-0000000e10ff';
  v_json    jsonb;
  v_token   text;
  v_n       int;
  v_msg     text;
  v_demoted uuid[];
begin
  select id into v_org from app.organizations order by id limit 1;
  select m.user_id, m.id into v_dl, v_dl_ms from app.memberships m
    where m.org_id = v_org and m.active and m.role = 'daglig_leder' order by m.id limit 1;
  select id into v_grp from app.groups where org_id = v_org order by sort_order limit 1;

  -- a second organisation with a department of its own, to be refused
  insert into app.organizations (id, name, org_number) values (v_tmp_org, 'Test member AS', '999999997');
  insert into app.groups (org_id, name, sort_order) values (v_tmp_org, 'Annen avdeling', 1)
    returning id into v_other_grp;

  insert into auth.users (id, email) values
    (v_invitee, 'invitert@member-test.example'),
    (v_outsider, 'utenfor@member-test.example');

  -- 1..3 ------------------------------------------------------- no direct writes
  insert into public._mi
  select 1, 'no client role may insert, update or delete a membership', '0', count(*)::text, count(*) = 0
  from information_schema.role_table_grants
  where table_schema = 'app' and table_name = 'memberships'
    and grantee in ('anon', 'authenticated') and privilege_type in ('INSERT', 'UPDATE', 'DELETE');

  insert into public._mi
  select 2, 'and no write policy remains on memberships', '0', count(*)::text, count(*) = 0
  from pg_policies where schemaname = 'app' and tablename = 'memberships' and cmd <> 'SELECT';

  perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
  begin
    set local role authenticated;
    insert into app.memberships (org_id, user_id, role) values (v_org, v_outsider, 'verneombud');
    reset role;
    insert into public._mi values (3, 'a daglig leder cannot insert somebody into the organisation', 'refused', 'ACCEPTED', false);
  exception when others then
    reset role;
    get stacked diagnostics v_msg = message_text;
    insert into public._mi values (3, 'a daglig leder cannot insert somebody into the organisation', 'refused', left(v_msg, 50), true);
  end;

  -- 4..6 ------------------------------------------------------ the invitation itself
  v_json := public.invite_member(v_org, '  Invitert@Member-Test.example ', 'avdelingsleder', v_grp);
  v_token := v_json->>'token';
  insert into public._mi values (4, 'a daglig leder invites, and gets a token once', 'ok',
    coalesce(v_json->>'error', 'ok'), (v_json->>'ok')::boolean and length(v_token) = 64);

  insert into public._mi
  select 5, 'the token is stored only as its digest', 'digest',
         case when token_hash = extensions.digest(v_token, 'sha256') then 'digest' else 'other' end,
         token_hash = extensions.digest(v_token, 'sha256')
  from app.member_invites where org_id = v_org and email = 'invitert@member-test.example';

  insert into public._mi
  select 6, 'no client role may read the digest column', '0', count(*)::text, count(*) = 0
  from information_schema.column_privileges
  where table_schema = 'app' and table_name = 'member_invites' and column_name = 'token_hash'
    and grantee in ('anon', 'authenticated');

  -- 7..10 ------------------------------------------------------- who may invite what
  perform set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  v_json := public.invite_member(v_org, 'x@member-test.example', 'verneombud', null);
  insert into public._mi values (7, 'a non-member cannot invite', 'not_allowed', v_json->>'error', v_json->>'error' = 'not_allowed');

  perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
  v_json := public.invite_member(v_org, 'y@member-test.example', 'avdelingsleder', null);
  insert into public._mi values (8, 'an avdelingsleder must be given a department', 'invalid_group', v_json->>'error', v_json->>'error' = 'invalid_group');

  v_json := public.invite_member(v_org, 'y@member-test.example', 'avdelingsleder', v_other_grp);
  insert into public._mi values (9, 'and it must be a department of this organisation', 'invalid_group', v_json->>'error', v_json->>'error' = 'invalid_group');

  v_json := public.invite_member(v_org, 'not an address', 'verneombud', null);
  insert into public._mi values (10, 'an address that is not one is refused', 'invalid_email', v_json->>'error', v_json->>'error' = 'invalid_email');

  -- 11..17 ------------------------------------------------------------ acceptance
  v_json := public.invite_preview(v_token);
  insert into public._mi values (11, 'the link shows what it offers', 'open|avdelingsleder',
    (v_json->>'state') || '|' || (v_json->>'role'), v_json->>'state' = 'open' and v_json->>'role' = 'avdelingsleder');

  perform set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  v_json := public.accept_invite(v_token);
  insert into public._mi values (12, 'another account cannot accept it', 'wrong_account', v_json->>'error', v_json->>'error' = 'wrong_account');

  perform set_config('request.jwt.claims', json_build_object('sub', v_invitee, 'role', 'authenticated')::text, true);
  v_json := public.accept_invite(v_token);
  insert into public._mi values (13, 'the invited address accepts', 'ok', coalesce(v_json->>'error', 'ok'), (v_json->>'ok')::boolean);

  insert into public._mi
  select 14, 'and holds exactly the offered role and department', 'avdelingsleder|scoped',
         role::text || '|' || case when group_id = v_grp then 'scoped' else 'other' end,
         role = 'avdelingsleder' and group_id = v_grp and active
  from app.memberships where org_id = v_org and user_id = v_invitee;

  v_json := public.accept_invite(v_token);
  insert into public._mi values (15, 'the link cannot be used twice', 'already_accepted', v_json->>'error', v_json->>'error' = 'already_accepted');

  -- an invitation to the second organisation, for somebody who now belongs to the first
  insert into app.member_invites (org_id, email, role, token_hash, expires_at)
  values (v_tmp_org, 'invitert@member-test.example', 'verneombud', extensions.digest('second-org-token', 'sha256'), now() + interval '1 day');
  v_json := public.accept_invite('second-org-token');
  insert into public._mi values (16, 'an account already in one organisation cannot join another', 'other_organisation',
    v_json->>'error', v_json->>'error' = 'other_organisation');

  insert into app.member_invites (org_id, email, role, token_hash, expires_at)
  values (v_org, 'utenfor@member-test.example', 'verneombud', extensions.digest('expired-token', 'sha256'), now() - interval '1 minute');
  perform set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  v_json := public.accept_invite('expired-token');
  insert into public._mi values (17, 'an expired invitation is refused', 'expired', v_json->>'error', v_json->>'error' = 'expired');

  -- 18..20 --------------------------------------------------- the last daglig leder
  perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
  -- make the fixture's daglig leder the only one for the length of this block
  -- (restored below, before the block ends: a suite must leave real memberships as it found them)
  select coalesce(array_agg(id), '{}') into v_demoted from app.memberships
    where org_id = v_org and active and role = 'daglig_leder' and id <> v_dl_ms;
  update app.memberships set role = 'verneombud' where id = any(v_demoted);

  v_json := public.set_member(v_dl_ms, 'verneombud', null, true);
  insert into public._mi values (18, 'the last daglig leder cannot be demoted', 'last_daglig_leder',
    v_json->>'error', v_json->>'error' = 'last_daglig_leder');

  v_json := public.set_member(v_dl_ms, 'daglig_leder', null, false);
  insert into public._mi values (19, 'nor deactivated', 'last_daglig_leder', v_json->>'error', v_json->>'error' = 'last_daglig_leder');

  v_json := public.set_member((select id from app.memberships where org_id = v_org and user_id = v_invitee),
                              'verneombud', null, true);
  insert into public._mi
  select 20, 'while another member can be changed, and the department goes with the role', 'verneombud|none',
         role::text || '|' || coalesce(group_id::text, 'none'),
         (v_json->>'ok')::boolean and role = 'verneombud' and group_id is null
  from app.memberships where org_id = v_org and user_id = v_invitee;

  update app.memberships set role = 'daglig_leder' where id = any(v_demoted);
  perform set_config('request.jwt.claims', '', true);

  -- 25, 26 ------------------------------------------------------------ the lock
  insert into app.member_locks (org_id) values (v_tmp_org);
  insert into app.profiles (id, full_name) values (v_outsider, 'Utenfor') on conflict (id) do nothing;
  insert into app.memberships (org_id, user_id, role) values (v_tmp_org, v_outsider, 'daglig_leder');
  perform set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  v_json := public.invite_member(v_tmp_org, 'z@member-test.example', 'daglig_leder', null);
  insert into public._mi values (25, 'a locked organisation issues no invitation, even to its daglig leder', 'locked',
    v_json->>'error', v_json->>'error' = 'locked' and public.members_locked(v_tmp_org));
  perform set_config('request.jwt.claims', '', true);

  insert into public._mi
  select 26, 'no client role holds any privilege on the lock table', '0', count(*)::text, count(*) = 0
  from information_schema.role_table_grants
  where table_schema = 'app' and table_name = 'member_locks' and grantee in ('anon', 'authenticated');

  -- 21, 22 ------------------------------------------------- referential maintenance
  begin
    delete from app.groups where id = v_other_grp;
    insert into public._mi values (21, 'a department can be deleted with an invitation pointing at it', 'deleted', 'deleted', true);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into public._mi values (21, 'a department can be deleted with an invitation pointing at it', 'deleted', left(v_msg, 50), false);
  end;

  begin
    delete from app.organizations where id = v_tmp_org;
    insert into public._mi values (22, 'an organisation with invitations can be deleted', 'deleted', 'deleted', true);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into public._mi values (22, 'an organisation with invitations can be deleted', 'deleted', left(v_msg, 50), false);
  end;

  -- clean up, then prove it
  delete from app.member_invites where email like '%@member-test.example';
  delete from app.memberships where user_id in (v_invitee, v_outsider);
  delete from app.profiles where id in (v_invitee, v_outsider);
  delete from auth.users where id in (v_invitee, v_outsider);

  insert into public._mi
  select 24, 'the daglig ledere demoted for 18-19 are daglig ledere again', '0', count(*)::text, count(*) = 0
  from app.memberships where id = any(v_demoted) and role <> 'daglig_leder';

  insert into public._mi
  select 23, 'every throwaway row is gone again', '0', count(*)::text, count(*) = 0
  from (
    select id from auth.users where id in (v_invitee, v_outsider)
    union all select id from app.member_invites where email like '%@member-test.example'
    union all select id from app.organizations where id = v_tmp_org
    union all select org_id from app.member_locks where org_id = v_tmp_org
  ) left_over;
end $$;

select seq, name, expected, actual, pass from public._mi order by seq;

do $$
declare v_failed text;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) into v_failed from public._mi where not pass;
  if v_failed is not null then
    raise exception 'member invariants failed: %', v_failed;
  end if;
end $$;

drop table public._mi;
