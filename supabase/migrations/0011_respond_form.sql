-- 0011_respond_form.sql — what a respondent is allowed to see when they open the link.
--
-- The respondent surface is public: whoever opens /s/<token> is anon, and anon has no
-- grant on app.invitations and no RLS policy that would give one. That is correct and
-- must stay correct, so the page cannot validate a token by reading a table. This is
-- the read counterpart to submit_response: one SECURITY DEFINER function that takes the
-- token, and returns either the form or a reason it cannot be shown.
--
-- What it returns is bounded on purpose. The organisation's name, because the person
-- needs to know who is asking; the threshold, because the screen promises "minst N";
-- and the questions. It does NOT return the round id, the invitation id, the employee,
-- or the group. None of those are needed to answer, and each of them is a handle that
-- would let a respondent -- or anyone who got hold of the link -- learn something about
-- the person it was sent to.
--
-- The errors it distinguishes are exactly the ones submit_response already
-- distinguishes, so this adds no oracle that did not exist. They are also the screen's
-- real states: "you have already answered" has to be sayable, or people answer twice
-- and conclude the product is broken.
--
-- ORDER. The design promises the respondent, in writing on the screen before the first
-- question: "Rekkefølgen er tilfeldig per person, så ingen kan gjette hvem som svarte
-- hva ut fra når svaret kom inn." So the order is shuffled, seeded by the token, which
-- makes it stable if the person reloads and different between people. A promise printed
-- to a respondent that the code does not keep is a worse defect than any layout one.
-- The questions outside the index keep their sort_order and stay at the end, as the
-- design's own flow has them (bundle lines 4115-4122).

create function public.respond_form(p_token text)
  returns jsonb
  language plpgsql security definer stable
  set search_path = ''
as $fn$
declare
  v_inv   app.invitations%rowtype;
  v_org   app.organizations%rowtype;
  v_round app.rounds%rowtype;
  v_qs    jsonb;
  v_extra jsonb;
begin
  if p_token is null or length(p_token) < 16 then
    return jsonb_build_object('error', 'invalid_token');
  end if;

  select * into v_inv from app.invitations i
  where i.token_hash = extensions.digest(p_token, 'sha256');

  if not found then
    return jsonb_build_object('error', 'invalid_token');
  end if;
  if v_inv.responded_at is not null then
    return jsonb_build_object('error', 'already_responded');
  end if;
  if v_inv.expires_at <= now() then
    return jsonb_build_object('error', 'expired');
  end if;

  select * into v_round from app.rounds r where r.id = v_inv.round_id;
  if v_round.status <> 'apen' then
    return jsonb_build_object('error', 'round_closed');
  end if;

  select * into v_org from app.organizations o where o.id = v_inv.org_id;

  -- shuffled per token, stable on reload
  select jsonb_agg(jsonb_build_object('factor', q.factor_key, 'ordinal', q.ordinal)
                   order by q.seed)
  into v_qs
  from (
    select rf.factor_key, s.ordinal,
           extensions.digest(p_token || rf.factor_key || s.ordinal::text, 'sha256') as seed
    from app.round_factors rf
    join app.statements s on s.factor_key = rf.factor_key
    where rf.round_id = v_round.id
  ) q;

  select jsonb_agg(jsonb_build_object(
           'key', x.extra_key, 'kind', q.kind,
           'options', (select count(*) from app.extra_options o where o.extra_key = x.extra_key))
         order by q.sort_order)
  into v_extra
  from app.round_extra_questions x
  join app.extra_questions q on q.key = x.extra_key
  where x.round_id = v_round.id;

  return jsonb_build_object(
    'org', v_org.name,
    'threshold', app.k_threshold(v_inv.org_id),
    'questions', coalesce(v_qs, '[]'::jsonb),
    'extra', coalesce(v_extra, '[]'::jsonb)
  );
end $fn$;

-- anon must be able to call this: a respondent is by definition not signed in.
revoke all on function public.respond_form(text) from public;
grant execute on function public.respond_form(text) to anon, authenticated;
