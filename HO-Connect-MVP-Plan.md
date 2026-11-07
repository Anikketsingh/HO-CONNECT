# HO Connect: MVP Plan
*Partner lead-generation app for HairOriginals · Draft v0.3 · 2026-11-01*

Builds on `HairOriginals-company-context.md`. Tags used below:
- **[Decide]**: still needs a business answer.
- **[Confirm]**: needs an answer from a vendor or internal team.

---

## 0. Decisions so far

| # | Topic | Decision (2026-11-01) |
|---|---|---|
| 1 | Commission | **Fully configurable from the dashboard**: rates, flat or %, by category, by partner type, per-partner overrides |
| 2 | Customer referral benefit | **Configurable from the dashboard** (none, trial-fee waiver, discount, etc.) |
| 3 | Customer already known to HO | The partner is told. The lead **still earns commission** if the customer buys, but at a **lower, configurable rate**, and the commission is **flagged in the dashboard** for review |
| 4 | What earns commission | **First purchase only** for now; repeat purchases to be decided later |
| 5 | Who can be a partner | **Anyone HO approves**: salons, parlours, freelancers, others |
| 6 | Partner approval | **Manual, by an HO agent in the dashboard**, after checking uploaded evidence and documents |
| 7 | Integrations | DigiCuro provides **both the CRM and the ERP** and will provide webhooks, but **those come in a later phase**. The **MVP is run from the dashboard** |
| 8 | Build and stack | Built by you. **React Native** app, **Next.js** dashboard, **separate backend**, **Postgres on Supabase** |
| 9 | Customer consent | **Customer OTP is in the MVP** |
| 10 | CRM in the MVP | **No connection to DigiCuro at all.** Agents work from the dashboard; any CRM reference is typed in by hand |
| 11 | Dashboard roles | **Two roles: Admin and Agent** |
| 12 | Bulk updates | **Bulk stage update is in the MVP** (select several leads in the list, or upload a CSV) |
| 13 | Hosting | Free to use Supabase, Railway, Render or AWS (section 12) |
| 14 | Shopify | Later |
| 15 | Brand | Taken from hairoriginals.com and the theme code (section 17) |
| 16 | SMS provider | **Nimbus** (DLT sender `HAIROG`), connected to Supabase Auth through the *Send SMS* hook, the same set-up as the AI try-on project. The API will use the same Nimbus account for the customer consent OTP |

---

## 1. The idea, and what decides whether it works

Salons see people with thinning hair, bald patches, or a wish for more length and volume every day, and they have no product for them. HairOriginals does. **HO Connect turns any approved partner into a referral channel.** They register, get verified, enter an interested customer in under a minute, follow the lead, and earn commission when the customer makes their first purchase.

| Risk | How the plan handles it |
|---|---|
| Fake or junk leads | Customer confirms by OTP; an agent verifies each lead; flagged commissions need manual approval |
| Disputes over who owns a lead | Written ownership rules (section 6); every manual decision is in the audit log |
| Sales happen offline and go unseen | MVP: an agent records each sale in the dashboard. Phase 2: DigiCuro ERP webhooks |
| Partner loses interest before the first payout | Clear stage updates, a visible rate card, monthly payouts, and an optional first-conversion bonus (configurable) |
| CRM or EC staff ignore partner leads | Partner leads get their own queue and SLA; internal teams get credit for converting them |

---

## 2. Design principles

