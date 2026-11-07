'use client';

import { AGENT_SETTABLE_STAGES, CONSULTATION_MODE_LABELS, CONSULTATION_MODES, type LeadStage } from '@hoc/shared';
import { cx } from '@/components/ui';
import { STAGE_LABELS } from '@/lib/format';

const TONE: Record<LeadStage, string> = {
  awaiting_consent: 'bg-line/60 text-muted',
  consent_expired: 'bg-line/60 text-muted',
  duplicate: 'bg-line/60 text-muted',
  under_review: 'bg-brass-soft text-espresso',
  verified: 'bg-blush text-primary-deep',
  in_touch: 'bg-blush text-primary-deep',
  consultation_booked: 'bg-sage/15 text-sage',
  consultation_done: 'bg-sage/15 text-sage',
  purchased: 'bg-sage text-white',
  unreachable: 'bg-danger/10 text-danger',
  closed_lost: 'bg-line/60 text-muted',
  invalid: 'bg-danger/10 text-danger',
};

export function StagePill({ stage }: { stage: LeadStage }) {
  return (
    <span className={cx('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', TONE[stage])}>
      {STAGE_LABELS[stage] ?? stage}
    </span>
  );
}

export interface StageForm {
  stage: string;
  consultationMode: string;
  consultationAt: string; // datetime-local
  note: string;
}
export const emptyStageForm: StageForm = { stage: '', consultationMode: '', consultationAt: '', note: '' };

const selectClass =
  'h-10 rounded-lg border border-line bg-white px-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

/** Stage + (when booking) mode and time + note. Shared by the lead page and the bulk bar. */
export function StageFields({ value, onChange, compact }: { value: StageForm; onChange: (v: StageForm) => void; compact?: boolean }) {
  const booking = value.stage === 'consultation_booked';
  return (
    <div className={cx('flex flex-wrap items-end gap-2', !compact && 'gap-3')}>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted">
        New stage
        <select className={selectClass} value={value.stage} onChange={(e) => onChange({ ...value, stage: e.target.value })}>
          <option value="">Choose…</option>
          {AGENT_SETTABLE_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      {booking ? (
        <>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Mode
            <select
              className={selectClass}
              value={value.consultationMode}
              onChange={(e) => onChange({ ...value, consultationMode: e.target.value })}
            >
              <option value="">Choose…</option>
              {CONSULTATION_MODES.map((m) => (
                <option key={m} value={m}>
                  {CONSULTATION_MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Date and time (IST)
            <input
              type="datetime-local"
              className={selectClass}
              value={value.consultationAt}
              onChange={(e) => onChange({ ...value, consultationAt: e.target.value })}
            />
          </label>
        </>
      ) : null}
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-medium text-muted">
        Internal note (optional)
        <input
          className={selectClass}
          value={value.note}
          onChange={(e) => onChange({ ...value, note: e.target.value })}
          placeholder="Partners never see this"
        />
      </label>
    </div>
  );
}

export const stageFormReady = (v: StageForm) => !!v.stage && (v.stage !== 'consultation_booked' || !!v.consultationMode);
