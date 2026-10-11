/**
 * The design fixture in Sweden (SE-F3, D-276): the same scenario, the same answers and so the same
 * figures (index 61, 64 the year before, 28 of 34), told by a Swedish firm in Swedish, for the
 * Swedish site's product pictures. `node scripts/seed/design-fixture.mjs --market se` emits it.
 *
 * Nothing about the numbers is here: design-fixture.mjs solves them once, for every market. This file
 * holds what a Swedish reader reads instead of the Norwegian — the firm, its people and departments,
 * the comments, the measures, the risk assessment — keyed by the exact Norwegian text it replaces, so
 * a Norwegian text that changes without its Swedish one stops the generator rather than leaking into
 * a picture. And the organisation's own facts in Sweden: the market, its language and clock, an
 * organisationsnummer, and no Norwegian register or occupational health service.
 *
 * **Nothing here is real.** Norrvik Anläggning AB is invented. Its number, 559999-9991, has the shape
 * of an aktiebolag's (ten digits, the third 2 or higher, the Luhn check digit Sweden's rule demands,
 * 0218), at the far end of the series. People are invented; addresses are on `.example`, and the
 * streets in the towns named are made up.
 */

/** The organisation's own id space: the fixture's ids with 8046 in the fourth group */
export const ID_FROM = '00000000-0000-4000-8000-'
export const ID_TO = '00000000-0000-4000-8046-'

export const ORG = {
  market: 'se',
  lang: 'sv',
  timezone: 'Europe/Stockholm',
  name: 'Norrvik Anläggning AB',
  number: '5599999991',
}

