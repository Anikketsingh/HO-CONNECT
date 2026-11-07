/**
 * Money is stored and calculated in integer paise to avoid floating-point errors.
 * Percentages are stored in basis points (1% = 100 bps).
 */

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

/** 1234550 → "₹12,345.5" (Indian digit grouping). */
export function formatINR(paise: number): string {
  return inr.format(paiseToRupees(paise));
}

/** Applies basis points to an amount in paise, rounding half up to the nearest paisa. */
export function applyBps(amountPaise: number, bps: number): number {
  return Math.round((amountPaise * bps) / 10_000);
}
