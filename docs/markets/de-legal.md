# Germany — the law behind the market pack (DE-L)

What the product says about the law in Germany, with the provision it rests on, read on 2026-10-29 from the
Federal Ministry of Justice's own text service (gesetze-im-internet.de). The structure follows
`docs/markets/se-legal.md`: for each of the fourteen things the Norwegian texts say about the law, the German
provision, verbatim, and how a product text should cite it. German citation convention puts the section first and
the act last: «§ 5 Abs. 3 Nr. 6 ArbSchG», «§ 87 Abs. 1 Nr. 7 BetrVG».

Two documents the German texts will also rest on could not be read from this environment (the GDA portal and the
BAuA answer 403 to every request, and a retry with browser headers was refused by the session's permission
classifier): the GDA guideline on psychological load and the GDA recommendations on the Gefährdungsbeurteilung
psychischer Belastung. What this file says about them is from memory and is listed under UNVERIFIED; a product
text cites the statute, never the guideline, until they are read.

## Sources read, with their version

| Short name | Source | Version on the page |
|---|---|---|
| ArbSchG | Arbeitsschutzgesetz, https://www.gesetze-im-internet.de/arbschg/BJNR124610996.html | «Zuletzt geändert durch Art. 7 G v. 22.12.2025 I Nr. 369» |
| BetrVG | Betriebsverfassungsgesetz, https://www.gesetze-im-internet.de/betrvg/BJNR000130972.html | «Neugefasst durch Bek. v. 25.9.2001 I 2518»; the amendment line was not captured by the extractor |
| SGB VII | Siebtes Buch Sozialgesetzbuch, https://www.gesetze-im-internet.de/sgb_7/BJNR125410996.html | «Zuletzt geändert durch Art. 3 G v. 12.5.2026 I Nr. 140» |
| ASiG | Arbeitssicherheitsgesetz, https://www.gesetze-im-internet.de/asig/BJNR018850973.html | «Zuletzt geändert durch Art. 3 Abs. 5 G v. 20.4.2013 I 868» |
| AGG | Allgemeines Gleichbehandlungsgesetz, https://www.gesetze-im-internet.de/agg/BJNR189710006.html | «Zuletzt geändert durch Art. 15 G v. 22.12.2023 I Nr. 414» |
| ArbZG | Arbeitszeitgesetz, https://www.gesetze-im-internet.de/arbzg/BJNR117100994.html | «Zuletzt geändert durch Art. 52 G v. 23.10.2024 I Nr. 323» |
| BDSG | Bundesdatenschutzgesetz, https://www.gesetze-im-internet.de/bdsg_2018/BJNR209710017.html | «Zuletzt geändert durch Art. 3 G v. 12.5.2026 I Nr. 139» |
| GDA | Leitlinie «Beratung und Überwachung bei psychischer Belastung am Arbeitsplatz» and «Empfehlungen zur Umsetzung der Gefährdungsbeurteilung psychischer Belastung», gda-portal.de | **not read** (403) — see UNVERIFIED 1 |
| BAuA | baua.de, Gefährdungsbeurteilung psychischer Belastung | **not read** (403) — see UNVERIFIED 1 |
| DGUV Vorschrift 1 | «Grundsätze der Prävention», publikationen.dguv.de | **not read** (the download redirected and was not followed) — see UNVERIFIED 2 |

The extracted sections are kept with the session (scratchpad `de-law-out/`), not in the repository.

Three thresholds count differently, and product texts must not mix them:
- **BetrVG counts the Betrieb:** «in der Regel mindestens fünf ständigen wahlberechtigten Arbeitnehmern» (§ 1).
- **ASiG counts the Betrieb with part-time weighting:** «mehr als zwanzig Beschäftigten», part-timers at 0,5 or 0,75 (§ 11).
- **SGB VII counts the Unternehmen:** «regelmäßig 50 oder mehr Beschäftigten» (§ 22 Abs. 1 Satz 1).
- **ArbSchG § 6 has no threshold** any more: the documentation duty applies to every employer (section 3).

## 1. Systematic HSE work: survey, assess, plan, act

**Norway:** aml § 3-1 (2) c (kartlegge farer og problemer, vurdere risiko, utarbeide planer og iverksette tiltak).

**Germany:** the Arbeitsschutzgesetz, with the Gefährdungsbeurteilung as the one instrument.

| Step | Provision | Verbatim |
|---|---|---|
| General duty | § 3 Abs. 1 Satz 1 ArbSchG | «Der Arbeitgeber ist verpflichtet, die erforderlichen Maßnahmen des Arbeitsschutzes unter Berücksichtigung der Umstände zu treffen, die Sicherheit und Gesundheit der Beschäftigten bei der Arbeit beeinflussen.» |
| Check and adapt | § 3 Abs. 1 Satz 2 und 3 | «Er hat die Maßnahmen auf ihre Wirksamkeit zu überprüfen und erforderlichenfalls sich ändernden Gegebenheiten anzupassen. Dabei hat er eine Verbesserung von Sicherheit und Gesundheitsschutz der Beschäftigten anzustreben.» |
| Organisation and means | § 3 Abs. 2 | «… hat der Arbeitgeber unter Berücksichtigung der Art der Tätigkeiten und der Zahl der Beschäftigten 1. für eine geeignete Organisation zu sorgen und die erforderlichen Mittel bereitzustellen sowie 2. Vorkehrungen zu treffen, daß die Maßnahmen erforderlichenfalls bei allen Tätigkeiten und eingebunden in die betrieblichen Führungsstrukturen beachtet werden …» |
| No cost to employees | § 3 Abs. 3 | «Kosten für Maßnahmen nach diesem Gesetz darf der Arbeitgeber nicht den Beschäftigten auferlegen.» |
| Assess (the survey step) | § 5 Abs. 1 | «Der Arbeitgeber hat durch eine Beurteilung der für die Beschäftigten mit ihrer Arbeit verbundenen Gefährdung zu ermitteln, welche Maßnahmen des Arbeitsschutzes erforderlich sind.» |
| Per kind of work | § 5 Abs. 2 | «Der Arbeitgeber hat die Beurteilung je nach Art der Tätigkeiten vorzunehmen. Bei gleichartigen Arbeitsbedingungen ist die Beurteilung eines Arbeitsplatzes oder einer Tätigkeit ausreichend.» |
| Psychological load named | § 5 Abs. 3 Nr. 6 | «Eine Gefährdung kann sich insbesondere ergeben durch … 6. psychische Belastungen bei der Arbeit.» |
| Act | § 3 Abs. 1 Satz 1, § 4 | the measures the assessment shows to be required, under the Grundsätze of § 4 (section 4) |
| Document | § 6 Abs. 1 | section 3 |

