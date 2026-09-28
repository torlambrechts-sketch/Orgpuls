# GAP-analyse: forskningsrapporten «Soundings» mot Orgpuls

Utarbeidet 28.09.2026 etter Tors ønske om en gjennomgang av *Research dossier · Employee listening
platform · working name “Soundings”* (27.09.2026). Rapporten dekker tre runder: I/O-psykologi, eksperter
på undersøkelsesprodukter, og HR og sluttbrukere. Den inneholder 27 taktikker for svarprosent, 13 funn
om skalaer og formater, 15 markedsledere, 20 designbeslutninger (D01–D20) og 61 kilder.

Hvert punkt om Orgpuls er sjekket i koden på main (15d895b / 9b5a4f8), ikke antatt. Rapportens
evidensgrader er gjengitt:

- **A:** meta-analyse eller RCT.
- **B:** stort datasett.
- **C:** enkeltstudie eller ekspertråd.
- **V:** leverandørpåstand.

Innsats er grovt anslått: **S** ≤ 2 dager, **M** 3–7 dager, **L** 2 uker eller mer.

---

## 1. Sammendrag

**Der vi står sterkt.** På det rapporten kaller det vanskeligste designproblemet for små virksomheter,
anonymitet i små team, er Orgpuls bedre enn de fleste av de 15 lederne:

- k=5 er håndhevet i databasen, uten overstyring.
- Komplementær skjuling hindrer at tall kan regnes ut ved å trekke fra.
- Det finnes anonym toveissamtale på kommentarer (D19).

Vi har også:

- påminnelser bare til dem som ikke har svart;
- stille timer;
- SMS og QR for ansatte uten jobb-e-post;
- driveranalyse (Prioritet) og varmekart;
- tiltakstavle med forslag per faktor og effektmåling i pulsen;
- årshjul;
- publiserte priser.

**Der det er størst avstand:**

- **Handlingssløyfen mot de ansatte.** Det finnes ingen «dette sa dere, dette gjør vi»-side (D11, D20).
  Stillestående tiltak blir ikke purret på (D15). Standardspørsmålet om tiltakene virket mangler (D17).
- **Invitasjonen.** Den loves ikke at resultatene deles, har ikke tallfestet tid og ikke bilde, og
  forvarsel går ikke til ansatte som standard. Det er de taktikkene med sterkest evidens (A).
- **Respondentskjermen.** Den viser ett spørsmål per skjerm og har ingen autolagring, ingen tilbakeknapp
  og ingen gjenstående tid (D10, D18).
- **Analyse og eksport.** Det finnes ikke AI-oppsummering av kommentarer (alle 15 har det), ikke
  Excel-eksport og ikke bransjetall.

**Tre ting er feil i dag og bør rettes uansett.** Se kapittel 3.

1. Egne spørsmål kan skrives i Måleoppsett, men stilles aldri til respondentene.
2. Respondentene loves at teksten deres «sjekkes for gjenkjennelige detaljer før noen leser den». Det
   skjer ikke.
3. Svar i det åpne feltet lagres, men ingen skjerm leser dem.

---

## 2. Hva Orgpuls har i dag, område for område

Status: **Har** / **Delvis** / **Mangler** / **Bygget, avslått** (finnes i koden, men er av i produksjon).

### 2.1 Svarprosent og invitasjon (rapportens del 1; D06, D07, D13)

