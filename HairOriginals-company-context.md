# HairOriginals — Company & Systems Context
*For building the Affiliate / Partner Lead-Generation App*

Source: read-only analysis of the official-site Shopify theme (`/Users/anikket.singh/Desktop/HairOriginals /Newtheme`), the two files in its root (`Script to send the leads.docx`, `locations HO.xlsx`), and saved project notes. Nothing was modified.

**How to read this.** Each statement is one of:
- **[Code]**: seen directly in the theme code or the two root files.
- **[Inferred]**: a reasonable conclusion from the code, not confirmed.
- **[Unknown]**: not in this codebase; needs an answer from you or the CRM / ERP teams.

Section 12 lists the unknowns. Section 11 is the proposed shape of the affiliate app.

---

## 1. Company at a glance

| | |
|---|---|
| Brand | HairOriginals (also written "Hair Originals") |
| Legal entity | **Krisoriginals Private Limited**, a Pvt. Ltd. company established **2018**, headquartered in **Gurgaon, Haryana** [Code: `sections/create-about.liquid`] |
| Founder | Jitendra, an IIT alumnus [Code] |
| What it sells | Premium **100% human Remy hair** products made from Indian hair: extensions, toppers, wigs, men's patches, accessories [Code] |
| Positioning | "One-stop solution for premium Indian Remy hair products"; organised supply chain, end-to-end quality control; ethical sourcing story (temple-donated hair) [Code] |
| Credibility claims on site | "Featured & Funded in **Shark Tank India**" (S1, with a feature in S2); celebrity endorsements (Tejasswi Prakash, Avneet Kaur, Sudha Chandra and others); press logos [Code] |
| Customer-count claims | Two conflicting claims: "1,57,791 happy customers" (partnership page) and "Trusted by 10M+ customers" (booking-engine page) [Code] |
| Business model | Hybrid: D2C e-commerce, **Experience Centres** (own retail studios), **Home Trial** (stylist visits the customer), **video consultation** [Code] |
| Core promise | "Try before you buy", easy returns, free COD, EMI / Buy-Now-Pay-Later, delivery in 5–7 days [Code: homepage] |
| Website | https://www.hairoriginals.com, Shopify store `hoindiacl.myshopify.com` [Code + notes] |
| Social | Instagram `@hairoriginals`, Facebook `/hairoriginals`, YouTube `@hairoriginals.` [Code: theme settings] |
| Main phone numbers | Home Trial line **8700797103** (shown site-wide in the announcement bar); each Experience Centre has its own number (section 4) [Code] |

**Why this matters for your app.** HairOriginals is a *consultative, high-ticket, try-first* purchase. The customer rarely buys on first touch. They book a home trial or a centre visit, and the sale usually closes **offline or on a call**. So "did the lead buy?" can't be answered from Shopify alone. This is the central design problem for the commission engine.

---

## 2. Product catalogue

The catalogue and prices live in Shopify admin, not in the theme. The theme has **64 product templates** (`templates/product.*.json`), which show the range.

| Family | Examples (from template names) |
|---|---|
| **Clip-in extensions (DIY)** | 3 / 4 / 5 / 7-piece clip sets, one-clip extension, ear-to-ear clip sets, halo extensions, highlighted sets, butterfly volumiser |
| **Volume / styling add-ons** | Volumizers, ponytails, around-ponytail, buns (hot-knot bun, messy bun, donut bun, curly top-knot), bangs, streaks, kids streaks, scrunchies and bows |
| **Hair-loss solutions (women)** | Scalp toppers (small, wavy, lace, black/brown variants), half-head wig, silk-based wigs, chemo wigs |
| **Men's patch** | Men patch, invisible patch, side patches, forehead patch, thick patch, frontline, U-shaped patches |
| **Permanent extensions** | Permanent hair extensions, nano; sold via consultation and trial, not direct checkout [Code: dedicated lead flow] |
| **Tools and essentials** | Hair fibre, powder, customize-length products |

Homepage category tiles: DIY Hair Extensions · Hair Loss Solution · Men's Patch · Kids Range · Permanent Hair Extensions · Hair Accessories · Tools & Essentials.
Collections referenced in the theme: `scalp-topper-1`, `men-patch`, `shop-for-women`, `permanent-hair-extensions`, `wigs`, `side-patches`.

