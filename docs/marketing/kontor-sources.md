# /kunnskap-og-kontor – kilder for tall og faktapåstander

Hvert tall og hver faktapåstand om bransjen på /kunnskap-og-kontor står her, med kilden slik den ble hentet.
Kildene står i samme rekkefølge som på siden, der de er nummerert 1–18 (`content/industries/landing.ts`,
`sources`; meldingene er `site.bransje.kontor`). Alle hentet 2026-10-03 (3. oktober 2026). Ingen tall på
siden står uten en linje her; et tall som ikke kunne kildebelegges eller ville gitt et skjevt bilde, er tatt
ut (se «Ikke brukt» nederst). Sidetall er rapportens egne (trykte) sidetall.

Siden er skrevet til det kildene faktisk sier: kontorarbeidsplasser skårer godt på mye (trivsel, sykefravær),
og siden sier det selv i tallbåndet. Den argumenterer ut fra det som er særegent for kunnskapsarbeid –
tilgjengelighet utenom arbeidstid, hjemme- og hybridarbeid, konsentrasjon i landskap, omorganisering og KI –
og fra lovkravet som gjelder alle arbeidsgivere.

## 1. SSB – tabell 07203: Sysselsatte (AKU) etter kjønn, næring (SN2007), heltid/deltid og år

<https://www.ssb.no/statbank/table/07203/> – hentet 2026-10-03 gjennom SSBs åpne API
(`https://data.ssb.no/api/v0/no/table/07203`, begge kjønn, i alt, 2025; tabellen oppdatert 2026-02-11).

| Næring, 2025 | Sysselsatte (1 000 personer) |
|---|---|
| 00-99 Alle næringer | 2 903 |
| 58-63 Informasjon og kommunikasjon | 135 |
| 64-66 Finansiering og forsikring | 53 |
| 68-75 Teknisk tjenesteyting, eiendomsdrift | 214 |

| Påstand på siden | Utregning |
|---|---|
| Rundt 400 000 jobber i informasjon og kommunikasjon, finans og forsikring og teknisk tjenesteyting og eiendom | 135 + 53 + 214 = 402 |

Merk: SSBs gruppe 68-75 omfatter også veterinærtjenester (75), som kontor-modulen ikke foreslås for
(`content/industries/meta.ts`: 58–66 og 68–74). Siden skriver derfor «rundt» og bruker SSBs egne gruppenavn.
«Om lag 800 000 sitter på kontor nesten hele arbeidstiden» er NOAs tall (kilde 2).

## 2. STAMI / NOA – Fakta om arbeidsmiljøet på kontorarbeidsplasser

Statens arbeidsmiljøinstitutt, Nasjonal overvåking av arbeidsmiljø og helse. «Kilde: Levekårsundersøkelsen om
arbeidsmiljø 2022, innhentet av SSB.» <https://noa.stami.no/yrker-og-naeringer/noa/kontorarbeidsplasser/> –
hentet 2026-10-03.

