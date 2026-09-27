# CRM: stages, campaigns and what converts

Researched 2026-09-27 for Tor's request: "The admin crm must have phases, so we can send a email through
a campaign, move it to the next stage and have other stages. Research best practice for highest
conversion rates for email campaigns like tracking, personal senders and other high conversion tactics."

What was built is in § 7 (0093, D-142). Sources are linked inline. **[REG]** marks a regulator, a
standard or a mailbox provider. **[VENDOR]** marks an email or sales-tool vendor's own platform data.
Vendor figures are unaudited: use them for direction, not as numbers to quote.

## 1. The constraint that decides everything: the law, and Brevo

- **Markedsføringsloven § 15 covers named work addresses.**
  - Forbrukertilsynet: consent is required for mail «til en fysisk persons individuelle e-postadresse
    på jobben, for eksempel … ola.nordmann@firmaX.no, uansett om e-posten inneholder tilbud til
    virksomheten».
  - Mail to an address that belongs to no particular person, such as `post@firmaX.no`, is allowed.
  - Where it is unclear, the address counts as personal if it «rent faktisk tilhører fysiske
    personer». [REG] https://www.forbrukertilsynet.no/lov-og-rett/veiledninger-og-retningslinjer/forbrukertilsynets-veiledning-markedsforing-via-e-post-sms-o-l
  - Datatilsynet takes the same line. [REG] https://www.datatilsynet.no/personvern-pa-ulike-omrader/kundehandtering-handel-og-medlemskap/nyhetsbrev-epostlister-og-sms/
- **GDPR legitimate interest does not unlock cold mail to a named person.** It is a basis for the
  processing. § 15 separately requires consent for the sending.
- **Brevo forbids** lists «scraped on the internet, acquired or purchased». It requires active,
  explicit consent with proof for every contact. [VENDOR, binding terms] https://www.brevo.com/legal/antispampolicy/
- **Google says the same:** «Don't send messages to people who didn't sign up.» [REG] https://support.google.com/mail/answer/81126

**Consequence.** Most cold-outbound advice (lookalike domains, 50 mails per inbox per day, seven-step
cold sequences) is US practice and does not apply here. The CRM already enforces the Norwegian rule
(D-101, D-103):

- a Brønnøysund company is mailable only on its role address (`post@`, `firmapost@`, basis
  `business`);
- a named person is mailable only with recorded consent;
- an existing customer, only through the existing-customer exception, which is off by default.

The pipeline below works within those bases. It adds no new way to reach anyone.

## 2. Stages

- **HubSpot's default lifecycle** is Subscriber → Lead → MQL → SQL → Opportunity → Customer, and
  automation moves contacts forward only. https://knowledge.hubspot.com/records/use-lifecycle-stages
- **What should move a company:**
  - a human reply;
  - a signup or trial;
  - a booked meeting;
  - a consent captured.
- **What should never move one:** an open.
  - Apple Mail Privacy Protection loads every image and «prevents senders from seeing if you've
    opened». https://www.apple.com/legal/privacy/data/en/mail-privacy-protection/
  - Litmus counts Apple Mail at about 62 % of tracked opens and calls those opens unreliable.
    https://www.litmus.com/email-client-market-share
- **A click is weak.** Microsoft Defender Safe Links follows links during mail flow and at click
  time, which produces automated clicks. Many Norwegian SMBs run Microsoft 365.
  https://learn.microsoft.com/en-us/defender-office-365/safe-links-about
- **Parking:** a company that did not answer a finished sequence goes to a parked stage («nurture»),
  not «lost». Anyone who unsubscribes, bounces or complains is suppressed at once.

## 3. Sequences and follow-ups: the best-evidenced lever

- **Instantly** (2025 platform data): the first mail brings 58 % of replies, follow-ups 42 %. It
  recommends 4–7 touches, 3–4 days apart. [VENDOR] https://instantly.ai/cold-email-benchmark-report-2026
- **Woodpecker** also finds 42 % of replies from follow-ups, with the fourth mail getting about half
  the replies of the first. [VENDOR] https://woodpecker.co/blog/cold-email-statistics/
- **Backlinko/Pitchbox** (12M mails, 2019): one follow-up gave +65.8 % replies. [VENDOR]
  https://backlinko.com/email-outreach-study
- **Where the sources agree:** three to five mails in all, a few days apart, then stop. Unsubscribes
  and complaints rise after about four follow-ups. [VENDOR]
- **Gmail's complaint limits:** under 0.1 %, and never at 0.3 %. [REG] https://support.google.com/a/answer/14229414

## 4. Sender, format and copy

- **A person as sender** ("Tor at Orgpuls"), from a real address, with replies to a monitored
  inbox. Tests favour a person's name over a brand. [VENDOR, anecdotal]
  https://www.benchmarkemail.com/blog/email-sender-name-person-or-brand/
  Replies are the signal that counts (§ 2), so the reply-to must reach a human.
- **Plain beats designed.** Across more than 500M HubSpot mails, «in every single A/B test, the
  simpler-designed email won», and HTML with images got 51 % fewer clicks. [VENDOR, large sample]
  https://blog.hubspot.com/marketing/plain-text-vs-html-emails-data
  The CRM's `letter` style is this.
- **Length:** short, one idea, roughly 50–120 words. Sources disagree between under 80 and 30–150.
  [VENDOR]
