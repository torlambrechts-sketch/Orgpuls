-- 0027_viewer_role.sql — the caller's role, from the token the database already verified.
--
-- P4 in docs/CODE_REVIEW_2026-09-23.md: every signed-in page view made two round trips to
-- Supabase Auth. The middleware's `getUser()` is the trust boundary and stays. The second
-- was `getViewerRole()` in lib/org/read.ts, which called `getUser()` again only to learn
-- the caller's id so it could filter app.memberships by it.
--
-- The database already knows who the caller is. PostgREST verifies the JWT's signature on
-- every request and exposes its subject as auth.uid(); that is the same fact getUser()
-- fetches over HTTP, obtained without leaving the database. So the lookup moves here.
--
-- **Why not `getSession()` instead,** which reads the cookie with no network call: its
-- `user` object is part of the stored session and is not re-verified, so a client could
-- edit it to name another member of their organisation and be shown that member's role.
-- Row-level security would still refuse every write — this is not an escalation — but the
-- screen would offer controls that do not work, which is the S1 failure again in a new
-- place. auth.uid() cannot be edited: it comes from a signature the database checked.
--
-- **One membership or no answer.** The old query ended `.limit(1)`, which for a person in
-- two organisations returned an arbitrary one of their two roles. This returns null for
-- more than one, the rule lib/org/current.ts applies to the organisation itself (Q3):
-- refuse rather than guess, until there is an organisation switcher to ask.
--
-- SECURITY INVOKER, deliberately. The caller may already read their own membership through
-- `membership_read`; nothing here needs more privilege than the caller has.

create function public.viewer_role()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case when count(*) = 1 then max(m.role::text) end
  from app.memberships m
  where m.user_id = (select auth.uid()) and m.active
$$;

revoke all on function public.viewer_role() from public, anon;
grant execute on function public.viewer_role() to authenticated;