| Påstand på siden | Kilden |
|---|---|
| Om lag 800 000 sitter på kontor nesten hele arbeidstiden | «Om lag 800 000 personer jobber på kontor nesten hele arbeidstiden.» |
| 29 % på kontorarbeidsplasser jobber hjemmefra eller på farten utenom vanlig arbeidstid hver uke, mot 17 % av alle sysselsatte | «29 % Alle sysselsatte: 17 % Arbeider hjemmefra utenom vanlig arbeidstid. Knyttet til at man ukentlig jobber hjemmefra, på vei til jobb eller på cafè utenom ordinær arbeidstid» |
| 86 % er fornøyd med jobben, mot 83 % av alle sysselsatte | «86 % er fornøyd med jobben sin ALLE SYSSELSATTE: 83 %» |
| Sykefraværet er lavere enn snittet | «Kontoransatte har lavere sykefravær enn gjennomsnittet for alle sysselsatte.» |
| 1 av 5 oppgir psykiske plager som helt eller delvis skyldes jobben | «21 % oppgir psykiske plager som helt eller delvis skyldes jobben» |
| 1 av 3 med sykefravær sier at fraværet har sammenheng med jobben; slikt fravær kan ofte forebygges | «På kontorarbeidsplasser oppgir 1 av 3 med sykefravær at fraværet er relatert til jobben.» «Sykefravær som er relatert til jobben, kan ofte forebygges på den enkelte arbeidsplassen.» |
| 58 % sitter i delt kontor eller kontorlandskap hele eller deler av tiden | «58 % jobber på delt kontor eller kontorlandskap hele eller deler av arbeidstiden.» |
| 22 % opplever at det er forventet at de er tilgjengelige i fritiden, mot 19 % | «22 % Alle sysselsatte: 19 % Opplever at tilgjengelighet på fritiden er forventet» |
| 55 % har opplevd omorganisering, mot 48 % | «55 % Alle sysselsatte: 48 % Har opplevd omorganisering» |
| 42 % jobber med gjentakende arm- og håndbevegelser, blant annet PC-arbeid, mot 25 % | «42 % Alle sysselsatte: 25% Jobber med gjentakende armbevegelser. Knyttet til gjentatte og ensidige arm- eller håndbevegelser mer enn en fjerdedel av arbeidsdagen, arbeid med PC» |

Ikke brukt fra samme side: «57 % Alle sysselsatte: 54 % Opplever høye jobbkrav» – forskjellen er liten, og
siden påstår ikke at kontorarbeid har høyere krav enn arbeidslivet ellers.

## 3. Fafo-rapport 2025:26 – Arbeidstakeres rett til å koble fra

