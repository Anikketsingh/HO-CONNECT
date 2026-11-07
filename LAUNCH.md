# Launching HO Connect

What has to happen between "it works on my laptop" and "15–25 partners in Delhi NCR are using it". Work through it in
order. Items marked **you** need an account or a decision only you can make; the rest is already built.

**Not done and not tested:** nothing here has been run in production. The Docker images were not built (Docker isn't
installed on the development computer), although every command inside them was run and works. The Play Store steps
need your Google account, so they are written as instructions.

---

## 1. Before anything else

- [ ] **Legal text (blocks launch).** Replace the draft **partner terms** and **customer consent** text, the
  **privacy policy** (`apps/dashboard/src/app/privacy/page.tsx`) and the **account deletion page**
  (`.../delete-account/page.tsx`), and add a real support email where it says `[add support email]`.
  To publish new terms or consent text (partners and customers see the newest version; the version is recorded with each
  acceptance), run this in the Supabase SQL editor:
  ```sql
  insert into legal_documents (kind, version, title, body, published_at)
  values ('partner_terms', '1.0', 'HO Connect Partner Terms', 'the approved text…', now());
  -- and the same with kind 'customer_consent'. Use {{partner_name}} where the partner's name should appear.
  ```
- [ ] **SMS templates (DLT).** Register with your SMS provider, then set them with `npm run message-template -w @hoc/api`:
  1. a **customer consent** template that names the partner and the purpose (replaces the AI try-on one, which tells the
     customer *not* to share the code, while this flow asks them to read it out);
  2. the **reminder** template (`customer_nudge`). Until it is set, the "Send a reminder" button stays hidden.
- [ ] **Money rules, with finance:** commission rates per category and customer type (Settings → Commission), the
  **TDS rate and any threshold** (Settings → General → TDS; it is 0% until you set it), the minimum payout, the hold
  period, and the referral benefit (Settings → Benefits).
- [ ] **Experience centre details** are correct. There is no screen to edit centres yet: fix a wrong phone or address in the `centres` table (Supabase → Table editor).

## 2. Production Supabase project

Use a **separate project** from the one you test on, so test data never reaches real partners. In the new project
(Mumbai region), follow the README steps: create the project, `.env` values, `npm run db:migrate`, `npm run db:seed`,
create the first admin, and the **Partner SMS login (Nimbus)** steps (function, hook, secrets, phone provider).

Production-only checks:
- [ ] Authentication → Sign In / Providers → Phone → **Test phone numbers is empty** (see section 5 for the one exception).
- [ ] Authentication → Rate Limits: raise the SMS-per-hour limit for onboarding day.
- [ ] **CAPTCHA on the customer QR page.** Add Cloudflare Turnstile (free) before publishing QR codes widely: the page can
  still be used to send SMS to numbers its owner doesn't control. The limits in the README reduce this but don't remove it.
- [ ] Database backups: check what your Supabase plan includes (daily backups are a paid-plan feature) and decide before real money is involved.
- [ ] Storage: the `partner-documents` bucket exists and is **private** (it is created by the migration).

## 3. Deploy the API and the dashboard (Railway)

Two services from this repository, each built from its own Dockerfile.

**API** (`Dockerfile` at the repo root)
- New Railway service from the repo → Settings → set the Dockerfile path to `Dockerfile`; health check path `/health/ready`.
- Variables (see `.env.example` for the meaning of each): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`
  (the Supabase **session pooler**, port 5432), `DATA_ENCRYPTION_KEY` (generate a new one; **keep a safe copy: if it is lost,
  stored PAN and bank details cannot be decrypted**), `NODE_ENV=production`, `OTP_PROVIDER=nimbus` with the four `NIMBUS_*`
  values, `PUBLIC_WEB_URL` (the dashboard's public address), `CORS_ORIGINS` (the same address; comma-separated for several),
  `PUSH_PROVIDER=expo`, and `TRYON_WEB_URL` only if the try-on app is not at https://aitryon.hairoriginals.com.
- Only run **one** API instance: the expiry and hold jobs run inside it.
- Give it a domain, for example `api.<your domain>`.

**Dashboard and customer pages** (`deploy/Dockerfile.dashboard`)
- A second service. Build arguments (public values, baked into the website): `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL` (the API's address). Variable `PORT=3000`.
- Domain, for example `connect.<your domain>`. This one address serves the staff dashboard (`/login`), the customer QR page
  (`/r/<code>`), and the privacy policy (`/privacy`) that Google Play needs.
- If you change the API's address later, rebuild the dashboard (the address is part of the built code).

**Check it:** open `https://<api>/health/ready`, log in at `https://<dashboard>/login`, and run TESTING.md section 5.2 with
the real address.

## 4. Build the Android app

You need: an Expo account, and your repository in git with at least one commit (EAS builds from git; this repository has no commits yet).

```bash
cd apps/mobile
npx eas-cli login
npx eas-cli init                      # creates the project; copy the project id it prints
```

Set the app's public values on EAS (they are not read from your `.env` on the build servers):

```bash
for kv in EXPO_PUBLIC_SUPABASE_URL=<url> EXPO_PUBLIC_SUPABASE_ANON_KEY=<publishable key> \
          EXPO_PUBLIC_API_URL=https://<api> EXPO_PUBLIC_WEB_URL=https://<dashboard> \
          EXPO_PUBLIC_EAS_PROJECT_ID=<project id>; do
  npx eas-cli env:create --environment production --visibility plaintext --name "${kv%%=*}" --value "${kv#*=}" --non-interactive
done
```

Then:
- **Try it on your own phone first:** `npx eas-cli build --platform android --profile preview` gives an installable APK.
  A `development` profile (a build that also supports push notifications while developing) is also set up.