1. **Customer consent locks the lead.** A lead counts only after the customer confirms by OTP or a WhatsApp tap. This covers consent under the DPDP Act, stops fake numbers, and fixes the attribution timestamp. It can be switched off in Settings if the SMS provider isn't ready at launch.
2. **Run it from the dashboard first, automate later.** Every step that an integration will eventually do (checking the CRM, updating stages, recording sales) is a dashboard action in the MVP. Phase 2 replaces those actions with DigiCuro webhooks; the data model stays the same.
3. **Configure, don't hard-code.** Commission rates, referral benefits, ownership window, hold period, categories, centres, document checklists and labels are all dashboard settings.
4. **Snapshot what was used.** Each commission records the rule it was calculated from, and each lead records the benefit it was offered. Changing a setting never rewrites past money.
5. **The phone number is the join key.** Normalise every number to 10 digits (`^[6-9]\d{9}$`).
6. **The partner sees the stage, not the story.** Masked customer details; no CRM notes, invoice or product details.
7. **Adding a lead takes 30 seconds.** Three required fields.
8. **Separate domain and app.** Nothing goes on hairoriginals.com.

---

## 3. Who uses what

| Surface | Users | Purpose |
|---|---|---|
| **HO Connect app** (React Native) | Partner owner (MVP); partner staff (Phase 2) | Register and upload documents, add leads, follow progress, see earnings, share their QR code |
| **Dashboard** (Next.js) | See roles below | Approvals, lead operations, sales, commissions, payouts, settings |
| **Public landing page** (`/p/<partner-code>`) | Referred customers | Self-referral through the QR code or link, with consent |
| **Backend API** | — | All business logic: attribution, masking, commission engine, audit |

**Dashboard roles**

| Role | Can do |
|---|---|
| **Admin** | Everything an agent can do, plus Settings (commission plans, benefits, master data, labels, legal texts), approving commissions, payouts, managing dashboard users, and the audit log |
| **Agent** | Review and approve partner applications, work the verification queue, tag customer type, update stages (one at a time or in bulk), record sales |

More roles (Finance, Centre manager) can be added later; roles are stored as data, not hard-coded screens.

---

## 4. MVP flow (run from the dashboard)

```
 Partner app                    HO Connect (API + dashboard)                    HO teams / systems
 ───────────                    ────────────────────────────                    ──────────────────
 1. Add lead ─────────────────► validate, normalise phone, dedupe
                                customer OTP via SMS / WhatsApp ─────────────►  customer confirms
 2. "Confirmed" ◄────────────── lead enters the Verification queue
                                agent looks up the phone in DigiCuro, tags:     agent ⇄ DigiCuro CRM
                                New / Existing contact / Existing customer      (by hand, no system
                                optional CRM reference typed in by hand          connection in the MVP)
 3. Stage updates ◄──────────── agent updates stage (one at a time or bulk) ◄─  CRM team works the lead
 4. "Purchased" ◄────────────── agent records the sale → commission calculated  sale shows in DigiCuro
                                from the active rules; flagged if existing       ERP / Shopify
 5. Paid ◄───────────────────── admin approves → payout batch → UTR ────────►  bank / UPI
```

**Phase 2:** DigiCuro CRM and ERP webhooks replace the agent steps in 2, 3 and 4. The partner app doesn't change.

---

## 5. Getting customers in (capture channels)

| # | Channel | How it works | Phase |
|---|---|---|---|
| 1 | **Assisted entry + OTP** | Partner enters name, phone and interest; the customer reads out the OTP | **MVP** |
| 2 | **Partner QR code** | Standee or mirror sticker. The customer scans, fills in their details, confirms by OTP; the lead is credited to the partner automatically | **MVP** |
| 3 | **Share link** | Same page as the QR code, shared on WhatsApp or Status | **MVP** |
| 4 | **Partner code at purchase** | Per-partner code that the customer quotes online or at an EC | Phase 2 |
| 5 | **Book on the spot** | Book the EC slot or home trial from the app | Phase 2 |
| 6 | **Walk-in claim** | Customer at an EC says a salon sent them; the partner and the customer confirm | Phase 2 |

**What makes the customer follow through:**
- **A referral benefit**, set up in the dashboard (section 8.2). It appears on the landing page, in the consent message, and in the partner app ("Tell your customer: free home trial").
- **Instant WhatsApp or SMS confirmation** to the customer, naming the partner and the benefit.
- **Speed-to-lead:** the verification queue shows how long each lead has waited; target same-day contact.
- **Nudge:** when a lead is "unreachable", the partner can send the customer a templated reminder from HO.