Mona Bråten, Rolf K. Andersen, Balder Blinkenberg og Kristine Nergaard. Kartlegging av status og utfordringer i
norsk arbeidsliv. Spørreundersøkelse blant 4 031 arbeidstakere (GallupPanelet), egne analyser av LKU-A 2022,
spørreundersøkelse blant 1 200 virksomhetsledere (Norstat). <https://www.fafo.no/images/pub/2025/20939.pdf> –
hentet 2026-10-03 (rapportsiden: <https://www.fafo.no/publikasjoner/fafo-rapporter/arbeidstakeres-rett-til-a-koble-fra-2>).

| Påstand på siden | Hva kilden sier (side) |
|---|---|
| 22 % av virksomhetene har retningslinjer om retten til å koble fra jobben i fritiden | s. 81: «Blant virksomhetslederne svarer 22 prosent at det er utarbeidet retningslinjer om ansattes ‹rett til å koble fra›.» |
| Blant virksomhetene med færre enn 20 ansatte har 19 % slike retningslinjer | s. 81: «Det er en noe mindre andel blant virksomheter med færre enn 20 ansatte sammenlignet med større virksomheter – henholdsvis 19 og 25 prosent.» |
| Forventningene er ofte uformelle og underkommuniserte, skriver Fafo | s. 5: «Undersøkelsen viser at formelle retningslinjer i virksomheter er lite utbredt, og at forventningene om tilgjengelighet ofte er uformelle og underkommuniserte.» |
| Blant ansatte uten lederansvar får 41 % i akademikeryrker jobbhenvendelser i fritiden minst én gang i uka, mot 17 % av operatører og håndverkere | s. 33 (LKU-A 2022, arbeidstakere som ikke er i en lederjobb): «Andelen som fikk henvendelser ukentlig eller oftere, varierte fra 17 prosent blant operatører og håndverkere til 41 prosent blant arbeidstakere i akademikeryrker.» |
| To av tre ledere med personalansvar får slike henvendelser hver uke | s. 33: «to av tre ledere med personalansvar ble kontaktet ukentlig» |
| Om lag 1 av 10 arbeidstakere får jevnlig jobbhenvendelser i fritiden og forventes å svare | s. 4: «Omtrent 18 prosent av arbeidstakerne mottar regelmessige jobbhenvendelser fra kolleger, ledere eller eksterne i fritiden, som må følges opp. Disse fordeler seg jevnt mellom de som forventes å være tilgjengelige (kategori A, ca. 10 prosent), og de som ikke har slike forventninger (kategori B, ca. 8 prosent).» |
| De fleste er ledere eller i særlig selvstendige stillinger, bruker minst 2 timer i uka på det, og mange rapporterer stress og arbeid under sykdom | s. 5: «Kategori A domineres av ledere og ansatte med særlig selvstendig stilling. De fleste bruker minst 2 timer ukentlig på henvendelser i fritiden, ofte uten særskilt kompensasjon.» «Mange av disse rapporterer stress, redusert balanse mellom jobb og fritid og arbeid under sykdom» |

Bakgrunn, ikke brukt som tall: s. 81, «I offentlig sektor svarer 58 prosent at de har hatt slike diskusjoner
med ansatte, mens andelen i privat sektor er 33 prosent»; s. 60, «Blant funksjonærer uten lederoppgaver er
andelen som jobber hjemmefra flere dager i uka, 31 prosent»; s. 5, at gruppe A «i stor grad er unntatt fra
arbeidstidsbestemmelsene» (aml § 10-12). Siden nevner ikke unntaket i lovkortet, fordi det krever en
vurdering av den enkelte stilling.

## 4. STAMI – Her skjedde ei varig endring etter pandemien

Nyhet publisert 3. oktober 2024, om Faktabok om arbeidsmiljø og -helse 2024.
<https://stami.no/her-skjedde-ei-varig-endring-etter-pandemien/> – hentet 2026-10-03.

| Påstand på siden | Kilden |
|---|---|
| 9,6 % av arbeidstakerne jobber hjemmefra flere dager i uka etter pandemien, mot 4,2 % i 2019 | «I 2019 var det 4,2 prosent som jobba heimanfrå fleire dagar i veka, mens det etter pandemien var 9,6 prosent.» |

## 5. Nav – Økt sykefravær i første halvår

Publisert 3. september 2026. <https://www.nav.no/no/nav-og-samfunn/statistikk/sykefravar-statistikk/nyheter/okt-sykefravaer-i-forste-halvar>
– hentet 2026-10-03. Nav skriver: «Herfra omtales kun det legemeldte sykefraværet, inkludert fordeling på
diagnoser.»

| Påstand på siden | Kilden |
|---|---|
| 28 % av de legemeldte sykefraværsdagene i 2. kvartal 2026 skyldtes psykiske lidelser – i hele arbeidslivet | «Sykefravær med psykiske lidelser utgjorde i 2. kvartal over 2,2 millioner tapte dagsverk, som tilsvarer 28 prosent av sykefraværsdagene.» |
| Sykefravær med psykiske lidelser varer ofte lenge, og det øker sjansen for å falle helt ut av arbeidslivet, sier arbeids- og velferdsdirektør Hege Nilssen | «Sykefravær med psykiske lidelser har dessuten ofte lang varighet, som øker sjansen for å falle helt ut av arbeidslivet, sier Nilssen.» (Hege Nilssen, arbeids- og velferdsdirektør, er navngitt tidligere i saken.) |

Tallet gjelder hele arbeidslivet, ikke kontorarbeid, og siden sier det («i hele arbeidslivet»).

## 6. Lovdata – arbeidsmiljøloven

<https://lovdata.no/lov/2005-06-17-62> – hentet 2026-10-03 (§ 4-3 og § 10-8 lest på Lovdata).

- § 3-1 andre ledd bokstav c: ordlyden er den samme som på /lovkrav, /handel, /bygg-og-anlegg og /helse-og-omsorg.
- § 4-3 første ledd: faktorene skal være «fullt forsvarlige»; andre ledd: psykososiale arbeidsmiljøfaktorer er
  blant annet «a) uklare eller motstridende krav og forventninger i arbeidet, b) emosjonelle krav og
  belastninger i arbeid med mennesker, c) arbeidsmengde og tidspress som innebærer ubalanse mellom arbeidet
  som skal utføres, og den tiden som er til rådighet, d) støtte og hjelp i arbeidet». Siden: «De psykososiale
  faktorene skal være fullt forsvarlige – blant annet uklare eller motstridende krav og forventninger,
  arbeidsmengde og tidspress, og støtte og hjelp i arbeidet.» (bokstav a, c og d).
