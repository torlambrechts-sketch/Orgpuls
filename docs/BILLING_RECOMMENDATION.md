# Subscriptions and invoices — recommendation

*25 September 2026. For Tor. Builds on what exists today (0048 billing, 0049–0051 admin) and
on the decisions already recorded in the Platform Admin Specification:*
- *Stripe, with EHF invoices through the accounting system;*
- *a band upgrade only after the customer confirms.*

## In one paragraph

Make **Stripe Billing the ledger**: one customer and one subscription per organisation, and
every invoice. **Card and EHF customers are billed the same way.**
- A card customer's subscription charges the card.
- An invoice customer's subscription is set to *send invoice*. The accounting system picks
  the invoice up and delivers it as **EHF over PEPPOL**, or as a PDF by e-mail when the buyer
  cannot receive EHF.
- Payment that arrives in the bank is reconciled in the accounting system and marked paid in
  Stripe.

Orgpuls keeps a **mirror** of plans, subscriptions and invoices, written only by a signed
Stripe webhook. The product and the admin then read their own database, never Stripe, and
access rules (trial, read-only, suspended) are enforced where k-anonymity already is: in
Postgres.

Keep the **trial at 15 days, extendable once**, and **never cut off a survey that is
running**.

## Where we are today

- `app.billing` (0048) holds, per organisation:
  - the trial (15 days, one extension);
  - the chosen plan (`small`, `usual`, `group`);
  - the invoice address, reference, EHF flag and confirmation.
- Nothing is charged, and nothing is locked when a trial runs out (D-89).
- The admin (0049) shows trials, confirmations and a derived MRR from `app.plan_monthly_nok`:
  265 and 565 NOK. It can extend a trial with a logged reason.
- The site promises **"Ingen kort"**, no binding, and free verneombud and tillitsvalgte.
  - The last two already hold: the price is per organisation band, not per seat.
  - The first holds as long as invoice stays the default and card is only an option.

**The specification says a 30-day trial; the product and site say 15** (D-89). This needs a
decision. The rest of this document assumes 15.

## Recommendation

### 1. Stripe is the ledger; the accounting system delivers EHF

| | Card (self-serve) | Invoice (default, EHF or e-mail) |
|---|---|---|
| Stripe subscription | `collection_method = charge_automatically` | `collection_method = send_invoice`, `days_until_due = 14` |
| How the customer pays | Stripe Checkout / Customer Portal | Bank transfer against the invoice (KID) |
| How the invoice is delivered | Stripe e-mail receipt | Accounting system → EHF (PEPPOL `0192:<orgnr>`), else PDF by e-mail |
| How "paid" is known | Stripe webhook `invoice.paid` | Bank reconciliation in the accounting system → mark paid in Stripe |

- **Why Stripe, even for invoice customers.** One ledger means:
  - one MRR;
  - one dunning state;
  - one place for coupons, credits and refunds;
  - one webhook stream.

  The alternative is the accounting system as the ledger (Fiken or Tripletex subscriptions).
  It is simpler while every customer pays by invoice. But self-serve card payments,
  prorating and dunning would then be built by hand.
- **Why the accounting system sends EHF.** Stripe does not speak PEPPOL. Norwegian
  accounting systems do, and they are where bookkeeping happens anyway. Use the one Orgpuls
  AS's accountant already works in:
  - **Fiken** is the simplest for a small AS;
  - **Tripletex** or **PowerOffice Go** if an accountant runs the books.

  Connect it with the vendor's Stripe integration where there is one, or with a small sync
  job otherwise.
- **Before sending EHF**, look the buyer up in the ELMA register (can they receive EHF?).
  - Municipalities and larger firms can; many small AS cannot.
  - The `ehf` flag in `app.billing` becomes a preference, and the lookup decides.
- **Invoices must satisfy bokføringsforskriften § 5-1-1:**
  - seller's org.nr followed by "MVA";
  - buyer's name, address and org.nr;
  - number and date;
  - what was delivered and for which period;
  - amounts with MVA shown;
  - due date.

  Stripe's invoice template can carry all of this. Put the org.nr and the customer's
  reference (`invoice_ref`) in custom fields.
- **MVA at 25 %** as a fixed Stripe tax rate on every Norwegian price. Orgpuls AS must be in
  the Merverdiavgiftsregisteret before charging it.

### 2. Plans are rows, prices have versions

Replace `app.plan_monthly_nok` (a function) with a catalogue, as the specification asks
("model exactly that as data"):

- `app.plans`:
  - `key` (`small`, `usual`, `group`);
  - `min_employees`, `max_employees` (null = open-ended);
  - `features` jsonb;
  - `active`.
- `app.plan_prices`:
  - `plan_key`, `version`;
  - `interval` (`month` or `year`);
  - `amount_nok_ex_mva`;
  - `stripe_price_id`;
  - `valid_from`, `archived_at`.

A price change is a new version with a new Stripe price. Existing subscriptions keep theirs
until they are migrated deliberately, and the migration is logged.

### 3. The mirror, and one write path

| Table | Holds | Written by |
|---|---|---|
| `app.subscriptions` | org, Stripe customer and subscription ids, status, band, price version, `collection_method`, current period end, `cancel_at` | webhook only |
| `app.invoices` | Stripe invoice id and number, status, amounts (ex/incl. MVA), due date, hosted/PDF URL, delivery (`ehf`/`email`) and its status | webhook only |
| `app.billing_events` | every Stripe event id, type, received/processed time; unique on event id (idempotency) | webhook only |
| `app.billing` (0048) | trial and the customer's invoice preferences; unchanged | its two RPCs |

