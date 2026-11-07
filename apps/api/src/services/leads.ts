import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import {
  adminUsers,
  auditLog,
  bulkJobs,
  centres,
  commissionEntries,
  consentRecords,
  leadEvents,
  leads,
  legalDocuments,
  messageLog,
  messageTemplates,
  partners,
  productCategories,
  referralBenefits,
  sales,
  type BenefitSnapshot,
  type BulkJobRowRecord,
  type Db,
} from '@hoc/db';
import {
  ADMIN_LEAD_VIEW_KEYS,
  ADMIN_LEAD_VIEWS,
  checkStageChange,
  CONSULTATION_MODE_LABELS,
  CONSULTATION_MODES,
  formatINR,
  formatLeadRef,
  maskName,
  maskPhone,
  normalizeIndianMobile,
  OPEN_PIPELINE_STAGES,
  PARTNER_COMMISSION_LABELS,
  PARTNER_LEAD_FILTERS,
  parseLeadRef,
  PREFERRED_MODE_LABELS,
  PREFERRED_MODES,
  type AdminLeadDetail,
  type AdminLeadList,
  type AdminLeadView,
  type AdminRole,
  type BulkJob,
  type CommissionStatus,
  type ConsultationMode,
  type CustomerType,
  type LeadOptions,
  type LeadStage,
  type PartnerLead,
  type PublicReferral,
  type PartnerLeadDetail,
  type PartnerLeadFilter,
  type Settings,
} from '@hoc/shared';
import { and, asc, desc, eq, gt, gte, ilike, inArray, isNull, lt, ne, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { csvToRecords } from '../lib/csv';
import { AppError, badRequest, conflict, notFound } from '../lib/errors';
import { loadSettings } from '../lib/settings';
import { noopNotifier, type Notifier } from '../lib/notify';
import { renderTemplate, type SmsSender } from '../lib/sms';

type LeadRow = typeof leads.$inferSelect;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface PartnerActor {
  partnerId: string;
  partnerUserId: string;
}
export interface AdminActor {
  adminUserId: string;
  role: AdminRole;
}
export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

export interface LeadFields {
  customerName: string;
  customerPhone: string;
  categoryIds: string[];
  city: string | null;
  pincode: string | null;
  preferredMode: (typeof PREFERRED_MODES)[number];
  preferredCentreId?: string | null;
  notes: string | null;
}

/** Who is creating a lead: a partner in the app, or a customer through the public QR / link page. */
export interface CreateContext {
  partnerId: string;
  /** Null when the customer submitted it themselves. */
  partnerUserId: string | null;
  channel: 'assisted' | 'qr' | 'link';
  /** Public submissions always need the customer's OTP, and neutral error messages. */
  publicFlow: boolean;
}

export interface StageChange {
  stage: string;
  consultationMode?: ConsultationMode | null;
  consultationAt?: string | null;
  note?: string | null;
}

const NUDGE_MAX = 2;
const NUDGE_COOLDOWN_MS = 48 * 3600_000;
/** Consent codes one phone number can receive from the public page per day (SMS-pumping guard). */
const PUBLIC_PHONE_CODES_PER_DAY = 3;
const MAX_CODE_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60_000;
const PARTNER_PAGE = 30;
const ADMIN_PAGE = 50;
const BULK_PREVIEW_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_CSV_ROWS = 2000;
/** A partner can't refer the same customer again while their earlier lead is alive. */
const CLOSED_FOR_PARTNER: LeadStage[] = ['consent_expired', 'duplicate', 'invalid', 'closed_lost'];

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const istDateTime = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

/** Midnight today in India, as a UTC instant. */
function startOfTodayIST(now: Date): Date {
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 5.5 * 3600_000);
}
function todayISTString(now: Date): string {
  return new Date(now.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

/** "2026-11-20 16:30", "20/11/2026 16:30", "2026-11-20", or ISO with offset. Times without an offset are IST. */
export function parseIstDateTime(value: string): string | null {
  const v = value.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(v);
  let y, mo, d, h, mi;
  if (m) [, y, mo, d, h = '10', mi = '00'] = m;
  else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{1,2}):(\d{2}))?$/.exec(v))) [, d, mo, y, h = '10', mi = '00'] = m;
  else {
    if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(v)) return null;
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  }
  const pad = (s: string) => s.padStart(2, '0');
  const t = Date.parse(`${y}-${pad(mo!)}-${pad(d!)}T${pad(h!)}:${mi}:00+05:30`);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** "In touch", "consultation booked", "IN_TOUCH" → "in_touch" */