The German chain is **§ 5 → § 3 Abs. 1 → § 6 ArbSchG**: assess, act and check, document. The statute sets no
interval: § 3 Abs. 1 Satz 2 ties the review to effectiveness and to «sich ändernden Gegebenheiten», and § 12 Abs. 1
Satz 4 says instruction «muß … erforderlichenfalls regelmäßig wiederholt werden». How often a Gefährdungsbeurteilung
is to be updated is the GDA's recommendation, not the statute's (UNVERIFIED 1).

**How a product text should cite it:** «Gefährdungsbeurteilung (§ 5 ArbSchG)»; for the psychological part
«§ 5 Abs. 3 Nr. 6 ArbSchG»; for acting and checking «§ 3 Abs. 1 ArbSchG»; for the whole chain «§§ 3, 5 und 6
ArbSchG». Never «jährlich» or «regelmäßig» as if the statute said so.

## 2. Continuous control and review of the system itself

**Norway:** aml § 3-1 (2) g (løpende kontroll) and h (systematisk overvåking og gjennomgåelse av internkontrollen).

**Germany:**
- Effectiveness check and adaptation: § 3 Abs. 1 Satz 2 ArbSchG (quoted above). The duty is continuous, not
  annual.
- Review on change: no clause in § 5 says «bei Änderungen», but § 3 Abs. 1 Satz 2 («sich ändernden Gegebenheiten»)
  and § 12 Abs. 1 Satz 3 («bei Veränderungen im Aufgabenbereich, der Einführung neuer Arbeitsmittel oder einer
  neuen Technologie») carry it.
- Organisation: § 3 Abs. 2 Nr. 1 and 2 (quoted above): a suitable organisation, the means, and the measures
  «eingebunden in die betrieblichen Führungsstrukturen».

**How a product text should cite it:** «Wirksamkeit prüfen und anpassen (§ 3 Abs. 1 ArbSchG)». Do not write
«jährliche Überprüfung» for Germany; write «bei Änderungen und in angemessenen Abständen», and cite the statute for
the first half only.

## 3. Documentation and the employee-count thresholds

**Norway:** aml § 3-1 (3) and the internkontroll regulation's documentation requirements.

**Germany:**

| What | Provision | Written when | Verbatim |
|---|---|---|---|
| Result of the assessment, the measures, the result of their review | § 6 Abs. 1 Satz 1 ArbSchG | **Always** (no threshold in the current text) | «Der Arbeitgeber muß über die je nach Art der Tätigkeiten und der Zahl der Beschäftigten erforderlichen Unterlagen verfügen, aus denen das Ergebnis der Gefährdungsbeurteilung, die von ihm festgelegten Maßnahmen des Arbeitsschutzes und das Ergebnis ihrer Überprüfung ersichtlich sind.» |
| Summarised where conditions are alike | § 6 Abs. 1 Satz 2 | — | «Bei gleichartiger Gefährdungssituation ist es ausreichend, wenn die Unterlagen zusammengefaßte Angaben enthalten.» |
| Accidents | § 6 Abs. 2 | always | fatal or over three days' incapacity |

The former relief for employers with ten or fewer employees is gone from § 6: the current text has no such sentence.
«Je nach Art der Tätigkeiten und der Zahl der Beschäftigten» scales the documents, it does not waive them.

Other thresholds that the texts touch (none is about documentation):

| Body or person | Provision | Threshold |
|---|---|---|
| Betriebsrat | § 1 Abs. 1 BetrVG | «In Betrieben mit in der Regel mindestens fünf ständigen wahlberechtigten Arbeitnehmern, von denen drei wählbar sind, werden Betriebsräte gewählt.» A right of the employees, not a duty of the employer (section 5) |
| Arbeitsschutzausschuss | § 11 ASiG | «in Betrieben mit mehr als zwanzig Beschäftigten», part-time weighted 0,5 / 0,75 (section 6) |
| Sicherheitsbeauftragte | § 22 Abs. 1 SGB VII | «In Unternehmen mit regelmäßig 50 oder mehr Beschäftigten»; between 20 and 50 only «wenn … eine besondere Gefährdung für Leben und Gesundheit besteht»; under 250 without special risk one suffices (section 5) |
| Betriebsarzt, Fachkraft für Arbeitssicherheit | §§ 2, 5 ASiG | no number in the statute: «soweit dies erforderlich ist im Hinblick auf» the kind of business, the number of employees and the organisation (section 7) |

**How a product text should cite it:** «Das Ergebnis der Gefährdungsbeurteilung, die Maßnahmen und das Ergebnis
ihrer Überprüfung sind zu dokumentieren (§ 6 ArbSchG)». Never «ab zehn Beschäftigten».

## 4. The psychosocial factors

**Norway:** aml § 4-3 and forskrift om utførelse av arbeid kap. 1A (§ 1A-1), which name the psychosocial factors.

**Germany:** the statute names the category, not the factors.