---

## 6. Lead ownership and existing customers

### 6.1 Customer types (tagged by an agent in the MVP; automatic in Phase 2)

| Type | Meaning | Commission | Partner sees (label editable in Settings) |
|---|---|---|---|
| **New** | Not in the CRM | Standard rate | "New customer for HO" |
| **Existing contact** | In the CRM but has never bought | Reduced rate (configurable) | "Already connected with HO" |
| **Existing customer** | Has bought from HO before | Reduced rate (configurable) | "Already connected with HO" |
| **Invalid** | Wrong number, test, or spam | None | "Couldn't verify" |

**Privacy note on decision 3.** Telling a partner that someone *has bought* from HO discloses that person's purchase history (wigs, patches, hair-loss products) to a third party. So the default partner-facing label is the neutral **"Already connected with HO"** for both existing types, and it appears **only after the customer has confirmed by OTP**. The dashboard still keeps the two types separate for commission rates and reporting. You can change the wording in Settings.

### 6.2 Ownership rules (all values configurable)

| Situation | Rule |
|---|---|
| Customer confirms consent | Partner owns the lead for the **ownership window** (default 90 days) |
| Customer type is Existing contact or Existing customer | Still owned and eligible; commission uses the reduced rate and is **flagged for manual approval** |
| Two partners submit the same number | First confirmed consent wins; the second sees "Already referred" |
| Customer doesn't confirm within 72 hours | Lead expires; the partner can resend once |
| First purchase happens within the window | Commissionable (one sale per lead in the MVP) |
| Purchase after the window ends | No commission |
| Partner's own number, family, HO staff | Blocked or flagged |
| Customer buys using another number | An agent links the sale manually, with a logged reason |

---

## 7. What the partner sees

| Stage in the app | Set by (MVP) |
|---|---|
| ⏳ Waiting for customer confirmation | System |
| ✅ Confirmed: HO is reviewing | System (after OTP) |
| 🏷 New customer / Already connected with HO / Couldn't verify | Agent (verification) |
| 📞 HO team in touch | Agent |
| 📅 Consultation booked: EC visit / Home trial / Video, with date | Agent |
| 💇 Consultation done | Agent |
| 🎉 Purchased: commission ₹X pending | Agent records the sale |
| 💰 Commission approved → Paid | Admin |
| 📵 Couldn't reach customer: **[Nudge]** | Agent |
| ✖ Closed: not interested | Agent |

**Customer display:** first name and last initial, masked phone (`98XXXXX210`). No export.
**Never shown:** CRM notes, agent names, address, products bought, invoice value, health context.
**Stage names** shown to partners can be edited in Settings.

---

## 8. Everything the dashboard configures

### 8.1 Commission engine

**Commission plans.** A plan is a named set of rules with start and end dates (e.g. "Standard", "Pilot – Delhi NCR"). A plan can be assigned at three levels, and the most specific one applies: **partner**, then **partner type**, then **default**.

**Rules inside a plan.** Each rule matches on:
- product category (or "any")
- customer type (New / Existing contact / Existing customer)

and gives:
- rate type: % of net value, or flat ₹
- rate value
- optional minimum and maximum (cap)
- priority (when two rules match)

**How a commission is calculated when an agent records a sale:**
1. **Eligibility:** the lead is owned, the sale date is inside the window, and there's no earlier commissionable sale on this lead (first purchase only).
2. **Plan:** take the partner's plan that was in effect on the sale date.
3. **Lines:** a sale can have several lines (category and net value, excluding GST and the trial fee). Each line is matched to its rule.
4. **Amount:** apply the rate (or flat amount), clamp to the minimum and maximum, then add up the lines.
5. **Snapshot:** save the plan, rule, rate and inputs on the commission entry.
6. **Flag** it for manual approval if the customer type isn't New, an agent overrode anything, or the sale was linked by hand.
7. **Lifecycle:** `Pending` → *hold period* → `Approvable` → `Approved` (by an admin, or automatically for unflagged entries if that setting is on) → `In payout` → `Paid` (with UTR). A refund or return sets it to `Reversed`, netted against the next payout.

