# Testing HO Connect by hand

A step-by-step guide to trying every feature built in milestones 1–6. Each step says what to do and what you should
see. Tick the boxes as you go. If something differs, note the step number and what you saw.

**What this guide can't tell you:** the screens were built and type-checked, and the rules behind them are covered by
automated tests, but nobody has clicked through the screens or used the app on a phone yet. Expect small layout or
wording problems, and please note them.

---

## 0. Before you start

### 0.1 Prepare the system

- [ ] **Apply new database migrations** (milestones 5 and 6 each added columns; screens error until they are applied):
  `npm run db:migrate`
- [ ] **Restart everything** so it picks up the new code: stop with Ctrl+C, then run `npm run dev` (API on :4000,
  dashboard on :3000) and, in a second terminal, `npm run dev:mobile`.
- [ ] Check the API: open <http://localhost:4000/health/ready>. You should see `{"status":"ok"}`.
- [ ] **Phone app:** install **Expo Go** (update it so it supports SDK 58), put the phone on the same Wi-Fi as your
  computer, and scan the QR code from `npm run dev:mobile`. If macOS asks whether `node` may accept incoming
  connections, choose Allow.

### 0.2 Who you need

| Who | How |
|---|---|
| **Admin** (dashboard) | `npm run create-admin -w @hoc/api -- --email you@hairoriginals.com --name "Your Name" --role admin` |
| **Agent** (dashboard) | the same command with a different email and `--role agent`. Use a second browser (or a private window) so you can be both at once |
| **Partner 1** (app) | a real mobile number you can receive SMS on |
| **Partner 2** (app) | a second number. Needed for tests about two partners referring the same customer. A second phone is ideal; you can also log out and in on one |
| **Customer** | a third number for the consent codes and the QR page (or reuse a number that is not a partner) |

SMS to real numbers costs money. To avoid it while testing consent codes, set `OTP_PROVIDER=console` in `.env` and
restart the API: the code is then printed in the API terminal and shown on the app's code screen. **Partner login
codes always use real SMS** (that goes through Supabase).

### 0.3 Handy tools

- **Supabase SQL editor** (Dashboard → SQL Editor) for the few steps that need to skip time. They are marked **SQL**.
- **Start again:** `npm run reset-test-data -w @hoc/api -- --yes` deletes test partners, leads, sales, commissions and
  payouts, and keeps settings, plans, centres and admin accounts. It prints the database it is about to clear. Never
  use it once real partners exist.
- **Automated tests:** `npm test` (see section 9).

---

## 1. Milestone 1: Foundation and login

| # | Do | Expect |
|---|---|---|
| M1-1 | Open <http://localhost:3000> | Redirected to `/login`: split screen with the logo, "Log in" form |
| M1-2 | Log in with a wrong password | "Email or password is incorrect." |
| M1-3 | Log in as the admin | Overview page: "Good morning/afternoon/evening, <first name>", "You're signed in as an admin", four number cards |
| M1-4 | Log in as the **agent** (other browser) | Same overview, but "an agent" |
| M1-5 | Account page (click your name, bottom of the sidebar): change password to something under 10 characters | The button stays disabled and says how many more characters are needed |
| M1-6 | Change it to a valid new password, log out, log in again with it | Works |
| M1-7 | Log out, then open <http://localhost:3000/partners> directly | Sent to the login page |
| M1-8 | Try to log in to the dashboard with a **partner's** email/password (if you create one in Supabase) | Logged out again with "This account does not have dashboard access" |
| M1-9 | App: enter a mobile number and tap **Send code** | An SMS arrives within seconds; the app shows the 6-digit code screen |
| M1-10 | Enter a wrong code | "That code is wrong or has expired…" |
| M1-11 | Enter the right code | Home: "Welcome to HO Connect… Register your business" (you are logged in but not a partner yet) |
| M1-12 | Tap **Resend code** before 60 seconds | The button is disabled and counts down |
| M1-13 | Force-close the app and reopen it | Still logged in |
| M1-14 | Tap **Log out** | Back to the login screen |
| M1-15 | Enter a number that is not an Indian mobile (e.g. 5xxxxxxxxx, or 9 digits) | "Enter a valid 10-digit mobile number" |

---

## 2. Milestone 2: Partner onboarding

### 2.1 Settings first (admin)

- [ ] **M2-1** Settings → **Partner types**: you see Salon, Beauty parlour, Freelance stylist and Other, each with its
  document list (Salon: Storefront photo, Interior photo (up to 3), PAN card, Bank proof, plus optional ones).
- [ ] **M2-2** Edit a document (e.g. make "GST certificate" required, or change the help text) and save. Open the app's
  registration later to see it change. Change it back afterwards.