- **§ 5 Abs. 3 Nr. 6 ArbSchG:** «psychische Belastungen bei der Arbeit» — one of six sources of Gefährdung the
  assessment must cover.
- **§ 4 Nr. 1 ArbSchG:** «Die Arbeit ist so zu gestalten, daß eine Gefährdung für das Leben sowie die physische und
  die psychische Gesundheit möglichst vermieden und die verbleibende Gefährdung möglichst gering gehalten wird».
- **§ 4 Nr. 4 ArbSchG:** «Maßnahmen sind mit dem Ziel zu planen, Technik, Arbeitsorganisation, sonstige
  Arbeitsbedingungen, soziale Beziehungen und Einfluß der Umwelt auf den Arbeitsplatz sachgerecht zu verknüpfen» —
  the statute's own list of the fields a measure must join up, and the closest statutory counterpart to the GDA's
  Merkmalsbereiche.
- **§ 4 Nr. 3 ArbSchG:** measures must follow «gesicherte arbeitswissenschaftliche Erkenntnisse» — the hook for a
  validated instrument.
- **§ 5 Abs. 3 Nr. 4:** «die Gestaltung von Arbeits- und Fertigungsverfahren, Arbeitsabläufen und Arbeitszeit und
  deren Zusammenwirken» — workload and working time sit here too.

**Are the eleven factors named?** No factor is named in the statute. The GDA recommendations (UNVERIFIED 1) group
psychological load into Merkmalsbereiche — Arbeitsinhalt/Arbeitsaufgabe, Arbeitsorganisation, soziale Beziehungen,
Arbeitsumgebung, and new forms of work — and name features under each (Handlungsspielraum, Vollständigkeit der
Aufgabe, emotionale Inanspruchnahme, Arbeitsintensität, Kommunikation/Kooperation, Beziehungen zu Vorgesetzten und
Kollegen, among others). The eleven factors map onto them like this; the mapping is ours, and a product text says
so («entspricht», never «nach der GDA-Leitlinie» until it is read):

| Factor | Where it sits | Statutory anchor beside § 5 Abs. 3 Nr. 6 |
|---|---|---|
| Arbeidsmengde (workload) | Arbeitsorganisation: Arbeitsintensität | § 5 Abs. 3 Nr. 4 (Arbeitsabläufe und Arbeitszeit); §§ 3, 5 ArbZG |
| Rolleklarhet (role clarity) | Arbeitsinhalt: Information, Verantwortung | § 12 Abs. 1 (Unterweisung «eigens auf den Arbeitsplatz oder den Aufgabenbereich … ausgerichtet») |
| Motstridende krav (conflicting demands) | Arbeitsinhalt: Rollenkonflikte | § 4 Nr. 4 (Arbeitsorganisation) |
| Medvirkning (participation) | Arbeitsinhalt: Handlungsspielraum | § 17 Abs. 1 ArbSchG (Vorschlagsrecht); § 80 Abs. 1 Nr. 3 BetrVG |
| Emosjonelle krav (emotional demands) | Arbeitsinhalt: emotionale Inanspruchnahme | § 4 Nr. 1 (psychische Gesundheit) |
| Støtte fra leder (support from manager) | soziale Beziehungen: Vorgesetzte | § 3 Abs. 2 Nr. 2 (Führungsstrukturen) |
| Støtte fra kollegaer (support from colleagues) | soziale Beziehungen: Kollegen | § 4 Nr. 4 (soziale Beziehungen) |
| Kontakt og kommunikasjon (contact and communication) | Arbeitsorganisation: Kommunikation, Kooperation | § 4 Nr. 4 |
| Integritet og verdighet (integrity and dignity) | soziale Beziehungen | §§ 3, 7, 12, 13 AGG (section 12) |
| Ytringsklima (freedom to speak up) | soziale Beziehungen | § 17 ArbSchG; § 13 AGG; § 80 Abs. 1 Nr. 3 BetrVG |
| Mening og anerkjennelse (meaning and recognition) | Arbeitsinhalt: Vollständigkeit, Sinn; soziale Beziehungen: Anerkennung | § 2 Abs. 1 («menschengerechte Gestaltung der Arbeit») |

**What the eleven factors do not cover:** the Merkmalsbereich **Arbeitsumgebung** (physical conditions as a source
of psychological load: noise, light, climate, ergonomics) and **Arbeitszeit** as a field of its own (shift work,
on-call). A German Gefährdungsbeurteilung psychischer Belastung that rests on the eleven factors alone leaves those
to the employer's other assessment steps; a module for Germany (DE-D) can close the gap, as Sweden's working-time
module did (D-263).

**How a product text should cite it:** «psychische Belastungen bei der Arbeit (§ 5 Abs. 3 Nr. 6 ArbSchG)»; the
Grundsätze «§ 4 ArbSchG». Describe a factor, do not attribute its name to the statute: «ob die Beschäftigten
wissen, was von ihnen erwartet wird (Rollenklarheit)», not «Rollenklarheit nach ArbSchG».

## 5. Verneombud → Betriebsrat, Sicherheitsbeauftragte, and the firm without either

**Norway:** aml §§ 6-1, 6-2 (verneombud, elected, mandatory from five employees).

**Germany has no verneombud.** Two figures carry parts of the role, and most small firms have neither.

- **The Betriebsrat is the employees' representation, where the employees have elected one.** § 1 Abs. 1 BetrVG:
  «In Betrieben mit in der Regel mindestens fünf ständigen wahlberechtigten Arbeitnehmern, von denen drei wählbar
  sind, werden Betriebsräte gewählt.» The statute gives the right; it does not oblige the employer to create one,
  and a Betrieb without a Betriebsrat is lawful.
