-- 0022_department_scope.sql — "Ingen tilgang til andre avdelinger", made true.
--
-- The access matrix on Oppsett promises that an avdelingsleder sees their own team and
-- nothing else. Until this migration that promise was false in the most complete way
-- possible: every result RPC and every comment read gated on `app.is_org_member`, so an
-- avdelingsleder read exactly what a daglig leder read — the whole house, every group,
-- every anonymous comment. There was no column to scope by.
--
-- Two separate defects are fixed here, and it is worth keeping them apart.
--
-- **1. A read that was wider than its own write.** `reply_to_thread` and `set_thread`
-- have always refused anyone who is not daglig leder or avdelingsleder, while
-- `conversations` admitted any member — so a verneombud could read every comment in the
-- organisation but not answer one. The design says verneombud get no individual comments,
-- § 6-2 gives them involvement rather than correspondence, and a read wider than its write
-- is a bug in any case. `conversations` now carries the same gate as the write path.
--
-- **2. No department scope existed.** `app.memberships.group_id` is the department an
-- avdelingsleder leads, and `app.visible_groups` turns a membership into the set of groups
-- that membership may see. Daglig leder and verneombud see every group, which is what both
-- roles need: the first runs the undertaking, the second has a statutory right to the same
-- picture. An avdelingsleder sees one group, or none if nobody has told the system which.
--
-- **None of this touches k.** `app.k_threshold` still decides whether a cell is released
-- at all, and scoping is applied on top of it, never instead of it. A leader of a
-- four-person department still gets `insufficient_data` for their own team — being its
-- leader is not a reason the four are identifiable to them.

alter table app.memberships
  add column group_id uuid references app.groups (id) on delete set null;

comment on column app.memberships.group_id is
  'The department an avdelingsleder leads. Null for every other role, and null for an '
  'avdelingsleder nobody has assigned — which yields no groups, not all of them.';

/*
 * Two things a membership's group must satisfy: it belongs to the same organisation, and
 * it is only meaningful on an avdelingsleder. The second is enforced rather than merely
 * documented because the alternative is a daglig_leder row carrying a group that some
 * later query silently starts scoping by.
 */
create function app.membership_group_consistent() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
declare v_org uuid;
begin
  if new.group_id is null then
    return new;
  end if;

  if new.role <> 'avdelingsleder' then
    raise exception 'only an avdelingsleder leads a department (role is %)', new.role;
  end if;

  select g.org_id into v_org from app.groups g where g.id = new.group_id;
  if v_org is distinct from new.org_id then
    raise exception 'group % is not in organisation %', new.group_id, new.org_id;
  end if;

  return new;
end $fn$;

create trigger membership_group_consistent
  before insert or update on app.memberships
  for each row execute function app.membership_group_consistent();

/*
 * The groups a caller may see, as a set.
 *
 * Returning a set rather than a boolean matters: `results_by_group` needs to *omit* the
 * rows it may not show, not test them one at a time, and a caller with no membership
 * returns the empty set rather than a null that a careless join would treat as "all".
 */
create function app.visible_groups(p_org uuid)
  returns table (group_id uuid)
  language sql stable security definer set search_path = ''
as $fn$
  select g.id
  from app.memberships m
  cross join lateral (
    select gr.id
    from app.groups gr
    where gr.org_id = p_org
      and (m.role in ('daglig_leder', 'verneombud') or gr.id = m.group_id)
  ) g
  where m.user_id = auth.uid() and m.active and m.org_id = p_org
$fn$;

revoke all on function app.visible_groups(uuid) from public, anon;
grant execute on function app.visible_groups(uuid) to authenticated;

