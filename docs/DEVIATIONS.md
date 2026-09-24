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
| 06 Spørsmålssett | 68/102 | wider than the prototype, which shrinks each screen to its content (D-71) |
| 07–11, 19 Resultater | 78–112/126 | Drift withheld with Administrasjon (D1, D-68); Utvikling's extra history (D-72) |
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
  into one RPC is left for when a screen needs it.

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
