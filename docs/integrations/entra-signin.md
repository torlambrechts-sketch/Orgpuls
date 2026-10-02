# Microsoft Entra ID sign-in — operator setup (D-201)

What has to exist outside this repository for «Fortsett med Microsoft» and «Koble til
Microsoft 365» to work. Nothing here can be done from code: the Entra app belongs to the
Orgpuls Microsoft tenant, and the provider switch lives in the Supabase dashboard.

Until item 4 of the order below is done, nothing changes for anybody: the sign-in buttons render only when
Supabase reports the `azure` provider on, and the Entra screen offers no button without
`ENTRA_CLIENT_ID`.

## 0. Order

1. Apply migration `0155_entra_signin.sql` to the hosted database **before** the code that
   calls it is deployed. `/auth/callback` runs `entra_sign_in_check` after every OAuth sign-in
   and fails closed: without the function, Google sign-in would be refused too.
2. Apply migration `0156_entra_token_hook.sql`, then switch on the token hook (section 2)
   — **before** the azure provider is enabled.
3. Deploy the code.
4. Do the Azure and Supabase steps below, then set `ENTRA_CLIENT_ID`.

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
  expires, Microsoft sign-in stops. The secret goes into Supabase only (section 3) — never into
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

## 2. Supabase token hook (Dashboard › Authentication › Hooks) — first

`/auth/callback` is not the only way to a session: a client can exchange the OAuth code with
Supabase Auth itself (`/auth/v1/token?grant_type=pkce`), use the implicit flow, or post a
Microsoft ID token, and never pass the callback's check. Migration 0156 adds the same rules as a
**Custom Access Token hook**, which Supabase Auth runs before it signs any token (D-204).

- **Authentication › Hooks › Add hook › Customize Access Token (JWT) Claims hook** — hook type
  *Postgres*, schema `public`, function **`entra_access_token_hook`**. Enable it and save.
- Do this **after** 0156 is applied (a hook pointing at a function that does not exist refuses
  every sign-in, password included) and **before** the azure provider below is switched on (until
  then, a Microsoft sign-in that bypasses the callback would not be checked).
- The migration already grants `execute` on the function to `supabase_auth_admin` and to no one
  else; the dashboard may offer to grant it again, which changes nothing.
- What it does: a password, OTP, magic link or TOTP token, and every token of an account with no
  Microsoft identity, passes untouched. A sign-in through a provider (`oauth`) is judged by the
  sign-in rules; a refresh is judged again only for a session `/auth/callback` accepted as a
  Microsoft one. A refusal is HTTP 403 «Sign-in refused», the same for every rule.
- Check: after saving, sign in with e-mail and password on /logg-inn — it must still work. If it
  does not, switch the hook off again (same screen) and report it; the function is the suspect.

## 3. Supabase provider (Dashboard › Authentication)

- **Sign In / Providers › Azure:** enable; *Application (client) ID* and *Secret value* from
  step 1; **Azure Tenant URL** `https://login.microsoftonline.com/organizations`.
- **URL Configuration › Redirect URLs:** the existing `https://www.orgpuls.com/auth/callback`
  and `https://en.orgpuls.com/auth/callback` entries (added for Google, D-102) cover Microsoft
  too. Nothing to add.
- Leave *Allow manual linking* off. Every other Auth setting stays as it is; customers' AAL is
  not changed — their own Conditional Access and MFA apply at Microsoft's sign-in.

The buttons on /logg-inn, /registrer and invitations appear within five minutes (the provider
switch is read from `/auth/v1/settings`, cached five minutes).

## 4. Vercel (Project › Settings › Environment Variables)

| Variable | Value | Notes |
|---|---|---|
| `ENTRA_CLIENT_ID` | the Application (client) ID from step 1 | Server-side. A public identifier, not a secret. Without it the Entra screen says the connection is not set up and offers no button. |

Redeploy after setting it. No other variable is needed; the client secret lives in Supabase
only.

## 5. Check

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

See the heads of `supabase/migrations/0155_entra_signin.sql` and
`supabase/migrations/0156_entra_token_hook.sql`, and `supabase/tests/entra_signin_invariants.sql`
and `supabase/tests/entra_token_hook_invariants.sql` (both run by `npm run test:db`).
