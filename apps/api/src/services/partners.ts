import { randomUUID } from 'node:crypto';
import {
  adminUsers,
  auditLog,
  centres,
  documentTypes,
  legalDocuments,
  partnerDocuments,
  partnerTypes,
  partnerUsers,
  partners,
  type Db,
} from '@hoc/db';
import {
  canPartnerEdit,
  INDIAN_STATES,
  MAX_UPLOAD_BYTES,
  PARTNER_STATUSES,
  payoutDisplay,
  type AdminPartnerDetail,
  type AdminPartnerList,
  type AdminRole,
  type DocumentTypeInfo,
  type PartnerApplication,
  type PartnerDecision,
  type PartnerDocumentInfo,
  type PartnerStatus,
  type PartnerTypeAdmin,
  type PayoutDetails,
  type RegistrationOptions,
} from '@hoc/shared';
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { FieldCipher } from '../lib/crypto';
import { AppError, badRequest, conflict, forbidden, isUniqueViolation, notFound } from '../lib/errors';
import { displayFileName, EXTENSION, sniffMimeType } from '../lib/files';
import { noopNotifier, type Notifier } from '../lib/notify';
import type { DocumentStorage } from '../lib/storage';

type PartnerRow = typeof partners.$inferSelect;
type DocTypeRow = typeof documentTypes.$inferSelect;
type DocRow = typeof partnerDocuments.$inferSelect;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface AdminActor {
  adminUserId: string;
  role: AdminRole;
}

export interface Blocker {
  key: string;
  message: string;
}

/** Profile fields after zod parsing (see partnerProfileInputSchema). */
export interface ProfileFields {
  partnerTypeId: string;
  businessName: string;
  ownerName: string;
  email: string | null;
  addressLine: string;
  city: string;
  state: (typeof INDIAN_STATES)[number];
  pincode: string;
  homeCentreId: string;
}

export interface ApplicationUpdate extends Partial<ProfileFields> {
  pan?: string;
  gstin?: string | null;
  payout?: PayoutDetails;
}

const PAGE_SIZE = 25;
const VIEW_URL_SECONDS = 10 * 60;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

function toDocumentTypeInfo(d: DocTypeRow): DocumentTypeInfo {
  return {
    id: d.id,
    slug: d.slug,
    name: d.name,
    description: d.description,
    required: d.required,
    acceptedMimeTypes: d.acceptedMimeTypes,
    maxFiles: d.maxFiles,
  };
}

function toDocumentInfo(d: DocRow): PartnerDocumentInfo {
  return {
    id: d.id,
    fileName: d.fileName,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    status: d.status,
    reviewerNote: d.reviewerNote,
    createdAt: d.createdAt.toISOString(),
  };
}

/** "Glow Studio & Spa" → "glow_studio_spa" */
function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'item'
  );
}

/** What the partner still has to do before they can submit. */
export function submissionBlockers(p: PartnerRow, docTypes: DocTypeRow[], docs: DocRow[]): Blocker[] {
  const blockers: Blocker[] = [];
  if (!p.businessName || !p.ownerName || !p.addressLine || !p.city || !p.state || !p.pincode || !p.homeCentreId) {
    blockers.push({ key: 'profile', message: 'Complete your business details.' });
  }
  if (!p.panEncrypted) blockers.push({ key: 'pan', message: 'Add your PAN.' });
  if (!p.payoutMethod || !p.payoutDetailsEncrypted) {
    blockers.push({ key: 'payout', message: 'Add how you want to be paid (UPI or bank account).' });
  }
  for (const dt of docTypes) {
    const mine = docs.filter((d) => d.documentTypeId === dt.id);
    if (mine.some((d) => d.status === 'rejected')) {
      blockers.push({ key: `document:${dt.slug}`, message: `Replace your ${dt.name}: it was not accepted.` });
    } else if (dt.required && mine.length === 0) {
      blockers.push({ key: `document:${dt.slug}`, message: `Upload your ${dt.name}.` });
    }
  }
  return blockers;
}

