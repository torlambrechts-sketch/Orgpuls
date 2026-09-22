-- local_account.sql — a signed-in user, for a throwaway database only.
--
-- LOCAL AND CI ONLY. Do not run this against a hosted project. It writes directly into
-- auth.users with a known uuid and a known password hash, which is a credential anyone
-- reading this repository can see. On a local stack that is a convenience; anywhere
-- real it is a back door.
--
-- It exists because every result RPC is gated on app.is_org_member(), which reads
-- auth.uid(), which needs a row in auth.users -> app.profiles -> app.memberships. A
-- database built from migrations alone has none of that, so a CI job that called
-- results_summary got `not_available` back and could not tell the difference between
-- "k-anonymity withheld this" and "there is nobody to ask".
--
-- The fixture generator deliberately does not do this. An organisation and its
-- employees are the design's scenario; a login is not.
--
--   psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/local_account.sql

do $$
declare
  v_uid uuid := '00000000-0000-4000-8000-0000000000aa';
  v_org uuid := '00000000-0000-4000-8000-000000000001';
begin
  if current_setting('server_version_num')::int is null then
    raise exception 'unreachable';
  end if;

  insert into auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  values (
    v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'dev.orgpuls@nordvik.example',
    crypt('orgpuls-local-only', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
  )
  on conflict (id) do nothing;

  insert into app.profiles (id, full_name, lang)
  values (v_uid, 'Tuva Berg', 'no')
  on conflict (id) do nothing;

  insert into app.memberships (org_id, user_id, role, active)
  values (v_org, v_uid, 'daglig_leder', true)
  on conflict (org_id, user_id) do update set active = true, role = excluded.role;
end $$;

select 'local account ready: ' || (select count(*) from app.memberships where active)
       || ' active membership(s)' as result;
