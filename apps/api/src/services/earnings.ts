import { commissionEntries, leads, partners, payoutBatches, payouts, pushTokens, type Db } from '@hoc/db';
import {
  formatLeadRef,
  DEFAULT_TRYON_URL,
  maskName,
  PARTNER_COMMISSION_LABELS,
  tryOnLink,
  type AdminPartnerReferral,
  type Earnings,
  type PartnerReferral,
} from '@hoc/shared';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { conflict, notFound } from '../lib/errors';
import { qrSvg } from '../lib/qr';

/** Partner-side money views, the share links / QR codes, and push tokens. */
export function createEarningsService({ db, publicWebUrl, tryOnUrl = DEFAULT_TRYON_URL }: { db: Db; publicWebUrl: string; tryOnUrl?: string }) {
  const base = publicWebUrl.replace(/\/+$/, '');

  /** Both QR codes for a partner who has a code: the HO Connect referral page, and the AI try-on app. */
  async function qrCodes(p: { code: string; businessName: string | null }): Promise<PartnerReferral> {
    const qrLink = `${base}/r/${p.code}?c=qr`;
    const link = `${base}/r/${p.code}?c=link`;
    const tryOnQrLink = tryOnLink(tryOnUrl, p, 'qr');
    const tryOnLinkUrl = tryOnLink(tryOnUrl, p, 'link');
    const [svg, tryOnSvg] = await Promise.all([qrSvg(qrLink), qrSvg(tryOnQrLink)]);
    return {
      code: p.code,
      link,
      qrLink,
      qrSvg: svg,
      posterUrl: `${base}/r/${p.code}/poster`,
      shareText: `Hi! I recommend HairOriginals for hair solutions. Share your details here and their hair expert will get in touch: ${link}`,
      benefitText: null,
      tryOn: {
        link: tryOnLinkUrl,
        qrLink: tryOnQrLink,
        qrSvg: tryOnSvg,
        posterUrl: `${base}/r/${p.code}/tryon-poster`,
        shareText: `See how HairOriginals hair looks on you before you decide. Try it on your own photo with their free AI try-on: ${tryOnLinkUrl}`,
      },
    };
  }

  async function approvedPartnerByCode(code: string) {
    const [p] = await db
      .select({ code: partners.code, businessName: partners.businessName })
      .from(partners)
      .where(and(eq(partners.code, code.toUpperCase()), eq(partners.status, 'approved')));
    if (!p?.code) throw notFound('Not found');
    return { code: p.code, businessName: p.businessName };
  }

  return {
    async earnings(partnerId: string): Promise<Earnings> {
      const [sums, entries, pays] = await Promise.all([
        db
          .select({ status: commissionEntries.status, total: sql<number>`coalesce(sum(${commissionEntries.amountPaise}), 0)::int` })
          .from(commissionEntries)
          .where(eq(commissionEntries.partnerId, partnerId))
          .groupBy(commissionEntries.status),
        db
          .select({ c: commissionEntries, number: leads.number, name: leads.customerName })
          .from(commissionEntries)
          .innerJoin(leads, eq(leads.id, commissionEntries.leadId))
          .where(eq(commissionEntries.partnerId, partnerId))
          .orderBy(desc(commissionEntries.createdAt))
          .limit(50),
        // Drafts and failed payouts are internal: a partner only sees payments that are on their way or done.
        db
          .select({ p: payouts, label: payoutBatches.label })
          .from(payouts)
          .innerJoin(payoutBatches, eq(payoutBatches.id, payouts.batchId))
          .where(and(eq(payouts.partnerId, partnerId), or(eq(payouts.status, 'paid'), and(eq(payouts.status, 'pending'), eq(payoutBatches.status, 'exported')))))
          .orderBy(desc(payouts.createdAt))
          .limit(20),
      ]);
      const sum = (...statuses: string[]) => sums.filter((s) => statuses.includes(s.status)).reduce((t, s) => t + s.total, 0);
      return {
        totals: {
          pendingPaise: sum('pending', 'approvable'),
          approvedPaise: sum('approved'),
          beingPaidPaise: sum('in_payout'),
          paidPaise: sum('paid'),
        },
        entries: entries.map(({ c, number, name }) => ({
          id: c.id,
          leadId: c.leadId,
          ref: formatLeadRef(number),
          customerName: maskName(name),
          amountPaise: c.amountPaise,
          status: c.status,
          label: PARTNER_COMMISSION_LABELS[c.status],
          createdAt: c.createdAt.toISOString(),
        })),
        payouts: pays.map(({ p, label }) => ({
          id: p.id,
          label,
          grossPaise: p.grossPaise,
          clawbackPaise: p.clawbackPaise,
          tdsPaise: p.tdsPaise,
          netPaise: p.netPaise,
          status: p.status === 'paid' ? ('paid' as const) : ('pending' as const),
          utr: p.utr,
          paidAt: p.paidAt?.toISOString() ?? null,
          createdAt: p.createdAt.toISOString(),
        })),
      };
    },

    /** The partner's own QR codes and links. */
    async referral(partnerId: string): Promise<PartnerReferral> {
      const [p] = await db.select().from(partners).where(eq(partners.id, partnerId));
      if (!p?.code || p.status !== 'approved') throw conflict('not_approved', 'Your referral link is available once you are approved.');
      return qrCodes({ code: p.code, businessName: p.businessName });
    },

    /** A partner's QR codes, for HO staff to download or print on the partner's behalf. */
    async adminReferral(partnerId: string): Promise<AdminPartnerReferral> {
      const [p] = await db.select().from(partners).where(eq(partners.id, partnerId));
      if (!p) throw notFound('Partner not found');
      if (!p.code) throw conflict('no_partner_code', 'This partner gets a partner code, and QR codes, when they are approved.');
      return { ...(await qrCodes({ code: p.code, businessName: p.businessName })), active: p.status === 'approved' };
    },

    /** The referral QR as an image for the printable poster (public). */
    async publicQr(code: string): Promise<string> {
      const p = await approvedPartnerByCode(code);
      return qrSvg(`${base}/r/${p.code}?c=qr`);
    },

    /** The AI try-on QR as an image for the try-on poster (public). */
    async publicTryOnQr(code: string): Promise<string> {
      return qrSvg(tryOnLink(tryOnUrl, await approvedPartnerByCode(code), 'qr'));
    },

    async registerPushToken(partnerUserId: string, token: string, platform: 'ios' | 'android') {
      await db
        .insert(pushTokens)
        .values({ partnerUserId, token, platform })
        .onConflictDoUpdate({ target: pushTokens.token, set: { partnerUserId, platform, lastSeenAt: new Date() } });
    },

    async removePushToken(partnerUserId: string, token: string) {
      await db.delete(pushTokens).where(and(eq(pushTokens.token, token), eq(pushTokens.partnerUserId, partnerUserId)));
    },
  };
}

export type EarningsService = ReturnType<typeof createEarningsService>;
