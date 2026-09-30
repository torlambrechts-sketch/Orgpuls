/**
 * The Sentral QA fixture's rows for phase G3 (D-184), registered in sentral-fixture.mjs and written in
 * its transaction, behind its two guards (a local URL, and the QA stack's own catalog mark). LOCAL
 * ONLY, like the rest of the fixture; it is the only source of these rows.
 *
 * From the design's `loadGrowth()` (Sentral_Admin.dc.html): the Brønnøysund queue, the partners, the
 * phone notice and the hand-raise that makes Tomas Rui's callback. What the engine decides is left to
 * the engine: the entities are written, and the triggers are raised through app.brreg_raise, so fit,
 * channel, the 10 % holdout (a hash of the number: Fjellstua Drift AS falls in it) and the
 * do-not-contact list are what the product computes, not the design's sample statuses. The engine is
 * in dry run, as it ships: nothing is assigned, and no outreach has been made, so «Results» shows its
 * empty treatment.
 *
 *   - one finished poll, today at 05:10 Oslo, with the design's 2 742 entity changes;
 *   - the queue's six organisations as Brønnøysund entities (their organisation numbers fail the mod-11
 *     check digit, so no real undertaking holds one; a generic post@ on .example only), with the
 *     employee counts before and after, and Klinikk Sør's new general manager; the six triggers;
 *   - Tromsø Elektro on the do-not-contact list after an objection, and Fjellstua Drift's Art. 14
 *     notice, both as consent records on the company;
 *   - the design's six partners, with the four kinds the schema has (a course provider is an HMS
 *     partner, the accounting platform an accounting one);
 *   - Tomas Rui's demo request 48 minutes before the fixture runs, and G0's task 15 made the R10
 *     founder callback it routes to, on the one-hour SLA from that request; G0's other two calls are
 *     tasks made by hand (G0 wrote them as logged calls, which the Tasks page does not list), with no
 *     kind — only a rule or a trigger writes one — and Silje Moen's and the letter's titles neutral:
 *     G0's «lead score 75» and «Krav-sjekk QR code» contradict the engine's score and what is built.
 */

/**
 * [key, name, org number, form, NACE, employees before, after, trigger, phone, generic address, business
 * address] — the business addresses are invented, like the numbers
 */
export const ENTITIES = [
  ['fjellstua', 'Fjellstua Drift AS', '931204118', 'AS', '56.101', 4, 6, 'threshold_5', '+47 57 00 00 01', null, 'Fjellvegen 12, 6823 Sandane'],
  ['nordfjord', 'Nordfjord Bygg AS', '925118330', 'AS', '41.200', 28, 31, 'threshold_30', null, null, 'Sjøgata 3, 6770 Nordfjordeid'],
  ['barnehagene', 'Barnehagene Vest AS', '919440217', 'AS', '88.911', 27, 32, 'threshold_30', null, 'post@barnehagenevest.example', 'Postboks 180, 5804 Bergen'],
  ['lillesand', 'Lillesand Dagligvare AS', '933018442', 'AS', '47.111', null, 7, 'company_new', null, null, 'Strandgata 20, 4790 Lillesand'],
  ['klinikk', 'Klinikk Sør AS', '928776104', 'AS', '86.230', 18, 18, 'manager_changed', '+47 38 00 00 02', null, 'Markens gate 9, 4611 Kristiansand'],
  ['tromso', 'Tromsø Elektro AS', '921555908', 'AS', '43.210', 3, 5, 'threshold_5', '+47 77 00 00 03', null, 'Stakkevollvegen 41, 9010 Tromsø'],
]

/** [key, name, kind, contact, code, share kind, share %, status] — D.partners.list */
export const PARTNERS = [
  ['regnvest', 'Regnskap Vest AS', 'accounting', 'Mona Lie', 'REGNVEST', 'recurring', 20, 'pilot_signed'],
  ['stamina', 'Stamina Helse BHT', 'bht', 'Erlend Vik', 'STAMINA', 'client_discount', 15, 'pilot_signed'],
  ['hmsrad', 'HMS Rådgiverne AS', 'hms', 'Siri Holm', 'HMSRAD', 'affiliate', 20, 'in_talks'],
  ['voskole', 'Verneombudskolen', 'hms', 'Jan Berge', 'VOSKOLE', 'affiliate', 20, 'kit_sent'],
  ['pbl', 'PBL — Private Barnehagers Landsforbund', 'bransje', null, 'PBL', 'member_discount', null, 'member_offer_drafted'],
  ['tripletex', 'Tripletex marketplace', 'accounting', null, null, null, null, 'phase_2'],
]

/** the fixture's poll: a fixed id far above any a local stack reaches, so it can be found again */
export const POLL_ID = 9_000_000_143

