-- Row Level Security: ON for every table, with NO policies.
-- Apps never read tables directly; all data goes through the API, which connects as the
-- table owner and is not affected by RLS. The anon/authenticated keys therefore see nothing.
ALTER TABLE "public"."admin_users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."centres" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."product_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."document_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."partner_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."partner_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."partner_users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."partners" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."consent_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."lead_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."referral_benefits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."commission_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."commission_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."commission_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."payout_batches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."payouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."plan_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."sale_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."sales" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."bulk_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."legal_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."message_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."message_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."push_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Private bucket for partner KYC documents (Supabase only; skipped on plain Postgres).
-- Uploads and downloads use short-lived signed URLs issued by the API.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'partner-documents',
      'partner-documents',
      false,
      10485760,
      ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