- **Its tasks — § 80 Abs. 1 BetrVG:** «1. darüber zu wachen, dass die zugunsten der Arbeitnehmer geltenden Gesetze,
  Verordnungen, Unfallverhütungsvorschriften, Tarifverträge und Betriebsvereinbarungen durchgeführt werden; 2.
  Maßnahmen, die dem Betrieb und der Belegschaft dienen, beim Arbeitgeber zu beantragen; … 3. Anregungen von
  Arbeitnehmern … entgegenzunehmen …; … 9. Maßnahmen des Arbeitsschutzes und des betrieblichen Umweltschutzes zu
  fördern.»
- **Information — § 80 Abs. 2:** «Zur Durchführung seiner Aufgaben nach diesem Gesetz ist der Betriebsrat
  rechtzeitig und umfassend vom Arbeitgeber zu unterrichten … Dem Betriebsrat sind auf Verlangen jederzeit die zur
  Durchführung seiner Aufgaben erforderlichen Unterlagen zur Verfügung zu stellen».
- **Co-determination — § 87 Abs. 1 BetrVG:** «Der Betriebsrat hat, soweit eine gesetzliche oder tarifliche Regelung
  nicht besteht, in folgenden Angelegenheiten mitzubestimmen: … 6. Einführung und Anwendung von technischen
  Einrichtungen, die dazu bestimmt sind, das Verhalten oder die Leistung der Arbeitnehmer zu überwachen; 7.
  Regelungen über die Verhütung von Arbeitsunfällen und Berufskrankheiten sowie über den Gesundheitsschutz im Rahmen
  der gesetzlichen Vorschriften oder der Unfallverhütungsvorschriften». Abs. 2: «Kommt eine Einigung … nicht
  zustande, so entscheidet die Einigungsstelle.» The Gefährdungsbeurteilung's method is co-determined under Nr. 7 —
  that is the Federal Labour Court's reading, not the statute's words (UNVERIFIED 3).
- **Arbeitsschutz — § 89 BetrVG:** Abs. 1 «Der Betriebsrat hat sich dafür einzusetzen, dass die Vorschriften über
  den Arbeitsschutz und die Unfallverhütung im Betrieb … durchgeführt werden.» Abs. 2 «Der Arbeitgeber … [ist]
  verpflichtet, den Betriebsrat oder die von ihm bestimmten Mitglieder des Betriebsrats bei allen im Zusammenhang
  mit dem Arbeitsschutz oder der Unfallverhütung stehenden Besichtigungen und Fragen und bei Unfalluntersuchungen
  hinzuzuziehen.» Abs. 5: it receives the minutes.
- **Personalfragebogen — § 94 Abs. 1 BetrVG:** «Personalfragebogen bedürfen der Zustimmung des Betriebsrats.» An
  anonymous survey that stores nothing about a person is not a Personalfragebogen; whether a given employee survey
  is one is a question of its content, and the safe practice is a Betriebsvereinbarung in any case (UNVERIFIED 4).
- **Betriebsarzt and Fachkraft cooperate with it — § 9 ASiG:** Abs. 1 «… haben bei der Erfüllung ihrer Aufgaben mit
  dem Betriebsrat zusammenzuarbeiten.» Abs. 3: they are appointed and dismissed «mit Zustimmung des Betriebsrats».
- **Sicherheitsbeauftragte — § 22 SGB VII:** appointed by the employer, «unter Beteiligung des Betriebsrates oder
  Personalrates», from 50 employees (Abs. 1 Satz 1), between 20 and 50 only where the Gefährdungsbeurteilung shows
  «eine besondere Gefährdung für Leben und Gesundheit» (Satz 3). Their task is to support the employer, «insbesondere
  sich von dem Vorhandensein und der ordnungsgemäßen Benutzung der vorgeschriebenen Schutzeinrichtungen und
  persönlichen Schutzausrüstungen zu überzeugen und auf Unfall- und Gesundheitsgefahren … aufmerksam zu machen»
  (Abs. 2), and they «dürfen … wegen der Erfüllung der ihnen übertragenen Aufgaben nicht benachteiligt werden»
  (Abs. 3). They are not a representation of the employees.
- **The firm without either:** the duties of §§ 3, 5 and 6 ArbSchG apply unchanged. The employees keep their own
  rights: proposals «zu allen Fragen der Sicherheit und des Gesundheitsschutzes bei der Arbeit» (§ 17 Abs. 1
  ArbSchG) and the complaint to the authority «ohne Nachteile» (§ 17 Abs. 2); and their duty to support the
  employer «gemeinsam mit dem Betriebsarzt und der Fachkraft für Arbeitssicherheit» (§ 16 Abs. 2).

**What this means for the product's third role.** The role that is «verneombud» in Norway and «Skyddsombud» in
Sweden is, in Germany, the person the Betriebsrat names — in German the role is labelled «Betriebsrat» — and it
reads results at group level as the others do. Where there is no Betriebsrat, the organisation either leaves the
role empty or gives it to a person the employees choose (a Sicherheitsbeauftragte/r, for instance); a text never
tells a German firm it must have one. Whether Germany gets roles of its own (a Betriebsrat role beside the third
role, an external adviser such as the Fachkraft or the Betriebsarzt with read access) is Tor's decision
(PLAN.md, «Decisions only the owner can make»); nothing here needs it.

**How a product text should cite it:** «Betriebsrat ab fünf wahlberechtigten Arbeitnehmern, wenn die Beschäftigten
einen wählen (§ 1 BetrVG)»; «Mitbestimmung beim Gesundheitsschutz (§ 87 Abs. 1 Nr. 7 BetrVG)»; «Unterrichtung und
Unterlagen (§ 80 Abs. 2 BetrVG)»; «Hinzuziehung bei allen Fragen des Arbeitsschutzes (§ 89 Abs. 2 BetrVG)»;
«Sicherheitsbeauftragte ab 50 Beschäftigten (§ 22 SGB VII)».

## 6. AMU → Arbeitsschutzausschuss

**Norway:** aml § 7-1 (required from 30, may be demanded from 10–30) and § 7-2 (tasks).

