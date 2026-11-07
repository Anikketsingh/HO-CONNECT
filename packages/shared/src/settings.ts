import { z } from 'zod';
import { CUSTOMER_TYPES, LEAD_STAGES, type CustomerType, type LeadStage } from './enums';
import { DEFAULT_CUSTOMER_TYPE_LABELS, DEFAULT_STAGE_LABELS } from './stages';

/**
 * Global settings, editable by admins in the dashboard.
 * Stored one row per key in the `settings` table (value = JSON).
 */
export const settingsSchema = z.object({
  /** How long a partner owns a lead after the customer confirms. */
  ownership_window_days: z.number().int().min(1).max(730),
  /** Customer must confirm by OTP before the lead counts. */
  require_customer_otp: z.boolean(),
  /** OTP / consent link validity. */
  consent_expiry_hours: z.number().int().min(1).max(720),
  /** How many times a partner can resend the consent OTP for one lead. */
  consent_max_resends: z.number().int().min(0).max(5),
  /** Days a commission waits (returns window) before it becomes approvable. */
  hold_days: z.number().int().min(0).max(365),
  /** 1 = first purchase only. */
  commissionable_sales_per_lead: z.number().int().min(1).max(100),
  /** Approve unflagged commissions automatically when the hold ends. */
  auto_approve_unflagged: z.boolean(),
  /** Minimum balance before a partner is included in a payout batch (paise). */
  min_payout_paise: z.number().int().min(0),
  /** Anti-abuse limit. */
  max_leads_per_partner_per_day: z.number().int().min(1).max(1000),
  /** TDS deducted from payouts, in basis points (200 = 2%). Confirm the rate with finance. */
  tds_bps: z.number().int().min(0).max(3000),
  /** Cap on customers who can start a referral through the public QR / link page per day, across all partners. */
  max_public_leads_per_day: z.number().int().min(1).max(10000),
  /** Partner-facing label overrides; any label not overridden falls back to the default. */
  stage_labels: z.partialRecord(z.enum(LEAD_STAGES), z.string().min(1).max(80)),
  customer_type_labels: z.partialRecord(z.enum(CUSTOMER_TYPES), z.string().min(1).max(80)),
});

/** Resolved settings: label maps are always complete after merging with the defaults. */
export type Settings = Omit<z.infer<typeof settingsSchema>, 'stage_labels' | 'customer_type_labels'> & {
  stage_labels: Record<LeadStage, string>;
  customer_type_labels: Record<CustomerType, string>;
};
export type SettingKey = keyof Settings;

export const DEFAULT_SETTINGS: Settings = {
  ownership_window_days: 90,
  require_customer_otp: true,
  consent_expiry_hours: 72,
  consent_max_resends: 1,
  hold_days: 30,
  commissionable_sales_per_lead: 1,
  auto_approve_unflagged: false,
  min_payout_paise: 50_000, // ₹500
  max_leads_per_partner_per_day: 20,
  tds_bps: 0,
  max_public_leads_per_day: 200,
  stage_labels: DEFAULT_STAGE_LABELS,
  customer_type_labels: DEFAULT_CUSTOMER_TYPE_LABELS,
};

/** Merges stored rows over the defaults, ignoring unknown or invalid keys. */
export function resolveSettings(rows: ReadonlyArray<{ key: string; value: unknown }>): Settings {
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const { key, value } of rows) {
    if (!(key in settingsSchema.shape)) continue;
    const field = settingsSchema.shape[key as SettingKey];
    const parsed = field.safeParse(value);
    if (!parsed.success) continue;
    merged[key] =
      key === 'stage_labels' || key === 'customer_type_labels'
        ? { ...(DEFAULT_SETTINGS[key] as object), ...(parsed.data as object) }
        : parsed.data;
  }
  return merged as Settings;
}