| Rapportens anbefaling | Evidens | Orgpuls i dag | Status |
|---|---|---|---|
| Kort invitasjon | A (OR 3,26) | Kort: hilsen, formål, anonymitetslinje, lenke, frist | **Har** |
| Bilde i invitasjonen | A (OR 3,05) | Ingen bilde eller logo i e-posten | **Mangler** |
| Ikke «Survey» i emnelinjen | A (OR 0,81) | «{Virksomhet}: svar på {runde}», uten «undersøkelse» | **Har** |
| Frist oppgitt | A (OR 1,18) | «Svarfrist: {dato}» | **Har** |
| Tidsestimat | V/C | Bare «Det tar noen få minutter», ikke et tall | **Delvis** |
| Konfidensialitet forsikret | A (OR 1,33) | Anonymitetslinje med terskel | **Har** |
| Tilby resultatene som insentiv | A (OR 1,36) | Ikke i invitasjonen. Resultatmeldingen går bare hvis «alle ansatte» står i varslingsstigen, og det gjør de ikke som standard | **Mangler** |
| Forvarsel før invitasjonen | A (OR 1,36) | Forvarsel går til verneombud, tillitsvalgte, daglig leder og avdelingsledere. Alle ansatte finnes som mottaker, men ingen skjerm legger dem til | **Delvis** |
| Hilsen fra ledelsen | C | Bare SMS har egen tekst; e-posten har ikke | **Mangler** |
| Påminnelser bare til dem som ikke har svart | A (OR 1,60) | Ja. Dag 1–14 kan velges, og en siste påminnelse dagen før frist | **Har** |
| Påminnelse på tidspunkt med mye e-post | C | Runder åpner kl. 09 første tirsdag; stille timer 21–07. Ingen egen tidsstyring | **Delvis** |
| SMS-påminnelser | A (OR 1,53, KI krysser 1) | SMS: mangler / påminnelse / alle | **Har** |
| To ukers vindu som starter midt i uka | B | Starter tirsdag. Standard er 7 dager, valgbart 1–60 | **Delvis** |
| Takk etter svar | C | «Takk. Det tok rundt N minutter.» | **Har** |
| Kiosk eller nettbrett for ansatte uten PC | C | QR-plakat gir personlig lenke på SMS eller e-post; ingen delt enhet | **Delvis** (bevisst) |
| Ingen faste insentiver (D13) | A/C | Ingen insentiver | **Har** |

### 2.2 Deltakelse og konfidensialitet (D08, D09)

| Anbefaling | Orgpuls i dag | Status |
|---|---|---|
| Deltakelse per avdeling underveis | Målinger viser svarprosent per gruppe, skjult under k | **Har** |
| Varsel når en avdeling henger 10 poeng etter | Bare fargekoder (≥80/≥60). `extend_if_low` lagres, men brukes ikke | **Mangler** |
| Analyse av dem som ikke svarte mot turnover og ansiennitet (D09) | Ingen, og bevisst: produktet viser aldri hvem som ikke svarte | **Mangler** (bevisst) |
| Terskel 5 som standard, kan velges oppover, ingen overstyring (D08) | k=5 i databasen, kan heves til 10, ingen overstyring, komplementær skjuling | **Har** (bedre enn de fleste) |
| Små team rulles opp | Holdes utenfor og telles i helheten; ingen samlet rad | **Delvis** |
| Maskering av navn og sjeldne detaljer i kommentarer | Ingen, men respondentene loves det | **Mangler + brutt løfte** |
| Anonymt svar på kommentarer (D19) | Samtaler med kapabilitetsnøkkel; leder kan be om direkte kontakt | **Har** |
| Løftet gjentatt på hver respondentskjerm | Tekstene finnes (`respond.promise1-4`), men brukes ikke | **Mangler** |

### 2.3 Instrument og spørsmål (D01–D05, D12, D17)

| Anbefaling | Orgpuls i dag | Status |
|---|---|---|
| 5 punkter med tekst på alle, 7/10 valgfritt (D01) | 5 punkter med tekst, pluss «Ikke relevant for meg». Ingen 7/10 | **Har / Delvis** |
| Varianter med spesifikk ordlyd og vakt mot ja-tendens (D02) | Formuleringsvarianter i bransjemoduler (barnehage/skole, forenklet/utvidet). Ingen omvendt formulerte utsagn | **Delvis** |
| Indeks på 4–5 utsagn som hovedtall, eNPS som følgetall (D03) | Arbeidsmiljøindeks over 11 faktorer. «Anbefaler oss» på 1–5, regnet som eNPS (Culture Amp har validert en variant på 5 punkter) | **Har** |
| Lengdestyring med levende tidsestimat (D04) | Tidsestimat i veiviser og moduler; faste tak (33 kjerneutsagn, 5 egne) | **Delvis** |
| Demografi fra registeret, ikke spørsmål (D05) | Gruppe fra registeret. Bakgrunnsspørsmål er bygget, men av | **Har** |
| Spørsmålstyper: flervalg, rangering, tvungent valg, matrise | Likert, enkeltvalg, ja/nei-telling, fritekst. Ikke flervalg, rangering eller matrise | **Delvis** |
| Hopp og forgrening | Ingen. Rekkefølgen stokkes stabilt per svarer | **Mangler** |
| Rotasjon av spørsmål i puls (D12) | Pulsen spør alle utsagn for faktorer med åpne tiltak | **Mangler** |
| Fast spørsmål: «Tiltakene etter forrige kartlegging har hatt positiv effekt» (D17) | Finnes ikke | **Mangler** |
| Egne spørsmål | Kan skrives (inntil 5), men **stilles aldri** | **Feil** |

