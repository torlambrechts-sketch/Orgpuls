# Microsoft Entra ID sign-in — operator setup (D-201)

What has to exist outside this repository for «Fortsett med Microsoft» and «Koble til
Microsoft 365» to work. Nothing here can be done from code: the Entra app belongs to the
Orgpuls Microsoft tenant, and the provider switch lives in the Supabase dashboard.

Until step 3 is done, nothing changes for anybody: the sign-in buttons render only when
Supabase reports the `azure` provider on, and the Entra screen offers no button without
`ENTRA_CLIENT_ID`.

## 0. Order

1. Apply migration `0155_entra_signin.sql` to the hosted database **before** the code that
   calls it is deployed. `/auth/callback` runs `entra_sign_in_check` after every OAuth sign-in
   and fails closed: without the function, Google sign-in would be refused too.
2. Deploy the code.
3. Do the Azure and Supabase steps below, then set `ENTRA_CLIENT_ID`.

## 1. The app registration (Azure portal › Microsoft Entra ID › App registrations › New)

- **Name:** Orgpuls.
- **Supported account types:** *Accounts in any organizational directory (Any Microsoft Entra
  ID tenant — Multitenant)*. Not personal Microsoft accounts: the database refuses the
  consumer tenant anyway.
- **Redirect URIs** (platform *Web*):
  - `https://jmhhszsnjfqgclxzhciq.supabase.co/auth/v1/callback` — the sign-in (Supabase Auth).
  - `https://www.orgpuls.com/integrasjoner/entra/callback` — the admin consent.
  - `https://en.orgpuls.com/integrasjoner/entra/callback` — the same, on the English host.
  - optional, for local work: `http://localhost:3000/integrasjoner/entra/callback` and
    `http://127.0.0.1:54321/auth/v1/callback`.
- **Certificates & secrets:** a client secret. Note its expiry date in the calendar: when it
  expires, Microsoft sign-in stops. The secret goes into Supabase only (step 2) — never into
  this repository, Vercel or a chat.
- **API permissions** (Microsoft Graph, *delegated*): `openid`, `profile`, `email`,
  `User.Read`. Nothing else for this step. The import (step 2 of the integration plan) will
  add application permissions, and every customer must consent again then.
- **Token configuration › Add optional claim › ID token:** `email` and **`xms_edov`**.
  `xms_edov` says whether the owner of the e-mail domain verified the address. Without it,
  Supabase Auth treats any address an Azure tenant sends as verified and may link that tenant's
  account to an existing Orgpuls account with the same address; Orgpuls then refuses to bind
  such a link on its first Microsoft sign-in (the database checks `xms_edov`), so leaders who
  already have a password account cannot start using Microsoft until the claim is on.
- **Branding & properties:** publisher domain orgpuls.com, and **publisher verification**
  (a Microsoft Partner Network ID). Many tenants block consent to multitenant apps from
  unverified publishers; with it, the consent screen shows a verified badge.

## 2. Supabase (Dashboard › Authentication)

- **Sign In / Providers › Azure:** enable; *Application (client) ID* and *Secret value* from
  step 1; **Azure Tenant URL** `https://login.microsoftonline.com/organizations`.
- **URL Configuration › Redirect URLs:** the existing `https://www.orgpuls.com/auth/callback`
  and `https://en.orgpuls.com/auth/callback` entries (added for Google, D-102) cover Microsoft
  too. Nothing to add.
- Leave *Allow manual linking* off. Every other Auth setting stays as it is; customers' AAL is
  not changed — their own Conditional Access and MFA apply at Microsoft's sign-in.

The buttons on /logg-inn, /registrer and invitations appear within five minutes (the provider
switch is read from `/auth/v1/settings`, cached five minutes).

## 3. Vercel (Project › Settings › Environment Variables)

| Variable | Value | Notes |
|---|---|---|
| `ENTRA_CLIENT_ID` | the Application (client) ID from step 1 | Server-side. A public identifier, not a secret. Without it the Entra screen says the connection is not set up and offers no button. |

Redeploy after setting it. No other variable is needed; the client secret lives in Supabase
only.

## 4. Check

1. /logg-inn shows «Fortsett med Microsoft» above Google, and the hint «Er dere på Microsoft
   365, slipper du passordet».
2. Sign in with a work account of a test organisation's daglig leder. The first sign-in binds
   the account (tenant id, object id) to the membership.
3. Oppsett › Integrasjoner › Microsoft Entra ID › «Godkjenn og koble til»: Microsoft asks a
   Global Administrator or Privileged Role Administrator of that tenant to consent, and the
   screen returns with «Tilkoblet».
4. A different work account (another tenant) for a member of that organisation is now
   refused at sign-in with the generic message.

## What the database guarantees

See the head of `supabase/migrations/0155_entra_signin.sql` and
`supabase/tests/entra_signin_invariants.sql` (run by `npm run test:db`).