### 8.2 Referral benefits (for the customer)
Each benefit has:
- **Type:** none / waive home-trial fee / % off / flat ₹ off / free add-on / custom
- **Value**
- **Applies to:** categories, cities, partner types
- **Active dates**
- **Wording shown to the customer**

The matching benefit is **saved on the lead when it's created** and shown on the landing page, in the consent message, in the partner app and in the agent's view. **In the MVP, the CRM or EC team applies it by hand.** Phase 2 adds automatic codes.

### 8.3 Other settings and master data

| Setting | Default |
|---|---|
| Ownership window | 90 days |
| Require customer OTP | On |
| Consent link expiry / resend limit | 72 hours / 1 resend |
| Hold period before approval | 30 days |
| Commissionable sales per lead | 1 |
| Auto-approve unflagged commissions after the hold | Off for the pilot |
| Minimum payout amount and payout cycle | e.g. ₹500, monthly |
| Leads per partner per day | e.g. 20 |
| Partner-facing labels (customer types, stages) | Section 6.1 / 7 |

**Master data managed in the dashboard:**
- product categories and products (used in the lead form and commission rules)
- Experience Centres (for "preferred EC")
- partner types
- **document checklist per partner type**
- rejection reasons
- message templates
- versioned T&C and consent text

**Document checklist per partner type** (an example; you edit it):

| Partner type | Required | Optional |
|---|---|---|
| Salon / Parlour | Storefront photo, interior photo, PAN, bank proof (cancelled cheque or passbook) | GST certificate, shop licence or Udyam, business card |
| Freelancer | PAN, bank proof, a portfolio photo or social link | GST |
| Other | Set by HO | — |

**Don't collect full Aadhaar numbers.** The Aadhaar Act restricts storing them; if ID proof is needed, accept masked Aadhaar or another ID.

---

## 9. Integration with the HO ecosystem

| System | MVP (run from the dashboard) | Later phases |
|---|---|---|
| **DigiCuro CRM** | **No system connection.** Agent looks the customer up by phone, tags their type, and can type in a CRM reference | Lead push, webhooks for stage changes, phone-lookup API to tag customer type automatically |
| **DigiCuro ERP** | Agent records the sale from the ERP or POS invoice | Invoice and return webhooks match sales automatically and reverse commissions |
| **Shopify** (online orders) | Agent records the sale | Webhooks and per-partner codes, unless the ERP already covers online orders **[Confirm]** |
| **SMS / WhatsApp** | Partner login OTP, customer consent OTP, confirmation and nudge messages | Partner notifications on WhatsApp |
| **Booking engine / EC appointment endpoint** | — | Book from the app |
| **B2B Partnership form** (CRM campaign `b2b-partnership`) | Agent sends those people an invite link | — |

**Phase 2 CRM push** (for reference; not built in the MVP). Uses the existing capture API and needs a server key from DigiCuro:

```json
{
  "site_key": "<server key issued for HO Connect>",
  "name": "Priya Sharma",
  "phone": "+919876543210",
  "city": "Gurugram",
  "pin_code": "122002",
  "message": "source: HO Connect | partner_code: HOC-GGN042 | partner_name: Glow Salon | partner_lead_id: L-000123 | preferred_ec: Gurugram | interests: Scalp topper | benefit: Free home trial | consent: OTP 2026-11-01T10:22:00+05:30",
  "utm_source": "ho_connect",
  "utm_medium": "partner",
  "utm_campaign": "HO Connect - Gurugram"
}
```

---

## 10. MVP scope

