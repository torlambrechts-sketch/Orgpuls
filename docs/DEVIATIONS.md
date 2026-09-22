# Deviations from the Orgpuls design bundle

Every place the built application departs from
`design-reference/orgpuls/Orgpuls_Offline_Source.html`, with the reason and the
constraint that forced it. A deviation is a decision that was logged; it is not
permission to depart again elsewhere.

---

## D-01 — The privacy threshold's minimum is 5, not 3

**Bundle:** `Orgpuls.dc.html:2488` declares the `threshold` prop as an integer with
`min: 3, max: 10, default: 5`, in the "Personvern" section. A user could therefore set
the published-result group size down to 3.

**Built:** `app.organizations.threshold` is `check (threshold between 5 and 10)`, and
`app.k_threshold()` floors whatever it finds at `app.k_min()`, which is a function
returning 5 and so cannot be altered by data
(`supabase/migrations/0001_foundation.sql`).

**Constraint that forced it:** CLAUDE.md security invariant 1 — *"k-anonymity, k=5,
database-enforced"* — and its stop-and-ask list, which names *"lowering
`app.k_threshold()`"* as something that may not be done without a decision. Where the
bundle and that contract disagree, the contract wins on security and the bundle wins on
visuals.

The product's own statutory report states the rule in the same terms, so 5 is also what
the design *says* even though the control would permit 3:

> "Resultater vises ikke for grupper med færre enn 5 svar. Administrasjon (3 svar) er
> derfor kun med i helheten, ikke som egen gruppe."

**Visible consequence:** the Personvern control offers 5–10 rather than 3–10. This is a
visible difference from the bundle on one control in one sub-tab. Raising the threshold
above 5 works exactly as designed.

**Proven by:** `INV-1`, six assertions — floor value, rejection at create, rejection at
update, acceptance of a raise, rejection above the ceiling, and floor-not-null for an
unknown org. All six passed on 2026-09-22.

---

## D-02 — Avatar images — RESOLVED 2026-09-22

**Was:** `Orgpuls_Offline_Source.html` declares nine avatar images as
`ext-resource-dependency` and they were not supplied, so they rendered as the bundle's
empty image slot — a blank circle beside "Tuva" in the header and a blank square in the
Tuva callout on Innsikt.

**Resolved:** the user supplied `Orgpuls.com.zip` — 13 avatars in `tuva/` and 47 faces in
`tuva/faces/`, 69 files. Both avatar slots now render (`av4.png`, as a CSS background
rather than an `<img>`). No longer a deviation.

**What this changed about the reference, which matters more than the avatars:**
`Orgpuls.dc.html` does not reference `tuva/*.png` at all — only
`Orgpuls_Offline_Source.html` does. The first twelve baselines were captured from the
former and therefore had empty avatar slots baked in. **All twelve baselines were
regenerated from `Orgpuls_Offline_Source.html`**, which is now the canonical reference
for the pixel gate.

Two further fixes were needed to get a genuinely clean render, both verified rather than
assumed:
- `.image-slots.state.json` 404'd. An empty `{}` was added. Proven not to change
  rendering: the page renders byte-identically with and without it (same md5).
- `/favicon.ico` 404'd, because the page declares no icon and Chromium requests it
  regardless. A 1×1 icon was added to the reference directory.

The reference now renders with zero failed requests, zero non-2xx responses and zero
console errors on all twelve screens — which is what the pixel gate's "no console
errors" clause requires of the baseline before it can require it of the app.

---

## D-03 — Authentication has no design

**Bundle:** contains no login, onboarding, or marketing surface. Twelve screens, all of
them behind an implied session, with a role switcher and an account avatar in the header.

**Built:** a minimal sign-in built strictly from the bundle's existing primitives — card
surface `#FFFDF6`, hairline border `#E8DFC9`, primary button `#F5C64A`, the focus ring
from bundle line 23 — inventing no new visual language, no new colour, and no new control
class.

**Constraint that forced it:** the application cannot be reached without authentication,
and CLAUDE.md forbids inventing features. Decided by the user on 2026-09-21 in preference
to Entra-only sign-in, waiting for an auth design, or a development stub.

