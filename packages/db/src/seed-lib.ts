/** Idempotent seed data loader, shared by `npm run db:seed` and the API integration tests. */
import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from './client';
import {
  centres,
  commissionPlans,
  commissionRules,
  documentTypes,
  legalDocuments,
  messageTemplates,
  partnerTypes,
  planAssignments,
  productCategories,
} from './schema/index';
import {
  CENTRES,
  DOCUMENT_CHECKLISTS,
  LEGAL_DOCUMENTS,
  MESSAGE_TEMPLATES,
  PARTNER_TYPES,
  PRODUCT_CATEGORIES,
} from './seed-data';

export async function seedDatabase(db: Db): Promise<void> {
  await db.insert(partnerTypes).values([...PARTNER_TYPES]).onConflictDoNothing();
  const types = await db.select().from(partnerTypes);
  for (const type of types) {
    const checklist = DOCUMENT_CHECKLISTS[type.slug as keyof typeof DOCUMENT_CHECKLISTS] ?? [];
    if (checklist.length === 0) continue;
    await db
      .insert(documentTypes)
      .values(checklist.map((d, i) => ({ ...d, partnerTypeId: type.id, sortOrder: i + 1 })))
      .onConflictDoNothing();
  }

  await db.insert(productCategories).values(PRODUCT_CATEGORIES).onConflictDoNothing();
  await db.insert(centres).values(CENTRES).onConflictDoNothing();
  await db.insert(legalDocuments).values(LEGAL_DOCUMENTS).onConflictDoNothing();
  await db.insert(messageTemplates).values(MESSAGE_TEMPLATES).onConflictDoNothing();

  // Default commission plan with every rate at 0 — admins set real rates in the dashboard.
  const [existingDefault] = await db
    .select()
    .from(planAssignments)
    .where(and(eq(planAssignments.scope, 'default'), isNull(planAssignments.scopeId)));
  if (!existingDefault) {
    const [plan] = await db
      .insert(commissionPlans)
      .values({
        name: 'Default plan',
        description: 'Placeholder: all rates are 0. Set real rates in Settings → Commission before launch.',
        effectiveFrom: new Date().toISOString().slice(0, 10),
      })
      .returning();
    if (!plan) throw new Error('Failed to create default plan');
    await db.insert(commissionRules).values([
      { planId: plan.id, customerType: 'new', rateType: 'percent', rateValue: 0 },
      { planId: plan.id, customerType: 'existing_contact', rateType: 'percent', rateValue: 0 },
      { planId: plan.id, customerType: 'existing_customer', rateType: 'percent', rateValue: 0 },
    ]);
    await db.insert(planAssignments).values({ planId: plan.id, scope: 'default', scopeId: null });
  }
}