- § 10-8 første ledd: «Arbeidstaker skal ha minst 11 timer sammenhengende arbeidsfri i løpet av 24 timer.»
  Siden gjengir det ordrett.

## 7. Lovdata – forskrift om arbeid som utføres i arbeidstakers hjem (hjemmekontorforskriften)

FOR-2002-07-05-715, sist endret ved FOR-2022-03-18-409 (i kraft 1. juli 2022).
<https://lovdata.no/forskrift/2002-07-05-715> – hentet 2026-10-03.

- § 1: «Denne forskriften gjelder for arbeid som utføres i arbeidstakers eget hjem. Forskriften gjelder ikke
  kortvarig eller sporadisk arbeid, med mindre arbeidstaker kun utfører arbeid i eget hjem.»
- § 2: «I tillegg til den skriftlige arbeidsavtalen etter arbeidsmiljøloven § 14-5 og § 14-6 skal det inngås
  skriftlig avtale om hjemmearbeidet som minst omfatter: … arbeidstid for hjemmearbeidet … eventuelle
  bestemmelser om når arbeidstaker skal være tilgjengelig for arbeidsgiver …»
- § 3 første ledd: arbeidsgiver skal «så langt det er praktisk mulig forsikre seg om at arbeidsforholdene er
  fullt forsvarlige. Dette gjelder blant annet at arbeidsstedet, arbeidsutstyret og innemiljøet ikke medfører
  uheldige fysiske belastninger og at det psykososiale arbeidsmiljøet er ivaretatt.»

Siden: «Fast hjemmearbeid krever en skriftlig avtale, blant annet om arbeidstid og når den ansatte skal være
tilgjengelig. Også det psykososiale arbeidsmiljøet hjemme skal være ivaretatt (§§ 2 og 3).» «Fast» følger
§ 1 (ikke kortvarig eller sporadisk) og Arbeidstilsynets veiledning (kilde 17). «Når den ansatte skal være
tilgjengelig» står som «eventuelle bestemmelser» i forskriften; siden skriver «blant annet om».

## 8. Lovdata – forskrift om utførelse av arbeid, kapittel 1A

<https://lovdata.no/forskrift/2011-12-06-1357> – hentet 2026-10-03 (samme kilde og ordlyd som /handel,
/bygg-og-anlegg og /helse-og-omsorg): § 1A-2, kartleggingen sammen med de ansatte, gjentatt og dokumentert.

## 9. Arbeidstilsynet – Årsrapport 2025

«Årsrapport 2025 – En analyse av Arbeidstilsynets innsats».
<https://www.arbeidstilsynet.no/globalassets/rapportar/arsrapport/arsrapport-2025/arbeidstilsynets-arsrapport-2025.pdf>
– hentet 2026-10-03 (samme kilde som /bygg-og-anlegg og /helse-og-omsorg, lest på nytt for kontor).

| Påstand på siden | Hva kilden sier (side) |
|---|---|
| Sitatet «Stadig flere i Norge jobber i yrker der risikoen …» | s. 4: «Stadig flere i Norge jobber i yrker der risikoen i mindre grad handler om maskiner og fysiske farer, men i større grad om hvordan arbeidet er organisert, tidspress og emosjonelle belastninger.» |
| Kravene ble tydeliggjort fra 1. januar 2026, og tilsynet veileder først | s. 4–5: «Det nye regelverket som trådte i kraft 1. januar 2026, innebærer ingen nye krav til arbeidsgivere, men presiserer og tydeliggjør allerede gjeldende krav.» «I første omgang skal vi i gang med en stor veiledningsinnsats … før vi starter tilsynsaktivitet.» |
| I tilsynene i 2025 – i andre bransjer – var kartleggingen mangelfull i nær to av tre, og tiltakene manglet ofte ansvarlige og frister | s. 20: tilsynene rettet seg mot «byggevirksomheter, frisører, private barnevernstjenester, sykehjem og hjemmetjeneste». s. 21: «i nær to tredjedeler av tilsynene fant vi at den var mangelfull … tiltakene ofte er mangelfulle, hvor handlingsplaner, ansvarlige personer og tidsfrister ikke tilfredsstiller kravene i regelverket» |