**Consequence:** this is the one surface with no pixel baseline, so the pixel gate cannot
cover it. It is verified by the other six gates only.

---

## D-04 — `rls_enabled_no_policy` on `responses` and `answers` is intended

Not a deviation from the design, but a standing note, because it looks like a defect in
Supabase's own security advisor and will keep being reported:

> `Table app.answers has RLS enabled, but no policies exist`
> `Table app.responses has RLS enabled, but no policies exist`
> `Table app.extra_answers has RLS enabled, but no policies exist`
> `Table app.response_comments has RLS enabled, but no policies exist`

(Four tables as of 2026-09-22; `extra_answers` and `response_comments` arrived with
migrations 0010 and 0012 and are covered by the same rule.)

That is the invariant, not an oversight. Clients never read raw responses; every result
read goes through a SECURITY DEFINER aggregate that applies k. RLS is enabled with no
policy so the default is deny for every role, and the grants are revoked as well.

**Do not "fix" this finding by adding a select policy.** Doing so silently removes
k-anonymity from the entire product.

---

## D-05 — Målinger omits the Årshjulet card and the planned-pulse rows

**Design:** between the page header and the rounds list, Målinger carries an Årshjulet
card — a twelve-month ring with a dot per planned sending, a legend, and the per-round
notification cascade ("Verneombud, tillitsvalgte, daglig leder −14 d" and so on). The
rounds list then interleaves four planned pulses between the two grunnlinjer.

**Built:** neither. The screen renders the page header, the two real rounds, and the
Deltakelse card.

**Constraint that forced it:** both read a schedule — preset, base month, pause, and the
notification order — and no such table exists. In the bundle they are computed by
`sched()` from client state, not stored. Årshjulet is its own segment in
docs/IMPLEMENTATION_PLAN.md and its schema arrives with it.

**Why not render the shell with placeholder values:** a ring showing an invented cadence
and an invented notification order is indistinguishable in review from a real one, and
would survive into screenshots as though someone had decided it. CLAUDE.md's rule is that
a fake value is worse than a gap.

**Consequence for the pixel gate:** everything below the omission sits higher in the app
than in the baseline — 273px for the first rounds row, 559px for the rest. The gate grew
`--at` to diff a region against a displaced origin, printing the displacement rather than
hiding it. Tolerance, denominator and compared pixels are unchanged.

There is a second, subtler consequence, measured rather than assumed. A block 559px
higher sits on a different fractional y, so line boxes that fall between device pixels —
13.5px text at line-height 1.6 is 21.6px per line — round the other way. In the
Spørsmålssettet card this happens at exactly two internal boundaries: the heading-and-lead
block is 1px shorter than the design's, and the first extra-question row is 1px taller,
which cancels it. Everything between those two boundaries is displaced by 560 instead of
559.

This was checked exhaustively rather than argued: every horizontal colour transition down
three glyph-free columns of the card was enumerated for both images. The edge counts are
identical (26, 97 and 75), every differing edge is off by exactly one pixel, and the
card's total height is 815px in both. The structure is the same; only two line boxes round
differently. Diffed at their own offsets the three bands pass at 0.071%, 0.027% and 0.052%
of the screen.

Expect this to disappear when the Årshjulet card is built and the card returns to the
baseline's y. Until then, do not "fix" it by nudging a padding: that would make the card
wrong once the block above it exists.

---

## D-06 — Nav items are links, not buttons

**Design:** the header nav is five `<button onClick>` controls, because a prototype has
no router.

**Built:** `<Link>`, styled exactly as the bundle styles that button, with the global
anchor colour and hover underline overridden so the rendering is identical. Verified: the
header band diffs at **0 pixels** against both baselines.

This is the control substitution CLAUDE.md permits — the prototype's control cannot
express a real constraint. Changing the address is a link: middle-click, back, open in a
new tab and a screen reader's link list all depend on it.

A nav item whose screen does not exist yet carries no href and renders as the same
element with `aria-disabled`, rather than linking to a 404. It stays focusable, so the
tab order matches the finished nav, and it becomes a link when its route lands.

---

