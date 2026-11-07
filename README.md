# HO Connect

Partner lead-generation platform for HairOriginals: approved partners (salons, parlours, freelancers) refer
customers from a mobile app, HO agents work the leads in a dashboard, and partners earn commission on the
customer's first purchase.

- Product plan: [`HO-Connect-MVP-Plan.md`](HO-Connect-MVP-Plan.md)
- How to try every feature: [`TESTING.md`](TESTING.md). How to launch and run the pilot: [`LAUNCH.md`](LAUNCH.md)
- Company and systems context: [`HairOriginals-company-context.md`](HairOriginals-company-context.md)
- Brand assets: [`docs/brand/`](docs/brand/) (vector logo from the Shopify theme)

## Repository layout

```
apps/
  api/          Fastify + TypeScript backend (all business logic)
  dashboard/    Next.js admin dashboard: partners, leads, commissions, payouts, reports, audit log, team, settings;
                also the public pages: QR / link page (/r/<code>), /privacy, /delete-account
  mobile/       Expo (React Native) partner app, English and Hindi: login, registration, leads, earnings, rate card, QR and link, push, settings
packages/
  shared/       Enums, zod schemas, phone/masking/money utils, stage rules, settings
  db/           Drizzle schema, SQL migrations, seed data
deploy/         Dockerfiles for the API and the dashboard (Railway)
supabase/
  functions/send-sms/   Auth "Send SMS" hook: partner login OTPs via Nimbus (Deno Edge Function)
  tests/                Node tests for the hook
docs/brand/     Logo files
```

npm workspaces with Turborepo. Workspace packages ship TypeScript source (no build step).

## How the pieces fit

- **Supabase** provides Postgres, Auth (partners: phone OTP; dashboard: email) and Storage (private `partner-documents` bucket).
- The **apps use Supabase only to log in**. Every data request goes to the **API** with the Supabase access token.
  The API verifies the token (JWKS, or the legacy HS256 secret) and works out whether the caller is an
  `admin`, `agent`, `partner` or not yet registered.
- **RLS is enabled on every table with no policies**, so the public anon/publishable key cannot read anything.
  The API connects as the table owner.
- Commission rates, referral benefits and all other business rules are **settings in the database**, not code.

## Setting up

Requires Node ≥ 20.19 (developed on Node 26) and npm ≥ 10.

