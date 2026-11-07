import { sql } from 'drizzle-orm';
import { boolean, date, index, integer, jsonb, pgTable, text, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { CustomerType, RateType } from '@hoc/shared';
import { createdAt, id, tsz, updatedAt } from './_columns';
import { adminUsers } from './admin';
import { productCategories, products } from './catalog';
import {
  commissionStatus,
  customerType,
  payoutBatchStatus,
  payoutStatus,
  planScope,
  rateType,
  saleSource,
  saleStatus,
} from './enums';
import { leads } from './leads';
import { partners } from './partners';

// ─── Sales ──────────────────────────────────────────────────────────────────

export const sales = pgTable(
  'sales',
  {
    id: id(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id),
    source: saleSource('source').notNull().default('manual'),
    invoiceNo: text('invoice_no'),
    saleDate: date('sale_date').notNull(),
    status: saleStatus('status').notNull().default('active'),
    /** Sum of the lines, excluding GST and the home-trial fee (paise). */
    totalNetPaise: integer('total_net_paise').notNull(),
    enteredBy: uuid('entered_by').references(() => adminUsers.id),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('sales_lead_idx').on(t.leadId)],
);

export const saleLines = pgTable('sale_lines', {
  id: id(),
  saleId: uuid('sale_id')
    .notNull()
    .references(() => sales.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => productCategories.id),
  productId: uuid('product_id').references(() => products.id),
  netPaise: integer('net_paise').notNull(),
});

// ─── Commission plans & rules (all configured in the dashboard) ─────────────

export const commissionPlans = pgTable('commission_plans', {
  id: id(),
  name: text('name').notNull(),
  description: text('description'),
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo: date('effective_to'),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const commissionRules = pgTable(
  'commission_rules',
  {
    id: id(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => commissionPlans.id, { onDelete: 'cascade' }),
    /** Null = any category. */
    categoryId: uuid('category_id').references(() => productCategories.id),
    /** Null = any customer type. */
    customerType: customerType('customer_type'),
    rateType: rateType('rate_type').notNull(),
    /** bps when percent (750 = 7.5%), paise when flat. */
    rateValue: integer('rate_value').notNull(),
    minPaise: integer('min_paise'),
    maxPaise: integer('max_paise'),
    /** Higher wins when several rules match equally specifically. */
    priority: integer('priority').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('commission_rules_plan_idx').on(t.planId)],
);

/** Which plan applies: partner override → partner type → default. */
export const planAssignments = pgTable(
  'plan_assignments',
  {
    id: id(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => commissionPlans.id),
    scope: planScope('scope').notNull(),
    /** partner_types.id or partners.id; null for the default scope. */
    scopeId: uuid('scope_id'),
    createdAt: createdAt(),
  },
  (t) => [unique('plan_assignments_scope_uq').on(t.scope, t.scopeId).nullsNotDistinct()],
);

/** Exactly what was used to calculate a commission, frozen at calculation time. */
export type RuleSnapshot = {
  planId: string;
  planName: string;
  assignedVia: 'default' | 'partner_type' | 'partner';
  customerType: CustomerType;
  lines: Array<{
    categoryId: string;
    netPaise: number;
    ruleId: string | null;
    rateType: RateType | null;
    rateValue: number | null;
    minPaise: number | null;
    maxPaise: number | null;
    amountPaise: number;
  }>;
};

export const commissionEntries = pgTable(
  'commission_entries',
  {
    id: id(),
    partnerId: uuid('partner_id')
      .notNull()
      .references(() => partners.id),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id),
    saleId: uuid('sale_id')
      .notNull()
      .unique()
      .references(() => sales.id),
    calculatedPaise: integer('calculated_paise').notNull(),
    adjustmentPaise: integer('adjustment_paise').notNull().default(0),
    adjustmentReason: text('adjustment_reason'),
    /** calculated + adjustment. What the partner is paid. */
    amountPaise: integer('amount_paise').notNull(),
    ruleSnapshot: jsonb('rule_snapshot').$type<RuleSnapshot>().notNull(),
    flagged: boolean('flagged').notNull().default(false),
    flagReasons: text('flag_reasons').array().notNull().default(sql`'{}'::text[]`),
    status: commissionStatus('status').notNull().default('pending'),
    holdUntil: date('hold_until').notNull(),
    approvedBy: uuid('approved_by').references(() => adminUsers.id),
    approvedAt: tsz('approved_at'),
    payoutId: uuid('payout_id').references(() => payouts.id),
    /** Set on a reversed commission that was already paid: the payout that deducted it. */
    clawbackPayoutId: uuid('clawback_payout_id').references(() => payouts.id),
    statusReason: text('status_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('commission_entries_partner_idx').on(t.partnerId, t.status),
    index('commission_entries_status_idx').on(t.status, t.holdUntil),
  ],
);

// ─── Payouts ────────────────────────────────────────────────────────────────

export const payoutBatches = pgTable('payout_batches', {
  id: id(),
  /** e.g. "November 2026". */
  label: text('label').notNull(),
  status: payoutBatchStatus('status').notNull().default('draft'),
  createdBy: uuid('created_by').references(() => adminUsers.id),
  exportedAt: tsz('exported_at'),
  completedAt: tsz('completed_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const payouts = pgTable(
  'payouts',
  {
    id: id(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => payoutBatches.id),
    partnerId: uuid('partner_id')
      .notNull()
      .references(() => partners.id),
    grossPaise: integer('gross_paise').notNull(),
    /** Reversed commissions (already paid earlier) deducted from this payout. */
    clawbackPaise: integer('clawback_paise').notNull().default(0),
    tdsPaise: integer('tds_paise').notNull().default(0),
    netPaise: integer('net_paise').notNull(),
    status: payoutStatus('status').notNull().default('pending'),
    /** Bank / UPI transaction reference entered when paid. */
    utr: text('utr'),
    paidAt: tsz('paid_at'),
    failureReason: text('failure_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('payouts_batch_partner_uq').on(t.batchId, t.partnerId)],
);