- [ ] **M2-3** Add a new partner type, add a document to it, then **Hide from the app**. It disappears from the app's
  registration choices.
- [ ] **M2-4** As the **agent**, open Settings: you can read but there are no edit buttons, and a note says only admins
  can change settings.

### 2.2 Registration (app, Partner 1)

- [ ] **M2-5** Home → **Start registration**. Step 1 of 4, "About your business".
- [ ] **M2-6** Tap **Save and continue** with everything empty: the fields turn red with specific messages.
- [ ] **M2-7** Enter a 5-digit pincode: "Enter a 6-digit pincode". Fix it, choose a state and the nearest experience
  centre (the list is searchable), then save. You move to Step 2.
- [ ] **M2-8** Step 2: enter a wrong PAN like `ABC123` → "Enter a valid PAN, e.g. ABCDE1234F". Enter a valid PAN (type it
  in lower case: it is upper-cased for you).
- [ ] **M2-9** Choose **UPI**, enter `notanupi` → error; then a valid one such as `name@okhdfcbank`.
- [ ] **M2-10** Switch to **Bank account**: enter an account number twice with a typo in the second → "Account numbers
  don't match". Use an IFSC like `HDFC0001234`. Then switch back to UPI if you prefer. Save.
- [ ] **M2-11** Step 3: for **Storefront photo** tap **Take photo** (allow the camera) and take any picture. It shows
  "Uploaded". For **Interior photo** choose **From gallery** and add up to 3. A fourth is refused.
- [ ] **M2-12** Upload a **PDF** for PAN card. Try uploading a renamed text file as an image (rename `a.txt` to
  `a.jpg` and pick it from Files): it is refused ("upload a JPG, PNG, WEBP or PDF file").
- [ ] **M2-13** Tap **Remove** on a file and add another. The old one disappears.
- [ ] **M2-14** Close and reopen the app: Home says "Finish your registration" and **Continue** resumes at the
  first unfinished step.
- [ ] **M2-15** Step 4: the review screen lists a summary with **Edit** links and, if documents are missing, a yellow
  "Before you can submit" box. **Submit application** is disabled until you tick "I have read and agree… (version
  0.1-draft)" and nothing is missing. Tap **Read the terms** to view them.
- [ ] **M2-16** Submit. Home shows "Application under review".

### 2.3 Review (dashboard, admin or agent)

- [ ] **M2-17** Overview: "Awaiting review" shows 1 (highlighted). Click it → Partners → the application is first in
  the queue, with how long it has been waiting.
- [ ] **M2-18** Open it. You see documents with thumbnails (click one to open it full size in a new tab), details,
  tax and payout (masked: `••••••234F`), and an empty activity list.
- [ ] **M2-19** Click **Show full details**: the full PAN and UPI/bank details appear, with a note that this is recorded.
  Check the Activity list later: "Viewed PAN and payout details".
- [ ] **M2-20** **Approve** is greyed out and explains why (documents not reviewed).
- [ ] **M2-21** **Reject** one document without a note: the button stays disabled. Add a note and reject it.
- [ ] **M2-22** Click **Ask for changes**, write a note (at least 5 characters), confirm.
- [ ] **M2-23** App (pull down on Home to refresh): "A few changes needed" with your note. **Update application**
  takes you to the first step; the rejected document shows "Not accepted" with the reviewer's note. Replace it and
  resubmit (the button now says "Resubmit application").
- [ ] **M2-24** Dashboard: **Accept** every document, then **Approve** and confirm. You get "Approved…".
- [ ] **M2-25** App: Home now says "Hello, <name>" with an **Add a lead** button, lead tiles, and your **partner code**
  (`HOC00001`). The first partner gets 00001, the next 00002, and so on.
- [ ] **M2-26** Add some **Internal notes** on the partner's page and save. Confirm the partner never sees them (they
  are only in the dashboard).
- [ ] **M2-27** As the **agent**: the partner page has no Suspend button ("Only admins can suspend partners"). As the
  **admin**: **Suspend partner** with a note, then **Reactivate partner**. In the app, a suspended partner sees
  "Account paused" and cannot add leads.
- [ ] **M2-28** Try registering **Partner 2** the same way, so you have two approved partners. (Tip: to go faster,
  accept all documents and approve straight away.)

---

## 3. Milestone 3: Leads

### 3.1 Add a lead and customer consent

- [ ] **M3-1** App (Partner 1): **Add a lead**. Try submitting with no interest chosen, a bad phone number, and "an
  experience centre" without choosing the centre. Each gives a clear message.
