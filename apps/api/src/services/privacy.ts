import {
  auditLog,
  commissionEntries,
  leadEvents,
  leads,
  partnerDocuments,
  partnerUsers,
  partners,
  pushTokens,
  type Db,
} from '@hoc/db';
import type { AdminRole } from '@hoc/shared';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { AuthAdmin } from '../lib/auth-admin';
import { conflict, forbidden, notFound } from '../lib/errors';
import type { DocumentStorage } from '../lib/storage';

export interface AdminActor {
  adminUserId: string;
  role: AdminRole;
}

const OPEN_MONEY = ['pending', 'approvable', 'approved', 'in_payout'] as const;

/**
 * Privacy: account deletion (Google Play requires an in-app way to ask), closing a partner account,
 * and erasing a customer's details when they withdraw consent (DPDP Act).
 * Financial records (sales, commissions, payouts, PAN for TDS) are kept: the law requires it.
 */
export function createPrivacyService({ db, authAdmin, storage }: { db: Db; authAdmin: AuthAdmin; storage: DocumentStorage }) {
  return {
    /** A partner asks for their account to be deleted. An admin closes it (see closeAccount). */
    async requestDeletion(partnerId: string, partnerUserId: string) {
      const [p] = await db.select({ at: partners.deletionRequestedAt, closed: partners.closedAt }).from(partners).where(eq(partners.id, partnerId));
      if (!p) throw notFound('Partner not found');
      if (p.at) return;
      await db.transaction(async (tx) => {
        await tx.update(partners).set({ deletionRequestedAt: new Date() }).where(eq(partners.id, partnerId));
        await tx.insert(auditLog).values({ actorType: 'partner', actorId: partnerUserId, entity: 'partner', entityId: partnerId, action: 'partner.deletion_requested' });
      });
    },

    /** Someone who logged in but never registered has nothing to keep: delete their login. */
    async deleteUnregistered(authUserId: string) {
      const [pu] = await db.select({ id: partnerUsers.id }).from(partnerUsers).where(eq(partnerUsers.authUserId, authUserId));
      if (pu) throw conflict('registered', 'This account has a partner application. Use "Request account deletion" instead.');
      await authAdmin.deleteUser(authUserId);
    },

    /**
     * Admin closes a partner account that asked for deletion: login off, documents and contact details removed.
     * Kept for tax and audit: business name, partner code, PAN and payout details, sales, commissions, payouts.
     */
    async closeAccount(actor: AdminActor, partnerId: string, note: string) {
      if (actor.role !== 'admin') throw forbidden('forbidden', 'Only admins can close accounts.');
      const [p] = await db.select().from(partners).where(eq(partners.id, partnerId));
      if (!p) throw notFound('Partner not found');
      if (!p.deletionRequestedAt) throw conflict('not_requested', 'This partner has not asked for their account to be deleted.');
      if (p.closedAt) throw conflict('already_closed', 'This account is already closed.');
      const [open] = await db
        .select({ id: commissionEntries.id })
        .from(commissionEntries)
        .where(and(eq(commissionEntries.partnerId, partnerId), inArray(commissionEntries.status, [...OPEN_MONEY])))
        .limit(1);
      if (open) throw conflict('open_money', 'This partner still has commission that is not paid out. Pay it, or reject or reverse it, before closing the account.');

      const docs = await db.select({ path: partnerDocuments.storagePath }).from(partnerDocuments).where(eq(partnerDocuments.partnerId, partnerId));
      await storage.remove(docs.map((d) => d.path));
      await db.transaction(async (tx) => {
        const users = await tx.select({ id: partnerUsers.id }).from(partnerUsers).where(eq(partnerUsers.partnerId, partnerId));
        if (users.length) await tx.delete(pushTokens).where(inArray(pushTokens.partnerUserId, users.map((u) => u.id)));
        await tx.update(partnerUsers).set({ active: false, name: null }).where(eq(partnerUsers.partnerId, partnerId));
        await tx.update(partnerDocuments).set({ replacedAt: new Date() }).where(and(eq(partnerDocuments.partnerId, partnerId), isNull(partnerDocuments.replacedAt)));
        await tx
          .update(partners)
          .set({ status: 'suspended', closedAt: new Date(), ownerName: null, email: null, addressLine: null, pincode: null, lat: null, lng: null, reviewNote: null })
          .where(eq(partners.id, partnerId));
        await tx.insert(auditLog).values({ actorType: 'admin', actorId: actor.adminUserId, entity: 'partner', entityId: partnerId, action: 'partner.account_closed', reason: note });
      });
    },

    /**
     * A customer withdrew consent: stop working the lead and erase their name, phone, city and notes.
     * Sales and commissions stay (financial records); they no longer point to a person.
     */
    async withdrawConsent(actor: AdminActor, leadId: string, note: string) {
      const [l] = await db.select().from(leads).where(eq(leads.id, leadId));
      if (!l) throw notFound('Lead not found');
      if (l.consentStatus === 'withdrawn') throw conflict('already_withdrawn', 'Consent was already withdrawn for this lead.');
      await db.transaction(async (tx) => {
        await tx
          .update(leads)
          .set({
            consentStatus: 'withdrawn',
            ...(l.stage === 'purchased' ? {} : { stage: 'closed_lost' as const, stageChangedAt: new Date() }),
            customerName: 'Withdrawn',
            customerPhone: '0000000000',
            city: null,
            pincode: null,
            notes: null,
            crmRef: null,
            personalDataErasedAt: new Date(),
          })
          .where(eq(leads.id, leadId));
        await tx.insert(leadEvents).values({
          leadId,
          type: 'note',
          actorType: 'admin',
          actorId: actor.adminUserId,
          fromStage: l.stage,
          toStage: l.stage === 'purchased' ? l.stage : 'closed_lost',
          note: `Customer withdrew consent. Personal details erased. ${note}`,
          visibleToPartner: false,
        });
        await tx.insert(auditLog).values({ actorType: 'admin', actorId: actor.adminUserId, entity: 'lead', entityId: leadId, action: 'lead.consent_withdrawn', reason: note });
      });
    },
  };
}

export type PrivacyService = ReturnType<typeof createPrivacyService>;