/** Every Norwegian text the fixture writes, and the Swedish that replaces it */
export const TEXT = {
  // the organisation, its departments and the people the design names
  'Nordvik Anlegg AS': 'Norrvik Anläggning AB',
  '924118742': ORG.number,
  Drift: 'Drift',
  Prosjekt: 'Projekt',
  Verksted: 'Verkstad',
  Administrasjon: 'Administration',
  'Kari Nordbø': 'Karin Nordberg',
  'Tomas Vik': 'Tomas Wik',
  'Anne Rygg': 'Anna Ryd',
  'Tuva Berg': 'Tove Berg',
  'kari@nordvik.example': 'karin@norrvik.example',
  'tomas@nordvik.example': 'tomas@norrvik.example',
  'anne@nordvik.example': 'anna@norrvik.example',
  'tuva@nordvik.example': 'tove@norrvik.example',
  '@nordvik.example': '@norrvik.example',
  'Kari Sund, tillitsvalgt Fellesforbundet': 'Karin Sund, skyddsombud',

  // where the work happens
  Hovedkontor: 'Huvudkontor',
  'Industriveien 14, 3229 Sandefjord': 'Industrivägen 14, Halmstad',
  'Anlegg Larvik': 'Anläggning Falkenberg',
  'Elveveien 8, 3262 Larvik': 'Älvvägen 8, Falkenberg',
  'Verksted Stokke': 'Verkstad Laholm',
  'Bekkeveien 2, 3160 Stokke': 'Bäckvägen 2, Laholm',

  // the rounds' own names (the screens name a round from its kind and dates)
  'Grunnlinje 2023': 'Baslinjemätning 2023',
  'Grunnlinje 2024': 'Baslinjemätning 2024',
  'Grunnlinje 2025': 'Baslinjemätning 2025',
  'Grunnlinje 2026': 'Baslinjemätning 2026',
  'Puls mai 2025': 'Puls maj 2025',
  'Puls august 2025': 'Puls augusti 2025',
  'Puls mars 2026': 'Puls mars 2026',
  'Puls 2026': 'Puls 2026',

  // the measures
  'Fast svar på avviksmeldinger innen fem dager': 'Fast svar på avvikelserapporter inom fem dagar',
  'Verksted meldte fire avvik i vår uten å få svar. Tiltaket er å gi hver melding et navngitt svar innen fem virkedager.':
    'Verkstaden rapporterade fyra avvikelser i våras utan att få svar. Åtgärden är att varje rapport får ett svar från en namngiven person inom fem arbetsdagar.',
  'Prioriteringsmøte hver mandag på Prosjekt': 'Prioriteringsmöte varje måndag på Projekt',
  'Tre parallelle prosjekter uten uttalt rekkefølge. Møtet skal ende med én skriftlig prioritert liste.':
    'Tre parallella projekt utan uttalad ordning. Mötet ska sluta med en skriftlig prioriteringslista.',
  'Varslingsrutinen gjennomgått i alle team': 'Visselblåsarrutinen genomgången i alla team',
  'Effekten måles i pulsen 12. oktober. Tiltaket kan lukkes når ytringsklima er målt på nytt.':
    'Effekten mäts i pulsmätningen den 12 oktober. Åtgärden kan avslutas när yttrandeklimatet har mätts på nytt.',
  'Fadderordning for nyansatte første åtte uker': 'Faddrar för nyanställda de första åtta veckorna',
  'Lederstøtte falt mest blant de som har vært her under et år. Fadderen er kollega, ikke leder.':
    'Stödet från chef sjönk mest bland dem som har varit här kortare än ett år. Faddern är en kollega, inte en chef.',
  'Varslingsrutinen trykket og hengt opp på alle rigger': 'Visselblåsarrutinen tryckt och uppsatt på alla arbetsplatser',
  'Ytringsklima gikk fra 39 til 48 i grunnlinjen etterpå. Effekten er dokumentert og tiltaket lukket.':
    'Yttrandeklimatet gick från 39 till 48 i baslinjemätningen efteråt. Effekten är dokumenterad och åtgärden avslutad.',
  'Tiltaket vurderes som ikke tilstrekkelig alene, og følges opp med fast svarfrist på avviksmeldinger.':
    'Åtgärden bedöms inte räcka på egen hand och följs upp med en fast svarstid för avvikelserapporter.',
  'To innleide ekstra i høysesongen': 'Två extra inhyrda under högsäsongen',
  'Arbeidsmengde steg fire poeng, men falt tilbake i 2026. Vurder om tiltaket må gjentas.':
    'Arbetsmängden steg fyra poäng men föll tillbaka 2026. Överväg om åtgärden behöver upprepas.',
  'Effekten er borte året etter. Det vurderes om tiltaket må gjentas fast hver høysesong.':
    'Effekten var borta året efter. Vi överväger att upprepa åtgärden varje högsäsong.',
  'Faste fredagsgjennomganger på Verksted': 'Fasta fredagsgenomgångar på Verkstaden',
  'Kollegastøtte er den høyeste faktoren i 2026. Tiltaket regnes som virksomt og videreføres som rutine.':
    'Stöd från arbetskamrater är den högsta faktorn 2026. Åtgärden bedöms fungera och fortsätter som rutin.',
  'Tiltaket regnes som virksomt og videreføres som fast rutine.': 'Åtgärden bedöms fungera och fortsätter som fast rutin.',

  // the risk assessment
  'Sannsynlighet for uønsket tilstand vurdert mot konsekvens for helse, sikkerhet og velferd. Faktorene er også vurdert samlet, siden arbeidsmengde og motstridende krav virker sammen.':
    'Sannolikheten för ohälsa bedömd mot konsekvensen för hälsa och säkerhet. Faktorerna är också bedömda tillsammans, eftersom arbetsmängd och oförenliga krav samverkar.',
  'Ansatte melder at avvik ikke følges opp. Over tid svekker det både sikkerhetsarbeidet og tilliten, og øker risikoen for at alvorlige forhold ikke kommer fram.':
    'Medarbetarna uppger att avvikelser inte följs upp. Med tiden försvagar det både säkerhetsarbetet och förtroendet, och det blir troligare att allvarliga förhållanden inte kommer fram.',
  'Vedvarende ubalanse mellom oppgaver og tid på Prosjekt. Kombinert med uklare prioriteringer gir det risiko for helseskadelig belastning over tid.':
    'En långvarig obalans mellan arbetsuppgifter och tid på Projekt. Tillsammans med otydliga prioriteringar ger det risk för ohälsosam arbetsbelastning över tid.',
  'Motstridende krav forsterker belastningen fra arbeidsmengde. Vurderes samlet med faktoren over.':
    'Oförenliga krav förstärker belastningen från arbetsmängden. Bedöms tillsammans med faktorn ovan.',

  // information and training
  'Oppsummering av funnene lagt fram på allmøte.': 'En sammanfattning av resultaten presenterad på personalmöte.',
  'Samme oppsummering skriftlig i personalhåndboka.': 'Samma sammanfattning skriftligt i personalhandboken.',
  'Saksframlegget delt en uke før AMU.': 'Underlaget skickat en vecka före skyddskommittén.',
  'Hver leder fikk sine egne tall samme uke som resultatet ble frigitt.':
    'Varje chef fick sina egna siffror samma vecka som resultatet släpptes.',
  'Oppfølging av psykososiale forhold': 'Organisatorisk och social arbetsmiljö i praktiken',
  'Kurs for ledere med personalansvar.': 'Utbildning för chefer med personalansvar.',
  'Gjennomgang av varslingsrutinen': 'Genomgång av visselblåsarrutinen',
  'Gjennomgått i alle team.': 'Genomgången i alla team.',

  // the comments and the replies to them
  'Høysesongen er umulig med dagens bemanning.': 'Högsäsongen är omöjlig med dagens bemanning.',
  'Vi leier inn to ekstra fra januar. Si fra om det monner.': 'Vi hyr in två extra från januari. Säg till om det gör skillnad.',
  'Vi har meldt om den samme feilen på løfteutstyret tre ganger.': 'Vi har rapporterat samma fel på lyftutrustningen tre gånger.',
  'Utstyret er byttet 3. oktober. Takk for at du sto på.': 'Utrustningen byttes den 3 oktober. Tack för att du inte gav upp.',
  'Vil bare si at omleggingen av morgenmøtet var et godt grep.': 'Vill bara säga att det nya upplägget på morgonmötet var ett bra grepp.',
  'Godt å høre — vi beholder det.': 'Skönt att höra — vi behåller det.',
  'Ny leder er engasjert, men vi ser henne for lite ute.': 'Nya chefen är engagerad, men vi ser henne för lite ute på plats.',
  'Jeg setter opp faste besøk på anleggene hver tirsdag fra juni.': 'Jag lägger in fasta besök på arbetsplatserna varje tisdag från juni.',
  'Fredagsgjennomgangene har gjort at vi faktisk snakker sammen.': 'Fredagsgenomgångarna har gjort att vi faktiskt pratar med varandra.',
  'Da fortsetter vi med dem.': 'Då fortsätter vi med dem.',
  'Alle prosjektene har frist samme uke i november. Hvert år.': 'Alla projekt har deadline samma vecka i november. Varje år.',
  'Vi tar det opp med kundene før neste kontraktsrunde.': 'Vi tar upp det med kunderna före nästa avtalsomgång.',
  'Det hjelper ikke å si fra. Vi meldte avvik på riggingen i vår og hørte aldri noe.':
    'Det hjälper inte att säga ifrån. Vi rapporterade en avvikelse på riggningen i våras och hörde aldrig något.',
  'Man blir fort stemplet som vanskelig hvis man tar opp ting på morgenmøtet.':
    'Man blir snabbt stämplad som besvärlig om man tar upp saker på morgonmötet.',
  'Avviksskjemaet er så tungvint at folk heller lar være.': 'Avvikelseblanketten är så krånglig att folk hellre låter bli.',
  'Lederen min tar det på alvor når jeg sier fra. Det burde gjelde alle.':
    'Min chef tar det på allvar när jag säger ifrån. Så borde det vara för alla.',
  'Takk — vi tar det med inn i arbeidet med ytringsklima.': 'Tack — vi tar med det i arbetet med yttrandeklimatet.',
  'Tre prosjekter samtidig og ingen som sier hva som skal vike.': 'Tre projekt samtidigt och ingen som säger vad som ska prioriteras bort.',
  'Jeg jobber kveld nesten hver uke i høysesong.': 'Jag jobbar kväll nästan varje vecka under högsäsong.',
  'To prosjektledere ber om det samme mannskapet samme uke.': 'Två projektledare vill ha samma arbetslag samma vecka.',
  'Etter ulykken i mai snakket vi aldri om det.': 'Efter olyckan i maj pratade vi aldrig om det.',
  'Lederen er flink, men sitter aldri ute hos oss.': 'Chefen är duktig men är aldrig ute hos oss.',
  'Samholdet på laget er det beste med jobben.': 'Sammanhållningen i laget är det bästa med jobbet.',
  'Omleggingen av morgenmøtet var et godt grep.': 'Det nya upplägget på morgonmötet var ett bra grepp.',
  'Så fint å høre — vi fortsetter med det.': 'Så roligt att höra — vi fortsätter med det.',
  'Fint at vi fikk være med å velge nytt verktøy.': 'Bra att vi fick vara med och välja nya verktyg.',
}

/**
 * What the organisation is in Sweden, after the rows are written: no Norwegian register snapshot and
 * no occupational health service of the Norwegian kind (Sweden has no industry list, AML 3 kap. 2 c §),
 * no fellesferie to skip, and each measure citing its factor's provision in the Swedish pack
 * (lib/legal/pack.ts factorLawRefs) rather than a Norwegian one.
 */
export const AFTER = (org) => `
update app.organizations set
  bht_name = null, registry_fetched_at = null, registry_form_code = null, registry_form_label = null,
  registry_nace_code = null, registry_nace_label = null, registry_registered_on = null,
  registry_address = null, registry_municipality = null, registry_municipality_no = null,
  registry_employees = null, registry_vat = null
where id = '${org}';
update app.year_wheels set skip_fellesferie = false where org_id = '${org}';
update app.measures set law_ref = null where org_id = '${org}';`