### 1. Create the Supabase project
1. New project, region **South Asia (Mumbai)**.
2. **Authentication → Sign In / Providers**:
   - Enable **Email** (dashboard users).
   - Enable **Phone** (partners): follow [Partner SMS login (Nimbus)](#partner-sms-login-nimbus) below.
3. Collect the values for `.env` (see below).

### 2. Configure environment
```bash
cp .env.example .env
```
| Variable | Where to find it |
|---|---|
| `SUPABASE_URL` | Project Settings → Data API |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API Keys (the *secret* / `service_role` key, server only) |
| `SUPABASE_ANON_KEY` | Project Settings → API Keys (the *publishable* / `anon` key) |
| `SUPABASE_JWT_SECRET` | Only if the project still uses the legacy JWT secret; otherwise leave empty (JWKS is used) |
| `DATABASE_URL` | Connect → **Session pooler** connection string (port 5432). Replace `[YOUR-PASSWORD]` *including the brackets*, and URL-encode special characters in the password (`@` → `%40`). drizzle-kit hides connection errors, so a wrong password shows up only as `migrate` failing with no message |
| `DATA_ENCRYPTION_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |

### 3. Install, migrate, seed
```bash
npm install
npm run db:migrate          # creates the tables, RLS and the storage bucket
npm run db:seed             # partner types, document checklists, categories, 16 ECs, default plan (rates = 0)
npm run create-admin -w @hoc/api -- --email you@hairoriginals.com --name "Your Name" --role admin
```

### 4. Run
```bash
npm run dev                 # API on http://localhost:4000 and dashboard on http://localhost:3000
npm run dev:mobile          # partner app (Expo), in a second terminal
```
(`npm run dev:api` and `npm run dev:dashboard` start them one at a time.)

**Dashboard:** open http://localhost:3000 and log in with the admin from step 3. If `create-admin` printed a
temporary password, change it under **Account**.

**Partner app on your phone:**
1. Install **Expo Go** from the App Store or Play Store. It must support SDK 58, so update it if it's older.
2. Put the phone on the same Wi-Fi as the computer.
3. Run `npm run dev:mobile` and scan the QR code (iPhone: Camera app; Android: inside Expo Go).
4. Log in with your mobile number. The app calls the API on the computer that runs `expo start`, port 4000.
   If it says it can't reach HO Connect, check the API is running, and allow incoming connections for `node`
   if macOS asks.

## Partner SMS login (Nimbus)

Partners log in with a phone OTP. Supabase Auth generates, stores and checks the code and issues the session; it
hands only the **delivery** to the `send-sms` Edge Function (the *Send SMS* auth hook), which sends it through
**Nimbus** on HairOriginals' DLT-registered template. This is the same provider, sender ID (`HAIROG`), entity and
template as the AI try-on project. HO Connect's hook is India-only: it refuses anything that is not a valid +91
mobile before calling Nimbus.

Needs the Supabase CLI (`brew install supabase/tap/supabase`) and `supabase login` once. No Docker needed:
`--use-api` bundles on Supabase's side. Run this first in the repo root, so the commands below can be pasted as is:

```bash
export REF=$(grep '^SUPABASE_URL=' .env | sed -E 's#.*//([^.]+)\..*#\1#')        # project ref
export SUPABASE_ANON_KEY=$(grep '^SUPABASE_ANON_KEY=' .env | cut -d= -f2-)
```

1. **Fill in the function secrets**
   ```bash
   cp supabase/functions/.env.example supabase/functions/.env
   ```
   Copy `NIMBUS_USER_ID` and `NIMBUS_PASSWORD` from the AI try-on project's `.env`. The sender, entity, template ID
   and template text are pre-filled. Leave `SEND_SMS_HOOK_SECRET` for step 3.
2. **Deploy the function**
   ```bash
   supabase functions deploy send-sms --project-ref "$REF" --use-api --no-verify-jwt
   ```
3. **Create the hook.** Dashboard → **Authentication → Auth Hooks → Add hook → Send SMS hook**:
   - Hook type **HTTPS**, URL `https://YOUR-PROJECT-REF.supabase.co/functions/v1/send-sms` (`echo $REF` prints the ref)
   - **Generate secret**, copy it (starts with `v1,whsec_`) into `SEND_SMS_HOOK_SECRET` in `supabase/functions/.env`
   - Save the hook.
4. **Push the secrets**
   ```bash
   supabase secrets set --env-file supabase/functions/.env --project-ref "$REF"
   ```
   Always use `supabase/functions/.env` here, never the root `.env` (that would copy the database password and
   encryption key into function secrets).
5. **Enable phone login.** Dashboard → **Authentication → Sign In / Providers → Phone**:
   - Enable the Phone provider, and allow new users to sign up (partners register themselves).
   - If the form insists on an SMS provider, choose Twilio with placeholder values. While the hook is on they are
     never used; the try-on project does the same.
   - OTP length **6**, OTP expiry **300** seconds. The *SMS message* field is ignored: the hook sends the
     DLT text from `NIMBUS_OTP_TEMPLATE`.
   - **Leave "Test phone numbers" empty.** Test numbers skip the hook and work on the live project for anyone who
     knows them. If a test login is needed later (for example App Store review), add one with a *valid until*
     date and remove it afterwards.
6. **Rate limits.** Dashboard → **Authentication → Rate Limits**: the SMS-per-hour limit defaults to 30. Raise it
   (for example to 100) before onboarding many partners at once.
7. **Test it** without the app (sends one real SMS to your phone). Start the API in another terminal
   (`npm run dev:api`), then:
   ```bash
   PHONE=+919876543210        # your own number, with +91

   curl -s -X POST "https://$REF.supabase.co/auth/v1/otp" -H "apikey: $SUPABASE_ANON_KEY" \
     -H "Content-Type: application/json" -d "{\"phone\":\"$PHONE\"}"
   # → {}  and the SMS arrives

   CODE=123456                # the code from the SMS
   TOKEN=$(curl -s -X POST "https://$REF.supabase.co/auth/v1/verify" -H "apikey: $SUPABASE_ANON_KEY" \
     -H "Content-Type: application/json" -d "{\"type\":\"sms\",\"phone\":\"$PHONE\",\"token\":\"$CODE\"}" \
     | node -pe 'JSON.parse(require("fs").readFileSync(0, "utf8")).access_token')

   curl -s localhost:4000/v1/me -H "Authorization: Bearer $TOKEN"
   # → {"kind":"unregistered","phone":"9876543210","email":null}
   ```
   If the first call returns an error about the phone provider, step 5 isn't done yet.
   Delivery logs: Dashboard → **Edge Functions → send-sms → Logs** (`sent to ******3210`, or the Nimbus error).

**Changing the SMS wording** means registering a new template on the DLT portal (same entity and `HAIROG` header),
then updating `NIMBUS_TEMPLATE_ID` and `NIMBUS_OTP_TEMPLATE` and re-running step 4. No code change or redeploy. The
text must match the registered template byte for byte, with `{otp}` where the template has `{#var#}`.

## Payouts, TDS and reversals

Dashboard → **Payouts**. The page shows who would be paid now (approved commissions not yet in a batch), then you
create a batch, download the CSV for finance, and record each payment's UTR.

- **TDS** is a percentage you set in Settings → General (default **0%**: nothing is deducted until you confirm the
  rate with finance). It is charged on commission after reversals, and shown on the payout, the CSV and in the app.
- **Minimum payout** (default ₹500): smaller balances roll over to the next batch. Suspended partners and partners
  without payout details are left out, with the reason shown.
- **A commission reversed after it was paid** is deducted from the partner's next payout (shown as "Reversals").
  A commission that is *in* an open payout can't be reversed: mark that payout paid or failed first.
- **Failed** payments and **cancelled** batches put the commissions back to "approved" for the next batch.
- The CSV contains bank details and PAN, so only admins can download it, every download is written to the audit log,
  and cells that could run as spreadsheet formulas are neutralised.

## Customer QR / link page

Every approved partner has a QR code and link (`<PUBLIC_WEB_URL>/r/<partner code>`), shown in the app under
**My QR and link**, with a printable poster at `/r/<code>/poster`. A customer opens it, enters name, mobile and
interests, agrees to the consent text, and confirms with an SMS code; the lead is then credited to that partner and
appears in the verification queue.

- The page is served by the dashboard app, so `PUBLIC_WEB_URL` must be an address customers' phones can reach, and
  `CORS_ORIGINS` must include it. In development on your own Wi-Fi use your computer's address, and set
  `NEXT_PUBLIC_API_URL` to the API's address on the same network (see [TESTING.md](TESTING.md)).
- Abuse limits: a hidden honeypot field, 5 form submissions a minute per IP, 3 codes per phone per day, and a cap on
  QR / link referrals per day across all partners (Settings → General). The customer's SMS code is always required
  here, even if consent is switched off for partner-entered leads.
- **Before launching publicly, add a CAPTCHA** (for example Cloudflare Turnstile) to this form: without one it can
  still be used to send SMS to numbers its owner doesn't control, within the limits above.

## AI try-on QR code

Every approved partner also has an **AI try-on** QR code and link, next to the referral one in the app (**My QR and
link → AI try-on**) and on the partner's page in the dashboard (**QR codes** card, where staff can download a PNG / SVG or
open the poster at `/r/<code>/tryon-poster`). It opens the try-on app (`TRYON_WEB_URL`, default
https://aitryon.hairoriginals.com) with these UTM tags:

| Tag | Value | Why |
| --- | --- | --- |
| `utm_source` | `ho_connect` | Every partner try-on link; the try-on app treats it as a partner referral |
| `utm_medium` | `partner_qr` or `partner_link` | Scanned QR, or a link the partner shared |
| `utm_campaign` | the partner code, e.g. `HOC00042` | Identifies the partner |
| `utm_content` | the business name as a slug, e.g. `glamour-salon` | So people reading the CRM recognise the salon; left out if the name has no Latin letters |

The try-on app keeps these in its first-touch cookie and sends them to the DigiCuro CRM with the lead (top-level
`utm_source` / `utm_medium` / `utm_campaign`, and all of them in `metadata.marketing`), and adds "referred by HO Connect
partner HOC00042 (glamour-salon)" to the lead's note. A partner scan replaces an earlier ad or organic visit in that
cookie; between two partners the first one keeps the customer. The format is built in `packages/shared/src/tryon.ts` and
is a contract with the try-on app and with printed posters: don't change it without changing both.

These leads go to the CRM, **not** into HO Connect: they are not in the partner's lead list and earn no commission
automatically.

## Custom QR codes (stores, events, …)

Dashboard → **QR codes** makes QR codes for places that are not partners: HO's own stores, events, flyers. Any staff
member can make one; only admins can archive. Each code has a name, a type (HO store / event / other), an optional
label printed on the poster, and opens either the AI try-on app or any `https://` page, with UTM tags filled in from
the name and type (editable):

| Type | Suggested tags |
| --- | --- |
| HO store | `utm_source=ho_store`, `utm_medium=qr`, `utm_campaign=<name as a slug>` |
| Event | `utm_source=ho_event`, … |
| Other | `utm_source=ho_offline`, … |

`utm_content` is optional, for telling apart several codes in one place (counter, mirror). `utm_source=ho_connect` is
refused: it means "a partner salon", and the try-on app lets those beat earlier visits. The finished link is saved
with the code (table `qr_codes`, migration `0004`) and can never be edited, because it may be printed; name, label and
notes can. Staff get a PNG / SVG download and a poster at `/print/qr/<id>` (needs the dashboard login). Every change is
in the audit log.

A store or event code follows the try-on app's normal rule: it is credited unless the visitor already arrived through
an ad or a partner salon's code.

## Push notifications

Partners get a notification when a lead moves stage, a customer confirms through their QR page, a sale is recorded,
a commission is approved, a payout is paid, or their application is decided. Messages show only the masked customer
name ("Priya S.") because they appear on lock screens. The API sends through Expo's push service
(`PUSH_PROVIDER=expo`; `console` just prints them).

The app registers its phone after login if `EXPO_PUBLIC_EAS_PROJECT_ID` is set (run `npx eas-cli init` in
`apps/mobile`). **Remote push does not work in Expo Go on Android** (Expo SDK 53 and later): it needs a development
or release build.

## Reminder SMS ("Nudge")

When HairOriginals can't reach a customer, the partner can send them a reminder. It stays hidden in the app until an
SMS template is registered with your DLT provider and set up with:

```bash
npm run message-template -w @hoc/api -- --key customer_nudge --template-id <DLT id> \
  --body "Hi {{customer_name}}, we tried to reach you about your HairOriginals consultation (referred by {{partner_name}}). …"
```

The text can use only `{{customer_name}}` and `{{partner_name}}`. A customer can get at most 2 reminders, 48 hours apart.

## Everyday commands

| Command | What it does |
|---|---|
| `npm test` | All unit tests (shared, api, and the send-sms hook) |
| `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54329/hoc_test npm test` | Also runs the partner-onboarding, leads and commissions integration tests against a local Postgres. The database is wiped, so the URL must be localhost (the suite refuses anything else) |
| `npm run typecheck` | Type-check every workspace and the hook |
| `npm run db:generate` | After editing `packages/db/src/schema`, generate a new SQL migration |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:studio` | Browse the database with Drizzle Studio |
| `npm run check:i18n -w @hoc/mobile` | Checks every app text has a Hindi translation with the same `{placeholders}` |
| `node apps/mobile/scripts/make-icons.cjs` | Redraws the app icon, splash and notification icon from the logo |
| `npm run reset-test-data -w @hoc/api -- --yes` | **Development only.** Deletes test partners, leads, sales, commissions and payouts; keeps settings, plans, centres and admins |
| `npm run message-template -w @hoc/api -- --key …` | Set the DLT text and template id of the consent or reminder SMS |

Change the schema only through Drizzle migrations, never in the Supabase table editor, so that migrations remain the
single source of truth.

## API so far

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/health` | public | Liveness |
| GET | `/health/ready` | public | Readiness (DB reachable). Use as the Railway health check |
| GET | `/v1/me` | any logged-in user | Returns `admin` (role), `partner` (status) or `unregistered` (phone) |
| GET | `/v1/admin/me` | active admin / agent | Dashboard gate |
| GET | `/v1/admin/overview` | active admin / agent | Dashboard home numbers (partners, leads, centres) |
| GET | `/v1/partner/registration-options` | any logged-in user | Partner types with checklists, centres, states, current terms |
| POST | `/v1/partner/register` | logged in by phone, not yet a partner | Step 1: creates the draft application |
| GET / PATCH | `/v1/partner/application` | partner | Read / update the application (only while draft or changes requested) |
| POST | `/v1/partner/application/documents/:documentTypeId` | partner | Upload one file (multipart, 10 MB; type checked from the bytes) |
| DELETE | `/v1/partner/application/documents/:id` | partner | Remove a file that isn't accepted yet |
| POST | `/v1/partner/application/submit` | partner | Submit, accepting the current terms version |
| GET | `/v1/admin/partners` | admin / agent | Queue with status counts, search, paging |
| GET | `/v1/admin/partners/:id` | admin / agent | Full application, document view links (10 min), history |
| PATCH | `/v1/admin/partners/:id/documents/:documentId` | admin / agent | Accept or reject a document (reject needs a note) |
| POST | `/v1/admin/partners/:id/decision` | admin / agent (suspend, reactivate: admin) | Approve (issues `HOC00001`…), ask for changes, reject |
| GET | `/v1/admin/partners/:id/sensitive` | admin / agent | Full PAN and payout details; every view is audited |
| PUT | `/v1/admin/partners/:id/notes` | admin / agent | Internal notes |
| GET | `/v1/admin/partner-types` | admin / agent | Partner types and checklists |
| POST / PATCH | `/v1/admin/partner-types`, `/v1/admin/partner-types/:id/document-types`, `/v1/admin/document-types/:id` | admin | Edit types and checklists |
| GET | `/v1/partner/lead-options` | approved partner | Interests, centres, preferred modes, active benefit, daily limit |
| GET / POST | `/v1/partner/leads` | approved partner | List own leads (masked) / add a lead and send the consent code |
| GET | `/v1/partner/leads/:id` | approved partner | Lead detail and partner-visible timeline |
| POST | `/v1/partner/leads/:id/confirm`, `/resend` | approved partner | Customer's 6-digit code (5 tries) / send it again (once, after 60 s) |
| GET | `/v1/admin/leads?view=verify\|open\|awaiting\|purchased\|closed\|all` | admin / agent | Verification queue and lead lists, with counts and search |
| GET | `/v1/admin/leads/:id` | admin / agent | Full lead, consent proof, same-phone leads, timeline with notes |
| POST | `/v1/admin/leads/:id/verify` | admin / agent | Tag customer type (+ optional DigiCuro reference) |
| POST | `/v1/admin/leads/:id/stage`, `/notes` | admin / agent | Manual stage change / internal note |
| POST | `/v1/admin/leads/bulk-stage` | admin / agent | Same stage for a selection of leads |
| POST | `/v1/admin/leads/bulk-csv/preview`, `/v1/admin/bulk-jobs/:id/apply` | admin / agent | CSV: preview every row, then apply the valid ones once |
| POST | `/v1/admin/leads/:id/sales/preview`, `/v1/admin/leads/:id/sales` | admin / agent | Preview the commission line by line, then record the sale (commission created, lead → purchased) |
| GET | `/v1/admin/commissions?view=approvable\|flagged\|pending\|approved\|closed\|all`, `/v1/admin/commissions/:id` | admin / agent | Commission queue with totals; calculation breakdown and history |
| POST | `/v1/admin/commissions/approve`, `/:id/adjust`, `/:id/reject`, `/:id/reverse` | admin | Approve (bulk), adjust with a reason, reject, reverse a returned sale |
| GET / POST / PATCH | `/v1/admin/commission-plans`, `/:id/rules` (+ PUT/DELETE `/:id/rules/:ruleId`) | read: admin / agent; write: admin | Plans and rules |
| PUT | `/v1/admin/plan-assignments` | admin | Assign a plan to the default, a partner type or one partner |
| GET | `/v1/admin/partners/:id/plan` | admin / agent | The plan in effect for a partner, and any override |
| GET / POST / PATCH | `/v1/admin/benefits` | read: admin / agent; write: admin | Referral benefits |
| GET / PUT | `/v1/admin/settings` | read: admin / agent; write: admin | Ownership window, hold period, limits, TDS, partner-facing labels |
| GET | `/v1/admin/reports/funnel?by=partner\|city\|centre&from&to`, `/v1/admin/reports/metrics` | admin / agent | Lead funnel and the pilot success metrics (dates in India time, default last 30 days) |
| GET | `/v1/admin/audit` | admin | Audit log with filters |
| GET / POST / PATCH | `/v1/admin/team`, `/v1/admin/team/:id` | admin | Dashboard users: add (temporary password shown once), change role, deactivate |
| POST | `/v1/admin/leads/:id/withdraw-consent` | admin / agent | Customer withdrew consent: erase name, phone, city and notes (sales and commissions stay) |
| POST | `/v1/admin/partners/:id/close-account` | admin | Close an account that asked to be deleted (login off, documents and contact details removed; tax records kept) |
| POST | `/v1/me/delete-account` | any logged-in partner or new user | Partner: request deletion. Someone who never registered: deletes the login |
| GET | `/v1/admin/payouts/preview` | admin | Who would be paid now (TDS, reversals), and who is left out and why |
| GET / POST | `/v1/admin/payout-batches`, `/:id` | admin | Batches; create one from the preview |
| GET | `/v1/admin/payout-batches/:id/csv` | admin | The finance file (bank details + PAN). Audited, never cached |
| POST | `/v1/admin/payout-batches/:id/payouts/:payoutId/paid\|failed`, `/:id/cancel` | admin | Record the UTR, mark a payment failed, cancel a batch nobody was paid from |
| GET | `/v1/partner/earnings`, `/v1/partner/rate-card`, `/v1/partner/referral` | approved partner | Totals and payouts; commission rules in plain words; own QR and link |
| POST | `/v1/partner/push-token`, `/push-token/remove` | partner | Register / forget this phone for notifications |
| POST | `/v1/partner/leads/:id/nudge` | approved partner | Send the approved reminder SMS for an unreachable customer |
| GET | `/v1/public/referral/:code`, `/:code/qr.svg` | public | Customer page content; QR image for the poster |
| POST | `/v1/public/referral/:code/leads`, `/v1/public/leads/:id/confirm`, `/resend` | public, rate-limited | Customer starts a referral and confirms with the SMS code |

## Customer consent SMS

When a partner adds a lead, the API texts the customer a 6-digit code using the `consent_otp` row of
`message_templates` ("{{otp}} is your OTP to confirm your referral to HairOriginals by {{partner_name}}…").
Only an HMAC of the code is stored. The lead expires if not confirmed within 72 hours (Settings), and the
partner can resend the code once.

- **Development (`OTP_PROVIDER=console`)**: no SMS is sent. The code is printed in the API log, and the app shows
  it on the code screen so you can test the flow.
- **Real SMS (`OTP_PROVIDER=nimbus`)**: register a DLT template for this message (same entity and `HAIROG`
  header as partner login), then put its exact text and id on the template row, and set the `NIMBUS_*` values in
  `.env`:
  ```bash
  npm run consent-template -w @hoc/api -- --template-id <DLT id> --body "Your … code is {{otp}}. …"
  npm run consent-template -w @hoc/api -- --from-env   # use NIMBUS_TEMPLATE_ID / NIMBUS_OTP_TEMPLATE from .env
  ```
  **Currently** the project uses the AI try-on OTP template ("Your HairOriginals-AiTryOn verification code is …
  Do not share it with anyone."), set with `--from-env`. Register a consent-specific template (naming the partner
  and the purpose) and switch to it with the first command.
  Each variable is cut to 30 characters (the DLT limit). If the template id is missing, sending fails and the
  partner sees "Resend code".
- To switch consent off entirely (not recommended), insert `('require_customer_otp', false)` into `settings`:
  leads then go straight to the verification queue.

## Notes

- **Install scripts:** npm 11 blocks dependency install scripts until approved (`npm approve-scripts`). Nothing
  currently needs them: esbuild works through its platform package.
- **Two TypeScript versions:** the repo uses TypeScript 7. The dashboard and the app have TypeScript 6 in their own
  `node_modules`, because Next.js and Expo still need TypeScript's JavaScript API, which 7 doesn't have.
- **One React:** the dashboard and the app both pin React to exactly the version Expo SDK 58 needs (19.3.0), so
  npm installs a single copy. Change both together when upgrading Expo.
- **Folder name with spaces:** the parent folder `HairOriginals ` (with a trailing space) works for the API and
  Expo/EAS cloud builds. Local native iOS builds have historically had trouble with spaces in paths; if you hit
  that, move the repo to a path without spaces.
