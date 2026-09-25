# Gjennomgang av landingssider – Orgpuls

Instruksjon for Claude Code. Legg filen i `docs/` i repoet og start med:
«Følg `docs/landingsside-gjennomgang.md` for [side eller alle landingssider].»

Målet er at hver landingsside ser gjennomarbeidet ut, rangerer på søkeordet sitt og får besøkende til å skrive inn organisasjonsnummeret.

---

## 1. Omfang

| Side | Hovedsøkeord | Primær målgruppe |
| --- | --- | --- |
| `/` | medarbeiderundersøkelse | Daglig leder, HR |
| `/lovkrav` | kartlegging psykososialt arbeidsmiljø | Daglig leder, HR |
| `/verneombud` | verneombud kartlegging | Verneombud |
| `/smaa-bedrifter` | medarbeiderundersøkelse små bedrifter | Daglig leder, 5–25 ansatte |
| `/bygg-og-anlegg` | arbeidsmiljøundersøkelse bygg og anlegg | Daglig leder, HMS-leder |

Språk: norsk bokmål. Stack: Next.js (App Router), TypeScript, Tailwind, shadcn.

---

## 2. Arbeidsrekkefølge

1. **Kartlegg.** List hver side: route, `metadata`, H1–H3, CTA-er, bilder, interne lenker, JSON-LD.
2. **Ta skjermbilder** med Playwright i 375, 768 og 1440 px bredde, lys og mørk modus, før endringer.
3. **Vurder** hver side mot sjekklistene i punkt 3–6. Noter funn i rapporten (punkt 8).
4. **Rett** funnene. Én commit per side, meldingen starter med `landing(<side>):`.
5. **Ta nye skjermbilder** og sammenlign med før-bildene.
6. **Kjør verifisering** (punkt 7). Siden er ferdig først når alle mål er nådd.

---

## 3. Visuelt

**Helhet**
- [ ] Siden bruker samme designtokens (farger, typografi, radius, avstander) som forsiden. Ingen hardkodede farger eller px-verdier utenfor tokens.
- [ ] Én ting på siden er det visuelle midtpunktet (på forsiden: eksempelet med Nordvik Anlegg AS). Resten er rolig og disiplinert.
- [ ] Avstanden mellom seksjoner er konsistent og følger én skala.

**Hero (første skjermbilde)**
- [ ] H1 synlig uten scrolling på 375 px.
- [ ] Orgnr.-felt og «Start gratis» synlig uten scrolling på både mobil og desktop.
- [ ] Mikrotekst under knappen: «30 dager gratis · Ingen kort · Svar lagres i EU» eller tilsvarende.
- [ ] Pris («Fra 265 kr/mnd eks. mva») synlig i eller rett under hero.
- [ ] Hero viser noe fra produktet (eksempelrapport, pulsvisning), ikke et generisk illustrasjonsbilde.

**Typografi**
- [ ] Maks to skriftfamilier, lastet med `next/font`.
- [ ] Tydelig typeskala: H1 > H2 > H3 > brødtekst, med bevisste vekter.
- [ ] Linjelengde under 80 tegn i brødtekst.
- [ ] Ikke uthev enkeltord i overskrifter med farge eller kursiv.
- [ ] Ikke STORE BOKSTAVER i etiketter over overskrifter.

**Struktur og komponenter**
- [ ] Nummerering (1, 2, 3) brukes bare der innholdet faktisk er en rekkefølge (f.eks. «Lytt – Forstå – Jobb med det – Se at det virket»).
- [ ] Ikke alt i like kort med samme skygge. Variér form etter innholdets betydning.
- [ ] Ikke pil (→) bak all lenketekst.
- [ ] Bevegelse: maks én bevisst animasjon ved innlasting. Ingen fade-inn på hver seksjon. `prefers-reduced-motion` respekteres.

**Tillit og innhold**
- [ ] Anonymitetsløftet («ingen gruppe vises før fem har svart») står tidlig og tydelig.
- [ ] Bevis (kundesitater, antall virksomheter) vises bare hvis det er ekte. Aldri fiktive sitater, logoer eller tall.
- [ ] Footer har firmanavn, org.nr., kontaktlenke og personvern.
- [ ] «Snakk med oss» går til `/kontakt`, ikke innlogging.

**Tilgjengelighet**
- [ ] Kontrast minst 4.5:1 for tekst, 3:1 for store tekster og UI-elementer.
- [ ] Synlig fokusmarkering på alle interaktive elementer.
- [ ] Alt kan brukes med tastatur. Orgnr.-feltet har `<label>`, `inputmode="numeric"` og feilmelding som forklarer hva som er feil.
- [ ] Trykkflater minst 44 × 44 px på mobil.

---

## 4. SEO – innhold