**Commercial note for commission design.** Price points vary widely: accessories sell for hundreds of rupees, while permanent extensions and patches are likely high-ticket [Inferred]. A commission model should probably be **category-aware**. [Unknown: actual prices and margins.]

---

## 3. How customers reach a purchase (the funnels)

All of these produce leads that end up in the CRM. The affiliate app is effectively a **new lead source** feeding the same pipeline.

### 3.1 Home Trial / "Try at Home" (the highest-volume funnel)
- **Pages:** `/pages/try-at-home-new` (live), plus `try-at-home-women`, `try-men-patch-home`, `permanent-trail`. There is also a redesign in progress: `templates/page.asa-try-at-home.liquid` [Code + notes].
- **Flow:** customer picks product, city, name and phone, then picks date and time slot (a booking cut-off applies, 3 hours before the slot), enters address and pincode, then pays.
- **Pricing in code:** **₹299 online** (redirects to a Shopify checkout for a "trial fee" product) or **₹349 cash on delivery**. Some code branches reference "premium cities" with a ₹399 COD price, but they are placeholders ("Test City 1/2") [Code].
- **Rules:** the 7–10 AM slots are blocked in some cities (Mumbai, Chandigarh, Kolkata, Jaipur, Ahmedabad, Lucknow) [notes].
- **Service cities:** loaded from a Shopify app proxy `/apps/enquiries-store?type=Cart Product` (it returned 404 on 2026-10-29, so the page falls back to a hard-coded list). Delhi NCR, Mumbai, Bengaluru, Hyderabad, Pune, Kolkata and others appear in different forms [Code].
- **Implication:** a home-trial fee order in Shopify is **not a product sale**. Exclude it from commissionable revenue, but treat it as a strong "converted to trial" milestone.

### 3.2 Experience Centre (EC) visit
- 16 centre pages for ads (`asa-<slug>-ht`) plus a store list and a city page for Bengaluru; an appointment booking page (`appointment-booking`) posting to the CRM `ec-appointment` endpoint. See sections 4 and 6.
- Free consultation. The customer walks in, tries products, buys at the centre (POS or ERP, not in this repo) [Inferred].
- Ad offer in current code: **"Festive 50% off + extra 10% for online registration"**, with a per-phone code `HO10-XXXXX` (deterministic hash of the phone number). The 10% code is hidden in the UI because the redemption flow isn't ready (as of 2026-10-12) but is still sent to the sheet and CRM [Code + notes].

### 3.3 Video consultation / Live shopping
- `video-call` page and the **Popin** widget ("Shop on Video Call" floating button, site-wide). Leads go to the leads API and CRM (campaign `video-call`). A Popin "captured" event fires a Meta `CompleteRegistration` [Code].

### 3.4 Online store purchase
- Standard Shopify cart and checkout, with **GoKwik** (one-click checkout / Buy-Now), **Snapmint** (EMI / BNPL), COD, and Judge.me reviews. Zecpe is installed but commented out in the layout [Code].

### 3.5 Lead-capture-only pages
- Permanent Extensions, Men Patch, India lead-gen, hair-extensions-studio-in-delhi, Mumbai lead, Get-in-Touch, Contact, exit-intent popup, enquiry popup, festive consultation. Each is a form that posts a lead and does not take payment [Code].

### 3.6 Existing partner / B2B touchpoint (important)
- `templates/page.b2b-partnership.json` / `sections/B2B-partnership.liquid`: **"HairOriginals' Partnership Program: Start Your Beauty Business – Become a Freelance Sales Partner"**. It's a simple form (name, phone, city: Delhi NCR, Mumbai, Bangalore, Pune, Hyderabad, Kolkata). A second variant in `India-lead.liquid` posts with CRM campaign `b2b-partnership` [Code].
- So a **partner-recruitment lead already exists** as a CRM campaign, but there is **no partner portal, no partner IDs, no commission tracking** in this codebase [Code: confirmed by search].

---

## 4. Experience Centre network

Single source of truth in code: `snippets/asa-ec-locations.liquid` (pipe-delimited), mirrored in `locations HO.xlsx`. **16 centres:**

