# Enable Banking: what you do before Centje can connect a bank

Enable Banking is the PSD2 aggregator Centje will use to pull transactions straight from
ING, ABN AMRO, Rabobank, ASN, RegioBank, SNS, Triodos and Van Lanschot. For your own
accounts it is free: you register an app, link your own accounts to it, and it runs in
"restricted production" without a contract. bunq is not covered; credit cards at ABN AMRO
are outside the PSD2 API. Source pages are listed at the end.

## 1. Create the account

1. Go to https://enablebanking.com/sign-in/ and enter your email. There is no separate
   sign-up: the first sign-in creates the account.
2. Open the one-time link from the email. You land in the Control Panel.
3. Optional but sensible: Profiles tab, add a phone number for MFA.

## 2. Decide the redirect URL first

The registration form asks for the redirect URL before anything is created, so settle it
first. It is the address your **browser** is sent back to after you consent at the bank.
The bank never calls it; your browser does. So it must be the address you yourself use to
open Centje, with `/api/bank/callback` appended (the path Centje will serve once the bank
connection exists; whoever builds it uses this exact path).

- You open Centje at `http://localhost:3000` on the same PC → `http://localhost:3000/api/bank/callback`.
- You open it from another device on the LAN at `http://192.168.1.20:3000` →
  `http://192.168.1.20:3000/api/bank/callback`.
- The Unraid install behind your domain → `https://centje.yourdomain.tld/api/bank/callback`.

You may whitelist several URLs on one app, so add every address you use. The URL must
match what Centje sends character for character: scheme, host, port and path.

**Production apps accept `https://` only.** The Control Panel rejects
`http://localhost:3000/...` with "uses unsupported scheme". So:

- Production app: `https://centje.yourdomain.tld/api/bank/callback`, the address of the
  real install. Linking real accounts happens there.
- Sandbox app: `http://localhost:3000/api/bank/callback` is fine for building and testing
  against the mock bank.
- To try the production app from a dev machine, run Centje over HTTPS locally:
  `next dev --experimental-https` serves `https://localhost:3000` with a self-signed
  certificate, and `https://localhost:3000/api/bank/callback` is then a valid redirect URL.

## 3. Register the sandbox app

Register two apps: a sandbox one for building and testing, then the production one. The
form is one screen; fill it top to bottom and the key is generated when you press Register.

1. Control Panel → API applications (https://enablebanking.com/cp/applications) → new application.
2. Environment: **Sandbox**.
3. Key: choose "generate in browser". Nothing is downloaded yet.
4. Name: anything, for example "Centje sandbox".
5. Redirect URLs: the address(es) from section 2.
6. Press **Register**. Now two things happen: the app gets an application ID (a UUID), and
   the browser saves the private key to your Downloads folder as `<application-id>.pem`.
   The key never leaves your machine and cannot be downloaded again, so keep the file.
   (Alternative: generate an RSA key with OpenSSL beforehand and paste the public key.)

The application ID and the `.pem` file are what Centje needs in Settings › Import › Bank
connection.

## 4. Register the production app

Same steps with Environment: **Production**. Production asks for more:

- an application description (shown to you during consent),
- a data protection contact email,
- a privacy policy URL and a terms of service URL. For a self-hosted personal install a
  page on your own domain, or the Centje repository README, is acceptable; Enable Banking
  only reviews these for an unrestricted contract, which you are not asking for.

The app starts as **Inactive**.

## 5. Activate it by linking your own accounts

1. Open the production app in the Control Panel and click **Activate by linking accounts**.
2. You are sent through Enable Banking's page to your bank. On the bank side you authorise
   with the bank's app (ING Bankieren, ABN AMRO app, Rabo Bankieren; on desktop a QR code).
3. Accept the end-user terms. The app becomes **Active (restricted)**: it can read only the
   accounts you linked. That is exactly what a personal install needs.
4. Repeat for every bank you want in Centje. Each bank is a separate link.

Linking does not yet authorise Centje. The app itself has to run the consent flow once per
bank (section 7). Consent at the bank is valid for up to 180 days; after that Centje will ask
you to renew it.

## 6. What to keep safe

- The `.pem` private key file for each app. Anyone with the key and the application ID can
  read the linked accounts. Store it like a password; do not commit it anywhere.
- The application IDs.

## 7. What Centje does with it

1. Settings › Import › Bank connection: paste the application ID and the whole private key
   (open the `.pem` in a text editor, copy everything including the `BEGIN`/`END` lines).
   Both stay on the server in `app_settings`, like the Gemini key; the key never goes back
   to the browser. **Test** calls `GET /application` to prove the pair works.
2. **Connect a bank**: pick the bank (searchable list from `GET /aspsps?country=NL`), Centje
   calls `POST /auth` with the redirect URL built from the address you opened Centje at,
   you consent at the bank, the browser returns to `/api/bank/callback`, Centje exchanges
   the code for a session (`POST /sessions`) and opens **Link accounts**: every account the
   bank shared maps to one of your accounts in Centje (prefilled by IBAN), a new account
   made from it, or "Don't sync".
3. **Sync now** (per bank) or **Sync all** fetches booked transactions
   (`GET /accounts/{uid}/transactions`): the first time as far back as the bank gives, then
   from a week before the last sync (late bookings). Rows go through the CSV import path
   (dedupe, merchants, rules, Needs a category) with source "bank". Rows a CSV import
   already brought in are recognised by account, day, amount and direction and skipped.
4. History: banks usually give about 90 days on the first fetch. Keep CSV import for older
   history; the connection carries on from there.
5. When the consent runs out (or you revoke it at the bank) the bank shows **Consent
   expired** with a **Reconnect** button. Reconnecting keeps the account links and the
   last synced date.

## 8. The daily sync

While Centje runs it syncs every connected bank once a day by itself: a timer started
when the server starts checks every hour and syncs when the last automatic run is more
than a day old (the first check is five minutes after a start). It never runs while a CSV
import or another sync is busy; it tries again the next hour. Set `BANK_SYNC_DISABLED=1`
to switch it off.

To schedule it yourself instead (for example with Unraid's User Scripts plugin, or cron):

1. Set an environment variable `BANK_SYNC_TOKEN` on the container to a long random string
   (`openssl rand -hex 32`). Without it the endpoint below refuses every request.
2. Call it from the scheduler:

   ```bash
   curl -fsS -X POST -H "Authorization: Bearer $BANK_SYNC_TOKEN" https://centje.yourdomain.tld/api/bank/cron
   ```

   It answers with the result per bank, or HTTP 409 when an import or sync is running.
   Set `BANK_SYNC_DISABLED=1` as well if the built-in timer should not run next to it.

Banks limit how often an app may fetch without you present (often four times a day per
account), so there is no point scheduling it more than a few times a day.

## Sources

- Control Panel guide: https://enablebanking.com/docs/api/control-panel/
- Quick start (JWT with `kid` = application ID, RS256, one-hour tokens; the
  `/aspsps` → `/auth` → `/sessions` → `/accounts` flow): https://enablebanking.com/docs/api/quick-start/
- Restricted production by linking your own accounts: https://enablebanking.com/docs/api/linked-accounts/
- Netherlands banks and authentication flows: https://enablebanking.com/docs/markets/nl/
