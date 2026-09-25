# Gjennomgang av landingssider, runde 2 – 25. september 2026

Denne runden følger den oppdaterte `docs/landingsside-gjennomgang.md`. Det nye er punkt 4, «Layout og plassutnyttelse», og layouttesten i 4.7. Kravene fra første runde er sjekket på nytt (`docs/reviews/landing-2026-09-25.md`).

**Metode:**
- **Layouttest:** `tests/landing-layout.spec.ts` (Playwright Test) kjøres ved 1440 og 375 px. Den er strengere enn skissen i veiledningen: bredden måles over det leseren ser, ikke over alle elementer, for ellers består et bånd alltid på grunn av sin egen container. Testen er også lagt inn i CI.
- **Skjermbilder:** `tests/landing-screenshots.spec.ts`, 375, 768 og 1440 px, lys og mørk modus, lagret i `tests/screenshots/` (ignoreres av git).
  - Før-bildene er etter-bildene fra runde 1, tatt av nøyaktig denne versjonen. Headless Chromium godtar ikke proxy-sertifikatet mot produksjon, så de kunne ikke tas derfra på nytt.
- **Kartlegging og tilgjengelighet:** `scripts/verify/landing-audit.mjs` med axe-core.
- **Ytelse:** Lighthouse 13.5, mobil. Tre simulerte kjøringer og én med DevTools-struping per side.

**Resultat:** layouttesten gikk fra 0 av 10 til 10 av 10.

| Side | Før (runde 1) | Etter |
| --- | --- | --- |
| Alle fem | Ingen `main > section` og ingen `data-testid` for felt og bilde. Tekstseksjonene var om lag 620 px (68ch) brede i en container på 1068 px, altså om lag halve containerbredden. Hero-bildet var om lag 500 px (35 % av bredden) | Alle bånd spenner minst 75 % av containeren. H1, felt og bilde er over folden på 1440 × 900, og bildet er minst 576 px. Feltet er innenfor 600 px på 375 px |

---

## Felles

**Status:** Ferdig. Se åpne spørsmål.

| Område | Funn | Rettet |
| --- | --- | --- |
| Layout | Container 1120 px med 26 px marg | Ja: 1280 px med 24/32/48 px (`max-w-7xl px-6 md:px-8 lg:px-12`), også i header og footer |
| Layout | Seksjoner uten egen bakgrunn, avstand 54 px | Ja: bånd i full bredde med vekslende base og flate, 64 px på mobil og 96 px på desktop |
| Layout | Ingen 12-kolonners grid | Ja, fra `lg`, med 32 px gutter |
| Layout | Tekstseksjonene var én smal kolonne med tomrom til høyre | Ja: overskrift på 5 kolonner og tekst på 7. Bånd med produktbilde er 6/6 og bytter side |
| Layout | Kort i rader med `auto-fit`, som ga tomrom i siste rad | Ja: radene fyller bredden (2, 3 eller 4 kolonner etter antall) |
| Layout | Avsluttende CTA var et kort inne i containeren | Ja: bånd i full bredde, innhold på 8 kolonner |
| Layout | FAQ var én smal kolonne | Ja: 4/8, med overskrift og ingress til venstre |
| Hero | Ingen minstehøyde, og bildet var om lag 500 px | Ja: `min-h-[70svh]`. Bildet er 7/5 og går ut til vinduskanten (om lag 600 px ved 1440) |
| Bilder | Skjermbildene hadde tilfeldige formater | Ja: 16:10 for skjerm og 4:5 for mobil, tatt i 2× (mobil i 3×) |
| Bilder | Produktbildene var for små til å lese (om lag 470 px i halve kort) | Ja: minst 576 px på desktop |
| Typografi | H1 maks 50 px, H2 29–34 px, brødtekst 16 px | Ja: tokens `mk-h1` til `mk-body` (40→64, 32→46, 20→24, 18→20, 17→18) |
| Typografi | STORE BOKSTAVER i etiketter over overskrifter | Ja: normal skrift. Dette går mot designet og er logget i D-86 |
| Avstander | Designverdier som 13, 22 og 26 px | Ja: Tailwinds 4 px-skala på de offentlige sidene |
| Tokens | Hardkodede farger (SVG, skygger) og radius 22 | Ja: `currentColor`, `shadow-shot`, `rounded-frame` |
| Tilgjengelighet | FAQ-knappene hadde ingen minstehøyde | Ja: minst 56 px (`min-h-14`) |

**Lighthouse (mobil), alle fem sidene:**

| | Etter, simulert (3 kjøringer) | Etter, DevTools-struping |
| --- | --- | --- |
| Performance | 94–97 | 95–97 |
| Accessibility | 100 | – |
| SEO | 100 | – |
| Best practices | 100 | – |
| LCP | 2,42–2,90 s (median 2,43–2,58) | 1,67–1,73 s |
| CLS | 0–0,031 | 0–0,032 |
| TBT | – | 149–233 ms |

## /

**Status:** Ferdig