### 2.4 Respondentopplevelse (D10, D18)

| Anbefaling | Orgpuls i dag | Status |
|---|---|---|
| 4–6 utsagn per side, aldri ett per side (D18) | Ett spørsmål per skjerm | **Mangler** |
| Fremdrift og gjenstående tid | Fremdriftslinje og «n / totalt»; ingen gjenstående tid | **Delvis** |
| Autolagring, fortsett senere | Svar holdes i nettleseren og sendes samlet til slutt | **Mangler** |
| Tilbakeknapp | Ingen | **Mangler** |
| Tastatursnarveier (tall svarer) | Ingen | **Mangler** |
| Ren hvit bakgrunn (A, OR 1,31) | Designets egen bakgrunn (lys krem) | **Delvis** (design) |
| Tilgjengelighet (WCAG) | Axe i Playwright på respondentflyten; feiler på alvorlige funn | **Har** |
| Flere språk | Bokmål; engelsk med godkjenning; pl, uk, lt, sv, da som pilot | **Har** |

### 2.5 Analyse og rapportering

| Anbefaling | Orgpuls i dag | Status |
|---|---|---|
| Varmekart per gruppe | Varmekart | **Har** |
| Driver- eller påvirkningsanalyse | Prioritet: score mot korrelasjon med «Anbefaler oss», i kvadranter | **Har** |
| Utvikling over tid, sammenligning | Utvikling og Sammenlign | **Har** |
| Ledere ser sitt eget uten HR (selvbetjening) | Avdelingsleder ser egen avdeling | **Har** |
| AI-tema og oppsummering av kommentarer | Tema per faktor med opptelt tone, uten AI | **Mangler** |
| Bransjetall | «Ikke koblet til ennå» | **Mangler** |
| Eksport til Excel, PowerPoint og PDF | PDF via utskrift, i fire versjoner etter mottaker. Ikke Excel eller PowerPoint | **Delvis** |
| Prediktiv turnoverrisiko | Ingen | **Mangler** (bevisst) |
| Åpent felt leses | Svarene lagres, men vises ingen steder | **Feil** |

### 2.6 Handlingssløyfen (D11, D14–D16, D20)

| Anbefaling | Orgpuls i dag | Status |
|---|---|---|
| Eid tiltakstavle med eier og frist | Tavle, liste og plan; eier, frist, mål, trinn | **Har** |
| Ferdige tiltaksforslag per driver | Tre forslag per faktor | **Har** |
| Effektmåling i neste puls | Pulsen spør igjen på faktorer med åpne tiltak; effektrunde | **Har** |
| Flerårig plan (D16) | Tiltakene lever på tvers av runder | **Har** |
| Purring på stillestående tiltak; ferdiggrad vist teamet (D15) | Bare en teller for forfalte i appen. `notify_vo_on_overdue` lagres, men sendes ikke | **Mangler** |
| «Dette sa dere, dette gjør vi»-side innen to uker, lovet i invitasjonen (D11, D20) | Utskriftsrapporten for «De ansatte». Ingen side, ingen lenke i neste invitasjon | **Delvis** |
| Kadens styrt av kapasitet til å følge opp (D14) | Årshjul; ny puls sperres bare mens en runde er åpen eller mindre enn 14 dager etter forrige | **Mangler** |
| Alltid åpen forslagskasse eller «si fra»-kanal | Ingen (flagget finnes, men ingenting er bygget) | **Mangler** |

### 2.7 Kanaler, livsløp og tilgrensende moduler

| Anbefaling | Orgpuls i dag | Status |
|---|---|---|
| E-post, SMS | Ja | **Har** |
| Microsoft Teams, Slack | Teams står som «Ikke bygget»; Slack finnes ikke | **Mangler** |
| Synk med HR-system (HRIS) | CSV eller innliming. Tripletex, Visma og Huldt & Lillevik står som «Kommer» | **Mangler** |
| Livsløpsundersøkelser (onboarding, exit), 360, DEI | Ingen | **Mangler** |
| 1:1, mål og OKR, anerkjennelse, prestasjon | Ingen, og utenfor vår kjerne | Bevisst utelatt |
| Publiserte priser | Faste nivåer: Liten 265 kr/mnd (≤25), Vanlig 565 kr/mnd (26–100), avtale over 100 | **Har** |