-- ------------------------------------------------------------- results_by_group
--
-- Unchanged except for the last line of the inner query: a group the caller may not see
-- is absent, not masked. "Verksted: skjult" would still tell an avdelingsleder that
-- Verksted answered, and how many.
--
-- "Uten gruppe" is visible only to a caller who can see the whole house. It is a bucket
-- rather than a department, and an avdelingsleder scoped to one group has no claim on it.
create or replace function public.results_by_group(p_round uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare v_org uuid; v_k int; v_out jsonb; v_whole boolean;
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round;
  if v_org is null or not app.is_org_member(v_org) then
    return jsonb_build_object('error', 'not_available');
  end if;
  v_k := app.k_threshold(v_org);

  select exists (
    select 1 from app.memberships m
    where m.user_id = auth.uid() and m.active and m.org_id = v_org
      and m.role in ('daglig_leder', 'verneombud')
  ) into v_whole;

  select jsonb_agg(row_to_json(g)::jsonb order by g.group_name) into v_out
  from (
    select coalesce(grp.name, 'Uten gruppe') as group_name, counts.n as n,
      case when counts.n >= v_k then 'ok' else 'insufficient_data' end as status,
      case when counts.n >= v_k then (
        select jsonb_agg(jsonb_build_object('key', pf.key, 'index', pf.idx,
                                            'band', app.risk_band(pf.idx))
                         order by pf.sort_order)
        from (
          select f2.key, f2.sort_order, round(avg(app.to_index(a2.value))) as idx
          from app.answers a2
          join app.responses r2 on r2.id = a2.response_id
          join app.factors f2 on f2.key = a2.factor_key
          where r2.round_id = p_round and r2.group_id is not distinct from counts.group_id
          group by f2.key, f2.sort_order
        ) pf
      ) else null end as factors
    from (
      select resp.group_id, count(*) as n from app.responses resp
      where resp.round_id = p_round group by resp.group_id
    ) counts
    left join app.groups grp on grp.id = counts.group_id
    where v_whole
       or counts.group_id in (select vg.group_id from app.visible_groups(v_org) vg)
  ) g;

  return jsonb_build_object('threshold', v_k, 'groups', coalesce(v_out, '[]'::jsonb),
                            'scope', case when v_whole then 'org' else 'groups' end);
end $fn$;

-- --------------------------------------------------------------- results_summary
--
-- The index over what the caller may see, with `scope` saying which that was.
--
-- A single number whose meaning changes silently with the reader is a trap: "61" labelled
-- "hele virksomheten" is a different claim from "61" over one department, and a screen
-- cannot tell them apart from the number. So the payload names its own scope, and the
-- screen labels it from that rather than from an assumption.
create or replace function public.results_summary(p_round uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_org uuid; v_k int; v_n int; v_factors jsonb; v_overall numeric;
  v_whole boolean; v_scope text; v_label text;
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round;
  if v_org is null or not app.is_org_member(v_org) then
    return jsonb_build_object('error', 'not_available');
  end if;
  v_k := app.k_threshold(v_org);

  select exists (
    select 1 from app.memberships m
    where m.user_id = auth.uid() and m.active and m.org_id = v_org
      and m.role in ('daglig_leder', 'verneombud')
  ) into v_whole;

  v_scope := case when v_whole then 'org' else 'group' end;

  if not v_whole then
    select gr.name into v_label
    from app.groups gr
    where gr.id in (select vg.group_id from app.visible_groups(v_org) vg)
    limit 1;
  end if;

  select count(*) into v_n from app.responses resp
  where resp.round_id = p_round
    and (v_whole or resp.group_id in (select vg.group_id from app.visible_groups(v_org) vg));

  if v_n < v_k then
    return jsonb_build_object('status', 'insufficient_data', 'n', v_n, 'threshold', v_k,
                              'scope', v_scope, 'scope_label', v_label);
  end if;

  select jsonb_agg(x order by (x->>'sort_order')::int) into v_factors
  from (
    select jsonb_build_object('key', f.key, 'law_ref', f.law_ref, 'sort_order', f.sort_order,
             'index', round(avg(app.to_index(ans.value))),
             'band', app.risk_band(round(avg(app.to_index(ans.value))))) as x
    from app.answers ans
    join app.responses resp on resp.id = ans.response_id
    join app.factors f on f.key = ans.factor_key
    where resp.round_id = p_round
      and (v_whole or resp.group_id in (select vg.group_id from app.visible_groups(v_org) vg))
    group by f.key, f.law_ref, f.sort_order
  ) s;

  select round(avg((e->>'index')::numeric)) into v_overall
  from jsonb_array_elements(coalesce(v_factors, '[]'::jsonb)) e;

  return jsonb_build_object('status','ok','n',v_n,'threshold',v_k,
    'index',v_overall,'band',app.risk_band(v_overall),
    'scope', v_scope, 'scope_label', v_label,
    'factors',coalesce(v_factors,'[]'::jsonb));
end $fn$;

-- ------------------------------------------------------------------ conversations
--
-- Two changes, both narrowing.
--
-- The role gate is the one `reply_to_thread` and `set_thread` already carry. A verneombud
-- keeps everything § 6-2 gives them — the same numbers, the same risk assessment, first
-- notice on every round — and loses a read of individual comments that the product never
-- let them answer. The design's matrix has said so all along.
--
-- The group scope means an avdelingsleder sees comments from their own department only.
-- The k gate is unchanged and still applied first: scoping decides which of the threads
-- that cleared k this caller may see, never whether a thread clears k.
--
-- `not_available` stays the single answer for every refusal — no membership, wrong role,
-- nothing above k. Distinguishing them would hand back the oracle the gate exists to
-- remove: "you are not allowed to see this one" is itself a fact about a comment.
create or replace function public.conversations(p_round uuid default null) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_org uuid;
  v_k   int;
  v_whole boolean;
  v_out jsonb;
begin
  select m.org_id into v_org
  from app.memberships m
  where m.user_id = auth.uid() and m.active
    and m.role in ('daglig_leder', 'avdelingsleder')
  limit 1;

  if v_org is null then
    return jsonb_build_object('error', 'not_available');
  end if;

  v_k := app.k_threshold(v_org);

  select exists (
    select 1 from app.memberships m
    where m.user_id = auth.uid() and m.active and m.org_id = v_org
      and m.role = 'daglig_leder'
  ) into v_whole;

  select coalesce(jsonb_agg(t order by t.opened_hour desc), '[]'::jsonb) into v_out
  from (
    select
      ct.id,
      ct.factor_key,
      ct.state,
      ct.flagged_varsel,
      ct.opened_hour,
      r.round_id,
      ms.kind  as round_kind,
      ms.year  as round_year,
      (select a.value from app.answers a
        where a.response_id = ct.response_id
          and a.factor_key = ct.factor_key and a.ordinal = ct.ordinal) as answer_value,
      rc.body as opening,
      (select coalesce(jsonb_agg(jsonb_build_object(
                 'author', tm.author, 'body', tm.body, 'sent_hour', tm.sent_hour)
               order by tm.sent_hour), '[]'::jsonb)
         from app.thread_messages tm where tm.thread_id = ct.id) as messages
    from app.comment_threads ct
    join app.responses r on r.id = ct.response_id
    join app.rounds rd on rd.id = r.round_id
    join app.measurements ms on ms.id = rd.measurement_id
    join app.response_comments rc
      on rc.response_id = ct.response_id
     and rc.factor_key = ct.factor_key
     and rc.ordinal = ct.ordinal
    where ct.org_id = v_org
      and (p_round is null or r.round_id = p_round)
      and (v_whole or r.group_id in (select vg.group_id from app.visible_groups(v_org) vg))
      and (
        select count(*) from app.responses r2
        where r2.round_id = r.round_id and r2.group_id is not distinct from r.group_id
      ) >= v_k
  ) t;

  return jsonb_build_object('threshold', v_k, 'threads', v_out);
end $fn$;