- **For the Play Store:** `npx eas-cli build --platform android --profile production` makes the `.aab` file.
- **Push notifications on Android** need a Firebase project: add the Android app (`com.hairoriginals.connect`) in
  Firebase, put `google-services.json` in `apps/mobile`, set `android.googleServicesFile` in `app.config.ts`, and upload
  the FCM credentials with `npx eas-cli credentials`. iOS needs an Apple developer account and is not set up for release yet.
- **The icon is a placeholder** drawn from your logo (`apps/mobile/assets`). Replace the files with the designer's square
  mark when you have it, keeping the same names.

## 5. Google Play internal testing

**you:** a Google Play Console account. Check Google's current rules when you register: organisation accounts need a
D-U-N-S number, and **new personal accounts must run a closed test with a minimum number of testers for 14 days before
they can publish publicly**. Internal testing (up to 100 testers you invite by email) is available straight away and is
what the pilot needs.

1. Create the app in Play Console (name "HO Connect", default language English (India), free).
2. App content → fill in each section. Use these answers (check them against the final app):
   - **Privacy policy URL:** `https://<dashboard>/privacy`.
   - **Account deletion:** the app has an in-app way (Settings → Delete my account) and a web page: `https://<dashboard>/delete-account`.
   - **Data safety:** collected and **encrypted in transit**: phone number, name, address, financial info (bank/UPI, PAN),
     photos (verification documents), device/notification ID. Purpose: app functionality and account management. **Not sold.**
     Shared only with the service providers that run the app (hosting, SMS, notifications). Users can request deletion.
   - **Permissions:** camera only (to photograph documents). No location, contacts, microphone or storage permission.
   - **Content rating:** answer the questionnaire honestly (no user-generated public content); expect "Everyone".
   - **Target audience:** adults (business partners).
3. **App access for the reviewer.** Reviewers cannot receive an SMS code. Create a dedicated test partner for them
   (an approved partner, with a few sample leads), and in Supabase → Authentication → Phone → **Test phone numbers** add
   one number with a fixed code **and an expiry date**. Put that number and code in Play Console → App content → App
   access. **Remove it once the review passes**: while it exists, anyone who knows the number and code can log in as
   that partner.
4. Store listing: short and full description, a 512×512 icon (`apps/mobile/assets/icon.png` is 1024×1024; resize it),
   a 1024×500 feature graphic, and phone screenshots (take them from the preview build).
5. Testing → **Internal testing** → create a release → upload the `.aab`. The first upload has to be done by hand in the
   console. After that `npx eas-cli submit -p android --profile production` can upload new builds if you give EAS a Google
   service-account key.
6. Add the testers' Google email addresses; they get an opt-in link.

## 6. The pilot (15–25 partners, 4–6 weeks)

**Setup week**
- [ ] 2 agents and 1 admin created (Settings → Team). Agree who checks the verification queue and how often (the plan targets same-day contact).
- [ ] A short written guide for partners (what to photograph, how the customer code works). Test it on one friendly salon first.
- [ ] Decide the referral benefit you can honour, and make sure the Experience Centres know about it.
- [ ] Agree how often you pay (the plan suggests monthly) and who downloads the payout CSV.

**Onboarding each partner**
1. They install the app and register (4 steps, about 10 minutes with documents ready).
2. An agent reviews documents the same day (dashboard → Partners → Awaiting review) and approves.
3. Give them the **QR poster** (app → My QR and link → Open printable poster), and show them how to add a lead.

**Every day (agent):** work Leads → To verify (look the number up in DigiCuro, tag the customer type), then mark leads
In touch, book consultations, record sales.
**Every week (admin):** Reports → Pilot metrics for the previous 7 days; approve ready commissions; read the audit log if something looks off.
**Every month (admin):** Payouts → create the batch, send the CSV to finance, enter the UTRs.

**What "working" looks like** (from the plan; Reports → Pilot metrics shows each one): partners adding a lead every week,
a healthy consent rate, leads verified and contacted quickly, a good share of genuinely new customers, purchases per lead
compared with your ad leads, commission per sale compared with ad cost per customer, days from sale to payout, and partners still active after 60 days.

## 7. Go-live checklist

- [ ] Section 1 all done (legal text and templates are the usual blockers)
- [ ] Production Supabase set up; test phone numbers removed
- [ ] API and dashboard running; `/health/ready` is OK; staff can log in
- [ ] `OTP_PROVIDER=nimbus` in production, and a real customer code arrives by SMS
- [ ] Real commission rates, TDS, minimum payout and benefit entered
- [ ] CAPTCHA on the customer page (or a conscious decision to wait)
- [ ] `DATA_ENCRYPTION_KEY` and the Supabase secret key stored safely somewhere other than your laptop
- [ ] Build installed on a real Android phone and TESTING.md walked through once on the production system
- [ ] Hindi texts read by a native speaker
- [ ] One partner onboarded end to end, and one payout paid with a UTR
- [ ] Migration `0004_custom_qr_codes` applied (`npm run db:migrate`): the dashboard's QR codes page needs it
- [ ] AI try-on app deployed with the partner attribution change (its `lib/attribution.ts`: a `utm_source=ho_connect`
      scan beats an earlier ad visit), and one partner try-on QR checked end to end into DigiCuro (TESTING.md TRY-6)

## 8. Not built yet

- Editing the **legal text** in the dashboard (use the SQL above for now), and editing the 16 Experience Centres.
- **iOS release** (the code is the same; it needs an Apple developer account, certificates and push setup).
- Hindi for the **dashboard** (the app is translated), and for messages written by the team or the server (stage names are translated, custom wording is not).
- Phase 2: DigiCuro CRM/ERP connection, automatic customer-type lookup, online payouts, repeat-purchase commission.
