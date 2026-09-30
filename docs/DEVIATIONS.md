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

**Superseded on 2026-09-22.** The user supplied `design-reference/orgpuls-start/`, which
contains a splash page, a sign-up flow and a sign-in panel. The invented screen is gone and
`/logg-inn` is now built from that bundle. What survives of this entry is the last
paragraph: the start bundle ships no captured baselines either, so the three marketing
screens are still outside the pixel gate and still verified by the other gates and by eye.
See D-37 and D-38 for what the new bundle asks for that this product does not do.

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

**Superseded.** The planned-pulse rows are rendered since D-46, and the card since D-53.

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

**Superseded.** The Samtaler column is built (D-54), the screening strip (D-55), and
"Hva de skrev" (D-56).

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

---

## D-18 — The report prints three of its eight sections

**Design:** the statutory document has eight numbered sections and a signature block —
1 Metode og medvirkning, 2 Datagrunnlag, 3 Kartlegging, 4 Risikovurdering, 5 Tiltak,
6 Effektvurdering, 7 Krenkende atferd, 8 Informasjon og opplæring (bundle lines 336-460).

**Built:** the front matter, section 1 without its fourth block, sections 2, 3, **4** and 5.
Sections 6 to 8 and the signature block are not rendered.

*Section 4 was added once 0016 gave it something to print (X-016). Its row below is kept
for the record of why it could not be printed before — the constraint was real, and the
answer was to store the judgement rather than to derive it.*

**Constraint that forced each, named rather than summarised:**

| section | what it needs | why it is not there |
| :-- | :-- | :-- |
| 1 · Medvirkning | notification dates and an AMU agenda | nothing stores when a verneombud was warned; the årshjul's schema arrives with that segment |
| 4 · Risikovurdering | ~~a stored probability, consequence and conclusion per factor~~ | **resolved.** The bundle computed them from the index with a hand-written sentence per factor key; migration 0016 stores them instead, and the section prints from the row. Where a kartlegging has not been assessed the section says so rather than deriving one — a state the design has no treatment for, because a prototype is always assessed |
| 5 · Tiltak | a measures table — title, factor, owner, due date, status | no such table exists |
| 6 · Effektvurdering | a measure, its effect and the round that measured it | the same table, plus a link from a measure to the round after it |
| 7 · Krenkende atferd | counts from `app.extra_answers` | that table has RLS with no policy, no grant and no reader RPC — see D-10 |
| 8 · Informasjon og opplæring | records of briefings and training | nothing holds them |
| Signatur | the people who sign | see D-19 |

**Consequence for the pixel gate:** the document is 1 747px of sheet against the design's
3 269px, and every block below an omission is displaced. Measured at its own offset each
block matches — the numbers are in DECISION_LOG X-010.

This is the one screen where the omissions are the product rather than a gap in it: a
document that prints "Samlet vurdering: Krever tiltak" under a heading nobody filled in
is a document that lies to an inspector about who decided what.

---

## D-19 — The report names no responsible person

**Design:** the front matter carries "Ansvarlig — Tuva Berg, daglig leder" and
"Verneombud — Kari Nordbø", and the document ends with three signature lines.

**Built:** neither row, and no signature block.

**Constraint that forced it:** `app.profiles` carries one SELECT policy,
`profile_self_read`, whose predicate is `id = auth.uid()`. A signed-in user can read
their own name and nobody else's. `app.memberships` is readable per organisation, so the
application can see *that* somebody holds `daglig_leder` or `verneombud` — it cannot see
who. Rendering the reader's own name against "Ansvarlig" would print the wrong person
the moment a verneombud opened the report, which on a statutory document is worse than
an empty field.

**Not fixed here on purpose:** widening that policy is a change to who may read personal
data, which CLAUDE.md puts on the stop-and-ask list and which belongs to the Oppsett
segment, where the employee roster is built and the question gets decided once.

---

## D-20 — The printed document differs from the component's in two ways

`<doc-page>` is recreated rather than shipped (see components/rapport/Sheet.tsx), and two
of its print behaviours are deliberately not reproduced:

1. **The footer prints once, at the end, not on every page.** The component repeats it
   by wrapping the document in a table and using `thead`/`tfoot` as running
   header/footer bands. That machinery exists to satisfy a design this document does not
   have yet — a page number, a document id — and it constrains the whole flow to a table
   layout. When the report needs a per-page footer it can come back with the thing that
   needs it.
2. **`@page` carries a vertical margin and no paper size.** That is the component's own
   rule, kept: a flowing document paginates onto whatever paper the reader has, and
   pinning A4 would crop letter and the other way round.

Also transcribed rather than inherited: `:where(h1…h6){text-wrap:balance}` and
`:where(p,li,blockquote,figcaption){text-wrap:pretty}`, which the component injects at
document level and which the baseline was therefore captured with. Without the first
rule the report's title breaks one word later than the design's and every line in the
sheet below it moves.

---

## D-21 — Two figures on the report move with the clock

**Design:** the report prints "Periode — 1. januar – 21. september 2026" and
"Utarbeidet — 21. september 2026", the day the baseline was captured.

**Built:** the same, computed from the day the document is rendered, so both read
22 September on a page rendered on 22 September.

**Constraint that forced it:** a document dated by a constant is a document that lies
about when it was prepared. This is D-08's rule on a surface where it matters more: the
date is part of what makes the document evidence.

**Consequence:** those two strings are excluded from the pixel claims. Everything else on
the page is pinned and diffed.

---

## D-22 — Tiltak writes, minus a confirmation and a default the prototype invents

*Superseded the entry that recorded the write path as unbuilt. It is built: migration
0015, `app/(app)/tiltak/actions.ts`, `components/tiltak/MeasureCard.tsx` and
`components/tiltak/NewMeasureButton.tsx`. Three smaller things still differ.*

**1. A refused write says so; the design has nowhere to say it.**

The prototype cannot be refused — it patches its own state, so every control succeeds.
A real one can: a verneombud may read every measure and write none, and the closing rule
in 0015 refuses an UPDATE that would close a measure before its effect is measured. Both
are correct outcomes that a screen must report, so a one-line message appears under the
card actions (and under "＋ Nytt tiltak") when a write comes back refused. It is styled
as the screen's other muted text at 12.5px in `#A33A16`, and it is absent until there is
something to say, so the baseline's card is unchanged — the region still diffs at 39
pixels.

**2. No confirmation before "Slett tiltaket".**

The design deletes on the first click and so does this. A measure is a decision the
organisation recorded and § 3-1 documentation of it; losing one to a misclick is a real
loss, and a confirmation is the obvious guard. It is not built because the design
specifies no dialog anywhere in the bundle, and inventing one would be inventing a
component — CLAUDE.md's rule against inventing features outranks my opinion about this
control. Worth raising with the user rather than deciding alone.

**3. "Hvem berøres" starts empty, where the prototype starts on Verksted.**

The bundle's panel defaults the audience to `["Verksted"]` for every measure
(`t.groups || ["Verksted"]`), which is a prototype's placeholder, not a fact: it would
assert that all seven of the design's measures affect the workshop. The fixture instead
records the audience the design's own goal text names — Verksted for the two that say so,
Prosjekt for the one that says so — and the other four carry none, which is how the
schema says "the whole undertaking". A measure with no audience renders with no chip
selected rather than with a chip the data does not support.

**Also not built: the date field's format.** `<input type="date">` is the bundle's own
control, and what it prints — `21.09.2026` or `09/21/2026` — is the browser's locale,
not the page's. Headless Chromium renders it US-style in the screenshots above. That is
UA behaviour identical to the prototype's, so it is recorded rather than worked around.

---

## D-23 — Two chips the fixture cannot produce

**Design:** the Måling row offers "Puls 2 · 2025", and the Tildelt row offers "Tildelt meg
(Anne Rygg)".

**Built:** neither.

- **"Puls 2 · 2025"** is a round the fixture does not seed. It holds two grunnlinjer and
  one open puls, and the design's seventh measure — which belongs to that pulse — is
  attached to Grunnlinje 2025 so it hangs off a measurement that exists rather than a
  dangling id. The chip list is built from the rounds that actually raised a measure, so
  it has three entries where the design has four.
- **"Tildelt meg"** needs to know which employee the signed-in user is, and nothing joins
  them: `app.profiles` carries a name and a language, `app.memberships` a role, and
  neither carries an employee id. Matching on name would be a guess that breaks on the
  first namesake. It is the same missing link as D-19, in a second place.

**Consequence for the pixel gate:** the two filter rows are shorter than the design's, so
they are the whole of the residual in that band — 1 524 pixels, 0.065 % of the screen,
inside budget but visibly the design's rows minus two chips.

---

## D-24 — A factor has a compact name as well as its own

**Not a deviation — a note on where a string lives**, because it looks like duplication.

The design names one factor two ways: "Arbeidsmengde og tidspress" in the instrument, the
result table and section 3 of the report, and "Arbeidsmengde" on a Tiltak card's chip and
in section 5's Faktor column. The short form is not a different factor; it is the same
factor where the column is 150px wide.

So `factor.<key>.short` joins `factor.<key>.label` in the catalogue, for all eleven. Ten
of them are the label repeated, which is the point: the compact name is a property of the
factor, so a renderer asks for it by name instead of truncating a string it does not
understand. With it, section 5 of the report diffs at **0 pixels** and the Tiltak cards at
39.

---

## D-25 — Innsikt renders what the schema holds; five of its blocks it cannot

**Design:** bundle lines 152-268, baseline `01-innsikt-home.png`. A header block, an index
card carrying the Sløyfen, an årshjul card carrying a five-point year rail and a note from
the assistant, and a three-item "Venter på deg".

**Built:** all four blocks. Migration 0016 made three things renderable that were not
before — the Sløyfen's "Risikovurdert", the "Dokumentert" chip, and the year rail's
"Risikovurdering · 2 av 2 ferdig" — because all three are now a stored assessment rather
than a band derived from an index. What still differs, with the constraint named:

**1. "Bransjesnitt anlegg: 64" is not rendered.** There is no benchmarks table. An
invented industry average printed beside a real index is the fabrication rule's own
example. Its absence displaces the delta line by the height of one 12.5px row inside the
index card, which is the whole of that region's 935-pixel diff.

**2. (Superseded by D-59: the rail now has five points, each from a row.) The year rail has three points where the design has five.** February's "Forankring —
AMU og verneombud" and January's "Effekt målt — virket tiltakene?" are årshjul entries and
nothing stores a schedule. The three that are rendered are real: the kartlegging that
closed and its response rate, the assessment and how much of it is done, and the round now
open with the number of questions it asks. Three real points on a timeline is not a claim
that the year holds only three; five points with two invented would be a claim that two
things are scheduled which are not. The rail's geometry therefore differs from the
baseline's and the region is not compared — a three-column grid against a five-column one
produces a number that means nothing.

**3. The Tuva note is omitted.** It is written by an assistant that does not exist. Its
absence is why the årshjul card is shorter than the design's, which displaces "Venter på
deg" by 126 pixels — measured at that offset, its heading and scope line diff at **0**.

**4. (Resolved: it links to Årshjulet since that screen exists.) "Arbeidsmiljøåret — sett opp automatikk" is not a link.** The design makes it a
button that opens Årshjulet; that screen is unbuilt, and a link to a route that does not
exist is worse than no link. The label is rendered exactly as the design styles it and
becomes a link when the screen arrives.

**5. "Venter på deg" cannot be "på deg".** The design's list is addressed to the reader —
"Du er ansvarlig", "Verneombudets saker". Nothing joins a signed-in user to an employee
row: a measure's owner is an `app.employees` id and the viewer is an `auth.users` id, and
no column relates them. So the rows name their owner instead ("Ansvarlig Anne Rygg"), and
the design's second row — three anonymous comments awaiting a reply — is absent because
`app.response_comments` has no reader (D-10, D-14). The rows that are there are real: every
measure past its deadline, and the round now open. Frame, tone bar and action of each row
diff at **0**; the text is the record rather than the design's caption.

**Also:** the measure's title on this screen is the title it carries in the database —
"Fast svar på avviksmeldinger innen fem dager", which is what the Tiltak baseline shows —
where this baseline writes a shorter "Fast avvikssvar innen fem dager — Verksted". The
prototype holds two literals for one measure; only one can be the row's title, and the
screen where the measure lives is the one that decides it.

---

## D-26 — The lead prints a numeral where the design writes a number word

**Superseded.** The premise was wrong. ICU's exact-value selectors spell a real count:
`=2 {To tiltak løper.}` through `=12 {Tolv …}`, the way `one {Ett tiltak løper.}` already
did. The count is still read from the database, the sentence is the design's, and the
lead region diffs at **0 pixels**.

**Design:** "Grunnlinjen er tatt og risikovurdert. To tiltak løper. Neste puls måler om de
virket."

**Built:** the same sentence with the count read from the database — "2 tiltak løper" —
and with the first clause selecting on whether the round actually carries a risk
assessment, so it cannot claim the kartlegging was assessed when no row says so.

**Constraint that forced it:** the design's sentence is a literal. Printed as a literal it
would say "To tiltak løper" however many run, which is a fabricated count in the first
paragraph of the landing screen. ICU can pluralise a number and no formatter spells one as
a Norwegian word, so the numeral is what a real count can render. It costs 1 191 pixels in
the lead region — the line wraps one word earlier — and the headline above it diffs at
**16 pixels** across both lines.

**Worth revisiting** if the user would rather have the design's wording: a spelled-number
table for 0-12 per locale would restore it, at the cost of a message file that has to
grow when an organisation runs thirteen measures.

---

## D-27 — Måleoppsett: three blocks that wait on a schedule, and one number nothing measures

**Partly superseded.** Blocks 2 and 3 are built from the year wheel (D-60). Block 1 (the
answering time) and block 4 (the pulse stopping rule) remain out.

**Design:** bundle lines 1425-1710, baseline `11-plan-maleoppsett.png`. Six numbered
sections and a sticky summary panel.

**Built:** all six sections, reading and writing through migration 0017. Four things
differ:

**1. "Tid — ca. 5 minutter å svare" is not rendered.** Nothing measures how long a
respondent takes. Any seconds-per-question constant that reproduces the design's figure
would be a number chosen to match a screenshot, which is the fabrication rule's own case.
Its absence is the whole of the summary panel's 10 041-pixel diff, together with:

**2. "Neste: september 2027" is not rendered, and neither is "Planlegg grunnlinjen".**
Both need the same missing thing — a schedule. When the next grunnlinje falls, and
therefore what the CTA would create, is an årshjul entry; nothing stores one. The CTA is
not rendered disabled either, because a button that cannot ever be pressed on this screen
is not the design's state, it is a different one. Both arrive with Årshjulet.

**3. Section 4's cadence is one chip, not a set.** `app.measurements` is keyed
(org, kind, year), so a grunnlinje is one per year by construction and "Årlig" is a fact
about the schema rather than a choice. The other cadences the design offers describe the
pulse rhythm, which is the same årshjul table.

**4. "Når skal pulsen stoppe" is absent.** It only appears for a pulse (`showStops`), and
the stopping rule — after N rounds, when the factor recovers, never — has no column. The
baseline shows a grunnlinje, so this does not appear in it either.

**Pixel evidence.** Seven of the eight left-column regions diff at **0 pixels**: the back
action, title and lead; section 1's three kind cards; section 2's factor chips and note;
section 2's comment regime; section 3's departments and the k warning; section 4's
cadence, reminder and closing chips; and section 5 in full. Section 6 diffs at 1 987 and
passes. The summary panel fails at 10 041 — 0.23 % of the screen — for the omissions
above; its box is identical (x 886..1280, width 395 in both) and the shortfall in height
is exactly one 13px row plus one 12.5px line.

**Two defects the gate found, both from reusing one component for two boxes.** The bundle
gives the kind cards `14px 15px` at radius 13 and the comment cards `12px 14px` at radius
12, with notes at 12px and 12.5px respectively; one component with one padding made card 1
four pixels short and displaced every card below it. And the "＋ Legg til spørsmål" button
is h38 / pad 16 / radius 11 at **13px**, which is not a size in the Button scale — forcing
`md` through it left the type at 14px and pushed every suggestion chip out of place.
Transcribed directly, section 5 went to 0.

---

## D-28 — Samtaler withholds more than the design does, and says so on the screen

**Design:** bundle lines 941-1025, baseline `03-samtaler-conv.png`. Anonymous two-way
conversation over the comments a measurement collected.

**Built:** the screen, the k-gated reader, the reply path and the capability that carries
a reply back to its author (migration 0018, X-018). Six things differ.

**1. The build is STRICTER than the design about the threshold, and the rule text was
rewritten to match.** The design's second spillereglene reads *"Kommentarer under terskel
vises likevel — de er enkeltytringer, ikke gruppestatistikk, og behandles som det."* That
is a coherent position: a comment is one person's words, not a group statistic, so the
k-threshold that protects group statistics arguably does not apply to it.

The build takes the opposite position, on the user's explicit instruction: a comment from
a group that did not clear `app.k_threshold()` is not returned at all. A comment from a
department of three narrows to one of three whatever it is called, and "handled as an
individual statement" is a promise about conduct rather than something the schema
enforces.

So the screen's rule 2 says what this product actually does — *"vises ikke i det hele
tatt"* — rather than the design's wording. **Printing the design's copy over the stricter
behaviour would have been a false statement about the product on the screen whose whole
subject is what the product promises.** This is the one place in the build where the
bundle loses on copy, and it loses because the copy would otherwise be untrue.

**2. Rule 3 is shortened.** The design continues *"Da anonymiseres detaljer som kan peke
på en person"*, describing what happens when a comment is shared with the verneombud.
Sharing is not built (below), so that sentence would describe behaviour that does not
exist.

**3. "Lag tiltak" and "Del med verneombud" render disabled.** Creating a measure from a
comment means carrying the comment's text into `app.measures`, which is respondent free
text leaving the k-gated path — a decision with its own anonymity question. Sharing with
the verneombud needs the anonymisation rule sentence 2 describes, and nothing implements
one. Both are drawn exactly as the design draws them, and refuse rather than pretending.

**4. A leader's message is labelled "Ledelsen", not a name.** The design writes "Anne
Rygg · avdelingsleder". `app.profiles` has one select policy, `id = auth.uid()`, so the
application can read the viewer's own name and nobody else's; a reply written by another
leader would print the reader's name against somebody else's words. D-19's constraint,
and it is resolved in the same place — Oppsett, where the roster is built.

**5. The Tuva note at the foot of Spillereglene is omitted**, as everywhere else: it is
written by an assistant that does not exist.

**6. The comment ages move with the clock.** The design prints "Venter 6 dager"; the
fixture seeds `now()` minus the design's own figure, truncated to the hour, so the screen
stays true tomorrow. D-08's reasoning.

**Pixel evidence.** Title and lead, the status panel and the Spillereglene heading each
diff at **0 pixels**; the four conversation cards at 342-358; the filter rows at 720. Only
the rules panel fails, at 4 331 — and that is rules 2 and 3, above.

**Four defects the gate found**, all from a control styled by its nearest neighbour rather
than transcribed: the action row is `13px 20px` on the canvas fill with 34px buttons at
radius 9, not 14px with 36px buttons; the send button is 13.5px, which is not a size in
the Button scale; the rules grid is `minmax(250px,1fr)` at gap 13, not 200 at 18; and the
panel is `padding:22px 24px`, where a 26px guess moved every rule two pixels right and
cost 14 932. Transcribed, each region went to 0 or to its text-only residue.


---

## D-29 — Årshjulet runs; nothing posts. What the screen may claim, and what it may not

> **Superseded in part by D-65 (2026-09-24):** a dispatcher now sends the queue through Brevo.
> The screen's closing sentence follows the organisation's mail switch instead.

Årshjulet is the first screen in this product backed by something that acts on its own.
`cron.schedule('orgpuls-wheel', '0 * * * *', …)` runs `app.wheel_tick()` every hour, and
the tick opens a round that is due, queues its notification ladder, queues the reminder on
the round's own `reminder_day`, closes and freezes a round whose `closes_at` has passed,
and plans the next year's rounds from the cadence. All of that is real and asserted.

**What is not real is the sending.** The queue in `app.outbox` is a list of instructions
nobody executes: there is no mail provider, no Teams connector and no SMS gateway wired to
this project. Thirty-four rows sit in it now, and they will still be sitting in it
tomorrow. The design's summary card prints two claims about exactly that:

| the design's row | why it cannot be printed |
| --- | --- |
| `Manuelt arbeid · 0 manuelle steg` | Sending is a manual step, and there are 34 of them. |
| `Varsler · 20 varsler sendes automatisk` | Nothing sends. They are queued, not sent. |

Both rows are replaced by the queue's own counts — **I kø** and **Sendt**, read from
`app.outbox` — which is the same fact without the claim. The card's closing paragraph, the
design's own `sumYou` slot, carries the sentence that makes it unambiguous: *"Varslene
legges i kø her. Utsending krever en e-postintegrasjon — uten den blir køen stående, og
ingen får noe."* Nothing in the design's geometry moved to fit it; it is the paragraph the
design already draws there.

**Three of the round's seven steps are omitted.** "Hva skjer i hver runde" prints four:

- Dag 0, utsending — the tick opens the round and queues the invitations.
- Dag *n*, påminnelse — from the round's `reminder_day`, not the design's hard-coded 2.
- Dag *n*, lukking — from the round's `close_after_days`, not the design's 7.
- Neste runde — `wheel_tick` really does give a puls only the factors that currently carry
  an open measure, so "Pulsen måler faktorene med åpne tiltak" is a description of code.

The three left out are *"Tuva skriver utkast til risikovurdering"*, *"AMU-sak opprettes
med funn og utkast"* and *"Tiltak uten eier eskaleres"*. The first is the assistant, which
does not exist anywhere in this build; the second needs an AMU case record, and there is
no such table; the third needs an escalation nothing performs. A timeline that printed
them would be describing software rather than reporting it.

**The pill has two fills, not three.** The design gives `Årshjulet kjører` #CFE7E4 and
`Årshjulet er av` #FBD5C4. This build has a third state — switched on, never ticked — and
it keeps the *on* fill, because a wheel that is on is on. The distinction is carried in
words, `Årshjulet er slått på, men har ikke gått ennå`, which is the honest reading and
costs the design nothing.

**The dots are keyed by role, not by date.** My first attempt coloured the month strip
past / present / future. The bundle (3762) colours it by what the month *is*: 20px amber
ringed in ink for the grunnlinje, 13px mint ringed in green for a puls, 9px for everything
else, with `Ferie` and `Forankring` as labels rather than as states. A year wheel
describes a shape, and the shape does not move with today's date.

**Pixel evidence.** The header block, the whole year card, the "Hvem varsles først" card,
the timeline's head and its Dag 0 row, and the Dag 7 closing row each diff at **0 pixels**
against the baseline. Rytme is 0 after one copy fix. The exceptions card is 0 on its lower
band and 2 424 on its upper, entirely at the seam where the third row lands one pixel low —
the D-05 rounding class, not a transcription error. The summary card's head is 183 and its
two unchanged rows 271, both text antialiasing. Every column boundary — 158, 820, 840,
1281 — is identical to the pixel, so `minmax(0,1.5fr) minmax(280px,1fr)` is exact.

**Defects the gate found**, all the familiar kind: the year card was `rounded-panel` at
`22px 24px` where the bundle says radius 20 and `padding:26px`; the month grid was at gap
6 with a 26px band where the bundle says gap 4 and 30px; the label row was 11.5px where it
is 10.5px; the ladder row was a flex with 15px padding where it is a
`26px minmax(0,1fr) 108px` grid at `12px 14px`; the lead chips carried a fixed 32px height
where the bundle sizes them by `6px 12px` padding; and "Hva skjer i hver runde" sat *after*
"Unntak og eskalering" instead of before it.

---

## D-30 — The employee register stays readable by every member of the organisation

`app.employees` carries `employee_read` with `app.is_org_member(org_id)`, so a verneombud
and every avdelingsleder can list every colleague's name, e-mail and phone number. The
Ansatte tab puts that on a screen for the first time, which is what made it a question
rather than a line in a policy nobody had read lately.

Three options were put to the user. They chose to leave it as it is.

It is worth being exact about what that does and does not concede, because the temptation
is to read it as a hole in the product's promise and it is not one. **What Orgpuls
protects is the join between a person and an answer, and that join does not exist as a
column** — `app.responses` has no employee, no invitation and no user, and invariant 13 of
`respondent_invariants.sql` asserts the absence of all seven names it could plausibly go
under. Knowing who works here has never been the protected fact; a staff list is on the
wall of most workplaces this product is for.

What it costs is that the register is a directory anybody signed in can page through. If
that becomes unwanted, the change is one policy and no data migration:
`app.has_role(org_id, array['daglig_leder'])` in place of `app.is_org_member(org_id)`. The
roster is read in exactly two places — `lib/settings/read.ts` and `lib/org/read.ts` — and
nothing else in the product joins an employee to anything a respondent touched.

The access matrix on the Roller tab prints ✓ in the Ansattregister column for every role
that really has it, rather than the design's single tick for daglig leder. See D-33.

---

## D-31 — The threshold offers 5, 6, 8 and 10. The design offers 3

`app.k_min()` is a function returning 5, `app.k_threshold` takes the greater of it and the
organisation's column, and the column's own CHECK is `between 5 and 10`. A chip marked 3
would therefore be refused by the database, and would be ignored by the gate even if it
were not. **A control that appears to lower a privacy floor and cannot is worse than no
control**: it tells a leader they have a setting they do not have, and it invites them to
believe a number that nothing will honour.

The note under the chips says what is true instead — five is the floor, and it is the
product's rather than the organisation's.

The consequence runs on into the Personvern tab. The design shows a warning card when the
threshold is below five ("Terskel 3 er lavt …"). There is no state in which that card can
be true, so it is absent rather than dead. A warning about a configuration the database
will not accept is a warning about nothing.

---

## D-32 — Seven tabs, not eight: Assistenten is omitted

The Assistenten tab configures an assistant that does not exist anywhere in this build.
Innsikt omits her note (D-25), Samtaler omits hers (D-28), Årshjulet omits her draft risk
assessment from the round timeline (D-29), and the report has never carried her. The tab
is a toggle, a brand picker, a nine-face gallery, a name field and a tone selector, every
one of which would configure nothing.

The tab list is data — an array of keys the shell maps over — so dropping one entry is a
row and not a component change, which is the test CLAUDE.md sets for this kind of thing.

---

## D-33 — Everything else Oppsett does differently, and why

**The access matrix prints what the database enforces.** Four cells and one whole row
differ from the bundle, and each difference is the schema rather than a preference:

| cell | the design | this build |
| --- | --- | --- |
| Avdelingsleder · Risikovurdering | Eget | ✓ — `risk_assessments` is assessed per *round*, not per group, so there is no department to scope it to |
| Avdelingsleder · Ansattregister | — | ✓ — D-30 |
| Verneombud · Ansattregister | — | ✓ — D-30 |
| Tillitsvalgt · everything | same as verneombud | — — a tillitsvalgt is not an `app.org_role`; the act names them as the counterpart for the § 9-2 drøfting, and this product grants them no read at all |

The Egne tall, Hele huset and Kommentarer columns became true rather than aspirational in
migration 0022 — see X-020. The last column's heading is changed from "Oppsett" to "Endre
oppsett", because every role can *read* this screen and only daglig leder can change
anything, and one word was the difference between a claim and a lie.

**Two languages, not four.** The design offers Bokmål, Nynorsk, English and Polski;
`/messages` holds `no` and `en`, and `organizations.default_lang` refuses anything else. A
chip that sets a language the respondent form cannot render is a chip that breaks the form.

**Twelve months, not four.** The design offers Januar, Mars, September and Oktober — an
arbitrary subset of its own. `year_wheels.baseline_month` accepts 1..12 and Årshjulet's
month strip already lets any of them be chosen, so offering four here would make the same
setting adjustable in one place and not the other.

**A new location has no headcount field.** The design's add row is three columns — name,
address, "Legg til" — and creates the location with zero. That is transcribed as drawn. It
means an added site starts at 0 and the reconciliation line under the list reads as a
mismatch until somebody fixes the number, which the design has no control for either.

**There is no control for the stated headcount.** `employee_count` is the denominator of
every response rate in the product, and in the bundle it is a prototype prop with no input
anywhere. None is invented here. The Enhetsregisteret lookup stores the register's own
count in a separate column and the screen prints both, so the two are visible side by side
rather than silently merged — a register's count of registered employment is not the same
population this measurement asks.

**"Hent fra Brønnøysund" really fetches.** `data.brreg.no` is the authoritative public
register, no key and no personal data, and an organisation's legal name and næringskode
are whatever it says they are. What is stored is what came back, with the moment it came
back; the screen prints that date. The design's note claims the record "oppdateres
automatisk hvert kvartal" — nothing re-fetches on a schedule here, so that sentence is
replaced by one that tells the reader to press the button again.

**"Registrert" prints a date and not a register.** The design writes "14.03.2011 i
Foretaksregisteret". Enhetsregisteret's `registreringsdatoEnhetsregisteret` is a date in
*that* register; whether the undertaking is also in Foretaksregisteret is a different
field this does not read.

**The BHT duty is derived, with a third state the design does not have.** Forskrift om
organisering § 13-1 makes the duty follow from the trade, and the design hard-codes
"Påbudt" because its fixture is a construction company. Here the NACE section decides: the
sections the regulation names print "Påbudt", and anything else prints "Avhenger av
bransjen" with a pointer to the regulation. Asserting "ikke påbudt" from an incomplete
transcription of a long list would be a statement about somebody's legal obligations, and
a wrong one is worse than an honest "check".

**Two import sources, not four.** "Koble HR-systemet" and "Koble Microsoft Entra" select a
source nothing can read from. The Integrasjoner tab says so in the same words.

**Every integration row reads "Ikke satt opp", including e-post.** The design marks e-post
`locked: true, "Alltid på"`. Nothing sends in this build — `app.outbox` fills and no
dispatcher empties it (D-29) — and "Alltid på" over a queue that has never moved would be
the most misleading sentence in the product: a leader would believe their people had been
asked. The "Sett opp" buttons are omitted for the same reason the design's own "Kommer"
row has none.

**Bransjesammenligning prints the næringskode and no count.** The design's "118 norske
virksomheter i sammenligningen" is a number with no source in this schema, and there is no
benchmark dataset behind it.

**The three Personvern document buttons are omitted.** A "Last ned databehandleravtale"
that downloads nothing is not a dead button, it is a statement that the agreement exists.
Two of the eight cards are also rewritten: retention says the automatic deletion routine is
not configured, and the processor card says the agreement and sub-processor list must be in
place before real answers are processed. Both were assertions in the design about a service
that has not been set up here.

**Pixel evidence.** Against `05-oppsett-settings.png`: the title block, the Lovmodus panel
and the Lokasjoner card each diff at **0 pixels**; the tab row at 89, the Selskap card's
head at 313 and its fact table at 490, the Plikter card at 2 145 — all passing. The
Innstillinger card fails at 13 252, entirely on the chip counts above, and its heading and
Språk block pass at 821 on their own. The fact table and everything under it sit 19 pixels
higher than the baseline because the fetch note is one line shorter; `--at` carries that
and the displacement is printed rather than absorbed.

**Defects the gate found:** the organisation number was printed ungrouped where the design
prints "924 118 742"; the month chips came out of `Intl` lowercase where the design
capitalises them; the location rows printed a bare number where the design writes "12
ansatte"; and the add-location row had a fourth column that the design does not draw.

---

## D-34 — Hjelp: the articles are written, the service desk is not

The nineteen articles the design indexes are now real: each has a body of four paragraphs
in `/messages`, and `/hjelp/<key>` renders it. They are product copy, the same class of
thing as every other string in the application, so they live in the catalogue and
`lib/help/articles.ts` holds only what the index sorts and filters by. Adding one is a row
and a message key, which is the shape CLAUDE.md sets for data.

Three leads are rewritten, and each for the same reason — the design's version is not true
of this build:

- *"…hvorfor dere ikke bør gå lavere enn tre"* becomes *"hvorfor gulvet ikke kan senkes"*.
  Three is not a choice a leader has: `app.k_min()` returns 5 and the column refuses less.
  Advising against something impossible implies it is possible.
- *"Hva tallet 61 betyr … hvordan dere sammenlikner mot bransjen"* loses both halves. 61 is
  this fixture's index, not a fact about the index, and there is no benchmark dataset.
- The SMS article's lead promises *"Avsendernavn, meldingstekst og hva det koster"*. None
  of that is configurable, so the lead says what connecting will require instead.

Everything else is the bundle's own wording, restored verbatim after the pixel gate caught
eight leads I had shortened.

**The right column is most of what is missing.** The design offers four things there and
this build has one:

| the design | why it is absent |
| --- | --- |
| Chat, *"Nederst til høyre i appen"* | There is no widget, in that corner or any other. |
| Telefon, 22 00 00 00 | Not a number anybody answers. |
| *"…setter vi dere i kontakt med en arbeidsmiljørådgiver"* | A service that is not sold here. |
| *"Alle systemer virker som de skal · sist oppdatert i dag kl. 06.00"* | There is no monitor. An uptime claim with nothing behind it is the least trustworthy sentence a product can print, because it is the one a reader has no way to check. |

What is left is the e-mail address, which is real, and one line saying why the other three
are not there. It is a thinner column than the design's, and an honest one.

**The third quick card goes elsewhere.** The design's "Se hva de ansatte ser" opens the
respondent flow. That flow needs an invitation token — `/s/[token]` — and there is no such
thing as a preview token: one either belongs to a person who has not answered, or it does
not work. The card points at the report instead, which is a route that exists and a
question a leader asking "where do I start" actually has.

**The footer's links are links now.** They were `<button>` elements while the screens did
not exist, which is at least honest about going nowhere. Databehandleravtale and
Driftsstatus stay non-links, because those two documents still do not exist.

**Pixel evidence.** The title block diffs at **0 pixels**; the articles card's head at 299,
and the three bands of the article list at 733, 1 999 and 939 — all passing, all of it the
three rewritten leads. The quick-card row passes at 3 547 on the third card's text. The
contact column passes at 1 640 against the design's Chat card, which is as close as an
absent card and a present one get.

---

## D-35 — Integrasjoner keeps the design's content and drops its wizard

The design's Integrasjoner screen is a four-step connection wizard. It asks for a tenant
ID, ticks which Entra groups to synchronise, picks a sync cadence, writes an SMS sender
name and message body with a live character count and a phone mock-up, and ends in a
"Koble til" button.

**None of it is built.** There is no Entra client, no SMS gateway, and no mail provider
either (D-29). A wizard whose every field discards what you type and whose final button
connects nothing is not an unfinished feature — it is a false statement about the product,
and four cards of it is the most elaborate false statement in the bundle. Somebody would
fill it in and believe their people were about to be asked.

So the screen keeps the content and drops the controls. For each of the five channels it
prints what connecting will require, numbered in the order the wizard would ask for it:
what a mail provider needs (an API, a verified sender with SPF and DKIM, and a job that
drains the queue), what Entra asks for and what happens to leavers, why Teams needs Entra
first, and what SMS costs. That is what a leader deciding whether to set this up actually
needs to read, and it is the same information the wizard's labels carried.

Two things on the screen are real and are therefore computed rather than described: how
many of the register carry a mobile number, drawn as the design's progress bar, and how
many notices the årshjul has queued that nothing has sent. The second is stated as a number
in the design's warning tone, because *"34 varsler står i kø og blir ikke sendt"* lands
faster than any sentence about a feature being unavailable.

There is no route per channel. `/integrasjoner/[kanal]` would be four screens of the same
refusal.

---

## D-36 — The report's last three sections print records, not prose

Sections 6, 7 and 8 and the signature block print since migration 0023. Each waited on a
fact rather than on a component, and each is written from that fact rather than from the
design's narrative.

**6. Effektvurdering.** The design writes it as a paragraph: *"Varslingsrutinen ble
gjennomgått i alle team i 2025. Ytringsklima steg fra 39 til 48 i grunnlinjen etterpå, men
har falt tilbake til 41 i 2026."* Half of that is arithmetic and half is a judgement. The
arithmetic is now computed — both indices come from `results_summary`, the same k-gated RPC
every other figure in the document comes from — and the judgement is `effect_note`, written
by a person and printed as written. Where the gate withheld the factor in either round the
section says the comparison cannot be made, rather than printing one side of it.

**7. Krenkende atferd, vold og trusler.** Counts, and the RPC that produces them refuses to
break down at all: there is no group parameter on `rpc.screening_counts` and adding one
would be a change to what the product promises rather than a feature. `vil ikke svare` is
counted in the denominator, because *"tre av 28"* is a different claim from *"tre av 27"*.
The design's two extra sentences — that the verneombud was notified on 15 September, and
that the cases are handled under the whistleblowing routine — are one record this product
does not hold and one statement about the organisation's own procedure. The first is
dropped; the second is kept as the general rule it is.

**8. Informasjon og opplæring.** Two lists rather than two paragraphs. `round_information`
holds who was told, through which channel, on which date; `trainings` holds what was run,
for whom, and when it is due again. Both print their own absence with the provision that
requires them — an inspector reading *"det er ikke registrert at funnene er delt"* under a
citation of § 9-2 learns more than one reading an invented allmøte.

**The signature block is built from the register.** The design hard-codes three names; here
they come from `duty_role`, which is the column 0021 added for this. An organisation that
has recorded nobody as verneombud gets no signature block, rather than three ruled lines
over titles with no holders. It diffs at **1 304 pixels** against the baseline — the three
rules, the three names and the three roles all land exactly where the design puts them.

---

## D-37 — The splash's hero mock-up is an illustration, and says so

The hero puts a small Innsikt card beside the headline: an index of 61, *"−3 siden i
fjor"*, a band scale, and three things to do. Those are Nordvik's figures — the fixture's,
the report's, the ones every other screen computes from `results_summary`.

Here they are typed into `messages/no.json`. Nothing on the splash page can compute them,
and nothing should: the page is served to a visitor with no session and no organisation,
and a marketing page that queried a real undertaking's arbeidsmiljøindeks to decorate
itself would be exactly the leak this product exists to prevent.

**Never fabricate data in the UI** forbids rendering a placeholder that looks like data.
The resolution is not to omit the card — the design's hero is a picture of the product and
without it the page is a wall of text — but to caption it so it cannot be read as a
reading. The card's header line is `start.mockCaption`: **"Innsikt · Nordvik Anlegg AS —
eksempel"**. The bundle's own caption says only *"Innsikt · Nordvik Anlegg AS"*; the em
dash and the word are this product's, and they are the smallest addition that turns a
figure into an illustration of a figure.

The same rule applied to the three price plans, which are the design's own numbers and are
also copy rather than a table: there is no billing in this schema, so there is nothing for
them to disagree with. They are marked as copy by being in `messages`, where a price
belongs until something charges one.

---

## D-38 — Sign-up asks two of the bundle's questions and offers neither SSO button

The bundle's step 2 asks four things beyond name, e-mail and password: a role chip
(*"Daglig leder / HR eller administrasjon / Verneombud / Annet"*), a size band (*"Under 25
/ 25–50 / 51–100 / Over 100"*), a consent tick, and nothing else. Its sign-in panel offers
*"Fortsett med Microsoft"* and *"Fortsett med BankID"* under the password field.

**The size band is kept, by becoming a number.** `app.organizations.employee_count` is an
integer the Selskap tab prints and the participation denominator does not use, so a band
maps onto it cleanly: the chip sets 20, 38, 75 or 150, and the row that lands in the
database is a real column holding a real number. It is an estimate, and the Selskap tab
lets it be corrected before a single round is planned against it, which is what the column
was always for. The number the
participation denominator uses is the employee register, not this, so an estimate here can
never move a published figure.

**The role question is dropped.** There is no column it fits. `app.memberships.role` is the
three-value `app.app_role` — `daglig_leder`, `avdelingsleder`, `verneombud` — and the
sign-up's answer is not one of those: *"HR eller administrasjon"* and *"Annet"* have no
membership to grant, and the first person into an organisation must be `daglig_leder`
regardless of what they call themselves, because nobody else can grant them anything
afterwards. `app.employees.duty_role` is a different question again — who holds a statutory
office in the undertaking — and is answered on the Ansatte tab about a person in the
register, not about the account creating the organisation. Storing the chip anywhere else
would mean a column that exists to hold an answer nothing reads, which is the shape of
every field that later gets used for something it does not mean.

**Both SSO buttons are omitted**, for the reason D-35 omits the Entra card on
Integrasjoner: there is no Entra application, no BankID merchant, and no provider
configured in Supabase Auth. A button that opens nothing is worse on a sign-in screen than
anywhere else, because the person clicking it is already locked out. The bundle's hint
line — *"Er dere på Microsoft 365, slipper du passordet"* — goes with them; it is a promise
about an integration that does not exist.

**What is kept exactly** is the flow's shape: three steps, the Brønnøysund lookup on step 1
against the real register (D-33), the password meter and its three bars, the consent tick,
the five inclusions, the reassurance line that changes per step, and the "kontoen er klar"
panel with its three numbered next steps.

**One sentence of the design's step 3 is moved rather than kept.** The bundle's lead reads
*"Vi har sendt en bekreftelse til <e-post>. <Virksomhet> er opprettet, og du er
administrator."* — a prototype can say both because nothing happens either way. Here they
are two different outcomes and only one of them reaches step 3. If Supabase returns a
session, the account is live, no mail was sent, and `registrer.doneLead` says only what is
true: *"{company} er opprettet, og du er administrator."* If the project requires the
address to be confirmed, there is no session, so `create_organisation` cannot be called at
all — nothing is created, and the form stays on step 2 with
`registrer.problem.confirm_email`, which tells the person to open the mail and come back.
Printing "kontoen er klar" over an organisation that does not exist yet is the one failure
this screen must not have.

---

## D-39 — Migration 0020 creates pg_cron, and this is an edit to an applied migration

**The rule this bends.** CLAUDE.md: *"Schema changes only via `supabase/migrations/`. Never
edit an applied migration; add a new one that supersedes it."* This entry records the one
place that was not done, and why nothing else was available.

**What was wrong.** 0020 called `cron.schedule(...)` without ever creating the extension.
It worked because pg_cron had been switched on from the Supabase dashboard before the
migration was written, so the `cron` schema was simply there. No migration in this
repository creates any extension; pgcrypto and the rest happen to exist on both the hosted
project and the local CLI stack, and pg_cron does not.

**What it cost.** CI's `supabase db reset` died at migration 20 of 24 with `schema "cron"
does not exist`, and had been dying there since 0020 landed — three runs on `main`, each
reported as a failure of the whole `security invariants` job. Everything downstream of the
reset was skipped: the fixture, the design's published figures, and every suite. The
project believed it had a gate that rebuilds the database from migrations and asserts the
figures; what it actually had was a gate that failed before reaching either, in a job whose
red nobody read as "none of this ran".

**Why a superseding migration cannot fix it.** A reset applies the files in order and
aborts on the first error. 0025 is never reached. There is no configuration route either:
the repository has no `supabase/config.toml`, and an extension created by hand before the
reset is dropped by the reset. The failing statement is in 0020, so the fix is in 0020.

**Why the edit is safe.** `create extension if not exists pg_cron;` is a no-op on every
database that has already run this file — which is every database it has ever run against,
since it could not have succeeded otherwise. It does not change a table, a policy, a
function or a grant. pg_cron's control file pins the extension to `pg_catalog`, which is
where the hosted project has it, and the extension creates the `cron` schema that holds
`cron.schedule` either way. The hosted project was checked before and after: pg_cron 1.6.4
in `pg_catalog`, one `orgpuls-wheel` job, unchanged.

**The rule still holds for everything else.** This is a repair to a migration that did not
compose from scratch, not a change to what it did. An applied migration that cannot be
applied again is not a migration, and the rule against editing one exists to protect a
database from drifting away from its files — which is the opposite of what was happening
here.

---

## D-40 — A failed read rendered as an empty screen, and now says so in the log

Not a deviation from the design; a defect the design could not show, recorded here because
the fix changes how every read in the application behaves on failure.

**What happened.** Migration 0023 added `app.measures.effect_round_id`. That gave
`app.measures` a *second* foreign key to `app.rounds`, and PostgREST will not guess between
two: the `rounds(id, measurements(kind, year))` embed in `getMeasures` started answering
`PGRST201 — Could not embed because more than one relationship was found`, and returned no
rows at all. The call site is `if (error || !data) return []`, so the screen got an empty
list.

**What that looked like.** Tiltak printed *"Ingen tiltak i denne visningen"* with every
chip at · 0 and all three status tiles at 0, over seven measures sitting in the database.
Innsikt printed *"Ingen tiltak løper"* and left **Tiltak løper** unticked on the sløyfe —
a statutory progress indicator, reading false. Both are plausible sentences about a real
organisation, which is exactly why nobody caught it.

**Why no gate caught it.** The SQL suites test the database and the database was correct —
all seven rows are there and RLS returns all seven to this account. `tsc`, lint, i18n and
`next build` do not execute a query. The pixel gate would have caught it on sight and could
not run, because no route could be signed into until `ORGPULS_DEV_PASSWORD` was set
(X-009). It was found within minutes of the password arriving, by looking at the screen.

**The fix is two things.** The embed now names its foreign key —
`rounds!measures_round_id_fkey(...)` — which is the round the measure was raised from, the
one the chips filter by. And `lib/supabase/read.ts` gives every read a log line on failure:
`readFailed`, `callFailed` and `parseFailed` replace the bare `if (error || !data)` and
`if (!parsed.success)` at 28 call sites. They return the same empty value the screens
already expect, so no rendering changes; what changes is that the next one of these
announces itself.

**The rule it belongs to.** *Never fabricate data in the UI* forbids rendering a
placeholder that looks like data, because an invented value is indistinguishable from a
real one. An invented **absence** is the same fault with the sign flipped, and it is the
worse of the two on this product: *"there is nothing to follow up"* is the answer a leader
is most willing to accept without checking, and it is the one an inspector would be given.

**One read does not log, on purpose.** `getRespondForm` passes the respondent's plaintext
token to `rpc.respond_form`, and a Postgres error can quote the argument it choked on.
Invariant 3 keeps that token out of every column; putting it in a deployment log instead
would be the same exposure through a wider door. That site keeps its silent refusal and
carries a comment saying why.

---

## D-41 — "Glemt passord?" left the password field with no usable label

The sign-in panel had the reset link inside the `<label>` that wrapped the password input,
because the design draws them on one baseline. A `<button>` inside a `<label>` is
interactive content inside a label: the browser folds the link's text into the input's
accessible name, so the field announced itself as *"Passord Glemt passord?"*, and a click
on the link also focused the input.

It surfaced as a test failure rather than a report — `scripts/verify/shoot.mjs` looks the
password box up by its label and got the link instead, so the pixel gate could not sign in
on its first run. The markup now associates the two with `htmlFor` and keeps the row as a
sibling: same box model, same rendering, one accessible name each.

---

## D-42 — The årshjul was switched on by hand, and the fixture did not know

`scripts/seed/design-fixture.mjs` emitted no `app.year_wheels` row. The wheel on the hosted
project was switched on directly while the Årshjulet screen was being built — an ad hoc
write, which CLAUDE.md names as the one thing that must not happen: *"nothing may be
created ad hoc against a database, because a row not emitted there does not survive a
reset."*

Nothing noticed, because CI could not rebuild the database at all (D-39). The first run
that got past that reached `wheel_invariants.sql` and failed four assertions in a row — the
due round not opened, no invitations, no queue, no token — which all say the same thing:
`app.wheel_tick()` iterates `app.year_wheels where active`, and on a database built from
these files there was no such row. The scheduler was not broken; it had nothing to turn.

The fixture now emits the wheel and its five-step notification ladder, upserted on
`org_id` rather than on an invented id, because `app.year_wheels` carries `UNIQUE (org_id)`
and the hosted project already had a row with an id of its own. Running it there reconciles
the two instead of leaving two wheels turning; it was run and the row kept its id, the
ladder came back at five, and a following tick reported 0/0/0/0.

**CI gained a step rather than the suite gaining a tolerance.** The fixture seeds the wheel
switched on but not yet turned, so `Wind the wheel once` runs `app.wheel_tick()` after the
seed. That is also the only place the scheduler is exercised from cold:
`wheel_invariants.sql` asserts that a *second* tick changes nothing, which proves
idempotence and says nothing whatever about the first.

---

## D-43 — Vercel ran the middleware's source instead of its build, and the repository now says which framework it is

Not a deviation from the design. A production outage, recorded here because two earlier
entries in this project's own history explained it wrongly and the correction belongs
next to them.

**What was wrong.** Every deployment this project ever had returned
`500 MIDDLEWARE_INVOCATION_FAILED` on every URL, on builds that were green. The middleware
was hardened three times against causes it did not have — a missing variable, a throw in
the handler, a module failing to load — and each time the failure came back identical.

**What the runtime log showed.**

    /var/task/middleware.js:1
    import { safeUpdateSession } from '@/lib/supabase/middleware';
    SyntaxError: Cannot use import statement outside a module
        at wrapSafe (node:internal/modules/cjs/loader)
        at /opt/rust/nodejs.js

That is the uncompiled TypeScript source — the `@/` alias unresolved, the `import`
untransformed — loaded as CommonJS by Vercel's native Node function runtime. Next's 95 kB
compiled Edge bundle was never what ran.

**The cause, confirmed in the dashboard afterwards: the project's Framework Preset was
"Other".** With that preset Vercel does not hand `middleware.ts` to `@vercel/next`; its
framework-agnostic *Routing Middleware* picks up any root `middleware.ts` and deploys it as
a plain Node function. `npm run build` still ran `next build` — which is why every build
was green — but the deployment was assembled by the generic path, which honoured Next's
matcher (`/favicon.ico` returned `NOT_FOUND`, not the middleware error) and replaced Next's
function with the raw file. No change inside `middleware.ts` could have helped, because
`middleware.ts` was not what was being executed.

**Why it could not be reproduced.** `next start` runs the *compiled* middleware in the
edge-runtime sandbox. Locally, Next always owned the file. The one thing that differed on
Vercel was which builder claimed it, and that is not visible from a checkout.

**The fix.** `vercel.json` with `"framework": "nextjs"`. It names the builder in the
repository, where a dashboard setting cannot undo it, and it was proved on a preview
deployment before it touched `main`: the splash loaded and `/innsikt` redirected to
`/logg-inn` with the real middleware in place. The dashboard preset is set to Next.js as
well, so the two agree; `vercel.json` is the one that would survive a misclick.

**What stays and what is corrected.** The four rules in `lib/supabase/middleware.ts` stay:
they are true, cheap, and each closes a real way for a middleware to fail. Rule 4's
comment no longer claims to have been the cause of this outage, because it was not. The
lesson worth keeping is the general one: *a green build proves the build, not the deploy*,
and when a failure survives three code changes unchanged, the next thing to question is
whether the code is what is running.

---

## D-44 — The `app` schema was exposed to the API by a dashboard tick, and CI never knew

The CI smoke job (review Q5) signed in as a real user for the first time and every screen's
read failed:

    [read] getMeasures: PGRST106 Invalid schema: app — Only the following schemas are
    exposed: public, graphql_public

The hosted project exposes `app` to PostgREST because it was ticked in Settings → API; the
setting lives on the `authenticator` role as `pgrst.db_schemas = public, graphql_public,
app`. The repository had no `supabase/config.toml`, so the CLI-built database in CI used the
defaults and refused every request the application makes — all of them go through
`.schema('app')`.

**Why it had never been noticed.** Every check CI ran spoke to Postgres directly, through
`psql`: the suites, the figures, the fixture. None went through the API, which is the only
path the application uses. The database was proved correct and the system was never
exercised. The smoke job was added precisely to close that gap, and this is the first thing
it found.

**The fix** is `supabase/config.toml` with `[api] schemas = ["public", "graphql_public",
"app"]`, the hosted value exactly, and nothing else — every other key keeps the default CI
ran with before. D-39's remark that "the repository has no `supabase/config.toml`" is
superseded.

**The pattern, now seen three times** (D-39 pg_cron, D-42 the year wheel, this): a setting
made by hand on the hosted project is invisible to every environment built from the
repository. If the hosted project needs it, the repository must say it.


## D-45 — PostgREST refused a token Auth had just issued, and the server client now retries that one refusal

The smoke job's second run got past D-44 and rendered all eleven screens without a console
error, then failed on one line:

    [read] getViewerRole: PGRST303 JWT issued at future

The first request after sign-in carried a token whose `iat` PostgREST judged to be later
than its own clock. PostgREST serves a cached time rather than reading the clock per
request, and that cache can lag by more than it is meant to — an open upstream defect
(supabase/supabase#49655, #50651, discussion #48123; the configurable skew in
PostgREST/postgrest#5199 has not landed). CI ran PostgREST v16.2. Production has not logged
PGRST303 in its retained API logs, but runs the same class of software and has nothing that
prevents it.

**What it cost the user.** `getViewerRole` answered `null`, and the screen rendered as though
the signed-in daglig leder had no role. The read helper logged it — which is how CI caught
it — but the person saw a refusal presented as a fact about themselves.

**The fix** is `lib/supabase/skew.ts`, a `fetch` wrapper on the server client that retries
exactly one thing: a 401 whose body carries `PGRST303`, on a request whose body can be sent
again, up to three times at 0.5 s, 1 s and 2 s plus jitter. PGRST303 is decided while
PostgREST validates the JWT, before any transaction opens, so a request refused with it did
nothing and retrying it — a write included — cannot apply anything twice. Every other
status and code is returned untouched; an expired or forged token (PGRST301) is a real
refusal and is not retried. If every attempt fails, the caller receives the refusal and
logs it through `read.ts`/`write.ts` exactly as before, so the smoke gate still fails on a
persistent fault. Each retry logs a `[skew]` line with the attempt number and nothing from
the URL, which can carry filter values.

The middleware client is unchanged: it speaks only to Auth, never to PostgREST.
`tests/unit/skew.test.ts` holds the rule (nine cases).

**Remove it** when PostgREST ships a clock-skew allowance and the hosted project runs it.

**Widened, 2026-09-23.** The first schedule ([500, 1000, 2000] ms, 3.5 s in all) was
outlasted on a CI runner: three retries of `getShellContext` right after a sign-in, all
refused, so the smoke job failed on the logged read. The schedule is now [500, 1000, 2000,
4000] ms, 7.5 s in all. It costs nothing unless PostgREST actually refuses, and the test
that proves the wrapper gives up now takes its attempt count from the schedule, so it cannot
fall out of step with it.

**Root cause found, 2026-09-23.** The widened schedule was outlasted too, on `getRounds`
after every screen had rendered, and the timing of the run rules out a slow clock: pages
kept rendering 1.5 s apart while one request was refused four times over 7.5 s. The cause
is PostgREST's, and it is versioned. Up to v16.2 the time a token's `iat` is checked
against came from the auto-update library's cache, and after an idle spell some of the
server's threads stopped seeing the cache's updates (PostgREST/postgrest#5159 upgraded the
library; #5196 and #5208 removed it and read the system clock, released as v16.3 and v14.18
in September 2026). PostgREST already allows 30 s of skew, so a refusal means a thread's
clock was minutes behind; and a retry on the same kept-alive connection reaches the same
thread, which is why no retry has ever succeeded in CI — the two green runs between the
failures carry no `[skew]` line at all. CI ran v16.2 because the latest CLI release,
v2.117.0, pins it; the CLI's develop branch pins v16.3 but has not released.

**What changed.** The workflow pulls PostgREST v16.3 before `supabase start` and tags it
under the name the CLI asks for, which the CLI inspects locally before pulling. The step
reads the pin from `supabase services` and does nothing once the pin passes v16.2, so it
retires itself; delete it then. The wrapper and its schedule are unchanged: the fault it
was written for is real, the retry is still safe, and a refused read still renders as a
fact about the person without it. Production's PostgREST version is not readable from
outside the gateway; it has still logged no PGRST303.

---

## D-46 — Round state came from list position, and the year wheel made that visible

`getRounds` labelled row 0 "Lukket" and every other row "Arkivert", whatever the round's
status. That was true only while every round was closed. The hosted Nordvik fixture has
carried four wheel-planned rounds since D-42 (December 2026 to September 2027), and they
sort first by `closes_at`, so production has been showing:

- **Målinger:** "Lukket" on the September 2027 grunnlinje nobody has been sent, and the
  real latest result as "Arkivert"; the Deltakelse card describing that future round.
- **Oppsett:** "svar sist" read from the same future round, so every department said 0.
- **Rapport:** opened on 2027, a year with no closed grunnlinje, so an empty report.
- **Innsikt and Resultat:** the delta ("siden i fjor") compared against the previous
  closed round of *any* kind — a puls with two factors against a grunnlinje with eleven.

None of it showed in the pixel baselines, because the fixture's screens were captured
before the wheel planned anything. The demo organisation (D-47) is what surfaced it: with
realistic data it was on every screen.

**What changed.**
- `state` is derived from `status`: the latest closed round is "Lukket", earlier closed
  ones "Arkivert", the planned round that opens first "Neste", later ones "Planlagt", and
  an open round "Pågår". The last is not in the design, which has no open round on this
  list; it takes "Neste"'s amber. The other four are the design's own states and colours
  (bundle 4249-4267).
- Målinger lists rounds in the design's order: live, latest result, coming (in the order
  they open), archive. A planned round prints "går ut …", "Ikke sendt" and "—" rather than
  "lukket …" and a 0 % over a roster nobody was asked. Its action opens its setup ("Definer
  pulsen" on the next puls, "Se oppsett" otherwise, both links for D-06's reason) beside
  the design's "Forhåndsvis". The planned-pulse rows D-05 left out are rendered: the schema
  now holds them.
- Innsikt and Resultat compare like with like — a grunnlinje with the previous grunnlinje,
  a puls with the previous puls — as the design's own Resultat pairs them (61 with 64,
  47 with 44; bundle 2950-2953). Resultat's chips leave out rounds planned beyond the next
  one.
- Rapport offers only years in which a round has gone out, and opens on the latest year
  with a closed grunnlinje.
- Pulses are numbered within their year by opening date — "Puls 2 · 2025", the design's
  chip label — everywhere a round is named except Målinger's list, which uses the design's
  own "Puls · desember 2026". Several pulses a year is the wheel's ordinary cadence, and
  three chips reading "Puls 2026" named none of them. `lib/rounds/title.ts`.

`tests/unit/rounds.test.ts` holds the state and numbering rules (eleven cases). Innsikt's
headline still follows the latest closed round of any kind, so once a puls closes after
the grunnlinje the index card describes that puls; whether it should stay on the
grunnlinje is a design question and is left open.

## D-47 — A demo organisation for evaluation, beside the fixture rather than in it

The design fixture is 34 people and two grunnlinjer, built backwards from the design's
numbers for the pixel gate and CI's figures check. It cannot grow without moving those
numbers. An evaluator needs the opposite: enough history for every screen to have
something to say. `scripts/seed/demo-org.mjs` generates a second organisation for that.

**Demobedriften AS**, 64 employees in six departments, three grunnlinjer (2024–2026),
four closed pulses and one open, 358 responses, 18 measures at every step (three overdue),
14 anonymous conversations in every state (one flagged as a possible varsel), two risk
assessments, the § 8 information and training record, three locations, and an active
year wheel. Økonomi og HR has four people, so its results are withheld everywhere while
its participation is shown — the k rule, on screen.

**Nothing in it is real.** The name has no entry in Enhetsregisteret; 990000001 fails the
mod-11 check digit, so no real undertaking can hold it; people are invented; addresses are
on `.example`.

**Same rules as the fixture.** The generator is the only source of these rows, idempotent,
and works on an empty database. Responses carry a department and an hour and nothing else.
Answers are drawn deterministically around per-department targets, so the data looks like
data rather than a split designed to hit a number — and so a note that quotes a figure
could become false when the targets are edited. The generator therefore checks every
quoted figure against the answers it has just written, inside the transaction, and refuses
to commit if one is off. Writing the notes first found three that were wrong.

**The login** is an ordinary Auth user, `demo@orgpuls.com`, created through the public
sign-up endpoint (hosted Auth auto-confirms), never by writing `auth.users`. The generator
gives it a profile and a daglig leder membership in this organisation only, by e-mail; in
CI the user does not exist and those two statements match nothing. The password is not in
the repository.

**CI** seeds it next to the fixture, before the wheel turns and before the suites, so all
ten suites prove their invariants with a second, larger organisation present. The figures
check used to sign in as "the first membership"; it now names the fixture's organisation,
because with two organisations the first membership need not be one that can read Nordvik.

**Seeded on the hosted project on 2026-09-23** through the Supabase MCP. The script is
set-based (44 KB) so it can be passed as text; fifteen table fingerprints compared equal
between the hosted run and a local one, so the transcription was exact.

**It ages.** The open puls closes five days after seeding and the wheel then plans and
opens the next rounds, which nobody answers. Re-running the generator refreshes it; on the
hosted project that deletes and re-inserts this one organisation's rows, which CLAUDE.md
asks to be confirmed first.

**Seen while checking it, not changed:** the header's account chip prints "TB" for every
user — the design's Tuva Berg, a default in `AppHeader` — and the role selector defaults to
daglig leder rather than the viewer's role. Both predate this and both are covered by the
pixel baselines, so they are logged rather than changed here.

## D-48 — Hjelp, Grunnlag and the assistant open the design's panel; they were dead controls

**Design:** bundle lines 67-148 and `helpData` at 3082-3190. The three header controls are
one panel with three modes, opened under the header for the screen you are on: Hjelp (three
steps and three help articles for this screen), Grunnlag (what the screen rests on — the
research, and in law mode a second tab with what the Working Environment Act requires
here), and the assistant, whose panel is not a chat but "Kom i gang": four setup steps,
ticked when done, each linking to where it is done.

**Built before this:** Grunnlag and the assistant were `<button>`s with no handler — the
header was transcribed for the pixel gate and the behaviour never followed, and nothing
here recorded the gap. Hjelp was a link to /hjelp. The earlier omissions of the assistant's
*notes* (D-25 and the screens after it) are a different thing: those are prose an assistant
would have written; this panel is fixed copy and a checklist of facts.

**Built now:** `components/shell/HeaderBar.tsx`, a client component, with the server header
supplying law mode and the checklist's facts (`lib/shell/read.ts`).

- **Copy.** All 69 Norwegian strings are the design's own, checked verbatim against the
  bundle; English is translated. They live in `headerPanel.*`. A screen with no entry of its
  own falls back to Innsikt's, as `H[scr] || H.home` does — so Rapport, Integrasjoner and
  Hjelp show Innsikt's steps, and Rapport alone has its own law text, as in the design.
- **The checklist's ticks come from rows, not from the prototype's shortcuts.** The bundle
  hard-codes "grupper" and "måling" as done and counts the register done at ten people. Here:
  the register is done when it holds every employee the organisation says it has (Oppsett's
  "Registeret er komplett" rule) and at least one; groups when there is one and no active
  employee is outside a group; the årshjul when it is switched on; the first measurement
  when a round has gone out. When those facts cannot be read — no organisation, more than
  one, a failed read — the panel prints no checklist rather than four unticked steps.
- **Hjelp is a toggle again**, as the design's control is. The help site is one step on,
  behind the panel's "Hele hjelpesiden →".
- **Links, per D-06.** "Hele hjelpesiden", the article cards and the checklist steps change
  the address, so they are links styled as the bundle's buttons. The design's article cards
  open the help site filtered to the article's category; here they open the article the
  card names, since the router can.
- **The panel belongs to the screen it was opened on** (`panelFor`): navigate and it is
  closed. The three controls carry `aria-expanded` and `aria-controls`; the Grunnlag tabs
  `aria-pressed`.
- **The assistant control is always shown.** The design hides it when `tuvaOn` is off, a
  setting on Oppsett's Assistenten tab, which is omitted (D-32).

The closed header is unchanged: the header band diffs PASS against `01-innsikt-home.png`
and `04-tiltak-tasks.png`.

## D-49 — Vercel Web Analytics and Speed Insights, never on a respondent's page

The user enabled Web Analytics in the Vercel dashboard and asked for it to be installed;
Speed Insights was enabled too (`/_vercel/speed-insights/script.js` answers 200), so both
are mounted. They are not in the design; they render nothing visible.

**What is sent, and what is not.** Both tools report the URL of each page view or vitals
sample. `lib/analytics/scrub.ts` decides what that URL may say:

- **Nothing from `/s/…`.** The respondent's link carries their capability token (review
  S4), and a page view there is also a timestamp of somebody answering — the fact invariant
  2 truncates to the hour. On those pages the components do not render at all, so no script
  loads; `beforeSend` drops any event from there as a second line. Dropped, not redacted: a
  redacted event would still carry the time.
- **No query strings or fragments** anywhere. Round ids, tabs and filters are not
  identities, but nothing needs them counted, and stripping them means a parameter added
  later cannot leak by default.

What reaches Vercel is origin and path: which screen was used. Vercel already hosts the
application, so this adds no new party. Web Analytics sets no cookies. The product's
statements about answers ("svar … deles ikke med tredjeparter") are untouched, because no
answer, comment or respondent page is ever reported.

**Where it runs.** Only when `VERCEL=1`, which Vercel sets on its own builds and functions.
Elsewhere — CI's smoke job, a local `next start` — `/_vercel/…` does not exist, and the 404
would be a console error on every screen. Both scripts are same-origin, so the CSP's
`'self'` covers them unchanged.

**Installing it.** `npm i` refused both packages with ERESOLVE over an optional SvelteKit
peer (every framework peer is `optional`; npm 10 resolved it anyway). They were added with
`--legacy-peer-deps`, and the lockfile was then rebuilt from the committed one plus exactly
the two new entries, because the legacy resolution had also dropped an unrelated peer
(`@swc/helpers` under next-intl) and a strict `npm ci` refused that lockfile. The committed
lockfile was checked with both `npm ci` and `npm install` from clean.

`tests/unit/analytics.test.ts` holds the scrubbing rule (six cases).

## D-50 — The phone layouts are this codebase's, because the design has none

**Found by a user**, on a phone: `/registrer` laid its form out in an 8 px column beside the
sales card, one word per line. The design bundle renders every screen at 1440 px and has no
phone layout, and every check in this repository — including the pixel gate — ran at that
width, so nothing had ever looked.

**What was broken**, measured by the new `scripts/verify/mobile.mjs` at 390 px:

- Every signed-in screen scrolled sideways by 155 px: the header's controls need 444 px.
- Eight screens set their page as two columns whose right column has a 258–300 px floor, so
  the left column (the form, or the lead paragraph) was squeezed to 8–14 px: registrering,
  Samtaler, Tiltak, Oppsett, Selskap, Hjelp, Årshjulet, Måleoppsett.
- Rows with fixed columns (Målinger's rounds, locations, groups, Regelverk, the question
  set, integration cards) and the footer did the same at a smaller scale.
- The report's sheet is a fixed 8.5in page and pushed the screen 451 px wide.

**What changed, and the rule it follows.** Every change is gated below Tailwind's `md`
breakpoint (768 px), so at 1440 px the rendering is the design's exactly — checked by
capturing all eleven screens from the previous build and this one with the same data:
**0 pixels differ on every screen**. Below 768 px:

- page gutters are 16 px instead of 28;
- two-column pages and fixed-column rows stack into one column;
- the header's nav moves to its own row and scrolls sideways within itself; Hjelp and the
  assistant show their icon only, keeping their accessible names;
- the report sheet fills the width with 20 px margins, and a report table too wide for it
  scrolls inside itself. Print is untouched: paper is wider than the breakpoint.

Tables that were already wide by design (the risk picture, the team grid, the access
matrix, the roster, the import preview, the year strip) keep their horizontal scroller.

**Held in place.** CI's smoke job now runs `mobile.mjs` over every screen and the three
marketing pages, and fails on sideways scrolling or text squeezed under 48 px. Milder
wrapping — a two-word label on two lines in a table cell — is printed as a warning.

## D-51 — Member management and invitations, which the design does not have

**The constraint.** The bundle's Roller og tilgang tab is the access matrix and three
permission cards. It grants nothing: there is no list of people, no invitation, no way to
make somebody an avdelingsleder for a department. Until now the only way a membership came
into existence was sign-up (0024) for the person who registered. A second person could not
be let in, and no avdelingsleder was scoped to anything (X-020). Meanwhile the
`membership_admin_insert` policy let any daglig leder insert *any* user id into their
organisation, which could strand that person with two active memberships (review Q3).

**What was built.** Below the design's matrix and cards, and in the tab's own visual
vocabulary (panel radius, row tiles, the control and button classes the Oppsett forms
already use), a panel shown only to a daglig leder:

- **Hvem har tilgang**: every membership with name, e-mail, role and, for an
  avdelingsleder, the department. Role and department are editable; access can be removed
  and given back. Your own row has no remove button.
- **Inviter noen**: address, role, department. The result is a link shown once, with a copy
  button. Orgpuls sends no e-mail yet (D-29), so the daglig leder sends it.
- **Åpne invitasjoner**: each open invitation, with a Trekk tilbake button.

A new public page, `/bli-med/<token>`, shows the organisation, role and address. Someone
not signed in sets or enters a password there; someone signed in with the invited address
accepts; someone signed in as anybody else is told so and offered sign-out. It is excluded
from analytics like the respondent link (D-49), because the token is a credential.

**The rules live in the database** (migration 0028), not in the screen:

- no client role writes `app.memberships`;
- the token is 32 random bytes, stored as SHA-256 and shown once;
- only the invited address may accept, once, within 14 days, and not from an account that
  belongs to another organisation;
- the last daglig leder cannot be demoted or deactivated.

`member_invariants.sql` holds 26 assertions, run locally and against the hosted project.

**The shared demo is locked** (migration 0029). Everybody with the demo credentials signs in
as the same daglig leder. With invitations, any of them could invite themselves as a second
daglig leder and then remove the demo account, locking every other evaluator out. An
organisation listed in `app.member_locks` issues no invitations, and the panel says so
instead of showing the form. The list is its own table because the daglig leder holds a
table-wide UPDATE grant on `app.organizations` and could clear a column there. The lock
table has RLS enabled and no policy or grant.

**Still missing.** The design has no confirmation dialog anywhere, so none was invented
for removing someone's access; the action is reversible from the same row. Sign-up still
stores no role (D-38).

## D-52 — Recording section 6 and section 8, which the design only prints

**The constraint.** The report prints three things a person has to record: which later
round shows whether a measure worked, and the judgement on it (section 6); who was told
about the findings, how and when (section 8); and what training was held and when it is due
again (section 8). The bundle writes all three as finished prose and has no control that
could produce them. Migration 0023 added the columns and tables and the fixture seeds them,
but no screen wrote them, so for a real organisation these sections could only ever print
their empty state (D-36).

**Effect, in the Tiltak panel.** Below the design's own fields, the handlingsplan panel
gains an *Effektmåling* group. It holds a select of closed rounds (*Målt i*) and a text
field (*Vurdering*), using the panel's own control classes. The panel is closed in the
baseline, so the design's rendering does not change. The list offers only rounds that
opened after the measure's own round. That round is excluded because 0023's trigger refuses
it; earlier rounds are excluded because they cannot show the effect of something decided
later. A stored choice always stays in the list, so an unchanged save never clears it.

**Section 8, under the document on Rapport.** The register is a panel below the sheet,
classed with the report's chrome and so hidden in print. It lists the records in the exact
sentences section 8 prints, since both come from the same function, and gives each a Fjern
button. It has two forms:

- a briefing, recorded against the year's closed grunnlinje, since that is the round the
  report documents;
- a training, which belongs to the organisation rather than to a round.

It is shown to a daglig leder or a verneombud, which is who the 0026 write policies admit.
A refused write says so rather than reading as saved (`writeFailed`). A second record of the
same meeting is refused by the table's unique key and reported as such. A next review on or
before the training date is refused by the form and by the table's check.

**Not built.** Records cannot be edited, only removed and entered again: every field is
short, and the report prints nothing that an edit could preserve. The design has no
confirmation dialog, so Fjern has none (as D-22).

## D-53 — Målinger's Årshjulet card is built; D-05 is superseded

D-05 omitted the card because nothing stored a schedule. Migrations 0019 and 0020 store
one, so the card is now read from the database rather than drawn:

- the months that measure come from `wheelMonths`, the same rule the scheduler uses;
- the forankring month is the one before the grunnlinje, as on Årshjulet;
- *Neste* is the earliest round the wheel has planned and not yet opened, and is omitted
  when there is none;
- the cascade is the stored notification ladder, with audiences told on the same day
  sharing one chip, as the design groups them. The reminder's day comes from that next
  round's `reminder_day`, falling back to the schema default of 2, as Årshjulet does;
- "Endre" is a link to Årshjulet (D-06).

An organisation with no wheel row gets no card. Against the baseline the card diffs at
**26 pixels**. With it in place, every block below the round list matches at 0 pixels,
displaced only by the rows the list itself holds.

The legend's "Puls — fem spørsmål" is the design's copy, as is the Målinger lead's "fem
spørsmål, under ett minutt". Both describe what a puls is meant to be, not what any one
puls asks, and each row prints its own real question count.

**Two row fixes found on the way.** A puls row now names its factors from
`app.round_factors` ("· ytringsklima og arbeidsmengde"), as the design's row does. The
closing date carries its year only for a past year ("lukket 11. september 2025") and not
for a future one ("går ut 12. mars"), because the design prints it that way and the puls
title already carries the year.

## D-54 — Resultat's Samtaler column is built; "Hva de skrev" and the screening strip still wait

D-14 omitted the column because the two-way thread did not exist. Samtaler (0018) built
it, so the column now reads the same k-gated `public.conversations()` for the selected
round. A comment from a group under the threshold is absent here for the same reason it is
absent on Samtaler, and a reply goes through the same `reply_to_thread`, which checks the
role itself.

**As the design draws it:** three comments at most. Waiting comments come first, longest
wait first, then answered ones. Each card shows the factor's compact name, the age ("venter
· 6 dager", in red from five days, a rule now shared with Samtaler in
`lib/conversations/rules.ts`), the comment in guillemets, the latest reply, and a reply box
on a waiting comment for a viewer who may reply. "Se alle →" links to Samtaler (D-06).
Against the baseline the column's heading strip diffs at **0 pixels**. The first card
passes at 3 695 pixels, all of it the comment's own words: the fixture's longest-waiting
comment is not the first comment in the design's hard-coded list.

**Where it differs, and why:**

- **"Ledelsen svarte:", not "Du svarte:".** A reply may have been written by another
  leader, and the application cannot read another person's name (D-28 point 4). "Du
  svarte" would put words in the viewer's mouth.
- **Whole organisation only.** The RPC never returns which department a comment came from:
  that is the anonymity rule, not an omission. On a department's view the column could not
  truthfully be "the comments that belong to this selection", so it is not rendered there.
  It is also not rendered when the round has no comment that cleared the threshold.
- **The band's left track stays empty.** "Hva de skrev" remains omitted (D-14). Its count
  ("14 av 28 skrev noe") has no reader, and its theme list is empty even in the design.
  The Samtaler column keeps the design's right-hand track and width rather than stretching
  across both, which is also what makes it comparable to the baseline. On a phone it stacks.

**D-14 is closed:** the screening strip is D-55, and "Hva de skrev" is D-56.

## D-55 — Resultat's screening strip is built, from the counts section 7 prints

The strip at the foot of Resultat ("Krenkende atferd: 3 av 28 svarte ja") reads
`rpc.screening_counts`, the k-gated reader section 7 of the report prints from (0023).
The two read a "ja" by one rule, `lib/report/screening.ts`. Option 1 is "Nei" and the last
is "Vil ikke svare", everything between is a yes, and "Vil ikke svare" stays in the
denominator. Moving that rule out of the report means the strip and the document cannot
disagree. With the fixture it prints the design's own figure, 3 of 28, and the strip diffs
at **589 pixels**, all of it the sentence below.

**Differences:**

- **"Verneombud varslet 15. september." is dropped.** It is a record this product does not
  hold, the same sentence section 7 drops (D-36). The law-mode note keeps "Loven krever
  håndtering uavhengig av indeks". The other mode keeps the design's "Tre personer har sagt
  fra — det er tre samtaler som skal tas", spelled from the real count as the Innsikt lead
  now is.
- **Violence is printed beside it only when someone said yes.** The design's strip is
  krenkende atferd alone. A yes to vold eller trusler is not something to leave off this
  screen, and "0 av 28" under it would be noise.
- **Whole organisation only.** The RPC has no group parameter, deliberately: screening
  counts are never broken down. On a department's view the strip would print the whole
  organisation's count under a department's heading, so it is left out there, as the
  Samtaler column is (D-54). It is also absent for a round that did not ask about
  krenkende atferd, and when the round is under the threshold.
- **"Åpne rutinen" goes to Tiltak**, where the design sends it. The organisation's own
  varslingsrutine is not a document this product holds.

"Hva de skrev" followed as D-56, which closes D-14.

## D-56 — "Hva de skrev" is built, grouped by factor rather than by topic; D-14 is closed

**What it reads.** `public.comment_themes` (migration 0030) is the first reader of
`app.response_comments` that returns numbers instead of a comment. It returns only these
counts: how many responses the round has, how many of them wrote something, and, per
factor, how many comments, from how many people, and how many hang on a low, middle or
high answer. It returns no text, no response id and no group. `comment_theme_invariants.sql`
holds 13 assertions, run locally and against the hosted project. Weakening the theme rule
to k-1 makes assertions 7 and 8 fail.

**Three k rules:**

- Access is `conversations()`'s: a daglig leder reads the whole organisation, an
  avdelingsleder their own department, anyone else nothing.
- The round in scope must clear `app.k_threshold`, or no counts come back at all.
- A factor becomes a theme only when k *different people* wrote about it. That is the
  design's own rule ("Under fem kommentarer i en gruppe vises de ikke gruppert"), counted
  in people, because one person may comment on all three statements of a factor.

**Where it differs from the design:**

- **Grouped by factor, not by topic.** The design's themes ("Oppfølging av avvik",
  "Bemanning i høysesong") are topics someone read the text to find. Nothing here reads
  the text, and a label invented for a group of comments would be a claim about what
  people wrote that nobody checked. The factor is a grouping the data already holds,
  because every comment hangs on one of its statements. A row reads the factor's name,
  "{n} kommentarer fra {m} personer", and a tone.
- **The tone is counted, not judged.** Two thirds or more of a theme's comments on answers
  of 1-2 is Negativ, 4-5 Positiv, 3 Nøytral; anything else is Blandet, the design's word
  (`themeTone`, unit-tested). The colours are Samtaler's, now shared in
  `lib/conversations/rules.ts`.
- **The count line's second sentence is replaced.** The design's "Gruppert automatisk,
  aldri sitert ordrett uten at teksten er sjekket for gjenkjennelige detaljer" is untrue
  here twice over: nothing groups automatically, and the Samtaler column beside it does
  quote comments word for word. The screen says what does happen: "Gruppert etter faktor.
  En faktor vises først når minst 5 har skrevet om den."
- **Whole organisation only**, as the rest of the band is (D-54, D-55). It is absent for a
  verneombud, whom `comment_themes` refuses as `conversations()` does.

**Pixel evidence.** The column heading diffs within budget at 2 579 pixels, all of it the
two sentences above. With the fixture, 7 of 28 wrote something and no factor has five
writers, so the theme list is empty, as it is in the baseline. Neither data set has a
factor that reaches the threshold, so no theme row has been seen rendered against real
data. Its rule is proved in SQL (assertion 9) and its tone in unit tests.

**Seen since.** The demo organisation now carries enough 2026 comments to reach the
threshold on two factors: six complaints about workload across five departments, and five
people praising their colleagues, each on one of the highest answers to that statement.
Each has its own thread, as every comment does in the product. Reseeded on the hosted
project on 2026-09-23 with the user's approval. Signed in as the demo login, Resultat
shows "13 av 55 skrev noe" and two themes: Arbeidsmengde og tidspress (6 people, Negativ)
and Støtte fra kollegaer (5, Positiv).

## D-57 — The header shows who is signed in; the role selector cannot switch

**The account chip** prints the viewer's initials from their own `app.profiles` row, which
`profile_self_read` restricts to exactly that row: "TB" for Tuva Berg, "D" for
Demobruker. A profile with no name gets an empty chip, not letters that belong to nobody,
which is what the hard-coded "TB" was.

**The role selector** is set to the role the viewer holds, read by `viewer_role()` from
the verified token (0027). The design's selector does more: "Bytt rolle … for å se
nøyaktig det avdelingslederne og verneombudet ser" switches the whole product to another
role's view. That cannot be built honestly. Every reader is scoped in the database by the
signed-in account (0022), so a client-side switch could only relabel the viewer's own data
as someone else's view. A real "view as" would have to let one account read with another's
permissions. So the other roles stay in the list, as the design lists them, but disabled.
That says plainly they cannot be switched to, and it keeps the control the design's width:
with one option the select narrowed and shifted the header by 2 067 pixels on every
screen. With the options kept, the header diffs at 0 again. An account with no role gets no
selector.

## D-58 — Målinger's buttons open real screens, and "Forhåndsvis som ansatt" is a preview

Four buttons on Målinger were drawn and did nothing. Each now goes where the design sends
it, as a link (D-06):

- **"Forhåndsvis som ansatt"** and each coming round's **"Forhåndsvis"** open
  `/forhandsvis`: the respondent screens, as a signed-in leader sees them.
  `/s/[token]` builds its form from `respond_form`, which needs an invitation's token, and
  there is no such thing as a preview token (D-34). So the preview builds the same form
  from what a leader can already read (the round's factors and extra questions, the same
  tables `respond_form` reads) and renders it with the same `RespondFlow` and the same
  strings, shared through `lib/respond/questions.ts` so the two cannot drift. It writes
  nothing: a banner says so, and the last step ends the preview instead of submitting.
  The one difference is order. `respond_form` shuffles statements per token, and the
  preview has no token, so they come in the instrument's order and the end screen says so.
  With no round asked for, it previews the round employees would meet next: the open
  one, else the next planned, else the latest closed.
- **"＋ Ny måling"** opens the setup of the next round the year wheel has planned. In
  this product the wheel creates rounds and Måleoppsett shapes them, so that is where a
  new measurement is made. There is no separate "create a round" flow for it to open.
- **"Måleoppsett" / "Se måleoppsettet"** on a closed round open that round's setup.

## D-59 — Innsikt's year rail has the design's five points, from rows

D-25's second point is superseded. The rail read three points because nothing stored the
other two. Now:

- **Forankring** is the § 9-2 consultations recorded on the kartlegging's round in
  Måleoppsett, drawn when any is confirmed: dated by the latest meeting, captioned by
  who was consulted ("Verneombud og tillitsvalgte"), and labelled "Oppstart" outside law
  mode, as the design labels it. The fixture's consultation is dated February, so Nordvik
  reads "FEB Forankring", as the baseline does.
- **The next round** is the one open now, dated by when it closes, or else the next one the
  wheel has planned, dated by when it opens.
- **The one after** is the following planned round. A puls is what measures whether the
  measures worked, so a puls is captioned with the design's "virket tiltakene?". Its label
  is the round's own title, not the design's "Effekt målt", which would claim a
  measurement that has not happened.

A point with no row behind it is left out, as before.

## D-60 — Måleoppsett's schedule blocks are built from the year wheel; D-27's blocks 2 and 3 are superseded

D-27 left three blocks out because nothing stored a schedule. The year wheel does (0019,
0020) and plans rounds, so the two that waited on it are built. Block 1, "Tid — ca. 5
minutter å svare", stays out: nothing measures how long a respondent takes. Block 4, "Når
skal pulsen stoppe", stays out: no column holds a stopping rule.

**"Neste: september 2027"** is the first line of the summary panel's bordered block, as the
design places it, read from the round: a round being configured before it opens gives its
own date; otherwise it is the next round of that kind the wheel has planned. A puls reads
the design's other form, "Første utsending: 1. desember kl. 09.00", from the planned
round's opening time in Europe/Oslo. Nothing planned prints "Ingen grunnlinje er planlagt
ennå.", never the design's literal.

**"Planlegg grunnlinjen".** The design's CTA plans the round and then shows "Grunnlinjen er
planlagt for september 2027." Here the wheel does the planning, so when a round is planned
the panel is followed by that post-click state, in the design's own mint box, because it is
true; a 46px button labelled "Planlegg grunnlinjen" over a plan that already exists would
promise an action it cannot perform. When nothing is planned, the CTA is rendered as the
design draws it (h46, radius 12, 15px bold; not a size in the Button scale, so transcribed)
and links to Årshjulet, where planning happens. A puls reads "Pulsen er planlagt." rather
than the design's "aktivert", which would claim that pressing something activated it.

**Section 4's cadence set.** A grunnlinje keeps its one "Årlig" chip (D-27's reasoning
holds: one per year by construction). A puls shows the wheel's pulse cadences with the
design's labels, "Kvartalsvis" and "Månedlig", the wheel's current one selected. Picking one
writes the wheel through Årshjulet's own `saveWheel`, so it changes every puls's rhythm,
not this round's alone, and the chips say so in a line beneath. `wheel_write` admits daglig
leder only, so the chips are disabled for anyone else. The design's "Hver 2. uke" and
"Hver 4. uke" have no wheel cadence and are not offered. The summary's Rytme row reads
"Kvartalsvis · 4 runder i året", the count from `wheelMonths`, the scheduler's own rule.
Verified round-trip against the hosted project: Månedlig persisted across a reload as
"Månedlig · 11 runder i året" (twelve months less the fellesferie), then Kvartalsvis was
restored; the planned rounds were unchanged after.

**Two flaws found on the way.** "Mottakere" read "0 av 34 ansatte" on a puls, because the
headcount came from the previous round of the same kind and no puls had closed; it now
falls back to the roster's count per group. "Alle 11 faktorer" is spelled "Alle elleve
faktorer" as the design writes it, by the ICU exact selectors D-26 now uses.

**Pixel evidence.** The panel sits where the design puts it (offset 0). Its head diffs at
265 pixels (the design's "37 spørsmål" against the real 33). Below the missing "Tid" row
everything sits 26 px higher, and compared there the rows "Mottakere…Rytme" diff at **0**,
the legal box at **0**, and the bordered lines at 473, which is the fixture's "Ingen
påminnelse" against the design's "Påminnelse dag 2". The design's yellow CTA under the
panel is the mint planned-state box here, by the reasoning above.

---

## D-61 — The playbook: three suggested measures per factor, adopted with one press

The design of 2026-09-24 attaches to every factor an evidence line and three measures a
leader can take — under the open factor row on Resultat ("Slik kan dere løfte dette" /
"Slik holder dere det der", bundle 846-865) and on Tiltak as "Forslag fra resultatene"
(1810-1843), with a "Gjør til tiltak" button that turns into "Lagt til i Tiltak ✓".

**Where the content lives.** The prototype holds it in a `PLAYBOOK` constant. Here it is
data in two halves: the shape in `lib/playbook/registry.ts` (factor, ordinal 1-3, kind,
and which statement the effect is read on) and the words in `messages/*.json` under
`playbook.*`, Norwegian verbatim from the bundle, English translated. Adding or changing a
suggestion is a registry row and its message keys.

**"Følg med på: «…»" is a statement, not a sentence.** Every one of the 33 lines the
design writes after "Følg med på" is one of the instrument's own statements, word for
word. So the registry stores a statement ordinal and the screen prints
`factor.<key>.s<n>` — the one place that wording exists — instead of a second copy that
would drift the day a statement is corrected.

**"Lagt til i Tiltak ✓" is a fact, not local state.** Migration 0031 adds
`app.measures.playbook_key` (`<factor>.<n>`, checked by shape), unique per organisation
where set. `adoptPlaybookMeasure` writes the suggestion's title, and as the goal the
design's own sentence — how it is done, and the statement its effect is measured on —
with the key; the screens read the key back from the organisation's measures, so a
reload, a colleague and this tab all agree. A second press during a slow round-trip meets
the unique index and is answered as success. Deleting the measure offers the suggestion
again. `supabase/tests/playbook_invariants.sql` holds the rule (8 assertions);
`tests/unit/playbook.test.ts` holds the registry to the messages.

**What the bank does without results.** The design sorts the chips by index and opens the
lowest. When no round has closed, or the latest one is under the threshold, there are no
indices: the chips stand in the instrument's order without a score pill and the lead
says so (`playbook.bankLeadNoScores`), rather than printing a number nothing measured.
Which chip is open is in the URL (`?forslag=`), like the filters above the list; only
"Skjul forslag" is local.

**Not built:** the prototype's "Vurder risiko" button on the factor row is unchanged (it
still leads nowhere new); the playbook's colour for the Lederpraksis pill, `#EFE6D2`,
is a new hex in the bundle and is added to the tokens as `sand`.

---

## D-62 — Utløsere (event-triggered measurements) are not built

The same design adds a fourth card to Årshjulet, "Utløsere" (bundle 1411-1462): two
switches — "Nyansatte etter 30 og 90 dager" with a choice between an anonymous
measurement that accumulates until five have answered and an "åpen oppstartssamtale"
where the new hire answers by name, and "Prosjektstart og prosjektslutt" with a list of
upcoming projects — plus a warning that six of 34 employees have no start date.

Nothing in the schema can back any of it yet, and a switch that stores a preference
nothing acts on would be the fake value CLAUDE.md forbids. What it needs, named:

1. **A start date per employee** (`app.employees` has none) and somewhere to enter it —
   the design's "Legg inn startdato" points at Oppsett › Ansatte, whose form has no such
   field in the bundle either.
2. **Projects**: a table of projects with a team, a start and an end, and a source for
   them. The design lists "Fjordbrua — oppstart" and "Rv. 13 Øvre — avslutning" but gives
   no screen that creates a project; the only plausible origin is an integration.
3. **Two short instruments** ("seks spørsmål om rolleklarhet, opplæring og tilhørighet";
   "fire spørsmål om rolleklarhet, prioritering og samarbeid") as data, with their own
   round kind, and a tick that opens a per-person round at day 30 and day 90 and pools
   answers until k — a rolling round the k gate has no notion of today.
4. **Named answers.** The "åpen oppstartssamtale" mode stores who answered what. That is
   not a variant of `app.responses`, which by invariant 2 has no column that could hold a
   person; it is a second, non-anonymous response path with its own table, consent text
   and retention. It is a product and privacy decision to take explicitly, not a mode to
   add under a card.

The card is omitted; the three cards above it are as before. The new design file is the
reference for everything else, so the Årshjulet baseline is re-captured from it and the
region below "Unntak og eskalering" is the documented gap.

---

## D-63 — The design of 2026-09-24 replaces the reference; two copy corrections ride along

`design-reference/orgpuls/Orgpuls.dc.html` is the file received on 2026-09-24;
`Orgpuls_Offline_Source.html` is the same file with the Google Fonts link swapped for
`/fonts/fonts.css`, which is the only transformation the offline copy ever had (D-07). The
twelve baselines are re-captured from it with the prototype's own runtime, at 1440 px,
full page, from a cold load and the same navigation as before; the pipeline was checked
first by re-capturing the previous file and diffing against the committed baselines,
which came out at 0 pixels. The captures live in the same files under the same names.
Three of the old ones (Årshjulet, Hjelp, Integrasjoner) had been taken mid-scroll, with the
sticky header baked in a third of the way down the page; the new set has the header at
the top on every screen, which is also how `shoot.mjs` captures the app.

Besides the playbook (D-61) and Utløsere (D-62), the design changed two things in the
copy, both applied:

- **"Data i EU", not "Data i Norge."** The footer chip and the tagline said Norway. The
  project's Supabase region is eu-central-1 (Frankfurt), so the old chip was a false
  statement on every page and the new one is the true one. The key is renamed
  `footer.dataEu`; the Personvern tab's own sentence about where data is stored was already
  EU-neutral and is unchanged.
- **No industry benchmark.** "…og mot bransjen" is dropped from the instrument lead and
  the Måleoppsett factor note; the design's own header line now reads "Grunnlinje 2025: 64"
  where it read "Bransjesnitt anlegg: 64", which is what this app has printed since D-46.
  Oppsett › Selskap still says the industry comparison is not connected, which remains
  true.

Unchanged from the design and not adopted: the help button's in-page drawer with three
articles per screen (the app's help button opens the help site, as the previous design
did) — logged as an open item, not a deviation, since nothing is misrepresented.

---

## D-64 — A favicon, from the mark

The bundle ships no favicon: its `favicon.ico` is a 71-byte 1×1 placeholder, and the app
had been serving that same file, so the tab showed the browser's default. The design does
have a mark — the header's 30 px rounded square with the pulse glyph and trailing dot,
which `components/shell/Logo.tsx` transcribes — and a favicon is that mark and nothing
else.

`app/icon.svg` draws it at 32 × 32 with the frame filling the tile: the radius keeps the
mark's 9/30 proportion, the border its 1.5/30, and the glyph is the bundle's own path,
scaled and centred. `scripts/icons/render.mjs` renders it with Chromium to a real
`app/favicon.ico` (16 and 32 px) for the browsers that still ask for one, and to
`app/apple-icon.png` (180 px) on the app canvas, since iOS composites nothing behind a
home-screen icon. Next.js serves all three from their file names and writes the link tags.
Regenerate the rasters with the script whenever the SVG changes; nothing is drawn by hand.

Not done: a web manifest and a maskable icon. Nothing installs the app yet, and a manifest
would name a theme colour and a display mode the design has not chosen.

---

## D-65 — Mail is sent: the outbox dispatcher and Auth's mail, both through Brevo

D-29 recorded that the year wheel queued notices and nothing sent them, and that Auth's own
mail ran on Supabase's built-in sender: two messages an hour, linking to
`http://localhost:3000`. Both are closed. Brevo (EU-hosted, one account for e-mail and later
SMS) sends from `no-reply@orgpuls.com`; the domain is authenticated there with DKIM and
DMARC.

**The outbox.** Migration 0032 gives it a sender's half in the database and
`supabase/functions/orgpuls-dispatch` the other. pg_cron posts to the function every five
minutes through pg_net, with a secret of its own held in Vault (not the service-role key).
The function claims a batch, renders, sends and reports each row. Four rules:

1. *A lease, not a mark.* 0020's `mint_invitation_link` marked a row sent before anything was
   delivered, so a failed send stranded that person. A row is now claimed for ten minutes
   and marked sent only once Brevo has accepted it; delivery is at-least-once.
2. *The link is minted at claim and stored nowhere*, as before. A reminder or a retry mints a
   new token, which replaces the previous one, and the reminder says so ("Lenken i den
   forrige virker ikke lenger"). Keeping every earlier link alive would need several hashes
   per invitation — a change to the respondent write path, not made here.
3. *Nothing stale is sent*: an invitation for a closed round, a reminder to someone who has
   answered, a "starts on …" for a round already open, a result notice more than 14 days
   late. Each is marked failed with its reason.
4. *Nothing goes to a fictional address, and an organisation can be switched off.*
   `organizations.mail_enabled` defaults to on; organisations whose every address is under a
   reserved test domain start off, and those domains are refused per recipient besides. Both
   demo organisations are off, so their 73 queued reminders stay queued. Mail to a domain that
   cannot exist bounces, and bounces are what spoil a new sender domain.

A rejected key stops a run and gives every unsent claim back without spending an attempt; a
row is given up after five failed attempts. Log lines carry row ids and HTTP codes, never an
address or a link. `sent_at` means *accepted by Brevo*, not delivered: bounces are not
reported back yet.

**Who a notice reaches.** An invitation or reminder: that employee. A notice to a role:
the members holding that account role, and "alle ansatte" by the round's own scope. Only a
member, who can sign in, gets a link into the app; nobody gets a respondent link but the
respondent. **Not reached: employees whose only claim is a statutory duty** (a tillitsvalgt,
or a verneombud without an account). 0021 made `employees.duty_role` a tripwire — no policy
and no routine may read it (settings_invariants 5) — and picking recipients is a routine.
Relaxing that invariant is the owner's decision, so until it is made a notice to
"tillitsvalgte" finds nobody and fails as `no_address`, visibly, in the queue.

**Auth's mail** goes through a send-email hook, `supabase/functions/orgpuls-auth-mail`,
verified by a Standard Webhooks signature. It builds its own link to `/auth/confirm`, which
verifies the token hash on the server and sets the session; a reset then lands signed in on
`/nytt-passord`, a page that did not exist (the reset mail used to lead nowhere). Handled:
recovery, sign-up confirmation, magic link, invite; e-mail change and reauthentication have
no screen here and are refused. Auth's Site URL is now `https://www.orgpuls.com` with the
production and local origins allowed, and its mail limit is 30 an hour.

**Texts** are messages like any other: `mail.*` in `messages/no.json` and `en.json`, held to
parity by `verify:i18n`. `scripts/functions/deploy.mjs` generates the functions' copy from
them, type-checks both functions with Deno and deploys through the Management API.
`tests/unit/mail.test.ts` runs the same renderer against the same files; the invariants
suite `dispatch_invariants.sql` (18 assertions) holds the database half.

**Screens.** Oppsett › Integrasjoner now shows the design's own locked e-post row ("Alltid
på", "Ingenting å sette opp") where mail is on, with the real sender address — the design
wrote `orgpuls.no`, which has no mail set up. Where mail is off it says "Slått av" and that
nobody receives the notices. `/integrasjoner` and Årshjulet's summary follow the same switch,
and the queue counts now separate *waiting*, *sent* and *given up*. The e-post card on
`/integrasjoner` no longer lists what connecting would require — a provider, a verified
sender, a job that empties the queue — because all three exist; it says on or off.

**Verified on the hosted project:** both functions refuse unauthenticated calls (403, 401);
Brevo accepts the sender in its sandbox; the first scheduled call at 10:05 returned 200 and
claimed nothing, as both organisations are switched off; a password reset requested for the
demo login went Auth → signed hook → reserved-domain guard, logged and not sent.

**Found on the way, not changed:**
- Neither `orgpuls.no` nor `orgpuls.com` has an MX record, so `hjelp@orgpuls.no`, which the
  app prints in five places, cannot receive mail. The mails say they are automatic.
- The Supabase project carries an edge function `mail-worker`, its two Vault entries
  (`mail_worker_url`, `mail_worker_secret`), the `pgmq` extension and three function secrets
  (`MAIL_FROM`, `MAIL_FROM_NAME`, `NEXT_PUBLIC_APP_URL`) from an earlier product, HeiTuva,
  deployed 10 September. The function authenticates callers with a database function that no
  longer exists, so it refuses every call; nothing schedules it. Left in place for the owner
  to delete.

**Not built:** SMS (no employee has a number, and the sender name is not registered yet);
member invitations by mail (the daglig leder still copies the link, D-51); bounce and
delivery events (the webhook would need a public endpoint and a table for them).

---

## D-66 — SMS: the design's connection screen, on the same dispatcher

The design draws SMS as a connection screen reached from Oppsett › Integrasjoner: 1 ·
mobile numbers, 2 · sender and message (with a character counter and a phone-shaped
preview), 3 · when SMS is used — "Bare de uten e-post", "Bare som påminnelse", "Alle" —
and "Aktiver SMS" / "Koble fra". D-35 dropped it while nothing stood behind it. It is
built now, at `/integrasjoner/sms`, and every control on it is real.

**Data (0033).** `organizations.sms_enabled` (off by default: every message is billed),
`sms_when` and `sms_text` (null means the default text, so a better default reaches everyone
who never wrote their own). `employees.phone` must be E.164; the app normalises what people
type — "912 34 567", "+47…", "0047…" — and refuses rather than guesses anything else: an
eight-digit number counts as Norwegian only in the mobile ranges (4 and 9), because a
landline cannot receive an SMS and a guessed country sends a survey link to a stranger.

**The rule the claim applies**, for the two messages that carry a respondent link: SMS when
SMS is on, the person has a number and the mode says so ("alle" always, "påminnelse" for a
reminder, "uten e-post" when there is no address); otherwise e-mail; and SMS when there is
no address but a number — nobody is left without the survey, which is the design's own
promise ("Uten nummer får personen e-post i stedet"). Notices to a role stay e-mail. The
number is handed to the function only when SMS may carry the link. The outbox records which
channel carried each message. `dispatch_invariants.sql` now holds 28 rules, one per branch.

**Sending.** Brevo's transactional SMS API, sender "Orgpuls". An SMS that cannot be sent —
no credits, an unregistered sender, a refused number — falls back to e-mail with the same
link when the person has an address; a rejected key stops the run as for e-mail. Segments
are counted the way operators bill them (GSM-7, where æøå are ordinary characters: 160,
then 153 per part; 70/67 when a character forces unicode). A reminder always uses a fixed
text that says the previous link no longer works, whatever the organisation wrote for the
invitation.

**Numbers into the register.** A Mobil field on the manual form, and a fifth column (E) on
the paste import, flagged in the preview when a number cannot be used. A pasted row whose
e-mail already belongs to someone gives that person their number and changes nothing else —
that is how an existing register gets its numbers without duplicates. The Personvern tab's
list of what is stored now names the mobile number.

**Three differences from the design, each because the design's value cannot be true here:**
- *Sender.* The design's field is free text (11 characters). Every sender name must be
  registered with the operators before it can be used, so the field shows "Orgpuls",
  read-only, and says why. A free-text name would fail on every message.
- *Price.* "0,49 kr per melding · ≈ 4,41 kr per utsending" is a number nobody measured.
  The line counts what is real: messages per round from the register, times billed SMS
  per message from the text — "≈ N SMS".
- *Link.* The design counts a 17-character short link (`orgpuls.no/n/7fK2`). The real link
  is the personal one, 90 characters, and the counter counts it — so the default text is
  two billed SMS. Shortening it means a shorter respondent token, which is a change to the
  respondent credential and is not made here.

**Also on the way:** the Oppsett SMS row now carries the design's "Sett opp" /
"Innstillinger" button (the only row that does: the others still have nothing behind them),
and `/integrasjoner` links to the screen instead of listing what SMS would need.

**Verified on the hosted project:** the screen opened from the Oppsett row; a mode, the text
and "Aktiver SMS" persisted across a reload and were restored; a drain ran with the new
claim. **Not verified: a real SMS.** The Brevo account had no SMS credits at first (600 were
added the same day, confirmed by the probe), and whether "Orgpuls" is registered as a sender
cannot be read from the API. **Verified the same day:** one test SMS through the
dispatcher's `?probe=sms` route (secret-guarded; the number is used once and never logged)
was accepted by Brevo and received on the owner's phone with the sender "Orgpuls". A second
route, `?probe=smsstatus&id=…`, returns Brevo's delivery events for one message by id,
without the number. Should the sender ever be refused, an organisation with SMS on still
gets its links by e-mail — the fallback — and the refusal is in the dispatcher's log.

**The HeiTuva leftovers named in D-65 are deleted** (2026-09-24, at the owner's request): the
`mail-worker` function, its two Vault entries, the `pgmq` extension (no queues, nothing
depending on it), the secrets `MAIL_FROM`, `MAIL_FROM_NAME` and `NEXT_PUBLIC_APP_URL`, and
three empty storage buckets (`org-logos`, `report-exports`, `survey-media`) that predate
this repository and are referenced nowhere in it. The Brevo account still lists the
unauthenticated domain `heituva.com`; that account entry is the owner's.

---

## D-67 — Design 3 sits next to the current reference until its screens are built

`design-reference/orgpuls/Orgpuls_v3.dc.html` is the design received on 2026-09-24.
`Orgpuls_v3_Offline_Source.html` is the same file with the Google Fonts link swapped for
`/fonts/fonts.css`. That is the only transformation, as for D-07 and D-63; the two differ
by that one line.

**Why beside, not in place of, the reference.** D-63 replaced the reference in place,
because that update touched two screens. This one changes almost every screen and is
built over nine phases. Until a phase rebuilds a screen, that screen is still the previous
design's and is still gated by `baselines/`. The v3 set becomes the reference screen by
screen, and replaces the old files in P8.

**`baselines-v3/`:** 31 states captured by `scripts/verify/baseline-v3.mjs`, from a cold
load, by pressing the design's own buttons.
- 22 full-page states:
  - Enkel and Full;
  - every tab of Målinger and Resultater;
  - Kommentarer, Tiltak Tavle and Liste, Oppsett;
  - Innsikt as verneombud and as avdelingsleder;
  - the side layout expanded, collapsed and on Resultater;
  - Hjelp;
  - Oversikt at 390 px.
- The wizard's nine steps, captured at the viewport, because the wizard is a fixed
  overlay.
- **Serving root.** The prototype is served over HTTP with the files it loads next to it:
  - `support.js`, `doc-page.js`, `image-slot.js`, `tuva/`, `fonts/`;
  - `cdn/react.production.min.js`, `cdn/react-dom.production.min.js` and
    `cdn/babel.min.js` (React 18.3.1 UMD, Babel standalone).
- **Pipeline check.** Before capturing, the pipeline was checked the way D-63 checked
  it: it re-captured the current reference's home screen and diffed that against
  `baselines/01-innsikt-home.png`, which gave 0 pixels. A second capture of a v3 state
  matched the first.

Three things in the design itself, recorded so a later phase doesn't treat them as ours:
- At 390 px Oversikt is 444 px wide: the prototype overflows horizontally at phone width.
- Historikk labels Puls mars 2026 "−3 fra forrige puls", but 53 against 50 is +3.
- Spørsmålssett uses a narrower content column than the other Målinger tabs.

---

## D-68 — A group with enough answers can be withheld to protect a smaller one

**Design:** the Varmekart prints every group with at least five answers. In 2026 that is
Drift, Prosjekt and Verksted, with only Administrasjon (3 svar) as "—".

**Built:** Administrasjon *and Drift* are withheld in 2026. Drift says why: "{group} har nok
svar (8), men tallene holdes tilbake…". The heatmap legend gains one sentence. The report's
threshold paragraph names the protected group next to the one under the threshold.

**The constraint (0034, decision D1).** The organisation's figure includes every
response, and the parts published beside it add up to it. So the whole minus the published
groups is the hidden remainder:
- in the fixture that is Administrasjon's three people, recoverable to about ±3 points;
- for a group of one it is about ±9 points, against answer steps of 8.3, which is close to
  that person's answers.

The release rule withholds the smallest released groups until the remainder is 0 or at
least k:
- the order is by count and then name, never by score;
- the decision is made over the whole organisation, then filtered by the caller's scope;
- an avdelingsleder of a protected department gets `protected` from `results_summary`
  too.

`comment_themes` now counts only comments that `conversations` releases. Its counts
minus the visible threads had given away a withheld group's comments and their tone.

`suppression_invariants.sql` proves it on a group of one, including the reader's own
subtraction. It also checks every round in the database, both fixtures included.

---

## D-69 — The fixture carries the design's history, with three figures it cannot reach

The generator now emits every closed round the design prints:
- the grunnlinjer for 2023, 2024, 2025 and 2026;
- the pulses for May 2025, August 2025 and March 2026.

Each round gets its index, response rate, nine-factor values and "Anbefaler oss". Where the
design prints team values (2026's Varmekart and the three pulses), each group gets its own
answer sum, solved backwards so group and company figures both land exactly.
`design_figures.sql` checks all of it in CI.

What the design does not state, the fixture chooses, and says so:
- the group splits behind the totals;
- kontakt and integritet for 2023/2024, set so the 11-factor index lands on 60 and 63;
- screening answers for 2023/2024.

Three figures cannot be produced by whole answers:
- **2026 Drift emosjon 62.** With eight answers a group moves in steps of 25/24 and 62
  falls between two of them. The figure is omitted, and the row is withheld in 2026 anyway
  (D-68).
- **"Anbefaler oss" +22 and +8.** No whole number of 28 people gives +22. The fixture has
  one respondent skip the question (27 answers: 11 for, 5 against). 2023's +8 needs 13 of
  19 answering.
- **Administrasjon answers in full in every puls.** With three or four answering, the
  release rule would withhold Verksted, whose puls values are the design's whole story.

**Reseeded on the hosted project on 2026-09-24**, with the owner's go-ahead: the
generator deletes and re-inserts the fixture organisation's rows, which on a remote project
is a bulk delete. The wheel was then wound once, as CI does. `design_figures.sql` passes
against the live data.

---

## D-70 — Design 3's shell: six screens, Enkel/Full, the side layout (P1)

**Built from the design:**
- the nav: Innsikt · Målinger · Resultater · Kommentarer (with a badge) · Tiltak · Oppsett;
- one Hjelp button with Tuva's face, opening a panel with Hjelp, Grunnlag (og lov) and Tuva
  as tabs;
- the layout toggle, and the side layout: a 220px rail that narrows to 62px, with the page
  column at full width and the screen's name in the bar;
- the Enkel/Full switch: Enkel's nav is Oversikt and Oppsett;
- the footer's new Produkt column.

**Pixel checks.** Against `baselines-v3` at 1440px, **0 pixels differ** in each of these:
- the top header on Innsikt, Resultater and Kommentarer;
- the Enkel header;
- the side rail, expanded and narrow;
- the side layout's bar;
- the footer in both layouts;
- the three panel tabs.

From P1 the shell is gated against `baselines-v3`. The body of a screen not yet rebuilt is
still gated against `baselines/`, where the old header and footer are now expected to
show as unmatched blocks in `regions.mjs`.

`scripts/verify/shell-behaviour.mjs` checks what pixels cannot show:
- persistence across reloads;
- Enkel from another screen;
- keyboard order with a visible focus ring at every stop;
- the panel by keyboard;
- the phone width.

Where the build differs from the design, and why:

- **Resultater and Kommentarer are new addresses for the current screens.** `/resultat`
  and `/samtaler` answer with a permanent redirect (308, query kept), because links to
  them are in mail that has already gone out. P3 and P4 rebuild the screens behind the new
  addresses. `/arshjulet` stays a screen of its own until P5 gives Målinger its Årshjul
  tab. The plan had it redirected in P1, but it would have had nowhere to go.
- **Nobody starts in Enkel yet.** The design starts a daglig leder of a small organisation
  there (fewer than 50 employees). Enkel's landing page is Oversikt, which is P2. Until
  then the switch works and is remembered, but the default is Full.
- **Preferences are cookies, read on the server.** Layout, rail and view are conveniences,
  not data. A cookie gives the first paint the right layout without a flash and without a
  database read on every page. Unknown values fall back to the defaults.
- **No side layout on a phone.** Below `md` the rail is not drawn and the bar shows the top
  nav: a 220px rail on a 390px screen leaves no page. The layout toggle is hidden there.
- **The badge is a count of `conversations()`'s own rows** (0036, SECURITY INVOKER). So it
  can never count a comment its reader could not open. A verneombud, who reads no
  comments (0022), gets no badge.
- **The panel's tabs are pressed-state buttons in a labelled group**, not ARIA tabs. The
  design draws them as a segmented control, and a tab pattern without arrow keys and a
  tab panel would be half a pattern. The rendering is unchanged.
- **The rail's brand is a link to Innsikt** (the prototype's `goHomeNav` button). This is
  D-06's substitution.

**The design's comments moved into the fixture now rather than in P4.** The badge must
count real rows, and the design's badge reads 10: "10" is wider than the fixture's old
"4", and every nav entry after it moves. The generator now holds the design's eighteen
comments (ten waiting, eight answered), with two exceptions:
- **Two comments can't hang where the design puts them.** It files a comment on mening
  under Puls august 2025 and one on leder under Puls mai 2025. Those pulses asked about
  ytringsklima and arbeidsmengde only, so both go to Grunnlinje 2025.
- **Some answers move to match a comment's tone.** A comment's tone chip is the writer's
  own answer, so each comment sits on an answer in its tone's band. Where the fixture had
  none, one answer moves into the band and another on the same statement moves back by the
  same step. Every index and statement sum stays exact, and `design_figures.sql` still
  passes.

The hosted fixture was reseeded with it (the owner's go-ahead for the fixture reseed,
2026-09-24).

---

## D-71 — Oversikt, and Enkel as a small organisation's default (P2)

**Built:** design 3's Enkel landing page at `/innsikt`. Enkel is now the default for a
daglig leder of an organisation with fewer than 50 employees. A choice stored in the
cookie always wins.

Oversikt shows:
- the sentence about the latest grunnlinje;
- the index, the change from last year and the response rate;
- every factor as a bar, lowest first;
- "Gjør dette nå": the measures decided or running;
- "Venter på svar fra deg": the two oldest waiting comments, with the inline reply;
- Kommende målinger;
- Lag rapport;
- the law line.

Its links into screens only Full has switch to Full on the way, as the prototype does.

**Pixel checks** against `baselines-v3/01-oversikt-enkel.png`:
- **0 px:** the header, kicker and headline; "Gjør dette nå"; "Venter på svar fra deg".
- **12 px:** the law line's ✓, a fallback glyph one pixel lower.
- `scripts/verify/cardmatch.mjs` compares each card at the offset where it sits, because
  the area card above is taller.

`scripts/verify/oversikt-behaviour.mjs` checks:
- the default view;
- the checklist's writes, by mouse and keyboard;
- the reply;
- the links into Full;
- 880/1040px in the two layouts;
- a phone with no horizontal scroll.

The design itself overflows to 444px at a 390px width.

Where the build differs, and why:
- **Eleven area rows, not nine.** The rows are the factors the grunnlinje measured, and the
  fixture's measures eleven (D-69).
- **Area names.** They are the design 3 result screens' own (`factor.<key>.name`):
  "Medvirkning", "Mening og anerkjennelse".
- **No "Veiviser" link yet.** The wizard is P7; the link arrives with it.
- **Kommende målinger shows the planned rounds as they are.** They open on the 1st, and
  each note gives the round's real question count and factors ("9 spørsmål om
  ytringsklima, arbeidsmengde og støtte fra leder"). The design says the 12th and "Fem
  spørsmål". The footer line gives the ladder's real lead ("13 dager før de ansatte"),
  not the design's "to dager".
- **"Lag rapport" drops "på fire sider".** The report is not four pages, and the sentence
  would be a claim about it.
- **The checklist writes.** In the prototype the box only strikes the line through. Here
  checking marks the measure carried out (`gjennomfort`, dated today), and unchecking puts
  it back; the write is conditional on the current step. It is not closing: a measure
  still closes only once its effect is measured (0015). The row stays struck through for
  the visit, as drawn.
- **The two oldest comments are the design's two.** The fixture gives same-age comments
  an hour's order, so the choice does not depend on ids.
- **Placeholders are #8A8272 everywhere.** Tailwind's preflight rule
  `input::placeholder` had outranked the global `::placeholder` since the start, and
  every field showed #9CA3AF. Found by the gate on this screen.
- **Every screen takes the full page column.** In the prototype each screen is a flex item
  with auto margins inside a column, so it shrinks to its own longest line. Innsikt is
  1160px wide in the design because of one paragraph (the Tuva draft note, omitted here
  per D-25). Reproducing that made our Innsikt collapse to 808px. The screens keep the
  page column, and Innsikt stays 20px wider than the design.

## D-72 — Resultater: design 3's result workspace (P3)

**Built:** `/resultater` is design 3's Resultater. The old Resultat screen
(`components/resultat/`) is removed; the 308 from `/resultat` still lands here.

Its parts:
- the header, with MÅLING, PULS and SAMMENLIGN MED chips and the Resultat / Kommentarer /
  Tiltak → tabs;
- the key figures: the index with its bands, the trend of grunnlinjer, the response rate
  and "Tillit til tallene";
- five views: Varmekart, Prioritet, Segmentprofil, Sammenlign, Utvikling;
- the drill-down: the selected cell, its statements, a comment, and the playbook with
  "Legg i plan";
- "Forslag basert på resultatene";
- a puls in its own view (v3 `v2p()`).

It reads one composite, `results_workspace` (0037), plus the round list, participation,
this round's comments and the measures. The composite runs in 95 ms in the database and
returns 20 KB. The round and the comparison are links. The view, the group and the factor
are client state, mirrored to `?visning=&gruppe=&faktor=`.

**Pixel checks** against `baselines-v3/07`–`11` (`scripts/verify/cardmatch.mjs`):
- **0 px:** the kicker and title, the chip rows, the tabs, the response-rate, trust and
  trend cards, the view switcher and its hint, the heat-map title, the drill-down head,
  the legend, Forslag's head, the footer, the Segmentprofil and Sammenlign rows, and
  Prioritet's labels.
- **The stats line differs** on "Neste puls" alone: it is the date of the planned puls in
  the data.
- **Forslag's cards:** their element boxes are identical to the design's to the
  hundredth of a pixel (measured). They differ by 0.4 % because the text rasterises at a
  different sub-pixel offset. The cause is the shorter drill-down above them (the quote,
  below).

`scripts/verify/resultater-behaviour.mjs` checks 26 things (28 with `--adopt`), among them:
- the default cell;
- the withheld rows cannot be pressed;
- pointer and keyboard selection;
- the URL keeps the cell;
- "Sammenlign med";
- all five views;
- a puls;
- "Legg i plan" survives a reload;
- no horizontal scroll at 390px.

`scripts/verify/mobile.mjs` passes for every view.

Where the build differs, and why:
- **Eleven columns, not nine.** The heat map has one column per factor the round measured
  (D-69). The short labels are message keys (`factor.<key>.abbr`). The design has none for
  Kontakt and Integritet; they are "Kontakt" and "Integr." so that eleven fit.
- **Drift is "—" in 2026.** It has enough answers but is withheld, because otherwise it
  would give away Administrasjon (D-68). A second legend line says so. Its leader sees
  "har nok svar (8), men indeksen holdes tilbake", not "færre enn 5".
- **No quote under a group (D2).** A comment never travels with a group (0018). The
  drill-down shows the newest comment on the factor only when the whole organisation is
  selected. The link to the comments is always there, and it counts the whole
  organisation's comments.
- **No "EU-snitt 64".** There is no benchmark (D-10).
- **Prioritet's importance is measured (D4).** It is the correlation of each factor with
  "anbefale oss", for the whole organisation, from 20 answers. The quadrant splits at the
  median r and a score of 60. The dots are scaled to the round's spread, so the median
  sits on the middle line. An avdelingsleder, or a round under 20 answers, gets the
  design's dashed empty treatment with the reason.
- **Segmentprofil has Team only (D3).** It has no "59 −2 mot resten" head: no reader
  computes a group's own index, and this side does not average factors into a headline
  (D-15). "Resten" is the other groups whose figures are released, weighted by answers. A
  withheld group contributes nothing to it.
- **Sammenlign's two index tiles appear only for the whole organisation**, for the same
  reason.
- **Utvikling keeps its own group, and so does Sammenlign**, as the prototype's
  `v2TlSeg` and `v2CmpSeg` do. A withheld cell is "—"; a factor a puls did not measure is
  "·". The dashed column is the round now running ("Pågår"), not a planned one.
- **The puls view omits "why this puls"** (no row records a reason). A measure's effect is
  read on the whole organisation against the grunnlinje before.
- **"Legg i plan" is the playbook adoption of 0031.** It is once per organisation, not
  once per group, and the new measure carries no group. The design's per-group plan card
  is Tavle's (P6).
- **No "Kommentarer og plan gjelder grunnlinje 2026" note** on older rounds. The
  drill-down's comments are the selected round's, so the note would be false.
- **The avdelingsleder's index card says whose it is** ("Arbeidsmiljøindeks · Verksted").
  `results_summary` answers them for their department.
- **Buttons have normal line height.** Tailwind's preflight makes a button inherit 1.5.
  The prototype's buttons keep the browser's `normal`, and rows were 3px taller until they
  did.

**The fixture changed so that the drill-down and Prioritet show the design's content:**
- Each factor's sum is split over its three statements by the design's offsets (v3
  `FACTORS[].items`), so Ytringsklima's statements are 39/36/49 against the design's
  38/36/49.
- The higher answers rotate per factor, so factors no longer move in lockstep.
- "Anbefaler oss" is ordered by the standardised factor means, weighted by the design's
  importance to the fourth power.
- The 2026 correlations put Ytringsklima, Arbeidsmengde, Mening and Leder highest, the
  design's four "betyr mye".
- Every printed index, group figure and count is unchanged; `design_figures.sql` passes
  locally and on hosted.

## D-73 — Kommentarer: every comment under Resultater's frame (P4)

**Built:** `/kommentarer` is design 3's Kommentarer (v3 2640-2720), under the same header
and tabs as Resultater (`components/resultater/ResultaterShell.tsx`). The old Samtaler
screen (`components/samtaler/`) is removed; the 308 from `/samtaler` still lands here.

It shows:
- Temaer: the factors the selected rounds have comments on, most comments first, each with
  its tone;
- the comments, with Alle / Ubesvart / Besvart and the round as filters;
- per comment: the factor, the round (and the date, for an earlier round), the tone, the
  age or "Besvart", the text, the thread, and the inline reply.

It reads one RPC, `conversations()` (0018, 0022), which has applied k and stripped the
group. The filters are mirrored to `?maling=&faktor=&status=`, which Resultater's
drill-down links into.

**Pixel checks** against `baselines-v3/12-kommentarer.png`: the header and tabs, the Temaer
card, the theme rows and the list's head are at 0 px. The same comment is identical apart
from the group label (below). The Temaer subline and the round chips differ with the data:
the fixture's comments come from 3 rounds, the design's from 5 (D-69 places the two puls
comments on Grunnlinje 2025, because those pulses did not measure the factors they are
about).

`scripts/verify/kommentarer-behaviour.mjs` checks 16 things (18 with `--reply`), among
them:
- the counts and the badge agree;
- no group is named anywhere;
- the theme, status and round filters, and the URL;
- the links to and from Resultater;
- the keyboard;
- a reply read back from the thread;
- the phone.

Where the build differs, and why:
- **No group, anywhere (D2).** The design prints "Verksted · Grunnlinje 2026" or "Gruppe
  skjult" on every comment and filters by group. A comment never travels with its group
  (0018), so there is no group on a comment and no "Gruppe" row. The yellow note says what
  this product does: the group is never shown, not "only when five have answered".
- **The waiting comments come longest-waiting first**, then the answered ones newest first.
  The design lists them in its data's order. The rule is Oversikt's (D-71).
- **A comment waits again when its author answers back.** Its age counts from what they
  wrote last. The prototype has no second turn; the product has since 0018.
- **A theme's tone is the design's majority rule** (more answers at the low end than the
  high gives Negativ, the other way Positiv, otherwise Blandet), read from the answers the
  comments hang on. Resultater's "Hva de skrev" keeps D-56's two-thirds rule. A single
  comment on a 3 is "Blandet", the design's word.
- **No "Avslutt samtalen".** The design has no close action. A thread can still be closed
  (`set_thread`), and a closed one reads "Lukket".
- **A comment flagged as a possible varsel** carries D-28's note under its text. The flag
  is a legal marker (aml. kap. 2A), and dropping it with the old screen would lose it.
- **A verneombud reads an explanation, not the list.** `conversations()` refuses the role
  (0022): a verneombud keeps every figure and does not read single comments they could
  never answer. The screen says so instead of "Ingen kommentarer".

## D-74 — Målinger: the year rail, four tabs, and "Start neste puls nå" (P5)

**Built:** `/malinger` is design 3's Målinger (v3 870-1330):
- **the year rail:** twelve months of a year (2025–2027), each showing what closed that
  month with its index, or what is planned or open; the forankring month; and a detail line
  for the month pressed;
- **Kommende:** every round not closed yet, in the order it goes out, then the latest
  result's line and the Deltakelse card;
- **Historikk:** every closed round, filtered by type and year and sorted four ways, with
  its response rate, its index and the change from the round of its kind before;
- **Årshjul:** the Årshjulet screen, re-hosted as a tab. `/arshjulet` answers 308 to
  `/malinger?fane=arshjul`, and every link that pointed there now points at the tab;
- **Spørsmålssett:** the instrument, as before.

The tab, the rail's year and the pressed month are the address (`?fane=&ar=&maned=`).

**"Start neste puls nå" is real (0038, plan S7).** It was a button that did nothing.
`public.start_next_pulse` holds the guards:
- only a daglig leder;
- never while a round is open;
- never within 14 days of the last close.

It opens an extra puls today, with the factors, extra questions and settings of the next
planned puls, and leaves the planned rounds alone: the wheel re-plans any month whose round
went missing, so moving one would only bring it back. It sends through the outbox exactly as
the wheel opens a round, including the notice ladder, due now. Every start is recorded in
`app.round_starts`. The button asks once before it sends and prints the database's refusal
in words. `start_pulse_invariants.sql` proves 14 rules. 0039 names the audit policy's role,
a rule the write suite caught.

**Pixel checks** against `baselines-v3/03`–`06` (`scripts/verify/cardmatch.mjs`):
- **0 px:** the header, the rail's head, the twelve tiles, the detail line and the legend,
  the tables' heads and rows, the Deltakelse card, Historikk's filters and rows, and the
  Årshjul tab's title and year strip.
- **The tab counts differ with the data:** the wheel plans a year ahead, so 5 rounds are
  upcoming, against the design's 7.
- **Spørsmålssett is wider than the design.** The prototype shrinks each screen to its
  content (D-71).

`scripts/verify/malinger-behaviour.mjs` checks 27 things. Among them: the rail by pointer
and keyboard, a year, "Vis i årshjulet", Historikk's filters and sort, the links into
Resultater and Måleoppsett, the 308, and every tab at phone width. The start button's
confirm, send and refusal were exercised once against hosted with the open puls closed; the
database refused ("too soon"), and nothing was started.

Where the build differs, and why:
- **No "＋ Legg til puls" or "Hopp over denne" on the rail.** The wheel re-plans every month
  its cadence names (0020), so a skip needs a record of its own before a button can promise
  one. The detail line keeps the actions the data backs.
- **A puls in Historikk is compared with the puls before, on the factors both measured.**
  This reproduces the design's −3 (March 2026 against August 2025) and +3; a mean over
  different factors would have said +3 for March.
- **An open round is drawn on the rail** with its kind's colour and "Pågår". The prototype
  has no open round.
- **The open puls on Kommende says when it closes** ("lukkes 29. september"), not when it
  goes out.
- **Deltakelse describes the latest closed round (D-46).** While a round is open, the card
  says why no puls can start, instead of the design's "Lukk runden" and "Send påminnelse",
  which have no write path yet.
- **Question counts and dates are the rows'**: "9 spørsmål", "går ut 1. desember" (the
  wheel's first Tuesday), not the design's "5 spørsmål" and "12. desember".

## D-75 — Tiltak: the Tavle, its detail panel, the plan, and a measure's target (P6)

**Built:** `/tiltak` is design 3's Tiltak (v3 2380-3000), in two tabs:
- **Tavle** (the default) is four columns read from `measure_step`:
  - **Funn:** the three lowest-scoring factors with no open measure, each with its first
    playbook suggestion not yet taken;
  - **Valgt fokus:** `besluttet`;
  - **Tiltak pågår:** `pagar` and `gjennomfort`;
  - **Effekt målt:** `effekt_malt`.

  `foreslatt` measures sit in Funn beside the findings, and `lukket` measures leave the board.
- **The detail panel** for the card pressed shows:
  - the status, department, factor and score;
  - Tiltak / Eier / Frist;
  - the factor's playbook suggestions with "Velg";
  - the five Trinn;
  - "Velg som fokus" or "Flytt til «…»", through the existing writes
    (`adoptPlaybookMeasure`, `advanceMeasure`).
- **"Slik måler vi effekten"** shows:
  - the followed statement;
  - its index now against the measure's target;
  - the next three planned rounds that measure the factor.
- **The plan** is a Gantt of the focus and running measures over this month and the four
  after it, with the planned rounds as pills.
- **Liste** is the existing list, with one new field: the target.

The tab and the card pressed are the address (`?fane=liste`, `?kort=`).

**A measure has a target (0040).** `app.measures.target` is an index from 0 to 100, or null
until someone sets it. The Tavle's "Mål" reads it, Liste edits it, and the fixture sets the
design's 33 on "Fast svar", plus a target on the three other measures still open.
`measure_invariants.sql` checks 20 and 21 prove the range and the round trip.

**Scores are the released ones.** A card is scored from the latest grunnlinje through
`results_workspace` (0037), so k and complementary suppression apply as they do in
Resultater:
- a measure aimed at one released department is scored on that department, against the
  average;
- anything else is scored on the organisation, against last year.

**Pixel checks** against `baselines-v3/13` and `14` (`scripts/verify/cardmatch.mjs`):
- **0 px:** the header, the tabs, the board's head, every card whose data matches the
  design (Motstridende krav, both running cards, Effekt målt), the detail panel's head and
  grid, the plan's head, and the footer.
- **The suggestion rows are 686 px off.** That is the text of rows the fixture has; their
  pills were corrected to the bundle's white with a border.
- **Liste is 0 px** except where the data differs (below).

`scripts/verify/tiltak-behaviour.mjs` checks 27 things:
- the tabs and their counts;
- the columns;
- the initial card;
- the address;
- the department filter;
- a plan row;
- the keyboard and focus;
- "Velg som fokus" and "Flytt til «Pågår»" as writes;
- the target field and its range;
- phone width.

It writes, and the fixture is reseeded after it.

**The address now survives a write, on every screen that mirrors state into it.** Tavle,
the year rail, Resultater's workspace and Kommentarer wrote `?…` with
`replaceState(window.history.state, …)`. Next.js treats a state carrying its own markers as
internal and does not sync it, so the refresh after a server action restored the old
address. They now pass `null`, the documented form, and the router adopts the address.

Where the build differs, and why:
- **No "Når målet er nådd i to målinger på rad, foreslår Orgpuls å lukke tiltaket."**
  Nothing suggests closing a measure. A sentence promising it would describe a feature
  that does not exist.
- **A bar starts when the measure was recorded.** The schema has no start date. A late
  measure's bar runs to today, because it is still being done, not to the lapsed date.
  "Fast svar" is therefore short on the fixture (15 to 24 September), where the design
  draws it to late November.
- **"Flytt til «Gjennomført»" from Tiltak pågår**, not "«Effekt målt»". `gjennomfort` is a
  step of its own between them (0013), and `advanceMeasure` moves one step at a time, so a
  measure is recorded as carried out before its effect is.
- **The Funn hint is "Foreslått ut fra skår"**, without "og betydning". Findings are
  ordered by score. Importance (D4) is an organisation-level correlation and does not
  choose between departments.
- **The filter chips are the departments.** "Under 1 år" is a tenure segment, which D3
  rules out.
- **Measurement points are named by kind and date** ("Puls", "1. des"), not "Puls 1". Their
  question count is the round's own: 9, not the design's 5.
- **Data differs where the fixture differs:**
  - Støtte fra leder is 64 for Alle, not 52 for "Under 1 år";
  - the third finding is Kontakt og kommunikasjon, not Rolleklarhet;
  - Liste has no "Puls 2 · 2025" chip (no such round);
  - Liste has no "Tildelt meg": the signed-in account is not an employee.

## D-76 — The Veiviser: nine steps over the existing writes, and a first grunnlinje (P7)

**Built:** design 3's wizard (v3 191-406), a dialog over whichever screen is open, mounted
once in the signed-in shell.
- **When it opens:**
  - by itself on the first run: no round at all, and the wizard neither finished nor put
    aside (`getWizardGate`);
  - from Oversikt's "Veiviser";
  - from Oppsett's "Kjør veiviseren", in the title row where the design draws it.

  It is offered to a daglig leder only, the one role every step's write admits.
- **Its nine steps.** Each writes through the action that already owns its table, and moves
  on only when that write is confirmed:
  - Virksomheten: `fetchRegistry`, plus a new `saveOrgName`;
  - Ansatte: `importEmployees`;
  - Grupper og terskel: `setThreshold`;
  - Verneombud: `setEmployeeDutyRole`;
  - Hva dere måler: `saveLawMode`;
  - Rytme og oppfølging: the new `saveWizardRhythm`;
  - Første utsending: the new `planFirstRound`.

  A wizard left half-way therefore leaves the organisation in a state every other screen
  already understands.
- **Leaving and resuming:**
  - Every move saves the step in `app.setup_progress` (0041: RLS, a read policy and two
    write policies to authenticated, no delete).
  - "Fortsett senere" and Escape close it there, and the next session opens it at the same
    step. A session flag keeps it from reopening in the current session.
  - "Hopp over" puts it aside, so it no longer opens by itself.
  - "Til oversikten" finishes it; run again from Oppsett, it starts from the beginning.
- **Focus.** It is a modal dialog labelled by its step title: focus starts on the title, Tab
  stays inside it, and closing returns focus.
- **Phone.** The step list folds away, and the footer carries "Fortsett senere" and
  "n av 9".

**What 0041 adds beneath it:**
- **`public.plan_first_round(org, day)`**, the design's "Planlegg utsendingen":
  - It plans the first grunnlinje at 09:00 on the chosen day in the organisation's zone. The
    round carries every factor and the four questions outside the index, a reminder on day
    four and a close on day seven, as the step's own timeline says.
  - It switches the wheel on, so the wheel opens, reminds and closes this round and every
    round after it. Nothing had set `year_wheels.active` before, so a new organisation's
    wheel never turned.
  - It refuses anyone but a daglig leder, an organisation that has already measured, a
    weekend, anything under three days or over 120 days ahead, and an empty register.
  - Pressed again, it moves the round it planned.
- **`wheel_tick()` plans by month rather than by exact instant.** Without that, a first round
  on the second Tuesday would gain a twin on the first. It also:
  - keeps a grunnlinje yearly: none within six months after another;
  - plans a puls only while a measure is open for it to follow. An organisation with none
    would otherwise be sent a survey with no questions.
- **`halvarspuls`**, the design's "Hvert halvår": one puls six months after the baseline. The
  Årshjul tab lists it only once it has been chosen, so the design's three options stay as
  drawn.
- **Proof:** `wizard_invariants.sql` proves 19 rules. Run against 0020's tick, the three
  planning rules fail (a twin, three grunnlinjer, five empty pulses), so the suite tests
  them rather than passing by accident.

**The fixture's first run.** `design-fixture.mjs --first-run` emits the same organisation
before its first measurement:
- the people, groups and duties;
- a wheel that is described but not switched on, and no notice ladder;
- no register fetch, and nothing measured.

The wizard is checked in that state, and a plain rerun brings the design's scenario back.
The normal output gains one line, which clears `setup_progress`.

**Pixel checks.** The dialog was compared against `baselines-v3/30`–`38` in the first-run
state:
- **0 px:** Velkommen, Virksomheten and Rytme og oppfølging.
- **Everything else under 0.1 %, from data or from the choices below:** Ansatte 262 px,
  Grupper 615, Verneombud 599, Hva dere måler 1 164, Første utsending 628, Klart 481.
- **Unchanged beneath it:** Oversikt's metrics row, now with "Veiviser", is 0 px against
  `01`. Oppsett's title row, now with "Kjør veiviseren", is 0 px against `15`.

`scripts/verify/veiviser-behaviour.mjs` checks 35 things against the first-run state and
writes; the fixture is reseeded after it.

Where the build differs, and why:
- **Terskel offers 5 and 8, not 3, 4, 5 and 8 (S1).** k is 5 and cannot be lowered. An
  organisation that has chosen 6 or 10 under Oppsett sees its own value as a third chip.
- **No "Daglig leder" row from Brønnøysund.** The register's API does not return one. The
  other three rows are the stored register facts, and "Navn" saves only when it was changed.
- **Microsoft Entra is drawn and says it is not connected.** There is no integration. A
  CSV exported from Entra, or a pasted list, is the way in.
- **A CSV is read in the browser and imported by the same parser as a pasted list.** Columns
  are name, email and group, and a mobile number in the fifth column. There is no CSV
  library, and a quoted comma is not understood.
- **A group below the threshold says "vises bare som del av helheten"**, not "slås sammen i
  rapporten". The report withholds a small group; it does not merge it into another. With
  no groups, the step says where they are made (Oppsett › Grupper): no action creates a
  group yet.
- **Verneombud and tillitsvalgt are chosen from the register, not typed.** The duty is
  `employees.duty_role` (0021), which names a person. A typed name would be a second record
  that could disagree with it. One person holds one duty, so the verneombud is not offered
  as tillitsvalgt; the design's "Kari Sund" in both fields cannot be stored.
- **"Medarbeiderundersøkelse" says "De samme elleve områdene", not "Ni områder".** Law mode
  frames the result; it does not change the instrument. The design's own filter would
  remove one factor and give ten, not nine.
- **The cascade is the notice ladder's**, written by the wizard: verneombud and
  tillitsvalgte two days before (or at the same time, unticked), daglig leder one day
  before, avdelingsledere at the opening for the result. An existing ladder keeps its own
  lead times, and only the verneombud's and tillitsvalgtes' move with the box.
- **The three dates are the next Tuesdays from a week ahead.** The design's third, "Mandag
  20. oktober", is a Tuesday. The invitation line says "e-post og SMS" only where SMS is
  switched on.
- **"37 spørsmål · 11 områder" and "ca. 5 minutter" are computed.** The first is statements
  plus questions outside the index. The second assumes eight seconds a question.
- **Klart's rows read what was stored**, not the drafts: the name, the people counted, the
  groups and threshold, the verneombud, the mode, the rhythm and the planned round.

Resolves D-71's "No 'Veiviser' link yet".

While verifying: `respondent_invariants.sql` took the latest open round across every
organisation. Locally, the demo organisation's opens at the same instant as the fixture's,
and after a reseed the tie picked the demo round, whose tokens follow another scheme. Both
of its reads now name the fixture organisation.

## D-77 — Hardening: a security pass, the v3 pixel run, performance, advisors (P8)

### Security: an adversarial review of 0034–0041, and 0042
A review agent traced every result reader, write function and grant added in design 3.
Each finding below was reproduced against the schema before it was fixed.
`hardening_invariants.sql` proves 12 rules and passes locally and on hosted.

- **Results answered for open rounds (critical).**
  - **The attack:** two reads of `results_items` a few minutes apart differenced one new
    respondent's answers exactly, and `invitations.responded_at` named that person.
  - **The fix:** every reader now finds an open round as it finds none, `not_available`.
    The workspace and the UI read closed rounds only, so no screen changes.
- **Who answered when was readable (critical, and it also allowed padding).**
  - **The attack:** `invitations` gave every member `employee_id` beside `responded_at`,
    which also tied a comment's hour to a person. It also let a leader insert invitations
    with tokens of their own, pad a small group to k with known answers, and subtract them.
  - **The fix:** the table now has RLS, no policy and no grant, like the answer tables.
    Every reader of it is a definer function. Oppsett › Grupper reads its counts from
    `participation`.
- **A closed round's groups could be reshaped (critical).**
  - **The attack:** deleting a group moved its responses into "Uten gruppe", and renaming
    one chose which of two equal groups was protected. Together they recovered a group of
    one.
  - **The fix:** a group that holds responses cannot be deleted, and ties are broken by id,
    not name. The fixture's groups have fixed ids in name order, so 2026's tie (Drift and
    Verksted, 8 each) still protects Drift, as the design and D-68 have it.
- **k counted respondents, not answers (high).**
  - **The attack:** a statement can be skipped ("Hopp over"), so a group of six in which
    five skipped released one person's answer.
  - **The fix:** `app.cell_release` decides each statement cell per group from the people
    who answered it, with 0034's complementary suppression applied per cell. A factor cell
    is released only where every statement of it is. For the house, a statement or factor
    needs k answers.
  - The fixture answers every statement, so no figure it prints moved.
- **A round's life was a client write (medium).**
  - **The problem:** a leader could close a round early to read it, then reopen it.
  - **The fix:** clients may now change four settings (Måleoppsett's), never status, dates
    or existence. The wheel takes `start_next_pulse`'s lock.
- **Smaller:**
  - `comment_themes` counts writers only in released groups;
  - importance needs 20 pairs per factor;
  - `setup_progress_touch` runs as invoker.
- **One write path, and comments that reach Kommentarer.**
  - **The bug:** 0018 wrote comment threads onto a two-argument `submit_response` that 0010
    had replaced. The form calls the three-argument one, so a real respondent's comment was
    stored but opened no thread, and Kommentarer, which reads threads, never showed it.
  - **The fix:** the threads now live in the function the form calls, and the stray one is
    dropped.
  - **Still missing:** the respondent screen does not show the thread key yet, so a
    respondent cannot come back to a reply. That is a screen to build, not a hole.

### The v3 pixel run
`scripts/verify/v3-run.mjs` captures every state design 3 draws, as `baseline-v3.mjs`
captured it from the prototype:
- **How it compares:** in 240 × 100 tiles, each searched ±40 px, at the gate's 0.1 %.
- **The claims:** `scripts/verify/v3-claims.json` records the 2 403 tiles that match
  across 31 states. The run fails if a claimed tile stops matching.

Coverage and the reason for every unclaimed area:

| State | Tiles | What differs, and why |
| :-- | --: | :-- |
| 01 Oversikt | 83/114 | factor rows and waiting comments are the fixture's; eleven factors against nine (D-71) |
| 02 Innsikt | 55/72 | the fixture's figures and rounds (D-71) |
| 03 Kommende | 78/108 | five upcoming rounds against seven; question counts and dates are the rows' (D-74) |
| 04 Historikk | 90/90 | — |
| 05 Årshjul | 143/204 | timeline rows for automations that do not exist, "Utløsere" and the Tuva note are not drawn (D-29, D-62); the page is 827 px shorter |
| 06 Spørsmålssett | 67/102 | wider than the prototype, which shrinks each screen to its content (D-71); the Bransjemoduler panel sits where the prototype's footer is (D-124) |
| 07–11, 19 Resultater | 76–112/126 | Drift withheld with Administrasjon (D1, D-68); Utvikling's extra history (D-72) and its Svarprosent row (D-135) |
| 12 Kommentarer | 107/192 | no group label on a comment (D2, D-73) |
| 13 Tavle | 116/120 | the fixture's measures and findings (D-75) |
| 14 Liste | 132/132 | — |
| 15 Oppsett | 119/126 | the register's facts and the roster |
| 18, 20 side layout | 52/72, 45/72 | the Innsikt figures, as in 02 |
| 21, 23–25 help panel | 104/132, 47–49/54 | the page beneath it, as in 01 and 02 |
| 30–38 Veiviser | 47–52/54 | the page behind the backdrop: a first-run Oversikt; the dialog itself is D-76's |

Two states are left out:
- **16 and 17** are the verneombud's and an avdelingsleder's Innsikt. A role is a
  membership, not a menu, and the fixture has one login.
- **22** is the phone. The prototype overflows to 444 px there (D-71); `mobile.mjs` checks
  overflow instead.

### Performance
- **The cause: the functions ran in Washington.** Production's `x-vercel-id` read
  `iad1::iad1`, so every function ran in Washington, D.C., against a database in Frankfurt.
  An authenticated screen makes 16–36 Supabase requests, and each crossed the Atlantic.
  Measured from here, with the login page as the network floor (≈0.4 s), authenticated
  TTFB was 1.3–2.5 s.
- **It was also a residency fault.** Answers, comments and the register passed through a
  US function, while the footer promises "Svar lagres i EU".
- **The fix:** `vercel.json` pins the functions to `fra1`.
- **Measurement:** `scripts/verify/perf.mjs` measures TTFB and LCP in a browser. Against
  production this session could not use it: the proxy does not let the bundled Chromium
  verify orgpuls.com's chain (ISRG Root YR), and trusting extra keys to get round that was
  refused. Production TTFB was measured with curl and the app's own session cookie; the
  figures after the move are in X-047.
- **One RPC per screen is true of Resultater** (`results_workspace`). Innsikt, Tiltak and
  Målinger call `results_summary` once per round of history they draw, in parallel. With
  the functions beside the database, each call is a few milliseconds, and folding them
  into one RPC is left for when a screen needs it. *Since folded: every screen reads its
  results in one `results_digest` call (0044, X-049).*

### Supabase advisors
- **Performance:**
  - the 21 unindexed foreign keys have covering indexes (0043);
  - what remains is "unused index", which includes the 20 new ones.
- **Security:**
  - "RLS enabled, no policy" on the answer tables and `invitations` is invariant 1;
  - "security definer executable" lists the k-gated readers and the respondent's
    token-gated functions, each of which checks its caller inside;
  - leaked-password protection needs the Supabase Pro plan, which is a billing decision
    for the owner.

## D-78 — Small groups are withheld, not merged; a respondent can read a reply

### The wording
Five places said a group under the threshold is "slått sammen", or put in «Øvrige» with
other small groups. The product does neither. Such a group gets no figures of its own and
counts only in the whole, and a larger group can be held back with it (0034). Each line
now says what happens, in `no` and `en`:
- Måleoppsett's timeline;
- the header panel's Kom i gang;
- the help article "Velg riktig terskel";
- Oppsett › Grupper's badge and its rule.

**Oppsett › Grupper also said the wrong thing about Drift.** It worked "Vises alene" out
from the count, so Drift, with 8 answers, showed as alone although 2026 holds it back.
The badge now reads `results_by_group` for the last closed round:
- "Vises alene" (`ok`);
- "Bare i helheten" (`insufficient_data`);
- "Holdes tilbake" (`protected`).

With no closed round it draws no badge rather than a guess. The design's "Slås sammen"
pill keeps its colour for the two withheld states.

### The reply screen
The design draws no respondent side to a conversation (both bundles were searched), so
this is built from the respondent flow's own components and tokens: its card, option,
textarea and primary button.

**On the done screen.** Each comment the person wrote gets:
- a link to its conversation, and "Kopier lenken";
- a sentence saying the link is the only way back, cannot be sent again, and lets anyone
  who has it read the conversation.

**`/s/samtale#<key>`.** The key is the fragment, which a browser never sends. It reaches no
server log, no Referer and no URL the app sees. The page reads it and posts it in an
action body to `thread_by_key` and `follow_up` (0018), which answer a malformed, unknown or
wrong key alike. The page shows:
- the comment, and management's replies as "Ledelsen";
- the person's own messages as "Deg";
- a field to answer while the thread is open.

A message is stored to the hour, so the thread prints the day, never a clock time. The
page asks search engines not to index it.

`scripts/verify/samtale-behaviour.mjs` checks 16 things, through the app only:
- the link, the fragment and the server's view of it;
- that a leader sees the comment only once its group has k respondents;
- the reply, the answer back, the leader reading that answer;
- refused keys, phone width, and the console.

It writes to the fixture's open puls, and the fixture is reseeded after it.

## D-79 — The public site: SEO, four landing pages and six articles

The design draws one public page, the start page. The owner asked for the site to be
optimised for search and for landing pages and articles that bring in visitors. This entry
says what departs from the design, and why.

### The start page
The hero is unchanged, and so is every section the design draws. What changed:
- **Title and description.** The design's `<title>` was "Orgpuls". It is now "Orgpuls –
  medarbeiderundersøkelse og arbeidsmiljøkartlegging", with a description that names the
  law, the trial and "no card". Canonical URL and an Open Graph card (`public/og.png`,
  rendered from the bundle's fonts and tokens) come with it.
- **Two new sections, in the design's own components.** "For hvem" (four cards to the
  landing pages) sits after the four steps. "Artikler" (three article cards) sits after the
  FAQ. Both reuse the pain cards' surface and type.
- **Structured data.** Organization, WebSite, SoftwareApplication with the two published
  prices, and FAQPage from the five questions on the page.
- **FAQ answers are in the HTML while closed.** They were only rendered when open, so four
  of the five answers were invisible to a search engine. They now carry `hidden` until
  opened, which looks the same and reads the same to a screen reader.
- **"Snakk med oss" is an e-mail** to hjelp@orgpuls.no, the address the product already
  prints. In the bundle it opened sign-in, which no prospective group customer can use.
- **Footer.** "Slik virker det" and "Kontakt" pointed at `/hjelp`, which is behind the
  sign-in, so a visitor landed on the login form. They now go to `/#how` and to the
  e-mail. "Artikler" is added. "Personvern" still points at `/hjelp/gdpr` and is
  therefore still behind the sign-in; making that article public is its own change.
- **Phone width.** The auto-fit grids' column minimums are wrapped in `min(…, 100%)`. From
  390 px up nothing moves. At 320 px the closing block no longer overflows by 16 px, which
  it did before this change.

### Landing pages and articles
- **Routes:** `/lovkrav`, `/verneombud`, `/smaa-bedrifter`, `/bygg-og-anlegg`, `/artikler`
  and six articles under it. All are public and static.
- **Content as data.** The content is data: `seo.*` in /messages, one block renderer
  (`components/marketing/Blocks.tsx`), and a registry of slugs, dates and links
  (`lib/marketing/site.ts`).
- **Design treatment.** The design has no drawing for these pages. They use the start
  page's header, footer, type scale, pill, cards, law rows and closing band, and nothing
  that is not in the bundle.
- **Legal statements.** Every legal statement is quoted from, or paraphrases, text read on
  Lovdata or Arbeidstilsynet in September 2026. Each article lists those pages as its
  sources and says it is not legal advice.
- **Product claims.** The claims are the ones the product makes good on, or that the start
  page already states. The prices and the 30-day trial are the start page's.
- **Deliberately not claimed.**
  - Tillitsvalgte are not described as having access: the product's roles are daglig
    leder, avdelingsleder and verneombud.
  - Export to spreadsheet is not mentioned.
- **Two design lines corrected on the start page, at the owner's request.**
  - "som PDF og regneark" is now "som PDF", in the "Dataene er deres" card and in the
    FAQ answer about leaving. No spreadsheet export exists.
  - The price note's "Verneombud og tillitsvalgte har tilgang" is now "Verneombudet har
    tilgang". Tillitsvalgt is not a role that can sign in.
  - The English strings are changed to match.
- **Search and sitemap.** `sitemap.xml` lists the public pages. `robots.txt` keeps the
  survey, invitation and password links, the component gallery and the application out of
  the index. The middleware's public paths include the new routes.

### Checked
- **Pages:** every page returns 200 to an anonymous request, has one H1, a canonical URL
  and valid JSON-LD. An unknown article is a 404.
- **Browser:** no horizontal overflow at 320, 390, 768 or 1440 px on the 14 public pages,
  and no console errors.
- **i18n:** parity passes for `no` and `en`.

## D-80 — The account chip opens a menu with "Logg ut"

The design draws the header's account chip, a 32 px round mark with the viewer's
initials, and nothing behind it. The prototype has no accounts, so it never needed a way
out. The product has sign-in, and until now had no sign-out anywhere in the application:
the only one was on the invitation page.

This is the control-substitution case CLAUDE.md allows: the prototype's control cannot
express a real need. What changed:
- **The chip is a `<button>`,** drawn exactly as the design draws the mark (same size, fill
  and type). The v3 pixel run keeps every claimed tile.
- **It opens a small menu,** built from the header's own materials: surface `sf`, hairline
  `line`, the panel radius, and rows at the nav button's radius. The menu holds:
  - who is signed in: name, e-mail, organisation and role;
  - a link to Oppsett;
  - "Logg ut".
- **Nothing the product lacks is offered.** There is no profile page, so there is no
  profile link.
- **"Logg ut"** is a form posting to a server action (`app/(app)/account-actions.ts`). It
  ends this browser's session only (Supabase `local` scope) and lands on /logg-inn. It
  works before hydration.
- **Keyboard and dismissal.** Escape and a click outside close the menu, and focus returns
  to the chip. Opening it moves focus to the first item.
- **`getViewer` reads the profile by the signed-in user's id.** The policy already allowed
  only one's own row; the filter now says so too. It also returns the name and e-mail.
  When a profile has no name, the chip shows the e-mail's first letter instead of an
  empty circle.

**Checked** (in a browser):
- opening and closing, focus, and Oppsett;
- the side layout and 390 px;
- signing out, after which /innsikt redirects to sign-in;
- no console errors.

Shell suite 24/24, and the v3 pixel run is unchanged.

## D-81 — Oppsett moves from the main nav to the account menu

The owner asked for Oppsett to leave the main nav now that the account menu (D-80) has a
way to it. The design has six nav entries, and Enkel's nav is Oversikt and Oppsett.

- **The nav:** five entries in Full (Innsikt, Målinger, Resultater, Kommentarer, Tiltak)
  and Oversikt alone in Enkel. It is one model (`lib/shell/nav.ts`), so the top bar, the
  side rail and the phone layout agree.
- **Oppsett is reached from the account chip's menu.** The app footer's Oppsett column
  (Selskap, Ansatte) still links into it.
- **On Oppsett no nav entry is current.** The chip carries the ring the open menu has, and
  the menu's Oppsett link is `aria-current="page"`, so the page still says where you are.
- **Switching to Enkel on Oppsett keeps you there.** `ENKEL_PATHS` lists the screens Enkel
  allows, separately from the nav.
- **Checked:**
  - the shell suite passes 27/27, three checks of them new for this;
  - the v3 pixel run keeps every claimed tile (the nav entries were not among them);
  - screenshots of the header in Full, Enkel and on Oppsett.

## D-82 — A leader can ask for direct contact; only the employee can say yes

The owner asked for a way to move from an anonymous conversation ("kan jeg ta med akkurat
dette tilfellet?" — "Ja, gjerne.") to a named one. The design has no such flow.

**Why the system cannot send the e-mail.** Orgpuls does not know who wrote a comment. A
thread reaches a response and stops, and a response carries no person (invariant 2). To
e-mail the author it would have to know them, which is exactly what the product promises
it cannot. So the step is the employee's own.

**The flow:**
1. **The leader asks.** In Kommentarer, a leader who can read the thread chooses "Be om
   direkte kontakt". Before sending, they are told what the employee is offered, and that
   they will not learn whether it was seen.
2. **The employee is offered an e-mail.** Their private thread page (reached only with
   the key they hold) shows "{name} vil gjerne snakke med deg direkte" and a button that
   opens their own mail program with the leader's work address, a subject and a short
   body. Sending it is what reveals who they are. Not sending it reveals nothing, and the
   conversation stays anonymous.
3. **The leader can withdraw it.** Then it is no longer offered.

**The database side (0046):**
- **`app.contact_requests`** holds the thread and the leader, never anyone on the author's
  side. Its only foreign keys are `comment_threads` and `profiles`. It has RLS on, no
  policy and no grant.
- **`request_contact` and `withdraw_contact`** gate on `app.thread_visible`, which is the
  predicate `conversations` uses: role, department scope and k. A leader can ask only on a
  thread they can read, and every refusal is `not_available`. A closed thread and an
  account without an e-mail address are refused with their own codes.
- **`thread_by_key`** adds the leader's name and e-mail, only while that leader still
  holds a leader role in the organisation.
- **`conversations`** adds who asked and whether it was the caller.

**Tests:**
- `contact_invariants.sql` has 14 checks, passing locally and on hosted.
- `samtale-behaviour.mjs` gains four steps: asking, the offer and its mailto, the phone
  width, and withdrawing. 22/22.

**Noted, not changed:** `reply_to_thread` and `set_thread` (0018) gate on role only, not
on the department scope and k that `conversations` applies. A leader can only reply to
thread ids they were shown, so this is a narrowing to make, not a leak seen in use.
`app.thread_visible` is the predicate to narrow them with.

## D-83 — The public site has sections, not one page

**The design:** it drew one public page: the start page, with the logo, "Logg inn" and "Kom i
gang" in the header, and a one-line footer.

**The request:** the owner asked for more than a single landing page: "plattform", "om
oss", "bruksområder" and whatever else divides the content naturally.

**What was built:**
- **A header menu.** Plattform, Bruksområder, Priser, Artikler and Om oss sit between the
  logo and the two buttons, using the application nav's own treatment: a 10 px pill, and
  `bg-sbg` for the page you are on. Below 1024 px the row folds into a "Meny" button. It
  opens the same links as a list and closes when a link is chosen, on any other
  navigation, and on Escape.
- **A footer of sections.** It has four columns: Produkt, Bruksområder, Ressurser and
  Selskap, plus the contact address. The old footer's "Personvern" link pointed at
  /hjelp/gdpr, which is behind the sign-in. It now points at /sikkerhet, which is public.
- **Seven pages**, all built from one template (`PageTemplate`) and written as messages in
  the same block format as the articles:
  - `/plattform`: grunnlinje, puls, egne spørsmål, results, comments and conversations,
    measures, the annual cycle and the report.
  - `/bruksomrader`: the landing pages grouped by need, role, size and industry. It is a
    CollectionPage.
  - `/helse-og-omsorg`: a new landing page, beside construction.
  - `/priser`: the start page's three plans, extracted into `components/marketing/Plans`
    so that both pages render the same plans.
  - `/om-oss`: an AboutPage.
  - `/sikkerhet`: k = 5, what is and is not stored, and where the data lives.
  - `/kontakt`: a ContactPage.
- **Two new block kinds:** `links` (cards that are links to other pages, internal paths
  only) and `plans`.

**What is left out, and why:**
- **Om oss names no people.** The schema holds no team, so the page says what the company
  is and why it exists, and gives Orgpuls AS and hjelp@orgpuls.no. It makes no invented
  claims about founders, a headcount or customers.
- **Sikkerhet makes no data processing agreement (DPA) claim.** The GDPR help article says
  the DPA and the processing register are not yet in place, so the page says only what
  the schema enforces.
- **Kontakt has no form.** Nothing receives one. The page gives the address the product
  already prints, as a mailto.

**Checked:**
- All 16 public pages have no horizontal overflow at 320, 390, 768 and 1440 px.
- Each page has one H1, valid JSON-LD, and no missing message keys.
- Every internal link resolves.
- Each section's menu entry is marked on its own page.
- The phone menu opens, navigates, closes on navigation and on Escape, and works from the
  keyboard.
- There are no console errors.

## D-84 — The public site shows real screens of the product

**The design:** the start page shows the product once, in the hero, as a drawn card
("Innsikt · Nordvik Anlegg AS", D-37). No other public page shows the product.

**The request:** the owner asked for more pictures of the product on the product page and
the start page, "so we get more of a feel for the product and the solutions", with a
reference that pairs short texts with pieces of the interface.

**What was built:**
- **Nine pictures, none of them drawn.** Each is a crop of a real screen, captured by
  `scripts/marketing/product-shots.mjs` from the running app, signed in as a daglig leder of
  the design fixture's organisation. Every figure in them is the fixture's own: index 61,
  28 av 34, Ytringsklima 28 on Verksted.
  - The crops are found by the words each page shows, not by coordinates, so a rerun after
    a screen changes captures the same region.
  - They are captured at twice the pixel density and written as WebP to `assets/produkt`,
    about 700 kB in all. The site imports them, so they get hashed, immutable URLs and
    `next/image` sizes them per device.
- **Each picture says whose data it is.** The frame's caption is "{screen} · Nordvik Anlegg
  AS", as the hero card's is. The start page's section says the pictures come from the demo
  company. Alt text describes what each shows. A desktop screen sits in the hero's browser
  window; the questionnaire sits in a phone, since that is where employees answer it.
- **Start page:** a section "Slik ser det ut" after "Slik fungerer det".
  - Two wide cards: Oversikt, and the questionnaire.
  - Two pairs: the heatmap and the measures board; a comment and the annual cycle.
- **Plattform:** each section shows its screen. The questionnaire, Oversikt, the heatmap
  with its drill-down, Kommentarer, the measures board, the annual cycle and part 3 of the
  report. This is a new block kind, `shot`, whose ids are `lib/marketing/shot-ids.ts`.

**One element is removed before capture.** The questionnaire is taken from the leader's
preview (/forhandsvis), which renders the respondent's own flow with a banner saying that it
is a preview. The script removes that banner. What remains is the page an employee sees.

**Checked:**
- At 320, 390, 768, 1024 and 1440 px, on the start page and Plattform, there is no
  horizontal overflow.
- Every picture loads and has alt text, and every caption names Nordvik Anlegg AS.
- There are no console errors.

## D-85 — The landing-page review: an orgnr field in the hero, no entry animation on reading pages

**The request:** the owner's guide, `docs/landingsside-gjennomgang.md`. The findings, page by
page, are in `docs/reviews/landing-2026-09-25.md`.

**Where it departs from the design:**
- **The hero's first button is a form.** The design's "Kom i gang gratis" is now the
  organisation number and "Start gratis", with the price, "30 dager gratis · Ingen kort ·
  Svar lagres i EU" and "Ingen avdeling vises før minst fem har svart" under it. The guide
  asks for the field above the fold on a phone and on a desktop.
- **The start page's H1 carries the search term.** The design's "Fra måling én gang i året
  til oppfølging hele året" is now "Fra én medarbeiderundersøkelse i året til oppfølging
  hele året". The compound has a soft hyphen for narrow screens.
- **Landing pages show the product beside their hero**, an image from D-84.
- **On a phone, "Logg inn" and "Kom i gang" move into the menu.** The header is one row, and
  its controls are 44 px tall.
- **The reading pages have no entry animation.** These are the start page, landing and site
  pages, and articles. The bundle's `ht-in` held the paragraph Lighthouse measures as LCP at
  opacity 0 for 0.25 s. Sign-in, sign-up and the application keep it, and
  `prefers-reduced-motion` turns it off everywhere.
- **Fallback faces are metric-matched.** The design's own fonts are unchanged (D-07). Arial
  and Times scaled to their metrics stand in only until the woff2 arrives.
- **"Snakk med oss" opens /kontakt**, the page D-83 added, not an e-mail.

**What is left out:** Orgpuls AS's organisation number in the footer. It is not known, and
it is not invented.

## D-87 — Oppsett has a Databehandleravtale tab, and the agreement is signed in the product

(D-86 and X-054 were the landing-page layout round that was rolled back in e3721f4; the
numbers are not reused.)

**The request:** a basic data processing agreement (DPA) and GDPR agreement, based on
Datatilsynet. The agreement goes under Oppsett, the signed copy is kept there too, and it
must say plainly how little personal data is stored.

**Where it departs from the design:**
- **A ninth Oppsett tab, "Databehandleravtale", after Personvern.** The design has no such
  tab. Its Personvern tab had a "Last ned databehandleravtale" button, which D-33 omitted
  because no agreement existed. Now one does. The tab shows:
  - the agreement itself: parties, 17 sections and 3 appendices;
  - its status: who signed, their title, when, which version, and the text's SHA-256;
  - "Skriv ut eller lagre som PDF".
- **Personvern opens with a status line** ("Databehandleravtalen er signert av …" or
  "… ikke signert ennå", with a link to the tab). The cards "Hva lagres" and
  "Databehandler" are rewritten to match the agreement: the data actually stored, and the
  three sub-processors named.
- **The footer's "Databehandleravtale" is a link** to that tab. D-33 had kept it as a
  non-link because the document did not exist. Driftsstatus is still a non-link.
- **Sikkerhet (the public page) now mentions the agreement.** D-83 had it make no claim
  about a DPA, because none existed.
- **Printing hides the whole app shell.** The rail, header and footer are wrapped in
  `print:hidden`. The old `body > div > header` rule in globals no longer matched the
  nested shell, so the report had printed with the app header on it. There is no visible
  change on screen: the shell suite passes 27/27.

**What the agreement says is stored** (Appendix 1, taken from the hosted schema, not from
the design):
- **About employees:**
  - name and e-mail address;
  - a mobile number, only if the organisation enters one;
  - department and statutory role (verneombud, tillitsvalgt, leader);
  - for each survey, whether an invitation and a reminder were sent and whether the person
    answered. What they answered is never stored against them.
  - the name of whoever owns a measure.
- **Answers:** stored with only a group and an hour, and no link to anyone.
- **Free text:** comments and conversation messages may contain personal data if the
  writer puts it there.
- **About users:** name, e-mail, role, department and a password hash.
- **Nothing else:** no special categories of personal data. Operational logs hold IP
  addresses. The web statistics set no cookies.

So the data is more than "only name, e-mail and phone". The agreement says so, rather than
claiming less than the schema holds.

**The terms Orgpuls chose** where Art. 28 leaves a number open:
- a breach is reported to the controller within 36 hours;
- 30 days' notice before a new sub-processor;
- an audit is announced 30 days ahead, at the controller's cost;
- data is deleted within 30 days of the agreement ending;
- Norwegian law applies.

The owner should have these, and the whole text, reviewed by a lawyer.

**What is left out:**
- Orgpuls AS's organisation number and postal address: they are not known and are not
  invented. The processor's side names Orgpuls AS and hjelp@orgpuls.no.
- An automatic deletion routine: the agreement describes deletion on request and at the
  end of the agreement. The retention card still says the routine is not automated.
- Orgpuls's own agreements with Supabase, Vercel and Brevo: they are outside this
  repository.

**v3 claims, state 12-kommentarer.** Re-written with `--only 12 --write`. The page grew
with D-82's "Be om direkte kontakt" rows, so its seven bottom tiles moved. A build
without this change fails the same way.

## D-88 — The public site follows design-reference/orgpuls/nettside

**The request:** "update the front page; all pages pixel perfect", with the bundle
`Copy of Orgpuls.com.zip`. It holds five pages: Forside, Plattform, Hvorfor, Bruksområder and
Om oss. They are stored in `design-reference/orgpuls/nettside/`, next to the `tuva/` faces
they point to.

**Pixel gate.** `scripts/verify/site-baseline.mjs` renders the five pages into
`nettside/baselines/` the same way the app's baselines were made, with the design's own font
files. `scripts/verify/site-pixel.mjs` then diffs each whole page against the site: the
heights must match, the page must be within 0.1 %, and so must every 900 px band. Built with
the design's own words, the pages measured:

| Page | Differing pixels |
|---|---|
| Forside | 204 |
| Plattform | 244 |
| Hvorfor | 35 |
| Bruksområder | 0 |
| Om oss | only the team cards, below |

With the corrections below applied, the differences sit where the words changed.

**Where the site departs from the design, and why:**
- **Claims the product does not keep are corrected, not published.** An audit of every claim
  against the code found these untrue, and each was reworded to what the product does:
  - The threshold. The design says "anbefalt fem, kan settes ned til tre, aldri under tre".
    The database fixes it at a minimum of 5, and an organisation may raise it to 10
    (`app.k_min()`, organizations.threshold). This is a security invariant, so CLAUDE.md
    wins.
  - The question count. It is 37, not 31: 33 statements plus 4 questions outside the index.
  - The pulse. It asks the three statements of each factor that has open measures. It is
    not "fem spørsmål, under ett minutt", and it does not "stop at 60"; a factor drops out
    when its measures are closed.
  - Reminders. There is one reminder, not reminders on day 2 and day 4.
  - The HR role. There is none, so the HR column is removed from the "Hvem ser hva" table.
    The verneombud row reads "—", not "Foreslå", for measures, and the avdelingsleder row
    reads "Samme dag" for the notice before send-out.
  - Microsoft Entra ID. It is not connected, so it is marked "Kommer" like Teams, Tripletex,
    Visma and Simployer.
  - Brønnøysund. The lookup gets name, address, industry and employee count. It does not
    get locations.
  - Comments. They are grouped by factor, with a tone taken from their answer. They are not
    grouped by topic and not routed as a varsel (whistleblowing notice). Since 0095 the names
    in them are masked (D-145); nothing else is screened for recognisable details. The writer reads the reply through their private link.
  - Small groups. They are withheld and still counted in the whole, not merged.
  - The report. Its audiences are Arbeidstilsynet, AMU, the management group and the
    employees, not "styret" or "personalmøtet". Its page count is not fixed. It is saved as
    PDF; there is no spreadsheet export.
  - Assistenten. Tuva is the help panel: help and grounds for each screen, and the "Kom i
    gang" list. It does not write drafts, cannot be renamed, has no tone setting, and there
    is no customer logo. Setup's "Logo og assistent" card becomes "E-post og SMS", which
    exists.
  - Personvern. Deletion is not automated and there is no access log. The card now names
    what exists: EU storage, the documented basis, and the signed data processing agreement.
  - The Tiltak drawing now shows the playbook's real three suggestions for Ytringsklima, not
    three invented ones.
  - "Positivt fokus". The overview's summary starts with what people thrive with, but the
    areas are listed lowest first. The words say the former.
- **Om oss, team cards.** The design has photo slots and "Navn". There are no names or
  photographs to show, and a placeholder that looks like a person is invented data. Each card
  shows its role and the illustrated face the start page gives that role; the fourth card is
  Tuva, as drawn.
- **Om oss, the contact form.** Nothing on the site receives a message (D-83). "Send melding"
  opens the visitor's own e-mail program with the message addressed to hjelp@orgpuls.no and
  the topic as the subject. Nothing is stored or sent by the site. A stored inbox would be a
  new processing of personal data, and it is left to the owner to decide.
- **Links.** The design's links point at its own files and at `#`, so each is mapped to a real
  page or section (lib/site/nav). The header's "Kom i gang" opens /registrer; "Pris" is the
  start page's price band; "Se prisene" opens /priser.
  - Two footer entries, Personvernerklæring and Vilkår, have no page and are set as text.
    Registration already asks people to confirm that they have read the privacy statement,
    which does not exist yet. That is an open item.
- **Two footers.** The design gives Forside and Plattform one footer, and Hvorfor,
  Bruksområder and Om oss another. Each page gets the one it draws. Every other public page
  gets the second.
- **The rest of the public site** (priser, sikkerhet, kontakt, the landing pages, the
  articles) keeps its pages under the new header and footer. The header no longer links
  Priser and Artikler, and the footer no longer lists the landing pages. They stay in the
  sitemap, and "Arbeidsmiljøloven forklart", "Medarbeiderundersøkelse" and "Personvern og
  anonymitet" link to three of them.
- **Phone.** Below 1024 px the design's header wraps into three rows of sticky header, so it
  folds into "Meny" as before (D-85). Below 768 px, Plattform's product drawing stacks its
  two halves. Neither affects the 1440 gate.
- **Fallback faces.** They now cover only their web font's character ranges. A glyph DM Sans
  lacks, such as → or ✓, fell through to the scaled Arial and was drawn differently from the
  design. It now falls to system-ui, as in the design.
- **What the design gives up, kept as drawn:**
  - The start page's H1, "Første måling ute før lunsj.", no longer carries the search term.
    D-85 put it there after the landing-page guide. The page's title and description still
    carry it, and so does the pill above the H1.
  - The organisation-number field is at the foot of the page, not above the fold.
  - The drawings' faint labels (#8A8272 on the cream fills: "Ferie", the report pages'
    footers, the "kommer" chips) are under 4.5:1. axe flags them; changing the colour would
    change the design.
  - On phones, the logo, "Møt teamet" and the footer links get 44 px targets. The scrollable
    tables can be focused from the keyboard. Neither changes anything at 1440.
- **English.** Every `site.*` message has an English twin, with the same structure and the
  same placeholders. The public pages are static and render in Norwegian.

## D-89 — Oppsett has a Betaling tab: a 15-day trial, one extension, and the invoice details

**The request:** a payment section in the admin settings that sets the customer up for
payment, a 15-day trial, and a button that extends the trial.

**What was built:**
- **The tab.** Oppsett gets a tenth tab, "Betaling", after Databehandleravtale. The design
  has no billing anywhere.
- **The trial panel.** It shows how many days are left, when the trial started and ends,
  and a bar.
  - "Forleng prøveperioden med 15 dager" can be used once, before a plan is confirmed.
  - An expired trial is extended from today, not from its old end date.
- **The plan.** Plans come from the price list: Liten up to 25 employees, Vanlig up to 100,
  and Flere selskaper by agreement. A plan the organisation's stated headcount has outgrown
  is shown but cannot be chosen, and the one that fits is marked.
- **The invoice.** An invoice e-mail address, an optional reference, and EHF when the
  organisation has an organisation number. "Bekreft abonnement" confirms. For Flere
  selskaper the button reads "Be om tilbud".
- **Who sees it.** Only the daglig leder. Others read a line saying who handles payment.

**Choices made where the request was open:**
- **Invoice, not card.** Norwegian customers of this size pay by invoice or EHF, and a card
  needs a payment provider with its own keys and agreement. Nothing here holds or asks for a
  card, so "Ingen kort" on the site stays true.
- **One extension of 15 days, by the daglig leder.** The number of extensions and their
  length are in the RPC. Changing them is a new migration.
- **Nothing is locked when a trial runs out.** The tab says so and asks for a plan. Whether an
  expired, unconfirmed organisation loses access, and how, is a product decision. It is left
  open rather than guessed.

**The trial is 15 days everywhere it is promised.** 23 messages per language changed from
30 to 15 days: the site, the landing pages, the articles, Priser and registration. The link
preview images in public/og were rendered again. These keep "30 dager" because they are not
the trial:
- the data processing agreement's notice, audit and deletion periods;
- the start page's answer about deleting answers after cancellation.

## D-90 — A platform admin for Orgpuls staff, on its own host

**The request:** build the admin described in "Orgpuls — Platform Admin Specification", and
recommend how to handle subscriptions and invoices. This entry covers Phase 1 of the
specification ("run the business"), built in stages. The admin is in English, as the
specification decides. It has no design in `design-reference/`. It uses the product's tokens
and plain cards and tables, so there is no pixel gate for it.

**What was built (0049, X-058):**
- **Sign-in.** Sign-in is at `/admin/login`, and every admin needs a TOTP authenticator.
  - An account without an admin role gets the same refusal as a wrong password.
  - On first sign-in the account enrols an authenticator: QR code plus a key to type in.
  - Every later sign-in asks for a code.
  - Thirty minutes without a request signs the admin out.
- **Dashboard:**
  - MRR and ARR;
  - paying organisations and offers requested;
  - active trials and those ending within seven days;
  - expired, unconfirmed trials;
  - trial-to-paid conversion;
  - the activation funnel per signup month: employees added, survey planned, sent, result
    unlocked, results viewed, measure created, paid, and median hours to the first send.
- **Organisations.** A search and a status filter (trial, active, expired). Each row shows:
  - plan and MRR;
  - employees registered against employees stated;
  - the last survey and its response rate.
- **An organisation.** One page with:
  - the company, from Brønnøysund;
  - billing and the data processing agreement;
  - structure as counts;
  - users and their MFA;
  - surveys, as metadata only;
  - a timeline;
  - the e-mail and SMS log, as counts;
  - internal notes;
  - the organisation's audit trail.
  - "Extend trial" takes days (1–60) and a reason, and both go to the audit log.
- **Users.** A search over people who sign in, with their organisations, roles, pending
  invitations, last sign-in and MFA. Employees who answer surveys are never listed.
- **Operations:**
  - the scheduler's recent runs;
  - the notice queue for the last 14 days;
  - failures and retries, with addresses masked in the provider's error text.
- **Audit log.** Every admin read and action, newest first.
- **Admins.** The admin list. A super-admin grants, changes or removes a role, with a reason.

**The admin host.** The admin is served under `/admin`. When `ADMIN_HOST` is set, e.g.
`admin.orgpuls.com`:
- that host serves only the admin, and every path on it maps to `/admin`;
- every other host answers `/admin` with 404;
- the session cookie belongs to the admin host alone, apart from the product's.

Without `ADMIN_HOST`, as in local development, `/admin` works on the one host.

**Becoming an admin.** An admin account must not belong to a customer, so it cannot come
from registration, which creates an organisation. For the first super-admin:
1. In the Supabase dashboard, open Authentication › Users › Add user. Use an address that is
   not used for any organisation, set a password and tick "Auto confirm".
2. In the SQL editor, run:
   `insert into app.platform_admins (user_id, role) select id, 'super_admin' from auth.users where email = '<that address>';`
3. Sign in at `/admin/login` and enrol an authenticator.

Later admins are created the same way in step 1. A super-admin then grants their role on the
Admins page, and the audit log records it.

**Verified in the browser** against the hosted project, with a throwaway admin account that
was deleted afterwards:
- A wrong password, and a customer account, are refused with the same line.
- `/admin` without a second factor goes to the code step.
- A wrong code is refused; the right one opens the dashboard.
- Every page loads with no console errors.
- A reason under five characters and a day count outside 1–60 are refused, with the field
  that failed named.
- Granting an admin role to a customer account is refused.
- Thirty minutes idle returns to the sign-in with a notice.
- With `ADMIN_HOST` set, `/admin` on the product host is 404, and the admin host serves the
  admin from its root.

**Found and fixed during that run:**
- **Refused forms lost their input.** React resets a form after its action runs, so a
  refused "Extend trial" put the days field back to 15. The next press then sent 15, not what
  was typed.
  - The admin's forms are now controlled and clear only on success.
  - Oppsett › Betaling had the same flaw with the invoice fields, and is fixed the same way.
  - This is how the test extended Demobedriften AS's trial by 15 days instead of 1. Its trial
    now ends 25 October 2026, and the audit log records the extension.
- **The wrong field was named.** A reason that was present but too short was reported as a
  bad day count.
- **Table cells wrapped.** The funnel and survey tables wrapped figures such as "86 %".
  Cells now keep figures on one line.

**Left open:**
- **The funnel's median can be negative.** It counts sends from before signup, which exist
  for organisations whose history was imported (the demo organisation), so its median is
  negative. Only sends after signup should count. This goes in the next migration, because
  0049 is applied.
- **Round kinds and statuses** are shown as the database's codes (`grunnlinje`, `lukket`).

## D-91 — The admin's web analytics and signup attribution

**The request:** the part of the admin specification's Phase 1 about marketing:
- web analytics built in-house and cookieless;
- UTM attribution stored on signup;
- a single view from website visit to paying customer.

**What was built (0050, X-059):**
- **A beacon on the public site** (components/marketing/SiteBeacon). It counts every page
  view and every press on something that leads to /registrer: a "Kom i gang" link or the
  organisation-number form. It sends them to /api/wv, which answers 204 whatever happens.
  It replaces UtmKeeper and still keeps the utm tags.
- **Signup attribution.** The registration form sends the tab's first page, its referring
  host and utm tags (first touch), and the tags at signup (last touch). The server records
  them once for the new organisation. A signup never fails because of this.
- **Admin › Web analytics**, over 7, 30, 90 or 365 days:
  - visitors, sessions, pages per session, bounce and signups;
  - visitors per day;
  - the site funnel: visit → Priser or Plattform → "Kom i gang" → registration →
    organisation created;
  - sources and campaigns, each with signups, organisations that sent a survey, and paid;
  - landing pages with bounce and signups;
  - the most viewed pages.
- **An organisation's page** shows its source: channel, first page, referrer, and the tags
  at first visit and at signup.
- **Product usage.** Opening Resultater, Rapport, Kommentarer or Tiltak counts once per user
  and day (0049's `track_product_event`). This backs the funnel's "results viewed" step.
- **The funnel's median** now counts only sends after signup. It was negative for the demo
  organisation (D-90).

**Choices made where the specification was open:**
- **Visitors are per day.** A hash that rotates daily cannot count one visitor across days.
  The alternative is a stable identifier, which is what the specification rules out.
- **"Organisation created" has no percentage in the site funnel.** It counts every signup
  in the period, including those whose visit was not counted. It is not a subset of the
  sessions above it.
- **No persona clicks.** The specification names four "Hvem er du?" cards. The current site
  (D-88) has no such cards, so there is nothing to count.

**Left open, each for a stated reason:**
- **Search Console** needs a Google service account and its key in the environment. Neither
  exists.
- **Cost per paid customer** needs campaign spend, which the specification says is entered
  by hand. There is no form for it yet.
- **A legal confirmation that no banner is needed**, as the specification asks.

**Verified in the browser** against the hosted project:
- A visit from Google with utm tags, through Priser to "Kom i gang", recorded four events.
  Each had the right path, host, tags and a 32-character hash, and no cookie was set.
- A browser with GPC sent nothing.
- The registration action's body carried the first and last touch. The request was aborted
  before an account was created.
- The four product pages each counted once.
- The Web analytics page showed the visit.
- The test's events and admin account were deleted afterwards.

## D-92 — Tickets: the contact form and in-app help land in one queue in the admin

**The request:** the ticketing part of the admin specification's Phase 1. It asks for:
- the contact form, in-app help and e-mail as ways in;
- ticket types, statuses and queues;
- tickets linked to an organisation and user;
- canned replies.

**What was built (0051, X-060):**
- **The contact form on Om oss files a ticket.** Its four topics choose the queue:
  - product question → Support;
  - pricing → Sales;
  - first send → Support;
  - personvern → Personvern.

  The visitor reads "Takk! Vi har fått meldingen …". It no longer opens the visitor's own
  mail program (D-88). A field that only form bots fill in is kept off screen. The page
  renders exactly as before.
- **Hjelp has a request form.** "Skriv til oss her" sits below the e-mail card in the right
  column, where the design draws a chat that does not exist (D-34).
  - It files a ticket with the member's organisation, role and browser.
  - It does not record the page the member came from. The product sends
    `Referrer-Policy: no-referrer` to protect the respondent's token, so that page is
    unknown.
    - The first version sent the referrer and so always recorded /hjelp. It was removed.
    - The specification's "current page" would need a help button on every screen, in the
      help panel. That is left open.
  - It answers with the case number.
  - It is the only change to that screen, and it is not in the pixel gate (the gate's
    21-hjelp is the help panel).
- **Admin › Tickets.**
  - Queues (Support, Billing, Sales, Personvern) with open counts.
  - Views: open, mine, unassigned, overdue, resolved, all.
  - A search.
  - Overdue first, then by priority.
- **A ticket's page:**
  - the conversation, with internal notes marked and whether each reply's e-mail was sent;
  - a reply or note, starting from a Norwegian canned reply if wanted, then a status;
  - the fields (status, type, queue, category, impact, urgency, assignee, caused-by
    problem);
  - the deadlines;
  - the organisation's surveys, to link;
  - the incidents a problem caused;
  - other tickets from the same organisation or address;
  - the timeline.
- **Replies are e-mailed by the dispatcher** (orgpuls-dispatch, deployed). They use the
  product's mail layout and the case number, with hjelp@orgpuls.no as Reply-To.
- **An organisation's page lists its tickets.**

**Choices made where the specification was open:**
- **Priority matrix.**
  - Blocking a send for one or many organisations is urgent.
  - Blocking for one user, or affecting many organisations without blocking, is high.
  - Personvern is at least high.
  - A feature request or sales question is low.
  - Everything else is normal.
- **Business hours** are Monday to Friday, 08–16 in Oslo. A business day is eight hours.
  Public holidays are not subtracted yet.
- **A service request is carried out on the organisation's page**, where the action already
  is and is audited with its reason. The ticket links there. Running actions from the ticket
  is Phase 2 in the specification.
- **Contact-form tickets are linked by e-mail address** to an existing customer, and the
  admin sees that the link is unverified.

**Left open:**
- **E-mail in.** It needs an inbound route at the mail provider. Until then, a customer's
  answer to a reply reaches hjelp@orgpuls.no, not the ticket.
- **CSAT, reporting, attachments and @mentions,** and editing canned replies in the admin.
  These are Phase 2 in the specification.
- **Ticket numbers are not consecutive.** They come from a sequence, and the SQL suite's
  rolled-back probes use numbers up.

**Found and fixed while testing:**
- **Stale fields.** The fields form kept the values it was first drawn with. Saving it after
  a reply had moved the status to "waiting on customer" put the status back to "new".
  - The form now sends only the fields changed in it.
  - It is redrawn from the ticket's current values after every change.
- **An invalid module.** A "use server" file exported a constant, which fails the build.
  The categories moved to lib/help/request.

**Verified in the browser** against the hosted project:
- The contact form filed a ticket, and the honeypot is invisible.
- The dev account's Hjelp form filed #1008 with its organisation and role.
- In the admin:
  - a canned reply was sent and queued as e-mail;
  - an internal note was saved and not queued;
  - impact "one organisation" with a blocked send made the ticket urgent;
  - a survey was linked;
  - the organisation's page listed the ticket.
- The dispatcher's next run handed all six queued test replies to Brevo (`tickets: sent 6`).
  They went to `.invalid` test addresses, so they bounce.
- The test's tickets and admin account were deleted afterwards.

## D-93 — A recommendation for subscriptions and invoices, not yet built

**The request:** "recommend subscription and invoice håndtering".

**The recommendation** is in `docs/BILLING_RECOMMENDATION.md`:
- **Stripe Billing is the ledger** for card and invoice customers alike.
- **Invoice customers** get a *send invoice* subscription. The accounting system delivers the
  invoice as EHF over PEPPOL, or as a PDF when the buyer cannot receive EHF.
- **Orgpuls keeps a mirror** of plans (as rows, with price versions), subscriptions,
  invoices and events.
  - The mirror is written only by a signed webhook.
  - Access follows the lifecycle: trial, active, past due, suspended (read-only), cancelled,
    deleted.
  - The database enforces it, and a running survey is never cut off.
- **Band upgrades** wait for the customer's confirmation, as decided.
- **The admin gets** subscriptions, invoices, dunning, credits and coupons through audited
  `finance` RPCs.

**Nothing of it is built,** because it needs:
- decisions only the owner can make: the trial length (the specification says 30 days, the
  product 15), what happens at trial end, the accounting system, and whether to take cards;
- accounts and keys that do not exist: Stripe, the accounting-system integration, and Orgpuls
  AS's MVA registration and bank details.

## D-94 — When a trial ends unconfirmed: 14 days' grace, then read-only

**Decided by the owner:**
- the trial is 15 days;
- 14 days' grace follow it, then read-only access until a plan is confirmed;
- the accounting system is Fiken.

The specification's "30-day trial" is superseded.

**What was built (0052):**
- **One rule in one place.** `app.org_access()` returns `trial`, `grace`, `read_only` or
  `active`.
  - `app.grace_days()` is 14, a function like `app.trial_days()`, so no row can change it.
  - The admin's organisation status now reads the same function. Its "expired" became
    "grace" and "read-only".
- **Read-only means nothing new is sent. Nothing is taken away.**
  - Members sign in and read every result and report as before.
  - Starting a pulse (`start_next_pulse`) and planning the first round (`plan_first_round`)
    are refused with "read_only". The originals were moved to `app` unchanged, and the
    public names check access first.
  - The scheduler sends no forvarsel and opens no planned round. A round that falls due is
    held a day at a time, so it opens with its full length once the plan is confirmed.
  - A round that is already open runs on: its reminders go out and it closes on its date.
- **Confirming a plan, or an admin extending the trial, lifts it at once.** The held round
  opens on the next tick.
- **A line over every screen** during grace and read-only: what still works and until when.
  - The daglig leder gets "Bekreft abonnement", linking to Oppsett › Betaling.
  - Everyone else is told the daglig leder does it.
  - During the trial and once confirmed, nothing is drawn, so every pixel-gated screen is
    unchanged.
- **Oppsett › Betaling:**
  - The pill counts the days until read-only, then reads "Bare lesetilgang".
  - The trial text states the rule.
  - After the trial, the first invoice runs from the day of confirming, not from a date
    already past.

`supabase/tests/trial_end_invariants.sql`: 10 checks, locally and on the hosted project.
They cover:
- the ladder of states;
- both refusals;
- a due round held while an open round still closes;
- the held round opening with its full length after confirming;
- members-only state;
- rollback.

**Verified in the browser** by moving Nordvik Anlegg AS's trial dates on the hosted
project, and then restoring them exactly:
- grace showed the yellow line and "9 dager til bare lesetilgang";
- read-only showed the line and "Bare lesetilgang".

The pulse refusal could not be pressed there, because a round is open. The SQL suite covers
it.

**Left open:**
- **E-mail warnings** before the trial ends, when grace begins, and before read-only.
- **Fiken's integration,** which needs Orgpuls AS's Fiken account and an API token.

## D-95 — Om oss is removed

**The request:** "Remove om oss page".

**What changed:**
- **The page is gone.** `/om-oss` answers with a permanent redirect to `/kontakt`, so old
  links and search results land somewhere real. It is out of the sitemap and the public
  paths.
- **The contact form moved to `/kontakt`**, under the page's cards, at `#skriv`. It is the
  same ContactBlock, and it still files a ticket (D-92). Its words moved from
  `site.omOss.contact` to `site.contact`.
- **The menu** no longer has "Om oss".
- **The footers:**
  - The first footer's "Om oss" column keeps Hvorfor Orgpuls and Kontakt (now `/kontakt#skriv`),
    and loses "Teamet".
  - The second footer's column became Personvern og anonymitet (`/sikkerhet`) and Kontakt.
- **Hvorfor:** the FAQ's "skriv til oss" link points to `/kontakt#skriv`.
- **The start page** keeps its short "about us" section with the team faces, but its
  "Møt teamet" link is removed, since the page it opened no longer exists.
  - That link is gone from the pixel comparison with the design (the site gate already
    differs where D-88 corrected words).
  - Om oss is dropped from `site-pixel.mjs` and `site-baseline.mjs`. The design bundle and
    its baseline image stay in `design-reference`, as the source.

The messages that only Om oss used were removed from both languages: the page, its SEO
title, the menu entry, the footer's "Teamet", "Oppdraget" and "Løftene", and the start page's
"Møt teamet".

## D-96 — Language selection: Norsk / English, on the site and in the app

**The request:** "What about the English translation and language selection? Implement if
not there, also on front page."

**What was there:**
- **The translation was.** `messages/en.json` holds every key (`verify:i18n` enforces
  parity), and a scan found one untranslated heading, the small-business landing page's h1.
  It is now translated.
- **Selection was not.**
  - `lib/i18n/request.ts` said the locale came from the profile, the organisation or a
    cookie, but read only `requestLocale`, which is empty without locale routing.
  - Everyone got Norwegian, and the public pages were pre-rendered in Norwegian at build
    time (`force-static`).

**What was built:**
- **The locale is the `NEXT_LOCALE` cookie, or Norwegian.**
  - It is set by the switch (`lib/i18n/actions`) and kept for a year.
  - There is no locale routing, as CLAUDE.md fixes, so the address stays the same.
  - The browser's language is deliberately not used. A search engine or a first visit
    always gets the Norwegian site, which is the source language and the market.
- **Signed in, the choice follows the person.**
  - Switching also saves it on their profile (`app.profiles.lang`; RLS allows only their
    own row).
  - At sign-in and on accepting an invitation, the profile's language is restored into the
    cookie. With none saved, a choice made on this device is saved to the profile. With
    neither, the organisation's default (Oppsett › Selskap) applies.
  - A language chosen on the site before signing up is saved on the new profile.
- **Where the switch is:**
  - The public header, beside "Logg inn", on every page including the front page. It is a
    small NO | EN control.
  - The phone menu, as "Norsk | English".
  - The app's account menu, as a "Språk / Language" row.
  - Each language is named in itself.
- **The public pages are rendered per request.** `force-static` was removed from 15 pages,
  so the language can be read.

**Deviation from the design:** the design has no language control. The header's NO | EN
control is new and sits left of "Logg inn". It changes the public header on every page, so
the site pixel comparison differs there. The app's header is unchanged: the switch is inside
the account menu.

**Verified in the browser:**
- A browser set to English still got Norwegian by default.
- Choosing EN on the front page redrew it in English at the same address.
- Plattform, Priser, Kontakt, Hvorfor, Lovkrav, Registrer and Logg inn showed no Norwegian
  words.
- The phone menu has the switch.
- In the app, the account menu switched to English.
  - Målinger, Resultater, Tiltak, Oppsett › Betaling and Hjelp then showed no Norwegian
    words.
  - The choice was saved on the profile. The dev account's language was restored to
    Norwegian afterwards.
- No sideways scroll at 390, 640, 768, 1024 or 1100 px.

**Left as it is:**
- **JSON-LD says `inLanguage: nb-NO`.** That is what a crawler, which has no cookie, reads.
- **The platform admin stays English,** as decided (D-90).

## D-97 — What happens to a mail after sending, and no opens or clicks

**The request:** e-mail analysis in the admin and the product (bounce, read, click and so on),
and a check of whether the provider tracks our mail.

**The tracking check** is a new read-only `?probe=tracking` on the dispatcher. It reads
Brevo's 30-day totals, the hosts clicked links went through (never a link, since
invitations carry tokens) and the registered webhooks. It is run through pg_net, so the
dispatch secret stays in Vault. It found:
- 10 requests, 4 delivered, 6 soft bounces;
- **6 opens (4 unique) and 1 click**, on a password-reset mail.

**Brevo counts opens and clicks on our transactional mail.** It rewrites every `<a href>`
through its click redirect, and cannot be told not to per message (a documented,
tested limitation; see below). A link carrying a token therefore passed through, and was
logged by, the provider together with the recipient's address. That covers a respondent's
survey link and a sign-in link.

**Fixed in code:**
- Invitation, reminder and auth mails write their one link **as text in a yellow box**, not
  as a button link. Brevo does not rewrite text, and the recipient's mail program makes it
  clickable itself.
- Notices to leaders (forvarsel, resultat) keep their button. Their links carry no token.
- `mail.test.ts` asserts that no token-bearing mail contains `href=`.

**For the owner to switch off in Brevo:** the open-tracking pixel. Brevo's account setting
for transactional tracking offers "anonymous tracking", so opens are no longer tied to an
address. It is an account setting that the API cannot change.

**Delivery events (0053):**
- **The webhook.** A Brevo webhook (id 2205404) posts delivered, hard and soft bounces,
  blocked, spam, invalid, deferred and unsubscribed to a new function,
  `orgpuls-mail-events`.
  - Opens and clicks are not subscribed to, and are ignored if they arrive.
  - The webhook's address carries a key, `ORGPULS_MAIL_EVENTS_SECRET`, set as a function
    secret and never printed. Without the key the function answers 403.
  - `?probe=webhook` registers the webhook idempotently, and stops rather than duplicating
    it when Brevo's list cannot be read.
- **`record_mail_event`** (service role only) matches the provider's message id to the
  outbox row or ticket reply.
  - It keeps the event with its time and the provider's reason, with addresses masked.
  - The latest event is the state; an older one arriving late does not overwrite it.
- **An employee whose address hard-bounced, was invalid, was blocked, complained or
  unsubscribed** is recorded in `app.address_problems`.
  - This is a table of its own, not a column on `employees`, which customers can update.
  - Changing the address clears it; a later delivery clears it too.
- **The product:** Oppsett › Ansatte shows the daglig leder "N adresser tar ikke imot
  e-post", with name, address, what the provider said and the day, so the address can be
  corrected.
  - It does not say which round or when during it.
  - Other roles see nothing.
- **The admin:**
  - each organisation's e-mail log gains delivered, bounced and complaints, and the number
    of flagged addresses;
  - Operations gains a Deliverability card for 30 days: delivered, bounced or blocked, soft,
    spam or unsubscribed, and unmatched events;
  - the card warns past 2 % bounces or 0.1 % complaints, and lists the organisations with
    problems.

**Why no opens or clicks:**
- An open or a click is a per-person timestamp of engaging with a survey link. Next to an
  answer's submitted hour it narrows who answered.
- The response rate already measures engagement without naming anyone.
- Apple Mail's privacy protection makes open counts unreliable anyway.

**On showing which address bounced:**
- It tells the daglig leder that a named person was not reached. It says nothing about an
  answer.
- The alternative is the specification's most common ticket, "people didn't get it", with
  no way to fix it.
- It is limited to the daglig leder, and to the address and day, never the round.

**Verified end to end on the hosted project:**
- A ticket reply queued to a non-existent `.invalid` domain was sent by the dispatcher at
  07:10:00.
- Brevo posted a soft bounce at 07:10:01. It was recorded, matched to the reply, and stored
  as "Unable to find MX of domain …" with no recipient address.
- The Ansatte panel and the admin's log and Deliverability card were checked in the browser
  with a temporary flag and admin.
- All the test data was deleted afterwards.

`supabase/tests/mail_events_invariants.sql`: 12 checks, locally and on hosted.

**Left open:**
- **SMS delivery reports:** Brevo's SMS webhooks are separate.
- **Notices to several leaders** carry one message id for the group, so only its first
  recipient's events are matched.
- **Ticket replies do not show their own delivery state** on the ticket page yet. The
  Deliverability card counts them.

Source for the rewriting limitation: elan-registry/registry#2151 (a tested report).

## D-98 — en.orgpuls.com and admin.orgpuls.com; "Pris" goes to /priser

**The request:** the owner pointed admin.orgpuls.com and en.orgpuls.com at the project, and
noted that "Pris" on the front page does not open /priser.

**What changed:**
- **Hosts are known in code** (lib/hosts), so no Vercel variable is needed. `ADMIN_HOST`
  and `EN_HOST` still override.
  - **admin.orgpuls.com** serves only the admin, at its root (`/login`, `/orgs` …).
  - **/admin answers 404 on the public hosts:** www.orgpuls.com, orgpuls.com and
    en.orgpuls.com. Local and preview builds keep /admin.
  - **en.orgpuls.com is the English site.** The host decides the language there, whatever
    the cookie says. On www the saved choice applies, otherwise Norwegian (D-96).
- **Each public page declares its twin:**
  - `hreflang` nb (www), en (en.orgpuls.com) and x-default (www);
  - a canonical address on its own host;
  - Open Graph locale nb_NO or en_GB.
  - The sitemap lists every page with its English alternate.
- **The public NO | EN switch is a link** to the same page on the other host, on the
  production hosts. Locally and on previews it still sets the cookie.
  - In the app, choosing Norsk while on the English host moves to www.
- **"Pris"** in the menu and both footers opens /priser, not the price section of the front
  page. The JSON-LD offer points there too.

**Verified** with each host name against a production build:
- www `/` and `/priser` are Norwegian; en `/priser` is English, with the canonical and
  `hreflang` as above.
- `/admin` answers 404 on www and en.
- admin.orgpuls.com `/` goes to its `/login`.
- localhost keeps `/admin`.
- The sitemap has 19 English alternates.

## D-99 — SMS delivery reports

**The request:** "add sms". Mail delivery events existed (D-97); an SMS that never arrived
was invisible.

**What changed:**
- **A second Brevo webhook** (id 2205413), type transactional, channel `sms`.
  - Brevo allows one webhook per address, so its address ends `&channel=sms`.
  - Events: delivered, soft and hard bounce, unsubscribe, rejected, skip.
  - The dispatcher's `?probe=webhook&channel=sms` registers it idempotently. A registration
    is refused when the existing list cannot be read, so no duplicate can be made.
- **orgpuls-mail-events reads SMS reports:**
  - `msg_status`, `messageId`, `ts_event` or `date`, `description` and `bounce_type`;
  - maps them onto the same `record_mail_event` kinds (a rejected or blacklisted number is
    `blocked`, a skip is `error`);
  - ignores replies.
  - **The phone number and any reply text are never passed on.** A number quoted in the
    description is masked to `[number]` before it reaches the database.
- **No migration was needed:**
  - the SMS message id is already the outbox row's `provider_id`;
  - `record_mail_event` already flags `address_problems` on the row's own channel;
  - changing a phone number already clears the SMS flag (0053).
- **Oppsett › Ansatte:** the panel reads "adresser eller numre når ikke fram". An SMS problem
  has its own wording ("nummeret finnes ikke", "nummeret tar ikke imot SMS fra oss" …).

**Limit:** Brevo reports an SMS as delivered when the operator confirms it. An operator
that sends no confirmation leaves the row with no delivery state, not a failure.

## D-100 — Web analytics: location, time and network, not the full IP address

**The request:** "to the web can we add source, location, time, country and IP address".

**What already existed:**
- **Source:** the referring host, utm tags and channel (0050).
- **Time:** each event's `at`.

**What changed (migration 0054):**
- **Location.** `app.web_events` gains `country`, `region` and `city`.
  - Vercel's edge fills them from the request (`x-vercel-ip-country`, `-country-region`,
    `-city`); /api/wv passes them on. Nothing is looked up by Orgpuls.
  - They are cleaned in SQL: a two-letter country, a short region code, and a city of at
    most 80 characters with control characters and markup removed.
- **Network.** `network` holds the IP address cut to its network: /24 for IPv4, /48 for
  IPv6.
  - The full address is still only an input to the day's visitor hash, as before.
- **The admin's Web page** gains three cards:
  - Countries;
  - Cities;
  - Latest visits: the newest 100 sessions, each with its time (Oslo), source (channel,
    source, medium, campaign), landing page, pages seen, location, network and outcome.

**Deviation: the full IP address is not stored.**
- The signed databehandleravtale (vedlegg 1) says the site statistics "sier ikke hvem som
  besøker".
- X-059 built the analytics so that nothing can follow a person.
- A full address identifies an office or a household. A /24 or /48 network is the level
  Google Analytics' IP anonymisation keeps.
- Keeping the full address is a one-line change in `track_web_event`. It first needs a
  decision and new privacy wording; this is logged as an open item.

**Limit:** location is where the network says it is. Mobile networks and VPNs often report
the operator's city, not the visitor's. Visits recorded before 0054 show "Not known".

**Verified:**
- `web_invariants.sql`: 17 checks, locally and on hosted. The new check covers a cleaned
  city, a rejected region, and IPv4 and IPv6 cut to /24 and /48.
- Beacons with Vercel's headers through `next start` stored `NO | 46 | Tønsberg |
  198.51.100.0/24`, and the admin page showed them in all three new cards. The probe rows
  and the probe admin were deleted afterwards.

## D-101 — The marketing CRM: contacts, consent, segments, campaigns

**The request:** "there is no CRM". The admin specification's Marketing CRM, built to its
Phase 2 scope ("CRM basics: contacts, consent, segments, newsletter and one-off campaigns").
Migration 0055, X-061.

**What was built:**
- **Contacts** (admin › CRM):
  - Every person who signs in, synced from their account with its organisation and role.
  - Prospects who said yes: the newsletter page (/nyhetsbrev), the contact form's new
    checkbox, a CSV import, or an admin who records the consent.
  - Each contact shows its type (prospect, trial user, customer, former), source, basis
    (consent, existing customer, none), status, and whether a campaign would reach it now.
  - A contact page shows every CRM mail with its delivery, open, click and unsubscribe, and
    offers an unsubscribe on the person's behalf, or erasure.
- **Respondents are never contacts.** No CRM table references, and no CRM function reads,
  the employee, invitation or answer tables. `crm_invariants.sql` proves it.
- **Consent and compliance:**
  - Newsletter signups are double opt-in. The confirmation link carries a token, kept only
    as a hash, valid for seven days, written as text in the mail (D-97).
  - An import row without a consent source is refused; an admin adding someone must say
    where the consent came from.
  - **Every campaign mail carries a one-click unsubscribe:** List-Unsubscribe and
    List-Unsubscribe-Post (RFC 8058) to /api/avmeld, and a footer link to /avmeld, which asks
    for one press so a link scanner cannot unsubscribe anyone. The footer also says who sends
    and why.
  - **The suppression list holds sha256 hashes, not addresses.** It catches unsubscribes,
    hard bounces, spam complaints and blocks, and it outlives an erased contact.
  - List hygiene: a contact with no engagement (or consent) in 12 months is not mailed.
- **Segments:** saved filters on:
  - type, role, source, tags and language;
  - the organisation's employee count and NACE code;
  - "no survey opened in N days";
  - mailable only.

  Counts and a preview are live.
- **Campaigns:** newsletter, campaign, promotion or product announcement.
  - An editor of blocks (heading, text, button), with a subject and preheader.
  - A preview drawn by the same module the dispatcher sends with, at phone and desktop width.
  - A test to the admin's own address, then scheduling or sending now, and cancelling.
  - Links to orgpuls.com get `utm_source=orgpuls&utm_medium=email&utm_campaign=…`.
- **Reporting:**
  - Audience, sent, delivered, bounced, opened, clicked, unsubscribed and complaints.
  - From the site's own analytics: visits, page views, organisations created and paid,
    joined on utm_campaign.
  - Opens and clicks come from Brevo's webhook, which now asks for them. They are kept only
    for CRM sends; for the product's own mail they are still dropped (D-97).
- **A separate marketing stream.** The dispatcher sends CRM mail only from
  `ORGPULS_MARKETING_FROM`, and only when:
  - its domain differs from the product's sender;
  - Brevo reports that domain as authenticated.

  Otherwise marketing waits and nothing is sent, so a campaign cannot hurt the survey
  invitations' reputation.
- **A new admin role, marketing**, sees the dashboard, web analytics and the CRM. An analyst
  may read the CRM; only a super-admin may turn on the existing-customer exception.

**Deviations and limits:**
- **Existing-customer exception off by default.** Markedsføringsloven § 15 lets a business
  mail its customers about similar products without consent, only if they could reserve
  themselves when the address was collected. Orgpuls' registration does not offer that, so
  the exception is a setting, off until a super-admin turns it on with a reason. Until then
  only consented contacts are mailed.
- **Not built (the specification's Phase 3, or waiting on Billing):**
  - A/B tests on the subject;
  - automated sequences;
  - promotion coupon codes (Billing has no coupons yet);
  - "site visits after a click" per contact. The site's analytics is built so that no visit
    can be tied to a person (X-059), and that stays.
- **A campaign goes only to contacts whose language is the campaign's.** Write one campaign
  per language.
- **Sending is blocked until the owner acts:**
  - a marketing subdomain (e.g. `nyheter.orgpuls.com`) is authenticated in Brevo, with SPF,
    DKIM and DMARC;
  - `ORGPULS_MARKETING_FROM` is set as a function secret.

  Until then, confirmations and campaigns wait in the queue. The admin shows how many are
  waiting.
- **No design exists** for /nyhetsbrev, /avmeld or the contact form's checkbox:
  - the pages are the new-password page's card with the contact form's fields;
  - the checkbox uses the form's own text styles.

**Verified:**
- `crm_invariants.sql`: 17 checks, locally and on hosted. All 33 SQL suites pass locally.
- Unit tests of the campaign and opt-in renderers: UTM on own links only, escaping, the
  unsubscribe link and text, and the opt-in link as text.
- In the browser against hosted:
  - a newsletter signup, then confirmed with the real token;
  - the contact form with the box ticked (a ticket plus a pending contact);
  - a contact added, and a CSV import with one row refused for missing consent;
  - a segment previewed (4 contacts, 3 mailable) and saved;
  - a campaign written, previewed, tested and sent now;
  - the dispatcher's claim queued exactly the 3 mailable contacts;
  - an open and a click recorded, and an unsubscribe from the mail's token that suppressed
    the address;
  - the report and the contact's timeline showed it all.
- Every test row, the test ticket and the probe admin were deleted afterwards.

**Update, the marketing domain (26 September):**
- `nyheter.orgpuls.com` is registered in Brevo through the dispatcher's new
  `?probe=marketing-setup`. The probe is idempotent; with `&authenticate=1` it asks Brevo to
  check DNS and, once authenticated, registers the sender.
- The function secrets are set: `ORGPULS_MARKETING_FROM=hei@nyheter.orgpuls.com` and
  `ORGPULS_MARKETING_FROM_NAME=Orgpuls`.
- Marketing mail answers to the support inbox (Reply-To), since the subdomain has none.
- orgpuls.com's DNS is at Spaceship, which this project cannot reach, so the owner adds the
  records Brevo asked for, in the orgpuls.com zone:

| Type | Host | Value |
|---|---|---|
| CNAME | `brevo1._domainkey.nyheter` | `b1.nyheter-orgpuls-com.dkim.brevo.com` |
| CNAME | `brevo2._domainkey.nyheter` | `b2.nyheter-orgpuls-com.dkim.brevo.com` |
| TXT | `nyheter` | `brevo-code:a767ee2c6ea6890305b5686e6513f70f` |

- DMARC is inherited from `_dmarc.orgpuls.com`, and Brevo already reports it as valid.

**Update, authenticated (27 September):** the owner added the three records at Spaceship.
`?probe=marketing-setup&authenticate=1` found them and DMARC valid, and registered the sender
`hei@nyheter.orgpuls.com`. Brevo reports `nyheter.orgpuls.com` as authenticated and verified
(X-065).

## D-102 — "Fortsett med Google"

**The request:** "add google signin options".

**What changed:**
- **Sign-in (/logg-inn):** the design has a slot for alternative providers: an "eller" rule
  and 46 px buttons on the page colour (Orgpuls_Start.dc.html lines 467-477). D-38 left them
  out because no provider was configured.
  - "Fortsett med Google" now fills that slot, drawn exactly as the design draws those
    buttons, with Google's "G" as Google's branding rules require.
  - It renders only when Google is enabled in Supabase Auth (read from the project's public
    `/auth/v1/settings`, cached five minutes), so a dead sign-in button never shows.
- **Registration, step 2:** the same button under "Opprett konto", enabled once the terms
  box is ticked.
  - The company from step 1, the size band and the signup's attribution travel through
    Google in a 30-minute http-only cookie.
  - The callback creates the organisation with `create_organisation`, as a password signup
  does, then opens step 3. Name and e-mail come from the Google account.
  - The design has no provider on this step; this is an addition in the sign-in slot's
    style.
- **Invitations (/bli-med):** Google is offered beside the password. The callback returns
  to the invitation signed in, where the invited address is checked as before.
- **/auth/callback** exchanges the code (PKCE; Supabase keeps the verifier in a cookie):
  - **Login:** a Google account with no organisation is signed out again and told to
    register or use its invitation. Signing in never quietly creates a customer.
  - **Signup:** an account that already has an organisation just goes in.
  - **Platform admins:** refused whatever the flow. Admin identities stay separate and
    sign in with a password and TOTP only (D-90).
  - Every redirect is a fixed path.
- **Auth redirect allow-list:** en.orgpuls.com added.

**Waiting on the owner:** a Google OAuth client, which this project cannot create.
- In Google Cloud Console, create a Web OAuth client with:
  - authorised redirect URI `https://jmhhszsnjfqgclxzhciq.supabase.co/auth/v1/callback`;
  - consent screen app name Orgpuls, domain orgpuls.com, scopes openid, email, profile.
- Enter its client ID and secret in Supabase › Authentication › Sign In / Providers ›
  Google, and switch it on.
- The buttons appear within five minutes.

**Verified:**
- With the provider forced on in a local build:
  - the sign-in and signup buttons render in the design's style;
  - signup's button is disabled until consent is ticked;
  - the error messages show;
  - pressing the button starts the redirect to Supabase's authorize endpoint.
- With the provider off, as on production now, neither page changes.

## D-103 — The CRM in full: prospects, lists, templates, A/B tests and reporting

**The request:** "add full CRM details; so we can have prospect list; email distribution and
campaigns with success measurements. Implement best practice — different email lists and
segments and 5–6 templates with all SEO, analytics and optimized for click."
Migrations 0056–0058, X-062.

**What was built:**
- **Prospects (admin › CRM › Prospects):**
  - Every company we sell to or serve, by stage: new → contacted → engaged → meeting →
    trial → customer, or lost / not relevant.
  - Each has an owner, a next step with a date, and a log of calls, mails, meetings,
    notes, tasks and stage changes.
  - A first call, mail or meeting moves a new prospect to "contacted".
  - Customer organisations are synced in. A prospect that signs up is linked by org.nr and
    its stage then follows its plan.
  - **Finding companies:** a Brønnøysund picker searches Enhetsregisteret by industry code,
    municipality, size and organisation form, marks those already in the CRM, and adds the
    chosen ones with their register data.
  - The overview lists the tasks that are due.
- **The business-address basis.**
  - Markedsføringsloven § 15 covers e-mail to natural persons. A company's role address
    from the register (post@, firmapost@, kontakt@ …) is not a person, and may receive a
    relevant B2B offer without consent, with an opt-out in every mail.
  - Only such role addresses get basis 'business'.
  - An address that looks like a person's, or any enkeltpersonforetak's, is kept with no
    basis and is not mailed until the person consents.
  - The mail's footer says why the address gets it: the company is listed with it in
    Enhetsregisteret.
- **Lists (admin › CRM › Lists):** subscriptions by purpose, each with its own consent.
  - Seeded: Nyhetsbrevet, Produktnyheter, Webinarer og kurs, Tilbud.
  - The signup page lets a visitor choose lists; double opt-in confirms them all.
  - An admin can add a consented contact to a list, naming the consent's source, or take
    one off with a reason.
  - Growth over 30 days and each list's open and click rates are shown.
- **Unsubscribing, best practice:**
  - The one-click header (RFC 8058) leaves the mail's own list.
  - The footer link opens a **preference centre** (/avmeld) with every list to tick, or
    "unsubscribe from everything", which suppresses the address.
  - The preference centre shows no address and changes nothing until a button is pressed.
- **Segments** gain company stage, list membership and basis.
- **Six templates (admin › CRM › Templates), stored as data** and previewed as they render:
  - monthly newsletter;
  - product news;
  - webinar invitation;
  - offer;
  - trial onboarding;
  - first contact with a company, in a plain letter style: no logo, links as text, a
    signature.
- **Built to be clicked:**
  - one column, at most 600 px wide;
  - one primary button above the fold, drawn as a table so Outlook shows it, with a 44 px
    tap target;
  - a hidden preheader;
  - alt text required on images;
  - `color-scheme: light`;
  - personalisation with `{firma}` and `{navn}`;
  - the editor meters the subject (under 50 characters) and the preheader (40–90).
- **Blocks:** heading, text, button, article, bullet list, image, event, quote, divider, P.S.
- **A/B subject tests:**
  - A test group of 10–50 % gets subject A or B.
  - After 1–48 hours, the variant with more opens (or clicks) goes to the rest.
- **Analytics and measurement:**
  - Every link to orgpuls.com gets `utm_source=orgpuls`, `utm_medium=email`,
    `utm_campaign` and `utm_content` naming its block (`b3-button`).
  - The campaign report shows audience, sent, delivered, open, click, click-to-open,
    unsubscribe and bounce rates, each against the last ten campaigns.
  - It also shows: the A/B result; a **click map** by link and block; opens and clicks per
    hour for 72 hours (with a table view); and visits, organisations created and paid from
    the site's own analytics.
  - The CRM overview adds 90-day mail rates, subscriber growth, the pipeline, deals won,
    trials started and signups from e-mail.
- **SEO: a web archive.** A newsletter or announcement can be published at
  `/nyhetsbrev/arkiv/<slug>` once it has gone out:
  - the same content, with no personal data;
  - its own title and description, a canonical URL and Open Graph `article`;
  - Article and BreadcrumbList structured data;
  - an entry in the sitemap;
  - links tagged `utm_medium=archive`, so archive visits are not counted as mail.

  The mail links to it with "Se i nettleser". The archive index, and the signup page
  itself, are indexable; confirmation and preference links are not.

**Deviations and limits:**
- **Clicks are stored as path and utm_content only**, never with a query string, so no token
  reaches the table. A click on a link to another site is recorded by its path as well.
- **Open rates are a lower bound:** pixels are often blocked, and Apple's proxy opens are not
  counted. The A/B test can therefore choose by clicks.
- **List campaigns go to every subscriber, whatever their language setting.** A segment-only
  campaign still goes to contacts in its language only.
- **Templates are in Norwegian.** An English campaign starts from them and is translated in
  the editor.
- **Not built:**
  - automated sequences (lifecycle mail);
  - send-time optimisation;
  - coupon codes, until Billing has them.
- **No design exists** for the preference centre, the archive or the list choice at signup.
  They use the sign-in card and the contact form's styles, and the archive uses the article
  pages' type.

**Verified:**
- SQL tests on hosted, and all 35 suites locally:
  - `crm_pipeline_invariants.sql`: 18 checks;
  - `crm_invariants.sql`: 17 checks, updated for the new signatures.
- Unit tests of the renderer: blocks, escaping, `utm_content`, `{firma}`/`{navn}`, letter
  style, footers, the web-version link, and the confirmation's lists.
- In the browser against hosted:
  - a signup to two lists, confirmed with its real token;
  - 40 companies found in Brønnøysund (86.221, Oslo, 5–30 employees) and two added;
  - a logged call moved one to "contacted"; a task and a consented person were added;
  - six template previews;
  - a campaign started from the newsletter template, sent to its list, with an A/B subject
    and publishing to the web;
  - its report after a delivery, an open and a tracked click (rates, click map `b4-article`,
    the 72-hour chart);
  - the archive page with canonical, `og:type` article and JSON-LD;
  - the preference centre saved a list choice, and one-click left only that mail's list.
- Every test row, both imported companies and the probe admin were deleted afterwards.

## D-104 — Attribution read on the server, AI as a channel, "how did you hear of us", a privacy statement

The first step of the admin, marketing and SEO review (X-063).

- **Nothing is stored on the visitor's device for analytics.**
  - Before: the site kept the visit's first page and campaign tags in sessionStorage
    (`op_first`, `op_utm`), and the signup form sent them.
  - Why it changed: ekomlov § 3-15, in force since 1 January 2025, asks consent for
    storing anything on the device, not only cookies. Analytics is not one of its
    exemptions.
  - Now: each page's beacon carries the tags of its own address.
    `record_signup_source(p_ip, p_ua)` recomputes today's visitor hash from the signup
    request and reads first touch (the day's first event) and last touch (the latest tags
    in the latest session) from `app.web_events` (0059).
  - The cost: a visit that began yesterday, changed network, or asked not to be tracked is
    recorded as direct. That is what it is to a server that remembers nothing.
  - The Google signup cookie and the app's preference cookies stay. Each serves a function
    the user asked for.
- **AI assistants are a channel**: chatgpt.com, perplexity.ai, Copilot, Gemini, Claude,
  or `utm_source=chatgpt.com`. They are checked before organic search, since
  gemini.google.com would otherwise read as Google.
- **`utm_term` and `utm_content` are stored.** The beacon always sent them, and they were
  dropped.
- **"Hvordan hørte du om oss?"**
  - It is asked under the finished signup (step 3). It is optional, in the style of the
    size question on step 2.
  - The answer is one of eight fixed values, never free text.
  - The admin shows it on Web analytics (with signups, activated and paid) and on the
    organisation.
  - The design has no such question. It is the only way to count a colleague's tip or a
    mention in ChatGPT.
- **A/B tests default to clicks.** Apple Mail Privacy Protection loads every image. Old
  campaigns keep their setting.
- **Newsletter issues are Norwegian only in their metadata too.** An issue page is
  canonical on www and names no English twin. The newsletter's signup and archive index
  are translated, and the sitemap now says so.
- **The privacy statement exists: `/personvernerklaering`.**
  - The footer link (D-88) and the design's "Personvern" in the bottom line now lead to it.
    The bottom line's link is drawn as its surrounding text: 5 pixels of 42,560 changed
    against the previous build.
  - It is written from what the code does:
    - the beacon's fields and 13-month retention;
    - signup and Google sign-in;
    - newsletter consent, events and the hashed suppression;
    - B2B role addresses;
    - cookies;
    - the four suppliers;
    - rights and Datatilsynet.
  - The page uses PageTemplate with `plain`: no signup field in a legal page's hero.
  - It names no organisation number or address, because none is recorded (D-85). **It
    should be read by whoever answers for Orgpuls AS legally before it is relied on.**
- **Terms (`Vilkår`) is still not a page.** Terms need the decisions still open with
  billing (card or invoice, payment terms, annual prices) and a liability position. None of
  those is the implementer's to invent.
- The old `record_signup_source(jsonb, jsonb)` stays until the app that calls it is gone
  from production. 0060 drops it.

Verified: `web_invariants.sql` 19/19, locally and against hosted. In the browser:
- no sessionStorage, localStorage or cookie after a tagged visit and a second page;
- the beacon stored `utm_term`/`utm_content` (the test rows were deleted);
- step 3's question with keyboard focus;
- the privacy page at 1440 and 390 with no sideways scroll;
- the admin's new card;
- no console errors.

## D-105 — The trial's mail, and account health with its reasons

Step 2 of X-063.

- **Seven service mails to the daglig leder** (0060), each sent once, and only while it is
  true:

  | Mail | When |
  |---|---|
  | welcome | at signup |
  | setup help | 48 h with no employees |
  | first survey sent | how to reach k answers |
  | first results | — |
  | trial ends in 3 days | — |
  | trial ended | grace begins |
  | read-only in 3 days | — |

  - `app.lifecycle_plan()` queues them every 15 minutes.
  - `lifecycle_mail_claim` checks each row again and marks it `skipped` if it is no longer
    true. A customer who confirms a plan never gets "your trial ends".
  - They go on the product's sender, with support as Reply-To. Each one's footer says why
    it was sent and that a reply reaches us.
  - They are service mail about the trial the customer started, not marketing: no list, no
    consent, no tracking of opens or clicks (D-97 holds).
  - Organisations created before 26 September 2026 get none: they did not sign up to a
    sequence, and some were imported.
- **No design exists for these mails.** They use the product's existing mail layout (the
  notices' card, button and footer). There is one button each, pointing at the page where
  the step is done.
- **Account health** (`/admin/health`, `admin_account_health`) scores 0–100:

  | Signal | Points |
  |---|---|
  | activation: employees, planned, sent, results, a measure | 10 each |
  | sign-in in the last 7 days / 30 days | 25 / 10 |
  | last round's response rate ≥ 60 % / ≥ 40 % | 15 / 8 |
  | size ≥ 20 / ≥ 10 employees | 10 / 5 |

  - The reasons are printed beside the number.
  - A **qualified trial** is one in trial or grace that has reached results, or has sent a
    survey with ten or more employees.
  - The page reads counts the admin already had (D-90), never an answer.
  - The weights are a first guess. They are one SQL expression, to be tuned once there
    are conversions to fit them to.
- The organisation page shows its trial mail: queued, sent, skipped.
- Not built:
  - a per-user opt-out from the tips (replying "stop" is handled by support);
  - a CRM segment of qualified trials. CRM contacts are companies and people from
    marketing, not product accounts, and joining them is its own decision.

Verified:
- `lifecycle_invariants.sql` 12/12, locally and on hosted;
- 16 renderer tests (every step, both languages, escaped);
- the dispatcher deployed and ran;
- in the browser: the health page (views, reasons, qualified badge), the organisation's
  trial-mail card, and three rendered mails; no console errors.

## D-106 — Search and content in the admin, IndexNow, a card per article

Step 3 of X-063.

- **Admin › Search and content** (`/admin/seo`, `admin_seo`). Roles: super-admin, marketing
  and analyst.
  - **Content performance.** Entries by landing page for the last 28 or 90 days, the change
    against the period before, entries from search, and the signups, activated and paid
    organisations whose first page it was.
  - **Losing traffic.** Pages that brought at least 10 entries or 10 search clicks before,
    and have 30 % fewer now.
  - **From AI assistants.** Sessions by source, and signups.
  - **Top queries, and queries two of our pages compete for.** Filled once Search Console
    is connected.
  - Everything the page shows is counted. Without Search Console the columns show "—" and
    the cards say what connecting it adds; nothing is estimated.
- **Google Search Console, built and waiting for a key.**
  - `orgpuls-seo` (edge, daily at 03:23 UTC, the dispatcher's secret) signs a read-only
    service-account token. It pulls rows by date, page, query, country and device into
    `app.seo_search` (0061), which keeps them past Google's 16 months.
  - Without `GSC_SERVICE_ACCOUNT` and `GSC_SITE` it records `not_configured`, and the page
    lists the four steps to connect it.
  - A query is Google's aggregate, already thresholded by Google. Log lines carry counts,
    never a query.
- **IndexNow.**
  - The key is public by design and served at `/e02fe48ed85b382dcc8f874a523afff5.txt`,
    listed among the middleware's public paths. A test keeps the key, the file and the
    middleware in step.
  - The daily run announces sitemap URLs whose `lastmod` falls in the last two days, one
    request per host (www and en). `?indexnow=all` announces everything once.
  - Google does not take IndexNow. Bing, Yandex, Seznam and Naver do.
- **Not built:**
  - **Bing Webmaster's API, including its AI Performance report.** It needs an API key from
    a verified Bing Webmaster account, which is the owner's to create. IndexNow covers
    Bing's discovery in the meantime.
  - **Core Web Vitals from real visitors.** A web-vitals beacon would be one more thing
    read from the device, and D-104's legal read should come first. Vercel Speed Insights
    already measures them, in Vercel's dashboard.
  - **llms.txt.** Google's own guidance (May 2026) lists it as unnecessary.
  - **Author names on articles.** An article's author is Orgpuls AS. A named person would
    have to be a real one who wrote it.
- **Each article has its own card:** 1200 × 630, its H1 with its landing page's picture,
  made by `scripts/marketing/og-images.mjs` into `public/og/artikler/`. It is used for
  `og:image` and the Article JSON-LD `image`. The landing pages' cards are regenerated
  byte-identical.
- **The admin's two-column grids get an explicit single column below `lg`.** A table's
  min-content width had pushed `/admin/web` and eight other pages sideways at 390 px. That
  was a bug from before; this fixes all of them.

Verified:
- `seo_invariants.sql` 10/10, locally and on hosted, and all 35 suites plus
  design_figures;
- 4 unit tests: the JWT verifies against its public key, row mapping, sitemap and
  IndexNow bodies, and the key file;
- the function deployed;
- in the browser: `/admin/seo` in its unconnected state; no sideways scroll at 390 px on
  seo, web, health, crm, an organisation and the dashboard; the key file served with 200;
- an article's `og:image`.

## D-107 — The dashboard over time, and cost per customer

Step 4 of X-063.

- **Trends on the dashboard.**
  - **Weekly signups and new customers, and weekly site visitors** (26 weeks) are computed
    from tables that keep their history: `organizations.created_at`,
    `billing.confirmed_at` and `web_events`.
  - Each chart has a legend and a bar-by-bar hover label. The signups chart can be opened
    as a table. Its two colours are the validated token pair #E0A21F / #5C9A55, whose
    contrast warning is met by the legend and the table.
- **Daily snapshots** (`app.kpi_daily`, 0062) keep the dashboard's own figures every evening:
  MRR, paying, trials, grace, read-only, signups, visitors and sessions.
  - **They are not backfilled.** The billing table keeps only the current plan, so a past
    day's MRR cannot be read back, and a reconstructed history would look exactly like a
    real one.
  - The card says when snapshots began, and shows the change once there is a week of them.
- **Cost per customer** (`/admin/acquisition`, 0062/0063).
  - Spend is entered per month and channel (optionally per campaign) by super-admin,
    finance or marketing, and audited.
  - It is set against the signups and paying customers whose first-touch channel it was, in
    the month they signed up. The page shows cost per signup and per customer by channel,
    for the period and by month.
  - A channel with no spend shows "—", not zero.
  - An organisation with no recorded source is "Not recorded", as on the web page. 0062
    counted it as direct; 0063 corrects that.
- **Not built:**
  - **Real MRR movements, churn, NRR and cohort revenue retention.** There is no
    subscription ledger yet: no cancellation, no plan change and no invoice. They follow
    the billing decisions (D-93/D-94: Stripe or invoice, card or not, annual prices,
    payment terms).
  - **"View as customer" for support.** It would give staff a customer's view of that
    customer's data. It would still go through the k-anonymity functions, so no invariant
    weakens, but the DPA (Vedlegg 2) promises Orgpuls' people access to production data
    only when operations or troubleshooting require it. Who may use it, with what approval,
    and how the customer is told is the owner's decision, not the implementer's.

Verified:
- `trends_invariants.sql` 8/8, locally and on hosted; all 36 suites;
- the hosted database's first snapshot;
- in the browser:
  - the dashboard's trend cards and the snapshot note;
  - a spend entry added through the form, shown in totals and entries, then deleted;
  - no sideways scroll at 390 px;
  - no console errors.

## D-108 — Cancellation, and deletion 30 days after the agreement ends

Two places promised deletion within 30 days of the agreement ending: the home page ("Sier
dere opp, sletter vi svarene etter 30 dager") and the data processing agreement (§ 11).
Nothing carried it out. Now it happens (0064, 0065):

- **Registering.** Admin › Organisation › Cancellation and deletion. Super-admin, support
  or finance registers a cancellation the customer has sent, with the agreement's last day
  (default: the end of this month) and a reason. Both are audited.
  - The agreement ends at midnight after the last day, in Oslo.
  - From then the organisation reads as `read_only` (0052's rule): members sign in, read
    everything and download the report, and start nothing.
  - Deletion is due 30 Oslo days later (0065: counted in Oslo's calendar, so a
    daylight-saving change cannot move it a day).
  - A cancellation can be withdrawn until it is carried out.
- **Telling the customer.**
  - A banner over the app from the day of registration: the last day, the deletion day,
    and "Last ned rapporten".
  - Two service mails to the daglig leder on the trial-mail stream: when it is registered,
    and seven days before deletion.
  - The trial's own mails stop once a cancellation is registered.
- **Deleting.** `app.deletion_run()` runs daily at 02:40 UTC. For each organisation that
  is due, `app.delete_organisation()`:
  - deletes the CRM contacts known only through the customer relationship. A contact who
    subscribed with their own consent stays, and the company stays, marked `lost`;
  - deletes its support tickets (the privacy statement keeps them only while the customer
    relationship lasts);
  - deletes its rounds, then the organisation. Rounds must go first: `responses.group_id`
    deliberately has no cascade (0042), and inside one cascade PostgreSQL checks it before
    the answers are gone. Deleting rounds removes responses, answers and comments, which
    their append-only triggers allow because the response row is gone first;
  - deletes the sign-in accounts that belonged to that organisation only, never a platform
    admin's, with their identities and second factors;
  - writes `app.deletion_log`: organisation number, name, dates, who ran it, and counts.
    It holds no person's data. It is the record that the promise was kept, and Admin ›
    Operations lists it beside the pending cancellations.
- **Deleting now**, for an erasure request: a super-admin, a cancelled organisation, and its
  organisation number typed to confirm.
- **A trigger that blocked maintenance, fixed.** `measure_effect_round_ok` (0023)
  re-validated a measure's effect round on every update, so PostgreSQL's own
  `ON DELETE SET NULL` from a deleted round was refused. Deleting any round with measures
  would have failed. It now checks only when the effect round itself is set or changed,
  the rule CLAUDE.md states for these triggers.
- **Not built: a cancel button for the customer.** The terms draft leaves open whether
  cancellation is by e-mail or in the app (`docs/legal/vilkar-utkast.md` § 10). Until that
  is decided, support registers what the customer sends.

Verified:
- `cancellation_invariants.sql` 12/12. It runs a real deletion of the fully seeded fixture
  (175 responses with answers and comments, 34 employees, 12 rounds). Afterwards no row in
  any `app` table with an `org_id` keeps its id, the other organisation's answers are
  untouched, and everything rolls back;
- all 37 suites and 152 unit tests, including the cancellation mails in both languages and
  their Oslo dates;
- applied to hosted;
- in the browser against hosted:
  - a cancellation registered on Nordvik (mail is off for it, so nothing was sent);
  - the admin card and the Operations list;
  - the customer's banner at 1440 and 390 px;
  - the cancellation withdrawn again, and hosted left with none.

## D-109 — Pressing NO on the public site can no longer leave it in English

Reported: pressing Norwegian on the public site kept the page in English.

- **Cause.** A language choice is a cookie (D-96), and a cookie belongs to one host. On the
  production hosts the public site's switch is a plain link across them (D-98): NO leads to
  the same page on www.orgpuls.com.
  - www honours the cookie, since the app there follows a user's choice. If English had
    been chosen on www before (in the app's account menu, or restored from a profile at
    sign-in), the link landed on www with that choice still saved, and the page stayed
    English.
  - The app's switch on en.orgpuls.com had the same flaw: it saved Norwegian in en's cookie,
    then went to www.
- **Fix.** `/api/sprak?l=no&til=/path` saves the choice on the host it runs on (and on a
  signed-in user's profile, as the in-app switch does), then redirects with 303 to the page.
  - Both switches send NO through www's own route.
  - The link's `href` stays the page itself, for crawlers and for opening in a new tab.
  - The return path must be a path on this site (`lib/i18n/switch.ts`, unit-tested). Any
    other host, `//host` or backslash form falls back to the start page, so the route is no
    open redirect.

## D-110 — The daglig leder can cancel in Oppsett › Betaling, and take it back

- **Where.** A new last section, "Si opp abonnementet", on Oppsett › Betaling. The tab is
  the daglig leder's alone (RLS, D-89). It is built from the tab's own cards, chips and
  buttons; the design has no billing.
- **When it ends** (`cancel_subscription`, 0066):
  - A confirmed subscription runs to the end of the current month, the monthly agreement
    the site promises.
  - A trial, a grace period or a read-only organisation has nothing to pay for, so it ends
    today.
  - The same Oslo-calendar rule as 0065 then applies: read-only from the midnight after the
    last day, and everything is deleted at the midnight 31 days after it. The section names
    both dates before anything is pressed.
- **A deliberate act.**
  - "Si opp …" opens the step. It has five optional reasons (fixed answers, never free
    text), a link to download the report first, and a box that says what is deleted and
    when.
  - The red button is disabled until the box is ticked, and the database refuses a call
    without the confirmation.
- **After.** The section turns into "Abonnementet er sagt opp", with the dates and "Angre
  oppsigelsen". The app's banner (D-108) and the service mail follow, as for a cancellation
  support registers.
- **Undo** (`withdraw_cancellation`): the daglig leder can take back any cancellation, theirs
  or one support registered, until the deletion is carried out.
- **What support sees.** The organisation's card says who cancelled (the customer in
  Oppsett › Betaling, or support) and the reason given. A trigger clears who and why
  whenever a cancellation is withdrawn, by either path.

Verified:
- `customer_cancel_invariants.sql` 8/8; all 38 suites and 155 unit tests;
- applied to hosted;
- in the browser against hosted, as Nordvik's daglig leder (mail is off for it):
  - the section's dates;
  - the button disabled until ticked, and the box ticked by keyboard;
  - cancelled: the section and the banner agree on the dates (26 September, deleted
    27 October);
  - no sideways scroll at 390 px;
  - taken back, and hosted left with no cancellation.

## D-111 — Industry modules: a registry beside the core instrument, not inside it

The hand-off `docs/implementation/bransjesider-og-tilleggsmoduler.md` asks for industry
question modules, starting with Bygg og anlegg 1.0.0. The file `modules/bygg-og-anlegg/v1.json`
is the only source of their wording. The Step 0 findings are in
`docs/implementation/step0-findings.md`. This entry is PR 1 of the hand-off's plan: the
schema, validation, registry, seed and publish. Nothing a customer sees changes yet.

- **Not rows of `app.factors`.**
  - The hand-off says to extend an existing registry. Here that would put module factors into
    about twenty readers that assume every factor is one of the eleven: the organisation
    index, the heatmap, grunnlinje round creation, Måleoppsett, the Veiviser and the report.
  - The published index would then change the first time a customer answered a module, and
    stop being comparable with last year's and with the benchmark.
  - So module answers hang off the same anonymous `app.responses` row in tables of their own
    (`app.module_answers`, `app.module_segment_answers`), with the same "no policy, no grant"
    rule as `app.answers`. None of the core readers change.
- **Count-only answers have no link at all.** `app.org_count_answers` holds a round, an item,
  the answer and a date. It has no response, no group and no segment, so a per-group report is
  impossible by construction, not by a rule someone must remember. A SQL test asserts the
  column list.
- **Published is immutable.**
  - Triggers compare content, not operations: no insert, update or delete under a published or
    retired module, and no deleting a published module.
  - Status only moves draft → published → retired.
  - A delete whose parent is already gone (the cascade from a draft) is allowed, as CLAUDE.md
    requires of immutability triggers.
- **Reading and writing.**
  - A published or retired version is readable by anyone, like the core instrument; a draft
    only by a platform admin.
  - No client writes the registry. `app.module_seed` and `app.module_set_status` are
    owner-only.
  - `public.admin_module_set_status` is super-admin only, needs a reason, and writes
    `module.publish` or `module.retire` to the audit log.
  - `write_invariants` #17 lists the registry tables beside the instrument as the only public
    reference data.
- **A round's module selection** (`app.round_modules`, the spec's `survey_modules`) names the
  exact statements asked, as `round_factors` does. It can only name a published module's
  statements and is fixed once the round opens. Its policies are `round_factors`'s, one per
  command.
- **Seeding.** `npm run -s modules:seed | psql` calls `app.module_seed(file, sha256)`:
  - a new version becomes a draft;
  - the same content is a no-op;
  - a changed draft is replaced;
  - a published version with different content is refused.

  CI validates the files, seeds them after the migrations, and runs `module_invariants.sql`.
  Nothing is published until Tor signs off the open decisions (DECISION_LOG).
- **Adapted to this repository:**
  - npm rather than pnpm;
  - `lib/` rather than `src/lib`;
  - the `app` schema;
  - `app.is_platform_admin(array[…])`;
  - the seed prints SQL for psql, the way the design fixture is applied.

Verified:
- `modules:validate` passes; 12 new unit tests cover the schema's refusals, canonical hashing,
  scoring and bands;
- `module_invariants.sql` 13/13;
- all 39 suites and the design figures pass on a database rebuilt from migrations, with the
  module seeded.

## D-112 — Industry modules, PR 2: choosing a module in Måleoppsett, and pilots

- **Where.** A "Bransjemodul" block in Måleoppsett's section 2, under the factor chips. It
  shows for a grunnlinje only, built from the section's own controls (the checkbox row, the
  chips); the design has no module.
- **What it offers.**
  - The newest published version of each module, with "24 påstander, ca. 3 minutter
    ekstra", a link to the public question page, and "ta med de to ja/nei-spørsmålene"
    (on by default).
  - A round that already asks a version shows that version.
  - When the organisation's Brønnøysund code starts with one of an industry's prefixes
    (`content/industries/meta.ts`: 41/42/43 construction, 86/87/88 health), the suggestion
    reads "Virksomheten er registrert i bygg og anlegg. Vil dere ta med bygg-modulen?". It
    disappears once the module is on.
  - The summary card gains a row, "Bransjemodul · Bygg og anlegg · 26 spørsmål til", so the
    card never undercounts what respondents get.
- **Writing** (`saveRoundModule`): the statements asked are derived from the registry, never
  from the form. A round that has opened answers `locked`.
- **Flags** (`lib/flags.ts`, all off; `ORGPULS_FLAGS` switches one on for a deployment):
  - `module_factor_toggles`: one chip per factor, at least one on;
  - `module_segments`;
  - `signup_industry_hint`.
- **Pilots (0068), not in the hand-off.**
  - The hand-off's definition of done needs a real test survey with the module before it is
    published, and a published version can never be withdrawn.
  - So a super-admin can name organisations that may use a draft, with a reason, audited
    (`admin_module_pilot`). Their leaders see and choose it like a published version;
    nobody else sees it.
  - A draft some round has asked cannot be re-seeded, so a pilot's answers always name the
    wording they were asked.
- **Not done:** the year wheel does not carry a module from one grunnlinje to the next. Each
  grunnlinje is chosen in Måleoppsett, like its factors.
- **Found while verifying.** `round_module_ok` ran as the calling leader and read
  `app.responses` and `app.module_pilots`, which clients may not read, so saving would have
  failed with "permission denied". Both checks are now small definer functions
  (`app.round_answered`, `app.module_usable`, 0071). `module_measure_invariants` exercises the
  client path.

## D-113 — Industry modules, PR 3: the respondent answers the module

- **Order:**
  1. the core statements, shuffled per token;
  2. the module's statements, shuffled per token within the module;
  3. the questions outside the index;
  4. the module's count questions;
  5. background questions last, and only when the round asks them (flag off).
- **Count questions** carry the pill "Telles for hele virksomheten" and the lead "To korte
  spørsmål som bare telles for hele virksomheten". Background questions carry "Frivillig:
  brukes bare til å sammenligne grupper med minst {k} svar".
- **The write path** (0069) stays one function. `submit_response` gains `p_module` with a
  default, so every existing call is unchanged. In the same transaction:
  - statements and background answers go onto the unlinked response row;
  - count answers go to `org_count_answers` with no reference to the response, the group or a
    segment, and only the Oslo date.

  Anything the round does not ask, or a value out of range, is refused before a row is
  written.
- **Time.** The last screen says "Takk. Det tok rundt {4 + minutter} minutter." when a module
  was asked. The 4 is the design's own closing line ("Det tok fire minutter"); the extra
  minutes are the module file's estimate. The invitation already says "noen få minutter" and
  is unchanged.
- **Not done:**
  - comments on module statements (`response_comments` is keyed to core statements);
  - respondent languages other than bokmål (open decision 4).
- **The leader preview** (/forhandsvis) shows the module exactly as it will be asked,
  unshuffled, as it shows the core.

## D-114 — Industry modules, PR 4: results, and counts for the whole organisation

- **The same rule, proven.**
  - `app.release_cells` is `cell_release`'s decision for one statement: k per group and
    complementary suppression. `module_results_invariants` proves it decides every core cell
    of every closed round exactly as `cell_release` does.
  - When a module factor is answered by the same people with the same values as ytring, it is
    released for exactly the same groups, with the same index per group and for the house.
- **Results** (`module_results`): closed rounds only, members only.
  - The house (daglig leder, verneombud) sees a factor where every asked statement has k
    answers.
  - Groups see only their released factor cells; a department leader sees only their visible
    groups.
- **Counts** (`get_count_item_totals(round)`):
  - one argument, and no group or segment exists to pass;
  - closed rounds, the house's readers only;
  - below k it returns no numbers at all, not even how many answered.
- **Where.** A panel under Resultater's workspace, from the page's own parts: the card, the
  Varmekart's `heatTone` palette, and "–" for a withheld cell. It is not inside the core
  factor list, because the index is the eleven QPS factors (D-111).
  - Each factor opens to show its summary, rationale with sources, legal basis and
    statements.
  - The "Telles for hele virksomheten" card shows a stacked bar and the counts, or "Vises når
    minst {k} har svart".
- **Not done:**
  - module factors in the positive-first summary and on the Oversikt screens;
  - segment filter chips (flag off; the rule is `app.segment_cell_ok` and
    `lib/modules/segments.ts`, with a unit test).
- **Verified visually** through a throwaway route with sample figures, deleted before the
  commit: no closed round has module answers yet, and none may be invented in the fixture.

## D-115 — Industry modules, PR 5: measures from module factors, and the puls

- **A measure on a module factor** is a row in `app.measures` like any other (0071). It names
  the module factor and its re-measure statement instead of a core factor:
  - exactly one of the two;
  - the statement must be the factor's own.

  Every existing reader of measures reads core measures only, so the Tavle, Plan, Liste and
  the report's sections 5–6 are unchanged.
- **Making one.** Each module factor in Resultater lists its three suggestions (workshop,
  rutine, lederpraksis), each with "Måles på nytt med: «…»" and "Lag tiltak".
- **Following it.** Tiltak shows "Tiltak fra bransjemodulen" under the board, with step, owner
  and deadline, saved on change, under the same rules. A close that skips the effect
  measurement is refused (0015).
- **The puls.** A new puls, planned by the wheel or started now, asks the re-measure statement
  of every open module measure (trigger `round_pulse_modules`). A module factor with no open
  measure drops out. Core factors follow their measures as before, and a puls with module
  statements only is allowed.

## D-116 — Industry modules: the report

In the AMU and Arbeidstilsynet documents, after section 8, each module the year's grunnlinje
asked has a section:
- factor, index, risk band, legal basis and open measures;
- the count questions for the whole undertaking, or "Vises ikke: færre enn {k} har svart".

The footer adds "Bygg og anlegg v1.0.0". Values come from the same definer functions as
Resultater, so the report prints nothing the release rule withheld.

## D-117 — Industry modules: the admin's Moduler page

`/admin/modules` (super-admin, analyst) shows:
- every version with status, publication date, content hash, size, the rounds that asked it,
  and its pilots;
- adoption: of last year's grunnlinjer, how many asked a module, by industry code.

A super-admin can publish or retire a version, and add or remove a pilot, each with a reason
and each audited. Publishing warns that it cannot be undone.

Verified for D-112 to D-117:
- all 42 SQL suites and the design figures on a database rebuilt from migrations, with the
  four new module suites: 15, 8, 8 and 6 checks;
- applied to hosted, where the module suites pass, all rolled back;
- 168 unit tests;
- in the browser against hosted, as Nordvik's daglig leder with Nordvik piloting the draft:
  - the suggestion, the keyboard toggle, "Lagret" and the summary row;
  - no sideways scroll at 390 px;
  - the preview walks 59 questions: 33 core, then 24 module, then 2 counted;
  - no console errors.

  Afterwards the selection and the pilot were removed and the module is a draft again.

## D-118 — Industry pages: /bygg-og-anlegg and its question page, from data

The hand-off's Part B (§ B1–B5). The pages are built from `content/industries/*` and from the
module file. There is no pixel baseline, because the design bundle has no industry page; they
use the site's own tokens, header, footer and start form, with the reference HTML as the
spec.

- **Routes.**
  - `app/(marketing)/[bransje]` and `[bransje]/sporsmal`, with `generateStaticParams` from the
    registry and `dynamicParams = false`. The two static folders are gone, and every URL is the
    same.
  - The pages render per request, like every public page: the locale comes from the host,
    D-98. So they are not SSG, which the hand-off asks for.
  - An unknown slug gets the site's redirect to the login, as any unknown path does, not a 404.
- **What a visitor sees.** These rules keep § 0.7 ("copy may only claim shipped features"):
  - The new bygg page is live only when its content file says `launched: true`. Launching needs
    every law item reviewed (the build fails otherwise), and is meant to coincide with
    publishing the module after sign-off.
  - Until then `/bygg-og-anlegg` shows the landing page it always had. The new page and
    `/sporsmal` can be reviewed with `?forhandsvis=1`: a banner, `noindex, nofollow`, and
    internal links that keep the flag.
  - Måleoppsett's "Se spørsmålene" link carries the flag too until launch.
  - en.orgpuls.com keeps its English landing pages, unchanged, as the hand-off asks. The
    question page has no English twin, and its metadata says so: canonical on www, no
    hreflang.
- **/helse-og-omsorg** keeps its current copy and look, through the same route; its registry
  entry has no page.
  - Moving its copy into the industry template needs each of its points tied to a core
    statement, which is copy work for Tor.
  - A module of its own is open decision 7.
- **Data, not code.**
  - Every statement on both pages comes from the module file by its code, or from the core
    instrument's messages. `content/industries/validate.ts` fails the build (from
    `generateStaticParams`) and the unit tests on a missing code, a missing core statement, a
    `{{cite:key}}` with no source, an example naming a factor or suggestion the module lacks,
    or a launch with unreviewed law items.
  - Citations are numbered in reading order. The source list is the page's citations, then
    the other sources the module's factors cite.
  - The chrome (labels, legend, helpline) is next-intl, in no and en.
- **Changed from the reference, until flags ship:**
  - "Dere kan også velge bare de faktorene som gjelder dere" is its own FAQ item behind
    `module_factor_toggles`.
  - The example board's "Verksted" has a samordning score instead of "not asked there", and
    its footnote drops that sentence.
  - On the question page, the background questions and the "Segmenter" and "Velg det som
    gjelder" rules are behind `module_segments` and `module_factor_toggles`.
- **Start form.** `SignupStart` now checks the organisation number's mod-11 check digit and says
  "Sjekk nummeret – det ser ikke ut som et gyldig organisasjonsnummer." The function moved to
  `lib/brreg/orgnr.ts`, which is client-safe; the register lookup uses the same one. It applies
  on every page with the form.
- **SEO.**
  - Canonical www URLs.
  - JSON-LD: BreadcrumbList on both pages, and FAQPage from the visible FAQ items.
  - `/…/sporsmal` joins the sitemap when launched, Norwegian only.
  - Bruksområder and the neighbouring pages already link to the industry pages.
  - The article /artikler/medarbeiderundersokelse-sporsmal gets its link to `/sporsmal` at
    launch, not before.
- **Not done:**
  - Lighthouse: no Lighthouse runs in this container. axe is checked instead.
  - The `signup_industry_hint` field, because /registrer does not read `?bransje=` (open
    decision 6).

Verified in the browser, on both preview pages:
- no sideways scroll at 360, 390 and 768 px;
- one h1;
- axe clean of serious and critical findings, after underlining the inline "Se hele
  spørsmålssettet" link;
- every in-page anchor resolves; the eight "Se alle tre påstander" links land on the eight
  factor sections;
- every quoted statement matches the module file verbatim;
- the start form refuses 123456789 with the check-digit message and 12345 with the length one;
- no console errors.

Status codes: `/bygg-og-anlegg` and `/helse-og-omsorg` are 200 with their current copy, and
`/…/sporsmal` without the flag and `/helse-og-omsorg/sporsmal` are 404. Unit tests: 174.

## D-119 — Industry modules in English, and the demo regenerated after the full test

The user asked for the construction module in English (answer "Modulen på engelsk"). The
Norwegian stays the source; the English is a translation that travels with the version.

- **The file.** `modules/<key>/v*.json` takes an optional `translations.en` block covering:
  - the module's name and description;
  - each factor's name, summary, rationale and legal basis;
  - every statement;
  - every action suggestion;
  - the count questions and their options;
  - the segments;
  - the covered core factors.

  `lib/modules/schema.ts` refuses a translation that is incomplete: a missing statement, a
  legal-basis or suggestion list of a different length, or options of a different count. A
  half-English module therefore cannot be published. The content hash covers the whole
  file, so a translation is part of the version. Correcting the English of a published
  module means publishing a new version, exactly as it does for the Norwegian.
- **The database (0072).**
  - `question_modules`, `module_factors` and `module_action_suggestions` gain `i18n jsonb`.
  - Items and options were already `{nb, en?}`.
  - `module_seed` writes the English, and `module_frozen` now compares `i18n` too.
  - `respond_form`, `module_results` and `get_count_item_totals` return the English beside
    the Norwegian under `_en` keys; they do not choose.
  - The readers (`lib/modules/read.ts`, `lib/modules/results.ts`, `lib/respond/*`) choose by
    the request's locale and fall back to Norwegian wherever an English value is missing, so
    no screen branches on language.
  - `module_invariants.sql` #16 proves a seeded translation is stored and cannot be changed
    once published.
- **Hosted.** 0072 is applied and recorded. `bygg-og-anlegg@1.0.0` was re-seeded as a draft
  with its English; the hash is now `fd6d9da1aa3b`. Nothing referenced the earlier draft.
- **Verified in the browser with `NEXT_LOCALE=en`:**
  - in Demobedriften, the module on a planned round in Måleoppsett shows "Construction, 24
    statements, about 3 minutes extra" with the yes/no toggle;
  - the respondent form asks 59 questions: 33 core, 24 module statements under their
    English factor headings, and 2 counts with "Yes / No / Don't know";
  - Resultater shows the module table and the count block in English;
  - there were no console errors.

  Afterwards the test round, its invitation and the pilot were removed. Demobedriften was
  then regenerated from `scripts/seed/demo-org.mjs`: 8 rounds, no modules or pilots, and the
  demo login intact. That was also the user's answer for the earlier full test ("Fjern
  testrunden, lag demoen på nytt").
- **Not translated here:** the English law references in `legal_basis` are translations of
  Norwegian statute names, not an official English text, and are marked as such nowhere in
  the product. They are reviewed together with the English industry page (D-120).

## D-120 — The industry pages in English, on en.orgpuls.com

The user asked for "Engelske bransjesider". `/bygg-og-anlegg` and `/bygg-og-anlegg/sporsmal`
now have an English twin, drawn by the same template from `content/industries/bygg-og-anlegg.en.ts`.

- **One page per language, each launching on its own.**
  - `INDUSTRIES` entries carry `page` and `pageEn`. Each has its own `launched`.
  - Before launch, a language shows its page only with `?forhandsvis=1` (noindex).
  - Otherwise en.orgpuls.com keeps the English landing page it had.
- **The statements are the survey's.**
  - `moduleFile(key, version, 'en')` lays the module file's `translations.en` over the
    Norwegian: names, rationale, statements, suggestions, counts, segments, scale labels,
    covered core factors. The English page therefore quotes exactly what an English
    respondent is asked (D-119).
  - Core statements are checked against `messages/en.json`.
  - Source titles stay in their original language. They name reports, and a translated
    title would not find them.
- **Validation per language.** `assertIndustries` runs `problemsOf` on each page in its own
  language. `twinProblems` refuses an English page that is on another module version, quotes
  other statements, or prints other preview figures than the Norwegian one.
- **The law.** The six English law items paraphrase Norwegian statute. The page says so ("the
  English wording is ours, not an official translation"), and each item is `reviewed: false`.
  The launch rule therefore keeps the English page from going live until they have been
  checked. The Norwegian items stay reviewed; the English items do not inherit that.
- **hreflang.**
  - `/bygg-og-anlegg` keeps nb/en/x-default, since both languages have a page at that
    address either way.
  - `/…/sporsmal` names its twin only when both languages are launched (`pageMeta({ noTwin })`).
    Until then it is canonical in its own language.
  - The sitemap lists a question page per launched language, with alternates only when both
    are.
- **Lists** are joined with `Intl.ListFormat` in the page's language, so "a, b og c" becomes
  "a, b and c". This replaces two hand-written Norwegian joins.
- **Måleoppsett** links "See the questions" to the preview or the live page by the viewer's
  language.

Verified in the browser with `NEXT_LOCALE=en`:
- both preview pages at 1280, 390 and 360 px: English throughout except source titles, one
  h1, `lang="en"`, noindex, no sideways scroll, axe clean of serious and critical findings,
  no console errors;
- without the flag, `/bygg-og-anlegg` shows the English landing page as before, and
  `/…/sporsmal` is 404.

The existing English landing page `/bygg-og-anlegg` carries one axe `link-in-text-block`
finding. It is in `LandingTemplate`, which this change does not touch, and is noted here
rather than fixed out of scope.

Unit tests: 180.

## D-122 — Helse og omsorg: the health and care module v1.0.0 and its pages

The user sent `helse-og-omsorg@1.0.0` together with the updated hand-off. The hand-off
(docs/implementation/bransjesider-og-tilleggsmoduler.md, now with health in scope) moves
open decision 7 from "page without a module" to a module and a page of its own.

**The module.**
- `modules/helse-og-omsorg/v1.json` is the user's JSON verbatim: 8 factors × 3 statements,
  2 counts, 2 segments and 24 suggestions.
- It adds a `translations.en` block written here, as the construction module has one (D-119).
- The schema now also accepts `relation_to_core.core_count_items_reused` and
  `core_statements_not_repeated`, so the hash covers them instead of dropping them.
  A unit test proves every core factor and core statement the file names is the core
  instrument's own wording.
- It is seeded as a **draft** on the hosted project, with hash `65bd7f1be746`. It is not
  published.
- NACE 86–88 now suggests it in Måleoppsett (`content/industries/meta.ts`), and only once it
  is published or piloted, as with construction.

**The pages.**
- `content/industries/helse-og-omsorg.ts` is ported from docs/reference/helse-og-omsorg.html
  and its question page. `helse-og-omsorg.en.ts` is the English twin.
- Both are `launched: false`. `/helse-og-omsorg` therefore keeps its current landing page, and
  the new page and `/helse-og-omsorg/sporsmal` exist as `?forhandsvis=1` previews (noindex).
- The law items, seven in each language, are `reviewed: false` and wait for review.

**Template additions** (content/industries/types.ts):
- A core challenge may name the factor's other statements. The ninth challenge,
  "Det følelsesmessige arbeidet", quotes emosjon s1 "together with" s2 and s3, as the
  reference does; all three are checked against the instrument.
- The challenges intro may cite (NAV's sickness figure).
- The module overview may continue the core sentence ("…, og teller hvor mange som har
  opplevd vold eller trusler").
- The source list can be limited to what the page cites (`sourcesFromFactors: false`), as the
  health reference lists 13 sources where the construction one also lists its factors'.

**Held behind `module_factor_toggles`, which is off.** The reference's example shows the night
shift with forflytning switched off; its footnote says so, and so does the first FAQ answer.
Choosing factors is built but not launched. So these three are shown only when the flag is on:
- the example's forflytning row;
- that footnote sentence;
- that part of the answer.

A dash with no explanation would read as a group under the threshold, so it is not shown.

**The construction page's core challenge** ("Tonen på riggen") stays as it is. The updated
hand-off allows a `note` where no single statement fits, but the construction reference quotes
«Jeg blir møtt med respekt uansett hvem jeg er», which is integritet s1 word for word.

**Verified in the browser:**
- the Norwegian and English previews of both health pages at 1280, 390 and 360 px: one h1,
  noindex, no sideways scroll, axe clean of serious and critical findings, every in-page anchor
  resolves, no console errors;
- the page against the reference at 1280, section by section;
- without the flag, `/helse-og-omsorg` is the landing page as before, and `/…/sporsmal` is 404.

Unit tests: 182. All 43 SQL suites pass on a local stack with both modules seeded.

## D-123 — No participation count for a group under k (0073)

**Why.** The engagement hand-off's I4 found this at P0.3 (qa/BLOCKED.md on
`feat/engagement-p0`). Participation was per group by design, including for groups under k,
and live while a round ran: "Økonomi 1 av 3" moved as people answered. The result readers
also printed "3 svar" beside a group of three whose results they withheld.

Tor decided on 2026-09-27: tighten it. A group under the threshold shows no participation
count, neither live nor after close, and larger groups keep theirs.

**The rule** is one function, `app.participation_shown(round, group)`, over
`app.participation_visibility(round)`. A group is hidden when fewer than k people were asked
in the round. "Asked" means invited, or, where more answered than were invited (a round
shared as a link), those who answered.

If the hidden groups together still have fewer than k people, the smallest shown groups are
hidden too, in the order `group_release` gives up groups (by size, then by id), until they
don't. Otherwise the organisation's total minus the shown groups would print the hidden
one's count.

Organisation totals are unchanged, and headcounts stay: they are the register, not
participation.

**What changed:**
- `participation`: `answered` and `pct` are null for such groups; `thin` is unchanged.
- `results_by_group`, `results_items`, `module_results`: `n` is null for such groups.
- `results_summary`: in a department's scope, `n` is null when any of its groups is hidden.
- **The screens:**
  - Målinger › Deltakelse prints the headcount and a note: "færre enn 5 ansatte —
    deltakelsen vises ikke …", or "holdes tilbake, så tallene for en mindre gruppe ikke kan
    regnes ut".
  - The heat map drops the "N svar" line for the row.
  - Oppsett › Grupper says "Antall vises ikke".
  - Måleoppsett's warning names the group without a count.
  - The report lists withheld groups by name only.
  - Segmentprofil's "rest of the organisation" needs every weight, so it shows no value
    rather than guess one.
  - Nothing prints a 0 in place of a withheld count.
- `malinger.thinNote` and `maleoppsett.groupWarnThin` are reworded: both used to promise or
  print the count this now withholds.

**The design is unaffected.** On the Nordvik fixture no count becomes null: 0 of 32 group
rows in `participation` and 0 of 28 in `results_by_group` and `results_items`, locally and on
the hosted project. The design's "Administrasjon 5 / 3 svar" case has five people asked, so the
pixel-gated screens render as before. On the hosted demo organisation, 16 of 48 group rows are
now withheld: Økonomi og HR (4 people) and one shielding group per round.

**Tests:**
- `participation_invariants.sql` is new, with 6 rows, run on the demo organisation.
- `suppression_invariants.sql` #3 now expects the protected group that shields a smaller one
  to carry no count. That is the new rule, not a relaxed one: the test previously asserted
  the count was printed.
- All 44 suites pass locally.
- Verified in the browser on the Lumio QA tenant: Målinger, Resultater, Oppsett › Grupper,
  Måleoppsett and Rapport.

## D-121 — The engagement QA harness: where it differs from § 2

- **The stack.** The QA tenant runs on the Supabase CLI's local stack in Docker
  (`npm run qa:up`), with every migration and CI's seeds, and never on the hosted project.
  - `scripts/qa/seed.mjs` refuses any non-loopback URL, and did refuse the session's
    production URL.
  - The app is built against the local stack into `.next-qa` (`NEXT_DIST_DIR`), so a QA build
    never replaces the one that talks to the hosted project.
- **npm, not pnpm.** The repository is npm; the document's commands are the same scripts
  (typecheck, lint, test, test:db, e2e, test:invariants, qa:visual, qa:seed).
- **Organisation number 999999981, not 999 999 999.** The SQL suites already use
  999999997–999999999 for their probe organisations, and signup_invariants deletes the
  organisation holding 999999998. 999999981 fails the mod-11 check, so no real undertaking
  holds it.
- **The clock.** § 2.2 freezes the clock at 15 October 2026, but only the browser's clock can
  be frozen. The server and the database run on theirs, and `respond_form` refuses a round
  that has not opened.
  - So the open round and the two live measures' deadlines are built around the day the seed
    runs.
  - The browser is frozen at 10:00 that day.
  - Captures therefore move with the date in those few strings. The comparison tolerance is
    unchanged.
- **Question order.** It is the server's, shuffled per token. The fixed tokens (`qa-lumio-*`,
  16 characters or more, as `respond_form` requires) are the fixed seed.
- **Roles.** The document's «HR» is a daglig_leder and its «tillitsvalgt» a verneombud
  (DECISION_LOG 2026-09-26).
- **Known issues.** Pre-existing axe findings on out-of-scope screens are recorded in
  qa/known-issues.json and reported, not fixed (§ P0.2). Anything not listed there fails the
  shot.

## D-124 — Question sets under Målinger › Spørsmålssett: off by default, chosen by the organisation (0074)

Tor, 2026-09-27: "jeg vil også ha spørsmålssettene under målinger - spørsmålssett og at de er
standard av, men KAN velges".

- **Storage.** `app.org_modules` (org, module key, enabled) holds the organisation's standing
  choice. No row means off.
  - It is readable by members.
  - It is written only through `public.set_org_module`, which checks that the caller is the
    daglig leder and that a version of the module may be used (published, or a pilot's
    draft).
  - The choice is by key, so a newer published version is what the next round asks.
- **Effect.**
  - Turning a module on adds its newest usable version, with every statement and the count
    questions, to the organisation's **planned** grunnlinjer.
  - The `round_default_modules` trigger gives it to every new grunnlinje.
  - Turning it off removes it from the planned ones.
  - Open and closed rounds are never touched (0071's rule stands), and a puls is never given
    a module this way.
  - Måleoppsett still decides round by round.
- **The screen.**
  - A "Bransjemoduler" panel sits below the core set. The design has no screen for it, so it is
    built from the core set's own tile, accordion and tokens.
  - Each card shows name, figures, description, a suggestion badge when the organisation's
    NACE code matches, the factors and statements on demand, and a link to the public question
    page.
  - Its switch is a native checkbox with `role="switch"`. Only the daglig leder may use it;
    others see the state and a note.
- **Tests.**
  - `org_module_invariants.sql` is new, with 7 rows.
  - Verified in the browser on the Lumio tenant: off by default; on is saved and survives a
    reload; the verneombud sees it read-only; axe is clean; no console errors.

## D-125 — /bransjer, the start page's industries, the construction page launched, both modules published

Tor, 2026-09-27: "opprett en bransjeside til startsiden med underside for bygg og anlegg og
helse og omsorg … Publiser spørsmålssett".

- **The page.** `/bransjer` is new, in both languages. It has crumbs, a hero and one card per
  industry. The card figures come from the module file. A note points other industries to
  /bruksomrader.
  - It is in the sitemap and the public paths.
  - The design has no page for it; it uses the start page's explore cards and the site parts.
- **The start page.** A "Bransjer" section after "Utforsk" has the two industry cards and "Alle
  bransjer →". It is an addition to the design's start page, asked for by Tor.
  - The start page's sections below it move down by its height; the pixel regions above are
    unchanged.
- **Construction launched.** `/bygg-og-anlegg` launched in Norwegian, as Tor approved the page
  and its law text on 2026-09-26. `/bygg-og-anlegg/sporsmal` is live and in the sitemap.
  - /artikler/medarbeiderundersokelse-sporsmal now links to it.
  - The English article links to /bransjer, because the English construction page waits for
    its law review.
- **Health and care stays a preview.** `/helse-og-omsorg` keeps its landing page until its
  seven law items are reviewed; the hub links to it either way.
- **Published.** `bygg-og-anlegg@1.0.0` (fd6d9da1aa3b) and `helse-og-omsorg@1.0.0`
  (65bd7f1be746) are published on the hosted project and can no longer change. Each
  organisation has them off until it turns them on (D-124).

## D-126 — Målinger › Innstillinger, the QR way in, a second reminder and quiet hours (0075, 0076)

Tor, 2026-09-27, after a proposal (X-064): one place under Målinger for how people receive a
survey and which question sets it asks, as a standard and per survey. QR is built rather than
withdrawn from the industry pages. Violence and offensive behaviour are on by default and
leaving them out takes a reason. The settings get a tab of their own.

- **Not in the design.** The design has no settings screen, no poster, no QR page and no
  per-round standard. All of it is built from existing parts:
  - the tab uses Måleoppsett's own sections and controls, moved unchanged into
    `components/maleoppsett/controls.tsx`;
  - the QR page uses the respondent surface's card and the sign-in panel's field and button;
  - the poster uses the product's type and tokens.
- **The tab strip gains a fifth tab, «Innstillinger».** It has no count pill: there is nothing
  to count, and a number there would be invented. The Målinger tab strip therefore differs
  from its v3 baseline by one tab.
- **The standard.** `app.survey_defaults` has one row per organisation and is written only by
  `save_survey_defaults`, which only the daglig leder may call.
  - It holds the deadline for grunnlinje and for puls, the first reminder day, the second
    reminder, quiet hours, comments, dialogue and the extras. The last three apply to
    grunnlinjer only; a puls stays five statements.
  - Every change is logged in `survey_defaults_log` (which settings, when), and the tab lists
    the latest ones. Names are not shown: a member cannot read another member's profile.
  - **No row means the product's defaults, and nothing is applied.** The design's
    organisations have no row, so their rounds and screens are unchanged.
  - The one exception: a grunnlinje planned with no extras at all gets the four that
    `plan_first_round` gives. The year wheel planned grunnlinjer that asked no screening,
    which the statutory report counts on.
- **How rounds inherit.**
  - A new planned round takes the standard when its transaction commits (a deferred trigger),
    so it applies whichever function created the round.
  - Saving the standard again moves the planned rounds that followed the old one, field by
    field. A field changed for one round stays.
  - The first save moves nothing, because nobody had chosen to follow a standard yet.
- **Fixed once open.** For a client, a round's settings, factors, audience, extras and own
  questions cannot change after it opens. Deletes the database makes itself still pass (the
  round or group being gone). Måleoppsett now disables its whole form for a round that is not
  planned; before, only the module controls were disabled.
- **Måleoppsett.**
  - «Se alle N spørsmålene» used to open nothing. It now opens the round's extras, and leaving
    out the screening takes a reason, stored on the round.
  - Once a standard exists, sections are marked «Standard» or «Endret for denne målingen»,
    with «Tilbake til standard», and the second reminder is offered.
  - While SMS is on, the round can set its own SMS rule.
  - With no standard and SMS off (the fixture), none of this renders.
  - Pixel check: the Nordvik shot of Måleoppsett renders none of the new DOM. The region diff
    against baseline 11 is 1.40 % of the screen. The differences are the local database's
    data: the industry-module block from D-112, and the question count. Nothing moves because
    of this change.
- **QR is a door, not a key.**
  - `app.entry_codes` holds one code per organisation: eight characters with no look-alikes.
    The daglig leder makes or replaces it.
  - `/inn/<code>` asks for a mobile number or an e-mail address. `request_link` queues a
    `lenke` message on the channel typed, for every open round where that person has an
    unanswered, unexpired invitation. The dispatcher mints their link as it does for a
    reminder, and the older link stops working.
  - The answer is `{"ok": true}` whatever was typed.
  - Since 0077, the function does not read who has answered. 0076 filtered on the answered
    mark, which engagement invariant I7 keeps to the system. The dispatcher's claim drops a
    link for an answered invitation, as it does for a reminder, so what a person receives is
    unchanged.
  - Limits: 10 tries per network per 10 minutes (in memory, as `lib/brreg/throttle.ts`); one
    message per person and round per 10 minutes; and per organisation per hour, no more than
    twice its active employees, at least 20.
  - The page says nothing about who is on the list or who has answered.
  - People with neither e-mail nor mobile cannot use it. The tab counts them.
- **Dispatcher.**
  - Two new kinds (0075): `lenke` and `siste_paminnelse`, the day before closing, queued
    hourly by `queue_final_reminders` for rounds with `final_reminder` on. It is skipped when
    it would land on the first reminder's day.
  - A round's own `sms_when` overrides the organisation's.
  - Quiet hours: no invitation or reminder is claimed between 21:00 and 07:00 in the
    organisation's time zone. This is on by default for every organisation, since rounds open
    at 09:00 and it only holds a message that would otherwise arrive at night. A link somebody
    asked for is never held.
  - The mail and SMS texts are new keys under `mail`, and the renderer handles both kinds.
- **Not built, from the proposal:**
  - «Send test til meg». It needs a way to send a link that answers nothing; a real token
    would be a real invitation. Built since, with the preview's link (D-171).
  - A chosen send time.
  - A ready-to-send check before «Åpne». The reach count on the tab is the first half of it.
    Built since, on Måleoppsett › Utsending (D-171).
  - Result sharing and language, which belong to engagement phases 1–2.
- **Tests.**
  - `supabase/tests/survey_settings_invariants.sql` has 15 rows, and all 47 suites pass.
  - `tests/unit/entry-contact.test.ts` is new.
  - Verified in the browser on the Lumio tenant:
    - saving with and without the reason;
    - the log;
    - the QR code and the poster, on screen and in print;
    - the public page: a match and a stranger get the same answer, invalid input, an unknown
      code, and one outbox row;
    - Måleoppsett's markers, reset, second reminder and SMS rule;
    - the verneombud's read-only view;
    - English;
    - 390 px with no sideways scroll;
    - axe clean on all four screens.

### D-126 addendum — links that leave the browser carry a production host (2026-09-27)

Tor asked "Localhost in link??" after seeing the phase-1 captures.
- **What was seen came from local testing, not from the product.** The phase-1 QA captures of the
  invitation e-mail and SMS were made against the QA host. They now use the production address
  (`feat/engagement-p1`).
- **The production dispatcher builds every mail and SMS link from `ORGPULS_APP_URL`.** Checked
  against the hosted secret's digest, without reading the value: it is `https://www.orgpuls.com`.
- **The QR poster was a real weakness, and is fixed.** It took its host from the request, so a
  poster printed on a Vercel preview or behind a proxy would carry that host on paper.
  `lib/hosts.ts` `outboundBase` now gives it the canonical address:
  - a production host keeps itself;
  - loopback keeps itself, on local and QA runs only;
  - anything else becomes `https://www.orgpuls.com`.
- **An audit checked 27 places that build an absolute URL**, each traced by two independent
  verifiers:
  - request headers, env and constants, the edge functions and SQL, and client `window.location`.
  - None puts a wrong host in something a person receives in production.
  - One low-severity case: the member invitation link (Oppsett › Roller). Previews share the
    production database, so an invitation made on a preview was real but pointed at the
    preview. It now uses the same helper.
  - The rest are same-browser redirects (OAuth return, the language switch, sign-in) or
    previews on screen, and are correct as they are.

## D-128 — A shorter survey link and shorter SMS texts, so an invitation is one SMS (0078)

Tor, 2026-09-27: "Ja kort den ned, kanskje bruke en short versjon". With the production
address, the bokmål invitation was 161 characters, one over a single segment, so every SMS was
billed twice.

- **The link.** A respondent token is now 16 random bytes in base64url: 22 characters, 128
  bits, from `app.new_respondent_token()`. It was 32 bytes in hex, 64 characters.
  - The link goes from 90 characters to 48 (`https://www.orgpuls.com/s/<22>`).
  - The token is kept only as its SHA-256, as before (invariant 3, I5). It is one-use, expires
    with its round, and is re-minted at every send.
  - `respond_form` and `submit_response` take any token of 16 characters or more, so links
    already sent keep working.
  - The 64-character tokens elsewhere (member invitations, conversation keys, CRM links) are
    unchanged: none of them goes by SMS.
- **No link shortener.** The link is the respondent's own key, and it does not pass through a
  third party's service.
- **The texts.** `mail.sms.*` (no and en) are shorter.
  - The reminders say «Ny lenke» instead of «Lenken i forrige melding virker ikke lenger». The
    message that the link changed is kept, in fewer words.
  - All four personal messages — the invitation, both reminders and the asked-for link — now
    fit one segment in both languages. That holds with an organisation name of up to 34
    characters and the longest deadline date (tests/unit/mail.test.ts).
  - An organisation's own SMS text (Integrasjoner › SMS) is unchanged. Its preview now counts
    with a link of the real length and address.
- **Tests.** dispatch_invariants #6 now expects a 22-character base64url token, and
  survey_settings #13 likewise.

## D-127 — Engagement phase 1: respondent language (0079, 0080)

The hand-off's phase 1 (engagement-phases.md § P1), built on `feat/engagement-p1`. It is stacked
on phase 0 rather than on `main`, because it needs phase 0's QA harness and language flags,
and phase 0 is not merged.

- **The registry.** `app.item_translations` is keyed by where an item's bokmål lives:
  `core:<factor>:<n>`, `extra:<key>[:o<n>]`, `module:<uuid>[:o<n>]`. It has the document's
  columns.
  - `source` has one value more than the document's list: **`machine`**. The product's
    English was written with AI assistance. Calling it `professional` would be false, and it is
    neither `official` nor a QA fixture. Approving a machine translation is the human review
    of it.
  - A changed text loses its approval (a trigger).
  - A `qa-fixture` row can be approved only where the database setting `app.environment` is
    `qa`. `qa:up` sets it on the local stack; nothing sets it anywhere else.
- **Respondent strings are approved by hash.**
  - `lib/i18n/respondent-ui.json` holds, per language, the SHA-256 of the `respond` namespace
    and the factor and extra labels. `verify:i18n` fails if the file is stale.
  - `app.ui_translation_approvals` records the hashes somebody approved. Change one string and
    the language is no longer offered until it is approved again.
- **Offered** = bokmål, plus each language whose flag is on, whose items are all approved for
  the survey's questions, and whose current UI hash is approved (`lib/i18n/offered.ts`).
  - **With no language flag on, nothing changes.** The respondent page stays in the host's or
    the switch's language, as it is in production today. English on en.orgpuls.com is not
    switched off by this phase.
  - Polish and Lithuanian can never be offered yet: there are no messages files for them.
- **Approval** is done by the platform's people, through `approve_item_translations` and
  `approve_ui_translation` (super_admin or support). There is no admin screen for it yet.
- **The picker** sits in the flow's top row, opposite the organisation's name, on every
  question rather than on an intro. The flow has no intro screen (phase 0 report), and
  switching midway must be possible.
  - It is a link, so it works without script. With script it replaces `?lang=` in place and
    keeps every answer given.
  - Its height is taken out of the row, so nothing below moves. Phase 0's three respondent
    baselines change only by the picker.
  - The language lives in the address only: no cookie, never stored with an answer, never a
    segment (I6).
  - The default is `?lang=`, then the employee's own language, then bokmål, each only if
    offered.
- **The employee's language** is `employees.language`, read from column F of the CSV import
  (a code or the language's own name). The import preview does not show the column; the
  design's preview has five columns.
- **Invitations and the system's reminders** are in the employee's language when the survey is
  offered in it. Otherwise they are in bokmål.
  - The link is the plain one, without `?lang=`. The survey page opens in the employee's own
    language by the same rule the message was written by, so the suffix added nothing. Its eight
    characters took an English final reminder from a 34-character organisation name to two SMS
    segments once the link was 22 characters (D-128).
  - The dispatcher decides with the flags it runs with (`ORGPULS_FLAGS` on the function; none
    set in production, so nothing changes there) and the UI hashes it was deployed with.
  - The product's mails now carry a `<title>`. Axe flagged the invitation without one.
- **Tests.**
  - `translation_invariants.sql` has 7 rows, and all 48 SQL suites pass. I1–I7 pass.
  - `tests/unit/p1-language.test.ts`: the language rule, the link, and the SMS segments for
    bokmål and English, for all four personal kinds: one segment each, from a 34-character
    organisation name with the longest deadline date.
  - `qa/e2e/p1-language.spec.ts` covers the step screens.
- **Human gate (§ 1).** `locale_en` stays off in production until a person approves every
  English item and the respondent strings. `locale_pl` and `locale_lt` need translations first.

### D-127 addendum — English signed off; the organisation's language before bokmål (0081, 2026-09-27)

- **Signed off.** `locale_en` is on in every deployment: lib/flags.signed-off.json, read by
  lib/flags.ts and written into the dispatcher's generated data by scripts/functions/deploy.mjs
  (X-065). The database gate is unchanged: English is offered only where every item and the page
  strings are approved.
- **The language order.** Before, with a language flag on, an employee with no language of
  their own got bokmål. For an English organisation that moved its invitations from English
  to bokmål. Now both the dispatcher (`personalLang`) and the survey page (`chooseLocale`)
  go: the employee's own, then the organisation's, then bokmål, each only where offered.
  - The page's order also starts with the link's `?lang=`.
  - 0081 makes `respond_locales` return the organisation's `default_lang`.
- **In the window before the approvals exist**, English is not offered, so an English
  organisation's personal mail is in bokmål. Both hosted organisations are Norwegian. Tor gave
  the approvals at 10:55 the same day (X-065), and English has been offered since.
- **An organisation's own invitation SMS is in the organisation's language.** Found while
  mapping the multilingual guide (X-067): `smsLead` sent the organisation's `sms_text` to every
  recipient, so an employee invited in English got the Norwegian text in front of their link.
  It now goes only to those invited in the organisation's language; anyone else gets the
  approved default in their own. No hosted organisation had a custom text or SMS on.
  tests/unit/mail.test.ts has the case; the dispatcher is deployed (v31).
- **Tests.** Four new cases in tests/unit/p1-language.test.ts. translation_invariants #4 now
  checks the organisation's language too.

## D-129 — «Bransjer» in the site's menu, with its pages under it

Tor, 2026-09-27, with a screenshot of the phone menu: "Ser ikke bransjer som meny med undersider
(hele sider) på forsiden".

- **Where it sits.** «Bransjer» is the fifth item in the header row, after «Pris». The
  nettside design draws five items. Its fourth, «Om oss», was removed in D-95 and «Pris» moved
  into its place, so appending Bransjer gives the row five items again. Plattform,
  Bruksområder and Hvorfor Orgpuls do not move. On all four designed pages the header strip
  differs from the baseline only between x 690 and 1039, where «Om oss» and «Pris» were and
  where the language switch is (D-96). At 1024 px the row stays one line (header 65 px).
- **The desktop row.** Bransjer is a disclosure, not a link: a button drawn as the row's
  links are, with a chevron. It opens a panel in the account menu's materials (D-80), holding
  «Alle bransjer» (/bransjer), «Bygg og anlegg» and «Helse og omsorg».
  - Escape closes the panel and returns focus to the button.
  - A click outside the panel closes it, and so does tabbing out of it or changing page.
  - The panel follows the button in the tab order, so opening it moves no focus.
  - The button is in the pill on /bransjer and on every industry page. Within the panel, the
    page you are on is in the pill.
- **The phone menu.** «Bransjer» links to /bransjer, and the industries are listed under it,
  indented behind a short rule. The page you are on is in the pill.
- **The pages are data.** The industries come from the registry (content/industries), by
  their `navLabel` in the site's language. A new industry is a registry entry, not a menu
  change.
  - Both addresses are whole pages. /bygg-og-anlegg is the launched industry page.
    /helse-og-omsorg is its landing page until its law review, and then the industry page
    (D-125). The menu links each whichever it is.
- **Crumbs.** An industry page's crumbs, visible and in JSON-LD, now read Forside › Bransjer ›
  the industry, instead of Bruksområder. This covers the landing page it shows before launch,
  and the question page under it: Forside › Bransjer › the industry › Spørsmålssettet. The
  other landing pages stay under Bruksområder.
- **After review (2026-09-27).** A three-lens review with adversarial verification confirmed
  four accessibility points, fixed the same day.
  - The desktop button carries `aria-current="true"` while its pill shows.
  - `aria-current="page"` is given only on the page itself. On a page under it (an industry's
    /sporsmal) the link is `aria-current="true"`, so the page's breadcrumb is not contradicted.
  - Choosing the page you are on from the panel returns focus to the button.
  - In the phone menu the indented pages are a group named «Bransjer».
- **English.** «Industries» / «All industries», with the English names: Construction, and
  Health and care.
- **Checked.** Desktop open, keyboard, Escape, click outside, tabbing out, navigation through
  the panel, 1024 px, the phone at 390 px with no sideways scroll, and English. axe is clean
  with the panel open on desktop and on the phone, and there are no console errors.

## D-130 — The legal review: every legal text in one place, each with «Approved» (0082)

Tor, 2026-09-27: "create a legal review part under admin and put all legal text there with an
approved checkbox" (X-065).

- **The page.** /admin/legal in the admin app lists every legal text, with a box for each, and
  gives an owner's view:
  - counts: texts, approved, changed since approval, not approved;
  - filters by state and by language;
  - each text shows where a reader meets it, whether that is published now, where it lives for
    whoever edits it, and the whole text in the order it is read.
  - It is a super-admin's alone, since a legal sign-off is the owner's. The database checks the
    role and the second factor on every call.
- **What counts as legal text.** A text the product or the site states law in, paraphrases law
  in, or makes a legal or compliance promise with, and the legal documents themselves. Five
  parallel searches of the repository and a completeness critic found them.
  lib/legal/registry.ts reads each from its own source (content/industries, the module files,
  messages/, the terms draft in docs/legal, app.factors, the CRM's templates and lists), and
  never copies it. The page and the approve action read the database's part through one loader
  (lib/legal/inputs.ts), so the hash the action checks is the hash of what the page showed; a
  read that fails leaves its units out and the page says which. The CRM's texts come through
  their own function (`admin_legal_sources`), without the lists' member counts, so opening the
  review is not audited as a CRM read.
  - One unit is what a reviewer reads as one thing: one law item on an industry page, one
    factor's legal basis in a module, one landing page, one article, one document, one in-app
    section. There are about 170 units, some 3,400 strings, in both languages.
  - Left out on purpose: labels that only name a law or a role; the unrendered
    seo.pages.plattform/bruksomrader blocks, which are published nowhere; and the survey's own
    statements.
  - Not covered yet, because they are code or per-organisation data rather than text: the
    chapter 1A coverage map and the BHT industry codes (RegelverkTab.tsx, SelskapTab.tsx), the
    Lovdata link targets, and a measure's own law_ref.
  - The admin app's own texts are the team's, not published, and are out, except the one legal
    reading the team acts on: the CRM's existing-customer exception (markedsføringsloven § 15).
- **An approval names the text.** `app.legal_approvals` holds the current approval of each unit,
  as the SHA-256 of the unit's text as shown. A text edited afterwards shows as «Changed since
  approval» until it is approved again; nothing has to remember to clear it.
  - The approve action recomputes the text's hash on the server. It refuses a hash that no
    longer matches, so a page loaded before an edit cannot approve unread text.
  - Every approval and withdrawal is also an admin audit entry (`legal.approve`,
    `legal.withdraw`), which is the history.
  - RLS on, no policy, no grant; the functions in 0082 are the only way in.
  - supabase/tests/legal_invariants.sql checks this in 6 rows.
- **The English survey is approved here too.** One box saying the texts were read, then one
  button. It approves every unapproved English item and the survey pages' strings as this build
  has them, audited (`translations.approve`). A qa-fixture row is never approved off the QA
  stack. This is where the approval X-065 records is given.
- **After an adversarial review (four lenses, each finding verified), before it shipped:**
  - Withdrawing takes the hash of the text shown. It removes only the approval of that text, and
    the audit log records the hash actually removed.
  - The English approval approves only what the page showed. The page posts a digest of the
    unapproved rows it listed (app.translation_digest). The database locks, hashes and names
    those rows in one statement, compares, and approves only the rows it named, so a row
    another transaction adds or rewords meanwhile stays unapproved. The card also shows the survey pages' strings it approves.
    lib/i18n/respondent-strings.ts computes them, and a test holds its hash equal to the
    committed one. Its readiness counts every item any survey could ask, not only the rows
    that exist (app.all_item_keys), the same two conditions the offered rule checks.
  - A law item's hash has no position in it, so moving an item keeps its approval. A
    repeated reference gets the next free suffix.
  - A source that yields nothing (a failed read, an empty file) is shown as broken and cannot be
    approved as an empty text.
  - A module's texts are shown as published only when that version is published in the
    database.
  - Every visible string is a message: the places, the title formats, the counts.
  - The checkbox keeps focus through a save and says «Saved.». The English form's answer
    stays on screen after an approval that leaves nothing to approve, takes the focus once, and
    is cleared when new texts arrive; the «read» box is cleared by an approval.
  - A read that fails (the factors, the modules, the CRM's texts) is named on the page and its
    units are left out, never shown as a registry fault; a CRM with every list archived has no
    lists unit.
  - A NULL language is refused as invalid rather than failing on a constraint.
- **Publishing is not gated by the approvals.** Pages are built from code, and launching an
  industry page still needs its law items marked `reviewed` in content/industries, which the
  build enforces. On the review page a text not approved is marked red and a changed one
  yellow, and a «Published» badge beside it says whether readers see it now.
- **Two public faults the search found, fixed with it.**
  - **Lovdata links.** The English law blocks' «Regulation § 1A-2» linked to the Working
    Environment Act, which has no § 1A-2. This was on /lovkrav, the English /helse-og-omsorg
    landing page and one article. lib/marketing/lovdata.ts now sends chapter 1A, and any
    reference naming the regulation in either language, to the regulation. A reference naming
    another act is not linked at all, rather than linked to the wrong law.
  - **The site's default share card** (public/og.png) still said «30 dager gratis». It is now
    made by scripts/marketing/og-images.mjs from the start page's H1, like every other card.
    The three pills on every card are messages (seo.og.pills), so they are in the review too.
- **Also in the review, after the completeness critic:** the sources each module cites
  («Kilder»), the double opt-in e-mail, the ticket e-mail's footer, the sign-in page's
  promise to respondents, every help article that states law (found by what it says, not
  listed), the assistant's screen texts that state a legal duty, the anonymity promises, the
  DPA's signing text, /priser's terms, and the CRM's e-mail templates and consent lists.
- **Tests.** tests/unit/legal-registry.test.ts checks:
  - every path resolves in both languages, so a renamed message key fails the test instead of
    dropping out of the review;
  - every key is unique and one the database accepts;
  - a changed word changes the hash;
  - what is published is marked so;
  - every message in either file that cites a «§» is in some unit, so a new one cannot be
    published outside the review (the admin app and the unrendered blocks excepted);
  - every unit's title and place is a message the page has.

### D-130 addendum — «Approve all» per section (2026-09-27)

Tor: "make a select all for each section under legal approval". Each section's card has «Approve
all (n)», n being the texts the card shows (under the current filter) that are open or changed and
whole. It approves each by the hash on the screen, one admin_legal_set call — and so one audit
entry — per text, as ticking each box would. The texts are checked against the registry first; if
any is gone, broken or no longer the text shown, nothing is approved and the page asks for a
reload. It approves only: withdrawing stays one box at a time, since withdrawing a whole section at
once is not a thing a reviewer needs and is easy to do by mistake.

## D-131 — Barnehage og skole: one module, three wordings, and a page that waits for review (0083)

Tor, 2026-09-27: "Bygg skole og barnehage, place it queue", with the handoff's
bransje-barnehage-og-skole.md, innstillinger-og-forside.md and modules/barnehage-og-skole/v1.json
(X-066). Built as the brief describes, with these choices where it left room or could not be
followed as written:

- **The wordings live in the locale map, not a new column.** The brief names
  `module_items.text_variants`. The registry already keeps an item's text as a locale map
  (`{"nb": …, "en": …}`), so the variants are two more keys there, `nb.barnehage` and
  `nb.skole`, and `nb` stays the «begge» wording. Every reader that reads `nb` still reads a
  correct statement, and no frozen table gets a column.
- **The choice is the organisation's, per module, stored where the module choice is.** The brief
  names `organizations.wording` and `survey_modules.wording`. There is no `survey_modules`
  (rounds use `round_modules`), and a wording only means something for a worded module, so it is
  `org_modules.wording` (the standing choice, null for «as suggested») and
  `round_modules.wording` (what a round asks, filled as the module is put on the round, by
  every path, and fixed once the round opens). `app.org_wording` decides the suggestion from
  the module file's own NACE rule. One write path, `set_org_module_wording`, daglig leder only,
  applied to planned rounds and never to an open one. supabase/tests/module_wording_invariants.sql
  proves it in 9 rows.
- **Where the choice is made.** The brief puts it under Innstillinger › Virksomhet › Bransje.
  The organisation's module choices are made in Målinger › Spørsmålssett (D-124), so the wording
  is chosen on the module's own card there: a radio group «Barnehage («barna») / Skole
  («elevene») / Begge», showing whether it was suggested or chosen. The design has no screen for
  it; it is built from the card's own parts, styled as the switch beside it.
- **Kindergartens under either industry standard.** The brief's rule reads SN2025 (85.1 a
  kindergarten, 85.2 and 85.3 a school). Brønnøysund still hands out SN2007 codes, where
  kindergartens are 88.911, inside helse og omsorg's 88. The module file's rule and prefixes
  add 88.911 (kindergartens) and 88.913 (SFO, the school's wording), and
  content/industries/meta.ts lists barnehage og skole before helse og omsorg so the longer
  prefix wins.
- **Law references checked, not approved.** The brief's module and page said «verifiser
  paragraf» twice. Checked against Lovdata on 2026-09-27: opplæringslova § 13-4 (fysiske inngrep
  for å avverje skade), kap. 12 with § 12-4 (aktivitetsplikt) and § 24-3 (plikt til å melde frå
  til barnevernet); barnehageloven kap. VIII with § 42 (aktivitetsplikt) and § 46
  (opplysningsplikt); forskrift om utførelse av arbeid kap. 3A (see the review below). The file
  and the page name them now. Every law item stays
  `reviewed: false`; they are in admin › Legal review for Tor.
- **Not launched, not published.** The page is shown only with ?forhandsvis=1, and the module is
  seeded as a draft (usable only by a pilot organisation). Barnehage og skole never had a landing
  page, so before launch the address is a 404, and the menu and /bransjer leave it out
  (`hasPublicPage`). Launching is: Tor approves the law items, `reviewed: true` and
  `launched: true` in content/industries/barnehage-og-skole.ts, and
  `npm run modules:publish barnehage-og-skole 1.0.0`.
- **Norwegian only.** The file has no English translation (the brief's scope excludes English),
  so there is no English page, and the schema refuses an English translation on a worded module
  until the file has a place for English wordings. A survey that asks this module offers English
  only once it has approved English texts, which it does not.
- **Parts the template needs and the brief does not write** (the loop's steps, the module
  overview's closing note, the question page's rules and CTA) follow helse og omsorg's in this
  industry's words. The brief's «Vanskelige saker» note («Ikke skriv om enkeltbarn eller
  enkeltelever i kommentarfeltet») is a rule on the question page; the survey's comment field is
  the core instrument's and says nothing per module.
- **After an adversarial review (three lenses, each finding verified), before it shipped:**
  - *A repealed chapter.* Forskrift om utførelse av arbeid kap. 23A (vold og trusler) was
    repealed on 1 January 2026 (FOR-2025-12-16-2615) and replaced by kap. 3A (§§ 3A-1–3A-6);
    the regulation was renamed with it. The brief cited 23A; the module and page cite 3A.
    Kap. 14 is noise and vibration, not ergonomics (kap. 23): the stoy-factor's basis names both.
    **Helse og omsorg has the same two faults and is live.** Its page's law item now names
    kap. 3A (the text Tor approved is unchanged, so the reference awaits his approval in the
    legal review). Its module v1.0.0 is published and frozen, so its report and question page
    still print «kap. 23A» and the kap. 14 label until a v1.0.1 is published, which gives its
    items new ids and needs their English approved again. That is Tor's decision (X-066).
  - *The factor's name named both.* A respondent in a kindergarten round saw «Vold og trusler
    fra barn og elever» above «… når et barn blir voldelig». A factor name may now carry
    variants (the brief's own tokens: «fra barn», «fra elever»), stored in module_factors.i18n
    and read by respond_form, module_results, the preview, Spørsmålssett and the question page.
  - *The planned rounds follow.* A new choice skipped rounds on a retired version (the whole
    call used to fail on one); a change of the registered industry (the Brønnøysund refresh)
    now reaches the planned rounds of an organisation that has not chosen, through a trigger;
    and a client can no longer write `round_modules.wording` at all (column grants), so the
    daglig leder's choice is the only one.
  - *Say where it came from.* The card said «suggested from your industry code» for every
    organisation that had not chosen, including those whose code suggests nothing and get the
    module's default. `org_module_wordings` returns the source, and the card says which.
  - SFO registered on its own (SN2007 88.913) suggests the school's wording and the module,
    not helse og omsorg; the question page no longer claims the three wordings' numbers are
    comparable before the pilot has tested it (brief § 5.1), nor that every factor's rationale
    comes from research; once launched, the page is in the sitemap and names an English twin
    only where there is one.
  - `PreviewBanner` moved out of the page module into components/industry: a page module
    exporting a component is what Next's generated route types refuse (it surfaced when a
    reviewer ran `next build`; CI's tsc runs before the build and never saw it).
- **Not built:** the «Foreløpig» mark on provisional module results (brief § 3.3), which needs
  the validation status in the registry and an admin control to change it; the factor toggles
  for this module, which stay behind `module_factor_toggles` as for the others; and the card's
  «Ny» label (`newUntil`), which the hub has no place for.

## D-132 — The multilingual engineering queue, built (0084, 0085)

Tor, 2026-09-27: "Build the whole engineering queue, and prepare helse 1.0.1" — items 1–8 of
docs/implementation/multilingual-gap-analysis.md § «Proposed engineering queue» (X-067), and a
corrected helse og omsorg module (X-068). Nothing here changes what a respondent sees today:
English stays approved, bokmål stays the source, and no Latin glyph renders differently.

1. **Language tags at the edges.** `bcp47()` (lib/i18n/locales.ts) turns the product's `no` into
   `nb` wherever a tag leaves the product: `<html lang>`, the survey page's `<main lang>`, the
   language picker's `hrefLang`/`lang`, the language switch, the newsletter archive's article,
   and JSON-LD `inLanguage` (`nb-NO`, `en`). The code stays `no` everywhere inside — files,
   cookies, the database — as CLAUDE.md fixes it.
2. **i18n gates.** `npm run verify:i18n` now parses every message with
   @formatjs/icu-messageformat-parser, compares each translation's arguments and tags with the
   source's by AST, requires every CLDR plural category of the locale (so a Polish plural without
   `few`/`many` fails), and holds the no/en SMS templates to GSM-7. An organisation's own SMS
   text has its typographic quotes, « » included, turned into ASCII on save (lib/sms/gsm7.ts),
   because one such character makes the whole message UCS-2 and halves its length.
   The gate found 13 real faults, all fixed in the catalogues; the ones a user could see were
   «1 faktorer» and «1 questions».
3. **One locale registry.** lib/i18n/locales.ts is `{code, bcp47, nativeName, dir, platform,
   survey, fallback}` per language; LOCALES, the survey languages, their names, the zod enums of
   five server boundaries, the legal registry's languages, the company form, the respondent-UI
   hash script and the dispatcher's list derive from it. The database keeps its own lists in
   checks and function bodies; tests/unit/locales.test.ts reads the latest definition of each from
   supabase/migrations and fails when one disagrees with the registry. The guide's `host` field is
   not in the registry: the hosts are lib/hosts.ts's, and only English has one.
4. **Translation governance (0084).**
   - A translation has a status — draft → in_review → adjudicated → pretested → approved →
     retired — with adjudication notes and a TRAPD reference per step on the row. `approved_at`
     stays, set exactly when the status is approved, so 0079–0082's readers are untouched and the
     131 English approvals on the hosted project carry over.
   - *Deviation from the guide:* a machine translation (the product's English) may still be
     approved from any step. The guide's steps assume two independent translators and a pretest;
     the English is one reviewed machine text (D-127), and requiring steps nobody performs would
     only make the statuses untrue. An official or professional translation is approved only once
     `pretested` (app.translation_approvable), on every approval path.
   - *Approved rows immutable* is met as "an approved version never changes": a new wording of an
     approved row is the next version, back in draft, and every version — the text as approved,
     who changed it, when — is in app.item_translation_log, which is append-only. Rewriting the
     row in place under a new primary key would have meant rewriting every reader.
   - *A round's wording is pinned.* When a round opens, its approved texts are copied to
     app.round_translations; an item approved while the round is open is pinned then. A pin never
     changes and the respondent reads it first, so a new version reaches the next round, never the
     one in the field. Rounds open when 0084 was applied were pinned by it.
   - 0079's `approve_item_translations` and `approve_ui_translation` are super-admin only now
     (support could call them) and audited. Status, notes and documents are
     `admin_translation_update`, super-admin and audited; `admin_translation_history` reads the log.
     There is no screen for the workflow yet: no language needs one until a translator is engaged.
   - *Variant keys.* A worded module's statement is `module:<uuid>:v:barnehage` / `:v:skole` in
     the registry, so a kindergarten round asks for the kindergarten wording's translation, and a
     language is offered for it only once that exists. The respondent receives it under the item's
     own key, so the page did not change.
5. **Language pilots (0085).** app.locale_pilots: a super-admin names an organisation for a
   language, with a reason, audited, on admin › Legal review. *Deviation from the queue's wording:*
   a pilot stands in for the flag, not in addition to it — the flag is "everyone", a pilot is "these
   organisations first", as the guide's stepped rollout has it. Nothing else loosens: the language
   is still offered only where every item and the page strings are approved. The survey page and
   the dispatcher read the pilot from the language state they already had.
6. **A CI job for the respondent flow.** In CI's `invariants` job, which already has the stack
   built from the migrations and a build made against it (a job of its own would pull the
   Supabase images a second time, the step rate limits have failed twice): the QA harness's
   Playwright suite runs the survey start to done at 390, 360 and 320 px in bokmål and English,
   and at 320 px under a pseudo-locale (scripts/i18n/pseudo.mjs: accented, about 40 % longer,
   bracketed, arguments and plural branches untouched; served only with ORGPULS_PSEUDO=1, never
   on a production deployment). Every screen is gated on its `lang` being the rendered language's
   tag, axe, console errors, and nothing scrolling sideways or clipping. The one request a
   submission makes is checked for a `lang`/`locale`/`language` key at any depth, and a unit
   test holds `submitResponse`'s RPC arguments to exactly token, answers, extra and module.
   *Deviation:* CI gates everything but pixels. The QA baselines depend on the machine's fonts and
   rasteriser, so the pixel comparison stays a local gate (`npm run qa:visual`), which now leaves
   the flow tests to `npm run e2e`, since they submit answers the manager screens would then show.
   *Known, not fixed:* on a survey answered in English, `<html lang>` is the visitor's site
   language (the root layout's) while `<main lang="en">` carries the survey's; the content is
   tagged correctly, but the document's own language is not. The root layout cannot know the
   survey's language without the page telling it, which needs a layout of its own for /s.
7. **A Cyrillic fallback font.** DM Sans has no Cyrillic. Manrope's Cyrillic subsets (SIL OFL),
   self-hosted in public/fonts and declared in app/fonts.css as «Orgpuls Cyrillic» with a
   Cyrillic-only unicode-range, after DM Sans in `--font-dmsans`. A page with no Cyrillic never
   fetches it and no Latin glyph can come from it, so the pixel baselines are unaffected (D-07's
   rule is about the bundle's own files, which are untouched). Playfair already ships Cyrillic.
8. **Types, fallback, hreflang, sitemaps.**
   - *Typed message keys: measured, and not adopted.* Typing next-intl's `Messages` against
     messages/no.json makes 130 call sites fail, every one a key built from data (a factor, a
     status, a question kind — CLAUDE.md's "data-not-code"). Making them pass means a cast at each,
     which asserts what nothing checks. `Locale` is typed (types/next-intl.d.ts); keys are held by
     the catalogue gates and made visible by `getMessageFallback`.
   - *Fallback chain.* lib/i18n/request.ts lays a locale's catalogue over the ones its registry
     entry falls back to. No platform locale has one today; survey items never fall back.
   - *One hreflang method:* the sitemap. Each host's /sitemap.xml lists its own URLs, with
     `nb`, `en` and `x-default` (www) alternates only where a page has a twin; en.orgpuls.com's
     robots.txt names its own sitemap. The pages' own `<link rel=alternate>` tags stay
     (lib/marketing/meta.ts): they build the same three URLs from the same host constants, and
     search engines accept both, so keeping them costs nothing and removing them gains nothing.

**Helse og omsorg 1.0.1** (X-068). modules/helse-og-omsorg/v1.json is now 1.0.1: forskrift om
utførelse av arbeid kap. 23A (repealed 1 January 2026) → kap. 3A, and kap. 14 (noise) → kap. 23
(ergonomisk belastende arbeid) for forflytning, in Norwegian and English. Nothing else differs; a
unit test says so. 1.0.0 stays published and is kept byte for byte at
modules/helse-og-omsorg/archive/v1.0.0.json, which the public pages go on quoting — they print
the version respondents are asked — until 1.0.1 is published. 1.0.1 is seeded as a draft on the
hosted project, and its legal basis is in admin › Legal review.

## D-133 — The survey in Polish, Ukrainian, Lithuanian, Swedish and Danish; translations in the admin (0086)

Tor, 2026-09-27: "Go with Polish and Ukrainian first, then Lithuanian; Swedish and Danish from the
official Nordic versions — the PLATFORM ADMIN will stay in English, always … I want the recommended
JSON translation files (or other recommendation for handling multiple languages) so I can see,
export and import languages translation … under admin" (X-070). How to use it:
docs/implementation/translation-files.md.

- **Where a survey language's texts live.** Bokmål and English are the platform's languages and
  keep their strings in messages/. The five survey-only languages have no message files. Every
  text a respondent reads in them lives in the translation registry (app.item_translations): the
  questions as before, and now the survey pages' strings (`ui:`), the invitation, reminder,
  requested-link and SMS texts (`mail:`), and module factor names (`mfactor:`).
  - *Why the database, not repository files:* the ask was to import under admin, and the admin
    cannot write the repository. The registry already has the workflow, the history and the
    approvals.
  - *What this departs from:* CLAUDE.md's "every UI string comes from next-intl" still holds on the
    page. The survey page renders these languages through next-intl, from bokmål's messages with
    the approved strings laid over them.
- **The recommended format** is one JSON package per language (`orgpuls-translations` v1), with
  XLIFF 2.0 for agencies' CAT tools. Each entry carries the bokmål source, the English as
  reference, context, the translation, its TRAPD step, notes, and the SHA-256 of the source it was
  translated from.
  - *Stale translations:* a page or mail text translated from an older bokmål counts as out of
    date and is not used, so a changed source never shows under an old translation.
  - *What the import checks:* placeholders, plural categories per language (Polish, Ukrainian and
    Lithuanian need one/few/many/other), valid syntax, and SMS length. It never approves: at most
    it records a step up to pretested.
- **What may be approved, by language** (tightens D-132 4):
  - the product's own English: machine text, at any step, as before;
  - an official version (the QPS Nordic Swedish and Danish): at any step;
  - everything else only once pretested.

  So a machine draft can never become the approved wording in a new language, as the multilingual
  guide requires.
- **When a respondent is offered one of these languages.** All of these must hold:
  - its flag (`locale_pl`, `locale_uk`, `locale_lt`, `locale_sv`, `locale_da`) is on, or the
    organisation pilots it;
  - every item the survey asks is approved;
  - every survey-page string is approved from the current bokmål.

  The invitation goes out in it only when, in addition, every mail and SMS text is approved from
  the current bokmål. The page and the dispatcher share one check
  (supabase/functions/_shared/survey-texts.ts).
- **Module factor names are now translated items** in these languages: the name printed above a
  module statement.
  - *English is exempt:* its factor names are part of the published module (module_factors.i18n.en)
    and were reviewed with it. Requiring them again would have silently stopped English in every
    survey with a module.
- **Verified end to end locally**, through the admin with a real super-admin session and second
  factor. For Ukrainian:
  1. The export had 245 entries: 33 statements, 17 questions outside the index, 97 module texts,
     74 page strings and 24 mail texts.
  2. A file whose plurals lacked Ukrainian's forms had those 3 messages kept out, with the reason
     shown.
  3. The corrected file imported 245 rows as pretested.
  4. Approval made the status «Offered to respondents».
  5. The survey page then opened in Ukrainian from those texts: `<main lang="uk">`, the Cyrillic
     font loaded, no bokmål left showing, and no console errors.

  The rows were removed afterwards. No real translation exists yet in any of the five languages.
- **Not done:**
  - A language-switching end-to-end test for a survey-only language in CI. The QA seed keeps
    Polish deliberately incomplete, and the existing tests assert that; the unit tests cover the
    rule instead.
  - Machine drafts: none were generated.
  - The respondent pages outside the survey itself (the conversation pages, /inn) stay in the
    platform languages.

## D-134 — «Ikke relevant for meg», and a «Hopp over» that skips (0087)

Tor, 2026-09-27: "Sometimes the question is simply not relevant; or the user want to skip the
question — this should be an opportunity. Also if many user flag it as irrelevant it should be
removed from the baseline? … Make sure NPS is intact and that we stay within the boundaries of
employee survey." Then: "hva er din anbefaling rundt ikke relevant og hopp over, mulighetene er
der ikke i dag" (X-072).

- **What was there.** The design's «Hopp over» (bundle 2014, `rSkip`) was built as the same handler
  as «Neste». An option already picked was still sent, and nothing could unpick it. So «Hopp over»
  skipped only a question nobody had touched. Nothing let a respondent say a statement does not
  apply to them.
- **«Hopp over» now skips.** It drops whatever was picked on that question and moves on, so nothing
  is sent for it. A comment written on it is still sent, as before, because the person wrote it.
  «Neste» with nothing picked is the same skip. The control is the design's, where the design has
  it.
- **«Ikke relevant for meg» is a sixth answer on statements.** It covers core and module statements
  only.
  - *Where it sits:* set 16 px below the five scale options, its label muted until picked, in the
    options' own control (the same button class).
  - *Why a separate answer:* it is not «Verken eller». The midpoint is an opinion; folding «does
    not apply» into it would pull every index towards 50. It is not a skip either, because it is
    kept and counted.
  - *Where it is not offered:*
    - the recommendation question (NPS), which is unchanged in how it is asked, stored and scored
      (0035, 0042);
    - the count questions, which have «Vet ikke»;
    - violence and offensive behaviour, which have «Vil ikke svare» and «Nei»;
    - the background questions and the open field, which are optional anyway.
- **Stored apart, so no index can count it.** app.not_relevant_answers (core) and
  app.module_not_relevant_answers (module) sit beside the answer tables, with the same shape: a
  response and a statement, nothing else.
  - The tables have RLS on, no policy, no grant, are append-only, and are written only by
    submit_response. `na: true` replaces a value and is refused beside one.
  - Every existing reader, including every index, cell_release's n, the recommendation score,
    importance and comment themes, reads only the answer tables. So a not-relevant mark enters no
    mean, no k count and no denominator, by construction rather than by a filter someone must
    remember.
  - This is also why the mark is not a value such as 0 in app.answers: every one of those readers
    would have counted it.
- **Shown only where it cannot point at anyone.** public.results_not_relevant gives, per statement,
  the scale answers and the marks, and only under all of these conditions:
  - for the whole organisation;
  - to daglig leder and verneombud, who choose the question set;
  - for a closed round;
  - only where at least k people marked it.

  Below k, "1 svarte «ikke relevant»" could name the one person a statement does not fit, such as
  the only office worker in a construction firm, and say that they answered.
  - *In Resultater* the count shows under the statement in the drill-down (whole organisation) and
    in the module panel.
  - *The flag:* at 30 % or more it adds what that means. For a core statement, the figure rests on
    those it applies to. For a module statement, it can be taken out of the next survey under
    Målinger › Spørsmålssett (D-136).
  - *The design fixture has no marks*, so every Resultater baseline renders none of this.
- **Not removed automatically** (Tor's question). A statement many mark not relevant is flagged,
  and taking it out is the organisation's decision, logged, for coming grunnlinjer only (D-136).
  - *Past results never change*, and the eleven core factors are never taken out: they are the
    statutory core and the year-on-year comparison.
  - *Automatic removal was rejected:* a small group could then change the instrument for everyone,
    and the index would stop being comparable without anyone deciding it.
- **The respondent screen is no longer the design's.** It has one option more and a gap. The QA
  baselines for the question screens were re-captured. The new string `respond.notRelevant` changed
  the survey pages' hash, so English must be approved again in admin › Legal review before it is
  offered (0082's rule), and the five survey languages need the string translated.

## D-135 — The response rate against earlier rounds, in Resultater

Tor, 2026-09-27: "svarprosent må også måles opp mot tidligere undersøkelser under resultater".

- **Neither design compares a response rate with an earlier survey.** They compare only the index.
  Per-round rates appear only as lists: Historikk, the year rail and the report's run table.
- **Built from Resultater's own parts:**
  - *Svarprosent card:* after «28 av 34» the difference in percentage points, coloured as the
    index delta is: «+5 fra 2025».
  - *What it is measured against:* the round the index is measured against (the grunnlinje
    compared with, or the one before). For a puls, the card measures against the puls before it,
    «… fra forrige puls», because pulses are shorter and go to different people.
  - *Utvikling:* the whole organisation's view gains a «Svarprosent» row under «Indeks», one cell
    per round, neutral rather than heat-coloured, since a rate is not a score.
- **Nothing new is disclosed.** Only organisation totals are compared, and those are every
  member's already (0073). Each figure is the one its own round shows. No group rate is compared,
  so D-123's rules on groups under k are untouched.
- **The rates are recomputed**, as everywhere (participation, 0073): a past round's rate moves if
  people have since left or changed group. Nothing snapshots them, as nothing did before.
- **Pixel gate.** In the design fixture, 2026 against 2025 is 82 % against 77 %, so «+5 fra 2025»
  renders in the Svarprosent card on every Resultater state (baselines-v3 07–11, 19). Utvikling
  gains one row. Those tiles are re-claimed, as D-87 did for a page that grew.

## D-136 — Choosing an industry module's statements; the core whole in every grunnlinje (0088)

Tor, 2026-09-27 (X-072): select questions individually, mark irrelevant ones, keep NPS intact, stay
within the boundaries of an employee survey.

- **What can be chosen:**
  - *Industry modules:* statement by statement, under Målinger › Spørsmålssett, by a daglig leder,
    as the module itself is. Ticked is asked. A statement left out is not asked in any planned or
    coming grunnlinje.
  - *By code:* the choice is kept by the statement's code (BA-SF-2), so it outlives a new version
    of the module.
  - *At least one statement stays:* a module with none is switched off, and that is the switch's
    job.
  - *Documented:* every change is logged in app.org_module_items_log, append-only. Members read
    the choices; daglig leder and verneombud read the log.
  - *The screen shows the evidence:* beside each statement, how many said «ikke relevant» in the
    last grunnlinje, where at least k did (D-134). When a flagged statement is left out, that line
    is kept as the reason.
- **What cannot:**
  - *The eleven core factors in a grunnlinje.* The design locks them (bundle 4125-4130, «Grunnlinjen
    bruker alle elleve. Ordlyden er låst»). Our Måleoppsett printed that note but left the chips
    editable. They are now locked and ticked. The action writes the whole core for a grunnlinje
    whatever the form sends.
  - *Any bypass of that lock:* app.round_whole_core gives a grunnlinje every core factor as it
    opens, whichever path opened it. It adds what is missing rather than refusing, so the year wheel
    never stalls on it. A puls still asks the factors it was given.
  - *A core statement:* never chosen away. «Ikke relevant for meg» is the respondent's way out
    instead.
  - *The recommendation question and the other extras:* chosen as before, on Målinger ›
    Innstillinger and per round (0076). Nothing here touches them.
  - *Own questions:* the organisation still cannot write any here. Choosing is among the validated
    and reviewed statements only.
- **Måleoppsett.** The module summary counts the statements the round actually asks, instead of
  three per factor.
- **The design has no per-statement choice.** The accordion's statement rows became native
  checkboxes (styled as the module switch above them) when the module is on and the viewer is a
  daglig leder. For everyone else they read as before, with «Tatt ut» on a statement left out. The
  design fixture has no module on, so no baseline renders any of this.
- **Pixel gate, Spørsmålssett (baselines-v3 06).** Unchanged by this: statements render only in an
  open module, and every module is off in the fixture. One tile, 1600:960, had been lost since
  D-124: the Bransjemoduler panel sits where the prototype's footer is, and the tile had matched
  only by chance on the panel's empty background. The commit before this one renders the same page
  byte for byte. The tile is re-claimed and the table in D-77 updated.

## D-137 — Kunnskap og kontor: one module in two variants (0089)

Tor, 2026-09-27: "start på kunnskap og kontor". From the handoff's bransje-kunnskap-og-kontor.md and
innstillinger-og-forside.md § 2 (the variant data model, PR A), with parts of PR C, D and E.

- **The data model differs from § 2's sketch, and keeps what exists:**
  - *A statement keeps one home factor*, its extended one (`module_items.factor_id`), which is
    what every reader already read. What is new is membership: `module_factor_items` says which
    statements a factor is scored from. A module asked one way is backfilled with its own
    statements, so bygg, helse and barnehage read exactly as before (proved per row in
    `module_variants_invariants.sql` 2). The simplified factors F1–F8 are rows of their own, whose
    members are core statements of several extended factors. `factor_id` is not removed.
  - *No `standard` variant rows:* a module asked one way has no row in `module_variants`, and
    everything reads as before when there is none.
  - *`survey_modules` is `round_modules`,* and `enabled_factor_keys` is `factor_keys`. A round's
    `item_ids` for a module in variants are derived by the database
    (`app.round_module_fill_variant`) from its variant and factors, never sent: the 24 core
    statements are always among them, and fewer extended factors than the minimum are refused.
    Clients cannot write the two columns. A puls asks the re-measure statements it is given and
    has no variant.
  - *A factor's index* for a module in variants is reported only where every one of its statements
    was asked (§ 2, «Beregning»). An extended factor that is not chosen is therefore never scored
    from its one core statement. The extended set reports F1–F8 alongside, marked `comparable`. A
    puls reports a core statement under its simplified factor and any other under its extended one.
  - *A module asked one way keeps 0088's rule:* its factor is scored over the statements asked.
- **The module file is the handoff's, in the repository's shape.** The fifteen extended factors are
  `factors`, every statement in full. `variants[0]` regroups the core statements, by code, into
  F1–F8 with their own suggestions; `variants[1]` holds the extended set's rules. Every text is
  carried over verbatim (the conversion checks all 254 strings).
  - The brief asks for a help line under KK-TG-1 (§ 6.2); it is in the file as `help` and shown under
    the statement.
  - `merge_rule` on a segment stays in the file but is not parsed, as before. Parsing it would have
    moved the published barnehage og skole module's content hash.
  - Codes run to `-5`, and a count question may carry a fourth answer. The fourth, «Jobber ikke fast
    hjemmefra», is stored as `ikke_aktuelt` and kept out of the share (§ 3.3).
- **The choice is the organisation's, in Spørsmålssett, not per round** (§ 3.2 puts it in «Ny
  måling»). It follows the wording choice (0083): a standing choice, applied to the planned
  grunnlinjer and taken by every new one. Måleoppsett shows the round's variant and leaves the
  factor toggles out for such a module. The card offers Forenklet and Utvidet, then the extended
  factors as checkboxes, with counts worked out as they are ticked (about eight seconds a
  statement). It refuses fewer than eight, as the database does.
- **Statements of a module in variants cannot be left out one by one** (0088 answers
  `not_available`). The core statements are locked, and factors are the unit. A respondent still
  has «Ikke relevant for meg».
- **«Foreløpig»** shows wherever a module's file says provisional: kunnskap og kontor, and
  barnehage og skole. It appears in Spørsmålssett, next to every risk colour in results with the
  help text, on the page's preview and on its question page. `validation_status` is stored and
  frozen with the rest of a published module. For barnehage og skole, published on the hosted
  project, 0089 sets it once, by content hash, before the freeze covers the column.
- **The pages.** /kunnskap-og-kontor follows the template. The preview, the overview and the loop
  use the simplified set, and the overview gives both sets' figures. The question page lists the
  extended set with the core statements marked, and «Vis bare forenklet» shows exactly the 24. A
  link to an F factor opens the simplified view.
  - The page is not launched: the law items are unreviewed, and the page is visible only with
    `?forhandsvis=1`.
  - The brief's answer about home workers claimed office statements hidden by work form. That is
    not built, so the answer says what is: «Ikke relevant for meg».
- **Not built:**
  - *The Bransje setting on the organisation* (§ 3.1). The suggestion comes from the registered
    NACE code, as for the other industries (58–66 and 68–74).
  - *The admin's status control* (§ 4).
  - *The front page block, menu, footer and sitemap entries* (§ 5).
  - *The report's variant footer* (§ 3.3).
  - *Hiding KK-FY-1/4/5 for those who work mainly at home* (§ 6.2): segments are not shipped
    (`module_segments` is off).
  - *Ordering statements within each factor* (§ 6.2): the module is shuffled as a whole, as the
    other modules are.
  - *Handel.*
  - *The module's texts in the survey languages:* its factor names and help line join the catalogue
    once it is published.
- **Tests:**
  - `module_variants_invariants.sql`, 13 rows. It covers:
    - RLS, and the backfill;
    - the module as seeded;
    - the freeze;
    - derived statements;
    - the column privilege;
    - the write path's refusals;
    - the extended set;
    - the database's own minimum;
    - the same simplified index both ways on the same answers;
    - «ikke aktuelt» out of the share;
    - no statement choice.
  - `write_invariants.sql` 17 lists the two new registry tables among those anon may read.
  - `tests/unit/module-variants.test.ts`: the file and the § 7.2 rules.
  - Verified in the browser on the QA stack (Lumio, NACE 62.010, piloting the draft):
    - Spørsmålssett: the variant, the factor picker, its minimum, and the counts 59 and 62;
    - the page and its switch: 62 statements, and exactly 24 with «Vis bare forenklet»;
    - `respond_form` in both variants.

## D-138 — Handel: the module, a count question's own answers, and its page (0090)

Tor, 2026-09-27: "bygg resten også, start på handel". From the handoff's bransje-handel.md. The
module is asked one way, eight factors of three, like bygg and helse.

- **HA-T-2's third answer is «Jobber aldri alene», not «Vet ikke»,** and the brief says it «teller
  ikke med i andelen» (§ 5).
  - Count answers were positional: ja, nei, vet_ikke, then 0089's ikke_aktuelt. The option would
    have been stored as «vet ikke» and counted in the share.
  - A count question may now name the answer each option is stored as (`answer_keys` in the file,
    `module_items.answer_keys` in 0090). HA-T-2's are ja, nei, ikke_aktuelt, and 0089 already
    keeps ikke_aktuelt out of the share.
  - Every reader goes by the key: the form sends it, the write path accepts only the question's own
    keys, and the totals return them. Resultater names the excluded option under the bar. The
    report writes «Ja: … Nei: … Av … svar» with no «Vet ikke» where the question offers none.
- **HA-T-2 belongs with «Alene på vakt»** (§ 6.5, «kontroller at HA-T-2 ikke vises når faktoren er
  av»).
  - A count question may name the factor it is asked with (`asked_with`). It is asked only where
    one of that factor's statements is: in the form, in the write path, in the totals and in the
    leader's preview. So switching the factor off in Måleoppsett (`module_factor_toggles`) takes
    the question away too.
- **The two fields are the only additions to the handoff's file.** Every text is carried over
  verbatim. The fields are optional and absent in every other file, so no other module's content
  hash moved (checked: barnehage 7c3bfaf54c38, bygg fd6d9da1aa3b, helse 0ca1bfee9c8b, kunnskap og
  kontor d21d2bd0db83).
- **The page is the brief's § 2, in the repository's page type.**
  - `law` becomes the template's law block. Its heading and intro follow the other industries'.
  - «Følelsene i kundemøtet» points at the core factor Emosjonelle krav, statements 1–3.
  - The loop example is the brief's. Its steps, the overview's closing note and the question page's
    words follow the other industries', in this one's words.
  - The page is not launched: the module is a provisional draft and the six law items are
    unreviewed. One item, on lone work, names no paragraph («hjemmel verifiseres»), as the brief
    does. The page shows only with `?forhandsvis=1`.
  - `card` and `sortOrder` belong to the front page's industry block (§ 6 of innstillinger-og-
    forside.md). They are taken up there.
- **The preview's warehouse column** shows «–» for «Alene på vakt» and «Grenser mot kunder», and
  the brief's footnote says they were not asked there. As on /helse-og-omsorg (D-122), the two rows
  and that sentence depend on `module_factor_toggles`.
  - Factor toggles are per round, not per group. Before that flag ships to production, the
    sentence needs rewording for both pages, or the example needs a round without those factors.
- **Not built:**
  - *Merging small segment categories* (`merge_rule`, § 3): segments are not shipped
    (`module_segments` is off). The rule stays in the file, unparsed.
  - *The end-to-end test with a 47.110 organisation* (§ 6.5). Its parts are covered separately:
    - the suggestion by NACE is a unit test;
    - the factor switched off and the question gone, «vet ikke» refused and «Jobber aldri alene»
      out of the share are `count_answer_keys_invariants.sql`;
    - the form, results and report were checked in the browser on the QA stack.
  - *The module's texts in the survey languages* (§ 5): they join the catalogue once the module is
    published.
- **Tests:**
  - `count_answer_keys_invariants.sql`, 7 rows. It covers:
    - handel as seeded;
    - the database's refusals;
    - the form with and without the factor;
    - what the write path takes;
    - the share;
    - the freeze;
    - rollback.
  - `tests/unit/module-handel.test.ts`: the file, the schema's rules for the two fields, and NACE
    46 and 47.
  - Verified in the browser on the QA stack, with Lumio piloting the draft on its open round (rows
    removed afterwards):
    - /handel and its question page at 1280 and 390;
    - the respondent screen for HA-T-2 at 390, and with «Alene på vakt» off, HA-T-2 is gone;
    - Resultater: «Ja: 2 · Nei: 3 · 5 svar, «Jobber aldri alene» er holdt utenfor andelen»;
    - the report line.

## D-139 — «Bransje» on the organisation (0091)

Tor, 2026-09-27: "bygg resten også". innstillinger-og-forside.md § 3.1.

- **Oppsett › Selskap has a «Bransje» section.** It sits at the foot of the right column, in that
  column's card form: an eyebrow heading, the brief's help text, «Registrert næring», «Foreslått
  bransje», and the settings chips for «Ingen bransjemodul» and the five industries.
  - The design bundle has no such section, since it predates the modules.
  - In the left column it pushed the page down, losing the claimed tile 2000:0. In the right column
    it covers only empty background. One claimed tile of 15-oppsett-selskap, 1300:960, is now the
    section and is no longer claimed; every other claim holds.
- **What is stored differs from the brief's two fields, and keeps what they are for.**
  - `industry_source` is null when nothing is chosen, `brreg` when the organisation chooses what its
    code suggests, and `manual` otherwise.
  - Following the code (null or `brreg`) stores no industry, so nothing goes stale. The industry is
    worked out from the NACE code each time.
  - A manual choice stores `industry_key` (null is «Ingen bransjemodul») and `industry_suggested`,
    the code's suggestion when the choice was made. When a later Brønnøysund update suggests
    something else, the section shows the brief's notice with «Bytt» and «Behold». «Behold»
    records the new suggestion, so the notice is not shown again.
  - The slugs are checked by zod at the one write path, not by the database, so a new industry
    stays a registry entry.
- **Where it is used:** Målinger › Spørsmålssett and Måleoppsett suggest the chosen industry's
  module in place of the NACE code's.
- **The wording (barnehage, skole, begge) is not repeated here.** It is chosen per module in
  Spørsmålssett, suggested from the code, where 0083 put it. A second control would be a second
  truth.
- **Order:** the chips follow the registry's `sortOrder` (§ 6: handel, kontor, bygg, barnehage og
  skole, helse).
- **Tests:**
  - `org_industry_invariants.sql`, 3 rows: only a daglig leder writes; following the code names
    nothing; a slug has the registry's shape.
  - `tests/unit/industry-setting.test.ts`.
  - Verified in the browser on the QA stack. The automatic state, a manual choice, then a simulated
    code change to 47.110: the notice appeared and «Behold» cleared it. After a change to 86.101,
    «Bytt» stored `brreg`. With a manual «Bygg og anlegg», Spørsmålssett read «Foreslått for bygg
    og anlegg».

## D-140 — The validation status in the admin, and the report's footer (0092)

Tor, 2026-09-27: "bygg resten også". innstillinger-og-forside.md § 3.3 and § 4.

- **admin › Moduler:**
  - Every version shows its validation status («Foreløpig», «Validert» or «Ikke oppgitt») and the
    last decision, with its date, reason and report link.
  - A super-admin marks a version «Validert», which needs an https link to the validation report
    and a reason. They can take it back to «Foreløpig», which needs a reason.
  - A new card lists the variants: code, version, factors, statements, minimum, off by default,
    and rounds.
  - Use by industry code was already there.
- **The freeze gives way for this one column only.** 0089 made the status part of what a
  published version says. The brief wants it moved later, by evidence, so `module_frozen` lets
  `validation_status` change only inside `admin_module_set_validation`. That function sets a
  transaction-local flag. Clients have no update privilege on the registry, so no client can use
  the flag. The text and the content hash stay frozen, and a reseed never undoes a decision.
- **Every decision is kept** in `app.module_validation_log`, append-only, with RLS on, no policy
  and no grant. Each decision is also audited as `module.validate` or `module.provisional`.
- **The public pages keep the module file's status.** They are built from the file, not from the
  database, so a page says «Foreløpig» until the next version of the file says otherwise.
  Spørsmålssett, results and the report follow the decision. The admin's note says so.
- **The report's footer** names the variant asked and says «foreløpig» where the module is, per
  § 3.3: «Kunnskap og kontor, utvidet (KK-U v1.0), foreløpig». A module asked one way keeps «{navn}
  v{versjon}».
- **Not built:** hiding KK-FY-1/4/5 for those who work mainly at home (bransje-kunnskap-og-kontor.md
  § 6.2). It hangs on the `arbeidssted` segment, and segments are not shipped (`module_segments` is
  off).
- **Tests:** `module_validation_invariants.sql`, 7 rows. It covers:
  - the log's RLS;
  - who may decide;
  - what a decision takes;
  - the decision logged and audited;
  - nothing else moves the status, and a logged decision cannot change;
  - the list with kontor's two variants of 24 and 62;
  - rollback.
  - The admin page itself was not opened in the browser. The QA stack has no platform admin with a
    second factor. What it renders is `admin_modules`, proved in rows 4–6, and the page and the form
    pass the type check and lint.
  - The report footer was checked on the QA stack, with kontor in variant utvidet on a closed round:
    «Utarbeidet i Orgpuls · Kunnskap og kontor, utvidet (KK-U v1.0), foreløpig».

## D-141 — The industries on the site: registry order, «Ny», footer and /bruksomrader

Tor, 2026-09-27: "bygg resten også". innstillinger-og-forside.md § 5 and § 6.

- **Most of § 5 existed** before this brief, from Tor's own requests:
  - the start page's industry block and /bransjer (D-125);
  - the menu's «Bransjer» group (D-129);
  - the sitemap's industry and question pages, once launched.
  The brief's block («Bygget for arbeidsplassen deres», with its own ingress and line under the
  cards) would be a second block beside the first. The first stays, and gets what the brief adds:
  - Handel and kontor are among the cards, with the brief's card texts. Like every card, they are
    shown only once their page is launched.
  - The cards, the menu, the footer column and the sitemap follow the registry's `sortOrder`.
  - A card says «Ny» until its page's `card.newUntil`. The date is set when the page launches,
    90 days on (§ 9 decision 2). The build refuses a value that is not an ISO date, so the brief's
    placeholder cannot ship.
  - `IndustryCards` is the start page's cards, now one component.
- **The footer's «Bransjer» column and /bruksomrader's industry cards are behind
  `home_industries_block`**, the brief's own flag, off «til alle fem sider er ute». Both change
  pages the site's design draws: its footer has four columns, and /bruksomrader has no such
  section. The flag is on in QA, and both were checked there: a fifth column after
  «Bruksområder», and the cards above the use cases.
- **Unchanged:** the front page's metadata, and en.orgpuls.com (§ 5.5).

## D-142 — The CRM pipeline: stages as data, moved by campaigns, follow-ups, a person as sender (0093)

Tor, 2026-09-27: "The admin crm must have phases, so we can send a email through a campaign, move it
to the next stage and have other stages. Research best practice …". The research is in
docs/implementation/crm-conversion.md.

- **Stages are data** (`app.crm_stages`) instead of 0056's fixed list.
  - The eight stages are kept, and «Nurture» (parked) is added for companies a sequence did not
    reach.
  - admin › CRM › Stages adds, renames, reorders and archives stages. A stage in use cannot be
    archived.
  - Trial and customer follow the plan (`managed`) and are never set by hand or by a campaign.
  - `crm_companies.stage` is a foreign key to the stages. Segment filters, the company form and
    every list read the stages from the table.
- **A campaign has a place in the pipeline** (`admin_crm_campaign_pipeline`, a draft only). The
  editor's own save (0059) is untouched.
  - *Send to companies in* a stage, alone or narrowing a list or segment.
  - *When sent, move the company to* a stage. This happens when the mail has gone, forward only,
    from an open stage, never out of a managed one, and is logged as an activity.
  - *Send as* a person.
  - *Follow-up of* another campaign after N days. It goes only to those the first mail reached who
    have not moved since and have not unsubscribed or bounced. It takes the first mail's list and
    language, so the same people stay reachable on the same basis.
- **What moves a company, and what never does:**
  - moves it: a mail that has gone, «Reply received» logged by a person (to
    `crm_settings.reply_stage`, «Engaged» by default), and a person's move, one company or many;
  - never moves it: an open or a click. An open is not evidence (X-063), and a click may be a mail
    scanner's. `crm_stages_invariants.sql` 8 proves it.
- **Senders are people** (`app.crm_senders`): a name, a from address, a reply-to inbox and a
  signature.
  - The dispatcher sends from the person's address only when it is on the marketing domain Brevo
    has authenticated. Any other domain fails the send for good (`sender_domain`) rather than going
    out from an address that would fail authentication.
  - Answers go to the person's inbox, not to support.
  - The signature falls back to the sender's. The preview uses the same fallback.
  - 0093 is applied on hosted (2026-09-27), and the dispatcher that honours the job's `sender` was
    deployed there on 2026-09-28 (orgpuls-dispatch version 35, X-078).
- **Prospects:** tick companies and move them together, to a stage or each to its next one. A
  customer organisation is left where it is and counted. The company page has «Move to the next
  stage», and «Reply received» among the activities.
- **Nothing new reaches anyone.** Every audience still passes `crm_mailable` or the list's rule, so
  named people are mailed only with consent (markedsføringsloven § 15), as before.
- **Not built:**
  - *Reading replies automatically.* The marketing subdomain has no inbox, and replies go to the
    sender's own. A person logs «Reply received». Brevo's inbound parsing could do this later.
  - *Scheduling a follow-up by itself.* Its audience is computed when it is sent, so it is scheduled
    like any campaign. It then reaches only those whose first mail is old enough.
  - *Changing tracking.* Per-recipient opens and clicks stay as D-101 left them. Whether they need
    consent is an open decision (crm-conversion.md § 8).
- **Fixed on the way:** a company with an industry name but no code showed «(null)».
- **Tests:**
  - `crm_stages_invariants.sql`, 10 rows. It covers:
    - RLS;
    - the seeded stages and the foreign key;
    - managing stages;
    - a stage campaign sent as Tor, which moves the companies whose mail went and not the one whose
      failed;
    - a reply moving forward, never back;
    - a follow-up reaching only the one who has not moved, and parking it;
    - «next stage» for many, leaving the plan's company;
    - opens and clicks moving no one;
    - roles;
    - rollback.
  - The existing CRM, lifecycle, write and admin suites pass unchanged.
  - Verified in the browser on the QA stack, as a local marketing admin (MFA off, local only):
    - a sender added;
    - two companies moved together;
    - a campaign's pipeline set and kept;
    - after a simulated send, the company in «Contacted» with the campaign named in its log;
    - «Reply received» moving it to «Engaged».

## D-143 — A demo copy per visitor, behind a login link (0094)

X-077. `/demo` takes a work address and an unticked consent box. The link from Auth lands on
`/auth/confirm`, which sends a demo visitor to `/demo/start`, which calls `demo_enter`.

- **The copy** (`app.demo_build`): every table in `app.demo_copy_plan`, in its order.
  - org_id becomes the copy's; a user becomes the visitor; the invitation and conversation hashes are
    new and random; every other uuid gets the copy's own id where the build's id map knows it. Modules,
    factors and statements are shared and keep theirs.
  - A table that holds an organisation's data and is not in the plan fails `demo_invariants.sql` 2,
    so the plan cannot fall behind the schema.
  - Rounds go in open, take their questions, audience, modules and pinned wording, then their own
    state, before any response is copied. `round_module_ok` refuses modules on an answered or closed
    round even to the database's own functions. A round opened this way pins today's approved
    wording; the template's pins then meet it and are skipped.
  - The hosted template (12 rounds, 358 responses, 6,498 answers) copies in about 0.3 s.
- **What a copy is not.**
  - No org.nr: the column is unique, and a sandbox is no registered undertaking. The report prints
    none.
  - No billing row: access reads as `trial`, and KPIs, account health and the admin's organisation
    list, which all join billing, never see it.
  - Signups, the funnel, acquisition and `crm_sync` leave demos out explicitly
    (0050/0062/0063/0056's definitions with one condition added).
- **Nothing leaves.**
  - Name, org.nr, mail and SMS switches are locked by a trigger, because 0001 lets a daglig leder
    update the row directly.
  - QR codes, DPA signatures, invitations and a copy's billing row are refused.
  - The outbox drops a demo's rows, so the year wheel and reminders queue nothing.
  - The actions that meet a refusal say «denied», as they do for any refused write. The banner says
    beforehand that nothing is sent. Per-action wording was not added.
- **Reset and expiry.**
  - `demo_enter` builds a new copy when the last is 24 hours old (`demo_settings.reset_hours`), and
    «Tilbakestill» does so at once: the new copy first, then the old one is dropped. The sandbox row
    cascades with its organisation.
  - `app.demo_expire`, daily at 03:20 UTC, deletes copies and logins idle for 14 days
    (`idle_days`), logins from a link never opened after two days, and requests after 30 days.
- **Requests.**
  - Three links a day per address, five per network (the analytics' daily hash; the address is never
    stored), 20 per non-free-mail domain, 300 a day in all.
  - Throwaway domains are refused.
  - The answer is the same for an address with an account.
- **Leaving.** «Opprett egen konto» deletes the copy and the login, signs out and opens /registrer.
  `create_organisation` refuses anybody who is already a member of something, a demo included.
- **The lead.** Once the address is proved, it becomes a CRM contact with source `demo` and tag
  `demo`: basis `consent` with the box ticked, `none` without. An existing contact only ever gains
  consent.
- **The template** is the organisation marked `template` in `app.demo_orgs`: Demobedriften AS, marked
  by the migration on hosted and by the generator elsewhere. It has no members; the shared login
  demo@orgpuls.com is retired. Its synced CRM contact (source `user`, basis `none`) was deleted on
  hosted when 0094 was applied: a contact for a login without a membership fails
  `crm_invariants` 4.
- **No design exists** for /demo, the banner or the stamp.
  - /demo is the newsletter's card.
  - The banner is drawn as AccessNotice's lines are, and is hidden in print.
  - The stamp is a fixed element, so it repeats on every printed page.
  - None of them renders outside a demo, so the pixel baselines are untouched.
- **Verified locally**, end to end in the browser: request, link, copy, banner, stamped report (screen
  and print), «Tilbakestill», «Opprett egen konto». The local stack has no mail container, so the link
  was minted with Auth's admin API; hosted Auth sends it through the existing hook, which renders
  `magiclink`.
- **Tests:** `demo_invariants.sql`, 15 rows. `trends_invariants` 4 now counts signups without demos;
  every other suite is unchanged.


## D-144 — «Se demo» in the site header

Tor, 2026-09-28: "Add a Demo link to the header." The design's header has no demo, so the link is
drawn as the site's secondary button (border ink on sf, as «Se plattformen →»), between «Logg inn»
and «Kom i gang», with «See the demo» on en.orgpuls.com. The phone menu lists it first of the
three account links.

- **Where it shows:** under 640 px it is in the phone menu. From 640 to 1023 px it is in the
  header, where the top nav is folded into «Meny». From 1180 px up it is in the header too.
- **Where it does not:** between 1024 and 1179 px the full menu and four controls do not fit one
  row. The header broke to two rows at 1024 in the browser, so the button waits there rather
  than wrap the menu.
- **Pixel baselines:** the site baselines (site-pixel.mjs) predate the button, so every page's
  top band differs by its width; that script is not a CI gate and already fails by design (D-88).

## D-145 — Own questions asked, open answers read, names masked (0095)

The gap analysis (docs/implementation/gap-analyse-soundings.md, P0-1, P0-2, P0-3, P1-8) found three
things the product said and did not do. Tor, 2026-09-28: "start på P0 og P1".

- **Own questions are asked.** Måleoppsett's «5 · Egne spørsmål» wrote to `app.org_questions` and
  nothing ever put one on a round or in a form. Now a question belongs to the round it is written
  on (`add_round_question`, one statement), the cap of five is per round, and `respond_form` asks
  them after the statements and before the questions outside the index.
  - **The type chip is the design's** (v3 bundle 2133, 5789-5809): «Skala 1–5» on sbg, «Fritekst»
    on mint, a button that switches. «＋ Legg til spørsmål» starts as «Skala 1–5»; the suggestion
    «Hva bør vi slutte med?» starts as «Fritekst», as the design's rule gives it. The list row keeps
    the text as text rather than the design's always-editable input: a question's words are fixed
    once a round has asked it (trigger `org_question_fixed`), and before that it is removed and
    written again.
  - **The note is the design's two notes**: what own questions are for with none, and «rapporteres
    for seg og regnes ikke inn i indeksen» once there are some.
  - **The scale** is QPS Nordic's extent scale, «I svært liten grad» to «I svært stor grad», since
    the suggestions are questions, not statements, and the agreement scale does not answer
    «Vet du …?». The pill above a question reads «Fra {virksomheten}».
  - **Not translated.** The words are the organisation's; an English respondent reads them as
    written.
  - **Results**: a card under Resultater, beside the module's and drawn like its count card: the
    share «i stor eller svært stor grad» as a bar, the mean and n. Whole organisation only, only at
    k answers, never per group; daglig leder and verneombud (`results_own_questions`).
- **Open answers are read.** The open field and «Fritekst» questions are listed under Kommentarer
  in a section of their own, «Svar i fritekst», for the round in the address or the latest closed.
  Daglig leder only: a verneombud reads no single comment (0022), and an avdelingsleder's scope is
  groups, which these texts do not have. Nothing below k responses; no group, no hour, and in an
  order that is not the order of writing. They cannot be answered. The design has no such section;
  it is drawn in the Temaer card's form.
- **Names are masked.** Every text an employee wrote leaves the database with each capitalised
  word of an employee's name, each department's name and each location's name replaced
  (`app.mask_patterns`, `app.mask_apply`), and is drawn «[navn]», «[avdeling]», «[sted]». That
  covers the open answers and every comment and reply in a thread (`conversations`), and so the
  quote in Resultater and «Venter på svar» on Oversikt. Deterministic, no AI. Its limits: a name
  of three letters or fewer is matched only with its capital («Per», not «per uke»); a department
  whose name is a word («Lager») is masked wherever the word stands alone; a nickname, a role
  («den nye sjefen») or a detail is not a name and is not masked. What the writer reads of their
  own thread is not masked.
- **The promise is changed.** «Grupperes etter tema og sjekkes for gjenkjennelige detaljer» (the
  design's words, `extra.apent_felt.note`, `respond.openNote`) promised a check nobody did. It now
  says what is done: names of colleagues, departments and places are removed before anyone reads
  it, and not to write what could only be about one person.
- **English respondents**: the respondent pages' strings changed, so their hash moved
  (lib/i18n/respondent-ui.json) and English is offered to respondents again once it is approved in
  admin › Legal review.
- **The demo** (scripts/seed/demo-org.mjs): the 2026 grunnlinje's two own questions have answers,
  and six open-field texts name colleagues, departments and a location, so the masking shows.

## D-146 — «Forleng ved lav svarprosent» extends (0096)

Gap analysis P0-4. Årshjulet's switch «Forleng tre dager hvis svarprosenten er under 50 — Én gang
per runde. Ny påminnelse følger med.» was stored and never read. The scheduler now reads it where it
closes a round: with fewer responses than half the invitations (the rate every screen shows), the
round stays open three days more, once (`rounds.extended_at`), the unanswered links last as long,
and everyone who has not answered is reminded at once. The reminder is their one reminder row,
queued again, as request_link does (0076). Nothing on the screen changed; the words are the design's.

The other half of P0-4, «Varsle verneombud når en frist ryker», is still stored and not acted on.
It needs the overdue-measure notice (P1-5), which comes with its own mail kind.

## D-147 — A baseline open for two weeks; «Effekt av tiltakene» from the second cycle (0097)

Gap analysis P1-9 and P1-7.

- **Two weeks for a grunnlinje.** The product's own standard for a grunnlinje is 14 days (a puls
  keeps 7): the column default, `survey_defaults_of`'s fallback, a grunnlinje the wheel plans for
  an organisation with no saved standard, and `plan_first_round`. A standard an organisation saved
  is kept. «Anbefalt» in Målinger › Innstillinger now marks 14. Bruksområder's «Årlig
  kartlegging» said «runden lukkes etter sju dager» and now says fourteen; Plattform's cascade
  («Resultat … dag 7») still holds for a puls and is left.
- **«Tiltakene etter forrige kartlegging har hatt positiv effekt på arbeidsplassen min».** A
  question outside the index (`tiltak_effekt`, agreement scale), as data: a registry row, five
  options, message keys. A grunnlinje asks it when the organisation has an earlier grunnlinje
  that closed. It is not one of the standard's extras: applying, saving or resetting the standard
  never adds or removes it, and a round that asks it does not count as edited by hand
  (`app.round_extras` leaves it out). Måleoppsett lists it with the round's extras, so a leader
  can leave it out of one round. Its result is a card in Resultater («Effekt av tiltakene»): the
  share who agree and the mean, whole organisation only, at k answers. The respondent meets it
  before the open field.
- **Pixel gate:** Målinger › Spørsmålssett lists the new question under «Utenfor indeksen», which
  moves the module block below it by one row; state 06's claims were re-recorded for that alone.
- **English respondents:** the question's labels are respondent strings, so the English approval
  (admin › Legal review) is needed again, as for D-145.

## D-148 — «Alle ansatte» in the notice ladder by default

Gap analysis P1-2. The design's own ladder (the fixture's) tells everyone a day before; the
Veiviser's default ladder left them out. A new wheel's ladder now has «Alle ansatte» a day before,
which also gives them the notice when results are ready (wheel_tick queues «resultat» per row).
Årshjulet gets a fifth switch in «Unntak og eskalering», in the design's toggle form:
«Varsle alle ansatte før og etter hver runde». Existing wheels are not changed: that would start
mailing everyone at organisations that never chose it.

## D-149 — A better invitation; overdue measures and a lagging department told about (0098, 0099)

Gap analysis P1-1, P1-5, P1-6 and the rest of P0-4.

- **The invitation (P1-1)** says how long it takes as a number («Det tar omtrent 4 minutter», about
  seven seconds an item, `app.round_minutes`), carries the daglig leder's own greeting with their
  name under it where one is written (Målinger › Innstillinger › «Hilsen i invitasjonen», a card
  in Innstillinger's own form; `set_invite_greeting`, daglig leder only, 600 characters), and
  promises that everyone hears the results only where the ladder tells them (0097's «alle
  ansatte» row). Reminders say none of it. **Not done: a logo or image.** No organisation has a
  logo in the schema, and an image we chose would be decoration presented as theirs; the mail
  keeps the Orgpuls wordmark it had.
- **Overdue measures (P1-5, P0-4).** Every Monday 05:10 UTC, each owner of a measure that is past
  its date while decided or under way — or has no date and has stood still for 30 days — gets one
  mail listing their measures; the verneombud gets a copy listing them all, unless Årshjulet's
  «Varsle verneombud når en frist ryker» is off. Nothing twice within six days; a notice whose
  measures were finished before it went is dropped. The mail carries a leader's titles and dates,
  never anything a respondent wrote; the link to Tiltak only for someone who can sign in. A
  measure belongs to no round, so `outbox.round_id` may be null for this kind alone.
- **A department behind (P1-6).** Once half an open round's time has gone, the daglig leder is
  told once if a department the participation view shows (at least k invited) answers ten points
  or more below the whole round. The mail names no department and holds no figure; it says what
  can be done (a reminder, a meeting, more time) and points to Målinger.
- **English and survey languages:** the invitation's lead lost «Det tar noen få minutter» for the
  number, so a survey language's translated invitation is used again once the new keys are
  translated (the dispatcher falls back to bokmål until then).

## D-150 — The respondent flow by factor, with a draft kept in the browser (P1-4)

Gap analysis P1-4. `components/respond/RespondFlow.tsx`.

- **Pages by factor.** A factor's statements share a page — the core survey's three, a module
  factor's own — and every other question (the questions outside the index, the org's own, the
  open field) has a page of its own. The order inside a page is still `respond_form`'s seeded
  shuffle (D-09); only the grouping is new. Statements are numbered from the ordinals the
  database holds, as before.
- **An intro page first.** «Før du starter» with the four `respond.promise1–4` texts that were
  in the message files and never rendered, the k the organisation actually uses in the second,
  the time and a Start button. The bundle's respondent screen (inside a phone, D-09) has no such
  page; the texts are the product's own, not new claims.
- **Time left** is counted as `app.round_minutes` counts an invitation (0099, D-149): seven
  seconds a question, rounded up, never below one minute. It is the same estimate the invitation
  prints, not a measurement.
- **The draft stays in the browser.** `localStorage`, under a key derived from a SHA-256 of the
  token (the token itself is not stored), holding the choices and the page only — never a
  comment or any other free text — for at most 30 days, removed on submit. Nothing reaches the
  server before submit, so no partial answer can be linked to an invitation. A restored draft
  says so.
- **Back, and the keyboard.** Every page but the first has Tilbake. Digits 1–5 answer the first
  unanswered statement on the page, Enter goes on when the page is complete; the hint says so.
  Each statement is a `fieldset` with its `legend`, so a screen reader reads it as one question.
- **English and survey languages:** the new respondent keys move `lib/i18n/respondent-ui.json`,
  so an English respondent sees bokmål until the respondent UI is approved again in admin ›
  Legal review; survey languages fall back the same way until the keys are translated.

## D-151 — «Dette sa dere, dette gjør vi»: a page per closed round for employees (0100, P1-3)

Gap analysis P1-3; the decision is X-081.

**Built.** `app.rounds.share_slug` (96 random bits, base64url) and `results_page` (on by
default). `public.round_page(slug)`, anon: the organisation, the round, invited and answered
(public.participation's totals), the whole organisation's index and each factor's under
results_summary's whole-house rule (k respondents, and k answers on every statement of a
factor), and the collective measures decided from the round, with factor, status and date.
`public.set_results_page` for the daglig leder. The route `/r/<slug>` (public, noindex), a card
under Resultater's workspace with the link, «Kopier lenken», «Åpne siden» and the switch, and the
link in the results notice to employees and in the next invitation (dispatch_claim's
`results_page`). `round_page_invariants.sql` proves nine rules.

**The design has no screen for it.** It is drawn from the respondent surface's own parts: the
column, the card, the section label, the risk pill, the step chip. No baseline exists to diff
against; nothing on a gated screen moved except Resultater, whose card sits below every
claimed region (the claims of states 07–11 and 19 lost the 17 tiles it now covers).

**Different from engagement-phases.md P3.1.**
- One link per round, not a token per invitee with a group (X-081), so there is no «Din gruppe».
- «Dette jobber vi med» lists the factors a measure was decided for. It is not a ranking the
  page makes itself; with no measure, the section is absent.
- A measure's owner is not shown, not even as a role: an employee record carries no role a page
  could name without naming the person.
- No mail when the page changes, and no per-view count (I3).

**Masking.** A measure's title passes through `app.mask_apply` with the name patterns only: a
person's name becomes «[navn]», while «Lager» stays, since a measure for a department is the
point of it. The fixture's employees are named after their departments («Prosjekt 2»), so
there «Prosjekt» is masked as a name; real registers hold real names.

**A sandbox's rounds** get links of their own (`demo_copy_table`), never the template's.

## D-152 — Bokmål and English in admin › Translations; auto-approve for development (0101)

Tor, 2026-09-28: bokmål and English in the admin, the questionnaire apart from the page texts,
JSON export and import for a translator, and an auto-approve switch for the development phase.
The decisions are X-082.

**Two tabs, seven languages.**
- *Questionnaire*: the core statements, the questions outside the index, the modules' questions.
  Bokmål is the source: shown, and exported for a proofreader, never imported (a change is a
  module version or a migration, since every translation is made from it). English and the survey
  languages are the translation registry (`app.item_translations`), which is where the survey page
  already reads English questions from; the existing workflow, export, import and approval apply,
  now limited to the tab's sections.
- *Pages*: for the survey languages, the survey pages and mails (the registry, as before). For
  bokmål and English, every other string in `messages/` — 6 398 in 46 areas — each replaceable by
  an override (`app.message_overrides`) that is shown once approved. Filtered by area, by state and
  by a search, 150 at a time.

**Overrides at runtime.** An approved override is laid over the files where messages are loaded
(`lib/i18n/request.ts`), in the dispatcher's and the Auth hook's mail catalogues, and in the legal
review's reading of the message texts, so an overridden legal text comes back there as changed.
Only a string the file has can be replaced: never a branch, never a new key. The read is
anonymous (`public.message_overrides`, approved text only), cached five minutes and dropped at
once on every admin write. With none, nothing changes: every gated screen renders from the files.

**The import checks.** A page package is the same «orgpuls-translations» v1 file (JSON or XLIFF),
keyed `msg:<path>`. Each text must parse as the message it replaces and keep its placeholders and
tags; a question, an unknown key, a broken message or a lost placeholder is refused; a text equal
to the file's own removes the override; a package's entries for the other tab are counted and left
out.

**Auto-approve.** One switch (`app.platform_settings.auto_approve`), super-admin, audited. On:
everything waiting is approved at once, and every registry row and override written while it is on
is approved by trigger; a survey page and a mail treat this build's page strings as approved
(`round_locale_state` «auto»); the legal texts and page-string hashes this build shows are recorded
when the legal review or the translations page is opened. Every such approval is marked
(`approved_auto`, `legal_approvals.auto`) and shown as «Auto», so the record never reads as a
person's reading. A qa-fixture text is still approved only on the QA stack. The admin shows a
banner on every page while it is on. It does not switch language flags or pilots on.

**What it cannot see.** The survey-only languages compare their page strings with the bokmål this
build was made from (`survey-source.json`), so a bokmål page string replaced at runtime does not
mark their translations out of date until the next build regenerates it; the admin's own view does
read the replaced bokmål and shows them as out of date at once.

`auto_approve_invariants.sql` proves seven rules; `tests/unit/platform-package.test.ts` eight.

---

## D-153 — Årshjulet's «N dager før» and the § 9-2 evaluation cadence now do something (0103, audit A-01, A-02)

**Found by** the wiring audit (docs/audits/2026-09-28-wiring.md): two settings saved and shown back
to the person who wrote them, read by nothing else.

**A-01 — «Hvem varsles først · 7 / 14 / 21 dager før».** The chip wrote `year_wheels.notify_lead_days`;
`wheel_tick` sends each rung of the ladder at its own `wheel_notifications.lead_days`. The design
ties the chip to the first three rungs — verneombud, tillitsvalgte and daglig leder print
«{lead} dager før», avdelingsledere 7 and alle ansatte 1 (bundle line 3995) — and so does the fixture.
A trigger (`year_wheels_lead_sync`) now moves those three rows when the value changes, so what the
ladder prints is what is sent, whoever writes the wheel. Saving the wheel with the same value (a
cadence, a switch) leaves the ladder alone.

*The two designs disagree, and the chip shows the truth.* The v3 Veiviser writes «Verneombudet
varsles to dager før» (2 days), a value the Årshjul chips (7/14/21) do not offer. The chip is
therefore selected from the verneombud row's own lead, not from the column: after the Veiviser,
no chip is selected and the ladder says «2 dager før», which is what will be sent; choosing a chip
moves the three rows to it.

**A-02 — «Evaluering av ordningen» (aml. § 9-2 tredje ledd).** The cadence (hver 6. måned / årlig /
etter hver runde) was printed in Måleoppsett's summary and nowhere else. Now:
- `app.evaluations` records that the ordning was evaluated, when and with whom (daglig leder or
  verneombud write; every member reads);
- `app.evaluation_due` says when the next is due: from the last evaluation, or from the first round
  that closed; six months, a year, or the next round's close. Nothing is due before a round has
  closed. The cadence is the one of the measurement whose round closed last;
- the report prints it in section 1 as «Evaluering av ordningen», where the design prints
  «Medvirkning», a block with no record behind it yet (D-18) — the cadence, the last evaluation
  and the due date, or that none is recorded and when it fell due;
- «Registrer til rapporten» has a third column to record one;
- every Monday, an organisation whose evaluation is due gets one reminder (`evaluering`) to the
  daglig leder, again after four weeks while it stays undone; a reminder claimed after one is
  recorded is dropped as resolved.

**Not in the design:** the report block's wording, the register's column and the mail. The report
is not in the per-region pixel claims, and its sheet already differs in height from the design
(D-18); the fixture prints «Evalueringen forfalt 15. september 2024», because it has closed rounds
and no evaluation — the real state, not a placeholder.

`evaluation_invariants.sql` proves ten rules; `tests/unit/mail.test.ts` the reminder's text.

---

## D-154 — The organisation's own logo (0104)

**Design:** Oppsett › Assistenten, «Hva står i toppen»: «Assistenten» or «Bedriftens logo — Deres
egen logo i toppen», a 96 px dashed field to drop it in, and the logo in the 30 px brand mark of
the header and the side rail (bundle v3 lines 34, 73, 3662-3695, 5223-5230, 6288). The Assistenten
tab was left out (D-32), and with it the only place the product could store a logo; P1-1 of the gap
analysis then asked for the logo in the invitation (D-149: «a logo in the mail needs an
organisation logo, which the product does not store yet»).

**Built:** a «Logo» card on Oppsett › Selskap with the design's «Hva står i toppen» choice, field and
hints. The first choice is «Orgpuls» (the mark), not «Assistenten»: the header carries the Orgpuls
mark, never the assistant's face (D-32). The logo stands:
- in the header's and the side rail's brand mark when «Bedriftens logo» is chosen (the design);
- whenever one is stored: at the head of every notice mail in place of the Orgpuls wordmark, beside
  the organisation's name in the survey, on the QR entry page and the round page «Dette sa dere,
  dette gjør vi», on the report's cover and on the QR poster (not in the design, which predates
  them; the card's lead says where it appears).

**How it is stored.** In the database (`app.org_logos`), not in Storage: it is served from the
application's own origin at `/logo/<key>`, so the page CSP's `img-src 'self'` holds and a mail can
carry the same address. The key is 32 hex characters of the SHA-256 of the organisation and the
bytes: a new logo is a new address (cached for a year, immutable), and an address cannot be
derived from an organisation's id. The type is read from the first bytes — PNG, JPEG or WebP — never
from what the browser says, and at most 256 KB. **No SVG**, where the design's hint says «PNG eller
SVG»: an SVG is a document that can carry script, and this one would be served from our own origin.
The hint says so. The route sends `nosniff` and `sandbox`.

**Who.** The daglig leder stores, removes and switches it (RPCs, refused for anyone else); members
read the row; anon reads an image by its exact address only (`public.org_logo`, allowlisted in the
audit). The survey's, the entry page's, the round page's and the dispatcher's definer functions
carry the address and nothing else about it; nothing about a respondent is in it or near it.
A demo copy brings no logo.

**No brand colour.** The design has none, so none was invented.

**Pixel gate.** The card lengthens Selskap's right column and moves the footer down: two footer
tiles of `15-oppsett-selskap` (1800:960, 2000:0) no longer land where the baseline has them. The
same screen passes on main's build against the same database; its claims were re-recorded for this
screen alone (`v3-run.mjs --only 15 --write`). Every other tile claim is unchanged.

`org_logo_invariants.sql` proves eight rules; `tests/unit/mail.test.ts` that a mail carries only an
address the database made.

---

## D-155 — Resultater's drill-down shows the factor's comments instead of «Foreslåtte tiltak»

**Design:** the drill-down on Resultater › Varmekart (v3 2466-2508) ends in «Foreslåtte tiltak»: the
factor's playbook with «Legg i plan».

**Built, at the owner's request (2026-09-28, X-084):** that block is replaced by «Kommentarer om
dette» — the three newest comments on the factor, masked as everywhere else, and «Se alle N
kommentarer om dette →» to Kommentarer. The playbook stays where the page already offers it, under
«Forslag basert på resultatene» below, with the same «Legg i plan».

**Always the whole organisation's (D2, X-039, kept by the owner).** A comment never travels with
its group: the list is the same whichever row is selected, and with a group selected the panel
says so («Kommentarer gjelder hele virksomheten. De vises aldri per gruppe …»). The owner was asked
whether to lift D2 for this panel and chose not to: a comment under «Kundeservice × Motstridende
krav» with nine answers is one of nine people, and what they write is often enough to recognise
them. With none on the factor: «Ingen har skrevet en kommentar om dette i denne målingen.»

**Pixel gate:** `07-resultater-varmekart` and `19-side-resultater` lose the tiles of the panel's
lower half (900:1200, and 1000:720 on 07). Re-recorded on 2026-09-30 with the bottom-row losses,
after reading each diff (X-098).

---

## D-156 — Engagement phase 2: «Siden sist», the thank-you, the pulse reason and the send preview

**Design:** none of it. The design's «Før du starter» has four promises and a start button; its
done screen is «Takk. Det tok fire minutter.» with the design's lead; Måleoppsett has six sections
and a summary. The copy comes from docs/implementation/engagement-phases.md § Phase 2, on the
decisions in X-085.

**Built (0105):**
- «Før du starter» gets a «Siden sist» box — at most three of the whole organisation's measures
  since the last grunnlinje, finished first, with a chip each and «Tiltakene ble valgt ut fra
  svarene dere ga i {måned år}» — or, on a first survey, a line saying so
  (`engagement_since_last`).
- The done screen says «Takk for svarene dine», when the results are shared with everyone (only
  where the ladder has an «alle ansatte» rung, since only then is the date kept), that the daglig
  leder and the verneombud see the same figures at the same time, the threshold, and what happens
  next (`engagement_thanks`). Flag off, it is the design's.
- A pulse's factor page gets «Spørres fordi dere jobber med: …» under the factor's heading
  (`engagement_pulse_reason`).
- The invitation's e-mail carries «Siden sist» (flag on in the dispatcher); the SMS does not (D-128).
- **Måleoppsett › Utsending** (daglig leder, until the round closes): the introduction, the day
  results are shared with everyone, and the invitation as it will read, rendered by the dispatcher's
  own `renderNotice` from `round_send_preview`. It sits under the six sections, not in the summary
  column: that column is sticky, and a card this tall would keep its end out of view until the page
  ends. The link in the preview is a placeholder («…»): it is personal and no one's is shown.
- **Resultater › Siden for de ansatte** says when the page opens to employees while that day is
  ahead, and hides «Åpne siden» until then (the page answers «not available» before it).

**Names in titles** are masked as on the employees' page: first and last name each become
«[navn]». **Departments and places** are not masked in these lists: a department's measures are not
listed at all.

**Pixel gate.** No v3 state draws Måleoppsett, the respondent flow or a flagged screen. The send
card lies below section 6 (baseline `11-plan-maleoppsett`), so nothing above it moves; on a closed
round, or for anyone but the daglig leder, the screen is unchanged.

`engagement_p2_invariants.sql` proves eleven rules; `tests/unit/mail.test.ts` the e-mail's block and
its absence from reminders and SMS; `qa/e2e/respondent-flow.spec.ts` runs the flow with the flags on.

---

## D-157 — Kommentarer without the tone chips; the drill-down says whose comments it shows

**Design:** Kommentarer (v3) gives each comment a tone chip («Negativ», «Blandet», «Positiv») and
each theme a tone, both from the answer the comment was written under.

**Built (0106, X-087):** no tone on a comment and none on a theme. The tone was the commenter's own
answer, coarsened, and `conversations` returned that answer with the comment. Next to the released
figure for everyone, a commenter's answer gives the non-commenters' answers by subtraction (audit
AUD-02: five respondents, four commenting, recovers the fifth's answer exactly). The answer no longer
leaves the database with a comment, so nothing on the screen can show it.

**The drill-down's comment note (AUD-09):** the daglig leder reads «Kommentarene gjelder hele
virksomheten …» as before; an avdelingsleder, whose comments are their own groups', reads
«Kommentarene gjelder gruppene du har tilgang til …»; a verneombud, who is not shown single comments
(journeys J6), reads «Enkeltkommentarer vises ikke for din rolle …» instead of being told nobody
commented.

**Pixel gate:** `12-kommentarer` loses the tone chips' tiles; the Resultater states lose D-155's
panel tiles. Both re-recorded on 2026-09-30 after the diffs were read (X-098).


---

## D-158 — Innsikt's headline and Rapport's scope come from the figures, not the design's scenario

**Design:** Innsikt opens with one sentence per role — «Dere er i rute», «Verksted trenger deg denne
uka», «To faktorer krever handling» — and Rapport's front matter says «Hele virksomheten · N ansatte».

**Built (X-088, audit AUD-32 and AUD-33):** the three sentences are the design's scenario, and were
printed to everyone: a Drift leader in an organisation without a Verksted was told Verksted needed
them, and a verneombud read «To faktorer» over «1 høy risiko». Now:

- **daglig leder** — «Dere er i rute» once the latest kartlegging is closed and risk-assessed;
  «Risikovurderingen gjenstår» when it is closed and not assessed; «Ingen kartlegging er ferdig ennå»
  before any.
- **verneombud** — the high-risk factors counted on the same page («{count} faktorer krever handling»,
  «Ingen faktorer krever handling» at 0).
- **avdelingsleder** — «{group} trenger deg denne uka» with the department `results_summary` names
  (`scope_label`), only when it has a high-risk factor; otherwise the verneombud's count sentence.

Rapport, for an avdelingsleder, whose `results_summary` is their department's (`scope: 'group'`),
is that department's report: the department's name where «Hele virksomheten» stood, the team index
line instead of the organisation's index and last year's column, and no «avdeling» chips (they could
only narrow it to itself). `?avdeling=` no longer shows the same page under another name.

**Pixel gate:** the fixture's daglig leder has a closed, assessed grunnlinje, so `02-innsikt-full`
reads «Dere er i rute» as before. 16 and 17 are not gated (D-77).

## D-159 — The CRM design and brief, built on the CRM that exists: what was built, and what was not

**Asked (Tor, 2026-09-29):** extend the admin CRM to a comprehensive SaaS CRM from the attached
research brief (SaaS_CRM_Research_Brief) and page (OrgPuls_CRM), with a Brønnøysund import of SMB
general managers, campaigns tracked per mail (sent, stage, opens), automatic resends after 7 days and
other best practice; segment the admin into content, CRM and customers, with a collapsible menu with
icons; in our design and layout.

**Built (X-091):**
- The admin shell: five sections (Overview, Customers, CRM and marketing, Content, Platform), each
  page with an icon in the product rail's tile, narrowing to icons (kept in a cookie), a drawer on a
  phone. The CRM's pages are menu entries; its tabs remain on a phone only.
- The general manager from Enhetsregisteret's roles API (0110): name and role only — the register's
  birth date is read past, never kept. It greets the company's role address through `{navn}`; the
  import tags a batch so a segment or campaign reaches it. A register import never joins a list:
  lists are opt-in subscriptions (0056).
- Sequences (0111): follow-ups that send themselves per recipient, weekdays 08–16 Oslo, with the
  rule no reply / no click / no open; exits on an answer, unsubscribe, bounce, a company moved on or
  won/lost/parked; seven mails at most; «Resend after 7 days»; a daily cap; the chain with each
  mail's funnel. Opens are shown muted and «no open» carries its warning (Apple proxy opens are not
  counted, 0053), as the brief asks.
- The board and the inbox (0112): stages with the buyer action that closes them, drag or «Move to»;
  inbound leads with a first-response clock against a target (default 5 minutes, the brief's).

**Not built, and why:**
- *Deal value, ARR, MRR, weighted pipeline, win rate.* The design prices per employee
  (€3.50/employee/month); Orgpuls sells plans, and no deal value is stored. Showing an ARR would be a
  number the schema does not have (CLAUDE.md: never fabricate). Omitted until a deal carries a plan.
- *LinkedIn and call steps, Gmail/Calendar sync, a browser extension, form builder, integrations
  screen, lead scoring, owners filter on the board.* Each is a product of its own; the design shows
  them as empty screens. The sequence model (a chain of campaigns) takes a manual-task step later.
- *Reading replies.* An answer is still logged by a person (0093); automatic reply detection needs
  an inbound mailbox the marketing domain does not have.
- *Answering a lead that has no company* in the inbox: the inbox links to the contact; an activity
  needs a company (0056). Contact-form and demo leads that name a company are linked to it.
- *The design's dark-green rail.* The admin keeps the product's own rail (cream surface, track
  tiles, yellow for the current page), as «our design» asks.

## D-160 — Designed campaign mail and the inbox check: what is checked, and what is not

X-092. Built: the redrawn branded layout, five designed blocks (0113), ten templates with
[placeholders] that stop scheduling, the inbox check with DNS authentication, the studio with a live
preview, and campaign cards with a funnel. Deliberately not built, and why:

- *A spam score from a third party* (SpamAssassin, mail-tester, Litmus, Email on Acid). Those need an
  account and send the mail to an outside service; the check here scores what is known to move
  placement and says which rule each line follows. A real seed test before a large send is still
  good practice.
- *A drag-and-drop canvas.* Blocks are ordered with the arrows and the palette; one renderer per block
  kind keeps every mail valid in Outlook, which free-form layout does not.
- *Pictures uploaded to Orgpuls.* A picture is an https address the author hosts. Storage for
  campaign pictures, with resizing, is its own piece of work.
- *Brand colours per campaign.* The palette is the product's tokens; one look across all mail is part
  of being recognised in the inbox.
- *A postal address in the footer.* The sender line is the message `mail.crm.sender`; no address is in
  the repository, so none was written. The check warns until one is set under Translations.
- *Dark mode in Gmail.* Gmail's apps invert colours themselves and read no dark CSS; the palette is
  chosen so its inversion stays legible. Apple Mail and Outlook.com get the designed dark palette.
- *Spam words in the body.* Only strong phrases count there («100 %», «garantert», «klikk her»); single
  words like «gratis» count in the subject alone, where filters weigh them and readers decide.

## D-161 — The CMS: what it does not do, and why

X-094. Built: the pages hub over every public page, six templates drawn by the site's own components,
the editor with a live preview, drafts, scheduling, revisions, two languages with a translation state,
the search score, redirects and per-page traffic. Deliberately not built:

- *Designed pages in the page editor.* The start page, Plattform, Hvorfor, Bruksområder, the landing
  and industry pages and the coded articles are pixel-gated against the design bundle; letting an editor
  move their sections would break the design contract (CLAUDE.md). Their title and description are
  edited in the hub, their other words in Translations.
- *A free-form canvas.* Sections are the site's block kinds, ordered with arrows; one renderer per kind
  keeps every page on the design's grid and type scale (the same reason as D-160).
- *Pictures uploaded to a page.* A page shows the product's own screens (the `shot` block and the hero
  picture). Storage with resizing and alt-text checks is its own piece of work.
- *A/B tests of a page.* The site's analytics are cookieless by decision (D-91): a visitor cannot be
  kept in one variant without storing something on their device.
- *Machine translation.* «Add English» copies the words to translate and marks them as a translation to
  check; nothing is published until someone has checked it. Respondent texts follow X-089; marketing
  pages are reviewed by a person before they go live.
- *English pages in the local preview.* Outside production one host serves both languages, so the
  preview shows the English draft inside the Norwegian header; on admin.orgpuls.com it frames
  en.orgpuls.com.
- *A scheduled copy is live within five minutes of its time,* not to the second: live pages are cached
  for five minutes and dropped at once on every publish.

## D-162 — Sentral shell: what the design draws and the shell does not

X-095. The design's top bar has a help button, a site pill that opens a menu of sites, and buttons
for navigation. Here:

- *No help button.* There is no admin help to open; a button that leads nowhere is not drawn.
- *The site pill opens nothing.* One site (Tor, 2026-09-29): it names Orgpuls and its domain; the
  menu of sites and «Connect another site» come with a second product.
- *Links, not buttons.* Each area and page is an address (D-06), so they are links styled as the
  design's buttons, with `aria-current` for the one you are on.
- *The wordmark's font* (Bricolage Grotesque 700) is served from public/fonts by an admin-only
  stylesheet; app/fonts.css stays the product bundle's own (D-07).
- *The sub-bar scrolls sideways on a phone* instead of wrapping to several lines; the areas are in a
  menu sheet below 1024 px.

## D-163 — Sentral Overview: what the design draws and the page does not

X-095, phase 2. From the design's `isOverview`:

- *No recurring revenue.* «Monthly recurring» waits for billing (Tor, 2026-09-29); the second card
  counts trials and those ending within 7 days. «Past due» items in *Needs attention* have no ledger
  behind them and are not drawn. The pipeline's kroner are the deal values the team enters since
  phase 4 (0119, D-165): an estimate per deal, never an invoice.
- *No «New customer» button.* A customer is an organisation that signs up; the admin cannot create one.
- *«Open languages» and «Open SEO» become «Open pages».* Admin › Languages is the survey's
  translations, and admin › SEO reads Search Console; a page's missing language or description is
  mended on the page, so both items open Content › Pages (the second filtered to pages needing
  attention).
- *Recent activity shows changes only* — the audit log also records every read, and six views of a
  list say nothing. Actions without a phrase in `admin.dashboard.did` are skipped rather than shown as
  a code. The actor's first name comes from the local part of their address; admins have no name field.
- *Pipeline colours* are the design's chart palette (`D.viz`, tokens `viz1`–`viz5`), one per open
  stage in order; stages are data, so a sixth reuses the first.
- *The business charts stay under it for now.* Signups and new customers per week, visitors per week
  and the activation funnel (D-90, D-107) sit below the design's grid until Analytics takes them
  (phase SA-6b); the MRR snapshot card is gone with the money.
- *Row heights differ by 2–4 px* from the design render: both use `line-height: normal`, and the
  render's DM Sans build differs from public/fonts (D-07).

## D-164 — Sentral Customers: what the design draws and the pages do not

X-095, phase 3. From the design's `isCustomers`, `isCustomerDetail` and `isOrgs`:

- *A customer is an organisation* (decision 3): no Organizations sub-page, no «New organization», no
  «Organizations under this customer» card. The detail's second card is the organisation's own
  structure (groups, employees, locations, measures) in that place.
- *No money.* The row's «48 000 kr/mo», «Monthly» and the Invoices card wait for billing; the
  Invoices slot holds the billing and agreement facts the admin already had (trial, confirmation,
  invoice address, reference, EHF, the data processing agreement) with *Extend trial*.
- *States.* The design's Active · Trial · Past due · Churned becomes Active · Trial · Trial ended ·
  Cancelling · Churned (+ Demo when a sandbox exists): «past due» needs invoices; «trial ended» is
  the product's grace and read-only access; a registered cancellation is *cancelling* until its last
  day and *churned* after it (`lib/admin/customers.ts`, unit-tested). Demo sandboxes are not
  customers and are not in All.
- *Seats* are the employees registered against the plan's headcount (the price list's bands: 25,
  100). Before a plan is chosen, the band the stated size fits, marked «not chosen». The largest
  plan has no ceiling, so it shows a count and no bar.
- *The contact* is the organisation's first daglig leder; the detail shows the e-mail only to the
  roles that see users (support, super-admin).
- *No «New customer».* Customers sign up; the admin cannot create one.
- *No «Open as customer»* (decision 5).
- *«Edit customer»* changes the account owner only: name, contact and plan are the customer's own,
  set in Orgpuls. The owner is kept in `app.account_owners` (0118), apart from the organisation's
  row that its members read. Super-admin and support set it; finance sees it.
- *Filters* are Plan and Owner, as designed, plus «No owner». The badge counts the filters that are
  on; each segment and filter is an address. The Filters panel starts open when a filter is on.
- *Kept from D-90,* below the design's two columns: users, surveys as metadata, the timeline, the
  mail log as counts and the organisation's audit trail. Tickets, trial mail, source and notes sit
  in the columns. *Activity* is the audit trail's changes, as on the Overview.


## D-165 — Sentral Pipeline: what the design draws and the page does not

X-095, phase 4. From the design's `isPipeline`:

- *A deal is a company in the pipeline.* The value (0119) is the yearly contract value the team
  enters, whole kroner, an estimate; it is never an invoice and never counted as revenue.
- *The contact* is the company's first contact, else the register's general manager (0110).
  «New deal» asks for company, value, next step and owner; contacts are added on the company's page,
  where consent and lists are handled.
- *Columns are the stages people work in* (open and won kinds, as configured, D-160's stages page);
  lost and parked stages are links under the board. With more than five, a column may narrow to
  180 px before the board scrolls.
- *A card opens a dialog* with stage, value, next step and date, and owner — the keyboard's way to
  move a deal; dragging still works. A company that follows its organisation's plan shows its stage
  and cannot be moved by hand.
- *The exit criterion* a stage closes on (0112) is the column header's tooltip, not a line of text.
- *«Won this quarter»* counts deals whose stage became a won stage since the quarter began (Oslo).
- *The CRM's own phone tab row* is gone from every CRM page; Sentral's sub-bar lists them.
- *Contacts & lists* (`isContacts`): the stages are the contact types (Lead = prospect, Trial,
  Customer, Churned = former). *Consent* says whether mail would reach the person and why not —
  reachable, awaiting yes, unsubscribed, suppressed after a bounce, or no basis to mail — rather than
  the design's two words. The *Lists* panel holds both kinds the CRM has: segments (rules, counted
  by who a campaign would reach) and subscription lists (counted by subscribers). «New list» opens a
  new segment; «Import contacts» opens the import (D-101) in the dialog. Adding one contact and the
  existing-customer exception stay below.
- *Campaigns* (`isCampaigns`): no Owner column — a campaign has no owner in the schema, and one is
  not invented. The KPIs read the last 30 days of what was sent; «Conversions» are signups
  attributed to campaign links. *Lifecycle coverage* reads real state: onboarding, the trial-ending
  nudge and the read-only warning are the product's own trial mail (0060) and say «Built in»;
  win-back is a campaign to a segment of former customers, the newsletter a newsletter campaign,
  else «Missing». The design's «Renewal reminder» needs a renewal date, which waits for billing,
  so the read-only warning takes its line. The house rules are guidance; the one about suppression
  is what the dispatcher does (unsubscribed and bounced; there is no «past due» yet).
- *The CRM's sub-bar* starts with the design's order — Pipeline, Contacts & lists, Campaigns,
  Tickets — and keeps the CRM's own pages after it; Journeys, Tasks and Lead scoring follow in CRM II.

## D-166 — Sentral CRM II: journeys, tasks, tickets and lead scoring

X-095, CRM II. From the design's `isJourneys`, `isTasks`, `isTickets` and `isScoring`:

- *Journeys are the follow-up chains* (0093, 0111), read by `admin_crm_journeys` (0120): a first
  campaign aimed at a stage, with follow-ups that send themselves. No second engine was built; the
  design's enrolment, waits and exits are the chain's audience, follow_days and 0111's exits.
  «In journey» is who an automatic follow-up still waits to reach, «Completed» who the last mail
  reached, «Reached goal» the share of companies reached whose stage is now further on. A journey
  has no task steps and no re-enrolment, so neither is drawn. «New journey» opens a new campaign; its
  follow-ups are added in the studio. A card opens the first campaign, which shows the chain.
- *«Emails by stage»* becomes *Journeys by stage*: each working stage, its companies and the journeys
  that start on it. The design's «never two at once» is not enforced, so it is not claimed.
- *Tasks* are the CRM's tasks on companies (0056): no call/e-mail/meeting chip, because a task has no
  kind; «Made by hand» because nothing else makes them; no «Meeting link». Done tasks are kept 90 days.
- *Tickets* keep D-92's views (open, mine, unassigned, overdue, resolved, all), queues (in Filters)
  and search. The SLA column counts to the deadline that applies now — first reply, then
  resolution, a legal one if sooner — in business hours as the ticket stores it. No «New ticket»:
  tickets come from the contact form and the in-app help.
- *Lead scoring is the trial health score* (0060): the rules panel is its definition, point for
  point, and is not edited here, so there is no «Edit rules»; 70 and above is hot, 40 warm. A hot
  lead does not create a task (the design says it does; nothing here would). Demo sandboxes are left
  out: the health reader now says which rows are demos (0120).
- *The CRM's own pages* — overview, inbox, companies, lists, segments, templates, stages and senders —
  sit behind «More» at the end of the sub-bar, so the bar keeps the design's seven; the phone's menu
  sheet lists them all.

## D-167 — Sentral Analytics: overview, pages and goals

X-095, phase 6. From the design's `isTraffic`, `isApages` and `isGoals`, read from the site's own
cookieless beacon (0050, 0054, 0059) through `admin_web_report` (0121):

- *Visitors* are visitors on a day: the visit code changes every day (D-91), so the same person on
  two days counts twice. The page says so under the figures.
- *Devices* are counted from 29 Sep 2026, when the beacon began to keep the class — desktop, mobile
  or tablet — read from the user agent it already hashed (0121). The agent itself is still not
  stored, and the privacy statement names the class among what is kept. Until a period has a visit
  with a known device, the card says so instead of drawing percentages. iPads that present
  themselves as Macintosh count as desktops.
- *Bounce rate and time on site* are counted within a visit as the beacon can see one (a visitor's
  events on a day, a gap over 30 minutes starting a new visit): bounced is one view and no click;
  time on site is a visit's first event to its last, a one-page visit 0 s.
- *Pages: time and exit* are the time to the next view in the same visit, over the views that have
  one, and the share of views no other view followed. *Conv.* is sign-ups from visits that began on
  the page, shown for every page that began a visit, not only landing pages. The share of views is
  of all views in the period; fifty pages are shown.
- *Goals* are the four the product records — trials started, demo links asked for, list
  subscriptions confirmed, contact-form messages — each against the period before. The design's
  «Signed up» (a form on a landing page) is not a separate event here: signing up is starting a
  trial. Demo requests are deleted after 30 days, so their count and comparison are given only for
  periods they reach («not kept» otherwise). A comparison past the beacon's 400 days is not drawn.
- *The funnel* is visitors → saw /priser → opened /registrer → organisations made → organisations
  that confirmed billing, in the period; demo sandboxes are not counted.
- *No «New goal»*: goals are not definable, so the button would do nothing. In its place, and beside
  «Export report», the period — 7, 14 (the design's), 30, 90 or 365 days — kept from the old Web
  page. «Export report» downloads a CSV of the same figures; there is no PDF.
- *Weekly bars beyond a month*: the design draws fourteen days; a 90- or 365-day period draws a bar
  per ISO week, labelled by its number, since a bar per day would not fit.
- *Sources & visits* keeps what the old Web page showed and the design does not — the visit funnel
  with clicks, sources with activated and paid, how-did-you-hear, campaigns, landing pages, countries,
  cities and the latest visits — behind «More», with Cost per customer.

## D-168 — Sentral Content: pages, templates, landing, SEO and languages

X-095, phases 7 and 8. From the design's `isPages`, the page detail, `isTemplates`, `isLanding`,
`isSeo` and `isLanguages`, over the CMS (0114), the site's own designed pages, the web beacon and
the translation registry. What the design draws and the product does not:

- *Pages*: the design's search score and traffic columns are not on the list; they are on SEO and
  Analytics, and on each page's detail. A designed page (layout in code) has no «last changed» or
  author, so its meta line says «in code» and the author cell is empty rather than invented. The
  language chips are bokmål and English: the site has no nynorsk.
- *Page detail*: the tabs are Content, Translations, SEO, Versions and Settings as designed. There is
  no *In review* state and no *Compare*: X-096 took approval steps out of content work («WAY too
  complicated»), and a publish is already a revision that Versions restores. The design's *visual
  canvas with an inspector* is the form beside a live preview of the real page (X-094): the public
  site draws every block its one designed way, so there is nothing for an inspector to set that the
  form does not.
- *A designed page's detail* (layout in code) keeps its own view — title and description per
  language with their score, its traffic, and the two texts edited in place — under the same header
  as a template page.
- *Templates*: no «Edit template» and no «New template». The templates are written with the site
  (0114, X-094) and their blocks are drawn by the site's designed sections; editing a template's
  starting words would change no page already made from it. Each card shows its blocks in order, how
  many pages were made from it, and «New page» from it.
- *Landing & front pages*: the design's «Splash page» — a page that replaces the site — is a
  **site notice** (plan decision 8, 0123): one line above the header on every public page, bokmål
  and English, switched on and off here, audited, never reaching the product or a survey and never
  touching indexing. Visits and conversion are the beacon's last 30 days; a page with no visitors
  shows «—», not 0 %.
- *SEO*: the ranges are the page score's own (title 30–60, description 120–160), not the design's
  70–155, so the list and the score agree. Redirect hits are counted since each redirect was made,
  not «last 30 days», because that is what the table keeps. The sitemap card does not claim it is
  submitted to Google; IndexNow status is on Performance.
- *Languages*: the design's languages are pages of a site; ours are what a survey can ask — bokmål,
  the source; English, whose questions are counted here (its page strings are messages/, on the
  legal review); and the five survey languages. There is no «Add a language»: a language is a code
  change (LOCALE_REGISTRY, a flag, CLDR plural rules, fonts), not a row. The queue has no assignee:
  nobody is assigned translation work in the product. The design's *Machine translation* switch is
  not a switch: machine drafts are made with every text as it is written (X-089, D-133) and wait in
  review, so the card says that instead of offering a toggle that would change nothing. «Import
  JSON» goes to the import on the open language (bokmål's questions have none: they are the source).

## D-169 — Sentral Media: images kept by the database, made web-sized in the browser

X-095, phase 9. From the design's `isMedia` and its «Upload media» modal, over 0124:

- *Kept in Postgres, not Storage*, as the organisation logo is (0104): served by the site itself at
  `/media/<key>`, so the public pages' CSP keeps `img-src 'self'`, and the row lives under RLS with
  no policy like every other CMS table. No bucket, no storage policies, no third origin.
- *Images only* — PNG, JPEG or WebP, the type read from the bytes. The design's PDFs, SVGs and video
  are not offered: an SVG is a document that can carry script and would be served from our own
  origin; a PDF or a video has no section on a page to show it in. The design's «Folder» field is not
  there either: nothing in the product groups files.
- *«Files up to 50 MB … the original is kept»* is not what happens. The browser makes the web
  version before anything is sent — at most 2000 px wide, WebP, at most 2 MB — and only that is
  kept. Re-encoding also leaves out what a camera writes into a photo (where, when, which device).
  The admin keeps their own original. The upload modal says this instead of the design's sentence.
- *The card* shows the image itself where the design draws a coloured tile with the file type, and
  «Image · size · width×height» — every file is an image, so there is no other kind to name.
- *Used on* counts the CMS pages whose words, in either language, draft, scheduled or live, name the
  image's address in an Image section — archived pages too, since one can be brought back. A used
  image cannot be deleted. The designed pages (layout in code) do not use the library.
- *The Image section* is a new block kind on template pages: the picture, its alt text in the page's
  language (starting from the library's), an optional caption, and its size so the page keeps its
  place while it loads. It is drawn in the site's card treatment (the note radius and line), at the
  reading width of a table; the design has no public image section to follow.
- 0124 also closes a hole in `app.cms_block_ok` (0114): a block missing a field made it return
  null, not false, and a null passes a check, so a malformed block could be saved. It now returns
  false. Nothing stored locally or on hosted failed the tightened check when it was applied.

## D-170 — Sentral Admin: users and roles, billing, site settings, audit log

X-095, phase 10. From the design's `isUsers`, `isBilling`, `isSettings` and `isAudit`, over 0125 and
0126 and the readers that exist. What the design draws and the product does not:

- *Roles*: the design's Owner / Admin / Sales / Support / Editor / Developer are ours mapped, not
  copied (plan decision 5): super_admin shows as **Owner**, marketing as **Sales & marketing**,
  support, finance and analyst stay, **Editor** is new (0125), and there is no Developer — there are
  no API keys or webhooks to administer. The editor reaches Content and SEO and nothing else: 0126
  rewrote every reader that let *any* admin role in, or shut out only named roles, so that it
  refuses the editor (admin_roles_invariants.sql calls sixteen of them as an editor). Editing the
  survey languages stays the Owner's (D-133): approvals of respondent texts are not an editor's.
- *Users & roles*: the design's «Sites» column is the member's second factor — there is one site
  (plan decision 1), and «All sites» on every row would say nothing. Members have no display name,
  so the e-mail leads the row. «Invite» and «Edit» are the grant of a role (admin_set_admin) with its
  reason in the design's dialog: the person makes their own account first, and a role works only
  after the second factor. The roles card lists what each role can do from the access matrix.
- *Billing & plans*: no prices, MRR, invoices, outstanding or overdue amounts — billing does not run
  through Sentral yet (Tor, 2026-09-29), so the plan cards count customers, trials, cancellations
  and registered employees per plan, by the price list's headcount bands, and the design's
  «Invoices» table is the confirmations of billing and the cancellations, which are real events.
  No «Edit plans»: the price list is code, and a price change is a release.
- *Site settings*: *General* is the real configuration, read-only (the fields are set in the code
  and the environment, and a field that saved nothing would lie); the design's *Branding* card is a
  note saying where the values live, since the site has no branding settings. *Access* has the
  switches that exist: the second factor (always on — the database will not honour a role without
  it, so it is drawn on and fixed, with how many admins have not set one up), **Allow search
  engines** (new in 0126: off, every public page carries noindex and the sitemap is empty), and
  auto-approve and the site notice shown as they stand with a link to where each is changed, rather
  than a second control for the same setting. Customer single sign-on is not a feature. *Integrations*
  shows what sends and runs, from Operations, and points to SEO › Performance for Search Console and
  IndexNow; the design's API keys and webhooks are not features Orgpuls has. There is no «Save
  changes»: the one switch saves as it is turned, and the rest is read-only.
- *Audit log*: the areas are read from each action's prefix (lib/admin/audit.ts), and reads are
  logged too (D-90), so «Figures read» is an area of its own. The change is the admin, the action as
  logged and its organisation or item — the actions are codes, not sentences, because the log is
  written by the database functions, not the screens. The design's «kept for 24 months» is not
  claimed: nothing prunes the trail. The latest 500 entries are listed and the latest 1 000 exported;
  a CSV cell never starts a spreadsheet formula.

---

## D-171 — «Send test til meg» and «Klar til utsending» on Måleoppsett › Utsending

**Design:** none. The design has no send card (D-156 built it), no test send and no pre-send check.
Both were proposed with Målinger › Innstillinger (X-064) and left out of D-126 because a test needs a
link that answers nothing.

**Built (0127):**
- **The test.** «Send test til meg» under the send card queues the invitation, as it will read, to
  the address the daglig leder signs in with — never another address, at most five an hour, not for
  a closed round or while the organisation's e-mail is off. The dispatcher renders it with the
  invitation's own renderer from the facts the preview reads (`app.round_preview_json`, which
  `round_send_preview` now calls), prefixed «Test:» and headed by a line saying what it is. Its link
  is the round's preview, `/forhandsvis?runde=…`, which needs a sign-in and writes nothing: a test
  carries no token, so there is nothing it could answer (D-34). The texts are `mail.test.*` in
  bokmål and English: a test goes to a leader in the organisation's language, never to a
  respondent, so like `mail.tiltak` and `mail.evaluering` it is outside the survey languages' set.
  The card shows the viewer's last test: queued, sent (with the time) or not delivered.
- **The check.** Above the introduction while the round is planned: how many in the audience the
  opening will invite get it by e-mail, by SMS (or not, while SMS is off), or not at all; the
  invited groups with fewer active employees than the threshold, which can never show a figure;
  whether the verneombud was consulted and the tillitsvalgte consulted (section 6); and whether the
  organisation's e-mail is off. Green where in order, amber where it needs a look, with a count.
  It blocks nothing: the year wheel opens a round on its date, and the check says what that date will
  meet. `round_ready` gives counts and group names only, to the daglig leder only.

**Pixel gate:** the send card is below section 6 and only for the daglig leder on a round that is
not closed (D-156); no v3 state draws it.

`send_test_invariants.sql` (7) proves the posture, who may send, the limits, the claim, the preview
unchanged and the check's counts; `tests/unit/mail.test.ts` the test's subject, lead and link.

## D-172 — Groups created and renamed in Oppsett › Grupper, and one CSV reader

**Design:** none. The Grupper tab (bundle 2246-2264) lists fixed groups; nothing in either bundle
adds or renames one. D-76 left it open: the Veiviser points to Oppsett › Grupper, which could not.

**Built (0130):**
- **Under the rule line**, a «Ny gruppe» field with «Legg til», and a «Gruppe» select with a «Nytt
  navn» field and «Gi nytt navn». They are the Lokasjoner tab's add form — the same label, field,
  select and submit classes, behind the same `border-t` — so the tab gains no new visual language,
  and the rows above keep the design's drawing (a rename in the row would have changed it). Shown
  disabled to anyone but the daglig leder, as the Lokasjoner form is. No baseline draws the tab.
- **The write is the table's own.** `authenticated` already held insert and update on `app.groups`
  under 0026's `group_admin_insert` / `group_admin_update` (daglig leder only), so `createGroup` and
  `renameGroup` write through RLS and parse with Zod, like `addLocation`; no definer RPC. What a
  policy cannot say, the table now says for every writer: a name trimmed and 1–60 characters
  (`groups_name_shape`), and one per organisation in any case (`groups_org_name_ci` on
  `lower(name)`), because the employee import matches column C case-insensitively and «Salg» beside
  «salg» would make that match a guess. A duplicate reads «Dere har allerede en gruppe med dette
  navnet».
- **No delete.** Results, round audiences and memberships are keyed by `group_id`. Renaming is safe
  for that reason — a closed round's figures follow the group to its new name — and deleting is not.
  0026's delete policy is left as it was (`survey_settings_invariants` proves its effect on an open
  round); no action calls it.
- **A rename keeps the old name masked.** `app.mask_patterns` reads the register as it is now, so a
  comment written about «Verksted» would lose its «[avdeling]» marker once the group became
  «Mekanisk». `app.groups.former_names`, written only by the `groups_keep_names` trigger (a client's
  value is replaced), keeps the names a group has had, and `mask_patterns` masks them too.

**The CSV reader.** `lib/csv/parse.ts` replaces the employee import's `split(/[\t;,]/)` on the
server, in its preview and in the Veiviser's row count, and the admin contact import's own reader.
It detects one delimiter — tab, semicolon or comma, the most frequent outside quotes in the first
lines — and reads quoted fields with the delimiter, line breaks and `""` inside, CRLF or CR, and a
byte-order mark. A sheet that mixed delimiters on one line was split on all three before; it is now
split on the one detected, so «Nordmann, Kari» in a tab-separated paste stays one name. A paste over
1 000 000 characters is refused as `too_many`, like one over 2 000 rows.

`group_write_invariants.sql` (7) proves the path, who may write, the name's shape, the case-blind
key, the rename and its former names, and masking after a rename; `tests/unit/csv-parse.test.ts`
(16) the reader. Microsoft Entra import stays open: it needs an app registration in Microsoft's
tenant, which no session can make.