/** What still has to happen before an agent can approve. */
export function approvalBlockers(p: PartnerRow, docTypes: DocTypeRow[], docs: DocRow[]): Blocker[] {
  if (p.status !== 'submitted') {
    return [{ key: 'status', message: 'Only submitted applications can be approved.' }];
  }
  const blockers: Blocker[] = [];
  const pending = docs.filter((d) => d.status === 'pending').length;
  if (pending > 0) {
    blockers.push({ key: 'pending', message: `Review ${pending === 1 ? 'the last document' : `${pending} documents`} first.` });
  }
  for (const dt of docTypes.filter((d) => d.required)) {
    if (!docs.some((d) => d.documentTypeId === dt.id && d.status === 'accepted')) {
      blockers.push({ key: `document:${dt.slug}`, message: `${dt.name} has no accepted document.` });
    }
  }
  return blockers;
}

export function createPartnerService({
  db,
  cipher,
  storage,
  notify = noopNotifier,
}: {
  db: Db;
  cipher: FieldCipher;
  storage: DocumentStorage;
  notify?: Notifier;
}) {
  async function audit(
    tx: Db | Tx,
    entry: {
      actorType: 'admin' | 'partner';
      actorId: string;
      entityId: string;
      action: string;
      entity?: string;
      before?: unknown;
      after?: unknown;
      reason?: string | null;
    },
  ) {
    await tx.insert(auditLog).values({
      actorType: entry.actorType,
      actorId: entry.actorId,
      entity: entry.entity ?? 'partner',
      entityId: entry.entityId,
      action: entry.action,
      before: entry.before ?? null,
      after: entry.after ?? null,
      reason: entry.reason ?? null,
    });
  }

  async function currentTerms() {
    const [terms] = await db
      .select({ version: legalDocuments.version, title: legalDocuments.title, body: legalDocuments.body })
      .from(legalDocuments)
      .where(eq(legalDocuments.kind, 'partner_terms'))
      .orderBy(sql`${legalDocuments.publishedAt} desc nulls last`, desc(legalDocuments.createdAt))
      .limit(1);
    return terms ?? null;
  }

  async function loadPartner(partnerId: string): Promise<PartnerRow> {
    const [p] = await db.select().from(partners).where(eq(partners.id, partnerId)).limit(1);
    if (!p) throw notFound('Partner not found');
    return p;
  }

  /** Active checklist for a partner type, and the partner's current (not replaced) documents. */
  async function loadChecklist(p: PartnerRow) {
    const [docTypes, docs] = await Promise.all([
      db
        .select()
        .from(documentTypes)
        .where(and(eq(documentTypes.partnerTypeId, p.partnerTypeId), eq(documentTypes.active, true)))
        .orderBy(asc(documentTypes.sortOrder), asc(documentTypes.name)),
      db
        .select()
        .from(partnerDocuments)
        .where(and(eq(partnerDocuments.partnerId, p.id), isNull(partnerDocuments.replacedAt)))
        .orderBy(asc(partnerDocuments.createdAt)),
    ]);
    const typeIds = new Set(docTypes.map((d) => d.id));
    return { docTypes, docs: docs.filter((d) => typeIds.has(d.documentTypeId)) };
  }

  async function assertActiveType(partnerTypeId: string) {
    const [t] = await db
      .select({ id: partnerTypes.id })
      .from(partnerTypes)
      .where(and(eq(partnerTypes.id, partnerTypeId), eq(partnerTypes.active, true)))
      .limit(1);
    if (!t) throw badRequest('unknown_partner_type', 'Choose what kind of partner you are.');
  }

  async function assertActiveCentre(centreId: string) {
    const [c] = await db
      .select({ id: centres.id })
      .from(centres)
      .where(and(eq(centres.id, centreId), eq(centres.active, true)))
      .limit(1);
    if (!c) throw badRequest('unknown_centre', 'Choose your nearest experience centre.');
  }

  async function describe(p: PartnerRow) {
    const [[type], [centre], checklist] = await Promise.all([
      db
        .select({ id: partnerTypes.id, slug: partnerTypes.slug, name: partnerTypes.name })
        .from(partnerTypes)
        .where(eq(partnerTypes.id, p.partnerTypeId)),
      p.homeCentreId
        ? db
            .select({ id: centres.id, name: centres.name, city: centres.city })
            .from(centres)
            .where(eq(centres.id, p.homeCentreId))
        : Promise.resolve([]),
      loadChecklist(p),
    ]);
    if (!type) throw new Error(`partner ${p.id} has a missing partner type`);
    const base = {
      id: p.id,
      status: p.status,
      code: p.code,
      partnerType: type,
      businessName: p.businessName,
      ownerName: p.ownerName,
      phone: p.phone,
      email: p.email,
      addressLine: p.addressLine,
      city: p.city,
      state: p.state,
      pincode: p.pincode,
      homeCentre: centre ?? null,
      panLast4: p.panLast4,
      gstin: p.gstin,
      payoutMethod: p.payoutMethod,
      payoutDisplay: p.payoutDisplay,
      agreementVersion: p.agreementVersion,
      agreementAcceptedAt: iso(p.agreementAcceptedAt),
      submittedAt: iso(p.submittedAt),
      reviewNote: p.reviewNote,
      deletionRequestedAt: iso(p.deletionRequestedAt),
      closedAt: iso(p.closedAt),
      blockers: submissionBlockers(p, checklist.docTypes, checklist.docs),
    };
    return { base, ...checklist };
  }

  async function application(partnerId: string): Promise<PartnerApplication> {
    const p = await loadPartner(partnerId);
    const { base, docTypes, docs } = await describe(p);
    return {
      ...base,
      checklist: docTypes.map((dt) => ({
        documentType: toDocumentTypeInfo(dt),
        documents: docs.filter((d) => d.documentTypeId === dt.id).map(toDocumentInfo),
      })),
      canEdit: canPartnerEdit(p.status),
    };
  }

  async function loadEditable(partnerId: string): Promise<PartnerRow> {
    const p = await loadPartner(partnerId);
    if (!canPartnerEdit(p.status)) {
      throw conflict('not_editable', "Your application is with the HairOriginals team and can't be changed right now.");
    }
    return p;
  }

  return {
    /* ───────────── Partner app ───────────── */

    async registrationOptions(): Promise<RegistrationOptions> {
      const types = await db
        .select()
        .from(partnerTypes)
        .where(eq(partnerTypes.active, true))
        .orderBy(asc(partnerTypes.sortOrder), asc(partnerTypes.name));
      const docTypes = types.length
        ? await db
            .select()
            .from(documentTypes)
            .where(
              and(
                eq(documentTypes.active, true),
                inArray(
                  documentTypes.partnerTypeId,
                  types.map((t) => t.id),
                ),
              ),
            )
            .orderBy(asc(documentTypes.sortOrder), asc(documentTypes.name))
        : [];
      const centreRows = await db
        .select({ id: centres.id, name: centres.name, city: centres.city })
        .from(centres)
        .where(eq(centres.active, true))
        .orderBy(asc(centres.sortOrder), asc(centres.name));
      return {
        partnerTypes: types.map((t) => ({
          id: t.id,
          slug: t.slug,
          name: t.name,
          description: t.description,
          documents: docTypes.filter((d) => d.partnerTypeId === t.id).map(toDocumentTypeInfo),
        })),
        centres: centreRows,
        states: [...INDIAN_STATES],
        terms: await currentTerms(),
      };
    },

    /** Creates a draft partner and links the logged-in phone user as its owner. */
    async register(user: { authUserId: string; phone: string | null }, input: ProfileFields): Promise<string> {
      if (!user.phone) {
        throw badRequest('phone_required', 'Log in with your mobile number to register as a partner.');
      }
      await Promise.all([assertActiveType(input.partnerTypeId), assertActiveCentre(input.homeCentreId)]);
      try {
        return await db.transaction(async (tx) => {
          const [p] = await tx
            .insert(partners)
            .values({ ...input, phone: user.phone!, status: 'draft' })
            .returning({ id: partners.id });
          await tx.insert(partnerUsers).values({
            partnerId: p!.id,
            authUserId: user.authUserId,
            phone: user.phone!,
            name: input.ownerName,
            role: 'owner',
          });
          await audit(tx, { actorType: 'partner', actorId: p!.id, entityId: p!.id, action: 'partner.registered' });
          return p!.id;
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw conflict('already_registered', 'This mobile number is already registered as a partner.');
        }
        throw err;
      }
    },

    application,

    async updateApplication(partnerId: string, input: ApplicationUpdate): Promise<PartnerApplication> {
      const p = await loadEditable(partnerId);
      const { pan, gstin, payout, ...profile } = input;

      if (profile.partnerTypeId && profile.partnerTypeId !== p.partnerTypeId) {
        if (p.status !== 'draft') {
          throw conflict('type_locked', "You can't change your partner type after the HairOriginals team has reviewed it.");
        }
        await assertActiveType(profile.partnerTypeId);
      }
      if (profile.homeCentreId) await assertActiveCentre(profile.homeCentreId);

      const set: Partial<typeof partners.$inferInsert> = {};
      for (const [k, v] of Object.entries(profile)) if (v !== undefined) (set as Record<string, unknown>)[k] = v;
      if (pan !== undefined) {
        set.panEncrypted = cipher.encrypt(pan);
        set.panLast4 = pan.slice(-4);
      }
      if (gstin !== undefined) set.gstin = gstin;
      if (payout !== undefined) {
        set.payoutMethod = payout.method;
        set.payoutDetailsEncrypted = cipher.encrypt(JSON.stringify(payout));
        set.payoutDisplay = payoutDisplay(payout);
      }
      if (Object.keys(set).length > 0) await db.update(partners).set(set).where(eq(partners.id, partnerId));
      return application(partnerId);
    },

    async uploadDocument(
      partnerId: string,
      documentTypeId: string,
      file: { fileName: string | undefined; bytes: Buffer },
    ): Promise<PartnerDocumentInfo> {
      const p = await loadEditable(partnerId);
      const [dt] = await db
        .select()
        .from(documentTypes)
        .where(
          and(
            eq(documentTypes.id, documentTypeId),
            eq(documentTypes.partnerTypeId, p.partnerTypeId),
            eq(documentTypes.active, true),
          ),
        )
        .limit(1);
      if (!dt) throw badRequest('unknown_document_type', 'This document is not on your checklist.');

      if (file.bytes.length === 0) throw badRequest('empty_file', 'That file is empty.');
      if (file.bytes.length > MAX_UPLOAD_BYTES) {
        throw new AppError(413, 'file_too_large', 'Files can be up to 10 MB.');
      }
      const mime = sniffMimeType(file.bytes);
      if (!mime || !dt.acceptedMimeTypes.includes(mime)) {
        const kinds = dt.acceptedMimeTypes.map((m) => (m === 'application/pdf' ? 'PDF' : m.split('/')[1]!.toUpperCase()));
        throw new AppError(415, 'unsupported_file', `For ${dt.name}, upload a ${kinds.join(', ')} file.`);
      }

      const existing = await db
        .select()
        .from(partnerDocuments)
        .where(
          and(
            eq(partnerDocuments.partnerId, partnerId),
            eq(partnerDocuments.documentTypeId, dt.id),
            isNull(partnerDocuments.replacedAt),
          ),
        );
      // One-file documents are replaced; multi-file ones must have room.
      const replacing = dt.maxFiles === 1 ? existing : [];
      if (dt.maxFiles > 1 && existing.length >= dt.maxFiles) {
        throw conflict('too_many_files', `You can upload up to ${dt.maxFiles} files for ${dt.name}. Remove one first.`);
      }
      if (replacing.some((d) => d.status === 'accepted')) {
        throw conflict('already_accepted', `Your ${dt.name} was already accepted.`);
      }

      const storagePath = `partners/${partnerId}/${dt.slug}/${randomUUID()}.${EXTENSION[mime]}`;
      await storage.put(storagePath, file.bytes, mime);

      const doc = await db.transaction(async (tx) => {
        if (replacing.length) {
          await tx
            .update(partnerDocuments)
            .set({ replacedAt: new Date() })
            .where(inArray(
              partnerDocuments.id,
              replacing.map((d) => d.id),
            ));
        }
        const [row] = await tx
          .insert(partnerDocuments)
          .values({
            partnerId,
            documentTypeId: dt.id,
            storagePath,
            fileName: displayFileName(file.fileName, mime),
            mimeType: mime,
            sizeBytes: file.bytes.length,
          })
          .returning();
        return row!;
      });
      return toDocumentInfo(doc);
    },

    async removeDocument(partnerId: string, documentId: string): Promise<void> {
      await loadEditable(partnerId);
      const [doc] = await db
        .select()
        .from(partnerDocuments)
        .where(
          and(
            eq(partnerDocuments.id, documentId),
            eq(partnerDocuments.partnerId, partnerId),
            isNull(partnerDocuments.replacedAt),
          ),
        )
        .limit(1);
      if (!doc) throw notFound('Document not found');
      if (doc.status === 'accepted') throw conflict('already_accepted', 'This document was already accepted.');
      // Kept in storage for the audit trail; hidden from the checklist.
      await db.update(partnerDocuments).set({ replacedAt: new Date() }).where(eq(partnerDocuments.id, documentId));
    },

    async submit(partnerId: string, acceptTermsVersion: string): Promise<PartnerApplication> {
      const p = await loadEditable(partnerId);
      const terms = await currentTerms();
      if (!terms) throw new Error('No partner terms in legal_documents; run the seed');
      if (acceptTermsVersion !== terms.version) {
        throw conflict('terms_changed', 'The partner terms were updated. Please read and accept the latest version.');
      }
      const { docTypes, docs } = await loadChecklist(p);
      const blockers = submissionBlockers(p, docTypes, docs);
      if (blockers.length > 0) {
        throw badRequest('application_incomplete', blockers.map((b) => b.message).join(' '));
      }
      const now = new Date();
      await db.transaction(async (tx) => {
        const updated = await tx
          .update(partners)
          .set({
            status: 'submitted',
            submittedAt: now,
            agreementVersion: terms.version,
            agreementAcceptedAt: now,
            reviewNote: null,
          })
          .where(and(eq(partners.id, partnerId), eq(partners.status, p.status)))
          .returning({ id: partners.id });
        if (updated.length === 0) throw conflict('state_changed', 'Your application changed. Please try again.');
        await audit(tx, {
          actorType: 'partner',
          actorId: partnerId,
          entityId: partnerId,
          action: p.status === 'changes_requested' ? 'partner.resubmitted' : 'partner.submitted',
          before: { status: p.status },
          after: { status: 'submitted', termsVersion: terms.version },
        });
      });
      return application(partnerId);
    },

    /* ───────────── Dashboard: review ───────────── */

    async list(query: { status?: PartnerStatus; q?: string; page: number }): Promise<AdminPartnerList> {
      const conditions: SQL[] = [];
      if (query.status) conditions.push(eq(partners.status, query.status));
      if (query.q) {
        const term = `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        conditions.push(
          or(
            ilike(partners.businessName, term),
            ilike(partners.ownerName, term),
            ilike(partners.city, term),
            ilike(partners.code, term),
            ilike(partners.phone, term),
          )!,
        );
      }
      const where = conditions.length ? and(...conditions) : undefined;
      const order =
        query.status === 'submitted'
          ? [asc(partners.submittedAt)] // oldest first: a queue
          : [desc(partners.updatedAt)];

      const [rows, [{ total } = { total: 0 }], statusCounts] = await Promise.all([
        db
          .select({
            id: partners.id,
            code: partners.code,
            status: partners.status,
            businessName: partners.businessName,
            ownerName: partners.ownerName,
            phone: partners.phone,
            city: partners.city,
            partnerType: partnerTypes.name,
            submittedAt: partners.submittedAt,
            updatedAt: partners.updatedAt,
          })
          .from(partners)
          .innerJoin(partnerTypes, eq(partnerTypes.id, partners.partnerTypeId))
          .where(where)
          .orderBy(...order)
          .limit(PAGE_SIZE)
          .offset((query.page - 1) * PAGE_SIZE),
        db.select({ total: sql<number>`count(*)::int` }).from(partners).where(where),
        db
          .select({ status: partners.status, n: sql<number>`count(*)::int` })
          .from(partners)
          .groupBy(partners.status),
      ]);

      const counts = Object.fromEntries(PARTNER_STATUSES.map((s) => [s, 0])) as Record<PartnerStatus, number>;
      for (const c of statusCounts) counts[c.status] = c.n;

      return {
        items: rows.map((r) => ({ ...r, submittedAt: iso(r.submittedAt), updatedAt: r.updatedAt.toISOString() })),
        total,
        page: query.page,
        pageSize: PAGE_SIZE,
        counts,
      };
    },

    async detail(partnerId: string): Promise<AdminPartnerDetail> {
      const p = await loadPartner(partnerId);
      const { base, docTypes, docs } = await describe(p);
      const [urls, reviewer, history] = await Promise.all([
        storage.signedUrls(
          docs.map((d) => d.storagePath),
          VIEW_URL_SECONDS,
        ),
        p.reviewedBy
          ? db.select({ name: adminUsers.name }).from(adminUsers).where(eq(adminUsers.id, p.reviewedBy))
          : Promise.resolve([]),
        db
          .select({
            action: auditLog.action,
            actorType: auditLog.actorType,
            actorName: adminUsers.name,
            reason: auditLog.reason,
            createdAt: auditLog.createdAt,
          })
          .from(auditLog)
          .leftJoin(adminUsers, eq(adminUsers.id, auditLog.actorId))
          .where(and(eq(auditLog.entity, 'partner'), eq(auditLog.entityId, partnerId)))
          .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
          .limit(50),
      ]);
      return {
        ...base,
        checklist: docTypes.map((dt) => ({
          documentType: toDocumentTypeInfo(dt),
          documents: docs
            .filter((d) => d.documentTypeId === dt.id)
            .map((d) => ({ ...toDocumentInfo(d), viewUrl: urls.get(d.storagePath) ?? null, reviewedAt: iso(d.reviewedAt) })),
        })),
        internalNotes: p.internalNotes,
        reviewedAt: iso(p.reviewedAt),
        reviewedBy: reviewer[0]?.name ?? null,
        createdAt: p.createdAt.toISOString(),
        approvalBlockers: approvalBlockers(p, docTypes, docs),
        history: history.map((h) => ({
          action: h.action,
          actor: h.actorType === 'admin' ? (h.actorName ?? 'HO team') : 'Partner',
          reason: h.reason,
          createdAt: h.createdAt.toISOString(),
        })),
      };
    },

    async reviewDocument(
      actor: AdminActor,
      partnerId: string,
      documentId: string,
      input: { status: 'accepted' | 'rejected'; note?: string },
    ): Promise<void> {
      const p = await loadPartner(partnerId);
      if (p.status !== 'submitted') {
        throw conflict('not_reviewable', 'Documents can be reviewed while the application is submitted.');
      }
      const [doc] = await db
        .select({ id: partnerDocuments.id, status: partnerDocuments.status, typeName: documentTypes.name })
        .from(partnerDocuments)
        .innerJoin(documentTypes, eq(documentTypes.id, partnerDocuments.documentTypeId))
        .where(
          and(
            eq(partnerDocuments.id, documentId),
            eq(partnerDocuments.partnerId, partnerId),
            isNull(partnerDocuments.replacedAt),
          ),
        )
        .limit(1);
      if (!doc) throw notFound('Document not found');
      const note = input.status === 'rejected' ? (input.note ?? null) : (input.note || null);
      await db.transaction(async (tx) => {
        await tx
          .update(partnerDocuments)
          .set({ status: input.status, reviewerNote: note, reviewedBy: actor.adminUserId, reviewedAt: new Date() })
          .where(eq(partnerDocuments.id, documentId));
        await audit(tx, {
          actorType: 'admin',
          actorId: actor.adminUserId,
          entityId: partnerId,
          action: `document.${input.status}`,
          before: { documentId, status: doc.status },
          after: { documentId, document: doc.typeName, status: input.status },
          reason: note ? `${doc.typeName}: ${note}` : doc.typeName,
        });
      });
    },

    async decide(actor: AdminActor, partnerId: string, decision: { action: PartnerDecision; note?: string }) {
      const p = await loadPartner(partnerId);
      const note = decision.note?.trim() || null;

      const rules: Record<PartnerDecision, { from: PartnerStatus[]; to: PartnerStatus; adminOnly?: boolean }> = {
        approve: { from: ['submitted'], to: 'approved' },
        request_changes: { from: ['submitted'], to: 'changes_requested' },
        reject: { from: ['submitted', 'changes_requested'], to: 'rejected' },
        suspend: { from: ['approved'], to: 'suspended', adminOnly: true },
        reactivate: { from: ['suspended'], to: 'approved', adminOnly: true },
      };
      const rule = rules[decision.action];
      if (rule.adminOnly && actor.role !== 'admin') {
        throw forbidden('forbidden', 'Only admins can suspend or reactivate partners.');
      }
      if (!rule.from.includes(p.status)) {
        throw conflict('invalid_transition', `A ${p.status.replace('_', ' ')} application can't be changed this way.`);
      }
      if (decision.action === 'approve') {
        const { docTypes, docs } = await loadChecklist(p);
        const blockers = approvalBlockers(p, docTypes, docs);
        if (blockers.length) throw conflict('not_ready', blockers.map((b) => b.message).join(' '));
      }

      const outcome = await db.transaction(async (tx) => {
        let code = p.code;
        if (decision.action === 'approve' && !code) {
          // Serialise code allocation so two approvals can't take the same number.
          await tx.execute(sql`select pg_advisory_xact_lock(hashtext('hoc_partner_code'))`);
          const [{ next } = { next: 1 }] = await tx
            .select({ next: sql<number>`coalesce(max(substring(${partners.code} from 4)::int), 0) + 1` })
            .from(partners)
            .where(sql`${partners.code} ~ '^HOC[0-9]+$'`);
          code = `HOC${String(next).padStart(5, '0')}`;
        }
        const updated = await tx
          .update(partners)
          .set({
            status: rule.to,
            code,
            reviewedBy: actor.adminUserId,
            reviewedAt: new Date(),
            reviewNote: decision.action === 'approve' || decision.action === 'reactivate' ? null : note,
          })
          .where(and(eq(partners.id, partnerId), eq(partners.status, p.status)))
          .returning({ status: partners.status, code: partners.code });
        if (updated.length === 0) {
          throw conflict('state_changed', 'Someone else just updated this partner. Reload and try again.');
        }
        await audit(tx, {
          actorType: 'admin',
          actorId: actor.adminUserId,
          entityId: partnerId,
          action: `partner.${decision.action}`,
          before: { status: p.status },
          after: updated[0],
          reason: note,
        });
        return updated[0]!;
      });
      const copy: Partial<Record<PartnerDecision, { title: string; body: string }>> = {
        approve: { title: 'You are approved', body: `Welcome to HO Connect. Your partner code is ${outcome.code}.` },
        request_changes: { title: 'Changes needed', body: 'The HairOriginals team asked for a few changes to your application.' },
        reject: { title: 'Application update', body: 'There is an update on your HO Connect application.' },
        suspend: { title: 'Account update', body: 'There is an update on your HO Connect account.' },
        reactivate: { title: 'Account active again', body: 'Your HO Connect partner account is active again.' },
      };
      const msg = copy[decision.action];
      if (msg) void notify.toPartner(partnerId, { ...msg, url: '/home' });
      return outcome;
    },

    /** Full PAN and payout details, for checking against the documents. Every view is audited. */
    async revealSensitive(actor: AdminActor, partnerId: string) {
      const p = await loadPartner(partnerId);
      await audit(db, { actorType: 'admin', actorId: actor.adminUserId, entityId: partnerId, action: 'partner.sensitive_viewed' });
      return {
        pan: p.panEncrypted ? cipher.decrypt(p.panEncrypted) : null,
        payout: p.payoutDetailsEncrypted ? (JSON.parse(cipher.decrypt(p.payoutDetailsEncrypted)) as PayoutDetails) : null,
      };
    },

    async updateInternalNotes(actor: AdminActor, partnerId: string, internalNotes: string): Promise<void> {
      await loadPartner(partnerId);
      await db.transaction(async (tx) => {
        await tx
          .update(partners)
          .set({ internalNotes: internalNotes.trim() || null })
          .where(eq(partners.id, partnerId));
        await audit(tx, { actorType: 'admin', actorId: actor.adminUserId, entityId: partnerId, action: 'partner.notes_updated' });
      });
    },

    /* ───────────── Dashboard: settings ───────────── */

    async listTypes(): Promise<PartnerTypeAdmin[]> {
      const [types, docTypes, counts] = await Promise.all([
        db.select().from(partnerTypes).orderBy(asc(partnerTypes.sortOrder), asc(partnerTypes.name)),
        db.select().from(documentTypes).orderBy(asc(documentTypes.sortOrder), asc(documentTypes.name)),
        db
          .select({ typeId: partners.partnerTypeId, n: sql<number>`count(*)::int` })
          .from(partners)
          .groupBy(partners.partnerTypeId),
      ]);
      return types.map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        description: t.description,
        active: t.active,
        sortOrder: t.sortOrder,
        partnerCount: counts.find((c) => c.typeId === t.id)?.n ?? 0,
        documents: docTypes
          .filter((d) => d.partnerTypeId === t.id)
          .map((d) => ({ ...toDocumentTypeInfo(d), active: d.active, sortOrder: d.sortOrder })),
      }));
    },

    async createType(
      actor: AdminActor,
      input: { name: string; description?: string | null; active?: boolean; sortOrder?: number },
    ): Promise<string> {
      try {
        const [row] = await db
          .insert(partnerTypes)
          .values({ ...input, slug: slugify(input.name), description: input.description ?? null })
          .returning({ id: partnerTypes.id });
        await audit(db, {
          actorType: 'admin',
          actorId: actor.adminUserId,
          entity: 'settings',
          entityId: row!.id,
          action: 'partner_type.created',
          after: input,
        });
        return row!.id;
      } catch (err) {
        if (isUniqueViolation(err)) throw conflict('duplicate', 'A partner type with this name already exists.');
        throw err;
      }
    },

    async updateType(
      actor: AdminActor,
      id: string,
      input: { name?: string; description?: string | null; active?: boolean; sortOrder?: number },
    ): Promise<void> {
      const updated = await db.update(partnerTypes).set(input).where(eq(partnerTypes.id, id)).returning({ id: partnerTypes.id });
      if (updated.length === 0) throw notFound('Partner type not found');
      await audit(db, {
        actorType: 'admin',
        actorId: actor.adminUserId,
        entity: 'settings',
        entityId: id,
        action: 'partner_type.updated',
        after: input,
      });
    },

    async createDocumentType(
      actor: AdminActor,
      partnerTypeId: string,
      input: {
        name: string;
        description?: string | null;
        required: boolean;
        acceptedMimeTypes: string[];
        maxFiles: number;
        active?: boolean;
        sortOrder?: number;
      },
    ): Promise<string> {
      const [type] = await db.select({ id: partnerTypes.id }).from(partnerTypes).where(eq(partnerTypes.id, partnerTypeId));
      if (!type) throw notFound('Partner type not found');
      const [{ maxSort } = { maxSort: 0 }] = await db
        .select({ maxSort: sql<number>`coalesce(max(${documentTypes.sortOrder}), 0)::int` })
        .from(documentTypes)
        .where(eq(documentTypes.partnerTypeId, partnerTypeId));
      try {
        const [row] = await db
          .insert(documentTypes)
          .values({
            ...input,
            description: input.description ?? null,
            partnerTypeId,
            slug: slugify(input.name),
            sortOrder: input.sortOrder ?? maxSort + 1,
          })
          .returning({ id: documentTypes.id });
        await audit(db, {
          actorType: 'admin',
          actorId: actor.adminUserId,
          entity: 'settings',
          entityId: row!.id,
          action: 'document_type.created',
          after: { partnerTypeId, ...input },
        });
        return row!.id;
      } catch (err) {
        if (isUniqueViolation(err)) throw conflict('duplicate', 'This checklist already has a document with that name.');
        throw err;
      }
    },

    async updateDocumentType(
      actor: AdminActor,
      id: string,
      input: Partial<{
        name: string;
        description: string | null;
        required: boolean;
        acceptedMimeTypes: string[];
        maxFiles: number;
        active: boolean;
        sortOrder: number;
      }>,
    ): Promise<void> {
      const updated = await db
        .update(documentTypes)
        .set(input)
        .where(eq(documentTypes.id, id))
        .returning({ id: documentTypes.id });
      if (updated.length === 0) throw notFound('Document type not found');
      await audit(db, {
        actorType: 'admin',
        actorId: actor.adminUserId,
        entity: 'settings',
        entityId: id,
        action: 'document_type.updated',
        after: input,
      });
    },
  };
}

export type PartnerService = ReturnType<typeof createPartnerService>;