Siden sier «i andre bransjer» fordi Arbeidstilsynet ikke har prioritert kontorvirksomhet i tilsyn; den påstår
ikke at kontorbedrifter får tilsyn nå.

## 10. Fafo-rapport 2025:10 – Kartlegging av verneombudenes arbeid

Rolf K. Andersen, Mona Bråten og Johanne Stenseth Huseby, Fafo 2025.
<https://www.fafo.no/images/pub/2025/20923.pdf> – hentet 2026-10-03 (samme kilde og tall som /handel,
/bygg-og-anlegg og /helse-og-omsorg).

| Påstand på siden | Hva kilden sier (side) |
|---|---|
| Blant private virksomheter med færre enn 20 ansatte gjennomfører 28 % en medarbeiderundersøkelse | Tabell 3.8, s. 24: privat sektor, færre enn 20 ansatte, «Medarbeiderundersøkelse» 28 |
| 23 % gjør ingen av kartleggingene Fafo spurte om | s. 24: «svarer 23 prosent av virksomhetslederne i privat sektor med færre enn 20 ansatte at de ikke gjennomfører noen av de kartleggingene vi har spurt om» |

## 11. STAMI – Kontoret påvirker de ansattes sykefravær

Nyhet publisert 19. februar 2026, om doktorgraden til Randi Hovden Borge (landsrepresentative data fra SSB).
<https://stami.no/hvordan-pavirker-kontorlandskap-og-hjemmekontor-ansattes-sykefravaer/> – hentet 2026-10-03.

| Påstand på siden | Kilden |
|---|---|
| Ansatte i åpne kontorlandskap med faste plasser hadde høyere sannsynlighet for både egenmeldt og legemeldt sykefravær enn ansatte på enekontor eller mindre delekontor | «Studien viser at ansatte i åpne kontorlandskap med faste plasser hadde høyere sannsynlighet for både egenmeldt og legemeldt sykefravær enn ansatte på enekontor eller mindre delekontor.» |
| Forskjellene er små, men gjelder mange | «Kontorløsninger kan ha en effekt på sykefravær, men forskjellene vi finner er ganske små. Likevel kan de ha stor betydning for organisasjoner og samfunnet. Det skyldes at mange arbeidstakere i dag jobber med hjemmekontor og i delte og åpne kontorløsninger» |

## 12. Fafo-rapport 2025:37 – Aktivitetsbaserte arbeidsplasser

Anne Inga Hilsen, Rolf K. Andersen og Helge Dønnum. Evaluering av pilot for aktivitetsbasert
arbeidsplasskonsept i regjeringskvartalet (Digitaliserings- og forvaltningsdepartementet, rundt 70 ansatte).
<https://www.fafo.no/images/pub/2025/20951.pdf> – hentet 2026-10-03.

| Påstand på siden | Hva kilden sier (side) |
|---|---|
| I Fafos evaluering av et aktivitetsbasert kontor i departementene opplevdes konsentrasjonskrevende arbeid som mer krevende i det åpne landskapet | s. 5: «Bruken av lokalene varierer med oppgavetype, hvor konsentrasjonskrevende arbeid oppleves som mer krevende i det åpne landskapet. Ansatte savner dermed flere stillesoner» |

Siden sier at funnet gjelder én evaluering i departementene, ikke kontorer generelt.

## 13. Abelia – HR-undersøkelsen 2023