**Germany — § 11 ASiG:** «Soweit in einer sonstigen Rechtsvorschrift nichts anderes bestimmt ist, hat der
Arbeitgeber in Betrieben mit mehr als zwanzig Beschäftigten einen Arbeitsschutzausschuß zu bilden; bei der
Feststellung der Zahl der Beschäftigten sind Teilzeitbeschäftigte mit einer regelmäßigen wöchentlichen Arbeitszeit
von nicht mehr als 20 Stunden mit 0,5 und nicht mehr als 30 Stunden mit 0,75 zu berücksichtigen.» Members: «dem
Arbeitgeber oder einem von ihm Beauftragten, zwei vom Betriebsrat bestimmten Betriebsratsmitgliedern,
Betriebsärzten, Fachkräften für Arbeitssicherheit und Sicherheitsbeauftragten nach § 22 des Siebten Buches
Sozialgesetzbuch.» Task and rhythm: «Der Arbeitsschutzausschuß hat die Aufgabe, Anliegen des Arbeitsschutzes und der
Unfallverhütung zu beraten. Der Arbeitsschutzausschuß tritt mindestens einmal vierteljährlich zusammen.»

Unlike aml § 7-1 there is no «may be demanded» band under the threshold, and the threshold is **more than twenty**
with part-time weighting. Nothing in § 11 gives the ASA a list of matters it must handle (Norway's § 7-2); the
Gefährdungsbeurteilung reaches it as «Anliegen des Arbeitsschutzes».

**How a product text should cite it:** «Arbeitsschutzausschuss ab mehr als zwanzig Beschäftigten, mindestens
vierteljährlich (§ 11 ASiG)».

## 7. Bedriftshelsetjeneste → Betriebsarzt und Fachkraft für Arbeitssicherheit

**Norway:** aml § 3-3 and the forskrift's industry list.

**Germany — ASiG:** § 1: «Der Arbeitgeber hat nach Maßgabe dieses Gesetzes Betriebsärzte und Fachkräfte für
Arbeitssicherheit zu bestellen. Diese sollen ihn beim Arbeitsschutz und bei der Unfallverhütung unterstützen.» § 2
Abs. 1 and § 5 Abs. 1: the appointment is in writing and «soweit dies erforderlich ist im Hinblick auf» the kind of
business and its risks, the number and composition of the workforce, and the organisation (§ 5 also «die Kenntnisse
und die Schulung des Arbeitgebers … in Fragen des Arbeitsschutzes»). No industry list and no employee number sit in
the statute; the extent of the Betreuung is set by the accident insurers' rules (DGUV Vorschrift 2, not read —
UNVERIFIED 2). The employer must let them do their work and support them (§ 2 Abs. 2, § 5 Abs. 2), and they
cooperate with the Betriebsrat (§ 9, section 5).

**How a product text should cite it:** «Betriebsarzt und Fachkraft für Arbeitssicherheit (§§ 2 und 5 ASiG)». Never
a number of employees from which they are required.

## 8. Control measures (aml kap. 9)

**Norway:** aml kap. 9 (kontrolltiltak), with § 9-2's drøfting marker in the product.

**Germany:**
- **Co-determination on monitoring technology — § 87 Abs. 1 Nr. 6 BetrVG** (quoted in section 5): «technischen
  Einrichtungen, die dazu bestimmt sind, das Verhalten oder die Leistung der Arbeitnehmer zu überwachen». The
  Federal Labour Court reads «bestimmt» as «geeignet» — a system that can monitor is covered whether or not the
  employer intends it (UNVERIFIED 3). A survey whose answers cannot be traced to a person and whose results are
  shown only at group level is not suited to monitor anyone's behaviour or performance; that is the product's
  argument, and it rests on the anonymity being structural (CLAUDE.md), not on a promise.
- **Employee data — § 26 BDSG** (section 10).
- **Health protection — § 87 Abs. 1 Nr. 7 BetrVG:** the method of the Gefährdungsbeurteilung is co-determined
  (UNVERIFIED 3), so where a Betriebsrat exists, the survey as the method of assessing psychological load is agreed
  with it, in practice in a Betriebsvereinbarung.

**How a product text should cite it:** «keine Überwachung von Verhalten oder Leistung (§ 87 Abs. 1 Nr. 6 BetrVG)»;
«Mitbestimmung bei der Methode der Gefährdungsbeurteilung (§ 87 Abs. 1 Nr. 7 BetrVG)». Where the Norwegian text
shows the «§ 9-2 drøftet» marker, the German counterpart is «mit dem Betriebsrat vereinbart (§ 87 Abs. 1 Nr. 7
BetrVG)», shown only where the organisation has a Betriebsrat.

## 9. Varsling → Hinweisgeberschutz, and the complaint to the authority

**Norway:** aml kap. 2 A (varsling).

**Germany:**
- **Complaint to the authority without disadvantage — § 17 Abs. 2 ArbSchG:** «Sind Beschäftigte auf Grund konkreter
  Anhaltspunkte der Auffassung, daß die vom Arbeitgeber getroffenen Maßnahmen und bereitgestellten Mittel nicht
  ausreichen, um die Sicherheit und den Gesundheitsschutz bei der Arbeit zu gewährleisten, und hilft der Arbeitgeber
  darauf gerichteten Beschwerden von Beschäftigten nicht ab, können sich diese an die zuständige Behörde wenden.
  Hierdurch dürfen den Beschäftigten keine Nachteile entstehen.» The same paragraph leaves «die Vorschriften des
  Hinweisgeberschutzgesetzes» untouched.