function normaliseKey(v: string): string {
  return v.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function createLeadService({
  db,
  sms,
  otpSecret,
  devCodes,
  now = () => new Date(),
  notify = noopNotifier,
}: {
  db: Db;
  sms: SmsSender;
  /** Any secret; a dedicated HMAC key is derived from it. */
  otpSecret: string;
  /** Return OTPs in API responses (development with the console SMS provider only). */
  devCodes: boolean;
  now?: () => Date;
  notify?: Notifier;
}) {
  const otpKey = createHash('sha256').update('hoc-consent-otp:').update(otpSecret).digest();
  const hashCode = (leadId: string, code: string) => createHmac('sha256', otpKey).update(`${leadId}:${code}`).digest('hex');

  /* ───────────── helpers ───────────── */

  function consultationOf(l: LeadRow) {
    if (!l.consultationMode || (l.stage !== 'consultation_booked' && l.stage !== 'consultation_done')) return null;
    return { mode: l.consultationMode, modeLabel: CONSULTATION_MODE_LABELS[l.consultationMode], at: iso(l.consultationAt) };
  }

  type CommissionView = { amountPaise: number; status: CommissionStatus } | undefined;

  /** The current commission per lead (the latest one), for the partner's view. */
  async function commissionsFor(leadIds: string[]): Promise<Map<string, NonNullable<CommissionView>>> {
    if (leadIds.length === 0) return new Map();
    const rows = await db
      .select({ leadId: commissionEntries.leadId, amountPaise: commissionEntries.amountPaise, status: commissionEntries.status })
      .from(commissionEntries)
      .where(inArray(commissionEntries.leadId, leadIds))
      .orderBy(asc(commissionEntries.createdAt));
    return new Map(rows.map((r) => [r.leadId, { amountPaise: r.amountPaise, status: r.status }]));
  }

  function toPartnerLead(l: LeadRow, s: Settings, commission?: CommissionView): PartnerLead {
    const consented = l.consentStatus === 'confirmed' || l.consentStatus === 'not_required';
    return {
      id: l.id,
      ref: formatLeadRef(l.number),
      customerName: maskName(l.customerName),
      customerPhone: maskPhone(l.customerPhone),
      stage: l.stage,
      stageLabel: s.stage_labels[l.stage],
      // Only after the customer has agreed, and always the neutral partner-facing wording.
      customerTypeLabel: consented && l.customerType ? s.customer_type_labels[l.customerType] : null,
      consultation: consultationOf(l),
      commission: commission
        ? {
            amountPaise: commission.amountPaise,
            status: commission.status,
            label: `Commission ${formatINR(commission.amountPaise)} ${PARTNER_COMMISSION_LABELS[commission.status]}`,
          }
        : null,
      createdAt: l.createdAt.toISOString(),
      stageChangedAt: l.stageChangedAt.toISOString(),
    };
  }

  async function loadLead(id: string): Promise<LeadRow> {
    const [l] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
    if (!l) throw notFound('Lead not found');
    return l;
  }

  async function loadPartnerLead(partnerId: string, id: string): Promise<LeadRow> {
    const [l] = await db
      .select()
      .from(leads)
      .where(and(eq(leads.id, id), eq(leads.partnerId, partnerId)))
      .limit(1);
    if (!l) throw notFound('Lead not found');
    return l;
  }

  async function consentVersion(): Promise<string> {
    const [doc] = await db
      .select({ version: legalDocuments.version })
      .from(legalDocuments)
      .where(eq(legalDocuments.kind, 'customer_consent'))
      .orderBy(sql`${legalDocuments.publishedAt} desc nulls last`, desc(legalDocuments.createdAt))
      .limit(1);
    if (!doc) throw new Error('No customer_consent text in legal_documents; run the seed');
    return doc.version;
  }

  async function bestBenefit(partnerTypeId: string, city: string | null, categoryIds: string[] | null) {
    const today = todayISTString(now());
    const rows = await db
      .select()
      .from(referralBenefits)
      .where(
        and(
          eq(referralBenefits.active, true),
          or(isNull(referralBenefits.activeFrom), sql`${referralBenefits.activeFrom} <= ${today}`),
          or(isNull(referralBenefits.activeTo), sql`${referralBenefits.activeTo} >= ${today}`),
        ),
      )
      .orderBy(desc(referralBenefits.priority), desc(referralBenefits.createdAt));
    const c = city?.trim().toLowerCase();
    return (
      rows.find(
        (r) =>
          r.type !== 'none' &&
          (r.partnerTypeIds.length === 0 || r.partnerTypeIds.includes(partnerTypeId)) &&
          (r.cities.length === 0 || (!!c && r.cities.some((x) => x.trim().toLowerCase() === c))) &&
          (r.categoryIds.length === 0 || !categoryIds || categoryIds.some((id) => r.categoryIds.includes(id))),
      ) ?? null
    );
  }

  async function expireIfDue(l: LeadRow): Promise<boolean> {
    if (l.stage !== 'awaiting_consent' || !l.consentExpiresAt || l.consentExpiresAt > now()) return false;
    await expireDue();
    return true;
  }

  /** Sends a new consent code. Returns whether the SMS went out. */
  async function sendCode(l: LeadRow, partnerName: string | null, partnerUserId: string | null, resend: boolean) {
    const [tpl] = await db.select().from(messageTemplates).where(eq(messageTemplates.key, 'consent_otp')).limit(1);
    if (!tpl) throw new Error('Message template consent_otp is missing; run the seed');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const hours = Math.max(1, Math.round(((l.consentExpiresAt?.getTime() ?? now().getTime()) - now().getTime()) / 3600_000));
    const body = renderTemplate(tpl.body, { otp: code, partner_name: partnerName ?? 'your salon', hours: String(hours) });

    const result = await sms.send({ to: l.customerPhone, body, providerTemplateId: tpl.providerTemplateId });
    await db.insert(messageLog).values({
      channel: 'sms',
      toPhone: `+91${l.customerPhone}`,
      templateKey: 'consent_otp',
      leadId: l.id,
      status: result.ok ? 'sent' : 'failed',
      providerRef: result.ok ? result.providerRef : null,
      error: result.ok ? null : result.error,
    });
    if (!result.ok) return { sent: false as const };

    // A new code replaces any earlier one that hasn't been used.
    await db
      .update(consentRecords)
      .set({ expiresAt: now() })
      .where(and(eq(consentRecords.leadId, l.id), isNull(consentRecords.verifiedAt), gt(consentRecords.expiresAt, now())));
    await db.insert(consentRecords).values({
      leadId: l.id,
      method: 'otp_sms',
      consentTextVersion: await consentVersion(),
      otpHash: hashCode(l.id, code),
      expiresAt: l.consentExpiresAt ?? new Date(now().getTime() + 72 * 3600_000),
    });
    await db.insert(leadEvents).values({
      leadId: l.id,
      type: 'consent_sent',
      actorType: partnerUserId ? 'partner' : 'customer',
      actorId: partnerUserId,
      meta: { resend },
    });
    return { sent: true as const, devCode: devCodes && sms.name === 'console' ? code : undefined };
  }

  async function consentDoc() {
    const [doc] = await db
      .select({ version: legalDocuments.version, body: legalDocuments.body })
      .from(legalDocuments)
      .where(eq(legalDocuments.kind, 'customer_consent'))
      .orderBy(sql`${legalDocuments.publishedAt} desc nulls last`, desc(legalDocuments.createdAt))
      .limit(1);
    if (!doc) throw new Error('No customer_consent text in legal_documents; run the seed');
    return doc;
  }

  /** Tells the partner a lead moved. Masked name only: it shows on a lock screen. */
  function pushStage(l: LeadRow, stage: LeadStage, s: Settings) {
    void notify.toPartner(l.partnerId, { title: maskName(l.customerName), body: s.stage_labels[stage], url: `/leads/${l.id}` });
  }

  async function findPublicPartner(code: string) {
    const [p] = await db
      .select()
      .from(partners)
      .where(and(eq(partners.code, code.trim().toUpperCase()), eq(partners.status, 'approved')))
      .limit(1);
    if (!p) throw notFound('This referral link is not active.');
    return p;
  }

  async function partnerDetail(partnerId: string, leadId: string): Promise<PartnerLeadDetail> {
    const [l, s] = await Promise.all([loadPartnerLead(partnerId, leadId), loadSettings(db)]);
    const [cats, centre, events, sends, commission, nudgeTpl] = await Promise.all([
      l.categoryIds.length
        ? db.select({ name: productCategories.name }).from(productCategories).where(inArray(productCategories.id, l.categoryIds))
        : Promise.resolve([]),
      l.preferredCentreId
        ? db.select({ name: centres.name, city: centres.city }).from(centres).where(eq(centres.id, l.preferredCentreId))
        : Promise.resolve([]),
      db
        .select()
        .from(leadEvents)
        .where(and(eq(leadEvents.leadId, l.id), eq(leadEvents.visibleToPartner, true)))
        .orderBy(asc(leadEvents.createdAt)),
      db.select({ n: sql<number>`count(*)::int` }).from(consentRecords).where(eq(consentRecords.leadId, l.id)),
      commissionsFor([l.id]),
      db.select().from(messageTemplates).where(eq(messageTemplates.key, 'customer_nudge')).limit(1),
    ]);
    const sent = sends[0]?.n ?? 0;
    const pending = l.stage === 'awaiting_consent';
    const resendsLeft = Math.max(0, 1 + s.consent_max_resends - sent);
    const snapshot = l.benefitSnapshot;

    const timeline = events.flatMap((e) => {
      const at = e.createdAt.toISOString();
      const meta = (e.meta ?? {}) as Record<string, unknown>;
      switch (e.type) {
        case 'created':
          return [{ label: 'Lead added', detail: null, at }];
        case 'consent_sent':
          return [{ label: meta.resend ? 'Confirmation code sent again' : 'Confirmation code sent to the customer', detail: null, at }];
        case 'consent_confirmed':
          return [{ label: 'Customer confirmed', detail: null, at }];
        case 'consent_expired':
          return [{ label: s.stage_labels.consent_expired, detail: null, at }];
        case 'verified': {
          const t = meta.customerType as CustomerType | undefined;
          return t ? [{ label: s.customer_type_labels[t], detail: null, at }] : [];
        }
        case 'stage_changed': {
          if (!e.toStage) return [];
          const mode = meta.consultationMode as ConsultationMode | undefined;
          const when = meta.consultationAt ? istDateTime.format(new Date(String(meta.consultationAt))) : null;
          const detail =
            e.toStage === 'consultation_booked' && mode ? [CONSULTATION_MODE_LABELS[mode], when].filter(Boolean).join(' · ') : null;
          return [{ label: s.stage_labels[e.toStage], detail, at }];
        }
        case 'sale_recorded':
          return [{ label: s.stage_labels.purchased, detail: null, at }];
        case 'sale_updated':
          return [{ label: 'Sale returned', detail: null, at }];
        case 'nudge_sent':
          return [{ label: 'You sent a reminder', detail: null, at }];
        default:
          return [];
      }
    });

    const nudges = events.filter((e) => e.type === 'nudge_sent');
    const tpl = nudgeTpl[0];
    const nudge: PartnerLeadDetail['nudge'] = { available: false, reason: null };
    if (l.stage === 'unreachable' && tpl?.channel === 'sms' && tpl.providerTemplateId) {
      const last = nudges.at(-1);
      if (nudges.length >= NUDGE_MAX) nudge.reason = 'You have already sent the most reminders allowed for this customer.';
      else if (last && now().getTime() - last.createdAt.getTime() < NUDGE_COOLDOWN_MS) {
        nudge.reason = `You can send another reminder after ${istDateTime.format(new Date(last.createdAt.getTime() + NUDGE_COOLDOWN_MS))}.`;
      } else nudge.available = true;
    }

    return {
      ...toPartnerLead(l, s, commission.get(l.id)),
      interests: cats.map((c) => c.name),
      preferredModeLabel: PREFERRED_MODE_LABELS[l.preferredMode],
      preferredCentre: centre[0] ? `${centre[0].name}, ${centre[0].city}` : null,
      benefitText: snapshot?.partnerText ?? snapshot?.customerText ?? null,
      ownedUntil: iso(l.ownedUntil),
      consent: { pending, expiresAt: pending ? iso(l.consentExpiresAt) : null, canResend: pending && resendsLeft > 0, resendsLeft },
      timeline,
      nudge,
    };
  }

  /** Applies a manual stage change inside a transaction. Assumes checkStageChange returned ok. */
  async function applyStage(tx: Tx, l: LeadRow, change: StageChange, actor: AdminActor, source: string) {
    const stage = change.stage as LeadStage;
    const booking = stage === 'consultation_booked';
    const updated = await tx
      .update(leads)
      .set({
        stage,
        stageChangedAt: now(),
        ...(booking ? { consultationMode: change.consultationMode ?? null, consultationAt: change.consultationAt ? new Date(change.consultationAt) : null } : {}),
      })
      .where(and(eq(leads.id, l.id), eq(leads.stage, l.stage)))
      .returning({ id: leads.id });
    if (updated.length === 0) return false;
    await tx.insert(leadEvents).values({
      leadId: l.id,
      type: 'stage_changed',
      actorType: 'admin',
      actorId: actor.adminUserId,
      fromStage: l.stage,
      toStage: stage,
      note: change.note ?? null,
      meta: { source, ...(booking ? { consultationMode: change.consultationMode, consultationAt: change.consultationAt ?? null } : {}) },
    });
    return true;
  }

  async function expireDue(): Promise<number> {
    const t = now();
    const expired = await db
      .update(leads)
      .set({ stage: 'consent_expired', consentStatus: 'expired', stageChangedAt: t })
      .where(and(eq(leads.stage, 'awaiting_consent'), lt(leads.consentExpiresAt, t)))
      .returning({ id: leads.id });
    if (expired.length) {
      await db.insert(leadEvents).values(
        expired.map((e) => ({
          leadId: e.id,
          type: 'consent_expired' as const,
          actorType: 'system' as const,
          fromStage: 'awaiting_consent' as const,
          toStage: 'consent_expired' as const,
        })),
      );
    }
    return expired.length;
  }

  async function jobView(id: string): Promise<BulkJob> {
    const [job] = await db.select().from(bulkJobs).where(eq(bulkJobs.id, id)).limit(1);
    if (!job) throw notFound('Bulk update not found');
    return {
      id: job.id,
      status: job.status,
      fileName: job.fileName,
      totalRows: job.totalRows,
      appliedRows: job.appliedRows,
      errorRows: job.errorRows,
      rows: (job.results ?? []).map((r) => ({
        row: r.row,
        leadId: r.leadId,
        ref: r.ref,
        customerName: r.customerName,
        currentStage: (r.currentStage as LeadStage | null) ?? null,
        stage: r.stage,
        outcome: r.outcome,
        reason: r.reason,
      })),
      createdAt: job.createdAt.toISOString(),
    };
  }

  const NEUTRAL_DUPLICATE = () =>
    conflict('unavailable', "We couldn't start this referral. If you're already in touch with HairOriginals, our team will contact you.");

  async function loadPublicLead(id: string): Promise<LeadRow> {
    const [l] = await db.select().from(leads).where(and(eq(leads.id, id), inArray(leads.channel, ['qr', 'link']))).limit(1);
    if (!l) throw notFound('Not found');
    return l;
  }

  async function createLead(ctx: CreateContext, input: LeadFields) {
      const actor = ctx;
      const t = now();
      const [[partner], s] = await Promise.all([
        db.select().from(partners).where(eq(partners.id, actor.partnerId)),
        loadSettings(db),
      ]);
      if (!partner) throw notFound('Partner not found');
      if (input.customerPhone === partner.phone) {
        throw ctx.publicFlow ? NEUTRAL_DUPLICATE() : badRequest('own_number', "You can't refer your own mobile number.");
      }

      if (!ctx.publicFlow) {
        const [{ n: addedToday } = { n: 0 }] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(leads)
          .where(and(eq(leads.partnerId, actor.partnerId), gte(leads.createdAt, startOfTodayIST(t))));
        if (addedToday >= s.max_leads_per_partner_per_day) {
          throw new AppError(429, 'daily_limit', `You can add up to ${s.max_leads_per_partner_per_day} leads a day. Try again tomorrow.`);
        }
      }

      const uniqueCats = [...new Set(input.categoryIds)];
      const cats = await db
        .select({ id: productCategories.id })
        .from(productCategories)
        .where(and(inArray(productCategories.id, uniqueCats), eq(productCategories.active, true)));
      if (cats.length !== uniqueCats.length) throw badRequest('unknown_category', 'Choose from the listed interests.');
      if (input.preferredCentreId) {
        const [c] = await db
          .select({ id: centres.id })
          .from(centres)
          .where(and(eq(centres.id, input.preferredCentreId), eq(centres.active, true)));
        if (!c) throw badRequest('unknown_centre', 'Choose an experience centre from the list.');
      }

      const benefit = await bestBenefit(partner.partnerTypeId, input.city ?? partner.city, uniqueCats);
      const snapshot: BenefitSnapshot | null = benefit
        ? {
            benefitId: benefit.id,
            name: benefit.name,
            type: benefit.type,
            value: benefit.value,
            customerText: benefit.customerText,
            partnerText: benefit.partnerText,
          }
        : null;
      // A customer submitting through the public page must always confirm by OTP, whatever the setting.
      const requireOtp = ctx.publicFlow || s.require_customer_otp;

      const lead = await db.transaction(async (tx) => {
        // Serialise per customer phone so two partners can't both end up owning the same customer.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`lead-phone:${input.customerPhone}`}))`);
        const [mine] = await tx
          .select({ number: leads.number })
          .from(leads)
          .where(
            and(
              eq(leads.partnerId, actor.partnerId),
              eq(leads.customerPhone, input.customerPhone),
              notInArray(leads.stage, CLOSED_FOR_PARTNER),
            ),
          )
          .limit(1);
        if (mine) {
          throw ctx.publicFlow ? NEUTRAL_DUPLICATE() : conflict('already_referred_by_you', `You already referred this customer (${formatLeadRef(mine.number)}).`);
        }
        const [owned] = await tx
          .select({ id: leads.id })
          .from(leads)
          .where(
            and(
              eq(leads.customerPhone, input.customerPhone),
              ne(leads.partnerId, actor.partnerId),
              gt(leads.ownedUntil, t),
              notInArray(leads.stage, ['duplicate', 'invalid']),
            ),
          )
          .limit(1);
        if (owned) throw ctx.publicFlow ? NEUTRAL_DUPLICATE() : conflict('already_referred', 'This customer has already been referred to HairOriginals.');

        const [row] = await tx
          .insert(leads)
          .values({
            partnerId: actor.partnerId,
            createdByPartnerUserId: actor.partnerUserId,
            channel: ctx.channel,
            customerName: input.customerName,
            customerPhone: input.customerPhone,
            city: input.city,
            pincode: input.pincode,
            categoryIds: uniqueCats,
            preferredMode: input.preferredMode,
            preferredCentreId: input.preferredCentreId ?? null,
            notes: input.notes,
            consentStatus: requireOtp ? 'pending' : 'not_required',
            consentRequestedAt: t,
            consentExpiresAt: requireOtp ? new Date(t.getTime() + s.consent_expiry_hours * 3600_000) : null,
            stage: requireOtp ? 'awaiting_consent' : 'under_review',
            stageChangedAt: t,
            ownedUntil: requireOtp ? null : new Date(t.getTime() + s.ownership_window_days * 86400_000),
            benefitSnapshot: snapshot,
          })
          .returning();
        await tx.insert(leadEvents).values({
          leadId: row!.id,
          type: 'created',
          actorType: ctx.partnerUserId ? 'partner' : 'customer',
          actorId: ctx.partnerUserId,
          toStage: row!.stage,
          meta: requireOtp ? null : { consentRequired: false },
        });
        return row!;
      });

      let smsSent = false;
      let devCode: string | undefined;
      if (requireOtp) {
        const r = await sendCode(lead, partner.businessName, ctx.partnerUserId, false);
        smsSent = r.sent;
        devCode = r.sent ? r.devCode : undefined;
      }
      return { lead: await partnerDetail(actor.partnerId, lead.id), smsSent, ...(devCode ? { devCode } : {}) };
    }

  /** Sends the consent code again (partner app or public page). */
  async function resendCode(l: LeadRow, partnerName: string | null, partnerUserId: string | null) {
    if (await expireIfDue(l)) throw new AppError(410, 'consent_expired', 'This lead expired because the customer did not confirm in time.');
    if (l.stage !== 'awaiting_consent') throw conflict('not_waiting', 'This lead is not waiting for confirmation.');
    const s = await loadSettings(db);
    const records = await db
      .select({ createdAt: consentRecords.createdAt })
      .from(consentRecords)
      .where(eq(consentRecords.leadId, l.id))
      .orderBy(desc(consentRecords.createdAt));
    if (records.length >= 1 + s.consent_max_resends) {
      throw new AppError(429, 'resend_limit', "The code can't be sent again. Ask the customer to check their SMS.");
    }
    if (records[0] && now().getTime() - records[0].createdAt.getTime() < RESEND_COOLDOWN_MS) {
      throw new AppError(429, 'too_soon', 'Wait a minute before sending the code again.');
    }
    const r = await sendCode(l, partnerName, partnerUserId, true);
    if (!r.sent) throw new AppError(502, 'sms_failed', "We couldn't send the code. Try again in a moment.");
    return { smsSent: true as const, ...(r.devCode ? { devCode: r.devCode } : {}) };
  }

  /** Checks the customer's code and records their consent (shared by the partner app and the public page). */
  async function confirmCode(l: LeadRow, code: string, meta: RequestMeta): Promise<void> {
    if (await expireIfDue(l)) throw new AppError(410, 'consent_expired', 'This lead expired because the customer did not confirm in time.');
    if (l.stage !== 'awaiting_consent') throw conflict('not_waiting', 'This lead is not waiting for confirmation.');
    // Only the current code counts: sending a new one expires the earlier ones.
    const [rec] = await db
      .select()
      .from(consentRecords)
      .where(and(eq(consentRecords.leadId, l.id), isNull(consentRecords.verifiedAt), gt(consentRecords.expiresAt, now())))
      .orderBy(desc(consentRecords.createdAt))
      .limit(1);
    if (!rec?.otpHash) throw conflict('no_code', 'Send the confirmation code first.');
    if (rec.attempts >= MAX_CODE_ATTEMPTS) {
      throw new AppError(429, 'too_many_attempts', 'Too many wrong codes. Send a new code.');
    }
    await db
      .update(consentRecords)
      .set({ attempts: sql`${consentRecords.attempts} + 1` })
      .where(eq(consentRecords.id, rec.id));
    const match = timingSafeEqual(Buffer.from(rec.otpHash, 'hex'), Buffer.from(hashCode(l.id, code), 'hex'));
    if (!match) {
      const left = MAX_CODE_ATTEMPTS - rec.attempts - 1;
      throw badRequest('wrong_code', left > 0 ? `That code is wrong. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'That code is wrong. Send a new code.');
    }

    const s = await loadSettings(db);
    const t = now();
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`lead-phone:${l.customerPhone}`}))`);
      const [owner] = await tx
        .select({ id: leads.id })
        .from(leads)
        .where(
          and(
            eq(leads.customerPhone, l.customerPhone),
            ne(leads.id, l.id),
            gt(leads.ownedUntil, t),
            notInArray(leads.stage, ['duplicate', 'invalid']),
          ),
        )
        .limit(1);
      const toStage: LeadStage = owner ? 'duplicate' : 'under_review';
      const updated = await tx
        .update(leads)
        .set({
          consentStatus: 'confirmed',
          consentConfirmedAt: t,
          stage: toStage,
          stageChangedAt: t,
          ownedUntil: owner ? null : new Date(t.getTime() + s.ownership_window_days * 86400_000),
          duplicateOfLeadId: owner?.id ?? null,
        })
        .where(and(eq(leads.id, l.id), eq(leads.stage, 'awaiting_consent')))
        .returning({ id: leads.id });
      if (updated.length === 0) throw conflict('not_waiting', 'This lead was already confirmed.');
      await tx
        .update(consentRecords)
        .set({ verifiedAt: t, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300) ?? null })
        .where(eq(consentRecords.id, rec.id));
      await tx.insert(leadEvents).values({
        leadId: l.id,
        type: 'consent_confirmed',
        actorType: 'customer',
        fromStage: 'awaiting_consent',
        toStage: 'under_review',
      });
      if (owner) {
        await tx.insert(leadEvents).values({
          leadId: l.id,
          type: 'stage_changed',
          actorType: 'system',
          fromStage: 'under_review',
          toStage: 'duplicate',
          meta: { duplicateOf: owner.id },
        });
      }
    });
  }

  return {
    expireDue,

    /* ───────────── Partner app ───────────── */

    async options(actor: PartnerActor): Promise<LeadOptions> {
      const [[partner], s, cats, cs, [today]] = await Promise.all([
        db.select().from(partners).where(eq(partners.id, actor.partnerId)),
        loadSettings(db),
        db
          .select({ id: productCategories.id, name: productCategories.name })
          .from(productCategories)
          .where(eq(productCategories.active, true))
          .orderBy(asc(productCategories.sortOrder), asc(productCategories.name)),
        db
          .select({ id: centres.id, name: centres.name, city: centres.city })
          .from(centres)
          .where(eq(centres.active, true))
          .orderBy(asc(centres.sortOrder), asc(centres.name)),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(leads)
          .where(and(eq(leads.partnerId, actor.partnerId), gte(leads.createdAt, startOfTodayIST(now())))),
      ]);
      const benefit = partner ? await bestBenefit(partner.partnerTypeId, partner.city, null) : null;
      return {
        categories: cats,
        centres: cs,
        preferredModes: PREFERRED_MODES.map((m) => ({ value: m, label: PREFERRED_MODE_LABELS[m] })),
        benefit: benefit ? { partnerText: benefit.partnerText, customerText: benefit.customerText } : null,
        requireOtp: s.require_customer_otp,
        dailyLimit: s.max_leads_per_partner_per_day,
        addedToday: today?.n ?? 0,
      };
    },

    create: createLead,

    async resend(actor: PartnerActor, leadId: string) {
      const l = await loadPartnerLead(actor.partnerId, leadId);
      const [partner] = await db.select({ name: partners.businessName }).from(partners).where(eq(partners.id, actor.partnerId));
      return resendCode(l, partner?.name ?? null, actor.partnerUserId);
    },

    async verifyCode(actor: PartnerActor, leadId: string, code: string, meta: RequestMeta): Promise<PartnerLeadDetail> {
      const l = await loadPartnerLead(actor.partnerId, leadId);
      await confirmCode(l, code, meta);
      return partnerDetail(actor.partnerId, l.id);
    },

    async listForPartner(partnerId: string, filter: PartnerLeadFilter, page: number) {
      const s = await loadSettings(db);
      const where =
        filter === 'all'
          ? eq(leads.partnerId, partnerId)
          : and(eq(leads.partnerId, partnerId), inArray(leads.stage, [...PARTNER_LEAD_FILTERS[filter]]));
      const [rows, byStage] = await Promise.all([
        db
          .select()
          .from(leads)
          .where(where)
          .orderBy(desc(leads.stageChangedAt), desc(leads.number))
          .limit(PARTNER_PAGE + 1)
          .offset((page - 1) * PARTNER_PAGE),
        db
          .select({ stage: leads.stage, n: sql<number>`count(*)::int` })
          .from(leads)
          .where(eq(leads.partnerId, partnerId))
          .groupBy(leads.stage),
      ]);
      const counts = { all: 0, waiting: 0, active: 0, purchased: 0, closed: 0 };
      for (const { stage, n } of byStage) {
        counts.all += n;
        for (const [k, stages] of Object.entries(PARTNER_LEAD_FILTERS)) {
          if ((stages as readonly string[]).includes(stage)) counts[k as keyof typeof counts] += n;
        }
      }
      const page1 = rows.slice(0, PARTNER_PAGE);
      const comm = await commissionsFor(page1.map((l) => l.id));
      return {
        items: page1.map((l) => toPartnerLead(l, s, comm.get(l.id))),
        counts,
        page,
        hasMore: rows.length > PARTNER_PAGE,
      };
    },

    partnerDetail,

    /* ───────────── Reminder ───────────── */

    /** The partner nudges a customer HO could not reach, with the approved reminder SMS. */
    async nudge(actor: PartnerActor, leadId: string): Promise<PartnerLeadDetail> {
      const l = await loadPartnerLead(actor.partnerId, leadId);
      if (l.stage !== 'unreachable') throw conflict('not_unreachable', 'Reminders can be sent only when HairOriginals could not reach the customer.');
      const [tpl] = await db.select().from(messageTemplates).where(eq(messageTemplates.key, 'customer_nudge')).limit(1);
      if (!tpl || tpl.channel !== 'sms' || !tpl.providerTemplateId) throw conflict('nudge_unavailable', "Reminders aren't available yet.");
      const sent = await db
        .select({ createdAt: leadEvents.createdAt })
        .from(leadEvents)
        .where(and(eq(leadEvents.leadId, l.id), eq(leadEvents.type, 'nudge_sent')))
        .orderBy(asc(leadEvents.createdAt));
      if (sent.length >= NUDGE_MAX) throw new AppError(429, 'nudge_limit', 'You have already sent the most reminders allowed for this customer.');
      const last = sent.at(-1);
      if (last && now().getTime() - last.createdAt.getTime() < NUDGE_COOLDOWN_MS) {
        throw new AppError(429, 'too_soon', 'A reminder was sent recently. Please wait before sending another.');
      }
      const [partner] = await db.select({ name: partners.businessName }).from(partners).where(eq(partners.id, actor.partnerId));
      const body = renderTemplate(tpl.body, { customer_name: l.customerName.split(/\s+/)[0] ?? 'there', partner_name: partner?.name ?? 'your salon' });
      if (/\{\{\w+\}\}/.test(body)) {
        throw conflict('nudge_unavailable', "Reminders aren't available yet.");
      }
      const result = await sms.send({ to: l.customerPhone, body, providerTemplateId: tpl.providerTemplateId });
      await db.insert(messageLog).values({
        channel: 'sms',
        toPhone: `+91${l.customerPhone}`,
        templateKey: 'customer_nudge',
        leadId: l.id,
        status: result.ok ? 'sent' : 'failed',
        providerRef: result.ok ? result.providerRef : null,
        error: result.ok ? null : result.error,
      });
      if (!result.ok) throw new AppError(502, 'sms_failed', "We couldn't send the reminder. Try again in a moment.");
      await db.insert(leadEvents).values({ leadId: l.id, type: 'nudge_sent', actorType: 'partner', actorId: actor.partnerUserId });
      return partnerDetail(actor.partnerId, l.id);
    },

    /* ───────────── Public QR / link page ───────────── */

    async publicReferral(code: string): Promise<PublicReferral> {
      const p = await findPublicPartner(code);
      const name = p.businessName ?? 'your salon';
      const [cats, benefit, doc] = await Promise.all([
        db
          .select({ id: productCategories.id, name: productCategories.name })
          .from(productCategories)
          .where(eq(productCategories.active, true))
          .orderBy(asc(productCategories.sortOrder), asc(productCategories.name)),
        bestBenefit(p.partnerTypeId, p.city, null),
        consentDoc(),
      ]);
      return {
        partnerName: name,
        benefitText: benefit?.customerText ?? null,
        categories: cats,
        consent: { version: doc.version, text: doc.body.replace(/\{\{partner_name\}\}/g, name) },
      };
    },

    /** A customer starts a referral from the partner's QR / link. Sends them a consent code. */
    async publicSubmit(
      code: string,
      input: { customerName: string; customerPhone: string; categoryIds: string[]; city: string | null; channel: 'qr' | 'link' },
    ): Promise<{ leadId: string; expiresAt: string; devCode?: string }> {
      const p = await findPublicPartner(code);
      const s = await loadSettings(db);
      const t = now();

      // Same partner, same number, still waiting: send the code again instead of failing.
      const [waiting] = await db
        .select()
        .from(leads)
        .where(and(eq(leads.partnerId, p.id), eq(leads.customerPhone, input.customerPhone), eq(leads.stage, 'awaiting_consent'), inArray(leads.channel, ['qr', 'link'])))
        .limit(1);
      if (waiting && waiting.consentExpiresAt && waiting.consentExpiresAt > t) {
        const r = await resendCode(waiting, p.businessName, null);
        return { leadId: waiting.id, expiresAt: waiting.consentExpiresAt.toISOString(), ...(r.devCode ? { devCode: r.devCode } : {}) };
      }

      const [{ n: today } = { n: 0 }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(leads)
        .where(and(inArray(leads.channel, ['qr', 'link']), gte(leads.createdAt, startOfTodayIST(t))));
      if (today >= s.max_public_leads_per_day) {
        throw new AppError(429, 'busy', "We're getting a lot of requests right now. Please try again later.");
      }
      const [{ n: recent } = { n: 0 }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(messageLog)
        .where(and(eq(messageLog.toPhone, `+91${input.customerPhone}`), eq(messageLog.templateKey, 'consent_otp'), gte(messageLog.createdAt, new Date(t.getTime() - 24 * 3600_000))));
      if (recent >= PUBLIC_PHONE_CODES_PER_DAY) {
        throw new AppError(429, 'too_many_codes', 'Too many codes were sent to this number today. Please try again tomorrow.');
      }

      const res = await createLead(
        { partnerId: p.id, partnerUserId: null, channel: input.channel, publicFlow: true },
        { customerName: input.customerName, customerPhone: input.customerPhone, categoryIds: input.categoryIds, city: input.city, pincode: null, preferredMode: 'ho_decides', preferredCentreId: null, notes: null },
      );
      if (!res.smsSent) {
        // Free the number so the customer can try again.
        await db.update(leads).set({ stage: 'consent_expired', consentStatus: 'expired', stageChangedAt: now() }).where(eq(leads.id, res.lead.id));
        throw new AppError(502, 'sms_failed', "We couldn't send the code. Please try again in a moment.");
      }
      return { leadId: res.lead.id, expiresAt: res.lead.consent.expiresAt ?? new Date(t.getTime() + s.consent_expiry_hours * 3600_000).toISOString(), ...(res.devCode ? { devCode: res.devCode } : {}) };
    },

    async publicResend(leadId: string) {
      const l = await loadPublicLead(leadId);
      const [p] = await db.select({ name: partners.businessName }).from(partners).where(eq(partners.id, l.partnerId));
      return resendCode(l, p?.name ?? null, null);
    },

    async publicConfirm(leadId: string, code: string, meta: RequestMeta): Promise<void> {
      const l = await loadPublicLead(leadId);
      await confirmCode(l, code, meta);
      void notify.toPartner(l.partnerId, { title: `${maskName(l.customerName)} confirmed`, body: 'They agreed to be contacted by HairOriginals.', url: `/leads/${l.id}` });
    },

    /* ───────────── Dashboard ───────────── */

    async listForAdmin(query: { view: AdminLeadView; q?: string; partnerId?: string; page: number }): Promise<AdminLeadList> {
      const base: SQL[] = [];
      if (query.partnerId) base.push(eq(leads.partnerId, query.partnerId));
      const conds = [...base];
      if (query.view !== 'all') conds.push(inArray(leads.stage, [...ADMIN_LEAD_VIEWS[query.view]]));
      if (query.q) {
        const q = query.q.trim();
        const term = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        const refNo = /^l-?\d+$/i.test(q) ? parseLeadRef(q) : null;
        const digits = q.replace(/\D/g, '');
        conds.push(
          refNo
            ? eq(leads.number, refNo)
            : digits.length >= 4 && digits.length === q.replace(/[\s+-]/g, '').length
              ? ilike(leads.customerPhone, `%${digits.slice(-10)}%`)
              : or(ilike(leads.customerName, term), ilike(leads.city, term), ilike(partners.businessName, term))!,
        );
      }
      const where = conds.length ? and(...conds) : undefined;
      const order =
        query.view === 'verify'
          ? [asc(leads.consentConfirmedAt), asc(leads.number)]
          : query.view === 'awaiting'
            ? [asc(leads.createdAt)]
            : [desc(leads.stageChangedAt), desc(leads.number)];

      const [rows, [{ total } = { total: 0 }], byStage] = await Promise.all([
        db
          .select({ lead: leads, partnerName: partners.businessName, partnerCode: partners.code })
          .from(leads)
          .innerJoin(partners, eq(partners.id, leads.partnerId))
          .where(where)
          .orderBy(...order)
          .limit(ADMIN_PAGE)
          .offset((query.page - 1) * ADMIN_PAGE),
        db
          .select({ total: sql<number>`count(*)::int` })
          .from(leads)
          .innerJoin(partners, eq(partners.id, leads.partnerId))
          .where(where),
        db
          .select({ stage: leads.stage, n: sql<number>`count(*)::int` })
          .from(leads)
          .where(base.length ? and(...base) : undefined)
          .groupBy(leads.stage),
      ]);

      const counts = Object.fromEntries(ADMIN_LEAD_VIEW_KEYS.map((k) => [k, 0])) as Record<AdminLeadView, number>;
      for (const { stage, n } of byStage) {
        counts.all += n;
        for (const [k, stages] of Object.entries(ADMIN_LEAD_VIEWS)) {
          if ((stages as readonly string[]).includes(stage)) counts[k as AdminLeadView] += n;
        }
      }

      return {
        items: rows.map(({ lead: l, partnerName, partnerCode }) => ({
          id: l.id,
          ref: formatLeadRef(l.number),
          customerName: l.customerName,
          customerPhone: l.customerPhone,
          city: l.city,
          stage: l.stage,
          customerType: l.customerType,
          partner: { id: l.partnerId, name: partnerName ?? 'Partner', code: partnerCode },
          preferredMode: l.preferredMode,
          consultation: l.consultationMode ? { mode: l.consultationMode, at: iso(l.consultationAt) } : null,
          createdAt: l.createdAt.toISOString(),
          consentConfirmedAt: iso(l.consentConfirmedAt),
          stageChangedAt: l.stageChangedAt.toISOString(),
        })),
        total,
        page: query.page,
        pageSize: ADMIN_PAGE,
        counts,
      };
    },

    async adminDetail(leadId: string): Promise<AdminLeadDetail> {
      const l = await loadLead(leadId);
      const [[partner], cats, centre, verifier, dup, consents, same, events, saleRows] = await Promise.all([
        db.select({ name: partners.businessName, code: partners.code }).from(partners).where(eq(partners.id, l.partnerId)),
        l.categoryIds.length
          ? db.select({ name: productCategories.name }).from(productCategories).where(inArray(productCategories.id, l.categoryIds))
          : Promise.resolve([]),
        l.preferredCentreId
          ? db.select({ name: centres.name, city: centres.city }).from(centres).where(eq(centres.id, l.preferredCentreId))
          : Promise.resolve([]),
        l.verifiedBy ? db.select({ name: adminUsers.name }).from(adminUsers).where(eq(adminUsers.id, l.verifiedBy)) : Promise.resolve([]),
        l.duplicateOfLeadId
          ? db.select({ id: leads.id, number: leads.number }).from(leads).where(eq(leads.id, l.duplicateOfLeadId))
          : Promise.resolve([]),
        db.select().from(consentRecords).where(eq(consentRecords.leadId, l.id)).orderBy(asc(consentRecords.createdAt)),
        db
          .select({ id: leads.id, number: leads.number, stage: leads.stage, createdAt: leads.createdAt, partner: partners.businessName })
          .from(leads)
          .innerJoin(partners, eq(partners.id, leads.partnerId))
          .where(and(eq(leads.customerPhone, l.customerPhone), ne(leads.id, l.id)))
          .orderBy(desc(leads.createdAt))
          .limit(20),
        db
          .select({ e: leadEvents, adminName: adminUsers.name })
          .from(leadEvents)
          .leftJoin(adminUsers, eq(adminUsers.id, leadEvents.actorId))
          .where(eq(leadEvents.leadId, l.id))
          .orderBy(desc(leadEvents.createdAt)),
        db
          .select({ sale: sales, c: commissionEntries })
          .from(sales)
          .leftJoin(commissionEntries, eq(commissionEntries.saleId, sales.id))
          .where(eq(sales.leadId, l.id))
          .orderBy(desc(sales.createdAt)),
      ]);
      const partnerName = partner?.name ?? 'Partner';
      return {
        id: l.id,
        ref: formatLeadRef(l.number),
        customerName: l.customerName,
        customerPhone: l.customerPhone,
        city: l.city,
        pincode: l.pincode,
        stage: l.stage,
        customerType: l.customerType,
        partner: { id: l.partnerId, name: partnerName, code: partner?.code ?? null },
        preferredMode: l.preferredMode,
        preferredCentre: centre[0] ? `${centre[0].name}, ${centre[0].city}` : null,
        consultation: l.consultationMode ? { mode: l.consultationMode, at: iso(l.consultationAt) } : null,
        interests: cats.map((c) => c.name),
        notes: l.notes,
        crmRef: l.crmRef,
        ownedUntil: iso(l.ownedUntil),
        benefit: l.benefitSnapshot ? { name: l.benefitSnapshot.name, customerText: l.benefitSnapshot.customerText } : null,
        consentStatus: l.consentStatus,
        verifiedBy: verifier[0]?.name ?? null,
        verifiedAt: iso(l.verifiedAt),
        duplicateOf: dup[0] ? { id: dup[0].id, ref: formatLeadRef(dup[0].number) } : null,
        sales: saleRows.map(({ sale, c }) => ({
          id: sale.id,
          saleDate: sale.saleDate,
          invoiceNo: sale.invoiceNo,
          totalNetPaise: sale.totalNetPaise,
          status: sale.status,
          commission: c ? { id: c.id, status: c.status, amountPaise: c.amountPaise, flagged: c.flagged } : null,
        })),
        createdAt: l.createdAt.toISOString(),
        consentConfirmedAt: iso(l.consentConfirmedAt),
        stageChangedAt: l.stageChangedAt.toISOString(),
        consents: consents.map((c) => ({
          method: c.method,
          textVersion: c.consentTextVersion,
          sentAt: c.createdAt.toISOString(),
          verifiedAt: iso(c.verifiedAt),
          attempts: c.attempts,
          ip: c.ip,
        })),
        samePhone: same.map((x) => ({
          id: x.id,
          ref: formatLeadRef(x.number),
          partner: x.partner ?? 'Partner',
          stage: x.stage,
          createdAt: x.createdAt.toISOString(),
        })),
        events: events.map(({ e, adminName }) => ({
          type: e.type,
          actor:
            e.actorType === 'admin'
              ? (adminName ?? 'HO team')
              : e.actorType === 'partner'
                ? partnerName
                : e.actorType === 'customer'
                  ? 'Customer'
                  : 'System',
          fromStage: e.fromStage,
          toStage: e.toStage,
          note: e.note,
          visibleToPartner: e.visibleToPartner,
          meta: e.meta ?? null,
          at: e.createdAt.toISOString(),
        })),
      };
    },

    /** Verification queue: tag the customer type (and optionally the CRM reference). */
    async verify(actor: AdminActor, leadId: string, input: { customerType: CustomerType; crmRef: string | null; note: string | null }) {
      const l = await loadLead(leadId);
      const t = now();
      const inPipeline = (OPEN_PIPELINE_STAGES as readonly string[]).includes(l.stage);
      if (l.stage !== 'under_review' && !(inPipeline && input.customerType !== 'invalid')) {
        throw conflict('not_verifiable', `A lead that is "${l.stage.replace(/_/g, ' ')}" can't be verified.`);
      }
      const retag = l.stage !== 'under_review';
      const toStage: LeadStage = retag ? l.stage : input.customerType === 'invalid' ? 'invalid' : 'verified';
      await db.transaction(async (tx) => {
        const updated = await tx
          .update(leads)
          .set({
            customerType: input.customerType,
            ...(input.crmRef !== null ? { crmRef: input.crmRef } : {}),
            verifiedBy: actor.adminUserId,
            verifiedAt: t,
            ...(retag ? {} : { stage: toStage, stageChangedAt: t }),
          })
          .where(and(eq(leads.id, l.id), eq(leads.stage, l.stage)))
          .returning({ id: leads.id });
        if (updated.length === 0) throw conflict('state_changed', 'Someone else just updated this lead. Reload and try again.');
        await tx.insert(leadEvents).values({
          leadId: l.id,
          type: 'verified',
          actorType: 'admin',
          actorId: actor.adminUserId,
          fromStage: l.stage,
          toStage,
          note: input.note,
          meta: { customerType: input.customerType, ...(retag ? { retag: true, previous: l.customerType } : {}) },
        });
        await tx.insert(auditLog).values({
          actorType: 'admin',
          actorId: actor.adminUserId,
          entity: 'lead',
          entityId: l.id,
          action: retag ? 'lead.retagged' : 'lead.verified',
          before: { stage: l.stage, customerType: l.customerType },
          after: { stage: toStage, customerType: input.customerType },
          reason: input.note,
        });
      });
      if (!retag) pushStage(l, toStage, await loadSettings(db));
    },

    async changeStage(actor: AdminActor, leadId: string, change: StageChange): Promise<{ changed: boolean }> {
      const l = await loadLead(leadId);
      if (l.consentStatus === 'withdrawn') throw conflict('consent_withdrawn', 'The customer withdrew consent. This lead can no longer be worked.');
      const check = checkStageChange({ current: l.stage, target: change.stage, consultationMode: change.consultationMode });
      if (check.kind === 'error') throw conflict('invalid_stage_change', check.reason);
      if (check.kind === 'no_change') return { changed: false };
      const ok = await db.transaction((tx) => applyStage(tx, l, change, actor, 'single'));
      if (!ok) throw conflict('state_changed', 'Someone else just updated this lead. Reload and try again.');
      pushStage(l, change.stage as LeadStage, await loadSettings(db));
      return { changed: true };
    },

    async addNote(actor: AdminActor, leadId: string, note: string): Promise<void> {
      await loadLead(leadId);
      await db.insert(leadEvents).values({
        leadId,
        type: 'note',
        actorType: 'admin',
        actorId: actor.adminUserId,
        note,
        visibleToPartner: false,
      });
    },

    /** Bulk update from a selection in the leads list. */
    async bulkSelection(actor: AdminActor, input: StageChange & { leadIds: string[] }): Promise<BulkJob> {
      const ids = [...new Set(input.leadIds)];
      const labels = await loadSettings(db);
      const rows = await db.select().from(leads).where(inArray(leads.id, ids));
      const byId = new Map(rows.map((r) => [r.id, r]));
      const results: BulkJobRowRecord[] = [];
      for (const [i, id] of ids.entries()) {
        const l = byId.get(id);
        const base = {
          row: i + 1,
          leadId: id,
          ref: l ? formatLeadRef(l.number) : null,
          customerName: l?.customerName ?? null,
          currentStage: l?.stage ?? null,
          stage: input.stage,
          consultationMode: input.consultationMode ?? null,
          consultationAt: input.consultationAt ?? null,
          note: input.note ?? null,
        };
        if (!l) {
          results.push({ ...base, outcome: 'skipped', reason: 'Lead not found' });
          continue;
        }
        if (l.consentStatus === 'withdrawn') {
          results.push({ ...base, outcome: 'skipped', reason: 'The customer withdrew consent' });
          continue;
        }
        const check = checkStageChange({ current: l.stage, target: input.stage, consultationMode: input.consultationMode });
        if (check.kind !== 'ok') {
          results.push({ ...base, outcome: check.kind === 'no_change' ? 'no_change' : 'skipped', reason: check.kind === 'error' ? check.reason : 'Already at this stage' });
          continue;
        }
        const ok = await db.transaction((tx) => applyStage(tx, l, input, actor, 'bulk_selection'));
        if (ok) pushStage(l, input.stage as LeadStage, labels);
        results.push({ ...base, outcome: ok ? 'applied' : 'skipped', reason: ok ? null : 'Changed by someone else' });
      }
      const applied = results.filter((r) => r.outcome === 'applied').length;
      const [job] = await db
        .insert(bulkJobs)
        .values({
          kind: 'stage_update',
          status: 'applied',
          createdBy: actor.adminUserId,
          totalRows: results.length,
          appliedRows: applied,
          errorRows: results.filter((r) => r.outcome === 'skipped').length,
          results,
          appliedAt: now(),
        })
        .returning({ id: bulkJobs.id });
      await db.insert(auditLog).values({
        actorType: 'admin',
        actorId: actor.adminUserId,
        entity: 'bulk_job',
        entityId: job!.id,
        action: 'leads.bulk_stage',
        after: { stage: input.stage, applied, total: results.length },
        reason: input.note ?? null,
      });
      return jobView(job!.id);
    },

    /** CSV upload, step 1: check every row and save the preview. Nothing changes yet. */
    async csvPreview(actor: AdminActor, input: { csv: string; fileName?: string | null }): Promise<BulkJob> {
      const { headers, records } = csvToRecords(input.csv);
      if (!headers.includes('stage') || !(headers.includes('lead_ref') || headers.includes('phone'))) {
        throw badRequest('bad_csv', 'The file needs a "stage" column and a "lead_ref" or "phone" column. Download the template to start.');
      }
      if (records.length === 0) throw badRequest('bad_csv', 'The file has no rows under the header.');
      if (records.length > MAX_CSV_ROWS) throw badRequest('too_many_rows', `Up to ${MAX_CSV_ROWS} rows per file.`);

      const numbers = records.map((r) => (r.lead_ref ? parseLeadRef(r.lead_ref) : null)).filter((n): n is number => n !== null);
      const phones = records
        .map((r) => (!r.lead_ref && r.phone ? normalizeIndianMobile(r.phone) : null))
        .filter((p): p is string => p !== null);
      const [byNumberRows, byPhoneRows] = await Promise.all([
        numbers.length ? db.select().from(leads).where(inArray(leads.number, numbers)) : Promise.resolve([]),
        phones.length
          ? db
              .select()
              .from(leads)
              .where(and(inArray(leads.customerPhone, phones), inArray(leads.stage, [...OPEN_PIPELINE_STAGES])))
          : Promise.resolve([]),
      ]);
      const byNumber = new Map(byNumberRows.map((l) => [l.number, l]));
      const byPhone = new Map<string, LeadRow[]>();
      for (const l of byPhoneRows) byPhone.set(l.customerPhone, [...(byPhone.get(l.customerPhone) ?? []), l]);

      const seen = new Set<string>();
      const results: BulkJobRowRecord[] = records.map((r, i) => {
        const row: BulkJobRowRecord = {
          row: i + 2, // row 1 is the header
          leadId: null,
          ref: null,
          customerName: null,
          currentStage: null,
          stage: r.stage ? normaliseKey(r.stage) : null,
          consultationMode: r.consultation_mode ? normaliseKey(r.consultation_mode) : null,
          consultationAt: null,
          note: r.note || null,
          outcome: 'invalid',
          reason: null,
        };
        const fail = (reason: string) => ({ ...row, outcome: 'invalid' as const, reason });

        let lead: LeadRow | undefined;
        if (r.lead_ref) {
          const n = parseLeadRef(r.lead_ref);
          if (n === null) return fail(`"${r.lead_ref}" isn't a lead reference (e.g. L-000123)`);
          lead = byNumber.get(n);
          if (!lead) return fail(`No lead ${formatLeadRef(n)}`);
        } else if (r.phone) {
          const p = normalizeIndianMobile(r.phone);
          if (!p) return fail(`"${r.phone}" isn't a valid mobile number`);
          const matches = byPhone.get(p) ?? [];
          if (matches.length === 0) return fail('No open lead with this phone number');
          if (matches.length > 1) return fail('Several open leads have this phone number: use lead_ref');
          lead = matches[0]!;
        } else {
          return fail('Add a lead_ref or a phone');
        }
        Object.assign(row, { leadId: lead.id, ref: formatLeadRef(lead.number), customerName: lead.customerName, currentStage: lead.stage });
        if (lead.consentStatus === 'withdrawn') return fail('The customer withdrew consent');
        if (seen.has(lead.id)) return fail('This lead appears more than once in the file');
        seen.add(lead.id);

        if (!row.stage) return fail('Add a stage');
        if (row.consultationMode && !(CONSULTATION_MODES as readonly string[]).includes(row.consultationMode)) {
          return fail(`consultation_mode must be one of: ${CONSULTATION_MODES.join(', ')}`);
        }
        if (r.consultation_at) {
          const at = parseIstDateTime(r.consultation_at);
          if (!at) return fail(`consultation_at "${r.consultation_at}" isn't a date (use 2026-11-20 16:30)`);
          row.consultationAt = at;
        }
        const check = checkStageChange({
          current: lead.stage,
          target: row.stage,
          consultationMode: row.consultationMode as ConsultationMode | null,
        });
        if (check.kind === 'error') return fail(check.reason);
        return { ...row, outcome: check.kind === 'ok' ? ('valid' as const) : ('no_change' as const) };
      });

      const [job] = await db
        .insert(bulkJobs)
        .values({
          kind: 'stage_update',
          status: 'previewed',
          createdBy: actor.adminUserId,
          fileName: input.fileName ?? null,
          totalRows: results.length,
          appliedRows: 0,
          errorRows: results.filter((r) => r.outcome === 'invalid').length,
          results,
        })
        .returning({ id: bulkJobs.id });
      return jobView(job!.id);
    },

    /** CSV upload, step 2: apply the valid rows of a preview (each re-checked against the lead's current stage). */
    async applyJob(actor: AdminActor, jobId: string): Promise<BulkJob> {
      const [job] = await db.select().from(bulkJobs).where(eq(bulkJobs.id, jobId)).limit(1);
      if (!job) throw notFound('Bulk update not found');
      if (job.status !== 'previewed') throw conflict('already_applied', 'This file has already been applied.');
      if (now().getTime() - job.createdAt.getTime() > BULK_PREVIEW_TTL_MS) {
        throw conflict('preview_expired', 'This preview is more than 2 hours old. Upload the file again.');
      }
      // Claim it first so a double click can't apply it twice.
      const claimed = await db
        .update(bulkJobs)
        .set({ status: 'applied', appliedAt: now() })
        .where(and(eq(bulkJobs.id, jobId), eq(bulkJobs.status, 'previewed')))
        .returning({ id: bulkJobs.id });
      if (claimed.length === 0) throw conflict('already_applied', 'This file has already been applied.');

      const results = job.results ?? [];
      const ids = results.filter((r) => r.outcome === 'valid' && r.leadId).map((r) => r.leadId!);
      const current = ids.length ? await db.select().from(leads).where(inArray(leads.id, ids)) : [];
      const byId = new Map(current.map((l) => [l.id, l]));
      const labels = await loadSettings(db);
      const out: BulkJobRowRecord[] = [];
      for (const r of results) {
        if (r.outcome !== 'valid' || !r.leadId) {
          out.push(r);
          continue;
        }
        const l = byId.get(r.leadId);
        const change: StageChange = {
          stage: r.stage!,
          consultationMode: r.consultationMode as ConsultationMode | null,
          consultationAt: r.consultationAt,
          note: r.note,
        };
        const check = l ? checkStageChange({ current: l.stage, target: change.stage, consultationMode: change.consultationMode }) : null;
        if (!l || !check || check.kind !== 'ok') {
          out.push({ ...r, outcome: 'skipped', reason: check?.kind === 'error' ? `Changed since the preview: ${check.reason}` : 'Changed since the preview' });
          continue;
        }
        const ok = await db.transaction((tx) => applyStage(tx, l, change, actor, 'bulk_csv'));
        if (ok) pushStage(l, change.stage as LeadStage, labels);
        out.push({ ...r, outcome: ok ? 'applied' : 'skipped', reason: ok ? null : 'Changed by someone else' });
      }
      const applied = out.filter((r) => r.outcome === 'applied').length;
      await db
        .update(bulkJobs)
        .set({ results: out, appliedRows: applied, errorRows: out.filter((r) => r.outcome === 'invalid' || r.outcome === 'skipped').length })
        .where(eq(bulkJobs.id, jobId));
      await db.insert(auditLog).values({
        actorType: 'admin',
        actorId: actor.adminUserId,
        entity: 'bulk_job',
        entityId: jobId,
        action: 'leads.bulk_csv',
        after: { applied, total: out.length, fileName: job.fileName },
      });
      return jobView(jobId);
    },

    jobView,
  };
}

export type LeadService = ReturnType<typeof createLeadService>;
