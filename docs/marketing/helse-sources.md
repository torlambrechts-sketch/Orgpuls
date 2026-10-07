# /helse-og-omsorg – kilder for tall og faktapåstander

Hvert tall og hver faktapåstand om bransjen på /helse-og-omsorg står her, med kilden slik den ble hentet.
Kildene står i samme rekkefølge som på siden, der de er nummerert 1–14 (`content/industries/landing.ts`,
`sources`; meldingene er `site.bransje.helse`). Alle hentet 2026-10-03 (3. oktober 2026). Ingen tall på
siden står uten en linje her; et tall som ikke kunne kildebelegges eller ville gitt et skjevt bilde, er tatt
ut (se «Ikke brukt» nederst). Sidetall er rapportens egne (trykte) sidetall.

## 1. SSB – tabell 07203: Sysselsatte (AKU) etter kjønn, næring (SN2007), heltid/deltid og år

<https://www.ssb.no/statbank/table/07203/> – hentet 2026-10-03 gjennom SSBs åpne API
(`https://data.ssb.no/api/v0/no/table/07203`, begge kjønn, 2025).

| Næring, 2025 (1 000 personer) | I alt | Kort deltid (1–19 t) | Lang deltid (20–36 t) | Heltid (37 t+) |
|---|---|---|---|---|
| 00-99 Alle næringer | 2 903 | 402 | 302 | 2 190 |
| 86-88 Helse- og sosialtjenester | 588 | 96 | 108 | 380 |

| Påstand på siden | Utregning |
|---|---|
| Rundt 588 000 jobber i helse- og sosialtjenester – om lag én av fem sysselsatte i Norge | 588 av 2 903 = 20,3 % |
| 35 % i helse- og sosialtjenester jobber deltid, mot 24 % i alle næringer | (96 + 108) / 588 = 34,7 %; (402 + 302) / 2 903 = 24,3 % |

Merk: næringen 86-88 (SN2007) omfatter også barnehager (88.91). Siden skriver derfor «helse- og
sosialtjenester», SSBs eget navn, og ikke «helse og omsorg», der den bruker disse to tallene.

## 2. SSB – tabell 12440: Sykefravær for lønnstakere etter næring, 2. kvartal 2026

<https://www.ssb.no/statbank/table/12440/> – hentet 2026-10-03 gjennom SSBs åpne API
(`https://data.ssb.no/api/v0/no/table/12440`, begge kjønn, egenmeldt og legemeldt, ikke sesongjustert).

| Næring | 2025K2 | 2026K1 | 2026K2 |
|---|---|---|---|
| A-U Alle næringer | 6,4 | 7,3 | 6,6 |
| Q Helse- og sosialtjenester | 9,4 | 10,5 | 9,6 |
| H Transport og lagring (nest høyest i 2026K2) | | | 7,1 |

| Påstand på siden | Kilden |
|---|---|
| 9,6 % sykefravær i helse- og sosialtjenester i 2. kvartal 2026 – høyest av alle næringer, mot 6,6 % i snitt | Tabellen over: Q 9,6, A-U 6,6; Q er høyest av de 16 næringshovedområdene i 2026K2 |

Samme budskap hos Nav, «Økt sykefravær i første halvår», publisert 3. september 2026,
<https://www.nav.no/no/nav-og-samfunn/statistikk/sykefravar-statistikk/nyheter/okt-sykefravaer-i-forste-halvar>,
hentet 2026-10-03: «Helse- og sosialtjenester er næringen med det høyeste sykefraværet på 8,4 prosent.» (Navs
tall er bare det legemeldte; SSBs 9,6 er egenmeldt og legemeldt.)

## 3. STAMI / NOA – Fakta om arbeidsmiljøet på sykehjem og omsorgsinstitusjoner

Statens arbeidsmiljøinstitutt, Nasjonal overvåking av arbeidsmiljø og helse. Hovedkilden er
Levekårsundersøkelsen om arbeidsmiljø 2022 (SSB); alder, kjønn, utdanning og innvandrere fra microdata.no.
<https://noa.stami.no/yrker-og-naeringer/noa/sykehjem/> – hentet 2026-10-03.