| Område | Funn | Rettet |
| --- | --- | --- |
| Layout | Hero i to like kolonner i 1120 px, eksempelet om lag 530 px | Ja: 6/6 i 1280 px, eksempelet går ut i margen (624 px) |
| Layout | «Slik fungerer det»-kortene hadde `auto-fit` | Ja: 4 × 3 kolonner |
| Layout | «Tre valg …» var tre tekstrader uten bilde | Ja: vekslende 6/6 med tiltakstavla, varmekartet og en kommentar |
| Layout | Visningen av skjermbilder hadde små bilder i halve kort | Ja: tre 6/6-rader (Oversikt, spørreskjema, årshjul) |
| Layout | Lovkravet var et kort med to kolonner | Ja: 4/8 |
| Layout | Pris med `auto-fit` | Ja: 3 × 4, anbefalt pakke først på mobil |
| Mobil | Feltet lå 632 px ned på 375 px | Ja: ingressen er én setning kortere («Kravene i arbeidsmiljøloven dekkes underveis» står i lovkrav-seksjonen), og det er mindre luft øverst |

**Lighthouse (mobil):** Performance 95–96 · SEO 100 · Accessibility 100 · LCP 1,73 s (DevTools)

## /lovkrav

**Status:** Ferdig

| Område | Funn | Rettet |
| --- | --- | --- |
| Layout | Tekst i smal kolonne | Ja: 5/7 |
| Layout | «Slik ser et år ut» hadde bare kort | Ja: årshjulet 6/6 og kortene 4 × 3 under |
| Mobil | Feltet lå 632 px ned | Ja: setningen om 1. januar 2026 er tatt ut av ingressen. Den står i første tekstseksjon |

**Lighthouse (mobil):** Performance 95–97 · SEO 100 · Accessibility 100 · LCP 1,67 s (DevTools)

## /verneombud

**Status:** Ferdig

| Område | Funn | Rettet |
| --- | --- | --- |
| Layout | Tekst i smal kolonne | Ja: 5/7 |
| Bilder | Hero-bildet var varmekartet, som ikke kan vises i 16:10 med detaljpanelet | Ja: tiltakstavla i hero (verneombudet følger tiltakene). Varmekartet står i «Når en avdeling ikke vises» |
| Mobil | Feltet lå 603 px ned | Ja |

**Lighthouse (mobil):** Performance 96–97 · SEO 100 · Accessibility 100 · LCP 1,69 s (DevTools)

## /smaa-bedrifter

**Status:** Ferdig

| Område | Funn | Rettet |
| --- | --- | --- |
| Layout | Tekst i smal kolonne | Ja: 5/7. Varmekartet ved anonymitet, mobilskjermen ved «Når folk ikke sitter ved en PC» |
| Mobil | Feltet lå 661 px ned | Ja: ingressen er kortere («så dere kan bruke tiden på det som kommer fram» er tatt ut) |

**Lighthouse (mobil):** Performance 95–96 · SEO 100 · Accessibility 100 · LCP 1,68 s (DevTools)

## /bygg-og-anlegg

**Status:** Ferdig

| Område | Funn | Rettet |
| --- | --- | --- |
| Bilder | Hero-bildet var en mobil (4:5), som ikke kan være 40 % av bredden og samtidig over folden | Ja: varmekartet (prosjekt mot verksted) i hero. Mobilskjermen står ved «Når kanalen avgjør svarprosenten» |
| Typografi | H1 på 85 tegn ble seks linjer ved 64 px | Ja: H1 er «Arbeidsmiljøundersøkelse for bygg og anlegg», og ingressen sier at den når folk på prosjekt, rigg og verksted |

**Lighthouse (mobil):** Performance 94–97 · SEO 100 · Accessibility 100 · LCP 1,70 s (DevTools)

---

## Unntak fra layouttesten

Ingen. Ingen bånd er merket `data-layout="narrow"`.

## Åpne spørsmål

1. **Mørke varianter av fargene (4.6).** Designet har ingen mørk modus, og CLAUDE.md sier at fargetokens skal hentes fra designet, ikke velges. En mørk palett må derfor bestemmes av dere, eller av en ny designleveranse. Skjermbildene i mørk modus er like de lyse.
2. **`next/font` (3, 7).** Står fortsatt mot D-07 i CLAUDE.md. Fontene lastes fra designets egne filer med `font-display: swap`, og reservefonter med samme mål hindrer at teksten flytter seg.
3. **Org.nr. i footeren.** Står fortsatt åpent.
4. **Kortere ingresser.** Ingressene på forsiden, /lovkrav og /smaa-bedrifter er én setning kortere, og H1 på /bygg-og-anlegg er kortet ned. Det som er tatt ut, står andre steder på siden. Se over at meningen er den samme.
5. **Aksentfarge i hero (4.6).** «Start gratis» er den eneste knappen i full aksentfarge i hero. «Kom i gang» i toppmenyen har samme farge. Den er ikke en del av hero, men vises på samme skjerm.
6. **Andre sider med samme mal.** Plattform, Priser, Om oss, Sikkerhet, Kontakt, Bruksområder og Helse og omsorg bruker samme mal og har fått samme layout. De er ikke med i omfanget og ikke testet mot punkt 4.
7. **Fra runde 1, fortsatt åpne:** Vercel-plan for egendefinerte hendelser, LinkedIn Post Inspector og Rich Results Test (manuelle), INP (felt), og ordlyden om § 3-1 c og § 9-2.
