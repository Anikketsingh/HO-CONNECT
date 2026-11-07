/**
 * "priya sharma" → "Priya S.", "Priya" → "Priya", "  " → "Customer".
 * Partners see this form of the customer's name; dashboard users see the full name.
 */
export function maskName(fullName: string | null | undefined): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  const [first, ...rest] = parts;
  if (!first) return 'Customer';
  const firstName = capitalise(first);
  const last = rest.at(-1);
  return last ? `${firstName} ${last.charAt(0).toUpperCase()}.` : firstName;
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** Human-readable lead reference: 123 → "L-000123". */
export function formatLeadRef(leadNumber: number): string {
  return `L-${String(leadNumber).padStart(6, '0')}`;
}

/** Parses "L-000123" / "l-123" / "123" → 123, or null. */
export function parseLeadRef(ref: string): number | null {
  const match = /^(?:l-?)?0*(\d{1,9})$/i.exec(ref.trim());
  return match?.[1] ? Number(match[1]) : null;
}