«Rask teknologisk utvikling utfordrer også fremtidsrettede arbeidsgivere», nyhet publisert 30. november 2023.
Undersøkelsen ble utført av Rambøll blant HR-ansatte og daglige ledere i Abelias medlemsvirksomheter
(teknologi- og kunnskapsbedrifter); 209 virksomheter svarte.
<https://www.abelia.no/nyheter/2023/november/rask-teknologisk-utvikling-utfordrer-ogsa-fremtidsrettede-arbeidsgivere/>
– hentet 2026-10-03.

| Påstand på siden | Kilden |
|---|---|
| I Abelias HR-undersøkelse blant teknologi- og kunnskapsbedrifter oppgir 40 % av bedriftene svakere sosialt samhold som følge av fleksible og hybride arbeidsformer som en stor utfordring | «Hjemmekontoret har imidlertid en bakside: Svakere sosialt samhold og fellesskapsfølelse som følge av mer fleksible og hybride arbeidsformer oppgis også som en stor utfordring av 40 prosent av bedriftene.» |

Bakgrunn, ikke brukt som tall: «Undersøkelsen viser at ni av ti Abelia-bedrifter tilbyr hjemmekontor til sine
ansatte. Det vanligste er hjemmekontor to dager i uken.» Abelias rapport «Fremtidens arbeidsliv» (lansert
5. februar 2025) ble ikke funnet som dokument som kunne leses i dag, og er ikke brukt.

## 14. STAMI – Ny kunnskap om hjemmekontor, arbeidsmiljø og helse

Nyhet publisert 7. mai 2024, om STAMIs kunnskapsoppsummering.
<https://stami.no/ny-kunnskap-om-hjemmekontor-arbeidsmiljo-og-helse/> – hentet 2026-10-03.

| Påstand på siden | Kilden |
|---|---|
| Hjemmekontor kan gi mer kontroll og fleksibilitet, men henger også sammen med økte krav til tilgjengelighet, mindre kollegastøtte og noe mer rolleuklarhet og rollekonflikt | «Hjemmekontor kan gi arbeidstakere bedre kontroll over arbeidet, og gi en fleksibilitet til å balansere kravene fra arbeid og privatliv.» «Samtidig er det også forbundet med negative faktorer som økte krav til arbeidsmengde og tilgjengelighet, mindre kollegastøtte, høyere jobbkrav, noe større grad av rolleuklarhet og rollekonflikt.» |

## 15. STAMI / NOA – Fakta om arbeidsmiljøet i bank, finans og forsikring

<https://noa.stami.no/yrker-og-naeringer/noa/bank-finans-forsikring/> – hentet 2026-10-03. «Hovedkilden er
Levekårsundersøkelsen om arbeidsmiljø 2022, innhentet av SSB.»

| Påstand på siden | Kilden |
|---|---|
| I bank, finans og forsikring har 65 % opplevd omorganisering | «65 % Alle sysselsatte: 48 % Har opplevd omorganisering» |

Bakgrunn, ikke brukt: «91 % er fornøyd med jobben sin», «40 % jobber hjemmefra utenom ordinær arbeidstid én dag i
uka eller oftere», «85 % jobber i kontorlandskap eller deler kontor».

## 16. SSB – Bruken av KI i næringslivet akselererer

Artikkel publisert 25. september 2026 (Marina Rybalka), fra undersøkelsen Bruk av IKT i næringslivet.
<https://www.ssb.no/teknologi-og-innovasjon/informasjons-og-kommunikasjonsteknologi-ikt/statistikk/bruk-av-ikt-i-naeringslivet/artikler/bruken-av-ki-i-naeringslivet-akselererer>
– hentet 2026-10-03.

| Påstand på siden | Kilden |
|---|---|
| 9 av 10 foretak i informasjon og kommunikasjon bruker KI i 2026 | «9 av 10 i Informasjon og kommunikasjon næringen og 7 av 10 i Annen tjenesteyting sier at de bruker KI-teknologi i 2026.» Undersøkelsen gjelder foretak med minst ti ansatte: «I 2026 oppgir nesten fem av ti foretak med minst ti ansatte at de benytter én eller flere typer KI-teknologi» |

## 17. Arbeidstilsynet – Hjemmekontor