- [ ] **M3-2** Enter the partner's **own** number as the customer: "You can't refer your own mobile number."
- [ ] **M3-3** Add a valid lead using the customer's number. You land on "Ask <name> for the code".
- [ ] **M3-4** The customer receives an SMS with a 6-digit code (or, in console mode, the app shows it on a yellow note).
- [ ] **M3-5** Enter a wrong code: "That code is wrong. 4 tries left." The 5th wrong try says "Send a new
  code", and a 6th attempt says "Too many wrong codes. Send a new code."
- [ ] **M3-6** **Resend code** is disabled for 60 seconds, then works **once**. The second resend is refused ("The code
  can't be sent again…"). The old code stops working after a resend.
- [ ] **M3-7** Enter the correct code. The lead page shows **Confirmed – HO is reviewing** and "Credited to you until
  <date 90 days ahead>".
- [ ] **M3-8** Add a second lead and tap **The customer will confirm later**. My leads lists it under **Waiting**.
- [ ] **M3-9** Try to add the same customer again (same partner): "You already referred this customer (L-0000nn)."
- [ ] **M3-10** Daily limit: Settings → General → "Leads per partner per day": set it to 2, add a third lead
  ("You can add up to 2 leads a day…"), then set it back to 20.

### 3.2 Two partners, one customer

- [ ] **M3-11** Partner 1 adds customer X and confirms. Partner 2 now tries to add customer X: "This customer has
  already been referred to HairOriginals."
- [ ] **M3-12** First-come rule: Partner 1 adds customer Y (does not confirm yet). Partner 2 adds Y too and confirms
  first. Then Partner 1 confirms Y: their lead becomes **Already referred**, and only Partner 2 owns Y.

### 3.3 Verification queue (dashboard)

- [ ] **M3-13** Leads → **To verify** shows confirmed leads, oldest first, with how long each has waited.
- [ ] **M3-14** Open one: the page shows the customer, the partner's note, consent proof (when the code was sent and
  confirmed, attempts, IP address, text version), and other leads with the same phone.
- [ ] **M3-15** Tag one **New customer**, one **Existing contact**, one **Existing customer** (add a DigiCuro
  reference and a note), and one **Invalid**. Each leaves the queue.
- [ ] **M3-16** **Privacy check in the app** (Partner 1): the Existing contact and Existing customer leads both show
  just "Already connected with HO". Nowhere does the app say "existing customer", show the DigiCuro reference, or
  show your internal note. The Invalid one shows "Couldn't verify".

### 3.4 Moving leads along

- [ ] **M3-17** On a verified lead, choose **Consultation booked**: it asks for mode and date/time. Save with no mode:
  the Save button stays disabled. Add mode + time and save.
- [ ] **M3-18** App: the lead shows the booking ("Home trial · 20 Nov, 4:30 pm") and the timeline has the entry.
  Your internal stage note is not visible.
- [ ] **M3-19** Add an internal note on the lead. It appears in the dashboard timeline marked "Internal" and is not
  visible in the app.
- [ ] **M3-20** Try to move an **Awaiting consent** lead: the page says leads can be worked only after consent.
- [ ] **M3-21** **Bulk (selection):** Leads → Open. Tick three leads, choose **In touch**, **Update 3**. A message
  reports how many were updated; skipped ones are listed with the reason.
- [ ] **M3-22** **Bulk (CSV):** Leads → **Update from CSV** → **Download template**. Edit it (see the example below),
  upload. A preview shows each row as *Will update*, *No change* or *Invalid* with a reason. Nothing has changed yet.
  Click **Apply**. Check the leads. Applying the same preview again is refused.

Example CSV (adjust the references to real leads):

```csv
lead_ref,phone,stage,consultation_mode,consultation_at,note
L-000002,,in_touch,,,Spoke to the customer
,9876543210,consultation_booked,ec_visit,2026-11-20 16:30,Booked at Lajpat Nagar
L-999999,,in_touch,,,this row is invalid: no such lead
L-000003,,teleported,,,this row is invalid: not a stage
```

- [ ] **M3-23** Search the leads list by a name, by a phone number, and by `L-000002`.

### 3.5 Expiry

- [ ] **M3-24** **SQL**, then restart the API (it checks at start-up and every 10 minutes):
  `update leads set consent_expires_at = now() - interval '1 minute' where stage = 'awaiting_consent';`
  The waiting leads become **Customer did not confirm**.

---

## 4. Milestone 4: Money

### 4.1 Set rates (admin)

- [ ] **M4-1** Settings → **Commission**. The seeded "Default plan" has three rules at 0%. As the agent you cannot edit.
- [ ] **M4-2** Edit the "any product · new customers" rule: 10%, maximum ₹5,000. Edit "existing customers" to 3%.
- [ ] **M4-3** Add a rule for one category (e.g. a patches category) at 12% for new customers. It reads like a rate
  card ("12% of net value · <category> · new customers").
