-- 0030_comment_themes.sql — "Hva de skrev": how many wrote, and what about, never what.
--
-- Resultat's left-hand column heads the free text a round collected: "14 av 28 skrev noe",
-- then the comments grouped into themes with a count and a tone. D-14 left it out because
-- `app.response_comments` has no reader, deliberately — RLS enabled, no policy, no grant,
-- invariant 1. This function is that reader, and it returns counts only: no body, no
-- response id, no group.
--
-- **The grouping is by factor.** Every comment hangs on a statement of a factor, so the
-- factor is a grouping the data already holds. The design's labels — "Oppfølging av
-- avvik", "Bemanning i høysesong" — group by *topic*, which needs someone or something to
-- read the text; nothing here does, and a label invented for a group of comments would be
-- a claim about what people wrote that nobody checked.
--
-- **The k rules, three of them.**
--
-- 1. Access and scope are `conversations()`'s: a daglig leder reads the whole
--    organisation, an avdelingsleder their own department, anyone else nothing. A
--    verneombud does not read individual comments (0022), and a count of them per factor
--    is close enough to a reading that it follows the same rule.
-- 2. The round in scope must have `app.k_threshold` responses, as `results_summary`
--    requires, or the answer is `insufficient_data` with no counts at all.
-- 3. A factor is a theme only when at least k *different respondents* wrote about it —
--    the design's own rule, "Under fem kommentarer i en gruppe vises de ikke gruppert".
--    Counted in people, not comments: one person may comment on all three statements of a
--    factor, and three comments from one person are one voice.
--
-- The tone is counted, not judged: per theme, how many of its comments hang on an answer
-- of 1-2, of 3, and of 4-5 — the same reading `toneOf` gives Samtaler's chips. The screen
-- decides the label from the counts.
--
-- `not_available` is the single refusal, as everywhere: no membership, wrong role, no such
-- round.

create function public.comment_themes(p_round uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_org   uuid;
  v_k     int;
  v_whole boolean;
  v_n     int;
  v_wrote int;
  v_themes jsonb;
  v_scope uuid[];
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round;
  if v_org is null or not exists (
    select 1 from app.memberships m
    where m.user_id = auth.uid() and m.active and m.org_id = v_org
      and m.role in ('daglig_leder', 'avdelingsleder')
  ) then
    return jsonb_build_object('error', 'not_available');
  end if;

  v_k := app.k_threshold(v_org);

  select exists (
    select 1 from app.memberships m
    where m.user_id = auth.uid() and m.active and m.org_id = v_org
      and m.role = 'daglig_leder'
  ) into v_whole;

  -- the responses this caller may count
  select coalesce(array_agg(resp.id), '{}') into v_scope
  from app.responses resp
  where resp.round_id = p_round
    and (v_whole or resp.group_id in (select vg.group_id from app.visible_groups(v_org) vg));

  v_n := cardinality(v_scope);
  if v_n < v_k then
    return jsonb_build_object('status', 'insufficient_data', 'n', v_n, 'threshold', v_k);
  end if;

  select count(distinct rc.response_id) into v_wrote
  from app.response_comments rc
  where rc.response_id = any(v_scope);

  select coalesce(jsonb_agg(t order by t.comments desc, t.sort_order), '[]'::jsonb) into v_themes
  from (
    select f.key,
           f.sort_order,
           count(*) as comments,
           count(distinct rc.response_id) as people,
           count(*) filter (where a.value <= 2) as low,
           count(*) filter (where a.value = 3) as mid,
           count(*) filter (where a.value >= 4) as high
    from app.response_comments rc
    join app.factors f on f.key = rc.factor_key
    left join app.answers a
      on a.response_id = rc.response_id and a.factor_key = rc.factor_key and a.ordinal = rc.ordinal
    where rc.response_id = any(v_scope)
    group by f.key, f.sort_order
    having count(distinct rc.response_id) >= v_k
  ) t;

  return jsonb_build_object('status', 'ok', 'n', v_n, 'threshold', v_k,
                            'wrote', v_wrote, 'themes', v_themes);
end $fn$;

revoke all on function public.comment_themes(uuid) from public, anon;
grant execute on function public.comment_themes(uuid) to authenticated;
