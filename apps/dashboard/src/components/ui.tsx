import { PARTNER_STATUS_LABELS, type PartnerStatus } from '@hoc/shared';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'outline' | 'danger' | 'success';
  size?: 'sm' | 'md';
}) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'md' ? 'h-10 px-4 text-sm' : 'h-8 px-3 text-xs',
        variant === 'primary' && 'bg-primary text-white hover:bg-primary-deep',
        variant === 'ghost' && 'text-ink hover:bg-blush',
        variant === 'outline' && 'border border-line bg-white text-ink hover:bg-blush/60',
        variant === 'danger' && 'border border-danger/30 bg-white text-danger hover:bg-danger/5',
        variant === 'success' && 'bg-sage text-white hover:bg-sage/90',
        className,
      )}
      {...props}
    />
  );
}

export function TextArea({
  label,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  const area = (
    <textarea
      className={cx(
        'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20',
        className,
      )}
      {...props}
    />
  );
  if (!label) return area;
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {area}
    </label>
  );
}

const STATUS_TONE: Record<PartnerStatus, string> = {
  draft: 'bg-line/60 text-muted',
  submitted: 'bg-brass-soft text-espresso',
  changes_requested: 'bg-blush text-primary-deep',
  approved: 'bg-sage/15 text-sage',
  rejected: 'bg-danger/10 text-danger',
  suspended: 'bg-danger/10 text-danger',
};

export function StatusPill({ status }: { status: PartnerStatus }) {
  return (
    <span className={cx('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', STATUS_TONE[status])}>
      {PARTNER_STATUS_LABELS[status]}
    </span>
  );
}

export function Pill({ tone = 'neutral', children }: { tone?: 'neutral' | 'good' | 'bad' | 'wait'; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
        tone === 'neutral' && 'bg-line/60 text-muted',
        tone === 'good' && 'bg-sage/15 text-sage',
        tone === 'bad' && 'bg-danger/10 text-danger',
        tone === 'wait' && 'bg-brass-soft text-espresso',
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
        <h1 className="mt-2 font-display text-4xl text-espresso">{title}</h1>
      </div>
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <input
        className={cx(
          'h-11 w-full rounded-lg border border-line bg-white px-3 text-[15px] text-ink placeholder:text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20',
          className,
        )}
        {...props}
      />
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-2xl border border-line bg-white', className)}>{children}</div>;
}

export function Alert({ tone = 'danger', children }: { tone?: 'danger' | 'info'; children: ReactNode }) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cx(
        'rounded-lg px-3 py-2.5 text-sm',
        tone === 'danger' ? 'bg-danger/8 text-danger' : 'bg-blush text-ink',
      )}
    >
      {children}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted" role="status">
      <span className="size-4 animate-spin rounded-full border-2 border-line border-t-primary" aria-hidden />
      {label}
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo.svg" alt="HairOriginals" className={cx('h-auto', className)} width={384} height={230} />;
}
