-- 0035_recommendation.sql — "Anbefaler oss": the recommendation question, read. D-10 lifted.
--
-- The design's Resultater header prints "Anbefaler oss +22" beside the index. The question
-- behind it has been asked since 0007 ("Hvor sannsynlig er det at du vil anbefale oss som
-- arbeidsplass…", five options, 0009) and answered into `app.extra_answers`, which has RLS
-- with no policy and no grant. D-10 left the figure out because nothing read it. This is
-- the reader.
--
-- **The figure (decision D5, docs/PLAN_2026-09-24_design3.md).** The design prints a signed
-- whole number, which is how eNPS is printed. eNPS is defined on a 0–10 scale: the share
-- answering 9–10 minus the share answering 0–6. The instrument's scale is 1–5, so the
-- figure is the same construction on it:
--
--     score = round(100 × (answers of 5 − answers of 1–3) / answers)
--
-- 5 ("Svært sannsynlig") counts for, 4 is neutral, 1–3 count against. It ranges from −100
-- to +100. The screen labels it as the recommendation figure; it is not the index and
-- never enters it (0007).
--
-- **Whole organisation only.** A score is one number over everyone who answered, and it is
-- given only to callers whose results cover the whole house: daglig leder and verneombud.
-- An avdelingsleder reads their department everywhere else (0022), and a whole-organisation
-- figure here would be a wider view than they have for the index itself. So they are
-- refused, as a non-member is.
--
-- **Two k gates.** The round must have k responses, as for every result. The question
-- must also have k *answers*: the question is optional, and an average over fewer than k
-- answers is a cell below k even when the round is not.
--
-- Nothing per option and nothing per group is returned. With the score and the count,
-- promoters minus detractors can be recovered, and that is all: a single net figure
-- over at least k answers, for the whole organisation.

create function public.results_recommendation(p_round uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_org uuid; v_k int; v_n int; v_answered int; v_for int; v_against int;
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round;
  if v_org is null or not exists (
    select 1 from app.memberships m
    where m.user_id = auth.uid() and m.active and m.org_id = v_org
      and m.role in ('daglig_leder', 'verneombud')
  ) then
    return jsonb_build_object('error', 'not_available');
  end if;

  v_k := app.k_threshold(v_org);

  if not exists (
    select 1 from app.round_extra_questions rq
    where rq.round_id = p_round and rq.extra_key = 'anbefaling'
  ) then
    return jsonb_build_object('status', 'not_asked', 'threshold', v_k);
  end if;

  select count(*) into v_n from app.responses where round_id = p_round;

  select count(*),
         count(*) filter (where ea.option_ordinal = 5),
         count(*) filter (where ea.option_ordinal <= 3)
    into v_answered, v_for, v_against
  from app.extra_answers ea
  join app.responses r on r.id = ea.response_id
  where r.round_id = p_round and ea.extra_key = 'anbefaling';

  if v_n < v_k or v_answered < v_k then
    return jsonb_build_object('status', 'insufficient_data', 'threshold', v_k);
  end if;

  return jsonb_build_object('status', 'ok', 'threshold', v_k, 'n', v_n, 'answered', v_answered,
    'score', round(100.0 * (v_for - v_against) / v_answered)::int);
end $fn$;

revoke all on function public.results_recommendation(uuid) from public, anon;
grant execute on function public.results_recommendation(uuid) to authenticated;