## D-07 — Fonts are the bundle's own files, not next/font

**Not a deviation from the design — the opposite.** Recorded because it reverses an
earlier conclusion in this repository.

The app loaded DM Sans and Playfair Display through `next/font/google`. That serves a
different build from the one the design bundle ships: 18,192 bytes for DM Sans latin
against the bundle's 62,724, with all four Playfair files differing too. Different files
mean different metrics and hinting, so every run of text differed from the baseline even
where the layout was exact.

This had been investigated once before and written up in `app/layout.tsx` as inherent
rasterisation that weight changes could not fix. The mechanism named there was right and
the conclusion was wrong: it was not inherent, it was the wrong file.

`app/fonts.css` is now the bundle's own stylesheet serving the bundle's own woff2 files
from `public/fonts`. Measured before and after, same regions, same tolerance:

| region | before | after |
| :-- | --: | --: |
| header band (Innsikt and Målinger) | 257 px | **0 px** |
| Målinger header + page header | 1 519 px | 199 px |
| rounds row 2026 | 1 626 px | 553 px |
| rounds row 2025 | 2 019 px | 900 px |
| Deltakelse card | 6 711 px — FAIL | 851 px — PASS |

**Do not replace this with next/font.** The gate diffs against a rendering made with
these exact files; anything that re-subsets or re-versions them brings the difference
back. Re-download from `design-reference/orgpuls/fonts/urls.txt` if they are ever lost.

---

## D-08 — The running puls carries a date that moves

**Design:** the Målinger rounds list prints a fixed date per round.

**Built:** the same, except for the open puls the fixture adds. A round is open precisely
because `now()` falls inside its window, so that window cannot be pinned the way the two
grunnlinjer are (D-07's sibling problem: a fixture anchored to the clock rots the
baseline overnight). Its window is anchored to the current day — opened two days ago,
closes in five — which keeps the design's "Dag 3 av 7" framing true on any day the
fixture is regenerated.

**Constraint that forced it:** `rpc.submit_response` refuses any round whose status is
not `apen`. Without an open round the product's only write path is unreachable except
through a hand-made row, which is the ad-hoc-data defect the fixture generator exists to
prevent.

**Consequence:** that one row in the rounds list is excluded from the pixel claims. Every
other row and block on the screen is pinned and diffed.

---

## D-09 — The respondent surface has no phone chrome, and its refusal screen is new

**Design:** `/s/[token]` has no screen of its own. The bundle shows the respondent flow
only inside a phone mock on the Målinger preview (lines 1880-1931): a black bezel at
36px radius, 326px wide, with a "09:41" status bar.

**Built:** everything inside the mock's screen, as the whole surface, at a 420px column.
The bezel, the radius and the clock are phone, not product. A real respondent opens this
on their own phone, which supplies its own chrome; reproducing a picture of a phone
inside a phone would be a drawing of the design rather than the thing it depicts.

**Also new:** the screen shown when a token is spent, expired, unknown, or belongs to a
closed round. The prototype has no such state — it cannot, having no tokens. It is built
from the bundle's own primitives (card surface `#FFFDF6`, hairline `#E8DFC9`, Playfair
heading, `#5F5849` lead), inventing no colour and no control class.

Omitting it was not an option. `rpc.respond_form` distinguishes those four cases because
the product has to be able to say "you have already answered" — without it people answer
twice, are refused by the database, and conclude the product is broken.

**Kept, not omitted:** the per-question comment. The design puts "Vil du si mer? Frivillig
og anonymt" under every scored question and nothing could store what it collects, so
migration 0012 added `app.response_comments` rather than rendering a textarea that
discards what someone writes. The two-way thread that lets a manager answer it arrives
with the Samtaler segment; the words are kept now so that segment has something to read.

**One promise the design makes that is now kept in code:** "Rekkefølgen er tilfeldig per
person, så ingen kan gjette hvem som svarte hva ut fra når svaret kom inn."
`rpc.respond_form` shuffles the questions seeded by the token — stable if the person
reloads, different between people. Verified: two invitations to the same round open on
different statements. A promise printed to a respondent that the code does not keep is a
worse defect than any layout one.

