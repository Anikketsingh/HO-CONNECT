---
name: affiliate-lead-app
description: "User is planning an affiliate/partner lead-gen app for HairOriginals (salons punch leads, earn commission), to connect to CRM + ERP; context doc written 2026-11-01"
metadata:
  node_type: memory
  type: project
  originSessionId: b99911d9-7fc0-4230-9d3f-b733736e4348
  modified: 2026-10-31T20:33:25.922Z
---

Started 2026-11-01. The user is building an affiliate lead-generation app: non-HO salons and parties submit interested customers as leads in an app, track lead progress, and earn commission when the customer buys. It will connect to the CRM (DigiCuro, `api-dccrm.digicuro.app`) and an ERP (not yet identified). The theme repo is only the reference for company context; the app itself is separate.

A full company/systems context doc was written to the Claude scratchpad as `HairOriginals-company-context.md` (session-specific, may be gone). It covers funnels, 16 EC locations, lead payloads (DigiCuro capture/web, hairoriginals4u.com leads API), attribution, risks, and 14 open questions (commission basis, attribution window, CRM/ERP APIs, partner field in CRM).

**Why:** the user said rules for that task were read-only, no code changes in the theme.
**How to apply:** when asked about the affiliate app, start from the open questions (CRM webhooks/custom field, ERP identity, commission rules); phone number is the practical join key across CRM/Shopify/ERP; don't build on the public site_key. See [[ec-landing-pages]] for the EC lead flow.