| Påstand på siden | Kilden |
|---|---|
| 34 % av de ansatte på sykehjem har vært utsatt for vold, mot 5 % av alle sysselsatte | «34 % Alle sysselsatte: 5 % Er utsatt for vold … vold og aggresjon fra beboere» |
| 27 % for hets eller trusler | «På sykehjem og omsorgsinstitusjoner oppgir også 27 % at de er utsatt for hets eller trusler.» |
| 35 % på sykehjem opplever høye emosjonelle krav (mot 20 %) | «35 % Alle sysselsatte: 20 % Opplever høye emosjonelle krav» |
| 22 % opplever høy grad av rollekonflikt, mot 13 % – blant annet motstridende forventninger fra beboere, pårørende, ledere og kolleger | «22 % Alle sysselsatte: 13 % Opplever høy grad av rollekonflikt. Knyttet til håndtering av motstridende forespørsler og forventninger fra beboere, pårørende, ledere og kolleger» |
| 18 % er utsatt for uønsket seksuell oppmerksomhet, mot 5 % | «18 % Alle sysselsatte: 5 % Er utsatt for uønsket seksuell oppmerksomhet» |
| Om lag 9 av 10 jobber utenom vanlig dagtid, og 1 av 3 jobber om natten | «Om lag 9 av 10 jobber utenom ordinær dagtid mellom klokken 06 og 18 (skift/turnus). 1 av 3 jobber om natten.» |
| 24 % oppgir søvnvansker som helt eller delvis skyldes jobben | «24 % oppgir søvnvansker som helt eller delvis skyldes jobben» |
| 30 % løfter i ubekvemme stillinger (mot 14 %) | «30 % Alle sysselsatte: 14 % Løfter i ubekvemme stillinger» |
| 35 % oppgir ryggsmerter som helt eller delvis skyldes jobben | «35 % oppgir ryggsmerter som helt eller delvis skyldes jobben» |
| 1 av 5 som jobber på sykehjem, er innvandrere | «1 av 5 som jobber på sykehjem eller i andre pleie- og omsorgsboliger er innvandrere.» |
| 1 av 3 på sykehjem med sykefravær sier at fraværet har sammenheng med jobben; slikt fravær kan ofte forebygges | «På sykehjem og omsorgsinstitusjoner oppgir 1 av 3 med sykefravær at fraværet er relatert til jobben.» «Sykefravær som er relatert til jobben, kan ofte forebygges på den enkelte arbeidsplassen.» |

Arbeidstilsynet gjengir de samme to voldstallene i nyheten «Vald og truslar i sjukeheim og i heimetenesta kan
og skal førebyggast», publisert 21.03.2025,
<https://www.arbeidstilsynet.no/nyheter/vold-og-trusler-i-sykehjem-og-i-hjemmetjenesten-kan-og-skal-forebygges/>,
hentet 2026-10-03: «Forsking frå Statens arbeidsmiljøinstitutt (STAMI) viser at 34 prosent av sysselsette på
sjukeheim og omsorgsinstitusjonar har vorte utsette for vald. 27 prosent oppgir at dei har vorte utsette for
hets eller truslar.»

## 4. STAMI / NOA – Fakta om arbeidsmiljøet i hjemmetjenesten

<https://noa.stami.no/yrker-og-naeringer/noa/hjemmetjenesten/> – hentet 2026-10-03. Levekårsundersøkelsen om
arbeidsmiljø 2022.

| Påstand på siden | Kilden |
|---|---|
| 38 % i hjemmetjenesten opplever høye emosjonelle krav, mot 20 % av alle sysselsatte | «38 % Alle sysselsatte: 20 % Opplever høye emosjonelle krav» |
| I hjemmetjenesten er tallene (vold; hets eller trusler) 12 og 18 % | «12 % Alle sysselsatte: 5 % Er utsatt for vold» «I hjemmetjenesten oppgir også 18 % at de er utsatt for hets eller trusler.» |
| I hjemmetjenesten er 34 % ofte psykisk utmattet etter jobb | «34 % er ofte psykisk utmattet etter jobb» |
| 34 % i hjemmetjenesten løfter i ubekvemme stillinger, mot 14 % | «34 % Alle sysselsatte: 14 % Løfter i ubekvemme stillinger» |
| 2 av 5 i hjemmetjenesten med sykefravær sier at fraværet har sammenheng med jobben | «I hjemmetjenesten oppgir 2 av 5 med sykefravær at fraværet er relatert til jobben.» |