- **The webhook** is a new edge function, `orgpuls-stripe`.
  - It verifies the `Stripe-Signature` header with the webhook secret.
  - It writes with the service role and ignores any event id it has already seen.
  - The Stripe secret key and the webhook secret live only in Supabase and Vercel secrets.
  - No card data ever reaches Orgpuls; Checkout and the Portal are hosted by Stripe.
- **RLS:**
  - `subscriptions` and `invoices` are readable by the organisation's daglig leder, like
    `app.billing`;
  - `billing_events` by no client at all;
  - the admin reads through audited RPCs for `finance` and `super_admin`, as 0049 does.
- **"Bekreft abonnement"** (Oppsett › Betaling) keeps its form. On confirm, a server action
  creates the Stripe customer (org.nr, invoice e-mail, reference) and the subscription.
  - The subscription is priced at the band's current version.
  - Billing starts the day the trial ends.
  - EHF preference means `send_invoice`; a card choice opens Stripe Checkout instead.

### 4. The lifecycle, and what each state allows

| State | Enters when | The customer can | Never |
|---|---|---|---|
| `trial` | organisation created | everything | — |
| `active` | subscription confirmed and first invoice not overdue | everything | — |
| `past_due` | invoice unpaid at due date, or a card charge fails | everything; a banner and e-mails | — |
| `suspended` | 30 days past due, or trial ended + 14 days unconfirmed | read results and reports, export, pay | send a **new** round, invite |
| `cancelled` | the customer cancels (no binding) | everything until the period ends | — |
| `deleted` | retention after cancellation or suspension has run | — | — |

- **A running survey is never cut off.** Suspension stops new rounds from being scheduled
  and sent; a round already open runs to its close.
  - Stopping mid-collection would waste the answers people already gave.
  - It would also change who can be counted against k=5.
- **Enforce it in the database.** The scheduler (`wheel_tick`) and the round-creating RPCs
  check `app.subscription_allows(org, 'send')`. The UI only explains; it does not decide.
- **Dunning:**
  - Stripe Smart Retries for cards.
  - For invoices, a reminder at due + 3 days and a *purring* at due + 14. The purring has
    14 days to pay and a fee no higher than inkassoforskriften allows, or none.
  - Suspension at due + 30.
  - Every step is an e-mail through the existing dispatcher and a line in the admin.
- **Deletion must match the data processing agreement** (D-87 promises deletion within 30
  days of termination).
  - Deletion is a queue the admin can see and a second admin approves.
  - It is not a silent cron job.

### 5. Band reconciliation

- Nightly, count each organisation's registered employees against its band.
- **Upwards** (e.g. 25 → 26):
  - flag it in the admin;
  - notify the daglig leder;
  - wait for them to confirm, as decided. Nothing changes until they do.
- On confirmation, update the Stripe subscription from the next period, without prorating.
  - Offer "take it from now" only if they ask.
  - Remind after 14 days. If there is still no answer, the admin decides.
- **Downwards:** apply from the next period automatically. It is in the customer's favour.
- Over 100 employees is "Flere selskaper / etter avtale". It becomes a custom price in the
  catalogue per customer, not an automatic band.

### 6. What the admin gets (Phase 2 in the specification)

- Per organisation:
  - the subscription (plan, band, price version, state);
  - the next invoice;
  - the payment method or EHF delivery status.
- Invoices with status, PDF, and resend.
- Failed payments with a manual retry.
- Credit notes and refunds, done through Stripe so the ledger stays one.
- Coupons as Stripe promotion codes, and complimentary or partner accounts as a 100 %
  coupon with a reason.
- MRR, net new MRR (new, expansion, contraction, churn) and churn read from
  `app.subscriptions`, replacing today's price function.
- Every action goes through a `finance`- or `super_admin`-gated RPC and into `admin_audit`,
  with a reason.

## Order of work

1. **Decide the open points below.** Create the Stripe account (Norway, NOK) and the
   accounting-system integration. Register the webhook.
2. Migration: plans and price versions, the subscription, invoice and event mirrors,
   `subscription_allows`, and the RLS and tests. Seed the catalogue: 265 and 565 NOK ex. MVA
   per month.
3. `orgpuls-stripe` webhook plus the confirm action (customer, subscription, Checkout for
   card).
4. Enforcement: the scheduler and round RPCs honour `suspended`, never touching open rounds.
   Banners in the product.
5. Dunning and trial-end e-mails through the dispatcher.
6. Band reconciliation job and its customer confirmation.
7. Admin: subscription view, invoices, failed payments, credits, coupons, revenue.

Steps 2–4 are what make money arrive. The rest can follow.

## Decisions needed from you

1. **Trial length:** 15 days (the product and site today) or 30 (the specification)?
2. **When a trial ends unconfirmed:** the proposal is 14 days' grace, then read-only
   (`suspended`) until confirmed. Or keep today's behaviour, where nothing locks.
3. **Accounting system:** Fiken, Tripletex or PowerOffice. Whichever the accountant uses
   decides the EHF route.
4. **Card at all?** Offering card self-serve means rewording "Ingen kort" to "Ingen kort
   nødvendig".
5. **Annual prices:** offer them, and at what discount?
6. **Payment terms:** 14 days net and no invoice fee is the proposal.
7. **Orgpuls AS's details** for the invoice: org.nr, MVA registration, address, bank account
   and KID agreement.