/**
 * The SQL, given the base fixture's helpers: `id(name)` (a uuid derived from a name), `q` (a quoted
 * literal), `today(hh:mm)` (today in Oslo at a time), `company(key)` and `contact(key)` (the base
 * fixture's rows) and `task(key)` (its tasks).
 */
export function g3Sql({ id, q, today, company, contact, task }) {
  const orgs = ENTITIES.map((e) => q(e[2])).join(', ')
  const entities = ENTITIES.map(
    ([, name, orgnr, form, nace, , after, , phone, email, address]) =>
      `(${q(orgnr)}, ${q(name)}, ${q(form)}, ${q(nace)}, ${after}, ${q(phone)}, ${q(email)}, ${q(address)}, true)`,
  ).join(',\n  ')
  const raises = ENTITIES.map(
    ([, , orgnr, , , before, after, kind]) => `select app.brreg_raise(${q(orgnr)}, ${q(kind)}, ${POLL_ID}, ${before === null || kind === 'manager_changed' ? 'null' : before}, ${after});`,
  ).join('\n')
  // the queue lists the newest first; raised in one transaction the rows share one time, so they are
  // set a second apart in the design's order (its first row the newest), never left to a tie
  const order = ENTITIES.map(([, , orgnr], i) => `(${q(orgnr)}, ${i})`).join(', ')
  const partners = PARTNERS.map(
    ([key, name, kind, person, code, share, pct, status]) =>
      `('${id(`partner:${key}`)}'::uuid, ${q(name)}, ${q(kind)}, ${q(person)}, ${q(code)}, ${q(share)}, ${pct ?? 'null'}, ${q(status)})`,
  ).join(',\n  ')
  const tomas = 'tomas.rui@vlfk.example'

  return `
-- ---------------------------------------------------------------- G3 (sentral-fixture.g3.mjs, D-184)
delete from app.brreg_entities where org_number in (${orgs});
delete from app.brreg_dnc where org_number in (${orgs});
delete from app.brreg_polls where id = ${POLL_ID};
delete from app.partners where id in (${PARTNERS.map(([key]) => `'${id(`partner:${key}`)}'::uuid`).join(', ')});
delete from app.demo_requests where email = ${q(tomas)};

update app.brreg_settings set dry_run = true;
insert into app.brreg_polls (id, source, requested_at, started_at, finished_at, status, changes) overriding system value
values (${POLL_ID}, 'cron', ${today('05:10')} - interval '1 minute', ${today('05:10')} - interval '1 minute', ${today('05:10')}, 'done', 2742);

insert into app.brreg_entities (org_number, name, form_code, nace_code, employees, phone, generic_email, address, active) values
  ${entities};
update app.brreg_entities set manager_changed_on = (now() at time zone 'Europe/Oslo')::date - 1 where org_number = '928776104';
-- Tromsø Elektro objected at its first call: the do-not-contact list before its trigger
insert into app.brreg_dnc (org_number, reason) values ('921555908', 'objected');
${raises}
update app.brreg_outreach o set created_at = o.created_at - make_interval(secs => x.i)
from (values ${order}) x(org, i) where o.org_number = x.org;

insert into app.consent_records (company_id, purpose, status, lawful_basis, method) values
  (${company('fjellstua')}, 'phone_outreach', 'notice_given', 'legit_interest_phone', 'phone_notice'),
  (${company('tromso')}, 'phone_outreach', 'withdrawn', 'legit_interest_phone', 'phone_notice');

insert into app.partners (id, name, kind, contact_name, referral_code, share_kind, share_pct, status) values
  ${partners};

-- Tomas Rui's hand-raise, and the founder callback R10 makes of it, due one working hour after
insert into app.demo_requests (at, email, domain, network, consent, lang)
values (now() - interval '48 minutes', ${q(tomas)}, 'vlfk.example', md5('sentral-fixture'), false, 'no');
update app.crm_activities
set kind = 'task', origin = 'rule', rule = 'R10', task_kind = 'call', body = 'auto:callback_hand_raise', contact_id = ${contact('tomas')},
    sla_due_at = app.add_business_hours(now() - interval '48 minutes', 1),
    due_at = (app.add_business_hours(now() - interval '48 minutes', 1) at time zone 'Europe/Oslo')::date
where id = ${task('t15')};
-- the design's call and letter are tasks made by hand (a call logged after the fact is an activity, not
-- a task). A kind is a rule's or a trigger's (task_kind, written with its origin), so they carry none;
-- and their titles say nothing another page contradicts (Silje Moen's score is computed, and no
-- letter carries a QR code)
update app.crm_activities set kind = 'task', body = 'Call Silje Moen' where id = ${task('t14')};
update app.crm_activities set kind = 'task' where id = ${task('t16')};
update app.crm_activities set body = 'Letter to Nordfjord Bygg' where id = ${task('t17')};
`
}