- **The Hinweisgeberschutzgesetz (2023)** was not read (UNVERIFIED 5). A product text does not describe its channels.
- **Reporting danger — § 16 Abs. 1 ArbSchG:** «Die Beschäftigten haben dem Arbeitgeber oder dem zuständigen
  Vorgesetzten jede von ihnen festgestellte unmittelbare erhebliche Gefahr für die Sicherheit und Gesundheit …
  unverzüglich zu melden.» Abs. 2 adds that they «sollen» also tell the Fachkraft, the Betriebsarzt or the
  Sicherheitsbeauftragte.

**How a product text should cite it:** «Beschwerde bei der zuständigen Behörde ohne Nachteile (§ 17 Abs. 2
ArbSchG)». Never a description of the whistle-blowing channels until the HinSchG is read.

## 10. Lawful basis for an employer's work-environment survey

**Norway:** the product relies on the statutory duty to survey (aml § 3-1, § 4-3), not on consent.

**Germany:**
- **Employee data — § 26 Abs. 1 Satz 1 BDSG:** «Personenbezogene Daten von Beschäftigten dürfen für Zwecke des
  Beschäftigungsverhältnisses verarbeitet werden, wenn dies … nach Begründung des Beschäftigungsverhältnisses für
  dessen Durchführung oder Beendigung oder zur Ausübung oder Erfüllung der sich aus einem Gesetz oder einem
  Tarifvertrag, einer Betriebs- oder Dienstvereinbarung (Kollektivvereinbarung) ergebenden Rechte und Pflichten der
  Interessenvertretung der Beschäftigten erforderlich ist.» The Gefährdungsbeurteilung is a statutory duty of the
  employer (§ 5 ArbSchG), so the processing the survey needs — an invitation to a person, a link, a reminder — is
  «für dessen Durchführung … erforderlich»; beside it stands Art. 6 Abs. 1 lit. c DSGVO.
- **Consent is a weak basis — § 26 Abs. 2 BDSG:** «… sind für die Beurteilung der Freiwilligkeit der Einwilligung
  insbesondere die im Beschäftigungsverhältnis bestehende Abhängigkeit der beschäftigten Person … zu
  berücksichtigen.» It must be in writing or electronic, with information on the purpose and the right to withdraw.
  The product does not rest on it.
- **A Betriebsvereinbarung is a basis of its own — § 26 Abs. 4 BDSG:** «Die Verarbeitung personenbezogener Daten …
  von Beschäftigten für Zwecke des Beschäftigungsverhältnisses ist auf der Grundlage von Kollektivvereinbarungen
  zulässig. Dabei haben die Verhandlungspartner Artikel 88 Absatz 2 der Verordnung (EU) 2016/679 zu beachten.»
- **Principles — § 26 Abs. 5:** the controller «muss geeignete Maßnahmen ergreifen, um sicherzustellen, dass
  insbesondere die in Artikel 5 der Verordnung (EU) 2016/679 dargelegten Grundsätze … eingehalten werden» — data
  minimisation is the principle the structural anonymity serves.
- **The Betriebsrat's rights stand — § 26 Abs. 6:** «Die Beteiligungsrechte der Interessenvertretungen der
  Beschäftigten bleiben unberührt.»
- **The answers themselves:** stored without anything that could link them to a person (CLAUDE.md, invariant 2),
  they are not personal data in the organisation's hands; the invitation and the reminders are, and fall under
  Abs. 1.

**Assessment (mine, not an authority's):** for a private employer the defensible basis is Art. 6 Abs. 1 lit. c
DSGVO with § 5 ArbSchG as the obligation and § 26 Abs. 1 BDSG as the national rule, a Betriebsvereinbarung under
§ 26 Abs. 4 where a Betriebsrat exists, and Art. 6 Abs. 1 lit. f as the fallback. No supervisory-authority guidance
on employee surveys was read (UNVERIFIED 6).

**EU representative (Art. 27 DSGVO):** the provider is established in Norway, an EEA state in which the regulation
applies by the EEA Agreement; Art. 27 binds controllers «not established in the Union». My reading is that an EEA
establishment is an establishment for this purpose and no representative is needed; this is the one point in this
file a German lawyer should confirm before the market opens (UNVERIFIED 7).

**How a product text should cite it:** «Rechtsgrundlage: Erfüllung der gesetzlichen Pflicht zur
Gefährdungsbeurteilung (Art. 6 Abs. 1 lit. c DSGVO, § 26 Abs. 1 BDSG, § 5 ArbSchG); keine Einwilligung
erforderlich.» Where a Betriebsrat exists: «oder eine Betriebsvereinbarung (§ 26 Abs. 4 BDSG)».

## 11. Authorities and inspection

**Norway:** Arbeidstilsynet; Datatilsynet.

**Germany — § 21 ArbSchG:**
- Abs. 1: «Die Überwachung des Arbeitsschutzes nach diesem Gesetz ist staatliche Aufgabe. Die zuständigen Behörden
  haben die Einhaltung dieses Gesetzes … zu überwachen und die Arbeitgeber bei der Erfüllung ihrer Pflichten zu
  beraten.» The authorities are the Länder's (Gewerbeaufsicht, Ämter für Arbeitsschutz — names differ by Land).
- Abs. 1a: from 2026 each Land must inspect at least five per cent of its Betriebe a year: «Beginnend mit dem
  Kalenderjahr 2026 sind im Laufe eines Kalenderjahres mindestens 5 Prozent der im Land vorhandenen Betriebe zu
  besichtigen (Mindestbesichtigungsquote).»
- Abs. 2 and 3: the accident insurers (Berufsgenossenschaften, Unfallkassen) act under the Sozialgesetzbuch and
  cooperate with the Länder under a common strategy (the GDA).
- Abs. 3a Nr. 11: what an inspection records about the Gefährdungsbeurteilung — «a) der Ermittlung von Gefährdungen
  und Festlegung von Maßnahmen, b) der Prüfung der Umsetzung der Maßnahmen und ihrer Wirksamkeit und c) der
  Dokumentation der Gefährdungen und Maßnahmen» — which is exactly what the product's documentation must show.