Bakgrunn, ikke brukt på siden: 47 % i hjemmetjenesten opplever lav grad av jobbkontroll, mot 25 %; 3 av 4
jobber skift eller turnus og 1 av 5 jobber om natten.

## 5. Arbeidstilsynet – Signal nr. 1 2024: Arbeidstilsynets bransjekunnskap

<https://www.arbeidstilsynet.no/globalassets/rapportar/signal/signal-1-2024.pdf> – hentet 2026-10-03 (PDF,
teksten trukket ut og lest). Innspill fra 145 av Arbeidstilsynets inspektører.

| Påstand på siden | Hva kilden sier (side) |
|---|---|
| Inspektørene beskriver at det meldes relativt få avvik på arbeidsmiljøområdet i helse- og sosialtjenester, selv om mange burde vært meldt; dermed blir heller ikke den reelle arbeidsmiljøtilstanden synlig | s. 13 («Åpne svar – helse- og sosialtjenester»): «En gjenganger er at det meldes relativt få avvik på arbeidsmiljøområdet, selv om de har mange som burde vært meldt. Dermed synliggjøres heller ikke den reelle arbeidsmiljøtilstanden i virksomhetene.» |
| Inspektørene beskriver en næring med høy arbeidsbelastning og tidspress, og en ubalanse mellom oppgaver og ressurser | s. 13: «Flere av inspektørene beskriver en næring med høy arbeidsbelastning og tidspress, og høyt sykefravær og gjennomtrekk av ansatte (turnover).» s. 2: «Pleie og omsorg kjennetegnes av høyt arbeidspress, trang økonomi, store arbeidsmiljøutfordringer og negativ utvikling. Innspillene inkluderer blant annet ubalanse mellom oppgaver og ressurser, stress, tunge løft, krysspress, vold og trusler.» |

Rapporten sier selv (s. 2) at innspillene «ikke trenger å gi et presist bilde av tilstanden i de ulike
næringene». Siden skriver derfor «Arbeidstilsynets inspektører beskriver», ikke at Arbeidstilsynet har målt
det.

## 6. Lovdata – arbeidsmiljøloven

<https://lovdata.no/lov/2005-06-17-62> – hentet 2026-10-03 (§ 4-3 og § 4-1 lest på Lovdata).

- § 4-3 andre ledd: psykososiale arbeidsmiljøfaktorer omfatter blant annet «a) uklare eller motstridende krav
  og forventninger i arbeidet, b) emosjonelle krav og belastninger i arbeid med mennesker, c) arbeidsmengde og
  tidspress som innebærer ubalanse mellom arbeidet som skal utføres, og den tiden som er til rådighet, d)
  støtte og hjelp i arbeidet»; første ledd: faktorene skal være «fullt forsvarlige». Siden: «De psykososiale
  faktorene skal være fullt forsvarlige – blant annet uklare eller motstridende krav, emosjonelle krav og
  belastninger i arbeid med mennesker, og arbeidsmengde og tidspress.»
- § 4-3 sjette ledd: vern mot «vold, trusler og uheldige belastninger som følge av kontakt med andre». Siden
  gjengir ordlyden fra den gamle /helse-og-omsorg, som Tor godkjente 2026-09-27 (X-065).
- § 4-1 tredje ledd: «Det skal vurderes om det er særlig risiko knyttet til alenearbeid i virksomheten.»
  Siden bruker samme ordlyd som /handel (D-207).
- § 3-1 andre ledd bokstav c: ordlyden er den samme som på /lovkrav, /handel og /bygg-og-anlegg.

## 7. Lovdata – forskrift om utførelse av arbeid, kapittel 1A og 3A

<https://lovdata.no/forskrift/2011-12-06-1357> – hentet 2026-10-03 (samme kilde og ordlyd som /handel og
/bygg-og-anlegg). Kapittel 3A erstatter tidligere kapittel 23A fra 1. januar 2026.

## 8. Arbeidstilsynet – Årsrapport 2025