### Partner app (React Native, Expo)
- Phone OTP login; English and Hindi
- **Registration:** partner type, business details, address and pincode with a map pin, **document uploads following the checklist for that partner type**, bank or UPI, PAN, accept T&C. Ends on an "Under review" screen, then shows Approved, Rejected or "Changes requested" with the agent's comment and a way to re-upload.
- **Home:** earnings (pending / approved / paid), leads by stage, **Add lead**
- **Add lead:** name\*, phone\*, interest category\*, pincode/city, preference (EC chosen from the list / home trial / video / let HO decide), notes. Shows the active customer benefit. Then the consent OTP.
- **My leads:** list and filters, a timeline per lead, Nudge
- **Earnings:** commission entries and payouts
- **Rate card:** the partner's current commission rules in plain language
- **My QR and link:** printable poster, share on WhatsApp
- Push notifications on stage changes

### Dashboard (Next.js)
- **Partner applications:** queue → documents viewer with zoom and the map pin → checklist tick-offs → Approve (partner code, plan, home EC) / Reject (reason) / Request changes (comment). Suspend and reactivate.
- **Partners:** profile, documents, leads, earnings, plan override, notes
- **Verification queue:** confirmed leads waiting for review, oldest first, with waiting time. Tag the customer type; optionally type in a CRM reference.
- **Leads:** all leads, filters, stage updates, timeline, link a sale
- **Bulk stage update**, two ways:
  1. **In the list:** select several leads, choose a stage (plus consultation date or note if needed), and apply.
  2. **CSV upload:** columns `lead_ref` (or `phone`), `stage`, and optional `consultation_mode`, `consultation_at`, `note`. A **preview** shows each row as valid, invalid (with the reason) or no change before anything is applied. Every run is saved with its results and appears in the audit log. A downloadable template is provided.
- **Record sale:** sale lines (category and net value), invoice no., date. Shows the commission with the rule that was applied **before saving**.
- **Commissions:** list of pending, flagged and approvable entries; approve, adjust with a reason, or reverse
- **Payouts:** create a monthly batch → CSV for finance → mark paid with UTR
- **Settings:** plans and rules, benefits, global settings, categories and products, centres, partner types and document checklists, labels, templates, T&C and consent versions
- **Reports:** funnel by partner, city and EC; leaderboard; verification wait time
- **Audit log;** admin users and roles

### Backend
- REST API with zod validation; Supabase JWT verification; role checks
- Customer consent OTP service (separate from partner login)
- Commission engine and snapshots; scheduled jobs (consent expiry, holds becoming approvable)
- Signed upload and view URLs for documents
- Push notification sending
- Public endpoints for the QR landing page (rate-limited, with a honeypot)

### Not in the MVP
Webhooks for CRM, ERP or Shopify; automatic customer-type lookup; booking from the app; staff sub-accounts; repeat-purchase commission; automated payouts; tiers.

---

## 11. Phases and milestones

### Phase 0: Groundwork (≈1–2 weeks, alongside M1)
- Legal: partner T&C and customer consent text
- First commission plan values and the first referral benefit (entered as settings, not code)
- Document checklist per partner type
- SMS: **Nimbus** (decided). Partner login reuses the existing DLT OTP template. Register on the DLT portal: (a) an HO Connect OTP template if the SMS should not say "AiTryOn", and (b) a **customer consent** template naming the partner and the purpose (needed for M2). WhatsApp provider still to decide
- Supabase project (Mumbai region), Google Play Console account under Krisoriginals Pvt Ltd, domain (e.g. `connect.hairoriginals.com`)
- Brand assets for the app

