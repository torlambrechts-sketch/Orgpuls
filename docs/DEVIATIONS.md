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

**2. The year rail has three points where the design has five.** February's "Forankring —
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

**4. "Arbeidsmiljøåret — sett opp automatikk" is not a link.** The design makes it a
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