---

## 3. Feil og brutte løfter i dag (P0, rettes uansett)

Dette er ikke nye funksjoner. Produktet sier noe det ikke gjør.

| # | Problem | Hvorfor det haster | Forslag | Innsats |
|---|---|---|---|---|
| P0-1 | **Egne spørsmål stilles aldri.** Måleoppsett lar deg skrive inntil 5, men skjemaet tar dem ikke med. | Kunden tror de spør noe de ikke spør | Ta dem med i skjemaet og i resultatene (k-skjermet, som øvrige utsagn), eller skjul funksjonen til den virker | M |
| P0-2 | **«Sjekkes for gjenkjennelige detaljer» er ikke sant.** Respondenten loves det to steder, men DEVIATIONS sier kommentarene ikke gjennomgås. | Et anonymitetsløfte som ikke holdes, i et produkt som selger anonymitet | Endre teksten nå (S), og bygg maskering (P1-8) | S |
| P0-3 | **Åpent felt leses ikke.** Svarene lagres i `extra_answers.free_text`, men ingen skjerm viser dem. | Ansatte skriver noe ingen leser | Vis dem k-skjermet under Kommentarer (etter maskering), eller slutt å spørre | S–M |
| P0-4 | **Innstillinger uten virkning.** «Forleng ved lav svarprosent» og «varsle verneombud om forfalte tiltak» lagres, men gjør ingenting. | Innstillinger som lyver | Bygg dem (se P1-5 og P1-6) eller fjern dem | S |

---

## 4. Prioritert liste

Rekkefølgen veier fire ting: hvor sterk evidensen er, gevinsten for virksomheter under 200 ansatte, om
det støtter lovkravet (dokumentasjon av oppfølging), og innsats. Punkter som ville svekke anonymiteten er
merket og plassert lavt uansett gevinst.

### P1: Høy gevinst, lav til middels innsats (anbefalt neste)

| # | Funksjon | Hvorfor (rapporten) | Hvordan i Orgpuls | Innsats |
|---|---|---|---|---|
| P1-1 | **Bedre invitasjon:** tallfestet tid («ca. 6 minutter»), løfte om at resultatene deles og når, logo eller bilde, valgfri hilsen fra daglig leder | A-evidens: bilde OR 3,05, resultater som insentiv OR 1,36; ledelsesforankring C | Beregn tid fra antall utsagn (finnes i veiviseren). Hilsen som felt i Innstillinger, som `sms_text`. Logo i e-postmalen | S–M |
| P1-2 | **Forvarsel og resultatmelding til alle ansatte som standard** | A: forvarsel OR 1,36; resultater som insentiv | Legg «alle ansatte» inn i standard varslingsstige, med én bryter i Årshjul | S |
| P1-3 | **«Dette sa dere, dette gjør vi»-side for ansatte**, lenket fra neste invitasjon | D11, D20; analytikerkonsensus om at det å spørre uten å handle senker tilliten | Offentlig side per runde med k-skjermede hovedtall og valgte tiltak med status; lenke i resultatmelding og neste invitasjon (flaggene er planlagt, engasjement fase 2) | M |
| P1-4 | **Respondentskjerm med én faktor (3 utsagn) per side, autolagring, tilbake, gjenstående tid, løftet synlig, tastatursnarveier** | D10, D18 (B/C): 4–6 per side gir best fullføring og minst frafall | Grupper per faktor. Lagre i nettleseren (ikke på server, slik at svar ikke kobles). Bruk de ubrukte `respond.promise`-tekstene | M |
| P1-5 | **Purring på forfalte og stillestående tiltak** til eier, med kopi til verneombud | D15: tiltak som lages men ikke fullføres gir ingen bedring; å gjøre ingenting gir nedgang | Ny utboks-type; bruk `notify_vo_on_overdue`; ukentlig sammendrag | S–M |
| P1-6 | **Varsel når en avdeling henger ≥10 poeng etter** underveis, med forslag om ekstra påminnelse og forlenget frist | D07, D09; B-data om ikke-tilfeldig frafall | Bare for grupper ≥k (som i dag). Bruk `extend_if_low` | S |
| P1-7 | **Fast spørsmål: «Tiltakene etter forrige kartlegging har hatt positiv effekt på arbeidsplassen min»**, fra andre syklus | D17 (Gallup); dokumenterer effekt, som er nøyaktig det Arbeidstilsynet spør etter | Nytt tilleggsspørsmål som data (migrasjon og meldingsnøkkel), vist ved siden av indeksen | S |
| P1-8 | **Automatisk maskering av navn i kommentarer** før leder leser | D08; brukerklager på anonymitet i små team | Masker alle navn i virksomhetens eget register (vi har listen) og eget navn på avdelinger og lokasjoner; deterministisk, ingen AI. Kan utvides med sjeldne ord | M |
| P1-9 | **Lengre standardvindu for grunnlinje (10–14 dager)** | B: to uker dekker ferie og skift | Endre standard `close_days_grunnlinje`; pulsen beholder 7 | S |