<https://www.arbeidstilsynet.no/lonn-og-ansettelse/ansettelse/heimekontor> – hentet 2026-10-03.

| Påstand på siden | Kilden |
|---|---|
| Jobber noen hjemme én dag hver uke som fast ordning, gjelder hjemmekontorforskriften | «Dersom hjemmearbeidet har et visst omfang og utføres jevnlig, er det en fast ordning, og da vil forskriften gjelde. Et eksempel er dersom en arbeidstaker som en fast ordning arbeider hjemme én dag hver uke.» |

Bakgrunn: «Det systematiske arbeidsmiljøarbeidet skal ta høyde for og synliggjøre at virksomheten har ansatte som
utfører arbeid i sine private hjem.»

## 18. Fafo – Ledelsesbarometeret 2025: hjemmekontor og fjernledelse

Faktaflak, Rolf K. Andersen, august 2025. Spørreundersøkelse blant medlemmene i fagforeningen Lederne, mars 2025
(2 947 svar); påstandene om å lede ansatte på hjemmekontor er besvart av ledere med ansatte som kan jobbe
hjemmefra (n = 642). <https://www.fafo.no/images/pub/2025/Ledelsesbarometeret_hjemmekontor_og_fjernledelse.pdf>
– hentet 2026-10-03.

| Påstand på siden | Hva kilden sier (side) |
|---|---|
| Blant ledere med ansatte som kan jobbe hjemmefra, synes 47 % det er krevende å lede ansatte som jobber hjemmefra, og 45 % mener det påvirker arbeidsmiljøet negativt | s. 3: «45 prosent mener ansatte på hjemmekontor påvirker arbeidsmiljøet negativt, og 47 prosent svarer at de synes det er krevende å lede ansatte som jobber hjemmefra.» |

## Regelverket under hver utfordring (D-240)

Linjene «Regelverket» på kortene er sjekket mot arbeidsmiljøloven slik den står på Lovdata etter
endringslov 19. juni 2026 nr. 33, hentet 2026-10-07 (leddene i § 4-3 er nummerert etter gjeldende tekst:
trakassering femte ledd, vold og trusler sjette ledd), og mot forskriftene som er nevnt over.

| Utfordring | Hjemmel | Det teksten sier |
|---|---|---|
| Ingen ro | aml § 4-1 første ledd, § 4-4 første ledd | «Arbeidsmiljøet i virksomheten skal være fullt forsvarlig ut fra en enkeltvis og samlet vurdering av faktorer i arbeidsmiljøet …»; fysiske faktorer som «inneklima, lysforhold, støy» skal være «fullt forsvarlig» |
| Alltid tilgjengelig | aml § 10-8 | «minst 11 timer sammenhengende arbeidsfri i løpet av 24 timer», «35 timer i løpet av sju dager»; tredje ledd: unntak ved skriftlig avtale med tillitsvalgte i tariffbundet virksomhet, med kompenserende hvile |
| Jobben følger med hjem | aml § 10-8 første ledd, § 4-1 andre ledd | «minst 11 timer sammenhengende arbeidsfri i løpet av 24 timer», «35 timer i løpet av sju dager»; tredje ledd: unntak ved skriftlig avtale med tillitsvalgte i tariffbundet virksomhet, med kompenserende hvile; «Arbeidets organisering, tilrettelegging og ledelse, arbeidstidsordninger … skal være slik at arbeidstakerne ikke utsettes for uheldige fysiske eller psykiske belastninger og slik at sikkerhetshensyn ivaretas.» |
| Sammen, men hver for seg | aml § 4-3 fjerde ledd; hjemmekontorforskriften § 3 | «Arbeidet skal søkes utformet slik at det gir mulighet for kontakt og kommunikasjon med andre arbeidstakere …»; hjemmekontorforskriften § 3 som under kilde 7 |
| Kunden har hastverk | aml § 4-3 andre ledd a og c | a «uklare eller motstridende krav og forventninger», b «emosjonelle krav og belastninger i arbeid med mennesker», c «arbeidsmengde og tidspress …», d «støtte og hjelp i arbeidet» |
| Omstilling og KI | aml § 4-2 første og tredje ledd | informert om systemer, «nødvendig opplæring», «medvirke ved utformingen av dem»; «Under omstillingsprosesser … skal arbeidsgiver sørge for den informasjon, medvirkning og kompetanseutvikling som er nødvendig …» |
| Skjerm, stol og kjøkkenbord | aml § 4-4 andre ledd; hjemmekontorforskriften § 3 | «Nødvendige hjelpemidler skal stilles til arbeidstakers disposisjon. Det skal legges til rette for variasjon i arbeidet og for å unngå tunge løft …»; hjemmekontorforskriften § 3 som under kilde 7 |
| Det som ikke blir sagt | aml § 4-3 andre ledd d, § 2 A-1 | a «uklare eller motstridende krav og forventninger», b «emosjonelle krav og belastninger i arbeid med mennesker», c «arbeidsmengde og tidspress …», d «støtte og hjelp i arbeidet»; «Arbeidstaker har rett til å varsle om kritikkverdige forhold i arbeidsgivers virksomhet.» |