«Årsrapport 2025 – En analyse av Arbeidstilsynets innsats».
<https://www.arbeidstilsynet.no/globalassets/rapportar/arsrapport/arsrapport-2025/arbeidstilsynets-arsrapport-2025.pdf>
– hentet 2026-10-03 (samme kilde som /bygg-og-anlegg, lest på nytt for helse).

| Påstand på siden | Hva kilden sier (side) |
|---|---|
| I 2025 var sykehjem og hjemmetjeneste blant næringene Arbeidstilsynet prioriterte i tilsyn med psykiske og muskel- og skjelettplager | s. 20: «I 2025 gjennomførte vi 2 365 tilsyn hvor vi kontrollerte at arbeidsgivere drev forsvarlig forebygging av arbeidsrelaterte muskel- og skjelettplager og psykiske plager. … Vi prioriterte å rette innsats mot byggevirksomheter, frisører, private barnevernstjenester, sykehjem og hjemmetjeneste.» |
| I tilsyn med sykehjem og hjemmetjeneste blir vold og trusler ofte løftet fram som en utfordring | s. 21: «I tilsyn med sykehjem og hjemmetjeneste ser vi for eksempel at forhold knyttet til vold og trusler ofte blir løftet opp som utfordrende for både arbeidsgivere og arbeidstakere.» |
| I 2025 manglet over sju av ti virksomheter tilstrekkelig kartlegging, risikovurdering, plan og tiltak mot vold og trusler | s. 21, neste setning: «I tilsynene i 2025 fant vi at i overkant av sju av ti virksomheter manglet tilstrekkelig kartlegging, risikovurdering, plan og tiltak for å beskytte arbeidstakerne mot vold, trussel om vold, og uheldige belastninger som følge av kontakt med andre.» |

Setningen om sju av ti står i avsnittet om tilsyn med vold og trusler, rett etter setningen om sykehjem og
hjemmetjeneste, og fortsetter «Det samme gjelder tilsyn med barnevernstjenester». Siden gjengir de to
setningene i samme rekkefølge og sier ikke at tallet bare gjelder sykehjem og hjemmetjeneste.

## 9. STAMI / NOA – Fakta om arbeidsmiljøet på helseklinikker

<https://noa.stami.no/yrker-og-naeringer/noa/helseklinikker/> – hentet 2026-10-03. Levekårsundersøkelsen om
arbeidsmiljø 2022; virksomhetsstørrelse fra microdata.no.

| Påstand på siden | Kilden |
|---|---|
| Om lag halvparten av dem som jobber på helseklinikker – blant annet lege- og tannlegeklinikker og fysikalske institutter – er i virksomheter med under 10 sysselsatte | «Om lag 89 000 personer jobber på helseklinikker eller tilbyr helsetjenester. Dette inkluderer blant annet lege- og tannlegeklinikker, helsestasjon, laboratorier og fysikalske institutter.» «Om lag halvparten jobber i små virksomheter med under 10 sysselsatte.» |

Bakgrunn, ikke brukt på siden: 41 % opplever høye emosjonelle krav (mot 20 %), 27 % høye krav og lav kontroll
(mot 16 %), 15 % er utsatt for hets eller trusler (mot 8,8 %).

## 10. Fafo-rapport 2025:10 – Kartlegging av verneombudenes arbeid

Rolf K. Andersen, Mona Bråten og Johanne Stenseth Huseby, Fafo 2025.
<https://www.fafo.no/images/pub/2025/20923.pdf> – hentet 2026-10-03 (samme kilde og tall som /handel og
/bygg-og-anlegg).

| Påstand på siden | Hva kilden sier (side) |
|---|---|
| Blant private virksomheter med færre enn 20 ansatte gjennomfører 28 % en medarbeiderundersøkelse | Tabell 3.8, s. 24: privat sektor, færre enn 20 ansatte, «Medarbeiderundersøkelse» 28 |
| 23 % gjør ingen av kartleggingene Fafo spurte om | s. 24: «svarer 23 prosent av virksomhetslederne i privat sektor med færre enn 20 ansatte at de ikke gjennomfører noen av de kartleggingene vi har spurt om» |

## 11. Fafo-rapport 2025:19 – Mobilitet i helse- og omsorgstjenestene i perioden 2015–2024

Roy A. Nielsen og Leif E. Moland, Fafo 2025. Registerdata fra SSB (a-ordningen).
<https://www.fafo.no/images/pub/2025/20932.pdf> – hentet 2026-10-03.