### P2: Strategisk og differensierende, middels til stor innsats (vurder)

| # | Funksjon | Hvorfor | Merknad | Innsats |
|---|---|---|---|---|
| P2-1 | **AI-oppsummering og temaer av kommentarer** | Alle 15 ledere har det; rapporten kaller det grunnmur | Må tilfredsstille invariant 7 (ingen fritekst i logg eller analyse): EU-hostet modell, databehandleravtale, k-skjerming, kjøres bare på tekster som allerede er maskert. Krever din beslutning om leverandør | M–L |
| P2-2 | **Excel/CSV-eksport av resultater** (bare k-skjermede aggregater) | Brukerne ber om XLS/PPT/PDF | Excel først; PowerPoint senere eller aldri | S–M |
| P2-3 | **Teams-levering** (invitasjon og påminnelse) og **Entra ID-synk** av ansatte | Grunnmur hos lederne; ingen kontrollert evidens for bedre svarprosent | Står som «Ikke bygget» i Integrasjoner. Mange norske SMB-er bruker M365 | L |
| P2-4 | **Synk med norske HR- og lønnssystemer** (Tripletex, Visma, Huldt & Lillevik) | D05: demografi fra registeret | Står som «Kommer». Første integrasjon gir mest | L |
| P2-5 | **Kadens styrt av oppfølging** (D14): varsle eller sperre ny puls når tiltak fra forrige runde mangler status | D14, D20 | Varsel først, sperre som valg; henger på P1-5 | S–M |
| P2-6 | **Alltid åpen anonym forslagskasse / «si fra»** | TINYpulse, CultureMonkey; billig å ta i bruk | Må skilles tydelig fra varsling etter aml. kap. 2A (juridisk avklaring); samme anonymitetsmekanisme som samtaler | M |
| P2-7 | **Bransjetall** | Ønsket av kjøpere; rapporten advarer mot at tallene varierer | Bygg fra egen kundebase når det finnes nok virksomheter per bransje (k også på tvers av virksomheter); vis først som «virksomheter som ligner dere» | L |
| P2-8 | **Flere spørsmålstyper for egne spørsmål** (flervalg, rangering av korte lister, enkel forgrening) | Hopp og forgrening er en kjent svakhet hos én av lederne | Bare for egne spørsmål; kjerneinstrumentet ligger fast | M |

### P3: Vurdert, anbefales ikke nå

| # | Funksjon | Hvorfor ikke |
|---|---|---|
| P3-1 | **Rotasjon og utvalg av spørsmål i puls (D12)** | Under 200 ansatte og k=5 ville utvalg få antall svar per utsagn under terskelen. Da skjules resultatene. Konflikt med vår viktigste egenskap |
| P3-2 | **Analyse av dem som ikke svarte mot turnover (D09)** og **prediktiv turnoverrisiko** | Krever persondata koblet mot deltakelse, altså i strid med anonymitet ved fravær (invariant 2) |
| P3-3 | **Skala på 7 eller 10 punkter, varianter med spesifikk ordlyd og vakt mot ja-tendens i kjernen (D01, D02)** | Kjerneinstrumentet er QPS Nordic og må være sammenlignbart over tid og mot kilden. Rapporten sier selv at flere punkter ikke gir mer gyldighet |
| P3-4 | **eNPS på 0–10** | «Anbefaler oss» på 1–5 er i tråd med rapporten (validert variant på 5 punkter, rapportert som trend) |
| P3-5 | **Livsløpsundersøkelser (onboarding og exit), 360** | Svarene er individuelle: ett exit-svar kan ikke være anonymt med k=5. Kan senere gjøres som samlet halvårsvindu |
| P3-6 | **Kiosk på delt enhet** | Vi har bevisst én personlig lenke per person; QR-plakaten dekker ansatte uten PC uten delt enhet |
| P3-7 | **1:1, mål og OKR, anerkjennelse, prestasjonsvurdering** | Utenfor kjernen (lovkravet); markedet er fullt av det |
| P3-8 | **Ren hvit bakgrunn i skjemaet** (A, OR 1,31) | Studien er gjort på generelle nettskjema; designet er fast. Kan testes senere som A/B hvis svarprosent blir et problem |

