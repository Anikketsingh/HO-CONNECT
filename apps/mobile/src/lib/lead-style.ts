import { PARTNER_LEAD_FILTERS, type LeadStage } from '@hoc/shared';
import { colors } from '@/theme';

/** Dot colour for a lead's stage in the partner app. */
export function stageColor(stage: LeadStage): string {
  if ((PARTNER_LEAD_FILTERS.waiting as readonly string[]).includes(stage)) return colors.brass;
  if (stage === 'purchased') return colors.sage;
  if ((PARTNER_LEAD_FILTERS.closed as readonly string[]).includes(stage)) return colors.muted;
  if (stage === 'unreachable') return colors.danger;
  return colors.primary;
}

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
export const shortDate = (iso: string) => dateFmt.format(new Date(iso));
export const shortDateTime = (iso: string) => dateTimeFmt.format(new Date(iso));