- [ ] **M4-4** Create a second plan, "Salon pilot", starting today, add a rule, **Assign** it to the Salon partner type.
  Open a salon partner's page: **Commission plan** shows it ("from their partner type"). Give Partner 2 a
  per-partner override and see it change; remove the override.
- [ ] **M4-5** Settings → **Benefits** → New benefit ("Free home trial", customer text, partner text, applies to
  Salon). Add a lead as a salon partner: the Add-a-lead screen shows the dark "TELL YOUR CUSTOMER" box.
  Turn the benefit off and it disappears.
- [ ] **M4-6** Settings → **General**: change "Hold period" to 0 (so commissions are quick to test) and save.
  The note says changes apply to new leads and sales.

### 4.2 Record sales (admin or agent)

- [ ] **M4-7** Open a verified lead that is in a working stage. **Record a sale**: date, optional invoice number,
  two lines (category + net value in ₹). **Preview commission** shows each line's rule and amount, the plan used,
  and the hold-until date. Change a value and the preview resets.
- [ ] **M4-8** Save the sale. The lead becomes **Purchased**. A "Commission pending" appears in the partner app on that lead.
- [ ] **M4-9** Record a second sale on the same lead. The preview says "No commission: This lead already earned its
  commission (first purchase only)", and it still saves.
- [ ] **M4-10** A lead tagged **Existing customer**: the preview shows the reduced rate and a flag "Customer was
  already connected with HO".
- [ ] **M4-11** Tick "linked by hand" on a sale: an extra flag appears.
- [ ] **M4-12** Try a sale dated tomorrow: "The sale date can't be in the future." Try a lead not yet verified:
  "Verify the lead… first."
- [ ] **M4-13** **SQL**, then a lead past its ownership window:
  `update leads set owned_until = now() - interval '1 day' where number = <n>;` then preview a sale: "after the
  ownership window ended".
- [ ] **M4-14** **Privacy check:** in the app, the purchased lead shows the commission amount and status only, never the
  invoice number or sale value.

### 4.3 Approve (admin)

- [ ] **M4-15** Commissions → **On hold** shows new commissions (with hold 0 they move on within 10 minutes; to see it now
  restart the API). They then appear under **Ready to approve**, with the total.
- [ ] **M4-16** As the **agent**, the page lets you look but not approve.
- [ ] **M4-17** As admin, tick several, **Approve**. If any are flagged you are asked to confirm. The partner's app shows
  "approved".
- [ ] **M4-18** Open a commission: you see how it was calculated (plan, rule per line, frozen). Edit the rule in
  Settings afterwards; the old commission does not change.
- [ ] **M4-19** **Adjust** with a reason; the amount changes and (if it was approved) it needs approving again; it is
  flagged "Adjusted". **Reject** one with a reason. **Sale returned** reverses one.
- [ ] **M4-20** Settings → General → turn on **Auto-approve unflagged commissions**; unflagged commissions approve
  themselves after the hold (flagged ones stay for you). Turn it off again.
- [ ] **M4-21** Each commission's History lists who did what.

---

## 5. Milestone 5: Payouts, earnings, QR page, push, reminders

### 5.1 Payouts (admin)

Set up first: have at least two approved partners with approved commissions of ₹500 or more, one partner with less
than ₹500, and (to test the rest) one partner who is suspended.

- [ ] **M5-1** Settings → General → **TDS on payouts**: set 2 (percent) and save. (Check the percentage with finance
  before real use. The default is 0.)
- [ ] **M5-2** Payouts → **Ready to pay** lists each eligible partner with commissions, TDS and net payable, and a
  total. Under **Not in this batch**, partners are listed with a reason (below minimum, suspended, no payout details).
- [ ] **M5-3** As the **agent**: the Payouts page says only admins can manage payouts.
- [ ] **M5-4** **Create batch**. You land on the batch page (status **Draft**).
- [ ] **M5-5** **Download CSV for finance.** Open it in Excel/Sheets. You see one row per partner with code, name, UPI or
  bank details, PAN, gross, reversals, TDS, net, status. Amounts add up. The batch is now **Sent to finance**.
- [ ] **M5-6** Partner app → **Earnings**: the amount shows under **Being paid**, and the payout appears as "Payment in
  progress".
- [ ] **M5-7** Enter a UTR (at least 4 characters) for one partner and **Mark paid**. The partner gets a notification
  (if push is set up), Earnings moves the amount to **Paid to you** and shows "Paid <date> · Ref <UTR>", plus the TDS line.
- [ ] **M5-8** For another, **Failed** with a reason. Its commissions go back to "approved" and appear in Ready to pay again.
- [ ] **M5-9** When no payout is pending, the batch becomes **Completed**.
- [ ] **M5-10** **Cancel batch:** create a new batch and cancel it with a reason. Commissions return to "approved". A
  batch with a paid partner cannot be cancelled.