---

## D-10 — Resultat's header band omits the benchmark, "Anbefaler oss" and "Åpenhet"

**Design:** the dark band prints five figures beside the index — `61`, `−3`, "bransje 64",
"Anbefaler oss +22", "Svarprosent 82 %" and "Åpenhet Høy" (bundle lines 741-751).

**Built:** the index, the delta against the comparison round, and the response rate. The
other three are omitted.

**Constraint that forced each:**
- *bransje 64* — there is no benchmarks table. Same omission, same reason, as on Innsikt.
- *Anbefaler oss +22* — the recommendation question is answered into `app.extra_answers`,
  which has RLS enabled with no policy, no grant and **no reader RPC**. Every result read
  in this product goes through a SECURITY DEFINER aggregate that applies k; none exists
  for the extra questions yet, and writing one is a migration with its own k reasoning
  and its own tests, not a side effect of building a screen.
- *Åpenhet Høy* — a literal in the prototype. Nothing computes it and no column holds it.
  It is the clearest case in the screen of a value that looks like data and is not.

**What would lift it:** an RPC over `app.extra_answers` that returns the recommendation
score and the screening counts for the whole organisation only, never per group, with the
same not-available branch as `results_summary`.

---

## D-11 — "Gjør disse tre" omits the modelled lift, and its lead

**Design:** each of the three proposals carries "Løft helheten +6 / +4 / +3", and the
block's lead says the three are "Rangert etter hvor mye de kan løfte helheten hos dere —
ikke etter lavest tall" (bundle lines 3053-3059).

**Built:** the rank badge, the factor, and "Indeks 41 · 28 svar · aml. § 4-3 · § 2A".

**Constraint that forced it:** the lift is `["+6","+4","+3"]` in the bundle — a constant
list, not a model. Nothing in the schema predicts what an intervention would move, and a
number printed under "Løft helheten" is a prediction. The lead had to go with it: the
rows are ordered by index ascending, so a sentence promising the opposite ordering would
describe a method the screen does not use. That is the same defect as a fabricated
figure, in prose.

**Consequence for the pixel gate:** the three cards are shorter than the design's — the
first two lose a quote block as well (D-14) — so everything below "Gjør disse tre" sits
**182px higher** in the app than in the baseline. The gate's `--at` prints the
displacement rather than hiding it.

---

## D-12 — The per-factor annotation is omitted

**Design:** four of the eleven rows carry a note beside the delta — "Verksted lavest: 28",
"Prosjekt lavest: 31", "Drift jobber mest alene", "Størst fall blant nyansatte"
(`FACTORS[].worst`, bundle line 2522 onward).

**Built:** nothing in that position.

**Constraint that forced it:** the four are not one thing. Two are derivable from
`results_by_group` (the lowest group and its index); one describes how a group works, and
one compares seniority, which the schema does not hold at all — `app.responses` carries a
group and an hour and nothing else, by invariant 2. There is no rule in the data for which
rows get a note, so deriving the two that can be derived would put annotations on rows the
design leaves bare and change the screen rather than complete it.

**Measured:** this is the whole of the residual diff in the table's middle column —
2 093 pixels at x 593..737, across the four rows that carry a note in the baseline.

---

## D-13 — An expanded factor row shows its statements without figures

**Design:** opening a row reveals the factor's description and its three statements, each
with a five-segment answer distribution and its own index (bundle lines 831-845), plus the
legend that explains the segments.

**Built:** the description and the three statements. No distribution, no per-statement
index, no legend.

**Constraint that forced it:** `results_summary` aggregates to the factor. Nothing exposes
an index per statement, and nothing exposes a distribution at all — the distribution in
the bundle is `dist(idx)`, a bell curve *computed from the index*, not counted from
answers. Rendering it would be showing people a shape that no one answered. Counting it
for real means reading `app.answers`, which no client role may do; it needs an RPC that
returns counts per value per statement and refuses below k, with its own tests.

The statements themselves are real: `app.statements`, numbered from the ordinals the
database holds.

---

## D-14 — "Hva de skrev", the Samtaler column and the screening strip are omitted

