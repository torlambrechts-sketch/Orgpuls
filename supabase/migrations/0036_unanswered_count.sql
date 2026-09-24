-- 0036_unanswered_count.sql — the number on design 3's Kommentarer tab.
--
-- The nav's Kommentarer entry carries a badge: how many anonymous comments are waiting for
-- an answer. It renders on every page, so it wants to be cheap, and it must never say more
-- than the Kommentarer screen would show the same person — a count of comments the reader
-- may not see would be a small leak of its own (a comment from a group under k exists).
--
-- So it is not a second reader with its own rules. It counts the rows `conversations()`
-- returns: the same role gate (daglig leder, and an avdelingsleder for their department;
-- a verneombud reads no comments, 0022), the same k per group, and the state the screen
-- files under "Venter på svar". It is SECURITY INVOKER: it holds no privilege of its own,
-- and anything it can count the caller could already read.
--
-- A refusal from `conversations()` has no `threads`, and counts as 0: no badge.

create function public.unanswered_threads() returns int
  language sql stable security invoker set search_path = ''
as $$
  select count(*)::int
  from jsonb_array_elements(coalesce(public.conversations(null)->'threads', '[]'::jsonb)) t
  where t->>'state' = 'venter'
$$;

revoke all on function public.unanswered_threads() from public, anon;
grant execute on function public.unanswered_threads() to authenticated;
