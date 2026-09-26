# BLOCKED — engagement P0.3: the current product fails I4

**Step:** P0.3, the invariants on the current product.
**Gate:** G3, I4: "No endpoint exposes per-group or per-person participation. Participation is
organisation-level only, as before."
**Rule applied:** § P0.3, "if the current product fails an invariant, this is a hard stop:
report it". It is not worked around, and the invariant is not weakened to pass.

## What was found

Participation is per group today, by design and on purpose. It is not organisation-level only.

1. `public.participation(p_round)` (lib/participation/read.ts, shown in Målinger › Kommende)
   returns, for every group, its headcount, how many have answered and a percentage. This
   happens **while the round is open**, and for **groups under k too**: `thin` marks them,
   but their counts are returned and printed. Any member of the organisation can call it.
   On the Lumio tenant, Økonomi (3 people) shows "1 av 3". A manager who reloads can see
   the count move, and in a group of one or two that is close to per-person participation.
2. `public.results_by_group(p_round)` returns `n` for every group, under-k groups included. The
   heat map prints it: "Økonomi · 3 svar" on hovedmåling 1, which says that all three in
   Økonomi answered.
3. Måleoppsett prints "N svarte sist" per group from the previous round.

The code records this as a deliberate choice (lib/participation/read.ts): "participation …
is deliberately not k-anonymised. The design shows Administrasjon at 5 employees and 3
answers …". The design bundle, which CLAUDE.md makes authoritative on visuals, prints
these counts.

What does hold: no endpoint returns **who** answered. No names, no per-person rows, and
`responded_at` is never read outside the definer functions (see I7 below).

## What was tried

Nothing was changed. This is a product decision, not a defect a gate can fix: the engagement
document's I4 and the design contradict each other, and CLAUDE.md says the design wins on
visuals and CLAUDE.md wins on security. CLAUDE.md does not name per-group participation
either way.

## The other invariants, as far as they were checked before stopping

| Id | Status on the current product | Evidence |
| --- | --- | --- |
| I1 | holds | `results_by_group` on Lumio: Økonomi `insufficient_data`, Salg `protected` (complementary); release_invariants.sql and respondent_invariants.sql pass (43 suites green) |
| I2 | holds | responses, answers, extra_answers, response_comments and module answer tables carry no token, invitation, employee or user column (0001, 0067, module_invariants #1–2) |
| I3 | not yet run | network and server-log capture on /s/{token} was the next step |
| I4 | **fails** | above |
| I5 | holds, as decided 2026-09-26 | invitations store only `token_hash`; no answer row can be tied to a token |
| I6 | holds | `app.responses` columns: id, org_id, round_id, group_id, submitted_hour — no locale |
| I7 | holds | reminders are system-sent (dispatcher); `responded_at` is read only inside definer functions that return counts |

## Decision needed (one of)

- **A. Amend I4** to "no per-person participation": per-group counts stay as the design shows
  them, and new engagement features add no new per-group participation.
- **B. Tighten the product:** show no participation counts for groups under k, neither live
  nor after close, and no `n` for under-k groups in results. The design's "Administrasjon 5 /
  3 svar" case has a headcount of 5, so it stays. This is a change to readers the pixel gate
  covers.
- **C. Enforce I4 as written:** organisation-level participation only. This removes per-group
  progress from Målinger, the "N svar" labels on the heat map and "N svarte sist" in
  Måleoppsett, which is a visible deviation from the design.
