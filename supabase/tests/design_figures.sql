-- design_figures.sql — the figures the design prints, read back through the product's RPCs.
--
-- The fixture generator (scripts/seed/design-fixture.mjs) builds its rows backwards from
-- these numbers. If a migration or the generator drifts, this fails here rather than in a
-- screenshot three screens later. It reads as the fixture's own daglig leder, because
-- every result RPC is gated on membership and would otherwise return not_available — and
-- a refusal is checked for explicitly, so the job cannot pass having compared nothing.
--
-- Not a *_invariants suite: it asserts a scenario, not a rule. CI runs it after the
-- fixture is seeded and the local account exists.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/design_figures.sql

do $$
declare
  v_uid  uuid;
  v_bad  text[] := '{}';
  v_seen int := 0;
  r      record;
  v_sum  jsonb; v_part jsonb; v_rec jsonb; v_grp jsonb;
  v_key  text;
  v_want jsonb;
  -- label -> [index, answered, headcount, pct, recommendation or null]
  v_rounds jsonb := '{
    "Grunnlinje 2023": [60, 19, 27, 70, 8],
    "Grunnlinje 2024": [63, 22, 29, 76, 19],
    "Puls mai 2025":   [47, 29, 32, 91, null],
    "Puls august 2025":[50, 27, 32, 84, null],
    "Grunnlinje 2025": [64, 24, 31, 77, 27],
    "Puls mars 2026":  [53, 26, 33, 79, null],
    "Grunnlinje 2026": [61, 28, 34, 82, 22]
  }';
  -- label -> factor -> index, the design's nine-factor history (RES2.YRS, RES2.PULS)
  v_factors jsonb := '{
    "Grunnlinje 2023": {"ytring":50,"mengde":55,"motstrid":56,"emosjon":57,"leder":63,"medvirk":57,"rolle":68,"kollega":71,"mening":67},
    "Grunnlinje 2024": {"ytring":53,"mengde":56,"motstrid":59,"emosjon":58,"leder":67,"medvirk":61,"rolle":72,"kollega":74,"mening":71},
    "Puls mai 2025":   {"ytring":44,"mengde":50},
    "Puls august 2025":{"ytring":47,"mengde":52},
    "Grunnlinje 2025": {"ytring":48,"mengde":53,"motstrid":58,"kontakt":57,"emosjon":59,"leder":69,"medvirk":63,"integritet":70,"rolle":73,"kollega":75,"mening":74},
    "Puls mars 2026":  {"ytring":45,"mengde":49,"leder":66},
    "Grunnlinje 2026": {"ytring":41,"mengde":44,"motstrid":52,"kontakt":57,"emosjon":58,"leder":64,"medvirk":66,"integritet":69,"rolle":71,"kollega":76,"mening":78}
  }';
  -- label -> group -> factor -> index (the Varmekart's TEAMS and each puls's teams),
  -- or a status string where the release rule withholds the group
  v_teams jsonb := '{
    "Grunnlinje 2026": {
      "Prosjekt": {"ytring":46,"mengde":31,"motstrid":44,"emosjon":57,"leder":58,"medvirk":64,"rolle":59,"kollega":74,"mening":75},
      "Verksted": {"ytring":28,"mengde":47,"motstrid":53,"emosjon":55,"leder":55,"medvirk":66,"rolle":72,"kollega":77,"mening":77},
      "Drift": "protected",
      "Administrasjon": "insufficient_data"
    },
    "Puls mai 2025":   {"Drift":{"ytring":50,"mengde":55},"Prosjekt":{"ytring":45,"mengde":40},"Verksted":{"ytring":36,"mengde":52}},
    "Puls august 2025":{"Drift":{"ytring":52,"mengde":56},"Prosjekt":{"ytring":47,"mengde":41},"Verksted":{"ytring":40,"mengde":53}},
    "Puls mars 2026":  {"Drift":{"ytring":50,"mengde":54,"leder":70},"Prosjekt":{"ytring":44,"mengde":38,"leder":63},"Verksted":{"ytring":33,"mengde":50,"leder":64}}
  }';
