-- 0044_results_digest.sql — one results call per screen.
--
-- Innsikt, Oversikt, Tiltak and Målinger each read `participation` once per round (twelve on
-- the design fixture), plus `results_summary` once or twice and, on Tiltak and Målinger,
-- `results_workspace`. That is up to fifteen HTTP round trips to PostgREST for one page,
-- each paying its own auth and connection work. Resultater already reads in one call
-- (0037). This gives every other screen the same: the screen names what it needs and
-- gets it back in one response.
--
-- `results_digest(p_participation, p_summaries, p_workspace)` returns
--   participation   [{round_id, participation}]  `public.participation` per id, in order
--   summaries       [{round_id, summary}]        `public.results_summary` per id, in order
--   workspace       `public.results_workspace(p_workspace)`, or null when none is asked
--
-- Like `results_workspace` it is SECURITY INVOKER and only calls the gated readers, so it
-- holds no privilege of its own and adds no rule: every part is what its caller could ask
-- for one call at a time, gated per round exactly as that call gates it — closed rounds
-- only for results, k and complementary suppression per cell (0042), `not_available` for
-- a round of another organisation. It never merges or reshapes a part.
--
-- A request is capped at 500 ids per list. A screen names at most every round of one
-- organisation — a century of quarterly pulses is 400 — and a round of another
-- organisation is refused before any work, so the real cost is bounded by the caller's own
-- history, as `results_workspace`'s is: an id asked for twice is answered once. The cap
-- only stops a call padded with junk ids.

create function public.results_digest(
  p_participation uuid[] default '{}',
  p_summaries uuid[] default '{}',
  p_workspace uuid default null
) returns jsonb
  language plpgsql stable security invoker set search_path = ''
as $fn$
begin
  if coalesce(cardinality(p_participation), 0) > 500 or coalesce(cardinality(p_summaries), 0) > 500 then
    return jsonb_build_object('error', 'too_many');
  end if;

  return jsonb_build_object(
    'participation', coalesce((
      select jsonb_agg(jsonb_build_object('round_id', u.id, 'participation', public.participation(u.id))
                       order by u.i)
      from (select v.id, min(v.i) as i from unnest(p_participation) with ordinality as v(id, i) group by v.id) u
    ), '[]'::jsonb),
    'summaries', coalesce((
      select jsonb_agg(jsonb_build_object('round_id', u.id, 'summary', public.results_summary(u.id))
                       order by u.i)
      from (select v.id, min(v.i) as i from unnest(p_summaries) with ordinality as v(id, i) group by v.id) u
    ), '[]'::jsonb),
    'workspace', case when p_workspace is null then null else public.results_workspace(p_workspace) end);
end $fn$;

revoke all on function public.results_digest(uuid[], uuid[], uuid) from public, anon;
grant execute on function public.results_digest(uuid[], uuid[], uuid) to authenticated;
