const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

export const formatDate = (iso: string | null) => (iso ? dateFmt.format(new Date(iso)) : '—');
export const formatDateTime = (iso: string | null) => (iso ? dateTimeFmt.format(new Date(iso)) : '—');

/** "just now", "5 min ago", "3 h ago", "2 days ago", then a date. */
export function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} day${s < 2 * 86400 ? '' : 's'} ago`;
  return formatDate(iso);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** "9876543210" → "98765 43210" */
export const formatPhone = (p: string) => `${p.slice(0, 5)} ${p.slice(5)}`;

const ACTION_LABELS: Record<string, string> = {
  'partner.registered': 'Started registration',
  'partner.submitted': 'Submitted the application',
  'partner.resubmitted': 'Resubmitted with changes',
  'partner.approve': 'Approved',
  'partner.request_changes': 'Asked for changes',
  'partner.reject': 'Rejected',
  'partner.suspend': 'Suspended',
  'partner.reactivate': 'Reactivated',
  'partner.sensitive_viewed': 'Viewed PAN and payout details',
  'partner.notes_updated': 'Updated internal notes',
  'document.accepted': 'Accepted a document',
  'document.rejected': 'Rejected a document',
  'qr_code.created': 'Made a QR code',
  'qr_code.updated': 'Renamed or edited a QR code',
  'qr_code.archived': 'Archived a QR code',
  'qr_code.restored': 'Restored a QR code',
};
export const actionLabel = (a: string) => ACTION_LABELS[a] ?? a;

/** Internal (dashboard) names. Partners see the friendlier labels from Settings. */
export const STAGE_LABELS: Record<string, string> = {
  awaiting_consent: 'Awaiting consent',
  consent_expired: 'Consent expired',
  duplicate: 'Duplicate',
  under_review: 'To verify',
  verified: 'Verified',
  in_touch: 'In touch',
  consultation_booked: 'Consultation booked',
  consultation_done: 'Consultation done',
  purchased: 'Purchased',
  unreachable: 'Unreachable',
  closed_lost: 'Closed – lost',
  invalid: 'Invalid',
};

export const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  new: 'New',
  existing_contact: 'Existing contact',
  existing_customer: 'Existing customer',
  invalid: 'Invalid',
};

const LEAD_EVENT_LABELS: Record<string, string> = {
  created: 'Added the lead',
  consent_sent: 'Consent code sent',
  consent_confirmed: 'Customer confirmed consent',
  consent_expired: 'Consent expired',
  verified: 'Tagged customer type',
  stage_changed: 'Changed stage',
  note: 'Added a note',
  nudge_sent: 'Sent a nudge',
  sale_recorded: 'Recorded a sale',
  sale_updated: 'Updated the sale',
};
export const leadEventLabel = (t: string) => LEAD_EVENT_LABELS[t] ?? t;

/** <input type="datetime-local"> value (India time) → ISO with +05:30. */
export const localToIso = (v: string) => (v ? `${v}:00+05:30` : null);

/** "1,250.50" / "1250.5" → 125050 paise; empty or invalid → null. */
export function rupeesToPaiseInput(v: string): number | null {
  const n = Number(v.replace(/[,\s₹]/g, ''));
  return v.trim() === '' || !Number.isFinite(n) ? null : Math.round(n * 100);
}
export const paiseToInput = (p: number | null) => (p === null ? '' : String(p / 100));

export const COMMISSION_STATUS_LABELS: Record<string, string> = {
  pending: 'On hold',
  approvable: 'Ready to approve',
  approved: 'Approved',
  in_payout: 'In payout',
  paid: 'Paid',
  reversed: 'Reversed',
  rejected: 'Rejected',
};

export const FLAG_LABELS: Record<string, string> = {
  existing_customer_type: 'Existing customer',
  linked_manually: 'Linked by hand',
  adjusted: 'Adjusted',
  no_rule: 'No matching rule',
  no_plan: 'No plan',
};

export const PAYOUT_BATCH_LABELS: Record<string, string> = {
  draft: 'Draft',
  exported: 'Sent to finance',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
export const PAYOUT_STATUS_LABELS: Record<string, string> = { pending: 'To pay', paid: 'Paid', failed: 'Failed', cancelled: 'Cancelled' };

/** "November 2026" for the current month in India: the default name of a payout batch. */
export const currentMonthLabel = () =>
  new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date());

export const todayIST = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

export const formatPercent = (v: number | null, digits = 0) => (v === null ? '—' : `${(v * 100).toFixed(digits)}%`);
/** 5.2 → "5.2 h", 30 → "1 day 6 h", null → "—" */
export function formatHours(h: number | null): string {
  if (h === null) return '—';
  if (h < 48) return `${h < 10 ? h.toFixed(1) : Math.round(h)} h`;
  return `${(h / 24).toFixed(1)} days`;
}

/** Saves rows as a CSV file in the browser. Cells that could run as formulas in a spreadsheet are neutralised. */
export function downloadCsv(fileName: string, rows: (string | number | null)[][]) {
  const cell = (v: string | number | null) => {
    if (v === null) return '';
    if (typeof v === 'number') return String(v);
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const url = URL.createObjectURL(new Blob([`﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export const daysAgoIST = (n: number) => new Date(Date.now() + 5.5 * 3600_000 - n * 86400_000).toISOString().slice(0, 10);