---

## 5. Anbefalt rekkefølge

1. **Denne uka:** P0-1 til P0-4, rett opp det produktet sier og ikke gjør.
2. **Neste 2–3 uker:** P1-1, P1-2, P1-7 og P1-9 (små, sterk evidens), deretter P1-4 og P1-8.
3. **Deretter:** P1-3, P1-5 og P1-6, handlingssløyfen mot ansatte (engasjement fase 2, oppgave #116).
4. **Beslutninger du må ta før P2:** leverandør og databehandleravtale for AI (P2-1), hvilken
   HR-integrasjon som kommer først (P2-4), og juridisk avklaring av «si fra» mot varsling (P2-6).

## Status 28.09.2026: P0 og P1 er bygget

| # | Bygget | Migrasjon | Logg |
|---|---|---|---|
| P0-1 | Egne spørsmål hører til runden (inntil 5), stilles i skjemaet og vises k-skjermet i Resultater | 0095 | D-145, X-080 |
| P0-2 | Løftet stemmer nå: kommentarer og åpne svar maskeres før noen leser dem (se P1-8) | 0095 | D-145 |
| P0-3 | Åpent felt og fritekst-spørsmål leses under Kommentarer, maskert, av daglig leder, ved minst k svar | 0095 | D-145, X-080 |
| P0-4 | «Forleng ved lav svarprosent» og «varsle verneombud om forfalte tiltak» virker | 0096, 0099 | D-146, D-149 |
| P1-1 | Invitasjonen sier antall minutter, lover at resultatene deles, og har daglig leders hilsen og virksomhetens logo (lastes opp i Oppsett › Selskap) | 0099, 0104 | D-149, D-154 |
| P1-2 | «Alle ansatte» får forvarsel og resultatmelding som standard, med én bryter i Årshjul | — | D-148 |
| P1-3 | «Dette sa dere, dette gjør vi»: side per lukket runde, lenket fra resultatmeldingen og neste invitasjon | 0100 | D-151, X-081 |
| P1-4 | Respondentskjermen: én faktor per side, løftene først, utkast i nettleseren, tilbake, gjenstående tid, tastatur | — | D-150 |
| P1-5 | Ukentlig purring på forfalte og stillestående tiltak til eier, kopi til verneombud | 0098, 0099 | D-149 |
| P1-6 | Varsel til daglig leder når en avdeling henger 10 poeng etter midtveis | 0098, 0099 | D-149 |
| P1-7 | Fast spørsmål om effekt av tiltakene fra andre syklus, vist i Resultater | 0097 | D-147 |
| P1-8 | Maskering av navn, avdelinger og steder, deterministisk, i databasen | 0095 | D-145 |
| P1-9 | Grunnlinjen står åpen 14 dager som standard, pulsen 7 | 0097 | D-147 |

Gjenstår for Tor: godkjenn den engelske undersøkelsen på nytt i admin › Legal review (teksten er
endret), og skriv eventuelt en hilsen i Målinger › Innstillinger.

---

## 6. Forbehold om rapporten

- **Effektstørrelser.** Cochrane-tallene gjelder pasienter og fagfolk, ikke ansatte. Les dem som retning,
  ikke som prognose (rapportens egen merknad).
- **Skjermflate.** Rapporten forutsetter at respondenten svarer på PC. Orgpuls er bygget for mobil, fordi
  mange ansatte (renhold, bygg, handel, helse) ikke har PC. Anbefalingen om flere spørsmål per side gjelder
  likevel.
- **Pulskadens og kanaler.** Pulsens takt (8–10 spørsmål månedlig) og at Teams gir bedre svarprosent er
  ifølge rapporten selv ikke dokumentert med kontrollerte studier.
- **Leverandørkilder.** Flere leverandører er bare nådd via sekundærkilder, og «not documented» betyr
  ikke at funksjonen mangler.