- [ ] **M5-11** **Returned sale after payment:** open a *paid* commission → **Sale returned**. Create a new batch: that
  partner's row shows the amount under **Reversals**, deducted before TDS.
- [ ] **M5-12** A commission that is in an open payout cannot be reversed: you are told to mark the payout paid or failed first.
- [ ] **M5-13** Partner Earnings → "See how commission is worked out" opens **Your rates**: each rule in plain
  words, customer types in the partner-facing wording, and notes (first purchase only, 90 days, hold, minimum
  payout, TDS).

### 5.2 Customer QR / link page

**Set up for a phone (once).** The customer page is served by the dashboard app, and the customer's phone must be
able to reach both it and the API.

1. Find your computer's address on the Wi-Fi: `ipconfig getifaddr en0` (for example `192.168.1.20`).
2. In `.env` set:
   ```
   PUBLIC_WEB_URL=http://192.168.1.20:3000
   NEXT_PUBLIC_API_URL=http://192.168.1.20:4000
   CORS_ORIGINS=http://localhost:3000,http://192.168.1.20:3000
   ```
3. Restart `npm run dev`. If a phone can't open the page, start the dashboard with
   `npm run dev -w @hoc/dashboard -- -H 0.0.0.0`.

- [ ] **M5-14** App → **My QR and link**: a QR code, your partner code and link. **Share my link** opens the share sheet.
- [ ] **M5-15** Scan the QR with a phone camera (or open the link). The page says "Recommended by <your salon>", shows the
  active benefit if there is one, and a form.
- [ ] **M5-16** Submit with a bad number, no interest chosen, or the agreement box unticked: the **Send me a code** button
  stays disabled / shows an error.