- **The CTA:** in first contact, an interest question («Er dette aktuelt for dere?») beats asking
  for a meeting. Once a deal is active, a specific time wins. [VENDOR, Gong, 304k mails]
  https://www.gong.io/blog/this-surprising-cold-email-cta-will-help-you-book-a-lot-more-meetings
- **Personalisation:** a personalised subject gave +30.5 % replies, a personalised body +32.7 %.
  [VENDOR, 2019] Industry and size (the NACE code the CRM holds) are the relevant variables.
  `{navn}` and `{firma}` are the placeholders.
- **Subject lines and send time** are second-order. Reply rates by weekday and hour are nearly flat.
  [VENDOR, Belkins 7.5M] https://belkins.io/blog/best-time-to-send-email
  Send Tuesday to Thursday mornings, Norwegian time. A/B test the subject (the CRM does,
  on clicks).

## 5. Tactics

- **A trigger:** the psychosocial provisions in force from 1 January 2026. Arbeidstilsynet itself
  calls them «ingen nye plikter, men understreker arbeidsgivers ansvar», so mail must say «tydeligere
  krav», never «nye plikter», which would be misleading. [REG]
  https://www.arbeidstilsynet.no/nyheter/nye-forskriftsbestemmelser-gjor-kravene-til-psykososialt-arbeidsmiljo-tydeligere/
- **A lightweight next step:** a sample report for Arbeidstilsynet, a checklist, or a ten-minute call.
- **A lead magnet for consent:** a checklist or sample report in exchange for an explicit, unticked
  box. This is how named people enter the funnel lawfully.
- **Trial and free signups:** in *Inteligo Media* (C-654/23, 13 Nov 2025) the CJEU held that
  registering a free account can count as a sale, which opens the soft opt-in. Its reach in Norway
  is an inference that a lawyer should confirm.
  https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex%3A62023CJ0654
- **Weaker claims:**
  - Breakup emails and video are vendor claims only. [VENDOR, weak]
  - Several contacts per company help only where each has consented.

## 6. Tracking and deliverability

- **Measure** reply rate, positive replies, meetings, signups and trial to paid. Do not measure
  opens. The CRM already treats opens as a lower bound (X-063) and runs A/B tests on clicks
  (D-104).
- **Pixels may need consent.** EDPB Guidelines 2/2023 v2 (Oct 2024, §§ 48–51) find that email
  tracking pixels and tracking links fall under ePrivacy Art. 5(3). Norway implements that as
  ekomloven § 3-15, with GDPR-standard consent since 1 January 2025.
  https://www.edpb.europa.eu/system/files/2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en_0.pdf
  France's CNIL requires consent for marketing pixels from July 2026.
  https://www.cnil.fr/fr/recommandation-pixel-suivi-courriels
  No Norwegian regulator has ruled on email yet, so this is an inference. It is a decision for Tor
  (§ 8).
- **Gmail, Yahoo and Outlook** require SPF, DKIM and DMARC, one-click unsubscribe (RFC 8058) and
  complaints under 0.3 % for bulk senders. The CRM's marketing subdomain and headers meet this
  (D-101). https://support.google.com/a/answer/81126
  https://techcommunity.microsoft.com/blog/microsoftdefenderforoffice365blog/strengthening-email-ecosystem-outlook%E2%80%99s-new-requirements-for-high%E2%80%90volume-senders/4399730
- **Keep marketing on its own subdomain.** Start low, to engaged people. Verify lists, and suppress
  hard bounces at once. Brevo reportedly suspends accounts above 2 % hard bounces or 0.2 %
  complaints (help centre, not verified directly).

## 7. What was built (0093, D-142)

| Research finding | In the CRM |
|---|---|
| Stages that move forward only, on real signals | Stages are data: add, rename, reorder, archive. Trial and customer follow the plan. Campaign moves and logged replies go forward only. |
| Replies are the signal; opens are not, and clicks are weak | «Reply received» moves a company to a configurable stage («Engaged» by default). Opens and clicks never move anyone, and a test proves it. |
| Mail a stage, then move it on | A campaign can go to the contacts of companies in one stage and, once sent, move each company to another stage. |
| 3–5 touches; ~40 % of replies from follow-ups | A campaign can be a follow-up of another, after N days. It goes only to those the first reached whose company has not moved since, and who did not unsubscribe or bounce. The last one can park them in «Nurture». |
| A person as sender, replies to a human | Senders are people on the marketing domain, with their own reply-to inbox and signature. The dispatcher refuses any other domain. |
| Plain, short, one question | The existing `letter` style and the «første kontakt» template. |
| Move many at once | Tick companies in Prospects and move them to a stage, or each to its next. |

## 8. Open for Tor

1. **Email tracking consent** (§ 6). Opens and clicks on CRM mail are stored per recipient today
   (D-101). The most defensible reading of EDPB 2/2023 is that this needs consent under ekomloven
   § 3-15. The options:
   - turn per-recipient open tracking off, since opens are not evidence anyway, and keep clicks only
     as campaign totals;
   - or ask for pixel consent at signup.
   The pipeline does not depend on either.
2. **The soft opt-in for trial signups** after *Inteligo* (§ 5). Ask a Norwegian lawyer before
   using it.
3. **A lead magnet** for consent: a checklist or sample report on the psychosocial provisions.
