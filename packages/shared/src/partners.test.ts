import { describe, expect, it } from 'vitest';
import {
  canPartnerEdit,
  documentReviewSchema,
  documentTypeInputSchema,
  documentTypeUpdateSchema,
  partnerApplicationUpdateSchema,
  partnerDecisionSchema,
  partnerPayoutStepSchema,
  partnerProfileInputSchema,
  payoutDisplay,
  payoutInputSchema,
} from './partners';

const TYPE_ID = '3f0c8a4e-1b2d-4c5e-8f90-a1b2c3d4e5f6';
const CENTRE_ID = '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d';

describe('partner profile', () => {
  const valid = {
    partnerTypeId: TYPE_ID,
    businessName: '  Glow Studio ',
    ownerName: 'Priya Sharma',
    email: 'Priya@Example.com',
    addressLine: 'Shop 4, Main Market, Lajpat Nagar',
    city: 'New Delhi',
    state: 'Delhi',
    pincode: '110024',
    homeCentreId: CENTRE_ID,
  };

  it('trims text and lower-cases email', () => {
    const out = partnerProfileInputSchema.parse(valid);
    expect(out.businessName).toBe('Glow Studio');
    expect(out.email).toBe('priya@example.com');
  });

  it('treats an empty email as none', () => {
    expect(partnerProfileInputSchema.parse({ ...valid, email: '' }).email).toBeNull();
  });

  it('rejects bad pincodes, unknown states and missing centre', () => {
    expect(partnerProfileInputSchema.safeParse({ ...valid, pincode: '011024' }).success).toBe(false);
    expect(partnerProfileInputSchema.safeParse({ ...valid, state: 'Atlantis' }).success).toBe(false);
    expect(partnerProfileInputSchema.safeParse({ ...valid, homeCentreId: '' }).success).toBe(false);
  });
});

describe('tax and payout', () => {
  it('normalises PAN, GSTIN and IFSC typed with spaces or lower case', () => {
    const out = partnerPayoutStepSchema.parse({
      pan: 'abcde 1234f',
      gstin: '07abcde1234f1z5',
      payout: { method: 'bank', accountHolder: 'Priya Sharma', accountNumber: '0012 3456 7890', ifsc: 'hdfc0001234' },
    });
    expect(out.pan).toBe('ABCDE1234F');
    expect(out.gstin).toBe('07ABCDE1234F1Z5');
    expect(out.payout).toEqual({ method: 'bank', accountHolder: 'Priya Sharma', accountNumber: '001234567890', ifsc: 'HDFC0001234' });
  });

  it('treats an empty GSTIN as none and rejects malformed ones', () => {
    const base = { pan: 'ABCDE1234F', payout: { method: 'upi', upiId: 'priya@okhdfcbank' } };
    expect(partnerPayoutStepSchema.parse({ ...base, gstin: '' }).gstin).toBeNull();
    expect(partnerPayoutStepSchema.safeParse({ ...base, gstin: '07ABCDE1234F1X5' }).success).toBe(false);
    expect(partnerPayoutStepSchema.safeParse({ ...base, pan: 'ABCD1234F' }).success).toBe(false);
  });

  it('validates UPI ids and IFSC codes', () => {
    expect(payoutInputSchema.safeParse({ method: 'upi', upiId: 'priya.salon@okhdfcbank' }).success).toBe(true);
    expect(payoutInputSchema.safeParse({ method: 'upi', upiId: 'not-an-upi' }).success).toBe(false);
    expect(
      payoutInputSchema.safeParse({ method: 'bank', accountHolder: 'P S', accountNumber: '12345678', ifsc: 'HDFC0001234' })
        .success,
    ).toBe(false); // 8 digits is too short
    expect(
      payoutInputSchema.safeParse({ method: 'bank', accountHolder: 'P S', accountNumber: '123456789', ifsc: 'HDFC1001234' })
        .success,
    ).toBe(false); // 5th character must be 0
  });

  it('shows payout details without exposing them', () => {
    expect(payoutDisplay({ method: 'upi', upiId: 'priya.salon@okhdfcbank' })).toBe('UPI · pri•••@okhdfcbank');
    expect(payoutDisplay({ method: 'bank', accountHolder: 'P', accountNumber: '001234567890', ifsc: 'HDFC0001234' })).toBe(
      'Bank · HDFC · ••••7890',
    );
  });
});

describe('partial updates', () => {
  it('leaves omitted fields undefined so they are not overwritten', () => {
    const out = partnerApplicationUpdateSchema.parse({ city: 'Gurugram' });
    expect(out).toEqual({ city: 'Gurugram' });
    expect('email' in out && out.email !== undefined).toBe(false);
  });
});

describe('checklist settings', () => {
  it('applies defaults when creating a document type', () => {
    expect(documentTypeInputSchema.parse({ name: 'Shop photo' })).toMatchObject({
      required: true,
      maxFiles: 1,
      acceptedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    });
  });

  it('never resets untouched fields on update', () => {
    expect(documentTypeUpdateSchema.parse({ name: 'Shop front photo' })).toEqual({ name: 'Shop front photo' });
  });
});

describe('review inputs', () => {
  it('needs a note to request changes, reject or suspend, but not to approve', () => {
    expect(partnerDecisionSchema.safeParse({ action: 'approve' }).success).toBe(true);
    expect(partnerDecisionSchema.safeParse({ action: 'request_changes' }).success).toBe(false);
    expect(partnerDecisionSchema.safeParse({ action: 'reject', note: 'Shop photo is not of a salon' }).success).toBe(true);
    expect(documentReviewSchema.safeParse({ status: 'rejected' }).success).toBe(false);
    expect(documentReviewSchema.safeParse({ status: 'accepted' }).success).toBe(true);
  });

  it('lets partners edit only drafts and applications sent back for changes', () => {
    expect(canPartnerEdit('draft')).toBe(true);
    expect(canPartnerEdit('changes_requested')).toBe(true);
    expect(canPartnerEdit('submitted')).toBe(false);
    expect(canPartnerEdit('approved')).toBe(false);
  });
});
