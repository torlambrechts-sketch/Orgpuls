-- 0217 — close a test suite's results table left on the hosted project.
--
-- supabase/tests/definer_grants_invariants.sql writes its rows to public._dgr and, unlike every other
-- suite, never dropped it. The suite was once run against the hosted project, so the table stayed
-- there: three passing test rows, no customer data, but in the public schema with RLS off and the
-- default grants, so anon could read and write it through the API (advisor rls_disabled_in_public).
-- The suite now drops its table; this closes the one left behind. Where the table does not exist (a
-- database rebuilt from migrations) it does nothing.
--
-- Closed rather than dropped: the Supabase connector cancels DROP statements (CLAUDE.md, deployment
-- playbook 3). RLS with no policy and no grant is the same posture as the answer tables.

do $$
begin
  if to_regclass('public._dgr') is not null then
    alter table public._dgr enable row level security;
    revoke all on table public._dgr from public, anon, authenticated;
  end if;
end $$;