- [ ] **M5-17** Fill it in and submit. An SMS code arrives (or appears in console mode). Enter it. "Thank you, <name>".
- [ ] **M5-18** Partner app: the lead appears under their leads; if push is set up they got "<name> confirmed". Dashboard:
  the lead is in **To verify**, with channel recorded and consent proof (the customer's IP).
- [ ] **M5-19** Open the page again with the same number before confirming: it sends a new code instead of failing; the
  second repeat is refused (resend limit).
- [ ] **M5-20** Submit the partner's own number, or a number another partner already owns: a neutral message ("We couldn't
  start this referral…") and no SMS.
- [ ] **M5-21** A suspended partner's link shows "This link isn't active."
- [ ] **M5-22** Printable poster: app → **Open printable poster** (or `<PUBLIC_WEB_URL>/r/<code>/poster`): a clean page with
  the QR; **Print or save as PDF** hides the button when printing.
- [ ] **M5-23** Limits: from a terminal, post the form 6 times in a minute:
  ```bash
  for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w "%{http_code} " -X POST http://localhost:4000/v1/public/referral/HOC00001/leads \
    -H 'Content-Type: application/json' -d '{"nope":true}'; done
  ```
  The first five say `400`, the sixth `429`.
- [ ] **M5-24** Bot trap: submit the form with the hidden field filled (use the curl below). It looks successful but no SMS is
  sent and no lead appears:
  ```bash
  curl -s -X POST http://localhost:4000/v1/public/referral/HOC00001/leads -H 'Content-Type: application/json' \
    -d '{"customerName":"Bot Test","customerPhone":"9876500000","categoryIds":["<a category id>"],"consent":true,"website":"x"}'
  ```
- [ ] **M5-25** Even with "Require customer OTP" turned off in Settings, the QR page still asks for the code.

### 5.2a AI try-on QR (app and dashboard)

- [ ] **TRY-1** App → **My QR and link** → **AI try-on**: a different QR code, your partner code, and a link starting with
  `https://aitryon.hairoriginals.com/?utm_source=ho_connect&utm_medium=partner_link&utm_campaign=<your code>`.
  **Share try-on link** opens the share sheet with that link.
- [ ] **TRY-2** Scan it with a phone camera: the try-on app opens. In the phone browser's address bar the link has
  `utm_medium=partner_qr` and your code.
- [ ] **TRY-3** **Open printable poster** on the AI try-on tab (or `<PUBLIC_WEB_URL>/r/<code>/tryon-poster`): "At <your salon>",
  the try-on QR, and "Partner <code>" underneath. Scanning the printed poster opens the try-on app.
- [ ] **TRY-4** Dashboard → Partners → an approved partner → **QR codes** card. Both tabs show the same codes as the app.
  **Download PNG** saves a large, sharp image named `<code>-ai-tryon-qr.png` (or `-referral-qr.png`); **SVG** saves a
  vector file; **Copy link** copies the link. The try-on tab lists the UTM tags the CRM will show.
- [ ] **TRY-5** A suspended partner: the card still shows both codes, with a note that they are not active and no poster
  link. A partner who was never approved has no card.
- [ ] **TRY-6** End to end (needs the try-on app change deployed, see LAUNCH.md): in a private browser window, scan the try-on
  QR, sign in to the try-on app with a test number and do one try-on. In DigiCuro, the lead's marketing parameters show
  `utm_source = ho_connect`, `utm_campaign = <code>`, and the note says "referred by HO Connect partner <code>".
- [ ] **TRY-7** Same, but first open an ad-style link in that window (e.g. `https://aitryon.hairoriginals.com/?utm_source=test-ad`),
  then scan the partner QR, then sign in: the CRM still shows the partner, not `test-ad`.

### 5.2b Custom QR codes (dashboard)

- [ ] **QR-1** Run `npm run db:migrate` first (migration 0004 adds the `qr_codes` table), then Dashboard → **QR codes** →
  **New QR code**. Type a name ("Andheri store counter"): the UTM tags fill in (`ho_store`, `qr`, `andheri-store-counter`)
  and the preview shows the QR and the link. Switch the type to Event: `utm_source` becomes `ho_event`.
- [ ] **QR-2** Edit a UTM field: the tags stop following the name; **Use suggested** brings them back. A space in a tag,
  `utm_source = ho_connect`, or "Another web page" with an `http://` address each show a message and disable **Save**.
- [ ] **QR-3** Save: you land on the code's page. **Download PNG** / **SVG** save the file, **Copy link** copies it, and
  **Printable poster** opens an A4 page with the poster label at the top. Scan the QR with a phone: it opens the
  try-on app (or the page) with the tags in the address.
- [ ] **QR-4** Rename it and change the label: saved, the link stays the same. As an agent there is no **Archive**
  button; as an admin, **Archive** moves it to the Archived tab and **Restore** brings it back.
- [ ] **QR-5** Audit log: "Made a QR code", "Renamed or edited a QR code", "Archived…" entries, each linking to the code.

### 5.3 Reminder SMS ("Nudge")

- [ ] **M5-26** Move a lead to **Unreachable** (dashboard). In the app, the lead shows no reminder option yet (no SMS template
  is registered).
- [ ] **M5-27** Register the reminder template (needs a DLT-approved one):
  `npm run message-template -w @hoc/api -- --key customer_nudge --template-id <id> --body "Hi {{customer_name}}, …"`.
  Only `{{customer_name}}` and `{{partner_name}}` are allowed; others are rejected.
- [ ] **M5-28** The lead now shows "HairOriginals couldn't reach <name>" with **Send a reminder**. Tap it: the customer gets the
  SMS, the timeline says "You sent a reminder", and the button is replaced by "You can send another reminder after <date>".
- [ ] **M5-29** After 48 hours (**SQL** to skip: `update lead_events set created_at = now() - interval '3 days' where type = 'nudge_sent';`)
  a second reminder works; a third is refused ("most reminders allowed").

### 5.4 Push notifications

Push needs a phone build that supports it:

1. In `apps/mobile` run `npx eas-cli init`, note the project id, put `EXPO_PUBLIC_EAS_PROJECT_ID=<id>` in `.env`.
2. **Android:** Expo Go no longer supports remote push (SDK 53+), so make a development build
   (`npx eas-cli build --profile development --platform android`; Android needs Firebase credentials).
   **iPhone:** try Expo Go first; if no token appears, use a development build.
3. Restart the app. It asks to allow notifications after login.

- [ ] **M5-30** After login the app asks for notification permission. (In the Supabase SQL editor,
  `select count(*) from push_tokens;` becomes 1.)
- [ ] **M5-31** Triggers: change a lead's stage, have a customer confirm on the QR page, record a sale, approve a commission,
  mark a payout paid, and approve or send back a partner application. Each sends a notification. Lock-screen text shows
  only the masked name ("Priya S.").
- [ ] **M5-32** Tap a notification: the app opens that lead (or the earnings screen).
- [ ] **M5-33** Log out in the app: notifications to that phone stop.

**No device yet?** Set `PUSH_PROVIDER=console` in `.env`, restart the API, and insert a fake token for a partner:

```sql
insert into push_tokens (partner_user_id, token, platform)
select id, 'ExponentPushToken[fake-test-1]', 'android' from partner_users limit 1;
```

Each trigger above then prints `[push:console] <title>: <body>` in the API terminal.

---

## 6. Milestone 6: Reports, audit log, team, privacy, Hindi

### 6.1 Reports (admin or agent)

Put some test data in first: a few leads from two partners at different stages, with one purchase.

- [ ] **M6-1** Reports → **Lead funnel**. Table by partner, sorted by purchases (this is the leaderboard). Columns: Added,
  Confirmed, Verified, Booked, Consulted, Purchased, "Added → bought" %, Commission. A **Total** row sums the table.
- [ ] **M6-2** Switch to **By city** and **By experience centre**: the same leads grouped differently ("Not given" / "No preference"
  appear when nothing was entered). **Download CSV** opens in Excel with the same numbers.
- [ ] **M6-3** Change the dates (or use "Last 7 days"): the numbers change. Pick a future day: "No leads were added in this period".
- [ ] **M6-4** Counts match reality: pick one partner and compare their number with their lead list.
- [ ] **M6-5** **Pilot metrics** tab: active partners, leads per active partner per week, consent rate, new vs "already connected" share,
  lead → purchase %, partners still active after 60 days (shows "No partner has been approved for 60 days yet" at first),
  waiting for verification now (and how long the oldest has waited), time to verify, time to first contact, commissions and
  average commission, paid out, days from sale to payout, and commission totals by status.
- [ ] **M6-6** Cross-check two numbers by hand: consent rate = confirmed ÷ added; time to verify for a lead = when an agent tagged it minus when the customer confirmed.

### 6.2 Audit log (admin only)

- [ ] **M6-7** Audit log (sidebar). Newest first. Every earlier test action is there: partner approvals, document reviews, sales,
  commission approvals, settings changes, payout batches, CSV downloads, "viewed PAN and payout details".
- [ ] **M6-8** Filter **About** = "payout batch"; search `approved`; set a date range. **Details** shows the before and after values.
  Entry links open the partner, lead, commission or batch.
- [ ] **M6-9** As an **agent**, the page says only admins can see the audit log.

### 6.3 Team (admin only)

- [ ] **M6-10** Settings → **Team** lists everyone. Add a new agent with an email you control: a **temporary password** appears once.
  Log in as them in a private window (and change the password under Account).
- [ ] **M6-11** Adding the same email again: "This email is already on the team."
- [ ] **M6-12** **Make admin / Make agent**, and **Deactivate**: a deactivated person is logged out of the dashboard straight away
  (refresh their window: "This account does not have dashboard access"). **Reactivate** brings them back.
- [ ] **M6-13** You can't change or deactivate yourself, and an agent can't open Team.

### 6.4 Customer withdraws consent (admin or agent)

- [ ] **M6-14** Open a lead → **Customer asked us to stop? → Withdraw consent…** → note → confirm. The lead becomes
  "Closed – not interested", and the **name becomes "Withdrawn", the phone "0000000000"**, and city and notes are cleared. The timeline
  keeps an internal note.
- [ ] **M6-15** You can't change that lead's stage, add it to a bulk update, or record a sale on it. A lead that had already **purchased** stays
  "Purchased" and its commission stays on record.
- [ ] **M6-16** In the partner app the lead now shows as "Withdrawn".

### 6.5 Account deletion (app and dashboard)

- [ ] **M6-17** App → **Settings** (top right of Home). Language, Privacy policy link, **Delete my account**, Log out, and the app version.
- [ ] **M6-18** Tap **Delete my account** → confirm. "Your request was sent…" and the button is gone. Dashboard: Overview → "Needs attention" shows
  "1 account deletion requests"; the partner's page has a banner and a **Close account** card.
- [ ] **M6-19** If the partner is still owed commission, **Close account** says to pay or close it first. Otherwise, with a note, it closes:
  their login stops working, documents are deleted, name/email/address removed, while business name, code, PAN, payout details and sales/payouts stay.
- [ ] **M6-20** Log in with a **new number that never registered** → Settings → **Delete my login**: it is deleted at once, and logging in with that number later starts fresh.
- [ ] **M6-21** Public pages open **without logging in**: `<dashboard address>/privacy` and `/delete-account`. Both are marked DRAFT until you replace the text.

### 6.6 Hindi (app)

- [ ] **M6-22** App → Settings → **हिन्दी**. The whole app switches. Walk through login, registration, add lead, my leads, earnings, share, settings: no screen should be half
  English, apart from the exceptions below. Switch back to English; the choice is remembered after closing the app.
- [ ] **M6-23** First install on a phone set to Hindi starts in Hindi.
- [ ] **M6-24** Text fits in buttons and cards and Devanagari letters aren't cut off. **Ask a native speaker to read the wording** and note anything awkward (the list is `apps/mobile/src/i18n/hi.ts`).
- Known exceptions that stay in English: lead stage names you renamed in Settings, notes from the team, the rate card wording, commission lines such as "Commission ₹7,000 pending",
  notification text, SMS texts, and the team's own review notes. The dashboard is English only.

### 6.7 Build, icon and install (needs the steps in LAUNCH.md)

- [ ] **M6-25** A `preview` build installs on a real Android phone, the **icon** and **splash** show the HairOriginals logo, and camera upload works (take a document photo).
- [ ] **M6-26** The phone asks only for **camera** access, never location, contacts, microphone or storage.
- [ ] **M6-27** Push notifications arrive on a build made with the Firebase setup (LAUNCH.md section 4).

---

## 7. Who can do what (check each cell)

| Action | Admin | Agent | Partner (approved) | Public |
|---|---|---|---|---|
| Log in to the dashboard | ✓ | ✓ | ✗ | ✗ |
| Approve / reject / ask changes on a partner | ✓ | ✓ | ✗ | ✗ |
| Suspend / reactivate a partner | ✓ | ✗ | ✗ | ✗ |
| See full PAN and bank details | ✓ | ✓ (audited) | ✗ | ✗ |
| Verify leads, change stages, record sales | ✓ | ✓ | ✗ | ✗ |
| Approve / adjust / reject / reverse commissions | ✓ | ✗ | ✗ | ✗ |
| Change plans, rules, benefits, settings | ✓ | ✗ | ✗ | ✗ |
| Add or deactivate dashboard users, read the audit log, close accounts | ✓ | ✗ | ✗ | ✗ |
| See reports; withdraw a customer's consent | ✓ | ✓ | ✗ | ✗ |
| Create payout batches, download the CSV, record UTRs | ✓ | ✗ | ✗ | ✗ |
| Add leads, see own leads, earnings, rates, QR | ✗ | ✗ | ✓ | ✗ |
| See the customer's real name or full phone | ✓ | ✓ | ✗ (masked) | ✗ |
| Open a QR page and confirm by code | ✗ | ✗ | ✗ | ✓ |

## 8. Privacy checks (do these once)

- [ ] A partner sees customers as "Priya S." and "98XXXXX210" everywhere (list, detail, earnings, notifications).
- [ ] A partner never sees: the customer's full name or phone, the DigiCuro reference, internal notes, agent names,
  invoice numbers, sale values, or the words "existing customer".
- [ ] A partner cannot open another partner's lead (try changing the id in a saved link: "Lead not found").
- [ ] Documents are viewable only from the dashboard through links that expire in 10 minutes; the storage bucket is private
  (paste a document's link after 10 minutes: it no longer opens).
- [ ] PAN and bank details are encrypted in the database (`select pan_encrypted from partners;` shows `v1.…`).
- [ ] The CSV download is recorded: `select action, created_at from audit_log where action like 'payout_batch.%';`

## 9. Security quick checks

```bash
# No login → 401
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/v1/admin/partners
# The public (anon) key inside the apps must not be able to read any table. Take the URL and key from .env.
# Expect an empty list `[]` or a permission error, and never any partner data:
curl -s "https://<your-project-ref>.supabase.co/rest/v1/partners?select=*" -H "apikey: <SUPABASE_ANON_KEY>"
```

## 10. Automated tests

```bash
npm test             # shared rules, API unit tests, the SMS hook (no database needed)
npm run typecheck
```

The integration suites (partners, leads, commissions, payouts, referral/push, reports/privacy) need a throwaway local Postgres. They
**wipe it**, and refuse to run against anything that is not on your own computer:

```bash
PG=/opt/homebrew/opt/postgresql@18/bin
$PG/initdb -D /tmp/hoc-pg -U postgres --auth=trust -E UTF8
$PG/pg_ctl -D /tmp/hoc-pg -o "-p 54329 -k /tmp -c listen_addresses=127.0.0.1" -l /tmp/hoc-pg.log start
$PG/createdb -h 127.0.0.1 -p 54329 -U postgres hoc_test
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54329/hoc_test npm test
$PG/pg_ctl -D /tmp/hoc-pg stop
```

## 11. Known gaps (not bugs)

- Editing legal text and the Experience Centres has no screen yet (LAUNCH.md has the SQL), the dashboard is English only, and the Play Store steps need your Google account (LAUNCH.md).
- The **partner terms and customer consent text are still draft placeholders** (version 0.1-draft): replace them with
  legally reviewed text before real partners or customers see them.
- The consent SMS currently uses the AI try-on template ("…HairOriginals-AiTryOn verification code… Do not share it with
  anyone"). Register a consent-specific template and switch with `npm run message-template`.
- TDS defaults to 0%; confirm the rate and thresholds with finance.
- The public QR page has no CAPTCHA yet (see the README before a public launch).
- No automatic CRM/ERP connection: agents check DigiCuro by hand (phase 2).