begin
  select m.user_id into v_uid from app.memberships m
  where m.org_id = '00000000-0000-4000-8000-000000000001' and m.active and m.role = 'daglig_leder'
  order by m.id limit 1;
  if v_uid is null then
    raise exception 'design figures: the fixture has no daglig leder to read as';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  for r in
    select rd.id, ms.label from app.rounds rd join app.measurements ms on ms.id = rd.measurement_id
    where rd.org_id = '00000000-0000-4000-8000-000000000001' and rd.status = 'lukket'
  loop
    continue when not v_rounds ? r.label;
    v_seen := v_seen + 1;
    v_want := v_rounds->r.label;
    v_sum  := public.results_summary(r.id);
    v_part := public.participation(r.id);
    v_rec  := public.results_recommendation(r.id);

    if v_sum->>'index' is null or v_part->>'pct' is null then
      raise exception 'design figures: % returned no figures: summary=% participation=%', r.label, v_sum, v_part;
    end if;

    if (v_sum->>'index')::int <> (v_want->>0)::int then
      v_bad := v_bad || format('%s index %s, expected %s', r.label, v_sum->>'index', v_want->>0);
    end if;
    if (v_part->>'answered')::int <> (v_want->>1)::int or (v_part->>'headcount')::int <> (v_want->>2)::int
       or (v_part->>'pct')::int <> (v_want->>3)::int then
      v_bad := v_bad || format('%s participation %s av %s · %s %%, expected %s av %s · %s %%', r.label,
        v_part->>'answered', v_part->>'headcount', v_part->>'pct', v_want->>1, v_want->>2, v_want->>3);
    end if;
    if jsonb_typeof(v_want->4) = 'number' and coalesce(v_rec->>'score', '') <> v_want->>4 then
      v_bad := v_bad || format('%s anbefaler oss %s, expected %s', r.label, coalesce(v_rec->>'score', v_rec::text), v_want->>4);
    end if;

    for v_key in select jsonb_object_keys(v_factors->r.label) loop
      if coalesce((select f->>'index' from jsonb_array_elements(v_sum->'factors') f where f->>'key' = v_key), '?')
         <> v_factors->r.label->>v_key then
        v_bad := v_bad || format('%s %s = %s, expected %s', r.label, v_key,
          coalesce((select f->>'index' from jsonb_array_elements(v_sum->'factors') f where f->>'key' = v_key), 'absent'),
          v_factors->r.label->>v_key);
      end if;
    end loop;

    if v_teams ? r.label then
      v_grp := public.results_by_group(r.id);
      for v_key in select jsonb_object_keys(v_teams->r.label) loop
        declare
          v_row  jsonb := (select g from jsonb_array_elements(v_grp->'groups') g where g->>'group_name' = v_key);
          v_team jsonb := v_teams->r.label->v_key;
          v_f    text;
        begin
          if jsonb_typeof(v_team) = 'string' then
            if coalesce(v_row->>'status', 'absent') <> v_team #>> '{}' then
              v_bad := v_bad || format('%s %s status %s, expected %s', r.label, v_key, coalesce(v_row->>'status', 'absent'), v_team #>> '{}');
            end if;
          else
            for v_f in select jsonb_object_keys(v_team) loop
              if coalesce((select f->>'index' from jsonb_array_elements(coalesce(v_row->'factors', '[]'::jsonb)) f
                           where f->>'key' = v_f), '?') <> v_team->>v_f then
                v_bad := v_bad || format('%s %s %s = %s, expected %s', r.label, v_key, v_f,
                  coalesce((select f->>'index' from jsonb_array_elements(coalesce(v_row->'factors', '[]'::jsonb)) f
                            where f->>'key' = v_f), coalesce(v_row->>'status', 'absent')), v_team->>v_f);
              end if;
            end loop;
          end if;
        end;
      end loop;
    end if;
  end loop;

  if v_seen <> (select count(*) from jsonb_object_keys(v_rounds)) then
    raise exception 'design figures: found % of the % rounds the design prints', v_seen,
      (select count(*) from jsonb_object_keys(v_rounds));
  end if;
  if cardinality(v_bad) > 0 then
    raise exception E'design figures drifted:\n  %', array_to_string(v_bad, E'\n  ');
  end if;
  raise notice 'design figures: % rounds, every printed figure as the design states it', v_seen;
end $$;
