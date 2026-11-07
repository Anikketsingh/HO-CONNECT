import { adminUsers, auditLog, qrCodes, type Db } from '@hoc/db';
import {
  customQrLink,
  DEFAULT_TRYON_URL,
  type QrCode,
  type QrCodeDetail,
  type QrCodeKind,
  type QrCodeValues,
  type QrDestination,
} from '@hoc/shared';
import { desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { forbidden, notFound } from '../lib/errors';
import { qrSvg } from '../lib/qr';
import type { AdminActor } from './partners';

type Row = typeof qrCodes.$inferSelect;

/** Custom QR codes for HO stores, events and anything else that is not a partner. Any staff member can make them; admins archive. */
export function createQrCodeService({ db, tryOnUrl = DEFAULT_TRYON_URL }: { db: Db; tryOnUrl?: string }) {
  const audit = (a: AdminActor, id: string, action: string, before: unknown, after: unknown) =>
    db.insert(auditLog).values({ actorType: 'admin', actorId: a.adminUserId, entity: 'qr_code', entityId: id, action, before: before as object, after: after as object });

  const toDto = (r: Row, createdBy: string | null): QrCode => ({
    id: r.id,
    name: r.name,
    label: r.label,
    kind: r.kind as QrCodeKind,
    destination: r.destination as QrDestination,
    targetUrl: r.targetUrl,
    utmSource: r.utmSource,
    utmMedium: r.utmMedium,
    utmCampaign: r.utmCampaign,
    utmContent: r.utmContent,
    link: r.link,
    notes: r.notes,
    createdBy,
    createdAt: r.createdAt.toISOString(),
    archivedAt: r.archivedAt?.toISOString() ?? null,
  });

  async function detail(id: string): Promise<QrCodeDetail> {
    const [row] = await db
      .select({ q: qrCodes, by: adminUsers.name })
      .from(qrCodes)
      .leftJoin(adminUsers, eq(adminUsers.id, qrCodes.createdBy))
      .where(eq(qrCodes.id, id));
    if (!row) throw notFound('QR code not found');
    return { ...toDto(row.q, row.by), qrSvg: await qrSvg(row.q.link) };
  }

  return {
    async list(archived: boolean): Promise<QrCode[]> {
      const rows = await db
        .select({ q: qrCodes, by: adminUsers.name })
        .from(qrCodes)
        .leftJoin(adminUsers, eq(adminUsers.id, qrCodes.createdBy))
        .where(archived ? isNotNull(qrCodes.archivedAt) : isNull(qrCodes.archivedAt))
        .orderBy(desc(qrCodes.createdAt))
        .limit(500);
      return rows.map((r) => toDto(r.q, r.by));
    },

    detail,

    /** The link and QR the form would make, without saving anything. */
    async preview(v: QrCodeValues) {
      const link = customQrLink(v, tryOnUrl);
      return { link, qrSvg: await qrSvg(link) };
    },

    async create(actor: AdminActor, v: QrCodeValues): Promise<QrCodeDetail> {
      const link = customQrLink(v, tryOnUrl);
      const [row] = await db
        .insert(qrCodes)
        .values({ ...v, targetUrl: v.destination === 'url' ? v.targetUrl : null, link, createdBy: actor.adminUserId })
        .returning({ id: qrCodes.id });
      await audit(actor, row!.id, 'qr_code.created', null, { name: v.name, kind: v.kind, link });
      return detail(row!.id);
    },

    /** Name, poster label and notes only: the link may already be printed. Archiving is for admins. */
    async update(actor: AdminActor, id: string, input: { name?: string; label?: string | null; notes?: string | null; archived?: boolean }) {
      const [cur] = await db.select().from(qrCodes).where(eq(qrCodes.id, id));
      if (!cur) throw notFound('QR code not found');
      if (input.archived !== undefined && actor.role !== 'admin') throw forbidden('forbidden', 'Only admins can archive QR codes.');
      const set: Partial<typeof qrCodes.$inferInsert> = {};
      if (input.name !== undefined) set.name = input.name;
      if (input.label !== undefined) set.label = input.label || null;
      if (input.notes !== undefined) set.notes = input.notes || null;
      if (input.archived !== undefined && input.archived !== Boolean(cur.archivedAt)) set.archivedAt = input.archived ? new Date() : null;
      if (Object.keys(set).length === 0) return detail(id);
      await db.update(qrCodes).set(set).where(eq(qrCodes.id, id));
      const action = set.archivedAt !== undefined ? (set.archivedAt ? 'qr_code.archived' : 'qr_code.restored') : 'qr_code.updated';
      await audit(actor, id, action, { name: cur.name, label: cur.label, notes: cur.notes }, set);
      return detail(id);
    },
  };
}

export type QrCodeService = ReturnType<typeof createQrCodeService>;