### Phase 1: MVP build (solo, ≈10–12 weeks)
| Milestone | Weeks | Deliverable |
|---|---|---|
| **M1 Foundation** ✓ built | 1–2 | Monorepo, Supabase, database schema and migrations, API skeleton, partner OTP login, admin login and roles |
| **M2 Onboarding** ✓ built | 3–4 | Registration with document uploads → approval queue in the dashboard → partner code; settings for partner types and checklists |
| **M3 Leads** ✓ built | 5–6 | Add lead, consent OTP, verification queue, customer-type tagging, stage updates, partner lead list and timeline |
| **M4 Money** ✓ built | 7–8 | Settings for commission plans and rules and for benefits; record sale → commission with snapshot; flags; approvals |
| **M5 Payouts and reach** ✓ built | 9–10 | Payout batches and CSV, earnings screen, push notifications, QR and link landing page, rate card |
| **M6 Launch** ✓ built (see LAUNCH.md for what remains) | 11–12 | Reports, audit log, Hindi, QA, Play Store internal testing track, onboarding the pilot |

**Exit:** one pilot partner can complete the whole loop (register → approved → lead → consent → verified → stages → sale → commission → paid) using only the app and the dashboard.

### Phase 1.5: Pilot (≈4–6 weeks)
15–25 partners in Delhi NCR. Tune the settings each week and track the metrics in section 15.

### Phase 2: Connect DigiCuro (≈6–8 weeks)
- CRM webhooks for stage changes; phone-lookup API to tag customer type automatically
- ERP invoice and return webhooks match sales and reverse commissions automatically
- Lead push to the CRM through the capture API
- Book an EC appointment or home trial from the app
- Staff sub-accounts; walk-in claim flow
- Repeat-purchase commission (rules already allow more than one sale per lead)

### Phase 3: Scale and grow
Tiers and contests, learning hub, marketing kit, automated payouts (RazorpayX / Cashfree), TDS certificates, a bonus when a partner refers another partner, new partner types (clinics, makeup artists), and a model where trained salons fit and maintain HO products.

---

## 12. Architecture and stack

```
 ┌──────────────────┐   ┌───────────────────────────────┐
 │ apps/mobile      │   │ apps/dashboard (Next.js)      │
 │ React Native     │   │  /admin/*   staff only        │
 │ (Expo)           │   │  /p/[code]  public QR page    │
 └────────┬─────────┘   └───────────────┬───────────────┘
          │  Supabase Auth (login only)  │
          └──────────────┬───────────────┘
                         ▼  REST + JWT
              ┌──────────────────────────┐
              │ apps/api (Node + TS)     │  Fastify + zod · Drizzle ORM
              │ attribution · masking ·  │  pg-boss (Postgres job queue)
              │ commission · audit       │  Expo push · SMS/WhatsApp provider
              └────────────┬─────────────┘
                           ▼
              ┌──────────────────────────┐
              │ Supabase                 │  Postgres · Auth · Storage (private)
              │ (Mumbai region)          │  RLS on, deny-all for client keys
              └──────────────────────────┘
                           ▲
            Phase 2: DigiCuro CRM / ERP webhooks → apps/api
```

**Key decisions**
- **Separate API, and the apps don't read tables directly.** The app and dashboard use Supabase only to log in, then call the API with the JWT. Masking, attribution and commission logic live in one place you can test, and the DigiCuro webhooks will arrive at the same service later. As a second layer of protection, RLS is enabled with no client policies, so the anon key in the app bundle can read nothing.
- **Supabase is used for:** Postgres, Auth (partners: phone OTP, sent through Nimbus by the `send-sms` Edge Function on the *Send SMS* auth hook; admins: email or Google), Storage (private `partner-documents` bucket, signed URLs).
- **Customer consent OTP is not Supabase Auth.** Customers aren't users. The API generates the OTP, stores it hashed, and sends it.
- **Migrations come from one place:** Drizzle (`drizzle-kit`). Don't change the schema in the Supabase UI.
- **Jobs:** pg-boss runs on the same Postgres, so no Redis is needed.
- **Mobile:** Expo with EAS Build, Expo Router, TanStack Query, react-hook-form and zod, i18next (English and Hindi), Expo Notifications. Android first; the same code builds for iOS.
- **Dashboard:** Next.js App Router, shadcn/ui, TanStack Table.
- **Hosting (decided):**
  - **Supabase** in Mumbai (ap-south-1): database, auth, storage
  - **Railway**: API and dashboard as two services from the same repository, in the Singapore region (the closest Railway region to India)
  - **EAS Build** for the app
  - The API is shipped as a container (Dockerfile), so it can move to AWS Mumbai (ECS Fargate) later without code changes if the Singapore↔Mumbai round trip becomes noticeable.