## Sammenligningen (D-240)

Figuren «Kontorarbeidsplasser mot alle sysselsatte» bruker bare tall fra kilde 2 som står over: hjemmearbeid utenom arbeidstid 29/17 %, forventet tilgjengelighet 22/19 %, omorganisering 55/48 %, gjentakende arm- og håndbevegelser 42/25 % og fornøyd med jobben 86/83 %.

## Produktpåstander

Det siden sier om Orgpuls, er sjekket mot koden, ikke mot en kilde utenfor: se D-212 i docs/DEVIATIONS.md for
hvilken fil som beviser hver funksjon. Variantene, faktorene, tallene på dem og «Kun utvidet»/«Valgfri» leses av
siden fra modulfilen (`modules/kunnskap-og-kontor/v1.json`). Språkpåstanden («norsk, engelsk, polsk og
litauisk») er sjekket lesende mot den hostede databasen 2026-10-03: alle 68 spørsmål i den publiserte
kontor-modulen (1.0.0, foreløpig) har godkjent oversettelse på engelsk, polsk og litauisk i
`app.item_translations`. De engelske faktornavnene på siden er de godkjente oversettelsene i samme register
(`mfactor:`).

## Ikke brukt

- Tallene i modulfilens begrunnelser som den gamle siden brukte (Puranik mfl., Luong og Rogelberg, Microsofts
  Work Trend Index, Tarafdar, Barber, EU-OSHA, Eurofound, Kim og de Dear, Bakker, OECD): de står fortsatt i
  modulfilen og på spørsmålssiden, men landingssiden holder seg til norske kilder som er lest i dag.
- Den gamle sidens eksempelvirksomhet «Fjellstad Rådgivning AS» med indekser per avdeling: tenkte tall, merket som
  tenkte, men de ligner data. Landingssiden viser bare ekte skjermbilder.
- «Høye jobbkrav» (57 % mot 54 %, kilde 2) og «lange arbeidsuker» i finans (9,7 % mot 8,2 %, kilde 15):
  forskjellene er for små til å bære en påstand om at kontorarbeid er verre stilt.
- Fafo-rapport 2025:22 (Den fremtidige arbeidsdag, for Parat): lav svarprosent blant medlemmene, og ingen tall som
  gjelder kontorbransjene særskilt.
- SSBs tall for hjemmearbeid fra AKU: ingen tabell i statistikkbanken ga en kontor- eller næringsfordeling som
  kunne leses direkte; siden bruker STAMIs og NOAs tall fra LKU-A.
- Virke: ingen undersøkelse med tall om arbeidsmiljøet i kontorbransjene ble funnet som kunne leses og
  kildebelegges i dag.
- At ledere og «særlig uavhengige stillinger» er unntatt arbeidstidskapitlet (aml § 10-12): riktig, men om en
  stilling er unntatt, er en konkret vurdering, og lovkortet nevner det ikke.
