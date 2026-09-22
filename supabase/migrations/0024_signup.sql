-- 0024_signup.sql — how an organisation comes into existence.
--
-- Until now every organisation in this database was put there by the fixture. A product
-- with a sign-up page needs a way for somebody to create one, and that way has to be
-- exactly one transaction: an account with no organisation cannot see anything, and an
-- organisation with no membership cannot be reached by anybody ever again.
--
-- **The guard that matters is one-per-account.** `rpc.create_organisation` refuses a
-- caller who already has an active membership. Without it, a signed-in daglig leder could
-- post the form again and quietly acquire a second organisation, and `app.is_org_member`
-- — which takes the caller's *first* membership in several places — would start answering
-- a different question than the one it was written for.
--
-- The threshold is not a parameter. A new organisation starts at `app.k_min()`, and the
-- only way to change it is the Grupper tab, where the note explains what it does. A
-- sign-up form is not a place to set a privacy floor, and offering it there would invite
-- the one answer nobody should give on their first day.

create function public.create_organisation(
  p_name           text,
  p_org_number     text,
  p_employee_count int,
  p_full_name      text default null
) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user uuid := auth.uid();
  v_org  uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  if exists (select 1 from app.memberships m where m.user_id = v_user and m.active) then
    return jsonb_build_object('ok', false, 'error', 'already_a_member');
  end if;

  if p_name is null or length(btrim(p_name)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;

  if p_org_number is null or p_org_number !~ '^[0-9]{9}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_org_number');
  end if;

  if exists (select 1 from app.organizations o where o.org_number = p_org_number) then
    return jsonb_build_object('ok', false, 'error', 'already_registered');
  end if;

  -- the profile is the row memberships hang off; a sign-up is the first time it is needed
  insert into app.profiles (id, full_name)
  values (v_user, nullif(btrim(coalesce(p_full_name, '')), ''))
  on conflict (id) do update set
    full_name = coalesce(excluded.full_name, app.profiles.full_name);

  insert into app.organizations (name, org_number, employee_count, threshold)
  values (btrim(p_name), p_org_number, greatest(coalesce(p_employee_count, 0), 0), app.k_min())
  returning id into v_org;

  insert into app.memberships (org_id, user_id, role, active)
  values (v_org, v_user, 'daglig_leder', true);

  /*
   * The year wheel is created switched off. An organisation that has just signed up has
   * told nobody anything yet, and a scheduler that started planning rounds on their
   * behalf before they had added a single employee would be the opposite of the promise
   * Årshjulet makes. `active` defaults false in 0019; this row is here so the Årshjulet
   * screen has something to edit rather than an empty state nobody can leave.
   */
  insert into app.year_wheels (org_id) values (v_org);

  return jsonb_build_object('ok', true);
end $fn$;

revoke all on function public.create_organisation(text, text, int, text) from public, anon;
grant execute on function public.create_organisation(text, text, int, text) to authenticated;

-- an organisation number identifies an undertaking, so two rows may not share one
create unique index organizations_org_number_key on app.organizations (org_number);
