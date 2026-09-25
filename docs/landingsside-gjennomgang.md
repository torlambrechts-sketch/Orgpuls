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
3. **Vurder** hver side mot sjekklistene i punkt 3–7. Noter funn i rapporten (punkt 9).
4. **Rett** funnene. Én commit per side, meldingen starter med `landing(<side>):`.
5. **Ta nye skjermbilder** og sammenlign med før-bildene.
6. **Kjør verifisering** (punkt 8). Siden er ferdig først når alle mål er nådd.

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

## 4. Layout og plassutnyttelse

Landingssidene skal bruke skjermen. Den vanligste feilen er smale, sentrerte kolonner og små kort med store tomrom rundt på desktop. Reglene under gjør plassbruken målbar, og testen i 4.7 stopper sider som ikke følger dem.

Grunnlaget er etablert praksis: 12-kolonners grid, 8-punkts avstandssystem, F-mønster for lesing (Nielsen Norman Group) og 60-30-10-regelen for farger.

### 4.1 Grid og bredde

| Element | Regel | Tailwind |
| --- | --- | --- |
| Innholdscontainer | Maks 1280 px, sidemarg 24 px mobil / 32 px tablet / 48 px desktop | `max-w-7xl mx-auto px-6 md:px-8 lg:px-12` |
| Seksjonsbakgrunn | Alltid full bredde (full-bleed), innholdet i container | `<section class="w-full">` + container inni |
| Grid | 12 kolonner fra `lg`, 24–32 px gutter | `grid grid-cols-12 gap-6 lg:gap-8` |
| Brødtekst | 60–75 tegn per linje – begrens *tekstblokken*, ikke seksjonen | `max-w-prose` på `<p>`, ikke på seksjonen |

**Hovedregel:** Smal tekst er riktig, smal *seksjon* er feil. En tekstkolonne på 7 av 12 kolonner skal ha bilde, eksempel eller tall i de resterende 5 – ikke tomrom.

### 4.2 Seksjonsmønstre

| Seksjon | Desktop-layout (12 kol.) | Mobil |
| --- | --- | --- |
| Hero | Tekst + orgnr.-felt 6–7 kol. venstre, produktbilde 5–6 kol. høyre. Bildet kan gå ut over containerkanten | Tekst først, bilde under |
| Slik virker det (4 steg) | 4 × 3 kol. over hele containeren | Stablet, nummerert |
| Differensiering / funksjon | Vekslende 6/6 – tekst og produktutsnitt bytter side per rad | Tekst, så bilde |
| Lovkrav (§-liste) | Overskrift 4 kol. venstre, liste 8 kol. høyre | Stablet |
| Pris | 3 × 4 kol., anbefalt pakke visuelt fremhevet | Stablet, anbefalt først |
| FAQ | Overskrift + kort ingress 4 kol., spørsmål 8 kol. – ikke én smal sentrert kolonne | Stablet |
| Avsluttende CTA | Full-bleed bakgrunn i aksentflate, innhold 8 kol. | Full bredde |

- [ ] Venstrejustert tekst som standard. Sentrering bare for korte blokker (avsluttende CTA, én setning).
- [ ] Kort i rader fyller hele containerbredden. Tre kort = 3 × 4 kolonner, aldri tre smale kort midt på siden.
- [ ] Ingen seksjon består bare av en sentrert tekstblokk på desktop.

### 4.3 Høyde og rytme

| Element | Regel |
| --- | --- |
| Hero, desktop | `min-h-[70svh]`–`min-h-[85svh]`; H1, orgnr.-felt og produktbilde synlig uten scroll på 1440 × 900 |
| Hero, mobil | H1 + knapp innenfor første 600 px |
| Vertikal seksjonsavstand | 96–128 px desktop, 64–80 px mobil (`py-24 lg:py-32` / `py-16`) |
| Avstandsskala | Kun multipler av 8 px (4 px for finjustering) |
| Seksjonsrytme | Veksle bakgrunn (base / flate) mellom seksjoner så sideoppbygningen leses uten rammer |

### 4.4 Bilder

- [ ] Hero-bildet er et ekte produktskjermbilde (rapport, puls, tiltak) – ikke illustrasjon eller stockfoto.
- [ ] Hero-bildet dekker minst 40 % av viewport-bredden på desktop.
- [ ] Produktbilder vises stort nok til at tall og tekst kan leses: minimum 560 px bredt på desktop.
- [ ] Faste formater: 16:10 for skjermbilder, 4:5 for mobilskjermer, 1200 × 630 for OG-bilde.
- [ ] Levert i 2× oppløsning, WebP/AVIF via `next/image`, med `sizes` satt riktig per breakpoint.
- [ ] Beskjæringer: vis det relevante utsnittet (f.eks. «Gjør disse tre») i stedet for hele dashbordet i små størrelser.

### 4.5 Typografisk skala