| Slug | City / Region | Address (abridged) | Call no. | WhatsApp |
|---|---|---|---|---|
| rajouri | Rajouri Garden — Delhi NCR | Main Market, Rajouri Garden Marg, Delhi 110027 | 9599299215 | 9217660385 |
| gurgaon | Gurugram — Delhi NCR | Golf Course Rd, Sector 42, Gurgaon 122002 | 9289585882 | 9217660385 |
| noida | Noida — Delhi NCR | Wave One Mall, Sector 18 (moved 2026-10-29 from Dharam Palace) | 9217845417 | 7428121414 |
| preet-vihar | Preet Vihar — Delhi NCR | Vikas Marg, Shankar Vihar, Delhi 110092 | 9266070696 | 9217660385 |
| andheri | Andheri — Mumbai | Andheri Link Rd, D.N. Nagar 400053 | 9910566091 | 9217660385 |
| chembur | Chembur — Mumbai | Tilak Nagar 400089 | 9599299218 | 9599299218 |
| hyderabad | Gachibowli — Hyderabad | Bio Diversity, Rai Durg 500032 | 9289300618 | 9289300618 |
| jayanagar | Jayanagar — Bengaluru | 10th Main Rd, 4th T Block 560041 | 9724156704 | 9217660385 |
| hsr-layout | HSR Layout — Bengaluru | 27th Main, Sector 1, 560102 | 9266070695 | 9217660385 |
| koramangala | Koramangala — Bengaluru | 6th Block 560095 | 9266070693 | 9217660385 |
| lucknow | Lucknow | Shalimar Eldee Plaza, Faizabad Rd 226016 | 8448638666 | 7428121414 |
| chandigarh | New Chandigarh | Eco City 1, Mullanpur 140901 | 8448638666 | 7428121414 |
| jaipur | Jaipur | Raja Park, Panchwati Circle 302004 | 8448638666 | 7428121414 |
| ahmedabad | Ahmedabad | Atlanta Tower, C.G. Road 380006 | 8796401775 | 7428121414 |
| kolkata | Kolkata | City Centre 2, Rajarhat 700161 | 7042600563 | 7042600563 |
| agra | Agra | Fatehabad Rd, Tajganj 282001 | 7428281179 | 7428121414 |

Plus one **city-group page**, `bengaluru` (Jayanagar + HSR Layout + Koramangala), where the customer must pick a centre.

