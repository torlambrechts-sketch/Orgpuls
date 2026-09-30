/**
 * Phase G4's rows in the Sentral QA fixture (D-185): what Deliverability and Tools & lead magnets
 * need to show their populated state — rates, 7-day volumes, a delivery event, a newsletter with
 * a subscriber and a double opt-in — instead of only «—». LOCAL QA ONLY: it runs inside
 * sentral-fixture.mjs's transaction, after its guards, and adds rows to nothing but:
 *
 *   - one notice to a role (tiltak_forfalt → avdelingsledere) on the design fixture's organisation
 *     (Nordvik Anlegg AS), sent two days ago as 48 messages, one per person (outbox_recipients,
 *     0134): 46 delivered, one soft bounce, one not reported yet — and the provider's event for
 *     each reported one in app.mail_events. So the transactional stream reads «reported on 47 of
 *     48 sent», 97,9 % delivered, and a last delivery event. A notice to a role counts no
 *     respondent and needs no round; the audience is not one queue_measure_notices dedupes on,
 *     so it holds back no real notice. When that organisation is absent, none of this is written;
 *   - the double opt-in mail of each contact the base fixture confirmed (Silje Moen, Kari Nordvik,
 *     Hege Sand), sent when their optin_sent_at says and delivered a minute later: the marketing
 *     stream's 7 days (Silje's is today) and the double opt-in measure, confirmed of mailed;
 *   - Kari Nordvik on the newsletter list, subscribed, under the double opt-in she confirmed
 *     (the consent ledger records it by that method, as the base fixture's contacts are).
 *
 * Idempotent: every row has an id derived from its name or a `sentral-g4-` provider id, and is
 * deleted before it is written again. The base fixture's contacts are deleted and written first,
 * which removes Kari's membership with them (a cascade) and leaves the sends to be deleted here.
 */

/** the design fixture's organisation (scripts/seed/design-fixture.mjs) */
export const G4_ORG = '00000000-0000-4000-8000-000000000001'
/** the role notice's messages: delivered, soft bounce, not yet reported */
export const G4_NOTICE = { delivered: 46, softBounce: 1, unreported: 1 }
/** the contacts whose confirmation mail is sent, and the one on the newsletter */
export const G4_OPTIN = ['silje', 'kari', 'hege']
export const G4_SUBSCRIBER = 'kari'

/**
 * The SQL, given the base fixture's helpers: `id` (a name's stable uuid), `q` (a quoted literal)
 * and its CONTACTS (for each contact's address and the time its confirmation mail went out).
 */
export function g4Sql({ id, q, contacts }) {
  const notice = `'${id('g4:notice:tiltak_forfalt')}'::uuid`
  const n = G4_NOTICE.delivered + G4_NOTICE.softBounce + G4_NOTICE.unreported
  const sends = G4_OPTIN.map((key) => {
    const c = contacts.find((x) => x.key === key)
    if (!c || !c.optinSentAt) throw new Error(`sentral-fixture.g4: contact ${key} has no confirmation mail`)
    return { key, sendId: `'${id(`g4:optin:${key}`)}'::uuid`, contact: `'${id(`contact:${key}`)}'::uuid`, email: c.email, at: c.optinSentAt }
  })
  const sub = `'${id(`contact:${G4_SUBSCRIBER}`)}'::uuid`
  return `
-- ---------------------------------------------------------------- G4 (D-185): scripts/seed/sentral-fixture.g4.mjs
delete from app.mail_events where message_id like 'sentral-g4-%';
delete from app.outbox where id = ${notice};
delete from app.crm_sends where id in (${sends.map((s) => s.sendId).join(', ')});

-- a notice to a role, one message per person, on the design fixture's organisation if it is here
insert into app.outbox (id, org_id, kind, audience, due_at, sent_at, channel)
select ${notice}, o.id, 'tiltak_forfalt', 'avdelingsledere', now() - interval '2 days', now() - interval '2 days', 'email'
from app.organizations o where o.id = '${G4_ORG}';
insert into app.outbox_recipients (outbox_id, address_key, masked, provider_id, sent_at, delivery, delivery_at)
select o.id, sha256(convert_to('sentral-g4-' || g, 'UTF8')), 'l***@nordvik.example', 'sentral-g4-r' || g, o.sent_at,
       case when g <= ${G4_NOTICE.delivered} then 'delivered' when g <= ${G4_NOTICE.delivered + G4_NOTICE.softBounce} then 'soft_bounce' end::app.mail_delivery,
       case when g <= ${G4_NOTICE.delivered + G4_NOTICE.softBounce} then o.sent_at + interval '1 minute' end
from app.outbox o cross join generate_series(1, ${n}) g
where o.id = ${notice};
-- the provider's report of each, as record_mail_event keeps it
insert into app.mail_events (received_at, at, event, message_id, outbox_id, org_id)
select r.delivery_at, r.delivery_at, r.delivery::text, r.provider_id, o.id, o.org_id
from app.outbox_recipients r join app.outbox o on o.id = r.outbox_id
where o.id = ${notice} and r.delivery is not null;

-- each confirmed contact's double opt-in mail, sent when the contact says and delivered a minute later
insert into app.crm_sends (id, kind, contact_id, to_email, status, sent_at, delivery, delivery_at) values
  ${sends.map((s) => `(${s.sendId}, 'optin', ${s.contact}, ${q(s.email)}, 'sent', ${s.at}, 'delivered', (${s.at})::timestamptz + interval '1 minute')`).join(',\n  ')};

-- the newsletter's subscriber, under the double opt-in she confirmed
select set_config('app.consent_via', 'double_opt_in', true) is not null as via;
insert into app.crm_list_members (list_id, contact_id, status, source, subscribed_at)
select l.id, ${sub}, 'subscribed', 'newsletter', c.consent_at
from app.crm_lists l join app.crm_contacts c on c.id = ${sub}
where l.product_id = 'orgpuls' and l.key = 'nyhetsbrev';
set constraints all immediate;
set constraints all deferred;
select set_config('app.consent_via', '', true) is not null as via;
`
}