**Design:** below the grid, a two-column block — automatically grouped free-text themes on
the left, three comment threads with a reply box on the right — and then a strip reading
"Krenkende atferd: 3 av 28 svarte ja" (bundle lines 878-936).

**Built:** none of the three. The panel ends with Team × faktor.

**Constraint that forced it:** all three read what respondents wrote or answered outside
the index. `app.response_comments` and `app.extra_answers` are on the invariant-1 list —
RLS enabled, no policy, no grant — and have no reader RPC. The reply box would additionally
need somewhere to put a reply, and the two-way thread arrives with the Samtaler segment
(D-09). Rendering an input that discards what someone types is the defect D-09 refused
once already.

Note also that the bundle's own theme list is empty on this screen: `resultData()` returns
no `themes`, so the baseline shows the heading and the count over blank space. The count
line ("14 av 28 skrev noe") is real-looking and unbacked, so it goes with the rest.

---

## D-15 — A department has no overall index

**Design:** selecting a department replaces the organisation's 61 with that department's
own index and a "±N mot huset" delta (bundle lines 2978-2983).

**Built:** the band keeps the department's name, response count, date and response rate,
and prints no headline number. The factor table, the bands and the grid are all the
department's.

**Constraint that forced it:** `results_summary` computes the overall index in SQL, as
`round(avg(factor index))` over the organisation. `results_by_group` returns factor rows
per group and no headline figure. Averaging those rows in TypeScript would make the client
the author of a number the statutory report prints — exactly what `lib/results/read.ts`
refuses in its opening comment, and the kind of divergence that is invisible until a
labour inspector compares two documents.

**What would lift it:** one more key in `results_by_group`'s per-group object, computed
the same way `results_summary` computes the whole, in the same migration as its test.

---

## D-16 — The group grid's columns are the round's factors, not a hand-picked five

**Design:** Team × faktor is a five-column grid — Ytringsklima, Arbeidsmengde, Støtte fra
leder, Rolleklarhet, Anerkjennelse og mening (`HEAT_KEYS`, bundle line 2958).

**Built:** one column per factor the round carries, in the instrument's own order, inside
the design's own horizontal scroller. For a puls that measures two factors it is two
columns; for a grunnlinje it is eleven.

**Constraint that forced it:** the five are a list in the prototype with no rule behind
them — not the lowest five, not the ones in the pulse, not a property of any row. Hard-
coding them would put a factor list in a component, which the data-not-code rule exists to
prevent, and would hide six of the eleven factors from the per-group picture on a screen
whose legal basis (§ 4-1 first paragraph) is that the environment is assessed "enkeltvis og
samlet".

**Verified against the design's own five:** rendered with the bundle's five columns and its
own values, the block diffs at **8 pixels — 0.0002% of the screen**. The cell geometry,
palette, radius and masked treatment are the design's; only the number of columns follows
the round.

**What it will actually print** is not the design's spread, and that is the fixture rather
than the screen: `results_by_group` returns Drift 38 / Prosjekt 42 / Verksted 47 on
ytringsklima where the bundle shows 49 / 46 / 28, because the generator splits each
factor's two scale points across responses in id order and responses are inserted group by
group. Administrasjon comes back `insufficient_data` at 3 of 5 and renders as dashes, which
is the design's own treatment. Measured 2026-09-22 — see DECISION_LOG X-008.

---

## D-17 — A pulse carries no sequence number

**Design:** the Måling filter offers "Grunnlinje 2026 · Puls 2 · 2025 · Grunnlinje 2025 ·
Puls 1 · 2026" (bundle line 2949).

**Built:** the chips are labelled from the row — `{kind} {year}`, the same composition the
Målinger list uses — so a pulse reads "Puls 2026" and not "Puls 1 · 2026".

**Constraint that forced it:** `app.measurements` holds kind, year and a label. Nothing
numbers the pulses within a year, and counting them in the client would invent an ordering
the database does not keep — it would also renumber every historical pulse the moment one
was inserted out of order.

**Consequence for the pixel gate:** the chips row is the one band of the filter card that
cannot match the baseline, because the design's four rounds and their labels are the
prototype's, not the fixture's.