**Repository layout (npm workspaces + Turborepo)**
```
ho-connect/
├─ apps/
│  ├─ mobile/        # Expo partner app
│  ├─ dashboard/     # Next.js admin + public /p/[code]
│  └─ api/           # Fastify backend
├─ packages/
│  ├─ shared/        # zod schemas, types, enums (stages, customer types), phone utils
│  ├─ db/            # Drizzle schema, migrations, seed
│  └─ config/        # eslint, tsconfig presets
└─ supabase/         # local dev config (supabase start), storage policies
```

---

## 13. Core data model

| Table | Key fields |
|---|---|
| `partners` | id, code, partner_type_id, business_name, owner_name, phone, address, city, pincode, lat/lng, home_centre_id, status (draft / submitted / changes_requested / approved / rejected / suspended), plan_override_id, pan, gstin, payout_method (encrypted), agreement_version, reviewed_by/at, review_note |
| `partner_users` | id, partner_id, auth_user_id, phone, name, role (owner / staff) |
| `partner_types` | id, name, active |
| `document_types` | id, partner_type_id, name, required, accepted_formats |
| `partner_documents` | id, partner_id, document_type_id, storage_key, status (pending / accepted / rejected), reviewer_note |
| `leads` | id, partner_id, created_by, channel (assisted / qr / link), customer_name, phone, city, pincode, category_ids[], preferred_mode, preferred_centre_id, notes, consent_status, consent_at, customer_type (new / existing_contact / existing_customer / invalid), verified_by/at, owned_until, benefit_snapshot (jsonb), crm_status (not_entered / entered / pushed), partner_stage |
| `consent_records` | lead_id, method, consent_text_version, otp_hash, verified_at, ip, device |
| `lead_events` | lead_id, actor (system / admin / partner), from_stage, to_stage, note, occurred_at |
| `sales` | id, lead_id, source (manual / erp / shopify), invoice_no, sale_date, entered_by, status (active / returned / cancelled) |
| `sale_lines` | sale_id, category_id, net_value |
| `commission_plans` | id, name, effective_from, effective_to, status |
| `commission_rules` | plan_id, category_id (null = any), customer_type, rate_type (pct / flat), rate_value, min_amount, max_amount, priority |
| `plan_assignments` | plan_id, scope (default / partner_type / partner), scope_id |
| `commission_entries` | id, partner_id, lead_id, sale_id, amount, rule_snapshot (jsonb), flagged, flag_reasons[], status, hold_until, approved_by/at, adjustment, adjustment_reason |
| `payouts`, `payout_items` | batch period, partner, gross, tds, net, status, utr, paid_at |
| `referral_benefits` | id, name, type, value, category_ids[], cities[], partner_type_ids[], customer_text, active_from/to |
| `product_categories`, `products`, `centres` | master data |
| `settings` | key, value (jsonb), updated_by/at, with history |
| `admin_users` | auth_user_id, name, email, role (admin / agent), active |
| `audit_log` | actor, entity, entity_id, action, before, after, reason, at |
| `push_tokens`, `message_log` | notifications |

---

## 14. Fraud, privacy and compliance

- **Fraud:**
  - customer OTP
  - document review before approval
  - daily lead limit per partner
  - partner, family and staff numbers blocked
  - flagged commissions need manual approval
  - every override is audited
  - watch for partners whose leads keep turning out to be "Already connected"; this is the main way to game decision 3
