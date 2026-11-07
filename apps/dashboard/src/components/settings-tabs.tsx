'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from '@/components/ui';

const TABS = [
  { href: '/settings', label: 'Partner types' },
  { href: '/settings/commission', label: 'Commission' },
  { href: '/settings/benefits', label: 'Benefits' },
  { href: '/settings/general', label: 'General' },
  { href: '/settings/team', label: 'Team' },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav className="mb-8 flex gap-1 overflow-x-auto border-b border-line" aria-label="Settings sections">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={cx(
              '-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium',
              active ? 'border-primary text-primary-deep' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export const inputClass =
  'h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

export function Labeled({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx('flex flex-col gap-1 text-xs font-medium text-muted', className)}>
      {label}
      {children}
    </label>
  );
}