| Nivå | Størrelse | Tailwind |
| --- | --- | --- |
| H1 | 40 px mobil → 64–72 px desktop | `text-4xl lg:text-7xl` eller `clamp(2.5rem, 5vw, 4.5rem)` |
| H2 | 32 → 44–48 px | `text-3xl lg:text-5xl` |
| H3 | 20 → 24 px | `text-xl lg:text-2xl` |
| Ingress | 18 → 20–22 px | `text-lg lg:text-xl` |
| Brødtekst | 17–18 px, linjehøyde 1,6 | `text-[17px] lg:text-lg leading-relaxed` |

Store overskrifter tar naturlig plass – de er en del av løsningen på tomme flater, ikke pynt.

### 4.6 Farger (60-30-10)

| Andel | Rolle | Bruk |
| --- | --- | --- |
| 60 % | Base | Sidebakgrunn, det meste av flaten |
| 30 % | Flate / sekundær | Vekslende seksjonsbakgrunner, produktrammer, pris-kort |
| 10 % | Aksent | Kun primær-CTA, anbefalt pakke og nøkkeltall i eksempelet |

- [ ] Primærknappen er det eneste elementet med full aksentfarge i hero.
- [ ] Statusfarger (grønn / gul / rød for forsvarlig / følges opp / høy risiko) brukes bare i produktbilder og eksempler – aldri som dekor.
- [ ] Alle farger er tokens med lys og mørk variant.
- [ ] Kontrast som i punkt 3 (4.5:1 tekst, 3:1 UI).

### 4.7 Automatisk layouttest

Legg til `tests/landing-layout.spec.ts`. Testen feiler hvis en seksjon ikke utnytter bredden på desktop.

```ts
import { test, expect } from "@playwright/test";

const pages = ["/", "/lovkrav", "/verneombud", "/smaa-bedrifter", "/bygg-og-anlegg"];

for (const path of pages) {
  test(`layout ${path} @1440`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path);

    // 1. Ingen horisontal scroll
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow, "horisontal scroll").toBe(false);

    // 2. Innholdet i hver seksjon spenner minst 75 % av containerbredden (1280 - 2*48)
    const MIN = (1280 - 96) * 0.75;
    const widths = await page.$$eval("main > section", (sections) =>
      sections.map((s) => {
        const kids = Array.from(s.querySelectorAll("*")).filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
        });
        const left = Math.min(...kids.map((k) => k.getBoundingClientRect().left));
        const right = Math.max(...kids.map((k) => k.getBoundingClientRect().right));
        return { id: s.id || s.className.slice(0, 40), span: right - left };
      })
    );
    for (const w of widths) {
      expect(w.span, `seksjon ${w.id} bruker for lite bredde`).toBeGreaterThanOrEqual(MIN);
    }

    // 3. Hero: H1, orgnr.-felt og produktbilde over folden
    for (const sel of ["h1", "[data-testid=orgnr-input]", "[data-testid=hero-image]"]) {
      const box = await page.locator(sel).first().boundingBox();
      expect(box, `${sel} mangler`).not.toBeNull();
      expect(box!.y + box!.height, `${sel} under folden`).toBeLessThanOrEqual(900);
    }

    // 4. Hero-bildet dekker minst 40 % av bredden
    const img = await page.locator("[data-testid=hero-image]").boundingBox();
    expect(img!.width).toBeGreaterThanOrEqual(1440 * 0.4);
  });
}
```

Unntak (f.eks. en bevisst smal sitatseksjon) markeres med `data-layout="narrow"` på `<section>` og filtreres ut i testen – med begrunnelse i rapporten.

---

## 5. SEO – innhold

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

## 6. SEO – teknisk (Next.js)

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

## 7. Ytelse

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

## 8. Verifisering

Kjør før siden regnes som ferdig:

```bash
# Skjermbilder før/etter
npx playwright test tests/landing-screenshots.spec.ts

# Plassutnyttelse og hero over folden
npx playwright test tests/landing-layout.spec.ts

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

## 9. Rapport

Lever én rapport per gjennomgang i `docs/reviews/landing-<dato>.md`:

```markdown
## /lovkrav

**Status:** Ferdig / Gjenstår

| Område | Funn | Rettet |
| --- | --- | --- |
| Visuelt | Orgnr.-felt under folden på 375 px | Ja |
| Layout | FAQ i smal sentrert kolonne (58 % bredde) → 4/8-split | Ja |
| SEO | Title 68 tegn | Ja |
| Ytelse | LCP 3,1 s (hero-bilde uten priority) | Ja |

**Lighthouse (mobil):** Performance 94 · SEO 100 · Accessibility 98
**Skjermbilder:** tests/screenshots/lovkrav-{375,768,1440}-{before,after}.png
**Åpne spørsmål:** …
```

---

## 10. Regler

- Endre ikke betydningen av tekst. Språkvask og kortere formuleringer er greit; nye påstander om funksjoner, lovkrav eller kunder er det ikke. Er noe uklart, list det under «Åpne spørsmål».
- Ingen fiktive kundesitater, logoer, tall eller sertifiseringer.
- Anonymitetsgrensen (fem svar) og priser skal stå likt på alle sider.
- Gjenbruk komponenter fra forsiden før du lager nye.