- **Privacy (DPDP Act 2023):**
  - versioned consent text, logged with a timestamp
  - partners see the minimum
  - neutral "Already connected" label
  - customer can withdraw consent
  - PAN and bank details encrypted
  - documents in a private bucket, viewed through short-lived signed URLs
  - retention policy
  - no full Aadhaar
- **Tax** **[Confirm with finance]:** TDS on commission under Section 194H (so PAN is required); GST invoices from GST-registered partners. The payout record holds gross, TDS and net.

---

## 15. Pilot success metrics

| Metric | Why it matters |
|---|---|
| Active partners (at least one lead a week) | Is the habit forming? |
| Leads per active partner per week | Volume potential |
| Consent rate | Lead quality and friction |
| Verification wait time; time to first contact | Ops capacity in the MVP |
| Share of New vs "Already connected" leads | Real new demand vs. recycled leads |
| Purchase conversion vs. ad leads | Is a referred lead warmer? |
| Commission per sale vs. ad cost per acquisition | The business case |
| Days from sale to payout; partner retention after 60 days | Partner trust |

---

## 16. Open questions (remaining)

1. **DLT templates:** partner OTPs currently go out on the AI try-on template ("Your HairOriginals-AiTryOn verification code is …"). Register an HO Connect wording? And the customer consent template (M2) needs registering. WhatsApp provider for notifications is still open.
2. **Shopify:** do online orders flow into the DigiCuro ERP? (Deferred.)
3. **Logo master files:** marketing's original files (AI/PDF), a white version for dark backgrounds, and a square mark for the app icon.

---

## 17. Brand

Taken from hairoriginals.com (the live logo on the Shopify CDN) and the theme code (`config/settings_data.json`, `snippets/asa-ec-base-css.liquid`, `assets/asa-ec-logo.svg`).

**Logo**
- Vector version: `assets/asa-ec-logo.svg` in the theme (500×500 canvas). "HAIR" is in rose `#B9585B`, "originals" is a black script, with an ® mark.
- The live site header uses a **150×83 px PNG** with a rose-gold gradient. That is too small for app icons or splash screens, so use the SVG.
- Still needed from marketing: a reversed version for dark backgrounds, and a square mark for the app icon.

**Colours.** HO Connect uses the palette of the newer EC landing pages, anchored on the logo's rose:

| Token | Hex | Use |
|---|---|---|
| `rose-logo` | `#B9585B` | Logo, small accents |
| `rose` | `#905254` | **Primary buttons and links** (≈6:1 contrast with white text) |
| `rose-deep` | `#7A4346` | Pressed / hover state |
| `espresso` | `#1F1613` | Dark surfaces, headers |
| `ink` | `#2A2124` | Body text |
| `muted` | `#6B5F5C` | Secondary text |
| `brass` | `#C9A24A` | Earnings and money highlights (decorative, not for text on white) |
| `brass-soft` | `#E9D7A6` | Badges, highlights |
| `blush` | `#F7EFEC` | Cards, secondary background |
| `paper` | `#FFFCFA` | App background |
| `line` | `#E8DDD8` | Borders, dividers |
| `sage` | `#5F9585` | Success / "converted" (from the main site) |
| `whatsapp` | `#178A48` | WhatsApp actions |
| `error` | `#B3261E` | Errors |

The main site's copper button colour `#D18E6C` has only ≈2.7:1 contrast with white text, so it fails accessibility guidelines. HO Connect uses it for decoration only, never as a button background.

**Typography**
- **Figtree** for UI and **Bodoni Moda** for display moments (splash, onboarding titles), the same pair as the EC landing pages. Both are free Google Fonts.
- **Noto Sans Devanagari** for Hindi text, because Figtree has no Devanagari characters.
- For reference, the main site uses Jost and Geometric 415. Geometric 415 is a Shopify-licensed font and can't be used outside Shopify.

**Feel:** warm and premium. Paper and blush backgrounds, rose for actions, brass for money, generous spacing.