- [ ] **Title** ≤ 60 tegn, hovedsøkeordet først, «| Orgpuls» til slutt.
- [ ] **Meta description** 120–155 tegn, inneholder søkeordet og et konkret tilbud (30 dager gratis).
- [ ] **Én H1** per side, inneholder hovedsøkeordet.
- [ ] H2-er dekker relaterte søk (f.eks. «Hva krever arbeidsmiljøloven?», «Er det anonymt når vi er få?»).
- [ ] Hovedsøkeordet står i første avsnitt.
- [ ] Minst 400 ord med reelt innhold per landingsside.
- [ ] Interne lenker: hver landingsside lenker til forsiden, minst én annen landingsside og relevant artikkel. Lenketekst beskriver målet, ikke «les mer».
- [ ] Bilder har beskrivende `alt` på norsk. Dekorative bilder har `alt=""`.
- [ ] URL-er med små bokstaver, bindestrek, uten æøå (`/smaa-bedrifter`).
- [ ] Juridiske henvisninger (§ 3-1 c, § 4-3, § 6-2, § 9-2) er korrekte og lenker til Lovdata.

---

## 5. SEO – teknisk (Next.js)

- [ ] `export const metadata` eller `generateMetadata` per route med `title`, `description`, `alternates.canonical`.
- [ ] `openGraph` og `twitter` med tittel, beskrivelse og bilde 1200 × 630 per side (`opengraph-image.tsx` eller statisk fil).
- [ ] `<html lang="nb">` og `openGraph.locale: "nb_NO"`.
- [ ] `app/sitemap.ts` lister alle landingssider og artikler med `lastModified`.
- [ ] `app/robots.ts` tillater indeksering av offentlige sider og blokkerer `/logg-inn`, `/registrer` og alt bak innlogging.
- [ ] Sidene rendres statisk (SSG). Ingen innhold som bare vises etter klientside-JavaScript.
- [ ] **JSON-LD:**
  - `Organization` (navn, URL, logo, kontakt) på alle sider
  - `SoftwareApplication` med `offers` (265 og 565 NOK/mnd) på forsiden
  - `FAQPage` der det finnes FAQ – spørsmål og svar identiske med synlig tekst
  - `BreadcrumbList` på undersider
- [ ] Valider JSON-LD med Googles Rich Results Test eller `schema-dts`-typer.
- [ ] Ingen `noindex` på offentlige sider. Ingen dupliserte titler eller beskrivelser på tvers av sider.

---

## 6. Ytelse

| Mål | Krav |
| --- | --- |
| LCP | < 2,5 s på mobil |
| CLS | < 0,1 |
| INP | < 200 ms |
| Lighthouse Performance, mobil | ≥ 90 |
| Lighthouse SEO og Accessibility | ≥ 95 |

- [ ] Bilder via `next/image` med `width`/`height` og `priority` bare på hero-bildet.
- [ ] Fonter via `next/font` med `display: swap`.
- [ ] Ingen tredjepartsskript før samtykke (Meta Pixel, Google Ads-tag).
- [ ] Ingen ubrukt JavaScript på landingssidene – serverkomponenter der det går.

---

## 7. Verifisering

Kjør før siden regnes som ferdig:

```bash
# Skjermbilder før/etter
npx playwright test tests/landing-screenshots.spec.ts

# Lighthouse (mobil) for hver side
npx lhci autorun --collect.url=http://localhost:3000/lovkrav

# Tilgjengelighet
npx @axe-core/cli http://localhost:3000/lovkrav

# Lenker og metadata
npx next build && npx next start
```

Sjekk i tillegg manuelt:
- [ ] Del lenken i LinkedIn Post Inspector – bilde og tekst vises riktig.
- [ ] Rich Results Test viser FAQ og Organization uten feil.
- [ ] Registreringen fra orgnr.-feltet fungerer fra alle sider, og UTM-parametere følger med.
- [ ] Konverteringshendelsene (`signup_started`, `signup_completed`, `pricing_viewed`) utløses.

---

## 8. Rapport

Lever én rapport per gjennomgang i `docs/reviews/landing-<dato>.md`:

```markdown
## /lovkrav

**Status:** Ferdig / Gjenstår

| Område | Funn | Rettet |
| --- | --- | --- |
| Visuelt | Orgnr.-felt under folden på 375 px | Ja |
| SEO | Title 68 tegn | Ja |
| Ytelse | LCP 3,1 s (hero-bilde uten priority) | Ja |

**Lighthouse (mobil):** Performance 94 · SEO 100 · Accessibility 98
**Skjermbilder:** tests/screenshots/lovkrav-{375,768,1440}-{before,after}.png
**Åpne spørsmål:** …
```

---

## 9. Regler

- Endre ikke betydningen av tekst. Språkvask og kortere formuleringer er greit; nye påstander om funksjoner, lovkrav eller kunder er det ikke. Er noe uklart, list det under «Åpne spørsmål».
- Ingen fiktive kundesitater, logoer, tall eller sertifiseringer.
- Anonymitetsgrensen (fem svar) og priser skal stå likt på alle sider.
- Gjenbruk komponenter fra forsiden før du lager nye.
