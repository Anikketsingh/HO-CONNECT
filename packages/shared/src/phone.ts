/** Indian mobile numbers: 10 digits starting with 6–9 (same rule as the website forms). */
export const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;

/**
 * Normalise any common way of writing an Indian mobile number to its 10-digit form.
 * Accepts "+91 98765 43210", "09876543210", "0091-9876543210", "919876543210", etc.
 * Returns null when the result is not a valid Indian mobile number.
 *
 * The normalised 10-digit number is the join key across HO Connect, the CRM and the ERP.
 */
export function normalizeIndianMobile(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return INDIAN_MOBILE_REGEX.test(digits) ? digits : null;
}

export function isValidIndianMobile(input: string | null | undefined): boolean {
  return normalizeIndianMobile(input) !== null;
}

/** "9876543210" → "+919876543210" (format Supabase Auth and SMS providers expect). */
export function toE164(mobile10: string): string {
  return `+91${mobile10}`;
}

/** "9876543210" → "98XXXXX210". This is what partners see; never the full number. */
export function maskPhone(mobile10: string): string {
  if (mobile10.length !== 10) return 'XXXXXXXXXX';
  return `${mobile10.slice(0, 2)}XXXXX${mobile10.slice(7)}`;
}