| Påstand på siden | Hva kilden sier (side) |
|---|---|
| 29 % av de ansatte i hjemmetjenestene var ikke lenger på samme arbeidssted ett år senere, mot 24 % i arbeidslivet samlet (2023) | s. 15: «Mobiliteten er over 29 prosent i de kommunale hjemmetjenestene, fem prosentpoeng høyere enn i arbeidslivet samlet.» Tabell 3.1, 2023: Pleie og omsorg, hjemme 29,4; Totalt 24,4. s. 7: mobil = «hovedarbeidsgiver (virksomhet) i november et gitt år er ulik hovedarbeidsgiver i november påfølgende år» |
| Blant dem under 30 år var det 45 % | Tabell 3.2, s. 17: «<30 år» Pleie og omsorg hjemme 44,8 |

Viktig for hvordan siden er skrevet: rapporten sier (s. 2) at sektoren «sammenliknet med arbeidslivet ellers,
har … en ganske stabil bemanning, særlig sykehusene» (sykehus 19,0, institusjon 27,2 i 2023). Siden påstår
derfor ikke at turnover er høy i helse og omsorg generelt, bare tallet for hjemmetjenestene, som rapporten
selv framhever. «Kommunale hjemmetjenester» omfatter private utførere av de samme tjenestene (s. 8–9).

## 12. Fafo-rapport 2026:28 – Deltidsansettelser og bærekraftig bemanning