- Data protection is supervised by the Land's data-protection authority for private employers (the Bundesbeauftragte
  for federal bodies); the designating provisions were not read (UNVERIFIED 6).

**How a product text should cite it:** «Die Arbeitsschutzbehörde des Landes überwacht und berät (§ 21 ArbSchG)»;
«ab 2026 mindestens fünf Prozent der Betriebe jährlich (§ 21 Abs. 1a ArbSchG)». Never «die Berufsgenossenschaft
prüft die Gefährdungsbeurteilung» as a rule.

## 12. Harassment, bullying and the complaint

**Norway:** aml § 2-3 (2) d (the employee's duty to report harassment), § 4-3 (3) (ban).

**Germany:**
- **Harassment tied to a protected ground — AGG.** § 3 Abs. 3: «Eine Belästigung ist eine Benachteiligung, wenn
  unerwünschte Verhaltensweisen, die mit einem in § 1 genannten Grund in Zusammenhang stehen, bezwecken oder
  bewirken, dass die Würde der betreffenden Person verletzt und ein von Einschüchterungen, Anfeindungen,
  Erniedrigungen, Entwürdigungen oder Beleidigungen gekennzeichnetes Umfeld geschaffen wird.» § 3 Abs. 4 defines
  sexual harassment. § 7 Abs. 1 bans it. The grounds (§ 1): «Rasse oder … ethnischen Herkunft, des Geschlechts, der
  Religion oder Weltanschauung, einer Behinderung, des Alters oder der sexuellen Identität».
- **Employer's duties — § 12 AGG:** Abs. 1 «Der Arbeitgeber ist verpflichtet, die erforderlichen Maßnahmen zum Schutz
  vor Benachteiligungen … zu treffen. Dieser Schutz umfasst auch vorbeugende Maßnahmen.» Abs. 3: against an employee
  who harasses, «die im Einzelfall geeigneten, erforderlichen und angemessenen Maßnahmen … wie Abmahnung, Umsetzung,
  Versetzung oder Kündigung». Abs. 4: protection against third parties. Abs. 5: the act and the complaint body must
  be made known in the Betrieb.
- **Complaint — § 13 AGG:** «Die Beschäftigten haben das Recht, sich bei den zuständigen Stellen … zu beschweren …
  Die Beschwerde ist zu prüfen und das Ergebnis der oder dem beschwerdeführenden Beschäftigten mitzuteilen.»
- **Bullying without a protected ground («Mobbing»)** has no statutory definition. The duty to prevent it flows from
  § 3 Abs. 1 and § 4 Nr. 1 ArbSchG (psychische Gesundheit) and from the general duty of care (§ 241 Abs. 2 BGB, § 75
  Abs. 2 BetrVG — not read, UNVERIFIED 8).
- **No general employee duty to report harassment.** § 16 Abs. 1 ArbSchG covers «unmittelbare erhebliche Gefahr»
  only. Germany has no counterpart to aml § 2-3 (2) d.

**How a product text should cite it:** «Belästigung (§ 3 Abs. 3 AGG), Schutzpflicht des Arbeitgebers (§ 12 AGG),
Beschwerderecht (§ 13 AGG)»; for bullying «psychische Gesundheit (§ 4 Nr. 1 ArbSchG)». Do not tell German employees
they must report harassment.

## 13. Working time and recovery

**Norway:** aml kap. 10 (daily and weekly rest) as the product cites it.

**Germany — ArbZG:** § 3: «Die werktägliche Arbeitszeit der Arbeitnehmer darf acht Stunden nicht überschreiten. Sie
kann auf bis zu zehn Stunden nur verlängert werden, wenn innerhalb von sechs Kalendermonaten oder innerhalb von 24
Wochen im Durchschnitt acht Stunden werktäglich nicht überschritten werden.» § 5 Abs. 1: «Die Arbeitnehmer müssen
nach Beendigung der täglichen Arbeitszeit eine ununterbrochene Ruhezeit von mindestens elf Stunden haben.» (Abs. 2
and 3 allow one hour less in hospitals, hospitality, transport, broadcasting and agriculture, with compensation.)
Working time is also a source of Gefährdung in § 5 Abs. 3 Nr. 4 ArbSchG.

**How a product text should cite it:** «acht Stunden werktäglich, bis zu zehn mit Ausgleich (§ 3 ArbZG); elf Stunden
Ruhezeit (§ 5 ArbZG)».

## 14. Informing and involving employees

**Norway:** aml § 4-2 (tilrettelegging, medvirkning, utvikling), as the product cites it.

**Germany:**
- **Instruction — § 12 Abs. 1 ArbSchG:** «Der Arbeitgeber hat die Beschäftigten über Sicherheit und Gesundheitsschutz
  bei der Arbeit während ihrer Arbeitszeit ausreichend und angemessen zu unterweisen.» At hiring, on change, on new
  tools or technology, and «erforderlichenfalls regelmäßig wiederholt».
- **Proposals — § 17 Abs. 1 ArbSchG:** «Die Beschäftigten sind berechtigt, dem Arbeitgeber Vorschläge zu allen Fragen
  der Sicherheit und des Gesundheitsschutzes bei der Arbeit zu machen.»
- **Employees' own duty — § 15 Abs. 1 and § 16 Abs. 2:** «nach ihren Möglichkeiten … für ihre Sicherheit und
  Gesundheit bei der Arbeit Sorge zu tragen» and to support the employer «gemeinsam mit dem Betriebsarzt und der
  Fachkraft für Arbeitssicherheit».
- **Information to the Betriebsrat — § 80 Abs. 2 BetrVG; Hinzuziehung — § 89 Abs. 2 BetrVG** (section 5).
- **Results to the employees:** no provision of the ArbSchG says the results of the Gefährdungsbeurteilung must be
  shown to the employees; the Unterweisung (§ 12) is the channel, and the Betriebsrat (§ 80 Abs. 2) the body with a
  right to the documents. The Norwegian «informere om risikofaktorene og tiltakene» (forskriften § 1A-4) has no
  verbatim counterpart (UNVERIFIED 9).

**How a product text should cite it:** «Unterweisung (§ 12 ArbSchG)»; «Vorschlagsrecht der Beschäftigten (§ 17
Abs. 1 ArbSchG)»; «Unterrichtung des Betriebsrats (§ 80 Abs. 2 BetrVG)».

---

## Assumptions carried into the build (DE-A … DE-F), to be confirmed

1. **The instrument stays QPS Nordic, translated into German.** § 4 Nr. 3 ArbSchG asks for «gesicherte
   arbeitswissenschaftliche Erkenntnisse»; the GDA, as remembered, accepts standardised written employee surveys as
   one of its three methods (UNVERIFIED 1). A German text calls the survey «eine standardisierte schriftliche
   Befragung nach dem nordischen Fragebogen QPS Nordic» and never «von der GDA empfohlen».
2. **The third role is labelled «Betriebsrat» in German**, with the empty-role case for firms without one (section
   5). No new role until Tor decides.
3. **Anonymity floor five** (PLAN.md), raised never lowered (rule 2).
4. **Organisation number: the USt-IdNr.** (DE followed by nine digits), optional at sign-up (X-114, D-279), matched
   by format, unique per market, and the number a reverse-charge invoice to a German customer must carry anyway.
   Germany has no single public company number; the Handelsregister number needs the court to be unique and not
   every business is registered. A lookup service is not built (REGISTRY_LOOKUP false).
5. **Time zone Europe/Berlin, language de, prices in EUR** — the prices themselves are Tor's (DE-E).
6. **No EU representative** (section 10, UNVERIFIED 7).

## Appendix — other Norwegian references in `messages/no.json`

| Norwegian (as cited in the product) | German counterpart (verified above) |
|---|---|
| aml § 4-1 (general requirements, «enkeltvis og samlet») | § 4 Nr. 4 ArbSchG (join technology, organisation, conditions, social relations and environment) |
| aml § 4-2 (tilrettelegging, medvirkning, endringer) | § 12, § 17 Abs. 1 ArbSchG; § 80 Abs. 2, § 87 Abs. 1 Nr. 7, § 89 BetrVG |
| aml § 4-3 (4)/(6), forskrift kap. 3A (vold og trusler) | § 4 Nr. 1, § 5 Abs. 3 Nr. 6 ArbSchG; § 12 Abs. 4 AGG (third parties, protected grounds only) |
| aml § 3-2 (1) a (opplæring, instruksjon) | § 12 ArbSchG |
| aml § 2-3 (2) b (melde fra om fare) | § 16 Abs. 1 ArbSchG («unmittelbare erhebliche Gefahr») |
| aml § 5-1 (registrering av personskader) | § 6 Abs. 2 ArbSchG (fatal or over three days) |
| aml § 6-1 (verneombud; under 5 by agreement) | no counterpart: § 1 BetrVG (a right from five), § 22 SGB VII (from 50) |
| aml § 7-2 (AMU tasks) | § 11 ASiG (no list of matters) |
| aml § 3-1 (3) (documentation forskrift) | § 6 Abs. 1 ArbSchG |
| aml kap. 9 (kontrolltiltak) | § 87 Abs. 1 Nr. 6 BetrVG; § 26 BDSG |
| aml kap. 2 A (varsling) | § 17 Abs. 2 ArbSchG; HinSchG not read |
| aml § 4-4 (2) (physical strain) | § 5 Abs. 3 Nr. 1–3 ArbSchG; ArbStättV not read (outside the psychosocial scope) |

---

## UNVERIFIED

1. **The GDA guideline and recommendations** («Beratung und Überwachung bei psychischer Belastung am Arbeitsplatz»;
   «Empfehlungen zur Umsetzung der Gefährdungsbeurteilung psychischer Belastung»). The Merkmalsbereiche, the three
   methods (observation, standardised survey, moderated workshop), the seven process steps and the update interval
   are stated from memory. Until read, a product text cites §§ 3–6 ArbSchG only and says «entspricht den
   Merkmalsbereichen» at most in the legal pack's own notes, not on a page.
2. **DGUV Vorschrift 1 and DGUV Vorschrift 2** (Grundsätze der Prävention; Betriebsärzte und Fachkräfte für
   Arbeitssicherheit): the Betreuung model and the Sicherheitsbeauftragte's rules beyond § 22 SGB VII were not read.
3. **The Federal Labour Court's reading of § 87 Abs. 1 Nr. 6 («geeignet») and Nr. 7 (the method of the
   Gefährdungsbeurteilung is co-determined)**: well known, no judgment fetched. A product text says «mit dem
   Betriebsrat vereinbart», not «laut BAG».
4. **Whether an employee survey is a Personalfragebogen under § 94 BetrVG.** A question of content; the safe route
   (a Betriebsvereinbarung) does not depend on the answer.
5. **The Hinweisgeberschutzgesetz (2023)**: not read; the product describes no whistle-blowing channel for Germany.
6. **Data-protection supervision**: the Land authorities' designating provisions and any guidance on employee
   surveys were not read.
7. **Art. 27 DSGVO for an EEA-established provider**: assessment only; a German lawyer confirms before launch.
8. **§ 241 Abs. 2 BGB and § 75 Abs. 2 BetrVG** as the basis of the duty against bullying: not read.
9. **A duty to inform employees of the results of the Gefährdungsbeurteilung**: none found in the ArbSchG; the
   DGUV rules were not read.
10. **The Wirtschafts-Identifikationsnummer (W-IdNr.)**, introduced from November 2024 as a number for every
    business: its format and roll-out were not researched; the USt-IdNr. is used instead (assumption 4).