**Data inconsistencies to be aware of** (they matter for partner-to-centre mapping):
- The **homepage / experience-centers templates list additional centres** that have no EC ad page: **Dehradun, Pune (Koregaon Park), Mumbai East (Mulund), Mathura, Nirman Vihar (Delhi), an older Lucknow address (Vinod Plaza)**. So the real network may be larger than 16, or those entries are stale. [Unknown which.]
- **Phone numbers differ** between the homepage and the EC data for the same city (for example Noida, Jaipur, Chandigarh, Lucknow). The EC data file is the more recently maintained source [Inferred].
- Several centres share one calling number (8448638666 serves Lucknow, Chandigarh and Jaipur), so a number alone is not a unique centre key.
- The legacy live ad pages live at `ebo.hairoriginals.com/af/<slug>.html`. [Unknown: what "ebo" and "af" stand for, and whether it's a separate system.]
- The FAQ page template still contains leftover placeholder text ("Zest Shop", `support@zest.com`).

**Recommendation:** treat a **centre master table** (id, name, city, region, address, phone, owner, active flag) as a first-class entity in the affiliate app and reconcile it with the CRM and ERP. Do not scrape the website.

---

## 5. Technology landscape (what exists today)

### 5.1 The website
- **Platform:** Shopify, an Online Store 2.0 theme (heavily customised; ~126 sections, ~184 snippets, ~166 templates, 52 locale files). Currency INR, market India only [Code].
- **Page builders / apps in the theme:** EComposer (`index.ecomposer`), PagePilot (`pp-*` sections), Pify form-builder (legacy forms), Foxecom (theme docs references).
- **Shopify app proxy:** `/apps/enquiries-store`. It serves city and product lists and also accepts enquiry submissions via GET query-string (`sendEnquiry()` in `layout/theme.liquid`). It is an in-house or third-party Shopify app [Inferred].

### 5.2 Third-party and internal services referenced in code

| Service | Purpose | Evidence |
|---|---|---|
| **DigiCuro CRM ("DCCRM")** `api-dccrm.digicuro.app` | **The CRM.** Receives almost every lead. | 21 call sites |
| **Leads API** `hairoriginals4u.com/api/v1/leads` | In-house lead store. Rich JSON schema (section 6.2). Likely the backend feeding ops and ERP [Inferred]. | try-at-home, permanent, men-patch, video-call, lead-gen |
| **Booking engine** `booking.hairoriginals.com` + `api.hairoriginals.com/v1` | Separate app for home-trial bookings ("ht-engine"), reached by redirect with query params. Not in this repo. | `theme.liquid`, `assets/booking.js` |
| **AI Try-On** `aitryon.hairoriginals.com` | Virtual try-on tool; linked from the homepage and EC pages. EC pages pass the lead's details to it. | `asa-ec-page`, `top-icon` |
| **Google Apps Script web-apps → Google Sheets** | Lead logging from EC pages, `home-trial`, `shop-live`. | 3 distinct script URLs |
| **QuickReply.ai** webhook | WhatsApp automation / follow-up for home-trial leads. | `assets/home-trial.js` |
| **Nector** | Loyalty, rewards and **referral** programme (`page.nector-referral`, `page.nector-rewards`, widget keyed to the Shopify customer id). | templates + snippets |
| **GoKwik** | Fast checkout and Buy-Now | snippets |
| **Snapmint** | EMI / BNPL | `theme.liquid` |
| **Popin** | Video-call shopping widget | `theme.liquid` |
| **Judge.me** | Product reviews | theme settings |
| **Analytics / ads** | GA4 `G-G8BRSCD1H0`, Google Ads `AW-11060162727`, GTM `GTM-NP8NQKNC`, Meta Pixels `1494486658175791` (primary) and `335388045245175`, Microsoft Clarity | `theme.liquid`, `asa-ec-tracking` |

### 5.3 What is **not** in this repo (but you'll integrate with)
- The **DigiCuro CRM** itself: pipeline stages, owners, disposition codes, user roles, APIs beyond `capture`.
- The **ERP**: stock, centre POS, invoicing, returns. No ERP endpoint is referenced anywhere in the theme.
- Shopify orders and customers (admin data), and the **commission-relevant sales data**.
- The leads API server (`hairoriginals4u.com`) and the booking engine server.

---

## 6. How leads are captured today

### 6.1 DigiCuro CRM capture API (the standard path)

Defined in the leads-script document and reused everywhere.

```
POST https://api-dccrm.digicuro.app/v1/crm/capture/web
Content-Type: text/plain          // simple CORS request, no preflight; server parses JSON anyway
```
```json
{
  "site_key": "hocap_TQvuXM_OD5Xcpj5HrsBJ2Zz91zwh_rud",   // public capture key; required domain: https://www.hairoriginals.com
  "name": "...",      // required with phone
  "phone": "+91XXXXXXXXXX",
  "email": null,      // optional
  "city": "...",      // optional
  "pin_code": "...",  // optional (used by the global capture script)
  "message": "...",   // free text; ALL extra attributes are packed here as "key: value | key: value"
  "company": "...",   // optional (also used by the global script as a honeypot)
  "utm_source": "...", "utm_medium": "...", "utm_campaign": "<campaign label>",
  "landing_url": "...", "referrer": "..."
}
```
Key facts [Code]:
- The `site_key` is a **client-side capture key tied to the hairoriginals.com domain**. It is *not* a secret and not suitable for partner authentication. The instruction says the domain must be https://www.hairoriginals.com. [Unknown: whether it can be used from a separate partner-app domain. Ask DigiCuro.]
- `utm_campaign` is the **primary classification field** in the CRM. Examples in use: `try-at-home-new`, `permanent-extensions-new`, `men-patch-new`, `video-call`, `india-lead-gen`, `b2b-partnership`, `contact`, `get-in-touch`, `Enquiry Form`, `EC ASA - <Centre>`, `Experience Center Appointment Booking`.
- **There is no dedicated `partner_id` / `referrer_code` field**. Extra data is packed into `message`. The documented rule: *"if you have any extra keys, send them in the message key in the same format given in the example."*
- The CRM **merges leads on phone or email** (the global capture script comments say the Shopify customers/* webhook lead and the form lead "merge on email/phone into a single lead"). So **phone number is the practical identity key**, and duplicates are expected and handled.
- A second endpoint exists: `…/v1/crm/capture/ec-appointment` (header `X-Site-Key`), taking `{id, name, phone_number, location, address, date, time_slot, consultation_fee, source, created_at}` for centre appointments.
- The global capture script in `theme.liquid` auto-captures *any* storefront form with a phone or email, skipping cart, checkout and search forms. It includes a honeypot and tags `message` with "Form: … · Page: …".

### 6.2 Leads API (richer, in-house)

```
POST https://hairoriginals4u.com/api/v1/leads      Content-Type: application/json
```
```json
{
  "name": "", "phone": "", "city": "", "pincode": "",
  "formType": "Try at Home | Try at Home - Booking | ...",
  "source": "shopify_SLP | shopify_SLP_EC | Shopify",
  "pageType": "try_at_home_HT | permanent_extensions_ct | permanent_extensions_ct_EC | men_patch_new | India_lead_gen | Video-Call-SLP-VC",
  "preferredProducts": ["<product name>"], "productId": "...",
  "utm_source": "", "utm_medium": "", "utm_campaign": "", "utm_term": "", "utm_content": "",
  "specificDetails": { "addressLine1": "", "booking_date": "", "booking_time": "", "payment": "online Rs299|offline Rs349" }
}
```
This is the **natural model for a partner-sourced lead**. It already has `source` and `pageType` discriminators, so a partner source such as `source: "partner_app"` plus a partner id in `specificDetails` would fit. [Unknown: whether the API server accepts or stores unknown keys, and whether it requires auth.]

### 6.3 Attribution already tracked on the site
- **Cookies (30 days):** `utm_source`, `lead_source` (from utm_source or `gad_source`), `campaign_id` (from utm_campaign), set in `theme.liquid`.
- **localStorage `ho_attr` (30 days)** on EC pages: utm_*, fbclid, gclid, gbraid, wbraid, campaign_id, adset_id, ad_id, placement, site_source_name, first landing URL, referrer. Also `_fbc` / `_fbp` cookies.
- **Offer code:** `HO10-XXXXX`, a deterministic hash of the phone number (the same phone always gives the same code across forms). **This is a ready-made pattern for a phone-keyed reference.**

> Lesson for the affiliate app: attribution to a *partner* does not exist today. The site only knows ad channels. Everything about partners must be created new, and the cleanest join key to existing systems is the **normalised 10-digit Indian mobile number**.

### 6.4 Conversion tracking caution (only if partner pages live on hairoriginals.com)
Meta Pixel `1494486658175791` has Event Setup Tool click rules keyed to button text: "request callback" / "submit" / "proceed to confirm" → StartTrial; "register" → Schedule; "book free video consultation" → Lead; `tel:8700797103` → Contact; `/pages/thank-you` → Lead. Any new page on the main domain would accidentally fire these. A **separate domain / app** avoids this [notes].

---

## 7. Customer journey and where a sale actually happens

```
Ad / organic / (NEW) partner referral
        │
        ▼
Lead form  ──►  DigiCuro CRM (+ Leads API, Google Sheet, QuickReply WhatsApp)
        │
        ▼
Call-centre / WhatsApp follow-up  ──►  qualifies, books:
        ├── Home Trial (₹299/₹349 trial fee)  → stylist visit → quote → order
        ├── Experience Centre visit (free)    → in-store purchase (POS/ERP)
        └── Video consultation                → link / order
        │
        ▼
Purchase: Shopify order (online / COD / EMI)   OR   centre invoice (ERP)
```
- **Sales cycle:** days to weeks, multiple touchpoints [Inferred].
- **Where the "buy" is recorded:** Shopify orders (online, trials and COD); centre sales in ERP/POS (not visible here); CRM stage or disposition. **The partner app must listen to all three** or it will under-report conversions.

---

## 8. Existing patterns worth reusing

1. **Phone-keyed identity.** The CRM merges on phone; the offer code is derived from phone.
2. **Packed `message` convention** for extra attributes (`key: value | key: value`).
3. **Campaign naming** `EC ASA - <Centre>` in CRM. A partner convention like `PARTNER - <partner_code>` would sit naturally next to it.
4. **Centre routing**: `leadCenter()` assigns a lead to a centre (campaign, sheet row and call number follow the centre). Partners will need the same: *which centre serves this lead's city?*
5. **Validation**: Indian mobile regex `^[6-9]\d{9}$`, name regex `^[a-zA-Z\s\.]{2,50}$`, honeypot fields (`company` / `website` / `url`).
6. **Dedupe behaviour**: the CRM already merges; the site's lead-sending code never blocks duplicates itself.
7. **Nector referral widget** exists for *consumer* referrals (customer refers a friend). It is a different audience from salons and partners but a precedent for "reward on referral".

---

## 9. Your concept, restated in this company's terms

**Affiliate salons and parties** (non-HO salons, plus possibly HO Experience Centres acting as referrers) use an **app** to **punch in interested customers as leads**, then **track the progress** of each lead. If the customer buys, the partner earns a **commission on the purchase or profit**.

Mapped onto the existing stack:

| Your app function | Existing system it plugs into | Gap |
|---|---|---|
| Partner submits a lead | DigiCuro `capture/web` and/or Leads API (`source = partner`) | Needs a partner identifier carried through (not supported natively) |
| De-duplication / ownership | CRM merges on phone/email | Needs a rule for "who owns this lead" when ad-sourced and partner-sourced collide |
| Lead progress visible to partner | CRM stages / dispositions | Need CRM read API or webhooks (not in this repo) |
| "Customer bought" signal | Shopify orders, ERP invoices, CRM won-stage | Need an order-to-lead match (phone) and a trusted source of truth |
| Commission calculation | ERP (price, margin, returns) | Need rules; returns and cancellations must reverse commission |
| Payout | ERP / finance | Entirely new |
| Partner onboarding / KYC | Only a basic B2B form exists | Entirely new |

---

## 10. Risks and design constraints discovered

1. **Public capture key.** `site_key` is embedded in public pages, so it can be copied by anyone. A partner app must authenticate partners itself (login or OTP) and submit through a **server-side** integration, not from the browser with this key. Fraudulent or fake leads are a real risk when money is attached.
2. **Lead ownership disputes.** Customers reach HO through ads, WhatsApp, walk-ins and now partners. Without a written rule (first-touch? within N days? last-touch?), disputes with partners are certain. The site's own attribution window is **30 days**, a reasonable default to mirror.
3. **Offline conversions.** Centre purchases happen in ERP/POS, so a pure Shopify integration would miss many sales.
4. **Trial fee vs product sale.** ₹299/₹349 trial orders pass through Shopify but are not product revenue.
5. **Returns / cancellations / COD refusals.** Returns exist ("easy returns", a returns-and-refunds page, the FAQ says orders can be modified within 2 hours). Commission needs a **holding period and clawback** rule.
6. **Customer privacy.** Partners will enter customers' phone numbers. The app should capture **consent** (the site already has a cookie banner and an age-verifier popup) and comply with India's DPDP Act (2023) [Inferred requirement].
7. **No dedicated partner field in the CRM.** Packing into `message` works but is fragile for reporting. Ask DigiCuro for a custom field or lead-source value.
8. **Tracking collisions** if built on hairoriginals.com (section 6.4).
9. **Inconsistent master data** (centre list, phone numbers, claims). Fix it before using it as app reference data.
10. **Store changes are visible live.** Theme pushes can go live (see the project notes). A separate app avoids touching the production storefront.

---

## 11. Suggested shape of the affiliate app (a starting proposal, not a decision)

**Actors:** Partner (salon / individual / EC acting as referrer), Partner admin (owner of a salon with staff), HO Admin / Partnerships team, Finance, CRM agents, Centre manager.

**Core entities (minimum):**
- `Partner` (id, code, type, business name, owner, phone, city, status, KYC, bank/UPI, commission plan, created_by/recruited via B2B form)
- `PartnerUser` (login, role)
- `Lead` (id, partner_id, customer name, **normalised phone**, city/pincode, interest/product category, centre assigned, consent flag, status, duplicate flag, crm_lead_id, created_at)
- `LeadEvent` (status history: Submitted → Accepted/Duplicate/Rejected → Contacted → Trial/Visit booked → Visited → Quote → **Purchased** / Lost)
- `Order` / `Sale` (source: Shopify | ERP; order id; amount; items; category; date; returned flag; linked lead_id)
- `CommissionRule` (category, %, flat, caps, holding days)
- `CommissionLedger` (sale_id, partner_id, amount, status: pending / approved / paid / reversed)
- `Payout`
- `Centre` (the master table in section 4)

**Integration points:**
1. **Lead out:** the app (server-side) → DigiCuro `capture/web` (and the Leads API if confirmed). Set `utm_campaign = "PARTNER - <code>"`, pack `partner_id`, `partner_lead_id` and `referral_code` into `message`, and use `source = "partner_app"` in the Leads API.
2. **Status in:** CRM webhook or polling → `LeadEvent`. [Needs a CRM API or webhook. Ask DigiCuro.]
3. **Sale in:** Shopify `orders/paid` and `orders/cancelled` and `refunds/create` webhooks, matched to leads by phone; ERP invoice feed for centre sales; CRM "won" status as a fallback.
4. **Centre routing:** city or pincode → centre, using the centre master.
5. **Notifications:** WhatsApp (QuickReply is already used) for partner updates.
6. **Reporting:** partner dashboard (leads, conversions, pending / approved / paid commission); admin dashboard (partner funnel, fraud flags).

**Suggested rules to decide (section 12):** attribution window (start from 30 days); duplicate rule; commission basis (revenue vs margin); holding period for returns; category-based rates; whether a partner can self-refer.

---

## 12. Open questions (answer these before building)

**Business**
1. Commission on **revenue or profit**, flat or tiered, by category? Any caps? Different rates for salons vs EC referrers?
2. Attribution window, and the rule when a lead already exists in the CRM (reject, share, first-touch-wins)?
3. Is the **₹299/₹349 home-trial fee** commissionable or excluded? Is a booked trial a paid milestone?
4. Return / cancellation policy for commission clawback. How long is the holding period?
5. Who are partners: independent salons only, or also freelance sales partners (the existing "Partnership Program" page) and EC-network referrers?
6. Payout method and cadence (UPI / bank, monthly?), TDS / GST handling, KYC requirements.

**Technical**
7. **DigiCuro CRM:** does it expose APIs or webhooks for lead status, stage changes and owner? Can it add a `partner_id` custom field or a lead-source value? Does the `site_key` work from a non-hairoriginals.com domain, or can we get a partner-specific key?
8. **ERP:** which ERP is it (name, version, API)? Does centre POS data carry the customer's phone number, so a sale can be matched to a lead?
9. **Leads API (`hairoriginals4u.com`):** who owns it, what's its auth model, what does it feed (ERP? ops dashboard?), and does it accept extra fields?
10. **Booking engine** (`booking.hairoriginals.com`, `api.hairoriginals.com/v1`): is its API documented, and would partner-booked trials go through it?
11. **Shopify:** custom app / admin API access for order and customer webhooks? Are there multiple stores?
12. What are `ebo.hairoriginals.com/af/*` pages, and are they connected to any affiliate ("af") idea that already exists?
13. Which centres exist today (16 on EC pages versus the extra ones on the homepage)? Who owns the centre master data?
14. Platform for the app: web (PWA) or native mobile? Partner staff likely use phones.

---

## 13. Reference: where things live in the codebase

| Need | Path |
|---|---|
| Lead script spec (DigiCuro) | `Script to send the leads.docx` |
| Centre master (sheet) | `locations HO.xlsx` |
| Centre master (code) | `snippets/asa-ec-locations.liquid` |
| EC ad page logic (CRM, sheet, tracking, offers) | `snippets/asa-ec-page.liquid` (+ `asa-ec-tracking`, `asa-ec-toast`, `asa-ec-base-css`) |
| Global form to CRM capture, UTM cookies, Shopify wiring | `layout/theme.liquid` |
| Home Trial booking logic and pricing | `sections/try-at-home-new-bookx.liquid` |
| Home Trial redesign (dry-run) | `templates/page.asa-try-at-home.liquid` |
| Centre appointment booking | `sections/appointment-booking.liquid` |
| Partnership / B2B form | `sections/B2B-partnership.liquid`, `sections/India-lead.liquid` |
| Other lead forms | `sections/permanent-extensions-new.liquid`, `men-patch-new`, `video-call`, `Lead-Gen-india`, `get-touch`, `contact-design`, `exit-intent-popup`, `festive-consultation` |
| Booking engine client | `assets/booking.js`, `sections/booking-engine*.liquid` |
| WhatsApp automation | `assets/home-trial.js` (QuickReply webhook) |
| Loyalty / referral | `templates/page.nector-*.liquid`, `snippets/nectorcustom_*.liquid` |
| Company story | `sections/create-about.liquid`, `templates/page.our-story.json` |
| Product templates | `templates/product.*.json` (64) |

*Generated 2026-11-01 from a read-only review. Verify live behaviour (especially endpoints and the CRM / leads API contracts) before relying on any [Inferred] item.*