Roy A. Nielsen, Ketil Bråthen og Leif E. Moland, Fafo 2026, skrevet for KS. Registerdata fra a-ordningen, AKU og
en spørreundersøkelse besvart av 179 kommuner.
<https://www.ks.no/contentassets/b88c1738025446b68f9744059225437b/deltidsansettelser_og_barekraftig_bemanning_med_ks-logo.pdf>
(lenket fra KS' omtale 11.08.2026,
<https://www.ks.no/fagomrader/forskning-og-utvikling-fou/fou-rapporter/fafo-rapport-trygd-og-studier-utgjor-over-halve-deltiden/>)
– hentet 2026-10-03. Fafo-adressen etter ID-nummeret (20979) svarte 404, så KS' kopi er lenket.

| Påstand på siden | Hva kilden sier (side) |
|---|---|
| Blant turnusansatte i kommunal pleie og omsorg jobber nærmere 35 % heltid | s. 3: «Blant turnusansatte i pleie- og omsorgssektoren har heltidsandelen økt fra under 20 til nærmere 35 prosent» (fotnote: KOSTRA-funksjon 253 og 254) |
| Fafo beskriver ansatte som jobber deltid fordi vaktene oppleves som for slitsomme – en tilpasning til et arbeidsmiljø de ikke har bestemt selv | s. 6: «I helse- og omsorgssektoren vil dette typisk være ansatte som jobber i en tradisjonell turnus med lav grunnbemanning, mange deltidsansatte og omfattende vikarbruk. … Det handler altså ikke om at disse ansatte ønsker å jobbe mindre, men om at vaktene slik de gjennomføres, oppleves som for slitsomme. … Det de selv kaller ønsket deltid, er egentlig en tilpasning til en arbeidshverdag og et arbeidsmiljø de ikke har bestemt selv.» |
| Ansatte i store stillinger har lavest frafall, og tjenestesteder med mange heltidsansatte har lettere for å utvikle «den gode vakta», som både trekker til seg og holder på folk | s. 4: «Enkeltpersoners stillingsutvikling over ti år viser at ansatte som har stor stilling, har lavest frafall. Legger vi til at tjenestesteder med mange heltidsansatte og deltidsansatte i store stillinger har lettere for å utvikle «den gode vakta», og slik både trekker til seg og holder på arbeidskraften …» |

Bakgrunn, ikke brukt på siden: «Én av fire deltidsansatte jobber ufrivillig deltid. Det tilsvarer omtrent sju
prosent av alle kommunalt ansatte.» (s. 5) Tallene gjelder kommunesektoren; siden sier «kommunal pleie og
omsorg» der den bruker dem.

## 13. Arbeidstilsynet – Alenearbeid

<https://www.arbeidstilsynet.no/arbeidstid-og-organisering/alenearbeid> – hentet 2026-10-03.

| Påstand på siden | Kilden |
|---|---|
| Arbeidstilsynet bruker ansatte i hjemmetjenesten som eksempel på alenearbeid | «Alenearbeid kan for eksempel være situasjoner der du som arbeidstaker … er alene ute på arbeidsoppdrag utenfor eget arbeidssted eller base, for eksempel som … ansatt i hjemmetjenesten» |

Bakgrunn: «Vold og trusler er en kjent arbeidsmiljøutfordring i bransjer der arbeidstakeren ofte er alene med
en tredjeperson. Eksempler på slike bransjer er sykehus, psykiatrien, sykehjem, sosiale tjenester,
hjemmetjeneste …»

## 14. Fafo-rapport 2025:08 – Nye stillinger for ikke-faglærte i pleie- og omsorgstjenestene

Hanne Jordell, Selma S.F. Yssen og Leif E. Moland, Fafo 2025, skrevet for KS.
<https://www.fafo.no/images/pub/2025/20921_2.pdf> – hentet 2026-10-03.

| Påstand på siden | Hva kilden sier (side) |
|---|---|
| Fafo beskriver at ufaglærte vikarer ofte kalles inn og må ta ansvar for oppgaver de ikke har formell kompetanse til, og at kollegaer da må bruke mer tid på veiledning | s. 6: «Rekrutteringsutfordringene i sektoren, sammen med mangelfull planlegging for fravær, fører ofte til at ikke-faglærte vikarer eller assistenter kalles inn og må ta ansvar for oppgaver de ikke har formell kompetanse til å løse … Kollegaer med helsefaglig utdanning må da bruke mer tid på veiledning og kvalitetssikring av de ikke-faglærtes arbeid, og det kan påvirke arbeidsmiljøet og tjenestekvaliteten negativt» |

Bakgrunn, ikke brukt som tall på siden: s. 19: «I overkant av 20 prosent av de ikke-faglærte har
innvandrerbakgrunn. … Det finnes ikke tall eller statistikk på språknivå, men tidligere studier viser at
språkforståelse er og har vært en utfordring i sektoren». Siden bruker NOAs «1 av 5 på sykehjem er innvandrere»
(kilde 3) og påstår ikke noe om språknivå.

## Regelverket under hver utfordring (D-240)

Linjene «Regelverket» på kortene er sjekket mot arbeidsmiljøloven slik den står på Lovdata etter
endringslov 19. juni 2026 nr. 33, hentet 2026-10-07 (leddene i § 4-3 er nummerert etter gjeldende tekst:
trakassering femte ledd, vold og trusler sjette ledd), og mot forskriftene som er nevnt over.

| Utfordring | Hjemmel | Det teksten sier |
|---|---|---|
| Vold og trusler | aml § 4-3 sjette ledd, § 4-1 tredje ledd; forskriften kap. 3A | «Arbeidstaker skal, så langt det er mulig, beskyttes mot vold, trusler og uheldige belastninger som følge av kontakt med andre.»; «Det skal vurderes om det er særlig risiko knyttet til alenearbeid i virksomheten.»; forskriften kap. 3A: kartlegging og risikovurdering (§ 3A-2, der bemanning og alenearbeid nevnes), tiltak, opplæring og oppfølging |
| Følelsene | aml § 4-3 andre ledd b og d | a «uklare eller motstridende krav og forventninger», b «emosjonelle krav og belastninger i arbeid med mennesker», c «arbeidsmengde og tidspress …», d «støtte og hjelp i arbeidet» |
| For få på vakt | aml § 4-3 andre ledd c; forskriften § 3A-2 | a «uklare eller motstridende krav og forventninger», b «emosjonelle krav og belastninger i arbeid med mennesker», c «arbeidsmengde og tidspress …», d «støtte og hjelp i arbeidet»; forskriften kap. 3A: kartlegging og risikovurdering (§ 3A-2, der bemanning og alenearbeid nevnes), tiltak, opplæring og oppfølging |
| Rollekonflikt og seksuell oppmerksomhet | aml § 4-3 andre ledd a, femte ledd | a «uklare eller motstridende krav og forventninger», b «emosjonelle krav og belastninger i arbeid med mennesker», c «arbeidsmengde og tidspress …», d «støtte og hjelp i arbeidet»; «Arbeidstaker skal ikke utsettes for trakassering, herunder seksuell trakassering …» |
| Turnus og natt | aml §§ 10-3, 10-8, 10-11 | arbeidsplan ved arbeid til ulike tider på døgnet, «utarbeides i samarbeid med arbeidstakernes tillitsvalgte»; «minst 11 timer sammenhengende arbeidsfri i løpet av 24 timer», «35 timer i løpet av sju dager»; tredje ledd: unntak ved skriftlig avtale med tillitsvalgte i tariffbundet virksomhet, med kompenserende hvile; «Nattarbeid er ikke tillatt med mindre arbeidets art gjør det nødvendig.» |
| Deltid | aml §§ 14-3 og 14-4 a | «Deltidsansatte har fortrinnsrett til utvidet stilling fremfor at arbeidsgiver foretar ny ansettelse …»; rett til stilling tilsvarende faktisk arbeidstid de siste 12 månedene, «med mindre arbeidsgiver kan dokumentere at behovet for merarbeidet ikke lenger foreligger» (siden: «som hovedregel») |
| Nye og vikarer | aml § 3-2 første ledd a, § 4-2 andre ledd b | a «den opplæring, øvelse og instruksjon som er nødvendig», b den som leder eller kontrollerer andre, skal ha «nødvendig kompetanse»; «arbeidet organiseres og tilrettelegges under hensyn til den enkelte arbeidstakers arbeidsevne, kyndighet, alder og øvrige forutsetninger» |
| Tunge løft | aml § 4-4 andre ledd | «Nødvendige hjelpemidler skal stilles til arbeidstakers disposisjon. Det skal legges til rette for variasjon i arbeidet og for å unngå tunge løft …» |

## Sammenligningen (D-240)

Figuren «Helse og omsorg mot alle sysselsatte» bruker bare tall som står over: vold 34/5 %, rollekonflikt 22/13 %, uønsket seksuell oppmerksomhet 18/5 % og ubekvemme løft 30/14 % (sykehjem, kilde 3), høye emosjonelle krav 38/20 % (hjemmetjenesten, kilde 4), deltid 35/24 % (kilde 1) og sykefravær 9,6/6,6 % (kilde 2), de to siste mot alle næringer.

## Produktpåstander

Det siden sier om Orgpuls, er sjekket mot koden, ikke mot en kilde utenfor: se D-210 i docs/DEVIATIONS.md
for hvilken fil som beviser hver funksjon. Språkpåstanden («norsk, engelsk, polsk og litauisk») er sjekket
lesende mot den hostede databasen 2026-10-03: alle 28 spørsmål i den publiserte helse-modulen (1.0.1) har
godkjent oversettelse på engelsk, polsk og litauisk i `app.item_translations`.

## Ikke brukt

- Tallene i modulfilens begrunnelser som den gamle siden brukte: KS' «rundt en av fire» om vold (siden bruker
  NOAs tall), Sykepleiens «en av fire sykepleiere» om forsvarlig pleie, SINTEF/NSF om turnus, SSBs tall om
  seksuell trakassering blant sykepleiere, tidstyver i sykehus og STAMI-forskningen om løft gjengitt i
  Helsefagarbeideren: de står fortsatt i modulfilen og på spørsmålssiden, men landingssiden holder seg til
  kilder som er lest i dag og som gjelder omsorgstjenestene der målgruppen jobber.
- Svenske og danske tall (Arbetsmiljöverket, Arbejdstilsynet, AE): siden holder seg til norske tall.
- «43 000 ufrivillig deltid» og «sju av ti deltidsansatte i kommunene er i helse og omsorg» (Fagbladets
  gjengivelse av Fafo): «sju av ti» står ikke ordrett i rapporten, og siden bruker heltidsandelen og Fafos
  beskrivelse av slitsomme vakter i stedet.
- Turnover i helse og omsorg generelt: Fafo 2025:19 finner en ganske stabil bemanning sammenlignet med
  arbeidslivet ellers. Bare hjemmetjenestenes tall er brukt.
- Fafos rapport om vold og trusler blant FOs medlemmer (2019): gjelder sosialarbeidere og barnevern, ikke
  omsorgstjenestene.
